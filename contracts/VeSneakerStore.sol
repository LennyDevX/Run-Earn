// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMint} from "./SneakerMint.sol";

/// @dev Minimal view of PlayerProgress needed for level-gated designs.
interface IPlayerProgressView {
    function levelOf(address user) external view returns (uint8);
}

/// @dev Minimal view of SneakerVault needed for perk discounts.
interface IVaultDiscountView {
    function bestDiscountBps(address user) external view returns (uint16);
}

interface IVaultAccessView {
    function isEligible(address user, uint256 perkId) external view returns (bool);
    function perkCount() external view returns (uint256);
}

/// @dev Minimal Chainlink aggregator view. Declared here rather than pulling in
///      the Chainlink contracts package for one struct — same pattern as the
///      vault views above.
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title VeSneakerStore — primary sale of virtual sneakers (veSneakers) for POL.
/// @notice veSneakers are the playable NFTs of the Airen virtual sneaker
///      economy. Anyone can buy them with native POL — fully virtual assets. Once
///      owned, a veSneaker behaves exactly like a minted SneakerMint NFT: it can be
///      locked in SneakerStaking for a POL APY boost, activated in SneakerGame to
///      earn veRUNE points, and traded in SneakerMarketplace.
/// @dev The store mints on demand: the buyer pays POL and the store calls
///      SneakerMint.mintAuthorized, so no copies need to be pre-minted. The store
///      must hold MINTER_ROLE on SneakerMint. Each design has its own price,
///      supply cap, rarity, and tier. All sale proceeds go to the treasury.
contract VeSneakerStore is Pausable, AccessControl, ReentrancyGuard {
    uint256 public constant BASIS_POINTS = 10_000;
    uint16 public constant MAX_BATCH = 20;
    /// @dev USD targets are stored in cents, so a price target is always an
    ///      integer and no amount is ever held as a float.
    uint256 public constant USD_CENTS = 100;
    /// @dev 1 POL in wei.
    uint256 public constant WEI_PER_POL = 1e18;

    /// @notice Lets a keeper refresh feed-derived prices without holding full
    ///      admin rights. Design edits, minting, and treasury changes stay
    ///      admin-only.
    bytes32 public constant PRICE_SYNC_ROLE = keccak256("PRICE_SYNC_ROLE");

    struct Design {
        string name;
        string uri;
        uint8 rarity; // 0..100
        uint8 tier; // 0..3 (Common, Rare, Epic, Mythic)
        uint256 price; // POL per copy
        uint16 maxSupply;
        uint16 minted;
        /// @notice Minimum PlayerProgress level required to buy (0 = open to all).
        uint8 requiredLevel;
        bool active;
    }

    SneakerMint public immutable nft;
    address payable public treasury;

    /// @notice PlayerProgress consulted for level-gated designs. Zero address
    ///      disables gating — level-gated designs become unpurchasable.
    address public progress;

    /// @notice SneakerVault consulted for perk discounts. Zero address
    ///      disables discounts — every buyer pays full price.
    address public vault;

    Design[] private _designs;
    /// designIndex => required vault perk id + 1 (0 = no access gate).
    mapping(uint256 designIndex => uint256 perkIdPlusOne) public requiredPerkPlusOne;

    /// @notice Chainlink POL/USD aggregator. The zero address disables feed
    ///      pricing entirely — designs then keep whatever POL price they were
    ///      given, which is the behaviour every existing deployment has.
    address public polUsdFeed;
    /// @notice Reject a feed answer older than this. A stale oracle is worse
    ///      than no oracle, because it prices at a market that no longer exists
    ///      and nothing in the transaction would look wrong.
    /// @dev Must exceed the feed's heartbeat with margin, or a sync can revert
    ///      simply because the answer is a few minutes past due — which freezes
    ///      pricing at the last good value. Two hours is twice the usual
    ///      Chainlink heartbeat. Set it from the actual feed spec.
    uint256 public maxFeedStaleness = 2 hours;
    /// @notice Minimum gap between permissionless syncs. Inside the window only
    ///      an admin or a `PRICE_SYNC_ROLE` holder may refresh.
    uint256 public priceSyncInterval = 6 hours;
    /// @notice designIndex => USD target in cents (0 = not USD-priced).
    mapping(uint256 designIndex => uint256 usdCents) public usdTargetCents;
    /// @notice designIndex => timestamp of the last feed-derived price write.
    mapping(uint256 designIndex => uint256 syncedAt) public lastPriceSyncAt;

    event DesignAdded(uint256 indexed designIndex, string name, uint8 rarity, uint8 tier, uint256 price, uint16 maxSupply);
    event DesignUpdated(uint256 indexed designIndex, uint256 price, uint16 maxSupply, bool active);
    event DesignPerkRequirementUpdated(uint256 indexed designIndex, uint256 indexed perkId, bool required);
    event DesignUriUpdated(uint256 indexed designIndex, string uri);
    event VeSneakerPurchased(uint256 indexed designIndex, address indexed buyer, uint256 quantity, uint256 totalPaid, uint256 firstTokenId);
    event VeSneakerReserved(uint256 indexed designIndex, address indexed recipient, uint256 quantity, uint256 firstTokenId);
    event TreasuryUpdated(address indexed treasury);
    event ProgressUpdated(address indexed progress);
    event VaultUpdated(address indexed vault);
    event ProceedsWithdrawn(address indexed to, uint256 amount);
    event PolUsdFeedUpdated(address indexed feed);
    event PriceFeedParamsUpdated(uint256 maxFeedStaleness, uint256 priceSyncInterval);
    event UsdTargetUpdated(uint256 indexed designIndex, uint256 usdCents);
    event PriceSynced(uint256 indexed designIndex, uint256 newPrice, uint256 feedPrice, uint256 usdCents);

    constructor(address admin, address nftAddress, address payable treasury_) {
        require(admin != address(0), "VeSneakerStore: zero admin");
        require(nftAddress != address(0), "VeSneakerStore: zero NFT");
        require(treasury_ != address(0), "VeSneakerStore: zero treasury");
        nft = SneakerMint(nftAddress);
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Register a new veSneaker design. Admin only.
    function addDesign(
        string calldata name,
        string calldata uri,
        uint8 rarity,
        uint8 tier,
        uint256 price,
        uint16 maxSupply
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 designIndex) {
        require(bytes(name).length > 0, "VeSneakerStore: empty name");
        require(bytes(uri).length > 0, "VeSneakerStore: empty uri");
        require(rarity <= 100, "VeSneakerStore: invalid rarity");
        require(tier < 4, "VeSneakerStore: invalid tier");
        require(price > 0, "VeSneakerStore: zero price");
        require(maxSupply > 0, "VeSneakerStore: zero supply");

        designIndex = _designs.length;
        _designs.push(Design({
            name: name,
            uri: uri,
            rarity: rarity,
            tier: tier,
            price: price,
            maxSupply: maxSupply,
            minted: 0,
            requiredLevel: 0,
            active: true
        }));
        emit DesignAdded(designIndex, name, rarity, tier, price, maxSupply);
    }

    /// @notice Update price, supply cap, or activation for a design. Admin only.
    function updateDesign(uint256 designIndex, uint256 price, uint16 maxSupply, bool active)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Design storage design = _requireDesign(designIndex);
        require(price > 0, "VeSneakerStore: zero price");
        require(maxSupply >= design.minted, "VeSneakerStore: supply below minted");
        design.price = price;
        design.maxSupply = maxSupply;
        design.active = active;
        emit DesignUpdated(designIndex, price, maxSupply, active);
    }

    function updateDesignUri(uint256 designIndex, string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(uri).length > 0, "VeSneakerStore: empty uri");
        _requireDesign(designIndex).uri = uri;
        emit DesignUriUpdated(designIndex, uri);
    }

    /// @notice Update the required player level for a design. Admin only.
    ///      `reserveMint` bypasses the gate — it is an admin allocation.
    function setDesignRequiredLevel(uint256 designIndex, uint8 requiredLevel) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireDesign(designIndex).requiredLevel = requiredLevel;
    }

    /// @notice Require a SneakerVault perk for purchases of this design.
    ///      `required=false` clears the gate; an unset vault fails closed.
    function setDesignRequiredPerk(uint256 designIndex, uint256 perkId, bool required)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _requireDesign(designIndex);
        if (required) {
            require(vault != address(0), "VeSneakerStore: vault not set");
            require(perkId < IVaultAccessView(vault).perkCount(), "VeSneakerStore: unknown perk");
            requiredPerkPlusOne[designIndex] = perkId + 1;
        } else {
            requiredPerkPlusOne[designIndex] = 0;
        }
        emit DesignPerkRequirementUpdated(designIndex, perkId, required);
    }

    /// @notice Link PlayerProgress for level-gated designs.
    function setProgress(address progress_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        progress = progress_;
        emit ProgressUpdated(progress_);
    }

    /// @notice Link SneakerVault for perk discounts. Zero address disables
    ///      discounts — every buyer pays full price (fail-closed to full price,
    ///      never to a free mint).
    function setVault(address vault_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function setTreasury(address payable treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(treasury_ != address(0), "VeSneakerStore: zero treasury");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Recover POL that is not part of an in-flight sale. Admin only.
    function withdrawProceeds(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "VeSneakerStore: zero recipient");
        uint256 amount = address(this).balance;
        require(amount > 0, "VeSneakerStore: no proceeds");
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "VeSneakerStore: transfer failed");
        emit ProceedsWithdrawn(to, amount);
    }

    /// @notice Reserve copies to a recipient (treasury, airdrops, partnerships)
    ///      without payment. Counts against the design supply. Admin only.
    function reserveMint(uint256 designIndex, address to, uint16 quantity)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 firstTokenId)
    {
        require(to != address(0), "VeSneakerStore: zero recipient");
        require(quantity > 0 && quantity <= MAX_BATCH, "VeSneakerStore: invalid quantity");
        Design storage design = _requireDesign(designIndex);
        require(design.minted + quantity <= design.maxSupply, "VeSneakerStore: supply exhausted");

        firstTokenId = _mintCopies(design, designIndex, to, quantity);
        emit VeSneakerReserved(designIndex, to, quantity, firstTokenId);
    }

    // ──────────────────── USD-target pricing (Chainlink) ─────────

    /// @notice Point the store at a POL/USD aggregator. Zero disables feed
    ///      pricing and every design falls back to its stored POL price.
    function setPolUsdFeed(address feed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        polUsdFeed = feed;
        emit PolUsdFeedUpdated(feed);
    }

    /// @notice Tune the staleness guard and the permissionless sync window.
    function setPriceFeedParams(uint256 maxStaleness, uint256 syncInterval)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(maxStaleness > 0, "VeSneakerStore: zero staleness");
        maxFeedStaleness = maxStaleness;
        priceSyncInterval = syncInterval;
        emit PriceFeedParamsUpdated(maxStaleness, syncInterval);
    }

    /// @notice Give a design a USD target. The stored POL price is deliberately
    ///      left alone — call `syncDesignPrice` (or `syncAllPrices`) to apply
    ///      it, so setting a target can never revert on a stale feed. Pass 0 to
    ///      clear the target and return the design to its manual price.
    function setDesignUsdTarget(uint256 designIndex, uint256 usdCents)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _requireDesign(designIndex);
        usdTargetCents[designIndex] = usdCents;
        emit UsdTargetUpdated(designIndex, usdCents);
    }

    /// @notice Rewrite a design's POL price from its USD target and the live
    ///      feed. Callable by anyone once `priceSyncInterval` has elapsed: the
    ///      result is a pure function of the oracle, so there is nothing to
    ///      grief, and it lets the price self-heal without a keeper. An admin
    ///      or `PRICE_SYNC_ROLE` holder can force it at any time.
    function syncDesignPrice(uint256 designIndex) public returns (uint256 newPrice) {
        return _syncDesignPrice(designIndex, false);
    }

    /// @notice Refresh every design that has a USD target. Privileged only,
    ///      because one not-yet-due design would otherwise revert the sweep.
    function syncAllPrices() external returns (uint256 synced) {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(PRICE_SYNC_ROLE, msg.sender),
            "VeSneakerStore: not price syncer"
        );
        for (uint256 i = 0; i < _designs.length; i++) {
            if (usdTargetCents[i] == 0) continue;
            _syncDesignPrice(i, true);
            synced++;
        }
    }

    /// @notice Latest POL/USD answer, scaled by the feed's own decimals.
    ///      Reverts when the feed is unset, the answer is non-positive, or the
    ///      answer is older than `maxFeedStaleness`.
    function polUsdPrice() public view returns (uint256 answer, uint8 decimals) {
        address feed = polUsdFeed;
        require(feed != address(0), "VeSneakerStore: feed not set");
        (, int256 latest, , uint256 updatedAt, ) = IChainlinkAggregator(feed).latestRoundData();
        require(latest > 0, "VeSneakerStore: invalid feed answer");
        require(updatedAt > 0 && block.timestamp - updatedAt <= maxFeedStaleness, "VeSneakerStore: stale feed");
        return (uint256(latest), IChainlinkAggregator(feed).decimals());
    }

    /// @notice What the design would cost if it were synced right now. Read-only,
    ///      so the UI can show a drift hint without spending gas.
    function livePriceOf(uint256 designIndex) external view returns (uint256) {
        uint256 target = usdTargetCents[designIndex];
        require(target > 0, "VeSneakerStore: no USD target");
        (uint256 feedPrice, uint8 feedDecimals) = polUsdPrice();
        return _priceFromUsd(target, feedPrice, feedDecimals);
    }

    /// @notice Convert a USD target in cents to a POL amount in wei.
    ///      `feedPrice` is USD per POL scaled by `feedDecimals`, so:
    ///        POL   = (usdCents / 100) / (feedPrice / 10^feedDecimals)
    ///        price = usdCents * 10^feedDecimals * 1e18 / (100 * feedPrice)
    ///      At $0.09764/POL this turns a $40 target into 409.67 POL.
    function _priceFromUsd(uint256 usdCents, uint256 feedPrice, uint8 feedDecimals)
        internal
        pure
        returns (uint256)
    {
        return (usdCents * (uint256(10) ** feedDecimals) * WEI_PER_POL) / (USD_CENTS * feedPrice);
    }

    function _syncDesignPrice(uint256 designIndex, bool privileged) internal returns (uint256 newPrice) {
        Design storage design = _requireDesign(designIndex);
        uint256 target = usdTargetCents[designIndex];
        require(target > 0, "VeSneakerStore: no USD target");

        if (!privileged) {
            uint256 last = lastPriceSyncAt[designIndex];
            bool due = last == 0 || block.timestamp >= last + priceSyncInterval;
            require(
                due || hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(PRICE_SYNC_ROLE, msg.sender),
                "VeSneakerStore: price sync not due"
            );
        }

        (uint256 feedPrice, uint8 feedDecimals) = polUsdPrice();
        newPrice = _priceFromUsd(target, feedPrice, feedDecimals);
        require(newPrice > 0, "VeSneakerStore: zero price");

        design.price = newPrice;
        lastPriceSyncAt[designIndex] = block.timestamp;
        emit PriceSynced(designIndex, newPrice, feedPrice, target);
    }

    // ─────────────────────────── Purchase ────────────────────────

    /// @notice Buy one veSneaker from a design, paying its price in POL.
    function buy(uint256 designIndex) external payable whenNotPaused nonReentrant returns (uint256 tokenId) {
        return _buy(designIndex, 1, msg.sender);
    }

    /// @notice Buy several copies of the same design in one transaction.
    function buyBatch(uint256 designIndex, uint16 quantity)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 firstTokenId)
    {
        require(quantity > 1 && quantity <= MAX_BATCH, "VeSneakerStore: invalid quantity");
        return _buy(designIndex, quantity, msg.sender);
    }

    // ─────────────────────────── Views ───────────────────────────

    function designCount() external view returns (uint256) {
        return _designs.length;
    }

    function designs(uint256 designIndex) external view returns (Design memory) {
        return _requireDesign(designIndex);
    }

    function priceOf(uint256 designIndex) external view returns (uint256) {
        return _requireDesign(designIndex).price;
    }

    function remaining(uint256 designIndex) external view returns (uint256) {
        Design storage design = _requireDesign(designIndex);
        return uint256(design.maxSupply) - uint256(design.minted);
    }

    function isAvailable(uint256 designIndex) external view returns (bool) {
        if (designIndex >= _designs.length) return false;
        Design storage design = _designs[designIndex];
        return design.active && design.minted < design.maxSupply;
    }

    /// @notice Total POL required to buy `quantity` copies of a design,
    ///      applying the buyer's best vault discount when one is linked.
    function quote(uint256 designIndex, uint16 quantity) external view returns (uint256) {
        require(quantity > 0, "VeSneakerStore: invalid quantity");
        Design storage design = _requireDesign(designIndex);
        _requirePerk(designIndex, msg.sender);
        uint256 total = design.price * quantity;
        return _applyDiscount(msg.sender, total);
    }

    // ─────────────────────────── Internal ────────────────────────

    function _requireDesign(uint256 designIndex) internal view returns (Design storage design) {
        require(designIndex < _designs.length, "VeSneakerStore: unknown design");
        return _designs[designIndex];
    }

    function _buy(uint256 designIndex, uint16 quantity, address buyer) internal returns (uint256 firstTokenId) {
        Design storage design = _requireDesign(designIndex);
        require(design.active, "VeSneakerStore: design inactive");
        require(design.minted + quantity <= design.maxSupply, "VeSneakerStore: supply exhausted");
        if (design.requiredLevel > 0) {
            require(
                progress != address(0) && IPlayerProgressView(progress).levelOf(buyer) >= design.requiredLevel,
                "VeSneakerStore: level required"
            );
        }
        _requirePerk(designIndex, buyer);
        uint256 total = _applyDiscount(buyer, design.price * quantity);
        require(msg.value == total, "VeSneakerStore: wrong payment");

        firstTokenId = _mintCopies(design, designIndex, buyer, quantity);

        (bool sent, ) = treasury.call{value: total}("");
        require(sent, "VeSneakerStore: treasury transfer failed");
        emit VeSneakerPurchased(designIndex, buyer, quantity, total, firstTokenId);
    }

    function _requirePerk(uint256 designIndex, address buyer) internal view {
        uint256 perkIdPlusOne = requiredPerkPlusOne[designIndex];
        if (perkIdPlusOne == 0) return;
        require(
            vault != address(0) && IVaultAccessView(vault).isEligible(buyer, perkIdPlusOne - 1),
            "VeSneakerStore: perk required"
        );
    }

    /// @notice Apply the buyer's best vault discount. Zero vault address or a
    ///      zero discount both mean full price — the discount can never make
    ///      the payable amount zero.
    function _applyDiscount(address buyer, uint256 total) internal view returns (uint256) {
        if (vault == address(0)) return total;
        uint16 discountBps = IVaultDiscountView(vault).bestDiscountBps(buyer);
        if (discountBps == 0) return total;
        uint256 discounted = (total * (BASIS_POINTS - discountBps)) / BASIS_POINTS;
        require(discounted > 0, "VeSneakerStore: discount underflow");
        return discounted;
    }

    function _mintCopies(Design storage design, uint256 designIndex, address to, uint16 quantity)
        internal
        returns (uint256 firstTokenId)
    {
        for (uint16 i = 0; i < quantity; i++) {
            uint16 serial = design.minted;
            bytes32 proofHash = keccak256(abi.encodePacked("vesneaker", designIndex, serial));
            uint256 tokenId = nft.mintAuthorized(to, design.uri, proofHash, design.rarity, design.tier);
            if (i == 0) firstTokenId = tokenId;
            design.minted = serial + 1;
        }
    }

    receive() external payable {
        revert("VeSneakerStore: use buy");
    }
}

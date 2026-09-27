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

    Design[] private _designs;

    event DesignAdded(uint256 indexed designIndex, string name, uint8 rarity, uint8 tier, uint256 price, uint16 maxSupply);
    event DesignUpdated(uint256 indexed designIndex, uint256 price, uint16 maxSupply, bool active);
    event DesignUriUpdated(uint256 indexed designIndex, string uri);
    event VeSneakerPurchased(uint256 indexed designIndex, address indexed buyer, uint256 quantity, uint256 totalPaid, uint256 firstTokenId);
    event VeSneakerReserved(uint256 indexed designIndex, address indexed recipient, uint256 quantity, uint256 firstTokenId);
    event TreasuryUpdated(address indexed treasury);
    event ProgressUpdated(address indexed progress);
    event ProceedsWithdrawn(address indexed to, uint256 amount);

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

    /// @notice Link PlayerProgress for level-gated designs.
    function setProgress(address progress_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        progress = progress_;
        emit ProgressUpdated(progress_);
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

    /// @notice Total POL required to buy `quantity` copies of a design.
    function quote(uint256 designIndex, uint16 quantity) external view returns (uint256) {
        require(quantity > 0, "VeSneakerStore: invalid quantity");
        return _requireDesign(designIndex).price * quantity;
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
        uint256 total = design.price * quantity;
        require(msg.value == total, "VeSneakerStore: wrong payment");

        firstTokenId = _mintCopies(design, designIndex, buyer, quantity);

        (bool sent, ) = treasury.call{value: total}("");
        require(sent, "VeSneakerStore: treasury transfer failed");
        emit VeSneakerPurchased(designIndex, buyer, quantity, total, firstTokenId);
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

// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMods} from "./SneakerMods.sol";

/// @dev Minimal view of PlayerProgress needed for level-gated designs.
interface IPlayerProgressView {
    function levelOf(address user) external view returns (uint8);
}

/// @dev Minimal view of SneakerVault needed for perk discounts.
interface IVaultDiscountView {
    function bestDiscountBps(address user) external view returns (uint16);
}

/// @title ModStore — primary sale of premium upgrade mods for POL.
/// @notice The store mints SneakerMods on demand: the buyer pays POL and the
///      store calls SneakerMods.mintAuthorized, so no copies are pre-minted.
///      The store must hold MINTER_ROLE on SneakerMods. Each mod design has
///      its own slot, effect, price, and supply cap. All proceeds go to the
///      treasury. Achievement badges stay free — this store sells power.
contract ModStore is Pausable, AccessControl, ReentrancyGuard {
    uint256 public constant BASIS_POINTS = 10_000;
    uint16 public constant MAX_BATCH = 20;

    struct ModDesign {
        string name;
        string uri;
        uint8 slot; // SneakerMods SLOT_*
        uint8 rarity;
        uint8 tier;
        uint16 effectBps;
        uint8 aux;
        bool consumable;
        uint256 price; // POL per copy
        uint16 maxSupply;
        uint16 minted;
        /// @notice Minimum PlayerProgress level required to buy (0 = open to all).
        uint8 requiredLevel;
        bool active;
    }

    SneakerMods public immutable mods;
    address payable public treasury;

    /// @notice PlayerProgress consulted for level-gated designs. Zero address
    ///      disables gating — level-gated designs become unpurchasable.
    address public progress;

    /// @notice SneakerVault consulted for perk discounts. Zero address
    ///      disables discounts — every buyer pays full price.
    address public vault;

    ModDesign[] private _designs;

    event ModDesignAdded(uint256 indexed designIndex, string name, uint8 slot, uint8 tier, uint16 effectBps, uint256 price, uint16 maxSupply);
    event ModDesignUpdated(uint256 indexed designIndex, uint256 price, uint16 maxSupply, bool active);
    event ModPurchased(uint256 indexed designIndex, address indexed buyer, uint256 quantity, uint256 totalPaid, uint256 firstTokenId);
    event TreasuryUpdated(address indexed treasury);
    event ProgressUpdated(address indexed progress);
    event VaultUpdated(address indexed vault);
    event ProceedsWithdrawn(address indexed to, uint256 amount);

    constructor(address admin, address modsAddress, address payable treasury_) {
        require(admin != address(0), "ModStore: zero admin");
        require(modsAddress != address(0), "ModStore: zero mods");
        require(treasury_ != address(0), "ModStore: zero treasury");
        mods = SneakerMods(modsAddress);
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

    /// @notice Register a new purchasable mod design. Admin only. The
    ///      `minted` and `active` fields of the input are ignored.
    function addDesign(ModDesign calldata design)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 designIndex)
    {
        require(bytes(design.name).length > 0, "ModStore: empty name");
        require(bytes(design.uri).length > 0, "ModStore: empty uri");
        require(design.price > 0, "ModStore: zero price");
        require(design.maxSupply > 0, "ModStore: zero supply");

        designIndex = _designs.length;
        _designs.push(ModDesign({
            name: design.name,
            uri: design.uri,
            slot: design.slot,
            rarity: design.rarity,
            tier: design.tier,
            effectBps: design.effectBps,
            aux: design.aux,
            consumable: design.consumable,
            price: design.price,
            maxSupply: design.maxSupply,
            minted: 0,
            requiredLevel: design.requiredLevel,
            active: true
        }));
        emit ModDesignAdded(
            designIndex, design.name, design.slot, design.tier,
            design.effectBps, design.price, design.maxSupply
        );
    }

    /// @notice Update price, supply cap, or activation for a design. Admin only.
    function updateDesign(uint256 designIndex, uint256 price, uint16 maxSupply, bool active)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        ModDesign storage design = _requireDesign(designIndex);
        require(price > 0, "ModStore: zero price");
        require(maxSupply >= design.minted, "ModStore: supply below minted");
        design.price = price;
        design.maxSupply = maxSupply;
        design.active = active;
        emit ModDesignUpdated(designIndex, price, maxSupply, active);
    }

    /// @notice Update the required player level for a design. Admin only.
    function setDesignRequiredLevel(uint256 designIndex, uint8 requiredLevel) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireDesign(designIndex).requiredLevel = requiredLevel;
        emit ModDesignUpdated(designIndex, _requireDesign(designIndex).price, _requireDesign(designIndex).maxSupply, _requireDesign(designIndex).active);
    }

    /// @notice Link PlayerProgress for level-gated designs.
    function setProgress(address progress_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        progress = progress_;
        emit ProgressUpdated(progress_);
    }

    /// @notice Link SneakerVault for perk discounts. Zero address disables
    ///      discounts — every buyer pays full price.
    function setVault(address vault_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function setTreasury(address payable treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(treasury_ != address(0), "ModStore: zero treasury");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Recover POL that is not part of an in-flight sale. Admin only.
    function withdrawProceeds(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "ModStore: zero recipient");
        uint256 amount = address(this).balance;
        require(amount > 0, "ModStore: no proceeds");
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "ModStore: transfer failed");
        emit ProceedsWithdrawn(to, amount);
    }

    // ─────────────────────────── Purchase ────────────────────────

    /// @notice Buy one mod from a design, paying its price in POL.
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
        require(quantity > 1 && quantity <= MAX_BATCH, "ModStore: invalid quantity");
        return _buy(designIndex, quantity, msg.sender);
    }

    // ─────────────────────────── Views ───────────────────────────

    function designCount() external view returns (uint256) {
        return _designs.length;
    }

    function designs(uint256 designIndex) external view returns (ModDesign memory) {
        return _requireDesign(designIndex);
    }

    function remaining(uint256 designIndex) external view returns (uint256) {
        ModDesign storage design = _requireDesign(designIndex);
        return uint256(design.maxSupply) - uint256(design.minted);
    }

    function isAvailable(uint256 designIndex) external view returns (bool) {
        if (designIndex >= _designs.length) return false;
        ModDesign storage design = _designs[designIndex];
        return design.active && design.minted < design.maxSupply;
    }

    /// @notice Total POL required to buy `quantity` copies of a design,
    ///      applying the buyer's best vault discount when one is linked.
    function quote(uint256 designIndex, uint16 quantity) external view returns (uint256) {
        require(quantity > 0, "ModStore: invalid quantity");
        uint256 total = _requireDesign(designIndex).price * quantity;
        return _applyDiscount(msg.sender, total);
    }

    // ─────────────────────────── Internal ────────────────────────

    function _requireDesign(uint256 designIndex) internal view returns (ModDesign storage) {
        require(designIndex < _designs.length, "ModStore: unknown design");
        return _designs[designIndex];
    }

    function _buy(uint256 designIndex, uint16 quantity, address buyer) internal returns (uint256 firstTokenId) {
        ModDesign storage design = _requireDesign(designIndex);
        require(design.active, "ModStore: design inactive");
        require(design.minted + quantity <= design.maxSupply, "ModStore: supply exhausted");
        if (design.requiredLevel > 0) {
            require(
                progress != address(0) && IPlayerProgressView(progress).levelOf(buyer) >= design.requiredLevel,
                "ModStore: level required"
            );
        }
        uint256 total = _applyDiscount(buyer, design.price * quantity);
        require(msg.value == total, "ModStore: wrong payment");

        for (uint16 i = 0; i < quantity; i++) {
            uint16 serial = design.minted;
            uint256 tokenId = mods.mintAuthorized(
                buyer,
                design.uri,
                SneakerMods.ModTraits({
                    slot: design.slot,
                    rarity: design.rarity,
                    tier: design.tier,
                    effectBps: design.effectBps,
                    aux: design.aux,
                    consumable: design.consumable,
                    proofHash: keccak256(abi.encodePacked("modstore", designIndex, serial))
                })
            );
            if (i == 0) firstTokenId = tokenId;
            design.minted = serial + 1;
        }

        (bool sent, ) = treasury.call{value: total}("");
        require(sent, "ModStore: treasury transfer failed");
        emit ModPurchased(designIndex, buyer, quantity, total, firstTokenId);
    }

    /// @notice Apply the buyer's best vault discount. Zero vault address or a
    ///      zero discount both mean full price — the discount can never make
    ///      the payable amount zero.
    function _applyDiscount(address buyer, uint256 total) internal view returns (uint256) {
        if (vault == address(0)) return total;
        uint16 discountBps = IVaultDiscountView(vault).bestDiscountBps(buyer);
        if (discountBps == 0) return total;
        uint256 discounted = (total * (BASIS_POINTS - discountBps)) / BASIS_POINTS;
        require(discounted > 0, "ModStore: discount underflow");
        return discounted;
    }

    receive() external payable {
        revert("ModStore: use buy");
    }
}

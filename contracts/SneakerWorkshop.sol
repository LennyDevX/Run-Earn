// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {SneakerMods} from "./SneakerMods.sol";
import {SneakerGame} from "./SneakerGame.sol";
import {SneakerStaking} from "./SneakerStaking.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @dev Minimal rental view the workshop needs to validate rented mods.
interface IModRental {
    /// @notice True while `modId` is actively rented (renter set, not expired).
    function isActiveRental(uint256 modId) external view returns (bool);
}

/// @title SneakerWorkshop — equip/unequip engine, repair kits, and veRUNE forge.
/// @notice The workshop is the core of the RUN&EARN upgrade mini-game. Owners
///      equip SneakerMods NFTs into one of six slots on a veSneaker; equipped
///      mods are escrowed here (or stay in ModRental escrow when rented) and
///      their effects are exposed through ISneakerBoosts so the game, staking,
///      and appraiser contracts can read them live.
/// @dev Control model: whoever controls the sneaker (wallet owner or staked
///      owner) controls its loadout. Equipped mods therefore travel with the
///      sneaker on direct transfers — sell value includes the build. The
///      marketplace blocks listing sneakers that still have mods equipped, so
///      sellers must unequip first.
///      Forge: burns the caller's claimed veRUNE balance to permanently raise
///      a sneaker's rarity score and earn rate. Cost scales linearly per level.
///      Abilities: consumable mods are single-use NFTs burned for an effect and
///      gated by the sneaker's energy (refilled on activation). aux encodes the
///      ability kind: 0/255 repair kit · 1 surge (instant activation) ·
///      2 boost capsule (+effectBps earn for 24h) · 3 forge stone (free level).
contract SneakerWorkshop is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver, ISneakerBoosts {
    uint256 public constant BASIS_POINTS = 10_000;

    /// Consumable ability kinds (SneakerMods.ModTraits.aux).
    uint8 public constant ABILITY_REPAIR = 0; // full health restore (aux 0 or 255)
    uint8 public constant ABILITY_SURGE = 1; // instant activation, bypasses cooldown
    uint8 public constant ABILITY_BOOST = 2; // +effectBps earn rate for BOOST_DURATION
    uint8 public constant ABILITY_FORGE_STONE = 3; // free forge level

    /// Energy charged per ability. Repair kits are free — recovery must always
    /// be available even when the sneaker has no energy left.
    uint16 public constant ENERGY_COST_REPAIR = 0;
    uint16 public constant ENERGY_COST_SURGE = 2;
    uint16 public constant ENERGY_COST_BOOST = 1;
    uint16 public constant ENERGY_COST_FORGE_STONE = 2;

    /// How long a burned boost capsule stays active.
    uint64 public constant BOOST_DURATION = 24 hours;

    SneakerMint public immutable nft;
    SneakerMods public immutable mods;
    SneakerGame public immutable game;
    SneakerStaking public immutable staking;

    /// @notice ModRental contract allowed to equip rented mods via equipFrom.
    address public rentalSource;

    /// sneakerId => slot => modId (0 = empty)
    mapping(uint256 => mapping(uint8 => uint256)) public equipped;
    /// modId => sneakerId it is equipped to (0 = not equipped)
    mapping(uint256 => uint256) public equippedTo;
    /// modId => address holding the NFT while equipped (this contract or rentalSource)
    mapping(uint256 => address) public custodian;
    /// sneakerId => number of equipped mods
    mapping(uint256 => uint256) public equippedCount;

    /// sneakerId => forge level (permanent veRUNE-bought upgrades)
    mapping(uint256 => uint8) public forgeLevel;

    /// sneakerId => temporary earn boost from a burned boost capsule.
    mapping(uint256 => uint16) public tempBoostBps;
    /// sneakerId => timestamp when the temporary boost lapses.
    mapping(uint256 => uint64) public boostExpiresAt;

    /// Base veRUNE cost per forge level; actual cost = forgeCostPoints * (level + 1).
    uint256 public forgeCostPoints;
    /// Rarity points gained per forge level.
    uint8 public forgeRarityStep;
    /// Earn-rate bonus gained per forge level, in basis points.
    uint16 public forgeEarnStepBps;
    /// Maximum forge level per sneaker.
    uint8 public maxForgeLevel;

    event ModEquipped(address indexed user, uint256 indexed sneakerId, uint256 indexed modId, uint8 slot);
    event ModUnequipped(uint256 indexed sneakerId, uint256 indexed modId, uint8 slot);
    event RepairKitUsed(address indexed user, uint256 indexed sneakerId, uint256 indexed modId);
    event AbilityUsed(address indexed user, uint256 indexed sneakerId, uint256 indexed modId, uint8 kind);
    event Forged(address indexed user, uint256 indexed sneakerId, uint8 newLevel, uint256 cost);
    event ForgeParamsUpdated(uint256 forgeCostPoints, uint8 forgeRarityStep, uint16 forgeEarnStepBps, uint8 maxForgeLevel);
    event RentalSourceUpdated(address indexed rentalSource);

    constructor(
        address admin,
        address nftAddress,
        address modsAddress,
        address gameAddress,
        address stakingAddress,
        uint256 forgeCostPoints_,
        uint8 forgeRarityStep_,
        uint16 forgeEarnStepBps_,
        uint8 maxForgeLevel_
    ) {
        require(admin != address(0), "SneakerWorkshop: zero admin");
        require(nftAddress != address(0), "SneakerWorkshop: zero NFT");
        require(modsAddress != address(0), "SneakerWorkshop: zero mods");
        require(gameAddress != address(0), "SneakerWorkshop: zero game");
        require(stakingAddress != address(0), "SneakerWorkshop: zero staking");
        nft = SneakerMint(nftAddress);
        mods = SneakerMods(modsAddress);
        game = SneakerGame(gameAddress);
        staking = SneakerStaking(payable(stakingAddress));
        forgeCostPoints = forgeCostPoints_;
        forgeRarityStep = forgeRarityStep_;
        forgeEarnStepBps = forgeEarnStepBps_;
        maxForgeLevel = maxForgeLevel_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setRentalSource(address rentalSource_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rentalSource = rentalSource_;
        emit RentalSourceUpdated(rentalSource_);
    }

    function updateForgeParams(
        uint256 forgeCostPoints_,
        uint8 forgeRarityStep_,
        uint16 forgeEarnStepBps_,
        uint8 maxForgeLevel_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        forgeCostPoints = forgeCostPoints_;
        forgeRarityStep = forgeRarityStep_;
        forgeEarnStepBps = forgeEarnStepBps_;
        maxForgeLevel = maxForgeLevel_;
        emit ForgeParamsUpdated(forgeCostPoints_, forgeRarityStep_, forgeEarnStepBps_, maxForgeLevel_);
    }

    // ─────────────────────────── Equip ───────────────────────────

    /// @notice Equip an owned mod into its slot on a sneaker the caller controls.
    function equip(uint256 sneakerId, uint256 modId) external whenNotPaused nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        require(mods.ownerOf(modId) == msg.sender, "SneakerWorkshop: not mod owner");
        _attach(sneakerId, modId, msg.sender);
        custodian[modId] = address(this);
        mods.safeTransferFrom(msg.sender, address(this), modId);
    }

    /// @notice Equip a rented mod. Callable only by the rental contract, which
    ///      keeps custody of the NFT while `user` controls the sneaker loadout.
    function equipFrom(uint256 sneakerId, uint256 modId, address user) external whenNotPaused {
        require(msg.sender == rentalSource, "SneakerWorkshop: not rental");
        require(_controlsSneaker(user, sneakerId), "SneakerWorkshop: not sneaker owner");
        _attach(sneakerId, modId, user);
        custodian[modId] = rentalSource;
    }

    /// @notice Unequip a mod from a sneaker the caller controls. Owned mods
    ///      return to the caller; rented mods stay in the rental escrow.
    function unequip(uint256 sneakerId, uint8 slot) external nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        _detach(sneakerId, slot, msg.sender);
    }

    /// @notice Force-detach a mod. Callable only by the rental contract when a
    ///      rental expires or the renter releases the mod early.
    function detachByMod(uint256 modId) external {
        require(msg.sender == rentalSource, "SneakerWorkshop: not rental");
        uint256 sneakerId = equippedTo[modId];
        if (sneakerId == 0) return;
        uint8 slot = mods.traitsOf(modId).slot;
        equipped[sneakerId][slot] = 0;
        equippedTo[modId] = 0;
        custodian[modId] = address(0);
        equippedCount[sneakerId] -= 1;
        emit ModUnequipped(sneakerId, modId, slot);
    }

    // ─────────────────────────── Repair kits & forge ─────────────

    /// @notice Burn an owned consumable mod to trigger its ability. The mod is
    ///      destroyed — every ability use consumes an NFT, feeding the mod
    ///      economy. aux selects the effect: 0/255 repair · 1 surge · 2 boost ·
    ///      3 forge stone. Energy is charged to the sneaker per ability kind.
    function useAbility(uint256 sneakerId, uint256 modId) external whenNotPaused nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        require(mods.ownerOf(modId) == msg.sender, "SneakerWorkshop: not mod owner");
        require(equippedTo[modId] == 0, "SneakerWorkshop: mod equipped");
        SneakerMods.ModTraits memory traits = mods.traitsOf(modId);
        require(traits.consumable, "SneakerWorkshop: not consumable");

        uint8 kind = traits.aux == mods.NO_AUX() ? ABILITY_REPAIR : traits.aux;

        if (kind == ABILITY_REPAIR) {
            mods.burn(modId);
            game.repairFromWorkshop(sneakerId);
            emit RepairKitUsed(msg.sender, sneakerId, modId);
            return;
        }
        if (kind == ABILITY_SURGE) {
            game.spendEnergy(sneakerId, ENERGY_COST_SURGE);
            mods.burn(modId);
            game.activateFromWorkshop(sneakerId, msg.sender);
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        if (kind == ABILITY_BOOST) {
            require(traits.effectBps > 0, "SneakerWorkshop: empty boost");
            game.spendEnergy(sneakerId, ENERGY_COST_BOOST);
            mods.burn(modId);
            tempBoostBps[sneakerId] = traits.effectBps;
            boostExpiresAt[sneakerId] = uint64(block.timestamp) + BOOST_DURATION;
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        if (kind == ABILITY_FORGE_STONE) {
            game.spendEnergy(sneakerId, ENERGY_COST_FORGE_STONE);
            uint8 level = forgeLevel[sneakerId];
            require(level < maxForgeLevel, "SneakerWorkshop: max forge level");
            mods.burn(modId);
            forgeLevel[sneakerId] = level + 1;
            emit Forged(msg.sender, sneakerId, level + 1, 0);
            return;
        }
        revert("SneakerWorkshop: unknown ability");
    }

    /// @notice Burn an owned consumable mod to fully repair a sneaker without
    ///      spending veRUNE.
    function useRepairKit(uint256 sneakerId, uint256 modId) external whenNotPaused nonReentrant {
        SneakerMods.ModTraits memory traits = mods.traitsOf(modId);
        require(
            traits.aux == ABILITY_REPAIR || traits.aux == mods.NO_AUX(),
            "SneakerWorkshop: not a repair kit"
        );
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        require(mods.ownerOf(modId) == msg.sender, "SneakerWorkshop: not mod owner");
        require(equippedTo[modId] == 0, "SneakerWorkshop: mod equipped");
        require(traits.consumable, "SneakerWorkshop: not consumable");

        mods.burn(modId);
        game.repairFromWorkshop(sneakerId);
        emit RepairKitUsed(msg.sender, sneakerId, modId);
    }

    /// @notice Burn claimed veRUNE to permanently upgrade a sneaker.
    ///      Each level adds `forgeRarityStep` rarity and `forgeEarnStepBps`
    ///      earn rate. Cost grows linearly: cost = base * (level + 1).
    function forge(uint256 sneakerId) external whenNotPaused nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        uint8 level = forgeLevel[sneakerId];
        require(level < maxForgeLevel, "SneakerWorkshop: max forge level");

        uint256 cost = forgeCostPoints * (uint256(level) + 1);
        game.spendPoints(msg.sender, cost);
        forgeLevel[sneakerId] = level + 1;
        emit Forged(msg.sender, sneakerId, level + 1, cost);
    }

    /// @notice veRUNE cost of the next forge level for a sneaker.
    function nextForgeCost(uint256 sneakerId) external view returns (uint256) {
        uint8 level = forgeLevel[sneakerId];
        if (level >= maxForgeLevel) return 0;
        return forgeCostPoints * (uint256(level) + 1);
    }

    // ─────────────────────────── ISneakerBoosts ──────────────────

    function earnBonusBps(uint256 tokenId) external view returns (uint256) {
        uint256 bonus = uint256(_activeEffect(tokenId, mods.SLOT_UPPER())) +
            uint256(forgeLevel[tokenId]) * forgeEarnStepBps;
        // Burned boost capsule adds its effect while unexpired.
        if (block.timestamp < boostExpiresAt[tokenId]) bonus += tempBoostBps[tokenId];
        return bonus;
    }

    function wearReductionBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_SOLE());
    }

    function maxDurabilityBonusBps(uint256 tokenId) external view returns (uint256) {
        // Reserved for future mod kinds; forge does not change durability.
        tokenId;
        return 0;
    }

    function repairDiscountBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_LINING());
    }

    function appraisalBonusBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_SKIN());
    }

    function stakingBoostBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_BOOST());
    }

    function rarityBonus(uint256 tokenId) external view returns (uint8) {
        return uint8(uint256(forgeLevel[tokenId]) * forgeRarityStep);
    }

    function autoActive(uint256 tokenId) external view returns (bool) {
        return _activeMod(tokenId, mods.SLOT_CORE()) != 0;
    }

    function skinOverride(uint256 tokenId) external view returns (uint8) {
        uint256 modId = _activeMod(tokenId, mods.SLOT_SKIN());
        if (modId == 0) return mods.NO_AUX();
        return mods.traitsOf(modId).aux;
    }

    function hasEquippedMods(uint256 tokenId) external view returns (bool) {
        return equippedCount[tokenId] > 0;
    }

    // ─────────────────────────── Internal ────────────────────────

    function _controlsSneaker(address user, uint256 sneakerId) internal view returns (bool) {
        return nft.ownerOf(sneakerId) == user || staking.stakedOwner(sneakerId) == user;
    }

    function _attach(uint256 sneakerId, uint256 modId, address user) internal {
        require(equippedTo[modId] == 0, "SneakerWorkshop: mod already equipped");
        SneakerMods.ModTraits memory traits = mods.traitsOf(modId);
        require(!traits.consumable, "SneakerWorkshop: consumable cannot equip");
        require(equipped[sneakerId][traits.slot] == 0, "SneakerWorkshop: slot occupied");

        equipped[sneakerId][traits.slot] = modId;
        equippedTo[modId] = sneakerId;
        equippedCount[sneakerId] += 1;
        emit ModEquipped(user, sneakerId, modId, traits.slot);
    }

    function _detach(uint256 sneakerId, uint8 slot, address recipient) internal {
        uint256 modId = equipped[sneakerId][slot];
        require(modId != 0, "SneakerWorkshop: empty slot");

        equipped[sneakerId][slot] = 0;
        equippedTo[modId] = 0;
        equippedCount[sneakerId] -= 1;
        address held = custodian[modId];
        custodian[modId] = address(0);

        // Only transfer when the workshop itself holds the mod; rented mods
        // remain in the rental escrow.
        if (held == address(this)) {
            mods.safeTransferFrom(address(this), recipient, modId);
        }
        emit ModUnequipped(sneakerId, modId, slot);
    }

    /// @notice Equipped mod still valid (rented mods stop counting once the
    ///      rental expires, even before cleanup runs).
    function _activeMod(uint256 sneakerId, uint8 slot) internal view returns (uint256) {
        uint256 modId = equipped[sneakerId][slot];
        if (modId == 0) return 0;
        if (custodian[modId] == rentalSource && rentalSource != address(0)) {
            if (!IModRental(rentalSource).isActiveRental(modId)) return 0;
        }
        return modId;
    }

    function _activeEffect(uint256 sneakerId, uint8 slot) internal view returns (uint16) {
        uint256 modId = _activeMod(sneakerId, slot);
        if (modId == 0) return 0;
        return mods.traitsOf(modId).effectBps;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

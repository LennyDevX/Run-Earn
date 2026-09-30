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

/// @title SneakerWorkshop — equip/unequip engine, consumable abilities, and care.
/// @notice The workshop is the core of the Airen upgrade mini-game. Owners equip
///      SneakerMods NFTs into one of seven slots on a veSneaker; equipped mods
///      are escrowed here and their effects are exposed through ISneakerBoosts
///      so the game, staking, appraiser, and tab arena can read them live.
/// @dev Control model: whoever controls the sneaker (wallet owner or staked
///      owner) controls its loadout. Equipped mods therefore travel with the
///      sneaker on direct transfers — sell value includes the build. The
///      marketplace blocks listing sneakers that still have mods equipped, so
///      sellers must unequip first.
///
///      **Mods are permanent property.** Every slot item is an ERC-721 the owner
///      keeps, can sell, or can gift to another wallet. Nothing in this contract
///      expires an item.
///
///      **The sneaker wears instead.** Each veSneaker runs a 365-day season:
///      condition decays linearly from pristine to fully worn, and a fully worn
///      pair keeps `conditionFloorBps` of its rarity (50% by default) — weaker,
///      never useless. Consumers scale base rarity by `conditionBps`, so wear
///      drags down the veRUNE earn rate, the appraisal, and the tab power score
///      at once. Restoring it is what the repair kit is for, which is what makes
///      consumables the recurring sink.
///
///      Abilities: consumable mods are single-use NFTs burned for an effect and
///      gated by the sneaker's energy (refilled on activation). aux encodes the
///      ability kind: 0/255 repair kit (heals + services) · 1 surge (instant
///      activation) · 2 boost capsule (+effectBps earn for 24h) · 3 service kit
///      (restores condition only) · 4 overdrive (48h) · 5 stim · 6 lucky repair.
contract SneakerWorkshop is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver, ISneakerBoosts {
    uint256 public constant BASIS_POINTS = 10_000;

    /// Consumable ability kinds (SneakerMods.ModTraits.aux). Kinds 4–6 are
    /// level-gated skill items minted via PlayerLevel achievements / ModStore.
    uint8 public constant ABILITY_REPAIR = 0; // full health restore + full service (aux 0 or 255)
    uint8 public constant ABILITY_SURGE = 1; // instant activation, bypasses cooldown
    uint8 public constant ABILITY_BOOST = 2; // +effectBps earn rate for BOOST_DURATION
    uint8 public constant ABILITY_SERVICE = 3; // condition restored to full
    uint8 public constant ABILITY_OVERDRIVE = 4; // +effectBps earn rate for OVERDRIVE_DURATION
    uint8 public constant ABILITY_STIM = 5; // instant energy refill to max
    uint8 public constant ABILITY_LUCKY_REPAIR = 6; // full repair + optional 24h boost

    /// Energy charged per ability. Recovery is free — a worn-out sneaker must
    /// always be revivable even with no energy left.
    uint16 public constant ENERGY_COST_REPAIR = 0;
    uint16 public constant ENERGY_COST_SURGE = 2;
    uint16 public constant ENERGY_COST_BOOST = 1;
    uint16 public constant ENERGY_COST_SERVICE = 0;
    uint16 public constant ENERGY_COST_OVERDRIVE = 3;
    uint16 public constant ENERGY_COST_STIM = 0;
    uint16 public constant ENERGY_COST_LUCKY_REPAIR = 1;

    /// How long a burned boost capsule stays active.
    uint64 public constant BOOST_DURATION = 24 hours;
    /// Overdrive is the premium skill capsule — twice the standard boost window.
    uint64 public constant OVERDRIVE_DURATION = 48 hours;

    /// Default season length: one year of real time from the first service.
    uint64 public constant DEFAULT_SEASON_SECONDS = 365 days;
    /// Default floor: a fully worn pair keeps half its rarity.
    uint16 public constant DEFAULT_CONDITION_FLOOR_BPS = 5_000;

    SneakerMint public immutable nft;
    SneakerMods public immutable mods;
    SneakerGame public immutable game;
    SneakerStaking public immutable staking;

    /// sneakerId => slot => modId (0 = empty)
    mapping(uint256 => mapping(uint8 => uint256)) public equipped;
    /// modId => sneakerId it is equipped to (0 = not equipped)
    mapping(uint256 => uint256) public equippedTo;
    /// modId => address holding the NFT while equipped (always this contract)
    mapping(uint256 => address) public custodian;
    /// sneakerId => number of equipped mods
    mapping(uint256 => uint256) public equippedCount;

    /// sneakerId => start of the current 365-day season. Zero means the pair has
    /// never been put to work, so it is still pristine.
    mapping(uint256 => uint64) public lastServiceAt;

    /// sneakerId => temporary earn boost from a burned boost capsule.
    mapping(uint256 => uint16) public tempBoostBps;
    /// sneakerId => timestamp when the temporary boost lapses.
    mapping(uint256 => uint64) public boostExpiresAt;

    /// @notice Workshop actions per wallet (equip, unequip, ability use) —
    ///      feeds PlayerProgress XP.
    mapping(address => uint256) public actionsCount;

    /// Wear floor in basis points (how much rarity a fully worn pair keeps).
    uint16 public conditionFloorBps;
    /// Length of one wear season, in seconds.
    uint64 public seasonSeconds;

    event ModEquipped(address indexed user, uint256 indexed sneakerId, uint256 indexed modId, uint8 slot);
    event ModUnequipped(uint256 indexed sneakerId, uint256 indexed modId, uint8 slot);
    event RepairKitUsed(address indexed user, uint256 indexed sneakerId, uint256 indexed modId);
    event AbilityUsed(address indexed user, uint256 indexed sneakerId, uint256 indexed modId, uint8 kind);
    event Serviced(uint256 indexed sneakerId, uint16 conditionBps);
    event CareParamsUpdated(uint16 conditionFloorBps, uint64 seasonSeconds);

    constructor(
        address admin,
        address nftAddress,
        address modsAddress,
        address gameAddress,
        address stakingAddress,
        uint16 conditionFloorBps_,
        uint64 seasonSeconds_
    ) {
        require(admin != address(0), "SneakerWorkshop: zero admin");
        require(nftAddress != address(0), "SneakerWorkshop: zero NFT");
        require(modsAddress != address(0), "SneakerWorkshop: zero mods");
        require(gameAddress != address(0), "SneakerWorkshop: zero game");
        require(stakingAddress != address(0), "SneakerWorkshop: zero staking");
        require(conditionFloorBps_ < BASIS_POINTS, "SneakerWorkshop: floor too high");
        require(seasonSeconds_ > 0, "SneakerWorkshop: zero season");
        nft = SneakerMint(nftAddress);
        mods = SneakerMods(modsAddress);
        game = SneakerGame(gameAddress);
        staking = SneakerStaking(payable(stakingAddress));
        conditionFloorBps = conditionFloorBps_;
        seasonSeconds = seasonSeconds_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function updateCareParams(uint16 conditionFloorBps_, uint64 seasonSeconds_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(conditionFloorBps_ < BASIS_POINTS, "SneakerWorkshop: floor too high");
        require(seasonSeconds_ > 0, "SneakerWorkshop: zero season");
        conditionFloorBps = conditionFloorBps_;
        seasonSeconds = seasonSeconds_;
        emit CareParamsUpdated(conditionFloorBps_, seasonSeconds_);
    }

    // ─────────────────────────── Equip ───────────────────────────

    /// @notice Equip an owned mod into its slot on a sneaker the caller controls.
    function equip(uint256 sneakerId, uint256 modId) external whenNotPaused nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        require(mods.ownerOf(modId) == msg.sender, "SneakerWorkshop: not mod owner");
        _attach(sneakerId, modId, msg.sender);
        custodian[modId] = address(this);
        actionsCount[msg.sender] += 1;
        _startSeason(sneakerId);
        mods.safeTransferFrom(msg.sender, address(this), modId);
    }

    /// @notice Unequip a mod from a sneaker the caller controls. The mod returns
    ///      to the caller, ready to be re-equipped, sold, or gifted.
    function unequip(uint256 sneakerId, uint8 slot) external nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        _detach(sneakerId, slot, msg.sender);
        actionsCount[msg.sender] += 1;
    }

    // ─────────────────────────── Consumables ─────────────────────

    /// @notice Burn an owned consumable mod to trigger its ability. The mod is
    ///      destroyed — every ability use consumes an NFT, feeding the mod
    ///      economy. aux selects the effect. Energy is charged per ability kind.
    function useAbility(uint256 sneakerId, uint256 modId) external whenNotPaused nonReentrant {
        require(_controlsSneaker(msg.sender, sneakerId), "SneakerWorkshop: not sneaker owner");
        require(mods.ownerOf(modId) == msg.sender, "SneakerWorkshop: not mod owner");
        require(equippedTo[modId] == 0, "SneakerWorkshop: mod equipped");
        SneakerMods.ModTraits memory traits = mods.traitsOf(modId);
        require(traits.consumable, "SneakerWorkshop: not consumable");

        actionsCount[msg.sender] += 1;
        uint8 kind = traits.aux == mods.NO_AUX() ? ABILITY_REPAIR : traits.aux;

        if (kind == ABILITY_REPAIR) {
            mods.burn(modId);
            game.repairFromWorkshop(sneakerId);
            _service(sneakerId);
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
        if (kind == ABILITY_SERVICE) {
            mods.burn(modId);
            _service(sneakerId);
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        if (kind == ABILITY_OVERDRIVE) {
            require(traits.effectBps > 0, "SneakerWorkshop: empty boost");
            game.spendEnergy(sneakerId, ENERGY_COST_OVERDRIVE);
            mods.burn(modId);
            tempBoostBps[sneakerId] = traits.effectBps;
            boostExpiresAt[sneakerId] = uint64(block.timestamp) + OVERDRIVE_DURATION;
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        if (kind == ABILITY_STIM) {
            mods.burn(modId);
            game.refillEnergyFromWorkshop(sneakerId);
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        if (kind == ABILITY_LUCKY_REPAIR) {
            game.spendEnergy(sneakerId, ENERGY_COST_LUCKY_REPAIR);
            mods.burn(modId);
            game.repairFromWorkshop(sneakerId);
            _service(sneakerId);
            if (traits.effectBps > 0) {
                tempBoostBps[sneakerId] = traits.effectBps;
                boostExpiresAt[sneakerId] = uint64(block.timestamp) + BOOST_DURATION;
            }
            emit AbilityUsed(msg.sender, sneakerId, modId, kind);
            return;
        }
        revert("SneakerWorkshop: unknown ability");
    }

    /// @notice Burn an owned repair kit to fully repair and service a sneaker
    ///      without spending veRUNE.
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

        actionsCount[msg.sender] += 1;
        mods.burn(modId);
        game.repairFromWorkshop(sneakerId);
        _service(sneakerId);
        emit RepairKitUsed(msg.sender, sneakerId, modId);
    }

    // ─────────────────────────── ISneakerBoosts ──────────────────

    function earnBonusBps(uint256 tokenId) external view returns (uint256) {
        uint256 bonus = uint256(_activeEffect(tokenId, mods.SLOT_UPPER())) +
            uint256(_activeEffect(tokenId, mods.SLOT_SKILL()));
        // Burned boost capsule adds its effect while unexpired.
        if (block.timestamp < boostExpiresAt[tokenId]) bonus += tempBoostBps[tokenId];
        return bonus;
    }

    /// @notice Passive earn bonus contributed by an equipped skill NFT
    ///      (SLOT_SKILL). Already folded into `earnBonusBps` — exposed for UI.
    function skillBonusBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_SKILL());
    }

    function wearReductionBps(uint256 tokenId) external view returns (uint256) {
        return _activeEffect(tokenId, mods.SLOT_SOLE());
    }

    function maxDurabilityBonusBps(uint256 tokenId) external view returns (uint256) {
        // Reserved for future mod kinds.
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

    /// @notice Live wear of the pair, in basis points. A pair that has never
    ///      been put to work reads as pristine.
    function conditionBps(uint256 tokenId) public view returns (uint16) {
        uint64 startedAt = lastServiceAt[tokenId];
        if (startedAt == 0) return uint16(BASIS_POINTS);

        uint256 elapsed = block.timestamp - startedAt;
        if (elapsed >= seasonSeconds) return conditionFloorBps;

        uint256 floor = conditionFloorBps;
        uint256 lost = ((BASIS_POINTS - floor) * elapsed) / seasonSeconds;
        return uint16(BASIS_POINTS - lost);
    }

    /// @notice Seconds until this pair is fully worn (0 once it is).
    function secondsUntilFullyWorn(uint256 tokenId) external view returns (uint256) {
        uint16 current = conditionBps(tokenId);
        if (current <= conditionFloorBps) return 0;
        uint256 span = BASIS_POINTS - conditionFloorBps;
        return (((uint256(current) - conditionFloorBps) * seasonSeconds) / span);
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

    /// @notice Start the wear season on first use. A sneaker in the box does not
    ///      wear out, so an untouched pair reads as pristine.
    function _startSeason(uint256 sneakerId) internal {
        if (lastServiceAt[sneakerId] == 0) {
            lastServiceAt[sneakerId] = uint64(block.timestamp);
        }
    }

    /// @notice Restore the pair to pristine and restart its season.
    function _service(uint256 sneakerId) internal {
        lastServiceAt[sneakerId] = uint64(block.timestamp);
        emit Serviced(sneakerId, uint16(BASIS_POINTS));
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
        custodian[modId] = address(0);

        mods.safeTransferFrom(address(this), recipient, modId);
        emit ModUnequipped(sneakerId, modId, slot);
    }

    function _activeMod(uint256 sneakerId, uint8 slot) internal view returns (uint256) {
        return equipped[sneakerId][slot];
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

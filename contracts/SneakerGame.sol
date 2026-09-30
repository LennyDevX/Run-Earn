// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @title SneakerGame — sneaker power/health/energy gamification with virtual veRUNE points.
/// @notice Each veSneaker has three rarity-driven stats:
///      POWER — how fast it mines veRUNE. Base daily rate = tier base scaled by
///      the rarity score (rarity 50 = 1x, 100 = 1.5x, 0 = 0.5x).
///      HEALTH — the sneaker's lifetime. It decays one unit per day plus wear
///      per activation; at zero the sneaker stops mining until repaired
///      (veRUNE) or restored by burning a repair-kit mod NFT.
///      ENERGY — charges spent on special abilities (surge activations, boost
///      capsules, forge stones) via the workshop. Refills to full on every
///      manual activation; capacity grows with rarity.
///      The owner must activate the sneaker every 24 hours to keep it earning.
///      Activating within 48h builds a daily streak that multiplies power.
/// @dev veRUNE points are VIRTUAL — they are not an ERC-20 token. They are
///      tracked in contract state per owner. A future redemption path lets
///      users exchange veRUNE for real REN tokens at a configurable rate;
///      redemption is disabled until the admin funds the contract with REN
///      and enables it.
///      When a SneakerWorkshop is linked via setBoosts/setWorkshop, equipped
///      mods modify earn rate, wear, and repair cost; a Core mod keeps the
///      earn window open permanently (auto-activation), and the workshop can
///      spend claimed veRUNE (forge), repair sneakers, trigger surge
///      activations, and spend energy on behalf of the owner.
contract SneakerGame is Pausable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant ACTIVATION_COOLDOWN = 24 hours; // must wait 24h between activations
    uint256 public constant ACTIVE_WINDOW = 24 hours; // earns passively for 24h after activation
    uint256 public constant STREAK_BREAK_WINDOW = 48 hours; // streak resets if activation gap exceeds this
    uint256 public constant MAX_STREAK_BONUS_BPS = 5_000; // streak bonus caps at +50%

    /// Health decays one durability unit per this period (1 unit = 1 day of life).
    uint64 public constant HEALTH_DECAY_PERIOD = 1 days;
    /// Power curve: powerBps = POWER_BASE_BPS + rarity * POWER_RARITY_BPS.
    ///   rarity 0 → 0.5x · rarity 50 → 1.0x · rarity 100 → 1.5x
    uint256 public constant POWER_BASE_BPS = 5_000;
    uint256 public constant POWER_RARITY_BPS = 100;
    /// Energy capacity: ENERGY_BASE + rarity / ENERGY_RARITY_DIV.
    ///   rarity 0 → 2 · rarity 50 → 4 · rarity 100 → 7
    uint16 public constant ENERGY_BASE = 2;
    uint16 public constant ENERGY_RARITY_DIV = 20;

    struct SneakerState {
        uint64 lastActivationAt;
        uint64 lastAccrualAt;
        uint32 streak; // consecutive daily activations
        uint16 durability; // current health, 0 = worn out
        uint256 pendingPoints; // unclaimed veRUNE for this NFT
        uint256 lifetimePoints; // total veRUNE ever earned by this NFT
        uint64 lastDecayAt; // last health-decay checkpoint
        uint16 energy; // ability charges, refilled by manual activation
    }

    SneakerMint public immutable nft;
    IERC20 public immutable renToken; // REN token used for future redemption

    /// @notice Optional boost provider (SneakerWorkshop). Zero address = no mods.
    ISneakerBoosts public boosts;
    /// @notice Workshop contract authorized to repair sneakers and spend veRUNE.
    address public workshop;

    uint256[4] public tierBasePointsPerDay; // veRUNE per day at 1x, per tier
    uint256 public streakBonusStepBps; // bonus per streak day (e.g. 100 = +1%)
    uint16 public maxDurability; // durability after mint/repair
    uint16 public wearPerActivation; // durability consumed per activation
    uint256 public repairCostPoints; // veRUNE cost to fully repair
    uint256 public redemptionRate; // veRUNE points per 1 REN (18 decimals)
    bool public redemptionEnabled;

    uint256 public totalPointsIssued;

    mapping(uint256 tokenId => SneakerState state) public sneakers;
    mapping(address owner => uint256 balance) public veRuneBalance;
    mapping(address owner => uint256 redeemedTotal) public totalRedeemed;
    /// @notice Lifetime veRUNE claimed by a wallet — feeds PlayerProgress XP.
    mapping(address owner => uint256 earned) public lifetimeEarned;

    event Activated(address indexed owner, uint256 indexed tokenId, uint32 streak, uint16 durability);
    event PointsClaimed(address indexed owner, uint256 indexed tokenId, uint256 amount);
    event Repaired(address indexed owner, uint256 indexed tokenId, uint256 cost);
    event Redeemed(address indexed owner, uint256 points, uint256 renAmount);
    event ParamsUpdated();
    event RedemptionToggled(bool enabled, uint256 redemptionRate);
    event RENFunded(address indexed funder, uint256 amount);
    event BoostsUpdated(address indexed boosts);
    event WorkshopUpdated(address indexed workshop);
    event PointsSpent(address indexed owner, uint256 amount, address indexed spender);
    event EnergySpent(uint256 indexed tokenId, uint16 amount, address indexed spender);
    event EnergyRefilled(uint256 indexed tokenId, uint16 energy);

    constructor(
        address admin,
        address nftAddress,
        address renTokenAddress,
        uint256[4] memory tierBasePointsPerDay_,
        uint256 streakBonusStepBps_,
        uint16 maxDurability_,
        uint16 wearPerActivation_,
        uint256 repairCostPoints_,
        uint256 redemptionRate_
    ) {
        require(admin != address(0), "SneakerGame: zero admin");
        require(nftAddress != address(0), "SneakerGame: zero NFT");
        require(renTokenAddress != address(0), "SneakerGame: zero REN token");
        require(maxDurability_ > 0, "SneakerGame: zero durability");
        require(wearPerActivation_ <= maxDurability_, "SneakerGame: wear too high");
        require(redemptionRate_ > 0, "SneakerGame: zero redemption rate");

        nft = SneakerMint(nftAddress);
        renToken = IERC20(renTokenAddress);
        tierBasePointsPerDay = tierBasePointsPerDay_;
        streakBonusStepBps = streakBonusStepBps_;
        maxDurability = maxDurability_;
        wearPerActivation = wearPerActivation_;
        repairCostPoints = repairCostPoints_;
        redemptionRate = redemptionRate_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function updateParams(
        uint256[4] calldata tierBasePointsPerDay_,
        uint256 streakBonusStepBps_,
        uint16 wearPerActivation_,
        uint256 repairCostPoints_,
        uint256 redemptionRate_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(redemptionRate_ > 0, "SneakerGame: zero redemption rate");
        require(wearPerActivation_ <= maxDurability, "SneakerGame: wear too high");
        tierBasePointsPerDay = tierBasePointsPerDay_;
        streakBonusStepBps = streakBonusStepBps_;
        wearPerActivation = wearPerActivation_;
        repairCostPoints = repairCostPoints_;
        redemptionRate = redemptionRate_;
        emit ParamsUpdated();
    }

    /// @notice Fund the contract with REN for future veRUNE redemption.
    function fundREN(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "SneakerGame: zero funding");
        renToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RENFunded(msg.sender, amount);
    }

    function setRedemptionEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        redemptionEnabled = enabled;
        emit RedemptionToggled(enabled, redemptionRate);
    }

    /// @notice Link the boost provider (SneakerWorkshop). Zero address disables boosts.
    function setBoosts(address boosts_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        boosts = ISneakerBoosts(boosts_);
        emit BoostsUpdated(boosts_);
    }

    /// @notice Authorize the workshop to repair sneakers and spend veRUNE.
    function setWorkshop(address workshop_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        workshop = workshop_;
        emit WorkshopUpdated(workshop_);
    }

    // ─────────────────────────── Gameplay ────────────────────────

    /// @notice Activate a sneaker. Must be the owner and respect the 24h cooldown.
    /// @dev Activation starts a 24h earning window, advances the daily streak
    ///      (if within 48h of the previous activation), consumes health, and
    ///      refills the sneaker's energy to full.
    function activate(uint256 tokenId) external whenNotPaused {
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerGame: not owner");
        SneakerState storage state = sneakers[tokenId];
        require(
            state.lastActivationAt == 0 || block.timestamp >= state.lastActivationAt + ACTIVATION_COOLDOWN,
            "SneakerGame: activation cooldown"
        );
        _activate(tokenId, state, true);
        emit Activated(msg.sender, tokenId, state.streak, state.durability);
    }

    /// @notice Surge activation invoked by the workshop when a surge mod is
    ///      burned. Bypasses the cooldown and does not refill energy.
    function activateFromWorkshop(uint256 tokenId, address user) external whenNotPaused {
        require(msg.sender == workshop, "SneakerGame: not workshop");
        SneakerState storage state = sneakers[tokenId];
        _activate(tokenId, state, false);
        emit Activated(user, tokenId, state.streak, state.durability);
    }

    /// @notice Shared activation flow. Applies pending health decay, accrues
    ///      the previous window, advances the streak, and wears health.
    function _activate(uint256 tokenId, SneakerState storage state, bool refillEnergy) internal {
        // First activation initializes health and energy for the fresh sneaker.
        if (state.lastActivationAt == 0) {
            state.durability = _maxDurabilityFor(tokenId);
            state.energy = _maxEnergyFor(tokenId);
            state.lastDecayAt = uint64(block.timestamp);
        }

        _applyDecay(state);
        require(state.durability > 0, "SneakerGame: sneaker worn out");

        _accrue(tokenId, state);

        // Streak: continues when activating within 48h of the last activation.
        if (state.lastActivationAt > 0 && block.timestamp <= state.lastActivationAt + STREAK_BREAK_WINDOW) {
            state.streak += 1;
        } else {
            state.streak = 1;
        }

        if (refillEnergy) {
            state.energy = _maxEnergyFor(tokenId);
        }

        uint16 wear = _wearFor(tokenId);
        state.lastActivationAt = uint64(block.timestamp);
        state.lastAccrualAt = uint64(block.timestamp);
        state.durability = state.durability > wear ? state.durability - wear : 0;
    }

    /// @notice Claim the veRUNE points accumulated by a sneaker.
    function claimPoints(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerGame: not owner");
        SneakerState storage state = sneakers[tokenId];
        _accrue(tokenId, state);
        uint256 amount = state.pendingPoints;
        require(amount > 0, "SneakerGame: nothing to claim");

        state.pendingPoints = 0;
        veRuneBalance[msg.sender] += amount;
        lifetimeEarned[msg.sender] += amount;
        emit PointsClaimed(msg.sender, tokenId, amount);
    }

    /// @notice Fully restore a sneaker's health by spending veRUNE points.
    /// @dev A Lining mod equipped in the workshop discounts the cost. Repair
    ///      is always available — it never costs energy, so a worn-out sneaker
    ///      can always be recovered.
    function repair(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerGame: not owner");
        SneakerState storage state = sneakers[tokenId];
        require(state.lastActivationAt != 0, "SneakerGame: sneaker never activated");
        uint16 maxFor = _maxDurabilityFor(tokenId);
        require(_liveDurability(state) < maxFor, "SneakerGame: durability full");
        uint256 cost = _repairCostFor(tokenId);
        require(veRuneBalance[msg.sender] >= cost, "SneakerGame: insufficient veRUNE");

        veRuneBalance[msg.sender] -= cost;
        state.durability = maxFor;
        state.lastDecayAt = uint64(block.timestamp);
        emit Repaired(msg.sender, tokenId, cost);
    }

    /// @notice Repair invoked by the workshop when a consumable repair kit is
    ///      burned. Ownership is validated by the workshop; no veRUNE is charged.
    function repairFromWorkshop(uint256 tokenId) external whenNotPaused {
        require(msg.sender == workshop, "SneakerGame: not workshop");
        SneakerState storage state = sneakers[tokenId];
        require(state.lastActivationAt != 0, "SneakerGame: sneaker never activated");
        uint16 maxFor = _maxDurabilityFor(tokenId);
        require(_liveDurability(state) < maxFor, "SneakerGame: durability full");
        state.durability = maxFor;
        state.lastDecayAt = uint64(block.timestamp);
        emit Repaired(nft.ownerOf(tokenId), tokenId, 0);
    }

    /// @notice Refill a sneaker's energy to its max capacity. Called by the
    ///      workshop when a stim-pack consumable is burned. Reverts on
    ///      worn-out sneakers so a stim NFT is never wasted on a dead sneaker.
    function refillEnergyFromWorkshop(uint256 tokenId) external whenNotPaused {
        require(msg.sender == workshop, "SneakerGame: not workshop");
        SneakerState storage state = sneakers[tokenId];
        require(state.lastActivationAt != 0, "SneakerGame: sneaker never activated");
        require(_liveDurability(state) > 0, "SneakerGame: sneaker worn out");
        state.energy = _maxEnergyFor(tokenId);
        emit EnergyRefilled(tokenId, state.energy);
    }

    /// @notice Spend energy charges on behalf of the workshop (abilities).
    function spendEnergy(uint256 tokenId, uint16 amount) external whenNotPaused {
        require(msg.sender == workshop, "SneakerGame: not workshop");
        SneakerState storage state = sneakers[tokenId];
        require(state.energy >= amount, "SneakerGame: insufficient energy");
        state.energy -= amount;
        emit EnergySpent(tokenId, amount, msg.sender);
    }

    /// @notice Spend claimed veRUNE on behalf of a user. Callable only by the
    ///      workshop (forge upgrades).
    function spendPoints(address user, uint256 amount) external whenNotPaused {
        require(msg.sender == workshop, "SneakerGame: not workshop");
        require(veRuneBalance[user] >= amount, "SneakerGame: insufficient veRUNE");
        veRuneBalance[user] -= amount;
        emit PointsSpent(user, amount, msg.sender);
    }

    /// @notice Redeem veRUNE points for real REN tokens. Disabled until the
    ///      admin funds the contract and enables redemption.
    function redeem(uint256 points) external whenNotPaused nonReentrant {
        require(redemptionEnabled, "SneakerGame: redemption disabled");
        require(points > 0, "SneakerGame: zero points");
        require(veRuneBalance[msg.sender] >= points, "SneakerGame: insufficient veRUNE");

        uint256 renAmount = points / redemptionRate;
        require(renAmount > 0, "SneakerGame: amount too small");
        require(renToken.balanceOf(address(this)) >= renAmount, "SneakerGame: REN reserve insufficient");

        veRuneBalance[msg.sender] -= points;
        totalRedeemed[msg.sender] += points;
        renToken.safeTransfer(msg.sender, renAmount);
        emit Redeemed(msg.sender, points, renAmount);
    }

    // ─────────────────────────── Views ───────────────────────────

    /// @notice Pending (unclaimed) veRUNE for a sneaker, including passive accrual.
    function pendingPoints(uint256 tokenId) external view returns (uint256) {
        SneakerState memory state = sneakers[tokenId];
        return state.pendingPoints + _pendingAccrual(tokenId, state);
    }

    /// @notice Current veRUNE earn rate for a sneaker, in points per second.
    function earnRatePerSecond(uint256 tokenId) public view returns (uint256) {
        SneakerState memory state = sneakers[tokenId];
        if (_liveDurability(state) == 0) return 0;
        if (state.lastActivationAt == 0) return 0;
        if (block.timestamp >= state.lastActivationAt + ACTIVE_WINDOW && !_autoActive(tokenId)) return 0;
        (, uint8 tier) = _traits(tokenId);
        return _rateFor(tokenId, tier, state.streak);
    }

    /// @notice Daily veRUNE the sneaker mines at 1x streak before mods — its POWER stat.
    function powerOf(uint256 tokenId) external view returns (uint256) {
        (uint8 rarity, uint8 tier) = _traits(tokenId);
        uint256 base = tier < 4 ? tierBasePointsPerDay[tier] : tierBasePointsPerDay[0];
        return (base * _powerBps(tokenId, rarity)) / BASIS_POINTS;
    }

    /// @notice Live health of the sneaker (durability minus pending time decay).
    ///      A sneaker that never entered the game reports full health.
    function healthOf(uint256 tokenId) external view returns (uint16) {
        SneakerState memory state = sneakers[tokenId];
        if (state.lastActivationAt == 0) return _maxDurabilityFor(tokenId);
        return _liveDurability(state);
    }

    /// @notice Energy charges available for workshop abilities.
    function energyOf(uint256 tokenId) external view returns (uint16) {
        SneakerState memory state = sneakers[tokenId];
        if (state.lastActivationAt == 0) return _maxEnergyFor(tokenId);
        return state.energy;
    }

    /// @notice Energy capacity derived from the sneaker's effective rarity.
    function maxEnergyOf(uint256 tokenId) external view returns (uint16) {
        return _maxEnergyFor(tokenId);
    }

    /// @notice Whether the sneaker can be activated now.
    function canActivate(uint256 tokenId) external view returns (bool) {
        SneakerState memory state = sneakers[tokenId];
        if (state.lastActivationAt != 0 && _liveDurability(state) == 0) return false; // worn out
        return state.lastActivationAt == 0 || block.timestamp >= state.lastActivationAt + ACTIVATION_COOLDOWN;
    }

    /// @notice Seconds until the sneaker can be activated again (0 = ready).
    function secondsUntilActivation(uint256 tokenId) external view returns (uint256) {
        SneakerState memory state = sneakers[tokenId];
        if (_liveDurability(state) == 0 || state.lastActivationAt == 0) return 0;
        uint256 readyAt = state.lastActivationAt + ACTIVATION_COOLDOWN;
        return block.timestamp >= readyAt ? 0 : readyAt - block.timestamp;
    }

    /// @notice Streak multiplier in basis points for a given streak count.
    function streakMultiplierBps(uint32 streak) public view returns (uint256) {
        if (streak <= 1) return BASIS_POINTS;
        uint256 bonus = (uint256(streak) - 1) * streakBonusStepBps;
        if (bonus > MAX_STREAK_BONUS_BPS) bonus = MAX_STREAK_BONUS_BPS;
        return BASIS_POINTS + bonus;
    }

    // ─────────────────────────── Internal ────────────────────────

    function _traits(uint256 tokenId) internal view returns (uint8 rarity, uint8 tier) {
        SneakerMint.SneakerTraits memory traits = nft.traitsOf(tokenId);
        return (traits.rarity, traits.tier);
    }

    /// @notice Effective rarity after live wear. A neglected pair keeps
    ///      `conditionFloorBps` of its rarity, never less — wear weakens a
    ///      sneaker without ever making it useless.
    function _effectiveRarity(uint256 tokenId, uint8 rarity) internal view returns (uint256) {
        uint256 effective = uint256(rarity);
        if (address(boosts) != address(0)) {
            effective = (effective * boosts.conditionBps(tokenId)) / BASIS_POINTS;
        }
        return effective > 100 ? 100 : effective;
    }

    /// @notice Power multiplier in basis points from the effective rarity.
    function _powerBps(uint256 tokenId, uint8 rarity) internal view returns (uint256) {
        return POWER_BASE_BPS + _effectiveRarity(tokenId, rarity) * POWER_RARITY_BPS;
    }

    function _rateFor(uint256 tokenId, uint8 tier, uint32 streak) internal view returns (uint256) {
        (uint8 rarity, ) = _traits(tokenId);
        uint256 base = tier < 4 ? tierBasePointsPerDay[tier] : tierBasePointsPerDay[0];
        // Power: the rarity score scales the tier base rate.
        base = (base * _powerBps(tokenId, rarity)) / BASIS_POINTS;
        uint256 bps = streakMultiplierBps(streak);
        if (address(boosts) != address(0)) {
            bps = (bps * (BASIS_POINTS + boosts.earnBonusBps(tokenId))) / BASIS_POINTS;
        }
        // Daily rate scaled to per-second, boosted by streak and mods/forge.
        return (base * bps) / (BASIS_POINTS * 1 days);
    }

    function _autoActive(uint256 tokenId) internal view returns (bool) {
        return address(boosts) != address(0) && boosts.autoActive(tokenId);
    }

    function _wearFor(uint256 tokenId) internal view returns (uint16) {
        uint256 wear = wearPerActivation;
        if (address(boosts) != address(0)) {
            wear = (wear * (BASIS_POINTS - boosts.wearReductionBps(tokenId))) / BASIS_POINTS;
        }
        return uint16(wear);
    }

    function _maxDurabilityFor(uint256 tokenId) internal view returns (uint16) {
        uint256 max_ = maxDurability;
        if (address(boosts) != address(0)) {
            max_ = (max_ * (BASIS_POINTS + boosts.maxDurabilityBonusBps(tokenId))) / BASIS_POINTS;
        }
        return uint16(max_);
    }

    function _repairCostFor(uint256 tokenId) internal view returns (uint256) {
        uint256 cost = repairCostPoints;
        if (address(boosts) != address(0)) {
            cost = (cost * (BASIS_POINTS - boosts.repairDiscountBps(tokenId))) / BASIS_POINTS;
        }
        return cost;
    }

    /// @notice Live health: stored durability minus whole decay periods elapsed.
    function _liveDurability(SneakerState memory state) internal view returns (uint16) {
        if (state.lastDecayAt == 0 || state.durability == 0) return state.durability;
        uint256 periods = (block.timestamp - state.lastDecayAt) / HEALTH_DECAY_PERIOD;
        if (periods >= state.durability) return 0;
        return state.durability - uint16(periods);
    }

    /// @notice Checkpoint the time-based health decay into storage.
    function _applyDecay(SneakerState storage state) internal {
        if (state.lastDecayAt == 0) {
            state.lastDecayAt = uint64(block.timestamp);
            return;
        }
        uint256 periods = (block.timestamp - state.lastDecayAt) / HEALTH_DECAY_PERIOD;
        if (periods == 0) return;
        state.durability = periods >= state.durability ? 0 : state.durability - uint16(periods);
        state.lastDecayAt += uint64(periods * HEALTH_DECAY_PERIOD);
    }

    /// @notice Energy capacity from the effective rarity (forge counts).
    function _maxEnergyFor(uint256 tokenId) internal view returns (uint16) {
        (uint8 rarity, ) = _traits(tokenId);
        return ENERGY_BASE + uint16(_effectiveRarity(tokenId, rarity)) / ENERGY_RARITY_DIV;
    }

    function _pendingAccrual(uint256 tokenId, SneakerState memory state) internal view returns (uint256) {
        if (state.lastAccrualAt == 0 || state.durability == 0) return 0;
        uint256 windowEnd = state.lastActivationAt + ACTIVE_WINDOW;
        uint256 accrualEnd = block.timestamp < windowEnd ? block.timestamp : windowEnd;
        if (_autoActive(tokenId)) accrualEnd = block.timestamp; // Core mod: window never closes
        // Health is lifetime: the sneaker dies at deathAt and stops earning.
        uint256 deathAt = uint256(state.lastDecayAt) + uint256(state.durability) * HEALTH_DECAY_PERIOD;
        if (accrualEnd > deathAt) accrualEnd = deathAt;
        if (accrualEnd <= state.lastAccrualAt) return 0;

        (, uint8 tier) = _traits(tokenId);
        uint256 elapsed = accrualEnd - state.lastAccrualAt;
        return elapsed * _rateFor(tokenId, tier, state.streak);
    }

    function _accrue(uint256 tokenId, SneakerState storage state) internal {
        _applyDecay(state); // checkpoint health decay — math equivalent, cleaner storage
        uint256 accrued = _pendingAccrual(tokenId, state);
        if (accrued > 0) {
            state.pendingPoints += accrued;
            state.lifetimePoints += accrued;
            totalPointsIssued += accrued;
        }
        if (block.timestamp > state.lastAccrualAt) {
            state.lastAccrualAt = uint64(block.timestamp);
        }
    }
}

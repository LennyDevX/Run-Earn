// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SneakerMint} from "./SneakerMint.sol";

/// @title SneakerGame — sneaker wear/activation gamification with virtual veRUNE points.
/// @notice Sneaker NFTs behave like physical sneakers: they "wear out" with use
///      and generate virtual RUNE points (veRUNE) passively while active.
///      The owner must activate the sneaker every 24 hours to keep it earning.
///      Activating within 24h builds a daily streak that multiplies the earn
///      rate. Each activation consumes durability; at zero durability the
///      sneaker stops earning until repaired (repair costs veRUNE points).
/// @dev veRUNE points are VIRTUAL — they are not an ERC-20 token. They are
///      tracked in contract state per owner. A future redemption path lets
///      users exchange veRUNE for real REN tokens at a configurable rate;
///      redemption is disabled until the admin funds the contract with REN
///      and enables it.
contract SneakerGame is Pausable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant ACTIVATION_COOLDOWN = 24 hours; // must wait 24h between activations
    uint256 public constant ACTIVE_WINDOW = 24 hours; // earns passively for 24h after activation
    uint256 public constant STREAK_BREAK_WINDOW = 48 hours; // streak resets if activation gap exceeds this
    uint256 public constant MAX_STREAK_BONUS_BPS = 5_000; // streak bonus caps at +50%

    struct SneakerState {
        uint64 lastActivationAt;
        uint64 lastAccrualAt;
        uint32 streak; // consecutive daily activations
        uint16 durability; // current durability, 0 = worn out
        uint256 pendingPoints; // unclaimed veRUNE for this NFT
        uint256 lifetimePoints; // total veRUNE ever earned by this NFT
    }

    SneakerMint public immutable nft;
    IERC20 public immutable renToken; // REN token used for future redemption

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

    event Activated(address indexed owner, uint256 indexed tokenId, uint32 streak, uint16 durability);
    event PointsClaimed(address indexed owner, uint256 indexed tokenId, uint256 amount);
    event Repaired(address indexed owner, uint256 indexed tokenId, uint256 cost);
    event Redeemed(address indexed owner, uint256 points, uint256 renAmount);
    event ParamsUpdated();
    event RedemptionToggled(bool enabled, uint256 redemptionRate);
    event RENFunded(address indexed funder, uint256 amount);

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

    // ─────────────────────────── Gameplay ────────────────────────

    /// @notice Activate a sneaker. Must be the owner and respect the 24h cooldown.
    /// @dev Activation starts a 24h earning window, advances the daily streak
    ///      (if within 48h of the previous activation), and consumes durability.
    function activate(uint256 tokenId) external whenNotPaused {
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerGame: not owner");
        SneakerState storage state = sneakers[tokenId];

        // First activation initializes durability for the newly minted sneaker.
        if (state.lastActivationAt == 0) {
            state.durability = maxDurability;
        }

        require(
            state.lastActivationAt == 0 || block.timestamp >= state.lastActivationAt + ACTIVATION_COOLDOWN,
            "SneakerGame: activation cooldown"
        );
        require(state.durability > 0, "SneakerGame: sneaker worn out");

        _accrue(tokenId, state);

        // Streak: continues when activating within 48h of the last activation.
        if (state.lastActivationAt > 0 && block.timestamp <= state.lastActivationAt + STREAK_BREAK_WINDOW) {
            state.streak += 1;
        } else {
            state.streak = 1;
        }

        state.lastActivationAt = uint64(block.timestamp);
        state.lastAccrualAt = uint64(block.timestamp);
        state.durability = uint16(state.durability > wearPerActivation ? state.durability - wearPerActivation : 0);

        emit Activated(msg.sender, tokenId, state.streak, state.durability);
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
        emit PointsClaimed(msg.sender, tokenId, amount);
    }

    /// @notice Fully repair a sneaker by spending veRUNE points.
    function repair(uint256 tokenId) external whenNotPaused nonReentrant {
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerGame: not owner");
        SneakerState storage state = sneakers[tokenId];
        require(state.durability < maxDurability, "SneakerGame: durability full");
        require(veRuneBalance[msg.sender] >= repairCostPoints, "SneakerGame: insufficient veRUNE");

        veRuneBalance[msg.sender] -= repairCostPoints;
        state.durability = maxDurability;
        emit Repaired(msg.sender, tokenId, repairCostPoints);
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
        if (state.durability == 0) return 0;
        if (state.lastActivationAt == 0 || block.timestamp >= state.lastActivationAt + ACTIVE_WINDOW) return 0;
        (, uint8 tier) = _traits(tokenId);
        return _rateFor(tier, state.streak);
    }

    /// @notice Whether the sneaker can be activated now.
    function canActivate(uint256 tokenId) external view returns (bool) {
        SneakerState memory state = sneakers[tokenId];
        if (state.lastActivationAt != 0 && state.durability == 0) return false; // worn out
        return state.lastActivationAt == 0 || block.timestamp >= state.lastActivationAt + ACTIVATION_COOLDOWN;
    }

    /// @notice Seconds until the sneaker can be activated again (0 = ready).
    function secondsUntilActivation(uint256 tokenId) external view returns (uint256) {
        SneakerState memory state = sneakers[tokenId];
        if (state.durability == 0 || state.lastActivationAt == 0) return 0;
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

    function _rateFor(uint8 tier, uint32 streak) internal view returns (uint256) {
        uint256 base = tier < 4 ? tierBasePointsPerDay[tier] : tierBasePointsPerDay[0];
        // Daily rate scaled to per-second, boosted by the streak multiplier.
        return (base * streakMultiplierBps(streak)) / (BASIS_POINTS * 1 days);
    }

    function _pendingAccrual(uint256 tokenId, SneakerState memory state) internal view returns (uint256) {
        if (state.lastAccrualAt == 0 || state.durability == 0) return 0;
        uint256 windowEnd = state.lastActivationAt + ACTIVE_WINDOW;
        uint256 accrualEnd = block.timestamp < windowEnd ? block.timestamp : windowEnd;
        if (accrualEnd <= state.lastAccrualAt) return 0;

        (, uint8 tier) = _traits(tokenId);
        uint256 elapsed = accrualEnd - state.lastAccrualAt;
        return elapsed * _rateFor(tier, state.streak);
    }

    function _accrue(uint256 tokenId, SneakerState storage state) internal {
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

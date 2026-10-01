// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IArenaSneaker {
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @dev Mirrors `SneakerMint.SneakerTraits` — three fields, positional.
    function traitsOf(uint256 tokenId) external view returns (uint8 rarity, uint8 tier, bytes32 proofHash);

    /// @notice False for AI collectibles, which never enter the arena.
    function isPlayable(uint256 tokenId) external view returns (bool);
}

interface IArenaWorkshop {
    /// @notice Live wear of a sneaker in basis points (10000 = pristine).
    function conditionBps(uint256 tokenId) external view returns (uint16);

    /// @notice Number of mods currently equipped on the sneaker.
    function equippedCount(uint256 tokenId) external view returns (uint256);
}

interface IArenaStaking {
    function polPositions(address owner)
        external
        view
        returns (uint256 principal, uint256 accruedRewards, uint256 depositedAt, uint256 lastAccrualAt);

    function stakedOwner(uint256 tokenId) external view returns (address);

    function maxTabBoostBps() external view returns (uint256);

    function setTabBoost(address owner, uint256 boostBps, uint64 expiresAt) external;
}

/// @title SneakerTabArena — the daily tap challenge that grants a staking boost.
/// @notice Once per 24h a player opens a session with a **staked** veSneaker and
///      a **non-zero POL principal**, taps through a point ladder, and receives a
///      time-boxed APY boost written into `SneakerStaking`.
///
/// ### Access gate
///
/// Both conditions are required to open a session:
/// 1. `polPositions(caller).principal > 0` — otherwise the boost has no APY to
///    apply to.
/// 2. `staking.stakedOwner(runnerId) == caller` — the runner must be locked in
///    the vault. The 30-day minimum lock only delays *withdrawal*, not play, so
///    a player can stake and open their first session the same day.
///
/// ### Trust model
///
/// Taps happen off-chain, so the completed score arrives as an EIP-191 signature
/// from a `signer` the admin controls. The contract never trusts the score
/// blindly:
///
/// - The **multiplier is recomputed on-chain** from the runner's live rarity,
///   condition, and equipped-mod count. Equipping items mid-session cannot
///   inflate the reward, and a signed multiplier is ignored entirely.
/// - The signed score is clamped to `multiplier * MAX_TAPS_PER_SESSION`, so a
///   leaked signer key cannot mint an unbounded score.
/// - Each session carries a **nonce** that is consumed on completion, so a
///   signature cannot be replayed.
/// - The granted boost is clamped by `SneakerStaking.maxTabBoostBps` (150 bps)
///   and then by the vault's own `maxApyBps` clamp, so the arena can never lift
///   a wallet above the protocol ceiling.
///
/// ### Sustainability
///
/// The boost is added to `requested` **before** the 8.00% clamp, lasts exactly
/// `BOOST_DURATION`, never auto-renews, and is limited to one session per wallet
/// per `SESSION_COOLDOWN`. Rewards still come only from the funded reserve.
contract SneakerTabArena is Pausable, AccessControl, ReentrancyGuard {
    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Level thresholds in points, mirroring `TAB_LEVELS` in the UI.
    uint32[6] public levelPoints = [50, 100, 175, 275, 400, 600];
    /// @notice Boost granted per cleared level, in basis points.
    uint16[6] public levelBoostBps = [50, 70, 90, 110, 130, 150];

    /// @notice Points added per equipped mod.
    uint16 public constant MOD_POWER_EACH = 5;
    /// @notice Hard cap on equipped mods counted toward power.
    uint16 public constant MAX_EQUIPPED_MODS = 7;
    /// @notice Power score ceiling.
    uint16 public constant MAX_POWER_SCORE = 100;

    /// @notice The player has 24h from starting a session to complete it.
    uint64 public constant SESSION_WINDOW = 24 hours;
    /// @notice A completed session grants the boost for 24h.
    uint64 public constant BOOST_DURATION = 24 hours;
    /// @notice Minimum gap between completed sessions (one per day).
    uint64 public constant SESSION_COOLDOWN = 24 hours;
    /// @notice Taps assumed for the score clamp — the ladder maximum at x1.
    uint32 public constant MAX_TAPS_PER_SESSION = 600;

    IArenaSneaker public immutable nft;
    IArenaWorkshop public immutable workshop;
    IArenaStaking public immutable staking;

    /// @notice Off-chain signer that authorises completed sessions.
    address public signer;

    struct Session {
        uint256 runnerId;
        uint32 points;
        uint16 multiplier;
        uint16 boostBps;
        uint64 startedAt;
        uint64 completedAt;
        uint64 expiresAt;
        bool claimed;
    }

    /// @notice Active or last session per wallet.
    mapping(address => Session) public sessions;
    /// @notice Consumed nonce per wallet — replay protection.
    mapping(address => uint256) public sessionNonce;
    /// @notice Timestamp of the last completed session per wallet.
    mapping(address => uint64) public lastCompletedAt;

    event SessionStarted(address indexed player, uint256 indexed runnerId, uint256 nonce, uint64 expiresAt);
    event SessionCompleted(
        address indexed player,
        uint256 indexed runnerId,
        uint32 points,
        uint16 multiplier,
        uint16 boostBps
    );
    event SessionAbandoned(address indexed player, uint256 indexed runnerId);
    event SignerUpdated(address indexed signer);

    constructor(address admin, address nftAddress, address workshopAddress, address stakingAddress, address signer_) {
        require(admin != address(0), "SneakerTabArena: zero admin");
        require(nftAddress != address(0), "SneakerTabArena: zero NFT");
        require(workshopAddress != address(0), "SneakerTabArena: zero workshop");
        require(stakingAddress != address(0), "SneakerTabArena: zero staking");
        require(signer_ != address(0), "SneakerTabArena: zero signer");
        nft = IArenaSneaker(nftAddress);
        workshop = IArenaWorkshop(workshopAddress);
        staking = IArenaStaking(stakingAddress);
        signer = signer_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setSigner(address signer_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(signer_ != address(0), "SneakerTabArena: zero signer");
        signer = signer_;
        emit SignerUpdated(signer_);
    }

    // ─────────────────────────── Gate ────────────────────────────

    /// @notice Whether `player` may open a session with `runnerId`.
    function canStart(address player, uint256 runnerId) public view returns (bool) {
        if (paused()) return false;
        if (nft.ownerOf(runnerId) == address(0)) return false;
        // Defense in depth: staking already rejects collectibles, so this is
        // redundant today — but it keeps the arena honest if the staking gate
        // ever changes.
        if (!nft.isPlayable(runnerId)) return false;
        if (staking.stakedOwner(runnerId) != player) return false;
        (uint256 principal, , , ) = staking.polPositions(player);
        if (principal == 0) return false;
        if (!_cooldownElapsed(player)) return false;
        Session storage session = sessions[player];
        if (session.startedAt != 0 && session.completedAt == 0 && block.timestamp < session.expiresAt) {
            return false;
        }
        return true;
    }

    /// @notice Reasons a session cannot start, for the UI.
    function gateStatus(address player, uint256 runnerId)
        external
        view
        returns (bool polOk, bool lockedOk, bool cooldownOk, uint64 readyAt)
    {
        (uint256 principal, , , ) = staking.polPositions(player);
        polOk = principal > 0;
        lockedOk = runnerId != 0 && staking.stakedOwner(runnerId) == player;
        cooldownOk = _cooldownElapsed(player);
        readyAt = cooldownOk ? 0 : uint64(lastCompletedAt[player]) + SESSION_COOLDOWN;
    }

    // ─────────────────────────── Power ───────────────────────────

    /// @notice Live power score of a runner, recomputed on-chain.
    /// @dev `worn_rarity = rarity * conditionBps / 10000`, then
    ///      `power = min(worn_rarity + equippedCount * 5, 100)`. Because wear
    ///      scales rarity, a neglected pair loses power even with every item
    ///      equipped — servicing it is the only way back up.
    function powerOf(uint256 runnerId) public view returns (uint16) {
        (uint8 rarity, , ) = nft.traitsOf(runnerId);
        uint256 worn = (uint256(rarity) * workshop.conditionBps(runnerId)) / BASIS_POINTS;
        uint256 mods = workshop.equippedCount(runnerId);
        if (mods > MAX_EQUIPPED_MODS) mods = MAX_EQUIPPED_MODS;
        uint256 score = worn + mods * MOD_POWER_EACH;
        return uint16(score > MAX_POWER_SCORE ? MAX_POWER_SCORE : score);
    }

    /// @notice Points a single tap is worth for this runner (1–4).
    function multiplierOf(uint256 runnerId) public view returns (uint16) {
        uint16 score = powerOf(runnerId);
        if (score >= 76) return 4;
        if (score >= 51) return 3;
        if (score >= 26) return 2;
        return 1;
    }

    /// @notice Highest boost this runner can reach, in basis points.
    function boostCeilingBps(uint256 runnerId) public view returns (uint16) {
        uint256 ceiling = 50 + uint256(powerOf(runnerId));
        uint256 maxTab = staking.maxTabBoostBps();
        if (ceiling > maxTab) ceiling = maxTab;
        return uint16(ceiling);
    }

    /// @notice Points required to clear a level (1-based).
    function pointsForLevel(uint8 level) external view returns (uint32) {
        require(level >= 1 && level <= levelPoints.length, "SneakerTabArena: bad level");
        return levelPoints[level - 1];
    }

    // ─────────────────────────── Sessions ────────────────────────

    /// @notice Open today's session. Requires POL staked and the runner locked.
    function startSession(uint256 runnerId) external whenNotPaused nonReentrant {
        require(canStart(msg.sender, runnerId), "SneakerTabArena: gate closed");

        uint256 nonce = ++sessionNonce[msg.sender];
        uint64 expiresAt = uint64(block.timestamp) + SESSION_WINDOW;
        sessions[msg.sender] = Session({
            runnerId: runnerId,
            points: 0,
            multiplier: multiplierOf(runnerId),
            boostBps: 0,
            startedAt: uint64(block.timestamp),
            completedAt: 0,
            expiresAt: expiresAt,
            claimed: false
        });
        emit SessionStarted(msg.sender, runnerId, nonce, expiresAt);
    }

    /// @notice Close the session with a signed score and receive the boost.
    /// @param points Points accumulated off-chain.
    /// @param deadline Signature expiry.
    /// @param signature EIP-191 signature from `signer` over
    ///        `keccak256(abi.encodePacked(address(this), player, nonce, points, deadline))`.
    function completeSession(uint32 points, uint64 deadline, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        Session storage session = sessions[msg.sender];
        require(session.startedAt != 0, "SneakerTabArena: no session");
        require(session.completedAt == 0, "SneakerTabArena: already completed");
        require(block.timestamp <= session.expiresAt, "SneakerTabArena: session expired");
        require(block.timestamp <= deadline, "SneakerTabArena: signature expired");

        bytes32 digest = keccak256(
            abi.encodePacked(address(this), msg.sender, sessionNonce[msg.sender], points, deadline)
        );
        require(_recover(digest, signature) == signer, "SneakerTabArena: bad signature");

        // Recompute the multiplier from live state — never trust the signer for it.
        uint16 multiplier = multiplierOf(session.runnerId);
        uint256 maxPoints = uint256(multiplier) * MAX_TAPS_PER_SESSION;
        uint256 effective = points > maxPoints ? maxPoints : points;

        uint16 boost = _boostForPoints(session.runnerId, effective);

        session.points = uint32(effective);
        session.multiplier = multiplier;
        session.boostBps = boost;
        session.completedAt = uint64(block.timestamp);
        session.claimed = true;
        session.expiresAt = uint64(block.timestamp) + BOOST_DURATION;
        lastCompletedAt[msg.sender] = uint64(block.timestamp);

        if (boost > 0) {
            staking.setTabBoost(msg.sender, boost, uint64(block.timestamp) + BOOST_DURATION);
        }

        emit SessionCompleted(msg.sender, session.runnerId, uint32(effective), multiplier, boost);
    }

    /// @notice Drop an unfinished session so the player can reopen it.
    function abandonSession() external {
        Session storage session = sessions[msg.sender];
        require(session.startedAt != 0, "SneakerTabArena: no session");
        require(session.completedAt == 0, "SneakerTabArena: already completed");
        uint256 runnerId = session.runnerId;
        delete sessions[msg.sender];
        emit SessionAbandoned(msg.sender, runnerId);
    }

    // ─────────────────────────── Internals ───────────────────────

    /// @notice Boost for a score: highest cleared level, capped by the ceiling.
    function _boostForPoints(uint256 runnerId, uint256 points) internal view returns (uint16) {
        uint16 ceiling = boostCeilingBps(runnerId);
        uint16 boost = 0;
        for (uint256 i; i < levelPoints.length; ++i) {
            if (points >= levelPoints[i]) boost = levelBoostBps[i];
        }
        return boost > ceiling ? ceiling : boost;
    }

    /// @notice A player who has never completed a session is always off cooldown.
    /// @dev Guards against reading `lastCompletedAt == 0` as "completed at the
    ///      epoch", which would gate every wallet until timestamp 86400.
    function _cooldownElapsed(address player) internal view returns (bool) {
        uint64 lastAt = lastCompletedAt[player];
        if (lastAt == 0) return true;
        return block.timestamp >= uint256(lastAt) + SESSION_COOLDOWN;
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {        require(signature.length == 65, "SneakerTabArena: bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "SneakerTabArena: bad signature v");
        // Reject malleable signatures.
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "SneakerTabArena: malleable signature"
        );
        address recovered = ecrecover(
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)),
            v,
            r,
            s
        );
        require(recovered != address(0), "SneakerTabArena: invalid signature");
        return recovered;
    }
}

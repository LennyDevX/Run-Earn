// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @title SneakerStaking — POL staking with sneaker NFT APY boosts.
/// @notice Users deposit native POL and may lock SneakerMint NFTs to increase
///      their APY. The boost is rarity-based: Common +0.5%, Rare +0.8%,
///      Epic +1.5%, Mythic +1.8%. POL rewards are paid only from the explicitly
///      funded reward reserve; deposited principal is always accounted for
///      separately. Locking an NFT is a manual action — the user must call
///      stake(tokenId) to transfer the NFT into the vault and activate the boost.
/// @dev The existing RUNE NFT reward path remains available for compatibility.
///      Production deployment requires a reviewed POL reserve, multisig admin,
///      and an economic/security review. This contract does not promise returns.
contract SneakerStaking is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 31_536_000;

    struct Position {
        uint256 lockedCount;
        uint256 weightBps;
        uint256 tierBonusBps;
        uint256 accruedRewards;
        uint256 lastAccrualAt;
    }

    struct POLPosition {
        uint256 principal;
        uint256 accruedRewards;
        uint256 depositedAt;
        uint256 lastAccrualAt;
    }

    struct StakeReceipt {
        uint256 tokenId;
        uint8 rarity;
        uint8 tier;
        uint64 depositedAt;
        bool active;
    }

    SneakerMint public immutable nft;
    IERC20 public immutable rewardToken;

    /// @notice Optional boost provider (SneakerWorkshop). Boost-slot mods
    ///      equipped on staked sneakers add APY at accrual time.
    ISneakerBoosts public boosts;

    // ─── Reward parameters (low, stable, sustainable) ───────────
    uint256 public rewardTokensPerNftYear; // RUNE per NFT-year at 1x weight
    uint256 public baseApyBps; // 280 = 2.8% base POL APY (sustainable rate)
    uint256 public perNftBonusBps; // flat per-NFT bonus (0 by default — boost is rarity-based)
    uint256 public maxApyBps; // 800 = 8% hard cap

    /// @notice Role allowed to grant the time-boxed daily tab-challenge boost.
    bytes32 public constant TAB_ARENA_ROLE = keccak256("TAB_ARENA_ROLE");

    /// @notice owner => boost granted by a completed tab session, in basis points.
    mapping(address => uint256) public tabBoostBps;
    /// @notice owner => timestamp when the tab boost lapses.
    mapping(address => uint64) public tabBoostExpiresAt;

    /// @notice Ceiling the tab arena may grant per wallet (150 bps = 1.50%).
    uint256 public maxTabBoostBps = 150;
    uint256 public minLockSeconds; // 2_592_000 = 30 days minimum lock
    uint64[4] public tierBonusBps; // per-rarity-tier bonus: [50, 80, 150, 180] bps

    uint256 public totalLocked;
    uint256 public totalPOLPrincipal;

    mapping(address owner => Position position) public positions;
    mapping(address owner => POLPosition position) public polPositions;
    mapping(address owner => mapping(uint256 tokenId => StakeReceipt receipt)) public receipts;
    mapping(uint256 tokenId => address owner) public stakedOwner;
    mapping(address owner => uint256[] tokenIds) private _stakedTokenIds;
    mapping(uint256 tokenId => uint256 index) private _stakedTokenIndex;

    event Staked(address indexed owner, uint256 indexed tokenId, uint8 rarity, uint8 tier);
    event Unstaked(address indexed owner, uint256 indexed tokenId);
    event RewardsClaimed(address indexed owner, uint256 amount);
    event POLDeposited(address indexed owner, uint256 amount, uint256 newPrincipal);
    event POLWithdrawn(address indexed owner, uint256 amount, uint256 remainingPrincipal);
    event POLRewardsClaimed(address indexed owner, uint256 amount);
    event POLRewardsFunded(address indexed funder, uint256 amount);
    event POLRewardsRecovered(address indexed to, uint256 amount);
    event RewardParamsUpdated();
    event NFTRecovered(address indexed to, uint256 indexed tokenId);
    event ERC20Recovered(address indexed token, address indexed to, uint256 amount);
    event BoostsUpdated(address indexed boosts);
    event TabBoostSet(address indexed owner, uint256 boostBps, uint64 expiresAt);
    event MaxTabBoostUpdated(uint256 maxTabBoostBps);

    constructor(
        address admin,
        address nftAddress,
        address rewardTokenAddress,
        uint256 rewardTokensPerNftYear_,
        uint256 baseApyBps_,
        uint256 perNftBonusBps_,
        uint256 maxApyBps_,
        uint64[4] memory tierBonusBps_,
        uint256 minLockSeconds_
    ) {
        require(admin != address(0), "SneakerStaking: zero admin");
        require(nftAddress != address(0), "SneakerStaking: zero NFT");
        require(rewardTokenAddress != address(0), "SneakerStaking: zero reward token");
        require(baseApyBps_ <= maxApyBps_, "SneakerStaking: invalid APY bounds");
        require(rewardTokensPerNftYear_ > 0, "SneakerStaking: invalid reward rate");
        require(maxApyBps_ <= BASIS_POINTS, "SneakerStaking: max APY too high");

        nft = SneakerMint(nftAddress);
        rewardToken = IERC20(rewardTokenAddress);
        rewardTokensPerNftYear = rewardTokensPerNftYear_;
        baseApyBps = baseApyBps_;
        perNftBonusBps = perNftBonusBps_;
        maxApyBps = maxApyBps_;
        tierBonusBps = tierBonusBps_;
        minLockSeconds = minLockSeconds_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Link the boost provider (SneakerWorkshop). Zero address disables boosts.
    function setBoosts(address boosts_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        boosts = ISneakerBoosts(boosts_);
        emit BoostsUpdated(boosts_);
    }

    /// @notice Grant a time-boxed APY boost after a completed tab session.
    /// @dev Callable only by the tab arena. The boost is added to the requested
    ///      APY **before** the `maxApyBps` clamp, so it can never push a wallet
    ///      above the hard cap, and it lapses on its own — it never renews.
    ///      `boostBps` is capped by `maxTabBoostBps` so a compromised or buggy
    ///      arena cannot mint an unbounded liability.
    function setTabBoost(address owner, uint256 boostBps, uint64 expiresAt)
        external
        onlyRole(TAB_ARENA_ROLE)
    {
        require(owner != address(0), "SneakerStaking: zero owner");
        require(boostBps <= maxTabBoostBps, "SneakerStaking: tab boost too high");
        require(expiresAt > block.timestamp, "SneakerStaking: boost already expired");
        tabBoostBps[owner] = boostBps;
        tabBoostExpiresAt[owner] = expiresAt;
        emit TabBoostSet(owner, boostBps, expiresAt);
    }

    /// @notice Current tab boost, or zero once it has lapsed.
    function activeTabBoostBps(address owner) external view returns (uint256) {
        return _tabBoostBps(owner);
    }

    /// @notice Update the ceiling the arena may grant (admin).
    function setMaxTabBoostBps(uint256 maxTabBoostBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(maxTabBoostBps_ <= maxApyBps, "SneakerStaking: tab cap above APY cap");
        maxTabBoostBps = maxTabBoostBps_;
        emit MaxTabBoostUpdated(maxTabBoostBps_);
    }

    /// @notice Add POL to the reward reserve. Principal deposits are separate.
    function fundPOLRewards() external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        require(msg.value > 0, "SneakerStaking: zero funding");
        emit POLRewardsFunded(msg.sender, msg.value);
    }

    /// @notice Recover only POL that is not reserved for user principal/rewards.
    function recoverPOLRewards(address payable to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        require(to != address(0), "SneakerStaking: zero recipient");
        uint256 available = address(this).balance - totalPOLPrincipal;
        require(amount <= available, "SneakerStaking: reserve insufficient");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "SneakerStaking: POL transfer failed");
        emit POLRewardsRecovered(to, amount);
    }

    /// @notice Update reward parameters. Admin only.
    function updateRewardParams(
        uint256 rewardTokensPerNftYear_,
        uint256 baseApyBps_,
        uint256 perNftBonusBps_,
        uint256 maxApyBps_,
        uint64[4] calldata tierBonusBps_,
        uint256 minLockSeconds_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(baseApyBps_ <= maxApyBps_, "SneakerStaking: invalid APY bounds");
        require(maxApyBps_ <= BASIS_POINTS, "SneakerStaking: max APY too high");
        rewardTokensPerNftYear = rewardTokensPerNftYear_;
        baseApyBps = baseApyBps_;
        perNftBonusBps = perNftBonusBps_;
        maxApyBps = maxApyBps_;
        tierBonusBps = tierBonusBps_;
        minLockSeconds = minLockSeconds_;
        emit RewardParamsUpdated();
    }

    /// @notice Emergency: return a stuck NFT to its staked owner.
    function recoverNFT(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        address owner = stakedOwner[tokenId];
        require(owner != address(0), "SneakerStaking: not staked");
        _accruePOL(polPositions[owner], owner);
        _removeStake(owner, tokenId);
        nft.safeTransferFrom(address(this), owner, tokenId);
        emit NFTRecovered(owner, tokenId);
    }

    /// @notice Emergency: recover stuck ERC-20 tokens (not RUNE rewards).
    function recoverERC20(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "SneakerStaking: zero recipient");
        IERC20(token).safeTransfer(to, amount);
        emit ERC20Recovered(token, to, amount);
    }

    // ─────────────────────────── POL staking ─────────────────────

    /// @notice Deposit native POL as staking principal.
    /// @dev NFT locks increase the APY used by this position. A new deposit
    ///      restarts the position's minimum lock period after accruing rewards.
    function depositPOL() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "SneakerStaking: zero deposit");

        Position storage position = positions[msg.sender];
        POLPosition storage polPosition = polPositions[msg.sender];
        _accrue(position);
        _accruePOL(polPosition, msg.sender);

        polPosition.principal += msg.value;
        polPosition.depositedAt = block.timestamp;
        polPosition.lastAccrualAt = block.timestamp;
        totalPOLPrincipal += msg.value;

        emit POLDeposited(msg.sender, msg.value, polPosition.principal);
    }

    /// @notice Withdraw POL principal after the minimum lock period.
    /// @dev Withdrawals remain available while paused for fund safety.
    function withdrawPOL(uint256 amount) external nonReentrant {
        require(amount > 0, "SneakerStaking: zero withdrawal");
        POLPosition storage polPosition = polPositions[msg.sender];
        require(polPosition.principal >= amount, "SneakerStaking: insufficient principal");
        require(
            block.timestamp - polPosition.depositedAt >= minLockSeconds,
            "SneakerStaking: lock period active"
        );

        _accruePOL(polPosition, msg.sender);
        polPosition.principal -= amount;
        totalPOLPrincipal -= amount;
        if (polPosition.principal == 0) {
            polPosition.depositedAt = 0;
            polPosition.lastAccrualAt = block.timestamp;
        }

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "SneakerStaking: POL transfer failed");
        emit POLWithdrawn(msg.sender, amount, polPosition.principal);
    }

    /// @notice Claim accrued POL rewards from the funded reward reserve.
    function claimPOLRewards() external whenNotPaused nonReentrant {
        POLPosition storage polPosition = polPositions[msg.sender];
        _accruePOL(polPosition, msg.sender);
        uint256 amount = polPosition.accruedRewards;
        require(amount > 0, "SneakerStaking: nothing to claim");

        uint256 available = address(this).balance - totalPOLPrincipal;
        require(available >= amount, "SneakerStaking: POL reserve insufficient");

        polPosition.accruedRewards = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "SneakerStaking: POL transfer failed");
        emit POLRewardsClaimed(msg.sender, amount);
    }

    // ─────────────────────────── NFT staking ─────────────────────

    /// @notice Stake a SneakerMint NFT into the vault to activate its APY boost.
    /// @dev This is a manual action — the user must call this function to lock
    ///      their NFT. The NFT is transferred from the caller to the vault.
    ///      Rarity and tier are read from the NFT contract — the client cannot
    ///      supply fake values. The APY boost is based on the NFT's tier:
    ///      Common (tier 0) = +0.5%, Rare (tier 1) = +0.8%,
    ///      Epic (tier 2) = +1.5%, Mythic (tier 3) = +1.8%.
    function stake(uint256 tokenId) external whenNotPaused nonReentrant {
        require(!receipts[msg.sender][tokenId].active, "SneakerStaking: already staked");
        require(nft.ownerOf(tokenId) == msg.sender, "SneakerStaking: not owner");
        // Only official veSneakers may be locked. AI collectibles are digital
        // art and never touch the yield engine.
        require(nft.isPlayable(tokenId), "SneakerStaking: not a veSneaker");

        SneakerMint.SneakerTraits memory traits = nft.traitsOf(tokenId);
        require(traits.tier < tierBonusBps.length, "SneakerStaking: invalid tier");

        Position storage position = positions[msg.sender];
        _accrue(position);
        _accruePOL(polPositions[msg.sender], msg.sender);

        uint64 tierBonus = tierBonusBps[traits.tier];
        position.lockedCount += 1;
        position.weightBps += BASIS_POINTS + tierBonus;
        position.tierBonusBps += tierBonus;

        receipts[msg.sender][tokenId] = StakeReceipt({
            tokenId: tokenId,
            rarity: traits.rarity,
            tier: traits.tier,
            depositedAt: uint64(block.timestamp),
            active: true
        });
        stakedOwner[tokenId] = msg.sender;
        _stakedTokenIndex[tokenId] = _stakedTokenIds[msg.sender].length;
        _stakedTokenIds[msg.sender].push(tokenId);
        totalLocked += 1;

        nft.safeTransferFrom(msg.sender, address(this), tokenId);
        emit Staked(msg.sender, tokenId, traits.rarity, traits.tier);
    }

    /// @notice Claim legacy RUNE rewards without unstaking NFTs.
    function claimRewards() external whenNotPaused nonReentrant {
        Position storage position = positions[msg.sender];
        require(position.lockedCount > 0, "SneakerStaking: nothing staked");
        _accrue(position);
        uint256 amount = position.accruedRewards;
        require(amount > 0, "SneakerStaking: nothing to claim");

        uint256 vaultBalance = rewardToken.balanceOf(address(this));
        require(vaultBalance >= amount, "SneakerStaking: vault insufficient");

        position.accruedRewards = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit RewardsClaimed(msg.sender, amount);
    }

    /// @notice Unstake a SneakerMint NFT after the lock period.
    /// @dev Unstake is always callable even when paused — fund safety first.
    function unstake(uint256 tokenId) external nonReentrant {
        StakeReceipt storage receipt = receipts[msg.sender][tokenId];
        require(receipt.active, "SneakerStaking: invalid receipt");
        require(
            block.timestamp - receipt.depositedAt >= minLockSeconds,
            "SneakerStaking: lock period active"
        );

        Position storage position = positions[msg.sender];
        _accrue(position);
        _accruePOL(polPositions[msg.sender], msg.sender);
        _removeStake(msg.sender, tokenId);

        nft.safeTransferFrom(address(this), msg.sender, tokenId);
        emit Unstaked(msg.sender, tokenId);
    }

    // ─────────────────────────── Views ───────────────────────────

    function effectiveApyBps(address owner) external view returns (uint256) {
        return _effectiveApyBps(owner);
    }

    function pendingRewards(address owner) external view returns (uint256) {
        Position storage position = positions[owner];
        if (position.lockedCount == 0) return position.accruedRewards;
        uint256 elapsed = block.timestamp - position.lastAccrualAt;
        uint256 incremental = (rewardTokensPerNftYear * position.weightBps * elapsed) /
            (BASIS_POINTS * SECONDS_PER_YEAR);
        return position.accruedRewards + incremental;
    }

    function stakedTokenIds(address owner) external view returns (uint256[] memory) {
        return _stakedTokenIds[owner];
    }

    function pendingPOLRewards(address owner) external view returns (uint256) {
        POLPosition storage polPosition = polPositions[owner];
        if (polPosition.principal == 0 || polPosition.lastAccrualAt == 0) {
            return polPosition.accruedRewards;
        }
        uint256 elapsed = block.timestamp - polPosition.lastAccrualAt;
        uint256 incremental =
            (polPosition.principal * _effectiveApyBps(owner) * elapsed) /
            (BASIS_POINTS * SECONDS_PER_YEAR);
        return polPosition.accruedRewards + incremental;
    }

    function availablePOLRewards() external view returns (uint256) {
        return address(this).balance - totalPOLPrincipal;
    }

    /// @notice Returns the full tier bonus array for UI display.
    function tierBonuses() external view returns (uint64[4] memory) {
        return tierBonusBps;
    }

    // ─────────────────────────── Internal ────────────────────────

    function _removeStake(address owner, uint256 tokenId) internal {
        StakeReceipt storage receipt = receipts[owner][tokenId];
        Position storage position = positions[owner];

        uint64 tierBonus = tierBonusBps[receipt.tier];
        receipt.active = false;

        uint256[] storage tokenIds = _stakedTokenIds[owner];
        uint256 index = _stakedTokenIndex[tokenId];
        uint256 lastTokenId = tokenIds[tokenIds.length - 1];
        tokenIds[index] = lastTokenId;
        _stakedTokenIndex[lastTokenId] = index;
        tokenIds.pop();
        delete _stakedTokenIndex[tokenId];
        delete stakedOwner[tokenId];
        totalLocked -= 1;
        position.lockedCount -= 1;
        position.weightBps -= BASIS_POINTS + tierBonus;
        position.tierBonusBps -= tierBonus;
    }

    function _accrue(Position storage position) internal {
        if (position.lastAccrualAt == 0) {
            position.lastAccrualAt = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - position.lastAccrualAt;
        if (elapsed == 0 || position.weightBps == 0) {
            position.lastAccrualAt = block.timestamp;
            return;
        }
        position.accruedRewards +=
            (rewardTokensPerNftYear * position.weightBps * elapsed) /
            (BASIS_POINTS * SECONDS_PER_YEAR);
        position.lastAccrualAt = block.timestamp;
    }

    function _accruePOL(POLPosition storage polPosition, address owner) internal {
        if (polPosition.lastAccrualAt == 0) {
            polPosition.lastAccrualAt = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - polPosition.lastAccrualAt;
        if (elapsed == 0 || polPosition.principal == 0) {
            polPosition.lastAccrualAt = block.timestamp;
            return;
        }
        polPosition.accruedRewards +=
            (polPosition.principal * _effectiveApyBps(owner) * elapsed) /
            (BASIS_POINTS * SECONDS_PER_YEAR);
        polPosition.lastAccrualAt = block.timestamp;
    }

    function _effectiveApyBps(address owner) internal view returns (uint256) {
        Position storage position = positions[owner];
        uint256 requested = baseApyBps +
            position.lockedCount * perNftBonusBps +
            position.tierBonusBps +
            _modBoostBps(owner) +
            _tabBoostBps(owner);
        return requested > maxApyBps ? maxApyBps : requested;
    }

    /// @notice Sum of Boost-slot mod bonuses across the owner's staked sneakers.
    function _modBoostBps(address owner) internal view returns (uint256 total) {
        if (address(boosts) == address(0)) return 0;
        uint256[] storage tokenIds = _stakedTokenIds[owner];
        for (uint256 i = 0; i < tokenIds.length; i++) {
            total += boosts.stakingBoostBps(tokenIds[i]);
        }
    }

    /// @notice Active daily tab-challenge boost, or zero once it lapses.
    /// @dev Added to `requested` **before** the `maxApyBps` clamp in
    ///      `_effectiveApyBps`, so it can never lift a wallet past the hard cap.
    ///      The arena writes it for exactly `tabBoostSeconds` after a completed
    ///      session, and it never auto-renews.
    function _tabBoostBps(address owner) internal view returns (uint256) {
        if (block.timestamp >= tabBoostExpiresAt[owner]) return 0;
        return tabBoostBps[owner];
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        revert("SneakerStaking: use fundPOLRewards");
    }
}

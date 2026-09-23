// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @dev Minimal views PlayerProgress reads from the rest of the protocol.
///      Counters are maintained by each contract at the point of action, so XP
///      is deterministic on-chain and never depends on event indexing.
interface ISneakerGameProgress {
    /// @notice Lifetime veRUNE a wallet has claimed across all its sneakers.
    function lifetimeEarned(address owner) external view returns (uint256);
}

interface ISneakerMarketplaceProgress {
    /// @notice Completed marketplace trades (buys, sales, accepted offers, settled auctions).
    function tradesCount(address user) external view returns (uint256);
}

interface ISneakerWorkshopProgress {
    /// @notice Workshop actions performed (equips, unequips, forges, ability uses).
    function actionsCount(address user) external view returns (uint256);
}

interface ISneakerStakingProgress {
    /// @notice POL staking position; only the live principal feeds XP.
    function polPositions(address owner)
        external
        view
        returns (uint256 principal, uint256 accruedRewards, uint256 depositedAt, uint256 lastAccrualAt);
}

/// @title PlayerProgress — on-chain player identity, XP, and levels.
/// @notice Aggregates verifiable activity across the RUN&EARN protocol into a
///      deterministic XP score and a 10-tier player level. Levels gate skill
///      NFTs: `SneakerMods` achievements and `ModStore` designs require
///      `levelOf(user)` to reach their configured level.
/// @dev Also hosts the public half of the hybrid profile: an editable username
///      and an optional NFT avatar pointer (ownership-verified). Uploaded
///      avatar images stay client-side by design — only verifiable references
///      go on-chain.
///      XP is fully derived from live state — balances can go down when NFTs
///      are sold or POL is withdrawn, so a level is a current standing, not a
///      lifetime award. Skill eligibility checks should read `levelOf` at the
///      moment of claim/purchase.
contract PlayerProgress is AccessControl {
    uint256 public constant MAX_LEVEL = 10;
    uint256 public constant USERNAME_MIN = 3;
    uint256 public constant USERNAME_MAX = 20;

    /// XP weights per signal.
    uint256 public constant XP_PER_SNEAKER = 100; // per owned veSneaker
    uint256 public constant XP_PER_MOD = 40; // per owned mod/badge
    uint256 public constant XP_PER_TRADE = 60; // per completed marketplace trade (buy or sell side)
    uint256 public constant XP_PER_WORKSHOP_ACTION = 30; // per equip / unequip / forge / ability use
    uint256 public constant XP_PER_POL_STAKED = 20; // per 1 POL of live staking principal
    uint256 public constant XP_PER_1000_VERUNE = 10; // per 1,000 veRUNE of lifetime claimed points
    uint256 public constant VERUNE_STEP = 1_000 ether; // veRUNE is 18-decimal

    IERC721 public immutable nft;
    IERC721 public immutable mods;
    ISneakerGameProgress public immutable game;
    ISneakerMarketplaceProgress public immutable marketplace;
    ISneakerWorkshopProgress public immutable workshop;
    ISneakerStakingProgress public immutable staking;

    /// @notice XP required to reach level i+1 (index 0 = level 1, always 0).
    ///      Non-decreasing; admin-adjustable for economy tuning.
    uint256[] public levelThresholds;

    /// @notice Public profile: customizable username (3–20 bytes).
    mapping(address user => string username) public usernames;
    /// @notice NFT avatar pointer — a token the user owns. (0,0) = none.
    mapping(address user => address collection) public avatarCollection;
    mapping(address user => uint256 tokenId) public avatarTokenId;

    event UsernameUpdated(address indexed user, string username);
    event AvatarUpdated(address indexed user, address indexed collection, uint256 indexed tokenId);
    event LevelThresholdsUpdated(uint256[] thresholds);

    constructor(
        address admin,
        address nftAddress,
        address modsAddress,
        address gameAddress,
        address marketplaceAddress,
        address workshopAddress,
        address stakingAddress,
        uint256[] memory levelThresholds_
    ) {
        require(admin != address(0), "PlayerProgress: zero admin");
        require(nftAddress != address(0), "PlayerProgress: zero NFT");
        require(modsAddress != address(0), "PlayerProgress: zero mods");
        require(gameAddress != address(0), "PlayerProgress: zero game");
        require(marketplaceAddress != address(0), "PlayerProgress: zero marketplace");
        require(workshopAddress != address(0), "PlayerProgress: zero workshop");
        require(stakingAddress != address(0), "PlayerProgress: zero staking");
        _setThresholds(levelThresholds_);

        nft = IERC721(nftAddress);
        mods = IERC721(modsAddress);
        game = ISneakerGameProgress(gameAddress);
        marketplace = ISneakerMarketplaceProgress(marketplaceAddress);
        workshop = ISneakerWorkshopProgress(workshopAddress);
        staking = ISneakerStakingProgress(stakingAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    /// @notice Replace the level threshold table. Must stay non-decreasing and
    ///      start at 0 so level 1 is free.
    function setLevelThresholds(uint256[] calldata thresholds_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setThresholds(thresholds_);
        emit LevelThresholdsUpdated(thresholds_);
    }

    // ─────────────────────────── Profile ─────────────────────────

    /// @notice Set (or change) the caller's public username. 3–20 bytes; the
    ///      frontend additionally restricts characters.
    function setUsername(string calldata username) external {
        uint256 length = bytes(username).length;
        require(length >= USERNAME_MIN && length <= USERNAME_MAX, "PlayerProgress: bad username length");
        usernames[msg.sender] = username;
        emit UsernameUpdated(msg.sender, username);
    }

    /// @notice Point the profile avatar at an NFT the caller owns. Pass the
    ///      zero address to clear the avatar.
    function setNftAvatar(address collection, uint256 tokenId) external {
        if (collection == address(0)) {
            delete avatarCollection[msg.sender];
            delete avatarTokenId[msg.sender];
        } else {
            require(IERC721(collection).ownerOf(tokenId) == msg.sender, "PlayerProgress: not token owner");
            avatarCollection[msg.sender] = collection;
            avatarTokenId[msg.sender] = tokenId;
        }
        emit AvatarUpdated(msg.sender, collection, tokenId);
    }

    // ─────────────────────────── XP / levels ─────────────────────

    /// @notice Total XP derived from live protocol state.
    function xpOf(address user) public view returns (uint256) {
        (
            uint256 sneakerXp,
            uint256 modXp,
            uint256 veRuneXp,
            uint256 tradeXp,
            uint256 workshopXp,
            uint256 stakingXp
        ) = xpBreakdown(user);
        return sneakerXp + modXp + veRuneXp + tradeXp + workshopXp + stakingXp;
    }

    /// @notice Per-signal XP components — powers the profile breakdown UI.
    function xpBreakdown(address user)
        public
        view
        returns (
            uint256 sneakerXp,
            uint256 modXp,
            uint256 veRuneXp,
            uint256 tradeXp,
            uint256 workshopXp,
            uint256 stakingXp
        )
    {
        sneakerXp = nft.balanceOf(user) * XP_PER_SNEAKER;
        modXp = mods.balanceOf(user) * XP_PER_MOD;
        veRuneXp = game.lifetimeEarned(user) / (VERUNE_STEP / XP_PER_1000_VERUNE);
        tradeXp = marketplace.tradesCount(user) * XP_PER_TRADE;
        workshopXp = workshop.actionsCount(user) * XP_PER_WORKSHOP_ACTION;
        (uint256 principal, , , ) = staking.polPositions(user);
        stakingXp = (principal * XP_PER_POL_STAKED) / 1 ether;
    }

    /// @notice Current level (1..MAX_LEVEL) for a wallet.
    function levelOf(address user) public view returns (uint8) {
        uint256 xp = xpOf(user);
        uint256 level = 1;
        uint256 count = levelThresholds.length;
        for (uint256 i = 1; i < count; i++) {
            if (xp >= levelThresholds[i]) level = i + 1;
        }
        return uint8(level > MAX_LEVEL ? MAX_LEVEL : level);
    }

    /// @notice XP progress snapshot for the profile UI: current level, XP
    ///      earned inside the level, and XP required to finish it
    ///      (nextLevelXp == 0 at the cap).
    function progressOf(address user)
        external
        view
        returns (uint256 xp, uint8 level, uint256 currentLevelXp, uint256 nextLevelXp)
    {
        xp = xpOf(user);
        level = levelOf(user);
        currentLevelXp = levelThresholds[level - 1];
        nextLevelXp = level < levelThresholds.length ? levelThresholds[level] : 0;
    }

    /// @notice The full threshold table.
    function thresholds() external view returns (uint256[] memory) {
        return levelThresholds;
    }

    function _setThresholds(uint256[] memory thresholds_) internal {
        require(thresholds_.length >= 2, "PlayerProgress: need >= 2 levels");
        require(thresholds_[0] == 0, "PlayerProgress: level 1 must be free");
        for (uint256 i = 1; i < thresholds_.length; i++) {
            require(thresholds_[i] > thresholds_[i - 1], "PlayerProgress: thresholds must increase");
        }
        delete levelThresholds;
        for (uint256 i = 0; i < thresholds_.length; i++) {
            levelThresholds.push(thresholds_[i]);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {SneakerGame} from "./SneakerGame.sol";
import {SneakerStaking} from "./SneakerStaking.sol";

/// @dev Minimal view of PlayerProgress needed for level-gated achievements.
interface IPlayerProgressView {
    function levelOf(address user) external view returns (uint8);
}

/// @title SneakerMods — upgrade and badge NFTs for RUN&EARN veSneakers.
/// @notice Mods are ERC-721 tokens that improve a veSneaker when equipped in
///      SneakerWorkshop. Each mod occupies one of seven slots:
///        0 Sole   — reduces durability wear per activation
///        1 Upper  — increases the veRUNE earn rate
///        2 Lining — discounts the veRUNE repair cost
///        3 Skin   — raises the appraiser valuation and restyles the sneaker
///        4 Core   — keeps the sneaker earning without manual activation
///        5 Boost  — adds APY while the sneaker is locked in staking
///        6 Skill  — level-gated skill NFT; its effectBps feeds the earn rate
///      Consumable mods (repair kits, skill items) are burned on use instead
///      of equipped.
/// @dev Mods enter circulation through three paths:
///        1. Achievement claims: anyone can claim a badge mod by meeting an
///           on-chain verifiable condition (streak, lifetime veRUNE, collection
///           size, staked POL, or player level via PlayerProgress). One claim
///           per wallet per achievement.
///        2. Authorized mints: the store or backend mints premium mods through
///           MINTER_ROLE.
///        3. Secondary market: mods are tradable, rentable, and auctionable
///           like any other NFT in the ecosystem.
contract SneakerMods is ERC721, ERC721Enumerable, ERC721URIStorage, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 public constant SLOT_SOLE = 0;
    uint8 public constant SLOT_UPPER = 1;
    uint8 public constant SLOT_LINING = 2;
    uint8 public constant SLOT_SKIN = 3;
    uint8 public constant SLOT_CORE = 4;
    uint8 public constant SLOT_BOOST = 5;
    /// @notice Skill NFTs — level-gated mods whose effectBps feeds the earn rate.
    uint8 public constant SLOT_SKILL = 6;
    uint8 public constant SLOT_COUNT = 7;

    /// @notice Sentinel for ModTraits.aux on mods that carry no auxiliary value.
    uint8 public constant NO_AUX = 255;

    /// @notice Effect magnitudes are capped at 90% for percentage-based slots.
    uint16 public constant MAX_EFFECT_BPS = 9_000;

    enum ReqKind {
        SneakerStreak, // owned sneaker daily streak >= threshold
        SneakerLifetimePoints, // owned sneaker lifetime veRUNE >= threshold
        NftBalance, // owned sneaker count >= threshold
        StakedPol, // POL principal staked >= threshold (wei)
        PlayerLevel // PlayerProgress.levelOf(user) >= threshold — skill NFTs
    }

    struct ModTraits {
        uint8 slot; // SLOT_* — determines which slot the mod fills
        uint8 rarity; // 0..100 score, cosmetic/display
        uint8 tier; // 0..3 (Common, Rare, Epic, Mythic)
        uint16 effectBps; // effect magnitude in basis points (slot-dependent)
        uint8 aux; // slot-dependent auxiliary value (skin: design index)
        bool consumable; // true = burned on use (repair kits), never equipped
        bytes32 proofHash; // uniqueness proof
    }

    struct Achievement {
        ReqKind kind;
        uint256 threshold;
        uint8 slot;
        uint8 rarity;
        uint8 tier;
        uint16 effectBps;
        uint8 aux;
        bool consumable;
        string uri;
        bool active;
    }

    SneakerMint public immutable nft;
    SneakerGame public immutable game;
    SneakerStaking public immutable staking;

    /// @notice Workshop contract authorized to burn consumable mods.
    address public workshop;

    /// @notice PlayerProgress contract consulted by PlayerLevel achievements.
    ///      Zero address disables level-gated claims (they always fail).
    address public progress;

    uint256 private _nextTokenId;
    Achievement[] private _achievements;

    mapping(uint256 tokenId => ModTraits traits) private _traits;
    mapping(bytes32 proofHash => bool used) public usedProofs;
    mapping(uint256 achievementId => mapping(address user => bool claimed)) public achievementClaimed;

    event ModMinted(address indexed owner, uint256 indexed tokenId, uint8 slot, uint8 tier, uint16 effectBps, bool consumable);
    event AchievementAdded(uint256 indexed achievementId, ReqKind kind, uint256 threshold, uint8 slot);
    event AchievementToggled(uint256 indexed achievementId, bool active);
    event AchievementClaimed(uint256 indexed achievementId, address indexed user, uint256 indexed tokenId);
    event ModBurned(uint256 indexed tokenId, address indexed caller);
    event WorkshopUpdated(address indexed workshop);
    event ProgressUpdated(address indexed progress);

    constructor(
        string memory name_,
        string memory symbol_,
        address admin,
        address nftAddress,
        address gameAddress,
        address stakingAddress
    ) ERC721(name_, symbol_) {
        require(admin != address(0), "SneakerMods: zero admin");
        require(nftAddress != address(0), "SneakerMods: zero NFT");
        require(gameAddress != address(0), "SneakerMods: zero game");
        require(stakingAddress != address(0), "SneakerMods: zero staking");
        nft = SneakerMint(nftAddress);
        game = SneakerGame(gameAddress);
        staking = SneakerStaking(payable(stakingAddress));
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Authorize the workshop contract to burn consumable mods.
    function setWorkshop(address workshop_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        workshop = workshop_;
        emit WorkshopUpdated(workshop_);
    }

    /// @notice Link PlayerProgress for level-gated (skill) achievements.
    function setProgress(address progress_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        progress = progress_;
        emit ProgressUpdated(progress_);
    }

    /// @notice Register a claimable achievement and the mod it mints.
    ///      The `active` field in the supplied struct is ignored; new
    ///      achievements always start active.
    function addAchievement(Achievement calldata achievement)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 achievementId)
    {
        _validateTraits(achievement.slot, achievement.rarity, achievement.tier, achievement.effectBps);
        require(bytes(achievement.uri).length > 0, "SneakerMods: empty uri");

        achievementId = _achievements.length;
        Achievement storage stored = _achievements.push();
        stored.kind = achievement.kind;
        stored.threshold = achievement.threshold;
        stored.slot = achievement.slot;
        stored.rarity = achievement.rarity;
        stored.tier = achievement.tier;
        stored.effectBps = achievement.effectBps;
        stored.aux = achievement.aux;
        stored.consumable = achievement.consumable;
        stored.uri = achievement.uri;
        stored.active = true;
        emit AchievementAdded(achievementId, achievement.kind, achievement.threshold, achievement.slot);
    }

    function setAchievementActive(uint256 achievementId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireAchievement(achievementId).active = active;
        emit AchievementToggled(achievementId, active);
    }

    // ─────────────────────────── Mint ────────────────────────────

    /// @notice Mint authorized by the store/backend (MINTER_ROLE).
    ///      `traits` carries all mod attributes including the proofHash.
    function mintAuthorized(
        address to,
        string calldata uri,
        ModTraits calldata traits
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        return _mintMod(to, uri, traits);
    }

    /// @notice Claim an achievement badge mod by meeting its on-chain condition.
    /// @param achievementId Index in the achievements registry.
    /// @param sneakerId Sneaker token evaluated for sneaker-scoped conditions
    ///      (streak, lifetime points). Ignored for wallet-scoped conditions;
    ///      pass 0.
    function claim(uint256 achievementId, uint256 sneakerId) external whenNotPaused returns (uint256 tokenId) {
        Achievement storage achievement = _requireAchievement(achievementId);
        require(achievement.active, "SneakerMods: achievement inactive");
        require(!achievementClaimed[achievementId][msg.sender], "SneakerMods: already claimed");
        require(_meets(achievement, msg.sender, sneakerId), "SneakerMods: requirement not met");

        achievementClaimed[achievementId][msg.sender] = true;
        bytes32 proofHash = keccak256(abi.encodePacked("achievement", achievementId, msg.sender));
        tokenId = _mintMod(
            msg.sender,
            achievement.uri,
            ModTraits({
                slot: achievement.slot,
                rarity: achievement.rarity,
                tier: achievement.tier,
                effectBps: achievement.effectBps,
                aux: achievement.aux,
                consumable: achievement.consumable,
                proofHash: proofHash
            })
        );
        emit AchievementClaimed(achievementId, msg.sender, tokenId);
    }

    /// @notice Burn a mod. Callable by the token owner or the workshop
    ///      (which burns consumable repair kits on use).
    function burn(uint256 tokenId) external {
        require(
            msg.sender == workshop || ownerOf(tokenId) == msg.sender,
            "SneakerMods: not authorized"
        );
        _burn(tokenId);
        emit ModBurned(tokenId, msg.sender);
    }

    // ─────────────────────────── Views ───────────────────────────

    function traitsOf(uint256 tokenId) external view returns (ModTraits memory) {
        _requireOwned(tokenId);
        return _traits[tokenId];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    function achievementCount() external view returns (uint256) {
        return _achievements.length;
    }

    function achievements(uint256 achievementId) external view returns (Achievement memory) {
        return _requireAchievement(achievementId);
    }

    /// @notice Whether `user` currently meets the achievement requirement.
    function meetsRequirement(uint256 achievementId, address user, uint256 sneakerId) external view returns (bool) {
        Achievement storage achievement = _requireAchievement(achievementId);
        return _meets(achievement, user, sneakerId);
    }

    // ─────────────────────────── Internal ────────────────────────

    function _requireAchievement(uint256 achievementId) internal view returns (Achievement storage) {
        require(achievementId < _achievements.length, "SneakerMods: unknown achievement");
        return _achievements[achievementId];
    }

    function _validateTraits(uint8 slot, uint8 rarity, uint8 tier, uint16 effectBps) internal pure {
        require(slot < SLOT_COUNT, "SneakerMods: invalid slot");
        require(rarity <= 100, "SneakerMods: invalid rarity");
        require(tier < 4, "SneakerMods: invalid tier");
        require(effectBps <= MAX_EFFECT_BPS, "SneakerMods: effect too high");
    }

    function _meets(Achievement storage achievement, address user, uint256 sneakerId) internal view returns (bool) {
        if (achievement.kind == ReqKind.NftBalance) {
            return nft.balanceOf(user) >= achievement.threshold;
        }
        if (achievement.kind == ReqKind.StakedPol) {
            (uint256 principal, , , ) = staking.polPositions(user);
            return principal >= achievement.threshold;
        }
        if (achievement.kind == ReqKind.PlayerLevel) {
            return progress != address(0) && IPlayerProgressView(progress).levelOf(user) >= achievement.threshold;
        }
        // Sneaker-scoped conditions require owning the evaluated sneaker.
        if (nft.ownerOf(sneakerId) != user) return false;
        ( , , uint32 streak, , , uint256 lifetimePoints, , ) = game.sneakers(sneakerId);
        if (achievement.kind == ReqKind.SneakerStreak) {
            return streak >= achievement.threshold;
        }
        if (achievement.kind == ReqKind.SneakerLifetimePoints) {
            return lifetimePoints >= achievement.threshold;
        }
        return false;
    }

    function _mintMod(
        address to,
        string memory uri,
        ModTraits memory traits
    ) internal returns (uint256) {
        require(to != address(0), "SneakerMods: zero recipient");
        require(traits.proofHash != bytes32(0), "SneakerMods: empty proof");
        require(!usedProofs[traits.proofHash], "SneakerMods: proof used");
        _validateTraits(traits.slot, traits.rarity, traits.tier, traits.effectBps);

        usedProofs[traits.proofHash] = true;
        uint256 tokenId = ++_nextTokenId;
        _traits[tokenId] = traits;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit ModMinted(to, tokenId, traits.slot, traits.tier, traits.effectBps, traits.consumable);
        return tokenId;
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

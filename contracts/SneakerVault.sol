// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

/// @dev Minimal live-state views SneakerVault reads for perk eligibility.
///      Same pattern as PlayerProgress: benefits are derived from live
///      protocol state, never from client-supplied values.
interface IVaultSneakerTraits {
    /// @notice (rarity, tier, proofHash) for a SneakerMint token.
    function traitsOf(uint256 tokenId) external view returns (IVaultSneakerTraits.SneakerTraitsView memory);

    struct SneakerTraitsView {
        uint8 rarity;
        uint8 tier;
        bytes32 proofHash;
    }
}

interface IVaultWorkshopBoosts {
    /// @notice Live wear of a sneaker, in basis points (10000 = pristine).
    function conditionBps(uint256 tokenId) external view returns (uint16);
}

interface IVaultStakingProgress {
    function polPositions(address owner)
        external
        view
        returns (uint256 principal, uint256 accruedRewards, uint256 depositedAt, uint256 lastAccrualAt);
}

interface IVaultProgressView {
    function levelOf(address user) external view returns (uint8);
}

/// @title SneakerVault — live-state benefits: discounts and exclusive access.
/// @notice Grants protocol perks based on what a wallet currently owns or
///      maintains: veSneakers by tier, how well serviced they are, POL staked, PlayerProgress
///      level, and mod ownership. Two perk kinds exist:
///      — DISCOUNT: `discountBps(user, perkId)` returns a basis-point price
///        reduction that VeSneakerStore/ModStore apply at purchase time.
///      — ACCESS: `claimPerk` verifies eligibility once per wallet and emits
///        an event that off-chain systems (allowlists, drops, gates) consume.
/// @dev The vault is read-only for funds — it never holds POL or NFTs. All
///      eligibility is derived from live contract state, so selling NFTs or
///      unstaking POL immediately removes the benefit. Gates are additive: a
///      perk with several non-zero gates requires all of them.
contract SneakerVault is AccessControl {
    uint256 public constant BASIS_POINTS = 10_000;
    uint16 public constant MAX_DISCOUNT_BPS = 5_000; // discounts cap at 50%
    uint256 public constant MAX_PERKS = 16;
    /// @notice Scan bound for owner enumeration. Designs are capped at 1,000
    ///      copies each, so a legitimate wallet cannot exceed this without
    ///      controlling the whole supply.
    uint256 public constant MAX_OWNER_SCAN = 1_000;

    /// Perk kinds.
    uint8 public constant KIND_DISCOUNT = 0;
    uint8 public constant KIND_ACCESS = 1;

    struct Perk {
        uint8 kind; // KIND_DISCOUNT or KIND_ACCESS
        uint16 valueBps; // discount in bps (KIND_DISCOUNT); unused for access
        /// @notice Minimum SneakerMint tier the wallet must own (0 = any).
        uint8 minTier;
        /// @notice Minimum PlayerProgress level required (0 = no level gate).
        uint8 requiredLevel;
        /// @notice Minimum POL principal staked (0 = no staking gate).
        uint256 minPolStaked;
        /// @notice Minimum condition across owned sneakers (0 = no care gate).
        uint16 minConditionBps;
        /// @notice Minimum count of mods owned (0 = no mod gate).
        uint256 minModCount;
        bool active;
    }

    struct EligibilitySignals {
        uint8 level;
        uint256 polStaked;
        uint256 modCount;
        uint8 highestTier;
        uint16 highestConditionBps;
    }

    IERC721Enumerable public immutable nft;
    IERC721 public immutable mods;
    IVaultSneakerTraits public immutable sneakerTraits;
    IVaultWorkshopBoosts public immutable workshop;
    IVaultStakingProgress public immutable staking;
    IVaultProgressView public immutable progress;

    mapping(uint256 perkId => Perk) private _perks;
    uint256 public perkCount;

    /// @notice Access perks: one claim per wallet per perk.
    mapping(uint256 perkId => mapping(address user => bool claimed)) public accessClaimed;

    event PerkSet(uint256 indexed perkId, uint8 kind, uint16 valueBps, uint8 minTier, uint8 requiredLevel, uint256 minPolStaked, uint16 minConditionBps, uint256 minModCount, bool active);
    event PerkClaimed(uint256 indexed perkId, address indexed user);

    constructor(
        address admin,
        address nftAddress,
        address modsAddress,
        address sneakerTraitsAddress,
        address workshopAddress,
        address stakingAddress,
        address progressAddress
    ) {
        require(admin != address(0), "SneakerVault: zero admin");
        require(nftAddress != address(0), "SneakerVault: zero NFT");
        require(modsAddress != address(0), "SneakerVault: zero mods");
        require(sneakerTraitsAddress != address(0), "SneakerVault: zero traits");
        require(workshopAddress != address(0), "SneakerVault: zero workshop");
        require(stakingAddress != address(0), "SneakerVault: zero staking");
        require(progressAddress != address(0), "SneakerVault: zero progress");

        nft = IERC721Enumerable(nftAddress);
        mods = IERC721(modsAddress);
        sneakerTraits = IVaultSneakerTraits(sneakerTraitsAddress);
        workshop = IVaultWorkshopBoosts(workshopAddress);
        staking = IVaultStakingProgress(stakingAddress);
        progress = IVaultProgressView(progressAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    /// @notice Create or update a perk. All gates are additive — a wallet must
    ///      satisfy every non-zero gate to be eligible.
    function setPerk(
        uint256 perkId,
        uint8 kind,
        uint16 valueBps,
        uint8 minTier,
        uint8 requiredLevel,
        uint256 minPolStaked,
        uint16 minConditionBps,
        uint256 minModCount,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(perkId < MAX_PERKS, "SneakerVault: perk limit reached");
        require(perkId <= perkCount, "SneakerVault: perk ids must be sequential");
        require(kind == KIND_DISCOUNT || kind == KIND_ACCESS, "SneakerVault: invalid kind");
        if (kind == KIND_DISCOUNT) {
            require(valueBps > 0 && valueBps <= MAX_DISCOUNT_BPS, "SneakerVault: discount out of range");
        }
        require(minTier <= 3, "SneakerVault: invalid tier");

        _perks[perkId] = Perk({
            kind: kind,
            valueBps: valueBps,
            minTier: minTier,
            requiredLevel: requiredLevel,
            minPolStaked: minPolStaked,
            minConditionBps: minConditionBps,
            minModCount: minModCount,
            active: active
        });
        if (perkId == perkCount) ++perkCount;
        emit PerkSet(perkId, kind, valueBps, minTier, requiredLevel, minPolStaked, minConditionBps, minModCount, active);
    }

    // ─────────────────────────── Views ───────────────────────────

    function perks(uint256 perkId)
        external
        view
        returns (
            uint8 kind,
            uint16 valueBps,
            uint8 minTier,
            uint8 requiredLevel,
            uint256 minPolStaked,
            uint16 minConditionBps,
            uint256 minModCount,
            bool active
        )
    {
        Perk memory perk = _perks[perkId];
        return (
            perk.kind,
            perk.valueBps,
            perk.minTier,
            perk.requiredLevel,
            perk.minPolStaked,
            perk.minConditionBps,
            perk.minModCount,
            perk.active
        );
    }

    /// @notice Highest active discount available to `user` across all discount
    ///      perks. Perk count is capped, and wallet signals are read once so
    ///      purchase quotes have bounded work even with several perks.
    function bestDiscountBps(address user) external view returns (uint16 best) {
        uint8 minTier;
        uint16 minConditionBps;
        uint8 requiredLevel;
        uint256 minPolStaked;
        uint256 minModCount;
        bool hasDiscount;

        for (uint256 i; i < perkCount; ++i) {
            Perk memory perk = _perks[i];
            if (!perk.active || perk.kind != KIND_DISCOUNT) continue;
            hasDiscount = true;
            if (perk.minTier > minTier) minTier = perk.minTier;
            if (perk.minConditionBps > minConditionBps) minConditionBps = perk.minConditionBps;
            if (perk.requiredLevel > requiredLevel) requiredLevel = perk.requiredLevel;
            if (perk.minPolStaked > minPolStaked) minPolStaked = perk.minPolStaked;
            if (perk.minModCount > minModCount) minModCount = perk.minModCount;
        }
        if (!hasDiscount) return 0;

        EligibilitySignals memory signals = _readSignals(
            user, minTier, minConditionBps, requiredLevel, minPolStaked, minModCount
        );
        for (uint256 i; i < perkCount; ++i) {
            Perk memory perk = _perks[i];
            if (!perk.active || perk.kind != KIND_DISCOUNT || !_meetsGates(perk, signals)) continue;
            if (perk.valueBps > best) best = perk.valueBps;
            if (best == MAX_DISCOUNT_BPS) return best;
        }
    }

    /// @notice Discount for a specific perk (0 when not eligible or inactive).
    function discountBps(address user, uint256 perkId) external view returns (uint16) {
        Perk memory perk = _perks[perkId];
        if (!perk.active || perk.kind != KIND_DISCOUNT) return 0;
        return _meetsGates(perk, _readSignals(
            user, perk.minTier, perk.minConditionBps, perk.requiredLevel, perk.minPolStaked, perk.minModCount
        )) ? perk.valueBps : 0;
    }

    /// @notice Whether `user` satisfies every non-zero gate of the perk.
    function isEligible(address user, uint256 perkId) external view returns (bool) {
        Perk memory perk = _perks[perkId];
        if (!perk.active) return false;
        return _meetsGates(perk, _readSignals(
            user, perk.minTier, perk.minConditionBps, perk.requiredLevel, perk.minPolStaked, perk.minModCount
        ));
    }

    // ─────────────────────────── Claims ───────────────────────────

    /// @notice Claim an ACCESS perk once per wallet. Emits an event consumed by
    ///      off-chain allowlists/gates. Reverts when inactive, already claimed,
    ///      or any gate fails.
    function claimPerk(uint256 perkId) external {
        Perk memory perk = _perks[perkId];
        require(perk.active, "SneakerVault: perk inactive");
        require(perk.kind == KIND_ACCESS, "SneakerVault: not an access perk");
        require(!accessClaimed[perkId][msg.sender], "SneakerVault: already claimed");
        require(
            _meetsGates(perk, _readSignals(
                msg.sender, perk.minTier, perk.minConditionBps, perk.requiredLevel, perk.minPolStaked, perk.minModCount
            )),
            "SneakerVault: requirements not met"
        );
        accessClaimed[perkId][msg.sender] = true;
        emit PerkClaimed(perkId, msg.sender);
    }

    // ─────────────────────────── Internals ────────────────────────

    /// @notice Read each required eligibility signal once. Tier and condition
    ///      checks share a single bounded enumerable scan.
    function _readSignals(
        address user,
        uint8 minTier,
        uint16 minConditionBps,
        uint8 requiredLevel,
        uint256 minPolStaked,
        uint256 minModCount
    ) private view returns (EligibilitySignals memory signals) {
        if (requiredLevel > 0) signals.level = progress.levelOf(user);
        if (minPolStaked > 0) {
            (signals.polStaked, , , ) = staking.polPositions(user);
        }
        if (minModCount > 0) signals.modCount = mods.balanceOf(user);

        if (minTier == 0 && minConditionBps == 0) return signals;
        uint256 balance = nft.balanceOf(user);
        uint256 scan = balance > MAX_OWNER_SCAN ? MAX_OWNER_SCAN : balance;
        for (uint256 i; i < scan; ++i) {
            uint256 tokenId = nft.tokenOfOwnerByIndex(user, i);
            if (minTier > signals.highestTier) {
                IVaultSneakerTraits.SneakerTraitsView memory traits = sneakerTraits.traitsOf(tokenId);
                if (traits.tier > signals.highestTier) signals.highestTier = traits.tier;
            }
            if (minConditionBps > signals.highestConditionBps) {
                uint16 condition = workshop.conditionBps(tokenId);
                if (condition > signals.highestConditionBps) signals.highestConditionBps = condition;
            }
            if (
                (minTier == 0 || signals.highestTier >= minTier) &&
                (minConditionBps == 0 || signals.highestConditionBps >= minConditionBps)
            ) break;
        }
    }

    /// @notice Every non-zero gate must pass. Gates are additive by design:
    ///      a perk with minTier=3 AND requiredLevel=5 requires both.
    function _meetsGates(Perk memory perk, EligibilitySignals memory signals) private pure returns (bool) {
        return
            (perk.requiredLevel == 0 || signals.level >= perk.requiredLevel) &&
            (perk.minPolStaked == 0 || signals.polStaked >= perk.minPolStaked) &&
            (perk.minTier == 0 || signals.highestTier >= perk.minTier) &&
            (perk.minConditionBps == 0 || signals.highestConditionBps >= perk.minConditionBps) &&
            (perk.minModCount == 0 || signals.modCount >= perk.minModCount);
    }
}

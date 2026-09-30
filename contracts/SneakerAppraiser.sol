// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @title SneakerAppraiser — On-chain NFT valuation estimator for SneakerMint NFTs.
/// @notice Evaluates a SneakerMint NFT based on its rarity score (0-100) and
///      tier (0=Common, 1=Rare, 2=Epic, 3=Mythic) and returns an estimated POL
///      value. This is an on-chain heuristic estimate, not a binding price oracle.
///      The estimate helps users understand the relative value of their NFT for
///      future marketplace trading or for deciding whether to lock it as a
///      staking APY boost.
/// @dev The valuation formula is:
///      estimatedValue = baseValue + tierValue[tier] + (rarity * rarityWeight)
///      All parameters are admin-configurable. The contract is read-only
///      (no state changes from external callers except admin configuration).
contract SneakerAppraiser is AccessControl {
    SneakerMint public immutable nft;

    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Optional boost provider (SneakerWorkshop). Live wear scales the
    ///      effective rarity and Skin mods add a percentage bonus to the value.
    ISneakerBoosts public boosts;

    /// @notice Base POL value (in wei) applied to every NFT regardless of rarity.
    uint256 public baseValue;

    /// @notice Per-tier POL value (in wei) added on top of the base value.
    ///      Index 0=Common, 1=Rare, 2=Epic, 3=Mythic.
    uint256[4] public tierValues;

    /// @notice POL value (in wei) added per rarity score point (0-100).
    ///      Final rarity contribution = rarity * rarityWeight.
    uint256 public rarityWeight;

    /// @notice Multiplier (in basis points) applied to the raw estimate to
    ///      produce the final value. 10000 = 1x, 12000 = 1.2x, etc.
    ///      Allows admin to globally adjust estimates without changing
    ///      individual parameters.
    uint256 public globalMultiplierBps;

    event AppraisalParamsUpdated(
        uint256 baseValue,
        uint256[4] tierValues,
        uint256 rarityWeight,
        uint256 globalMultiplierBps
    );
    event BoostsUpdated(address indexed boosts);

    constructor(
        address admin,
        address nftAddress,
        uint256 baseValue_,
        uint256[4] memory tierValues_,
        uint256 rarityWeight_,
        uint256 globalMultiplierBps_
    ) {
        require(admin != address(0), "SneakerAppraiser: zero admin");
        require(nftAddress != address(0), "SneakerAppraiser: zero NFT");
        require(globalMultiplierBps_ > 0, "SneakerAppraiser: zero multiplier");
        nft = SneakerMint(nftAddress);
        baseValue = baseValue_;
        tierValues = tierValues_;
        rarityWeight = rarityWeight_;
        globalMultiplierBps = globalMultiplierBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    /// @notice Update appraisal parameters. Admin only.
    function updateParams(
        uint256 baseValue_,
        uint256[4] calldata tierValues_,
        uint256 rarityWeight_,
        uint256 globalMultiplierBps_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(globalMultiplierBps_ > 0, "SneakerAppraiser: zero multiplier");
        baseValue = baseValue_;
        tierValues = tierValues_;
        rarityWeight = rarityWeight_;
        globalMultiplierBps = globalMultiplierBps_;
        emit AppraisalParamsUpdated(baseValue_, tierValues_, rarityWeight_, globalMultiplierBps_);
    }

    /// @notice Link the boost provider (SneakerWorkshop). Zero address disables boosts.
    function setBoosts(address boosts_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        boosts = ISneakerBoosts(boosts_);
        emit BoostsUpdated(boosts_);
    }

    // ─────────────────────────── Views ───────────────────────────

    /// @notice Estimate the POL value of a SneakerMint NFT.
    /// @dev Returns the EFFECTIVE rarity: base rarity scaled by live wear.
    ///      in the workshop, capped at 100. Skin mods add a percentage bonus on
    ///      top of the calculated value.
    /// @param tokenId The NFT token ID to appraise.
    /// @return estimatedValue The estimated POL value in wei.
    /// @return rarity The effective rarity score (0-100), after wear.
    /// @return tier The NFT tier (0=Common, 1=Rare, 2=Epic, 3=Mythic).
    function appraise(uint256 tokenId)
        external
        view
        returns (uint256 estimatedValue, uint8 rarity, uint8 tier)
    {
        SneakerMint.SneakerTraits memory traits = nft.traitsOf(tokenId);
        rarity = effectiveRarity(tokenId);
        tier = traits.tier;
        estimatedValue = _calculateValue(rarity, tier);
        if (address(boosts) != address(0)) {
            estimatedValue = (estimatedValue * (10_000 + boosts.appraisalBonusBps(tokenId))) / 10_000;
        }
    }

    /// @notice Effective rarity score: base rarity scaled by live wear (max 100).
    /// @dev Wear drags the appraisal down with everything else, so servicing a
    ///      pair is also what protects its resale value.
    function effectiveRarity(uint256 tokenId) public view returns (uint8) {
        SneakerMint.SneakerTraits memory traits = nft.traitsOf(tokenId);
        uint256 effective = uint256(traits.rarity);
        if (address(boosts) != address(0)) {
            effective = (effective * boosts.conditionBps(tokenId)) / BASIS_POINTS;
        }
        return effective > 100 ? 100 : uint8(effective);
    }

    /// @notice Estimate the POL value using raw rarity and tier values.
    /// @dev Useful for previewing values without an existing NFT.
    function appraiseRaw(uint8 rarity, uint8 tier) external view returns (uint256) {
        require(tier < 4, "SneakerAppraiser: invalid tier");
        require(rarity <= 100, "SneakerAppraiser: invalid rarity");
        return _calculateValue(rarity, tier);
    }

    /// @notice Returns the full tier values array for UI display.
    function tierValueList() external view returns (uint256[4] memory) {
        return tierValues;
    }

    /// @notice Returns a human-readable rarity label for a tier.
    function tierLabel(uint8 tier) external pure returns (string memory) {
        if (tier == 0) return "Common";
        if (tier == 1) return "Rare";
        if (tier == 2) return "Epic";
        if (tier == 3) return "Mythic";
        return "Unknown";
    }

    /// @notice Returns the APY boost (in basis points) for a given tier.
    /// @dev Mirrors the SneakerStaking tier bonuses: [50, 80, 150, 180] bps.
    function tierBoostBps(uint8 tier) external pure returns (uint64) {
        if (tier == 0) return 50; // Common: +0.5%
        if (tier == 1) return 80; // Rare: +0.8%
        if (tier == 2) return 150; // Epic: +1.5%
        if (tier == 3) return 180; // Mythic: +1.8%
        return 0;
    }

    // ─────────────────────────── Internal ────────────────────────

    function _calculateValue(uint8 rarity, uint8 tier) internal view returns (uint256) {
        uint256 raw = baseValue + tierValues[tier] + (uint256(rarity) * rarityWeight);
        return (raw * globalMultiplierBps) / 10_000;
    }
}

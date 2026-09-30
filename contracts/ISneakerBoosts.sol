// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/// @title ISneakerBoosts — read interface implemented by SneakerWorkshop.
/// @notice SneakerGame, SneakerStaking, SneakerAppraiser, SneakerTabArena, and
///      SneakerVault query this interface to apply the effects of mods equipped
///      to a sneaker and of the pair's live condition. All values are read live,
///      so equipping or unequipping a mod — or letting the pair wear down —
///      takes effect on the very next read.
/// @dev A zero address on the consumer side disables all boosts.
interface ISneakerBoosts {
    /// @notice Extra veRUNE earn rate in basis points (Upper + Skill mods).
    function earnBonusBps(uint256 tokenId) external view returns (uint256);

    /// @notice Wear reduction per activation in basis points (Sole mods).
    function wearReductionBps(uint256 tokenId) external view returns (uint256);

    /// @notice Maximum durability bonus in basis points.
    function maxDurabilityBonusBps(uint256 tokenId) external view returns (uint256);

    /// @notice Repair cost discount in basis points (Lining mods).
    function repairDiscountBps(uint256 tokenId) external view returns (uint256);

    /// @notice Appraisal value bonus in basis points (Skin mods).
    function appraisalBonusBps(uint256 tokenId) external view returns (uint256);

    /// @notice Extra staking APY in basis points (Boost mods).
    function stakingBoostBps(uint256 tokenId) external view returns (uint256);

    /// @notice Live wear of the pair, in basis points.
    /// @dev `10000` = freshly serviced, `5000` = fully worn. Consumers scale the
    ///      base rarity by this value, so a neglected pair keeps half its rarity
    ///      and never becomes useless. Restoring it is what the workshop's
    ///      service consumables are for.
    function conditionBps(uint256 tokenId) external view returns (uint16);

    /// @notice Whether a Core mod keeps the earn window always open.
    function autoActive(uint256 tokenId) external view returns (bool);

    /// @notice veSneaker artwork design index applied by a Skin mod (255 = none).
    function skinOverride(uint256 tokenId) external view returns (uint8);

    /// @notice Whether the sneaker currently has any mod equipped.
    function hasEquippedMods(uint256 tokenId) external view returns (bool);
}

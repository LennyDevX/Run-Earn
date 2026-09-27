// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract SneakerStakingTest is Test {
    SneakerMint nft;
    RENToken rune;
    SneakerStaking staking;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    bytes32 constant PROOF1 = keccak256("proof-1");
    bytes32 constant PROOF2 = keccak256("proof-2");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    // Default params: 2.8% base APY, rarity-based boost [50,80,150,180] bps, 8% max, 30-day lock
    uint256 rewardTokensPerNftYear = 1000 * 10 ** 18;
    uint256 baseApyBps = 280;
    uint256 perNftBonusBps = 0; // boost is purely rarity-based
    uint256 maxApyBps = 800;
    uint64[4] tierBonusBps = [uint64(50), 80, 150, 180]; // Common, Rare, Epic, Mythic
    uint256 minLockSeconds = 30 days;

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        rune = new RENToken(admin, admin); // admin is minter for testing
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(rune),
            rewardTokensPerNftYear,
            baseApyBps,
            perNftBonusBps,
            maxApyBps,
            tierBonusBps,
            minLockSeconds
        );

        // Fund the staking vault with RUNE
        vm.prank(admin);
        rune.mint(address(staking), 1_000_000 * 10 ** 18);

        // Mint an NFT for alice (tier 2 = Epic, +1.5% boost)
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsParams() public view {
        assertEq(address(staking.nft()), address(nft));
        assertEq(address(staking.rewardToken()), address(rune));
        assertEq(staking.baseApyBps(), baseApyBps);
        assertEq(staking.maxApyBps(), maxApyBps);
        assertEq(staking.minLockSeconds(), minLockSeconds);
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("SneakerStaking: zero admin");
        new SneakerStaking(address(0), address(nft), address(rune), rewardTokensPerNftYear, baseApyBps, perNftBonusBps, maxApyBps, tierBonusBps, minLockSeconds);
    }

    function test_Constructor_RevertZeroNFT() public {
        vm.expectRevert("SneakerStaking: zero NFT");
        new SneakerStaking(admin, address(0), address(rune), rewardTokensPerNftYear, baseApyBps, perNftBonusBps, maxApyBps, tierBonusBps, minLockSeconds);
    }

    function test_Constructor_RevertInvalidApyBounds() public {
        vm.expectRevert("SneakerStaking: invalid APY bounds");
        new SneakerStaking(admin, address(nft), address(rune), rewardTokensPerNftYear, 900, 50, 800, tierBonusBps, minLockSeconds);
    }

    function test_Constructor_RevertMaxApyTooHigh() public {
        vm.expectRevert("SneakerStaking: max APY too high");
        new SneakerStaking(admin, address(nft), address(rune), rewardTokensPerNftYear, 400, 50, 10_001, tierBonusBps, minLockSeconds);
    }

    // ─────────── Stake ───────────

    function test_Stake_TransfersNFTToVault() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();
        assertEq(nft.ownerOf(1), address(staking));
        assertEq(staking.totalLocked(), 1);
    }

    function test_Stake_ReadsTraitsFromNFT() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();
        (uint256 rTokenId, uint8 rRarity, uint8 rTier, uint64 rDepositedAt, bool rActive) =
            staking.receipts(alice, 1);
        assertEq(rTokenId, 1);
        assertEq(rRarity, 50);
        assertEq(rTier, 2);
        assertTrue(rActive);
        assertGt(rDepositedAt, 0);
    }

    function test_Stake_EmitsEvent() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        vm.expectEmit(true, true, true, true);
        emit SneakerStaking.Staked(alice, 1, 50, 2);
        staking.stake(1);
        vm.stopPrank();
    }

    function test_Stake_RevertNotOwner() public {
        vm.prank(bob);
        vm.expectRevert("SneakerStaking: not owner");
        staking.stake(1);
    }

    function test_Stake_RevertAlreadyStaked() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.expectRevert("SneakerStaking: already staked");
        staking.stake(1);
        vm.stopPrank();
    }

    function test_Stake_RevertWhenPaused() public {
        vm.prank(admin);
        staking.pause();
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        vm.expectRevert();
        staking.stake(1);
        vm.stopPrank();
    }

    // ─────────── Unstake ───────────

    function test_Unstake_ReturnsNFT() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        // Wait past lock period
        vm.warp(block.timestamp + minLockSeconds + 1);
        staking.unstake(1);
        vm.stopPrank();
        assertEq(nft.ownerOf(1), alice);
        assertEq(staking.totalLocked(), 0);
    }

    function test_Unstake_RevertLockActive() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.warp(block.timestamp + 10 days); // only 10 days, lock is 30 days
        vm.expectRevert("SneakerStaking: lock period active");
        staking.unstake(1);
        vm.stopPrank();
    }

    function test_Unstake_RevertInvalidReceipt() public {
        vm.prank(alice);
        vm.expectRevert("SneakerStaking: invalid receipt");
        staking.unstake(999);
    }

    function test_Unstake_WorksEvenWhenPaused() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.warp(block.timestamp + minLockSeconds + 1);
        vm.stopPrank();

        vm.prank(admin);
        staking.pause();

        vm.prank(alice);
        staking.unstake(1);
        assertEq(nft.ownerOf(1), alice);
    }

    // ─────────── Claim rewards ───────────

    function test_ClaimRewards_AfterTime() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.warp(block.timestamp + 365 days); // 1 year
        staking.claimRewards();
        vm.stopPrank();
        // Should have earned some RUNE
        assertGt(rune.balanceOf(alice), 0);
    }

    function test_ClaimRewards_RevertNothingStaked() public {
        vm.prank(alice);
        vm.expectRevert("SneakerStaking: nothing staked");
        staking.claimRewards();
    }

    function test_ClaimRewards_RevertNothingToClaim() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.expectRevert("SneakerStaking: nothing to claim");
        staking.claimRewards();
        vm.stopPrank();
    }

    function test_ClaimRewards_RevertVaultInsufficient() public {
        // Deploy a staking with no RUNE funding
        SneakerStaking emptyStaking = new SneakerStaking(
            admin,
            address(nft),
            address(rune),
            rewardTokensPerNftYear,
            baseApyBps,
            perNftBonusBps,
            maxApyBps,
            tierBonusBps,
            minLockSeconds
        );

        // Mint another NFT for bob
        vm.prank(admin);
        nft.mintAuthorized(bob, URI, PROOF2, 50, 2);

        vm.startPrank(bob);
        nft.approve(address(emptyStaking), 2);
        emptyStaking.stake(2);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert("SneakerStaking: vault insufficient");
        emptyStaking.claimRewards();
        vm.stopPrank();
    }

    // ─────────── APY ───────────

    function test_EffectiveApy_SingleNFT() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();
        // base 280 + 0 (no flat bonus) + tierBonus[2]=150 (Epic) = 430 bps = 4.3%
        assertEq(staking.effectiveApyBps(alice), 430);
    }

    function test_EffectiveApy_CappedAtMax() public {
        // Mint several Mythic NFTs (tier 3, +1.8% each) for alice
        for (uint8 i = 0; i < 4; i++) {
            vm.prank(admin);
            nft.mintAuthorized(alice, URI, keccak256(abi.encodePacked("proof", i)), 90, 3);
        }

        vm.startPrank(alice);
        for (uint8 i = 1; i <= 5; i++) {
            nft.approve(address(staking), i);
            staking.stake(i);
        }
        vm.stopPrank();

        // base 280 + 5 * 180 = 1180, but capped at maxApyBps = 800
        assertEq(staking.effectiveApyBps(alice), maxApyBps);
    }

    // ─────────── Admin ───────────

    function test_UpdateRewardParams() public {
        vm.prank(admin);
        staking.updateRewardParams(2000 * 10 ** 18, 500, 100, 1000, tierBonusBps, 14 days);
        assertEq(staking.rewardTokensPerNftYear(), 2000 * 10 ** 18);
        assertEq(staking.baseApyBps(), 500);
        assertEq(staking.maxApyBps(), 1000);
        assertEq(staking.minLockSeconds(), 14 days);
    }

    function test_UpdateRewardParams_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.updateRewardParams(2000 * 10 ** 18, 500, 100, 1000, tierBonusBps, 14 days);
    }

    function test_RecoverNFT_Emergency() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();

        vm.prank(admin);
        staking.recoverNFT(1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(staking.totalLocked(), 0);
    }

    function test_RecoverNFT_RevertNotStaked() public {
        vm.prank(admin);
        vm.expectRevert("SneakerStaking: not staked");
        staking.recoverNFT(999);
    }

    // ─────────── pendingRewards ───────────

    function test_PendingRewards_GrowsOverTime() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();

        uint256 pending0 = staking.pendingRewards(alice);
        assertEq(pending0, 0);

        vm.warp(block.timestamp + 1 days);
        uint256 pending1 = staking.pendingRewards(alice);
        assertGt(pending1, 0);

        vm.warp(block.timestamp + 1 days);
        uint256 pending2 = staking.pendingRewards(alice);
        assertGt(pending2, pending1);
    }

    // ─────────── POL staking ───────────

    function test_DepositPOL_TracksPrincipal() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        staking.depositPOL{value: 3 ether}();

        (uint256 principal,, uint256 depositedAt,) = staking.polPositions(alice);
        assertEq(principal, 3 ether);
        assertGt(depositedAt, 0);
        assertEq(staking.totalPOLPrincipal(), 3 ether);
    }

    function test_DepositPOL_RevertZeroValue() public {
        vm.prank(alice);
        vm.expectRevert("SneakerStaking: zero deposit");
        staking.depositPOL();
    }

    function test_POLRewards_RequireFundedReserve() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        staking.depositPOL{value: 1 ether}();
        vm.warp(block.timestamp + 365 days);

        vm.prank(alice);
        vm.expectRevert("SneakerStaking: POL reserve insufficient");
        staking.claimPOLRewards();
    }

    function test_POLRewards_NFTBoostIncreasesAPY() public {
        vm.deal(admin, 100 ether);
        vm.deal(alice, 10 ether);
        vm.prank(admin);
        staking.fundPOLRewards{value: 100 ether}();

        vm.prank(alice);
        staking.depositPOL{value: 1 ether}();
        uint256 basePending = staking.pendingPOLRewards(alice);

        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);

        uint256 boostedPending = staking.pendingPOLRewards(alice);
        assertGt(boostedPending, basePending);
        // base 280 + 0 + tierBonus[2]=150 (Epic) = 430
        assertEq(staking.effectiveApyBps(alice), 430);
    }

    function test_WithdrawPOL_ReturnsPrincipalAfterLock() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        staking.depositPOL{value: 2 ether}();
        vm.warp(block.timestamp + minLockSeconds + 1);

        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        staking.withdrawPOL(2 ether);

        assertEq(alice.balance, beforeBalance + 2 ether);
        (uint256 principal,,, ) = staking.polPositions(alice);
        assertEq(principal, 0);
        assertEq(staking.totalPOLPrincipal(), 0);
    }

    function test_ClaimPOLRewards_PaysFromReserve() public {
        vm.deal(admin, 100 ether);
        vm.deal(alice, 10 ether);
        vm.prank(admin);
        staking.fundPOLRewards{value: 100 ether}();
        vm.prank(alice);
        staking.depositPOL{value: 1 ether}();
        vm.warp(block.timestamp + 365 days);

        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        staking.claimPOLRewards();

        assertGt(alice.balance, beforeBalance);
        assertEq(staking.pendingPOLRewards(alice), 0);
    }

    function test_StakedTokenIds_TracksAndRemoves() public {
        vm.startPrank(alice);
        nft.approve(address(staking), 1);
        staking.stake(1);
        vm.stopPrank();

        uint256[] memory locked = staking.stakedTokenIds(alice);
        assertEq(locked.length, 1);
        assertEq(locked[0], 1);

        vm.warp(block.timestamp + minLockSeconds + 1);
        vm.prank(alice);
        staking.unstake(1);
        locked = staking.stakedTokenIds(alice);
        assertEq(locked.length, 0);
    }
}

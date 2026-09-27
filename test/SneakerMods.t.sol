// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";

contract SneakerModsTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerGame game;
    SneakerMods mods;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    bytes32 constant PROOF1 = keccak256("mods-proof-1");
    bytes32 constant MODP1 = keccak256("mods-mod-1");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));

        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
    }

    // ─────────── Mint ───────────

    function test_MintAuthorized_StoresTraits() public {
        vm.prank(admin);
        uint256 tokenId = mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(5, 75, 2, 120, 255, false, MODP1));
        assertEq(tokenId, 1);
        SneakerMods.ModTraits memory t = mods.traitsOf(1);
        assertEq(t.slot, 5);
        assertEq(t.effectBps, 120);
        assertEq(t.tier, 2);
        assertFalse(t.consumable);
    }

    function test_MintAuthorized_RevertInvalidSlot() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMods: invalid slot");
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(7, 50, 1, 100, 255, false, MODP1));
    }

    function test_MintAuthorized_RevertDuplicateProof() public {
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 100, 255, false, MODP1));
        vm.expectRevert("SneakerMods: proof used");
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 100, 255, false, MODP1));
        vm.stopPrank();
    }

    function test_MintAuthorized_RevertNonMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 100, 255, false, MODP1));
    }

    // ─────────── Achievements ───────────

    function test_Claim_NftBalanceAchievement() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.NftBalance, 1, 0, 50, 1, 1_000, 255, false, URI, false));

        vm.prank(alice);
        uint256 modId = mods.claim(achId, 0);
        assertEq(mods.ownerOf(modId), alice);
        assertTrue(mods.achievementClaimed(achId, alice));
    }

    function test_Claim_StreakAchievement() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.SneakerStreak, 2, 4, 80, 2, 0, 255, false, URI, false));

        // Alice activates twice, 25h apart → streak 2.
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        game.activate(1);

        vm.prank(alice);
        uint256 modId = mods.claim(achId, 1);
        assertEq(mods.ownerOf(modId), alice);
    }

    function test_Claim_RevertRequirementNotMet() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.SneakerStreak, 7, 4, 80, 2, 0, 255, false, URI, false));
        vm.prank(alice);
        vm.expectRevert("SneakerMods: requirement not met");
        mods.claim(achId, 1);
    }

    function test_Claim_RevertDoubleClaim() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.NftBalance, 1, 0, 50, 1, 1_000, 255, false, URI, false));
        vm.prank(alice);
        mods.claim(achId, 0);
        vm.prank(alice);
        vm.expectRevert("SneakerMods: already claimed");
        mods.claim(achId, 0);
    }

    function test_Claim_StakedPolAchievement() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.StakedPol, 1 ether, 5, 70, 2, 150, 255, false, URI, false));

        vm.deal(alice, 5 ether);
        vm.prank(alice);
        staking.depositPOL{value: 2 ether}();

        vm.prank(alice);
        uint256 modId = mods.claim(achId, 0);
        assertEq(mods.ownerOf(modId), alice);
    }

    function test_Claim_RevertInactive() public {
        vm.prank(admin);
        uint256 achId = mods.addAchievement(SneakerMods.Achievement(SneakerMods.ReqKind.NftBalance, 1, 0, 50, 1, 1_000, 255, false, URI, false));
        vm.prank(admin);
        mods.setAchievementActive(achId, false);
        vm.prank(alice);
        vm.expectRevert("SneakerMods: achievement inactive");
        mods.claim(achId, 0);
    }

    // ─────────── Burn ───────────

    function test_Burn_OwnerOnly() public {
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 100, 255, true, MODP1));
        vm.prank(alice);
        mods.burn(1);
        vm.expectRevert();
        mods.ownerOf(1);
    }

    function test_Burn_RevertNonOwner() public {
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 100, 255, true, MODP1));
        vm.prank(bob);
        vm.expectRevert("SneakerMods: not authorized");
        mods.burn(1);
    }
}

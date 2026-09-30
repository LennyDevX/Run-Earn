// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {SneakerSwap} from "../contracts/SneakerSwap.sol";

contract SneakerSwapTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerGame game;
    SneakerMods mods;
    SneakerWorkshop workshop;
    SneakerSwap swap;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address carol = address(0xC0);

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(admin, address(nft), address(mods), address(game), address(staking), 5_000, 365 days);
        swap = new SneakerSwap(admin, address(nft), address(staking), address(workshop));

        vm.startPrank(admin);
        swap.setCollectionAllowed(address(mods), true);
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        mods.setWorkshop(address(workshop));

        // Sneakers: 1→alice, 2→bob. Mods: 1→alice (Sole), 2→bob (Boost).
        nft.mintAuthorized(alice, URI, keccak256("s1"), 50, 2);
        nft.mintAuthorized(bob, URI, keccak256("s2"), 90, 3);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 50, 1, 2_000, 255, false, keccak256("m1")));
        mods.mintAuthorized(bob, URI, SneakerMods.ModTraits(5, 70, 2, 150, 255, false, keccak256("m2")));
        vm.stopPrank();
    }

    // ─────────── Create ───────────

    function test_CreateSwap_EscrowsMakerNFTAndPOL() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 id = swap.createSwap{value: 1 ether}(address(0), address(nft), 1, address(nft), 2, 7 days);

        assertEq(nft.ownerOf(1), address(swap));
        assertEq(address(swap).balance, 1 ether);
        (address maker, address taker, , , , , uint256 topUp, , bool active) = swap.swaps(id);
        assertEq(maker, alice);
        assertEq(taker, address(0));
        assertEq(topUp, 1 ether);
        assertTrue(active);
    }

    function test_CreateSwap_RevertSameToken() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        vm.expectRevert("SneakerSwap: same token");
        swap.createSwap(address(0), address(nft), 1, address(nft), 1, 7 days);
    }

    function test_CreateSwap_RevertNotAllowedCollection() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        vm.expectRevert("SneakerSwap: collection not allowed");
        swap.createSwap(address(0), address(nft), 1, address(ren), 1, 7 days);
    }

    function test_CreateSwap_RevertEquippedSneaker() public {
        // Alice equips her Sole mod on sneaker 1, then can't swap the sneaker.
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1);

        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        vm.expectRevert("SneakerSwap: NFT has equipped mods");
        swap.createSwap(address(0), address(nft), 1, address(nft), 2, 7 days);
    }

    // ─────────── Accept ───────────

    function test_Accept_SwapsBothNFTsAndPOL() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 id = swap.createSwap{value: 1 ether}(address(0), address(nft), 1, address(nft), 2, 7 days);

        vm.prank(bob);
        nft.setApprovalForAll(address(swap), true);
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        swap.accept(id);

        assertEq(nft.ownerOf(2), alice);
        assertEq(nft.ownerOf(1), bob);
        assertEq(bob.balance, bobBefore + 1 ether);
    }

    function test_Accept_CrossCollectionSwap() public {
        // Alice trades her sneaker 1 for bob's Boost mod.
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        uint256 id = swap.createSwap(address(0), address(nft), 1, address(mods), 2, 7 days);

        vm.prank(bob);
        mods.setApprovalForAll(address(swap), true);
        vm.prank(bob);
        swap.accept(id);

        assertEq(mods.ownerOf(2), alice);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_Accept_RevertWrongTaker() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        uint256 id = swap.createSwap(carol, address(nft), 1, address(nft), 2, 7 days);

        vm.prank(bob);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(bob);
        vm.expectRevert("SneakerSwap: not the taker");
        swap.accept(id);
    }

    function test_Accept_RevertExpired() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        uint256 id = swap.createSwap(address(0), address(nft), 1, address(nft), 2, 7 days);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(bob);
        vm.expectRevert("SneakerSwap: swap expired");
        swap.accept(id);
    }

    // ─────────── Cancel ───────────

    function test_Cancel_ReturnsAssetsToMaker() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.deal(alice, 5 ether);
        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 id = swap.createSwap{value: 1 ether}(address(0), address(nft), 1, address(nft), 2, 7 days);

        vm.prank(alice);
        swap.cancel(id);
        assertEq(nft.ownerOf(1), alice);
        assertEq(alice.balance, before - 0 ether); // top-up refunded (gas aside in foundry)
    }

    function test_Cancel_AnyoneCanCleanExpired() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        uint256 id = swap.createSwap(address(0), address(nft), 1, address(nft), 2, 7 days);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(carol); // unrelated third party cleans up
        swap.cancel(id);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_Cancel_RevertUnauthorizedWhileActive() public {
        vm.prank(alice);
        nft.setApprovalForAll(address(swap), true);
        vm.prank(alice);
        uint256 id = swap.createSwap(address(0), address(nft), 1, address(nft), 2, 7 days);

        vm.prank(bob);
        vm.expectRevert("SneakerSwap: not authorized");
        swap.cancel(id);
    }
}

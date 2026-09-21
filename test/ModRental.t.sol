// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {ModRental} from "../contracts/ModRental.sol";

contract ModRentalTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerGame game;
    SneakerMods mods;
    SneakerWorkshop workshop;
    ModRental rental;

    address admin = address(0xA11CE);
    address alice = address(0xA1); // mod owner
    address bob = address(0xB0);   // renter

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];
    uint256 constant FEE_BPS = 250; // 2.5%

    function setUp() public {
        nft = new SneakerMint("RUN&EARN Sneakers", "RSNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("RUN&EARN Mods", "RMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(admin, address(nft), address(mods), address(game), address(staking), 250 ether, 5, 250, 10);
        rental = new ModRental(admin, address(mods), address(workshop), FEE_BPS, admin);

        vm.startPrank(admin);
        workshop.setRentalSource(address(rental));
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        mods.setWorkshop(address(workshop));

        // Sneaker 1 → bob. Upper mod (+25% earn) → alice.
        nft.mintAuthorized(bob, URI, keccak256("s-bob"), 50, 2);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(1, 60, 1, 2_500, 255, false, keccak256("m-upper")));
        // Consumable kit → alice (not rentable).
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 10, 0, 0, 255, true, keccak256("m-kit")));
        vm.stopPrank();
    }

    // ─────────── Listing ───────────

    function test_List_EscrowsMod() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        uint256 id = rental.list(1, 0.1 ether, 30 days);

        assertEq(mods.ownerOf(1), address(rental));
        (address owner_, uint256 modId, uint256 price, , address renter, , bool listed) = rental.rentals(id);
        assertEq(owner_, alice);
        assertEq(modId, 1);
        assertEq(price, 0.1 ether);
        assertEq(renter, address(0));
        assertTrue(listed);
    }

    function test_List_RevertEquippedMod() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        // give alice a sneaker so she can equip
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, keccak256("s-alice"), 50, 2);
        vm.prank(alice);
        workshop.equip(2, 1);

        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        vm.expectRevert("ModRental: mod equipped");
        rental.list(1, 0.1 ether, 30 days);
    }

    function test_List_RevertConsumable() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        vm.expectRevert("ModRental: consumables not rentable");
        rental.list(2, 0.1 ether, 30 days);
    }

    // ─────────── Renting ───────────

    function test_Rent_PaysOwnerMinusFee() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);

        uint256 aliceBefore = alice.balance;
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7); // 7 days × 0.1

        // Alice receives 0.7 − 2.5% = 0.6825
        assertEq(alice.balance, aliceBefore + 0.6825 ether);
        assertEq(rental.accumulatedFees(), 0.0175 ether);
        assertEq(rental.activeRenter(1), bob);
        assertTrue(rental.isActiveRental(1));
    }

    function test_Rent_RevertWrongPayment() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        vm.expectRevert("ModRental: wrong payment");
        rental.rent{value: 0.5 ether}(1, 7);
    }

    function test_EquipRented_ActivatesBoost() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);

        // Bob equips the rented Upper mod on his sneaker.
        vm.prank(bob);
        rental.equipRented(1, 1);

        assertEq(workshop.equippedTo(1), 1);
        assertEq(workshop.earnBonusBps(1), 2_500);
        // The mod is still in rental escrow.
        assertEq(mods.ownerOf(1), address(rental));
    }

    function test_EffectsLapseAtExpiry() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);
        vm.prank(bob);
        rental.equipRented(1, 1);
        assertEq(workshop.earnBonusBps(1), 2_500);

        vm.warp(block.timestamp + 8 days);
        // Expired: effect no longer counts even before cleanup.
        assertEq(workshop.earnBonusBps(1), 0);
        assertFalse(rental.isActiveRental(1));
    }

    function test_ReturnExpired_DetachesAndReturnsMod() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);
        vm.prank(bob);
        rental.equipRented(1, 1);

        vm.warp(block.timestamp + 8 days);
        vm.prank(admin); // anyone can clean up
        rental.returnExpired(1);

        assertEq(mods.ownerOf(1), alice);
        assertEq(workshop.equippedTo(1), 0);
        assertEq(rental.rentalOf(1), 0);
    }

    function test_ReleaseEarly_KeepsListing() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);
        vm.prank(bob);
        rental.equipRented(1, 1);

        vm.prank(bob);
        rental.releaseEarly(1);

        assertEq(rental.activeRenter(1), address(0));
        assertEq(workshop.equippedTo(1), 0);
        // Still listed — mod remains in escrow for the next renter.
        assertEq(mods.ownerOf(1), address(rental));
    }

    function test_Extend_AddsTime() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);

        (, , , , , uint64 untilBefore, ) = rental.rentals(1);
        vm.prank(bob);
        rental.extend{value: 0.5 ether}(1, 5);
        (, , , , , uint64 untilAfter, ) = rental.rentals(1);
        assertEq(untilAfter, untilBefore + 5 days);
    }

    function test_CancelListing_WhileNotRented() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.prank(alice);
        rental.cancelListing(1);
        assertEq(mods.ownerOf(1), alice);
        assertEq(rental.rentalOf(1), 0);
    }

    function test_CancelListing_RevertWhileRented() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(rental), true);
        vm.prank(alice);
        rental.list(1, 0.1 ether, 30 days);
        vm.deal(bob, 5 ether);
        vm.prank(bob);
        rental.rent{value: 0.7 ether}(1, 7);

        vm.prank(alice);
        vm.expectRevert("ModRental: currently rented");
        rental.cancelListing(1);
    }
}

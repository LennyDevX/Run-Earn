// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {ModStore} from "../contracts/ModStore.sol";

/// @dev Minimal PlayerProgress stub — only levelOf is consumed by ModStore.
contract MockProgress {
    mapping(address => uint8) public levels;
    function setLevel(address user, uint8 level) external {
        levels[user] = level;
    }
    function levelOf(address user) external view returns (uint8) {
        return levels[user];
    }
}

/// @dev Minimal SneakerVault stub — perks + eligibility + discount for ModStore.
contract MockVault {
    mapping(address => bool) public eligible;
    mapping(address => uint16) public discounts;
    uint256 public perkCount = 2;

    function setEligible(address user, bool value) external {
        eligible[user] = value;
    }

    function setDiscount(address user, uint16 bps) external {
        discounts[user] = bps;
    }

    function isEligible(address user, uint256) external view returns (bool) {
        return eligible[user];
    }

    function bestDiscountBps(address user) external view returns (uint16) {
        return discounts[user];
    }
}

contract ModStoreTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerGame game;
    SneakerMods mods;
    ModStore store;

    address admin = address(0xA11CE);
    address treasury = address(0x7EA);
    address alice = address(0xA1);

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        store = new ModStore(admin, address(mods), payable(treasury));

        bytes32 minterRole = mods.MINTER_ROLE();
        vm.prank(admin);
        mods.grantRole(minterRole, address(store));

        vm.prank(admin);
        store.addDesign(ModStore.ModDesign(
            "Swift Sole", URI, 0, 60, 1, 3_000, 255, false, 2 ether, 100, 0, 0, false
        ));
    }

    function test_Buy_MintsModAndPaysTreasury() public {
        uint256 treasuryBefore = treasury.balance;
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 modId = store.buy{value: 2 ether}(0);

        assertEq(mods.ownerOf(modId), alice);
        assertEq(treasury.balance, treasuryBefore + 2 ether);
        SneakerMods.ModTraits memory t = mods.traitsOf(modId);
        assertEq(t.slot, 0);
        assertEq(t.effectBps, 3_000);
    }

    function test_BuyBatch_MintsMultiple() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        store.buyBatch{value: 4 ether}(0, 2);
        assertEq(mods.balanceOf(alice), 2);
    }

    function test_Buy_RevertWrongPayment() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert("ModStore: wrong payment");
        store.buy{value: 1 ether}(0);
    }

    function test_Buy_RevertSupplyExhausted() public {
        vm.prank(admin);
        store.updateDesign(0, 2 ether, 1, true);
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        store.buy{value: 2 ether}(0);
        vm.prank(alice);
        vm.expectRevert("ModStore: supply exhausted");
        store.buy{value: 2 ether}(0);
    }

    function test_AddDesign_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        store.addDesign(ModStore.ModDesign(
            "X", URI, 0, 60, 1, 3_000, 255, false, 2 ether, 100, 0, 0, false
        ));
    }

    function test_Buy_RevertBelowRequiredLevel() public {
        MockProgress progress = new MockProgress();
        vm.startPrank(admin);
        store.setProgress(address(progress));
        // Skill design: level 3 required.
        store.addDesign(ModStore.ModDesign(
            "Overdrive", URI, 0, 80, 2, 5_000, 4, true, 1 ether, 100, 0, 3, false
        ));
        vm.stopPrank();

        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert("ModStore: level required");
        store.buy{value: 1 ether}(1);

        // Reaching the level unlocks the purchase.
        progress.setLevel(alice, 3);
        vm.prank(alice);
        uint256 modId = store.buy{value: 1 ether}(1);
        SneakerMods.ModTraits memory t = mods.traitsOf(modId);
        assertEq(t.aux, 4);
        assertTrue(t.consumable);
    }

    function test_SetDesignRequiredLevel_AdminOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        store.setDesignRequiredLevel(0, 5);

        vm.prank(admin);
        store.setDesignRequiredLevel(0, 5);
        assertEq(store.designs(0).requiredLevel, 5);
    }

    function test_WithdrawProceeds() public {
        vm.deal(address(store), 3 ether);
        uint256 before = admin.balance;
        vm.prank(admin);
        store.withdrawProceeds(admin);
        assertEq(admin.balance, before + 3 ether);
    }

    function test_SetDesignRequiredPerk_AdminOnly() public {
        MockVault vault = new MockVault();
        vm.startPrank(admin);
        store.setVault(address(vault));
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert();
        store.setDesignRequiredPerk(0, 1, true);

        vm.prank(admin);
        store.setDesignRequiredPerk(0, 1, true);
        assertEq(store.requiredPerkPlusOne(0), 2);
    }

    function test_SetDesignRequiredPerk_RevertUnknownPerk() public {
        MockVault vault = new MockVault();
        vm.startPrank(admin);
        store.setVault(address(vault));
        vm.expectRevert("ModStore: unknown perk");
        store.setDesignRequiredPerk(0, 5, true);
        vm.stopPrank();
    }

    function test_Buy_RevertPerkRequired() public {
        MockVault vault = new MockVault();
        vm.startPrank(admin);
        store.setVault(address(vault));
        store.setDesignRequiredPerk(0, 1, true);
        vm.stopPrank();

        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert("ModStore: perk required");
        store.buy{value: 2 ether}(0);

        vault.setEligible(alice, true);
        vm.prank(alice);
        uint256 modId = store.buy{value: 2 ether}(0);
        assertEq(mods.ownerOf(modId), alice);
    }

    function test_Buy_AppliesVaultDiscount() public {
        MockVault vault = new MockVault();
        vm.startPrank(admin);
        store.setVault(address(vault));
        vm.stopPrank();
        vault.setDiscount(alice, 1_000); // 10%

        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 modId = store.buy{value: 1.8 ether}(0);
        assertEq(mods.ownerOf(modId), alice);
    }

    function test_Buy_ZeroVaultPaysFullPrice() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        vm.expectRevert("ModStore: wrong payment");
        store.buy{value: 1.8 ether}(0);
    }
}

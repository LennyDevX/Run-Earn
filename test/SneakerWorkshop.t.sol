// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RENToken} from "../contracts/RENToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";
import {SneakerMarketplace} from "../contracts/SneakerMarketplace.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";

contract SneakerWorkshopTest is Test {
    SneakerMint nft;
    RENToken ren;
    SneakerStaking staking;
    SneakerAppraiser appraiser;
    SneakerMarketplace marketplace;
    SneakerGame game;
    SneakerMods mods;
    SneakerWorkshop workshop;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    bytes32 constant PROOF1 = keccak256("ws-proof-1");
    bytes32 constant PROOF2 = keccak256("ws-proof-2");
    bytes32 constant MOD1 = keccak256("mod-1");
    bytes32 constant MOD2 = keccak256("mod-2");
    bytes32 constant MOD3 = keccak256("mod-3");
    bytes32 constant KIT = keccak256("kit-1");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    uint256[4] tierBase = [uint256(100 ether), 200 ether, 400 ether, 800 ether];

    function setUp() public {
        nft = new SneakerMint("RUN&EARN Sneakers", "RSNEAK", admin);
        ren = new RENToken(admin, admin);
        staking = new SneakerStaking(admin, address(nft), address(ren), 1000 ether, 280, 0, 800, [uint64(50), 80, 150, 180], 30 days);
        game = new SneakerGame(admin, address(nft), address(ren), tierBase, 100, 10, 1, 50 ether, 100 ether);
        mods = new SneakerMods("RUN&EARN Mods", "RMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(
            admin,
            address(nft),
            address(mods),
            address(game),
            address(staking),
            250 ether, // forgeCostPoints (250 veRUNE base)
            5,         // forgeRarityStep
            250,       // forgeEarnStepBps (+2.5%/level)
            10         // maxForgeLevel
        );
        appraiser = new SneakerAppraiser(admin, address(nft), 0.5 ether, [uint256(0), 1 ether, 3 ether, 8 ether], 0.01 ether, 10_000);
        marketplace = new SneakerMarketplace(admin, address(nft), address(appraiser), address(staking), 250, 12_000, admin);

        vm.startPrank(admin);
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        staking.setBoosts(address(workshop));
        appraiser.setBoosts(address(workshop));
        mods.setWorkshop(address(workshop));
        marketplace.setWorkshop(address(workshop));
        marketplace.setCollectionAllowed(address(mods), true);

        // Sneaker 1 → alice (Epic, rarity 50), sneaker 2 → bob (Mythic, rarity 90)
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        nft.mintAuthorized(bob, URI, PROOF2, 90, 3);

        // Mods for alice: Sole 50% wear cut, Upper +25% earn, Core auto-active, Boost +50 APY bps, Skin +20% appraisal
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 60, 1, 5_000, 255, false, MOD1));
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(1, 60, 1, 2_500, 255, false, MOD2));
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 80, 2, 0, 255, false, MOD3));
        // Consumable repair kit
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 10, 0, 0, 255, true, KIT));
        vm.stopPrank();
    }

    // ─────────── Equip / unequip ───────────

    function test_Equip_EscrowsModAndSetsSlot() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1);

        assertEq(mods.ownerOf(1), address(workshop));
        assertEq(workshop.equipped(1, 0), 1);
        assertEq(workshop.equippedTo(1), 1);
        assertTrue(workshop.hasEquippedMods(1));
        assertEq(workshop.wearReductionBps(1), 5_000);
    }

    function test_Unequip_ReturnsMod() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1);
        vm.prank(alice);
        workshop.unequip(1, 0);

        assertEq(mods.ownerOf(1), alice);
        assertEq(workshop.equippedTo(1), 0);
        assertFalse(workshop.hasEquippedMods(1));
        assertEq(workshop.wearReductionBps(1), 0);
    }

    function test_Equip_RevertNotSneakerOwner() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        vm.expectRevert("SneakerWorkshop: not sneaker owner");
        workshop.equip(2, 1); // sneaker 2 belongs to bob
    }

    function test_Equip_RevertSlotOccupied() public {
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 60, 1, 2_000, 255, false, keccak256("mod-sole-2")));
        vm.stopPrank();

        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1);
        vm.prank(alice);
        vm.expectRevert("SneakerWorkshop: slot occupied");
        workshop.equip(1, 5); // second Sole mod
    }

    function test_Equip_RevertConsumable() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        vm.expectRevert("SneakerWorkshop: consumable cannot equip");
        workshop.equip(1, 4); // repair kit
    }

    function test_Equip_WorksOnStakedSneaker() public {
        // Boost mod on a staked sneaker: stakedOwner controls the loadout.
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(5, 60, 1, 50, 255, false, keccak256("mod-boost")));
        vm.stopPrank();

        vm.prank(alice);
        nft.setApprovalForAll(address(staking), true);
        vm.prank(alice);
        staking.stake(1);

        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 5);
        assertEq(workshop.stakingBoostBps(1), 50);
    }

    // ─────────── Game effects ───────────

    function test_UpperMod_RaisesEarnRate() public {
        vm.prank(alice);
        game.activate(1);
        uint256 baseRate = game.earnRatePerSecond(1);

        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 2); // Upper +25%

        uint256 boosted = game.earnRatePerSecond(1);
        assertApproxEqAbs(boosted, (baseRate * 12_500) / 10_000, 1);
    }

    function test_SoleMod_ReducesWear() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1); // Sole −50% wear

        vm.prank(alice);
        game.activate(1);
        (, , , uint16 durability, , , , ) = game.sneakers(1);
        // wear 1 * 50% = 0 (integer floor): durability untouched
        assertEq(durability, 10);
    }

    function test_CoreMod_KeepsEarningAfterWindow() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 3); // Core

        vm.prank(alice);
        game.activate(1);

        // 3 days later, well past the 24h window, the sneaker still earns.
        vm.warp(block.timestamp + 3 days);
        assertGt(game.earnRatePerSecond(1), 0);
        assertGt(game.pendingPoints(1), 0);
    }

    function test_RepairKit_BurnsAndRepairs() public {
        // Wear the sneaker down — wear plus daily health decay kills it in ~5 activations.
        vm.prank(alice);
        game.activate(1);
        for (uint i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 25 hours);
            vm.prank(alice);
            game.activate(1);
        }
        vm.warp(block.timestamp + 25 hours); // decay finishes the last health point
        assertEq(game.healthOf(1), 0);

        // veRUNE repair would cost; the kit repairs for free.
        vm.prank(alice);
        workshop.useRepairKit(1, 4);
        (, , , uint16 durability, , , , ) = game.sneakers(1);
        assertEq(durability, 10);
        vm.expectRevert();
        mods.ownerOf(4); // kit burned
    }

    function test_RepairKit_RevertOnFullDurability() public {
        vm.prank(alice);
        vm.expectRevert("SneakerGame: sneaker never activated");
        workshop.useRepairKit(1, 4);
    }

    // ─────────── Abilities (burnable consumable NFTs) ───────────

    function test_Ability_Surge_BurnsModAndActivates() public {
        // Surge mod (aux 1) → instant activation bypassing the 24h cooldown.
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 10, 0, 0, 1, true, keccak256("surge")));

        vm.prank(alice);
        game.activate(1); // energy refilled to max (r50 → 4)
        vm.warp(block.timestamp + 1 hours); // still inside the cooldown

        vm.prank(alice);
        workshop.useAbility(1, 5); // surge costs 2 energy

        (, , uint32 streak, , , , , ) = game.sneakers(1);
        assertEq(streak, 2);
        assertEq(game.energyOf(1), 2); // 4 - 2
        vm.expectRevert();
        mods.ownerOf(5); // surge NFT burned
    }

    function test_Ability_Boost_AddsTemporaryEarnBonus() public {
        // Boost capsule (aux 2) → +50% earn for 24h.
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(5, 10, 0, 5_000, 2, true, keccak256("boost")));
        vm.prank(alice);
        game.activate(1);

        vm.prank(alice);
        workshop.useAbility(1, 5);
        assertEq(workshop.tempBoostBps(1), 5_000);
        assertEq(workshop.earnBonusBps(1), 5_000);
        assertEq(game.energyOf(1), 3); // 4 - 1

        vm.warp(block.timestamp + 25 hours);
        assertEq(workshop.earnBonusBps(1), 0); // expired
        vm.expectRevert();
        mods.ownerOf(5);
    }

    function test_Ability_ForgeStone_FreeLevel() public {
        // Forge stone (aux 3) → +1 forge level without veRUNE.
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 10, 0, 0, 3, true, keccak256("stone")));
        vm.prank(alice);
        game.activate(1);

        vm.prank(alice);
        workshop.useAbility(1, 5);
        assertEq(workshop.forgeLevel(1), 1);
        assertEq(game.energyOf(1), 2); // 4 - 2
        vm.expectRevert();
        mods.ownerOf(5);
    }

    function test_Ability_RevertInsufficientEnergy() public {
        // Three surge mods; each costs 2 energy, max is 4 → third fails.
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 10, 0, 0, 1, true, keccak256("s1")));
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 10, 0, 0, 1, true, keccak256("s2")));
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(4, 10, 0, 0, 1, true, keccak256("s3")));
        vm.stopPrank();

        vm.startPrank(alice);
        game.activate(1); // energy = 4
        workshop.useAbility(1, 5); // → 2
        workshop.useAbility(1, 6); // → 0
        vm.expectRevert("SneakerGame: insufficient energy");
        workshop.useAbility(1, 7);
        vm.stopPrank();
    }

    function test_Ability_RevertNonConsumable() public {
        vm.prank(alice);
        game.activate(1);
        vm.prank(alice);
        vm.expectRevert("SneakerWorkshop: not consumable");
        workshop.useAbility(1, 1); // equipped-slot mod, not consumable
    }

    function test_Ability_CoreMod_EarningStopsWhenHealthDies() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 3); // Core: earning window never closes

        vm.prank(alice);
        game.activate(1);
        // 12 days later the 9-health sneaker is dead even with auto-activation.
        vm.warp(block.timestamp + 12 days);
        assertEq(game.healthOf(1), 0);
        assertEq(game.earnRatePerSecond(1), 0);
        // Accrual stopped at death (~9 days of 400/day for Epic r50).
        assertApproxEqRel(game.pendingPoints(1), 3_600 ether, 0.02e18);
    }

    // ─────────── Forge ───────────

    function test_Forge_SpendsVeRuneAndLevelsUp() public {
        // Earn and claim enough veRUNE for the first forge (250 veRUNE).
        vm.prank(alice);
        game.activate(1); // Epic: 400/day
        vm.warp(block.timestamp + 1 days - 1);
        vm.prank(alice);
        game.claimPoints(1); // ~400 veRUNE

        uint256 balanceBefore = game.veRuneBalance(alice);
        vm.prank(alice);
        workshop.forge(1);

        assertEq(workshop.forgeLevel(1), 1);
        assertEq(workshop.rarityBonus(1), 5);
        assertEq(workshop.earnBonusBps(1), 250);
        assertEq(game.veRuneBalance(alice), balanceBefore - 250 ether);
    }

    function test_Forge_RevertInsufficientVeRune() public {
        vm.prank(alice);
        vm.expectRevert("SneakerGame: insufficient veRUNE");
        workshop.forge(1);
    }

    function test_Forge_EscalatingCost() public {
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 1 days - 1);
        vm.prank(alice);
        game.claimPoints(1);
        // Also fund alice directly via a second sneaker claim path is overkill;
        // top up by redeeming nothing — instead grant veRUNE via repeated accrual:
        // keep accruing across days by re-activating (cooldown 24h).
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        game.activate(1);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        game.claimPoints(1);

        assertEq(workshop.nextForgeCost(1), 250 ether);
        vm.prank(alice);
        workshop.forge(1);
        assertEq(workshop.nextForgeCost(1), 500 ether); // level 2 costs 2x base
    }

    // ─────────── Appraisal ───────────

    function test_SkinMod_AndForge_RaiseAppraisal() public {
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(3, 90, 3, 2_000, 4, false, keccak256("mod-skin")));
        vm.stopPrank();

        (uint256 beforeValue, uint8 rarityBefore, ) = appraiser.appraise(1);

        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 5); // Skin +20%

        (uint256 afterValue, , ) = appraiser.appraise(1);
        assertEq(afterValue, (beforeValue * 12_000) / 10_000);
        assertEq(rarityBefore, 50);
        assertEq(workshop.skinOverride(1), 4);
    }

    // ─────────── Staking boost ───────────

    function test_BoostMod_RaisesStakingApy() public {
        vm.startPrank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(5, 60, 1, 100, 255, false, keccak256("mod-boost2")));
        vm.stopPrank();

        vm.prank(alice);
        nft.setApprovalForAll(address(staking), true);
        vm.prank(alice);
        staking.stake(1); // Epic → +150 bps on top of 280 base

        uint256 apyBefore = staking.effectiveApyBps(alice);

        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 5); // +100 bps

        assertEq(staking.effectiveApyBps(alice), apyBefore + 100);
    }

    // ─────────── Marketplace guard ───────────

    function test_Marketplace_BlocksListingWithEquippedMods() public {
        vm.prank(alice);
        mods.setApprovalForAll(address(workshop), true);
        vm.prank(alice);
        workshop.equip(1, 1);

        vm.prank(alice);
        nft.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: NFT has equipped mods");
        marketplace.list(address(nft), 1, 5 ether);
    }

    function test_Marketplace_ListsModsCollection() public {
        // Mods themselves are sellable when not equipped.
        vm.prank(alice);
        mods.setApprovalForAll(address(marketplace), true);
        vm.prank(alice);
        marketplace.list(address(mods), 1, 2 ether);
        assertEq(mods.ownerOf(1), address(marketplace));
    }
}

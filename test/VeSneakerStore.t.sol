// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {VeSneakerStore} from "../contracts/VeSneakerStore.sol";

contract VeSneakerStoreTest is Test {
    SneakerMint nft;
    VeSneakerStore store;

    address admin = address(0xA11CE);
    address treasury = address(0x7EE);
    address alice = address(0xA1);
    address bob = address(0xB0);

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVmVTbmVha2VyIn0";

    // USD targets $40/$62/$97/$150 converted at POL = $0.09764
    uint256 constant COMMON_PRICE = 410 ether;
    uint256 constant RARE_PRICE = 635 ether;
    uint256 constant EPIC_PRICE = 993 ether;
    uint256 constant MYTHIC_PRICE = 1536 ether;

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        store = new VeSneakerStore(admin, address(nft), payable(treasury));

        // Grant the store MINTER_ROLE so it can mint on demand.
        // Read the role first: vm.prank applies to the very next external call.
        bytes32 minterRole = nft.MINTER_ROLE();
        vm.prank(admin);
        nft.grantRole(minterRole, address(store));

        // Register four rarity tiers to exercise all store pricing paths.
        vm.startPrank(admin);
        store.addDesign("Ember Trail", URI, 20, 0, COMMON_PRICE, 1000);
        store.addDesign("Sky Drift", URI, 45, 1, RARE_PRICE, 1000);
        store.addDesign("Magma Rush", URI, 65, 2, EPIC_PRICE, 1000);
        store.addDesign("Neon Runner", URI, 85, 3, MYTHIC_PRICE, 1000);
        vm.stopPrank();
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsState() public view {
        assertEq(address(store.nft()), address(nft));
        assertEq(store.treasury(), treasury);
        assertEq(store.designCount(), 4);
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("VeSneakerStore: zero admin");
        new VeSneakerStore(address(0), address(nft), payable(treasury));
    }

    function test_Constructor_RevertZeroTreasury() public {
        vm.expectRevert("VeSneakerStore: zero treasury");
        new VeSneakerStore(admin, address(nft), payable(address(0)));
    }

    // ─────────── Designs ───────────

    function test_AddDesign_StoresMetadata() public view {
        VeSneakerStore.Design memory design = store.designs(3);
        assertEq(design.name, "Neon Runner");
        assertEq(design.rarity, 85);
        assertEq(design.tier, 3);
        assertEq(design.price, MYTHIC_PRICE);
        assertEq(design.maxSupply, 1000);
        assertEq(design.minted, 0);
        assertTrue(design.active);
    }

    function test_AddDesign_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        store.addDesign("X", URI, 20, 0, 1 ether, 10);
    }

    function test_AddDesign_RevertInvalidTier() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: invalid tier");
        store.addDesign("X", URI, 20, 4, 1 ether, 10);
    }

    function test_AddDesign_RevertZeroPrice() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: zero price");
        store.addDesign("X", URI, 20, 0, 0, 10);
    }

    // ─────────── Buy ───────────

    function test_Buy_MintsAndPaysTreasury() public {
        vm.deal(alice, 10_000 ether);
        uint256 treasuryBefore = treasury.balance;

        vm.prank(alice);
        uint256 tokenId = store.buy{value: COMMON_PRICE}(0);

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(treasury.balance, treasuryBefore + COMMON_PRICE);
        assertEq(store.remaining(0), 999);
        assertEq(store.designs(0).minted, 1);
    }

    function test_Buy_ReadsRarityAndTierFromDesign() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        store.buy{value: MYTHIC_PRICE}(3);

        SneakerMint.SneakerTraits memory traits = nft.traitsOf(1);
        assertEq(traits.rarity, 85);
        assertEq(traits.tier, 3);
    }

    function test_Buy_UniqueProofPerCopy() public {
        vm.deal(alice, 10_000 ether);
        vm.startPrank(alice);
        store.buy{value: COMMON_PRICE}(0);
        store.buy{value: COMMON_PRICE}(0);
        vm.stopPrank();

        bytes32 first = nft.traitsOf(1).proofHash;
        bytes32 second = nft.traitsOf(2).proofHash;
        assertTrue(first != second);
    }

    function test_Buy_RevertWrongPayment() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: wrong payment");
        store.buy{value: COMMON_PRICE - 1}(0);
    }

    function test_Buy_RevertInactiveDesign() public {
        vm.prank(admin);
        store.updateDesign(0, COMMON_PRICE, 1000, false);

        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: design inactive");
        store.buy{value: COMMON_PRICE}(0);
    }

    function test_Buy_RevertUnknownDesign() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: unknown design");
        store.buy{value: 1 ether}(99);
    }

    function test_Buy_RevertWhenPaused() public {
        vm.prank(admin);
        store.pause();
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert();
        store.buy{value: COMMON_PRICE}(0);
    }

    // ─────────── Buy batch ───────────

    function test_BuyBatch_MintsMultipleCopies() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        uint256 firstTokenId = store.buyBatch{value: COMMON_PRICE * 5}(0, 5);

        assertEq(firstTokenId, 1);
        assertEq(nft.balanceOf(alice), 5);
        assertEq(store.designs(0).minted, 5);
        assertEq(store.remaining(0), 995);
    }

    function test_BuyBatch_RevertInvalidQuantity() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: invalid quantity");
        store.buyBatch{value: COMMON_PRICE}(0, 1);
    }

    function test_BuyBatch_RevertOverBatchLimit() public {
        vm.deal(alice, 100_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: invalid quantity");
        store.buyBatch{value: COMMON_PRICE * 21}(0, 21);
    }

    // ─────────── Supply cap ───────────

    function test_Buy_RevertSupplyExhausted() public {
        vm.prank(admin);
        store.updateDesign(0, COMMON_PRICE, 2, true);

        vm.deal(alice, 10_000 ether);
        vm.startPrank(alice);
        store.buy{value: COMMON_PRICE}(0);
        store.buy{value: COMMON_PRICE}(0);
        vm.expectRevert("VeSneakerStore: supply exhausted");
        store.buy{value: COMMON_PRICE}(0);
        vm.stopPrank();
    }

    function test_UpdateDesign_RevertSupplyBelowMinted() public {
        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        store.buyBatch{value: COMMON_PRICE * 5}(0, 5);

        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: supply below minted");
        store.updateDesign(0, COMMON_PRICE, 3, true);
    }

    // ─────────── Reserve ───────────

    function test_ReserveMint_CountsAgainstSupply() public {
        vm.prank(admin);
        store.reserveMint(0, treasury, 10);
        assertEq(store.designs(0).minted, 10);
        assertEq(nft.balanceOf(treasury), 10);
        assertEq(store.remaining(0), 990);
    }

    function test_ReserveMint_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        store.reserveMint(0, alice, 1);
    }

    // ─────────── Views ───────────

    function test_Quote_ReturnsTotal() public view {
        assertEq(store.quote(3, 3), MYTHIC_PRICE * 3);
    }

    function test_IsAvailable_ReflectsState() public {
        assertTrue(store.isAvailable(0));
        vm.prank(admin);
        store.updateDesign(0, COMMON_PRICE, 1000, false);
        assertFalse(store.isAvailable(0));
        assertFalse(store.isAvailable(99));
    }

    function test_PriceOf_PerDesign() public view {
        assertEq(store.priceOf(0), COMMON_PRICE);
        assertEq(store.priceOf(1), RARE_PRICE);
        assertEq(store.priceOf(2), EPIC_PRICE);
        assertEq(store.priceOf(3), MYTHIC_PRICE);
    }

    // ─────────── Admin ───────────

    function test_UpdateDesign_ChangesPriceAndSupply() public {
        vm.prank(admin);
        store.updateDesign(1, 5 ether, 500, true);
        assertEq(store.priceOf(1), 5 ether);
        assertEq(store.designs(1).maxSupply, 500);
    }

    function test_UpdateDesignUri() public {
        vm.prank(admin);
        store.updateDesignUri(0, "ipfs://new-uri");
        assertEq(store.designs(0).uri, "ipfs://new-uri");
    }

    function test_SetTreasury() public {
        vm.prank(admin);
        store.setTreasury(payable(bob));
        assertEq(store.treasury(), bob);
    }

    function test_WithdrawProceeds() public {
        vm.deal(address(store), 5 ether);
        vm.prank(admin);
        store.withdrawProceeds(bob);
        assertEq(bob.balance, 5 ether);
        assertEq(address(store).balance, 0);
    }

    function test_WithdrawProceeds_RevertNoBalance() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: no proceeds");
        store.withdrawProceeds(bob);
    }

    function test_Receive_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent, ) = address(store).call{value: 1 ether}("");
        assertFalse(sent);
    }

    // ─────────── Fuzz ───────────

    function testFuzz_Buy_QuantityAndPayment(uint16 quantity) public {
        quantity = uint16(bound(quantity, 2, 20));
        vm.deal(alice, 100_000 ether);
        vm.prank(alice);
        store.buyBatch{value: COMMON_PRICE * quantity}(0, quantity);
        assertEq(nft.balanceOf(alice), quantity);
        assertEq(store.designs(0).minted, quantity);
    }
}

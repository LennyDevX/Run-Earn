// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {VeSneakerStore} from "../contracts/VeSneakerStore.sol";

/// @dev Minimal SneakerVault stub — perks + eligibility + discount for the store.
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

/// @dev Chainlink aggregator stub. The answer and the timestamp are settable so
///      the staleness guard and the feed-decimals scaling can both be exercised
///      without a live oracle.
contract MockAggregator {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;

    constructor(uint8 decimals_, int256 answer_, uint256 updatedAt_) {
        decimals = decimals_;
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function setAnswer(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

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

    // ─────────── Vault perks ───────────

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
        vm.expectRevert("VeSneakerStore: unknown perk");
        store.setDesignRequiredPerk(0, 9, true);
        vm.stopPrank();
    }

    function test_SetDesignRequiredPerk_RevertVaultNotSet() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: vault not set");
        store.setDesignRequiredPerk(0, 1, true);
    }

    function test_Buy_RevertPerkRequired() public {
        MockVault vault = new MockVault();
        vm.startPrank(admin);
        store.setVault(address(vault));
        store.setDesignRequiredPerk(0, 1, true);
        vm.stopPrank();

        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        vm.expectRevert("VeSneakerStore: perk required");
        store.buy{value: COMMON_PRICE}(0);

        vault.setEligible(alice, true);
        vm.prank(alice);
        uint256 tokenId = store.buy{value: COMMON_PRICE}(0);
        assertEq(nft.ownerOf(tokenId), alice);
    }

    function test_Buy_AppliesVaultDiscount() public {
        MockVault vault = new MockVault();
        vm.prank(admin);
        store.setVault(address(vault));
        vault.setDiscount(alice, 1_000); // 10%

        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        uint256 tokenId = store.buy{value: (COMMON_PRICE * 9_000) / 10_000}(0);
        assertEq(nft.ownerOf(tokenId), alice);
    }

    function test_Quote_AppliesVaultDiscount() public {
        MockVault vault = new MockVault();
        vm.prank(admin);
        store.setVault(address(vault));
        vault.setDiscount(alice, 2_500); // 25%

        vm.prank(alice);
        assertEq(store.quote(0, 2), (COMMON_PRICE * 2 * 7_500) / 10_000);
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

    // ─────────── USD-target pricing (Chainlink) ───────────

    /// $0.09764 per POL, as Chainlink reports it with 8 decimals.
    uint256 constant POL_USD_8DEC = 9_764_000;

    function _wireFeed(uint8 decimals_, int256 answer_) internal returns (MockAggregator feed) {
        feed = new MockAggregator(decimals_, answer_, block.timestamp);
        vm.prank(admin);
        store.setPolUsdFeed(address(feed));
    }

    function test_SetPolUsdFeed_AdminOnly() public {
        MockAggregator feed = new MockAggregator(8, int256(POL_USD_8DEC), block.timestamp);
        vm.prank(alice);
        vm.expectRevert();
        store.setPolUsdFeed(address(feed));

        vm.prank(admin);
        store.setPolUsdFeed(address(feed));
        assertEq(store.polUsdFeed(), address(feed));
    }

    function test_PolUsdPrice_RevertFeedNotSet() public {
        vm.expectRevert("VeSneakerStore: feed not set");
        store.polUsdPrice();
    }

    function test_PolUsdPrice_ReturnsAnswerAndFeedDecimals() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        (uint256 answer, uint8 decimals) = store.polUsdPrice();
        assertEq(answer, POL_USD_8DEC);
        assertEq(decimals, 8);
    }

    function test_PolUsdPrice_RevertStaleFeed() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        // Default guard is 2 hours.
        skip(3 hours);
        vm.expectRevert("VeSneakerStore: stale feed");
        store.polUsdPrice();
    }

    function test_PolUsdPrice_RevertNonPositiveAnswer() public {
        MockAggregator feed = _wireFeed(8, 0);
        vm.expectRevert("VeSneakerStore: invalid feed answer");
        store.polUsdPrice();

        feed.setAnswer(-1, block.timestamp);
        vm.expectRevert("VeSneakerStore: invalid feed answer");
        store.polUsdPrice();
    }

    function test_SetDesignUsdTarget_StoresWithoutTouchingPrice() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000); // $40

        assertEq(store.usdTargetCents(0), 4_000);
        // The manual POL price stands until an explicit sync, so setting a
        // target can never revert on a stale feed.
        assertEq(store.priceOf(0), COMMON_PRICE);
    }

    function test_SetDesignUsdTarget_AdminOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        store.setDesignUsdTarget(0, 4_000);
    }

    function test_SetDesignUsdTarget_RevertUnknownDesign() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: unknown design");
        store.setDesignUsdTarget(99, 4_000);
    }

    function test_SyncDesignPrice_ConvertsTargetAtFeedRate() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000); // $40
        store.syncDesignPrice(0);
        vm.stopPrank();

        // $40 at $0.09764/POL is ~409.67 POL, matching the deploy-time ladder.
        assertApproxEqRel(store.priceOf(0), 409.668 ether, 0.01 ether);
    }

    function test_SyncDesignPrice_ExactAtParityRate() public {
        // At exactly $1.00 per POL a $40 target is exactly 40 POL.
        _wireFeed(8, 100_000_000);
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        vm.stopPrank();

        assertEq(store.priceOf(0), 40 ether);
    }

    function test_SyncDesignPrice_RevertNoTarget() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.expectRevert("VeSneakerStore: no USD target");
        store.syncDesignPrice(0);
    }

    function test_SyncDesignPrice_RevertFeedNotSet() public {
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000);

        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: feed not set");
        store.syncDesignPrice(0);
    }

    function test_SyncDesignPrice_PermissionlessWhenNeverSynced() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000);

        // Never synced counts as due, so a stranger can seed the price.
        vm.prank(bob);
        store.syncDesignPrice(0);
        assertGt(store.priceOf(0), 0);
    }

    function test_SyncDesignPrice_RevertNotDueForStranger() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        vm.stopPrank();

        // Inside the 6h window only a privileged caller may refresh.
        vm.prank(bob);
        vm.expectRevert("VeSneakerStore: price sync not due");
        store.syncDesignPrice(0);
    }

    function test_SyncDesignPrice_KeeperRoleCanForce() public {
        _wireFeed(8, int256(POL_USD_8DEC));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        store.grantRole(store.PRICE_SYNC_ROLE(), bob);
        vm.stopPrank();

        vm.prank(bob);
        store.syncDesignPrice(0);
        assertGt(store.priceOf(0), 0);
    }

    function test_SyncDesignPrice_PermissionlessAfterInterval() public {
        MockAggregator feed = _wireFeed(8, int256(POL_USD_8DEC));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        vm.stopPrank();

        skip(7 hours);
        // Refresh the oracle too. This test is about the sync window, and a
        // 7-hour-old answer would trip the staleness guard first — which is
        // exactly the interaction the default guard has to be sized against.
        feed.setAnswer(int256(POL_USD_8DEC), block.timestamp);

        vm.prank(bob);
        store.syncDesignPrice(0);
        assertGt(store.priceOf(0), 0);
    }

    function test_SyncDesignPrice_TracksFeedMovement() public {
        MockAggregator feed = _wireFeed(8, int256(POL_USD_8DEC));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        uint256 cheapPol = store.priceOf(0);

        // POL doubles, so the same USD target now costs half as much POL.
        feed.setAnswer(19_528_000, block.timestamp);
        store.syncDesignPrice(0);
        uint256 richPol = store.priceOf(0);
        vm.stopPrank();

        assertApproxEqRel(richPol, cheapPol / 2, 0.01 ether);
    }

    function test_SyncAllPrices_UpdatesOnlyTargetedDesigns() public {
        _wireFeed(8, 100_000_000); // $1.00 per POL
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.setDesignUsdTarget(2, 9_700);
        uint256 synced = store.syncAllPrices();
        vm.stopPrank();

        assertEq(synced, 2);
        assertEq(store.priceOf(0), 40 ether);
        assertEq(store.priceOf(2), 97 ether);
        // Design 1 has no target and keeps its manual price.
        assertEq(store.priceOf(1), RARE_PRICE);
    }

    function test_SyncAllPrices_RevertNonPrivileged() public {
        _wireFeed(8, 100_000_000);
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000);

        vm.prank(bob);
        vm.expectRevert("VeSneakerStore: not price syncer");
        store.syncAllPrices();
    }

    function test_LivePriceOf_ReadsWithoutWriting() public {
        _wireFeed(8, 100_000_000);
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000);

        assertEq(store.livePriceOf(0), 40 ether);
        assertEq(store.priceOf(0), COMMON_PRICE);
    }

    function test_LivePriceOf_RevertNoTarget() public {
        _wireFeed(8, 100_000_000);
        vm.expectRevert("VeSneakerStore: no USD target");
        store.livePriceOf(0);
    }

    function test_Buy_UsesSyncedPrice() public {
        _wireFeed(8, 100_000_000); // $1.00 per POL
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, 4_000);
        store.syncDesignPrice(0);
        vm.stopPrank();

        uint256 treasuryBefore = treasury.balance;
        vm.deal(alice, 1_000 ether);
        vm.prank(alice);
        store.buy{value: 40 ether}(0);

        assertEq(treasury.balance, treasuryBefore + 40 ether);
    }

    function test_SetPriceFeedParams_UpdatesGuards() public {
        vm.prank(admin);
        store.setPriceFeedParams(30 minutes, 1 hours);
        assertEq(store.maxFeedStaleness(), 30 minutes);
        assertEq(store.priceSyncInterval(), 1 hours);
    }

    function test_SetPriceFeedParams_RevertZeroStaleness() public {
        vm.prank(admin);
        vm.expectRevert("VeSneakerStore: zero staleness");
        store.setPriceFeedParams(0, 1 hours);
    }

    function test_SetPriceFeedParams_AdminOnly() public {
        vm.prank(alice);
        vm.expectRevert();
        store.setPriceFeedParams(1 hours, 1 hours);
    }

    function test_FeedDisabled_DesignKeepsManualPrice() public {
        // No feed wired: the store behaves exactly as it did before.
        vm.prank(admin);
        store.setDesignUsdTarget(0, 4_000);

        vm.deal(alice, 10_000 ether);
        vm.prank(alice);
        store.buy{value: COMMON_PRICE}(0);
        assertEq(store.priceOf(0), COMMON_PRICE);
    }

    function testFuzz_SyncDesignPrice_MatchesFormula(uint256 usdCents, uint256 feedPrice) public {
        usdCents = bound(usdCents, 1, 1_000_000); // up to $10,000
        feedPrice = bound(feedPrice, 1e4, 1e12); // $0.0001 .. $10,000 per POL

        _wireFeed(8, int256(feedPrice));
        vm.startPrank(admin);
        store.setDesignUsdTarget(0, usdCents);
        store.syncDesignPrice(0);
        vm.stopPrank();

        // price = usdCents * 10^decimals * 1e18 / (100 * feedPrice)
        uint256 expected = (usdCents * 1e8 * 1e18) / (100 * feedPrice);
        assertEq(store.priceOf(0), expected);
        assertGt(store.priceOf(0), 0);
    }
}

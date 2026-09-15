// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {RUNEToken} from "../contracts/RUNEToken.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";
import {SneakerMarketplace} from "../contracts/SneakerMarketplace.sol";

contract SneakerMarketplaceTest is Test {
    SneakerMint nft;
    RUNEToken ren;
    SneakerStaking staking;
    SneakerAppraiser appraiser;
    SneakerMarketplace marketplace;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address carol = address(0xC0);

    bytes32 constant PROOF1 = keccak256("mkt-proof-1");
    bytes32 constant PROOF2 = keccak256("mkt-proof-2");
    bytes32 constant PROOF3 = keccak256("mkt-proof-3");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    uint256 constant FEE_BPS = 250; // 2.5%
    uint256 constant PREMIUM_BPS = 12_000; // 1.2x appraiser value

    function setUp() public {
        nft = new SneakerMint("RUN&EARN Sneakers", "RSNEAK", admin);
        ren = new RUNEToken(admin, admin);
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(ren),
            1000 * 10 ** 18,
            280,
            0,
            800,
            [uint64(50), 80, 150, 180],
            30 days
        );
        appraiser = new SneakerAppraiser(
            admin,
            address(nft),
            0.5 ether,
            [uint256(0), 1 ether, 3 ether, 8 ether],
            0.01 ether,
            10_000
        );
        marketplace = new SneakerMarketplace(
            admin,
            address(nft),
            address(appraiser),
            address(staking),
            FEE_BPS,
            PREMIUM_BPS,
            admin
        );

        // Mint NFTs: token 1 for alice (Epic), token 2 for bob (Mythic)
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF1, 50, 2);
        nft.mintAuthorized(bob, URI, PROOF2, 90, 3);
        vm.stopPrank();

        // Approvals
        vm.prank(alice);
        nft.setApprovalForAll(address(marketplace), true);
        vm.prank(bob);
        nft.setApprovalForAll(address(marketplace), true);
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsParams() public view {
        assertEq(address(marketplace.nft()), address(nft));
        assertEq(address(marketplace.appraiser()), address(appraiser));
        assertEq(address(marketplace.staking()), address(staking));
        assertEq(marketplace.feeBps(), FEE_BPS);
        assertEq(marketplace.appraiserPremiumBps(), PREMIUM_BPS);
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("SneakerMarketplace: zero admin");
        new SneakerMarketplace(address(0), address(nft), address(appraiser), address(staking), FEE_BPS, PREMIUM_BPS, admin);
    }

    function test_Constructor_RevertFeeTooHigh() public {
        vm.expectRevert("SneakerMarketplace: fee too high");
        new SneakerMarketplace(admin, address(nft), address(appraiser), address(staking), 2001, PREMIUM_BPS, admin);
    }

    // ─────────── Listings ───────────

    function test_List_TransfersNFTToMarketplace() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        assertEq(nft.ownerOf(1), address(marketplace));
        assertEq(marketplace.tokenSaleKind(1), 1);
    }

    function test_List_RevertNotOwner() public {
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: not owner");
        marketplace.list(1, 5 ether);
    }

    function test_List_RevertStakedNFT() public {
        // Alice stakes her NFT first
        vm.prank(alice);
        nft.setApprovalForAll(address(staking), true);
        vm.prank(alice);
        staking.stake(1);

        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: NFT staked");
        marketplace.list(1, 5 ether);
    }

    function test_List_RevertPriceTooLow() public {
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: price too low");
        marketplace.list(1, 0.0001 ether);
    }

    function test_Buy_PaysSellerAndTransfersNFT() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);

        uint256 sellerBefore = alice.balance;
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        marketplace.buy{value: 5 ether}(1);

        assertEq(nft.ownerOf(1), bob);
        // Seller receives 5 ETH minus 2.5% fee = 4.875
        assertEq(alice.balance, sellerBefore + 4.875 ether);
        assertEq(marketplace.accumulatedFees(), 0.125 ether);
        assertEq(marketplace.tokenSaleKind(1), 0);
    }

    function test_Buy_RevertWrongPayment() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: wrong payment");
        marketplace.buy{value: 4 ether}(1);
    }

    function test_Buy_RevertSellerCannotBuy() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: seller cannot buy");
        marketplace.buy{value: 5 ether}(1);
    }

    function test_CancelListing_ReturnsNFT() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        vm.prank(alice);
        marketplace.cancelListing(1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(marketplace.tokenSaleKind(1), 0);
    }

    function test_CancelListing_RevertNotSeller() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: not seller");
        marketplace.cancelListing(1);
    }

    // ─────────── Auctions ───────────

    function test_CreateAuction_EscrowsNFT() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        assertEq(nft.ownerOf(2), address(marketplace));
        assertEq(marketplace.tokenSaleKind(2), 2);
    }

    function test_CreateAuction_RevertStakedNFT() public {
        vm.prank(bob);
        nft.setApprovalForAll(address(staking), true);
        vm.prank(bob);
        staking.stake(2);

        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: NFT staked");
        marketplace.createAuction(2, 1 ether, 1 days);
    }

    function test_Bid_AndSettle() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);

        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.bid{value: 1 ether}(1);

        vm.deal(carol, 10 ether);
        vm.prank(carol);
        marketplace.bid{value: 2 ether}(1);

        // Alice was outbid and got her POL back
        assertEq(alice.balance, 10 ether);

        vm.warp(block.timestamp + 1 days + 1);
        uint256 sellerBefore = bob.balance;
        marketplace.settleAuction(1);

        assertEq(nft.ownerOf(2), carol);
        // Seller receives 2 ETH minus 2.5% = 1.95
        assertEq(bob.balance, sellerBefore + 1.95 ether);
        assertEq(marketplace.tokenSaleKind(2), 0);
    }

    function test_Bid_RevertTooLow() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: bid too low");
        marketplace.bid{value: 0.5 ether}(1);
    }

    function test_Bid_RevertSellerCannotBid() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: seller cannot bid");
        marketplace.bid{value: 1 ether}(1);
    }

    function test_Bid_RevertAfterEnd() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        vm.warp(block.timestamp + 1 days + 1);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: auction ended");
        marketplace.bid{value: 1 ether}(1);
    }

    function test_SettleAuction_NoBids_ReturnsNFT() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        vm.warp(block.timestamp + 1 days + 1);
        marketplace.settleAuction(1);
        assertEq(nft.ownerOf(2), bob);
        assertEq(marketplace.tokenSaleKind(2), 0);
    }

    function test_SettleAuction_RevertWhileRunning() public {
        vm.prank(bob);
        marketplace.createAuction(2, 1 ether, 1 days);
        vm.expectRevert("SneakerMarketplace: auction running");
        marketplace.settleAuction(1);
    }

    // ─────────── Offers ───────────

    function test_MakeOffer_EscrowsPOL() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.makeOffer{value: 2 ether}(2, 1 days);

        (address buyer, uint256 tokenId, uint256 amount, , bool active) = marketplace.offers(1);
        assertEq(buyer, alice);
        assertEq(tokenId, 2);
        assertEq(amount, 2 ether);
        assertTrue(active);
        // NFT stays with bob
        assertEq(nft.ownerOf(2), bob);
    }

    function test_MakeOffer_RevertOwnToken() public {
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: own token");
        marketplace.makeOffer{value: 2 ether}(2, 1 days);
    }

    function test_MakeOffer_RevertListedToken() public {
        vm.prank(bob);
        marketplace.list(2, 5 ether);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: token listed");
        marketplace.makeOffer{value: 2 ether}(2, 1 days);
    }

    function test_AcceptOffer_PaysSellerAndTransfersNFT() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.makeOffer{value: 2 ether}(2, 1 days);

        uint256 sellerBefore = bob.balance;
        vm.prank(bob);
        marketplace.acceptOffer(1);

        assertEq(nft.ownerOf(2), alice);
        assertEq(bob.balance, sellerBefore + 1.95 ether); // 2 - 2.5%
        (, , , , bool active) = marketplace.offers(1);
        assertFalse(active);
    }

    function test_AcceptOffer_RevertNotOwner() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.makeOffer{value: 2 ether}(2, 1 days);
        vm.prank(carol);
        vm.expectRevert("SneakerMarketplace: not owner");
        marketplace.acceptOffer(1);
    }

    function test_CancelOffer_ReturnsPOL() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.makeOffer{value: 2 ether}(2, 1 days);

        uint256 before = alice.balance;
        vm.prank(alice);
        marketplace.cancelOffer(1);
        assertEq(alice.balance, before + 2 ether);
    }

    function test_CancelOffer_RevertNotBuyer() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        marketplace.makeOffer{value: 2 ether}(2, 1 days);
        vm.prank(bob);
        vm.expectRevert("SneakerMarketplace: not buyer");
        marketplace.cancelOffer(1);
    }

    // ─────────── Views ───────────

    function test_SuggestedPrice_UsesAppraiserAndPremium() public view {
        // Appraiser for token 2 (Mythic, rarity 90): 0.5 + 8 + 0.9 = 9.4 POL
        // With 1.2x premium: 11.28 POL
        assertEq(marketplace.suggestedPrice(2), 11.28 ether);
    }

    function test_ValueRecommendations_ReturnsTips() public view {
        string[] memory tips = marketplace.valueRecommendations(1);
        assertEq(tips.length, 4);
    }

    // ─────────── Admin ───────────

    function test_WithdrawFees() public {
        vm.prank(alice);
        marketplace.list(1, 5 ether);
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        marketplace.buy{value: 5 ether}(1);

        uint256 before = admin.balance;
        vm.prank(admin);
        marketplace.withdrawFees(admin);
        assertEq(admin.balance, before + 0.125 ether);
    }

    function test_UpdateParams() public {
        vm.prank(admin);
        marketplace.updateParams(500, 15_000, carol);
        assertEq(marketplace.feeBps(), 500);
        assertEq(marketplace.appraiserPremiumBps(), 15_000);
        assertEq(marketplace.feeCollector(), carol);
    }

    function test_UpdateParams_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        marketplace.updateParams(500, 15_000, carol);
    }
}

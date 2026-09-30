// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {SneakerAppraiser} from "./SneakerAppraiser.sol";
import {SneakerStaking} from "./SneakerStaking.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @title SneakerMarketplace — fixed-price sales, English auctions, and POL offers
///      for every Airen NFT collection (veSneakers and mods).
/// @notice Users may list, sell, auction, and make offers on NFTs published by
///      other users from any admin-approved collection. A sneaker that is
///      locked in SneakerStaking — or that still has mods equipped in
///      SneakerWorkshop — cannot be listed or auctioned. The marketplace reads
///      an on-chain valuation from SneakerAppraiser to suggest a listing price
///      for sneakers and to generate value-improvement recommendations.
/// @dev All payments are in native POL. The marketplace holds listed/auctioned
///      NFTs in escrow. Offers escrow POL from the bidder until accepted,
///      outbid, or cancelled. Listings and auctions enforce a per-token lock
///      so the same NFT cannot be in two sales at once. Collection-agnostic:
///      sale entities carry the NFT contract address and locks are keyed by
///      (collection, tokenId).
contract SneakerMarketplace is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_PRICE = 0.001 ether;
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant MIN_OFFER_DURATION = 10 minutes;
    uint256 public constant MAX_OFFER_DURATION = 7 days;

    struct Listing {
        address seller;
        address collection;
        uint256 tokenId;
        uint256 price;
        uint64 listedAt;
        bool active;
    }

    struct Auction {
        address seller;
        address collection;
        uint256 tokenId;
        uint256 startPrice;
        address highestBidder;
        uint256 highestBid;
        uint64 endTime;
        bool active;
        bool settled;
    }

    struct Offer {
        address buyer;
        address collection;
        uint256 tokenId;
        uint256 amount;
        uint64 expiresAt;
        bool active;
    }

    SneakerMint public immutable nft;
    SneakerAppraiser public immutable appraiser;
    SneakerStaking public immutable staking;

    /// @notice Workshop consulted for the equipped-mods guard on sneaker sales.
    ///      Zero address disables the check.
    ISneakerBoosts public workshop;

    /// @notice NFT contracts allowed to trade on this marketplace.
    mapping(address collection => bool allowed) public allowedCollections;

    uint256 public feeBps; // marketplace fee in basis points (e.g. 250 = 2.5%)
    uint256 public appraiserPremiumBps; // suggested price = appraiser value * premium / 10000
    address public feeCollector;
    uint256 public accumulatedFees;

    uint256 private _nextListingId = 1;
    uint256 private _nextAuctionId = 1;
    uint256 private _nextOfferId = 1;

    mapping(uint256 listingId => Listing listing) public listings;
    mapping(uint256 auctionId => Auction auction) public auctions;
    mapping(uint256 offerId => Offer offer) public offers;

    /// @notice (collection, tokenId) -> active sale lock. 0 = none, 1 = listed, 2 = in auction.
    mapping(address collection => mapping(uint256 tokenId => uint8 saleKind)) public tokenSaleKind;

    /// @notice Completed trades per wallet (buy + sell side) — feeds
    ///      PlayerProgress XP. Counted when a sale closes: `buy`,
    ///      `acceptOffer`, and `settleAuction` with a winner.
    mapping(address user => uint256 trades) public tradesCount;

    event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed collection, uint256 tokenId, uint256 price);
    event ListingCancelled(uint256 indexed listingId);
    event NFTSold(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 price, uint256 fee);
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed collection, uint256 tokenId, uint256 startPrice, uint64 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed auctionId, address indexed seller, address indexed winner, uint256 tokenId, uint256 price, uint256 fee);
    event AuctionCancelled(uint256 indexed auctionId);
    event OfferCreated(uint256 indexed offerId, address indexed buyer, address indexed collection, uint256 tokenId, uint256 amount, uint64 expiresAt);
    event OfferAccepted(uint256 indexed offerId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 amount, uint256 fee);
    event OfferCancelled(uint256 indexed offerId);
    event BidWithdrawn(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event ParamsUpdated(uint256 feeBps, uint256 appraiserPremiumBps, address feeCollector);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event CollectionAllowed(address indexed collection, bool allowed);
    event WorkshopUpdated(address indexed workshop);

    constructor(
        address admin,
        address nftAddress,
        address appraiserAddress,
        address stakingAddress,
        uint256 feeBps_,
        uint256 appraiserPremiumBps_,
        address feeCollector_
    ) {
        require(admin != address(0), "SneakerMarketplace: zero admin");
        require(nftAddress != address(0), "SneakerMarketplace: zero NFT");
        require(appraiserAddress != address(0), "SneakerMarketplace: zero appraiser");
        require(stakingAddress != address(0), "SneakerMarketplace: zero staking");
        require(feeCollector_ != address(0), "SneakerMarketplace: zero fee collector");
        require(feeBps_ <= 2000, "SneakerMarketplace: fee too high"); // max 20%
        require(appraiserPremiumBps_ > 0, "SneakerMarketplace: zero premium");

        nft = SneakerMint(nftAddress);
        appraiser = SneakerAppraiser(appraiserAddress);
        staking = SneakerStaking(payable(stakingAddress));
        feeBps = feeBps_;
        appraiserPremiumBps = appraiserPremiumBps_;
        feeCollector = feeCollector_;
        allowedCollections[nftAddress] = true; // veSneakers always tradeable
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function updateParams(uint256 feeBps_, uint256 appraiserPremiumBps_, address feeCollector_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(feeBps_ <= 2000, "SneakerMarketplace: fee too high");
        require(appraiserPremiumBps_ > 0, "SneakerMarketplace: zero premium");
        require(feeCollector_ != address(0), "SneakerMarketplace: zero fee collector");
        feeBps = feeBps_;
        appraiserPremiumBps = appraiserPremiumBps_;
        feeCollector = feeCollector_;
        emit ParamsUpdated(feeBps_, appraiserPremiumBps_, feeCollector_);
    }

    /// @notice Allow or block an NFT collection on the marketplace.
    function setCollectionAllowed(address collection, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collection != address(0), "SneakerMarketplace: zero collection");
        allowedCollections[collection] = allowed;
        emit CollectionAllowed(collection, allowed);
    }

    /// @notice Set the workshop used for the equipped-mods sale guard.
    function setWorkshop(address workshop_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        workshop = ISneakerBoosts(workshop_);
        emit WorkshopUpdated(workshop_);
    }

    function withdrawFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        _withdrawFees(to);
    }

    /// @notice Withdraw accrued fees to the configured fee collector (e.g. FeeSplitter).
    function withdrawFeesToCollector() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        _withdrawFees(feeCollector);
    }

    function _withdrawFees(address to) private {
        require(to != address(0), "SneakerMarketplace: zero recipient");
        uint256 amount = accumulatedFees;
        require(amount > 0, "SneakerMarketplace: no fees");
        accumulatedFees = 0;
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "SneakerMarketplace: POL transfer failed");
        emit FeesWithdrawn(to, amount);
    }

    // ─────────────────────────── Listings ────────────────────────

    /// @notice List an owned, unstaked NFT for a fixed POL price.
    /// @param collection NFT contract — must be in allowedCollections.
    function list(address collection, uint256 tokenId, uint256 price) external whenNotPaused nonReentrant {
        require(price >= MIN_PRICE, "SneakerMarketplace: price too low");
        require(tokenSaleKind[collection][tokenId] == 0, "SneakerMarketplace: token already on sale");
        _requireSellable(collection, tokenId);

        tokenSaleKind[collection][tokenId] = 1;
        listings[_nextListingId] = Listing({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            price: price,
            listedAt: uint64(block.timestamp),
            active: true
        });
        emit ListingCreated(_nextListingId, msg.sender, collection, tokenId, price);
        _nextListingId += 1;

        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Cancel an active listing and recover the NFT.
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "SneakerMarketplace: invalid listing");
        require(listing.seller == msg.sender, "SneakerMarketplace: not seller");
        listing.active = false;
        tokenSaleKind[listing.collection][listing.tokenId] = 0;
        IERC721(listing.collection).safeTransferFrom(address(this), msg.sender, listing.tokenId);
        emit ListingCancelled(listingId);
    }

    /// @notice Buy a listed NFT at the fixed price.
    function buy(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "SneakerMarketplace: invalid listing");
        require(msg.value == listing.price, "SneakerMarketplace: wrong payment");
        require(msg.sender != listing.seller, "SneakerMarketplace: seller cannot buy");

        listing.active = false;
        tokenSaleKind[listing.collection][listing.tokenId] = 0;
        tradesCount[msg.sender] += 1;
        tradesCount[listing.seller] += 1;

        (uint256 fee, uint256 proceeds) = _splitPayment(listing.price);
        _pay(listing.seller, proceeds);

        IERC721(listing.collection).safeTransferFrom(address(this), msg.sender, listing.tokenId);
        emit NFTSold(listingId, listing.seller, msg.sender, listing.tokenId, listing.price, fee);
    }

    // ─────────────────────────── Auctions ────────────────────────

    /// @notice Create an English auction for an owned, unstaked NFT.
    function createAuction(address collection, uint256 tokenId, uint256 startPrice, uint64 duration)
        external
        whenNotPaused
        nonReentrant
    {
        require(startPrice >= MIN_PRICE, "SneakerMarketplace: price too low");
        require(duration >= MIN_AUCTION_DURATION && duration <= MAX_AUCTION_DURATION, "SneakerMarketplace: invalid duration");
        require(tokenSaleKind[collection][tokenId] == 0, "SneakerMarketplace: token already on sale");
        _requireSellable(collection, tokenId);

        tokenSaleKind[collection][tokenId] = 2;
        auctions[_nextAuctionId] = Auction({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            startPrice: startPrice,
            highestBidder: address(0),
            highestBid: 0,
            endTime: uint64(block.timestamp) + duration,
            active: true,
            settled: false
        });
        emit AuctionCreated(_nextAuctionId, msg.sender, collection, tokenId, startPrice, uint64(block.timestamp) + duration);
        _nextAuctionId += 1;

        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Place a bid on an active auction. Must exceed the current highest bid.
    function bid(uint256 auctionId) external payable whenNotPaused nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "SneakerMarketplace: auction inactive");
        require(block.timestamp < auction.endTime, "SneakerMarketplace: auction ended");
        require(msg.sender != auction.seller, "SneakerMarketplace: seller cannot bid");
        uint256 minBid = auction.highestBid == 0
            ? auction.startPrice
            : auction.highestBid + (auction.highestBid / 100); // +1% minimum increment
        require(msg.value >= minBid, "SneakerMarketplace: bid too low");

        address previousBidder = auction.highestBidder;
        uint256 previousBid = auction.highestBid;
        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        if (previousBidder != address(0)) {
            _pay(previousBidder, previousBid);
            emit BidWithdrawn(auctionId, previousBidder, previousBid);
        }
        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    /// @notice Settle a finished auction: pay the seller, transfer the NFT to the winner.
    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "SneakerMarketplace: auction inactive");
        require(!auction.settled, "SneakerMarketplace: already settled");
        require(block.timestamp >= auction.endTime, "SneakerMarketplace: auction running");

        auction.active = false;
        auction.settled = true;
        tokenSaleKind[auction.collection][auction.tokenId] = 0;

        if (auction.highestBidder == address(0)) {
            // No bids: return the NFT to the seller.
            IERC721(auction.collection).safeTransferFrom(address(this), auction.seller, auction.tokenId);
            emit AuctionCancelled(auctionId);
            return;
        }

        (uint256 fee, uint256 proceeds) = _splitPayment(auction.highestBid);
        tradesCount[auction.seller] += 1;
        tradesCount[auction.highestBidder] += 1;
        _pay(auction.seller, proceeds);
        IERC721(auction.collection).safeTransferFrom(address(this), auction.highestBidder, auction.tokenId);
        emit AuctionSettled(auctionId, auction.seller, auction.highestBidder, auction.tokenId, auction.highestBid, fee);
    }

    /// @notice Cancel a finished auction with no bids.
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "SneakerMarketplace: auction inactive");
        require(!auction.settled, "SneakerMarketplace: already settled");
        require(auction.seller == msg.sender, "SneakerMarketplace: not seller");
        require(auction.highestBidder == address(0), "SneakerMarketplace: has bids");
        require(block.timestamp >= auction.endTime, "SneakerMarketplace: auction running");

        auction.active = false;
        auction.settled = true;
        tokenSaleKind[auction.collection][auction.tokenId] = 0;
        IERC721(auction.collection).safeTransferFrom(address(this), auction.seller, auction.tokenId);
        emit AuctionCancelled(auctionId);
    }

    // ─────────────────────────── Offers ──────────────────────────

    /// @notice Make a POL offer on an NFT that is owned and not listed.
    /// @dev The NFT stays with its owner; the offer escrows POL from the bidder.
    function makeOffer(address collection, uint256 tokenId, uint64 duration) external payable whenNotPaused nonReentrant {
        require(allowedCollections[collection], "SneakerMarketplace: collection not allowed");
        require(msg.value >= MIN_PRICE, "SneakerMarketplace: offer too low");
        require(duration >= MIN_OFFER_DURATION && duration <= MAX_OFFER_DURATION, "SneakerMarketplace: invalid duration");
        require(IERC721(collection).ownerOf(tokenId) != msg.sender, "SneakerMarketplace: own token");
        require(tokenSaleKind[collection][tokenId] != 1, "SneakerMarketplace: token listed");
        _requireNotLocked(collection, tokenId);

        offers[_nextOfferId] = Offer({
            buyer: msg.sender,
            collection: collection,
            tokenId: tokenId,
            amount: msg.value,
            expiresAt: uint64(block.timestamp) + duration,
            active: true
        });
        emit OfferCreated(_nextOfferId, msg.sender, collection, tokenId, msg.value, uint64(block.timestamp) + duration);
        _nextOfferId += 1;
    }

    /// @notice Seller accepts an active, unexpired offer. Requires NFT approval
    ///      for the marketplace (the NFT is not in marketplace escrow).
    function acceptOffer(uint256 offerId) external whenNotPaused nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "SneakerMarketplace: invalid offer");
        require(block.timestamp < offer.expiresAt, "SneakerMarketplace: offer expired");
        require(IERC721(offer.collection).ownerOf(offer.tokenId) == msg.sender, "SneakerMarketplace: not owner");
        _requireNotLocked(offer.collection, offer.tokenId);

        offer.active = false;
        tradesCount[msg.sender] += 1;
        tradesCount[offer.buyer] += 1;
        (uint256 fee, uint256 proceeds) = _splitPayment(offer.amount);
        _pay(msg.sender, proceeds);
        IERC721(offer.collection).safeTransferFrom(msg.sender, offer.buyer, offer.tokenId);
        emit OfferAccepted(offerId, msg.sender, offer.buyer, offer.tokenId, offer.amount, fee);
    }

    /// @notice Bidder cancels an active offer and recovers the escrowed POL.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "SneakerMarketplace: invalid offer");
        require(offer.buyer == msg.sender, "SneakerMarketplace: not buyer");
        offer.active = false;
        _pay(msg.sender, offer.amount);
        emit OfferCancelled(offerId);
    }

    // ─────────────────────────── Views ───────────────────────────

    /// @notice Suggested listing price derived from the SneakerAppraiser
    ///      valuation and the marketplace premium. SneakerMint NFTs only —
    ///      mods are priced by the market.
    function suggestedPrice(uint256 tokenId) external view returns (uint256) {
        (uint256 value, , ) = appraiser.appraise(tokenId);
        return (value * appraiserPremiumBps) / BASIS_POINTS;
    }

    /// @notice Value-improvement recommendations for an NFT, derived from its
    ///      rarity, tier, and staking state. Returned as human-readable strings.
    function valueRecommendations(uint256 tokenId) external view returns (string[] memory) {
        (, uint8 rarity, uint8 tier) = appraiser.appraise(tokenId);
        string[] memory tips = new string[](4);

        tips[0] = tier < 3
            ? "Mint higher-tier sneakers (Epic/Mythic) for a larger APY boost and resale value."
            : "This is a top-tier sneaker: hold it, Mythic supply is scarce.";
        tips[1] = rarity < 80
            ? "Increase the rarity score (currently below 80) by minting with more distinctive artwork."
            : "High rarity score: this NFT is in the top valuation bracket.";
        tips[2] = staking.stakedOwner(tokenId) != address(0)
            ? "This sneaker is staked: unstake it before listing, or keep it for the APY boost."
            : "Locking this sneaker in staking adds APY while you wait for a better offer.";
        tips[3] = "Keep the sneaker active in SneakerGame: streaks and durability signal a well-maintained asset.";

        return tips;
    }

    // ─────────────────────────── Internal ────────────────────────

    /// @notice Full pre-sale validation: allowed collection, caller ownership,
    ///      and no staking/workshop lock.
    function _requireSellable(address collection, uint256 tokenId) internal view {
        require(allowedCollections[collection], "SneakerMarketplace: collection not allowed");
        _requireNotLocked(collection, tokenId);
        require(IERC721(collection).ownerOf(tokenId) == msg.sender, "SneakerMarketplace: not owner");
    }

    /// @notice Sneakers must not be staked nor have mods equipped; escrowed
    ///      assets (staked NFTs, equipped mods, rented mods) already fail the
    ///      ownerOf check, but the explicit guards give clearer errors and
    ///      block offers on tokens whose owner cannot complete a sale.
    function _requireNotLocked(address collection, uint256 tokenId) internal view {
        if (collection == address(nft)) {
            require(staking.stakedOwner(tokenId) == address(0), "SneakerMarketplace: NFT staked");
            if (address(workshop) != address(0)) {
                require(!workshop.hasEquippedMods(tokenId), "SneakerMarketplace: NFT has equipped mods");
            }
        }
    }

    function _splitPayment(uint256 amount) internal returns (uint256 fee, uint256 proceeds) {
        fee = (amount * feeBps) / BASIS_POINTS;
        proceeds = amount - fee;
        if (fee > 0) accumulatedFees += fee;
    }

    function _pay(address to, uint256 amount) internal {
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "SneakerMarketplace: POL transfer failed");
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        revert("SneakerMarketplace: use bid or makeOffer");
    }
}

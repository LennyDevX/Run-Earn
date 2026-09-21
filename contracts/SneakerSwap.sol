// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMint} from "./SneakerMint.sol";
import {SneakerStaking} from "./SneakerStaking.sol";
import {ISneakerBoosts} from "./ISneakerBoosts.sol";

/// @title SneakerSwap — atomic NFT-for-NFT trades between RUN&EARN collections.
/// @notice A maker escrows one NFT (plus an optional POL top-up) and names the
///      NFT they want. Any holder of the wanted token — or a specific taker —
///      can accept: the wanted NFT moves to the maker, the offered NFT and POL
///      move to the taker, atomically. Works for veSneakers, mods, and any
///      admin-approved collection.
/// @dev Guards mirror the marketplace: sneakers that are staked or still have
///      mods equipped cannot be swapped (equipped mods stay bound to the
///      sneaker's tokenId and would transfer control to the new owner).
contract SneakerSwap is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver {
    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MAX_DURATION = 30 days;

    struct SwapOffer {
        address maker;
        address taker; // address(0) = open to any holder of the wanted token
        address offerCollection;
        uint256 offerTokenId;
        address wantCollection;
        uint256 wantTokenId;
        uint256 polTopUp; // extra POL the maker pays the taker on accept
        uint64 expiresAt;
        bool active;
    }

    SneakerMint public immutable nft;
    SneakerStaking public immutable staking;
    ISneakerBoosts public workshop; // zero address disables the equipped-mods guard

    /// @notice NFT contracts allowed in swaps.
    mapping(address collection => bool allowed) public allowedCollections;

    uint256 private _nextSwapId = 1;
    mapping(uint256 swapId => SwapOffer offer) public swaps;

    event SwapCreated(
        uint256 indexed swapId,
        address indexed maker,
        address offerCollection,
        uint256 offerTokenId,
        address wantCollection,
        uint256 wantTokenId,
        uint256 polTopUp,
        uint64 expiresAt
    );
    event SwapAccepted(uint256 indexed swapId, address indexed taker);
    event SwapCancelled(uint256 indexed swapId);
    event CollectionAllowed(address indexed collection, bool allowed);
    event WorkshopUpdated(address indexed workshop);

    constructor(address admin, address nftAddress, address stakingAddress, address workshopAddress) {
        require(admin != address(0), "SneakerSwap: zero admin");
        require(nftAddress != address(0), "SneakerSwap: zero NFT");
        require(stakingAddress != address(0), "SneakerSwap: zero staking");
        nft = SneakerMint(nftAddress);
        staking = SneakerStaking(payable(stakingAddress));
        workshop = ISneakerBoosts(workshopAddress);
        allowedCollections[nftAddress] = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setCollectionAllowed(address collection, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collection != address(0), "SneakerSwap: zero collection");
        allowedCollections[collection] = allowed;
        emit CollectionAllowed(collection, allowed);
    }

    function setWorkshop(address workshop_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        workshop = ISneakerBoosts(workshop_);
        emit WorkshopUpdated(workshop_);
    }

    // ─────────────────────────── Swaps ───────────────────────────

    /// @notice Create a swap offer. Escrows the maker's NFT and any POL top-up.
    /// @param taker Specific acceptor, or address(0) for an open offer.
    function createSwap(
        address taker,
        address offerCollection,
        uint256 offerTokenId,
        address wantCollection,
        uint256 wantTokenId,
        uint64 duration
    ) external payable whenNotPaused nonReentrant returns (uint256 swapId) {
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "SneakerSwap: invalid duration");
        require(allowedCollections[offerCollection] && allowedCollections[wantCollection], "SneakerSwap: collection not allowed");
        require(
            offerCollection != wantCollection || offerTokenId != wantTokenId,
            "SneakerSwap: same token"
        );
        _requireSwappable(offerCollection, offerTokenId, msg.sender);

        swapId = _nextSwapId++;
        swaps[swapId] = SwapOffer({
            maker: msg.sender,
            taker: taker,
            offerCollection: offerCollection,
            offerTokenId: offerTokenId,
            wantCollection: wantCollection,
            wantTokenId: wantTokenId,
            polTopUp: msg.value,
            expiresAt: uint64(block.timestamp) + duration,
            active: true
        });
        emit SwapCreated(swapId, msg.sender, offerCollection, offerTokenId, wantCollection, wantTokenId, msg.value, uint64(block.timestamp) + duration);

        IERC721(offerCollection).safeTransferFrom(msg.sender, address(this), offerTokenId);
    }

    /// @notice Accept a swap: the caller supplies the wanted NFT and receives
    ///      the offered NFT plus the POL top-up.
    function accept(uint256 swapId) external whenNotPaused nonReentrant {
        SwapOffer storage offer = swaps[swapId];
        require(offer.active, "SneakerSwap: invalid swap");
        require(block.timestamp < offer.expiresAt, "SneakerSwap: swap expired");
        require(offer.taker == address(0) || offer.taker == msg.sender, "SneakerSwap: not the taker");
        _requireSwappable(offer.wantCollection, offer.wantTokenId, msg.sender);

        offer.active = false;

        IERC721(offer.wantCollection).safeTransferFrom(msg.sender, offer.maker, offer.wantTokenId);
        IERC721(offer.offerCollection).safeTransferFrom(address(this), msg.sender, offer.offerTokenId);
        if (offer.polTopUp > 0) {
            (bool sent, ) = payable(msg.sender).call{value: offer.polTopUp}("");
            require(sent, "SneakerSwap: POL transfer failed");
        }
        emit SwapAccepted(swapId, msg.sender);
    }

    /// @notice Maker cancels an active swap; anyone may clean up an expired one.
    function cancel(uint256 swapId) external nonReentrant {
        SwapOffer storage offer = swaps[swapId];
        require(offer.active, "SneakerSwap: invalid swap");
        require(
            offer.maker == msg.sender || block.timestamp >= offer.expiresAt,
            "SneakerSwap: not authorized"
        );

        offer.active = false;
        IERC721(offer.offerCollection).safeTransferFrom(address(this), offer.maker, offer.offerTokenId);
        if (offer.polTopUp > 0) {
            (bool sent, ) = payable(offer.maker).call{value: offer.polTopUp}("");
            require(sent, "SneakerSwap: POL transfer failed");
        }
        emit SwapCancelled(swapId);
    }

    // ─────────────────────────── Internal ────────────────────────

    /// @notice `user` must own the token; sneakers must not be staked or carry
    ///      equipped mods (equipped mods stay bound to the sneaker's tokenId).
    function _requireSwappable(address collection, uint256 tokenId, address user) internal view {
        require(IERC721(collection).ownerOf(tokenId) == user, "SneakerSwap: not owner");
        if (collection == address(nft)) {
            require(staking.stakedOwner(tokenId) == address(0), "SneakerSwap: NFT staked");
            if (address(workshop) != address(0)) {
                require(!workshop.hasEquippedMods(tokenId), "SneakerSwap: NFT has equipped mods");
            }
        }
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
        revert("SneakerSwap: use createSwap");
    }
}

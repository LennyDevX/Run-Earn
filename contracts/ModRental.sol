// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SneakerMods} from "./SneakerMods.sol";
import {SneakerWorkshop} from "./SneakerWorkshop.sol";

/// @title ModRental — time-boxed rental of SneakerMods upgrade NFTs.
/// @notice Owners list a mod for a POL price per day and a maximum duration.
///      Renters pay upfront, keep the mod in this contract's escrow, and can
///      equip it on their own veSneakers through the workshop for the rental
///      period. When the rental expires anyone can return the mod to its
///      owner; the workshop detaches it from any sneaker it was equipped on.
/// @dev Equipping a rented mod calls SneakerWorkshop.equipFrom, which records
///      this contract as the custodian. Workshop boost views verify the rental
///      is still active via isActiveRental, so effects lapse at expiry even
///      before cleanup runs.
contract ModRental is Pausable, AccessControl, ReentrancyGuard, IERC721Receiver {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_RENTAL = 1 days;
    uint256 public constant MAX_RENTAL = 90 days;

    struct Rental {
        address owner;
        uint256 modId;
        uint256 pricePerDay;
        uint64 maxDuration;
        address renter;
        uint64 rentedUntil;
        bool listed;
    }

    SneakerMods public immutable mods;
    SneakerWorkshop public immutable workshop;

    uint256 public feeBps; // rental fee taken on payments (e.g. 250 = 2.5%)
    address public feeCollector;
    uint256 public accumulatedFees;

    uint256 private _nextRentalId = 1;
    mapping(uint256 rentalId => Rental rental) public rentals;
    /// modId => rentalId currently escrowing that mod (0 = none).
    mapping(uint256 modId => uint256 rentalId) public rentalOf;

    event RentalListed(uint256 indexed rentalId, address indexed owner, uint256 indexed modId, uint256 pricePerDay, uint64 maxDuration);
    event RentalCancelled(uint256 indexed rentalId);
    event ModRented(uint256 indexed rentalId, address indexed renter, uint64 days_, uint256 paid, uint256 fee);
    event RentalExtended(uint256 indexed rentalId, uint64 newRentedUntil, uint256 paid, uint256 fee);
    event ModReturned(uint256 indexed rentalId, address indexed owner, uint256 indexed modId);
    event ParamsUpdated(uint256 feeBps, address feeCollector);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(
        address admin,
        address modsAddress,
        address workshopAddress,
        uint256 feeBps_,
        address feeCollector_
    ) {
        require(admin != address(0), "ModRental: zero admin");
        require(modsAddress != address(0), "ModRental: zero mods");
        require(workshopAddress != address(0), "ModRental: zero workshop");
        require(feeCollector_ != address(0), "ModRental: zero fee collector");
        require(feeBps_ <= 2000, "ModRental: fee too high"); // max 20%
        mods = SneakerMods(modsAddress);
        workshop = SneakerWorkshop(workshopAddress);
        feeBps = feeBps_;
        feeCollector = feeCollector_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function updateParams(uint256 feeBps_, address feeCollector_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(feeCollector_ != address(0), "ModRental: zero fee collector");
        require(feeBps_ <= 2000, "ModRental: fee too high");
        feeBps = feeBps_;
        feeCollector = feeCollector_;
        emit ParamsUpdated(feeBps_, feeCollector_);
    }

    function withdrawFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "ModRental: zero recipient");
        uint256 amount = accumulatedFees;
        require(amount > 0, "ModRental: no fees");
        accumulatedFees = 0;
        (bool sent, ) = payable(to).call{value: amount}("");
        require(sent, "ModRental: POL transfer failed");
        emit FeesWithdrawn(to, amount);
    }

    // ─────────────────────────── Listings ────────────────────────

    /// @notice List an owned mod for rent. The mod moves into escrow.
    function list(uint256 modId, uint256 pricePerDay, uint64 maxDuration)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 rentalId)
    {
        require(pricePerDay > 0, "ModRental: zero price");
        require(maxDuration >= MIN_RENTAL && maxDuration <= MAX_RENTAL, "ModRental: invalid duration");
        require(workshop.equippedTo(modId) == 0, "ModRental: mod equipped");
        require(mods.ownerOf(modId) == msg.sender, "ModRental: not owner");
        require(rentalOf[modId] == 0, "ModRental: already listed");
        require(!mods.traitsOf(modId).consumable, "ModRental: consumables not rentable");

        rentalId = _nextRentalId++;
        rentals[rentalId] = Rental({
            owner: msg.sender,
            modId: modId,
            pricePerDay: pricePerDay,
            maxDuration: maxDuration,
            renter: address(0),
            rentedUntil: 0,
            listed: true
        });
        rentalOf[modId] = rentalId;
        emit RentalListed(rentalId, msg.sender, modId, pricePerDay, maxDuration);

        mods.safeTransferFrom(msg.sender, address(this), modId);
    }

    /// @notice Owner cancels a listing while it is not rented.
    function cancelListing(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.listed, "ModRental: invalid listing");
        require(rental.owner == msg.sender, "ModRental: not owner");
        require(rental.renter == address(0), "ModRental: currently rented");

        _returnToOwner(rentalId, rental);
    }

    // ─────────────────────────── Renting ─────────────────────────

    /// @notice Rent a listed mod for `days_` days, paying upfront.
    function rent(uint256 rentalId, uint64 days_) external payable whenNotPaused nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.listed, "ModRental: invalid listing");
        require(rental.renter == address(0), "ModRental: currently rented");
        require(msg.sender != rental.owner, "ModRental: owner cannot rent");
        uint64 duration = uint64(days_) * 1 days;
        require(duration >= MIN_RENTAL && duration <= rental.maxDuration, "ModRental: invalid duration");
        require(msg.value == rental.pricePerDay * days_, "ModRental: wrong payment");

        rental.renter = msg.sender;
        rental.rentedUntil = uint64(block.timestamp) + duration;
        _payOwner(rental, msg.value);
        emit ModRented(rentalId, msg.sender, days_, msg.value, (msg.value * feeBps) / BASIS_POINTS);
    }

    /// @notice Renter extends the rental while it is still active.
    function extend(uint256 rentalId, uint64 extraDays) external payable whenNotPaused nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.listed, "ModRental: invalid listing");
        require(rental.renter == msg.sender, "ModRental: not renter");
        require(block.timestamp < rental.rentedUntil, "ModRental: rental expired");
        uint64 newUntil = rental.rentedUntil + uint64(extraDays) * 1 days;
        require(newUntil <= uint64(block.timestamp) + rental.maxDuration, "ModRental: exceeds max duration");
        require(msg.value == rental.pricePerDay * extraDays, "ModRental: wrong payment");

        rental.rentedUntil = newUntil;
        _payOwner(rental, msg.value);
        emit RentalExtended(rentalId, newUntil, msg.value, (msg.value * feeBps) / BASIS_POINTS);
    }

    /// @notice Equip the rented mod on one of the renter's sneakers.
    function equipRented(uint256 rentalId, uint256 sneakerId) external whenNotPaused {
        Rental storage rental = rentals[rentalId];
        require(rental.renter == msg.sender, "ModRental: not renter");
        require(block.timestamp < rental.rentedUntil, "ModRental: rental expired");
        workshop.equipFrom(sneakerId, rental.modId, msg.sender);
    }

    /// @notice Renter releases the mod early; it stays listed until the owner
    ///      cancels or someone rents it again.
    function releaseEarly(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.renter == msg.sender, "ModRental: not renter");
        _endRental(rentalId, rental);
    }

    /// @notice Return an expired rental's mod to its owner. Permissionless.
    function returnExpired(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        require(rental.listed, "ModRental: invalid listing");
        require(rental.renter != address(0), "ModRental: not rented");
        require(block.timestamp >= rental.rentedUntil, "ModRental: rental active");

        _returnToOwner(rentalId, rental);
    }

    // ─────────────────────────── Views ───────────────────────────

    /// @notice True while the mod is actively rented. Read by the workshop to
    ///      lapse mod effects at expiry.
    function isActiveRental(uint256 modId) external view returns (bool) {
        uint256 rentalId = rentalOf[modId];
        if (rentalId == 0) return false;
        Rental storage rental = rentals[rentalId];
        return rental.renter != address(0) && block.timestamp < rental.rentedUntil;
    }

    /// @notice Current active renter of a mod (zero if none).
    function activeRenter(uint256 modId) external view returns (address) {
        uint256 rentalId = rentalOf[modId];
        if (rentalId == 0) return address(0);
        Rental storage rental = rentals[rentalId];
        return block.timestamp < rental.rentedUntil ? rental.renter : address(0);
    }

    // ─────────────────────────── Internal ────────────────────────

    function _payOwner(Rental storage rental, uint256 amount) internal {
        uint256 fee = (amount * feeBps) / BASIS_POINTS;
        if (fee > 0) accumulatedFees += fee;
        (bool sent, ) = payable(rental.owner).call{value: amount - fee}("");
        require(sent, "ModRental: POL transfer failed");
    }

    /// @dev Clears the renter, detaches the mod from any sneaker it was
    ///      equipped on, and keeps the listing active for the next renter.
    function _endRental(uint256 rentalId, Rental storage rental) internal {
        rental.renter = address(0);
        rental.rentedUntil = 0;
        workshop.detachByMod(rental.modId);
        emit ModReturned(rentalId, rental.owner, rental.modId);
    }

    /// @dev Ends any active rental and returns the mod to its owner.
    function _returnToOwner(uint256 rentalId, Rental storage rental) internal {
        rental.listed = false;
        delete rentalOf[rental.modId];
        if (rental.renter != address(0)) {
            _endRental(rentalId, rental);
        }
        mods.safeTransferFrom(address(this), rental.owner, rental.modId);
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
        revert("ModRental: use rent or extend");
    }
}

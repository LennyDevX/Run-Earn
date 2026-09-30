// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FeeSplitter — pro-rata distribution of protocol fees in native POL.
/// @notice Receives POL from fee-generating contracts (SneakerMarketplace,
///      ModRental) via `withdrawFees` or direct sends, and distributes it to a
///      fixed list of POL-receiving wallets according to admin-configurable
///      weights. Typical allocations are treasury, staking/reward operations,
///      REN redemption operations, and team. Recipients must accept native POL.
///      Weights are in basis points and must sum to exactly 10_000
///      (100%) so every deposited wei is fully allocated.
/// @dev Distribution is pull-free: anyone can call `distribute()` to settle
///      the current balance, which sends each recipient its pro-rata share.
///      Dust from integer division stays in the contract and is included in
///      the next distribution. A zero-weight recipient list is rejected — the
///      contract must never be a permanent fund sink.
contract FeeSplitter is Pausable, AccessControl, ReentrancyGuard {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_RECIPIENTS = 16;

    struct Recipient {
        address account;
        uint256 weightBps; // share of each distribution in basis points
    }

    Recipient[] private _recipients;
    uint256 public totalWeightBps;
    uint256 public totalDistributed;

    event RecipientsSet(address[] accounts, uint256[] weights);
    event Distributed(uint256 indexed amount, address indexed to, uint256 share);
    event FeesReceived(address indexed from, uint256 amount);

    constructor(address admin) {
        require(admin != address(0), "FeeSplitter: zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    receive() external payable {
        emit FeesReceived(msg.sender, msg.value);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Replace the full recipient list. Weights must sum to exactly
    ///      10_000 bps so no deposited fee is ever stranded.
    function setRecipients(address[] calldata accounts, uint256[] calldata weightsBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(accounts.length > 0, "FeeSplitter: empty recipients");
        require(accounts.length <= MAX_RECIPIENTS, "FeeSplitter: too many recipients");
        require(accounts.length == weightsBps.length, "FeeSplitter: length mismatch");
        uint256 sum;
        for (uint256 i; i < accounts.length; ++i) {
            require(accounts[i] != address(0), "FeeSplitter: zero recipient");
            require(weightsBps[i] > 0, "FeeSplitter: zero weight");
            sum += weightsBps[i];
        }
        require(sum == BASIS_POINTS, "FeeSplitter: weights must sum to 100%");

        delete _recipients;
        for (uint256 i; i < accounts.length; ++i) {
            _recipients.push(Recipient({account: accounts[i], weightBps: weightsBps[i]}));
        }
        totalWeightBps = sum;
        emit RecipientsSet(accounts, weightsBps);
    }

    // ─────────────────────────── Views ───────────────────────────

    function recipientCount() external view returns (uint256) {
        return _recipients.length;
    }

    function recipients() external view returns (Recipient[] memory) {
        return _recipients;
    }

    function recipientAt(uint256 index) external view returns (address account, uint256 weightBps) {
        Recipient memory recipient = _recipients[index];
        return (recipient.account, recipient.weightBps);
    }

    /// @notice POL currently held and awaiting distribution.
    function pendingFees() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Pro-rata share of `amount` for recipient `index`, including dust
    ///      allocation for the last recipient so the sum is exact.
    function shareOf(uint256 index, uint256 amount) public view returns (uint256) {
        Recipient memory recipient = _recipients[index];
        if (index == _recipients.length - 1) {
            // Last recipient absorbs division dust so the sum is exact.
            uint256 allocated;
            for (uint256 i; i < _recipients.length - 1; ++i) {
                allocated += (amount * _recipients[i].weightBps) / BASIS_POINTS;
            }
            return amount - allocated;
        }
        return (amount * recipient.weightBps) / BASIS_POINTS;
    }

    // ─────────────────────────── Distribution ─────────────────────

    /// @notice Distribute the current POL balance pro-rata to all recipients.
    ///      Callable by anyone — the split is deterministic, so there is no
    ///      griefing vector. Dust stays in the contract for the next round.
    function distribute() external nonReentrant whenNotPaused {
        uint256 amount = address(this).balance;
        require(amount > 0, "FeeSplitter: nothing to distribute");
        require(_recipients.length > 0, "FeeSplitter: no recipients");

        for (uint256 i; i < _recipients.length; ++i) {
            uint256 share = shareOf(i, amount);
            if (share == 0) continue;
            address recipient = _recipients[i].account;
            (bool sent, ) = payable(recipient).call{value: share}("");
            require(sent, "FeeSplitter: POL transfer failed");
            emit Distributed(share, recipient, share);
        }
        totalDistributed += amount;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title RUNEToken — RUN&EARN ERC-20 reward token.
/// @notice RUNE is the reward token distributed by the SneakerStaking vault.
/// @dev Minting is limited to the MINTER_ROLE (staking vault or treasury).
///      Supply is capped by MAX_SUPPLY for economic sustainability.
contract RUNEToken is ERC20, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Hard cap on total minted supply (100M RUNE with 18 decimals).
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10 ** 18;

    uint256 public totalMinted;

    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    constructor(
        address admin,
        address minter
    ) ERC20("Run and Earn Rune", "RUNE") {
        require(admin != address(0), "RUNEToken: zero admin");
        require(minter != address(0), "RUNEToken: zero minter");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Mint RUNE rewards to a recipient. Only MINTER_ROLE.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(to != address(0), "RUNEToken: zero recipient");
        require(totalMinted + amount <= MAX_SUPPLY, "RUNEToken: cap exceeded");
        totalMinted += amount;
        _mint(to, amount);
        emit Minted(to, amount);
    }

    /// @notice Burn RUNE from the caller's own balance.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }
}

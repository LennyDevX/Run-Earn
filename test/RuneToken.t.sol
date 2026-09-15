// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {RUNEToken} from "../contracts/RUNEToken.sol";

contract RUNETokenTest is Test {
    RUNEToken token;
    address admin = address(0xA11CE);
    address minter = address(0xB0B);
    address alice = address(0xA1);
    address bob = address(0xB0);

    function setUp() public {
        token = new RUNEToken(admin, minter);
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsRoles() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin), "admin should have DEFAULT_ADMIN_ROLE");
        assertTrue(token.hasRole(token.MINTER_ROLE(), minter), "minter should have MINTER_ROLE");
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("RUNEToken: zero admin");
        new RUNEToken(address(0), minter);
    }

    function test_Constructor_RevertZeroMinter() public {
        vm.expectRevert("RUNEToken: zero minter");
        new RUNEToken(admin, address(0));
    }

    function test_NameAndSymbol() public view {
        assertEq(token.name(), "Run and Earn Rune");
        assertEq(token.symbol(), "REN");
        assertEq(token.decimals(), 18);
    }

    function test_MaxSupply() public view {
        assertEq(token.MAX_SUPPLY(), 100_000_000 * 10 ** 18);
    }

    // ─────────── Mint ───────────

    function test_Mint_ByMinter() public {
        vm.prank(minter);
        token.mint(alice, 1000 * 10 ** 18);
        assertEq(token.balanceOf(alice), 1000 * 10 ** 18);
        assertEq(token.totalMinted(), 1000 * 10 ** 18);
    }

    function test_Mint_RevertNonMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1000);
    }

    function test_Mint_RevertZeroRecipient() public {
        vm.prank(minter);
        vm.expectRevert("RUNEToken: zero recipient");
        token.mint(address(0), 1000);
    }

    function test_Mint_RevertCapExceeded() public {
        uint256 overCap = token.MAX_SUPPLY() + 1;
        vm.prank(minter);
        vm.expectRevert("RUNEToken: cap exceeded");
        token.mint(alice, overCap);
    }

    function test_Mint_AtCap() public {
        uint256 cap = token.MAX_SUPPLY();
        vm.prank(minter);
        token.mint(alice, cap);
        assertEq(token.totalMinted(), cap);
    }

    function test_Mint_RevertWhenPaused() public {
        vm.prank(admin);
        token.pause();
        vm.prank(minter);
        vm.expectRevert();
        token.mint(alice, 1000);
    }

    // ─────────── Burn ───────────

    function test_Burn_ByHolder() public {
        vm.prank(minter);
        token.mint(alice, 1000 * 10 ** 18);
        vm.prank(alice);
        token.burn(400 * 10 ** 18);
        assertEq(token.balanceOf(alice), 600 * 10 ** 18);
    }

    function test_Burn_RevertInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        token.burn(1);
    }

    // ─────────── Pause ───────────

    function test_Pause_BlocksTransfers() public {
        vm.prank(minter);
        token.mint(alice, 1000 * 10 ** 18);
        vm.prank(admin);
        token.pause();
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 100);
    }

    function test_Unpause_AllowsTransfers() public {
        vm.prank(minter);
        token.mint(alice, 1000 * 10 ** 18);
        vm.startPrank(admin);
        token.pause();
        token.unpause();
        vm.stopPrank();
        vm.prank(alice);
        token.transfer(bob, 500 * 10 ** 18);
        assertEq(token.balanceOf(bob), 500 * 10 ** 18);
    }

    function test_Pause_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        token.pause();
    }
}

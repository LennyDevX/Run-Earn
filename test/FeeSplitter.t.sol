// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {FeeSplitter} from "../contracts/FeeSplitter.sol";

contract FeeSplitterTest is Test {
    FeeSplitter splitter;
    address admin;
    address treasury;
    address staking;
    address redemption;
    address team;

    function setUp() public {
        admin = makeAddr("admin");
        treasury = makeAddr("treasury");
        staking = makeAddr("staking");
        redemption = makeAddr("redemption");
        team = makeAddr("team");
        splitter = new FeeSplitter(admin);

        address[] memory accounts = new address[](4);
        accounts[0] = treasury;
        accounts[1] = staking;
        accounts[2] = redemption;
        accounts[3] = team;
        uint256[] memory weights = new uint256[](4);
        weights[0] = 4_000; // 40%
        weights[1] = 3_000; // 30%
        weights[2] = 2_000; // 20%
        weights[3] = 1_000; // 10%
        vm.prank(admin);
        splitter.setRecipients(accounts, weights);
    }

    function test_Receive_AccumulatesBalance() public {
        (bool sent, ) = address(splitter).call{value: 1 ether}("");
        assertTrue(sent);
        assertEq(splitter.pendingFees(), 1 ether);
    }

    function test_Distribute_ProRataExact() public {
        (bool sent, ) = address(splitter).call{value: 1 ether}("");
        assertTrue(sent);

        uint256 treasuryBefore = treasury.balance;
        uint256 stakingBefore = staking.balance;
        uint256 redemptionBefore = redemption.balance;
        uint256 teamBefore = team.balance;

        splitter.distribute();

        assertEq(treasury.balance - treasuryBefore, 0.4 ether);
        assertEq(staking.balance - stakingBefore, 0.3 ether);
        assertEq(redemption.balance - redemptionBefore, 0.2 ether);
        assertEq(team.balance - teamBefore, 0.1 ether);
        assertEq(address(splitter).balance, 0);
        assertEq(splitter.totalDistributed(), 1 ether);
    }

    function test_Distribute_DustStaysForNextRound() public {
        // 3 wei: 40% = 1.2 → 1, 30% = 0.9 → 0, 20% = 0.6 → 0, last gets remainder 2
        (bool sent, ) = address(splitter).call{value: 3}("");
        assertTrue(sent);
        splitter.distribute();
        assertEq(treasury.balance, 1);
        assertEq(staking.balance, 0);
        assertEq(redemption.balance, 0);
        assertEq(team.balance, 2); // last recipient absorbs dust
        assertEq(address(splitter).balance, 0);
    }

    function test_Distribute_NothingToDistribute_Reverts() public {
        vm.expectRevert("FeeSplitter: nothing to distribute");
        splitter.distribute();
    }

    function test_SetRecipients_ZeroWeight_Reverts() public {
        address[] memory accounts = new address[](1);
        accounts[0] = treasury;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 0;
        vm.prank(admin);
        vm.expectRevert("FeeSplitter: zero weight");
        splitter.setRecipients(accounts, weights);
    }

    function test_SetRecipients_WrongSum_Reverts() public {
        address[] memory accounts = new address[](1);
        accounts[0] = treasury;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 9_999;
        vm.prank(admin);
        vm.expectRevert("FeeSplitter: weights must sum to 100%");
        splitter.setRecipients(accounts, weights);
    }

    function test_SetRecipients_ZeroAddress_Reverts() public {
        address[] memory accounts = new address[](1);
        accounts[0] = address(0);
        uint256[] memory weights = new uint256[](1);
        weights[0] = 10_000;
        vm.prank(admin);
        vm.expectRevert("FeeSplitter: zero recipient");
        splitter.setRecipients(accounts, weights);
    }

    function test_SetRecipients_NonAdmin_Reverts() public {
        address[] memory accounts = new address[](1);
        accounts[0] = treasury;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 10_000;
        vm.expectRevert();
        splitter.setRecipients(accounts, weights);
    }

    function test_SetRecipients_Empty_Reverts() public {
        address[] memory accounts = new address[](0);
        uint256[] memory weights = new uint256[](0);
        vm.prank(admin);
        vm.expectRevert("FeeSplitter: empty recipients");
        splitter.setRecipients(accounts, weights);
    }

    function test_ShareOf_LastRecipientAbsorbsDust() public view {
        assertEq(splitter.shareOf(0, 7), 2); // 40% of 7 = 2.8 → 2
        assertEq(splitter.shareOf(1, 7), 2); // 30% of 7 = 2.1 → 2
        assertEq(splitter.shareOf(2, 7), 1); // 20% of 7 = 1.4 → 1
        assertEq(splitter.shareOf(3, 7), 2); // remainder 7 - (2+2+1) = 2
    }

    function test_Pause_BlocksDistribution() public {
        (bool sent, ) = address(splitter).call{value: 1 ether}("");
        assertTrue(sent);
        vm.prank(admin);
        splitter.pause();
        vm.expectRevert();
        splitter.distribute();
    }
}

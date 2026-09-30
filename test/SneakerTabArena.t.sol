// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {SneakerTabArena} from "../contracts/SneakerTabArena.sol";
import {RENToken} from "../contracts/RENToken.sol";

/// @dev Covers the daily tab arena: the POL + locked-NFT gate, session
///      lifecycle, on-chain multiplier recomputation, score clamping, replay
///      protection, and the time-boxed boost written into SneakerStaking.
contract SneakerTabArenaTest is Test {
    RENToken ren;
    SneakerMint nft;
    SneakerMods mods;
    SneakerGame game;
    SneakerStaking staking;
    SneakerWorkshop workshop;
    SneakerTabArena arena;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address minter = makeAddr("minter");

    uint256 signerPk = 0xA11CE;
    address signer;

    uint256 constant RUNNER = 1;
    uint256 constant SESSION_WINDOW = 24 hours;
    uint256 constant BOOST_DURATION = 24 hours;

    function setUp() public {
        signer = vm.addr(signerPk);

        ren = new RENToken(admin, admin);
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(ren),
            1_000 ether,
            280, // baseApyBps
            0, // perNftBonusBps
            800, // maxApyBps
            [uint64(50), 80, 150, 180],
            2_592_000
        );
        game = new SneakerGame(
            admin,
            address(nft),
            address(ren),
            [uint256(100 ether), 200 ether, 400 ether, 800 ether],
            100,
            100,
            1,
            50 ether,
            100 ether
        );
        mods = new SneakerMods("Airen Mods", "AMOD", admin, address(nft), address(game), address(staking));
        workshop = new SneakerWorkshop(
            admin,
            address(nft),
            address(mods),
            address(game),
            address(staking),
            5_000,
            365 days
        );
        arena = new SneakerTabArena(admin, address(nft), address(workshop), address(staking), signer);

        vm.startPrank(admin);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        staking.grantRole(staking.TAB_ARENA_ROLE(), address(arena));
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        staking.setBoosts(address(workshop));
        vm.stopPrank();

        // Alice owns an Epic runner (rarity 65 → power 65 at full condition).
        vm.prank(minter);
        nft.mintAuthorized(alice, "ipfs://runner", keccak256("p1"), 65, 2);
    }

    // ─────────────────────────── Helpers ─────────────────────────

    function _deposit(address user, uint256 amount) internal {
        vm.deal(user, amount);
        vm.prank(user);
        staking.depositPOL{value: amount}();
    }

    function _lock(address user, uint256 tokenId) internal {
        vm.prank(user);
        nft.approve(address(staking), tokenId);
        vm.prank(user);
        staking.stake(tokenId);
    }

    /// @dev `sessions` is a mapping getter, so it returns a positional tuple.
    function _sessionOf(address player) internal view returns (SneakerTabArena.Session memory) {
        (
            uint256 runnerId,
            uint32 points,
            uint16 multiplier,
            uint16 boostBps,
            uint64 startedAt,
            uint64 completedAt,
            uint64 expiresAt,
            bool claimed
        ) = arena.sessions(player);
        return
            SneakerTabArena.Session(
                runnerId,
                points,
                multiplier,
                boostBps,
                startedAt,
                completedAt,
                expiresAt,
                claimed
            );
    }

    function _sign(uint256 pk, bytes32 digest) internal view returns (bytes memory) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _completeDigest(address player, uint256 nonce, uint32 points, uint64 deadline)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(address(arena), player, nonce, points, deadline));
    }

    /// @dev Full happy path: deposit, lock, start, complete.
    function _runSession(uint32 points) internal returns (uint16 boost) {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        vm.prank(alice);
        arena.startSession(RUNNER);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 1, points, deadline));

        vm.prank(alice);
        arena.completeSession(points, deadline, sig);
        boost = _sessionOf(alice).boostBps;
    }

    // ─────────────────────────── Gate ────────────────────────────

    function test_Gate_RevertWithoutPol() public {
        _lock(alice, RUNNER);
        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(RUNNER);
    }

    function test_Gate_RevertWithoutLockedRunner() public {
        _deposit(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(RUNNER);
    }

    function test_Gate_RevertWithUnrelatedRunner() public {
        _deposit(alice, 10 ether);
        vm.prank(minter);
        nft.mintAuthorized(bob, "ipfs://other", keccak256("p2"), 40, 1);
        _lock(bob, 2);

        // Alice has POL but the locked runner belongs to Bob.
        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(2);
    }

    function test_Gate_OpenWithPolAndLockedRunner() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        assertTrue(arena.canStart(alice, RUNNER));
    }

    function test_GateStatus_ReportsMissingPieces() public {
        (bool polOk, bool lockedOk, , ) = arena.gateStatus(alice, RUNNER);
        assertFalse(polOk);
        assertFalse(lockedOk);

        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        bool cooldownOk;
        uint64 readyAt;
        (polOk, lockedOk, cooldownOk, readyAt) = arena.gateStatus(alice, RUNNER);
        assertTrue(polOk);
        assertTrue(lockedOk);
        assertTrue(cooldownOk);
        assertEq(readyAt, 0);
    }

    // ─────────────────────────── Power ───────────────────────────

    function test_Power_FromRarityAndCondition() public {
        // Epic rarity 65, never used → pristine → power 65.
        assertEq(arena.powerOf(RUNNER), 65);
        assertEq(arena.multiplierOf(RUNNER), 3);
        assertEq(arena.boostCeilingBps(RUNNER), 115); // 50 + 65
    }

    function test_Power_EquippedModsRaiseScore() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        vm.startPrank(admin);
        mods.mintAuthorized(alice, "ipfs://m1", SneakerMods.ModTraits(0, 40, 1, 500, 255, false, keccak256("m1")));
        mods.mintAuthorized(alice, "ipfs://m2", SneakerMods.ModTraits(1, 40, 1, 500, 255, false, keccak256("m2")));
        mods.mintAuthorized(alice, "ipfs://m3", SneakerMods.ModTraits(2, 40, 1, 500, 255, false, keccak256("m3")));
        mods.mintAuthorized(alice, "ipfs://m4", SneakerMods.ModTraits(3, 40, 1, 500, 255, false, keccak256("m4")));
        vm.stopPrank();

        // 65 + 4 * 5 = 85 → x4 multiplier, ceiling 135.
        for (uint256 id = 1; id <= 4; ++id) {
            vm.prank(alice);
            mods.approve(address(workshop), id);
            vm.prank(alice);
            workshop.equip(RUNNER, id);
        }

        assertEq(arena.powerOf(RUNNER), 85);
        assertEq(arena.multiplierOf(RUNNER), 4);
        assertEq(arena.boostCeilingBps(RUNNER), 135);
    }

    function test_Power_WearReducesScore() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        // Equipping starts the season, so wear begins.
        vm.prank(admin);
        mods.mintAuthorized(alice, "ipfs://m1", SneakerMods.ModTraits(0, 40, 1, 500, 255, false, keccak256("m1")));
        vm.prank(alice);
        mods.approve(address(workshop), 1);
        vm.prank(alice);
        workshop.equip(RUNNER, 1);

        vm.warp(block.timestamp + 365 days);
        // Fully worn: 65 * 50% = 32, + 5 for the equipped mod = 37.
        assertEq(arena.powerOf(RUNNER), 37);
        assertEq(arena.multiplierOf(RUNNER), 2);
    }

    // ─────────────────────────── Sessions ────────────────────────

    function test_StartSession_RecordsRunnerAndExpiry() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        vm.prank(alice);
        arena.startSession(RUNNER);

        (
            uint256 runnerId,
            uint32 points,
            uint16 multiplier,
            ,
            uint64 startedAt,
            uint64 completedAt,
            uint64 expiresAt,
            bool claimed
        ) = arena.sessions(alice);
        assertEq(runnerId, RUNNER);
        assertEq(points, 0);
        assertEq(multiplier, 3);
        assertEq(startedAt, block.timestamp);
        assertEq(completedAt, 0);
        assertEq(expiresAt, uint64(block.timestamp) + SESSION_WINDOW);
        assertFalse(claimed);
        assertEq(arena.sessionNonce(alice), 1);
    }

    function test_StartSession_RevertWhileOneIsActive() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(RUNNER);
    }

    function test_AbandonSession_ReopensGate() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        vm.prank(alice);
        arena.abandonSession();

        assertTrue(arena.canStart(alice, RUNNER));
        vm.prank(alice);
        arena.startSession(RUNNER);
        assertEq(arena.sessionNonce(alice), 2);
    }

    function test_CompleteSession_RevertAfterWindow() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        vm.warp(block.timestamp + SESSION_WINDOW + 1);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 1, 600, deadline));

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: session expired");
        arena.completeSession(600, deadline, sig);
    }

    function test_CompleteSession_RevertWithoutSession() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 0, 600, deadline));
        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: no session");
        arena.completeSession(600, deadline, sig);
    }

    // ─────────────────────────── Signatures ──────────────────────

    function test_CompleteSession_RevertWrongSigner() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(0xB0B, _completeDigest(alice, 1, 600, deadline));

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: bad signature");
        arena.completeSession(600, deadline, sig);
    }

    function test_CompleteSession_RevertExpiredSignature() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        uint64 deadline = uint64(block.timestamp - 1);
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 1, 600, deadline));

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: signature expired");
        arena.completeSession(600, deadline, sig);
    }

    function test_CompleteSession_RevertReplayedSignature() public {
        _runSession(600);

        // The same nonce + score cannot be replayed for a second boost.
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 1, 600, deadline));

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(RUNNER);

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: already completed");
        arena.completeSession(600, deadline, sig);
    }

    function test_CompleteSession_RevertTamperedScore() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        // Signed for 100, submitted as 600.
        bytes memory sig = _sign(signerPk, _completeDigest(alice, 1, 100, deadline));

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: bad signature");
        arena.completeSession(600, deadline, sig);
    }

    // ─────────────────────────── Boost ───────────────────────────

    function test_CompleteSession_GrantsBoostFromLevel() public {
        uint16 boost = _runSession(600);
        assertEq(boost, 115); // ceiling for power 65 caps the 150 bps top level
        assertEq(staking.activeTabBoostBps(alice), 115);
        assertEq(staking.tabBoostExpiresAt(alice), uint64(block.timestamp) + BOOST_DURATION);
    }

    function test_Boost_RaisesEffectiveApy() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        // base 280 + Epic tier 150
        assertEq(staking.effectiveApyBps(alice), 430);

        vm.prank(alice);
        arena.startSession(RUNNER);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        arena.completeSession(600, deadline, _sign(signerPk, _completeDigest(alice, 1, 600, deadline)));

        // 430 + tab 115 = 545, still under the 800 cap.
        assertEq(staking.effectiveApyBps(alice), 545);
    }

    function test_Boost_LapsesAfterWindow() public {
        _runSession(600);
        assertEq(staking.activeTabBoostBps(alice), 115);

        vm.warp(block.timestamp + BOOST_DURATION + 1);
        assertEq(staking.activeTabBoostBps(alice), 0);
        assertEq(staking.effectiveApyBps(alice), 430);
    }

    function test_Boost_ClampedByProtocolApyCap() public {
        // A wallet already near the cap absorbs only the remaining headroom.
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        vm.startPrank(admin);
        mods.mintAuthorized(alice, "ipfs://boost", SneakerMods.ModTraits(5, 90, 3, 600, 255, false, keccak256("b")));
        staking.updateRewardParams(1_000 ether, 800, 0, 800, [uint64(50), 80, 150, 180], 2_592_000);
        vm.stopPrank();

        vm.prank(alice);
        mods.approve(address(workshop), 1);
        vm.prank(alice);
        workshop.equip(RUNNER, 1);

        // 800 base + 150 tier + 600 mod = 1550 requested, clamped to 800.
        assertEq(staking.effectiveApyBps(alice), 800);

        vm.prank(alice);
        arena.startSession(RUNNER);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        arena.completeSession(600, deadline, _sign(signerPk, _completeDigest(alice, 1, 600, deadline)));

        // Still capped: the tab boost never lifts a wallet past maxApyBps.
        assertEq(staking.effectiveApyBps(alice), 800);
    }

    function test_SetTabBoost_RevertAboveCeiling() public {
        vm.prank(address(arena));
        vm.expectRevert("SneakerStaking: tab boost too high");
        staking.setTabBoost(alice, 151, uint64(block.timestamp + 1 days));
    }

    function test_SetTabBoost_RevertWithoutRole() public {
        vm.prank(alice);
        vm.expectRevert();
        staking.setTabBoost(alice, 100, uint64(block.timestamp + 1 days));
    }

    function test_SetMaxTabBoostBps_ClampedToApyCap() public {
        vm.prank(admin);
        vm.expectRevert("SneakerStaking: tab cap above APY cap");
        staking.setMaxTabBoostBps(801);

        vm.prank(admin);
        staking.setMaxTabBoostBps(200);
        assertEq(staking.maxTabBoostBps(), 200);
    }

    // ─────────────────────────── Clamping ────────────────────────

    function test_CompleteSession_ClampsInflatedScore() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        // A leaked signer cannot mint an unbounded score: power 65 → x3,
        // so the accepted score is capped at 3 * 600 = 1800.
        uint32 inflated = 9_999;
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        arena.completeSession(inflated, deadline, _sign(signerPk, _completeDigest(alice, 1, inflated, deadline)));

        assertEq(_sessionOf(alice).points, 1_800);
    }

    function test_CompleteSession_MultiplierRecomputedOnChain() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);
        vm.prank(alice);
        arena.startSession(RUNNER);

        // Equip four mods mid-session: the arena recomputes power at completion,
        // so the boost reflects the live loadout rather than the session start.
        vm.startPrank(admin);
        for (uint256 i; i < 4; ++i) {
            mods.mintAuthorized(
                alice,
                "ipfs://mid",
                SneakerMods.ModTraits(uint8(i), 40, 1, 500, 255, false, keccak256(abi.encode("mid", i)))
            );
        }
        vm.stopPrank();
        for (uint256 id = 1; id <= 4; ++id) {
            vm.prank(alice);
            mods.approve(address(workshop), id);
            vm.prank(alice);
            workshop.equip(RUNNER, id);
        }

        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(alice);
        arena.completeSession(600, deadline, _sign(signerPk, _completeDigest(alice, 1, 600, deadline)));

        // power 85 → x4 multiplier and a 135 bps ceiling.
        assertEq(_sessionOf(alice).multiplier, 4);
        assertEq(_sessionOf(alice).boostBps, 135);
    }

    // ─────────────────────────── Cooldown ────────────────────────

    function test_Cooldown_BlocksSecondSessionSameDay() public {
        _runSession(600);

        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(RUNNER);
    }

    function test_Cooldown_AllowsNextDay() public {
        _runSession(600);

        vm.warp(block.timestamp + 24 hours + 1);
        assertTrue(arena.canStart(alice, RUNNER));

        vm.prank(alice);
        arena.startSession(RUNNER);
        assertEq(arena.sessionNonce(alice), 2);
    }

    // ─────────────────────────── Admin ───────────────────────────

    function test_Pause_BlocksSessions() public {
        _deposit(alice, 10 ether);
        _lock(alice, RUNNER);

        vm.prank(admin);
        arena.pause();

        vm.prank(alice);
        vm.expectRevert();
        arena.startSession(RUNNER);
    }

    function test_SetSigner_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        arena.setSigner(alice);

        vm.prank(admin);
        arena.setSigner(bob);
        assertEq(arena.signer(), bob);
    }

    function test_SetSigner_RevertZero() public {
        vm.prank(admin);
        vm.expectRevert("SneakerTabArena: zero signer");
        arena.setSigner(address(0));
    }

    function test_PointsForLevel() public {
        assertEq(arena.pointsForLevel(1), 50);
        assertEq(arena.pointsForLevel(6), 600);
        vm.expectRevert("SneakerTabArena: bad level");
        arena.pointsForLevel(7);
    }
}

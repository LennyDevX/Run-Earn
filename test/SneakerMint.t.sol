// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";

contract SneakerMintTest is Test {
    SneakerMint nft;
    address admin = address(0xA11CE);
    address minter = address(0xB0B);
    address alice = address(0xA1);

    bytes32 constant PROOF = keccak256("sneaker-photo-proof-1");
    bytes32 constant PROOF2 = keccak256("sneaker-photo-proof-2");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsRoles() public view {
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), admin), "admin role");
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), admin), "minter role");
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("SneakerMint: zero admin");
        new SneakerMint("Test", "TST", address(0));
    }

    // ─────────── mintAuthorized ───────────

    function test_MintAuthorized_ByMinter() public {
        vm.prank(admin); // admin has MINTER_ROLE
        uint256 tokenId = nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.totalMinted(), 1);
    }

    function test_MintAuthorized_EmitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit SneakerMint.SneakerMinted(alice, 1, PROOF, 50, 2);
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
    }

    function test_MintAuthorized_RevertNonMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
    }

    function test_MintAuthorized_RevertZeroRecipient() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMint: zero recipient");
        nft.mintAuthorized(address(0), URI, PROOF, 50, 2);
    }

    function test_MintAuthorized_RevertEmptyProof() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMint: empty proof");
        nft.mintAuthorized(alice, URI, bytes32(0), 50, 2);
    }

    function test_MintAuthorized_RevertProofUsed() public {
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        vm.expectRevert("SneakerMint: proof used");
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        vm.stopPrank();
    }

    function test_MintAuthorized_RevertInvalidRarity() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMint: invalid rarity");
        nft.mintAuthorized(alice, URI, PROOF, 101, 2);
    }

    function test_MintAuthorized_RevertInvalidTier() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMint: invalid tier");
        nft.mintAuthorized(alice, URI, PROOF, 50, 4);
    }

    function test_MintAuthorized_RevertWhenPaused() public {
        vm.prank(admin);
        nft.pause();
        vm.prank(admin);
        vm.expectRevert();
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
    }

    // ─────────── mintWithProof ───────────

    function test_MintWithProof_WhenEnabled() public {
        vm.prank(admin);
        nft.setPublicMintEnabled(true);
        vm.prank(alice);
        uint256 tokenId = nft.mintWithProof(URI, PROOF, 30, 1);
        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_MintWithProof_RevertWhenDisabled() public {
        vm.prank(alice);
        vm.expectRevert("SneakerMint: public mint disabled");
        nft.mintWithProof(URI, PROOF, 30, 1);
    }

    // ─────────── traitsOf ───────────

    function test_TraitsOf_ReturnsCorrectTraits() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF, 75, 3);
        SneakerMint.SneakerTraits memory traits = nft.traitsOf(1);
        assertEq(traits.rarity, 75);
        assertEq(traits.tier, 3);
        assertEq(traits.proofHash, PROOF);
    }

    function test_TraitsOf_RevertNonexistent() public {
        vm.expectRevert();
        nft.traitsOf(999);
    }

    // ─────────── usedProofs ───────────

    function test_UsedProofs_TrueAfterMint() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        assertTrue(nft.usedProofs(PROOF));
    }

    function test_UsedProofs_DifferentProofAllowed() public {
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        nft.mintAuthorized(alice, URI, PROOF2, 50, 2);
        vm.stopPrank();
        assertEq(nft.totalMinted(), 2);
    }

    // ─────────── Pause ───────────

    function test_Pause_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.pause();
    }

    function test_Unpause_AllowsMint() public {
        vm.startPrank(admin);
        nft.pause();
        nft.unpause();
        nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        vm.stopPrank();
        assertEq(nft.totalMinted(), 1);
    }

    // ─────────── Sequential token IDs ───────────

    function test_TokenIds_Sequential() public {
        vm.startPrank(admin);
        uint256 id1 = nft.mintAuthorized(alice, URI, PROOF, 50, 2);
        uint256 id2 = nft.mintAuthorized(alice, URI, PROOF2, 50, 2);
        vm.stopPrank();
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    // ─────────── Fuzz: rarity bounds ───────────

    function testFuzz_MintAuthorized_RarityBounds(uint8 rarity) public {
        vm.assume(rarity <= 100);
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, PROOF, rarity, 2);
        assertEq(nft.traitsOf(1).rarity, rarity);
    }

    function testFuzz_MintAuthorized_RevertRarityOver100(uint8 rarity) public {
        vm.assume(rarity > 100);
        vm.prank(admin);
        vm.expectRevert("SneakerMint: invalid rarity");
        nft.mintAuthorized(alice, URI, PROOF, rarity, 2);
    }
}

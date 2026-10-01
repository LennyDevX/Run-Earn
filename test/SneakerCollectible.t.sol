// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {SneakerMods} from "../contracts/SneakerMods.sol";
import {SneakerGame} from "../contracts/SneakerGame.sol";
import {SneakerStaking} from "../contracts/SneakerStaking.sol";
import {SneakerWorkshop} from "../contracts/SneakerWorkshop.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";
import {SneakerMarketplace} from "../contracts/SneakerMarketplace.sol";
import {SneakerTabArena} from "../contracts/SneakerTabArena.sol";
import {SneakerVault} from "../contracts/SneakerVault.sol";
import {RENToken} from "../contracts/RENToken.sol";

/// @dev Covers the collectible/playable split: the kind discriminator, the three
///      uniqueness fingerprints, every usage gate, appraiser pricing, and the
///      marketplace's appraiser-only listing path.
contract SneakerCollectibleTest is Test {
    RENToken ren;
    SneakerMint nft;
    SneakerMods mods;
    SneakerGame game;
    SneakerStaking staking;
    SneakerWorkshop workshop;
    SneakerAppraiser appraiser;
    SneakerMarketplace marketplace;
    SneakerTabArena arena;
    SneakerVault vault;

    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address signer = makeAddr("signer");

    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
    bytes32 constant PROOF = keccak256("artwork-1");
    bytes32 constant PROOF2 = keccak256("artwork-2");
    bytes32 constant DESIGN = keccak256("design-1");
    bytes32 constant DESIGN2 = keccak256("design-2");
    bytes32 constant STYLE = keccak256("style-1");
    bytes32 constant STYLE2 = keccak256("style-2");

    function setUp() public {
        ren = new RENToken(admin, admin);
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        staking = new SneakerStaking(
            admin,
            address(nft),
            address(ren),
            1_000 ether,
            280,
            0,
            800,
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
        appraiser = new SneakerAppraiser(
            admin,
            address(nft),
            0.5 ether, // baseValue
            [uint256(0), 1 ether, 3 ether, 8 ether],
            0.01 ether, // rarityWeight
            10_000
        );
        marketplace = new SneakerMarketplace(
            admin,
            address(nft),
            address(appraiser),
            address(staking),
            250,
            12_000,
            admin
        );
        arena = new SneakerTabArena(admin, address(nft), address(workshop), address(staking), signer);
        vault = new SneakerVault(
            admin,
            address(nft),
            address(mods),
            address(nft),
            address(workshop),
            address(staking),
            makeAddr("progress") // unused: no perk in this suite sets requiredLevel
        );

        vm.startPrank(admin);
        staking.setBoosts(address(workshop));
        game.setBoosts(address(workshop));
        game.setWorkshop(address(workshop));
        appraiser.setBoosts(address(workshop));
        marketplace.setWorkshop(address(workshop));
        staking.grantRole(staking.TAB_ARENA_ROLE(), address(arena));
        vm.stopPrank();
    }

    // ─────────────────────────── Helpers ─────────────────────────

    function _mintPlayable(address to, uint8 rarity, uint8 tier) internal returns (uint256) {
        vm.prank(admin);
        return nft.mintAuthorized(to, URI, keccak256(abi.encode("playable", to, rarity, tier)), rarity, tier);
    }

    function _mintCollectible(address to, uint8 rarity, uint8 tier) internal returns (uint256) {
        vm.prank(admin);
        return nft.mintCollectible(
            to,
            URI,
            keccak256(abi.encode("art", to, rarity, tier)),
            keccak256(abi.encode("design", to, rarity, tier)),
            keccak256(abi.encode("style", to, rarity, tier)),
            rarity,
            tier
        );
    }

    // ─────────────────────────── Kind ────────────────────────────

    function test_MintAuthorized_CreatesPlayable() public {
        uint256 tokenId = _mintPlayable(alice, 50, 2);
        assertTrue(nft.isPlayable(tokenId));
        assertFalse(nft.isCollectible(tokenId));
        assertEq(uint8(nft.kindOf(tokenId)), uint8(SneakerMint.SneakerKind.Playable));
    }

    function test_MintCollectible_CreatesCollectible() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        assertTrue(nft.isCollectible(tokenId));
        assertFalse(nft.isPlayable(tokenId));
        assertEq(uint8(nft.kindOf(tokenId)), uint8(SneakerMint.SneakerKind.Collectible));
    }

    function test_Kind_DefaultsToPlayableForLegacyMints() public {
        // `mintAuthorized` never writes the kind explicitly on legacy paths —
        // the enum default is Playable, which is what keeps pre-split tokens
        // usable until an admin migrates them.
        uint256 tokenId = _mintPlayable(alice, 50, 1);
        assertEq(uint8(nft.kindOf(tokenId)), 0);
    }

    function test_IsPlayable_RevertForNonexistent() public {
        vm.expectRevert();
        nft.isPlayable(999);
    }

    // ─────────────────────────── Uniqueness ──────────────────────

    function test_Collectible_RevertDuplicateProof() public {
        vm.prank(admin);
        nft.mintCollectible(alice, URI, PROOF, DESIGN, STYLE, 70, 2);

        // Same artwork hash, fresh design + style.
        vm.prank(admin);
        vm.expectRevert("SneakerMint: proof used");
        nft.mintCollectible(bob, URI, PROOF, DESIGN2, STYLE2, 70, 2);
    }

    function test_Collectible_RevertDuplicateDesign() public {
        vm.prank(admin);
        nft.mintCollectible(alice, URI, PROOF, DESIGN, STYLE, 70, 2);

        // Same physical pair, different render.
        vm.prank(admin);
        vm.expectRevert("SneakerMint: design already minted");
        nft.mintCollectible(bob, URI, PROOF2, DESIGN, STYLE2, 70, 2);
    }

    function test_Collectible_RevertDuplicateStyle() public {
        vm.prank(admin);
        nft.mintCollectible(alice, URI, PROOF, DESIGN, STYLE, 70, 2);

        // Different pair, but the render was handed the same style combination.
        vm.prank(admin);
        vm.expectRevert("SneakerMint: style already used");
        nft.mintCollectible(bob, URI, PROOF2, DESIGN2, STYLE, 70, 2);
    }

    function test_Collectible_DistinctFingerprintsAllMint() public {
        vm.prank(admin);
        nft.mintCollectible(alice, URI, PROOF, DESIGN, STYLE, 70, 2);
        vm.prank(admin);
        uint256 second = nft.mintCollectible(bob, URI, PROOF2, DESIGN2, STYLE2, 40, 1);
        assertEq(second, 2);
        assertTrue(nft.isCollectible(second));
    }

    function test_Collectible_RevertEmptyFingerprints() public {
        vm.prank(admin);
        vm.expectRevert("SneakerMint: empty design hash");
        nft.mintCollectible(alice, URI, PROOF, bytes32(0), STYLE, 70, 2);

        vm.prank(admin);
        vm.expectRevert("SneakerMint: empty style key");
        nft.mintCollectible(alice, URI, PROOF, DESIGN, bytes32(0), 70, 2);
    }

    function test_IsFingerprintUsed() public {
        vm.prank(admin);
        nft.mintCollectible(alice, URI, PROOF, DESIGN, STYLE, 70, 2);

        assertTrue(nft.isFingerprintUsed(DESIGN, keccak256("unused")));
        assertTrue(nft.isFingerprintUsed(keccak256("unused"), STYLE));
        assertFalse(nft.isFingerprintUsed(keccak256("free-design"), keccak256("free-style")));
    }

    // ─────────────────────────── Migration ───────────────────────

    function test_SetKind_ReclassifiesToken() public {
        uint256 tokenId = _mintPlayable(alice, 50, 2);
        assertTrue(nft.isPlayable(tokenId));

        vm.prank(admin);
        nft.setKind(tokenId, SneakerMint.SneakerKind.Collectible);
        assertTrue(nft.isCollectible(tokenId));
        assertFalse(nft.isPlayable(tokenId));
    }

    function test_SetKindBatch_ReclassifiesMany() public {
        uint256 a = _mintPlayable(alice, 50, 2);
        uint256 b = _mintPlayable(bob, 40, 1);
        uint256 c = _mintPlayable(alice, 90, 3);

        uint256[] memory ids = new uint256[](3);
        ids[0] = a;
        ids[1] = b;
        ids[2] = c;

        vm.prank(admin);
        nft.setKindBatch(ids, SneakerMint.SneakerKind.Collectible);
        assertTrue(nft.isCollectible(a));
        assertTrue(nft.isCollectible(b));
        assertTrue(nft.isCollectible(c));
    }

    function test_SetKind_OnlyAdmin() public {
        uint256 tokenId = _mintPlayable(alice, 50, 2);
        vm.prank(alice);
        vm.expectRevert();
        nft.setKind(tokenId, SneakerMint.SneakerKind.Collectible);
    }

    // ─────────────────────────── Usage gates ─────────────────────

    function test_Gate_CollectibleCannotStake() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(staking), tokenId);
        vm.prank(alice);
        vm.expectRevert("SneakerStaking: not a veSneaker");
        staking.stake(tokenId);
    }

    function test_Gate_PlayableCanStake() public {
        uint256 tokenId = _mintPlayable(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(staking), tokenId);
        vm.prank(alice);
        staking.stake(tokenId);
        assertEq(staking.stakedOwner(tokenId), alice);
    }

    function test_Gate_CollectibleCannotActivate() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(alice);
        vm.expectRevert("SneakerGame: not a veSneaker");
        game.activate(tokenId);
    }

    function test_Gate_CollectibleCannotEquipMods() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(admin);
        mods.mintAuthorized(alice, URI, SneakerMods.ModTraits(0, 40, 1, 500, 255, false, keccak256("m")));

        vm.prank(alice);
        mods.approve(address(workshop), 1);
        vm.prank(alice);
        vm.expectRevert("SneakerWorkshop: not sneaker owner");
        workshop.equip(tokenId, 1);
    }

    function test_Gate_CollectibleCannotEnterArena() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        staking.depositPOL{value: 10 ether}();

        // Not locked (it cannot be), so the gate stays closed.
        assertFalse(arena.canStart(alice, tokenId));
        vm.prank(alice);
        vm.expectRevert("SneakerTabArena: gate closed");
        arena.startSession(tokenId);
    }

    function test_Gate_CollectibleCannotSatisfyVaultTierGate() public {
        _mintCollectible(alice, 95, 3);
        vm.prank(admin);
        vault.setPerk(0, 0, 1_000, 3, 0, 0, 0, 0, true);
        // A Mythic collectible must not unlock a veSneaker perk.
        assertEq(vault.discountBps(alice, 0), 0);
    }

    // ─────────────────────────── Appraiser ───────────────────────

    function test_Appraiser_CollectibleUsesOwnTrack() public {
        uint256 collectible = _mintCollectible(alice, 70, 2);
        uint256 playable = _mintPlayable(bob, 70, 2);

        (uint256 artValue, , ) = appraiser.appraise(collectible);
        (uint256 veValue, , ) = appraiser.appraise(playable);

        // Collectible: 210 + 2200 + 700 = 3110 POL
        assertEq(artValue, 3_110 ether);
        // Playable: 0.5 + 3 + 0.7 = 4.2 POL
        assertEq(veValue, 4.2 ether);
        assertGt(artValue, veValue * 100);
    }

    function test_Appraiser_CollectibleRangeMatchesTargetBand() public {
        uint256 floor = _mintCollectible(alice, 0, 0);
        uint256 ceiling = _mintCollectible(bob, 100, 3);

        (uint256 floorValue, , ) = appraiser.appraise(floor);
        (uint256 ceilingValue, , ) = appraiser.appraise(ceiling);

        // Appraised floor 210 POL, ceiling 6560 POL.
        assertEq(floorValue, 210 ether);
        assertEq(ceilingValue, 6_560 ether);
    }

    function test_Appraiser_CollectibleRawPreview() public {
        assertEq(appraiser.appraiseCollectibleRaw(0, 0), 210 ether);
        assertEq(appraiser.appraiseCollectibleRaw(100, 3), 6_560 ether);
        // The playable preview is untouched.
        assertEq(appraiser.appraiseRaw(50, 2), 4 ether);
    }

    function test_Appraiser_UpdateCollectibleParams_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        appraiser.updateCollectibleParams(1 ether, [uint256(0), 0, 0, 0], 0, 10_000);

        vm.prank(admin);
        appraiser.updateCollectibleParams(100 ether, [uint256(0), 1 ether, 2 ether, 3 ether], 1 ether, 10_000);
        (uint256 base, , uint256 weight, uint256 mult) = appraiser.collectibleParams();
        assertEq(base, 100 ether);
        assertEq(weight, 1 ether);
        assertEq(mult, 10_000);
    }

    // ─────────────────────────── Marketplace ─────────────────────

    function test_Marketplace_CollectibleCannotUseFreePricing() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: use listAtAppraisal");
        marketplace.list(address(nft), tokenId, 1 ether);
    }

    function test_Marketplace_ListAtAppraisalSetsPrice() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);

        vm.prank(alice);
        marketplace.listAtAppraisal(address(nft), tokenId);

        (, , , uint256 price, , bool active) = marketplace.listings(1);
        // 3110 appraised x 1.2 premium = 3732 POL
        assertEq(price, 3_732 ether);
        assertTrue(active);
        assertEq(nft.ownerOf(tokenId), address(marketplace));
    }

    function test_Marketplace_ListAtAppraisalRevertsForPlayable() public {
        uint256 tokenId = _mintPlayable(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);
        vm.prank(alice);
        vm.expectRevert("SneakerMarketplace: not a collectible");
        marketplace.listAtAppraisal(address(nft), tokenId);
    }

    function test_Marketplace_PlayableStillUsesFreePricing() public {
        uint256 tokenId = _mintPlayable(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.list(address(nft), tokenId, 1_000 ether);

        (, , , uint256 price, , bool active) = marketplace.listings(1);
        assertEq(price, 1_000 ether);
        assertTrue(active);
    }

    function test_Marketplace_SuggestedPriceMatchesListingPrice() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        assertEq(marketplace.suggestedPrice(tokenId), 3_732 ether);

        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.listAtAppraisal(address(nft), tokenId);
        (, , , uint256 price, , ) = marketplace.listings(1);
        assertEq(price, marketplace.suggestedPrice(tokenId));
    }

    function test_Marketplace_CollectibleCanBeBought() public {
        uint256 tokenId = _mintCollectible(alice, 70, 2);
        vm.prank(alice);
        nft.approve(address(marketplace), tokenId);
        vm.prank(alice);
        marketplace.listAtAppraisal(address(nft), tokenId);

        vm.deal(bob, 10_000 ether);
        vm.prank(bob);
        marketplace.buy{value: 3_732 ether}(1);
        assertEq(nft.ownerOf(tokenId), bob);
    }
}

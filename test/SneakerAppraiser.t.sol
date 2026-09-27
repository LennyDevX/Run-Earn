// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {SneakerMint} from "../contracts/SneakerMint.sol";
import {SneakerAppraiser} from "../contracts/SneakerAppraiser.sol";

contract SneakerAppraiserTest is Test {
    SneakerMint nft;
    SneakerAppraiser appraiser;

    address admin = address(0xA11CE);
    address alice = address(0xA1);

    bytes32 constant PROOF = keccak256("appraisal-proof-1");
    bytes32 constant PROOF2 = keccak256("appraisal-proof-2");
    string constant URI = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";

    // Default params:
    // baseValue = 0.5 POL, tierValues = [0, 1, 3, 8] POL, rarityWeight = 0.01 POL, multiplier = 1x
    uint256 baseValue = 0.5 ether;
    uint256[4] tierValues = [0 ether, 1 ether, 3 ether, 8 ether];
    uint256 rarityWeight = 0.01 ether;
    uint256 globalMultiplierBps = 10_000;

    function setUp() public {
        nft = new SneakerMint("Airen Sneakers", "ASNEAK", admin);
        appraiser = new SneakerAppraiser(
            admin,
            address(nft),
            baseValue,
            tierValues,
            rarityWeight,
            globalMultiplierBps
        );

        // Mint NFTs for alice at different tiers
        vm.startPrank(admin);
        nft.mintAuthorized(alice, URI, PROOF, 50, 2); // tokenId 1: Epic, rarity 50
        nft.mintAuthorized(alice, URI, PROOF2, 90, 3); // tokenId 2: Mythic, rarity 90
        vm.stopPrank();
    }

    // ─────────── Constructor ───────────

    function test_Constructor_SetsParams() public view {
        assertEq(address(appraiser.nft()), address(nft));
        assertEq(appraiser.baseValue(), baseValue);
        assertEq(appraiser.rarityWeight(), rarityWeight);
        assertEq(appraiser.globalMultiplierBps(), globalMultiplierBps);
        assertTrue(appraiser.hasRole(appraiser.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_Constructor_RevertZeroAdmin() public {
        vm.expectRevert("SneakerAppraiser: zero admin");
        new SneakerAppraiser(address(0), address(nft), baseValue, tierValues, rarityWeight, globalMultiplierBps);
    }

    function test_Constructor_RevertZeroNFT() public {
        vm.expectRevert("SneakerAppraiser: zero NFT");
        new SneakerAppraiser(admin, address(0), baseValue, tierValues, rarityWeight, globalMultiplierBps);
    }

    function test_Constructor_RevertZeroMultiplier() public {
        vm.expectRevert("SneakerAppraiser: zero multiplier");
        new SneakerAppraiser(admin, address(nft), baseValue, tierValues, rarityWeight, 0);
    }

    // ─────────── Appraise ───────────

    function test_Appraise_EpicNFT() public {
        (uint256 value, uint8 rarity, uint8 tier) = appraiser.appraise(1);
        // baseValue(0.5) + tierValues[2](3) + rarity(50) * rarityWeight(0.01) = 0.5 + 3 + 0.5 = 4 POL
        assertEq(value, 4 ether);
        assertEq(rarity, 50);
        assertEq(tier, 2);
    }

    function test_Appraise_MythicNFT() public {
        (uint256 value, uint8 rarity, uint8 tier) = appraiser.appraise(2);
        // baseValue(0.5) + tierValues[3](8) + rarity(90) * rarityWeight(0.01) = 0.5 + 8 + 0.9 = 9.4 POL
        assertEq(value, 9.4 ether);
        assertEq(rarity, 90);
        assertEq(tier, 3);
    }

    function test_Appraise_CommonNFT() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, keccak256("common"), 20, 0);
        (uint256 value, uint8 rarity, uint8 tier) = appraiser.appraise(3);
        // baseValue(0.5) + tierValues[0](0) + rarity(20) * rarityWeight(0.01) = 0.5 + 0 + 0.2 = 0.7 POL
        assertEq(value, 0.7 ether);
        assertEq(rarity, 20);
        assertEq(tier, 0);
    }

    function test_Appraise_RareNFT() public {
        vm.prank(admin);
        nft.mintAuthorized(alice, URI, keccak256("rare"), 60, 1);
        (uint256 value, uint8 rarity, uint8 tier) = appraiser.appraise(3);
        // baseValue(0.5) + tierValues[1](1) + rarity(60) * rarityWeight(0.01) = 0.5 + 1 + 0.6 = 2.1 POL
        assertEq(value, 2.1 ether);
        assertEq(rarity, 60);
        assertEq(tier, 1);
    }

    function test_Appraise_RevertNonexistent() public {
        vm.expectRevert();
        appraiser.appraise(999);
    }

    // ─────────── AppraiseRaw ───────────

    function test_AppraiseRaw_ReturnsValue() public {
        // baseValue(0.5) + tierValues[3](8) + rarity(100) * rarityWeight(0.01) = 0.5 + 8 + 1 = 9.5 POL
        assertEq(appraiser.appraiseRaw(100, 3), 9.5 ether);
    }

    function test_AppraiseRaw_RevertInvalidTier() public {
        vm.expectRevert("SneakerAppraiser: invalid tier");
        appraiser.appraiseRaw(50, 5);
    }

    function test_AppraiseRaw_RevertInvalidRarity() public {
        vm.expectRevert("SneakerAppraiser: invalid rarity");
        appraiser.appraiseRaw(101, 2);
    }

    // ─────────── Global Multiplier ───────────

    function test_GlobalMultiplier_AppliesToEstimate() public {
        // Set multiplier to 1.5x (15000 bps)
        vm.prank(admin);
        appraiser.updateParams(baseValue, tierValues, rarityWeight, 15_000);

        (uint256 value, , ) = appraiser.appraise(1);
        // raw = 4 POL, with 1.5x = 6 POL
        assertEq(value, 6 ether);
    }

    // ─────────── Admin ───────────

    function test_UpdateParams() public {
        uint256[4] memory newTierValues = [uint256(1 ether), 2 ether, 5 ether, 12 ether];
        vm.prank(admin);
        appraiser.updateParams(1 ether, newTierValues, 0.02 ether, 12_000);

        assertEq(appraiser.baseValue(), 1 ether);
        assertEq(appraiser.rarityWeight(), 0.02 ether);
        assertEq(appraiser.globalMultiplierBps(), 12_000);
    }

    function test_UpdateParams_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        appraiser.updateParams(1 ether, tierValues, 0.02 ether, 12_000);
    }

    function test_UpdateParams_RevertZeroMultiplier() public {
        vm.prank(admin);
        vm.expectRevert("SneakerAppraiser: zero multiplier");
        appraiser.updateParams(baseValue, tierValues, rarityWeight, 0);
    }

    // ─────────── Tier Labels & Boosts ───────────

    function test_TierLabel() public {
        assertEq(appraiser.tierLabel(0), "Common");
        assertEq(appraiser.tierLabel(1), "Rare");
        assertEq(appraiser.tierLabel(2), "Epic");
        assertEq(appraiser.tierLabel(3), "Mythic");
    }

    function test_TierBoostBps() public {
        assertEq(appraiser.tierBoostBps(0), 50); // Common: +0.5%
        assertEq(appraiser.tierBoostBps(1), 80); // Rare: +0.8%
        assertEq(appraiser.tierBoostBps(2), 150); // Epic: +1.5%
        assertEq(appraiser.tierBoostBps(3), 180); // Mythic: +1.8%
    }

    function test_TierValueList() public view {
        uint256[4] memory values = appraiser.tierValueList();
        assertEq(values[0], tierValues[0]);
        assertEq(values[1], tierValues[1]);
        assertEq(values[2], tierValues[2]);
        assertEq(values[3], tierValues[3]);
    }

    // ─────────── Fuzz ───────────

    function testFuzz_AppraiseRaw_RarityBounds(uint8 rarity, uint8 tier) public {
        vm.assume(rarity <= 100);
        vm.assume(tier < 4);
        uint256 value = appraiser.appraiseRaw(rarity, tier);
        uint256 expected = (baseValue + tierValues[tier] + uint256(rarity) * rarityWeight) * globalMultiplierBps / 10_000;
        assertEq(value, expected);
    }
}

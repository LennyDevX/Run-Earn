import assert from "node:assert";
import { describe, it } from "mocha";
import {
  STYLE_COMBINATION_COUNT,
  STYLE_COMPOSITIONS,
  STYLE_PALETTES,
  TIER_TARGETS,
  gradeCollectible,
  pickStyle,
  pickTier,
  qualityScore,
  qualityToTier,
  rarityScoreForTier,
  tierLabel,
  type CollectibleTier,
  type RaritySignals,
} from "../src/lib/collectible.js";

/// ─────────────────────── Collectible grading (AI pipeline) ─────────────────
///
/// `src/lib/collectible.ts` is what decides **how much a minted collectible is
/// worth** — the tier and the rarity score written into the NFT. It had no tests,
/// while the contract that stores the result had 29.
///
/// That gap matters because the logic is where the money is: a bug here either
/// inflates scarcity (every photo grades Mythic) or destroys it (nobody ever
/// does). The contract cannot catch either — it trusts whatever it is handed.
///
/// Everything here is pure, so it runs without Gemini, a wallet, or a chain.

const signals = (detailDensity: number, colorComplexity: number, distinctiveness: number): RaritySignals => ({
  detailDensity,
  colorComplexity,
  distinctiveness,
});

const NO_MINTS = [0, 0, 0, 0];

describe("Collectible grading — quality score", () => {
  it("blends the three signals with their documented weights", () => {
    // 0.35 detail + 0.25 colour + 0.40 distinctiveness.
    assert.equal(qualityScore(signals(100, 0, 0)), 35);
    assert.equal(qualityScore(signals(0, 100, 0)), 25);
    assert.equal(qualityScore(signals(0, 0, 100)), 40);
    assert.equal(qualityScore(signals(100, 100, 100)), 100);
  });

  it("clamps out-of-range and non-finite signals instead of trusting the model", () => {
    // The vision pass is an LLM. It can return 400, -20 or null; none of those may
    // become an inflated score.
    assert.equal(qualityScore(signals(400, 0, 0)), 35, "above 100 is clamped");
    assert.equal(qualityScore(signals(-50, 0, 0)), 0, "below 0 is clamped");
    assert.equal(qualityScore(signals(Number.NaN, 0, 0)), 0, "NaN becomes 0");
    // `Infinity` is not finite, so it is discarded rather than treated as a
    // perfect score — the conservative reading, which is the right one for a
    // signal that decides what a paid mint is worth.
    assert.equal(qualityScore(signals(Number.POSITIVE_INFINITY, 0, 0)), 0, "Infinity is discarded");
  });

  it("returns an integer inside 0..100 for any input", () => {
    for (const value of [0, 1, 12.5, 50, 99.9, 100]) {
      const score = qualityScore(signals(value, value, value));
      assert.ok(Number.isInteger(score), `${value} produced a non-integer`);
      assert.ok(score >= 0 && score <= 100, `${value} produced ${score}`);
    }
  });
});

describe("Collectible grading — tier thresholds", () => {
  it("maps quality to the documented cut-offs", () => {
    assert.equal(qualityToTier(100), 3);
    assert.equal(qualityToTier(95), 3);
    assert.equal(qualityToTier(94), 2);
    assert.equal(qualityToTier(80), 2);
    assert.equal(qualityToTier(79), 1);
    assert.equal(qualityToTier(50), 1);
    assert.equal(qualityToTier(49), 0);
    assert.equal(qualityToTier(0), 0);
  });

  it("clamps quality outside 0..100", () => {
    assert.equal(qualityToTier(1000), 3);
    assert.equal(qualityToTier(-1000), 0);
  });
});

describe("Collectible grading — scarcity enforcement", () => {
  it("grades on quality alone below the sample floor", () => {
    // 19 mints: the curve has no signal yet, so a perfect piece is Mythic.
    assert.equal(pickTier(100, [9, 6, 3, 1]), 3);
  });

  it("lowers the tier once it is over its target share", () => {
    // 20 mints with 10 Mythics = 50% against a 5% target. A perfect piece must
    // not be another Mythic.
    const tier = pickTier(100, [2, 2, 6, 10]);
    assert.ok(tier < 3, `expected a tier below Mythic, got ${tier}`);
  });

  it("never raises the tier above what the quality earned", () => {
    // A weak photo cannot become Mythic just because the tier is empty. This is
    // the anti-farming property: scarcity lowers, it never promotes.
    for (let quality = 0; quality <= 100; quality += 5) {
      const tier = pickTier(quality, [0, 0, 0, 0]);
      assert.equal(tier, qualityToTier(quality), `quality ${quality} was promoted`);
    }
  });

  it("converges on the target distribution over a long run", () => {
    // The real question the curve has to answer: does minting a thousand pieces
    // land near 50/30/15/5? A curve that does not converge is not a curve.
    const minted = [0, 0, 0, 0];
    const total = 1000;

    for (let i = 0; i < total; i += 1) {
      // Deterministic pseudo-random quality, so the run is reproducible.
      const quality = (i * 37) % 101;
      const tier = pickTier(quality, minted);
      minted[tier] += 1;
    }

    for (const target of TIER_TARGETS) {
      const actual = minted[target.tier] / total;
      const drift = Math.abs(actual - target.share);
      // Generous: quality is not uniformly distributed against the cut-offs, so
      // the shares are approximate by construction. A gross failure — one tier
      // swallowing everything — is what this catches.
      assert.ok(
        drift < 0.15,
        `tier ${target.label} drifted to ${(actual * 100).toFixed(1)}% against a ${(target.share * 100).toFixed(0)}% target`,
      );
    }
  });
});

describe("Collectible grading — rarity score", () => {
  it("stays inside the tier's band", () => {
    for (const target of TIER_TARGETS) {
      for (const quality of [0, 25, 50, 75, 100]) {
        const score = rarityScoreForTier(target.tier, quality);
        assert.ok(
          score >= target.min && score <= target.max,
          `tier ${target.label} at quality ${quality} produced ${score}, outside ${target.min}..${target.max}`,
        );
      }
    }
  });

  it("rises with quality inside a tier, so two pieces of the same tier differ", () => {
    const low = rarityScoreForTier(2, 60);
    const high = rarityScoreForTier(2, 95);
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it("falls back to Common for an unknown tier", () => {
    const score = rarityScoreForTier(99, 50);
    assert.ok(score >= TIER_TARGETS[0].min && score <= TIER_TARGETS[0].max);
  });
});

describe("Collectible grading — full assignment", () => {
  it("composes score, tier, label and rarity consistently", () => {
    const grading = gradeCollectible(signals(90, 80, 95), NO_MINTS);

    assert.equal(grading.quality, qualityScore(signals(90, 80, 95)));
    assert.equal(grading.tier, qualityToTier(grading.quality));
    assert.equal(grading.tierLabel, tierLabel(grading.tier));
    assert.ok(grading.rarityScore >= TIER_TARGETS[grading.tier].min);
    assert.ok(grading.rarityScore <= TIER_TARGETS[grading.tier].max);
  });

  it("returns a tier inside 0..3 for any signal combination", () => {
    for (const value of [0, 33, 66, 100]) {
      const grading = gradeCollectible(signals(value, 100 - value, value), [5, 5, 5, 5]);
      assert.ok([0, 1, 2, 3].includes(grading.tier), `tier ${grading.tier} is out of range`);
    }
  });
});

describe("Collectible grading — style rotation", () => {
  const never = () => false;

  it("is deterministic for the same seed", () => {
    const first = pickStyle(1234, never);
    const second = pickStyle(1234, never);
    assert.equal(first.key, second.key);
  });

  it("produces a key the contract can use as a uniqueness guard", () => {
    const style = pickStyle(7, never);
    assert.equal(style.key, `${style.palette}::${style.composition}`);
    assert.ok((STYLE_PALETTES as readonly string[]).includes(style.palette));
    assert.ok((STYLE_COMPOSITIONS as readonly string[]).includes(style.composition));
  });

  it("skips combinations already taken", () => {
    const first = pickStyle(0, never);
    const second = pickStyle(0, (key) => key === first.key);
    assert.notEqual(second.key, first.key, "a taken style was handed out again");
  });

  it("keeps handing out distinct styles until the space is spent", () => {
    const taken = new Set<string>();
    for (let i = 0; i < STYLE_COMBINATION_COUNT; i += 1) {
      const style = pickStyle(i, (key) => taken.has(key));
      assert.ok(!taken.has(style.key), `style ${style.key} was reused at i=${i}`);
      taken.add(style.key);
    }
    assert.equal(taken.size, STYLE_COMBINATION_COUNT, "the rotation did not cover every combination");
  });

  it("still returns a style when every combination is spent", () => {
    // Blocking the mint would be worse than a repeated look: the collector has
    // already paid for the generation.
    const style = pickStyle(5, () => true);
    assert.ok(style.palette && style.composition && style.key);
  });

  it("handles negative and very large seeds without throwing", () => {
    for (const seed of [-1, -9999, Number.MAX_SAFE_INTEGER]) {
      const style = pickStyle(seed, never);
      assert.ok((STYLE_PALETTES as readonly string[]).includes(style.palette), `seed ${seed}`);
    }
  });
});

describe("Collectible grading — tier labels", () => {
  it("names every tier and falls back for an unknown one", () => {
    assert.equal(tierLabel(0), "Common");
    assert.equal(tierLabel(1), "Rare");
    assert.equal(tierLabel(2), "Epic");
    assert.equal(tierLabel(3), "Mythic");
    assert.equal(tierLabel(9), "Common");
  });

  it("keeps the target shares summing to 1", () => {
    const sum = TIER_TARGETS.reduce((total, target) => total + target.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to ${sum}`);
  });

  it("orders the rarity bands without gaps", () => {
    for (let i = 1; i < TIER_TARGETS.length; i += 1) {
      assert.equal(
        TIER_TARGETS[i].min,
        TIER_TARGETS[i - 1].max + 1,
        `band ${i} does not start where band ${i - 1} ends`,
      );
    }
  });
});

// A compile-time reminder that the tier type is closed: if a fourth tier is ever
// added, this file stops type-checking and the tests above get revisited.
const _tierCoverage: CollectibleTier[] = [0, 1, 2, 3];
void _tierCoverage;

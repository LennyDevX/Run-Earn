import { createHash } from "node:crypto";
import {
  STYLE_COMPOSITIONS,
  STYLE_PALETTES,
  TIER_TARGETS,
  type CollectibleAnalysis,
  type RaritySignals,
} from "./collectible";

/// ─────────────────────── Collectible pipeline (pure) ───────────────────────
///
/// Everything the AI mint route decides without calling a model: the prompts and
/// the version they belong to, the vision schema, the photo gate, the collection
/// context, and the provenance written into each token. The route owns HTTP and
/// Gemini; this file owns the rules, so they can be tested without either.
///
/// **Bump `PROMPT_VERSION` whenever a prompt or the schema changes.** The
/// fingerprint below catches an edit that forgot to bump it, but the version is
/// what a human reads when comparing two pieces.

export const PROMPT_VERSION = "collectible-2026.11.1";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/// The collectible house style. This is the single source of truth for how an
/// AI-minted Airen NFT looks: 32-bit pixel art, black backdrop, no shadow.
export const BASE_PROMPT = [
  "Recreate this exact sneaker as retro-futuristic pixel art collectible artwork.",
  "Style: 32-bit SNES-era sprite aesthetic, crisp hard-edged pixels with zero anti-aliasing,",
  "clean isometric three-quarter view, one single sneaker centered in frame, no shadow,",
  "thick dark navy outline, tight palette of midnight navy #060d17, electric cyan #48d5ff,",
  "neon mint #4ce5c0, astral violet #c17aff and solar gold #ffc84d, cyan rim light on the",
  "top-left edges, faint horizontal scanline texture across the surface, subtle holographic",
  "sheen, high contrast, solid black background, no text, no watermark, no extra objects.",
  "Keep the sneaker's exact silhouette, colorway and recognizable details.",
].join(" ");

/// Gemini has no dedicated negative field, so the avoid-list rides in the prompt.
export const NEGATIVE_PROMPT = [
  "Avoid: anti-aliasing, blurry, soft gradients, airbrush, photorealistic, 3D render,",
  "octane render, glossy plastic, subsurface scattering, cel-shaded, vector art,",
  "smooth shading, drop shadow, text, letters, numbers, watermark, signature, logo,",
  "frame, border, multiple objects, clutter, busy background, scenery, environment,",
  "character, hands, low contrast, muddy palette, oversaturated, jpeg artifacts.",
].join(" ");

export const REJECT_REASONS = [
  "none",
  "not_a_sneaker",
  "multiple_sneakers",
  "partially_visible",
  "too_dark_or_blurred",
] as const;

/// `unclear` is ours, not the model's: it is what a missing or contradictory
/// answer becomes. The gate is fail-closed.
export type RejectReason = (typeof REJECT_REASONS)[number] | "unclear";

const CONTEXT_INSTRUCTION =
  "Use this only to choose a name and description that do not repeat those palettes or sound like the existing pieces. raritySignals must be judged from the photo alone and must not depend on this list.";

const ANALYSIS_BASE = [
  "You are the Airen collectible grader. Look at this sneaker photo and return JSON only.",
  "Describe what is actually there — do not invent details you cannot see.",
  "First decide whether the photo is usable: it must show exactly one sneaker, fully in frame,",
  "clear enough to render. Set isSneaker and usable accordingly. If it is not a sneaker, set",
  "rejectReason to not_a_sneaker; if several are visible, multiple_sneakers; if cropped,",
  "partially_visible; if too dark or blurred, too_dark_or_blurred. Otherwise rejectReason is none.",
  "raritySignals are 0-100 integers judged against a typical mass-market sneaker:",
  "  detailDensity  — how much fine structure there is (stitching, panels, texture, hardware)",
  "  colorComplexity — how varied the colorway is",
  "  distinctiveness — how far the silhouette sits from a generic trainer",
  "suggestedName is a 2-4 word collectible name in the Airen register (short, technical, no clichés).",
  "description is 2-3 sentences of collector-facing copy: what the piece is, what stands out,",
  "and why it belongs in the collection. No marketing fluff, no exclamation marks.",
].join("\n");

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    isSneaker: { type: "boolean", description: "True only if the photo shows a sneaker." },
    usable: { type: "boolean", description: "True only if one sneaker is fully visible and clear enough to render." },
    rejectReason: { type: "string", enum: REJECT_REASONS, description: "none when usable, otherwise the reason." },
    suggestedName: { type: "string", description: "2-4 word collectible name." },
    description: { type: "string", description: "2-3 sentences of collector-facing copy." },
    silhouette: { type: "string", description: "high-top, low-top, mid-top, runner, chunky…" },
    material: { type: "string", description: "leather, mesh, suede, knit, synthetic…" },
    colorway: {
      type: "array",
      items: { type: "string" },
      description: "Up to 3 dominant colors as hex strings.",
    },
    primaryColor: { type: "string", description: "Name of the dominant color." },
    notableDetails: { type: "string", description: "One sentence on the standout detail." },
    raritySignals: {
      type: "object",
      properties: {
        detailDensity: { type: "integer" },
        colorComplexity: { type: "integer" },
        distinctiveness: { type: "integer" },
      },
      required: ["detailDensity", "colorComplexity", "distinctiveness"],
    },
  },
  required: [
    "isSneaker",
    "usable",
    "rejectReason",
    "suggestedName",
    "description",
    "silhouette",
    "material",
    "colorway",
    "primaryColor",
    "notableDetails",
    "raritySignals",
  ],
};

// ─────────────────────────── Collection context ────────────────────────────

export const MAX_COLLECTION = 50;
const PALETTE_ID = /^[a-z0-9-]{1,32}$/;

export type CollectionContext = { count: number; palettes: Record<string, number> };

/// The palettes the collector already owns, validated and counted. Anything that is
/// not a short palette id is dropped, so the field cannot carry instructions into
/// the prompt.
export function sanitizeCollection(input: unknown): CollectionContext {
  const list = Array.isArray(input) ? input.slice(0, MAX_COLLECTION) : [];
  const palettes: Record<string, number> = {};
  let count = 0;
  for (const item of list) {
    if (typeof item !== "string" || !PALETTE_ID.test(item)) continue;
    palettes[item] = (palettes[item] ?? 0) + 1;
    count += 1;
  }
  return { count, palettes };
}

export function analysisPrompt(collection: CollectionContext): string {
  if (collection.count === 0) return ANALYSIS_BASE;
  const top = Object.entries(collection.palettes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `${id} (${n})`)
    .join(", ");
  return [
    ANALYSIS_BASE,
    `The collector already holds ${collection.count} piece(s), mostly in these palettes: ${top}.`,
    CONTEXT_INSTRUCTION,
  ].join("\n");
}

// ─────────────────────────── Photo gate ────────────────────────────────────

export type PhotoCheck = { isSneaker: boolean; usable: boolean; rejectReason: RejectReason };

export type PhotoVerdict =
  | { ok: true }
  | { ok: false; reason: RejectReason; message: string };

const REJECT_MESSAGES: Record<RejectReason, string> = {
  none: "",
  not_a_sneaker: "We could not find a sneaker in this photo. Try a photo of a single sneaker.",
  multiple_sneakers: "Several sneakers are visible. Send a photo with one sneaker.",
  partially_visible: "The sneaker is cropped. Send a photo with the whole shoe in frame.",
  too_dark_or_blurred: "The photo is too dark or blurry to read. Try better lighting.",
  unclear: "We could not read this photo clearly enough to render it. Try a sharper photo of one sneaker.",
};

export function normalizePhotoCheck(raw: Record<string, unknown>): PhotoCheck {
  const reason = (REJECT_REASONS as readonly string[]).includes(raw.rejectReason as string)
    ? (raw.rejectReason as RejectReason)
    : "unclear";
  return { isSneaker: raw.isSneaker === true, usable: raw.usable === true, rejectReason: reason };
}

/// Passes only when the model affirmatively says the photo is a usable sneaker with
/// no reason to reject it. A missing field, or a `usable` that contradicts the
/// reason, rejects. A rejection is a 422 before the paid render, and the x402
/// wrapper does not settle payment for a response of 400 or more.
export function photoVerdict(check: PhotoCheck): PhotoVerdict {
  if (check.isSneaker && check.usable && check.rejectReason === "none") return { ok: true };
  const reason: RejectReason = check.rejectReason === "none" ? "unclear" : check.rejectReason;
  return { ok: false, reason, message: REJECT_MESSAGES[reason] };
}

// ─────────────────────────── Analysis ──────────────────────────────────────

function clampSignal(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function normalizeAnalysis(raw: unknown): CollectibleAnalysis {
  const source = (raw ?? {}) as Record<string, unknown>;
  const signals = (source.raritySignals ?? {}) as Record<string, unknown>;
  const signalsOut: RaritySignals = {
    detailDensity: clampSignal(signals.detailDensity),
    colorComplexity: clampSignal(signals.colorComplexity),
    distinctiveness: clampSignal(signals.distinctiveness),
  };
  const colorway = Array.isArray(source.colorway)
    ? source.colorway.filter((item): item is string => typeof item === "string").slice(0, 3)
    : [];
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  return {
    suggestedName: text(source.suggestedName, "Airen Collectible"),
    description: text(source.description, "An AI-reconstructed Airen collectible."),
    silhouette: text(source.silhouette, "low-top"),
    material: text(source.material, "mixed"),
    colorway,
    primaryColor: text(source.primaryColor, "midnight navy"),
    notableDetails: text(source.notableDetails, "Clean pixel silhouette."),
    raritySignals: signalsOut,
  };
}

// ─────────────────────────── Style & distribution ──────────────────────────

/// The style handed to this render, derived from a seed so two collectors never
/// receive the same look. The on-chain `usedStyles` mapping is the real guard;
/// this is what keeps the rotation varied before it gets there.
export function styleForSeed(seed: number) {
  const total = STYLE_PALETTES.length * STYLE_COMPOSITIONS.length;
  const index = ((seed % total) + total) % total;
  return {
    palette: STYLE_PALETTES[index % STYLE_PALETTES.length],
    composition: STYLE_COMPOSITIONS[Math.floor(index / STYLE_PALETTES.length) % STYLE_COMPOSITIONS.length],
  };
}

/// Fallback distribution when the chain cannot be read: the shape the target
/// curve would have produced at this mint count.
export function expectedDistribution(total: number): number[] {
  return TIER_TARGETS.map((target) => Math.round(total * target.share));
}

// ─────────────────────────── Provenance ────────────────────────────────────

/// Written into each token's metadata. Everything needed to tell which prompt,
/// which models and which style produced the artwork — without the photo.
export type Provenance = {
  promptVersion: string;
  promptFingerprint: string;
  analysisModel: string;
  imageModel: string;
  palette: string;
  composition: string;
  generatedAt: string;
};

export function buildProvenance(
  models: { analysisModel: string; imageModel: string },
  style: { palette: string; composition: string },
  now: Date = new Date(),
): Provenance {
  return {
    promptVersion: PROMPT_VERSION,
    promptFingerprint: promptFingerprint(),
    analysisModel: models.analysisModel,
    imageModel: models.imageModel,
    palette: style.palette,
    composition: style.composition,
    generatedAt: now.toISOString(),
  };
}

/// A hash over the exact text the models receive. If a prompt changes without the
/// version being bumped, the fingerprint still moves, so two pieces can always be
/// told apart by what produced them.
export function promptFingerprint(): string {
  const payload = JSON.stringify([
    PROMPT_VERSION,
    BASE_PROMPT,
    NEGATIVE_PROMPT,
    ANALYSIS_BASE,
    CONTEXT_INSTRUCTION,
    ANALYSIS_SCHEMA,
  ]);
  return `0x${createHash("sha256").update(payload).digest("hex")}`;
}

// ─────────────────────────── Catalogue ─────────────────────────────────────

/// What an agent needs to mint without reading this source: the endpoint, its
/// inputs and outputs, what each tier means, and every way a photo can be turned
/// away. Payment terms are deliberately not repeated here — `/.well-known/x402`
/// is the single source for price and `payTo`, the same config the endpoint charges.
export function buildMintCatalogue() {
  return {
    name: "Airen collectible mint",
    promptVersion: PROMPT_VERSION,
    promptFingerprint: promptFingerprint(),
    endpoint: {
      method: "POST",
      path: "/api/generate-sneaker",
      contentType: "multipart/form-data",
    },
    input: {
      photo: { required: true, types: ["image/jpeg", "image/png", "image/webp"], maxBytes: MAX_FILE_BYTES },
      minted: { required: false, type: "integer", effect: "collectibles minted so far; shapes the tier curve" },
      seed: { required: false, type: "string", effect: "a retry with the same seed lands on the same style" },
      collection: {
        required: false,
        type: "JSON array of palette ids",
        effect: "palettes the collector already owns; shapes naming and copy only, never rarity",
      },
    },
    tiers: TIER_TARGETS.map((target) => ({
      tier: target.tier,
      label: target.label,
      share: target.share,
      rarityBand: { min: target.min, max: target.max },
    })),
    rejections: (Object.keys(REJECT_MESSAGES) as RejectReason[])
      .filter((reason) => reason !== "none")
      .map((reason) => ({ reason, message: REJECT_MESSAGES[reason] })),
    output: [
      "imageBase64",
      "mimeType",
      "suggestedName",
      "description",
      "tier",
      "tierLabel",
      "rarityScore",
      "quality",
      "provenance",
    ],
    payment: "/.well-known/x402",
  };
}

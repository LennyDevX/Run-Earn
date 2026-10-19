import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { clientKey, consumeDailyBudget, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { X402_ROUTE_PATH, x402RouteConfig, x402Server } from "@/lib/x402";
import { GoogleGenAI } from "@google/genai";
import {
  STYLE_COMPOSITIONS,
  STYLE_PALETTES,
  TIER_TARGETS,
  gradeCollectible,
  qualityToTier,
  type CollectibleAnalysis,
  type RaritySignals,
} from "@/lib/collectible";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/// Each call runs two paid Gemini passes, so the throttle is tight. Ten minutes
/// is long enough for a genuine collector to retry a bad photo a few times.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
/// Global daily ceiling. Per-IP limits cannot stop a botnet spreading requests
/// across addresses; this can, because it does not care who is asking.
const DAILY_GENERATION_BUDGET = Number(process.env.GENERATION_DAILY_BUDGET ?? 300);

/// Vision pass — reads the source sneaker and grades it.
const ANALYSIS_MODEL = process.env.GEMINI_ANALYSIS_MODEL ?? "gemini-3-flash-preview";
/// Image pass — renders the collectible.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

// ─────────────────────────── Prompts ───────────────────────────────────────

/// The collectible house style. This is the single source of truth for how an
/// AI-minted Airen NFT looks: 32-bit pixel art, black backdrop, no shadow.
/// It deliberately matches the workshop item line so both halves of the product
/// read as one universe — the only difference is the background, because an item
/// is an equippable icon while a collectible is the artwork itself.
const BASE_PROMPT = [
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
const NEGATIVE_PROMPT = [
  "Avoid: anti-aliasing, blurry, soft gradients, airbrush, photorealistic, 3D render,",
  "octane render, glossy plastic, subsurface scattering, cel-shaded, vector art,",
  "smooth shading, drop shadow, text, letters, numbers, watermark, signature, logo,",
  "frame, border, multiple objects, clutter, busy background, scenery, environment,",
  "character, hands, low contrast, muddy palette, oversaturated, jpeg artifacts.",
].join(" ");

/// Vision pass prompt. Returns strict JSON so the fields map straight onto the
/// metadata and the on-chain traits.
const ANALYSIS_PROMPT = [
  "You are the Airen collectible grader. Look at this sneaker photo and return JSON only.",
  "Describe what is actually there — do not invent details you cannot see.",
  "raritySignals are 0-100 integers judged against a typical mass-market sneaker:",
  "  detailDensity  — how much fine structure there is (stitching, panels, texture, hardware)",
  "  colorComplexity — how varied the colorway is",
  "  distinctiveness — how far the silhouette sits from a generic trainer",
  "suggestedName is a 2-4 word collectible name in the Airen register (short, technical, no clichés).",
  "description is 2-3 sentences of collector-facing copy: what the piece is, what stands out,",
  "and why it belongs in the collection. No marketing fluff, no exclamation marks.",
].join("\n");

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
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

// ─────────────────────────── Helpers ───────────────────────────────────────

function clampSignal(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeAnalysis(raw: unknown): CollectibleAnalysis {
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

/// The style handed to this render, derived from a seed so two collectors never
/// receive the same look. The on-chain `usedStyles` mapping is the real guard;
/// this is what keeps the rotation varied before it gets there.
function styleForSeed(seed: number) {
  const total = STYLE_PALETTES.length * STYLE_COMPOSITIONS.length;
  const index = ((seed % total) + total) % total;
  return {
    palette: STYLE_PALETTES[index % STYLE_PALETTES.length],
    composition: STYLE_COMPOSITIONS[Math.floor(index / STYLE_PALETTES.length) % STYLE_COMPOSITIONS.length],
  };
}

/// Fallback distribution when the chain cannot be read: the shape the target
/// curve would have produced at this mint count.
function expectedDistribution(total: number): number[] {
  return TIER_TARGETS.map((target) => Math.round(total * target.share));
}

// ─────────────────────────── Route ─────────────────────────────────────────

export async function generateCollectible(request: NextRequest): Promise<NextResponse> {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  const limited = await rateLimit(clientKey(request, "generate"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) {
    return tooManyRequests(limited, "Too many generations. Wait a few minutes and try again.");
  }

  const budget = await consumeDailyBudget("generate-sneaker", DAILY_GENERATION_BUDGET);
  if (!budget.ok) {
    return NextResponse.json(
      { error: "The daily generation budget is spent. Try again tomorrow." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Send a valid image (JPG, PNG, or WEBP)." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "The image exceeds the 8 MB limit." },
      { status: 413 },
    );
  }

  // Style seed: varies per request so the rotation advances, and stays stable
  // enough that a retry of the same submission lands on the same look.
  const seedInput = typeof form.get("seed") === "string" ? String(form.get("seed")) : "";
  const seed = seedInput
    ? [...seedInput].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)
    : Math.floor(Date.now() / 1000);
  const style = styleForSeed(seed);

  const photoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const imagePart = { type: "image" as const, mime_type: file.type, data: photoBase64 };

  try {
    const ai = new GoogleGenAI({});

    // ── 1. Grade the source sneaker ──────────────────────────────────
    const analysis = await ai.interactions.create({
      model: ANALYSIS_MODEL,
      input: [{ type: "text", text: ANALYSIS_PROMPT }, imagePart],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: ANALYSIS_SCHEMA,
      },
    });

    let parsed: CollectibleAnalysis;
    try {
      parsed = normalizeAnalysis(JSON.parse(analysis.output_text ?? "{}"));
    } catch {
      return NextResponse.json(
        { error: "The grader returned malformed data. Please try again." },
        { status: 502 },
      );
    }

    // ── 2. Assign the tier against the target curve ──────────────────
    // Per-tier counts would come from an indexer; until one is wired the curve
    // runs on its own expected shape, which still enforces scarcity in aggregate.
    const totalMintedInput = form.get("minted");
    const totalMinted = typeof totalMintedInput === "string" ? Number(totalMintedInput) : 0;
    const distribution = expectedDistribution(Number.isFinite(totalMinted) ? totalMinted : 0);
    const grading = gradeCollectible(parsed.raritySignals, distribution);

    // ── 3. Render the collectible ────────────────────────────────────
    const styleLine = [
      `Render style: ${style.palette} palette, ${style.composition} composition.`,
      `This combination is unique to this piece — ${TIER_TARGETS[grading.tier].label} tier,`,
      `quality ${grading.quality}/100.`,
    ].join(" ");

    const interaction = await ai.interactions.create({
      model: IMAGE_MODEL,
      input: [
        { type: "text", text: `${BASE_PROMPT} ${NEGATIVE_PROMPT} ${styleLine}` },
        imagePart,
      ],
    });

    const image = interaction.output_image;
    if (!image?.data) {
      return NextResponse.json(
        { error: "AI did not return an image. Please try again." },
        { status: 502 },
      );
    }

    // Never cache a generation: each response is a paid, one-off render.
    return NextResponse.json({
      imageBase64: image.data,
      mimeType: image.mime_type ?? "image/png",
      // Autofilled metadata — the collector can override the name if they want.
      suggestedName: parsed.suggestedName,
      description: parsed.description,
      silhouette: parsed.silhouette,
      material: parsed.material,
      colorway: parsed.colorway,
      primaryColor: parsed.primaryColor,
      notableDetails: parsed.notableDetails,
      // Assigned, not chosen.
      tier: grading.tier,
      tierLabel: grading.tierLabel,
      rarityScore: grading.rarityScore,
      quality: grading.quality,
      qualityCeiling: qualityToTier(grading.quality),
      // The style handed to this render; the studio folds it into the styleKey.
      stylePalette: style.palette,
      styleComposition: style.composition,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ─────────────────────────── Payment wrapper ───────────────────────────────
//
// With `X402_PAY_TO` unset this is the same free, rate-limited handler as
// before — the switch is deliberately off by default. With it set, the caller
// pays USDC per generation and the throttle drops to a backstop rather than the
// only barrier. See `src/lib/x402.ts`.

const resourceServer = x402Server();

export const POST = resourceServer
  ? withX402(generateCollectible, { [X402_ROUTE_PATH]: x402RouteConfig() }, resourceServer)
  : generateCollectible;


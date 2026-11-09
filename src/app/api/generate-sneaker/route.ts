import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { clientKey, consumeDailyBudget, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { X402_ROUTE_PATH, x402RouteConfig, x402Server } from "@/lib/x402";
import { GoogleGenAI } from "@google/genai";
import { TIER_TARGETS, gradeCollectible, qualityToTier } from "@/lib/collectible";
import {
  ANALYSIS_SCHEMA,
  BASE_PROMPT,
  MAX_FILE_BYTES,
  NEGATIVE_PROMPT,
  analysisPrompt,
  buildProvenance,
  expectedDistribution,
  normalizeAnalysis,
  normalizePhotoCheck,
  photoVerdict,
  sanitizeCollection,
  styleForSeed,
} from "@/lib/collectible-pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

/// Each call runs two paid Gemini passes, so the throttle is tight. Ten minutes
/// is long enough for a genuine collector to retry a bad photo a few times.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
/// Global daily ceiling. Per-IP limits cannot stop a botnet spreading requests
/// across addresses; this can, because it does not care who is asking.
const DAILY_GENERATION_BUDGET = Number(process.env.GENERATION_DAILY_BUDGET ?? 300);

/// Vision pass — reads the source sneaker, checks it is usable and grades it.
const ANALYSIS_MODEL = process.env.GEMINI_ANALYSIS_MODEL ?? "gemini-3-flash-preview";
/// Image pass — renders the collectible.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

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

  // Palettes the collector already owns. Parsed defensively: a malformed field
  // is an empty collection, never a failed generation.
  let collectionInput: unknown = [];
  try {
    collectionInput = JSON.parse(String(form.get("collection") ?? "[]"));
  } catch {
    collectionInput = [];
  }
  const collection = sanitizeCollection(collectionInput);

  const photoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const imagePart = { type: "image" as const, mime_type: file.type, data: photoBase64 };

  try {
    const ai = new GoogleGenAI({});

    // ── 1. Check the photo and grade the source sneaker ──────────────
    const analysis = await ai.interactions.create({
      model: ANALYSIS_MODEL,
      input: [{ type: "text", text: analysisPrompt(collection) }, imagePart],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: ANALYSIS_SCHEMA,
      },
    });

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(analysis.output_text ?? "{}") ?? {};
    } catch {
      return NextResponse.json(
        { error: "The grader returned malformed data. Please try again." },
        { status: 502 },
      );
    }

    // Before the paid render. A rejection is a 422, which the x402 wrapper treats
    // as a failed response and does not settle — the collector is not charged.
    const verdict = photoVerdict(normalizePhotoCheck(raw));
    if (!verdict.ok) {
      return NextResponse.json(
        { error: verdict.message, reason: verdict.reason },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }
    const parsed = normalizeAnalysis(raw);

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
      // Stored on-chain inside the token URI: which prompt and models made it.
      provenance: buildProvenance(
        { analysisModel: ANALYSIS_MODEL, imageModel: IMAGE_MODEL },
        { palette: style.palette, composition: style.composition },
      ),
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

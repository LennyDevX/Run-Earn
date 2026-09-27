import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MODEL = "gemini-3.1-flash-image";

const BASE_PROMPT = [
  "Transform this sneaker photo into a premium collectible NFT artwork for the Airen sneaker universe.",
  "Style: retro-futuristic sneakerhead poster art, bold cel-shaded illustration, neon rim lighting,",
  "clean vector-like shapes, dark moody studio background with soft purple and mint glow.",
  "Keep the sneaker's exact silhouette, colorway and recognizable details. Centered composition,",
  "high contrast, museum-grade product art, no text, no watermark, no extra objects.",
].join(" ");

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 503 },
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

  const styleHint = typeof form.get("style") === "string" ? String(form.get("style")) : "";

  try {
    const ai = new GoogleGenAI({});
    const photoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: [
        { type: "text", text: `${BASE_PROMPT} ${styleHint}`.trim() },
        { type: "image", mime_type: file.type, data: photoBase64 },
      ],
    });

    const image = interaction.output_image;
    if (!image?.data) {
      return NextResponse.json(
        { error: "AI did not return an image. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      imageBase64: image.data,
      mimeType: image.mime_type ?? "image/png",
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown error";
    return NextResponse.json(
      { error: `Image generation failed: ${message}` },
      { status: 502 },
    );
  }
}

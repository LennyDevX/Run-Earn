import { NextResponse } from "next/server";
import { buildMintCatalogue } from "@/lib/collectible-pipeline";

export const runtime = "nodejs";

/// Public, read-only description of the AI mint: endpoint, inputs, outputs, what
/// each tier means and every way a photo can be turned away. It is built from the
/// same module the mint route runs, so it cannot describe rules the handler does
/// not follow.
///
/// No rate limit: the body is computed from constants and costs nothing to serve.
/// The cache is public and short, because it only changes on deploy.
export function GET() {
  return NextResponse.json(buildMintCatalogue(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

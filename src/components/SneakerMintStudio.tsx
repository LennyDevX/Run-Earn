"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, isAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { explorerTransactionUrl, NETWORK, usePolygonWallet } from "@/components/Providers";
import {
  buildTokenUri,
  DEFAULT_SNEAKER_DESCRIPTION,
  getMintedSneakers,
  saveMintedSneaker,
  type PaletteId,
  type RarityLevel,
} from "@/lib/sneaker-nft";
import { sneakerMintAbi } from "@/lib/contracts";
import { centerInScrollRow } from "@/lib/scroll-x";
import { notifyMintedSneakersUpdated } from "@/hooks/useMintedSneakers";

const SNEAKER_MINT_ADDRESS = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

const STEPS = ["Photo", "AI Art", "Details", "Mint"] as const;

/// Perceptual hash grid. 16x16 = 256 comparisons = exactly 32 bytes, so the
/// average-hash drops straight into a `bytes32` with no padding.
const HASH_GRID = 16;

type GeneratedImage = { dataUrl: string; mimeType: string };

/// What the grader assigned to this piece. Everything here is written by the AI
/// — the collector only gets to rename the result.
type MintGrade = {
  tier: number;
  tierLabel: string;
  rarityScore: number;
  quality: number;
  silhouette: string;
  material: string;
  colorway: string[];
  notableDetails: string;
  stylePalette: string;
  styleComposition: string;
};

type GenerateSneakerResponse = {
  imageBase64?: string;
  mimeType?: string;
  error?: string;
  suggestedName?: string;
  description?: string;
  silhouette?: string;
  material?: string;
  colorway?: string[];
  notableDetails?: string;
  tier?: number;
  tierLabel?: string;
  rarityScore?: number;
  quality?: number;
  stylePalette?: string;
  styleComposition?: string;
};

/// Tier index -> the local `RarityLevel` id used by the offline collection store.
const RARITY_IDS: RarityLevel[] = ["comun", "raro", "epico", "mitico"];

/// Average-hash of an image, as a `bytes32`.
///
/// Draws the artwork into a 16x16 canvas, converts it to grayscale, and emits
/// one bit per pixel comparing it against the mean. Two renders of the *same*
/// physical sneaker land on the same hash far more often than not, which is what
/// makes the on-chain `usedDesigns` guard meaningful — an exact-hash check alone
/// would let someone mint the same shoe twice from two different photos.
///
/// This is the client-side stand-in for the semantic fingerprint the server
/// pipeline will compute (model + silhouette + dominant colorway) in a later
/// phase. It is strictly weaker than that, but it is real, deterministic, and
/// enforced on-chain.
async function perceptualHash(dataUrl: string): Promise<Hex> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not read the generated artwork."));
    element.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = HASH_GRID;
  canvas.height = HASH_GRID;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable in this browser.");

  context.drawImage(image, 0, 0, HASH_GRID, HASH_GRID);
  const { data } = context.getImageData(0, 0, HASH_GRID, HASH_GRID);

  const gray: number[] = [];
  for (let i = 0; i < HASH_GRID * HASH_GRID; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const mean = gray.reduce((sum, value) => sum + value, 0) / gray.length;
  let hex = "";
  for (let byte = 0; byte < 32; byte += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      if (gray[byte * 8 + bit] > mean) value |= 1 << (7 - bit);
    }
    hex += value.toString(16).padStart(2, "0");
  }
  return `0x${hex}` as Hex;
}

/// SHA-256 of the artwork data URL — the exact re-mint guard.
async function artworkProof(dataUrl: string): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export default function SneakerMintStudio() {
  const wallet = usePolygonWallet();
  const [step, setStep] = useState(0);
  const stepsRowRef = useRef<HTMLDivElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const palette: PaletteId = "neon";
  /// Assigned by the grader, never chosen by the collector — a picker would
  /// make the tier meaningless. Null until the AI has graded the piece.
  const [grade, setGrade] = useState<MintGrade | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedHash, setMintedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the active step centered inside the horizontal step row on mobile,
  // including when the wizard advances programmatically. Skipped on mount: the
  // row starts at scroll 0, so the first run would only move it for no reason.
  const stepRowSettled = useRef(false);
  useEffect(() => {
    if (!stepRowSettled.current) {
      stepRowSettled.current = true;
      return;
    }
    const chip = stepsRowRef.current?.children[step];
    if (chip instanceof HTMLElement) centerInScrollRow(chip);
  }, [step]);

  function selectPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Select a valid image.");
      return;
    }
    setError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setGenerated(null);
    setMintedHash(null);
    setStep(1);
  }

  async function generateArtwork() {
    if (!photoFile) return;
    setError(null);
    setIsGenerating(true);
    try {
      const form = new FormData();
      form.set("photo", photoFile);
      // Seed keeps the style rotation advancing while staying stable across a
      // retry of the same submission.
      form.set("seed", `${wallet.address ?? "guest"}:${photoFile.size}:${photoFile.name}`);
      const response = await fetch("/api/generate-sneaker", { method: "POST", body: form });
      const data = (await response.json()) as GenerateSneakerResponse;
      if (!response.ok || !data.imageBase64) {
        throw new Error(data.error ?? "AI did not return an image.");
      }
      setGenerated({
        dataUrl: `data:${data.mimeType ?? "image/png"};base64,${data.imageBase64}`,
        mimeType: data.mimeType ?? "image/png",
      });
      // Autofill: the grader writes the name, description, and tier. The
      // collector can still rename the piece.
      setGrade({
        tier: data.tier ?? 0,
        tierLabel: data.tierLabel ?? "Common",
        rarityScore: data.rarityScore ?? 20,
        quality: data.quality ?? 0,
        silhouette: data.silhouette ?? "low-top",
        material: data.material ?? "mixed",
        colorway: data.colorway ?? [],
        notableDetails: data.notableDetails ?? "",
        stylePalette: data.stylePalette ?? "cyan-dominant",
        styleComposition: data.styleComposition ?? "three-quarter hero",
      });
      setName(data.suggestedName ?? "");
      setDescription(data.description ?? "");
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the artwork.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function mintSneaker() {
    if (!generated) {
      setError("Generate your sneaker artwork first.");
      return;
    }
    setError(null);
    setIsMinting(true);
    try {
      if (!grade) throw new Error("Generate your sneaker artwork first.");
      const metadata = {
        name: name.trim() || "Airen Collectible",
        description: description.trim() || DEFAULT_SNEAKER_DESCRIPTION,
        rarity: RARITY_IDS[grade.tier] ?? "comun",
        palette,
        imageDataUrl: generated.dataUrl,
      };
      const proofHash = await artworkProof(generated.dataUrl);
      // Perceptual fingerprint: catches the same physical sneaker re-rendered
      // from a different photo.
      const designHash = await perceptualHash(generated.dataUrl);
      // Style combination handed to this render. Deriving it from the wallet,
      // the chosen look, and a timestamp keeps two collectors from receiving
      // the same one.
      // Style key binds the exact look the renderer was handed, so the contract
      // can reject a repeat.
      const styleKey = keccak256(
        toHex(
          `airen:style:${grade.stylePalette}:${grade.styleComposition}:${wallet.address ?? "guest"}:${Date.now()}`,
        ),
      );
      const tierIndex = grade.tier;
      const rarityScore = grade.rarityScore;
      let transactionHash: `0x${string}` | undefined;

      if (SNEAKER_MINT_ADDRESS && isAddress(SNEAKER_MINT_ADDRESS)) {
        if (!wallet.isConnected || !wallet.address) {
          throw new Error("Connect your wallet to mint on Polygon.");
        }

        // Fail with a readable message instead of an opaque revert.
        const [designTaken, styleTaken] = await Promise.all([
          wallet.publicClient.readContract({
            address: SNEAKER_MINT_ADDRESS as Address,
            abi: sneakerMintAbi,
            functionName: "usedDesigns",
            args: [designHash],
          }),
          wallet.publicClient.readContract({
            address: SNEAKER_MINT_ADDRESS as Address,
            abi: sneakerMintAbi,
            functionName: "usedStyles",
            args: [styleKey],
          }),
        ]);
        if (designTaken) {
          throw new Error(
            "This sneaker has already been minted. Each physical pair can only become one collectible.",
          );
        }
        if (styleTaken) {
          throw new Error("That style combination is taken. Pick a different palette and try again.");
        }

        const data = encodeFunctionData({
          abi: sneakerMintAbi,
          functionName: "mintCollectibleWithProof",
          args: [buildTokenUri(metadata), proofHash, designHash, styleKey, rarityScore, tierIndex],
        });
        transactionHash = await wallet.sendContractCall(SNEAKER_MINT_ADDRESS as Address, data);
        await wallet.publicClient.waitForTransactionReceipt({ hash: transactionHash });
      }

      const owner = wallet.address ?? "guest";
      saveMintedSneaker(owner, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...metadata,
        owner,
        mintedAt: Date.now(),
        transactionHash: transactionHash as string | undefined,
      });
      notifyMintedSneakersUpdated();
      setMintedHash(transactionHash ?? "local");
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mint the NFT.");
    } finally {
      setIsMinting(false);
    }
  }

  const totalOwned = wallet.address ? getMintedSneakers(wallet.address).length : 0;

  return (
    <section className="rounded-2xl border border-foreground/8 bg-surface p-5 sm:p-8 md:p-10">
      <div ref={stepsRowRef} className="scroll-x -mx-5 mb-8 flex gap-2 px-5 pb-1 sm:-mx-8 sm:px-8 md:mx-0 md:px-0">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => index <= step && setStep(index)}
            aria-current={index === step ? "step" : undefined}
            className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 font-pixel text-[9px] transition-colors active:scale-95 ${
              index === step
                ? "bg-foreground text-background"
                : index < step
                  ? "bg-mint/15 text-mint"
                  : "border border-foreground/10 text-foreground/40"
            }`}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-foreground/20 bg-background p-6 text-center transition-colors hover:border-sky hover:bg-sky/5">
            <span className="font-pixel text-[10px] text-foreground/50">YOUR SNEAKER PHOTO</span>
            <span className="text-sm font-semibold">Take or select a photo</span>
            <span className="text-xs text-foreground/45">JPG, PNG, or WEBP · processed on your device</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => selectPhoto(event.target.files?.[0])} />
          </label>
          <div className="flex flex-col gap-4 rounded-3xl bg-background p-6">
            <span className="font-pixel text-[9px] text-sky">HOW IT WORKS</span>
            {["Photograph your sneaker", "AI creates a unique virtual collectible", "Customize the name, rarity, and palette", "Mint on Polygon and find it in your collection"].map((item, index) => (
              <div key={item} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 font-pixel text-[9px] text-sky">{index + 1}</span>
                <p className="text-sm leading-relaxed text-foreground/60">{item}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-3xl bg-background p-4">
            <span className="mb-3 block font-pixel text-[9px] text-foreground/40">YOUR SNEAKER</span>
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Original sneaker photo" loading="lazy" decoding="async" className="w-full rounded-2xl" />
            ) : null}
          </div>
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl bg-background p-6">
              <span className="font-pixel text-[9px] text-mint">AI AGENT</span>
              <p className="mt-3 text-sm leading-relaxed text-foreground/60">
                The agent will transform your photo into unique retro-futuristic artwork while
                preserving your sneaker&apos;s real silhouette and colors.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void generateArtwork()}
              disabled={isGenerating}
              className="rounded-full bg-sky px-6 py-3.5 text-sm font-semibold text-white transition-[transform,box-shadow] hover:scale-[1.02] hover:shadow-lg hover:shadow-sky/20 disabled:cursor-wait disabled:opacity-60 dark:text-ink"
            >
              {isGenerating ? "Generating artwork..." : "Generate NFT artwork with AI"}
            </button>
            <button type="button" onClick={() => setStep(0)} className="self-start text-xs font-semibold text-foreground/50 hover:text-foreground">
              ← Change photo
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 && generated ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-3xl bg-background p-4">
            <span className="mb-3 block font-pixel text-[9px] text-mint">GENERATED ARTWORK</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={generated.dataUrl} alt="AI-generated NFT artwork" loading="lazy" decoding="async" className="w-full rounded-2xl" />
            <button type="button" onClick={() => void generateArtwork()} disabled={isGenerating} className="mt-4 w-full cursor-pointer rounded-full border border-foreground/15 px-5 py-3 text-xs font-semibold transition-colors hover:border-foreground/30 disabled:opacity-60">
              {isGenerating ? "Regenerating..." : "Regenerate variant"}
            </button>
          </div>
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sneaker Airen" className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} enterKeyHint="done" autoComplete="off" placeholder={DEFAULT_SNEAKER_DESCRIPTION} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky" />
            </label>
            <button type="button" onClick={() => setDescription(grade?.notableDetails || DEFAULT_SNEAKER_DESCRIPTION)} className="cursor-pointer self-start rounded-full bg-mint/15 px-4 py-2 text-xs font-semibold text-mint transition-colors hover:bg-mint/25">
              Use default description
            </button>

            {/* Graded by the AI, never chosen. A rarity picker would make the
                tier meaningless and let every collector mint Mythic. */}
            {grade ? (
              <div className="rounded-3xl border border-astra/25 bg-astra/8 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-pixel text-[9px] tracking-[0.2em] text-astra">AI GRADING</span>
                  <span className="rounded-full border border-astra/35 bg-ink/40 px-3 py-1 font-mono text-[11px] font-bold text-astra">
                    {grade.tierLabel} · {grade.rarityScore}/100
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Silhouette", grade.silhouette],
                    ["Material", grade.material],
                    ["Quality score", `${grade.quality}/100`],
                    ["Style", `${grade.stylePalette} · ${grade.styleComposition}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-background/60 px-4 py-3">
                      <dt className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">{label}</dt>
                      <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {grade.colorway.length > 0 ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-foreground/45 uppercase">
                      Colorway
                    </span>
                    {grade.colorway.map((color) => (
                      <span
                        key={color}
                        className="size-5 rounded-full border border-foreground/15"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                ) : null}
                <p className="mt-4 text-[11px] leading-relaxed text-foreground/55">
                  The tier is assigned from the piece&apos;s own detail, color complexity, and
                  distinctiveness, then capped by the collection&apos;s scarcity curve — 50% Common,
                  30% Rare, 15% Epic, 5% Mythic. It cannot be chosen, and it cannot be re-rolled.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep(1)} className="rounded-full border border-foreground/15 px-5 py-3 text-xs font-semibold transition-colors hover:border-foreground/30">← Back</button>
              <button
                type="button"
                onClick={() => void mintSneaker()}
                disabled={isMinting}
                className="flex-1 rounded-full bg-magma px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-magma/25 transition-transform hover:scale-[1.02] disabled:cursor-wait disabled:opacity-60"
              >
                {isMinting ? "Minting..." : `Mint on ${NETWORK === "polygon" ? "Polygon" : "Amoy"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col items-center gap-6 rounded-[2rem] border border-mint/20 bg-mint/5 px-8 py-14 text-center">
          <span className="font-pixel text-[10px] text-mint">MINT COMPLETE</span>
          <h2 className="max-w-xl text-3xl font-bold tracking-tight text-balance">Your sneaker now lives in your collection</h2>
          <p className="max-w-md text-sm leading-relaxed text-foreground/60">
            You have {totalOwned + 1} {totalOwned + 1 === 1 ? "sneaker" : "sneakers"} in your collection.
            {mintedHash && mintedHash !== "local" ? " The transaction is confirmed." : ""}
          </p>
          {mintedHash && mintedHash !== "local" ? (
            <a href={explorerTransactionUrl(mintedHash)} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky underline underline-offset-4">
              View transaction ↗
            </a>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/my-nfts" className="rounded-full bg-mint px-6 py-3 text-sm font-semibold text-ink transition-transform hover:scale-105">
              View my collection
            </Link>
            <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); setGenerated(null); setMintedHash(null); setStep(0); }} className="rounded-full border border-foreground/15 px-6 py-3 text-sm font-semibold transition-colors hover:border-foreground/30">
              Mint another
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-6 rounded-2xl bg-magma/10 px-4 py-3 text-sm leading-relaxed text-magma">{error}</p> : null}
    </section>
  );
}

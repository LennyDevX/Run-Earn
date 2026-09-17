"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { encodeFunctionData, isAddress, type Address, type Hex } from "viem";
import { explorerTransactionUrl, NETWORK, usePolygonWallet } from "@/components/Providers";
import {
  buildTokenUri,
  DEFAULT_SNEAKER_DESCRIPTION,
  getMintedSneakers,
  PALETTES,
  RARITIES,
  saveMintedSneaker,
  type PaletteId,
  type RarityLevel,
} from "@/lib/sneaker-nft";
import { sneakerMintAbi } from "@/lib/contracts";
import { notifyMintedSneakersUpdated } from "@/hooks/useMintedSneakers";

const SNEAKER_MINT_ADDRESS = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;

const STEPS = ["Photo", "AI Art", "Details", "Mint"] as const;

type GeneratedImage = { dataUrl: string; mimeType: string };

export default function SneakerMintStudio() {
  const wallet = usePolygonWallet();
  const [step, setStep] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rarity, setRarity] = useState<RarityLevel>("raro");
  const [palette, setPalette] = useState<PaletteId>("neon");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintedHash, setMintedHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRarity = useMemo(() => RARITIES.find((item) => item.id === rarity), [rarity]);

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
      form.set(
        "style",
        `Rarity theme: ${selectedRarity?.label ?? "Rare"}. Accent palette: ${PALETTES.find((item) => item.id === palette)?.colors.join(", ")}.`,
      );
      const response = await fetch("/api/generate-sneaker", { method: "POST", body: form });
      const data = (await response.json()) as { imageBase64?: string; mimeType?: string; error?: string };
      if (!response.ok || !data.imageBase64) {
        throw new Error(data.error ?? "AI did not return an image.");
      }
      setGenerated({
        dataUrl: `data:${data.mimeType ?? "image/png"};base64,${data.imageBase64}`,
        mimeType: data.mimeType ?? "image/png",
      });
      if (!name) setName(`Sneaker #${String(Date.now()).slice(-4)}`);
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
      const metadata = {
        name: name.trim() || "Sneaker RUN&EARN",
        description: description.trim() || DEFAULT_SNEAKER_DESCRIPTION,
        rarity,
        palette,
        imageDataUrl: generated.dataUrl,
      };
      const proofBytes = new TextEncoder().encode(generated.dataUrl);
      const digest = await crypto.subtle.digest("SHA-256", proofBytes);
      const proofHash = `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}` as Hex;
      let transactionHash: `0x${string}` | undefined;

      if (SNEAKER_MINT_ADDRESS && isAddress(SNEAKER_MINT_ADDRESS)) {
        if (!wallet.isConnected || !wallet.address) {
          throw new Error("Connect your wallet to mint on Polygon.");
        }
        const data = encodeFunctionData({
          abi: sneakerMintAbi,
          functionName: "mintWithProof",
          args: [buildTokenUri(metadata), proofHash, RARITIES.findIndex((item) => item.id === rarity), 1],
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
    <section className="rounded-[2.5rem] border border-foreground/8 bg-surface p-5 sm:p-8 md:p-10">
      <div className="scroll-x -mx-5 mb-8 flex gap-2 px-5 pb-1 sm:-mx-8 sm:px-8 md:mx-0 md:px-0">
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
            {["Photograph your physical sneaker", "AI creates a unique collectible version", "Customize the name, rarity, and palette", "Mint on Polygon and find it in your collection"].map((item, index) => (
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
              className="rounded-full bg-sky px-6 py-3.5 text-sm font-semibold text-ink transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-sky/20 disabled:cursor-wait disabled:opacity-60"
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
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sneaker RUN&EARN" className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky" />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} enterKeyHint="done" autoComplete="off" placeholder={DEFAULT_SNEAKER_DESCRIPTION} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky" />
            </label>
            <button type="button" onClick={() => setDescription(DEFAULT_SNEAKER_DESCRIPTION)} className="cursor-pointer self-start rounded-full bg-mint/15 px-4 py-2 text-xs font-semibold text-mint transition-colors hover:bg-mint/25">
              Use default description
            </button>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Rarity
                <select value={rarity} onChange={(event) => setRarity(event.target.value as RarityLevel)} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky">
                  {RARITIES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.multiplier}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Palette
                <select value={palette} onChange={(event) => setPalette(event.target.value as PaletteId)} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-sky">
                  {PALETTES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              {PALETTES.find((item) => item.id === palette)?.colors.map((color) => (
                <span key={color} className="size-6 rounded-full border border-foreground/10" style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep(1)} className="rounded-full border border-foreground/15 px-5 py-3 text-xs font-semibold transition-colors hover:border-foreground/30">← Back</button>
              <button
                type="button"
                onClick={() => void mintSneaker()}
                disabled={isMinting}
                className="flex-1 rounded-full bg-magma px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-magma/25 transition-all hover:scale-[1.02] disabled:cursor-wait disabled:opacity-60"
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
            <Link href="/my-nfts" className="rounded-full bg-mint px-6 py-3 text-sm font-semibold text-ink transition-all hover:scale-105">
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

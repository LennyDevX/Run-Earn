"use client";

import Link from "next/link";
import { explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useMintedSneakers } from "@/hooks/useMintedSneakers";
import { useProfile } from "@/hooks/useProfile";
import { RARITIES } from "@/lib/sneaker-nft";

export default function MyNftsGallery() {
  const wallet = usePolygonWallet();
  const { sneakers, isReady } = useMintedSneakers(wallet.address);
  const { profile, setAvatarNft } = useProfile(wallet.address);

  if (!isReady) return null;

  if (!wallet.isConnected) {
    return (
      <section className="flex flex-col items-center gap-6 rounded-2xl border border-foreground/8 bg-surface px-8 py-16 text-center">
        <h2 className="max-w-xl text-2xl font-bold tracking-tight text-balance">
          Connect your wallet to view your collection
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-foreground/60">
          Your NFT sneaker collection is linked to your Polygon address.
        </p>
      </section>
    );
  }

  if (sneakers.length === 0) {
    return (
      <section className="flex flex-col items-center gap-6 rounded-2xl border border-foreground/8 bg-surface px-8 py-16 text-center">
        <span className="font-pixel text-[10px] text-sky">EMPTY COLLECTION</span>
        <h2 className="max-w-xl text-2xl font-bold tracking-tight text-balance">
          You have not minted a sneaker yet
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-foreground/60">
          Photograph your sneaker and let AI create its unique virtual collectible.
        </p>
        <Link
          href="/mint"
          className="rounded-full bg-magma px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-magma/25 transition-transform hover:scale-105"
        >
          Create my first NFT
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {sneakers.map((sneaker, index) => {
        const rarity = RARITIES.find((item) => item.id === sneaker.rarity);
        return (
          <article
            key={sneaker.id}
            className="group animate-fade-up flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 transition-[transform,box-shadow] duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <div className="relative overflow-hidden rounded-2xl bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sneaker.imageDataUrl}
                alt={sneaker.name}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${rarity?.accent ?? ""}`}>
                {rarity?.label ?? sneaker.rarity}
              </span>
              {/* Everything minted through the AI studio is a collectible:
                  digital art that trades on the marketplace and stays out of
                  staking, the tab arena, and the workshop. */}
              <span className="absolute top-3 left-3 rounded-full border border-astra/40 bg-ink/75 px-2.5 py-1 font-pixel text-[8px] tracking-[0.16em] text-astra uppercase backdrop-blur-sm">
                Collectible
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-bold tracking-tight">{sneaker.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/50">
                  {sneaker.description}
                </p>
              </div>
            </div>
            <p className="rounded-2xl bg-background px-3 py-2 text-[11px] leading-relaxed text-foreground/45">
              Digital art · trades on the marketplace at an appraiser-set price
            </p>
            <button
              type="button"
              onClick={() => setAvatarNft(sneaker.id)}
              disabled={!wallet.isConnected}
              className={`flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-full border text-xs font-semibold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                profile.avatarKind === "nft" && profile.avatarSneakerId === sneaker.id
                  ? "border-mint/40 bg-mint/10 text-mint"
                  : "border-foreground/15 text-foreground/60 hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
              </svg>
              {profile.avatarKind === "nft" && profile.avatarSneakerId === sneaker.id
                ? "Your avatar"
                : "Set as avatar"}
            </button>
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-foreground/40">
                {new Date(sneaker.mintedAt).toLocaleDateString("en-US")}
              </span>
              {sneaker.transactionHash ? (
                <a
                  href={explorerTransactionUrl(sneaker.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sky hover:underline"
                >
                  View tx ↗
                </a>
              ) : (
                <span className="rounded-full border border-foreground/10 px-2 py-1 text-[10px] text-foreground/40">
                  Local demo
                </span>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

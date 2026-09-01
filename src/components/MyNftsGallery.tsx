"use client";

import Link from "next/link";
import { explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useMintedSneakers } from "@/hooks/useMintedSneakers";
import { RARITIES } from "@/lib/sneaker-nft";

export default function MyNftsGallery() {
  const wallet = usePolygonWallet();
  const { sneakers, isReady } = useMintedSneakers(wallet.address);

  if (!isReady) return null;

  if (!wallet.isConnected) {
    return (
      <section className="flex flex-col items-center gap-6 rounded-[2.5rem] border border-foreground/8 bg-surface px-8 py-16 text-center">
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
      <section className="flex flex-col items-center gap-6 rounded-[2.5rem] border border-foreground/8 bg-surface px-8 py-16 text-center">
        <span className="font-pixel text-[10px] text-sky">EMPTY COLLECTION</span>
        <h2 className="max-w-xl text-2xl font-bold tracking-tight text-balance">
          You have not minted a sneaker yet
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-foreground/60">
          Photograph your physical sneaker and let AI create its collectible version.
        </p>
        <Link
          href="/mint"
          className="rounded-full bg-magma px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-magma/25 transition-all hover:scale-105"
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
            className="group animate-fade-up flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 transition-all duration-500 hover:-translate-y-2 hover:shadow-xl hover:shadow-foreground/8"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <div className="relative overflow-hidden rounded-2xl bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sneaker.imageDataUrl}
                alt={sneaker.name}
                className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase ${rarity?.accent ?? ""}`}>
                {rarity?.label ?? sneaker.rarity}
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

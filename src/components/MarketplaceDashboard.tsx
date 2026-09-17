"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { NETWORK_LABEL, explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useMarketplace } from "@/hooks/useMarketplace";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { RARITIES } from "@/lib/sneaker-nft";
import PixelSneaker from "@/components/PixelSneaker";

type Tab = "list" | "auction" | "offers";

const AUCTION_DURATIONS = [
  { label: "1 hour", seconds: 3600n },
  { label: "6 hours", seconds: 6n * 3600n },
  { label: "1 day", seconds: 86_400n },
  { label: "3 days", seconds: 3n * 86_400n },
  { label: "7 days", seconds: 7n * 86_400n },
];

const OFFER_DURATIONS = [
  { label: "1 hour", seconds: 3600n },
  { label: "1 day", seconds: 86_400n },
  { label: "3 days", seconds: 3n * 86_400n },
  { label: "7 days", seconds: 7n * 86_400n },
];

function formatPol(value: bigint, maxDigits = 4) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: 2 });
}

function parseAmount(input: string): bigint {
  if (!input) return 0n;
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return 0n;
  try {
    return parseEther(trimmed);
  } catch {
    return 0n;
  }
}

export default function MarketplaceDashboard() {
  const wallet = usePolygonWallet();
  const market = useMarketplace();
  const { activities, isLoading: loadingActivity, refresh: refreshActivity, addLocalActivity } = useSubgraphActivity(wallet.address);

  const [activeTab, setActiveTab] = useState<Tab>("list");
  const [priceInput, setPriceInput] = useState("");
  const [auctionStartInput, setAuctionStartInput] = useState("");
  const [auctionDuration, setAuctionDuration] = useState(86_400n);
  const [offerAmountInput, setOfferAmountInput] = useState("");
  const [offerTokenId, setOfferTokenId] = useState("");
  const [offerDuration, setOfferDuration] = useState(86_400n);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isConfigured = market.configured;

  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setActionNotice(`${label} confirmed on-chain.`);
      await market.refresh();
      await refreshActivity();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  function handleList(tokenId: bigint) {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Marketplace contract pending deployment on this network.");
      return;
    }
    const price = parseAmount(priceInput);
    if (price <= 0n) {
      setActionError("Enter a valid POL price (minimum 0.001 POL).");
      return;
    }
    void runAction(async () => {
      // The NFT must be approved for the marketplace before listing.
      await market.approveNft(tokenId);
      return market.list(tokenId, price);
    }, `NFT #${tokenId} listed`);
  }

  function handleCreateAuction(tokenId: bigint) {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Marketplace contract pending deployment on this network.");
      return;
    }
    const startPrice = parseAmount(auctionStartInput);
    if (startPrice <= 0n) {
      setActionError("Enter a valid starting price (minimum 0.001 POL).");
      return;
    }
    void runAction(async () => {
      await market.approveNft(tokenId);
      return market.createAuction(tokenId, startPrice, auctionDuration);
    }, `Auction for NFT #${tokenId} created`);
  }

  function handleMakeOffer() {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Marketplace contract pending deployment on this network.");
      return;
    }
    const amount = parseAmount(offerAmountInput);
    if (amount <= 0n) {
      setActionError("Enter a valid POL offer amount.");
      return;
    }
    if (!/^\d+$/.test(offerTokenId.trim()) || BigInt(offerTokenId.trim() || "0") <= 0n) {
      setActionError("Enter a valid token ID to make an offer on.");
      return;
    }
    void runAction(
      () => market.makeOffer(BigInt(offerTokenId.trim()), offerDuration, amount),
      `Offer placed on NFT #${offerTokenId.trim()}`,
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Protocol status bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-sky" />
          </div>
          <div>
            <span className="font-pixel text-[9px] text-sky">MARKETPLACE ACTIVE</span>
            <p className="text-xs font-semibold text-foreground/80">Fixed price · Auctions · POL offers</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
            2.5% FEE
          </span>
          <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
            {NETWORK_LABEL}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8 lg:p-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-foreground/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="scroll-x -mx-6 flex gap-2 px-6 pb-1 md:mx-0 md:px-0 md:pb-0">
            {(
              [
                { id: "list" as Tab, label: "Sell / Auction" },
                { id: "auction" as Tab, label: "My Listings" },
                { id: "offers" as Tab, label: "Make an Offer" },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold transition-all active:scale-95 ${
                  activeTab === tab.id
                    ? "bg-foreground text-background shadow-md"
                    : "border border-foreground/10 text-foreground/60 hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Sell / Auction your sneakers */}
        {activeTab === "list" ? (
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-pixel text-[9px] text-mint">SELL YOUR SNEAKERS</span>
              <h3 className="mt-2 text-2xl font-bold tracking-tight">List or auction your SneakerMint NFTs</h3>
              <p className="mt-1 text-sm text-foreground/60">
                Fixed-price sales and English auctions paid in native POL. Staked sneakers must be unstaked before listing.
              </p>
            </div>

            {/* Price input shared by list + auction */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-background p-6">
                <span className="font-pixel text-[9px] text-sky">FIXED-PRICE LISTING</span>
                <label className="text-xs font-bold text-foreground">Price (POL)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                    placeholder="0.00"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/15 bg-surface px-4 py-3 pr-16 font-mono text-lg font-bold outline-none transition-colors focus:border-mint"
                  />
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 font-pixel text-xs font-bold text-foreground/50">
                    POL
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-foreground/50">
                  The suggested price comes from the on-chain SneakerAppraiser valuation. You can list above or below it.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-background p-6">
                <span className="font-pixel text-[9px] text-magma">AUCTION</span>
                <label className="text-xs font-bold text-foreground">Starting price (POL)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                    placeholder="0.00"
                    value={auctionStartInput}
                    onChange={(e) => setAuctionStartInput(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/15 bg-surface px-4 py-3 pr-16 font-mono text-lg font-bold outline-none transition-colors focus:border-magma"
                  />
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 font-pixel text-xs font-bold text-foreground/50">
                    POL
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-foreground/45">Duration:</span>
                  {AUCTION_DURATIONS.map((d) => (
                    <button
                      key={d.seconds.toString()}
                      type="button"
                      onClick={() => setAuctionDuration(d.seconds)}
                      className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        auctionDuration === d.seconds
                          ? "border-magma/50 bg-magma/10 text-magma"
                          : "border-foreground/10 text-foreground/60 hover:border-magma/40"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sneaker cards */}
            {market.owned.sneakers.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {market.owned.sneakers.map((sneaker) => {
                  const saleKind = market.saleKinds.get(sneaker.tokenId.toString()) ?? 0n;
                  const suggested = market.suggested.get(sneaker.tokenId.toString()) ?? 0n;
                  const rarityObj = RARITIES[Number(sneaker.tier) % RARITIES.length];
                  const saleLabel = saleKind === 1n ? "LISTED" : saleKind === 2n ? "IN AUCTION" : "IN WALLET";
                  return (
                    <div
                      key={sneaker.tokenId.toString()}
                      className="flex flex-col justify-between overflow-hidden rounded-3xl border border-foreground/10 bg-background p-5 transition-all duration-300 hover:border-foreground/20 hover:shadow-lg"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${rarityObj?.accent ?? "bg-foreground/10"}`}>
                            {rarityObj?.label ?? "Sneaker"} · Tier {sneaker.tier.toString()}
                          </span>
                          <span className={`font-pixel text-[9px] ${saleKind > 0n ? "text-magma" : "text-foreground/40"}`}>
                            {saleLabel}
                          </span>
                        </div>
                        <div className="my-4 flex items-center justify-center rounded-2xl bg-surface/80 py-6">
                          <PixelSneaker design={Number(sneaker.tokenId) % 7} className="w-28 h-auto" />
                        </div>
                        <h4 className="font-bold">RUN&EARN Sneaker #{sneaker.tokenId.toString()}</h4>
                        <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
                          <span>Suggested price:</span>
                          <span className="font-mono font-bold text-sky">
                            {suggested > 0n ? `${formatPol(suggested)} POL` : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-foreground/10 pt-3">
                        <button
                          type="button"
                          disabled={market.isLoading || saleKind > 0n || !priceInput || parseAmount(priceInput) <= 0n}
                          onClick={() => handleList(sneaker.tokenId)}
                          className="min-h-11 cursor-pointer rounded-full bg-mint px-2 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          List for sale
                        </button>
                        <button
                          type="button"
                          disabled={market.isLoading || saleKind > 0n || !auctionStartInput || parseAmount(auctionStartInput) <= 0n}
                          onClick={() => handleCreateAuction(sneaker.tokenId)}
                          className="min-h-11 cursor-pointer rounded-full border border-magma/40 bg-magma/10 px-2 text-xs font-bold text-magma transition-colors active:scale-[0.98] hover:bg-magma/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Start auction
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-foreground/15 bg-background p-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-sky/10 font-pixel text-sky">
                  👟
                </div>
                <h4 className="text-lg font-bold">No sneakers to sell</h4>
                <p className="max-w-md text-xs leading-relaxed text-foreground/60">
                  You don&apos;t own any SneakerMint NFTs yet. Mint one from a physical sneaker photo to start selling.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Tab 2: My listings */}
        {activeTab === "auction" ? (
          <div className="flex flex-col gap-6">
            <div>
              <span className="font-pixel text-[9px] text-sky">MY LISTINGS</span>
              <h3 className="mt-2 text-2xl font-bold tracking-tight">Manage your active sales</h3>
              <p className="mt-1 text-sm text-foreground/60">
                Cancel a fixed-price listing to recover your NFT. Auctions can be cancelled only before the first bid and after the end time.
              </p>
            </div>
            {market.myListings.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {market.myListings.map((listing) => (
                  <div key={listing.listingId.toString()} className="flex flex-col justify-between rounded-3xl border border-mint/30 bg-mint/5 p-5">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-mint/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mint">
                          LISTED
                        </span>
                        <span className="font-pixel text-[9px] text-mint">● ON SALE</span>
                      </div>
                      <h4 className="mt-4 font-bold">Sneaker #{listing.tokenId.toString()}</h4>
                      <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
                        <span>Price:</span>
                        <span className="font-mono font-bold text-mint">{formatPol(listing.price)} POL</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={market.isLoading}
                      onClick={() => void runAction(() => market.cancelListing(listing.listingId), `Listing for NFT #${listing.tokenId} cancelled`)}
                      className="mt-5 w-full cursor-pointer rounded-full border border-sky/30 bg-sky/10 py-2.5 text-xs font-bold text-sky transition-colors hover:bg-sky/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel listing
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-foreground/15 bg-background p-10 text-center">
                <p className="text-sm text-foreground/60">
                  No active listings found. List a sneaker in the Sell / Auction tab to see it here.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Tab 3: Make an offer */}
        {activeTab === "offers" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
              <span className="font-pixel text-[9px] text-sky">POL OFFER</span>
              <h3 className="text-xl font-bold">Make an offer on any sneaker</h3>
              <p className="text-xs leading-relaxed text-foreground/60">
                Your POL is escrowed by the marketplace until the owner accepts, the offer expires, or you cancel it. The NFT stays with its owner until they accept.
              </p>
              <label className="text-xs font-bold text-foreground">Token ID</label>
              <input
                type="text"
                inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                placeholder="e.g. 12"
                value={offerTokenId}
                onChange={(e) => setOfferTokenId(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-2xl border border-foreground/15 bg-surface px-4 py-3 font-mono text-lg font-bold outline-none transition-colors focus:border-sky"
              />
              <label className="text-xs font-bold text-foreground">Offer amount (POL)</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                  placeholder="0.00"
                  value={offerAmountInput}
                  onChange={(e) => setOfferAmountInput(e.target.value)}
                  className="w-full rounded-2xl border border-foreground/15 bg-surface px-4 py-3 pr-16 font-mono text-lg font-bold outline-none transition-colors focus:border-sky"
                />
                <div className="absolute top-1/2 right-4 -translate-y-1/2 font-pixel text-xs font-bold text-foreground/50">
                  POL
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-foreground/45">Expires in:</span>
                {OFFER_DURATIONS.map((d) => (
                  <button
                    key={d.seconds.toString()}
                    type="button"
                    onClick={() => setOfferDuration(d.seconds)}
                    className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      offerDuration === d.seconds
                        ? "border-sky/50 bg-sky/10 text-sky"
                        : "border-foreground/10 text-foreground/60 hover:border-sky/40"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={market.isLoading || !offerAmountInput || !offerTokenId}
                onClick={handleMakeOffer}
                className="cursor-pointer rounded-full bg-sky px-6 py-4 text-sm font-bold text-ink shadow-lg shadow-sky/20 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {market.isLoading ? "Sending offer..." : "Place offer"}
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
              <span className="font-pixel text-[9px] text-mint">HOW IT WORKS</span>
              <div className="flex flex-col gap-3 text-xs leading-relaxed text-foreground/60">
                <div className="rounded-2xl bg-surface p-4">
                  <strong className="text-foreground">1. Escrow.</strong> Your POL is locked in the marketplace contract — the seller can see a funded, serious offer.
                </div>
                <div className="rounded-2xl bg-surface p-4">
                  <strong className="text-foreground">2. Accept or expire.</strong> The owner accepts to sell instantly, or the offer expires and you can cancel to reclaim your POL.
                </div>
                <div className="rounded-2xl bg-surface p-4">
                  <strong className="text-foreground">3. Fee.</strong> On acceptance the marketplace takes a 2.5% fee; the seller receives the rest and the NFT transfers to you.
                </div>
                <div className="rounded-2xl bg-surface p-4">
                  <strong className="text-foreground">Staked sneakers.</strong> Offers cannot target NFTs locked in staking — they must be unstaked first.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Feedback */}
        {actionNotice ? <p className="mt-6 rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{actionNotice}</p> : null}
        {actionError ? <p className="mt-6 rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{actionError}</p> : null}
      </div>

      {/* Activity feed */}
      <div className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
          <div>
            <span className="font-pixel text-[9px] text-mint">LIVE SUBGRAPH FEED</span>
            <h3 className="text-xl font-bold">Recent Marketplace Activity</h3>
          </div>
          <button
            type="button"
            onClick={() => void refreshActivity()}
            className="cursor-pointer rounded-full border border-foreground/15 px-4 py-2 text-xs font-semibold transition-colors hover:border-foreground/30"
          >
            Refresh Feed
          </button>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-foreground/10">
          {loadingActivity ? (
            <p className="py-6 text-center text-sm text-foreground/50">Indexing latest events from The Graph...</p>
          ) : activities.length > 0 ? (
            activities.map((act) => (
              <div key={`${act.id}-${act.timestamp ?? "now"}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-foreground/5 font-pixel text-xs text-sky">
                    ✦
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{act.label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}</p>
                    <p className="text-xs text-foreground/50">
                      {act.timestamp
                        ? new Date(act.timestamp < 10_000_000_000 ? act.timestamp * 1000 : act.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
                        : "Recent"}
                      {act.amount ? ` · ${act.amount}` : ""}
                    </p>
                  </div>
                </div>
                {act.transactionHash ? (
                  <a
                    href={explorerTransactionUrl(act.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-semibold text-sky hover:underline"
                  >
                    View on PolygonScan ↗
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-xs text-foreground/50">
              No recent activity recorded yet. List, buy, or bid to see live updates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

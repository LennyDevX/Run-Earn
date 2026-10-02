"use client";

import { useState } from "react";
import { isAddress, parseEther, type Address } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useMarketplace } from "@/hooks/useMarketplace";
import { useModEconomy } from "@/hooks/useModEconomy";
import { useOwnedMods } from "@/hooks/useOwnedMods";
import { modEffectLabel, slotInfo } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

function parseAmount(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return 0n;
  try {
    return parseEther(trimmed);
  } catch {
    return 0n;
  }
}

function parseId(input: string): bigint {
  const trimmed = input.trim();
  return /^\d+$/.test(trimmed) && BigInt(trimmed) > 0n ? BigInt(trimmed) : 0n;
}

const inputClass =
  "w-full rounded-2xl border border-foreground/15 bg-surface px-4 py-3 font-mono text-lg font-bold outline-none transition-colors focus:border-sky";

const SWAP_DURATIONS = [
  { label: "1 day", seconds: 86_400n },
  { label: "3 days", seconds: 3n * 86_400n },
  { label: "7 days", seconds: 7n * 86_400n },
];

type ActionRunner = (action: () => Promise<`0x${string}`>, label: string) => Promise<void> | void;

/// Shared card for one owned mod with slot/effect metadata.
function ModCard({ tokenId, traits, children }: { tokenId: bigint; traits: import("@/lib/mods").ModTraits; children?: React.ReactNode }) {
  const slot = slotInfo(traits.slot);
  const rarityObj = RARITIES[Number(traits.tier) % RARITIES.length];
  return (
    <div className="flex flex-col justify-between overflow-hidden rounded-3xl border border-foreground/10 bg-background p-5 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 hover:border-foreground/20 hover:shadow-lg">
      <div>
        <div className="flex items-center justify-between">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${rarityObj?.accent ?? "bg-foreground/10"}`}>
            {rarityObj?.label ?? "Mod"} · Tier {traits.tier}
          </span>
          {traits.consumable ? (
            <span className="rounded-full bg-magma/10 px-2.5 py-1 font-pixel text-[9px] text-magma">CONSUMABLE</span>
          ) : (
            <span className="font-pixel text-[9px] text-foreground/40">{slot.icon} {slot.label.toUpperCase()}</span>
          )}
        </div>
        <div className="my-4 flex items-center justify-center rounded-2xl bg-surface/80 py-6 text-4xl">
          {slot.icon}
        </div>
        <h4 className="font-bold">
          {traits.consumable ? "Repair Kit" : `${slot.label} Mod`} #{tokenId.toString()}
        </h4>
        <p className="mt-1 text-xs text-foreground/60">{modEffectLabel(traits)}</p>
      </div>
      {children ? <div className="mt-5 border-t border-foreground/10 pt-3">{children}</div> : null}
    </div>
  );
}

/// Tab: sell or auction mod NFTs on the multi-collection marketplace.
export function ModsMarketTab({ runAction }: { runAction: ActionRunner }) {
  const wallet = usePolygonWallet();
  const market = useMarketplace();
  const economy = useModEconomy();
  const ownedMods = useOwnedMods({
    owner: wallet.address,
    contractAddress: economy.modsAddress,
    publicClient: wallet.publicClient,
  });
  const [priceInput, setPriceInput] = useState("");
  const [auctionStartInput, setAuctionStartInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isConfigured = market.configured && Boolean(economy.modsAddress);

  function guard(): boolean {
    setLocalError(null);
    if (!isConfigured) {
      setLocalError("Interactive Demo Mode: mods marketplace pending deployment on this network.");
      return false;
    }
    return true;
  }

  function handleListMod(tokenId: bigint) {
    if (!guard()) return;
    const price = parseAmount(priceInput);
    if (price <= 0n) {
      setLocalError("Enter a valid POL price (minimum 0.001 POL).");
      return;
    }
    void runAction(async () => {
      await economy.approveMod(market.marketplaceAddress as Address, tokenId);
      return market.list(economy.modsAddress as Address, tokenId, price);
    }, `Mod #${tokenId} listed`);
  }

  function handleAuctionMod(tokenId: bigint) {
    if (!guard()) return;
    const startPrice = parseAmount(auctionStartInput);
    if (startPrice <= 0n) {
      setLocalError("Enter a valid auction starting price.");
      return;
    }
    void runAction(async () => {
      await economy.approveMod(market.marketplaceAddress as Address, tokenId);
      return market.createAuction(economy.modsAddress as Address, tokenId, startPrice, 86_400n);
    }, `Auction for mod #${tokenId} created`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="font-pixel text-[9px] text-mint">SELL YOUR MODS</span>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">List or auction mod NFTs</h3>
        <p className="mt-1 text-sm text-foreground/60">
          Mods and badges trade on the same marketplace as sneakers. Equipped mods must be unequipped in the Workshop first.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-sky">FIXED-PRICE LISTING</span>
          <label className="text-xs font-bold text-foreground">Price (POL)</label>
          <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="0.00" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-magma">AUCTION (24H)</span>
          <label className="text-xs font-bold text-foreground">Starting price (POL)</label>
          <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="0.00" value={auctionStartInput} onChange={(e) => setAuctionStartInput(e.target.value)} className={inputClass} />
        </div>
      </div>

      {ownedMods.mods.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ownedMods.mods.map((mod) => (
            <ModCard key={mod.tokenId.toString()} tokenId={mod.tokenId} traits={mod.traits}>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  disabled={market.isLoading || !priceInput || parseAmount(priceInput) <= 0n}
                  onClick={() => handleListMod(mod.tokenId)}
                  className="min-h-11 cursor-pointer rounded-full bg-mint px-2 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform active:scale-[0.98] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50">
                  List for sale
                </button>
                <button type="button"
                  disabled={market.isLoading || !auctionStartInput || parseAmount(auctionStartInput) <= 0n}
                  onClick={() => handleAuctionMod(mod.tokenId)}
                  className="min-h-11 cursor-pointer rounded-full border border-magma/40 bg-magma/10 px-2 text-xs font-bold text-magma transition-colors active:scale-[0.98] hover:bg-magma/20 disabled:cursor-not-allowed disabled:opacity-50">
                  Start auction
                </button>
              </div>
            </ModCard>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-foreground/15 bg-background p-10 text-center">
          <p className="text-sm text-foreground/60">
            {ownedMods.isLoading
              ? "Loading your mods..."
              : "No mods in your wallet yet. Claim badges on the Badges page or buy premium mods in the collection."}
          </p>
        </div>
      )}
      {localError ? <p className="rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{localError}</p> : null}
    </div>
  );
}

/// Tab: atomic NFT-for-NFT trades with optional POL top-up.
export function TradesTab({ runAction }: { runAction: ActionRunner }) {
  const wallet = usePolygonWallet();
  const economy = useModEconomy();
  const ownedMods = useOwnedMods({
    owner: wallet.address,
    contractAddress: economy.modsAddress,
    publicClient: wallet.publicClient,
  });
  const [offerModId, setOfferModId] = useState<bigint | null>(null);
  const [wantCollection, setWantCollection] = useState("");
  const [wantTokenId, setWantTokenId] = useState("");
  const [takerInput, setTakerInput] = useState("");
  const [topUpInput, setTopUpInput] = useState("");
  const [swapDuration, setSwapDuration] = useState(86_400n);
  const [swapIdInput, setSwapIdInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isConfigured = Boolean(economy.swapAddress && economy.modsAddress);

  function guard(): boolean {
    setLocalError(null);
    if (!isConfigured) {
      setLocalError("Interactive Demo Mode: NFT swaps pending deployment on this network.");
      return false;
    }
    return true;
  }

  function handleCreateSwap() {
    if (!guard()) return;
    if (offerModId === null) {
      setLocalError("Pick one of your mods to offer.");
      return;
    }
    const wantId = parseId(wantTokenId);
    if (!isAddress(wantCollection.trim()) || wantId <= 0n) {
      setLocalError("Enter the collection address and token ID of the NFT you want.");
      return;
    }
    const taker = isAddress(takerInput.trim()) ? (takerInput.trim() as Address) : ("0x0000000000000000000000000000000000000000" as Address);
    const topUp = topUpInput.trim() ? parseAmount(topUpInput) : 0n;
    void runAction(
      () =>
        economy.createSwap(
          economy.modsAddress as Address,
          offerModId,
          wantCollection.trim() as Address,
          wantId,
          swapDuration,
          taker,
          topUp,
        ),
      `Swap offered: mod #${offerModId}`,
    );
  }

  function swapAction(fn: (id: bigint) => Promise<`0x${string}`>, label: string) {
    if (!guard()) return;
    const swapId = parseId(swapIdInput);
    if (swapId <= 0n) {
      setLocalError("Enter a valid swap ID.");
      return;
    }
    void runAction(() => fn(swapId), `${label} #${swapId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="font-pixel text-[9px] text-magma">NFT TRADES</span>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">Atomic mod-for-NFT swaps</h3>
        <p className="mt-1 text-sm text-foreground/60">
          Offer one of your mods for any NFT on an approved collection — a sneaker, another mod — with an optional POL top-up. Both sides settle in one transaction or not at all.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-mint">YOU OFFER</span>
          {ownedMods.mods.length > 0 ? (
            <div className="flex flex-col gap-2">
              {ownedMods.mods.map((mod) => (
                <button key={mod.tokenId.toString()} type="button"
                  onClick={() => setOfferModId(mod.tokenId)}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    offerModId === mod.tokenId ? "border-mint/50 bg-mint/10" : "border-foreground/10 bg-surface hover:border-foreground/25"
                  }`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {slotInfo(mod.traits.slot).icon} {mod.traits.consumable ? "Repair Kit" : `${slotInfo(mod.traits.slot).label} Mod`} #{mod.tokenId.toString()}
                    </p>
                    <p className="text-[11px] text-foreground/50">{modEffectLabel(mod.traits)}</p>
                  </div>
                  <span className={`font-pixel text-[9px] ${offerModId === mod.tokenId ? "text-mint" : "text-foreground/30"}`}>
                    {offerModId === mod.tokenId ? "● SELECTED" : "○ PICK"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-foreground/15 p-4 text-center text-xs text-foreground/50">
              {ownedMods.isLoading ? "Loading your mods..." : "No mods to offer yet."}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-foreground">Optional POL top-up</label>
            <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
              placeholder="0.00" value={topUpInput} onChange={(e) => setTopUpInput(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-magma">YOU WANT</span>
          <label className="text-xs font-bold text-foreground">Collection address</label>
          <input type="text" inputMode="text" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="0x…" value={wantCollection} onChange={(e) => setWantCollection(e.target.value)} className={inputClass} />
          <label className="text-xs font-bold text-foreground">Token ID</label>
          <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="e.g. 5" value={wantTokenId} onChange={(e) => setWantTokenId(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
          <label className="text-xs font-bold text-foreground">Restrict to taker (optional)</label>
          <input type="text" inputMode="text" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="0x… (empty = anyone)" value={takerInput} onChange={(e) => setTakerInput(e.target.value)} className={inputClass} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground/45">Expires in:</span>
            {SWAP_DURATIONS.map((d) => (
              <button key={d.seconds.toString()} type="button" onClick={() => setSwapDuration(d.seconds)}
                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  swapDuration === d.seconds ? "border-magma/50 bg-magma/10 text-magma" : "border-foreground/10 text-foreground/60 hover:border-magma/40"
                }`}>
                {d.label}
              </button>
            ))}
          </div>
          <button type="button" disabled={economy.isLoading} onClick={handleCreateSwap}
            className="min-h-11 cursor-pointer rounded-full bg-magma px-6 text-sm font-bold text-white shadow-lg shadow-magma/25 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
            Create swap offer
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
        <span className="font-pixel text-[9px] text-sky">ACCEPT / CANCEL BY ID</span>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="Swap ID" value={swapIdInput} onChange={(e) => setSwapIdInput(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
          <button type="button" disabled={economy.isLoading || !swapIdInput}
            onClick={() => swapAction(economy.acceptSwap, "Swap accepted")}
            className="min-h-11 cursor-pointer rounded-full bg-mint px-6 text-xs font-bold text-ink transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
            Accept swap
          </button>
          <button type="button" disabled={economy.isLoading || !swapIdInput}
            onClick={() => swapAction(economy.cancelSwap, "Swap cancelled")}
            className="min-h-11 cursor-pointer rounded-full border border-magma/40 bg-magma/10 px-6 text-xs font-bold text-magma transition-colors hover:bg-magma/20 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel swap
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/50">
          To accept, the taker&apos;s NFT must be approved for the swap contract first. Cancelling returns the escrowed NFT and any POL top-up to the maker.
        </p>
      </div>
      {localError ? <p className="rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{localError}</p> : null}
    </div>
  );
}

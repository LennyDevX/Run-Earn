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

const RENT_DAYS = [
  { label: "1 day", days: 1n },
  { label: "3 days", days: 3n },
  { label: "7 days", days: 7n },
];

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
    <div className="flex flex-col justify-between overflow-hidden rounded-3xl border border-foreground/10 bg-background p-5 transition-all duration-300 hover:border-foreground/20 hover:shadow-lg">
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

/// Tab: list mods for rent, rent by ID, and manage rental positions.
export function RentalsTab({ runAction }: { runAction: ActionRunner }) {
  const wallet = usePolygonWallet();
  const economy = useModEconomy();
  const ownedMods = useOwnedMods({
    owner: wallet.address,
    contractAddress: economy.modsAddress,
    publicClient: wallet.publicClient,
  });
  const [pricePerDayInput, setPricePerDayInput] = useState("");
  const [maxDaysInput, setMaxDaysInput] = useState("7");
  const [rentalIdInput, setRentalIdInput] = useState("");
  const [rentDays, setRentDays] = useState(1n);
  const [rentTotalInput, setRentTotalInput] = useState("");
  const [sneakerIdInput, setSneakerIdInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isConfigured = Boolean(economy.rentalAddress && economy.modsAddress);

  function guard(): boolean {
    setLocalError(null);
    if (!isConfigured) {
      setLocalError("Interactive Demo Mode: mod rentals pending deployment on this network.");
      return false;
    }
    return true;
  }

  function handleListRental(modId: bigint) {
    if (!guard()) return;
    const pricePerDay = parseAmount(pricePerDayInput);
    const maxDays = parseId(maxDaysInput);
    if (pricePerDay <= 0n || maxDays <= 0n) {
      setLocalError("Enter a valid price per day and a maximum duration in days.");
      return;
    }
    void runAction(
      () => economy.listRental(modId, pricePerDay, maxDays * 86_400n),
      `Mod #${modId} listed for rent`,
    );
  }

  function handleRent() {
    if (!guard()) return;
    const rentalId = parseId(rentalIdInput);
    const total = parseAmount(rentTotalInput);
    if (rentalId <= 0n || total <= 0n) {
      setLocalError("Enter a valid rental ID and the total POL price for the period.");
      return;
    }
    void runAction(() => economy.rent(rentalId, rentDays, total), `Rental #${rentalId} paid`);
  }

  function idAction(fn: (id: bigint) => Promise<`0x${string}`>, label: string, extra?: () => boolean) {
    if (!guard()) return;
    const rentalId = parseId(rentalIdInput);
    if (rentalId <= 0n) {
      setLocalError("Enter a valid rental ID.");
      return;
    }
    if (extra && !extra()) return;
    void runAction(() => fn(rentalId), `${label} #${rentalId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="font-pixel text-[9px] text-sky">MOD RENTALS</span>
        <h3 className="mt-2 text-2xl font-bold tracking-tight">Rent mods or earn from yours</h3>
        <p className="mt-1 text-sm text-foreground/60">
          Owners keep custody in the rental contract while renters equip the mod on their sneaker for a fixed period. Everything settles in POL.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* List your mods for rent */}
        <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-mint">LIST A MOD FOR RENT</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-foreground">Price / day (POL)</label>
              <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                placeholder="0.00" value={pricePerDayInput} onChange={(e) => setPricePerDayInput(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-foreground">Max days</label>
              <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                placeholder="7" value={maxDaysInput} onChange={(e) => setMaxDaysInput(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
            </div>
          </div>
          {ownedMods.mods.length > 0 ? (
            <div className="flex flex-col gap-2">
              {ownedMods.mods.filter((m) => !m.traits.consumable).map((mod) => (
                <div key={mod.tokenId.toString()} className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {slotInfo(mod.traits.slot).icon} {slotInfo(mod.traits.slot).label} Mod #{mod.tokenId.toString()}
                    </p>
                    <p className="text-[11px] text-foreground/50">{modEffectLabel(mod.traits)}</p>
                  </div>
                  <button type="button"
                    disabled={economy.isLoading || parseAmount(pricePerDayInput) <= 0n || parseId(maxDaysInput) <= 0n}
                    onClick={() => handleListRental(mod.tokenId)}
                    className="min-h-11 shrink-0 cursor-pointer rounded-full bg-mint px-4 text-xs font-bold text-ink transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                    List for rent
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-foreground/15 p-4 text-center text-xs text-foreground/50">
              {ownedMods.isLoading ? "Loading your mods..." : "No equippable mods to rent out yet."}
            </p>
          )}
        </div>

        {/* Rent / manage by ID */}
        <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
          <span className="font-pixel text-[9px] text-sky">RENT &amp; MANAGE</span>
          <label className="text-xs font-bold text-foreground">Rental ID</label>
          <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="e.g. 1" value={rentalIdInput} onChange={(e) => setRentalIdInput(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground/45">Rent for:</span>
            {RENT_DAYS.map((d) => (
              <button key={d.days.toString()} type="button" onClick={() => setRentDays(d.days)}
                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  rentDays === d.days ? "border-sky/50 bg-sky/10 text-sky" : "border-foreground/10 text-foreground/60 hover:border-sky/40"
                }`}>
                {d.label}
              </button>
            ))}
          </div>
          <label className="text-xs font-bold text-foreground">Total price (POL)</label>
          <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
            placeholder="0.00" value={rentTotalInput} onChange={(e) => setRentTotalInput(e.target.value)} className={inputClass} />
          <button type="button" disabled={economy.isLoading || !rentalIdInput || !rentTotalInput} onClick={handleRent}
            className="min-h-11 cursor-pointer rounded-full bg-sky px-6 text-sm font-bold text-white shadow-lg shadow-sky/20 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 dark:text-ink">
            Pay &amp; rent
          </button>
          <div className="grid gap-3 border-t border-foreground/10 pt-4">
            <label className="text-xs font-bold text-foreground">Equip rented mod on sneaker ID</label>
            <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
              placeholder="e.g. 3" value={sneakerIdInput} onChange={(e) => setSneakerIdInput(e.target.value.replace(/[^\d]/g, ""))} className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={economy.isLoading}
                onClick={() => idAction((id) => economy.equipRented(id, parseId(sneakerIdInput)), "Equipped rental", () => {
                  if (parseId(sneakerIdInput) <= 0n) {
                    setLocalError("Enter a valid sneaker ID to equip the rented mod on.");
                    return false;
                  }
                  return true;
                })}
                className="min-h-11 cursor-pointer rounded-full bg-mint px-2 text-xs font-bold text-ink transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                Equip on sneaker
              </button>
              <button type="button" disabled={economy.isLoading}
                onClick={() => idAction(economy.releaseEarly, "Rental released")}
                className="min-h-11 cursor-pointer rounded-full border border-foreground/15 px-2 text-xs font-bold text-foreground/70 transition-colors hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50">
                Release early
              </button>
              <button type="button" disabled={economy.isLoading}
                onClick={() => idAction(economy.returnExpired, "Expired rental settled")}
                className="min-h-11 cursor-pointer rounded-full border border-foreground/15 px-2 text-xs font-bold text-foreground/70 transition-colors hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50">
                Settle expired
              </button>
              <button type="button" disabled={economy.isLoading}
                onClick={() => idAction(economy.cancelRental, "Rental listing cancelled")}
                className="min-h-11 cursor-pointer rounded-full border border-magma/40 bg-magma/10 px-2 text-xs font-bold text-magma transition-colors hover:bg-magma/20 disabled:cursor-not-allowed disabled:opacity-50">
                Cancel listing
              </button>
            </div>
          </div>
        </div>
      </div>
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
            className="min-h-11 cursor-pointer rounded-full bg-magma px-6 text-sm font-bold text-white shadow-lg shadow-magma/25 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50">
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

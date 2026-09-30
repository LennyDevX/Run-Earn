"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { usePolygonWallet } from "@/components/Providers";
import { useFeeSplitter } from "@/hooks/useFeeSplitter";
import { useSneakerVault } from "@/hooks/useSneakerVault";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function perkGates(perk: ReturnType<typeof useSneakerVault>["perks"][number]) {
  const gates: string[] = [];
  if (perk.minTier > 0) gates.push(["Common", "Rare", "Epic", "Mythic"][perk.minTier] ?? `Tier ${perk.minTier}`);
  if (perk.requiredLevel > 0) gates.push(`Level ${perk.requiredLevel}+`);
  if (perk.minPolStaked > 0n) gates.push(`${formatEther(perk.minPolStaked)} POL staked`);
  if (perk.minConditionBps > 0) gates.push(`Condition ${perk.minConditionBps / 100}%+`);
  if (perk.minModCount > 0n) gates.push(`${perk.minModCount} mod${perk.minModCount === 1n ? "" : "s"}`);
  return gates;
}

export default function ProtocolBenefitsPanel() {
  const wallet = usePolygonWallet();
  const vault = useSneakerVault();
  const splitter = useFeeSplitter();
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);

  async function claim(perkId: bigint) {
    setClaimError(null);
    setClaimNotice(null);
    try {
      await vault.claimPerk(perkId);
      setClaimNotice("Access perk claimed. Its on-chain event can now be used by connected campaigns.");
    } catch (cause) {
      setClaimError(cause instanceof Error ? cause.message : "Could not claim this access perk.");
    }
  }

  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-2" aria-label="Airen benefits and fee distribution">
      <article className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-brand dark:text-mint">SNEAKERVAULT</span>
        <h2 className="mt-2 text-xl font-bold tracking-tight">Holder benefits</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/55">
          Live eligibility controls store discounts and gated designs. Selling an NFT or unstaking POL updates eligibility immediately.
        </p>

        {!vault.configured ? (
          <p className="mt-5 rounded-2xl bg-background px-4 py-3 text-sm text-foreground/55">Benefits are not configured on this network.</p>
        ) : vault.perks.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-background px-4 py-3 text-sm text-foreground/55">
            {vault.isLoading ? "Loading perks…" : "No perks have been published yet."}
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {vault.perks.map((perk) => {
              const isDiscount = perk.kind === 0;
              const gates = perkGates(perk);
              return (
                <div key={perk.id.toString()} className="rounded-2xl bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {isDiscount ? `${(perk.valueBps / 100).toFixed(0)}% store discount` : `Exclusive access · perk ${perk.id.toString()}`}
                      </p>
                      <p className="mt-1 text-xs text-foreground/50">
                        {gates.length > 0 ? `Requires ${gates.join(" · ")}` : "Open to all connected wallets"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      !perk.active ? "bg-foreground/8 text-foreground/45" : perk.eligible ? "bg-mint/10 text-mint" : "bg-brand/10 text-brand"
                    }`}>
                      {!perk.active ? "Inactive" : !wallet.address ? "Connect wallet" : perk.eligible ? "Eligible" : "Locked"}
                    </span>
                  </div>
                  {!isDiscount ? (
                    <button
                      type="button"
                      disabled={!wallet.address || !perk.active || !perk.eligible || perk.claimed || vault.isLoading}
                      onClick={() => void claim(perk.id)}
                      className="mt-3 min-h-9 cursor-pointer rounded-full border border-brand/20 px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {perk.claimed ? "Access claimed" : "Claim access"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {vault.bestDiscountBps > 0 ? (
          <p className="mt-4 text-xs font-semibold text-mint">Your best active discount: {(vault.bestDiscountBps / 100).toFixed(0)}%</p>
        ) : null}
        {claimNotice ? <p className="mt-3 rounded-xl bg-mint/10 px-3 py-2 text-xs text-mint">{claimNotice}</p> : null}
        {claimError || vault.error ? <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs text-magma">{claimError ?? vault.error}</p> : null}
      </article>

      <article className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-brand dark:text-mint">FEE TRANSPARENCY</span>
        <h2 className="mt-2 text-xl font-bold tracking-tight">Airen fee split</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/55">
          Marketplace and rental fees accrue separately, then admins withdraw them to the splitter for pro-rata POL distribution.
        </p>
        {!splitter.configured ? (
          <p className="mt-5 rounded-2xl bg-background px-4 py-3 text-sm text-foreground/55">Fee splitter is not configured on this network.</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-background p-4">
                <span className="text-xs text-foreground/50">Awaiting distribution</span>
                <p className="mt-1 font-mono text-sm font-semibold">{splitter.pendingFees === null ? "—" : `${formatEther(splitter.pendingFees)} POL`}</p>
              </div>
              <div className="rounded-2xl bg-background p-4">
                <span className="text-xs text-foreground/50">Distributed lifetime</span>
                <p className="mt-1 font-mono text-sm font-semibold">{splitter.totalDistributed === null ? "—" : `${formatEther(splitter.totalDistributed)} POL`}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {splitter.recipients.map((recipient) => (
                <div key={`${recipient.account}-${recipient.weightBps}`} className="flex items-center justify-between rounded-xl bg-background px-4 py-3 text-xs">
                  <span className="font-mono text-foreground/65">{shortAddress(recipient.account)}</span>
                  <span className="font-semibold text-brand">{(Number(recipient.weightBps) / 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
        {splitter.error ? <p className="mt-3 rounded-xl bg-magma/10 px-3 py-2 text-xs text-magma">{splitter.error}</p> : null}
      </article>
    </section>
  );
}

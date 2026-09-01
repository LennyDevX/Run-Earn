"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { NETWORK_LABEL, explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useStakingVault } from "@/hooks/useStakingVault";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";

function formatPol(value: bigint) {
  return Number(formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function formatApy(value: bigint) {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function activityLabel(label: string) {
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}

function activityTime(timestamp?: number) {
  if (!timestamp) return "Recent";
  const date = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
  return Number.isNaN(date.getTime()) ? "Recent" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function StakingVaultDashboard() {
  const wallet = usePolygonWallet();
  const staking = useStakingVault();
  const { activities, isLoading: loadingActivity, refresh: refreshActivity, addLocalActivity } = useSubgraphActivity(wallet.address);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);


  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setError(null);
    setNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setNotice(`${label} confirmed.`);
      await staking.refresh();
      await refreshActivity();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  async function sendDeposit() {
    try {
      await runAction(() => staking.depositPOL(parseEther(depositAmount)), "POL deposit");
      setDepositAmount("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not deposit POL.");
    }
  }

  async function sendWithdraw() {
    try {
      await runAction(() => staking.withdrawPOL(parseEther(withdrawAmount)), "POL withdrawal");
      setWithdrawAmount("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not withdraw POL.");
    }
  }

  const configured = staking.configured;

  return (
    <section className="rounded-[2.5rem] bg-linear-to-br from-ink to-ink-soft p-6 text-paper ring-1 ring-transparent dark:ring-paper/10 md:p-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="font-pixel text-[9px] text-mint">POL STAKING VAULT</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Stake POL. Boost it with sneakers.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">Deposit POL as your principal, track your passive POL rewards, and lock SneakerMint NFTs to increase your APY. Rewards are paid only from the funded POL reserve.</p>
        </div>
        <span className="rounded-full bg-paper/10 px-4 py-2 text-xs font-semibold text-mint">{NETWORK_LABEL}</span>
      </div>

      {!configured ? (
        <div className="mt-8 rounded-3xl border border-magma/20 bg-magma/10 p-6 text-sm text-paper/70">Configure `NEXT_PUBLIC_SNEAKER_MINT_ADDRESS` and `NEXT_PUBLIC_STAKING_VAULT_ADDRESS` after deploying the contracts on Polygon Amoy.</div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="text-xs text-paper/50">POL principal</span><strong className="mt-2 block text-2xl text-mint">{formatPol(staking.stats.principal)} POL</strong></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="text-xs text-paper/50">Pending rewards</span><strong className="mt-2 block text-2xl text-mint">{formatPol(staking.stats.pendingRewards)} POL</strong></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="text-xs text-paper/50">Effective APY</span><strong className="mt-2 block text-2xl text-sky">{formatApy(staking.stats.apyBps)}</strong></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="text-xs text-paper/50">Locked NFTs</span><strong className="mt-2 block text-2xl text-sky">{staking.stats.lockedCount.toString()}</strong></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="text-xs text-paper/50">POL reward reserve</span><strong className="mt-2 block text-2xl text-mint">{formatPol(staking.stats.reserve)} POL</strong></div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="font-pixel text-[9px] text-mint">DEPOSIT POL</span><p className="mt-3 text-xs leading-relaxed text-paper/55">Deposits restart the minimum lock period after current rewards are accrued.</p><input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="0.10" inputMode="decimal" className="mt-4 w-full rounded-2xl border border-paper/10 bg-ink px-4 py-3 font-mono text-sm text-paper outline-none focus:border-mint" /><button type="button" disabled={staking.isLoading} onClick={() => void sendDeposit()} className="mt-3 w-full rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink disabled:cursor-wait disabled:opacity-50">{staking.isLoading ? "Processing..." : "Deposit POL"}</button></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="font-pixel text-[9px] text-sky">WITHDRAW POL</span><p className="mt-3 text-xs leading-relaxed text-paper/55">Principal unlocks after the minimum lock. Withdrawals remain available during an emergency pause.</p><input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="0.10" inputMode="decimal" className="mt-4 w-full rounded-2xl border border-paper/10 bg-ink px-4 py-3 font-mono text-sm text-paper outline-none focus:border-sky" /><button type="button" disabled={staking.isLoading} onClick={() => void sendWithdraw()} className="mt-3 w-full rounded-full bg-sky px-5 py-3 text-sm font-semibold text-ink disabled:cursor-wait disabled:opacity-50">{staking.isLoading ? "Processing..." : "Withdraw POL"}</button></div>
            <div className="rounded-3xl border border-paper/10 bg-paper/5 p-5"><span className="font-pixel text-[9px] text-mint">CLAIM EARNINGS</span><p className="mt-3 text-xs leading-relaxed text-paper/55">Claim accrued POL rewards without withdrawing principal or unlocking NFTs.</p><div className="mt-4 rounded-2xl bg-ink px-4 py-3 font-mono text-sm text-mint">{formatPol(staking.stats.pendingRewards)} POL</div><button type="button" disabled={staking.isLoading || staking.stats.pendingRewards === 0n} onClick={() => void runAction(staking.claimPOLRewards, "POL rewards claim")} className="mt-3 w-full rounded-full border border-mint/40 px-5 py-3 text-sm font-semibold text-mint disabled:cursor-not-allowed disabled:opacity-40">Claim POL rewards</button></div>
          </div>

          <div className="mt-6 rounded-3xl border border-paper/10 bg-paper/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="font-pixel text-[9px] text-mint">SNEAKER BOOST</span><h3 className="mt-2 text-xl font-bold">Lock NFTs to increase APY</h3></div><span className="rounded-full bg-sky/15 px-3 py-1 text-xs font-semibold text-sky">{staking.stats.lockedCount.toString()} locked</span></div>
            <p className="mt-3 text-sm leading-relaxed text-paper/55">Rarity and tier are read directly from SneakerMint. The client cannot fake the boost.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{staking.stats.ownedSneakers.length ? staking.stats.ownedSneakers.map((sneaker) => <div key={sneaker.tokenId.toString()} className="flex items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3"><div><span className="font-mono text-sm text-paper">Sneaker #{sneaker.tokenId.toString()}</span><span className="mt-1 block text-xs text-paper/50">Rarity {sneaker.rarity.toString()} · Tier {sneaker.tier.toString()}</span></div><button type="button" disabled={staking.isLoading} onClick={() => void runAction(() => staking.lockNFT(sneaker.tokenId), `NFT #${sneaker.tokenId.toString()} locked`)} className="rounded-full bg-mint/15 px-3 py-2 text-xs font-semibold text-mint disabled:opacity-40">Lock NFT</button></div>) : <p className="rounded-2xl bg-ink px-4 py-4 text-sm text-paper/50">No unlocked SneakerMint NFTs found in this wallet.</p>}</div>
            {staking.stats.stakedTokenIds.length ? <div className="mt-5"><span className="text-xs font-semibold text-paper/60">Currently locked</span><div className="mt-2 flex flex-wrap gap-2">{staking.stats.stakedTokenIds.map((tokenId) => <button key={tokenId.toString()} type="button" disabled={staking.isLoading} onClick={() => void runAction(() => staking.unlockNFT(tokenId), `NFT #${tokenId.toString()} unlocked`)} className="rounded-full bg-sky/15 px-3 py-2 text-xs font-semibold text-sky disabled:opacity-40">NFT #{tokenId.toString()} · Unlock</button>)}</div></div> : null}
          </div>

          <div className="mt-6 rounded-3xl border border-paper/10 bg-paper/5 p-5"><div className="flex items-center justify-between gap-3"><div><span className="font-pixel text-[9px] text-mint">RECENT ACTIVITY</span><h3 className="mt-2 text-xl font-bold">Your staking timeline</h3></div><button type="button" onClick={() => void refreshActivity()} className="rounded-full border border-paper/15 px-3 py-2 text-xs font-semibold text-paper/70 hover:border-paper/30">Refresh</button></div><div className="mt-4 flex flex-col divide-y divide-paper/10">{loadingActivity ? <p className="py-5 text-sm text-paper/50">Loading activity from the subgraph...</p> : activities.length ? activities.map((activity) => <div key={`${activity.id}-${activity.timestamp ?? "now"}`} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-paper">{activityLabel(activity.label)}</p><p className="mt-1 text-xs text-paper/45">{activityTime(activity.timestamp)}{activity.tokenId ? ` · NFT #${activity.tokenId}` : ""}{activity.amount ? ` · ${activity.amount}` : ""}</p></div>{activity.transactionHash ? <a href={explorerTransactionUrl(activity.transactionHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-sky underline underline-offset-4">View tx ↗</a> : null}</div>) : <p className="py-5 text-sm text-paper/50">No indexed activity yet. Confirm a transaction to see it here.</p>}</div></div>
        </>
      )}

      {staking.error ? <p className="mt-5 rounded-2xl bg-magma/15 px-4 py-3 text-xs text-magma">{staking.error}</p> : null}
      {notice ? <p className="mt-5 rounded-2xl bg-mint/15 px-4 py-3 text-xs text-mint">{notice}</p> : null}
      {error ? <p className="mt-5 rounded-2xl bg-magma/15 px-4 py-3 text-xs text-magma">{error}</p> : null}
    </section>
  );
}

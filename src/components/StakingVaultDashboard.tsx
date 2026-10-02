"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import { NETWORK_LABEL, explorerTransactionUrl, usePolygonWallet } from "@/components/Providers";
import { useStakingVault } from "@/hooks/useStakingVault";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { useMintedSneakers } from "@/hooks/useMintedSneakers";
import { useWalletOverview } from "@/hooks/useWalletOverview";
import { useNftAppraisal } from "@/hooks/useNftAppraisal";
import { RARITIES } from "@/lib/sneaker-nft";
import { centerInScrollRow } from "@/lib/scroll-x";
import SneakerArtwork from "@/components/SneakerArtwork";

type Tab = "deposit" | "claim" | "withdraw" | "model";

const BASE_APY_BPS = 280n; // 2.80% sustainable base rate
const MAX_APY_BPS = 800n; // 8.00% ceiling
const LOCK_DAYS = 30;

function formatPol(value: bigint, maxDigits = 4) {
  const num = Number(formatEther(value));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: 2 });
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

function parseDepositAmount(input: string): bigint {
  if (!input) return 0n;
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) return 0n;
  try {
    return parseEther(trimmed);
  } catch {
    return 0n;
  }
}

export default function StakingVaultDashboard() {
  const wallet = usePolygonWallet();
  const staking = useStakingVault();
  const walletOverview = useWalletOverview();
  const localMinted = useMintedSneakers(wallet.address);
  const appraisal = useNftAppraisal();
  const { activities, isLoading: loadingActivity, refresh: refreshActivity, addLocalActivity } = useSubgraphActivity(wallet.address);

  const [activeTab, setActiveTab] = useState<Tab>("deposit");
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [agreeLock, setAgreeLock] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [nowSeconds, setNowSeconds] = useState(0);

  useEffect(() => {
    const sync = () => setNowSeconds(Math.floor(Date.now() / 1000));
    const frame = window.requestAnimationFrame(sync);
    const interval = setInterval(sync, 60_000);
    // Re-sync on return so the lock countdown never shows stale data.
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const isConfigured = staking.configured;

  // Active APY calculation
  const effectiveApy = isConfigured ? (staking.stats.apyBps || BASE_APY_BPS) : BASE_APY_BPS;
  const nftBoostBps = effectiveApy > BASE_APY_BPS ? effectiveApy - BASE_APY_BPS : 0n;

  // Lock status calculation (30 days = 2,592,000s)
  const lockPeriodSeconds = Number(staking.stats.minLockSeconds || 2592000n);
  const depositTimestamp = Number(staking.stats.depositedAt || 0n);
  const unlockTimestamp = depositTimestamp > 0 ? depositTimestamp + lockPeriodSeconds : 0;
  const isLockActive = Boolean(nowSeconds > 0 && staking.stats.principal > 0n && unlockTimestamp > nowSeconds);
  const remainingLockSeconds = isLockActive ? Math.max(0, unlockTimestamp - nowSeconds) : 0;
  const remainingLockDays = Math.ceil(remainingLockSeconds / 86400);

  // User wallet POL balance
  const walletPolBalance = walletOverview.balance ?? 0n;

  // Real-time Earnings Simulator
  const simulatedDeposit = parseDepositAmount(depositInput);
  const projectedDailyReward = simulatedDeposit > 0n ? (simulatedDeposit * effectiveApy) / (10000n * 365n) : 0n;
  const projectedMonthlyReward = simulatedDeposit > 0n ? (simulatedDeposit * effectiveApy * 30n) / (10000n * 365n) : 0n;
  const projectedYearlyReward = simulatedDeposit > 0n ? (simulatedDeposit * effectiveApy) / 10000n : 0n;

  // Combined sneakers list (on-chain + local demo)
  const allOwnedSneakers = useMemo(() => {
    if (staking.stats.ownedSneakers.length > 0) return staking.stats.ownedSneakers;
    return localMinted.sneakers.map((s, idx) => ({
      tokenId: BigInt(s.tokenId ?? idx + 1),
      rarity: BigInt(s.rarity === "mitico" ? 85 : s.rarity === "epico" ? 65 : s.rarity === "raro" ? 45 : 20),
      tier: BigInt(s.rarity === "mitico" ? 3 : s.rarity === "epico" ? 2 : s.rarity === "raro" ? 1 : 0),
      artwork: { src: s.imageDataUrl, alt: `${s.name} virtual sneaker artwork`, name: s.name, family: null },
    }));
  }, [staking.stats.ownedSneakers, localMinted.sneakers]);

  // Appraise owned NFTs when the appraiser contract is configured and the list changes
  useEffect(() => {
    if (!appraisal.configured || allOwnedSneakers.length === 0) return;
    void appraisal.appraiseTokenIds(allOwnedSneakers.map((s) => s.tokenId));
  }, [appraisal.configured, allOwnedSneakers, appraisal]);

  async function runAction(action: () => Promise<`0x${string}`>, label: string) {
    setActionError(null);
    setActionNotice(null);
    try {
      const hash = await action();
      addLocalActivity(label, hash);
      setActionNotice(`${label} confirmed on-chain.`);
      await Promise.all([staking.refresh(), walletOverview.refresh()]);
      await refreshActivity();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  async function handleDeposit() {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Staking contract pending deployment on this network.");
      return;
    }
    if (!depositInput || Number(depositInput) <= 0) {
      setActionError("Please enter a valid POL deposit amount.");
      return;
    }
    try {
      await runAction(() => staking.depositPOL(parseEther(depositInput)), "POL deposit");
      setDepositInput("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not complete deposit.");
    }
  }

  async function handleWithdraw() {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Staking contract pending deployment on this network.");
      return;
    }
    if (isLockActive) {
      setActionError(`Your 30-day lock period is active (${remainingLockDays} days remaining). Principal cannot be withdrawn early.`);
      return;
    }
    if (!withdrawInput || Number(withdrawInput) <= 0) {
      setActionError("Please enter a valid POL amount to withdraw.");
      return;
    }
    try {
      await runAction(() => staking.withdrawPOL(parseEther(withdrawInput)), "POL withdrawal");
      setWithdrawInput("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not complete withdrawal.");
    }
  }

  async function handleClaim() {
    if (!isConfigured) {
      setActionNotice("Interactive Demo Mode: Rewards claim confirmed in preview.");
      return;
    }
    if (staking.stats.pendingRewards <= 0n) {
      setActionError("No accumulated rewards available to claim yet.");
      return;
    }
    try {
      await runAction(staking.claimPOLRewards, "POL rewards claim");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not claim rewards.");
    }
  }

  function applyPreset(percentage: number) {
    if (walletPolBalance <= 0n) return;
    // Leave small buffer for gas
    const gasBuffer = parseEther("0.01");
    const usable = walletPolBalance > gasBuffer ? walletPolBalance - gasBuffer : 0n;
    const amount = (usable * BigInt(percentage)) / 100n;
    setDepositInput(formatEther(amount));
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Network & Protocol Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-foreground/10 bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-mint" />
          </div>
          <div>
            <span className="font-pixel text-[9px] text-mint">PROTOCOL ACTIVE</span>
            <p className="text-xs font-semibold text-foreground/80">30-Day Non-Custodial Staking Vault</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
            BASE 2.80% APY
          </span>
          <span className="rounded-full border border-sky/20 bg-sky/10 px-3 py-1 font-pixel text-[9px] text-sky">
            MAX 8.00% BOOST
          </span>
          <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
            {NETWORK_LABEL}
          </span>
        </div>
      </div>

      {/* Top Overview KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Active APY */}
        <div className="group relative overflow-hidden rounded-3xl border border-foreground/10 bg-surface p-6 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 hover:border-mint/30 hover:shadow-xl hover:shadow-mint/5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/50">TOTAL ACTIVE APY</span>
            <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-[10px] font-bold text-mint">
              SUSTAINABLE
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-mint">
              {formatApy(effectiveApy)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
            <span>2.80% Base</span>
            <span className="font-mono text-sky">+{formatApy(nftBoostBps)} NFT Boost</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full w-full origin-left rounded-full bg-mint transition-transform duration-700"
              style={{ transform: `scaleX(${Math.min(1, Number(effectiveApy) / Number(MAX_APY_BPS))})` }}
            />
          </div>
        </div>

        {/* KPI 2: Accumulated Rewards */}
        <div className="group relative overflow-hidden rounded-3xl border border-foreground/10 bg-surface p-6 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 hover:border-sky/30 hover:shadow-xl hover:shadow-sky/5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/50">ACCUMULATED REWARDS</span>
            <span className="flex size-2 rounded-full bg-sky" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-sky">
              {formatPol(staking.stats.pendingRewards)}
            </span>
            <span className="text-sm font-bold text-foreground/50">POL</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-foreground/50">Liquid · Claim anytime</span>
            <button
              type="button"
              disabled={staking.isLoading || (!isConfigured ? false : staking.stats.pendingRewards === 0n)}
              onClick={() => void handleClaim()}
              className="cursor-pointer rounded-full bg-sky/15 px-3 py-1 text-xs font-bold text-sky transition-colors hover:bg-sky/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Claim now ↗
            </button>
          </div>
        </div>

        {/* KPI 3: Staked Principal */}
        <div className="group relative overflow-hidden rounded-3xl border border-foreground/10 bg-surface p-6 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 hover:border-foreground/20 hover:shadow-xl hover:shadow-foreground/5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/50">STAKED PRINCIPAL</span>
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[9px] font-semibold text-foreground/60">
              30-DAY LOCK
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-foreground">
              {formatPol(staking.stats.principal)}
            </span>
            <span className="text-sm font-bold text-foreground/50">POL</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-foreground/50">Lock Status:</span>
            <span className={`font-semibold ${isLockActive ? "text-magma" : "text-mint"}`}>
              {isLockActive ? `${remainingLockDays}d cooldown remaining` : staking.stats.principal > 0n ? "Unlocked & Liquid" : "Ready to Stake"}
            </span>
          </div>
        </div>

        {/* KPI 4: Sneaker Boosts */}
        <div className="group relative overflow-hidden rounded-3xl border border-foreground/10 bg-surface p-6 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 hover:border-polygon-purple/30 hover:shadow-xl hover:shadow-polygon-purple/5">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[9px] text-foreground/50">LOCKED SNEAKERS</span>
            <span className="rounded-full bg-polygon-purple/15 px-2 py-0.5 text-[9px] font-semibold text-polygon-purple">
              NFT BOOST
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-polygon-purple">
              {staking.stats.lockedCount.toString()}
            </span>
            <span className="text-sm font-bold text-foreground/50">pairs locked</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-foreground/60">
            <span>Boost multiplier:</span>
            <span className="font-mono font-bold text-mint">
              {staking.stats.lockedCount > 0n ? `×${(Number(effectiveApy) / Number(BASE_APY_BPS)).toFixed(2)}` : "×1.00"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Interactive Terminal with Tabs */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8 lg:p-10">
        {/* Navigation Tabs */}
        <div className="mb-8 flex flex-col gap-4 border-b border-foreground/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="scroll-x -mx-6 flex gap-2 px-6 pb-1 md:mx-0 md:px-0 md:pb-0">
            <button
              type="button"
              onClick={(event) => {
                setActiveTab("deposit");
                centerInScrollRow(event.currentTarget);
              }}
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                activeTab === "deposit"
                  ? "bg-foreground text-background shadow-md"
                  : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              Deposit POL
            </button>
            <button
              type="button"
              onClick={(event) => {
                setActiveTab("claim");
                centerInScrollRow(event.currentTarget);
              }}
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                activeTab === "claim"
                  ? "bg-foreground text-background shadow-md"
                  : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              Claim Rewards
            </button>
            <button
              type="button"
              onClick={(event) => {
                setActiveTab("withdraw");
                centerInScrollRow(event.currentTarget);
              }}
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                activeTab === "withdraw"
                  ? "bg-foreground text-background shadow-md"
                  : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              Withdraw Principal
            </button>
            <button
              type="button"
              onClick={(event) => {
                setActiveTab("model");
                centerInScrollRow(event.currentTarget);
              }}
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-sm font-semibold transition-[transform,color,background-color,border-color,fill,stroke] active:scale-95 ${
                activeTab === "model"
                  ? "bg-foreground text-background shadow-md"
                  : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              Protocol Economics
            </button>
          </div>

          <div className="text-xs text-foreground/50">
            Wallet Balance: <strong className="font-mono text-foreground">{formatPol(walletPolBalance)} POL</strong>
          </div>
        </div>

        {/* Tab 1: Deposit POL */}
        {activeTab === "deposit" ? (
          <div className="grid gap-8 lg:grid-cols-12">
            {/* Input Form */}
            <div className="flex flex-col gap-5 lg:col-span-7">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-foreground">Amount to Stake (POL)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                    placeholder="0.00"
                    value={depositInput}
                    onChange={(e) => setDepositInput(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/15 bg-background px-4 py-4 pr-20 font-mono text-xl font-bold outline-none transition-colors focus:border-mint"
                  />
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 font-pixel text-xs font-bold text-foreground/50">
                    POL
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-foreground/45">Quick Presets:</span>
                {[25, 50, 75, 100].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    onClick={() => applyPreset(percent)}
                    className="min-h-10 cursor-pointer rounded-xl border border-foreground/10 bg-background px-3.5 py-2 text-xs font-semibold transition-colors active:scale-95 hover:border-mint/50 hover:text-mint"
                  >
                    {percent === 100 ? "MAX" : `${percent}%`}
                  </button>
                ))}
              </div>

              {/* 30-Day Lock Disclosure Notice */}
              <div className="rounded-2xl border border-mint/20 bg-mint/5 p-4 text-xs leading-relaxed text-foreground/75">
                <div className="flex items-center gap-2 font-bold text-mint">
                  <span className="font-pixel text-[9px]">30-DAY ESCROW COOLDOWN</span>
                </div>
                <p className="mt-1">
                  To protect staking liquidity and ensure sustainable tokenomics, deposited POL is locked for a minimum of <strong>{LOCK_DAYS} days</strong>. Rewards accrue continuously and can be claimed at any time without resetting the lock.
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-foreground/90 select-none">
                  <input
                    type="checkbox"
                    checked={agreeLock}
                    onChange={(e) => setAgreeLock(e.target.checked)}
                    className="size-4 accent-mint"
                  />
                  <span>I acknowledge the 30-day non-custodial lock period.</span>
                </label>
              </div>

              <button
                type="button"
                disabled={staking.isLoading || !agreeLock || !depositInput || Number(depositInput) <= 0}
                onClick={() => void handleDeposit()}
                className="cursor-pointer rounded-full bg-mint px-6 py-4 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition-[transform,box-shadow] hover:scale-[1.01] hover:shadow-mint/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {staking.isLoading ? "Confirming transaction..." : "Deposit & Stake POL"}
              </button>
            </div>

            {/* Real-Time Earnings Calculator */}
            <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-foreground/10 pb-3">
                <span className="font-pixel text-[9px] text-mint">PROJECTED YIELD CALCULATOR</span>
                <span className="font-mono text-xs font-bold text-sky">{formatApy(effectiveApy)} APY</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
                  <span className="text-xs text-foreground/60">Daily Estimate</span>
                  <strong className="font-mono text-sm text-foreground">
                    +{formatPol(projectedDailyReward, 5)} POL
                  </strong>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
                  <span className="text-xs text-foreground/60">30-Day Epoch (1 Lock)</span>
                  <strong className="font-mono text-sm text-mint">
                    +{formatPol(projectedMonthlyReward, 5)} POL
                  </strong>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface p-3">
                  <span className="text-xs text-foreground/60">Annual Return (365 Days)</span>
                  <strong className="font-mono text-sm text-sky">
                    +{formatPol(projectedYearlyReward, 4)} POL
                  </strong>
                </div>
              </div>

              <div className="rounded-2xl border border-foreground/5 bg-surface/50 p-3 text-[11px] leading-relaxed text-foreground/50">
                Calculated with 2.80% sustainable base APY plus your active Sneaker NFT boosts. You must manually lock NFTs in the vault below to activate their APY boost.
              </div>
            </div>
          </div>
        ) : null}

        {/* Tab 2: Claim Rewards */}
        {activeTab === "claim" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <div>
                <span className="font-pixel text-[9px] text-mint">INSTANT CLAIM TERMINAL</span>
                <h3 className="mt-2 text-2xl font-bold">Claim Accrued POL Earnings</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                  Unlike principal, your accumulated rewards have no lockup period. You can claim them to your wallet at any moment.
                </p>
              </div>

              <div className="rounded-3xl border border-mint/20 bg-mint/5 p-6">
                <span className="text-xs text-foreground/50">Accumulated Rewards Ready to Claim</span>
                <div className="mt-2 text-4xl font-extrabold text-mint">
                  {formatPol(staking.stats.pendingRewards)} POL
                </div>
                <span className="mt-2 block text-xs text-foreground/45">
                  Funded directly from protocol revenue & verifiable reward reserve.
                </span>
              </div>

              <button
                type="button"
                disabled={staking.isLoading || (!isConfigured ? false : staking.stats.pendingRewards === 0n)}
                onClick={() => void handleClaim()}
                className="cursor-pointer rounded-full bg-mint px-6 py-4 text-sm font-bold text-ink shadow-lg shadow-mint/20 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {staking.isLoading ? "Claiming..." : "Claim All Accumulated POL"}
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
              <span className="font-pixel text-[9px] text-sky">RESERVE & SECURITY BACKING</span>
              <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
                <span className="text-xs text-foreground/60">Vault Reward Reserve</span>
                <strong className="font-mono text-sm text-sky">{formatPol(staking.stats.reserve)} POL</strong>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
                <span className="text-xs text-foreground/60">Total Protocol Principal</span>
                <strong className="font-mono text-sm text-foreground">{formatPol(staking.stats.principal)} POL</strong>
              </div>
              <p className="text-xs leading-relaxed text-foreground/50">
                The smart contract segregates user principal from reward liquidity. Claims are executed on-chain and sent directly to your connected wallet address.
              </p>
            </div>
          </div>
        ) : null}

        {/* Tab 3: Withdraw Principal */}
        {activeTab === "withdraw" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <div>
                <span className="font-pixel text-[9px] text-sky">PRINCIPAL WITHDRAWAL</span>
                <h3 className="mt-2 text-2xl font-bold">Unstake Deposited POL</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                  Withdraw your deposited POL back to your wallet. Subject to the 30-day minimum lock cycle.
                </p>
              </div>

              {/* Cooldown Progress Status */}
              <div className="rounded-3xl border border-foreground/10 bg-background p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground/60">30-Day Lock Status</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isLockActive ? "bg-magma/15 text-magma" : "bg-mint/15 text-mint"}`}>
                    {isLockActive ? `${remainingLockDays} DAYS REMAINING` : "UNLOCKED & AVAILABLE"}
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold">
                  {formatPol(staking.stats.principal)} POL <span className="text-xs font-normal text-foreground/50">staked</span>
                </div>
                {isLockActive ? (
                  <p className="mt-2 text-xs leading-relaxed text-magma/80">
                    Your deposit was made on {new Date(depositTimestamp * 1000).toLocaleDateString()}. It will be fully unlocked on {new Date(unlockTimestamp * 1000).toLocaleDateString()}.
                  </p>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-mint">
                    Your 30-day lock cycle has completed. You can withdraw your full principal or a partial amount at any time.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-foreground">Amount to Withdraw (POL)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal" autoComplete="off" spellCheck={false} enterKeyHint="done" autoCapitalize="none"
                    placeholder="0.00"
                    disabled={isLockActive || staking.stats.principal <= 0n}
                    value={withdrawInput}
                    onChange={(e) => setWithdrawInput(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/15 bg-background px-4 py-3 pr-20 font-mono text-lg font-bold outline-none transition-colors focus:border-sky disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={isLockActive || staking.stats.principal <= 0n}
                    onClick={() => setWithdrawInput(formatEther(staking.stats.principal))}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-xl bg-foreground/10 px-2 py-1 text-xs font-bold text-foreground/60 hover:text-foreground"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={staking.isLoading || isLockActive || !withdrawInput || Number(withdrawInput) <= 0}
                onClick={() => void handleWithdraw()}
                className="cursor-pointer rounded-full bg-sky px-6 py-4 text-sm font-bold text-white shadow-lg shadow-sky/20 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 dark:text-ink"
              >
                {staking.isLoading ? "Processing Withdrawal..." : isLockActive ? `Locked (${remainingLockDays}d remaining)` : "Withdraw POL to Wallet"}
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-background p-6">
              <span className="font-pixel text-[9px] text-mint">SAFETY & EMERGENCY PROTOCOL</span>
              <p className="text-xs leading-relaxed text-foreground/70">
                <strong>Fund Safety Invariant:</strong> Even in the event of an emergency administrative contract pause, principal withdrawals remain fully executable by the depositor once the 30-day lock period has expired.
              </p>
              <div className="rounded-2xl bg-surface p-4 text-xs text-foreground/60">
                Deposited principal is strictly isolated in contract storage and is never re-hypothecated or used for speculative yield farming.
              </div>
            </div>
          </div>
        ) : null}

        {/* Tab 4: Protocol Economics */}
        {activeTab === "model" ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2 rounded-3xl border border-foreground/10 bg-background p-5">
              <span className="font-pixel text-[9px] text-mint">BASE PROTOCOL APY</span>
              <span className="text-2xl font-extrabold text-mint">2.80%</span>
              <p className="text-xs text-foreground/60">
                Sustainable base yield funded by the virtual sneaker economy and verified protocol revenue.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-3xl border border-foreground/10 bg-background p-5">
              <span className="font-pixel text-[9px] text-sky">RARITY-BASED BOOSTS</span>
              <span className="text-2xl font-extrabold text-sky">+0.5% – +1.8%</span>
              <p className="text-xs text-foreground/60">
                Each NFT tier gives a fixed APY boost: Common +0.5%, Rare +0.8%, Epic +1.5%, Mythic +1.8%. Lock NFTs manually in the vault.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-3xl border border-foreground/10 bg-background p-5">
              <span className="font-pixel text-[9px] text-magma">NFT VALUATION</span>
              <span className="text-2xl font-extrabold text-magma">On-chain</span>
              <p className="text-xs text-foreground/60">
                The SneakerAppraiser contract estimates each NFT&apos;s POL value based on rarity and tier, helping you decide whether to sell or stake.
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-3xl border border-foreground/10 bg-background p-5">
              <span className="font-pixel text-[9px] text-polygon-purple">HARD APY CEILING</span>
              <span className="text-2xl font-extrabold text-polygon-purple">8.00% MAX</span>
              <p className="text-xs text-foreground/60">
                Enforced protocol ceiling prevents inflationary hyper-dilution and guarantees solvency.
              </p>
            </div>
          </div>
        ) : null}

        {/* Feedback Notices */}
        {actionNotice ? <p className="mt-6 rounded-2xl bg-mint/15 px-4 py-3 text-xs font-semibold text-mint">{actionNotice}</p> : null}
        {actionError ? <p className="mt-6 rounded-2xl bg-magma/15 px-4 py-3 text-xs font-semibold text-magma">{actionError}</p> : null}
      </div>

      {/* Dedicated Sneaker NFT Boost Vault Section */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-pixel text-[9px] text-mint">SNEAKER NFT BOOST VAULT</span>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">Boost Your Yield with Sneaker NFTs</h3>
            <p className="mt-1 text-sm text-foreground/60">
              Lock your SneakerMint NFTs to amplify your POL staking yield from 2.80% up to 8.00% maximum APY. Each NFT shows its rarity-based boost and estimated POL value.
            </p>
          </div>
          <Link
            href="/mint"
            className="self-start rounded-full bg-foreground px-5 py-2.5 text-xs font-bold text-background transition-transform hover:scale-105"
          >
            Create New Sneaker NFT ↗
          </Link>
        </div>

        {/* Sneaker Cards Grid */}
        <div className="mt-8">
          {allOwnedSneakers.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {allOwnedSneakers.map((sneaker) => {
                const isLocked = staking.stats.stakedTokenIds.some((id) => id === sneaker.tokenId);
                const rarityObj = RARITIES[Number(sneaker.tier) % RARITIES.length];
                const appraisalData = appraisal.appraisals.get(sneaker.tokenId.toString());
                const estimatedPol = appraisalData?.estimatedValue ?? 0n;
                return (
                  <div
                    key={sneaker.tokenId.toString()}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border p-5 transition-[box-shadow,color,background-color,border-color,fill,stroke] duration-300 ${
                      isLocked
                        ? "border-mint/30 bg-mint/5 shadow-md shadow-mint/5"
                        : "border-foreground/10 bg-background hover:border-foreground/20 hover:shadow-lg"
                    }`}
                  >
                    <div>
                      {/* Badge / Status */}
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${rarityObj?.accent ?? "bg-foreground/10"}`}>
                          {rarityObj?.label ?? "Sneaker"} · Tier {sneaker.tier.toString()}
                        </span>
                        <span className={`font-pixel text-[9px] ${isLocked ? "text-mint" : "text-foreground/40"}`}>
                          {isLocked ? "● BOOSTING" : "IN WALLET"}
                        </span>
                      </div>

                      {/* Pixel Art / Visual */}
                      <div className="my-4 flex items-center justify-center rounded-2xl bg-surface/80 py-6">
                        <SneakerArtwork src={sneaker.artwork.src} alt={sneaker.artwork.alt} className="w-32" sizes="128px" />
                      </div>

                      {/* Info */}
                      <h4 className="font-bold">{sneaker.artwork.name ?? "Airen Sneaker"} · #{sneaker.tokenId.toString()}</h4>
                      <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
                        <span>Rarity Score:</span>
                        <span className="font-mono font-bold text-foreground">{sneaker.rarity.toString()}/100</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-foreground/60">
                        <span>APY Boost:</span>
                        <span className="font-mono font-bold text-mint">{rarityObj?.boostLabel ?? "+0.5% APY"}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-foreground/60">
                        <span>Est. Value:</span>
                        <span className="font-mono font-bold text-sky">
                          {appraisal.configured && estimatedPol > 0n ? `${formatPol(estimatedPol)} POL` : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-5 border-t border-foreground/10 pt-3">
                      {isLocked ? (
                        <button
                          type="button"
                          disabled={staking.isLoading}
                          onClick={() => void runAction(() => staking.unlockNFT(sneaker.tokenId), `NFT #${sneaker.tokenId} unlocked`)}
                          className="w-full cursor-pointer rounded-full border border-sky/30 bg-sky/10 py-2.5 text-xs font-bold text-sky transition-colors hover:bg-sky/20"
                        >
                          Unlock NFT (30d Cooldown)
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={staking.isLoading}
                          onClick={() => void runAction(() => staking.lockNFT(sneaker.tokenId), `NFT #${sneaker.tokenId} locked`)}
                          className="w-full cursor-pointer rounded-full bg-mint py-2.5 text-xs font-bold text-ink shadow-md shadow-mint/10 transition-transform hover:scale-[1.02]"
                        >
                          Lock to Boost APY ({rarityObj?.boostLabel ?? "+0.5%"})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-foreground/15 bg-background p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-mint/10 font-pixel text-mint">
                👟
              </div>
              <h4 className="text-lg font-bold">No Sneaker NFTs Found</h4>
              <p className="max-w-md text-xs leading-relaxed text-foreground/60">
                You don&apos;t have any Airen Sneaker NFTs in your wallet yet. Create a unique virtual sneaker with the AI studio to boost your staking APY (up to +1.8% per NFT) and get an on-chain POL valuation.
              </p>
              <Link
                href="/mint"
                className="rounded-full bg-mint px-6 py-3 text-xs font-bold text-ink shadow-md shadow-mint/20 transition-transform hover:scale-105"
              >
                Create Sneaker in AI Studio →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Live Recent Activity Feed (Subgraph) */}
      <div className="rounded-2xl border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
          <div>
            <span className="font-pixel text-[9px] text-mint">LIVE SUBGRAPH FEED</span>
            <h3 className="text-xl font-bold">Recent Staking Activity</h3>
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
                  <div className="flex size-8 items-center justify-center rounded-full bg-foreground/5 font-pixel text-xs text-mint">
                    ✦
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{activityLabel(act.label)}</p>
                    <p className="text-xs text-foreground/50">
                      {activityTime(act.timestamp)}
                      {act.tokenId ? ` · Sneaker NFT #${act.tokenId}` : ""}
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
              No recent activity recorded yet. Make a deposit or lock an NFT to see live updates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

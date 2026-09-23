"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { explorerTransactionUrl, NETWORK_LABEL, usePolygonWallet } from "@/components/Providers";
import { useProfile } from "@/hooks/useProfile";
import { useMintedSneakers } from "@/hooks/useMintedSneakers";
import { useOwnedSneakers } from "@/hooks/useOwnedSneakers";
import { useOwnedMods } from "@/hooks/useOwnedMods";
import { usePlayerProgress } from "@/hooks/usePlayerProgress";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import {
  isValidUsername,
  LEVEL_NAMES,
  levelProgress,
  MAX_LEVEL,
  USERNAME_MAX,
  USERNAME_MIN,
} from "@/lib/profile";
import { modEffectLabel, SLOTS } from "@/lib/mods";
import { RARITIES } from "@/lib/sneaker-nft";

const SNEAKER_MINT = process.env.NEXT_PUBLIC_SNEAKER_MINT_ADDRESS;
const SNEAKER_MODS = process.env.NEXT_PUBLIC_SNEAKER_MODS_ADDRESS;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function ProfileDashboard() {
  const wallet = usePolygonWallet();
  const owner = wallet.address ?? null;
  const { profile, avatarUrl, setUsername, setAvatarUpload, setAvatarNft, clearAvatar } = useProfile(owner);
  const { sneakers: minted } = useMintedSneakers(owner);
  const { sneakers: ownedSneakers } = useOwnedSneakers({
    owner,
    contractAddress: SNEAKER_MINT && isAddress(SNEAKER_MINT) ? (SNEAKER_MINT as Address) : null,
    publicClient: wallet.publicClient,
  });
  const { mods: ownedMods } = useOwnedMods({
    owner,
    contractAddress: SNEAKER_MODS && isAddress(SNEAKER_MODS) ? (SNEAKER_MODS as Address) : null,
    publicClient: wallet.publicClient,
  });
  const { activities } = useSubgraphActivity(owner);
  const { configured: progressConfigured, snapshot: chainProgress } = usePlayerProgress({
    owner,
    publicClient: wallet.publicClient,
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarTab, setAvatarTab] = useState<"upload" | "nft">("nft");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local XP estimate — used until the PlayerProgress contract is configured,
  // after which the on-chain `progressOf` snapshot is the source of truth.
  const xpEstimate = useMemo(
    () =>
      ownedSneakers.length * 100 +
      ownedMods.length * 40 +
      minted.length * 60 +
      activities.length * 30,
    [ownedSneakers.length, ownedMods.length, minted.length, activities.length],
  );
  const progress = useMemo(() => {
    if (progressConfigured && chainProgress) {
      const xp = Number(chainProgress.xp);
      const next = Number(chainProgress.nextLevelXp);
      const base = Number(chainProgress.currentLevelXp);
      return {
        level: chainProgress.level,
        current: xp,
        next: chainProgress.nextLevelXp === 0n ? null : next,
        pct:
          chainProgress.level >= MAX_LEVEL || chainProgress.nextLevelXp === 0n
            ? 100
            : Math.min(100, Math.round(((xp - base) / (next - base)) * 100)),
      };
    }
    return levelProgress(xpEstimate);
  }, [progressConfigured, chainProgress, xpEstimate]);
  const levelName = LEVEL_NAMES[progress.level - 1];

  const saveName = () => {
    if (!isValidUsername(nameDraft)) {
      setNameError(`Use ${USERNAME_MIN}–${USERNAME_MAX} characters.`);
      return;
    }
    setUsername(nameDraft);
    setEditingName(false);
    setNameError(null);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Select a valid image file.");
      return;
    }
    setAvatarError(null);
    try {
      await setAvatarUpload(file);
    } catch {
      setAvatarError("Could not process that image.");
    }
  };

  const stats = [
    { label: "veSneakers", value: ownedSneakers.length || minted.length, hint: "owned on-chain" },
    { label: "Mods & badges", value: ownedMods.length, hint: "in wallet" },
    { label: "Minted", value: minted.length, hint: "by this wallet" },
    { label: "Activity", value: activities.length, hint: "indexed events" },
  ];

  // Skill NFTs = passive slot-6 mods + consumable skill abilities (aux 4–6).
  const skills = useMemo(
    () =>
      ownedMods.filter(
        (m) => (m.traits.slot === 6 && !m.traits.consumable) || (m.traits.consumable && m.traits.aux >= 4 && m.traits.aux <= 6),
      ),
    [ownedMods],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Identity card */}
      <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile avatar"
                className="size-24 rounded-full border-2 border-mint/40 object-cover shadow-lg shadow-mint/10 sm:size-28"
              />
            ) : (
              <div className="flex size-24 items-center justify-center rounded-full border-2 border-dashed border-foreground/20 bg-background sm:size-28">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-10 text-foreground/30" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20.5a8 8 0 0 1 16 0" />
                </svg>
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 rounded-full border border-mint/30 bg-mint px-2 py-0.5 font-pixel text-[9px] text-ink">
              L{progress.level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                    inputMode="text"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={USERNAME_MAX}
                    placeholder="Your runner name"
                    className="min-h-11 flex-1 rounded-2xl border border-foreground/15 bg-background px-4 text-base font-bold outline-none transition-colors focus:border-mint"
                  />
                  <button type="button" onClick={saveName} className="min-h-11 cursor-pointer rounded-full bg-mint px-5 text-sm font-bold text-ink transition-transform active:scale-95">
                    Save
                  </button>
                  <button type="button" onClick={() => { setEditingName(false); setNameError(null); }} className="min-h-11 cursor-pointer rounded-full border border-foreground/15 px-5 text-sm font-semibold text-foreground/60 transition-colors hover:text-foreground">
                    Cancel
                  </button>
                </div>
                {nameError ? <p className="text-xs font-semibold text-magma">{nameError}</p> : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{profile.username}</h2>
                <button
                  type="button"
                  onClick={() => { setNameDraft(profile.username); setEditingName(true); }}
                  aria-label="Edit username"
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-foreground/15 text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground active:scale-95"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3.5 20.5 7 8.5 19H5v-3.5Z" />
                    <path d="m14.5 6 3.5 3.5" />
                  </svg>
                </button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {owner ? (
                <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 font-mono text-xs text-foreground/60">
                  {shortAddress(owner)}
                </span>
              ) : (
                <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs text-foreground/50">
                  Guest profile — connect a wallet
                </span>
              )}
              <span className="rounded-full border border-foreground/10 bg-background px-3 py-1 text-xs font-semibold text-foreground/60">
                {NETWORK_LABEL}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Level + stats */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="font-pixel text-[9px] text-mint">PLAYER LEVEL</span>
            <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-pixel text-[9px] text-mint">
              {levelName.toUpperCase()}
            </span>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="font-pixel text-4xl text-foreground">L{progress.level}</span>
            <span className="pb-1 text-sm text-foreground/55">
              {progress.next != null
                ? `${progress.current.toLocaleString()} / ${progress.next.toLocaleString()} XP`
                : `${progress.current.toLocaleString()} XP · max level`}
            </span>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky via-mint to-mint transition-all duration-700"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-foreground/55">
            XP comes from playing: owning veSneakers and mods, minting, marketplace trades,
            workshop actions, and staked POL. Levels unlock skill NFTs — the first copy of
            each skill is free to claim, extra copies are sold cheap in the marketplace.
          </p>
          {progressConfigured ? (
            <p className="mt-3 rounded-xl border border-mint/25 bg-mint/10 px-3 py-2 text-[11px] font-semibold text-mint">
              Verified on-chain — PlayerProgress computes this level from live protocol state.
            </p>
          ) : (
            <p className="mt-3 rounded-xl border border-sky/25 bg-sky/10 px-3 py-2 text-[11px] font-semibold text-sky">
              Estimated level — the on-chain PlayerProgress contract will verify XP for skill
              unlocks once deployed.
            </p>
          )}
        </section>

        <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
          <span className="font-pixel text-[9px] text-sky">STATS</span>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-background p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/45">{stat.label}</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">{stat.value}</p>
                <p className="text-[10px] text-foreground/40">{stat.hint}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Skills */}
      <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-pixel text-[9px] text-mint">SKILLS</span>
            <h3 className="mt-2 text-xl font-bold tracking-tight">Your skill NFTs</h3>
            <p className="mt-1 max-w-xl text-sm text-foreground/60">
              Level-gated skill NFTs — equip passive skills in the workshop Skill slot, or burn
              consumable skills for Overdrive, Stim packs, and Lucky repairs.
            </p>
          </div>
          <Link
            href="/badges"
            className="min-h-9 cursor-pointer rounded-full border border-mint/25 bg-mint/10 px-4 py-2 text-xs font-bold text-mint transition-colors hover:bg-mint/20"
          >
            Claim skills →
          </Link>
        </div>
        {skills.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((mod) => (
              <div
                key={mod.tokenId.toString()}
                className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-background p-4"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-mint/10 text-xl">
                  {mod.traits.consumable ? "⚡" : (SLOTS[mod.traits.slot]?.icon ?? "⭐")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    Skill #{mod.tokenId.toString()}
                    <span className="ml-2 rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] font-semibold uppercase text-foreground/50">
                      {mod.traits.consumable ? "Consumable" : "Passive"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-foreground/55">{modEffectLabel(mod.traits)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-foreground/15 bg-background p-6 text-center text-sm text-foreground/60">
            No skills yet — level up by playing, then claim your free skill NFT at /badges.
          </p>
        )}
      </section>

      {/* Avatar picker */}
      <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-pixel text-[9px] text-magma">AVATAR</span>
            <h3 className="mt-2 text-xl font-bold tracking-tight">Choose your look</h3>
            <p className="mt-1 text-sm text-foreground/60">
              Upload an image from your device or use the artwork of a sneaker you minted.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAvatarTab("nft")}
              className={`min-h-9 cursor-pointer rounded-full px-4 text-xs font-semibold transition-all active:scale-95 ${
                avatarTab === "nft" ? "bg-foreground text-background" : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              From my NFTs
            </button>
            <button
              type="button"
              onClick={() => setAvatarTab("upload")}
              className={`min-h-9 cursor-pointer rounded-full px-4 text-xs font-semibold transition-all active:scale-95 ${
                avatarTab === "upload" ? "bg-foreground text-background" : "border border-foreground/10 text-foreground/60 hover:text-foreground"
              }`}
            >
              Upload image
            </button>
          </div>
        </div>

        {avatarTab === "nft" ? (
          minted.length > 0 ? (
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {minted.map((sneaker) => {
                const selected = profile.avatarKind === "nft" && profile.avatarSneakerId === sneaker.id;
                return (
                  <button
                    key={sneaker.id}
                    type="button"
                    onClick={() => setAvatarNft(sneaker.id)}
                    aria-pressed={selected}
                    className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 transition-all active:scale-95 ${
                      selected ? "border-mint shadow-lg shadow-mint/15" : "border-transparent hover:border-foreground/25"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sneaker.imageDataUrl} alt={sneaker.name} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                    {selected ? (
                      <span className="absolute inset-x-0 bottom-0 bg-mint/90 py-1 text-center font-pixel text-[8px] text-ink">
                        AVATAR
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-foreground/15 bg-background p-6 text-center text-sm text-foreground/60">
              No minted sneakers yet — mint one at /mint and its artwork becomes an avatar option.
            </p>
          )
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-foreground/20 bg-background p-6 text-center transition-colors hover:border-mint hover:bg-mint/5"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8 text-foreground/40" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V6m0 0-4 4m4-4 4 4" />
                <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
              </svg>
              <span className="text-sm font-semibold">Upload a photo</span>
              <span className="text-xs text-foreground/45">Square-cropped to 256px · stays on this device</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void pickFile(e.target.files?.[0])}
            />
          </div>
        )}

        {avatarError ? <p className="mt-3 text-xs font-semibold text-magma">{avatarError}</p> : null}
        {profile.avatarKind !== "none" ? (
          <button
            type="button"
            onClick={clearAvatar}
            className="mt-4 min-h-9 cursor-pointer rounded-full border border-foreground/15 px-4 text-xs font-semibold text-foreground/60 transition-colors hover:border-magma/40 hover:text-magma active:scale-95"
          >
            Remove avatar
          </button>
        ) : null}
      </section>

      {/* Activity */}
      <section className="rounded-[2.5rem] border border-foreground/10 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-sky">RECENT ACTIVITY</span>
        <div className="mt-4 flex flex-col divide-y divide-foreground/10">
          {activities.length > 0 || minted.length > 0 ? (
            <>
              {activities.map((act) => (
                <div key={`${act.id}-${act.timestamp ?? "now"}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-foreground/5 font-pixel text-xs text-sky">✦</div>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {act.label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-foreground/50">
                        {act.timestamp
                          ? new Date(act.timestamp < 10_000_000_000 ? act.timestamp * 1000 : act.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
                          : "Recent"}
                        {act.amount ? ` · ${act.amount}` : ""}
                      </p>
                    </div>
                  </div>
                  {act.transactionHash ? (
                    <a href={explorerTransactionUrl(act.transactionHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-semibold text-sky hover:underline">
                      View on PolygonScan ↗
                    </a>
                  ) : null}
                </div>
              ))}
              {minted.slice(0, 5).map((sneaker) => (
                <div key={sneaker.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-mint/10 font-pixel text-xs text-mint">◆</div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Minted {sneaker.name}</p>
                      <p className="text-xs text-foreground/50">
                        {new Date(sneaker.mintedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        {" · "}
                        {RARITIES.find((r) => r.id === sneaker.rarity)?.label ?? sneaker.rarity}
                      </p>
                    </div>
                  </div>
                  {sneaker.transactionHash ? (
                    <a href={explorerTransactionUrl(sneaker.transactionHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-semibold text-sky hover:underline">
                      View on PolygonScan ↗
                    </a>
                  ) : null}
                </div>
              ))}
            </>
          ) : (
            <p className="py-8 text-center text-xs text-foreground/50">
              No activity yet — mint a sneaker, make a trade, or equip a mod to start your history.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

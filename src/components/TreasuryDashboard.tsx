"use client";

import { formatEther } from "viem";
import { explorerAccountUrl, usePolygonWallet } from "@/components/Providers";
import { useSubgraphActivity } from "@/hooks/useSubgraphActivity";
import { useTreasury } from "@/hooks/useTreasury";

/// ───────────────────────── Public treasury dashboard ───────────────────────
///
/// Every number here is read from the chain or from the contracts at render time.
/// Nothing is hardcoded and nothing is cached from a build.
///
/// The design decision worth stating: **the balance is not the headline.** Two
/// numbers matter more, and both are invisible on an explorer:
///
///   - fees the marketplace has accrued but not forwarded
///   - fees the splitter is holding but has not distributed
///
/// Marketplace revenue takes two steps to reach the treasury and only the first is
/// automatic-looking. A view that showed only the treasury balance would read
/// "0 POL" while real money sat one admin transaction away, and would be telling
/// the truth while giving the wrong impression.

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

/// Subgraph timestamps arrive as Unix seconds from most schemas but milliseconds
/// from some. Anything past the year 2286 in seconds is milliseconds.
function formatActivityTime(timestamp: number) {
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-foreground/8 bg-background px-5 py-4">
      <span className="font-pixel text-[9px] text-foreground/40">{label}</span>
      <span className={`font-mono text-xl font-bold ${accent ? "text-mint" : ""}`}>{value}</span>
      {hint ? <span className="text-[11px] leading-snug text-foreground/45">{hint}</span> : null}
    </div>
  );
}

export default function TreasuryDashboard() {
  const { treasury, polBalance, stables, pendingAtMarketplace, pendingAtSplitter, recipients, wiring, isLoading, error, refresh } =
    useTreasury();
  const activity = useSubgraphActivity(treasury);
  const { chainId } = usePolygonWallet();

  const pendingTotal = pendingAtMarketplace + pendingAtSplitter;
  const hasPending = pendingTotal > 0n;
  const misrouted = wiring.filter((row) => row.paysTo && treasury && row.paysTo.toLowerCase() !== treasury.toLowerCase());

  if (error) {
    return (
      <section className="rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <p className="rounded-xl bg-magma/10 px-4 py-3 text-sm text-magma">{error}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Address ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <span className="font-pixel text-[9px] text-foreground/40">TREASURY ADDRESS</span>
        {treasury ? (
          <a
            href={explorerAccountUrl(treasury)}
            target="_blank"
            rel="noreferrer"
            className="w-fit font-mono text-sm text-mint underline-offset-4 hover:underline"
          >
            {treasury}
          </a>
        ) : (
          <span className="font-mono text-sm text-foreground/50">not configured</span>
        )}
        <p className="max-w-2xl text-xs leading-relaxed text-foreground/55">
          Every protocol revenue stream pays here. The address is read from the deployment configuration and the
          destinations below are read from the contracts themselves, so this page cannot disagree with the chain.
        </p>
      </section>

      {/* ── Balance ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="font-pixel text-[10px] text-foreground/40">BALANCE</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="POL"
            value={isLoading ? "…" : `${Number(formatEther(polBalance)).toLocaleString("en-US", { maximumFractionDigits: 4 })}`}
          />
          {stables.map((token) => (
            <Stat key={token.label} label={token.label} value={isLoading ? "…" : Number(token.formatted).toFixed(4)} />
          ))}
          <Stat
            label="PENDING"
            value={isLoading ? "…" : Number(formatEther(pendingTotal)).toLocaleString("en-US", { maximumFractionDigits: 4 })}
            hint={hasPending ? "Earned, not yet moved" : "Nothing waiting"}
            accent={hasPending}
          />
        </div>
      </section>

      {/* ── Pending detail ──────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <h2 className="font-pixel text-[10px] text-foreground/40">EARNED BUT NOT RECEIVED</h2>
          <p className="max-w-2xl text-xs leading-relaxed text-foreground/55">
            Marketplace revenue takes two steps. The first is an admin transaction, so this money can sit here
            indefinitely while the balance above reads zero.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="MARKETPLACE"
            value={`${Number(formatEther(pendingAtMarketplace)).toLocaleString("en-US", { maximumFractionDigits: 4 })} POL`}
            hint="Accrued on sales. Needs an admin withdraw to reach the splitter."
          />
          <Stat
            label="SPLITTER"
            value={`${Number(formatEther(pendingAtSplitter)).toLocaleString("en-US", { maximumFractionDigits: 4 })} POL`}
            hint="Held in the splitter. Distribution is permissionless — anyone can trigger it."
          />
        </div>
      </section>

      {/* ── Wiring ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <h2 className="font-pixel text-[10px] text-foreground/40">WHERE THE MONEY GOES</h2>
        {misrouted.length > 0 ? (
          <p className="rounded-xl bg-magma/10 px-4 py-3 text-xs leading-relaxed text-magma">
            {misrouted.length} contract{misrouted.length === 1 ? "" : "s"} pay somewhere other than the treasury address
            above. That is either a stale configuration or a deliberate second destination — either way it should be
            verified with <span className="font-mono">scripts/treasury-audit.ts</span>.
          </p>
        ) : null}
        <div className="flex flex-col divide-y divide-foreground/8">
          {wiring.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-sm font-medium">{row.label}</span>
              <span className="font-mono text-[11px] text-foreground/50">
                {row.contract ? short(row.contract) : "not configured"} → {row.paysTo ? short(row.paysTo) : "—"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/45">
          Marketplace fees land in the FeeSplitter first, which is why that row shows the splitter rather than the
          treasury.
        </p>
      </section>

      {/* ── Split ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <h2 className="font-pixel text-[10px] text-foreground/40">FEE SPLIT</h2>
        {recipients.length === 0 ? (
          <p className="text-xs text-foreground/50">No recipients configured.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recipients.map((recipient) => (
              <div key={recipient.account} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={explorerAccountUrl(recipient.account)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-foreground/60 underline-offset-4 hover:text-mint hover:underline"
                  >
                    {recipient.account}
                  </a>
                  <span className="font-mono text-xs font-semibold">{(recipient.weightBps / 100).toFixed(2)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
                  <div className="h-full rounded-full bg-mint" style={{ width: `${recipient.weightBps / 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Movements ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-pixel text-[10px] text-foreground/40">RECENT MOVEMENT</h2>
          <button
            type="button"
            onClick={() => {
              void refresh();
              void activity.refresh();
            }}
            className="cursor-pointer rounded-full border border-foreground/10 px-3 py-1 font-pixel text-[9px] text-foreground/50 transition-colors hover:border-mint/50 hover:text-mint"
          >
            REFRESH
          </button>
        </div>
        {activity.isLoading ? (
          <p className="text-xs text-foreground/50">Loading…</p>
        ) : activity.activities.length === 0 ? (
          <p className="text-xs leading-relaxed text-foreground/50">
            Nothing to show. The activity feed comes from the subgraph, and the deployed schema has no
            address-indexed activity entities yet — so it returns empty for every address, not just this one. The
            balance and pending figures above are read directly from the chain and are unaffected.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-foreground/8">
            {activity.activities.slice(0, 12).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{item.label}</span>
                  <span className="font-mono text-[10px] text-foreground/45">
                    {item.kind}
                    {item.timestamp ? ` · ${formatActivityTime(item.timestamp)}` : ""}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs text-foreground/60">
                  {item.amount ? `${item.amount} POL` : item.tokenId ? `#${item.tokenId}` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-foreground/45">
          Movement is read from the subgraph, which indexes contract events. x402 payments settle as plain USDC
          transfers and do not emit one, so they appear in the balance rather than in this list.
        </p>      </section>

      {chainId !== null && chainId !== 137 ? (
        <p className="rounded-xl bg-magma/10 px-4 py-3 text-xs text-magma">
          Your wallet is on another network. The figures above are always read from Polygon mainnet.
        </p>
      ) : null}
    </div>
  );
}

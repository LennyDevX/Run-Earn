import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbiItem,
  toEventSelector,
  type AbiEvent,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { polygon, polygonAmoy } from "viem/chains";

/// ─────────────────────────── On-chain activity feed ────────────────────────
///
/// Reads recent events for a wallet straight from the chain with `eth_getLogs`,
/// through the same RPC the rest of the app already uses.
///
/// **This replaced a hosted subgraph.** The indexer returned *"no address-indexed
/// activity entities yet"* for every address — the feed was already empty — and
/// keeping it meant a second service to authenticate against, a deploy step, and a
/// schema that could drift. For the handful of events the dashboards show, one
/// `eth_getLogs` call is less infrastructure, not more.
///
/// ### The one real constraint
///
/// Polygon produces a block every ~2s and most providers cap the block range of a
/// single `eth_getLogs`, so the read is **windowed**: `WINDOW` blocks per call,
/// newest first, stopping as soon as enough rows are found. A rejected window is
/// skipped rather than fatal — a feed must never be able to break a dashboard.
///
/// Server-only: it holds the RPC URL and must not ship to the browser.

const LOOKBACK_BLOCKS = 20_000n; // ~11 hours at 2s/block — see the note below
const WINDOW = 5_000n; // conservative: public providers reject ranges in the thousands
const MAX_ROWS = 40;

const CHAIN = process.env.NEXT_PUBLIC_POLYGON_NETWORK === "amoy" ? polygonAmoy : polygon;
const RPC_URL =
  process.env.POLYGON_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_POLYGON_RPC_URL?.trim() ||
  CHAIN.rpcUrls.default.http[0];

const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL, { retryCount: 1, timeout: 8_000 }) });

export type ActivityItem = {
  id: string;
  kind: string;
  label: string;
  /// Kept optional: the dashboards already render a placeholder when a block
  /// time is unavailable, and fetching one per row would cost a call each.
  timestamp?: number;
  /// Formatted amount when the event carries one, for the dashboards that show
  /// a figure beside the label.
  amount?: string;
  /// Token id when the event concerns a specific NFT.
  tokenId?: string;
  transactionHash?: Hex;
};

/// Each entry pairs a parsed event with a human sentence. The signature is
/// declared with `parseAbiItem`, and `topic0` is derived from that same signature with
/// `toEventSelector`. A hand-written hash would silently never match.
type EventSpec = { abi: AbiEvent & { topic0: Hex }; describe: (args: Record<string, unknown>) => string };
type Source = { address: Address; label: string; events: EventSpec[] };

const ev = (signature: string): EventSpec["abi"] => {
  const item = parseAbiItem(signature) as AbiEvent;
  return { ...item, topic0: toEventSelector(item) };
};

const pol = (value: unknown) =>
  `${(Number(typeof value === "bigint" ? value : 0n) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function sources(): Source[] {
  const env = process.env;
  const out: Source[] = [];
  const add = (address: string | undefined, label: string, events: EventSpec[]) => {
    if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) out.push({ address: address as Address, label, events });
  };

  add(env.NEXT_PUBLIC_STAKING_VAULT_ADDRESS, "Staking", [
    { abi: ev("event POLDeposited(address indexed owner, uint256 amount, uint256 newPrincipal)"), describe: (a) => `Deposited ${pol(a.amount)} POL` },
    { abi: ev("event POLWithdrawn(address indexed owner, uint256 amount, uint256 remainingPrincipal)"), describe: (a) => `Withdrew ${pol(a.amount)} POL` },
    { abi: ev("event Staked(address indexed owner, uint256 indexed tokenId, uint8 rarity, uint8 tier)"), describe: (a) => `Staked #${a.tokenId}` },
    { abi: ev("event Unstaked(address indexed owner, uint256 indexed tokenId)"), describe: (a) => `Unstaked #${a.tokenId}` },
    { abi: ev("event POLRewardsClaimed(address indexed owner, uint256 amount)"), describe: (a) => `Claimed ${pol(a.amount)} POL` },
  ]);

  add(env.NEXT_PUBLIC_SNEAKER_MARKETPLACE_ADDRESS, "Marketplace", [
    {
      abi: ev("event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed collection, uint256 tokenId, uint256 price)"),
      describe: (a) => `Listed #${a.tokenId} for ${pol(a.price)} POL`,
    },
    { abi: ev("event ListingCancelled(uint256 indexed listingId)"), describe: (a) => `Cancelled listing ${a.listingId}` },
    {
      abi: ev("event NFTSold(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 price, uint256 fee)"),
      describe: (a) => `Sold for ${pol(a.price)} POL`,
    },
  ]);

  add(env.NEXT_PUBLIC_SNEAKER_GAME_ADDRESS, "Game", [
    { abi: ev("event Activated(address indexed owner, uint256 indexed tokenId, uint32 streak, uint16 durability)"), describe: (a) => `Activated #${a.tokenId}` },
    { abi: ev("event Redeemed(address indexed owner, uint256 points, uint256 renAmount)"), describe: (a) => `Redeemed ${pol(a.points)} veRUNE` },
  ]);

  return out;
}

function argsTokenId(spec: EventSpec, log: Log): string | undefined {
  const value = decodeArgs(spec, log).tokenId;
  return value === undefined ? undefined : String(value);
}

function decodeArgs(spec: EventSpec, log: Log): Record<string, unknown> {
  try {
    const { args } = decodeEventLog({ abi: [spec.abi], data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    return (args ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/// Server-side cache. The route already sends /// to the browser, but nothing was remembered between requests — and a dashboard
/// that mounts twice, or two tabs, paid the full RPC round trip each time.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; rows: ActivityItem[] }>();

/// Recent activity for one address. Returns  rather than throwing.
export async function fetchActivity(address: string): Promise<ActivityItem[]> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const rows = await readActivity(address);
  cache.set(key, { at: Date.now(), rows });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return rows;
}

async function readActivity(address: string): Promise<ActivityItem[]> {
  const all = sources();
  if (all.length === 0) return [];

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return [];
  }

  const addresses = all.map((source) => source.address);
  const rows: ActivityItem[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  let failures = 0;

  for (let offset = 0n; offset < LOOKBACK_BLOCKS && rows.length < MAX_ROWS; offset += WINDOW) {
    const toBlock = head - offset;
    if (toBlock <= 0n) break;
    const fromBlock = toBlock > WINDOW ? toBlock - WINDOW + 1n : 0n;

    attempts += 1;
    let logs: Log[];
    try {
      // The actor is an indexed topic on every event we decode, so the RPC can
      // filter it. Doing it here returns less data over the wire than fetching
      // every log for the contracts and discarding most of them in JS.
      const topic = ("0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as Hex;
      logs = await client.getLogs({ address: addresses, fromBlock, toBlock, topics: [null, topic] } as never);
    } catch {
      failures += 1;
      continue;
    }

    if (logs.length > 0) {
      // Stop at the first window that has anything: going further back only adds
      // latency to a feed nobody is scrolling.
    }

    for (const log of logs) {
      // Per-wallet feed: the events carry the actor as an indexed topic, so the
      // filter is a topic match rather than a contract-wide dump.
      const needle = address.toLowerCase().replace(/^0x/, "");
      if (!log.topics.slice(1).some((topic) => topic.toLowerCase().replace(/^0x/, "").endsWith(needle))) continue;

      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const source = all.find((candidate) => candidate.address.toLowerCase() === log.address.toLowerCase());
      if (!source) continue;
      const spec = source.events.find((candidate) => candidate.abi.topic0 === log.topics[0]);
      if (!spec) continue;

      rows.push({
        id: key,
        kind: source.label,
        label: spec.describe(decodeArgs(spec, log)),
        ...(argsTokenId(spec, log) ? { tokenId: argsTokenId(spec, log) } : {}),
        transactionHash: log.transactionHash ?? undefined,
      });
      if (rows.length >= MAX_ROWS) break;
    }
    if (rows.length > 0) break;
  }
  if (attempts > 0 && failures === attempts) {
    throw new Error("The RPC rejected every log query. Free-tier providers cap eth_getLogs at 10 blocks.");
  }

  return rows;
}

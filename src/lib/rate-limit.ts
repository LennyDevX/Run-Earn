import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/// ─────────────────────────── Rate limiting ─────────────────────────────────
///
/// Sliding-window limiter for the API routes. The endpoints here are the ones
/// that cost real money per call — Gemini generations and The Graph queries — so
/// the goal is to stop abuse, not to shape legitimate traffic.
///
/// ### Two backends, one interface
///
/// - **Redis** (`@upstash/ratelimit`) when the deployment provides credentials.
///   This is the real limiter: the window is shared across every serverless
///   instance, so the limit means what it says.
/// - **In-process memory** as a fallback. Used for local development with no
///   Redis configured, and as a second layer if Redis errors mid-request.
///
/// `Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
/// and also falls back to the Vercel KV integration's `KV_REST_API_URL` /
/// `KV_REST_API_TOKEN`, so either integration works with no code change.
///
/// ### Why a sliding window
///
/// A fixed window lets a caller burst 2× the limit across a boundary (all of
/// window A's budget at the end, then all of window B's at the start). Upstash's
/// `slidingWindow` removes that hole and does the bookkeeping in one atomic Lua
/// call, so concurrent requests cannot both slip through.
///
/// ### Failure policy
///
/// If Redis is unreachable the limiter **fails open** — it logs and falls back to
/// the in-process window rather than blocking every user because a dependency is
/// down. That is the right call for a throttle, but it means a Redis outage
/// degrades the limit to per-instance. The daily spend budget is the backstop for
/// the endpoints that cost money.

// ─────────────────────────── Backend selection ─────────────────────────────

function redisConfigured() {
  const upstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const vercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  return upstash || vercelKv;
}

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!redisConfigured()) return null;
  try {
    redisClient ??= Redis.fromEnv();
    return redisClient;
  } catch (error) {
    console.warn("[rate-limit] Redis client could not be created:", error);
    return null;
  }
}

/// One `Ratelimit` per (limit, window) pair — the constructor is not free and the
/// route table only ever asks for a handful of combinations.
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "airen:rl",
      // Analytics would add a write per request and nothing reads them.
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

// ─────────────────────────── In-process fallback ───────────────────────────

type Bucket = number[];

const memoryStore = new Map<string, Bucket>();

/// Hard cap on tracked keys so the fallback cannot itself become a memory leak
/// under a spoofed-header flood.
const MAX_TRACKED_KEYS = 5_000;
const SWEEP_EVERY = 500;
let callsSinceSweep = 0;

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Omit<RateLimitResult, "backend"> {
  const now = Date.now();
  const cutoff = now - windowMs;

  callsSinceSweep += 1;
  if (callsSinceSweep >= SWEEP_EVERY) {
    callsSinceSweep = 0;
    for (const [existingKey, hits] of memoryStore) {
      const live = hits.filter((timestamp) => timestamp > cutoff);
      if (live.length === 0) memoryStore.delete(existingKey);
      else memoryStore.set(existingKey, live);
    }
  }

  const hits = (memoryStore.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (hits.length >= limit) {
    const oldest = hits[0];
    memoryStore.set(key, hits);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  if (!memoryStore.has(key) && memoryStore.size >= MAX_TRACKED_KEYS) {
    const firstKey = memoryStore.keys().next().value;
    if (firstKey !== undefined) memoryStore.delete(firstKey);
  }
  memoryStore.set(key, hits);

  return { ok: true, remaining: Math.max(0, limit - hits.length), retryAfterSeconds: 0 };
}

// ─────────────────────────── Public interface ──────────────────────────────

export type RateLimitResult = {
  ok: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window frees up — the `Retry-After` value. */
  retryAfterSeconds: number;
  /** Which backend answered. Surfaced so routes can log and so tests can assert. */
  backend: "redis" | "memory";
};

/// Records a hit and reports whether the caller is still inside its budget.
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const limiter = getLimiter(limit, windowMs);
  if (limiter) {
    try {
      const result = await limiter.limit(key);
      return {
        ok: result.success,
        remaining: result.remaining,
        retryAfterSeconds: result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
        backend: "redis",
      };
    } catch (error) {
      // Fail open to the in-process window rather than blocking every user.
      console.warn("[rate-limit] Redis unavailable, falling back to memory:", error);
    }
  }

  return { ...memoryRateLimit(key, limit, windowMs), backend: "memory" };
}

/// Best-effort client identity.
///
/// `x-forwarded-for` is client-controllable unless a proxy rewrites it, so this
/// is a throttle key, never an authorization decision. On Vercel the platform
/// sets `x-real-ip`; elsewhere we fall back to the first forwarded hop.
export function clientKey(request: NextRequest, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = realIp ?? forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:${ip}`;
}

/// Standard 429 with the headers a client needs to back off correctly.
///
/// Returns `NextResponse` rather than a bare `Response` so every route can hand
/// the same type back to its callers — the x402 wrapper requires a
/// `Promise<NextResponse>` and a plain `Response` would not satisfy it.
export function tooManyRequests(result: RateLimitResult, message: string) {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

// ─────────────────────────── Daily spend budget ────────────────────────────

/// A global ceiling on the operations that cost money, independent of per-IP
/// limits. Per-IP throttling cannot stop a botnet spreading requests across
/// thousands of addresses; a shared daily cap can, because it does not care who
/// is asking.
///
/// Redis `INCR` is atomic, so concurrent instances cannot both read the same
/// count and each decide they are under budget.

const memoryBudget = new Map<string, number[]>();

export type BudgetResult = {
  ok: boolean;
  used: number;
  limit: number;
};

function memoryDailyBudget(name: string, limit: number): BudgetResult {
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const hits = (memoryBudget.get(name) ?? []).filter((timestamp) => timestamp > dayAgo);

  if (hits.length >= limit) {
    memoryBudget.set(name, hits);
    return { ok: false, used: hits.length, limit };
  }

  hits.push(now);
  memoryBudget.set(name, hits);
  return { ok: true, used: hits.length, limit };
}

/// Consumes one unit from `name`'s daily budget.
export async function consumeDailyBudget(name: string, limit: number): Promise<BudgetResult> {
  const client = getRedis();
  if (client) {
    try {
      // UTC day bucket, so the reset moment is the same for every instance.
      const day = new Date().toISOString().slice(0, 10);
      const key = `airen:budget:${name}:${day}`;
      const used = await client.incr(key);
      // Set the TTL only on the first hit of the day; a second `expire` would
      // keep extending it and the key would never roll over.
      if (used === 1) await client.expire(key, 172_800);
      return { ok: used <= limit, used, limit };
    } catch (error) {
      console.warn("[rate-limit] Redis budget unavailable, falling back to memory:", error);
    }
  }

  return memoryDailyBudget(name, limit);
}

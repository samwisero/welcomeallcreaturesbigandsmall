/**
 * rateLimit.ts  --  Per-IP rate limit, fixed-window per minute.
 *
 * In-process state is fine for a single Bun instance.  If we ever scale
 * horizontally, swap the Map for Redis.  Same algorithm; new backend.
 *
 * Window: each clock-minute is its own bucket.  When a client hits the
 * limit, we return how many seconds until the bucket resets.
 */

import { RATE_LIMIT_RPM } from "./config.ts";

interface Window {
  count: number;
  resetAt: number; // epoch seconds when this window expires
}

/** Per-IP rate-limit state.  Lazy so the map is empty on cold start. */
const _windows = new Map<string, Window>();

/** Garbage-collect buckets whose window has expired.  Cheap O(n) once a minute. */
const sweep = (): void => {
  const now = Math.floor(Date.now() / 1000);
  for (const [ip, w] of _windows) {
    if (w.resetAt <= now) _windows.delete(ip);
  }
};

export interface RateDecision {
  ok: boolean;
  remaining: number;
  resetIn: number; // seconds until window resets
}

export const checkRate = (ip: string, now: number = Date.now()): RateDecision => {
  const epoch = Math.floor(now / 1000);
  const bucket = _windows.get(ip);
  if (!bucket || bucket.resetAt <= epoch) {
    // First hit this minute (or new window).
    _windows.set(ip, { count: 1, resetAt: epoch + 60 });
    return { ok: true, remaining: RATE_LIMIT_RPM - 1, resetIn: 60 };
  }
  if (bucket.count >= RATE_LIMIT_RPM) {
    return { ok: false, remaining: 0, resetIn: Math.max(0, bucket.resetAt - epoch) };
  }
  bucket.count += 1;
  return {
    ok: true,
    remaining: RATE_LIMIT_RPM - bucket.count,
    resetIn: Math.max(0, bucket.resetAt - epoch),
  };
};

/** Extract the client IP.  Trusts X-Forwarded-For first hop if present, else socket. */
export const clientIp = (req: Request, fallback: string): string => {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return fallback;
};

// Periodic GC so the map doesn't grow forever.
setInterval(sweep, 60_000).unref?.();
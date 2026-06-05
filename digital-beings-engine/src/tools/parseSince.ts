/**
 * tools/parseSince.ts  --  Tolerant "since" parser shared by browse + review.
 *
 * Accepts:
 *   - undefined / null       -> null (no time filter)
 *   - integer epoch seconds  -> that number
 *   - numeric string         -> that number
 *   - "N seconds|minutes|hours|days|weeks ago"  -> now - N * unit
 *   - "5 day ago"            -> singular still works
 *
 * Returns null on garbage so callers can fall back to "no filter".
 */

const RELATIVE_RE =
  /^\s*(\d+)\s+(second|minute|hour|day|week)s?\s+ago\s*$/i;

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
};

export const parseSince = (since: string | number | null | undefined): number | null => {
  if (since === null || since === undefined) return null;
  if (typeof since === "number") return since;
  const s = String(since).trim();
  if (s.length === 0) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = RELATIVE_RE.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return Math.floor(Date.now() / 1000) - n * (UNIT_SECONDS[unit] ?? 0);
};

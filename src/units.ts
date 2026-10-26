// Exact matches first: mW (milliwatt) and MW (megawatt) differ only by case.
const EXACT: Record<string, number> = { W: 1, kW: 1000, mW: 0.001, MW: 1_000_000, GW: 1_000_000_000 };
const LOOSE: Record<string, number> = { w: 1, kw: 1000 };

/** Converts an entity state to watts; null when the state is not a number. */
export function toWatts(state: string | undefined, unit: string | undefined): number | null {
  if (state === undefined || state.trim() === '') return null;
  const value = Number(state);
  if (!Number.isFinite(value)) return null;
  const u = (unit ?? 'W').trim();
  const factor = EXACT[u] ?? LOOSE[u.toLowerCase()] ?? 1;
  return value * factor;
}

export function formatPower(w: number): string {
  const abs = Math.round(Math.abs(w));
  return abs < 1000 ? `${abs} W` : `${(abs / 1000).toFixed(1)} kW`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const MAX_DUR = 6;
const MIN_DUR = 0.75;
const REF_W = 10_000;

/**
 * Seconds for one dot to travel a line. Log-scaled against a fixed reference
 * and quantised to 0.25 s, so small sensor changes don't restart animations.
 */
export function dotDuration(w: number): number {
  if (w <= 0) return MAX_DUR;
  const ratio = Math.min(1, Math.log10(w + 1) / Math.log10(REF_W + 1));
  return Math.round((MAX_DUR - ratio * (MAX_DUR - MIN_DUR)) * 4) / 4;
}

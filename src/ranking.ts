export interface RankOptions {
  maxVisible: number;
  minPower: number;
  /** Per-consumer minimum that overrides minPower. */
  minPowerById?: Record<string, number>;
  marginPct: number;
  holdMs: number;
}

/**
 * Picks the top consumers, but only reorders once a significant change
 * (beyond the margin) has persisted for holdMs, so slots don't flicker.
 * Every condition (a swap, an entry, an exit) keeps its own timer.
 */
export class ConsumerRanker {
  private current: string[] | null = null;
  private pending = new Map<string, number>();

  constructor(private readonly opts: RankOptions) {}

  update(values: Record<string, number>, now: number): string[] {
    const { maxVisible, holdMs } = this.opts;
    const min = (id: string) => this.opts.minPowerById?.[id] ?? this.opts.minPower;
    const m = this.opts.marginPct / 100;
    const v = (id: string) => values[id] ?? 0;
    const on = (id: string) => v(id) > 0 && v(id) >= min(id);

    const target = Object.keys(values)
      .filter(on)
      .sort((a, b) => v(b) - v(a))
      .slice(0, maxVisible);

    if (this.current === null || holdMs <= 0) {
      this.current = target;
      return this.current;
    }

    const cur = this.current;
    const last = cur[cur.length - 1];
    const keys = new Set<string>();
    for (const id of cur) if (v(id) <= 0 || v(id) < min(id) * (1 - m)) keys.add(`leave:${id}`);
    for (const id of Object.keys(values)) {
      if (!cur.includes(id) && v(id) > 0 && v(id) >= min(id) * (1 + m)
        && (cur.length < maxVisible || v(id) > v(last) * (1 + m))) keys.add(`enter:${id}`);
    }
    cur.forEach((a, i) => cur.slice(i + 1).forEach((b) => {
      if (v(b) > v(a) * (1 + m)) keys.add(`swap:${b}>${a}`);
    }));

    for (const k of this.pending.keys()) if (!keys.has(k)) this.pending.delete(k);
    for (const k of keys) if (!this.pending.has(k)) this.pending.set(k, now);

    if ([...this.pending.values()].some((since) => now - since >= holdMs)) {
      this.current = target;
      this.pending.clear();
    }
    return this.current;
  }
}

import { describe, expect, it } from 'vitest';
import { ConsumerRanker } from '../src/ranking';

const S = 1000;
const mk = (o: Partial<ConstructorParameters<typeof ConsumerRanker>[0]> = {}) =>
  new ConsumerRanker({ maxVisible: 3, minPower: 5, marginPct: 10, holdMs: 30 * S, ...o });

describe('ConsumerRanker', () => {
  it('first call applies target immediately', () => {
    expect(mk().update({ a: 900, b: 600, c: 300, d: 100 }, 0)).toEqual(['a', 'b', 'c']);
  });

  it('ignores overtakes within margin', () => {
    const r = mk();
    r.update({ a: 900, b: 600, c: 300, d: 100 }, 0);
    expect(r.update({ a: 900, b: 950, c: 300, d: 100 }, 60 * S)).toEqual(['a', 'b', 'c']);
    expect(r.update({ a: 900, b: 950, c: 300, d: 100 }, 200 * S)).toEqual(['a', 'b', 'c']);
  });

  it('swaps after hold', () => {
    const r = mk();
    r.update({ a: 900, b: 600, c: 300, d: 100 }, 0);
    const v = { a: 900, b: 1000, c: 300, d: 100 };
    expect(r.update(v, 100 * S)).toEqual(['a', 'b', 'c']);
    expect(r.update(v, 110 * S)).toEqual(['a', 'b', 'c']);
    expect(r.update(v, 130 * S)).toEqual(['b', 'a', 'c']);
  });

  it('resets timer when condition breaks', () => {
    const r = mk();
    r.update({ a: 900, b: 600, c: 300 }, 0);
    r.update({ a: 900, b: 1000, c: 300 }, 200 * S);
    r.update({ a: 900, b: 950, c: 300 }, 210 * S);
    expect(r.update({ a: 900, b: 1000, c: 300 }, 220 * S)).toEqual(['a', 'b', 'c']);
    expect(r.update({ a: 900, b: 1000, c: 300 }, 245 * S)).toEqual(['a', 'b', 'c']);
    expect(r.update({ a: 900, b: 1000, c: 300 }, 250 * S)).toEqual(['b', 'a', 'c']);
  });

  it('new device enters the top after hold', () => {
    const r = mk();
    r.update({ a: 900, b: 600, c: 300, d: 100 }, 0);
    r.update({ a: 900, b: 600, c: 300, d: 400 }, 10 * S);
    expect(r.update({ a: 900, b: 600, c: 300, d: 400 }, 40 * S)).toEqual(['a', 'b', 'd']);
  });

  it('min_power hysteresis', () => {
    const r = mk();
    r.update({ a: 900, b: 600, c: 10 }, 0);
    r.update({ a: 900, b: 600, c: 4 }, 10 * S);
    expect(r.update({ a: 900, b: 600, c: 4 }, 40 * S)).toEqual(['a', 'b']);
    r.update({ a: 900, b: 600, c: 5.2 }, 50 * S);
    expect(r.update({ a: 900, b: 600, c: 5.2 }, 200 * S)).toEqual(['a', 'b']);
  });

  it('holdMs 0 follows target', () => {
    const r = mk({ holdMs: 0 });
    r.update({ a: 900, b: 600 }, 0);
    expect(r.update({ a: 900, b: 950 }, 1)).toEqual(['b', 'a']);
  });

  it('missing ids count as 0 and maxVisible caps', () => {
    const r = mk({ maxVisible: 2 });
    r.update({ a: 900, b: 600, c: 300 }, 0);
    expect(r.update({ a: 900, c: 300 }, 1)).toEqual(['a', 'b']);
    expect(r.update({ a: 900, c: 300 }, 20 * S)).toEqual(['a', 'b']);
    expect(r.update({ a: 900, c: 300 }, 30 * S + 1)).toEqual(['a', 'c']);
  });
});

describe('review fixes', () => {
  it('each condition has its own hold timer', () => {
    const r = mk({ maxVisible: 4 });
    r.update({ a: 1000, b: 900, c: 500, d: 450 }, 0);
    r.update({ a: 1000, b: 1200, c: 500, d: 450 }, 1 * S);
    expect(r.update({ a: 1000, b: 900, c: 500, d: 600 }, 25 * S)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.update({ a: 1000, b: 900, c: 500, d: 600 }, 31 * S)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.update({ a: 1000, b: 900, c: 500, d: 600 }, 55 * S)).toEqual(['a', 'b', 'd', 'c']);
  });
  it('never shows devices at 0 W even with min_power 0', () => {
    const r = mk({ minPower: 0, maxVisible: 6 });
    expect(r.update({ a: 0, b: 0, c: 50 }, 0)).toEqual(['c']);
    r.update({ a: 0, b: 0, c: 0 }, 1 * S);
    expect(r.update({ a: 0, b: 0, c: 0 }, 40 * S)).toEqual([]);
  });

  it('a per-device minimum overrides the global one', () => {
    const r = mk({ minPower: 100, minPowerById: { fridge: 500, router: 0 }, holdMs: 0 });
    expect(r.update({ fridge: 300, router: 8, tv: 150, lamp: 50 }, 0)).toEqual(['tv', 'router']);
    expect(r.update({ fridge: 600, router: 8, tv: 150, lamp: 50 }, 1)).toEqual(['fridge', 'tv', 'router']);
  });

  it('applies the hysteresis margin around the per-device minimum', () => {
    const r = mk({ minPower: 10, minPowerById: { fridge: 500 } });
    expect(r.update({ fridge: 600 }, 0)).toEqual(['fridge']);
    expect(r.update({ fridge: 470 }, 1 * S)).toEqual(['fridge']);
    expect(r.update({ fridge: 470 }, 40 * S)).toEqual(['fridge']);
    r.update({ fridge: 440 }, 41 * S);
    expect(r.update({ fridge: 440 }, 80 * S)).toEqual([]);
  });
});

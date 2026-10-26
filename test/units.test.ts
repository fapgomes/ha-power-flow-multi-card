import { describe, expect, it } from 'vitest';
import { formatPower, toWatts } from '../src/units';

describe('toWatts', () => {
  it('normalises units', () => {
    expect(toWatts('1.2', 'kW')).toBe(1200);
    expect(toWatts('350', 'W')).toBe(350);
    expect(toWatts('0.002', 'MW')).toBe(2000);
    expect(toWatts('350', undefined)).toBe(350);
    expect(toWatts('-0.5', 'kw')).toBe(-500);
  });
  it('returns null for non-numeric states', () => {
    expect(toWatts('unavailable', 'W')).toBeNull();
    expect(toWatts('unknown', 'W')).toBeNull();
    expect(toWatts(undefined, 'W')).toBeNull();
    expect(toWatts('', 'W')).toBeNull();
  });
});

describe('format', () => {
  it('formatPower', () => {
    expect(formatPower(320)).toBe('320 W');
    expect(formatPower(999.6)).toBe('1.0 kW');
    expect(formatPower(2504)).toBe('2.5 kW');
    expect(formatPower(-320)).toBe('320 W');
  });
});

describe('review fixes', () => {
  it('mW is milliwatt, MW megawatt', () => {
    expect(toWatts('500', 'mW')).toBe(0.5);
    expect(toWatts('1', 'MW')).toBe(1_000_000);
    expect(toWatts('1', 'GW')).toBe(1_000_000_000);
    expect(toWatts('2', 'KW')).toBe(2000);
  });
  it('truncate keeps short names and ellipsises long ones', async () => {
    const { truncate } = await import('../src/units');
    expect(truncate('TV', 9)).toBe('TV');
    expect(truncate('Micro-ondas', 9)).toBe('Micro-on…');
  });
  it('dotDuration is stable and monotonic', async () => {
    const { dotDuration } = await import('../src/units');
    expect(dotDuration(0)).toBe(6);
    expect(dotDuration(1000)).toBeLessThan(dotDuration(100));
    expect(dotDuration(20000)).toBe(0.75);
    // quantised to 0.25 s, so small changes don't alter the value
    expect(dotDuration(1000)).toBe(dotDuration(1010));
    expect((dotDuration(333) * 4) % 1).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { computeFlows, totalsFromReadings, type Totals } from '../src/flows';

const t = (p: Partial<Totals>): Totals => ({ solar: 0, gridImport: 0, gridExport: 0, batteryDischarge: 0, batteryCharge: 0, ...p });

describe('computeFlows', () => {
  it('solar charges battery, grid feeds home', () => {
    expect(computeFlows(t({ solar: 2500, gridImport: 320, batteryCharge: 610 }), null)).toEqual({
      solarToBattery: 610, solarToHome: 1890, gridToHome: 320, home: 2210,
      solarToGrid: 0, gridToBattery: 0, batteryToHome: 0, batteryToGrid: 0, lowCarbon: 0,
    });
  });
  it('solar exports', () => {
    expect(computeFlows(t({ solar: 3000, gridExport: 1000, batteryCharge: 500 }), null))
      .toMatchObject({ solarToBattery: 500, solarToGrid: 1000, solarToHome: 1500 });
  });
  it('battery exports', () => {
    expect(computeFlows(t({ batteryDischarge: 800, gridExport: 300 }), null))
      .toMatchObject({ batteryToGrid: 300, batteryToHome: 500 });
  });
  it('grid tops up battery', () => {
    expect(computeFlows(t({ batteryCharge: 400, solar: 100, gridImport: 1000 }), null))
      .toMatchObject({ solarToBattery: 100, gridToBattery: 300, gridToHome: 700 });
  });
  it('low carbon', () => {
    expect(computeFlows(t({ gridImport: 1000 }), 40).lowCarbon).toBe(600);
  });
  it('never negative on inconsistent sensors', () => {
    const f = computeFlows(t({ gridExport: 500 }), null);
    for (const v of Object.values(f)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('totalsFromReadings', () => {
  it('maps net battery and nulls', () => {
    const r = { gridImport: null, gridExport: 10, solarTotal: 100, batteryNet: -50 } as any;
    expect(totalsFromReadings(r)).toEqual({ solar: 100, gridImport: 0, gridExport: 10, batteryDischarge: 0, batteryCharge: 50 });
    expect(totalsFromReadings({ ...r, batteryNet: 70 }).batteryDischarge).toBe(70);
  });
});

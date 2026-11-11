import type { Readings } from './types';

export interface Totals { solar: number; gridImport: number; gridExport: number; batteryDischarge: number; batteryCharge: number }
export interface Flows {
  solarToHome: number; solarToBattery: number; solarToGrid: number; gridToHome: number;
  gridToBattery: number; batteryToHome: number; batteryToGrid: number; home: number; lowCarbon: number;
}

const pos = (x: number) => Math.max(0, x);

export function totalsFromReadings(r: Readings): Totals {
  const net = r.batteryNet ?? 0;
  return {
    solar: pos(r.solarTotal ?? 0),
    gridImport: pos(r.gridImport ?? 0),
    gridExport: pos(r.gridExport ?? 0),
    batteryDischarge: pos(net),
    batteryCharge: pos(-net),
  };
}

/**
 * Splits totals into node-to-node flows; individual sources are never attributed.
 * With batteryGrid false the battery neither charges from nor exports to the grid: whatever charge
 * solar does not cover and whatever export solar does not cover are left unattributed.
 */
export function computeFlows(t: Totals, fossilPct: number | null, batteryGrid = true): Flows {
  const solarToBattery = pos(Math.min(t.batteryCharge, t.solar));
  const gridToBattery = batteryGrid ? pos(t.batteryCharge - solarToBattery) : 0;
  const solarLeft = pos(t.solar - solarToBattery);
  const solarToGrid = pos(Math.min(t.gridExport, solarLeft));
  const batteryToGrid = batteryGrid ? pos(Math.min(t.gridExport - solarToGrid, t.batteryDischarge)) : 0;
  const solarToHome = pos(solarLeft - solarToGrid);
  const batteryToHome = pos(t.batteryDischarge - batteryToGrid);
  const gridToHome = pos(t.gridImport - gridToBattery);
  return {
    solarToHome, solarToBattery, solarToGrid, gridToHome, gridToBattery, batteryToHome, batteryToGrid,
    home: solarToHome + batteryToHome + gridToHome,
    lowCarbon: fossilPct === null ? 0 : pos(t.gridImport * (1 - fossilPct / 100)),
  };
}

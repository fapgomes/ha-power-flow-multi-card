import type { BankPower, CardConfig, HassLike, Readings } from './types';
import { toWatts } from './units';

export const DEFAULT_CONSUMER_COLOR = '#9e9e9e';

export function normalizeConfig(config: CardConfig): CardConfig {
  if (!config?.grid?.entity) throw new Error('grid.entity is required');
  config.solar?.sources?.forEach((s, i) => {
    if (!s?.entity) throw new Error(`solar.sources[${i}].entity is required`);
  });
  config.battery?.banks?.forEach((b, i) => {
    const p = b?.power;
    if (!p || (typeof p !== 'string' && !(p.charge && p.discharge))) throw new Error(`battery.banks[${i}].power is required`);
    if (!b.soc) throw new Error(`battery.banks[${i}].soc is required`);
  });
  config.consumers?.devices?.forEach((d, i) => {
    if (!d?.entity) throw new Error(`consumers.devices[${i}].entity is required`);
  });
  if (!config.consumers) return config;
  const columns = Math.max(1, Math.floor(config.consumers.columns ?? 2));
  const capacity = 2 + 3 * columns;
  return {
    ...config,
    consumers: {
      ...config.consumers,
      columns,
      max_visible: Math.max(0, Math.min(config.consumers.max_visible ?? 6, capacity)),
      min_power: config.consumers.min_power ?? 0,
      sort_margin: config.consumers.sort_margin ?? 10,
      sort_hold: config.consumers.sort_hold ?? 30,
      devices: config.consumers.devices ?? [],
    },
  };
}

function watts(hass: HassLike, entity: string | undefined): number | null {
  if (!entity) return null;
  const s = hass.states[entity];
  return s ? toWatts(s.state, s.attributes?.unit_of_measurement) : null;
}

function number(hass: HassLike, entity: string | undefined): number | null {
  if (!entity) return null;
  const s = hass.states[entity];
  if (!s || s.state.trim() === '') return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
}

function friendlyName(hass: HassLike, entity: string): string {
  return hass.states[entity]?.attributes?.friendly_name ?? entity;
}

/** Signed reading: positive = import/discharge, negative = export/charge. */
function signed(hass: HassLike, e: string | BankPower, invert = false): number | null {
  let w: number | null;
  if (typeof e === 'string') {
    w = watts(hass, e);
  } else {
    const p = watts(hass, e.discharge);
    const n = watts(hass, e.charge);
    w = p === null && n === null ? null : (p ?? 0) - (n ?? 0);
  }
  return w === null ? null : invert ? -w : w;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export function readState(hass: HassLike, config: CardConfig): Readings {
  let gridImport: number | null;
  let gridExport: number | null;
  const g = config.grid.entity;
  if (typeof g === 'string') {
    const grid = signed(hass, g, config.grid.invert);
    gridImport = grid === null ? null : Math.max(grid, 0);
    gridExport = grid === null ? null : Math.max(-grid, 0);
  } else {
    [gridImport, gridExport] = [watts(hass, g.consumption), watts(hass, g.production)];
    if (config.grid.invert) [gridImport, gridExport] = [gridExport, gridImport];
  }

  const solarSources = (config.solar?.sources ?? []).map((s) => ({
    entity: s.entity,
    name: s.name ?? friendlyName(hass, s.entity),
    w: watts(hass, s.entity),
  }));
  let solarTotal: number | null = null;
  if (config.solar) {
    solarTotal = config.solar.entity ? watts(hass, config.solar.entity) : sum(solarSources.map((s) => s.w));
  }

  const bankCfgs = config.battery?.banks ?? [];
  const banks = bankCfgs.map((b) => {
    const entity = typeof b.power === 'string' ? b.power : b.power.discharge;
    return { entity, name: b.name ?? friendlyName(hass, entity), w: signed(hass, b.power, b.invert), soc: number(hass, b.soc) };
  });
  const batteryNet = banks.length ? sum(banks.map((b) => b.w)) : null;
  let batterySoc: number | null = null;
  const withSoc = banks.map((b, i) => ({ soc: b.soc, cap: bankCfgs[i].capacity })).filter((b) => b.soc !== null);
  if (withSoc.length) {
    const weighted = bankCfgs.every((b) => b.capacity && b.capacity > 0);
    const totalCap = weighted ? sum(withSoc.map((b) => b.cap!)) : withSoc.length;
    batterySoc = sum(withSoc.map((b) => b.soc! * (weighted ? b.cap! : 1))) / totalCap;
  }

  return {
    gridImport,
    gridExport,
    fossilPct: number(hass, config.low_carbon?.entity),
    solarSources,
    solarTotal,
    banks,
    batteryNet,
    batterySoc,
    homeEntityW: watts(hass, config.home?.entity),
    consumers: (config.consumers?.devices ?? []).map((d) => ({
      id: d.entity,
      entity: d.entity,
      name: d.name ?? friendlyName(hass, d.entity),
      color: d.color ?? DEFAULT_CONSUMER_COLOR,
      icon: d.icon,
      w: watts(hass, d.entity),
    })),
  };
}

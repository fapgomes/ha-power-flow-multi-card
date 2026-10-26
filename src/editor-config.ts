import type { BankConfig, CardConfig, DeviceConfig } from './types';

/** Pure conversions between the YAML config and the flat data each ha-form edits. */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string | undefined): Rgb | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: number[] | undefined): string | undefined {
  if (!rgb || rgb.length !== 3) return undefined;
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function moveItem<T>(list: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function removeItem<T>(list: T[], i: number): T[] {
  return list.filter((_, k) => k !== i);
}

export function replaceItem<T>(list: T[], i: number, item: T): T[] {
  return list.map((v, k) => (k === i ? item : v));
}

/** Drops optional keys that are empty, so the YAML stays as short as the user wrote it. */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false),
  ) as Partial<T>;
}

export type PowerMode = 'single' | 'split';

export interface GridForm { mode: PowerMode; entity?: string; consumption?: string; production?: string; invert?: boolean }

export function gridToForm(grid: CardConfig['grid'] | undefined): GridForm {
  const e = grid?.entity;
  const base = typeof e === 'object'
    ? { mode: 'split' as const, consumption: e.consumption, production: e.production }
    : { mode: 'single' as const, entity: e };
  return compact({ ...base, invert: grid?.invert }) as GridForm;
}

export function gridFromForm(f: GridForm): CardConfig['grid'] {
  const entity = f.mode === 'split'
    ? { consumption: f.consumption ?? '', production: f.production ?? '' }
    : f.entity ?? '';
  return { entity, ...compact({ invert: f.invert }) };
}

export interface BankForm {
  mode: PowerMode; power?: string; charge?: string; discharge?: string; soc?: string;
  name?: string; capacity?: number; invert?: boolean;
}

export function bankToForm(b: BankConfig): BankForm {
  const p = b.power;
  const power = typeof p === 'object'
    ? { mode: 'split' as const, charge: p.charge, discharge: p.discharge }
    : { mode: 'single' as const, power: p };
  return compact({ ...power, soc: b.soc, name: b.name, capacity: b.capacity, invert: b.invert }) as BankForm;
}

export function bankFromForm(f: BankForm): BankConfig {
  const power = f.mode === 'split' ? { charge: f.charge ?? '', discharge: f.discharge ?? '' } : f.power ?? '';
  return { power, soc: f.soc ?? '', ...compact({ name: f.name, capacity: f.capacity, invert: f.invert }) };
}

export interface DeviceForm { entity?: string; name?: string; icon?: string; color?: Rgb; min_power?: number; parent?: string }

export function deviceToForm(d: DeviceConfig): DeviceForm {
  return compact({ entity: d.entity, name: d.name, color: hexToRgb(d.color), icon: d.icon, min_power: d.min_power, parent: d.parent }) as DeviceForm;
}

export function deviceFromForm(f: DeviceForm): DeviceConfig {
  return { entity: f.entity ?? '', ...compact({ name: f.name, color: rgbToHex(f.color), icon: f.icon, min_power: f.min_power, parent: f.parent }) };
}

/** Returns a copy of the config with one top-level section replaced, or removed when undefined. */
export function withSection<K extends keyof CardConfig>(config: CardConfig, key: K, value: CardConfig[K] | undefined): CardConfig {
  const out = { ...config };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out;
}

export type PowerEntity = string | { consumption: string; production: string };
export type BankPower = string | { charge: string; discharge: string };

export interface SolarSourceConfig { entity: string; name?: string; icon?: string }
export interface BankConfig { power: BankPower; soc: string; name?: string; capacity?: number; invert?: boolean }
export interface DeviceConfig { entity: string; name?: string; color?: string; icon?: string; min_power?: number; parent?: string }

export interface ConsumersConfig {
  columns?: number;
  max_visible?: number;
  min_power?: number;
  sort_margin?: number;
  sort_hold?: number;
  /** Name inside full-size circles (default true). */
  name_inside?: boolean;
  /** Child share as a percentage on each child pill (default true). */
  show_percent?: boolean;
  devices: DeviceConfig[];
}

export interface CardConfig {
  type: string;
  grid: { entity: PowerEntity; invert?: boolean };
  low_carbon?: { entity: string };
  solar?: { entity?: string; sources: SolarSourceConfig[]; show_idle_sources?: boolean; name_inside?: boolean };
  battery?: { banks: BankConfig[]; name_inside?: boolean };
  home?: { entity?: string };
  consumers?: ConsumersConfig;
}

export interface HassEntity { state: string; attributes: Record<string, any> }
export interface HassLike { states: Record<string, HassEntity> }

export interface Readings {
  gridImport: number | null;
  gridExport: number | null;
  fossilPct: number | null;
  solarSources: { entity: string; name: string; w: number | null }[];
  solarTotal: number | null;
  /** w: + discharge, − charge */
  banks: { entity: string; name: string; w: number | null; soc: number | null }[];
  batteryNet: number | null;
  batterySoc: number | null;
  homeEntityW: number | null;
  consumers: { id: string; entity: string; name: string; color: string; icon?: string; w: number | null; parent?: string }[];
}

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
  /** Consumer names (default true); when false a name only shows while hovering its circle. */
  show_name?: boolean;
  /** Name inside full-size circles (default true). */
  name_inside?: boolean;
  /** Child share as a percentage on each child pill (default true). */
  show_percent?: boolean;
  devices: DeviceConfig[];
}

export interface CardConfig {
  type: string;
  /** horizontal (default): consumers right of home; vertical: grid on top, consumers in rows below home. */
  layout?: 'horizontal' | 'vertical';
  grid: { entity: PowerEntity; invert?: boolean; show_name?: boolean; name_inside?: boolean };
  low_carbon?: { entity: string };
  solar?: { entity?: string; sources: SolarSourceConfig[]; show_idle_sources?: boolean; name_inside?: boolean; show_name?: boolean };
  battery?: { banks: BankConfig[]; name_inside?: boolean; show_name?: boolean };
  /** show_consumers: inner ring with the visible consumers' shares of home (default true). */
  home?: { entity?: string; show_consumers?: boolean };
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

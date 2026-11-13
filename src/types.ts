export type PowerEntity = string | { consumption: string; production: string };
export type BankPower = string | { charge: string; discharge: string };

export interface SolarSourceConfig { entity: string; name?: string; icon?: string }
/** capacity: kWh, or an entity that reports it (Wh, kWh or MWh). */
export interface BankConfig extends ActionsConfig { power: BankPower; soc: string; name?: string; capacity?: number | string; invert?: boolean }
export interface DeviceConfig { entity: string; name?: string; color?: string; icon?: string; min_power?: number; parent?: string }

/** What a tap, long press or double tap does; a subset of the Home Assistant actions. */
export type ActionConfig =
  | { action: 'more-info'; entity?: string }
  | { action: 'navigate'; navigation_path: string }
  | { action: 'url'; url_path: string }
  | { action: 'none' };

/** The actions of a battery circle or of one of its bank pills. */
export interface ActionsConfig { tap_action?: ActionConfig; hold_action?: ActionConfig; double_tap_action?: ActionConfig }

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
  /** All text in bold (default false). */
  bold?: boolean;
  grid: { entity: PowerEntity; invert?: boolean; show_name?: boolean; name_inside?: boolean };
  low_carbon?: { entity: string; show_name?: boolean; name_inside?: boolean };
  solar?: { entity?: string; sources: SolarSourceConfig[]; show_idle_sources?: boolean; name_inside?: boolean; show_name?: boolean };
  /**
   * grid_link: flows between battery and grid (default true); false drops them and their line.
   * tap_action: what a tap on the battery circle does (default: more-info of the first bank's power).
   * hold_action, double_tap_action: what a long press and a double tap do (default nothing).
   * Each bank takes the same three for its own pill, defaulting to that bank's power and state of charge.
   */
  battery?: ActionsConfig & { banks: BankConfig[]; name_inside?: boolean; show_name?: boolean; grid_link?: boolean };
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

import { html, LitElement, nothing, svg, type PropertyValues, type SVGTemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { computeFlows, totalsFromReadings, type Flows } from './flows';
import {
  BANK_PILLS_Y, consumerPath, consumerRoute, consumerSlots, modeFor, NODES, pillRow, PILL_R, PILLS_MAX_WIDTH, placeSatellite,
  SOLAR_PILLS_Y, viewBox, type Circle, type Obstacles, type Pt, type Rect, type Slot,
} from './layout';
import './editor';
import { ConsumerRanker } from './ranking';
import { normalizeConfig, readState } from './readings';
import { COLORS, styles } from './styles';
import type { CardConfig, HassLike, Readings } from './types';
import { dotDuration, formatPower, truncate } from './units';

/** Below this total (W) solar counts as idle and its source pills are hidden. */
const IDLE_SOLAR_W = 10;

const DASH = '—';

/** "Solar" and "Battery" names when outside, tucked against the circle's upper-right / lower-right edge. */
const SOLAR_LABEL = { x: NODES.solar.x + NODES.solar.r * 0.84, y: NODES.solar.y - NODES.solar.r * 0.69 };
const BATTERY_LABEL = { x: NODES.battery.x + NODES.battery.r * 0.84, y: NODES.battery.y + NODES.battery.r * 0.95 };

/** Point on the edge of a circle, in the direction (dx, dy) from its centre. */
function edge(c: Circle, dx: number, dy: number): Pt {
  const d = Math.hypot(dx, dy);
  return { x: Math.round((c.x + (dx / d) * c.r) * 10) / 10, y: Math.round((c.y + (dy / d) * c.r) * 10) / 10 };
}
/** Where the diagonal flows leave the solar and battery circles. */
const SOLAR_OUT = { home: edge(NODES.solar, 10, 30), grid: edge(NODES.solar, -10, 30) };
const BATTERY_OUT = { home: edge(NODES.battery, 10, -30), grid: edge(NODES.battery, -10, -30) };

/** Where the horizontal flows meet the grid's right edge and home's left edge. */
const GRID_X = NODES.grid.x + NODES.grid.r;
const HOME_X = NODES.home.x - NODES.home.r;

/** Rough shape of the fixed flows, so child pills stay off them. */
const FIXED_ROUTES: Pt[][] = [
  [{ x: 50, y: 95 }, { x: 50, y: 210 }],
  [{ x: GRID_X, y: 210 }, { x: HOME_X, y: 210 }],
  [SOLAR_OUT.home, { x: 205, y: 190 }, { x: HOME_X, y: 205 }],
  [SOLAR_OUT.grid, { x: 135, y: 190 }, { x: GRID_X, y: 205 }],
  [BATTERY_OUT.home, { x: 205, y: 225 }, { x: HOME_X, y: 215 }],
  [{ x: GRID_X, y: 215 }, { x: 140, y: 225 }, BATTERY_OUT.grid],
  [{ x: 170, y: NODES.solar.y + NODES.solar.r }, { x: 170, y: NODES.battery.y - NODES.battery.r }],
];

type NameMode = 'inside' | 'outside' | 'none';
const nameMode = (o?: { show_name?: boolean; name_inside?: boolean }): NameMode =>
  o?.show_name === false ? 'none' : o?.name_inside === false ? 'outside' : 'inside';

/** mdi battery icon matching the state of charge, in steps of 10 %. */
function batteryIcon(soc: number | null): string {
  if (soc === null) return 'mdi:battery-unknown';
  const step = Math.round(Math.max(0, Math.min(100, soc)) / 10) * 10;
  return step >= 100 ? 'mdi:battery' : step <= 0 ? 'mdi:battery-outline' : `mdi:battery-${step}`;
}

function segments(route: Pt[]): Obstacles['segments'] {
  return route.slice(1).map((p, i) => ({ x0: route[i].x, y0: route[i].y, x1: p.x, y1: p.y }));
}

let instanceCounter = 0;

interface Line { text: string; color?: string; size?: number }

const NAME_COLOR = 'var(--secondary-text-color)';
/** Width (viewBox units) a name may take inside a full-size consumer circle; longer names get a smaller font. */
const CONSUMER_NAME_WIDTH = 50;
/** A name written inside its circle, under the value. */
const nameLine = (text: string, size = 8): Line => ({ text, size, color: NAME_COLOR });

export class PowerFlowMultiCard extends LitElement {
  static styles = styles;

  @property({ attribute: false }) hass?: HassLike;
  @state() private config?: CardConfig;

  private ranker?: ConsumerRanker;
  private visible: string[] = [];
  private readonly uid = `pfmc${++instanceCounter}`;
  /** Label boxes drawn in the current render, so child pills can avoid them. */
  private labelRects: Rect[] = [];

  static getConfigElement(): HTMLElement {
    return document.createElement('power-flow-multi-card-editor');
  }

  /** Picks a power sensor (preferably the grid's) so the card picker can show a preview. */
  static getStubConfig(hass?: HassLike): CardConfig {
    const power = Object.entries(hass?.states ?? {})
      .filter(([id, s]) => id.startsWith('sensor.') && s.attributes?.device_class === 'power')
      .map(([id]) => id);
    const grid = power.find((id) => /grid|rede/.test(id)) ?? power[0] ?? 'sensor.grid_power';
    return { type: 'custom:power-flow-multi-card', grid: { entity: grid } };
  }

  setConfig(config: CardConfig): void {
    const c = normalizeConfig(config);
    this.config = c;
    const k = c.consumers;
    this.ranker = k
      ? new ConsumerRanker({
        maxVisible: k.max_visible!, minPower: k.min_power!, marginPct: k.sort_margin!, holdMs: k.sort_hold! * 1000,
        minPowerById: Object.fromEntries(k.devices.filter((d) => d.min_power !== undefined).map((d) => [d.entity, d.min_power!])),
      })
      : undefined;
  }

  getCardSize(): number {
    return 5;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!this.hass || !this.config || !this.ranker || !(changed.has('hass') || changed.has('config'))) return;
    const values: Record<string, number> = {};
    // Unavailable consumers are left out, so they never take a slot.
    // Children hang off their parent and never take a slot of their own.
    for (const c of readState(this.hass, this.config).consumers) if (c.w !== null && !c.parent) values[c.id] = c.w;
    this.visible = this.ranker.update(values, Date.now());
  }

  private moreInfo(entityId: string | undefined): void {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  /** A path plus, when w > 0, an animated dot along it. */
  private flow(name: string, d: string, color: string, w: number, opts: { reverse?: boolean; kind?: string; r?: number } = {}): SVGTemplateResult {
    const id = `${this.uid}-${name}`;
    const dot = w > 0
      ? svg`<circle data-dot=${name} r=${opts.r ?? 3} fill=${color}>
          <animateMotion dur="${dotDuration(w)}s" repeatCount="indefinite"
            keyPoints=${opts.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear">
            <mpath href="#${id}"></mpath>
          </animateMotion>
        </circle>`
      : nothing;
    return svg`<path id=${id} class="flow" data-flow=${opts.kind ?? name} stroke=${color} d=${d}></path>${dot}`;
  }

  /**
   * An icon with text lines over and under it (one font size per line), the whole group centred
   * vertically in the circle.
   */
  private static iconLayout(c: Circle, above: number[], below: number[], scale = 0.55): { iconY: number; size: number; baselines: number[] } {
    const size = c.r * scale;
    const gap = c.r * 0.08;
    // Offsets of each baseline from the top of its block: cap height for the first, line height after.
    const offsets = (sizes: number[]) => sizes.reduce<number[]>((acc, fs, i) => [...acc, i ? acc[i - 1] + fs * 1.25 : fs * 0.72], []);
    const block = (sizes: number[]) => (sizes.length ? offsets(sizes)[sizes.length - 1] + gap : 0);
    const top = c.y - (block(above) + size + block(below)) / 2;
    const iconY = top + block(above);
    const baselines = [
      ...offsets(above).map((o) => top + o),
      ...offsets(below).map((o) => iconY + size + gap + o),
    ];
    return { iconY, size, baselines };
  }

  private icon(c: Circle, icon: string, color: string | undefined, layout: { iconY: number; size: number }): SVGTemplateResult {
    const { iconY, size: s } = layout;
    return svg`<foreignObject x=${c.x - s / 2} y=${iconY} width=${s} height=${s}>
      ${html`<ha-icon .icon=${icon} style=${color ? `color:${color}` : ''}></ha-icon>`}
    </foreignObject>`;
  }

  private node(
    kind: string, entity: string | undefined, c: Circle, color: string, lines: Line[],
    opts: {
      label?: string; labelSize?: number; labelBelow?: boolean; icon?: string; iconColor?: string; iconScale?: number;
      /** How many of the lines go above the icon (default 0: icon on top). */
      linesAboveIcon?: number; title?: string; fontSize?: number; strokeWidth?: number;
    } = {},
  ): SVGTemplateResult {
    const fs = opts.fontSize ?? 10;
    const withIcon = !!opts.icon;
    const lh = fs * 1.25;
    const above = Math.min(opts.linesAboveIcon ?? 0, lines.length);
    const sizes = lines.map((l) => l.size ?? fs);
    const layout = withIcon ? PowerFlowMultiCard.iconLayout(c, sizes.slice(0, above), sizes.slice(above), opts.iconScale) : undefined;
    const lineY = (i: number) => (layout ? layout.baselines[i] : c.y - ((lines.length - 1) * lh) / 2 + fs * 0.35 + i * lh);
    const labelY = opts.labelBelow ? c.y + c.r + 12 : c.y - c.r - 6;
    if (opts.label) {
      const size = opts.labelSize ?? 10;
      const half = (opts.label.length * size * 0.55) / 2;
      this.labelRects.push({ x0: c.x - half, y0: labelY - size, x1: c.x + half, y1: labelY + 2 });
    }
    return svg`<g data-node=${kind} @click=${() => this.moreInfo(entity)}>
      <title>${opts.title ?? opts.label ?? entity ?? kind}</title>
      <circle class="bg" cx=${c.x} cy=${c.y} r=${c.r} stroke=${color} stroke-width=${opts.strokeWidth ?? 2}></circle>
      ${layout ? this.icon(c, opts.icon!, opts.iconColor ?? color, layout) : nothing}
      ${lines.map((l, i) => svg`<text class="value" x=${c.x} y=${lineY(i)} font-size=${l.size ?? fs}
          style=${l.color ? `fill:${l.color}` : ''}>${l.text}</text>`)}
      ${opts.label ? svg`<text class="label" x=${c.x} y=${labelY} style=${opts.labelSize ? `font-size:${opts.labelSize}px` : ''}>${opts.label}</text>` : nothing}
    </g>`;
  }

  private homeRing(f: Flows): SVGTemplateResult {
    const h = NODES.home;
    const circ = 2 * Math.PI * h.r;
    const total = f.solarToHome + f.batteryToHome + f.gridToHome;
    const parts = total > 0
      ? [[f.solarToHome, COLORS.solar], [f.batteryToHome, COLORS.batteryDischarge], [f.gridToHome, COLORS.gridImport]] as const
      : [];
    let offset = 0;
    return svg`
      <circle class="ring-bg" cx=${h.x} cy=${h.y} r=${h.r} stroke-width="4"></circle>
      ${parts.map(([w, color]) => {
        const len = (w / total) * circ;
        const seg = svg`<circle cx=${h.x} cy=${h.y} r=${h.r} fill="none" stroke=${color} stroke-width="4"
          stroke-dasharray="0 ${offset} ${len} ${circ}" transform="rotate(-90 ${h.x} ${h.y})"></circle>`;
        offset += len;
        return seg;
      })}`;
  }

  /** Child consumers that are on: above zero and above their own (or the global) minimum power. */
  private static activeChildren(r: Readings, cfg: CardConfig): Readings['consumers'] {
    const devices = new Map((cfg.consumers?.devices ?? []).map((d) => [d.entity, d]));
    const globalMin = cfg.consumers?.min_power ?? 0;
    return r.consumers.filter((c) => c.parent && c.w !== null && c.w > 0
      && c.w >= (devices.get(c.entity)?.min_power ?? globalMin));
  }

  /** Inner ring on a parent with one arc per child, each as long as the child's share of the parent. */
  private shareRing(c: Circle, total: number, kids: Readings['consumers']): SVGTemplateResult {
    const rr = c.r - 5;
    const circ = 2 * Math.PI * rr;
    let offset = 0;
    return svg`<g data-ring="child" pointer-events="none">
      <circle class="ring-bg" cx=${c.x} cy=${c.y} r=${rr} stroke-width="3"></circle>
      ${kids.map((k) => {
        const len = Math.min(Math.max((k.w ?? 0) / total, 0), 1) * (circ - offset);
        const seg = svg`<circle cx=${c.x} cy=${c.y} r=${rr} fill="none" stroke=${k.color} stroke-width="3"
          stroke-dasharray="0 ${offset} ${len} ${circ}" transform="rotate(-90 ${c.x} ${c.y})"></circle>`;
        offset += len;
        return seg;
      })}
    </g>`;
  }

  /** Child consumers as small pills on their visible parent, placed clear of everything already drawn. */
  private childPills(
    r: Readings, cfg: CardConfig, on: Readings['consumers'], visible: Readings['consumers'], slots: Slot[], vb: { width: number; height: number },
    shown: { solarPills: Circle[]; bankPills: Circle[]; hasSolar: boolean; hasBattery: boolean; hasLowCarbon: boolean; solarName: NameMode; batteryName: NameMode },
    paths: SVGTemplateResult[], nodes: SVGTemplateResult[],
    fmt: (w: number | null) => string,
  ): void {
    if (!on.length) return;

    const { solar, battery, lowCarbon, grid, home } = NODES;
    const { solarPills, bankPills, hasSolar, hasBattery, hasLowCarbon, solarName, batteryName } = shown;
    const obstacles: Obstacles = {
      circles: [grid, home, ...slots, ...(hasSolar ? [solar, ...solarPills] : []), ...(hasBattery ? [battery, ...bankPills] : []),
        ...(hasLowCarbon ? [lowCarbon] : [])],
      rects: [...this.labelRects,
        ...(hasSolar && solarName === 'outside' ? [{ x0: SOLAR_LABEL.x, y0: SOLAR_LABEL.y - 10, x1: SOLAR_LABEL.x + 28, y1: SOLAR_LABEL.y + 2 }] : []),
        ...(hasBattery && batteryName === 'outside' ? [{ x0: BATTERY_LABEL.x, y0: BATTERY_LABEL.y - 10, x1: BATTERY_LABEL.x + 38, y1: BATTERY_LABEL.y + 2 }] : [])],
      segments: [...FIXED_ROUTES, ...slots.map((s) => consumerRoute(s))].flatMap(segments),
    };

    visible.forEach((parent, i) => {
      const p = slots[i];
      on.filter((c) => c.parent === parent.entity).forEach((c, j) => {
        const s = placeSatellite(p, PILL_R, obstacles, vb, home);
        obstacles.circles.push(s);
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        const ux = (s.x - p.x) / d;
        const uy = (s.y - p.y) / d;
        const r1 = (v: number) => Math.round(v * 10) / 10;
        obstacles.segments.push({ x0: p.x, y0: p.y, x1: s.x, y1: s.y });
        paths.push(this.flow(`child-${i}-${j}`, `M${r1(p.x + ux * p.r)},${r1(p.y + uy * p.r)} L${r1(s.x - ux * s.r)},${r1(s.y - uy * s.r)}`,
          c.color, c.w ?? 0, { kind: 'child', r: 2 }));
        const lines: Line[] = [{ text: fmt(c.w) }];
        if (cfg.consumers?.show_percent !== false && parent.w) lines.push(nameLine(`${Math.round(((c.w ?? 0) / parent.w) * 100)}%`, 7));
        nodes.push(this.node('child', c.entity, s, c.color, lines,
          { title: `${c.name}: ${fmt(c.w)}`, fontSize: Math.min(8, s.r * 0.62), strokeWidth: 1.5 }));
      });
    });
  }

  protected render() {
    if (!this.config || !this.hass) return nothing;
    const cfg = this.config;
    const r: Readings = readState(this.hass, cfg);
    const f = computeFlows(totalsFromReadings(r), r.fossilPct);
    const hasSolar = !!cfg.solar;
    const hasBattery = !!cfg.battery?.banks?.length;
    const hasLowCarbon = !!cfg.low_carbon;
    const solarName = nameMode(cfg.solar);
    const batteryName = nameMode(cfg.battery);

    this.labelRects = [];
    const consumersById = new Map(r.consumers.map((c) => [c.id, c]));
    const visible = this.visible.map((id) => consumersById.get(id)).filter((c) => c !== undefined);
    const columns = cfg.consumers?.columns ?? 2;
    const slots = consumerSlots(visible.length, columns);
    const mode = modeFor(visible.length);
    const vb = viewBox(columns, mode);

    const { grid, solar, battery, home, lowCarbon } = NODES;
    const solarActive = cfg.solar?.show_idle_sources || (r.solarTotal ?? 0) >= IDLE_SOLAR_W;
    const solarPills = solarActive ? pillRow(r.solarSources.length, solar.x, SOLAR_PILLS_Y, PILLS_MAX_WIDTH) : [];
    const bankPills = pillRow(r.banks.length, battery.x, BANK_PILLS_Y, PILLS_MAX_WIDTH);
    const fmt = (w: number | null) => (w === null ? DASH : formatPower(w));
    const homeW = r.homeEntityW ?? f.home;

    const paths: SVGTemplateResult[] = [];
    if (hasLowCarbon) {
      paths.push(this.flow('lowcarbon-grid', `M${lowCarbon.x},${lowCarbon.y + lowCarbon.r} L${grid.x},${grid.y - grid.r}`, COLORS.lowCarbon, f.lowCarbon));
    }
    paths.push(this.flow('grid-home', `M${GRID_X},210 L${HOME_X},210`, COLORS.gridImport, f.gridToHome));
    if (hasSolar) {
      solarPills.forEach((p, i) => {
        const midY = (p.y + p.r + solar.y - solar.r) / 2;
        const tx = solar.x + (p.x - solar.x) * 0.2;
        paths.push(this.flow(`solar-src-${i}`, `M${p.x},${p.y + p.r} C${p.x},${midY} ${tx},${midY} ${tx},${solar.y - solar.r + 1}`,
          COLORS.solar, r.solarSources[i].w ?? 0, { kind: 'solar-source', r: 2.5 }));
      });
      paths.push(this.flow('solar-home', `M${SOLAR_OUT.home.x},${SOLAR_OUT.home.y} C190,195 220,205 ${HOME_X},205`, COLORS.solar, f.solarToHome));
      paths.push(this.flow('solar-grid', `M${SOLAR_OUT.grid.x},${SOLAR_OUT.grid.y} C150,195 120,205 ${GRID_X},205`, COLORS.gridExport, f.solarToGrid));
    }
    if (hasBattery) {
      bankPills.forEach((p, i) => {
        const w = r.banks[i].w ?? 0;
        const midY = (battery.y + battery.r + p.y - p.r) / 2;
        const sx = battery.x + (p.x - battery.x) * 0.2;
        paths.push(this.flow(`bank-${i}`, `M${sx},${battery.y + battery.r - 1} C${sx},${midY} ${p.x},${midY} ${p.x},${p.y - p.r}`,
          w >= 0 ? COLORS.batteryDischarge : COLORS.batteryCharge, Math.abs(w), { reverse: w > 0, kind: 'bank', r: 2.5 }));
      });
      paths.push(this.flow('battery-home', `M${BATTERY_OUT.home.x},${BATTERY_OUT.home.y} C190,225 220,215 ${HOME_X},215`, COLORS.batteryDischarge, f.batteryToHome));
      paths.push(this.flow('grid-battery', `M${GRID_X},215 C120,215 150,225 ${BATTERY_OUT.grid.x},${BATTERY_OUT.grid.y}`,
        f.batteryToGrid > 0 ? COLORS.batteryDischarge : COLORS.gridImport,
        Math.max(f.gridToBattery, f.batteryToGrid), { reverse: f.batteryToGrid > 0 }));
      if (hasSolar) paths.push(this.flow('solar-battery', `M${solar.x},${solar.y + solar.r} L${battery.x},${battery.y - battery.r}`, COLORS.batteryCharge, f.solarToBattery));
    }
    visible.forEach((c, i) => {
      paths.push(this.flow(`consumer-${i}`, consumerPath(slots[i], i, columns, visible.length), c.color, c.w ?? 0,
        { kind: 'consumer', r: slots[i].r >= 28 ? 2.5 : 2 }));
    });

    const nodes: SVGTemplateResult[] = [];
    if (hasLowCarbon) {
      nodes.push(this.node('low-carbon', cfg.low_carbon!.entity, lowCarbon, COLORS.lowCarbon,
        [{ text: r.fossilPct === null ? DASH : formatPower(f.lowCarbon) }], { label: 'Low-carbon', icon: 'mdi:leaf', fontSize: 11, strokeWidth: 2.5 }));
    }
    const gridEntity = typeof cfg.grid.entity === 'string' ? cfg.grid.entity : cfg.grid.entity.consumption;
    nodes.push(this.node('grid', gridEntity, grid, COLORS.gridImport, [
      { text: `← ${fmt(r.gridExport)}`, color: COLORS.gridExport },
      { text: `→ ${fmt(r.gridImport)}`, color: COLORS.gridImport },
    ], { label: 'Grid', labelBelow: true, icon: 'mdi:transmission-tower', fontSize: 11, strokeWidth: 2.5, iconScale: 0.5 }));
    if (hasSolar) {
      nodes.push(this.node('solar', cfg.solar!.entity ?? r.solarSources[0]?.entity, solar, COLORS.solar,
        solarName === 'inside' ? [{ text: fmt(r.solarTotal) }, nameLine('Solar', 10)] : [{ text: fmt(r.solarTotal) }],
        { title: 'Solar', icon: 'mdi:solar-power', fontSize: 13, strokeWidth: 2.5, iconScale: solarName === 'inside' ? 0.45 : 0.5 }));
      solarPills.forEach((p, i) => {
        const s = r.solarSources[i];
        nodes.push(this.node('solar-source', s.entity, p, COLORS.solar, [{ text: fmt(s.w ?? 0) }],
          { title: `${s.name}: ${fmt(s.w)}`, fontSize: Math.min(8, p.r * 0.62), strokeWidth: 1.5 }));
      });
    }
    if (hasBattery) {
      const net = r.batteryNet;
      nodes.push(this.node('battery', r.banks[0]?.entity, battery, COLORS.batteryDischarge, [
        { text: r.batterySoc === null ? DASH : `${Math.round(r.batterySoc)}%` },
        { text: `↓ ${net === null ? DASH : formatPower(Math.max(net, 0))}`, color: COLORS.batteryDischarge },
        { text: `↑ ${net === null ? DASH : formatPower(Math.max(-net, 0))}`, color: COLORS.batteryCharge },
        ...(batteryName === 'inside' ? [nameLine('Battery', 9)] : []),
      ], {
        title: 'Battery', fontSize: 11, strokeWidth: 2.5, icon: batteryIcon(r.batterySoc), iconColor: 'var(--primary-text-color)',
        iconScale: batteryName === 'inside' ? 0.34 : 0.42, linesAboveIcon: 1,
      }));
      bankPills.forEach((p, i) => {
        const b = r.banks[i];
        nodes.push(this.node('bank', b.entity, p, COLORS.batteryDischarge,
          [{ text: b.soc === null ? DASH : `${Math.round(b.soc)}%` }],
          { title: `${b.name}: ${b.soc === null ? DASH : `${Math.round(b.soc)}%`} · ${fmt(b.w)}`, fontSize: Math.min(10, p.r * 0.62), strokeWidth: 1.5 }));
      });
    }
    const rings: SVGTemplateResult[] = [];
    const children = PowerFlowMultiCard.activeChildren(r, cfg);
    visible.forEach((c, i) => {
      const s = slots[i];
      // Full-size circles get the icon; grid columns sit closer together, so their names are shorter.
      const big = s.r >= 28;
      // Only full-size circles have room for the name inside.
      const inside = big && cfg.consumers?.name_inside !== false;
      const name = truncate(c.name, 11);
      const kids = children.filter((k) => k.parent === c.entity);
      if (kids.length && c.w) rings.push(this.shareRing(s, c.w, kids));
      nodes.push(this.node('consumer', c.entity, s, c.color, inside ? [{ text: fmt(c.w) }, nameLine(name, Math.min(9, CONSUMER_NAME_WIDTH / (name.length * 0.55)))] : [{ text: fmt(c.w) }], {
        label: inside ? undefined : truncate(c.name, s.col === undefined ? 16 : big ? 11 : 9), labelSize: big ? undefined : 8,
        title: `${c.name}: ${fmt(c.w)}`, labelBelow: s.labelBelow, iconScale: inside ? 0.42 : undefined,
        icon: big ? c.icon ?? 'mdi:flash' : undefined, fontSize: big ? 10 : 8,
      }));
    });

    const homeLayout = PowerFlowMultiCard.iconLayout(home, [], [13], 0.5);
    this.childPills(r, cfg, children, visible, slots, vb, { solarPills, bankPills, hasSolar, hasBattery, hasLowCarbon, solarName, batteryName }, paths, nodes, fmt);

    return html`<ha-card>
      <svg viewBox="0 0 ${vb.width} ${vb.height}" xmlns="http://www.w3.org/2000/svg">
        ${hasSolar && solarName === 'outside' ? svg`<text class="label" x=${SOLAR_LABEL.x} y=${SOLAR_LABEL.y} style="text-anchor:start">Solar</text>` : nothing}
        ${hasBattery && batteryName === 'outside' ? svg`<text class="label" x=${BATTERY_LABEL.x} y=${BATTERY_LABEL.y} style="text-anchor:start">Battery</text>` : nothing}
        ${paths}
        ${this.homeRing(f)}
        <g data-node="home" @click=${() => this.moreInfo(cfg.home?.entity)}>
          <title>Home</title>
          <circle class="bg" cx=${home.x} cy=${home.y} r=${home.r - 2}></circle>
          ${this.icon(home, 'mdi:home', undefined, homeLayout)}
          <text class="value" x=${home.x} y=${homeLayout.baselines[0]} font-size="13">${fmt(homeW)}</text>
        </g>
        ${nodes}
        ${rings}
      </svg>
    </ha-card>`;
  }
}

if (!customElements.get('power-flow-multi-card')) {
  customElements.define('power-flow-multi-card', PowerFlowMultiCard);
}

declare global {
  interface Window { customCards?: { type: string; name: string; description?: string; preview?: boolean }[] }
}
window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === 'power-flow-multi-card')) {
  window.customCards.push({
    type: 'power-flow-multi-card',
    name: 'Power Flow Multi Card',
    description: 'Power flow with multiple solar sources, battery banks and ranked consumers',
  });
}

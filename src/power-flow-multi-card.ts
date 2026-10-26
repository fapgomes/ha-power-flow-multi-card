import { html, LitElement, nothing, svg, type PropertyValues, type SVGTemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { computeFlows, totalsFromReadings, type Flows } from './flows';
import { geometryFor, type Geometry, type Label } from './geometry';
import { PILL_R, placeSatellite, type Circle, type Obstacles, type Pt, type Rect, type Slot } from './layout';
import './editor';
import { ConsumerRanker } from './ranking';
import { normalizeConfig, readState } from './readings';
import { COLORS, styles } from './styles';
import type { CardConfig, HassLike, Readings } from './types';
import { dotDuration, formatPower, truncate } from './units';

/** Below this total (W) solar counts as idle and its source pills are hidden. */
const IDLE_SOLAR_W = 10;

const DASH = '—';

/** Box an outside label of `chars` characters takes, so child pills can avoid it. */
function labelRect(l: Label, chars: number, size = 10): Rect {
  const w = chars * size * 0.55;
  const x0 = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
  return { x0, y0: l.y - size, x1: x0 + w, y1: l.y + 2 };
}

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
  /** Consumer whose name shows while hovered, when names are hidden. */
  @state() private hovered?: { name: string; c: Circle };

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
    return this.config?.layout === 'vertical' ? 9 : 5;
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
      label?: string; labelSize?: number; labelBelow?: boolean;
      /** Where the label goes when neither above nor below the circle. */
      labelAt?: Label; icon?: string; iconColor?: string; iconScale?: number;
      /** How many of the lines go above the icon (default 0: icon on top). */
      linesAboveIcon?: number; title?: string; fontSize?: number; strokeWidth?: number;
      /** Name shown in a floating label while the pointer is over the circle. */
      hoverName?: string;
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
    const label: Label = opts.labelAt ?? { x: c.x, y: labelY, anchor: 'middle' };
    if (opts.label) this.labelRects.push(labelRect(label, opts.label.length, opts.labelSize ?? 10));
    const hover = opts.hoverName;
    return svg`<g data-node=${kind} @click=${() => this.moreInfo(entity)}
      @pointerenter=${hover ? () => { this.hovered = { name: hover, c }; } : undefined}
      @pointerleave=${hover ? () => { this.hovered = undefined; } : undefined}>
      <title>${opts.title ?? opts.label ?? entity ?? kind}</title>
      <circle class="bg" cx=${c.x} cy=${c.y} r=${c.r} stroke=${color} stroke-width=${opts.strokeWidth ?? 2}></circle>
      ${layout ? this.icon(c, opts.icon!, opts.iconColor ?? color, layout) : nothing}
      ${lines.map((l, i) => svg`<text class="value" x=${c.x} y=${lineY(i)} font-size=${l.size ?? fs}
          style=${l.color ? `fill:${l.color}` : ''}>${l.text}</text>`)}
      ${opts.label ? svg`<text class="label" x=${label.x} y=${label.y}
          style=${`text-anchor:${label.anchor}${opts.labelSize ? `;font-size:${opts.labelSize}px` : ''}`}>${opts.label}</text>` : nothing}
    </g>`;
  }

  private outsideLabel(l: Label, text: string): SVGTemplateResult {
    return svg`<text class="label" x=${l.x} y=${l.y} style="text-anchor:${l.anchor}">${text}</text>`;
  }

  /** Floating name above (or, near the top edge, below) the hovered consumer. */
  private hoverLabel(width: number): SVGTemplateResult | typeof nothing {
    const h = this.hovered;
    if (!h) return nothing;
    const size = 11;
    const w = h.name.length * size * 0.58 + 10;
    const above = h.c.y - h.c.r - 6 - size >= 2;
    const y = above ? h.c.y - h.c.r - 6 : h.c.y + h.c.r + 6 + size;
    const x = Math.min(Math.max(h.c.x, w / 2 + 2), width - w / 2 - 2);
    return svg`<g data-hover-name>
      <rect x=${x - w / 2} y=${y - size - 1} width=${w} height=${size + 6} rx="4"></rect>
      <text class="value" x=${x} y=${y} font-size=${size}>${h.name}</text>
    </g>`;
  }

  private homeRing(h: Circle, f: Flows): SVGTemplateResult {
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

  /**
   * Inner ring with one arc per part, each as long as the part's share of total: children on a
   * parent consumer, or the visible consumers on home. Whatever the parts don't cover stays grey.
   */
  private shareRing(c: Circle, total: number, parts: Readings['consumers'], kind = 'child', inset = 5): SVGTemplateResult {
    const rr = c.r - inset;
    const circ = 2 * Math.PI * rr;
    let offset = 0;
    return svg`<g data-ring=${kind} pointer-events="none">
      <circle class="ring-bg" cx=${c.x} cy=${c.y} r=${rr} stroke-width="3"></circle>
      ${parts.map((k) => {
        const len = Math.min(Math.max((k.w ?? 0) / total, 0) * circ, circ - offset);
        const seg = svg`<circle cx=${c.x} cy=${c.y} r=${rr} fill="none" stroke=${k.color} stroke-width="3"
          stroke-dasharray="0 ${offset} ${len} ${circ}" transform="rotate(-90 ${c.x} ${c.y})"></circle>`;
        offset += len;
        return seg;
      })}
    </g>`;
  }

  /** Child consumers as small pills on their visible parent, placed clear of everything already drawn. */
  private childPills(
    g: Geometry, cfg: CardConfig, on: Readings['consumers'], visible: Readings['consumers'], slots: Slot[], vb: { width: number; height: number },
    shown: { solarPills: Circle[]; bankPills: Circle[]; hasSolar: boolean; hasBattery: boolean; hasLowCarbon: boolean; solarName: NameMode; batteryName: NameMode },
    paths: SVGTemplateResult[], nodes: SVGTemplateResult[],
    fmt: (w: number | null) => string,
  ): void {
    if (!on.length) return;

    const { solar, battery, lowCarbon, grid, home } = g.nodes;
    const { solarPills, bankPills, hasSolar, hasBattery, hasLowCarbon, solarName, batteryName } = shown;
    const obstacles: Obstacles = {
      circles: [grid, home, ...slots, ...(hasSolar ? [solar, ...solarPills] : []), ...(hasBattery ? [battery, ...bankPills] : []),
        ...(hasLowCarbon ? [lowCarbon] : [])],
      rects: [...this.labelRects,
        ...(hasSolar && solarName === 'outside' ? [labelRect(g.labels.solar, 5)] : []),
        ...(hasBattery && batteryName === 'outside' ? [labelRect(g.labels.battery, 7)] : [])],
      segments: [...g.fixedRoutes, ...slots.map((s) => g.consumerRoute(s))].flatMap(segments),
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
    const g = geometryFor(cfg.layout);
    // Names go outside the circles when hidden-inside is off; the vertical rows then need more room.
    const namesOutside = cfg.consumers?.show_name !== false && cfg.consumers?.name_inside === false;
    const slots = g.slots(visible.length, columns, namesOutside);
    const vb = g.viewBox(visible.length, columns, namesOutside);

    const { grid, solar, battery, home, lowCarbon } = g.nodes;
    const solarActive = cfg.solar?.show_idle_sources || (r.solarTotal ?? 0) >= IDLE_SOLAR_W;
    const solarPills = solarActive ? g.solarPills(r.solarSources.length) : [];
    const bankPills = g.bankPills(r.banks.length);
    const fmt = (w: number | null) => (w === null ? DASH : formatPower(w));
    const homeW = r.homeEntityW ?? f.home;

    const paths: SVGTemplateResult[] = [];
    if (hasLowCarbon) {
      paths.push(this.flow('lowcarbon-grid', g.flows.lowCarbonGrid, COLORS.lowCarbon, f.lowCarbon));
    }
    paths.push(this.flow('grid-home', g.flows.gridHome, COLORS.gridImport, f.gridToHome));
    if (hasSolar) {
      solarPills.forEach((p, i) => {
        const midY = (p.y + p.r + solar.y - solar.r) / 2;
        const tx = solar.x + (p.x - solar.x) * 0.2;
        paths.push(this.flow(`solar-src-${i}`, `M${p.x},${p.y + p.r} C${p.x},${midY} ${tx},${midY} ${tx},${solar.y - solar.r + 1}`,
          COLORS.solar, r.solarSources[i].w ?? 0, { kind: 'solar-source', r: 2.5 }));
      });
      paths.push(this.flow('solar-home', g.flows.solarHome, COLORS.solar, f.solarToHome));
      paths.push(this.flow('solar-grid', g.flows.solarGrid, COLORS.gridExport, f.solarToGrid));
    }
    if (hasBattery) {
      bankPills.forEach((p, i) => {
        const w = r.banks[i].w ?? 0;
        const midY = (battery.y + battery.r + p.y - p.r) / 2;
        const sx = battery.x + (p.x - battery.x) * 0.2;
        paths.push(this.flow(`bank-${i}`, `M${sx},${battery.y + battery.r - 1} C${sx},${midY} ${p.x},${midY} ${p.x},${p.y - p.r}`,
          w >= 0 ? COLORS.batteryDischarge : COLORS.batteryCharge, Math.abs(w), { reverse: w > 0, kind: 'bank', r: 2.5 }));
      });
      paths.push(this.flow('battery-home', g.flows.batteryHome, COLORS.batteryDischarge, f.batteryToHome));
      paths.push(this.flow('grid-battery', g.flows.gridBattery,
        f.batteryToGrid > 0 ? COLORS.batteryDischarge : COLORS.gridImport,
        Math.max(f.gridToBattery, f.batteryToGrid), { reverse: f.batteryToGrid > 0 }));
      if (hasSolar) paths.push(this.flow('solar-battery', g.flows.solarBattery, COLORS.batteryCharge, f.solarToBattery));
    }
    visible.forEach((c, i) => {
      paths.push(this.flow(`consumer-${i}`, g.consumerPath(slots[i]), c.color, c.w ?? 0,
        { kind: 'consumer', r: slots[i].r >= 28 ? 2.5 : 2 }));
    });

    const nodes: SVGTemplateResult[] = [];
    if (hasLowCarbon) {
      nodes.push(this.node('low-carbon', cfg.low_carbon!.entity, lowCarbon, COLORS.lowCarbon,
        [{ text: r.fossilPct === null ? DASH : formatPower(f.lowCarbon) }], { label: 'Low-carbon', icon: 'mdi:leaf', fontSize: 11, strokeWidth: 2.5 }));
    }
    const gridEntity = typeof cfg.grid.entity === 'string' ? cfg.grid.entity : cfg.grid.entity.consumption;
    const gridName = nameMode(cfg.grid);
    nodes.push(this.node('grid', gridEntity, grid, COLORS.gridImport, [
      { text: `${g.gridArrows.export} ${fmt(r.gridExport)}`, color: COLORS.gridExport },
      { text: `${g.gridArrows.import} ${fmt(r.gridImport)}`, color: COLORS.gridImport },
      ...(gridName === 'inside' ? [nameLine('Grid', 9)] : []),
    ], {
      label: gridName === 'outside' ? 'Grid' : undefined, labelBelow: true, labelAt: g.labels.grid, icon: 'mdi:transmission-tower',
      fontSize: 11, strokeWidth: 2.5, iconScale: gridName === 'inside' ? 0.4 : 0.5,
    }));
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
        // As in power-flow-card-plus: ↑ energy leaving the battery (discharge), ↓ entering it (charge).
        { text: `↑ ${net === null ? DASH : formatPower(Math.max(net, 0))}`, color: COLORS.batteryDischarge },
        { text: `↓ ${net === null ? DASH : formatPower(Math.max(-net, 0))}`, color: COLORS.batteryCharge },
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
      const showName = cfg.consumers?.show_name !== false;
      const inside = showName && big && cfg.consumers?.name_inside !== false;
      const outside = showName && !inside;
      const name = truncate(c.name, 11);
      const kids = children.filter((k) => k.parent === c.entity);
      if (kids.length && c.w) rings.push(this.shareRing(s, c.w, kids));
      nodes.push(this.node('consumer', c.entity, s, c.color, inside ? [{ text: fmt(c.w) }, nameLine(name, Math.min(9, CONSUMER_NAME_WIDTH / (name.length * 0.55)))] : [{ text: fmt(c.w) }], {
        label: outside ? truncate(c.name, s.col === undefined ? 16 : big ? 11 : 9) : undefined, labelSize: big ? undefined : 8,
        hoverName: showName ? undefined : c.name,
        title: `${c.name}: ${fmt(c.w)}`, labelBelow: s.labelBelow, iconScale: inside ? 0.42 : undefined,
        icon: big ? c.icon ?? 'mdi:flash' : undefined, fontSize: big ? 10 : 8,
      }));
    });

    const shown = visible.filter((c) => (c.w ?? 0) > 0);
    if (cfg.home?.show_consumers !== false && homeW > 0 && shown.length) rings.push(this.shareRing(home, homeW, shown, 'home', 8));

    const homeLayout = PowerFlowMultiCard.iconLayout(home, [], [13], 0.5);
    this.childPills(g, cfg, children, visible, slots, vb, { solarPills, bankPills, hasSolar, hasBattery, hasLowCarbon, solarName, batteryName }, paths, nodes, fmt);

    return html`<ha-card>
      <svg viewBox="0 0 ${vb.width} ${vb.height}" xmlns="http://www.w3.org/2000/svg" class=${cfg.bold ? 'bold' : ''}>
        ${hasSolar && solarName === 'outside' ? this.outsideLabel(g.labels.solar, 'Solar') : nothing}
        ${hasBattery && batteryName === 'outside' ? this.outsideLabel(g.labels.battery, 'Battery') : nothing}
        ${paths}
        ${this.homeRing(home, f)}
        <g data-node="home" @click=${() => this.moreInfo(cfg.home?.entity)}>
          <title>Home</title>
          <circle class="bg" cx=${home.x} cy=${home.y} r=${home.r - 2}></circle>
          ${this.icon(home, 'mdi:home', undefined, homeLayout)}
          <text class="value" x=${home.x} y=${homeLayout.baselines[0]} font-size="13">${fmt(homeW)}</text>
        </g>
        ${nodes}
        ${rings}
        ${this.hoverLabel(vb.width)}
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

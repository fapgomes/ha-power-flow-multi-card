import { html, LitElement, nothing, svg, type PropertyValues, type SVGTemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { computeFlows, totalsFromReadings, type Flows } from './flows';
import {
  BANK_PILLS_Y, consumerPath, consumerSlots, modeFor, NODES, pillRow, PILLS_MAX_WIDTH, SOLAR_PILLS_Y, viewBox,
  type Circle,
} from './layout';
import './editor';
import { ConsumerRanker } from './ranking';
import { normalizeConfig, readState } from './readings';
import { COLORS, styles } from './styles';
import type { CardConfig, HassLike, Readings } from './types';
import { dotDuration, formatCompact, formatPower, truncate } from './units';

const DASH = '—';

let instanceCounter = 0;

interface Line { text: string; color?: string }

export class PowerFlowMultiCard extends LitElement {
  static styles = styles;

  @property({ attribute: false }) hass?: HassLike;
  @state() private config?: CardConfig;

  private ranker?: ConsumerRanker;
  private visible: string[] = [];
  private readonly uid = `pfmc${++instanceCounter}`;

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
    for (const c of readState(this.hass, this.config).consumers) if (c.w !== null) values[c.id] = c.w;
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

  private icon(c: Circle, icon: string, color?: string): SVGTemplateResult {
    const s = c.r * 0.55;
    return svg`<foreignObject x=${c.x - s / 2} y=${c.y - c.r * 0.72} width=${s} height=${s}>
      ${html`<ha-icon .icon=${icon} style=${color ? `color:${color}` : ''}></ha-icon>`}
    </foreignObject>`;
  }

  private node(
    kind: string, entity: string | undefined, c: Circle, color: string, lines: Line[],
    opts: { label?: string; labelSize?: number; labelBelow?: boolean; icon?: string; title?: string; fontSize?: number; strokeWidth?: number } = {},
  ): SVGTemplateResult {
    const fs = opts.fontSize ?? 10;
    const withIcon = !!opts.icon;
    const lh = fs * 1.25;
    const top = withIcon ? c.y + fs * 0.4 : c.y - ((lines.length - 1) * lh) / 2 + fs * 0.35;
    const labelY = opts.labelBelow ? c.y + c.r + 12 : c.y - c.r - 6;
    return svg`<g data-node=${kind} @click=${() => this.moreInfo(entity)}>
      <title>${opts.title ?? opts.label ?? entity ?? kind}</title>
      <circle class="bg" cx=${c.x} cy=${c.y} r=${c.r} stroke=${color} stroke-width=${opts.strokeWidth ?? 2}></circle>
      ${withIcon ? this.icon(c, opts.icon!, color) : nothing}
      ${lines.map((l, i) => svg`<text class="value" x=${c.x} y=${top + i * lh} font-size=${fs}
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

  protected render() {
    if (!this.config || !this.hass) return nothing;
    const cfg = this.config;
    const r: Readings = readState(this.hass, cfg);
    const f = computeFlows(totalsFromReadings(r), r.fossilPct);
    const hasSolar = !!cfg.solar;
    const hasBattery = !!cfg.battery?.banks?.length;
    const hasLowCarbon = !!cfg.low_carbon;

    const consumersById = new Map(r.consumers.map((c) => [c.id, c]));
    const visible = this.visible.map((id) => consumersById.get(id)).filter((c) => c !== undefined);
    const columns = cfg.consumers?.columns ?? 2;
    const slots = consumerSlots(visible.length, columns);
    const mode = modeFor(visible.length);
    const vb = viewBox(columns, mode);

    const { grid, solar, battery, home, lowCarbon } = NODES;
    const solarPills = pillRow(r.solarSources.length, solar.x, SOLAR_PILLS_Y, PILLS_MAX_WIDTH);
    const bankPills = pillRow(r.banks.length, battery.x, BANK_PILLS_Y, PILLS_MAX_WIDTH);
    const fmt = (w: number | null) => (w === null ? DASH : formatPower(w));
    const fmtPill = (w: number | null) => (w === null ? DASH : formatCompact(w));
    const homeW = r.homeEntityW ?? f.home;

    const paths: SVGTemplateResult[] = [];
    if (hasLowCarbon) {
      paths.push(this.flow('lowcarbon-grid', `M${lowCarbon.x},${lowCarbon.y + lowCarbon.r} L${grid.x},${grid.y - grid.r}`, COLORS.lowCarbon, f.lowCarbon));
    }
    paths.push(this.flow('grid-home', 'M82,210 L256,210', COLORS.gridImport, f.gridToHome));
    if (hasSolar) {
      solarPills.forEach((p, i) => {
        const midY = (p.y + p.r + solar.y - solar.r) / 2;
        const tx = solar.x + (p.x - solar.x) * 0.2;
        paths.push(this.flow(`solar-src-${i}`, `M${p.x},${p.y + p.r} C${p.x},${midY} ${tx},${midY} ${tx},${solar.y - solar.r + 1}`,
          COLORS.solar, r.solarSources[i].w ?? 0, { kind: 'solar-source', r: 2.5 }));
      });
      paths.push(this.flow('solar-home', 'M180,125 C190,195 220,205 256,205', COLORS.solar, f.solarToHome));
      paths.push(this.flow('solar-grid', 'M160,125 C150,195 120,205 82,205', COLORS.gridExport, f.solarToGrid));
    }
    if (hasBattery) {
      bankPills.forEach((p, i) => {
        const w = r.banks[i].w ?? 0;
        const midY = (battery.y + battery.r + p.y - p.r) / 2;
        const sx = battery.x + (p.x - battery.x) * 0.2;
        paths.push(this.flow(`bank-${i}`, `M${sx},${battery.y + battery.r - 1} C${sx},${midY} ${p.x},${midY} ${p.x},${p.y - p.r}`,
          w >= 0 ? COLORS.batteryDischarge : COLORS.batteryCharge, Math.abs(w), { reverse: w > 0, kind: 'bank', r: 2.5 }));
      });
      paths.push(this.flow('battery-home', 'M180,295 C190,225 220,215 256,215', COLORS.batteryDischarge, f.batteryToHome));
      paths.push(this.flow('grid-battery', 'M82,215 C120,215 150,225 160,295',
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
        [{ text: r.fossilPct === null ? DASH : formatPower(f.lowCarbon) }], { label: 'Low-carbon', icon: 'mdi:leaf', fontSize: 9, strokeWidth: 2.5 }));
    }
    const gridEntity = typeof cfg.grid.entity === 'string' ? cfg.grid.entity : cfg.grid.entity.consumption;
    nodes.push(this.node('grid', gridEntity, grid, COLORS.gridImport, [
      { text: `← ${fmt(r.gridExport)}`, color: COLORS.gridExport },
      { text: `→ ${fmt(r.gridImport)}`, color: COLORS.gridImport },
    ], { label: 'Grid', labelBelow: true, icon: 'mdi:transmission-tower', fontSize: 9, strokeWidth: 2.5 }));
    if (hasSolar) {
      nodes.push(this.node('solar', cfg.solar!.entity ?? r.solarSources[0]?.entity, solar, COLORS.solar,
        [{ text: fmt(r.solarTotal) }], { title: 'Solar', icon: 'mdi:solar-power', fontSize: 11, strokeWidth: 2.5 }));
      solarPills.forEach((p, i) => {
        const s = r.solarSources[i];
        nodes.push(this.node('solar-source', s.entity, p, COLORS.solar, [{ text: fmtPill(s.w) }],
          { title: `${s.name}: ${fmt(s.w)}`, fontSize: Math.min(7.5, p.r * 0.62), strokeWidth: 1.5 }));
      });
    }
    if (hasBattery) {
      const net = r.batteryNet;
      nodes.push(this.node('battery', r.banks[0]?.entity, battery, COLORS.batteryDischarge, [
        { text: r.batterySoc === null ? DASH : `${Math.round(r.batterySoc)}%` },
        { text: `↓ ${net === null ? DASH : formatPower(Math.max(net, 0))}`, color: COLORS.batteryDischarge },
        { text: `↑ ${net === null ? DASH : formatPower(Math.max(-net, 0))}`, color: COLORS.batteryCharge },
      ], { title: 'Battery', fontSize: 9, strokeWidth: 2.5 }));
      bankPills.forEach((p, i) => {
        const b = r.banks[i];
        nodes.push(this.node('bank', b.entity, p, COLORS.batteryDischarge,
          [{ text: b.soc === null ? DASH : `${Math.round(b.soc)}%` }],
          { title: `${b.name}: ${b.soc === null ? DASH : `${Math.round(b.soc)}%`} · ${fmt(b.w)}`, fontSize: Math.min(7.5, p.r * 0.62), strokeWidth: 1.5 }));
      });
    }
    visible.forEach((c, i) => {
      const s = slots[i];
      // Full-size circles get the icon; grid columns sit closer together, so their names are shorter.
      const big = s.r >= 28;
      nodes.push(this.node('consumer', c.entity, s, c.color, [{ text: fmt(c.w) }], {
        label: truncate(c.name, s.col === undefined ? 16 : big ? 11 : 9), labelSize: big ? undefined : 8, title: `${c.name}: ${fmt(c.w)}`, labelBelow: s.labelBelow,
        icon: big ? c.icon ?? 'mdi:flash' : undefined, fontSize: big ? 10 : 8,
      }));
    });

    return html`<ha-card>
      <svg viewBox="0 0 ${vb.width} ${vb.height}" xmlns="http://www.w3.org/2000/svg">
        ${hasSolar ? svg`<text class="label" x=${solar.x + solar.r + 12} y=${solar.y - solar.r + 10} style="text-anchor:start">Solar</text>` : nothing}
        ${hasBattery ? svg`<text class="label" x=${battery.x + battery.r + 12} y=${battery.y + battery.r - 4} style="text-anchor:start">Battery</text>` : nothing}
        ${paths}
        ${this.homeRing(f)}
        <g data-node="home" @click=${() => this.moreInfo(cfg.home?.entity)}>
          <title>Home</title>
          <circle class="bg" cx=${home.x} cy=${home.y} r=${home.r - 2}></circle>
          ${this.icon(home, 'mdi:home')}
          <text class="value" x=${home.x} y=${home.y + 12} font-size="11">${fmt(homeW)}</text>
        </g>
        ${nodes}
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

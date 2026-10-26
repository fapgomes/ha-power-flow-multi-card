import {
  BANK_PILLS_Y, BASE_WIDTH, capacity as horizontalCapacity, consumerPath as horizontalPath, consumerRoute as horizontalRoute,
  consumerSlots as horizontalSlots, HEIGHT, NODES, pillRow, PILLS_MAX_WIDTH, SOLAR_PILLS_Y, viewBox as horizontalViewBox,
  type Circle, type Pt, type Slot,
} from './layout';

export type LayoutName = 'horizontal' | 'vertical';

/** A text position: anchor as in SVG text-anchor. */
export interface Label { x: number; y: number; anchor: 'start' | 'middle' | 'end' }

/** Everything that differs between layouts: where the circles sit and how the flows between them run. */
export interface Geometry {
  nodes: { lowCarbon: Circle; grid: Circle; solar: Circle; battery: Circle; home: Circle };
  /** Most consumers the layout can show. */
  capacity(columns: number): number;
  viewBox(count: number, columns: number, namesOutside: boolean): { width: number; height: number };
  slots(count: number, columns: number, namesOutside: boolean): Slot[];
  consumerPath(slot: Slot): string;
  /** Rough polyline of a consumer path, for keeping child pills off it. */
  consumerRoute(slot: Slot): Pt[];
  solarPills(n: number): Slot[];
  bankPills(n: number): Slot[];
  flows: { lowCarbonGrid: string; gridHome: string; solarHome: string; solarGrid: string; batteryHome: string; gridBattery: string; solarBattery: string };
  /** Rough shape of the fixed flows, so child pills stay off them. */
  fixedRoutes: Pt[][];
  /** Names drawn outside their circle: "Solar" and "Battery" when not inside, and "Grid". */
  labels: { solar: Label; battery: Label; grid?: Label };
  /** Arrows on the grid circle pointing the way energy goes: towards home (import) and back (export). */
  gridArrows: { import: string; export: string };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Point on the edge of a circle, in the direction (dx, dy) from its centre. */
function edge(c: Circle, dx: number, dy: number): Pt {
  const d = Math.hypot(dx, dy);
  return { x: r1(c.x + (dx / d) * c.r), y: r1(c.y + (dy / d) * c.r) };
}

/**
 * The flows between grid, solar, battery and home, as offsets from the point where they cross.
 * `at` turns an offset along/across the solar–battery axis into a point, so both layouts share
 * the same curves: horizontal has solar above battery, vertical has solar left of battery.
 */
function crossFlows(at: (along: number, across: number) => Pt, n: Geometry['nodes'], gridEnd: number, homeEnd: number) {
  const p = (along: number, across: number) => { const q = at(along, across); return `${q.x},${q.y}`; };
  /** Edge of c in the direction (along, across). */
  const out = (c: Circle, along: number, across: number) => {
    const q = at(along, across);
    const o = at(0, 0);
    return edge(c, q.x - o.x, q.y - o.y);
  };
  const solarHome = out(n.solar, 30, 10);
  const solarGrid = out(n.solar, 30, -10);
  const batteryHome = out(n.battery, -30, 10);
  const batteryGrid = out(n.battery, -30, -10);
  const s = (q: Pt) => `${q.x},${q.y}`;
  return {
    flows: {
      gridHome: `M${p(0, gridEnd)} L${p(0, homeEnd)}`,
      solarHome: `M${s(solarHome)} C${p(-15, 20)} ${p(-5, 50)} ${p(-5, homeEnd)}`,
      solarGrid: `M${s(solarGrid)} C${p(-15, -20)} ${p(-5, -50)} ${p(-5, gridEnd)}`,
      batteryHome: `M${s(batteryHome)} C${p(15, 20)} ${p(5, 50)} ${p(5, homeEnd)}`,
      gridBattery: `M${p(5, gridEnd)} C${p(5, -50)} ${p(15, -20)} ${s(batteryGrid)}`,
      solarBattery: `M${s(out(n.solar, 1, 0))} L${s(out(n.battery, -1, 0))}`,
    },
    routes: [
      [at(0, gridEnd), at(0, homeEnd)],
      [solarHome, at(-15, 35), at(-5, homeEnd)],
      [solarGrid, at(-15, -35), at(-5, gridEnd)],
      [batteryHome, at(15, 35), at(5, homeEnd)],
      [at(5, gridEnd), at(15, -35), batteryGrid],
      [out(n.solar, 1, 0), out(n.battery, -1, 0)],
    ],
  };
}

const horizontal: Geometry = (() => {
  const n = NODES;
  const centre = { x: n.solar.x, y: n.grid.y };
  // Along the axis is down (solar above, battery below); across is right (grid left, home right).
  const cross = crossFlows((along, across) => ({ x: centre.x + across, y: centre.y + along }), n,
    n.grid.x + n.grid.r - centre.x, n.home.x - n.home.r - centre.x);
  return {
    nodes: n,
    capacity: horizontalCapacity,
    viewBox: (_count, columns) => horizontalViewBox(columns, 'small'),
    slots: (count, columns) => horizontalSlots(count, columns),
    consumerPath: (slot) => horizontalPath(slot, 0, 0, 0),
    consumerRoute: horizontalRoute,
    solarPills: (k) => pillRow(k, n.solar.x, SOLAR_PILLS_Y, PILLS_MAX_WIDTH),
    bankPills: (k) => pillRow(k, n.battery.x, BANK_PILLS_Y, PILLS_MAX_WIDTH),
    flows: {
      ...cross.flows,
      lowCarbonGrid: `M${n.lowCarbon.x},${n.lowCarbon.y + n.lowCarbon.r} L${n.grid.x},${n.grid.y - n.grid.r}`,
    },
    fixedRoutes: [[n.lowCarbon, n.grid], ...cross.routes],
    labels: {
      solar: { x: n.solar.x + n.solar.r * 0.84, y: n.solar.y - n.solar.r * 0.69, anchor: 'start' },
      battery: { x: n.battery.x + n.battery.r * 0.84, y: n.battery.y + n.battery.r * 0.95, anchor: 'start' },
    },
    gridArrows: { import: '→', export: '←' },
  };
})();

/**
 * Vertical: grid on top, home below it, solar left and battery right, consumers in rows of three
 * under home. It is drawn narrower than the horizontal layout with the same radii, so at the same
 * card width every circle and text comes out about 28 % bigger.
 */
const VERTICAL_WIDTH = 376;
const V_COLUMNS = 3;
const V_ROWS = 4;
const V_R = 32;
const V_COL_STEP = 118;
const V_FIRST_ROW = 436;

const vertical: Geometry = (() => {
  const cx = VERTICAL_WIDTH / 2;
  const n = {
    grid: { x: cx, y: 62, r: 38 },
    lowCarbon: { x: cx + 118, y: 62, r: 34 },
    solar: { x: cx - 124, y: 184, r: 38 },
    battery: { x: cx + 124, y: 184, r: 38 },
    home: { x: cx, y: 306, r: 42 },
  };
  const centre = { x: cx, y: n.solar.y };
  // Along the axis is right (solar left, battery right); across is down (grid above, home below).
  const cross = crossFlows((along, across) => ({ x: centre.x + along, y: centre.y + across }), n,
    n.grid.y + n.grid.r - centre.y, n.home.y - n.home.r - centre.y);
  const xs = [cx, cx - V_COL_STEP, cx + V_COL_STEP];
  const rowStep = (outside: boolean) => (outside ? 94 : 82);
  /**
   * x of the gap a path runs down to reach a slot below the first row. The left and right
   * columns use the gap on their side; the middle column alternates, so both gaps carry about
   * as many lines. Lines sharing a gap sit 3 apart.
   */
  const laneX = (s: Slot) => {
    const k = (s.row ?? 1) - 1;
    const gapLeft = cx - V_COL_STEP / 2;
    const gapRight = cx + V_COL_STEP / 2;
    if (s.x < cx) return gapLeft - 2 - 3 * k;
    if (s.x > cx) return gapRight + 2 + 3 * k;
    return k % 2 === 0 ? gapRight - 2 - 3 * (k / 2) : gapLeft + 2 + 3 * ((k - 1) / 2);
  };
  const homeBottom = (x: number): Pt => ({ x, y: r1(n.home.y + Math.sqrt(n.home.r ** 2 - (x - n.home.x) ** 2)) });
  return {
    nodes: n,
    capacity: () => V_COLUMNS * V_ROWS,
    viewBox: (count, _columns, outside) => {
      const rows = Math.max(1, Math.ceil(Math.min(count, V_COLUMNS * V_ROWS) / V_COLUMNS));
      return { width: VERTICAL_WIDTH, height: V_FIRST_ROW + (rows - 1) * rowStep(outside) + V_R + (outside ? 18 : 8) };
    },
    slots: (count, _columns, outside) => Array.from({ length: Math.max(0, Math.min(count, V_COLUMNS * V_ROWS)) }, (_, i) => {
      const row = Math.floor(i / V_COLUMNS);
      return { x: xs[i % V_COLUMNS], y: V_FIRST_ROW + row * rowStep(outside), r: V_R, labelBelow: true, row };
    }),
    consumerPath: (s) => {
      const h = n.home;
      const top = s.y - s.r;
      if (!s.row) {
        if (s.x === h.x) return `M${h.x},${h.y + h.r} L${s.x},${top}`;
        const a = edge(h, s.x - h.x, s.y - h.y);
        return `M${a.x},${a.y} C${r1(a.x + (s.x - h.x) * 0.25)},${a.y + 16} ${s.x},${top - 24} ${s.x},${top}`;
      }
      const lx = laneX(s);
      // Spread the starts along home's bottom edge, in the order of the lanes.
      const a = homeBottom(r1(h.x + (lx - h.x) * 0.3));
      return `M${a.x},${a.y} C${a.x},${a.y + 25} ${lx},${V_FIRST_ROW - 50} ${lx},${V_FIRST_ROW - 10}`
        + ` L${lx},${top - 26} C${lx},${top - 8} ${s.x},${top - 18} ${s.x},${top}`;
    },
    consumerRoute: (s) => {
      if (!s.row) return [n.home, s];
      const lx = laneX(s);
      return [n.home, { x: lx, y: V_FIRST_ROW - 10 }, { x: lx, y: s.y - s.r - 26 }, s];
    },
    // Solar is at the left edge, so its sources sit in a narrower row above it.
    solarPills: (k) => pillRow(k, n.solar.x, n.solar.y - n.solar.r - 46, 110),
    bankPills: (k) => pillRow(k, n.battery.x, n.battery.y + n.battery.r + 30, 110),
    flows: {
      ...cross.flows,
      lowCarbonGrid: `M${n.lowCarbon.x - n.lowCarbon.r},${n.lowCarbon.y} L${n.grid.x + n.grid.r},${n.grid.y}`,
    },
    fixedRoutes: [[n.lowCarbon, n.grid], ...cross.routes],
    labels: {
      solar: { x: n.solar.x, y: n.solar.y + n.solar.r + 14, anchor: 'middle' },
      battery: { x: n.battery.x, y: n.battery.y - n.battery.r - 8, anchor: 'middle' },
      grid: { x: n.grid.x - n.grid.r - 6, y: n.grid.y + 4, anchor: 'end' },
    },
    gridArrows: { import: '↓', export: '↑' },
  };
})();

export function geometryFor(layout: LayoutName | undefined): Geometry {
  return layout === 'vertical' ? vertical : horizontal;
}

export { BASE_WIDTH, HEIGHT };

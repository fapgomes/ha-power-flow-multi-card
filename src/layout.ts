export interface Pt { x: number; y: number }
export interface Circle extends Pt { r: number }
/**
 * col: consumer column right of home (−1 for the home column), undefined in normal mode.
 * row: consumer row below home, in the vertical layout.
 */
export interface Slot extends Circle { labelBelow: boolean; col?: number; row?: number }

export const HEIGHT = 430;
export const BASE_WIDTH = 480;

export const NODES = {
  lowCarbon: { x: 50, y: 95, r: 34 },
  grid: { x: 50, y: 210, r: 38 },
  solar: { x: 170, y: 95, r: 38 },
  battery: { x: 170, y: 325, r: 38 },
  home: { x: 290, y: 210, r: 42 },
} satisfies Record<string, Circle>;

export const SOLAR_PILLS_Y = 22;
export const BANK_PILLS_Y = 392;
export const PILLS_MAX_WIDTH = 230;
/** Radius of solar source, battery bank and child consumer pills. */
export const PILL_R = 16;

export const NORMAL_R = 32;
export const SMALL_R = 20;
/** Consumer rows in grid mode, aligned with the solar, home and battery rows. */
const ROWS = { top: 95, mid: 210, bottom: 325 };
const GAP_HOME = 8;
const GAP_COL = 6;
const RIGHT_EDGE = BASE_WIDTH - 2;

export const capacity = (columns: number) => 2 + 3 * columns;
export const modeFor = (count: number): 'normal' | 'small' => (count <= 4 ? 'normal' : 'small');

/**
 * x and radius of each consumer column right of home. Columns keep the normal size while they fit
 * in the base width; otherwise the last columns (smallest consumers) shrink first, down to SMALL_R.
 */
export function columnLayout(columns: number): { xs: number[]; rs: number[]; right: number } {
  const n = Math.max(0, columns);
  const rs = Array<number>(n).fill(NORMAL_R);
  const left = NODES.home.x + NODES.home.r + GAP_HOME;
  const right = () => left + rs.reduce((a, r) => a + 2 * r, 0) + GAP_COL * Math.max(0, n - 1);
  for (let k = n - 1; k >= 0 && right() > RIGHT_EDGE; k--) rs[k] = Math.max(SMALL_R, rs[k] - (right() - RIGHT_EDGE));
  const xs: number[] = [];
  let x = left;
  for (const r of rs) {
    xs.push(x + r);
    x += 2 * r + GAP_COL;
  }
  return { xs, rs, right: right() };
}

export function viewBox(columns: number, _mode: 'normal' | 'small'): { width: number; height: number } {
  return { width: Math.max(BASE_WIDTH, Math.ceil(columnLayout(columns).right) + 2), height: HEIGHT };
}

/** Slot positions for the visible consumers; index 0 is the biggest consumer (closest to home). */
export function consumerSlots(count: number, columns: number): Slot[] {
  const n = Math.max(0, Math.min(count, capacity(columns)));
  if (n <= 4) {
    const normal: Pt[] = [{ x: 290, y: 95 }, { x: 290, y: 325 }, { x: 420, y: 95 }, { x: 420, y: 325 }];
    return normal.slice(0, n).map((p) => ({ ...p, r: NORMAL_R, labelBelow: p.y > NODES.home.y }));
  }
  const slots: Slot[] = [
    { x: 290, y: ROWS.top, r: NORMAL_R, labelBelow: false, col: -1 },
    { x: 290, y: ROWS.bottom, r: NORMAL_R, labelBelow: true, col: -1 },
  ];
  const { xs, rs } = columnLayout(columns);
  xs.forEach((x, k) => {
    const r = rs[k];
    slots.push(
      { x, y: ROWS.mid, r, labelBelow: true, col: k },
      { x, y: ROWS.top, r, labelBelow: false, col: k },
      { x, y: ROWS.bottom, r, labelBelow: true, col: k },
    );
  });
  return slots.slice(0, n);
}

/** Path from the home circle's edge to a consumer slot, routed around other slots. */
export function consumerPath(slot: Slot, _index: number, _columns: number, _count: number): string {
  const h = NODES.home;
  const { x, y, r } = slot;
  if (x === h.x) {
    return y < h.y ? `M${h.x},${h.y - h.r} L${x},${y + r}` : `M${h.x},${h.y + h.r} L${x},${y - r}`;
  }
  if (slot.col === undefined) {
    // Normal mode, right column: out of home, then up/down into the slot.
    const up = y < h.y;
    const sy = up ? h.y - 5 : h.y + 5;
    return `M${h.x + h.r},${sy} C${h.x + 90},${sy} ${x},${up ? h.y - 20 : h.y + 20} ${x},${up ? y + r : y - r}`;
  }
  if (slot.col === 0) {
    // First column: straight from the home edge towards the slot.
    const d = Math.hypot(x - h.x, y - h.y);
    const ux = (x - h.x) / d;
    const uy = (y - h.y) / d;
    const f = (v: number) => Math.round(v * 10) / 10;
    return `M${f(h.x + ux * h.r)},${f(h.y + uy * h.r)} L${f(x - ux * r)},${f(y - uy * r)}`;
  }
  // Further columns: run along a lane in the gap between rows, then turn into the slot.
  const lane = laneY(slot);
  const sy = y > h.y ? h.y + 12 : h.y - 12;
  const sx = Math.round((h.x + Math.sqrt(h.r * h.r - 144)) * 10) / 10;
  const end = y > h.y ? y - r : y < lane ? y + r : y - r;
  return `M${sx},${sy} C${h.x + h.r + 11},${lane} ${h.x + h.r + 26},${lane} ${h.x + LANE_START},${lane} L${x - 15},${lane} Q${x},${lane} ${x},${end}`;
}

/** Distance right of home's centre where the lanes to the second and later columns run straight. */
const LANE_START = NODES.home.r + 41;

/** Height of the lane a path to a slot in the second or later column runs along. */
function laneY(slot: Slot): number {
  const k = slot.col ?? 0;
  if (slot.y === ROWS.mid) return 158 + 5 * (k - 1);
  return slot.y < NODES.home.y ? 145 - 5 * (k - 1) : 268 + 5 * (k - 1);
}

/** Rough polyline of a consumer path, for keeping satellites off it. */
export function consumerRoute(slot: Slot): Pt[] {
  const h = NODES.home;
  if (slot.col === undefined || slot.col <= 0) return [h, slot];
  const lane = laneY(slot);
  return [h, { x: h.x + LANE_START, y: lane }, { x: slot.x, y: lane }, slot];
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Segment { x0: number; y0: number; x1: number; y1: number }
export interface Obstacles { circles: Circle[]; rects: Rect[]; segments: Segment[] }

const SATELLITE_GAP = 10;
const MIN_CLEARANCE = 2;

function segmentDistance(p: Pt, s: Segment): number {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.x0) * dx + (p.y - s.y0) * dy) / len2)) : 0;
  return Math.hypot(p.x - (s.x0 + t * dx), p.y - (s.y0 + t * dy));
}

function clearance(c: Circle, o: Obstacles, bounds: { width: number; height: number }): number {
  let min = Math.min(c.x - c.r, bounds.width - c.x - c.r, c.y - c.r, bounds.height - c.y - c.r);
  for (const b of o.circles) min = Math.min(min, Math.hypot(c.x - b.x, c.y - b.y) - b.r - c.r);
  for (const b of o.rects) {
    const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1);
    const dy = Math.max(b.y0 - c.y, 0, c.y - b.y1);
    min = Math.min(min, Math.hypot(dx, dy) - c.r);
  }
  for (const s of o.segments) min = Math.min(min, segmentDistance(c, s) - c.r - 1);
  return min;
}

/**
 * A small circle of radius r hanging off parent. Tries every 15° starting from the side facing
 * away from `away` (home) and takes the first spot that is clear of the obstacles; if none is,
 * the one with the most room.
 */
export function placeSatellite(parent: Circle, r: number, obstacles: Obstacles, bounds: { width: number; height: number }, away: Pt): Circle {
  const d = parent.r + SATELLITE_GAP + r;
  const base = Math.atan2(parent.y - away.y, parent.x - away.x);
  let best: Circle | undefined;
  let bestClear = -Infinity;
  for (let step = 0; step <= 12; step++) {
    for (const sign of step === 0 ? [1] : [1, -1]) {
      const a = base + (sign * step * Math.PI) / 12;
      const c = { x: Math.round((parent.x + d * Math.cos(a)) * 10) / 10, y: Math.round((parent.y + d * Math.sin(a)) * 10) / 10, r };
      const clear = clearance(c, obstacles, bounds);
      if (clear >= MIN_CLEARANCE) return c;
      if (clear > bestClear) {
        best = c;
        bestClear = clear;
      }
    }
  }
  return best!;
}

/** A centred row of small pills that shrinks to fit maxWidth. */
export function pillRow(n: number, centerX: number, y: number, maxWidth: number): Slot[] {
  const spacing = Math.min(42, maxWidth / Math.max(n, 1));
  const r = Math.min(PILL_R, spacing * 0.4);
  return Array.from({ length: n }, (_, i) => ({ x: centerX + (i - (n - 1) / 2) * spacing, y, r, labelBelow: false }));
}

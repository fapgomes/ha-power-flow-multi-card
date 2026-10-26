import { describe, expect, it } from 'vitest';
import { columnLayout, consumerPath, consumerSlots, NODES, pillRow, placeSatellite, viewBox } from '../src/layout';

describe('consumerSlots', () => {
  it('normal mode up to 4', () => {
    const s = consumerSlots(4, 2);
    expect(s).toHaveLength(4);
    expect(s.every((x) => x.r === 32)).toBe(true);
    expect(s[0]).toMatchObject({ x: 290, y: 95 });
    expect(s.map((x) => [x.x, x.y])).toEqual([[290, 95], [290, 325], [420, 95], [420, 325]]);
  });
  it('grid mode keeps the normal size while it fits, ordered by distance', () => {
    const s = consumerSlots(8, 2);
    expect(s.every((x) => x.r === 32)).toBe(true);
    expect(s.map((x) => [x.x, x.y])).toEqual([
      [290, 95], [290, 325], [364, 210], [364, 95], [364, 325], [434, 210], [434, 95], [434, 325]]);
    expect(consumerSlots(20, 2)).toHaveLength(8);
    expect(consumerSlots(0, 2)).toHaveLength(0);
  });
  it('shrinks the columns with the lowest consumers first', () => {
    expect(columnLayout(2).rs).toEqual([32, 32]);
    expect(columnLayout(3).rs).toEqual([22, 20, 20]);
    for (const cols of [1, 2, 3, 4, 5]) {
      const s = consumerSlots(50, cols);
      for (let i = 1; i < s.length; i++) expect(s[i].r).toBeLessThanOrEqual(s[i - 1].r);
      expect(s.every((x) => x.r >= 20)).toBe(true);
    }
  });
  it('slots do not overlap and fit the viewBox', () => {
    for (const cols of [1, 2, 3, 4, 5]) {
      const s = consumerSlots(50, cols);
      expect(s).toHaveLength(2 + 3 * cols);
      const vb = viewBox(cols, 'small');
      for (const a of s) {
        expect(a.x + a.r).toBeLessThanOrEqual(vb.width);
        expect(a.y - a.r).toBeGreaterThanOrEqual(0);
        expect(a.y + a.r).toBeLessThanOrEqual(vb.height);
        const h = NODES.home;
        expect(Math.hypot(a.x - h.x, a.y - h.y)).toBeGreaterThanOrEqual(a.r + h.r + 4);
        for (const b of s) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + 4);
      }
    }
  });
});

describe('viewBox', () => {
  it('is 480 wide up to 2 columns, wider beyond', () => {
    expect(viewBox(2, 'small')).toEqual({ width: 480, height: 430 });
    expect(viewBox(1, 'normal').width).toBe(480);
    expect(viewBox(3, 'small').width).toBe(480);
    expect(viewBox(4, 'small').width).toBe(512);
  });
});

describe('pillRow', () => {
  it('keeps 35 spacing for few pills', () => {
    const p = pillRow(3, 170, 22, 230);
    expect(p.map((x) => x.x)).toEqual([135, 170, 205]);
    expect(p.every((x) => x.r === 12 && x.y === 22)).toBe(true);
  });
  it('shrinks to fit many pills', () => {
    const p = pillRow(8, 170, 22, 230);
    for (const a of p) {
      expect(a.x - a.r).toBeGreaterThanOrEqual(170 - 115);
      expect(a.x + a.r).toBeLessThanOrEqual(170 + 115);
      for (const b of p) if (a !== b) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(a.r + b.r);
    }
  });
});

describe('consumerPath', () => {
  it('produces valid paths for every slot', () => {
    for (const [count, cols] of [[4, 2], [8, 2], [11, 3], [14, 4]]) {
      consumerSlots(count, cols).forEach((s, i) => {
        const d = consumerPath(s, i, cols, count);
        expect(d.startsWith('M')).toBe(true);
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('undefined');
      });
    }
  });
});

describe('placeSatellite', () => {
  const parent = { x: 290, y: 95, r: 32 };
  const bounds = { width: 480, height: 430 };

  it('prefers the side facing away from home when it is free', () => {
    const p = placeSatellite(parent, 12, { circles: [], rects: [], segments: [] }, bounds, NODES.home);
    expect(p.r).toBe(12);
    expect(p.x).toBeCloseTo(290, 0);
    expect(p.y).toBeLessThan(parent.y - parent.r);
    expect(Math.hypot(p.x - parent.x, p.y - parent.y)).toBeCloseTo(parent.r + 10 + 12, 0);
  });

  it('avoids circles, label boxes, lines and the card edges', () => {
    const obstacles = {
      circles: [{ x: 364, y: 95, r: 32 }],
      rects: [{ x0: 270, y0: 40, x1: 310, y1: 62 }],
      segments: [{ x0: 290, y0: 210, x1: 200, y1: 20 }],
    };
    const p = placeSatellite(parent, 12, obstacles, bounds, NODES.home);
    const clear = (x: number, y: number, r: number) => Math.hypot(p.x - x, p.y - y) - r - p.r;
    expect(clear(364, 95, 32)).toBeGreaterThanOrEqual(2);
    expect(p.x + p.r < 270 || p.x - p.r > 310 || p.y + p.r < 40 || p.y - p.r > 62).toBe(true);
    expect(p.y - p.r).toBeGreaterThanOrEqual(0);
    expect(p.x - p.r).toBeGreaterThanOrEqual(0);
  });

  it('places several satellites without overlapping each other', () => {
    const obstacles = { circles: [] as { x: number; y: number; r: number }[], rects: [], segments: [] };
    const a = placeSatellite(parent, 12, obstacles, bounds, NODES.home);
    obstacles.circles.push(a);
    const b = placeSatellite(parent, 12, obstacles, bounds, NODES.home);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(24);
  });
});

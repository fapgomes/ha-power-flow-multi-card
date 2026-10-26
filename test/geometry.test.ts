import { describe, expect, it } from 'vitest';
import { geometryFor } from '../src/geometry';
import type { Circle, Pt } from '../src/layout';

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe('vertical geometry', () => {
  const g = geometryFor('vertical');
  const { grid, home, solar, battery, lowCarbon } = g.nodes;

  it('puts grid above home and solar left of battery, crossing at the centre', () => {
    expect(grid.x).toBe(home.x);
    expect(grid.y).toBeLessThan(home.y);
    expect(solar.y).toBe(battery.y);
    expect(solar.x).toBeLessThan(grid.x);
    expect(battery.x).toBeGreaterThan(grid.x);
    expect(solar.y).toBeGreaterThan(grid.y + grid.r);
    expect(solar.y).toBeLessThan(home.y - home.r);
    expect(lowCarbon.y).toBe(grid.y);
    expect(lowCarbon.x).toBeGreaterThan(grid.x);
  });

  it('is narrower than the horizontal layout so everything renders bigger', () => {
    expect(g.viewBox(6, 2, false).width).toBeLessThan(geometryFor('horizontal').viewBox(6, 2, false).width);
  });

  it('lays consumers out 3 per row below home, the biggest straight below it', () => {
    const s = g.slots(7, 2, false);
    expect(s).toHaveLength(7);
    expect(s.every((x) => x.r === 32)).toBe(true);
    expect(s[0].x).toBe(home.x);
    expect(s.every((x) => x.y - x.r > home.y + home.r)).toBe(true);
    expect(new Set(s.slice(0, 3).map((x) => x.y)).size).toBe(1);
    expect(s[3].y).toBeGreaterThan(s[0].y);
    expect(s[6].y).toBeGreaterThan(s[3].y);
    expect(g.slots(20, 2, false)).toHaveLength(g.capacity(2));
  });

  it('grows taller with each row and keeps every circle inside', () => {
    const h3 = g.viewBox(3, 2, false).height;
    const h6 = g.viewBox(6, 2, false).height;
    expect(h6).toBeGreaterThan(h3);
    const vb = g.viewBox(9, 2, true);
    for (const x of g.slots(9, 2, true)) {
      expect(x.x - x.r).toBeGreaterThanOrEqual(0);
      expect(x.x + x.r).toBeLessThanOrEqual(vb.width);
      expect(x.y + x.r + 14).toBeLessThanOrEqual(vb.height);
    }
  });

  it('routes every consumer path clear of the other consumer circles', () => {
    const slots = g.slots(12, 2, false);
    slots.forEach((s, i) => {
      const route = g.consumerRoute(s);
      slots.forEach((o: Circle, j) => {
        if (i === j) return;
        for (let k = 1; k < route.length; k++) {
          const a = route[k - 1];
          const b = route[k];
          // The first point is home's centre; only check the part outside home.
          if (k === 1 && a.x === home.x && a.y === home.y) continue;
          expect(distToSegment(o, a, b)).toBeGreaterThan(o.r);
        }
      });
      expect(g.consumerPath(s)).not.toContain('NaN');
    });
  });
});

describe('horizontal geometry', () => {
  it('keeps the current layout', () => {
    const g = geometryFor('horizontal');
    expect(g.nodes.home).toEqual({ x: 290, y: 210, r: 42 });
    expect(g.viewBox(6, 2, false)).toEqual({ width: 480, height: 430 });
    expect(g.capacity(2)).toBe(8);
  });
});

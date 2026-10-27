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

  it('lays consumers out in three staggered columns: middle below home, outer ones beside it', () => {
    const s = g.slots(7, 2, false);
    expect(s).toHaveLength(7);
    expect(s.every((x) => x.r === 32)).toBe(true);
    expect(s[0].x).toBe(home.x);
    expect(s[0].y - s[0].r).toBeGreaterThan(home.y + home.r);
    // The outer columns start beside home, clear of it and of solar, battery and the bank pills.
    for (const x of [s[1], s[2]]) {
      expect(x.y).toBeLessThan(s[0].y);
      expect(Math.hypot(x.x - home.x, x.y - home.y)).toBeGreaterThan(x.r + home.r);
      expect(x.y - x.r).toBeGreaterThan(solar.y + solar.r + 40);
    }
    for (const p of g.bankPills(2)) expect(Math.hypot(s[2].x - p.x, s[2].y - p.y)).toBeGreaterThan(s[2].r + p.r + 8);
    expect(s[1].y).toBe(s[2].y);
    // From the second row on, the outer slots are closer to home than the middle one, so they fill first.
    expect(s[3].x).toBeLessThan(home.x);
    expect(s[4].x).toBeGreaterThan(home.x);
    expect(s[3].y).toBeGreaterThan(s[1].y);
    expect(s[5].y).toBeGreaterThan(s[0].y);
    expect(s[6].y).toBeGreaterThan(s[3].y);
    const d = (x: Circle) => Math.hypot(x.x - home.x, x.y - home.y);
    for (let i = 1; i < s.length; i++) expect(d(s[i])).toBeGreaterThanOrEqual(d(s[i - 1]) - 0.01);
    // Circles in the same column do not touch.
    s.forEach((a, i) => s.forEach((b, j) => {
      if (i < j) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r + 4);
    }));
    expect(g.slots(20, 2, false)).toHaveLength(g.capacity(2));
  });

  it('keeps the height of 8 consumers up to 8, and only grows from the 9th', () => {
    const h8 = g.viewBox(8, 2, false).height;
    expect(h8).toBeLessThanOrEqual(500);
    for (const k of [0, 1, 3, 6, 7]) expect(g.viewBox(k, 2, false).height).toBe(h8);
    expect(g.viewBox(9, 2, false).height).toBeGreaterThan(h8);
    expect(g.viewBox(9, 2, false).height).toBeLessThanOrEqual(560);
  });

  it('grows taller with each row past 8 and keeps every circle inside', () => {
    expect(g.viewBox(12, 2, false).height).toBeGreaterThan(g.viewBox(9, 2, false).height);
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

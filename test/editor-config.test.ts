import { describe, expect, it } from 'vitest';
import {
  bankFromForm, bankToForm, deviceFromForm, deviceToForm, gridFromForm, gridToForm, hexToRgb, moveItem, removeItem,
  replaceItem, rgbToHex, withSection,
} from '../src/editor-config';
import type { CardConfig } from '../src/types';

describe('colours', () => {
  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#29b6f6')).toEqual([41, 182, 246]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(rgbToHex([41, 182, 246])).toBe('#29b6f6');
  });

  it('ignores missing or invalid values', () => {
    expect(hexToRgb(undefined)).toBeUndefined();
    expect(hexToRgb('red')).toBeUndefined();
    expect(rgbToHex(undefined)).toBeUndefined();
    expect(rgbToHex([1, 2])).toBeUndefined();
  });
});

describe('list helpers', () => {
  it('moves, removes and replaces without mutating', () => {
    const a = ['x', 'y', 'z'];
    expect(moveItem(a, 0, 1)).toEqual(['y', 'x', 'z']);
    expect(moveItem(a, 2, -1)).toEqual(['x', 'z', 'y']);
    expect(moveItem(a, 0, -1)).toEqual(['x', 'y', 'z']);
    expect(moveItem(a, 2, 1)).toEqual(['x', 'y', 'z']);
    expect(removeItem(a, 1)).toEqual(['x', 'z']);
    expect(replaceItem(a, 1, 'w')).toEqual(['x', 'w', 'z']);
    expect(a).toEqual(['x', 'y', 'z']);
  });
});

describe('grid form', () => {
  it('round-trips a signed entity', () => {
    const f = gridToForm({ entity: 'sensor.g', invert: true });
    expect(f).toEqual({ mode: 'single', entity: 'sensor.g', invert: true });
    expect(gridFromForm(f)).toEqual({ entity: 'sensor.g', invert: true });
  });

  it('round-trips split entities and drops invert when false', () => {
    const f = gridToForm({ entity: { consumption: 'sensor.i', production: 'sensor.e' } });
    expect(f).toEqual({ mode: 'split', consumption: 'sensor.i', production: 'sensor.e' });
    expect(gridFromForm({ ...f, invert: false })).toEqual({ entity: { consumption: 'sensor.i', production: 'sensor.e' } });
  });

  it('keeps the entity empty (not undefined) when cleared', () => {
    expect(gridFromForm({ mode: 'single' })).toEqual({ entity: '' });
  });
});

describe('bank form', () => {
  it('round-trips a signed bank with every option', () => {
    const b = { power: 'sensor.p', soc: 'sensor.s', name: 'B1', capacity: 5, invert: true };
    expect(bankToForm(b)).toEqual({ mode: 'single', power: 'sensor.p', soc: 'sensor.s', name: 'B1', capacity: 5, invert: true });
    expect(bankFromForm(bankToForm(b))).toEqual(b);
  });

  it('round-trips a charge/discharge bank and drops empty optionals', () => {
    const f = bankToForm({ power: { charge: 'sensor.c', discharge: 'sensor.d' }, soc: 'sensor.s' });
    expect(f.mode).toBe('split');
    expect(bankFromForm({ ...f, name: '', invert: false })).toEqual({ power: { charge: 'sensor.c', discharge: 'sensor.d' }, soc: 'sensor.s' });
  });
});

describe('device form', () => {
  it('stores the colour as rgb in the form and hex in the config', () => {
    const f = deviceToForm({ entity: 'sensor.a', name: 'AC', color: '#e53935', icon: 'mdi:fan' });
    expect(f).toEqual({ entity: 'sensor.a', name: 'AC', color: [229, 57, 53], icon: 'mdi:fan' });
    expect(deviceFromForm(f)).toEqual({ entity: 'sensor.a', name: 'AC', color: '#e53935', icon: 'mdi:fan' });
    expect(deviceFromForm({ entity: 'sensor.a', name: '' })).toEqual({ entity: 'sensor.a' });
  });

  it('keeps the parent', () => {
    expect(deviceToForm({ entity: 'sensor.b', parent: 'sensor.a' })).toEqual({ entity: 'sensor.b', parent: 'sensor.a' });
    expect(deviceFromForm({ entity: 'sensor.b', parent: 'sensor.a' })).toEqual({ entity: 'sensor.b', parent: 'sensor.a' });
  });

  it('keeps a per-device minimum power, including 0', () => {
    expect(deviceToForm({ entity: 'sensor.a', min_power: 0 })).toEqual({ entity: 'sensor.a', min_power: 0 });
    expect(deviceFromForm({ entity: 'sensor.a', min_power: 0 })).toEqual({ entity: 'sensor.a', min_power: 0 });
    expect(deviceFromForm({ entity: 'sensor.a', min_power: 250 })).toEqual({ entity: 'sensor.a', min_power: 250 });
  });
});

describe('withSection', () => {
  const base: CardConfig = { type: 'custom:power-flow-multi-card', grid: { entity: 'sensor.g' }, home: { entity: 'sensor.h' } };

  it('sets and removes sections without touching the rest', () => {
    expect(withSection(base, 'low_carbon', { entity: 'sensor.f' })).toEqual({ ...base, low_carbon: { entity: 'sensor.f' } });
    expect(withSection(base, 'home', undefined)).toEqual({ type: base.type, grid: base.grid });
    expect(base.home).toEqual({ entity: 'sensor.h' });
  });
});

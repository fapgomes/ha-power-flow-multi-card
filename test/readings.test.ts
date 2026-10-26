import { describe, expect, it } from 'vitest';
import { normalizeConfig, readState } from '../src/readings';
import type { CardConfig, HassLike } from '../src/types';

function hass(states: Record<string, [string, string?]>): HassLike {
  const out: HassLike['states'] = {};
  for (const [id, [state, unit]] of Object.entries(states)) {
    out[id] = { state, attributes: unit ? { unit_of_measurement: unit, friendly_name: id } : { friendly_name: id } };
  }
  return { states: out };
}

const base: CardConfig = { type: 'custom:power-flow-multi-card', grid: { entity: 'sensor.grid' } };

describe('grid', () => {
  it('splits a signed entity', () => {
    expect(readState(hass({ 'sensor.grid': ['500', 'W'] }), base)).toMatchObject({ gridImport: 500, gridExport: 0 });
    expect(readState(hass({ 'sensor.grid': ['-300', 'W'] }), base)).toMatchObject({ gridImport: 0, gridExport: 300 });
    const inv = { ...base, grid: { entity: 'sensor.grid', invert: true } };
    expect(readState(hass({ 'sensor.grid': ['500', 'W'] }), inv)).toMatchObject({ gridImport: 0, gridExport: 500 });
  });
  it('reads split entities', () => {
    const c = { ...base, grid: { entity: { consumption: 'sensor.imp', production: 'sensor.exp' } } };
    expect(readState(hass({ 'sensor.imp': ['0.4', 'kW'], 'sensor.exp': ['10', 'W'] }), c))
      .toMatchObject({ gridImport: 400, gridExport: 10 });
  });
  it('unavailable grid is null', () => {
    expect(readState(hass({ 'sensor.grid': ['unavailable'] }), base)).toMatchObject({ gridImport: null, gridExport: null });
  });
});

describe('solar', () => {
  const c: CardConfig = { ...base, solar: { sources: [
    { entity: 'sensor.s1', name: 'Telhado S' }, { entity: 'sensor.s2' }, { entity: 'sensor.s3' }] } };
  it('sums sources', () => {
    const r = readState(hass({ 'sensor.s1': ['1.2', 'kW'], 'sensor.s2': ['800', 'W'], 'sensor.s3': ['500', 'W'] }), c);
    expect(r.solarTotal).toBe(2500);
    expect(r.solarSources[0]).toEqual({ entity: 'sensor.s1', name: 'Telhado S', w: 1200 });
    expect(r.solarSources[1].name).toBe('sensor.s2');
  });
  it('uses the total entity when set', () => {
    const r = readState(hass({ 'sensor.s1': ['1', 'W'], 'sensor.s2': ['1', 'W'], 'sensor.s3': ['1', 'W'], 'sensor.pv': ['2.6', 'kW'] }),
      { ...c, solar: { ...c.solar!, entity: 'sensor.pv' } });
    expect(r.solarTotal).toBe(2600);
  });
  it('counts unavailable sources as 0', () => {
    const r = readState(hass({ 'sensor.s1': ['unavailable'], 'sensor.s2': ['800', 'W'], 'sensor.s3': ['500', 'W'] }), c);
    expect(r.solarSources[0].w).toBeNull();
    expect(r.solarTotal).toBe(1300);
  });
  it('no solar config gives null total', () => {
    expect(readState(hass({}), base).solarTotal).toBeNull();
  });
});

describe('battery', () => {
  const banks = [
    { power: 'sensor.b1', soc: 'sensor.soc1', name: 'Banco 1' },
    { power: 'sensor.b2', soc: 'sensor.soc2' },
  ];
  const states = { 'sensor.b1': ['320', 'W'], 'sensor.b2': ['-290', 'W'], 'sensor.soc1': ['62', '%'], 'sensor.soc2': ['58', '%'] } as Record<string, [string, string?]>;
  it('net power and simple mean soc', () => {
    const r = readState(hass(states), { ...base, battery: { banks } });
    expect(r.batteryNet).toBe(30);
    expect(r.batterySoc).toBe(60);
    expect(r.banks[0]).toEqual({ entity: 'sensor.b1', name: 'Banco 1', w: 320, soc: 62 });
  });
  it('capacity-weighted soc', () => {
    const r = readState(hass(states), { ...base, battery: { banks: [{ ...banks[0], capacity: 5 }, { ...banks[1], capacity: 15 }] } });
    expect(r.batterySoc).toBe(59);
  });
  it('charge/discharge entities', () => {
    const r = readState(hass({ 'sensor.c': ['100', 'W'], 'sensor.d': ['0', 'W'], 'sensor.soc1': ['50'] }),
      { ...base, battery: { banks: [{ power: { charge: 'sensor.c', discharge: 'sensor.d' }, soc: 'sensor.soc1' }] } });
    expect(r.banks[0].w).toBe(-100);
  });
  it('invert flips sign', () => {
    const r = readState(hass(states), { ...base, battery: { banks: [{ ...banks[0], invert: true }] } });
    expect(r.banks[0].w).toBe(-320);
  });
});

describe('consumers and misc', () => {
  it('defaults colour and id', () => {
    const r = readState(hass({ 'sensor.ac': ['900', 'W'] }),
      { ...base, consumers: { devices: [{ entity: 'sensor.ac', name: 'AC' }] } });
    expect(r.consumers[0]).toMatchObject({ id: 'sensor.ac', name: 'AC', color: '#9e9e9e', w: 900 });
  });
  it('fossil and home', () => {
    const r = readState(hass({ 'sensor.f': ['40', '%'], 'sensor.h': ['2.4', 'kW'] }),
      { ...base, low_carbon: { entity: 'sensor.f' }, home: { entity: 'sensor.h' } });
    expect(r.fossilPct).toBe(40);
    expect(r.homeEntityW).toBe(2400);
  });
});

describe('normalizeConfig', () => {
  it('clamps max_visible and fills defaults', () => {
    const c = normalizeConfig({ ...base, consumers: { columns: 1, max_visible: 10, devices: [] } });
    expect(c.consumers).toMatchObject({ columns: 1, max_visible: 5, min_power: 0, sort_margin: 10, sort_hold: 30 });
    expect(normalizeConfig({ ...base, consumers: { devices: [] } }).consumers)
      .toMatchObject({ columns: 2, max_visible: 6 });
  });
  it('requires grid entity', () => {
    expect(() => normalizeConfig({ type: 'x' } as any)).toThrow('grid.entity is required');
  });
});

describe('config validation', () => {
  it('reports readable errors', () => {
    expect(() => normalizeConfig({ ...base, battery: { banks: [{ entity: 'x', soc: 's' } as any] } }))
      .toThrow('battery.banks[0].power is required');
    expect(() => normalizeConfig({ ...base, battery: { banks: [{ power: 'p' } as any] } }))
      .toThrow('battery.banks[0].soc is required');
    expect(() => normalizeConfig({ ...base, solar: { sources: [{ entity: 'a' }, {} as any] } }))
      .toThrow('solar.sources[1].entity is required');
    expect(() => normalizeConfig({ ...base, consumers: { devices: [{} as any] } }))
      .toThrow('consumers.devices[0].entity is required');
  });
});

describe('consumer parents', () => {
  const cfg = (devices: { entity: string; parent?: string }[]) =>
    ({ type: 't', grid: { entity: 'sensor.g' }, consumers: { devices } }) as any;

  it('accepts a parent that is another top-level device', () => {
    expect(() => normalizeConfig(cfg([{ entity: 'sensor.a' }, { entity: 'sensor.b', parent: 'sensor.a' }]))).not.toThrow();
  });

  it('rejects unknown, self and nested parents', () => {
    expect(() => normalizeConfig(cfg([{ entity: 'sensor.b', parent: 'sensor.x' }]))).toThrow('consumers.devices[0].parent');
    expect(() => normalizeConfig(cfg([{ entity: 'sensor.b', parent: 'sensor.b' }]))).toThrow('consumers.devices[0].parent');
    expect(() => normalizeConfig(cfg([{ entity: 'sensor.a' }, { entity: 'sensor.b', parent: 'sensor.a' }, { entity: 'sensor.c', parent: 'sensor.b' }])))
      .toThrow('consumers.devices[2].parent');
  });

  it('passes the parent through readState', () => {
    const c = normalizeConfig(cfg([{ entity: 'sensor.a' }, { entity: 'sensor.b', parent: 'sensor.a' }]));
    const r = readState({ states: {} }, c);
    expect(r.consumers.map((x) => x.parent)).toEqual([undefined, 'sensor.a']);
  });
});


describe('layout', () => {
  const base: CardConfig = { type: 'x', grid: { entity: 'sensor.g' }, consumers: { columns: 2, max_visible: 11, devices: [] } };
  it('caps max_visible at what the layout can show', () => {
    expect(normalizeConfig(structuredClone(base)).consumers!.max_visible).toBe(8);
    expect(normalizeConfig({ ...structuredClone(base), layout: 'vertical' }).consumers!.max_visible).toBe(11);
    expect(normalizeConfig({ ...structuredClone(base), layout: 'vertical', consumers: { max_visible: 30, devices: [] } }).consumers!.max_visible).toBe(12);
  });
});

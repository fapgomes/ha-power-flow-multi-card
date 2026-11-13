import { afterEach, describe, expect, it } from 'vitest';
import '../src/power-flow-multi-card';
import type { CardConfig } from '../src/types';

type Editor = HTMLElement & { setConfig(c: CardConfig): void; hass: unknown; updateComplete: Promise<boolean> };

const base: CardConfig = {
  type: 'custom:power-flow-multi-card',
  grid: { entity: 'sensor.grid' },
  solar: { entity: 'sensor.pv', sources: [{ entity: 'sensor.s1', name: 'S1' }] },
  battery: { banks: [{ power: 'sensor.b1', soc: 'sensor.soc1', invert: true }] },
  consumers: {
    columns: 2, max_visible: 6,
    devices: [{ entity: 'sensor.a', name: 'A', color: '#ff0000' }, { entity: 'sensor.b', name: 'B' }],
  },
};

async function mount(config: CardConfig): Promise<{ el: Editor; changes: CardConfig[] }> {
  const Card = customElements.get('power-flow-multi-card') as unknown as { getConfigElement(): Promise<HTMLElement> };
  const el = (await Card.getConfigElement()) as Editor;
  const changes: CardConfig[] = [];
  el.addEventListener('config-changed', (e) => changes.push((e as CustomEvent).detail.config));
  el.hass = { states: {}, locale: { language: 'pt' } };
  el.setConfig(structuredClone(config));
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, changes };
}

function form(el: Editor, name: string): HTMLElement & { data: Record<string, unknown> } {
  const f = el.shadowRoot!.querySelector(`ha-form[data-form="${name}"]`);
  if (!f) throw new Error(`no form ${name}`);
  return f as HTMLElement & { data: Record<string, unknown> };
}

function change(el: Editor, name: string, value: Record<string, unknown>): void {
  form(el, name).dispatchEvent(new CustomEvent('value-changed', { detail: { value }, bubbles: true, composed: true }));
}

function click(el: Editor, selector: string): void {
  const b = el.shadowRoot!.querySelector(selector) as HTMLElement | null;
  if (!b) throw new Error(`no button ${selector}`);
  b.click();
}

afterEach(() => { document.body.innerHTML = ''; });

function last(changes: CardConfig[]): CardConfig {
  return changes[changes.length - 1];
}

describe('editor', () => {
  it('is returned by getConfigElement and fills the forms from the config', async () => {
    const { el } = await mount(base);
    expect(el.tagName.toLowerCase()).toBe('power-flow-multi-card-editor');
    expect(form(el, 'grid').data).toEqual({ mode: 'single', entity: 'sensor.grid' });
    expect(form(el, 'bank-0').data).toMatchObject({ mode: 'single', power: 'sensor.b1', invert: true });
    expect(form(el, 'device-0').data).toMatchObject({ color: [255, 0, 0] });
  });

  it('switches the grid to split entities', async () => {
    const { el, changes } = await mount(base);
    change(el, 'grid', { mode: 'split', consumption: 'sensor.i', production: 'sensor.e' });
    expect(last(changes).grid).toEqual({ entity: { consumption: 'sensor.i', production: 'sensor.e' } });
    expect(last(changes).solar).toEqual(base.solar);
  });

  it('keeps the grid name options when the grid entity changes', async () => {
    const { el, changes } = await mount(base);
    expect(form(el, 'grid-name').data).toEqual({ show_name: true, name_inside: true });
    change(el, 'grid-name', { show_name: true, name_inside: false });
    expect(last(changes).grid).toEqual({ ...base.grid, name_inside: false });
    change(el, 'grid', { mode: 'single', entity: 'sensor.other' });
    expect(last(changes).grid).toEqual({ entity: 'sensor.other', name_inside: false });
  });

  it('stores home.show_consumers only when turned off', async () => {
    const { el, changes } = await mount(base);
    expect(form(el, 'home').data).toMatchObject({ show_consumers: true });
    change(el, 'home', { show_consumers: false });
    expect(last(changes).home).toEqual({ show_consumers: false });
    change(el, 'home', { entity: 'sensor.house', show_consumers: true });
    expect(last(changes).home).toEqual({ entity: 'sensor.house' });
  });

  it('stores the layout only when vertical', async () => {
    const { el, changes } = await mount(base);
    expect(form(el, 'layout').data).toEqual({ layout: 'horizontal', bold: false });
    change(el, 'layout', { layout: 'vertical' });
    expect(last(changes).layout).toBe('vertical');
    change(el, 'layout', { layout: 'horizontal' });
    expect(last(changes)).not.toHaveProperty('layout');
    change(el, 'layout', { layout: 'horizontal', bold: true });
    expect(last(changes).bold).toBe(true);
    change(el, 'layout', { layout: 'horizontal', bold: false });
    expect(last(changes)).not.toHaveProperty('bold');
  });

  it('adds and removes optional sections', async () => {
    const { el, changes } = await mount(base);
    change(el, 'low_carbon', { entity: 'sensor.fossil' });
    expect(last(changes).low_carbon).toEqual({ entity: 'sensor.fossil' });
    change(el, 'low_carbon', { entity: 'sensor.fossil', show_name: true, name_inside: false });
    expect(last(changes).low_carbon).toEqual({ entity: 'sensor.fossil', name_inside: false });
    change(el, 'low_carbon', {});
    expect(last(changes)).not.toHaveProperty('low_carbon');
  });

  it('edits, adds, moves and removes consumers', async () => {
    const { el, changes } = await mount(base);
    change(el, 'device-1', { entity: 'sensor.b', name: 'B', color: [0, 0, 255] });
    expect(last(changes).consumers!.devices[1]).toEqual({ entity: 'sensor.b', name: 'B', color: '#0000ff' });

    await el.updateComplete;
    click(el, '[data-list="devices"][data-action="add"]');
    expect(last(changes).consumers!.devices).toHaveLength(3);
    expect(last(changes).consumers!.devices[2].entity).toBe('');

    await el.updateComplete;
    click(el, '[data-list="devices"][data-index="0"][data-action="down"]');
    expect(last(changes).consumers!.devices.map((d) => d.name)).toEqual(['B', 'A', undefined]);

    await el.updateComplete;
    click(el, '[data-list="devices"][data-index="2"][data-action="remove"]');
    expect(last(changes).consumers!.devices.map((d) => d.name)).toEqual(['B', 'A']);
  });

  it('offers only other top-level devices as parent', async () => {
    const cfg = structuredClone(base);
    cfg.consumers!.devices.push({ entity: 'sensor.c', parent: 'sensor.a' });
    const { el } = await mount(cfg);
    const schema = (form(el, 'device-1') as any).schema as { name: string; selector: any }[];
    expect(schema.find((s) => s.name === 'parent')!.selector.entity.include_entities).toEqual(['sensor.a']);
  });

  it('keeps consumer settings and drops cleared ones', async () => {
    const { el, changes } = await mount(base);
    change(el, 'consumers', { columns: 3, min_power: 0 });
    const c = last(changes).consumers!;
    expect(c).toEqual({ columns: 3, min_power: 0, devices: base.consumers!.devices });
  });

  it('keeps show_idle_sources only when enabled', async () => {
    const { el, changes } = await mount(base);
    change(el, 'solar', { entity: 'sensor.pv', show_idle_sources: true });
    expect(last(changes).solar).toEqual({ ...base.solar, show_idle_sources: true });
    change(el, 'solar', { entity: 'sensor.pv', show_idle_sources: false });
    expect(last(changes).solar).toEqual(base.solar);
  });

  it('stores the name and percentage options only when turned off', async () => {
    const { el, changes } = await mount(base);
    expect(form(el, 'consumers').data).toMatchObject({ show_name: true, name_inside: true, show_percent: true });
    change(el, 'consumers', { ...form(el, 'consumers').data, show_name: false });
    expect(last(changes).consumers).toMatchObject({ show_name: false });
    change(el, 'consumers', { ...form(el, 'consumers').data, name_inside: false, show_percent: false });
    expect(last(changes).consumers).toMatchObject({ name_inside: false, show_percent: false });
    change(el, 'consumers', { ...form(el, 'consumers').data, name_inside: true, show_percent: true });
    expect(last(changes).consumers).not.toHaveProperty('name_inside');
    expect(last(changes).consumers).not.toHaveProperty('show_percent');
    change(el, 'solar', { entity: 'sensor.pv', name_inside: false });
    expect(last(changes).solar).toEqual({ ...base.solar, name_inside: false });
    change(el, 'battery', { name_inside: false });
    expect(last(changes).battery).toEqual({ ...base.battery, name_inside: false });
    change(el, 'battery', { name_inside: true, show_name: false });
    expect(last(changes).battery).toEqual({ ...base.battery, show_name: false });
    change(el, 'battery', { ...form(el, 'battery').data, grid_link: false });
    expect(last(changes).battery).toMatchObject({ banks: base.battery!.banks, grid_link: false });
    change(el, 'battery', { ...form(el, 'battery').data, grid_link: true });
    expect(last(changes).battery).not.toHaveProperty('grid_link');
    expect(form(el, 'solar').data).toMatchObject({ show_name: true });
  });

  it('edits the battery actions and keeps them through other changes', async () => {
    const names = (el: Editor) => (form(el, 'battery-actions') as unknown as { schema: { name: string }[] }).schema.map((s) => s.name);
    const { el, changes } = await mount(base);
    // Tap defaults to more-info of the first bank's power; the others do nothing.
    expect(form(el, 'battery-actions').data).toEqual({ tap: 'more-info', hold: 'none', double_tap: 'none' });
    expect(names(el)).toEqual(['tap', 'tap_entity', 'hold', 'double_tap']);
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, hold: 'more-info' });
    expect(last(changes).battery).toEqual({ ...base.battery, hold_action: { action: 'more-info' } });
    await el.updateComplete;
    expect(names(el)).toContain('hold_entity');
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, hold_entity: 'sensor.soc_all' });
    const hold_action = { action: 'more-info', entity: 'sensor.soc_all' };
    expect(last(changes).battery).toEqual({ ...base.battery, hold_action });
    await el.updateComplete;
    // Other battery options and bank edits keep it.
    change(el, 'battery', { ...form(el, 'battery').data, name_inside: false });
    expect(last(changes).battery).toEqual({ ...base.battery, name_inside: false, hold_action });
    await el.updateComplete;
    change(el, 'bank-0', { mode: 'single', power: 'sensor.b1', soc: 'sensor.soc1', capacity: 10 });
    expect(last(changes).battery).toMatchObject({ hold_action, banks: [{ capacity: 10 }] });
    await el.updateComplete;
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, tap: 'navigate', tap_path: '/lovelace-energia/solar', double_tap: 'url', double_tap_path: 'https://example.com' });
    expect(last(changes).battery).toMatchObject({
      hold_action, tap_action: { action: 'navigate', navigation_path: '/lovelace-energia/solar' },
      double_tap_action: { action: 'url', url_path: 'https://example.com' },
    });
    await el.updateComplete;
    expect(names(el)).toEqual(['tap', 'tap_path', 'hold', 'hold_entity', 'double_tap', 'double_tap_path']);
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, tap: 'none', hold: 'none', double_tap: 'none' });
    expect(last(changes).battery).toMatchObject({ tap_action: { action: 'none' } });
    expect(last(changes).battery).not.toHaveProperty('hold_action');
    expect(last(changes).battery).not.toHaveProperty('double_tap_action');
    await el.updateComplete;
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, tap: 'more-info' });
    expect(last(changes).battery).not.toHaveProperty('tap_action');
  });

  it('edits the actions of a bank and keeps them through other changes', async () => {
    const names = (el: Editor) => (form(el, 'bank-0-actions') as unknown as { schema: { name: string; helper?: string }[] }).schema;
    const { el, changes } = await mount(base);
    const bank = base.battery!.banks[0];
    expect(form(el, 'bank-0-actions').data).toEqual({ tap: 'more-info', hold: 'none', double_tap: 'none' });
    expect(names(el).find((s) => s.name === 'tap_entity')!.helper).toBe('h_bank_tap_entity');
    const panel = el.shadowRoot!.querySelector('ha-expansion-panel[data-panel="bank-0-actions"]') as HTMLElement & { header: string; expanded?: boolean };
    expect(panel.header).toBe('Interações');
    expect(panel.expanded).toBeFalsy();
    change(el, 'bank-0-actions', { ...form(el, 'bank-0-actions').data, hold: 'navigate', hold_path: '/lovelace-energia/bateria' });
    const hold_action = { action: 'navigate', navigation_path: '/lovelace-energia/bateria' };
    expect(last(changes).battery).toEqual({ banks: [{ ...bank, hold_action }] });
    await el.updateComplete;
    // Editing the bank's entities or the battery keeps it.
    change(el, 'bank-0', { ...form(el, 'bank-0').data, capacity: 10 });
    expect(last(changes).battery!.banks[0]).toEqual({ ...bank, capacity: 10, hold_action });
    await el.updateComplete;
    change(el, 'battery-actions', { ...form(el, 'battery-actions').data, double_tap: 'more-info' });
    expect(last(changes).battery).toEqual({ banks: [{ ...bank, capacity: 10, hold_action }], double_tap_action: { action: 'more-info' } });
    await el.updateComplete;
    change(el, 'bank-0-actions', { ...form(el, 'bank-0-actions').data, tap: 'none', hold: 'none' });
    expect(last(changes).battery!.banks[0]).toEqual({ ...bank, capacity: 10, tap_action: { action: 'none' } });
    await el.updateComplete;
    change(el, 'bank-0-actions', { ...form(el, 'bank-0-actions').data, tap: 'more-info' });
    expect(last(changes).battery!.banks[0]).toEqual({ ...bank, capacity: 10 });
  });

  it('keeps the banks and the battery actions in collapsed panels', async () => {
    const { el } = await mount(base);
    const panel = (key: string) => el.shadowRoot!.querySelector(`[data-panel="battery"] ha-expansion-panel[data-panel="${key}"]`) as (HTMLElement & { header: string; expanded?: boolean }) | null;
    expect(panel('banks')!.header).toBe('Bancos (1)');
    expect(panel('banks')!.querySelector('ha-form[data-form="bank-0"]')).not.toBeNull();
    expect(panel('banks')!.expanded).toBeFalsy();
    expect(panel('actions')!.header).toBe('Interações');
    expect(panel('actions')!.expanded).toBeFalsy();
  });

  it('removes the solar section when the total and every source are gone', async () => {
    const { el, changes } = await mount({ ...base, solar: { sources: [{ entity: 'sensor.s1' }] } });
    click(el, '[data-list="sources"][data-index="0"][data-action="remove"]');
    expect(last(changes)).not.toHaveProperty('solar');
  });

  it('edits a battery bank', async () => {
    const { el, changes } = await mount(base);
    change(el, 'bank-0', { mode: 'split', charge: 'sensor.c', discharge: 'sensor.d', soc: 'sensor.soc1', capacity: 5 });
    expect(last(changes).battery!.banks[0]).toEqual({ power: { charge: 'sensor.c', discharge: 'sensor.d' }, soc: 'sensor.soc1', capacity: 5 });
  });

  it('takes the capacity of a bank from a typed value or from a sensor', async () => {
    const names = (el: Editor) => (form(el, 'bank-0') as unknown as { schema: { name: string }[] }).schema.map((s) => s.name);
    const { el, changes } = await mount(base);
    expect(form(el, 'bank-0').data).toMatchObject({ capacity_mode: 'value' });
    expect(names(el)).toContain('capacity');
    change(el, 'bank-0', { ...form(el, 'bank-0').data, capacity_mode: 'entity' });
    await el.updateComplete;
    expect(names(el)).toContain('capacity_entity');
    expect(names(el)).not.toContain('capacity');
    change(el, 'bank-0', { ...form(el, 'bank-0').data, capacity_entity: 'sensor.cap' });
    expect(last(changes).battery!.banks[0]).toEqual({ ...base.battery!.banks[0], capacity: 'sensor.cap' });
    await el.updateComplete;
    change(el, 'bank-0', { ...form(el, 'bank-0').data, capacity_mode: 'value' });
    expect(last(changes).battery!.banks[0]).toEqual(base.battery!.banks[0]);
  });

  it('does not throw on an incomplete config', async () => {
    const { el } = await mount({ type: 'custom:power-flow-multi-card' } as CardConfig);
    expect(form(el, 'grid').data).toEqual({ mode: 'single' });
  });
});

describe('getStubConfig', () => {
  it('picks a grid power sensor so the card picker preview works', () => {
    const Card = customElements.get('power-flow-multi-card') as unknown as { getStubConfig(h?: unknown): CardConfig };
    const states = {
      'sensor.temp': { state: '20', attributes: { device_class: 'temperature' } },
      'sensor.pc_power': { state: '80', attributes: { device_class: 'power' } },
      'sensor.grid_power': { state: '300', attributes: { device_class: 'power' } },
    };
    expect(Card.getStubConfig({ states }).grid.entity).toBe('sensor.grid_power');
    expect(Card.getStubConfig({ states: { 'sensor.pc_power': states['sensor.pc_power'] } }).grid.entity).toBe('sensor.pc_power');
    expect(Card.getStubConfig().grid.entity).toBeTruthy();
  });
});

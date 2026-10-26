import { afterEach, describe, expect, it } from 'vitest';
import '../src/power-flow-multi-card';
import type { CardConfig, HassLike } from '../src/types';

type Card = HTMLElement & { setConfig(c: CardConfig): void; hass: HassLike; updateComplete: Promise<boolean> };

function hass(states: Record<string, string>): HassLike {
  const out: HassLike['states'] = {};
  for (const [id, v] of Object.entries(states)) {
    out[id] = { state: v, attributes: { unit_of_measurement: id.includes('soc') || id.includes('fossil') ? '%' : 'W', friendly_name: id } };
  }
  return { states: out };
}

const full: CardConfig = {
  type: 'custom:power-flow-multi-card',
  grid: { entity: 'sensor.grid' },
  low_carbon: { entity: 'sensor.fossil' },
  solar: { sources: [{ entity: 'sensor.s1', name: 'Telhado S' }, { entity: 'sensor.s2' }, { entity: 'sensor.s3' }] },
  battery: { banks: [{ power: 'sensor.b1', soc: 'sensor.soc1' }, { power: 'sensor.b2', soc: 'sensor.soc2' }] },
  consumers: {
    columns: 2, max_visible: 6, min_power: 5,
    devices: ['ac', 'forno', 'mlr', 'frig', 'tv', 'pc', 'router'].map((n, i) => ({ entity: `sensor.${n}`, name: n, color: i === 0 ? '#e53935' : undefined })),
  },
};

const fullStates = {
  'sensor.grid': '320', 'sensor.fossil': '40', 'sensor.s1': '1200', 'sensor.s2': '800', 'sensor.s3': '500',
  'sensor.b1': '-320', 'sensor.b2': '-290', 'sensor.soc1': '62', 'sensor.soc2': '58',
  'sensor.ac': '900', 'sensor.forno': '600', 'sensor.mlr': '300', 'sensor.frig': '150', 'sensor.tv': '90', 'sensor.pc': '80', 'sensor.router': '25',
};

async function mount(config: CardConfig, states: Record<string, string>): Promise<Card> {
  const el = document.createElement('power-flow-multi-card') as Card;
  el.setConfig(config);
  el.hass = hass(states);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}
const q = (el: Card, sel: string) => Array.from(el.shadowRoot!.querySelectorAll(sel));

afterEach(() => { document.body.innerHTML = ''; });

describe('power-flow-multi-card', () => {
  it('renders sources, banks and top consumers in grid mode at normal size', async () => {
    const el = await mount(full, fullStates);
    expect(q(el, '[data-node="solar-source"]')).toHaveLength(3);
    expect(q(el, '[data-node="solar-source"] text.value').every((t) => /^\d+(\.\d)? k?W$/.test(t.textContent!.trim()))).toBe(true);
    expect(q(el, '[data-node="bank"]')).toHaveLength(2);
    const consumers = q(el, '[data-node="consumer"]');
    expect(consumers).toHaveLength(6);
    for (const c of consumers) expect(c.querySelector('circle')!.getAttribute('r')).toBe('32');
  });

  it('uses normal size with 4 or fewer consumers on', async () => {
    const el = await mount(full, { ...fullStates, 'sensor.frig': '0', 'sensor.tv': '0', 'sensor.pc': '0', 'sensor.router': '0' });
    const consumers = q(el, '[data-node="consumer"]');
    expect(consumers).toHaveLength(3);
    for (const c of consumers) expect(c.querySelector('circle')!.getAttribute('r')).toBe('32');
  });

  it('hides a consumer below its own min_power even when above the global one', async () => {
    const cfg = structuredClone(full);
    cfg.consumers!.devices[0] = { ...cfg.consumers!.devices[0], min_power: 1000 };
    const el = await mount(cfg, fullStates);
    const titles = q(el, '[data-node="consumer"] title').map((t) => t.textContent);
    expect(titles.some((t) => t!.startsWith('ac:'))).toBe(false);
    expect(titles).toHaveLength(6);
  });

  it('hides the solar sources when solar is idle, unless show_idle_sources is set', async () => {
    const night = { ...fullStates, 'sensor.s1': '0', 'sensor.s2': 'unavailable', 'sensor.s3': '1' };
    let el = await mount(full, night);
    expect(q(el, '[data-node="solar-source"]')).toHaveLength(0);
    expect(q(el, '[data-flow="solar-source"]')).toHaveLength(0);
    expect(q(el, '[data-node="solar"]')).toHaveLength(1);
    document.body.innerHTML = '';
    el = await mount({ ...full, solar: { ...full.solar!, show_idle_sources: true } }, night);
    expect(q(el, '[data-node="solar-source"] text.value').map((t) => t.textContent!.trim())).toEqual(['0 W', '0 W', '1 W']);
  });

  it('draws the vertical layout: grid above home, solar left of battery, consumers in rows below home', async () => {
    const el = await mount({ ...full, layout: 'vertical' }, fullStates);
    const centre = (kind: string) => {
      const c = q(el, `[data-node="${kind}"] circle`)[0];
      return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) };
    };
    const [grid, home, solar, battery] = ['grid', 'home', 'solar', 'battery'].map(centre);
    expect(grid.x).toBe(home.x);
    expect(grid.y).toBeLessThan(home.y);
    expect(solar.y).toBe(battery.y);
    expect(solar.x).toBeLessThan(battery.x);
    const consumers = q(el, '[data-node="consumer"] circle').map((c) => Number(c.getAttribute('cy')));
    expect(consumers).toHaveLength(6);
    expect(consumers.every((y) => y > home.y + home.r)).toBe(true);
    expect(el.shadowRoot!.querySelector('svg')!.getAttribute('viewBox')).toMatch(/^0 0 376 /);
    expect(q(el, '[data-node="grid"] text.value').map((t) => t.textContent!.trim())).toContain('Grid');
  });

  it('puts names inside the circles by default', async () => {
    const el = await mount(full, fullStates);
    const values = (sel: string) => q(el, `${sel} text.value`).map((t) => t.textContent!.trim());
    expect(q(el, '[data-node="consumer"] text.label')).toHaveLength(0);
    expect(values('[data-node="consumer"]')).toContain('ac');
    expect(values('[data-node="solar"]')).toContain('Solar');
    expect(values('[data-node="battery"]')).toContain('Battery');
    expect(q(el, 'text.label').map((t) => t.textContent)).not.toContain('Solar');
    expect(q(el, 'text.label').map((t) => t.textContent)).not.toContain('Battery');
  });

  it('hides the Solar and Battery names when show_name is false', async () => {
    const el = await mount({ ...full, solar: { ...full.solar!, show_name: false }, battery: { ...full.battery!, show_name: false } }, fullStates);
    const all = q(el, 'text').map((t) => t.textContent!.trim());
    expect(all).not.toContain('Solar');
    expect(all).not.toContain('Battery');
  });

  it('draws bigger grid, low-carbon and home circles with bigger text', async () => {
    const el = await mount(full, fullStates);
    const r = (kind: string) => Number(q(el, `[data-node="${kind}"] circle`)[0].getAttribute('r'));
    expect(r('grid')).toBe(38);
    expect(r('low-carbon')).toBe(34);
    expect(r('home')).toBe(40);
    expect(q(el, '[data-node="grid"] text.value').map((t) => t.getAttribute('font-size'))).toEqual(['11', '11', '9']);
    expect(q(el, '[data-node="home"] text.value')[0].getAttribute('font-size')).toBe('13');
  });

  it('draws bigger Solar and Battery circles with readable names', async () => {
    const el = await mount(full, fullStates);
    for (const kind of ['solar', 'battery']) {
      const n = q(el, `[data-node="${kind}"]`)[0];
      expect(Number(n.querySelector('circle')!.getAttribute('r'))).toBe(38);
      const name = Array.from(n.querySelectorAll('text.value')).find((t) => /Solar|Battery/.test(t.textContent!))!;
      expect(Number(name.getAttribute('font-size'))).toBeGreaterThanOrEqual(9);
    }
  });

  it('hides consumer names when show_name is false and shows one while hovering its circle', async () => {
    const el = await mount({ ...full, consumers: { ...full.consumers!, show_name: false } }, fullStates);
    const consumer = q(el, '[data-node="consumer"]')[0];
    expect(Array.from(consumer.querySelectorAll('text')).map((t) => t.textContent!.trim())).toEqual(['900 W']);
    expect(q(el, '[data-hover-name]')).toHaveLength(0);
    consumer.dispatchEvent(new Event('pointerenter'));
    await el.updateComplete;
    expect(q(el, '[data-hover-name] text').map((t) => t.textContent)).toEqual(['ac']);
    consumer.dispatchEvent(new Event('pointerleave'));
    await el.updateComplete;
    expect(q(el, '[data-hover-name]')).toHaveLength(0);
  });

  it('writes Grid inside its circle by default, outside or not at all by option', async () => {
    const gridTexts = async (grid: CardConfig['grid']) => {
      document.body.innerHTML = '';
      const el = await mount({ ...full, grid }, fullStates);
      return {
        inside: q(el, '[data-node="grid"] text.value').map((t) => t.textContent!.trim()).includes('Grid'),
        outside: q(el, 'text.label').map((t) => t.textContent).includes('Grid'),
      };
    };
    expect(await gridTexts({ entity: 'sensor.grid' })).toEqual({ inside: true, outside: false });
    expect(await gridTexts({ entity: 'sensor.grid', name_inside: false })).toEqual({ inside: false, outside: true });
    expect(await gridTexts({ entity: 'sensor.grid', show_name: false })).toEqual({ inside: false, outside: false });
  });

  it('puts names outside when name_inside is false', async () => {
    const cfg = { ...full, solar: { ...full.solar!, name_inside: false }, battery: { ...full.battery!, name_inside: false },
      consumers: { ...full.consumers!, name_inside: false } };
    const el = await mount(cfg, fullStates);
    expect(q(el, '[data-node="consumer"] text.label').map((t) => t.textContent)).toContain('ac');
    expect(q(el, '[data-node="solar"] text.value').map((t) => t.textContent!.trim())).not.toContain('Solar');
    expect(q(el, 'text.label').map((t) => t.textContent)).toEqual(expect.arrayContaining(['Solar', 'Battery']));
  });

  it('shows each child share as a ring arc on the parent and a percentage on the pill', async () => {
    const cfg = structuredClone(full);
    cfg.consumers!.devices[5] = { ...cfg.consumers!.devices[5], parent: 'sensor.ac' };
    let el = await mount(cfg, fullStates);
    expect(q(el, '[data-ring="child"]')).toHaveLength(1);
    expect(q(el, '[data-node="child"] text.value').map((t) => t.textContent!.trim())).toEqual(['80 W', '9%']);
    document.body.innerHTML = '';
    cfg.consumers!.show_percent = false;
    el = await mount(cfg, fullStates);
    expect(q(el, '[data-ring="child"]')).toHaveLength(1);
    expect(q(el, '[data-node="child"] text.value').map((t) => t.textContent!.trim())).toEqual(['80 W']);
  });

  it('shows a child consumer as a pill on its parent, outside the ranking', async () => {
    const cfg = structuredClone(full);
    cfg.consumers!.devices[5] = { ...cfg.consumers!.devices[5], parent: 'sensor.ac' };
    const el = await mount(cfg, fullStates);
    const titles = q(el, '[data-node="consumer"] title').map((t) => t.textContent!.split(':')[0]);
    expect(titles).toEqual(['ac', 'forno', 'mlr', 'frig', 'tv', 'router']);
    const child = q(el, '[data-node="child"]');
    expect(child).toHaveLength(1);
    expect(child[0].querySelector('title')!.textContent).toBe('pc: 80 W');
    expect(child[0].querySelector('circle')!.getAttribute('r')).toBe('16');
    expect(child[0].querySelector('text.value')!.textContent!.trim()).toBe('80 W');
    expect(q(el, '[data-flow="child"]')).toHaveLength(1);
    expect(q(el, '[data-dot="child-0-0"]')).toHaveLength(1);
  });

  it('hides a child that is off or whose parent is not visible', async () => {
    const cfg = structuredClone(full);
    cfg.consumers!.devices[5] = { ...cfg.consumers!.devices[5], parent: 'sensor.ac' };
    expect(q(await mount(cfg, { ...fullStates, 'sensor.pc': '0' }), '[data-node="child"]')).toHaveLength(0);
    document.body.innerHTML = '';
    cfg.consumers!.devices[0] = { ...cfg.consumers!.devices[0], min_power: 1000 };
    expect(q(await mount(cfg, fullStates), '[data-node="child"]')).toHaveLength(0);
  });

  it('centres the icon and a single value vertically in the circle', async () => {
    const el = await mount(full, fullStates);
    const home = q(el, '[data-node="home"]')[0];
    const cy = 210;
    const iconTop = Number(home.querySelector('foreignObject')!.getAttribute('y'));
    const baseline = Number(home.querySelector('text.value')!.getAttribute('y'));
    expect(Math.abs((cy - iconTop) - (baseline - cy))).toBeLessThanOrEqual(1);
  });

  it('keeps the Solar and Battery names close to their circles when they go outside', async () => {
    const el = await mount({ ...full, solar: { ...full.solar!, name_inside: false }, battery: { ...full.battery!, name_inside: false } }, fullStates);
    for (const [name, c] of [['Solar', { x: 170, y: 95 }], ['Battery', { x: 170, y: 325 }]] as const) {
      const t = q(el, 'text.label').find((x) => x.textContent === name)!;
      const d = Math.hypot(Number(t.getAttribute('x')) - c.x, Number(t.getAttribute('y')) - c.y);
      expect(d).toBeLessThanOrEqual(38 + 14);
    }
  });

  it('points the grid arrows the way the energy goes in each layout', async () => {
    const gridTexts = async (layout?: 'vertical') => {
      document.body.innerHTML = '';
      const el = await mount({ ...full, layout }, fullStates);
      return q(el, '[data-node="grid"] text.value').map((t) => t.textContent!.trim()).slice(0, 2);
    };
    expect(await gridTexts()).toEqual(['← 0 W', '→ 320 W']);
    expect(await gridTexts('vertical')).toEqual(['↑ 0 W', '↓ 320 W']);
  });

  it('sizes each child arc by its share of the whole parent', async () => {
    const cfg = structuredClone(full);
    cfg.consumers!.devices[4] = { ...cfg.consumers!.devices[4], parent: 'sensor.ac' };
    cfg.consumers!.devices[5] = { ...cfg.consumers!.devices[5], parent: 'sensor.ac' };
    const el = await mount(cfg, { ...fullStates, 'sensor.ac': '1000', 'sensor.tv': '200', 'sensor.pc': '500' });
    const arcs = Array.from(q(el, '[data-ring="child"]')[0].querySelectorAll('circle')).slice(1);
    const share = (c: Element) => {
      const [, , len, circ] = c.getAttribute('stroke-dasharray')!.split(' ').map(Number);
      return Math.round((len / circ) * 100);
    };
    expect(arcs.map(share)).toEqual([20, 50]);
  });

  it('shows the visible consumers as an inner ring on home, unless home.show_consumers is false', async () => {
    let el = await mount(full, fullStates);
    const ring = q(el, '[data-ring="home"]');
    expect(ring).toHaveLength(1);
    // Background circle plus one arc per visible consumer.
    expect(ring[0].querySelectorAll('circle')).toHaveLength(1 + 6);
    expect(Array.from(ring[0].querySelectorAll('circle')).slice(1).map((c) => c.getAttribute('stroke'))[0]).toBe('#e53935');
    document.body.innerHTML = '';
    el = await mount({ ...full, home: { show_consumers: false } }, fullStates);
    expect(q(el, '[data-ring="home"]')).toHaveLength(0);
  });

  it('marks discharge with an up arrow and charge with a down arrow', async () => {
    const texts = async (b1: string, b2: string) => {
      document.body.innerHTML = '';
      const el = await mount(full, { ...fullStates, 'sensor.b1': b1, 'sensor.b2': b2 });
      return q(el, '[data-node="battery"] text.value').map((t) => t.textContent!.trim());
    };
    expect(await texts('-320', '-290')).toEqual(expect.arrayContaining(['↑ 0 W', '↓ 610 W']));
    expect(await texts('500', '317')).toEqual(expect.arrayContaining(['↑ 817 W', '↓ 0 W']));
  });

  it('shows the battery SoC above an icon that follows the charge, with the flows below', async () => {
    const el = await mount(full, fullStates);
    const b = q(el, '[data-node="battery"]')[0];
    const icon = b.querySelector('ha-icon') as HTMLElement & { icon: string };
    expect(icon.icon).toBe('mdi:battery-60');
    const fo = b.querySelector('foreignObject')!;
    const texts = Array.from(b.querySelectorAll('text.value'));
    expect(texts.map((t) => t.getAttribute('font-size'))).toEqual(['11', '11', '11', '9']);
    expect(texts[3].textContent!.trim()).toBe('Battery');
    expect(Number(texts[3].getAttribute('y'))).toBeLessThan(325 + 38 - 4);
    const iconTop = Number(fo.getAttribute('y'));
    const iconBottom = iconTop + Number(fo.getAttribute('height'));
    expect(Number(texts[0].getAttribute('y'))).toBeLessThan(iconTop);
    expect(Number(texts[1].getAttribute('y')) - 7).toBeGreaterThan(iconBottom);
  });

  it('omits optional sections cleanly', async () => {
    const el = await mount({ type: 'custom:power-flow-multi-card', grid: { entity: 'sensor.grid' } }, { 'sensor.grid': '100' });
    expect(q(el, '[data-node="battery"]')).toHaveLength(0);
    expect(q(el, '[data-node="solar"]')).toHaveLength(0);
    expect(q(el, '[data-node="low-carbon"]')).toHaveLength(0);
    expect(q(el, '[data-node="home"]')).toHaveLength(1);
    expect(el.shadowRoot!.innerHTML).not.toContain('NaN');
  });

  it('shows a dash for unavailable entities', async () => {
    const el = await mount(full, { ...fullStates, 'sensor.grid': 'unavailable' });
    expect(q(el, '[data-node="grid"]')[0].textContent).toContain('—');
    expect(el.shadowRoot!.innerHTML).not.toContain('NaN');
  });

  it('applies consumer colour to circle and path', async () => {
    const el = await mount(full, fullStates);
    const ac = q(el, '[data-node="consumer"]')[0];
    expect(ac.querySelector('circle')!.getAttribute('stroke')).toBe('#e53935');
    expect(q(el, 'path[data-flow="consumer"]')[0].getAttribute('stroke')).toBe('#e53935');
  });

  it('opens more-info on tap', async () => {
    const el = await mount(full, fullStates);
    let detail: any;
    el.addEventListener('hass-more-info', (e) => { detail = (e as CustomEvent).detail; });
    (q(el, '[data-node="solar-source"]')[0] as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(detail).toEqual({ entityId: 'sensor.s1' });
  });

  it('only animates flows above zero', async () => {
    const el = await mount(full, fullStates);
    // grid import 320 → grid-to-home dot exists; nothing exported → no solar-to-grid dot
    expect(q(el, '[data-dot="grid-home"]')).toHaveLength(1);
    expect(q(el, '[data-dot="solar-grid"]')).toHaveLength(0);
  });

  it('rejects config without grid', () => {
    const el = document.createElement('power-flow-multi-card') as Card;
    expect(() => el.setConfig({ type: 'x' } as any)).toThrow('grid.entity is required');
  });
});

describe('review fixes (card)', () => {
  it('hides unavailable consumers and truncates long names', async () => {
    const cfg: CardConfig = { ...full, consumers: { ...full.consumers!, name_inside: false, devices: [
      { entity: 'sensor.ac', name: 'Ar Condicionado da Sala' }, { entity: 'sensor.forno', name: 'Forno' }, { entity: 'sensor.dead', name: 'Dead' }] } };
    const el = await mount(cfg, { ...fullStates, 'sensor.dead': 'unavailable' });
    const consumers = q(el, '[data-node="consumer"]');
    expect(consumers).toHaveLength(2);
    expect(consumers[0].querySelector('text.label')!.textContent).toBe('Ar Condicionado…');
    expect(consumers[0].querySelector('title')!.textContent).toContain('Ar Condicionado da Sala');
  });
});

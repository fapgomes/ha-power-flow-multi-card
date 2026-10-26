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
    const cfg: CardConfig = { ...full, consumers: { ...full.consumers!, devices: [
      { entity: 'sensor.ac', name: 'Ar Condicionado da Sala' }, { entity: 'sensor.forno', name: 'Forno' }, { entity: 'sensor.dead', name: 'Dead' }] } };
    const el = await mount(cfg, { ...fullStates, 'sensor.dead': 'unavailable' });
    const consumers = q(el, '[data-node="consumer"]');
    expect(consumers).toHaveLength(2);
    expect(consumers[0].querySelector('text.label')!.textContent).toBe('Ar Condicionado…');
    expect(consumers[0].querySelector('title')!.textContent).toContain('Ar Condicionado da Sala');
  });
});

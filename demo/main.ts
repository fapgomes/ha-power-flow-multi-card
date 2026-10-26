import '../src/power-flow-multi-card';
import type { CardConfig, HassLike } from '../src/types';

const COLORS = ['#e53935', '#fb8c00', '#8e24aa', '#1e88e5', '#43a047', '#6d4c41', '#00acc1', '#fdd835', '#d81b60', '#3949ab'];
const NAMES = ['AC', 'Forno', 'Máq. Roupa', 'Frigorífico', 'TV', 'PC', 'Router', 'Luzes', 'Piscina', 'Carro',
  'Micro-ondas', 'Placa', 'Secador', 'Aquecedor', 'Bomba', 'Escritório', 'Câmaras', 'Piso 0', 'Piso 2', 'Garagem'];
const devices = NAMES.map((name, i) => ({
  entity: `sensor.dev_${i}`, name, color: COLORS[i % COLORS.length], icon: 'mdi:flash',
}));

const base: Omit<CardConfig, 'consumers'> = {
  type: 'custom:power-flow-multi-card',
  grid: { entity: 'sensor.grid_power' },
  low_carbon: { entity: 'sensor.grid_fossil_fuel_percentage' },
  solar: { sources: [
    { entity: 'sensor.pv_telhado_s', name: 'Telhado S' },
    { entity: 'sensor.pv_telhado_e', name: 'Telhado E' },
    { entity: 'sensor.pv_garagem', name: 'Garagem' },
  ] },
  battery: { banks: [
    { power: 'sensor.bat1_power', soc: 'sensor.bat1_soc', name: 'Banco 1', capacity: 5 },
    { power: 'sensor.bat2_power', soc: 'sensor.bat2_soc', name: 'Banco 2', capacity: 5 },
  ] },
};

const configs: Record<string, CardConfig> = {
  c4: { ...base, consumers: { columns: 2, max_visible: 4, min_power: 5, sort_hold: 10, devices: devices.slice(0, 4) } },
  c6: { ...base, consumers: { columns: 2, max_visible: 6, min_power: 5, sort_hold: 10, devices } },
  c8: { ...base, consumers: { columns: 2, max_visible: 8, min_power: 5, sort_hold: 10, devices } },
};

const values: Record<string, number> = {};
devices.forEach((d, i) => { values[d.entity] = Math.max(0, 1000 / (i + 1) - 20); });

function makeHass(): HassLike {
  const jitter = (x: number, pct = 0.25) => Math.max(0, x * (1 + (Math.random() - 0.5) * pct));
  for (const d of devices) values[d.entity] = jitter(values[d.entity] || 30, 0.6);
  const pv = [jitter(1200), jitter(800), jitter(500)];
  const consumption = devices.reduce((a, d) => a + values[d.entity], 0);
  const bat = [-(jitter(320)), -(jitter(290))];
  const grid = consumption - pv.reduce((a, b) => a + b, 0) - bat.reduce((a, b) => a + b, 0);
  const s = (state: number | string, unit = 'W') => ({ state: String(typeof state === 'number' ? state.toFixed(1) : state), attributes: { unit_of_measurement: unit } });
  const states: HassLike['states'] = {
    'sensor.grid_power': s(grid),
    'sensor.grid_fossil_fuel_percentage': s(35, '%'),
    'sensor.pv_telhado_s': s(pv[0] / 1000, 'kW'),
    'sensor.pv_telhado_e': s(pv[1]),
    'sensor.pv_garagem': s(pv[2]),
    'sensor.bat1_power': s(bat[0]),
    'sensor.bat2_power': s(bat[1]),
    'sensor.bat1_soc': s(62, '%'),
    'sensor.bat2_soc': s(58, '%'),
  };
  for (const d of devices) states[d.entity] = s(values[d.entity]);
  return { states };
}

const cards = Object.entries(configs).map(([id, cfg]) => {
  const el = document.createElement('power-flow-multi-card') as HTMLElement & { setConfig(c: CardConfig): void; hass: HassLike };
  el.setConfig(cfg);
  document.getElementById(id)!.appendChild(el);
  return el;
});

function tick() {
  const h = makeHass();
  for (const c of cards) c.hass = h;
}
tick();
setInterval(tick, 2000);

import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import {
  bankFromForm, bankToForm, compact, deviceFromForm, deviceToForm, gridFromForm, gridToForm, moveItem, removeItem,
  replaceItem, withSection, type BankForm, type DeviceForm, type GridForm,
} from './editor-config';
import type { BankConfig, CardConfig, DeviceConfig, HassLike, SolarSourceConfig } from './types';

type EditorHass = HassLike & { locale?: { language?: string }; language?: string };
type Schema = Record<string, unknown> & { name: string };
type Data = Record<string, any>;

const MDI = {
  up: 'M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z',
  down: 'M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z',
  remove: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  add: 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z',
};

/** Colours handed to new consumers, so each one starts distinguishable. */
const PALETTE = ['#29b6f6', '#ef5350', '#ff7043', '#ab47bc', '#d4e157', '#26a69a', '#ec407a', '#7e57c2', '#ffca28', '#8d6e63'];

const TEXT = {
  en: {
    grid: 'Grid', low_carbon: 'Low-carbon', home: 'Home', solar: 'Solar', battery: 'Battery', consumers: 'Consumers',
    sources: 'Sources', banks: 'Banks', devices: 'Devices', add: 'Add', up: 'Move up', down: 'Move down', remove: 'Remove',
    new_item: 'New', mode: 'Power entities', single: 'One signed entity', split: 'Two entities',
    entity: 'Entity', grid_entity: 'Grid power', consumption: 'Import', production: 'Export', invert: 'Invert sign',
    fossil: 'Fossil fuel percentage', home_entity: 'Home consumption (optional)', solar_total: 'Total production (optional)',
    power: 'Power', charge: 'Charge power', discharge: 'Discharge power', soc: 'State of charge', name: 'Name',
    capacity: 'Capacity', icon: 'Icon', color: 'Colour', columns: 'Columns', max_visible: 'Maximum visible',
    min_power: 'Minimum power', sort_margin: 'Overtake margin', sort_hold: 'Overtake delay',
    h_grid: '+ import, − export', h_power: '+ discharge, − charge', h_home: 'Computed from the flows when empty',
    h_solar: 'Sum of the sources when empty', show_idle: 'Show sources when solar is idle',
    h_idle: 'By default the source pills are hidden while solar is below 10 W', h_min_power: 'Consumers below this are hidden',
    h_sort: 'A consumer only overtakes another after beating it by this margin for this long',
    h_device_min: 'Overrides the global minimum power when set',
    parent: 'Parent', h_parent: 'Shown as a small pill on the parent, whose value already includes this one',
  },
  pt: {
    grid: 'Rede', low_carbon: 'Low-carbon', home: 'Casa', solar: 'Solar', battery: 'Bateria', consumers: 'Consumos',
    sources: 'Fontes', banks: 'Bancos', devices: 'Aparelhos', add: 'Adicionar', up: 'Subir', down: 'Descer', remove: 'Remover',
    new_item: 'Novo', mode: 'Entidades de potência', single: 'Uma entidade com sinal', split: 'Duas entidades',
    entity: 'Entidade', grid_entity: 'Potência da rede', consumption: 'Importação', production: 'Exportação',
    invert: 'Inverter sinal', fossil: 'Percentagem de combustíveis fósseis', home_entity: 'Consumo da casa (opcional)',
    solar_total: 'Produção total (opcional)', power: 'Potência', charge: 'Potência de carga',
    discharge: 'Potência de descarga', soc: 'Estado de carga', name: 'Nome', capacity: 'Capacidade', icon: 'Ícone',
    color: 'Cor', columns: 'Colunas', max_visible: 'Máximo visível', min_power: 'Potência mínima',
    sort_margin: 'Margem para ultrapassar', sort_hold: 'Tempo para ultrapassar',
    h_grid: '+ importação, − exportação', h_power: '+ descarga, − carga', h_home: 'Se vazio, é calculado pelos fluxos',
    h_solar: 'Se vazio, é a soma das fontes', show_idle: 'Mostrar fontes com o solar parado',
    h_idle: 'Por omissão, as fontes ficam escondidas enquanto o solar está abaixo de 10 W', h_min_power: 'Os consumos abaixo disto não aparecem',
    h_sort: 'Um consumo só ultrapassa outro se o superar por esta margem durante este tempo',
    h_device_min: 'Se preenchida, substitui a potência mínima global',
    parent: 'Mãe', h_parent: 'Aparece como pastilha na mãe, cujo valor já inclui este',
  },
};
type Key = keyof typeof TEXT.en;

const sensor = { entity: { filter: { domain: 'sensor' } } };

function powerSchema(mode: string | undefined, single: Schema[], split: Schema[], t: (k: Key) => string): Schema[] {
  return [
    {
      name: 'mode',
      selector: { select: { mode: 'box', options: [{ value: 'single', label: t('single') }, { value: 'split', label: t('split') }] } },
    },
    ...(mode === 'split' ? split : single),
  ];
}

export class PowerFlowMultiCardEditor extends LitElement {
  @property({ attribute: false }) hass?: EditorHass;
  @state() private config?: CardConfig;

  setConfig(config: CardConfig): void {
    this.config = config;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void loadHaForm();
  }

  private t = (key: Key): string => {
    const lang = this.hass?.locale?.language ?? this.hass?.language ?? 'en';
    return (lang.startsWith('pt') ? TEXT.pt : TEXT.en)[key];
  };

  private emit(config: CardConfig): void {
    this.config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private form(name: string, data: Data, schema: Schema[], onChange: (v: Data) => void, labels: Partial<Record<string, Key>> = {}): TemplateResult {
    return html`<ha-form
      data-form=${name}
      .hass=${this.hass}
      .data=${data}
      .schema=${schema}
      .computeLabel=${(s: Schema) => this.t(labels[s.name] ?? (s.name as Key))}
      .computeHelper=${(s: Schema) => (s.helper ? this.t(s.helper as Key) : undefined)}
      @value-changed=${(e: CustomEvent) => { e.stopPropagation(); onChange(e.detail.value ?? {}); }}
    ></ha-form>`;
  }

  private list<T>(key: string, items: T[], title: (item: T) => string, body: (item: T, i: number) => TemplateResult,
    onChange: (items: T[]) => void, create: () => T): TemplateResult {
    const button = (action: keyof typeof MDI, i: number, disabled = false, fn: () => void) => html`<ha-icon-button
      data-list=${key} data-index=${i} data-action=${action} .label=${this.t(action)} .path=${MDI[action]}
      ?disabled=${disabled} @click=${fn}></ha-icon-button>`;
    return html`
      <div class="list-title">${this.t(key as Key)}</div>
      ${items.map((item, i) => html`<div class="item">
        <div class="item-header">
          <span>${i + 1}. ${title(item) || this.t('new_item')}</span>
          ${button('up', i, i === 0, () => onChange(moveItem(items, i, -1)))}
          ${button('down', i, i === items.length - 1, () => onChange(moveItem(items, i, 1)))}
          ${button('remove', i, false, () => onChange(removeItem(items, i)))}
        </div>
        ${body(item, i)}
      </div>`)}
      <button class="add" data-list=${key} data-action="add" @click=${() => onChange([...items, create()])}>
        <ha-svg-icon .path=${MDI.add}></ha-svg-icon>${this.t('add')}
      </button>`;
  }

  private name(entity: string | undefined, name: string | undefined): string {
    return name || (entity && this.hass?.states[entity]?.attributes?.friendly_name) || entity || '';
  }

  private panel(key: Key, icon: string, content: TemplateResult): TemplateResult {
    return html`<ha-expansion-panel outlined .header=${this.t(key)} data-panel=${key}>
      <ha-icon slot="leading-icon" .icon=${icon}></ha-icon>
      <div class="content">${content}</div>
    </ha-expansion-panel>`;
  }

  protected render() {
    const cfg = this.config;
    if (!cfg) return nothing;
    const t = this.t;
    const solar: NonNullable<CardConfig['solar']> = cfg.solar ?? { sources: [] };
    const sources = solar.sources ?? [];
    const banks = cfg.battery?.banks ?? [];
    const consumers = cfg.consumers ?? { devices: [] };
    const devices = consumers.devices ?? [];
    const { devices: _d, ...settings } = consumers;

    const setSolar = (patch: { entity?: string; sources?: SolarSourceConfig[]; show_idle_sources?: boolean }) => {
      const next = { entity: solar.entity, sources, show_idle_sources: solar.show_idle_sources, ...patch };
      const list = next.sources ?? [];
      this.emit(withSection(cfg, 'solar', next.entity || list.length
        ? { ...compact({ entity: next.entity, show_idle_sources: next.show_idle_sources }), sources: list } : undefined));
    };
    const setBanks = (list: BankConfig[]) => this.emit(withSection(cfg, 'battery', list.length ? { banks: list } : undefined));
    const setConsumers = (s: Data, list: DeviceConfig[]) => {
      const kept = compact(s);
      this.emit(withSection(cfg, 'consumers', list.length || Object.keys(kept).length ? { ...kept, devices: list } : undefined));
    };

    const grid = gridToForm(cfg.grid);
    const gridSchema = powerSchema(grid.mode, [{ name: 'entity', selector: sensor, helper: 'h_grid' }],
      [{ name: 'consumption', selector: sensor }, { name: 'production', selector: sensor }], t)
      .concat({ name: 'invert', selector: { boolean: {} } });

    const bankSchema = (f: BankForm): Schema[] => [
      { name: 'name', selector: { text: {} } },
      ...powerSchema(f.mode, [{ name: 'power', selector: sensor, helper: 'h_power' }],
        [{ name: 'charge', selector: sensor }, { name: 'discharge', selector: sensor }], t),
      { name: 'soc', selector: sensor },
      { name: 'capacity', selector: { number: { min: 0, step: 0.1, mode: 'box', unit_of_measurement: 'kWh' } } },
      { name: 'invert', selector: { boolean: {} } },
    ];
    const deviceSchema: Schema[] = [
      { name: 'entity', selector: sensor },
      { name: 'name', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
      { name: 'color', selector: { color_rgb: {} } },
      { name: 'min_power', selector: { number: { min: 0, mode: 'box', unit_of_measurement: 'W' } }, helper: 'h_device_min' },
    ];
    // A child can hang from any other top-level device (one level only).
    const withParent = (d: DeviceConfig): Schema[] => [...deviceSchema, {
      name: 'parent',
      selector: { entity: { include_entities: devices.filter((o) => o.entity && o.entity !== d.entity && !o.parent).map((o) => o.entity) } },
      helper: 'h_parent',
    }];
    const number = (min: number, max: number | undefined, unit: string) =>
      ({ number: { min, ...(max === undefined ? {} : { max }), mode: 'box', unit_of_measurement: unit } });
    const consumerSchema: Schema[] = [
      { name: 'columns', selector: number(1, 6, '') },
      { name: 'max_visible', selector: number(0, 20, '') },
      { name: 'min_power', selector: number(0, undefined, 'W'), helper: 'h_min_power' },
      { name: 'sort_margin', selector: number(0, 100, '%'), helper: 'h_sort' },
      { name: 'sort_hold', selector: number(0, 600, 's') },
    ];

    return html`
      ${this.panel('grid', 'mdi:transmission-tower', html`
        ${this.form('grid', grid, gridSchema, (v) => this.emit(withSection(cfg, 'grid', gridFromForm(v as GridForm))), { entity: 'grid_entity' })}
        ${this.form('low_carbon', compact({ entity: cfg.low_carbon?.entity }), [{ name: 'entity', selector: sensor }],
          (v) => this.emit(withSection(cfg, 'low_carbon', v.entity ? { entity: v.entity } : undefined)), { entity: 'fossil' })}`)}

      ${this.panel('solar', 'mdi:solar-power', html`
        ${this.form('solar', compact({ entity: solar.entity, show_idle_sources: solar.show_idle_sources }),
          [{ name: 'entity', selector: sensor, helper: 'h_solar' }, { name: 'show_idle_sources', selector: { boolean: {} }, helper: 'h_idle' }],
          (v) => setSolar({ entity: v.entity, show_idle_sources: v.show_idle_sources }), { entity: 'solar_total', show_idle_sources: 'show_idle' })}
        ${this.list<SolarSourceConfig>('sources', sources, (s) => this.name(s.entity, s.name),
          (s, i) => this.form(`source-${i}`, compact({ entity: s.entity, name: s.name, icon: s.icon }), deviceSchema.slice(0, 3),
            (v) => setSolar({ sources: replaceItem(sources, i, { entity: v.entity ?? '', ...compact({ name: v.name, icon: v.icon }) }) })),
          (list) => setSolar({ sources: list }), () => ({ entity: '' }))}`)}

      ${this.panel('battery', 'mdi:battery-high', this.list<BankConfig>('banks', banks, (b) => b.name || (typeof b.power === 'string' ? this.name(b.power, undefined) : ''),
        (b, i) => { const f = bankToForm(b); return this.form(`bank-${i}`, f, bankSchema(f), (v) => setBanks(replaceItem(banks, i, bankFromForm(v as BankForm)))); },
        setBanks, () => ({ power: '', soc: '' })))}

      ${this.panel('home', 'mdi:home', this.form('home', compact({ entity: cfg.home?.entity }), [{ name: 'entity', selector: sensor, helper: 'h_home' }],
        (v) => this.emit(withSection(cfg, 'home', v.entity ? { entity: v.entity } : undefined)), { entity: 'home_entity' }))}

      ${this.panel('consumers', 'mdi:power-plug', html`
        ${this.form('consumers', settings, consumerSchema, (v) => setConsumers(v, devices))}
        ${this.list<DeviceConfig>('devices', devices, (d) => this.name(d.entity, d.name),
          (d, i) => this.form(`device-${i}`, deviceToForm(d), withParent(d),
            (v) => setConsumers(settings, replaceItem(devices, i, deviceFromForm(v as DeviceForm)))),
          (list) => setConsumers(settings, list), () => ({ entity: '', color: PALETTE[devices.length % PALETTE.length] }))}`)}
    `;
  }

  static styles = css`
    ha-expansion-panel {
      display: block;
      margin-bottom: 8px;
    }
    .content {
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .list-title {
      font-weight: 500;
      margin-top: 4px;
    }
    .item {
      border: 1px solid var(--divider-color, #444);
      border-radius: 8px;
      padding: 4px 8px 8px;
    }
    .item-header {
      display: flex;
      align-items: center;
      gap: 0;
    }
    .item-header span {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .add {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1px solid var(--primary-color, #03a9f4);
      border-radius: 18px;
      background: none;
      color: var(--primary-color, #03a9f4);
      font: inherit;
      cursor: pointer;
    }
  `;
}

/** ha-form is lazy-loaded by HA; opening a built-in card editor makes sure it is defined. */
async function loadHaForm(): Promise<void> {
  if (customElements.get('ha-form')) return;
  const load = (window as unknown as { loadCardHelpers?: () => Promise<any> }).loadCardHelpers;
  if (!load) return;
  try {
    const helpers = await load();
    const card = await helpers.createCardElement({ type: 'tile', entity: 'sun.sun' });
    await card.constructor.getConfigElement?.();
  } catch {
    // The editor still works once HA loads ha-form itself.
  }
}

if (!customElements.get('power-flow-multi-card-editor')) {
  customElements.define('power-flow-multi-card-editor', PowerFlowMultiCardEditor);
}

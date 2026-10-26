# Power Flow Multi Card

Card Lovelace para Home Assistant inspirado no
[power-flow-card-plus](https://github.com/flixlix/power-flow-card-plus), com:

- **várias fontes solares**: um círculo grande com o total e uma pastilha por fonte;
- **várias baterias / bancos**: um círculo grande com o SoC e a potência líquida, e uma pastilha por banco;
- **muitos consumos**: só aparecem os que mais consomem, numa grelha com número de colunas
  configurável, cada um com a sua cor, e com uma ordenação estável (não "dançam").

Os fluxos entre rede, solar, bateria e casa são calculados com os totais. O card nunca atribui
fluxos a um painel ou banco individual.

## Instalação

**HACS (repositório custom):** HACS → ⋮ → Custom repositories → URL deste repositório,
categoria *Dashboard*. O HACS procura `power-flow-multi-card.js` nos assets da release do GitHub
(ou em `dist/` no repositório), por isso cada release tem de ter o ficheiro compilado anexado.

**Manual:**

1. `npm ci && npm run build`
2. Copiar `dist/power-flow-multi-card.js` para `/config/www/`
3. Definições → Painéis → ⋮ → Recursos → adicionar `/local/power-flow-multi-card.js` como
   *JavaScript module*

## Configuração

O card tem editor visual (secções Rede, Solar, Bateria, Casa e Consumos, com listas para
adicionar, ordenar e remover fontes, bancos e aparelhos). Tudo o que o editor faz também se pode
escrever em YAML:

```yaml
type: custom:power-flow-multi-card
grid:
  entity: sensor.grid_power          # + importação, − exportação
  # ou: entity: { consumption: sensor.grid_import, production: sensor.grid_export }
  invert: false
low_carbon:
  entity: sensor.grid_fossil_fuel_percentage
solar:
  entity: sensor.pv_total            # opcional; por omissão soma das fontes
  sources:
    - entity: sensor.pv_telhado_s
      name: Telhado S
    - entity: sensor.pv_telhado_e
      name: Telhado E
    - entity: sensor.pv_garagem
      name: Garagem
battery:
  banks:
    - power: sensor.bat1_power       # + descarga, − carga (ou {charge, discharge})
      soc: sensor.bat1_soc
      name: Banco 1
      capacity: 5                    # kWh, opcional
    - power: sensor.bat2_power
      soc: sensor.bat2_soc
      name: Banco 2
home:
  entity: sensor.house_power         # opcional
consumers:
  columns: 2
  max_visible: 6
  min_power: 5
  sort_margin: 10
  sort_hold: 30
  devices:
    - entity: sensor.ac_power
      name: AC
      color: "#e53935"
      icon: mdi:air-conditioner
    - entity: sensor.forno_power
      name: Forno
      color: "#fb8c00"
      min_power: 50                  # opcional; substitui consumers.min_power
    - entity: sensor.ev_charger_power
      name: EV Charger
      parent: sensor.forno_power     # opcional; aparece como pastilha no aparelho-mãe
```

### Opções

| Opção | Por omissão | Descrição |
|---|---|---|
| `grid.entity` | obrigatório | Entidade com sinal (+ importação) ou `{consumption, production}` |
| `grid.invert` | `false` | Inverte o sinal da rede |
| `low_carbon.entity` | — | Percentagem de combustíveis fósseis da rede; low-carbon = importação × (1 − %) |
| `solar.entity` | soma das fontes | Total de produção solar |
| `solar.sources[]` | — | `entity`, `name`, `icon` por fonte |
| `battery.banks[]` | — | `power` (+ descarga) ou `{charge, discharge}`, `soc`, `name`, `capacity` (kWh), `invert` |
| `home.entity` | calculado | Consumo da casa; por omissão é o balanço dos fluxos |
| `consumers.columns` | `2` | Colunas da grelha à direita da casa |
| `consumers.max_visible` | `6` | Máximo de consumos visíveis (limitado a `2 + 3 × columns`) |
| `consumers.min_power` | `0` | Abaixo disto (W) o consumo não aparece |
| `consumers.sort_margin` | `10` | % que um consumo tem de ultrapassar outro para trocar de lugar |
| `consumers.sort_hold` | `30` | Segundos que essa diferença tem de durar antes de trocar |
| `consumers.devices[]` | — | `entity`, `name`, `color`, `icon`, `min_power` (W, substitui o global para esse aparelho), `parent` (entidade de outro aparelho; ver abaixo) |

### Layout dos consumos

- **Até 4 visíveis:** como no original. Um por cima da casa, um por baixo e dois na coluna da
  direita, com círculos de tamanho normal.
- **Mais de 4:** grelha com a coluna da casa (por cima e por baixo) e `columns` colunas à direita,
  cada uma pela ordem meio, cima, baixo. Quanto maior o consumo, mais perto da casa. Os círculos
  mantêm o tamanho normal enquanto cabem nos 480 px (até 2 colunas); com mais colunas, encolhem
  primeiro as colunas dos consumos mais pequenos.

### Consumos filhos

Um aparelho com `parent` está pendurado noutro (por exemplo, o carregador EV no circuito do
Piso 0). O valor da mãe já inclui o da filha, por isso a filha:

- não entra no ranking nem ocupa lugar na grelha;
- aparece como uma pastilha pequena agarrada à mãe, com linha e bolinhas, quando a mãe está
  visível e a filha passa a sua potência mínima;
- fica no primeiro lugar livre à volta da mãe, começando pelo lado oposto à casa.

Só há um nível: a mãe não pode ser filha de outro aparelho.

As potências aceitam `W`, `kW` e `MW` (lidas de `unit_of_measurement`).

## Desenvolvimento

```bash
npm install
npm test          # testes unitários (vitest)
npm run dev       # página de demonstração com dados simulados
npm run build     # gera dist/power-flow-multi-card.js
```

## Apoiar o projeto

Se este projeto te for útil, considera pagar-me um café para o ajudar a continuar:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-fapgomes-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/fapgomes)

## Licença

[GPL-3.0](LICENSE).

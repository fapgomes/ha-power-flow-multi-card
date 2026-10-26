# Power Flow Multi Card

Lovelace card for Home Assistant inspired by
[power-flow-card-plus](https://github.com/flixlix/power-flow-card-plus), with:

- **multiple solar sources**: a large circle with the total and a small pill per source;
- **multiple batteries / banks**: a large circle with the SoC and net power, and a pill per bank;
- **many consumers**: only the biggest ones are shown, in a grid with a configurable number of
  columns, each with its own colour, and with a stable order (they don't "dance" around);
- **child consumers**: a device that is part of another one (e.g. an EV charger on a floor
  circuit) is drawn as a small pill attached to its parent.

Flows between grid, solar, battery and home are computed from the totals. The card never
attributes flows to an individual panel or bank.

## Installation

**HACS (custom repository):** HACS → ⋮ → Custom repositories → this repository's URL, category
*Dashboard*. HACS downloads `power-flow-multi-card.js` from the GitHub release assets, so every
release has the built file attached.

**Manual:**

1. `npm ci && npm run build`
2. Copy `dist/power-flow-multi-card.js` to `/config/www/`
3. Settings → Dashboards → ⋮ → Resources → add `/local/power-flow-multi-card.js` as a
   *JavaScript module*

## Configuration

The card has a visual editor (Grid, Solar, Battery, Home and Consumers sections, with lists to
add, reorder and remove sources, banks and devices). Everything the editor does can also be
written in YAML:

```yaml
type: custom:power-flow-multi-card
grid:
  entity: sensor.grid_power          # + import, − export
  # or: entity: { consumption: sensor.grid_import, production: sensor.grid_export }
  invert: false
low_carbon:
  entity: sensor.grid_fossil_fuel_percentage
solar:
  entity: sensor.pv_total            # optional; defaults to the sum of the sources
  sources:
    - entity: sensor.pv_roof_south
      name: Roof S
    - entity: sensor.pv_roof_east
      name: Roof E
    - entity: sensor.pv_garage
      name: Garage
battery:
  banks:
    - power: sensor.bat1_power       # + discharge, − charge (or {charge, discharge})
      soc: sensor.bat1_soc
      name: Bank 1
      capacity: 5                    # kWh, optional
    - power: sensor.bat2_power
      soc: sensor.bat2_soc
      name: Bank 2
home:
  entity: sensor.house_power         # optional
consumers:
  columns: 2
  max_visible: 6
  min_power: 5
  sort_margin: 10
  sort_hold: 30
  devices:
    - entity: sensor.ground_floor_power
      name: Ground floor
      color: "#e53935"
      icon: mdi:home-floor-0
    - entity: sensor.oven_power
      name: Oven
      color: "#fb8c00"
      min_power: 50                  # optional; overrides consumers.min_power
    - entity: sensor.ev_charger_power
      name: EV Charger
      parent: sensor.ground_floor_power  # optional; shown as a pill on the parent
```

### Options

| Option | Default | Description |
|---|---|---|
| `grid.entity` | required | Signed entity (+ import) or `{consumption, production}` |
| `grid.invert` | `false` | Inverts the grid sign |
| `low_carbon.entity` | — | Grid fossil fuel percentage; low-carbon = import × (1 − %) |
| `solar.entity` | sum of the sources | Total solar production |
| `solar.sources[]` | — | `entity`, `name`, `icon` per source |
| `battery.banks[]` | — | `power` (+ discharge) or `{charge, discharge}`, `soc`, `name`, `capacity` (kWh), `invert` |
| `home.entity` | computed | Home consumption; defaults to the balance of the flows |
| `consumers.columns` | `2` | Grid columns to the right of home |
| `consumers.max_visible` | `6` | Maximum visible consumers (capped at `2 + 3 × columns`) |
| `consumers.min_power` | `0` | Consumers below this (W) are hidden |
| `consumers.sort_margin` | `10` | % by which a consumer must beat another to swap places |
| `consumers.sort_hold` | `30` | Seconds that difference must last before swapping |
| `consumers.devices[]` | — | `entity`, `name`, `color`, `icon`, `min_power` (W, overrides the global one for this device), `parent` (entity of another device; see below) |

### Consumer layout

- **Up to 4 visible:** as in the original. One above home, one below, and two in the right
  column, at normal size.
- **More than 4:** a grid with the home column (above and below) and `columns` columns to the
  right, each filled middle, top, bottom. The bigger the consumer, the closer to home. Circles keep
  the normal size while they fit in 480 px (up to 2 columns); with more columns, the columns with
  the smallest consumers shrink first.

### Child consumers

A device with `parent` hangs off another one (for example, the EV charger on the ground floor
circuit). The parent's value already includes the child's, so the child:

- stays out of the ranking and takes no slot in the grid;
- is drawn as a small pill attached to the parent, with a line and moving dots, when the parent is
  visible and the child is above its minimum power;
- sits at the first free spot around the parent, starting on the side facing away from home.

There is only one level: a parent cannot be a child of another device.

Power values accept `W`, `kW` and `MW` (read from `unit_of_measurement`).

## Development

```bash
npm install
npm test          # unit tests (vitest)
npm run dev       # demo page with simulated data
npm run build     # builds dist/power-flow-multi-card.js
```

## Support the project

If this project is useful to you, consider buying me a coffee to help keep it going:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-fapgomes-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/fapgomes)

## License

[GPL-3.0](LICENSE).

import { css } from 'lit';

export const COLORS = {
  solar: '#ff9800',
  gridImport: '#488fc2',
  gridExport: '#a280db',
  batteryDischarge: '#f06292',
  batteryCharge: '#4db6ac',
  lowCarbon: '#0f9d58',
};

export const styles = css`
  :host {
    display: block;
  }
  ha-card {
    padding: 8px;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--ha-card-font-family, Roboto, Arial, sans-serif);
  }
  .bg {
    fill: var(--card-background-color, #1c1c1c);
  }
  .value {
    fill: var(--primary-text-color, #e1e1e1);
    text-anchor: middle;
  }
  .label {
    fill: var(--secondary-text-color, #9b9b9b);
    text-anchor: middle;
    font-size: 10px;
  }
  .flow {
    fill: none;
    stroke-width: 1.3;
  }
  .ring-bg {
    fill: none;
    stroke: var(--divider-color, #333);
  }
  [data-node] {
    cursor: pointer;
  }
  .bold text {
    font-weight: bold;
  }
  [data-hover-name] {
    pointer-events: none;
  }
  [data-hover-name] rect {
    fill: var(--card-background-color, #1c1c1c);
    stroke: var(--divider-color, #333);
  }
  foreignObject {
    overflow: visible;
  }
  ha-icon {
    --mdc-icon-size: 100%;
    display: flex;
    width: 100%;
    height: 100%;
  }
`;

/* ============================================================
   MacroScope — Federal Reserve Health Dashboard Module
   ============================================================ */

import { getValueByPath } from './utils.js';

export function initFedHealthDashboard(config, data) {
  const fed = data.fedHealth;
  const assetsConf = config.fedHealthDashboard.assetsConfig;

  // Render general KPIs
  document.getElementById('fed-total-assets-val').textContent = `$${fed.totalAssets.toFixed(2)}T`;
  
  const changeVal = fed.change1y;
  const changeEl = document.getElementById('fed-change-1y-val');
  if (changeEl) {
    changeEl.textContent = `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(0)}B`;
    changeEl.className = `fed-kpi-value ${changeVal >= 0 ? 'surplus-text' : 'deficit-text'}`;
  }

  document.getElementById('fed-ioer-val').textContent = `${fed.ioerRate.toFixed(2)}%`;
  document.getElementById('fed-reserves-val').textContent = `$${fed.bankReserves.toFixed(2)}T`;
  document.getElementById('fed-rrp-val').textContent = `$${fed.reverseRepo.toFixed(2)}T`;
  document.getElementById('fed-qt-pace-val').textContent = fed.qtPacing;
  
  const rrpDescVal = document.getElementById('fed-rrp-desc-val');
  if (rrpDescVal) {
    rrpDescVal.textContent = `$${(fed.reverseRepo * 1000).toFixed(0)} Billion`;
  }

  // Render Reserves Health Meter
  // Mapping Reserves level $1.5T to $4.5T
  const reserves = fed.bankReserves;
  const minVal = 1.5;
  const maxVal = 4.5;
  const pct = Math.min(Math.max((reserves - minVal) / (maxVal - minVal), 0), 1) * 100;
  
  const meterFill = document.getElementById('fed-reserve-meter-fill');
  if (meterFill) {
    meterFill.style.width = `${pct}%`;
  }

  // Render Assets portfolio segmented stack bar & legend
  renderAssetsComposition(fed, assetsConf);
}

function renderAssetsComposition(fed, assetsConf) {
  const stackBar = document.getElementById('fed-assets-stack');
  const legendContainer = document.getElementById('fed-assets-legend');
  if (!stackBar || !legendContainer) return;

  stackBar.innerHTML = '';
  legendContainer.innerHTML = '';

  const total = fed.totalAssets;

  Object.keys(assetsConf).forEach(key => {
    const conf = assetsConf[key];
    const val = getValueByPath(fed, conf.key.split('.').slice(1).join('.')); // get local sub-key
    if (val === undefined || val === null) return;

    const share = (val / total) * 100;

    // Segment
    const segment = document.createElement('div');
    segment.className = 'assets-segmented-segment';
    segment.style.width = `${share}%`;
    segment.style.backgroundColor = conf.color;
    segment.setAttribute('title', `${conf.label}: $${val.toFixed(2)}T (${share.toFixed(1)}%)`);
    stackBar.appendChild(segment);

    // Legend item
    const legendItem = document.createElement('div');
    legendItem.className = 'assets-legend-item';
    legendItem.innerHTML = `
      <span class="assets-legend-dot" style="background-color: ${conf.color}"></span>
      <span>${conf.label}: <span class="assets-legend-val">$${val.toFixed(2)}T</span> <span style="font-size:0.75rem; color:var(--text-muted)">(${share.toFixed(1)}%)</span></span>
    `;
    legendContainer.appendChild(legendItem);
  });
}

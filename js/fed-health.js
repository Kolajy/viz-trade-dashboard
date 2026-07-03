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

  // Render QT Progress Bar
  renderQTProgress(fed);

  // Render detailed Liabilities table
  renderLiabilitiesTable(fed);
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

function renderQTProgress(fed) {
  const peak = fed.peakAssets;
  const current = fed.totalAssets;
  const targetFloor = 6.0; // Fed estimated target comfortable floor level

  const totalTargetReduction = peak - targetFloor;
  const achievedReduction = peak - current;
  const reductionPct = Math.min(Math.max(achievedReduction / totalTargetReduction, 0), 1) * 100;

  const progressFill = document.getElementById('fed-qt-progress-fill');
  const textReduction = document.getElementById('fed-qt-total-reduction');

  if (progressFill) {
    progressFill.style.width = `${reductionPct}%`;
  }
  if (textReduction) {
    textReduction.textContent = `-$${achievedReduction.toFixed(2)}T Reduction`;
  }
}

function renderLiabilitiesTable(fed) {
  const tbody = document.getElementById('fed-liabilities-table-body');
  if (!tbody) return;

  const total = fed.totalAssets; // Assets = Liabilities

  const positions = [
    { label: 'Bank Reserves', val: fed.bankReserves, class: 'val-exports' },
    { label: 'Overnight Reverse Repos (RRP)', val: fed.reverseRepo, class: 'val-imports' },
    { label: 'Treasury General Account (TGA)', val: fed.tga, class: 'neutral-text' },
    { label: 'Currency in Circulation', val: fed.currencyInCirculation, class: 'neutral-text' },
    { label: 'Other Liabilities', val: fed.otherLiabilities, class: 'neutral-text' }
  ];

  tbody.innerHTML = '';
  positions.forEach(pos => {
    const share = (pos.val / total) * 100;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${pos.label}</td>
      <td class="numeric ${pos.class}">$${pos.val.toFixed(2)}T</td>
      <td class="numeric" style="font-family:var(--font-mono); color:var(--text-secondary)">${share.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

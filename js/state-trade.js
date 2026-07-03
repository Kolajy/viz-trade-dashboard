/* ============================================================
   MacroScope — U.S. State Trade Map Dashboard Module
   ============================================================ */

import { getColorForValue, showTooltip, hideTooltip, moveTooltip } from './utils.js';

let tradeData = null;
let mapDimensions = null;
let currentMode = 'exports';
let currentRankMode = 'exports';
let selectedStateAbbr = null;
let sortColumn = 'state';
let sortDirection = 'asc';
let searchQuery = '';

export function initStateTradeDashboard(config) {
  const mapSvg = document.getElementById('us-svg-map');
  if (!mapSvg) return;

  mapSvg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="var(--text-secondary)">Loading Map Visualizations...</text>';

  Promise.all([
    fetch(config.stateTradeDashboard.mapUrl).then(res => {
      if (!res.ok) throw new Error('Failed to load USA map dimensions');
      return res.json();
    }),
    fetch(config.stateTradeDashboard.dataUrl).then(res => {
      if (!res.ok) throw new Error('Failed to load state trade data');
      return res.json();
    })
  ])
  .then(([dimensions, data]) => {
    mapDimensions = dimensions;
    tradeData = data;

    // Set up visualization mode controls
    const btnExports = document.getElementById('btn-mode-exports');
    const btnImports = document.getElementById('btn-mode-imports');

    if (btnExports && btnImports) {
      btnExports.addEventListener('click', () => setVisualizationMode('exports', config));
      btnImports.addEventListener('click', () => setVisualizationMode('imports', config));
    }

    // Set up rankings mode controls
    const rankBtnExports = document.getElementById('rank-btn-exports');
    const rankBtnImports = document.getElementById('rank-btn-imports');

    if (rankBtnExports && rankBtnImports) {
      rankBtnExports.addEventListener('click', () => setRankMode('exports'));
      rankBtnImports.addEventListener('click', () => setRankMode('imports'));
    }

    // Initialize ledger interactions
    initLedgerEvents();

    // Initial render
    updateLegendGradient(config);
    renderMap();
    updateRankingsList();
    calculateNationalSummary();
    renderLedgerTable();
  })
  .catch(err => {
    console.error('Error initializing state trade dashboard:', err);
    mapSvg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="var(--color-down)">Error loading state data: ${err.message}</text>`;
  });
}

function setVisualizationMode(mode, config) {
  if (currentMode === mode) return;
  currentMode = mode;

  // Toggle active button states
  const btnExports = document.getElementById('btn-mode-exports');
  const btnImports = document.getElementById('btn-mode-imports');
  const legendTitle = document.getElementById('legend-title-text');

  if (currentMode === 'exports') {
    btnExports.classList.add('active');
    btnExports.setAttribute('aria-pressed', 'true');
    btnImports.classList.remove('active');
    btnImports.setAttribute('aria-pressed', 'false');
  } else {
    btnImports.classList.add('active');
    btnImports.setAttribute('aria-pressed', 'true');
    btnExports.classList.remove('active');
    btnExports.setAttribute('aria-pressed', 'false');
  }

  // Update legend title from config
  if (legendTitle && config.stateTradeDashboard.modes[mode]) {
    legendTitle.textContent = config.stateTradeDashboard.modes[mode].title;
  }

  updateLegendGradient(config);
  renderMap();
  
  if (selectedStateAbbr) {
    updateDetailsPanel(selectedStateAbbr);
  }
}

function setRankMode(mode) {
  if (currentRankMode === mode) return;
  currentRankMode = mode;

  const rankBtnExports = document.getElementById('rank-btn-exports');
  const rankBtnImports = document.getElementById('rank-btn-imports');
  const rankingsTitle = document.getElementById('rankings-title');

  if (currentRankMode === 'exports') {
    rankBtnExports.classList.add('active');
    rankBtnExports.setAttribute('aria-pressed', 'true');
    rankBtnImports.classList.remove('active');
    rankBtnImports.setAttribute('aria-pressed', 'false');
    if (rankingsTitle) rankingsTitle.textContent = 'Top 5 States by Exports';
  } else {
    rankBtnImports.classList.add('active');
    rankBtnImports.setAttribute('aria-pressed', 'true');
    rankBtnExports.classList.remove('active');
    rankBtnExports.setAttribute('aria-pressed', 'false');
    if (rankingsTitle) rankingsTitle.textContent = 'Top 5 States by Imports';
  }

  updateRankingsList();
}

function updateLegendGradient(config) {
  const gradient = document.getElementById('legend-gradient-bar');
  const minText = document.getElementById('legend-min');
  const midText = document.getElementById('legend-mid');
  const maxText = document.getElementById('legend-max');
  
  if (!gradient) return;

  const modeConf = config.stateTradeDashboard.modes[currentMode];
  gradient.className = `legend-gradient mode--${currentMode}`;

  // Find max value in trade data dynamically
  let maxVal = 0;
  Object.keys(tradeData.states).forEach(abbr => {
    const s = tradeData.states[abbr];
    const val = currentMode === 'exports' ? s.exportsTotal : s.importsTotal;
    if (val > maxVal) maxVal = val;
  });

  if (minText) minText.textContent = '$0B';
  if (midText) midText.textContent = `$${(maxVal / 2).toFixed(0)}B`;
  if (maxText) maxText.textContent = `$${maxVal.toFixed(0)}B`;
}

function renderMap() {
  const mapSvg = document.getElementById('us-svg-map');
  const tooltip = document.getElementById('map-tooltip-el');
  if (!mapSvg) return;

  mapSvg.innerHTML = '';

  // Determine max value for scale
  let maxVal = 0;
  Object.keys(tradeData.states).forEach(abbr => {
    const s = tradeData.states[abbr];
    const val = currentMode === 'exports' ? s.exportsTotal : s.importsTotal;
    if (val > maxVal) maxVal = val;
  });

  // Render SVG paths for states
  Object.keys(mapDimensions).forEach(abbr => {
    const pathData = mapDimensions[abbr];
    const stateData = tradeData.states[abbr];
    const val = stateData ? (currentMode === 'exports' ? stateData.exportsTotal : stateData.importsTotal) : 0;
    const color = getColorForValue(val, maxVal, currentMode);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData.dimensions);
    path.setAttribute('id', `state-${abbr}`);
    path.setAttribute('fill', color);
    path.setAttribute('data-name', pathData.name);
    path.setAttribute('data-abbr', abbr);
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'img');
    path.setAttribute('aria-label', `${pathData.name}. ${currentMode === 'exports' ? 'Exports' : 'Imports'}: $${val} Billion.`);

    if (selectedStateAbbr === abbr) {
      path.classList.add('selected');
    }

    path.addEventListener('mouseenter', (e) => {
      if (tooltip && stateData) {
        const html = `
          <div class="tooltip-header">${stateData.name}</div>
          <div class="tooltip-row">
            <span>Exports:</span>
            <span class="tooltip-val-bold" style="color: var(--color-up)">$${stateData.exportsTotal}B</span>
          </div>
          <div class="tooltip-row">
            <span>Imports:</span>
            <span class="tooltip-val-bold" style="color: #8c52ff">$${stateData.importsTotal}B</span>
          </div>
          <div class="tooltip-row">
            <span>Partner:</span>
            <span class="tooltip-val-bold" style="color: var(--text-primary)">${stateData.topPartner}</span>
          </div>
        `;
        showTooltip(tooltip, e, html);
      }
    });

    path.addEventListener('mousemove', (e) => {
      moveTooltip(tooltip, e);
    });

    path.addEventListener('mouseleave', () => {
      hideTooltip(tooltip);
    });

    path.addEventListener('click', () => {
      selectState(abbr);
    });

    path.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectState(abbr);
      }
    });

    mapSvg.appendChild(path);
  });
}

function selectState(abbr) {
  // Clear previous selected state
  if (selectedStateAbbr) {
    const prevPath = document.getElementById(`state-${selectedStateAbbr}`);
    if (prevPath) prevPath.classList.remove('selected');
  }

  selectedStateAbbr = abbr;

  // Add selected class to new path
  const newPath = document.getElementById(`state-${abbr}`);
  if (newPath) {
    newPath.classList.add('selected');
    newPath.focus();
  }

  updateDetailsPanel(abbr);

  // Sync state selection in the ledger table
  const rows = document.querySelectorAll('#ledger-table-body tr');
  rows.forEach(r => {
    if (r.getAttribute('data-abbr') === abbr) {
      r.classList.add('selected');
      r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      r.classList.remove('selected');
    }
  });
}

function updateDetailsPanel(abbr) {
  const cardEmpty = document.getElementById('details-card-empty');
  const cardContent = document.getElementById('details-card-content');
  const stateData = tradeData.states[abbr];

  if (!stateData) return;

  if (cardEmpty) cardEmpty.style.display = 'none';
  if (cardContent) cardContent.style.display = 'flex';

  document.getElementById('detail-state-name').textContent = stateData.name;
  document.getElementById('detail-state-abbr').textContent = abbr;
  document.getElementById('detail-exports-val').textContent = `$${stateData.exportsTotal.toFixed(1)}B`;
  document.getElementById('detail-imports-val').textContent = `$${stateData.importsTotal.toFixed(1)}B`;
  document.getElementById('detail-exports-top').textContent = stateData.exportsTop;
  document.getElementById('detail-imports-top').textContent = stateData.importsTop;
  document.getElementById('detail-partner').textContent = stateData.topPartner;

  // Bar ratios
  const totalTrade = stateData.exportsTotal + stateData.importsTotal;
  const expRatio = (stateData.exportsTotal / totalTrade) * 100;
  const impRatio = (stateData.importsTotal / totalTrade) * 100;

  const segmentExports = document.getElementById('detail-ratio-exports');
  const segmentImports = document.getElementById('detail-ratio-imports');
  const lblExports = document.getElementById('detail-ratio-exports-lbl');
  const lblImports = document.getElementById('detail-ratio-imports-lbl');

  if (segmentExports) segmentExports.style.width = `${expRatio}%`;
  if (segmentImports) segmentImports.style.width = `${impRatio}%`;
  if (lblExports) lblExports.textContent = `Exports (${expRatio.toFixed(0)}%)`;
  if (lblImports) lblImports.textContent = `Imports (${impRatio.toFixed(0)}%)`;
}

function updateRankingsList() {
  const rankingsList = document.getElementById('rankings-list-el');
  if (!rankingsList) return;

  rankingsList.innerHTML = '';

  const sorted = Object.keys(tradeData.states)
    .map(abbr => ({
      abbr,
      name: tradeData.states[abbr].name,
      val: currentRankMode === 'exports' ? tradeData.states[abbr].exportsTotal : tradeData.states[abbr].importsTotal
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);

  sorted.forEach((item, idx) => {
    const li = document.createElement('li');
    
    const leftDiv = document.createElement('div');
    leftDiv.className = 'rank-item-left';
    
    const numSpan = document.createElement('span');
    numSpan.className = 'rank-num';
    numSpan.textContent = `${idx + 1}.`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'rank-state-name';
    nameSpan.textContent = item.name;
    nameSpan.addEventListener('click', () => {
      selectState(item.abbr);
    });

    leftDiv.appendChild(numSpan);
    leftDiv.appendChild(nameSpan);

    const valSpan = document.createElement('span');
    valSpan.className = `rank-val type--${currentRankMode}`;
    valSpan.textContent = `$${item.val.toFixed(1)}B`;

    li.appendChild(leftDiv);
    li.appendChild(valSpan);
    rankingsList.appendChild(li);
  });
}

function calculateNationalSummary() {
  let totalExports = 0;
  let totalImports = 0;

  Object.keys(tradeData.states).forEach(abbr => {
    const s = tradeData.states[abbr];
    totalExports += s.exportsTotal;
    totalImports += s.importsTotal;
  });

  const netBalance = totalExports - totalImports;

  document.getElementById('nat-exports-val').textContent = `$${(totalExports / 1000).toFixed(2)}T`;
  document.getElementById('nat-imports-val').textContent = `$${(totalImports / 1000).toFixed(2)}T`;

  const balanceValEl = document.getElementById('nat-balance-val');
  const balanceStatusEl = document.getElementById('nat-balance-status');
  const absBalance = Math.abs(netBalance);

  balanceValEl.textContent = `${netBalance >= 0 ? '+' : '-'}$${(absBalance / 1000).toFixed(2)}T`;

  if (netBalance >= 0) {
    balanceValEl.className = 'summary-value value--exports';
    balanceStatusEl.textContent = 'Net Trade Surplus';
    balanceStatusEl.style.color = 'var(--color-up)';
  } else {
    balanceValEl.className = 'summary-value value--imports';
    balanceStatusEl.textContent = 'Net Trade Deficit';
    balanceStatusEl.style.color = '#8c52ff';
  }
}

function renderLedgerTable() {
  const tbody = document.getElementById('ledger-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let statesList = Object.keys(tradeData.states).map(abbr => {
    const s = tradeData.states[abbr];
    return {
      abbr,
      name: s.name,
      exports: s.exportsTotal,
      imports: s.importsTotal,
      balance: s.exportsTotal - s.importsTotal,
      exportsTop: s.exportsTop,
      importsTop: s.importsTop,
      topPartner: s.topPartner
    };
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    statesList = statesList.filter(s => 
      s.name.toLowerCase().includes(q) ||
      s.abbr.toLowerCase().includes(q) ||
      s.exportsTop.toLowerCase().includes(q) ||
      s.importsTop.toLowerCase().includes(q) ||
      s.topPartner.toLowerCase().includes(q)
    );
  }

  statesList.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    if (sortColumn === 'state') {
      valA = a.name;
      valB = b.name;
    }

    if (typeof valA === 'string') {
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }
  });

  if (statesList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: var(--space-lg);">No matching states found</td></tr>';
    return;
  }

  statesList.forEach(s => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-abbr', s.abbr);
    if (selectedStateAbbr === s.abbr) tr.classList.add('selected');

    const balSign = s.balance >= 0 ? '+' : '';
    const balClass = s.balance >= 0 ? 'surplus' : 'deficit';

    tr.innerHTML = `
      <td class="state-col">${s.name} <span style="font-size:0.75rem; color:var(--text-muted)">(${s.abbr})</span></td>
      <td class="numeric val-exports">$${s.exports.toFixed(1)}B</td>
      <td class="numeric val-imports">$${s.imports.toFixed(1)}B</td>
      <td class="numeric val-balance ${balClass}">${balSign}$${s.balance.toFixed(1)}B</td>
      <td class="commodity-col" title="${s.exportsTop}">${s.exportsTop}</td>
      <td class="commodity-col" title="${s.importsTop}">${s.importsTop}</td>
      <td class="partner-col">${s.topPartner}</td>
    `;

    tr.addEventListener('click', () => {
      selectState(s.abbr);
      if (window.innerWidth <= 900) {
        document.querySelector('.map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    tbody.appendChild(tr);
  });
}

function initLedgerEvents() {
  const searchInput = document.getElementById('table-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderLedgerTable();
    });
  }

  const headers = document.querySelectorAll('.ledger-table th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = column;
        sortDirection = column === 'state' ? 'asc' : 'desc';
      }

      headers.forEach(h => {
        h.className = h.className.replace(/sorted-(asc|desc)/g, '').trim();
        const indicator = h.querySelector('.sort-indicator');
        if (indicator) indicator.textContent = '';
      });

      th.classList.add(`sorted-${sortDirection}`);
      const indicator = th.querySelector('.sort-indicator');
      if (indicator) {
        indicator.textContent = sortDirection === 'asc' ? '▲' : '▼';
      }

      renderLedgerTable();
    });
  });
}

/* ============================================================
   MacroScope — Global Trade Map Dashboard Module
   ============================================================ */

import { getColorForValue, getDivergingColor, showTooltip, hideTooltip, moveTooltip } from './utils.js';

let globalTradeData = null;
let worldMapSvgText = null;
let currentGlobalMode = 'exports';
let currentGlobalRankMode = 'total';
let selectedCountryCode = null;

export function initGlobalTradeDashboard(config) {
  const mapContainer = document.getElementById('global-svg-map');
  if (!mapContainer) return;

  mapContainer.innerHTML = '<div style="color:var(--text-secondary)">Loading World Trade Visualizations...</div>';

  Promise.all([
    fetch(config.globalTradeDashboard.mapUrl).then(res => {
      if (!res.ok) throw new Error('Failed to load World map SVG');
      return res.text();
    }),
    fetch(config.globalTradeDashboard.dataUrl).then(res => {
      if (!res.ok) throw new Error('Failed to load global trade data');
      return res.json();
    })
  ])
  .then(([svgText, data]) => {
    worldMapSvgText = svgText;
    globalTradeData = data;

    // Inject SVG
    mapContainer.innerHTML = svgText;
    
    // Set up visualization mode controls
    const btnExports = document.getElementById('btn-global-exports');
    const btnImports = document.getElementById('btn-global-imports');
    const btnBalance = document.getElementById('btn-global-balance');

    if (btnExports && btnImports && btnBalance) {
      btnExports.addEventListener('click', () => setGlobalMode('exports', config));
      btnImports.addEventListener('click', () => setGlobalMode('imports', config));
      btnBalance.addEventListener('click', () => setGlobalMode('balance', config));
    }

    // Set up rankings mode controls
    const rankBtnTotal = document.getElementById('global-rank-btn-total');
    const rankBtnExports = document.getElementById('global-rank-btn-exports');
    const rankBtnImports = document.getElementById('global-rank-btn-imports');

    if (rankBtnTotal && rankBtnExports && rankBtnImports) {
      rankBtnTotal.addEventListener('click', () => setGlobalRankMode('total'));
      rankBtnExports.addEventListener('click', () => setGlobalRankMode('exports'));
      rankBtnImports.addEventListener('click', () => setGlobalRankMode('imports'));
    }

    // Populate country search select dropdown
    populateCountryDropdown();

    // Initial render
    updateLegendGradient(config);
    renderWorldMap();
    updateGlobalRankingsList();
  })
  .catch(err => {
    console.error('Error initializing global trade dashboard:', err);
    mapContainer.innerHTML = `<div style="color:var(--color-down)">Error loading world map: ${err.message}</div>`;
  });
}

function setGlobalMode(mode, config) {
  if (currentGlobalMode === mode) return;
  currentGlobalMode = mode;

  const btnExports = document.getElementById('btn-global-exports');
  const btnImports = document.getElementById('btn-global-imports');
  const btnBalance = document.getElementById('btn-global-balance');
  const legendTitle = document.getElementById('global-legend-title-text');

  const btns = [btnExports, btnImports, btnBalance];
  btns.forEach(btn => {
    if (btn) {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  const activeBtn = mode === 'exports' ? btnExports : (mode === 'imports' ? btnImports : btnBalance);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }

  if (legendTitle && config.globalTradeDashboard.modes[mode]) {
    legendTitle.textContent = config.globalTradeDashboard.modes[mode].title;
  }

  updateLegendGradient(config);
  renderWorldMap();

  if (selectedCountryCode) {
    updateDetailsPanel(selectedCountryCode);
  }
}

function setGlobalRankMode(mode) {
  if (currentGlobalRankMode === mode) return;
  currentGlobalRankMode = mode;

  const rankBtnTotal = document.getElementById('global-rank-btn-total');
  const rankBtnExports = document.getElementById('global-rank-btn-exports');
  const rankBtnImports = document.getElementById('global-rank-btn-imports');
  const rankingsTitle = document.getElementById('global-rankings-title');

  const btns = [rankBtnTotal, rankBtnExports, rankBtnImports];
  btns.forEach(btn => {
    if (btn) {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });

  const activeBtn = mode === 'total' ? rankBtnTotal : (mode === 'exports' ? rankBtnExports : rankBtnImports);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }

  if (rankingsTitle) {
    const lbl = mode === 'total' ? 'Trading Partners' : (mode === 'exports' ? 'Export Markets' : 'Import Sources');
    rankingsTitle.textContent = `Top 5 U.S. ${lbl}`;
  }

  updateGlobalRankingsList();
}

function updateLegendGradient(config) {
  const gradient = document.getElementById('global-legend-gradient-bar');
  const minText = document.getElementById('global-legend-min');
  const midText = document.getElementById('global-legend-mid');
  const maxText = document.getElementById('global-legend-max');
  
  if (!gradient) return;

  gradient.className = `legend-gradient mode--${currentGlobalMode}`;

  let maxVal = 0;
  let minVal = 0;

  Object.keys(globalTradeData.partners).forEach(code => {
    const p = globalTradeData.partners[code];
    if (currentGlobalMode === 'exports') {
      if (p.exports > maxVal) maxVal = p.exports;
    } else if (currentGlobalMode === 'imports') {
      if (p.imports > maxVal) maxVal = p.imports;
    } else {
      if (p.tradeBalance > maxVal) maxVal = p.tradeBalance;
      if (p.tradeBalance < minVal) minVal = p.tradeBalance;
    }
  });

  if (currentGlobalMode === 'balance') {
    if (minText) minText.textContent = `-$${Math.abs(minVal).toFixed(0)}B`;
    if (midText) midText.textContent = '$0B';
    if (maxText) maxText.textContent = `+$${maxVal.toFixed(0)}B`;
  } else {
    if (minText) minText.textContent = '$0B';
    if (midText) midText.textContent = `$${(maxVal / 2).toFixed(0)}B`;
    if (maxText) maxText.textContent = `$${maxVal.toFixed(0)}B`;
  }
}

function renderWorldMap() {
  const mapContainer = document.getElementById('global-svg-map');
  const tooltip = document.getElementById('map-tooltip-el');
  if (!mapContainer) return;

  // Determine range bounds
  let maxVal = 0;
  let minVal = 0;
  Object.keys(globalTradeData.partners).forEach(code => {
    const p = globalTradeData.partners[code];
    if (currentGlobalMode === 'exports') {
      if (p.exports > maxVal) maxVal = p.exports;
    } else if (currentGlobalMode === 'imports') {
      if (p.imports > maxVal) maxVal = p.imports;
    } else {
      if (p.tradeBalance > maxVal) maxVal = p.tradeBalance;
      if (p.tradeBalance < minVal) minVal = p.tradeBalance;
    }
  });

  const paths = mapContainer.querySelectorAll('path');
  paths.forEach(path => {
    let countryCode = path.id;
    let parentGroup = null;

    // Check if path lies inside a grouped node (like <g id="ao">)
    if (!countryCode && path.parentNode && path.parentNode.id && path.parentNode.tagName.toLowerCase() === 'g') {
      countryCode = path.parentNode.id;
      parentGroup = path.parentNode;
    }

    if (!countryCode) return;
    const lowerCode = countryCode.toLowerCase();
    const pData = globalTradeData.partners[lowerCode];

    let color = '#1c2230'; // Default unshaded country
    if (pData) {
      if (currentGlobalMode === 'balance') {
        color = getDivergingColor(pData.tradeBalance, maxVal, minVal);
      } else {
        const val = currentGlobalMode === 'exports' ? pData.exports : pData.imports;
        color = getColorForValue(val, maxVal, currentGlobalMode);
      }
    }

    path.style.fill = color;

    // Remove any previous classes
    path.classList.remove('selected');
    if (parentGroup) parentGroup.classList.remove('selected');

    if (selectedCountryCode === lowerCode) {
      path.classList.add('selected');
      if (parentGroup) parentGroup.classList.add('selected');
    }

    // Interactions
    const targetNode = parentGroup || path;

    // Only add interactive event handlers if we have trade data for this country
    if (pData) {
      targetNode.style.cursor = 'pointer';

      // Attach events to path (or group parent if grouped)
      targetNode.onmouseenter = (e) => {
        const balSign = pData.tradeBalance >= 0 ? '+' : '';
        const balColor = pData.tradeBalance >= 0 ? 'var(--color-up)' : '#ff5e5e';
        const html = `
          <div class="tooltip-header">${pData.name}</div>
          <div class="tooltip-row">
            <span>U.S. Exports:</span>
            <span class="tooltip-val-bold" style="color: var(--color-up)">$${pData.exports}B</span>
          </div>
          <div class="tooltip-row">
            <span>U.S. Imports:</span>
            <span class="tooltip-val-bold" style="color: #8c52ff">$${pData.imports}B</span>
          </div>
          <div class="tooltip-row">
            <span>Trade Balance:</span>
            <span class="tooltip-val-bold" style="color: ${balColor}">${balSign}$${pData.tradeBalance}B</span>
          </div>
        `;
        showTooltip(tooltip, e, html);
        
        if (parentGroup) parentGroup.classList.add('hovered');
      };

      targetNode.onmousemove = (e) => {
        moveTooltip(tooltip, e);
      };

      targetNode.onmouseleave = () => {
        hideTooltip(tooltip);
        if (parentGroup) parentGroup.classList.remove('hovered');
      };

      targetNode.onclick = () => {
        selectCountry(lowerCode);
      };
    } else {
      // Background country (no U.S. statistics available)
      targetNode.onmouseenter = (e) => {
        const countryName = path.getAttribute('data-name') || path.id || (parentGroup ? parentGroup.id : 'Country');
        showTooltip(tooltip, e, `<div class="tooltip-header">${countryName.toUpperCase()}</div><div class="tooltip-row" style="font-size:0.7rem;color:var(--text-muted)">No explicit U.S. trade data</div>`);
      };
      targetNode.onmousemove = (e) => {
        moveTooltip(tooltip, e);
      };
      targetNode.onmouseleave = () => {
        hideTooltip(tooltip);
      };
      targetNode.onclick = null;
      targetNode.style.cursor = 'default';
    }
  });
}

function selectCountry(code) {
  selectedCountryCode = code;

  // Render updates to select borders
  renderWorldMap();
  updateDetailsPanel(code);

  // Sync the country dropdown selection
  const dropdown = document.getElementById('global-country-search');
  if (dropdown) {
    dropdown.value = code;
  }
}

function updateDetailsPanel(code) {
  const cardEmpty = document.getElementById('global-details-card-empty');
  const cardContent = document.getElementById('global-details-card-content');
  const pData = globalTradeData.partners[code];

  if (!pData) return;

  if (cardEmpty) cardEmpty.style.display = 'none';
  if (cardContent) cardContent.style.display = 'flex';

  document.getElementById('global-detail-country-name').textContent = pData.name;
  document.getElementById('global-detail-country-abbr').textContent = code.toUpperCase();
  document.getElementById('global-detail-exports-val').textContent = `$${pData.exports.toFixed(1)}B`;
  document.getElementById('global-detail-imports-val').textContent = `$${pData.imports.toFixed(1)}B`;
  document.getElementById('global-detail-exports-top').textContent = pData.topExport;
  document.getElementById('global-detail-imports-top').textContent = pData.topImport;
  document.getElementById('global-detail-desc').textContent = pData.desc;

  // Trade Balance formatting
  const balEl = document.getElementById('global-detail-balance-val');
  const balSign = pData.tradeBalance >= 0 ? '+' : '';
  balEl.textContent = `${balSign}$${pData.tradeBalance.toFixed(1)}B`;
  balEl.className = `trade-value ${pData.tradeBalance >= 0 ? 'balance-text--surplus' : 'balance-text--deficit'}`;

  // Share value
  document.getElementById('global-detail-share-val').textContent = `${pData.shareOfTotal.toFixed(1)}%`;

  // Bar ratios
  const totalVal = pData.exports + pData.imports;
  const expRatio = (pData.exports / totalVal) * 100;
  const impRatio = (pData.imports / totalVal) * 100;

  const segmentExports = document.getElementById('global-detail-ratio-exports');
  const segmentImports = document.getElementById('global-detail-ratio-imports');
  const lblExports = document.getElementById('global-detail-ratio-exports-lbl');
  const lblImports = document.getElementById('global-detail-ratio-imports-lbl');

  if (segmentExports) segmentExports.style.width = `${expRatio}%`;
  if (segmentImports) segmentImports.style.width = `${impRatio}%`;
  if (lblExports) lblExports.textContent = `Exports (${expRatio.toFixed(0)}%)`;
  if (lblImports) lblImports.textContent = `Imports (${impRatio.toFixed(0)}%)`;
}

function updateGlobalRankingsList() {
  const rankingsList = document.getElementById('global-rankings-list-el');
  if (!rankingsList) return;

  rankingsList.innerHTML = '';

  const sorted = Object.keys(globalTradeData.partners)
    .map(code => {
      const p = globalTradeData.partners[code];
      let val = p.totalTrade;
      if (currentGlobalRankMode === 'exports') val = p.exports;
      if (currentGlobalRankMode === 'imports') val = p.imports;
      
      return {
        code,
        name: p.name,
        val
      };
    })
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
      selectCountry(item.code);
    });

    leftDiv.appendChild(numSpan);
    leftDiv.appendChild(nameSpan);

    const valSpan = document.createElement('span');
    valSpan.className = `rank-val type--${currentGlobalRankMode}`;
    valSpan.textContent = `$${item.val.toFixed(1)}B`;

    li.appendChild(leftDiv);
    li.appendChild(valSpan);
    rankingsList.appendChild(li);
  });
}

function populateCountryDropdown() {
  const dropdown = document.getElementById('global-country-search');
  if (!dropdown) return;

  // Clear previous options except first one
  dropdown.innerHTML = '<option value="">Select a country...</option>';

  // Sort partners alphabetically
  const sortedCodes = Object.keys(globalTradeData.partners).sort((a, b) => {
    return globalTradeData.partners[a].name.localeCompare(globalTradeData.partners[b].name);
  });

  sortedCodes.forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = globalTradeData.partners[code].name;
    dropdown.appendChild(opt);
  });

  dropdown.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      selectCountry(val);
    }
  });
}

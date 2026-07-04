/* ============================================================
   MacroScope — Global Trade Map Dashboard Module
   ============================================================ */

import { getColorForValue, getDivergingColor, showTooltip, hideTooltip, moveTooltip, renderCommodityList } from './utils.js';

let globalTradeData = null;
let worldMapSvgText = null;
let currentGlobalMode = 'exports';
let currentGlobalRankMode = 'total';
let selectedCountryCode = null;

export function initGlobalTradeDashboard(config, macroData) {
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
    renderTradeContext(macroData);
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
    }
  });

  // Clear any existing flow lines or markers
  const existingLines = mapContainer.querySelectorAll('.trade-flow-line, .trade-flow-marker');
  existingLines.forEach(el => el.remove());

  // Draw trade flow line if a country is selected and it is not 'us'
  if (selectedCountryCode && selectedCountryCode !== 'us') {
    const svgEl = mapContainer.querySelector('svg');
    if (svgEl) {
      drawTradeFlowLine(svgEl, selectedCountryCode);
    }
  }
}

function drawTradeFlowLine(svgEl, code) {
  const usEl = svgEl.querySelector('#us');
  const targetEl = svgEl.querySelector('#' + code);

  if (!usEl || !targetEl) return;

  // Get bounding box centers
  const usBBox = usEl.getBBox();
  const targetBBox = targetEl.getBBox();

  const usX = usBBox.x + usBBox.width / 2;
  const usY = usBBox.y + usBBox.height / 2;

  const targetX = targetBBox.x + targetBBox.width / 2;
  const targetY = targetBBox.y + targetBBox.height / 2;

  // Calculate midpoints and lengths
  const dx = targetX - usX;
  const dy = targetY - usY;
  const L = Math.sqrt(dx * dx + dy * dy);
  
  if (L === 0) return;

  const mx = (usX + targetX) / 2;
  const my = (usY + targetY) / 2;

  // Calculate perpendicular offset for curve (bending upwards)
  let ox = -dy * 0.20;
  let oy = dx * 0.20;
  
  if (oy > 0) {
    ox = -ox;
    oy = -oy;
  }
  
  if (Math.abs(dx) < 10) {
    ox = L * 0.20; // Bends to the right if vertical
    oy = 0;
  }

  const cx = mx + ox;
  const cy = my + oy;

  // Get trade details to determine color and flow direction
  const pData = globalTradeData.partners[code];
  let flowDirection = 'forward'; // 'forward' = US -> Target, 'backward' = Target -> US
  let strokeColor = 'var(--color-up)';

  if (pData) {
    if (currentGlobalMode === 'exports') {
      flowDirection = 'forward';
      strokeColor = 'var(--color-up)';
    } else if (currentGlobalMode === 'imports') {
      flowDirection = 'backward';
      strokeColor = '#8c52ff';
    } else {
      // Balance mode
      if (pData.tradeBalance >= 0) {
        flowDirection = 'forward';
        strokeColor = 'var(--color-up)';
      } else {
        flowDirection = 'backward';
        strokeColor = '#ff5e5e';
      }
    }
  }

  // Create path
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${usX} ${usY} Q ${cx} ${cy} ${targetX} ${targetY}`);
  path.setAttribute('class', `trade-flow-line flow--${flowDirection}`);
  path.style.stroke = strokeColor;
  path.style.filter = `drop-shadow(0 0 3px ${strokeColor})`;

  // Create marker/pulsing dot at target country center
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  marker.setAttribute('cx', targetX);
  marker.setAttribute('cy', targetY);
  marker.setAttribute('r', '4');
  marker.setAttribute('class', 'trade-flow-marker');
  marker.style.fill = strokeColor;
  marker.style.filter = `drop-shadow(0 0 4px ${strokeColor})`;

  svgEl.appendChild(path);
  svgEl.appendChild(marker);
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
  renderCommodityList('global-detail-exports-list', pData.exportsList);
  renderCommodityList('global-detail-imports-list', pData.importsList);
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
        val,
        share: p.shareOfTotal
      };
    })
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);

  // Calculate sum of the selected mode across all partners in the dataset
  const totalSum = Object.keys(globalTradeData.partners).reduce((acc, code) => {
    const p = globalTradeData.partners[code];
    let val = p.totalTrade;
    if (currentGlobalRankMode === 'exports') val = p.exports;
    if (currentGlobalRankMode === 'imports') val = p.imports;
    return acc + val;
  }, 0);

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
    
    // Use the database's overall share_of_total for total trade, or compute relative share for exports/imports
    let pctDisplay = '';
    if (currentGlobalRankMode === 'total') {
      pctDisplay = `${item.share.toFixed(1)}%`;
    } else {
      const computedPct = totalSum > 0 ? (item.val / totalSum) * 100 : 0;
      pctDisplay = `${computedPct.toFixed(1)}%`;
    }
    
    valSpan.textContent = `$${item.val.toFixed(1)}B (${pctDisplay})`;

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

function renderTradeContext(macroData) {
  if (!macroData || !macroData.macro) return;
  const macro = macroData.macro;

  // Balance of Trade Card
  const expVal = parseFloat(macro.us_exports);
  const impVal = parseFloat(macro.us_imports);
  const balVal = parseFloat(macro.us_trade_balance);
  const period = macro.us_trade_balance_period || '—';

  const elBalance = document.getElementById('context-trade-balance');
  const elPeriod = document.getElementById('context-trade-period');
  const elRatioExports = document.getElementById('context-ratio-exports');
  const elRatioImports = document.getElementById('context-ratio-imports');
  const elExportsLabel = document.getElementById('context-exports-label');
  const elImportsLabel = document.getElementById('context-imports-label');

  if (elBalance) {
    elBalance.textContent = `$${balVal.toFixed(1)}B`;
    elBalance.style.color = balVal < 0 ? 'var(--color-down)' : 'var(--color-up)';
  }
  if (elPeriod) elPeriod.textContent = period;

  if (expVal && impVal) {
    const total = expVal + impVal;
    const expShare = (expVal / total) * 100;
    const impShare = (impVal / total) * 100;

    if (elRatioExports) elRatioExports.style.width = `${expShare}%`;
    if (elRatioImports) elRatioImports.style.width = `${impShare}%`;

    if (elExportsLabel) elExportsLabel.textContent = `Exports: $${expVal.toFixed(1)}B (${expShare.toFixed(0)}%)`;
    if (elImportsLabel) elImportsLabel.textContent = `Imports: $${impVal.toFixed(1)}B (${impShare.toFixed(0)}%)`;
  }

  // Supply Chain indices
  const bdi = parseFloat(macro.baltic_dry);
  const gscpi = parseFloat(macro.gscpi);
  const harpex = parseFloat(macro.harpex);

  const bdiVal = document.getElementById('context-bdi-val');
  const bdiTrend = document.getElementById('context-bdi-trend');
  const gscpiVal = document.getElementById('context-gscpi-val');
  const gscpiTrend = document.getElementById('context-gscpi-trend');
  const harpexVal = document.getElementById('context-harpex-val');
  const harpexTrend = document.getElementById('context-harpex-trend');

  if (bdiVal) bdiVal.textContent = bdi.toLocaleString();
  if (bdiTrend) {
    bdiTrend.textContent = macro.baltic_dry_trend === 'up' ? '▲' : '▼';
    bdiTrend.className = `trend-tag ${macro.baltic_dry_trend === 'up' ? 'trend--up' : 'trend--down'}`;
  }

  if (gscpiVal) gscpiVal.textContent = (gscpi >= 0 ? '+' : '') + gscpi.toFixed(2);
  if (gscpiTrend) {
    gscpiTrend.textContent = macro.gscpi_trend === 'up' ? '▲' : '▼';
    gscpiTrend.className = `trend-tag ${macro.gscpi_trend === 'up' ? 'trend--up' : 'trend--down'}`;
  }

  if (harpexVal) harpexVal.textContent = harpex.toLocaleString();
  if (harpexTrend) {
    harpexTrend.textContent = macro.harpex_trend === 'up' ? '▲' : '▼';
    harpexTrend.className = `trend-tag ${macro.harpex_trend === 'up' ? 'trend--up' : 'trend--down'}`;
  }
}

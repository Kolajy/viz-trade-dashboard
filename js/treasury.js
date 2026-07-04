/* ============================================================
   MacroScope — Treasury Yield Curve Dashboard Module
   ============================================================ */

import { showTooltip, hideTooltip, moveTooltip } from './utils.js';

let historicalYields = null;
let playIntervalId = null;

export function initTreasuryDashboard(config, data) {
  const yields = data.treasury.yields;
  const maturities = config.treasuryDashboard.maturities;
  const source = config.treasuryDashboard.source;

  // Set source text
  const sourceEl = document.getElementById('treasury-source-text');
  if (sourceEl) sourceEl.textContent = `Source: ${source}`;

  // Render initial current rates, spreads, and SVG
  updateDashboardSnapshot(2026, maturities, data.treasury);

  // Load historical yields database file
  if (!historicalYields) {
    fetch('./historicalYields.json')
      .then(res => res.json())
      .then(hist => {
        historicalYields = hist;
        setupTimeMachine(maturities, data.treasury);
      })
      .catch(err => {
        console.error('Failed to load historical yields:', err);
      });
  } else {
    setupTimeMachine(maturities, data.treasury);
  }
}

function setupTimeMachine(maturities, currentTreasuryData) {
  const slider = document.getElementById('history-slider');
  const yearDisplay = document.getElementById('time-machine-year-display');
  const playBtn = document.getElementById('btn-play-history');

  if (!slider || !yearDisplay || !playBtn) return;

  // Reset controls
  slider.value = 2026;
  yearDisplay.textContent = 'Current (2026)';
  if (playIntervalId) {
    clearInterval(playIntervalId);
    playIntervalId = null;
  }
  playBtn.textContent = 'Play';

  // Handle slider input
  slider.oninput = (e) => {
    const year = parseInt(e.target.value);
    
    // Stop autoplay on manual drag
    if (playIntervalId) {
      clearInterval(playIntervalId);
      playIntervalId = null;
      playBtn.textContent = 'Play';
    }

    handleYearSelect(year, maturities, currentTreasuryData);
  };

  // Handle autoplay click
  playBtn.onclick = () => {
    if (playIntervalId) {
      // Pause
      clearInterval(playIntervalId);
      playIntervalId = null;
      playBtn.textContent = 'Play';
    } else {
      // Play
      playBtn.textContent = 'Pause';
      
      // If at end, wrap back to start
      if (parseInt(slider.value) >= 2026) {
        slider.value = 2000;
        handleYearSelect(2000, maturities, currentTreasuryData);
      }

      playIntervalId = setInterval(() => {
        let val = parseInt(slider.value);
        val++;
        if (val > 2026) {
          clearInterval(playIntervalId);
          playIntervalId = null;
          playBtn.textContent = 'Play';
          return;
        }
        slider.value = val;
        handleYearSelect(val, maturities, currentTreasuryData);
      }, 900); // Step curve transitions every 900ms
    }
  };
}

function handleYearSelect(year, maturities, currentTreasuryData) {
  const yearDisplay = document.getElementById('time-machine-year-display');
  if (yearDisplay) {
    yearDisplay.textContent = year === 2026 ? 'Current (2026)' : year.toString();
  }

  if (year === 2026) {
    // Show current snapshot with all three curves (current, 1m, 1y comparison)
    updateDashboardSnapshot(2026, maturities, currentTreasuryData, true);
  } else {
    // Compile dummy historical object for the selected year
    const histRates = historicalYields[year];
    if (!histRates) return;

    const spread2y10y = (histRates['10Y'] || 0) - (histRates['2Y'] || 0);
    const spread3m10y = (histRates['10Y'] || 0) - (histRates['3M'] || 0);

    const histData = {
      yields: histRates,
      yields1MonthAgo: null, // comparisons not drawn for history
      yields1YearAgo: null,
      spread2y10y,
      spread3m10y
    };

    updateDashboardSnapshot(year, maturities, histData, false);
  }
}

function updateDashboardSnapshot(year, maturities, treasuryData, showComparisons = true) {
  // Update sidebar tables and metrics
  renderYieldsTable(maturities, treasuryData.yields);
  renderSpreads(treasuryData);

  // Draw SVG
  renderYieldCurveSVG(maturities, treasuryData, showComparisons, year);
}

function renderYieldsTable(maturities, yields) {
  const tbody = document.getElementById('yields-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  maturities.forEach(m => {
    const yVal = yields[m.key];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.label} <span style="font-size:0.75rem; color:var(--text-muted)">(${m.key})</span></td>
      <td class="numeric">${yVal !== undefined ? yVal.toFixed(2) : '—'}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSpreads(treasuryData) {
  const val2y10y = treasuryData.spread2y10y;
  const val3m10y = treasuryData.spread3m10y;

  const el2y10y = document.getElementById('spread-2y-10y-val');
  const el2y10yStatus = document.getElementById('spread-2y-10y-status');
  const el3m10y = document.getElementById('spread-3m-10y-val');
  const el3m10yStatus = document.getElementById('spread-3m-10y-status');

  if (el2y10y) {
    el2y10y.textContent = `${val2y10y >= 0 ? '+' : ''}${val2y10y.toFixed(2)}%`;
  }
  if (el2y10yStatus) {
    if (val2y10y >= 0) {
      el2y10yStatus.textContent = 'Uninverted';
      el2y10yStatus.className = 'spread-status surplus-text';
    } else {
      el2y10yStatus.textContent = 'Inverted';
      el2y10yStatus.className = 'spread-status deficit-text';
    }
  }

  if (el3m10y) {
    el3m10y.textContent = `${val3m10y >= 0 ? '+' : ''}${val3m10y.toFixed(2)}%`;
  }
  if (el3m10yStatus) {
    if (val3m10y >= 0) {
      el3m10yStatus.textContent = 'Uninverted';
      el3m10yStatus.className = 'spread-status surplus-text';
    } else {
      el3m10yStatus.textContent = 'Inverted';
      el3m10yStatus.className = 'spread-status deficit-text';
    }
  }
}

function renderYieldCurveSVG(maturities, treasuryData, showComparisons = true, year = 2026) {
  const svg = document.getElementById('yield-curve-svg');
  const tooltip = document.getElementById('map-tooltip-el');
  if (!svg) return;

  const gridlinesGroup = svg.querySelector('.gridlines');
  const xAxisGroup = svg.querySelector('.x-axis');
  const nodesGroup = document.getElementById('yield-curve-nodes');

  // Paths
  const pathCurrent = document.getElementById('yield-curve-path');
  const path1m = document.getElementById('yield-curve-path-1m');
  const path1y = document.getElementById('yield-curve-path-1y');

  if (!gridlinesGroup || !xAxisGroup || !nodesGroup || !pathCurrent) return;

  // Clear previous rendering
  gridlinesGroup.innerHTML = '';
  xAxisGroup.innerHTML = '';
  nodesGroup.innerHTML = '';

  const width = 780;
  const height = 400;
  const paddingLeft = 50;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 45;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const maxYield = 6.0;

  // Draw Y-axis gridlines and labels
  const yTicks = 6;
  for (let i = 0; i <= yTicks; i++) {
    const yVal = (maxYield / yTicks) * i;
    const y = paddingTop + plotHeight * (1 - yVal / maxYield);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width - paddingRight);
    line.setAttribute('y2', y);
    gridlinesGroup.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 10);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.textContent = `${yVal.toFixed(1)}%`;
    gridlinesGroup.appendChild(text);
  }

  const yieldsCurrent = treasuryData.yields;
  const yields1m = treasuryData.yields1MonthAgo || {};
  const yields1y = treasuryData.yields1YearAgo || {};

  // Map coordinates and draw vertical guides
  const pointsCurrent = [];
  const points1m = [];
  const points1y = [];
  const xStep = plotWidth / (maturities.length - 1);

  maturities.forEach((m, idx) => {
    const x = paddingLeft + idx * xStep;

    const yValCurrent = yieldsCurrent[m.key] !== undefined ? yieldsCurrent[m.key] : 0;
    const yCurrent = paddingTop + plotHeight * (1 - yValCurrent / maxYield);
    pointsCurrent.push({ x, y: yCurrent, val: yValCurrent, label: m.label, key: m.key });

    if (showComparisons) {
      const yVal1m = yields1m[m.key] !== undefined ? yields1m[m.key] : 0;
      const y1m = paddingTop + plotHeight * (1 - yVal1m / maxYield);
      points1m.push({ x, y: y1m, val: yVal1m });

      const yVal1y = yields1y[m.key] !== undefined ? yields1y[m.key] : 0;
      const y1y = paddingTop + plotHeight * (1 - yVal1y / maxYield);
      points1y.push({ x, y: y1y, val: yVal1y });
    }

    // Vertical line guide
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', paddingTop);
    line.setAttribute('x2', x);
    line.setAttribute('y2', height - paddingBottom);
    xAxisGroup.appendChild(line);

    // X Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', height - paddingBottom + 20);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = m.key;
    xAxisGroup.appendChild(text);
  });

  const getPathString = (pts) => {
    let d = '';
    pts.forEach((pt, idx) => {
      d += (idx === 0) ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`;
    });
    return d;
  };

  // Render main curve
  pathCurrent.setAttribute('d', getPathString(pointsCurrent));
  pathCurrent.style.stroke = showComparisons ? 'var(--color-up)' : 'var(--color-caution)';

  // Hide or show comparisons
  if (showComparisons) {
    if (path1m) {
      path1m.style.display = 'block';
      path1m.setAttribute('d', getPathString(points1m));
    }
    if (path1y) {
      path1y.style.display = 'block';
      path1y.setAttribute('d', getPathString(points1y));
    }
  } else {
    if (path1m) path1m.style.display = 'none';
    if (path1y) path1y.style.display = 'none';
  }

  // Render hoverable nodes
  pointsCurrent.forEach((pt, idx) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'curve-node');
    if (!showComparisons) {
      circle.style.fill = 'var(--color-caution)';
    }

    circle.addEventListener('mouseenter', (e) => {
      if (tooltip) {
        let html = '';
        if (showComparisons) {
          const pt1m = points1m[idx];
          const pt1y = points1y[idx];
          html = `
            <div class="tooltip-header">${pt.label} Treasury (Current)</div>
            <div class="tooltip-row">
              <span style="color: var(--color-up)">Current:</span>
              <span class="tooltip-val-bold">${pt.val.toFixed(2)}%</span>
            </div>
            <div class="tooltip-row">
              <span style="color: #8da4c4">1M Ago:</span>
              <span class="tooltip-val-bold">${pt1m.val.toFixed(2)}%</span>
            </div>
            <div class="tooltip-row">
              <span style="color: #667994">1Y Ago:</span>
              <span class="tooltip-val-bold">${pt1y.val.toFixed(2)}%</span>
            </div>
          `;
        } else {
          html = `
            <div class="tooltip-header">${pt.label} Treasury (${year})</div>
            <div class="tooltip-row">
              <span style="color: var(--color-caution)">Yield Rate:</span>
              <span class="tooltip-val-bold">${pt.val.toFixed(2)}%</span>
            </div>
          `;
        }
        showTooltip(tooltip, e, html);
      }
    });

    circle.addEventListener('mousemove', (e) => {
      moveTooltip(tooltip, e);
    });

    circle.addEventListener('mouseleave', () => {
      hideTooltip(tooltip);
    });

    nodesGroup.appendChild(circle);
  });
}

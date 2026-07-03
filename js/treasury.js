/* ============================================================
   MacroScope — Treasury Yield Curve Dashboard Module
   ============================================================ */

import { showTooltip, hideTooltip, moveTooltip } from './utils.js';

export function initTreasuryDashboard(config, data) {
  const yields = data.treasury.yields;
  const maturities = config.treasuryDashboard.maturities;
  const source = config.treasuryDashboard.source;

  // Set source text
  const sourceEl = document.getElementById('treasury-source-text');
  if (sourceEl) sourceEl.textContent = `Source: ${source}`;

  // Render rates table
  renderYieldsTable(maturities, yields);

  // Render spreads KPI card values
  renderSpreads(data.treasury);

  // Render SVG Yield Curve
  renderYieldCurveSVG(maturities, yields);
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

function renderYieldCurveSVG(maturities, yields) {
  const svg = document.getElementById('yield-curve-svg');
  const tooltip = document.getElementById('map-tooltip-el');
  if (!svg) return;

  const gridlinesGroup = svg.querySelector('.gridlines');
  const xAxisGroup = svg.querySelector('.x-axis');
  const nodesGroup = document.getElementById('yield-curve-nodes');
  const path = document.getElementById('yield-curve-path');

  if (!gridlinesGroup || !xAxisGroup || !nodesGroup || !path) return;

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

  const maxYield = 6.0; // Y-Axis goes up to 6.0%

  // 1. Draw Y-axis gridlines and labels (0.0% to 6.0%)
  const yTicks = 6;
  for (let i = 0; i <= yTicks; i++) {
    const yVal = (maxYield / yTicks) * i;
    const y = paddingTop + plotHeight * (1 - yVal / maxYield);

    // Gridline
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingLeft);
    line.setAttribute('y1', y);
    line.setAttribute('x2', width - paddingRight);
    line.setAttribute('y2', y);
    gridlinesGroup.appendChild(line);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', paddingLeft - 10);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.textContent = `${yVal.toFixed(1)}%`;
    gridlinesGroup.appendChild(text);
  }

  // 2. Map coordinates and draw vertical guides
  const points = [];
  const xStep = plotWidth / (maturities.length - 1);

  maturities.forEach((m, idx) => {
    const x = paddingLeft + idx * xStep;
    const yVal = yields[m.key] || 0;
    const y = paddingTop + plotHeight * (1 - yVal / maxYield);
    
    points.push({ x, y, val: yVal, label: m.label, key: m.key });

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

  // 3. Draw curved/straight path connecting points
  let pathD = '';
  points.forEach((pt, idx) => {
    if (idx === 0) {
      pathD += `M ${pt.x} ${pt.y}`;
    } else {
      pathD += ` L ${pt.x} ${pt.y}`;
    }
  });
  path.setAttribute('d', pathD);

  // 4. Render hoverable circles/dots
  points.forEach(pt => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'curve-node');

    circle.addEventListener('mouseenter', (e) => {
      if (tooltip) {
        const html = `
          <div class="tooltip-header">${pt.label} Treasury</div>
          <div class="tooltip-row">
            <span>Yield Rate:</span>
            <span class="tooltip-val-bold" style="color: var(--color-up)">${pt.val.toFixed(2)}%</span>
          </div>
        `;
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

/* ============================================================
   MacroScope — GDP Nowcast Dashboard Module
   ============================================================ */

export function initNowcastDashboard(config) {
  fetch('./nowcastData.json')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load nowcast data');
      return res.json();
    })
    .then(data => {
      renderHeadlineKpis(data);
      renderContributionsChart(data.components);
      renderReleasesLog(data.releases);
    })
    .catch(err => {
      console.error('Error loading nowcasting dashboard:', err);
    });
}

function renderHeadlineKpis(data) {
  const currentEl = document.getElementById('nowcast-current-val');
  const baselineEl = document.getElementById('nowcast-baseline-val');
  const revisionEl = document.getElementById('nowcast-net-revision');

  if (currentEl) currentEl.textContent = `${data.current.toFixed(2)}%`;
  if (baselineEl) baselineEl.textContent = `${data.baseline.toFixed(2)}%`;

  if (revisionEl) {
    const revisionVal = data.current - data.baseline;
    revisionEl.textContent = `${revisionVal >= 0 ? '+' : ''}${revisionVal.toFixed(2)}%`;
    revisionEl.className = `nowcast-kpi-value ${revisionVal >= 0 ? 'surplus-text' : 'deficit-text'}`;
    revisionEl.style.color = revisionVal >= 0 ? 'var(--color-up)' : 'var(--color-down)';
  }
}

function renderContributionsChart(components) {
  const barContainer = document.getElementById('nowcast-segmented-bar');
  const legendContainer = document.getElementById('nowcast-legend');

  if (!barContainer || !legendContainer) return;

  barContainer.innerHTML = '';
  legendContainer.innerHTML = '';

  // Draw bilateral baseline chart
  // Find max absolute value to scale the bars
  const maxAbsVal = Math.max(...components.map(c => Math.abs(c.value)), 1.0);

  components.forEach(c => {
    const row = document.createElement('div');
    row.className = 'nowcast-chart-row';

    const label = document.createElement('div');
    label.className = 'nowcast-chart-label';
    label.textContent = c.name;

    const barWrap = document.createElement('div');
    barWrap.className = 'nowcast-chart-bar-wrap';

    const zeroLine = document.createElement('div');
    zeroLine.className = 'nowcast-chart-zero-line';

    const bar = document.createElement('div');
    bar.className = 'nowcast-chart-bar';
    bar.style.backgroundColor = c.color;

    const valPct = (Math.abs(c.value) / maxAbsVal) * 50; // Max width is 50% of the container side

    if (c.value >= 0) {
      bar.style.left = '50%';
      bar.style.width = `${valPct}%`;
      bar.style.borderRadius = '0 var(--radius-sm) var(--radius-sm) 0';
    } else {
      bar.style.right = '50%';
      bar.style.width = `${valPct}%`;
      bar.style.borderRadius = 'var(--radius-sm) 0 0 var(--radius-sm)';
    }

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'nowcast-chart-value';
    valueDisplay.textContent = `${c.value >= 0 ? '+' : ''}${c.value.toFixed(2)}%`;
    valueDisplay.style.color = c.value >= 0 ? 'var(--color-up)' : 'var(--color-down)';

    barWrap.appendChild(zeroLine);
    barWrap.appendChild(bar);
    
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(valueDisplay);

    barContainer.appendChild(row);

    // Add legend detailed item
    const legendItem = document.createElement('div');
    legendItem.className = 'assets-legend-item';
    legendItem.innerHTML = `
      <span class="assets-legend-dot" style="background-color: ${c.color}"></span>
      <span>${c.name}: <span class="assets-legend-val" style="color: ${c.value >= 0 ? 'var(--color-up)' : 'var(--color-down)'}">${c.value >= 0 ? '+' : ''}${c.value.toFixed(2)}%</span></span>
    `;
    legendContainer.appendChild(legendItem);
  });
}

function renderReleasesLog(releases) {
  const tbody = document.getElementById('nowcast-releases-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  releases.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'nowcast-log-row';

    const impactSign = r.impact >= 0 ? '+' : '';
    const impactColor = r.impact >= 0 ? 'var(--color-up)' : 'var(--color-down)';

    tr.innerHTML = `
      <td style="white-space: nowrap; color: var(--text-secondary);">${r.release_date}</td>
      <td>
        <div style="font-weight: 500; color: var(--text-primary);">${r.indicator}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${r.details}</div>
      </td>
      <td class="numeric font-mono" style="color: ${impactColor}; font-weight: 600;">
        ${impactSign}${r.impact.toFixed(2)}%
      </td>
      <td class="numeric font-mono" style="color: var(--text-primary);">${r.new_nowcast.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

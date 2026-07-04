/* ============================================================
   MacroScope — Global Central Banks Dashboard Module
   ============================================================ */

export function initCentralBanksDashboard(config, data) {
  const grid = document.getElementById('central-banks-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const banks = data.centralBanks.banks;

  Object.keys(banks).forEach(key => {
    const bank = banks[key];
    const card = document.createElement('div');
    card.className = 'cb-card';
    card.tabIndex = 0;

    // Map bias values to css classes
    let biasClass = 'bias-neutral';
    if (bank.bias.toLowerCase() === 'hawkish') {
      biasClass = 'bias-hawkish';
    } else if (bank.bias.toLowerCase() === 'dovish') {
      biasClass = 'bias-dovish';
    }

    // Determine flag or icon styling based on region/bank_id
    const flagSymbol = getRegionFlag(bank.region);

    card.innerHTML = `
      <div class="cb-header">
        <div class="cb-title-group">
          <div class="cb-name">${flagSymbol} ${bank.name}</div>
          <div class="cb-region">${bank.region}</div>
        </div>
        <span class="cb-badge ${bank.stanceClass || 'stance--neutral'}">${bank.stance}</span>
      </div>

      <div class="cb-rate-section">
        <span class="cb-rate-label">Policy Rate</span>
        <div class="cb-rate-value">${bank.rateLabel || (bank.rate.toFixed(2) + '%')}</div>
      </div>

      <div class="cb-stats">
        <div class="cb-stat-row">
          <span class="cb-stat-label">YoY Inflation</span>
          <span class="cb-stat-value" style="color: ${bank.inflation > 2.0 ? 'var(--color-down)' : 'var(--color-up)'}">
            ${bank.inflation.toFixed(1)}%
          </span>
        </div>
        <div class="cb-stat-row">
          <span class="cb-stat-label">Balance Sheet</span>
          <span class="cb-stat-value">${bank.balanceSheet ? '$' + bank.balanceSheet.toFixed(2) + 'T' : '—'}</span>
        </div>
        <div class="cb-stat-row">
          <span class="cb-stat-label">Policy Bias</span>
          <span class="cb-bias-badge ${biasClass}">${bank.bias}</span>
        </div>
      </div>

      <div class="cb-meeting">
        <span>Next Decision:</span>
        <span style="font-family: var(--font-mono); color: var(--text-secondary);">${bank.nextMeeting}</span>
      </div>
    `;

    grid.appendChild(card);
  });

  // Render FX matrix
  if (data.fx) {
    renderFxMatrix(data.fx);
  }
}

function renderFxMatrix(fxData) {
  const container = document.getElementById('fx-matrix-grid');
  if (!container) return;

  container.innerHTML = '';

  const pairs = [
    { key: 'eur_usd', label: 'EUR / USD', flag: '🇪🇺🇺🇸' },
    { key: 'usd_jpy', label: 'USD / JPY', flag: '🇺🇸🇯🇵' },
    { key: 'gbp_usd', label: 'GBP / USD', flag: '🇬🇧🇺🇸' },
    { key: 'usd_cny', label: 'USD / CNY', flag: '🇺🇸🇨🇳' },
    { key: 'usd_cad', label: 'USD / CAD', flag: '🇺🇸🇨🇦' },
    { key: 'usd_chf', label: 'USD / CHF', flag: '🇺🇸🇨🇭' },
    { key: 'aud_usd', label: 'AUD / USD', flag: '🇦🇺🇺🇸' }
  ];

  pairs.forEach(pair => {
    const val = fxData[pair.key];
    if (val === undefined) return;

    const change = fxData[`${pair.key}_tag`] || '—';
    const trend = fxData[`${pair.key}_trend`] || 'neutral';
    const period = fxData[`${pair.key}_period`] || '—';

    const card = document.createElement('div');
    card.className = 'fx-card';
    card.tabIndex = 0;

    let trendClass = 'trend-tag';
    let trendSign = '';
    if (trend === 'up') {
      trendClass = 'trend-tag trend--up';
      trendSign = '▲';
    } else if (trend === 'down') {
      trendClass = 'trend-tag trend--down';
      trendSign = '▼';
    }

    card.innerHTML = `
      <div class="fx-header">
        <span class="fx-flags" style="font-size: 1.1rem; margin-right: 6px;">${pair.flag}</span>
        <span class="fx-label" style="font-size: 0.75rem; text-transform: uppercase; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.05em;">${pair.label}</span>
      </div>
      <div class="fx-rate-value" style="font-family: var(--font-mono); font-size: 1.6rem; font-weight: 600; color: var(--text-primary); margin: var(--space-xs) 0;">
        ${parseFloat(val).toFixed(4)}
      </div>
      <div class="fx-footer" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem;">
        <span class="${trendClass}">${trendSign} ${change}</span>
        <span class="fx-period" style="color: var(--text-muted); font-family: var(--font-mono);">${period}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

function getRegionFlag(region) {
  switch (region.toLowerCase()) {
    case 'united states': return '🇺🇸';
    case 'eurozone': return '🇪🇺';
    case 'china': return '🇨🇳';
    case 'japan': return '🇯🇵';
    case 'united kingdom': return '🇬🇧';
    default: return '🏦';
  }
}

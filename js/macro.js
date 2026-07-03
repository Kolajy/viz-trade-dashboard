/* ============================================================
   MacroScope — Macro Dashboard Indicators Module
   ============================================================ */

import { getValueByPath } from './utils.js';

export function initMacroDashboard(config, data) {
  // Populate last updated timestamp
  const subtitleEl = document.querySelector('.header-subtitle');
  if (subtitleEl && data.lastUpdated) {
    const d = new Date(data.lastUpdated);
    subtitleEl.textContent = `Updated: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  }

  // Update top KPI Strip values (from standard data fields)
  updateKpiItem('kpi-sp500', data.market.sp500, data.market.sp500_meta, data.market.sp500_trend, false);
  updateKpiItem('kpi-vix', data.market.vix, 'Fear Gauge', data.market.vix_trend, false);
  updateKpiItem('kpi-treasury', data.market.treasury10y, '10Y Yield', data.market.treasury10y_trend, true);
  updateKpiItem('kpi-erp', data.market.equity_risk_premium, 'Historically Thin', data.market.equity_risk_premium_trend, true, '+');
  updateKpiItem('kpi-spread', data.market.yield_spread, data.market.yield_spread >= 0 ? 'Uninverted' : 'Inverted', data.market.yield_spread_trend, true, '+');
  updateKpiItem('kpi-gold', data.market.gold, 'XAU/USD', data.market.gold_trend, false, '$');
  updateKpiItem('kpi-oil', data.market.oil, 'WTI Crude', data.market.oil_trend, false, '$');

  // Render and populate configurations-driven indicators
  if (config && config.macroDashboard && config.macroDashboard.metrics) {
    config.macroDashboard.metrics.forEach(metric => {
      const val = getValueByPath(data, metric.valueKey);
      const tag = getValueByPath(data, metric.tagKey);
      const barWidth = metric.barKey ? getValueByPath(data, metric.barKey) : null;
      const periodVal = metric.periodKey ? getValueByPath(data, metric.periodKey) : null;
      
      if (val === null || val === undefined) return;

      if (metric.type === 'pmi') {
        updatePmiBlock(metric.id, val, tag, barWidth);
      } else if (metric.type === 'inflation') {
        updateInflationMetric(metric.id, val, barWidth);
      } else {
        updateMetricBlock(metric.id, val, metric.unit, tag, barWidth, metric.isSigned);
      }

      // Render period and source agency metadata dynamically
      const block = document.getElementById(metric.id);
      if (block) {
        const periodEl = block.querySelector('.metric-period');
        if (periodEl && periodVal) {
          periodEl.textContent = `${periodVal} · ${metric.source}`;
        }
      }
    });
  }

  // Update Fed policy balance sheet values
  const balSheetEl = document.getElementById('fed-balance-sheet');
  if (balSheetEl && data.market.fed_balance_sheet) {
    balSheetEl.textContent = `$${data.market.fed_balance_sheet.toFixed(2)}T`;
  }
}

function updateKpiItem(id, value, meta, trend, isPercent, prefix = '') {
  const item = document.getElementById(id);
  if (!item) return;

  const valEl = item.querySelector('.kpi-value');
  const metaEl = item.querySelector('.kpi-meta');

  if (valEl) {
    let formattedVal = value.toLocaleString();
    if (isPercent) {
      const sign = prefix === '+' && value >= 0 ? '+' : '';
      valEl.innerHTML = `${sign}${value.toFixed(2)}<span class="kpi-decimal">%</span>`;
    } else if (prefix === '$') {
      valEl.innerHTML = `$${formattedVal}`;
    } else {
      const parts = value.toFixed(2).split('.');
      valEl.innerHTML = `${parseInt(parts[0]).toLocaleString()}<span class="kpi-decimal">.${parts[1]}</span>`;
    }
  }

  if (metaEl) {
    if (meta) metaEl.textContent = meta;
    metaEl.className = `kpi-meta ${trend}`;
  }
}

function updateMetricBlock(id, value, unit, tag, barWidth, isSigned = false) {
  const block = document.getElementById(id);
  if (!block) return;

  const numEl = block.querySelector('.metric-number');
  const tagEl = block.querySelector('.metric-tag');
  const barEl = block.querySelector('.metric-bar');

  if (numEl) {
    let sign = (isSigned && value > 0) ? '+' : '';
    numEl.innerHTML = `${sign}${value}${unit ? `<span class="metric-unit">${unit}</span>` : ''}`;
  }

  if (tagEl) {
    tagEl.textContent = tag;
    let trendClass = 'neutral';
    if (tag.toLowerCase().includes('growth') || tag.toLowerCase().includes('expansion') || tag.toLowerCase().includes('+')) {
      trendClass = 'up';
    } else if (tag.toLowerCase().includes('drop') || tag.toLowerCase().includes('low') || tag.toLowerCase().includes('−') || tag.toLowerCase().includes('-') || tag.toLowerCase().includes('moderating')) {
      trendClass = 'down';
    } else if (tag.toLowerCase().includes('rising')) {
      trendClass = 'caution';
    }
    tagEl.className = `metric-tag tag--${trendClass}`;
  }

  if (barEl && barWidth) {
    barEl.style.setProperty('--w', barWidth);
    let barTrend = 'neutral';
    if (tag.toLowerCase().includes('growth') || tag.toLowerCase().includes('expansion') || tag.toLowerCase().includes('+')) {
      barTrend = 'up';
    } else if (tag.toLowerCase().includes('drop') || tag.toLowerCase().includes('low') || tag.toLowerCase().includes('−') || tag.toLowerCase().includes('-') || tag.toLowerCase().includes('moderating')) {
      barTrend = 'down';
    } else if (tag.toLowerCase().includes('rising')) {
      barTrend = 'caution';
    }
    barEl.className = `metric-bar bar--${barTrend}`;
  }
}

function updatePmiBlock(id, value, tag, barWidth) {
  const pmiBlock = document.getElementById(id);
  if (!pmiBlock) return;

  const numEl = pmiBlock.querySelector('.metric-number');
  const markerEl = pmiBlock.querySelector('.pmi-marker');
  const tagEl = pmiBlock.querySelector('.metric-tag');

  if (numEl) numEl.innerHTML = `${value.toFixed(1)}`;
  if (markerEl && barWidth) {
    markerEl.style.setProperty('--pmi-pos', barWidth);
  }
  if (tagEl && tag) {
    tagEl.textContent = tag;
  }
}

function updateInflationMetric(id, value, barWidth) {
  const block = document.getElementById(id);
  if (!block) return;

  const numEl = block.querySelector('.metric-number');
  const fillEl = block.querySelector('.inflation-fill');

  if (numEl) {
    numEl.innerHTML = `${value.toFixed(1)}<span class="metric-unit">%</span>`;
  }
  if (fillEl && barWidth) {
    fillEl.style.setProperty('--fill', barWidth);
  }
}

/* ============================================================
   MacroScope — Unified Main Controller (ES Modules Entry)
   ============================================================ */

'use strict';

import { initDatabase, query, getMacroData, getTradeData, getGlobalTradeData } from './js/db.js';
import { initMacroDashboard } from './js/macro.js';
import { initStateTradeDashboard } from './js/state-trade.js';
import { initGlobalTradeDashboard } from './js/global-trade.js';
import { initTreasuryDashboard } from './js/treasury.js';
import { initFedHealthDashboard } from './js/fed-health.js';
import { initCentralBanksDashboard } from './js/central-banks.js';
import { initNowcastDashboard } from './js/nowcast.js';

let appConfig = null;
let appData = null;
let isStateMapInitialized = false;
let isGlobalMapInitialized = false;
let isTreasuryInitialized = false;
let isFedHealthInitialized = false;
let isCentralBanksInitialized = false;
let isNowcastInitialized = false;

// Intercept window.fetch to route data queries directly to the browser-loaded SQLite database (data.db)
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  // Normalize the URL path
  const normalizedUrl = typeof url === 'string' ? url.split('?')[0].replace(/^\.\//, '') : '';

  if (normalizedUrl === 'dashboard-config.json') {
    const configRow = query("SELECT value FROM configs WHERE key = 'dashboard_config'");
    if (configRow.length === 0) return new Response('Config not found in DB', { status: 404 });
    return new Response(configRow[0].value, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'usa-map-dimensions.json') {
    const mapRow = query("SELECT value FROM configs WHERE key = 'usa_map_dimensions'");
    if (mapRow.length === 0) return new Response('Map dims not found in DB', { status: 404 });
    return new Response(mapRow[0].value, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'data.json') {
    const macroData = getMacroData();
    return new Response(JSON.stringify(macroData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'tradeData.json') {
    const tradeData = getTradeData();
    return new Response(JSON.stringify(tradeData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'globalTradeData.json') {
    const globalTradeData = getGlobalTradeData();
    return new Response(JSON.stringify(globalTradeData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'nowcastData.json') {
    const components = query('SELECT * FROM nowcast_components');
    const releases = query('SELECT * FROM nowcast_releases ORDER BY id DESC');
    const baseline = query("SELECT value FROM metrics WHERE key = 'gdp_nowcast_baseline'");
    const current = query("SELECT value FROM metrics WHERE key = 'gdp_nowcast'");
    return new Response(JSON.stringify({
      components,
      releases,
      baseline: baseline.length > 0 ? parseFloat(baseline[0].value) : 1.8,
      current: current.length > 0 ? parseFloat(current[0].value) : 2.2
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (normalizedUrl === 'historicalYields.json') {
    const raw = query('SELECT * FROM historical_yields ORDER BY year ASC');
    const compiled = {};
    for (const r of raw) {
      if (!compiled[r.year]) compiled[r.year] = {};
      compiled[r.year][r.maturity] = r.yield;
    }
    return new Response(JSON.stringify(compiled), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fall back to actual network fetch for everything else (e.g. world-map.svg, sql.js wasm files)
  return originalFetch.apply(this, arguments);
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialize SQLite Database from WebAssembly on page load
    console.log('Loading SQLite database in browser via WASM...');
    await initDatabase();
    console.log('Database loaded successfully.');

    // 2. Fetch dashboard configuration (routed through our SQLite interceptor)
    const configRes = await fetch('./dashboard-config.json');
    if (!configRes.ok) throw new Error('Configuration fetch from SQLite failed');
    appConfig = await configRes.json();

    // 3. Fetch indicators data (routed through our SQLite interceptor)
    const dataRes = await fetch(appConfig.macroDashboard.dataUrl);
    if (!dataRes.ok) throw new Error('Macro indicators fetch from SQLite failed');
    appData = await dataRes.json();

    // 4. Boot up the macro indicators dashboard dynamically
    initMacroDashboard(appConfig, appData);
  } catch (err) {
    console.warn('Unable to initialize dashboard from SQLite. Falling back to static assets.', err);
  }

  // Setup simple focus styling navigational keyboard behavior
  initKeyboardNavigation();

  // Initialize tabs management system
  initTabs();
});

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('aria-controls');

      // Update button active state
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Update tab pane active state
      tabPanes.forEach(pane => {
        if (pane.id === targetTab) {
          pane.style.display = 'block';
          pane.classList.add('active');
        } else {
          pane.style.display = 'none';
          pane.classList.remove('active');
        }
      });

      // Lazy load trade maps when their tabs are first selected
      if (targetTab === 'tab-trade' && !isStateMapInitialized && appConfig) {
        initStateTradeDashboard(appConfig);
        isStateMapInitialized = true;
      }
      
      if (targetTab === 'tab-global-trade' && !isGlobalMapInitialized && appConfig && appData) {
        initGlobalTradeDashboard(appConfig, appData);
        isGlobalMapInitialized = true;
      }

      if (targetTab === 'tab-treasury' && !isTreasuryInitialized && appConfig && appData) {
        initTreasuryDashboard(appConfig, appData);
        isTreasuryInitialized = true;
      }

      if (targetTab === 'tab-fed-health' && !isFedHealthInitialized && appConfig && appData) {
        initFedHealthDashboard(appConfig, appData);
        isFedHealthInitialized = true;
      }

      if (targetTab === 'tab-central-banks' && !isCentralBanksInitialized && appConfig && appData) {
        initCentralBanksDashboard(appConfig, appData);
        isCentralBanksInitialized = true;
      }

      if (targetTab === 'tab-nowcast' && !isNowcastInitialized && appConfig) {
        initNowcastDashboard(appConfig);
        isNowcastInitialized = true;
      }
    });
  });
}

function initKeyboardNavigation() {
  const blocks = Array.from(document.querySelectorAll('.metric-block, .policy-block, .cb-card, .nowcast-card, .fx-card'));
  blocks.forEach((block, i) => {
    block.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = blocks[i + 1];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = blocks[i - 1];
      
      if (next) {
        e.preventDefault();
        next.focus();
      }
    });
  });
}

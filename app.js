/* ============================================================
   MacroScope — Unified Main Controller (ES Modules Entry)
   ============================================================ */

'use strict';

import { initMacroDashboard } from './js/macro.js';
import { initStateTradeDashboard } from './js/state-trade.js';
import { initGlobalTradeDashboard } from './js/global-trade.js';

let appConfig = null;
let isStateMapInitialized = false;
let isGlobalMapInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
  // Load dashboard configuration first
  fetch('./dashboard-config.json')
    .then(res => {
      if (!res.ok) throw new Error('Configuration file fetch failed');
      return res.json();
    })
    .then(config => {
      appConfig = config;
      // Fetch live macro indicators data using configured URL
      return fetch(config.macroDashboard.dataUrl);
    })
    .then(res => {
      if (!res.ok) throw new Error('Macro indicators data fetch failed');
      return res.json();
    })
    .then(data => {
      // Boot up the macro indicators dashboard dynamically
      initMacroDashboard(appConfig, data);
    })
    .catch(err => {
      console.warn('Unable to load data.json / configuration. Falling back to static HTML elements.', err);
    });

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
      
      if (targetTab === 'tab-global-trade' && !isGlobalMapInitialized && appConfig) {
        initGlobalTradeDashboard(appConfig);
        isGlobalMapInitialized = true;
      }
    });
  });
}

function initKeyboardNavigation() {
  const blocks = Array.from(document.querySelectorAll('.metric-block, .policy-block'));
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

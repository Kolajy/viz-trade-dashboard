let dbInstance = null;

export async function initDatabase() {
  if (dbInstance) return dbInstance;

  // 1. Dynamically load sql.js library from CDN
  if (typeof initSqlJs === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // 2. Initialize SQL.js
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
  });

  // 3. Fetch data.db binary
  const response = await fetch('./data.db');
  if (!response.ok) throw new Error('Failed to fetch data.db file.');
  const arrayBuffer = await response.arrayBuffer();

  // 4. Open the SQLite database
  dbInstance = new SQL.Database(new Uint8Array(arrayBuffer));
  return dbInstance;
}

export function query(sql, params = []) {
  if (!dbInstance) throw new Error('Database is not initialized.');
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper to build macro/market/fed JSON structure on-the-fly
 */
export function getMacroData() {
  const data = {
    lastUpdated: new Date().toISOString(),
    market: {},
    macro: {},
    inflation: {},
    fx: {},
    treasury: {
      lastUpdated: new Date().toISOString(),
      yields: {},
      yields1MonthAgo: {},
      yields1YearAgo: {},
      spread2y10y: null,
      spread3m10y: null
    },
    fedHealth: {
      lastUpdated: new Date().toISOString()
    },
    centralBanks: {
      lastUpdated: new Date().toISOString(),
      banks: {}
    }
  };

  const metrics = query('SELECT * FROM metrics');
  for (const m of metrics) {
    if (m.category === 'market' || m.category === 'macro' || m.category === 'inflation' || m.category === 'fx') {
      const isNum = !isNaN(m.value) && m.value !== '' && m.value !== null;
      const parsedValue = isNum ? parseFloat(m.value) : m.value;
      
      data[m.category][m.key] = parsedValue;
      if (m.period) {
        if (m.category === 'market') {
          data[m.category][`${m.key}_meta`] = m.period;
        } else {
          data[m.category][`${m.key}_period`] = m.period;
        }
      }
      if (m.tag) data[m.category][`${m.key}_tag`] = m.tag;
      if (m.bar) {
        if (m.key === 'ism_pmi') {
          data[m.category]['pmi_pos'] = m.bar;
        } else if (m.key === 'services_pmi') {
          data[m.category]['services_pmi_pos'] = m.bar;
        } else {
          data[m.category][`${m.key}_bar`] = m.bar;
        }
      }
      if (m.trend) data[m.category][`${m.key}_trend`] = m.trend;
    } else if (m.category === 'treasury') {
      data.treasury[m.key] = parseFloat(m.value);
    } else if (m.category === 'fedHealth') {
      data.fedHealth[m.key] = parseFloat(m.value);
    }
  }

  const yields = query('SELECT * FROM treasury_yields');
  for (const y of yields) {
    data.treasury.yields[y.maturity] = y.yield;
    data.treasury.yields1MonthAgo[y.maturity] = y.yield_1m_ago;
    data.treasury.yields1YearAgo[y.maturity] = y.yield_1y_ago;
  }

  const fhRow = query("SELECT * FROM fed_health WHERE key = 'fed_assets'");
  if (fhRow.length > 0) {
    const r = fhRow[0];
    data.fedHealth.totalAssets = r.value;
    data.fedHealth.peakAssets = r.peak;
    data.fedHealth.change1y = r.change_1y;
    data.fedHealth.qtPacing = r.qt_pacing;
    data.fedHealth.lastUpdated = r.last_updated;
  }

  const banks = query('SELECT * FROM central_banks');
  for (const b of banks) {
    data.centralBanks.banks[b.bank_id] = {
      name: b.name,
      region: b.region,
      rate: b.rate,
      rateLabel: b.rate_label,
      inflation: b.inflation,
      balanceSheet: b.balance_sheet,
      stance: b.stance,
      stanceClass: b.stance_class,
      bias: b.bias,
      nextMeeting: b.next_meeting
    };
  }

  return data;
}

/**
 * Helper to build U.S. states import/export trade JSON structure on-the-fly
 */
export function getTradeData() {
  const tradeMetaRow = query("SELECT value FROM configs WHERE key = 'trade_data_metadata'");
  const tradeMeta = tradeMetaRow.length > 0 ? JSON.parse(tradeMetaRow[0].value) : { lastUpdated: new Date().toISOString(), source: '' };
  
  const stateList = query('SELECT * FROM states');
  const stateCommodities = query('SELECT * FROM state_commodities');

  const tradeData = {
    lastUpdated: tradeMeta.lastUpdated,
    source: tradeMeta.source,
    states: {}
  };

  for (const s of stateList) {
    tradeData.states[s.state_code] = {
      name: s.name,
      exportsTotal: s.exports_total,
      exportsTop: s.exports_top,
      importsTotal: s.imports_total,
      importsTop: s.imports_top,
      topPartner: s.top_partner,
      exportsList: [],
      importsList: []
    };
  }

  for (const c of stateCommodities) {
    if (tradeData.states[c.state_code]) {
      const targetList = c.type === 'export' ? 'exportsList' : 'importsList';
      tradeData.states[c.state_code][targetList].push({
        commodity: c.commodity,
        amount: c.amount
      });
    }
  }

  return tradeData;
}

/**
 * Helper to build international global trade JSON structure on-the-fly
 */
export function getGlobalTradeData() {
  const globalMetaRow = query("SELECT value FROM configs WHERE key = 'global_trade_data_metadata'");
  const globalMeta = globalMetaRow.length > 0 ? JSON.parse(globalMetaRow[0].value) : { lastUpdated: new Date().toISOString(), source: '' };

  const partnerList = query('SELECT * FROM global_partners');
  const partnerCommodities = query('SELECT * FROM global_partner_commodities');

  const globalTradeData = {
    lastUpdated: globalMeta.lastUpdated,
    source: globalMeta.source,
    partners: {}
  };

  for (const p of partnerList) {
    globalTradeData.partners[p.partner_code] = {
      name: p.name,
      exports: p.exports,
      imports: p.imports,
      totalTrade: p.total_trade,
      tradeBalance: p.trade_balance,
      shareOfTotal: p.share_of_total,
      topExport: p.top_export,
      topImport: p.top_import,
      desc: p.desc,
      exportsList: [],
      importsList: []
    };
  }

  for (const c of partnerCommodities) {
    if (globalTradeData.partners[c.partner_code]) {
      const targetList = c.type === 'export' ? 'exportsList' : 'importsList';
      globalTradeData.partners[c.partner_code][targetList].push({
        commodity: c.commodity,
        amount: c.amount
      });
    }
  }

  return globalTradeData;
}

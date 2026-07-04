const fs = require('fs');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS/MacroScope' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => reject(err));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase(db) {
  // Create tables
  await runQuery(db, `
    CREATE TABLE IF NOT EXISTS metrics (
      category TEXT,
      key TEXT PRIMARY KEY,
      value TEXT,
      period TEXT,
      tag TEXT,
      bar TEXT,
      trend TEXT
    )
  `);

  await runQuery(db, `
    CREATE TABLE IF NOT EXISTS treasury_yields (
      maturity TEXT PRIMARY KEY,
      yield REAL,
      yield_1m_ago REAL,
      yield_1y_ago REAL
    )
  `);

  await runQuery(db, `
    CREATE TABLE IF NOT EXISTS central_banks (
      bank_id TEXT PRIMARY KEY,
      name TEXT,
      region TEXT,
      rate REAL,
      rate_label TEXT,
      inflation REAL,
      balance_sheet REAL,
      stance TEXT,
      stance_class TEXT,
      bias TEXT,
      next_meeting TEXT
    )
  `);

  await runQuery(db, `
    CREATE TABLE IF NOT EXISTS fed_health (
      key TEXT PRIMARY KEY,
      value REAL,
      peak REAL,
      change_1y REAL,
      qt_pacing TEXT,
      last_updated TEXT
    )
  `);

  // Check if metrics table is empty, if so, seed from data.json
  const rows = await allQuery(db, 'SELECT count(*) as count FROM metrics');
  if (rows[0].count === 0) {
    console.log('Database empty. Seeding from existing data.json...');
    const localDataPath = path.join(__dirname, '../data.json');
    if (fs.existsSync(localDataPath)) {
      const initialData = JSON.parse(fs.readFileSync(localDataPath, 'utf8'));

      // Seed standard metrics (market, macro, inflation)
      const categories = ['market', 'macro', 'inflation'];
      for (const cat of categories) {
        if (initialData[cat]) {
          const keys = Object.keys(initialData[cat]);
          const baseKeys = Array.from(new Set(keys.map(k => k.split('_')[0])));
          for (const base of baseKeys) {
            const value = initialData[cat][base] !== undefined ? String(initialData[cat][base]) : null;
            const period = initialData[cat][`${base}_period`] || initialData[cat][`${base}_meta`] || null;
            const tag = initialData[cat][`${base}_tag`] || null;
            const bar = initialData[cat][`${base}_bar`] || initialData[cat][`${base}_pos`] || null;
            const trend = initialData[cat][`${base}_trend`] || null;
            
            if (value !== null) {
              await runQuery(db, `
                INSERT OR REPLACE INTO metrics (category, key, value, period, tag, bar, trend)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [cat, base, value, period, tag, bar, trend]);
            }
          }
          
          const extras = ['earnings_yield', 'equity_risk_premium', 'yield_spread', 'fed_funds', 'fed_decision', 'fed_balance_sheet'];
          for (const ext of extras) {
            if (initialData[cat][ext] !== undefined) {
              const value = String(initialData[cat][ext]);
              const trend = initialData[cat][`${ext}_trend`] || null;
              await runQuery(db, `
                INSERT OR REPLACE INTO metrics (category, key, value, trend)
                VALUES (?, ?, ?, ?)
              `, [cat, ext, value, trend]);
            }
          }
        }
      }

      // Seed treasury yields
      if (initialData.treasury && initialData.treasury.yields) {
        const maturities = Object.keys(initialData.treasury.yields);
        for (const mat of maturities) {
          const y = initialData.treasury.yields[mat];
          const y1m = initialData.treasury.yields1MonthAgo ? initialData.treasury.yields1MonthAgo[mat] : null;
          const y1y = initialData.treasury.yields1YearAgo ? initialData.treasury.yields1YearAgo[mat] : null;
          await runQuery(db, `
            INSERT OR REPLACE INTO treasury_yields (maturity, yield, yield_1m_ago, yield_1y_ago)
            VALUES (?, ?, ?, ?)
          `, [mat, y, y1m, y1y]);
        }
        await runQuery(db, `
          INSERT OR REPLACE INTO metrics (category, key, value)
          VALUES ('treasury', 'spread2y10y', ?)
        `, [String(initialData.treasury.spread2y10y)]);
        await runQuery(db, `
          INSERT OR REPLACE INTO metrics (category, key, value)
          VALUES ('treasury', 'spread3m10y', ?)
        `, [String(initialData.treasury.spread3m10y)]);
      }

      // Seed fedHealth
      if (initialData.fedHealth) {
        const fh = initialData.fedHealth;
        await runQuery(db, `
          INSERT OR REPLACE INTO fed_health (key, value, peak, change_1y, qt_pacing, last_updated)
          VALUES ('fed_assets', ?, ?, ?, ?, ?)
        `, [fh.totalAssets, fh.peakAssets, fh.change1y, fh.qtPacing, fh.lastUpdated]);

        const fhKeys = ['treasuryHoldings', 'mbsHoldings', 'otherHoldings', 'bankReserves', 'reverseRepo', 'tga', 'currencyInCirculation', 'otherLiabilities', 'ioerRate'];
        for (const k of fhKeys) {
          if (fh[k] !== undefined) {
            await runQuery(db, `
              INSERT OR REPLACE INTO metrics (category, key, value)
              VALUES ('fedHealth', ?, ?)
            `, [k, String(fh[k])]);
          }
        }
      }

      // Seed central banks
      if (initialData.centralBanks && initialData.centralBanks.banks) {
        const banks = Object.keys(initialData.centralBanks.banks);
        for (const bid of banks) {
          const b = initialData.centralBanks.banks[bid];
          await runQuery(db, `
            INSERT OR REPLACE INTO central_banks (bank_id, name, region, rate, rate_label, inflation, balance_sheet, stance, stance_class, bias, next_meeting)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [bid, b.name, b.region, b.rate, b.rateLabel, b.inflation, b.balanceSheet, b.stance, b.stanceClass, b.bias, b.nextMeeting]);
        }
      }
    }
  }
}

async function exportAllJson(db) {
  // 1. Export dashboard-config.json
  const configRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'dashboard_config'");
  if (configRow.length > 0) {
    fs.writeFileSync(path.join(__dirname, '../dashboard-config.json'), configRow[0].value);
  }

  // 2. Export usa-map-dimensions.json
  const mapRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'usa_map_dimensions'");
  if (mapRow.length > 0) {
    fs.writeFileSync(path.join(__dirname, '../usa-map-dimensions.json'), mapRow[0].value);
  }

  // 3. Export data.json
  const data = {
    lastUpdated: new Date().toISOString(),
    market: {},
    macro: {},
    inflation: {},
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

  const metrics = await allQuery(db, 'SELECT * FROM metrics');
  for (const m of metrics) {
    if (m.category === 'market' || m.category === 'macro' || m.category === 'inflation') {
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

  const yields = await allQuery(db, 'SELECT * FROM treasury_yields');
  for (const y of yields) {
    data.treasury.yields[y.maturity] = y.yield;
    data.treasury.yields1MonthAgo[y.maturity] = y.yield_1m_ago;
    data.treasury.yields1YearAgo[y.maturity] = y.yield_1y_ago;
  }

  const fhRow = await allQuery(db, "SELECT * FROM fed_health WHERE key = 'fed_assets'");
  if (fhRow.length > 0) {
    const r = fhRow[0];
    data.fedHealth.totalAssets = r.value;
    data.fedHealth.peakAssets = r.peak;
    data.fedHealth.change1y = r.change_1y;
    data.fedHealth.qtPacing = r.qt_pacing;
    data.fedHealth.lastUpdated = r.last_updated;
  }

  const banks = await allQuery(db, 'SELECT * FROM central_banks');
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
  fs.writeFileSync(path.join(__dirname, '../data.json'), JSON.stringify(data, null, 2));

  // 4. Export tradeData.json
  const tradeMetaRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'trade_data_metadata'");
  const tradeMeta = tradeMetaRow.length > 0 ? JSON.parse(tradeMetaRow[0].value) : { lastUpdated: new Date().toISOString(), source: '' };
  
  const stateList = await allQuery(db, 'SELECT * FROM states');
  const stateCommodities = await allQuery(db, 'SELECT * FROM state_commodities');

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
  fs.writeFileSync(path.join(__dirname, '../tradeData.json'), JSON.stringify(tradeData, null, 2));

  // 5. Export globalTradeData.json
  const globalMetaRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'global_trade_data_metadata'");
  const globalMeta = globalMetaRow.length > 0 ? JSON.parse(globalMetaRow[0].value) : { lastUpdated: new Date().toISOString(), source: '' };

  const partnerList = await allQuery(db, 'SELECT * FROM global_partners');
  const partnerCommodities = await allQuery(db, 'SELECT * FROM global_partner_commodities');

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
  fs.writeFileSync(path.join(__dirname, '../globalTradeData.json'), JSON.stringify(globalTradeData, null, 2));
}

async function updateMetrics() {
  console.log('Opening SQLite database...');
  const db = await openDatabase();

  try {
    console.log('Initializing database schema and seeding if necessary...');
    await initDatabase(db);

    console.log('Fetching latest market data from external APIs...');
    const updates = {};

    try {
      const sp500Data = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d');
      const price = sp500Data.chart.result[0].indicators.quote[0].close[0];
      if (price) {
        updates.sp500 = price;
        updates.sp500_trend = price >= sp500Data.chart.result[0].meta.previousClose ? 'up' : 'down';
      }
    } catch (e) {
      console.warn('SP500 fetch fallback:', e.message);
    }

    try {
      const vixData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d');
      const price = vixData.chart.result[0].indicators.quote[0].close[0];
      if (price) {
        updates.vix = price;
        updates.vix_trend = price >= vixData.chart.result[0].meta.previousClose ? 'up' : 'down';
      }
    } catch (e) {
      console.warn('VIX fetch fallback:', e.message);
    }

    try {
      const treasury10yData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d');
      const price = treasury10yData.chart.result[0].indicators.quote[0].close[0];
      if (price) {
        updates.treasury10y = price / 10;
      }
    } catch (e) {
      console.warn('10Y Yield fetch fallback:', e.message);
    }

    try {
      const goldData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d');
      const price = goldData.chart.result[0].indicators.quote[0].close[0];
      if (price) {
        updates.gold = price;
        updates.gold_trend = price >= goldData.chart.result[0].meta.previousClose ? 'up' : 'down';
      }
    } catch (e) {
      console.warn('Gold fetch fallback:', e.message);
    }

    try {
      const oilData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d');
      const price = oilData.chart.result[0].indicators.quote[0].close[0];
      if (price) {
        updates.oil = price;
        updates.oil_trend = price >= oilData.chart.result[0].meta.previousClose ? 'up' : 'down';
      }
    } catch (e) {
      console.warn('WTI Crude fetch fallback:', e.message);
    }

    // Apply updates to database
    if (updates.sp500) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ?, period = 'Jun 26 close' WHERE key = 'sp500'", [String(updates.sp500), updates.sp500_trend]);
    }
    if (updates.vix) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'vix'", [String(updates.vix), updates.vix_trend]);
    }
    if (updates.treasury10y) {
      await runQuery(db, "UPDATE metrics SET value = ? WHERE key = 'treasury10y'", [String(updates.treasury10y)]);
      await runQuery(db, "INSERT OR REPLACE INTO treasury_yields (maturity, yield, yield_1m_ago, yield_1y_ago) VALUES ('10Y', ?, (SELECT yield_1m_ago FROM treasury_yields WHERE maturity = '10Y'), (SELECT yield_1y_ago FROM treasury_yields WHERE maturity = '10Y'))", [updates.treasury10y]);
    }
    if (updates.gold) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'gold'", [String(updates.gold), updates.gold_trend]);
    }
    if (updates.oil) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'oil'", [String(updates.oil), updates.oil_trend]);
    }

    // Dynamic calculations: ERP (Equity Risk Premium)
    const peRow = await allQuery(db, "SELECT value FROM metrics WHERE key = 'sp500_pe'");
    const y10yRow = await allQuery(db, "SELECT value FROM metrics WHERE key = 'treasury10y'");
    
    if (peRow.length > 0 && y10yRow.length > 0) {
      const pe = parseFloat(peRow[0].value);
      const y10y = parseFloat(y10yRow[0].value);
      const earningsYield = parseFloat((100 / pe).toFixed(2));
      const erp = parseFloat((earningsYield - y10y).toFixed(2));
      const erpTrend = erp < 1.5 ? 'down' : 'up';

      await runQuery(db, "UPDATE metrics SET value = ? WHERE key = 'earnings_yield'", [String(earningsYield)]);
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'equity_risk_premium'", [String(erp), erpTrend]);
    }

    // Calculate spreads
    const y2yRow = await allQuery(db, "SELECT yield FROM treasury_yields WHERE maturity = '2Y'");
    const y3mRow = await allQuery(db, "SELECT yield FROM treasury_yields WHERE maturity = '3M'");
    if (y10yRow.length > 0) {
      const y10y = parseFloat(y10yRow[0].value);
      if (y2yRow.length > 0) {
        const spread2y10y = parseFloat((y10y - y2yRow[0].yield).toFixed(2));
        await runQuery(db, "UPDATE metrics SET value = ? WHERE key = 'spread2y10y'", [String(spread2y10y)]);
        await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'yield_spread'", [String(spread2y10y), spread2y10y > 0 ? 'up' : 'down']);
      }
      if (y3mRow.length > 0) {
        const spread3m10y = parseFloat((y10y - y3mRow[0].yield).toFixed(2));
        await runQuery(db, "UPDATE metrics SET value = ? WHERE key = 'spread3m10y'", [String(spread3m10y)]);
      }
    }

    // The client reads directly from the SQLite data.db via WebAssembly, 
    // so we no longer need to write these static JSON files.
    // console.log('Exporting all database snapshots to static JSON files...');
    // await exportAllJson(db);

    console.log('Database updated successfully.');
  } finally {
    db.close();
  }
}

updateMetrics().catch(console.error);

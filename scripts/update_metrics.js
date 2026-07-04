const fs = require('fs');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data.db');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS/MacroScope' } }, (res) => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP Error: ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
}

function fetchJson(url) {
  return fetchText(url).then(text => JSON.parse(text));
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

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr, isQuarterly = false) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1]) - 1;
  if (isQuarterly) {
    const q = Math.floor(monthIdx / 3) + 1;
    return `Q${q} ${year}`;
  }
  return `${monthNames[monthIdx]} ${year}`;
}

function fetchFredCsv(symbol) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${symbol}`;
  return fetchText(url).then(csv => {
    const lines = csv.trim().split('\n');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length === 2) {
        const date = parts[0];
        const val = parseFloat(parts[1]);
        if (!isNaN(val)) {
          data.push({ date, val });
        }
      }
    }
    return data;
  });
}

function parseTreasuryXml(xml) {
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  let latestEntry = null;
  let latestDate = '';
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entryContent = match[1];
    const dateMatch = entryContent.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/);
    if (dateMatch) {
      const date = dateMatch[1].split('T')[0];
      if (date > latestDate) {
        latestDate = date;
        latestEntry = entryContent;
      }
    }
  }
  
  if (!latestEntry) return null;
  
  const maturitiesMap = {
    '1M': 'BC_1MONTH',
    '3M': 'BC_3MONTH',
    '6M': 'BC_6MONTH',
    '1Y': 'BC_1YEAR',
    '2Y': 'BC_2YEAR',
    '3Y': 'BC_3YEAR',
    '5Y': 'BC_5YEAR',
    '7Y': 'BC_7YEAR',
    '10Y': 'BC_10YEAR',
    '20Y': 'BC_20YEAR',
    '30Y': 'BC_30YEAR'
  };
  
  const yields = {};
  for (const [key, xmlTag] of Object.entries(maturitiesMap)) {
    const rateMatch = latestEntry.match(new RegExp(`<d:${xmlTag}[^>]*>([\\d.]+)<\\/d:${xmlTag}>`));
    if (rateMatch) {
      yields[key] = parseFloat(rateMatch[1]);
    }
  }
  
  return { date: latestDate, yields };
}

async function exportAllJson(db) {
  const configRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'dashboard_config'");
  if (configRow.length > 0) {
    fs.writeFileSync(path.join(__dirname, '../dashboard-config.json'), configRow[0].value);
  }

  const mapRow = await allQuery(db, "SELECT value FROM configs WHERE key = 'usa_map_dimensions'");
  if (mapRow.length > 0) {
    fs.writeFileSync(path.join(__dirname, '../usa-map-dimensions.json'), mapRow[0].value);
  }

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
    }
  }

  const yields = await allQuery(db, 'SELECT * FROM treasury_yields');
  for (const y of yields) {
    data.treasury.yields[y.maturity] = y.yield;
    data.treasury.yields1MonthAgo[y.maturity] = y.yield_1m_ago;
    data.treasury.yields1YearAgo[y.maturity] = y.yield_1y_ago;
  }

  const spreads = await allQuery(db, "SELECT key, value FROM metrics WHERE category = 'treasury'");
  for (const s of spreads) {
    data.treasury[s.key] = parseFloat(s.value);
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

  const fhMetrics = await allQuery(db, "SELECT key, value FROM metrics WHERE category = 'fedHealth'");
  for (const fm of fhMetrics) {
    data.fedHealth[fm.key] = parseFloat(fm.value);
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
    console.log('1. Fetching latest market data from Yahoo Finance...');
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

    // Apply Yahoo updates to database
    if (updates.sp500) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ?, period = ? WHERE key = 'sp500'", [String(updates.sp500), updates.sp500_trend, formatDate(new Date().toISOString().split('T')[0])]);
    }
    if (updates.vix) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'vix'", [String(updates.vix), updates.vix_trend]);
    }
    if (updates.gold) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'gold'", [String(updates.gold), updates.gold_trend]);
    }
    if (updates.oil) {
      await runQuery(db, "UPDATE metrics SET value = ?, trend = ? WHERE key = 'oil'", [String(updates.oil), updates.oil_trend]);
    }

    console.log('2. Fetching daily treasury yield curve from official XML feed...');
    try {
      const currentYear = new Date().getFullYear();
      let xml = await fetchText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${currentYear}`);
      let parsed = parseTreasuryXml(xml);
      
      // Fallback to previous year if current year XML is empty
      if (!parsed) {
        xml = await fetchText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${currentYear - 1}`);
        parsed = parseTreasuryXml(xml);
      }

      if (parsed) {
        const dateStr = formatDate(parsed.date);
        for (const [mat, val] of Object.entries(parsed.yields)) {
          // Update yield rate. Preserve previous 1m/1y values.
          await runQuery(db, `
            INSERT INTO treasury_yields (maturity, yield, yield_1m_ago, yield_1y_ago) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(maturity) DO UPDATE SET yield = excluded.yield
          `, [mat, val, val, val]);
        }
        console.log(`Successfully updated Treasury yields from official feed (Date: ${parsed.date})`);
        
        // Populate 10y yield from XML if Yahoo TNX missed
        if (!updates.treasury10y && parsed.yields['10Y']) {
          updates.treasury10y = parsed.yields['10Y'];
        }
      }
    } catch (e) {
      console.warn('Treasury yields XML fetch failed:', e.message);
    }

    if (updates.treasury10y) {
      await runQuery(db, "UPDATE metrics SET value = ? WHERE key = 'treasury10y'", [String(updates.treasury10y)]);
      await runQuery(db, "UPDATE treasury_yields SET yield = ? WHERE maturity = '10Y'", [updates.treasury10y]);
    }

    console.log('3. Fetching macro indicators from FRED database...');
    const fredIndicators = [
      { key: 'unemployment', category: 'macro', symbol: 'UNRATE', type: 'latest' },
      { key: 'cpi', category: 'inflation', symbol: 'CPIAUCSL', type: 'yoy', offset: 12 },
      { key: 'pce', category: 'inflation', symbol: 'PCEPI', type: 'yoy', offset: 12 },
      { key: 'core_pce', category: 'inflation', symbol: 'PCEPILFE', type: 'yoy', offset: 12 },
      { key: 'gdp', category: 'macro', symbol: 'GDPC1', type: 'yoy', offset: 4, quarterly: true },
      { key: 'jolts', category: 'macro', symbol: 'JTSJOL', type: 'latest_divide_1000' },
      { key: 'case_shiller', category: 'macro', symbol: 'CSUSHPISA', type: 'yoy', offset: 12 },
      { key: 'savings_rate', category: 'macro', symbol: 'PSAVERT', type: 'latest' },
      { key: 'delinquency_rate', category: 'macro', symbol: 'DRCCLACBS', type: 'latest', quarterly: true },
      { key: 'm2_growth', category: 'macro', symbol: 'M2SL', type: 'yoy', offset: 12 }
    ];

    for (const ind of fredIndicators) {
      try {
        const data = await fetchFredCsv(ind.symbol);
        if (data.length > 0) {
          const latest = data[data.length - 1];
          let value = 0;
          
          if (ind.type === 'latest') {
            value = latest.val;
          } else if (ind.type === 'latest_divide_1000') {
            value = latest.val / 1000;
          } else if (ind.type === 'yoy') {
            const offset = ind.offset || 12;
            if (data.length > offset) {
              const prior = data[data.length - 1 - offset];
              value = ((latest.val - prior.val) / prior.val) * 100;
            }
          }
          
          const formattedVal = (value >= 0 && ind.key === 'case_shiller' ? '+' : '') + value.toFixed(2);
          const formattedPeriod = formatDate(latest.date, ind.quarterly);
          
          await runQuery(db, `
            UPDATE metrics 
            SET value = ?, period = ? 
            WHERE key = ? AND category = ?
          `, [formattedVal, formattedPeriod, ind.key, ind.category]);
          
          console.log(`Updated metric ${ind.key}: ${formattedVal} (${formattedPeriod})`);
        }
      } catch (e) {
        console.warn(`Failed to update FRED indicator ${ind.key}:`, e.message);
      }
    }

    console.log('4. Performing dynamic spreadsheet-like calculations...');
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

    console.log('5. Rebuilding static JSON assets from database...');
    await exportAllJson(db);

    console.log('Database and JSON files updated successfully.');
  } finally {
    db.close();
  }
}

updateMetrics().catch(console.error);

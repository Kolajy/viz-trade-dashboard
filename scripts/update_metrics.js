const fs = require('fs');
const https = require('https');

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

async function updateMetrics() {
  console.log('Fetching latest market data...');
  
  // Baseline setup for 2026 economic indicators
  const data = {
    lastUpdated: new Date().toISOString(),
    market: {
      sp500: 7354.02,
      sp500_meta: 'Jun 26 close',
      sp500_trend: 'up',
      sp500_pe: 22.06,
      earnings_yield: 4.54,
      equity_risk_premium: 0.16,
      equity_risk_premium_trend: 'down',
      treasury10y: 4.38,
      treasury10y_trend: 'neutral',
      treasury2y: 4.07,
      treasury2y_trend: 'neutral',
      yield_spread: 0.31,
      yield_spread_trend: 'up',
      vix: 18.41,
      vix_trend: 'neutral',
      gold: 4089.49,
      gold_trend: 'up',
      oil: 69.23,
      oil_trend: 'down',
      fed_funds: '3.50 – 3.75%',
      fed_decision: 'Unchanged',
      fed_balance_sheet: 6.74,
      fed_balance_sheet_trend: 'down'
    },
    macro: {
      gdp: 2.1,
      gdp_period: 'Q1 2026 · Final',
      gdp_tag: 'Annual rate',
      gdp_bar: '42%',
      unemployment: 4.3,
      unemployment_period: 'May 2026',
      unemployment_tag: 'Rising',
      unemployment_bar: '57%',
      payrolls: 172,
      payrolls_period: 'May 2026 · BLS',
      payrolls_tag: '+172k jobs',
      payrolls_bar: '55%',
      wage_growth: 3.4,
      wage_growth_period: 'May 2026 · YoY',
      wage_growth_tag: 'Moderating',
      wage_growth_bar: '68%',
      retail_sales: 0.9,
      retail_sales_period: 'May 2026',
      retail_sales_tag: 'Growth',
      retail_sales_bar: '60%',
      housing_starts: 1.18,
      housing_starts_period: 'May 2026',
      housing_starts_tag: '−15.4% MoM',
      housing_starts_bar: '35%',
      sentiment: 49.5,
      sentiment_period: 'Jun 2026 Final',
      sentiment_tag: 'Historically low',
      sentiment_bar: '25%',
      ism_pmi: 54.0,
      ism_pmi_period: 'May 2026',
      ism_pmi_tag: 'Expansion',
      pmi_pos: '80%',
      services_pmi: 54.5,
      services_pmi_period: 'May 2026',
      services_pmi_tag: 'Expansion',
      services_pmi_pos: '84%'
    },
    inflation: {
      cpi: 4.2,
      cpi_period: 'May 2026',
      cpi_bar: '84%',
      pce: 4.1,
      pce_period: 'May 2026',
      pce_bar: '82%',
      core_pce: 3.4,
      core_pce_period: 'May 2026',
      core_pce_bar: '68%'
    }
  };

  // Fetch real-time markets
  try {
    const sp500Data = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d');
    const price = sp500Data.chart.result[0].indicators.quote[0].close[0];
    if (price) {
      data.market.sp500 = parseFloat(price.toFixed(2));
      data.market.sp500_trend = price >= sp500Data.chart.result[0].meta.previousClose ? 'up' : 'down';
    }
  } catch (e) {
    console.warn('SP500 fetch fallback:', e.message);
  }

  try {
    const vixData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d');
    const price = vixData.chart.result[0].indicators.quote[0].close[0];
    if (price) {
      data.market.vix = parseFloat(price.toFixed(2));
      data.market.vix_trend = price >= vixData.chart.result[0].meta.previousClose ? 'up' : 'down';
    }
  } catch (e) {
    console.warn('VIX fetch fallback:', e.message);
  }

  try {
    const treasury10yData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d');
    const price = treasury10yData.chart.result[0].indicators.quote[0].close[0];
    if (price) {
      data.market.treasury10y = parseFloat((price / 10).toFixed(2));
    }
  } catch (e) {
    console.warn('10Y Yield fetch fallback:', e.message);
  }

  // Live calculations for ERP
  try {
    // Recalculate earnings yield dynamically based on current P/E baseline
    data.market.earnings_yield = parseFloat((100 / data.market.sp500_pe).toFixed(2));
    data.market.equity_risk_premium = parseFloat((data.market.earnings_yield - data.market.treasury10y).toFixed(2));
    data.market.equity_risk_premium_trend = data.market.equity_risk_premium < 1.5 ? 'down' : 'up'; // Historically low is < 1.5%
  } catch (e) {
    console.warn('ERP calculation fallback:', e.message);
  }

  try {
    const goldData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d');
    const price = goldData.chart.result[0].indicators.quote[0].close[0];
    if (price) {
      data.market.gold = parseFloat(price.toFixed(2));
      data.market.gold_trend = price >= goldData.chart.result[0].meta.previousClose ? 'up' : 'down';
    }
  } catch (e) {
    console.warn('Gold fetch fallback:', e.message);
  }

  try {
    const oilData = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d');
    const price = oilData.chart.result[0].indicators.quote[0].close[0];
    if (price) {
      data.market.oil = parseFloat(price.toFixed(2));
      data.market.oil_trend = price >= oilData.chart.result[0].meta.previousClose ? 'up' : 'down';
    }
  } catch (e) {
    console.warn('WTI Crude fetch fallback:', e.message);
  }

  fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
  console.log('data.json updated successfully at', data.lastUpdated);
}

updateMetrics();

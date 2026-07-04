const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data.db');
const API_KEY = process.argv[2] || '17269a425e693c40c23f867f999835aed00aaa30';

if (!API_KEY) {
  console.error('Error: Please provide a Census API Key.');
  process.exit(1);
}

const fipsToState = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY'
};

const naicsDescriptions = {
  '111': 'Agricultural & Crop Products',
  '112': 'Livestock & Animal Products',
  '113': 'Forestry & Logging Products',
  '114': 'Fish, Seafood & Aquaculture',
  '211': 'Crude Oil & Natural Gas',
  '212': 'Mining, Minerals & Ores',
  '311': 'Food & Beverage Products',
  '312': 'Beverage & Tobacco Products',
  '313': 'Textile Mills Products',
  '314': 'Textile Product Mills',
  '315': 'Apparel & Accessories',
  '316': 'Leather & Allied Products',
  '321': 'Wood Products',
  '322': 'Paper & Pulp Products',
  '323': 'Printed Matter & Books',
  '324': 'Petroleum & Coal Products',
  '325': 'Chemicals & Pharmaceuticals',
  '326': 'Plastics & Rubber Products',
  '327': 'Nonmetallic Mineral Products',
  '331': 'Primary Metal Products',
  '332': 'Fabricated Metal Products',
  '333': 'Machinery (Except Electrical)',
  '334': 'Computer & Electronic Products',
  '335': 'Electrical Equipment & Appliances',
  '336': 'Transportation Equipment',
  '337': 'Furniture & Fixtures',
  '339': 'Miscellaneous Manufactured Goods'
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS/MacroScope' } }, (res) => {
      // Check for redirect (like invalid key redirect)
      if (res.statusCode === 302) {
        reject(new Error(`API Error: Redirected to ${res.headers.location}. This usually indicates an invalid or inactive API Key.`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.slice(0, 100)}`));
        }
      });
    }).on('error', (err) => reject(err));
  });
}

async function pullFlow(isExport) {
  const flow = isExport ? 'exports' : 'imports';
  const valVar = isExport ? 'ALL_VAL_YR' : 'GEN_VAL_YR';
  // Fetch all states in one API request (no STATE filter)
  const url = `https://api.census.gov/data/timeseries/intltrade/${flow}/statenaics?get=STATE,NAICS,${valVar}&time=2025-12&key=${API_KEY}`;
  
  console.log(`Fetching ${flow} from Census API...`);
  const data = await fetchUrl(url);
  
  const headers = data[0];
  const stateIdx = headers.indexOf('STATE');
  const naicsIdx = headers.indexOf('NAICS');
  const valIdx = headers.indexOf(valVar);
  
  const results = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fips = row[stateIdx];
    const naics = row[naicsIdx];
    const value = parseFloat(row[valIdx]);
    
    const stateCode = fipsToState[fips];
    // Skip national summary or invalid codes
    if (!stateCode || !naics || isNaN(value)) continue;
    
    // We want 3-digit NAICS codes to align with a meaningful commodity level (e.g. 336, 325)
    if (naics.length !== 3) continue;
    
    // NAICS codes start with 99 or other codes that represent special categories
    if (naics.startsWith('9')) continue; 
    
    if (!results[stateCode]) results[stateCode] = [];
    
    const desc = naicsDescriptions[naics] || `NAICS Class ${naics}`;
    results[stateCode].push({
      commodity: desc,
      amount: value / 1e9 // Convert dollars to Billions
    });
  }
  
  // Sort and select top 10 for each state
  const top10 = {};
  Object.keys(results).forEach(state => {
    top10[state] = results[state]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  });
  
  return top10;
}

async function main() {
  try {
    const exports = await pullFlow(true);
    const imports = await pullFlow(false);
    
    console.log('Seeding database with live Census Bureau data...');
    const db = new sqlite3.Database(DB_PATH);
    
    db.serialize(() => {
      db.run('DELETE FROM state_commodities', (err) => {
        if (err) console.error('Clear failed:', err);
      });
      
      const stmt = db.prepare('INSERT INTO state_commodities (state_code, type, commodity, amount) VALUES (?, ?, ?, ?)');
      
      // Seed exports
      Object.keys(exports).forEach(stateCode => {
        exports[stateCode].forEach(item => {
          stmt.run(stateCode, 'export', item.commodity, item.amount);
        });
      });
      
      // Seed imports
      Object.keys(imports).forEach(stateCode => {
        imports[stateCode].forEach(item => {
          stmt.run(stateCode, 'import', item.commodity, item.amount);
        });
      });
      
      stmt.finalize((err) => {
        if (err) {
          console.error('Finalize failed:', err);
        } else {
          console.log('Successfully populated data.db with real Census top 10 commodities per state.');
        }
        
        // Dump database to local static JSON assets
        const exec = require('child_process').exec;
        exec('node scripts/update_metrics.js', (err, stdout, stderr) => {
          if (err) {
            console.error('Error running update_metrics:', err);
          } else {
            console.log('update_metrics finished successfully.');
          }
          db.close();
        });
      });
    });
    
  } catch (err) {
    console.error('Execution failed:', err.message);
  }
}

main();

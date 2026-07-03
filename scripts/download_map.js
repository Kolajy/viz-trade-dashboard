const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://raw.githubusercontent.com/gabidavila/react-usa-map/master/src/data/usa-map-dimensions.js';

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    // Extract the raw object inside the function data()
    const startIndex = body.indexOf('{');
    const endIndex = body.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1) {
      console.error('Error finding object boundaries in JavaScript file.');
      process.exit(1);
    }
    
    let rawObj = body.substring(startIndex, endIndex + 1);
    
    // Clean up trailing commas or semicolons if any
    rawObj = rawObj.trim();
    if (rawObj.endsWith(';')) {
      rawObj = rawObj.slice(0, -1);
    }

    try {
      // Test parse to make sure it's valid JSON
      const parsed = JSON.parse(rawObj);
      const targetPath = path.join(__dirname, '..', 'usa-map-dimensions.json');
      fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2));
      console.log('Successfully wrote map dimensions to:', targetPath);
    } catch (e) {
      console.error('Failed to parse clean JSON:', e.message);
      // Fallback: eval the body in a sandbox way to get the object and serialize it
      try {
        const cleanedBody = body.replace(/export\s+default\s+\w+;?/g, '').replace(/import\s+.*;?/g, '');
        const tempFunc = new Function(cleanedBody + '\nreturn data();');
        const result = tempFunc();
        const targetPath = path.join(__dirname, '..', 'usa-map-dimensions.json');
        fs.writeFileSync(targetPath, JSON.stringify(result, null, 2));
        console.log('Successfully evaluated JS function and wrote dimensions to:', targetPath);
      } catch (evalErr) {
        console.error('Fallback eval also failed:', evalErr.message);
        process.exit(1);
      }
    }
  });
}).on('error', (err) => {
  console.error('Fetch error:', err.message);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Check line 168 specifically
const line168 = lines[167]; // 0-indexed
console.log('Line 168:');
console.log(line168);
console.log('\nByte representation:');
const bytes = Buffer.from(line168, 'utf8');
console.log(bytes.toString('hex'));
console.log('\nLength:', line168.length);
console.log('Byte length:', bytes.length);

// Check for BOM or other issues
const firstBytes = Buffer.from(content.substring(0, 10), 'utf8');
console.log('\nFirst 10 chars bytes:', firstBytes.toString('hex'));

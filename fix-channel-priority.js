const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');

// Read the file
const content = fs.readFileSync(filePath, 'utf8');

// Check if file is corrupted
const lines = content.split('\n');
console.log(`Total lines: ${lines.length}`);
console.log(`\nLines 165-172:`);
lines.slice(164, 172).forEach((line, idx) => {
  console.log(`${165 + idx}: ${line}`);
});

console.log(`\nLines 180-185:`);
lines.slice(179, 185).forEach((line, idx) => {
  console.log(`${180 + idx}: ${line}`);
});

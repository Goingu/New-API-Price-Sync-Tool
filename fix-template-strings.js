const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix all broken template string interpolations
content = content.replace(/\?{/g, '${');

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('Template strings fixed!');

// Verify
const lines = content.split('\n');
console.log('\nLine 166:', lines[165]);
console.log('Line 168:', lines[167]);
console.log('Line 204:', lines[203]);

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Check problematic lines
[167, 181, 203].forEach(lineNum => {
  const line = lines[lineNum];
  console.log(`\nLine ${lineNum + 1}:`);
  console.log(line);
  console.log('Hex:', Buffer.from(line, 'utf8').toString('hex').substring(0, 200));

  // Check for invalid characters
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const code = char.charCodeAt(0);
    if (code === 0x3F || code === 0xFFFD) { // ? or replacement character
      console.log(`  Invalid char at position ${i}: ${char} (code: ${code})`);
    }
  }
});

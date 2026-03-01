const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Scan for all lines with corrupted characters
const lines = content.split('\n');
const problematicLines = [];

lines.forEach((line, idx) => {
  // Check for common corruption patterns
  if (line.includes('鑷') || line.includes('閬') || line.includes('鍏') ||
      line.includes('鏂') || line.includes('閮') || line.includes('鍒') ||
      line.includes('鎴') || line.includes('鍔') || line.includes('鎵') ||
      line.includes('閲') || line.includes('璇') || line.includes('璁') ||
      line.includes('姝') || line.includes('搴') || line.includes('鐐') ||
      line.includes('纭') || line.includes('鍙') || line.includes('鏃') ||
      line.includes('娓') || line.includes('閬') || line.includes('璐') ||
      line.includes('鍙') || line.includes('涓') || line.includes('鏈') ||
      line.includes('妯') || line.includes('閫') || line.includes('璇') ||
      line.includes('鍒') || line.includes('瀹') || line.includes('鏈') ||
      line.includes('缁') || line.includes('鐓') || line.includes('鍗') ||
      line.includes('鎴') || line.includes('鏈') || line.includes('鏈€')) {
    problematicLines.push({ lineNum: idx + 1, line });
  }
});

console.log(`Found ${problematicLines.length} lines with corrupted characters:`);
problematicLines.slice(0, 20).forEach(item => {
  console.log(`Line ${item.lineNum}: ${item.line.substring(0, 100)}`);
});

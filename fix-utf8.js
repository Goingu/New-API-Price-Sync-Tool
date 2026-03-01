const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix corrupted Chinese characters - these are the strings that got corrupted by sed
const fixes = [
  // Line 166
  { broken: /鑷姩搴旂敤瀹屾垚锛?/g, correct: '自动应用完成：' },
  { broken: /涓笭閬撲紭鍏堢骇宸叉洿鏂?/g, correct: '个渠道优先级已更新' },
  // Line 168
  { broken: /閮ㄥ垎搴旂敤瀹屾垚锛?/g, correct: '部分应用完成：' },
  { broken: /鎴愬姛锛?/g, correct: '成功，' },
  { broken: /澶辫触/g, correct: '失败' },
  // Line 182
  { broken: /璁＄畻澶辫触/g, correct: '计算失败' },
  // Line 204
  { broken: /搴旂敤瀹屾垚锛?/g, correct: '应用完成：' },
  // Line 206
  { broken: /閮ㄥ垎搴旂敤瀹屾垚/g, correct: '部分应用完成' },
  // Line 213
  { broken: /搴旂敤澶辫触/g, correct: '应用失败' },
  // Line 232
  { broken: /閲嶈瘯鎴愬姛锛?/g, correct: '重试成功：' },
  { broken: /涓笭閬撳凡鏇存柊/g, correct: '个渠道已更新' },
  // Line 235
  { broken: /閲嶈瘯閮ㄥ垎鎴愬姛/g, correct: '重试部分成功' },
  // Line 241
  { broken: /閲嶈瘯澶辫触/g, correct: '重试失败' },
  // Other common corrupted strings
  { broken: /娓犻亾鍚嶇О/g, correct: '渠道名称' },
  { broken: /鏃т紭鍏堢骇/g, correct: '旧优先级' },
  { broken: /鏂颁紭鍏堢骇/g, correct: '新优先级' },
  { broken: /鍙樺寲/g, correct: '变化' },
  { broken: /涓嶅彉/g, correct: '不变' },
  { broken: /璐圭巼/g, correct: '费率' },
  { broken: /璇峰厛鍦ㄨ缃〉闈㈤厤缃?/g, correct: '请先在设置页面配置' },
  { broken: /璁＄畻浼樺厛绾?/g, correct: '计算优先级' },
  { broken: /鑷姩妯″紡/g, correct: '自动模式' },
  { broken: /鑷姩妯″紡宸插紑鍚細璁＄畻鍚庡皢鐩存帴搴旂敤鍙樻洿锛岃烦杩囬瑙?/g, correct: '自动模式已开启：计算后将直接应用变更，跳过预览' },
  { broken: /姝ｅ湪璁＄畻浼樺厛绾?/g, correct: '正在计算优先级' },
  { broken: /姝ｅ湪搴旂敤鍙樻洿/g, correct: '正在应用变更' },
  { broken: /鎵€鏈夋笭閬撲紭鍏堢骇鏃犲彉鍖栵紝鏃犻渶鏇存柊/g, correct: '所有渠道优先级无变化，无需更新' },
  { broken: /璁＄畻瀹屾垚锛氬叡/g, correct: '计算完成：共' },
  { broken: /涓笭閬擄紝/g, correct: '个渠道，' },
  { broken: /涓渶瑕佸彉鏇达紝/g, correct: '个需要变更，' },
  { broken: /涓湭閰嶇疆璐圭巼宸茶烦杩?/g, correct: '个未配置费率已跳过' },
  { broken: /纭搴旂敤/g, correct: '确认应用' },
  { broken: /鍙栨秷/g, correct: '取消' },
  { broken: /鐐瑰嚮銆岃绠椾紭鍏堢骇銆嶆寜閽紑濮嬭绠楁笭閬撲紭鍏堢骇鎺掑簭/g, correct: '点击「计算优先级」按钮开始计算渠道优先级排序' },
  { broken: /閲嶈瘯澶辫触椤?/g, correct: '重试失败项' },
  { broken: /鍒囨崲鑷姩妯″紡澶辫触/g, correct: '切换自动模式失败' },
  { broken: /鑷姩妯″紡宸?/g, correct: '自动模式已' },
  { broken: /寮€鍚?/g, correct: '开启' },
  { broken: /鍏抽棴/g, correct: '关闭' },
  { broken: /鏃犻渶鏇存柊/g, correct: '无需更新' },
];

// Apply all fixes
fixes.forEach(fix => {
  content = content.replace(fix.broken, fix.correct);
});

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('File fixed successfully!');

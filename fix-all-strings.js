const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// More comprehensive fixes for all corrupted strings
const moreFixes = [
  // Line 129
  { broken: '鑷姩妯″紡宸', correct: '自动模式已' },
  { broken: "'开启?", correct: "'开启'" },
  { broken: "'关闭'", correct: "'关闭'" },
  // Line 132
  { broken: '鍒囨崲鑷姩妯″紡失败', correct: '切换自动模式失败' },
  // Line 156
  { broken: '鎵€鏈夋笭閬撲紭鍏堢骇鏃犲彉鍖栵紝鏃犻渶鏇存柊', correct: '所有渠道优先级无变化，无需更新' },
  // Line 166
  { broken: '鑷姩应用完成：', correct: '自动应用完成：' },
  { broken: '涓笭閬撲紭鍏堢骇宸叉洿鏂', correct: '个渠道优先级已更新' },
  // Line 192
  { broken: '鏃犻渶鏇存柊', correct: '无需更新' },
  // Line 206
  { broken: '閮ㄥ垎应用完成', correct: '部分应用完成' },
  // Line 232
  { broken: '閲嶈瘯鎴愬姛锛', correct: '重试成功：' },
  { broken: '涓笭閬撳凡鏇存柊', correct: '个渠道已更新' },
  // Line 235
  { broken: '閲嶈瘯閮ㄥ垎鎴愬姛', correct: '重试部分成功' },
  // Line 241
  { broken: '閲嶈瘯失败', correct: '重试失败' },
  // Line 294
  { broken: '璇峰厛鍦ㄨ缃〉闈㈤厤缃', correct: '请先在设置页面配置' },
  // Line 312
  { broken: '璁＄畻浼樺厛绾', correct: '计算优先级' },
  // Line 316
  { broken: '鑷姩妯″紡', correct: '自动模式' },
  // Line 324
  { broken: '鑷姩妯″紡宸插紑鍚細璁＄畻鍚庡皢鐩存帴搴旂敤鍙樻洿锛岃烦杩囬瑙', correct: '自动模式已开启：计算后将直接应用变更，跳过预览' },
  // Line 331
  { broken: '姝ｅ湪璁＄畻浼樺厛绾', correct: '正在计算优先级' },
  { broken: '姝ｅ湪搴旂敤鍙樻洿', correct: '正在应用变更' },
  // Line 344
  { broken: '搴旂敤瀹屾垚锛', correct: '应用完成：' },
  { broken: '涓笭閬撲紭鍏堢骇宸叉洿鏂', correct: '个渠道优先级已更新' },
  { broken: '閮ㄥ垎瀹屾垚锛', correct: '部分完成：' },
  { broken: '涓垚鍔燂紝', correct: '个成功，' },
  { broken: '涓け璐', correct: '个失败' },
  // Line 352
  { broken: '閲嶈瘯失败椤', correct: '重试失败项' },
  // Line 367
  { broken: '璁＄畻瀹屾垚锛氬叡', correct: '计算完成：共' },
  { broken: '涓笭閬擄紝', correct: '个渠道，' },
  { broken: '涓渶瑕佸彉鏇达紝', correct: '个需要变更，' },
  { broken: '涓湭閰嶇疆璐圭巼宸茶烦杩', correct: '个未配置费率已跳过' },
  // Line 392
  { broken: '纭搴旂敤', correct: '确认应用' },
  // Line 394
  { broken: '鍙栨秷', correct: '取消' },
  // Line 402
  { broken: '鐐瑰嚮銆岃绠椾紭鍏堢骇銆嶆寜閽紑濮嬭绠楁笭閬撲紭鍏堢骇鎺掑簭', correct: '点击「计算优先级」按钮开始计算渠道优先级排序' },
  // More common strings
  { broken: '娓犻亾鍚嶇О', correct: '渠道名称' },
  { broken: '鏃т紭鍏堢骇', correct: '旧优先级' },
  { broken: '鏂颁紭鍏堢骇', correct: '新优先级' },
  { broken: '鍙樺寲', correct: '变化' },
  { broken: '涓嶅彉', correct: '不变' },
  { broken: '璐圭巼', correct: '费率' },
  { broken: '璁＄畻失败', correct: '计算失败' },
  { broken: '搴旂敤失败', correct: '应用失败' },
  { broken: '鍔犺浇鏁版嵁失败', correct: '加载数据失败' },
  { broken: '閫夋嫨妯″瀷锛', correct: '选择模型：' },
  { broken: '璇烽€夋嫨妯″瀷', correct: '请选择模型' },
  { broken: '鍒锋柊', correct: '刷新' },
  { broken: '璇ユā鍨嬫病鏈夊彲鐢ㄦ笭閬', correct: '该模型没有可用渠道' },
  { broken: '璇烽€夋嫨涓€涓ā鍨', correct: '请选择一个模型' },
  { broken: '鏈厤缃繛鎺', correct: '未配置连接' },
  { broken: '璇峰厛鍦ㄨ繛鎺ヨ缃腑閰嶇疆', correct: '请先在连接设置中配置' },
  { broken: '瀹炰緥鍦板潃鍜', correct: '实例地址和' },
  { broken: '妯″瀷鍊嶇巼', correct: '模型倍率' },
  { broken: '鏈€浼', correct: '最优' },
  { broken: '鏈厤缃垂鐜', correct: '未配置费率' },
  { broken: '缁煎悎鍗曚綅鎴愭湰', correct: '综合单位成本' },
];

// Apply all fixes
moreFixes.forEach(fix => {
  content = content.replace(new RegExp(fix.broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.correct);
});

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('All corrupted strings fixed!');

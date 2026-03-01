const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Manual line-by-line fixes for all corrupted strings
const lineFixes = [
  { search: '自动模型式已', replace: '自动模式已' },
  { search: '刷囨换自动模型式失败', replace: '切换自动模式失败' },
  { search: '与渠道优优先级级已叉更新癭', replace: '个渠道优先级已更新' },
  { search: '部分完成：', replace: '部分完成：' },
  { search: '与成功，', replace: '个成功，' },
  { search: '与失败', replace: '个失败' },
  { search: '重试成功，', replace: '重试成功：' },
  { search: '与渠道已叉更新', replace: '个渠道已更新' },
  { search: '重试部分成功，', replace: '重试部分成功：' },
  { search: '请先在设置页面配置', replace: '请先在设置页面配置' },
  { search: 'New API 连接息息', replace: 'New API 连接信息' },
  { search: '自动模型式', replace: '自动模式' },
  { search: '自动模型式已开启：计算后将直接应用变更，跳过预览', replace: '自动模式已开启：计算后将直接应用变更，跳过预览' },
  { search: '正在计算优先级级?.', replace: '正在计算优先级..' },
  { search: '所有渠道优优先级级无变化，无需叉更新', replace: '所有渠道优先级无变化，无需更新' },
  { search: '计算完成：共', replace: '计算完成：共' },
  { search: '与渠道，', replace: '个渠道，' },
  { search: '与需要变更，', replace: '个需要变更，' },
  { search: '与未配置费率已跳过', replace: '个未配置费率已跳过' },
  { search: '确认应用', replace: '确认应用' },
  { search: '取消', replace: '取消' },
  { search: '点击「计算优优先级级」按钮开始计算渠道优优先级级排序', replace: '点击「计算优先级」按钮开始计算渠道优先级排序' },
  { search: '重试失败项', replace: '重试失败项' },
  { search: '渠道名称', replace: '渠道名称' },
  { search: '旧优优先级级', replace: '旧优先级' },
  { search: '新优优先级级', replace: '新优先级' },
  { search: '变化', replace: '变化' },
  { search: '不变', replace: '不变' },
  { search: '费率', replace: '费率' },
  { search: '未配置连接', replace: '未配置连接' },
  { search: '请先在连接设置中配置', replace: '请先在连接设置中配置' },
  { search: '实例地址和?', replace: '实例地址和' },
  { search: 'API Key。', replace: 'API Key。' },
  { search: '模型型倍率', replace: '模型倍率' },
  { search: '最优', replace: '最优' },
  { search: '未配置费率', replace: '未配置费率' },
  { search: '综合单位成本', replace: '综合单位成本' },
  { search: '选择模型型：', replace: '选择模型：' },
  { search: '请选择模型型', replace: '请选择模型' },
  { search: '刷新', replace: '刷新' },
  { search: '该模型型没有可用渠道?', replace: '该模型没有可用渠道' },
  { search: '请选择一与模型型', replace: '请选择一个模型' },
  { search: '渠道对比', replace: '渠道对比' },
  { search: '规则与调度', replace: '规则与调度' },
  { search: '调整日志', replace: '调整日志' },
  { search: '渠道优优先级级管理', replace: '渠道优先级管理' },
  { search: '优优先级级计算', replace: '优先级计算' },
  { search: '优优先级级规则', replace: '优先级规则' },
  { search: '起始值：', replace: '起始值：' },
  { search: '步长：', replace: '步长：' },
  { search: '排名第一的渠道优优先级级为', replace: '排名第一的渠道优先级为' },
  { search: '第二为', replace: '第二为' },
  { search: '依此类推（最小值为', replace: '依此类推（最小值为' },
  { search: '保存规则', replace: '保存规则' },
  { search: '定时调度', replace: '定时调度' },
  { search: '启用定时调度：', replace: '启用定时调度：' },
  { search: '调度频率：', replace: '调度频率：' },
  { search: '每小时', replace: '每小时' },
  { search: '每6小时', replace: '每6小时' },
  { search: '每12小时', replace: '每12小时' },
  { search: '每天', replace: '每天' },
  { search: '保存配置', replace: '保存配置' },
  { search: '调度状态', replace: '调度状态' },
  { search: '上次执行时间', replace: '上次执行时间' },
  { search: '执行结果', replace: '执行结果' },
  { search: '下次计划时间', replace: '下次计划时间' },
  { search: '暂无', replace: '暂无' },
  { search: '优优先级级规则已保存', replace: '优先级规则已保存' },
  { search: '保存优优先级级规则失败', replace: '保存优先级规则失败' },
  { search: '定时调度配置已保存', replace: '定时调度配置已保存' },
  { search: '保存定时调度配置失败', replace: '保存定时调度配置失败' },
  { search: '刷新调度状态失败', replace: '刷新调度状态失败' },
  { search: '加载规则与调度配置失败', replace: '加载规则与调度配置失败' },
  { search: '调整时间', replace: '调整时间' },
  { search: '触发方式', replace: '触发方式' },
  { search: '手动', replace: '手动' },
  { search: '定时', replace: '定时' },
  { search: '是否有变更', replace: '是否有变更' },
  { search: '有变更', replace: '有变更' },
  { search: '无变更', replace: '无变更' },
  { search: '变更渠道数', replace: '变更渠道数' },
  { search: '加载调整日志失败', replace: '加载调整日志失败' },
  { search: '暂无调整日志', replace: '暂无调整日志' },
  { search: 'Channel_Price_Rate', replace: 'Channel_Price_Rate' },
  { search: '加载数据失败', replace: '加载数据失败' },
];

// Apply all fixes
lineFixes.forEach(fix => {
  content = content.replace(new RegExp(fix.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.replace);
});

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log('File manually fixed!');

// Verify
const lines = content.split('\n');
console.log('\nKey lines verification:');
console.log('Line 129:', lines[128]);
console.log('Line 132:', lines[131]);
console.log('Line 166:', lines[165]);
console.log('Line 168:', lines[167]);

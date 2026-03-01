const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'packages/web/src/pages/ChannelPriority.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Fix specific lines by line number (0-indexed)
const fixes = {
  128: "      message.success(`自动模式已${checked ? '开启' : '关闭'}`);"  ,
  131: "      message.error(`切换自动模式失败: ${msg}`);"  ,
  155: "          message.info('所有渠道优先级无变化，无需更新');",
  165: "              message.success(`自动应用完成：${r.totalSuccess} 个渠道优先级已更新`);"  ,
  167: "              message.warning(`部分应用完成：${r.totalSuccess} 成功，${r.totalFailed} 失败`);"  ,
  181: "      message.error(`计算失败: ${msg}`);"  ,
  191: "      message.info('无需更新');",
  203: "          message.success(`应用完成：${r.totalSuccess} 个渠道优先级已更新`);"  ,
  205: "          message.warning(`部分应用完成：${r.totalSuccess} 成功，${r.totalFailed} 失败`);"  ,
  212: "      message.error(`应用失败: ${msg}`);"  ,
  231: "          message.success(`重试成功：${r.totalSuccess} 个渠道已更新`);"  ,
  234: "          message.warning(`重试部分成功：${r.totalSuccess} 成功，${r.totalFailed} 失败`);"  ,
  240: "      message.error(`重试失败: ${msg}`);"  ,
  286: "        <Text type=\"warning\">请先在设置页面配置 New API 连接信息</Text>",
  306: "            <Text>自动模式</Text>",
  315: "          <Text type=\"secondary\">自动模式已开启：计算后将直接应用变更，跳过预览</Text>",
  322: "          <Spin tip={calculating ? '正在计算优先级..' : '正在应用变更...'}>",
  335: "                ? `应用完成：${applyResult.totalSuccess} 个渠道优先级已更新`",
  336: "                : `部分完成：${applyResult.totalSuccess} 个成功，${applyResult.totalFailed} 个失败`",
  351: "                <Button size=\"small\" type=\"primary\" danger onClick={handleRetryFailed} loading={applying}>",
  352: "                  重试失败项",
  358: "              message={`计算完成：共 ${preview.totalChannels} 个渠道，${preview.changedChannels} 个需要变更，${preview.skippedChannels} 个未配置费率已跳过`}",
  383: "              确认应用",
  393: "          <Text type=\"secondary\">点击「计算优先级」按钮开始计算渠道优先级排序</Text>",
  400: "/** 渠道对比 Tab — Task 11.4 */",
  457: "      message.error(`加载数据失败: ${msg}`);"  ,
  542: "        message=\"未配置连接\"",
  543: "        description=\"请先在连接设置中配置 New API 实例地址和 API Key。\"",
  607: "          <Empty description={selectedModel ? '该模型没有可用渠道' : '请选择一个模型'} />",
  614: "/** Placeholder for Task 11.5: 规则与调度 Tab */",
  670: "      message.error('加载规则与调度配置失败');"  ,
  684: "      message.success('优先级规则已保存');"  ,
  686: "      message.error('保存优先级规则失败');"  ,
  696: "      message.success('定时调度配置已保存');"  ,
  704: "      message.error('保存定时调度配置失败');"  ,
  716: "      message.error('刷新调度状态失败');"  ,
  749: "            排名第一的渠道优先级为 {rule.startValue}，第二为 {Math.max(rule.startValue - rule.step, 1)}，依此类推（最小值为 1）",
  752: "            保存规则",
  757: "      <Card title=\"定时调度\" size=\"small\" loading={loadingSchedule}>",
  760: "            <Text>启用定时调度：</Text>",
  767: "            <Text>调度频率：</Text>",
  777: "            保存配置",
  783: "                <Text strong>调度状态</Text>",
  796: "            <Descriptions.Item label=\"上次执行时间\">",
  797: "              {status?.lastRunAt ?? '暂无'}",
  799: "            <Descriptions.Item label=\"执行结果\">",
  800: "              {status?.lastRunResult ?? '暂无'}",
  802: "            <Descriptions.Item label=\"下次计划时间\">",
  803: "              {status?.nextRunAt ?? '暂无'}",
  812: "/** Placeholder for Task 11.6: 调整日志 Tab */",
  820: "      message.error('加载调整日志失败');"  ,
  833: "      title: '渠道名称',",
  838: "      title: '旧优先级',",
  843: "      title: '新优先级',",
  860: "      title: '调整时间',",
  867: "      title: '触发方式',",
  871: "          {val === 'manual' ? '手动' : '定时'}",
  876: "      title: '是否有变更',",
  880: "          {val ? '有变更' : '无变更'}",
  885: "      title: '变更渠道数',",
  920: "          <Empty description=\"暂无调整日志\" />",
  929: "    label: '优先级计算',",
  934: "    label: '渠道对比',",
  939: "    label: '规则与调度',",
  944: "    label: '调整日志',",
  955: "        渠道优先级管理",
};

// Apply fixes
for (const [lineNum, newContent] of Object.entries(fixes)) {
  lines[parseInt(lineNum)] = newContent;
}

// Write back
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('File fixed with line-by-line replacements!');
console.log('\nVerification:');
console.log('Line 129:', lines[128]);
console.log('Line 166:', lines[165]);
console.log('Line 168:', lines[167]);

# 实现计划：自动化渠道优先级调配

## 概述

基于现有 monorepo 架构（packages/server + packages/web + packages/shared），按分层模式逐步实现渠道优先级自动调配功能。从共享类型定义开始，依次实现纯函数计算引擎、数据持久化层、业务服务层、API 路由、定时调度器，最后完成前端页面集成。

## 任务

- [x] 1. 定义共享类型与数据模型
  - [x] 1.1 在 `packages/shared/types.ts` 中新增优先级相关类型定义
    - 添加 `ChannelPriceRateConfig`、`PriorityRule`、`ModelGroupEntry`、`PriorityAssignment`、`ChannelPriorityResult`、`PriorityCalculationResult`、`ApplyResult`、`PriorityAdjustmentLog`、`PriorityScheduleConfig`、`SchedulerStatus` 等接口
    - _需求: 1.2, 2.2, 2.3, 3.1, 4.1, 5.1, 6.2, 6.5_

  - [x] 1.2 在 `packages/server/src/services/sqliteStore.ts` 中新增优先级相关数据表初始化
    - 创建 `channel_price_rates`、`priority_rules`、`priority_settings`、`priority_adjustment_logs` 四张表
    - 在现有 `initTables()` 方法中追加建表语句
    - _需求: 1.2, 3.7, 4.1, 5.2_


- [x] 2. 实现 SQLiteStore 持久化方法
  - [x] 2.1 在 `sqliteStore.ts` 中实现渠道费率 CRUD 方法
    - `getPriceRates(): ChannelPriceRateConfig[]` — 获取所有费率配置
    - `setPriceRate(channelId, channelName, priceRate)` — 新增或更新费率（UPSERT）
    - `deletePriceRate(channelId)` — 删除费率配置
    - 验证 priceRate > 0
    - _需求: 1.2, 1.3, 1.4_

  - [ ]* 2.2 编写费率持久化属性测试
    - **Property 1: 费率配置持久化往返**
    - **验证: 需求 1.2, 1.3**

  - [x] 2.3 实现优先级规则与全局设置的读写方法
    - `getRule(): PriorityRule` — 获取规则（默认 startValue=100, step=10）
    - `setRule(rule)` — 保存规则
    - `getAutoMode(): boolean` — 获取自动模式状态
    - `setAutoMode(enabled)` — 保存自动模式状态
    - `getScheduleConfig(): PriorityScheduleConfig` — 获取定时配置
    - `setScheduleConfig(config)` — 保存定时配置
    - _需求: 3.7, 3.10, 5.1, 5.2, 6.2_

  - [ ]* 2.4 编写设置持久化属性测试
    - **Property 7: 设置持久化往返**
    - **验证: 需求 3.7, 3.10, 5.2**

  - [x] 2.5 实现调整日志的读写方法
    - `saveAdjustmentLog(log)` — 保存调整日志
    - `getAdjustmentLogs(limit?)` — 按时间倒序获取日志列表
    - `getAdjustmentLogById(id)` — 获取单条日志详情
    - _需求: 4.1, 4.2, 4.3_

  - [ ]* 2.6 编写日志持久化属性测试
    - **Property 9: 调整日志持久化往返**
    - **Property 10: 日志按时间倒序返回**
    - **验证: 需求 4.1, 4.2**

- [x] 3. 检查点 — 确保持久化层测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [ ] 4. 实现 PriorityEngine 纯函数计算引擎
  - [x] 4.1 创建 `packages/server/src/services/priorityEngine.ts`，实现核心计算函数
    - `calculateEffectiveUnitCost(modelRatio, channelPriceRate): number` — 计算综合单位成本
    - `groupChannelsByModel(channels, priceRates): Map<string, ModelGroupEntry[]>` — 按模型分组渠道，仅包含已配置费率的渠道
    - `assignPrioritiesForGroup(group, rule): PriorityAssignment[]` — 对单个模型组排序并分配优先级值，等成本渠道保持原有顺序
    - `aggregateChannelPriorities(allAssignments): ChannelPriorityResult[]` — 汇总所有模型组结果，每个渠道取最高优先级值
    - `calculatePriorities(channels, ratioConfig, priceRates, rule): PriorityCalculationResult` — 完整计算流程
    - _需求: 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4_

  - [x] 4.2 编写综合单位成本公式属性测试
    - **Property 3: 综合单位成本公式正确性**
    - **验证: 需求 1.7, 2.2**

  - [ ]* 4.3 编写模型分组属性测试
    - **Property 4: 模型分组正确性**
    - **验证: 需求 2.1**

  - [x] 4.4 编写优先级分配属性测试
    - **Property 5: 优先级分配递减且遵循规则参数**
    - **验证: 需求 2.3, 5.3, 5.4**

  - [x] 4.5 编写等成本稳定排序属性测试
    - **Property 6: 等成本渠道保持原有顺序**
    - **验证: 需求 2.4**

  - [x] 4.6 编写费率删除排除计算属性测试
    - **Property 2: 费率删除排除计算**
    - **验证: 需求 1.4, 2.5**

  - [x] 4.7 编写无变更不执行更新属性测试
    - **Property 11: 无变更时不执行更新**
    - **验证: 需求 6.3**

  - [x] 4.8 编写最低成本渠道识别属性测试
    - **Property 12: 最低成本渠道识别**
    - **验证: 需求 7.5**

- [x] 5. 检查点 — 确保计算引擎测试通过
  - 确保所有测试通过，如有疑问请询问用户。


- [x] 6. 实现 PriorityService 业务服务层
  - [x] 6.1 创建 `packages/server/src/services/priorityService.ts`
    - 注入 SQLiteStore，协调 PriorityEngine 和 New API 交互
    - `getPriceRates()` / `setPriceRate()` / `deletePriceRate()` — 委托 SQLiteStore
    - `calculate(connection)` — 通过代理获取渠道列表和模型倍率，调用 PriorityEngine 计算，返回预览结果
    - `apply(connection, changes)` — 逐一调用 `PUT /api/channel/` 更新优先级，收集成功/失败结果，保存调整日志
    - `getRule()` / `setRule()` / `getAutoMode()` / `setAutoMode()` — 委托 SQLiteStore
    - `getScheduleConfig()` / `setScheduleConfig()` — 委托 SQLiteStore
    - `getLogs(limit?)` / `getLogById(id)` — 委托 SQLiteStore
    - _需求: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.5, 2.6, 3.3, 3.4, 3.5, 3.7, 3.8, 4.1, 5.1, 5.2, 6.2_

  - [ ]* 6.2 编写 PriorityService 单元测试
    - Mock New API 交互，测试 apply 方法的成功/失败分类
    - **Property 8: 应用结果正确分类成功与失败**
    - **验证: 需求 3.4**

- [x] 7. 实现 Priority API 路由
  - [x] 7.1 创建 `packages/server/src/routes/priority.ts`，实现所有 API 端点
    - `GET /price-rates` — 获取所有渠道费率配置
    - `PUT /price-rates/:channelId` — 设置/更新渠道费率（验证 rate > 0）
    - `DELETE /price-rates/:channelId` — 删除渠道费率
    - `POST /calculate` — 触发优先级计算，返回预览结果
    - `POST /apply` — 确认应用优先级变更（支持 Auto_Mode 判断）
    - `GET /rule` / `PUT /rule` — 优先级规则 CRUD
    - `GET /auto-mode` / `PUT /auto-mode` — 自动模式状态
    - `GET /schedule` / `PUT /schedule` — 定时调配配置
    - `GET /schedule/status` — 定时任务状态
    - `GET /logs` / `GET /logs/:id` — 调整日志
    - _需求: 1.2, 1.3, 1.4, 2.1, 2.6, 3.3, 3.6, 3.7, 4.2, 4.3, 5.1, 5.2, 6.2, 6.5_

  - [x] 7.2 在 `packages/server/src/index.ts` 中注册路由和初始化服务
    - 导入并实例化 PriorityService、PriorityScheduler
    - 挂载 `/api/priority` 路由
    - 在 `app.listen` 回调中启动 PriorityScheduler
    - _需求: 7.1, 7.2_


- [x] 8. 实现 PriorityScheduler 定时调度器
  - [x] 8.1 创建 `packages/server/src/services/priorityScheduler.ts`
    - 遵循现有 `CheckinScheduler` / `LivenessScheduler` 模式
    - `start()` — 从 SQLiteStore 读取配置，若启用则创建 cron 任务
    - `refresh()` — 配置变更后重建 cron 任务
    - `stop()` — 停止所有定时任务
    - `getStatus(): SchedulerStatus` — 返回上次执行时间、下次计划时间
    - 频率到 cron 表达式映射：`1h` → `0 */1 * * *`，`6h` → `0 */6 * * *`，`12h` → `0 */12 * * *`，`24h` → `0 0 * * *`
    - 定时任务执行时自动计算并应用变更，结果记录到调整日志
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9. 检查点 — 确保后端所有功能和测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 10. 实现前端 API Client 扩展
  - [x] 10.1 在 `packages/web/src/api/client.ts` 中新增优先级相关 API 调用函数
    - `getPriceRates()` / `setPriceRate(channelId, channelName, rate)` / `deletePriceRate(channelId)`
    - `calculatePriority(connection)` / `applyPriority(connection, changes)`
    - `getRule()` / `setRule(rule)`
    - `getAutoMode()` / `setAutoMode(enabled)`
    - `getScheduleConfig()` / `setScheduleConfig(config)` / `getScheduleStatus()`
    - `getAdjustmentLogs(limit?)` / `getAdjustmentLogById(id)`
    - _需求: 1.1, 2.1, 2.6, 3.1, 3.3, 3.6, 3.7, 4.2, 4.3, 5.1, 6.2, 6.5_

- [ ] 11. 实现渠道优先级管理前端页面
  - [x] 11.1 创建 `packages/web/src/pages/ChannelPriority.tsx` 主页面框架
    - 使用 Ant Design Tabs 组织五个功能区：费率配置、优先级计算、渠道对比、规则与调度、调整日志
    - _需求: 7.2_

  - [x] 11.2 实现费率配置 Tab
    - 展示所有渠道列表（名称、类型、支持模型数、当前优先级）
    - 内联编辑 Channel_Price_Rate，验证输入值 > 0
    - 显示等价单位成本（1 美金 = X 元人民币）
    - 支持删除费率配置
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 11.3 实现优先级计算与预览 Tab
    - 触发计算按钮 + Auto_Mode 开关
    - 预览表格：渠道名称、模型列表、旧优先级、新优先级、Channel_Price_Rate
    - 颜色标记：优先级上升（绿色）、下降（红色）、不变（灰色）
    - 确认/取消按钮
    - Auto_Mode 开启时跳过预览直接应用，完成后 Toast 通知变更摘要
    - 部分失败时展示成功/失败汇总和重试按钮
    - 加载状态指示器
    - _需求: 2.1, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 7.3_

  - [x] 11.4 实现渠道对比 Tab
    - 按模型维度展示多渠道成本对比
    - 表格列：渠道名称、Model_Ratio、Channel_Price_Rate、Effective_Unit_Cost
    - 按 Effective_Unit_Cost 从低到高排序
    - 标识最优渠道（最低成本）
    - _需求: 1.6, 1.7, 1.8, 7.5_

  - [x] 11.5 实现规则与调度 Tab
    - 优先级规则配置：起始值和步长输入框
    - 定时调配配置：启用开关 + 频率选择（每小时/6小时/12小时/每天）
    - 展示调度状态：上次执行时间、执行结果、下次计划时间
    - _需求: 5.1, 5.2, 6.1, 6.2, 6.5_

  - [x] 11.6 实现调整日志 Tab
    - 时间倒序展示日志列表
    - 可展开查看详情：每个渠道的名称、旧优先级、新优先级、Channel_Price_Rate
    - _需求: 4.1, 4.2, 4.3_

- [ ] 12. 集成导航与路由
  - [x] 12.1 在 `AppLayout.tsx` 侧边栏导航中新增"渠道优先级"菜单项
    - _需求: 7.1_

  - [x] 12.2 在 `App.tsx` 中添加 `/channel-priority` 路由
    - _需求: 7.1, 7.2_

  - [x] 12.3 在 `ChannelComparison.tsx` 渠道对比页面添加跳转到优先级管理页面的快捷入口
    - 基于 Effective_Unit_Cost 标识最优渠道后，提供"调配优先级"链接
    - _需求: 7.5_

- [x] 13. 最终检查点 — 确保所有功能集成完毕且测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务用于阶段性验证，确保增量开发的正确性
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界条件

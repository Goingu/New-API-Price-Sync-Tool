# 实现计划：New API 模型价格同步工具

## 概述

基于前后端分离架构，使用 React + TypeScript + Ant Design 构建前端 SPA，Node.js + Express 构建后端代理和价格抓取服务。后端使用 better-sqlite3 实现持久化存储（价格历史、更新日志、缓存）。采用 Vitest + fast-check 进行测试。

## 任务

- [x] 1. 初始化项目结构和基础配置
  - [x] 1.1 创建 monorepo 项目结构，包含 `packages/server` 和 `packages/web` 两个子包
    - 初始化 package.json、tsconfig.json
    - 配置 Vite（前端）和 tsx（后端）
    - 安装核心依赖：express, cors, axios, better-sqlite3（后端）；react, antd, axios（前端）
    - 安装测试依赖：vitest, fast-check, @testing-library/react
    - _Requirements: 7.1_

  - [x] 1.2 定义共享类型接口文件 `packages/shared/types.ts`
    - 包含 ModelPrice, RatioResult, RatioConfig, ProviderPriceResult, ComparisonRow, ProxyRequest, ProxyResponse, OptionUpdateRequest 等所有接口定义
    - 新增 PriceHistoryEntry, UpdateLogEntry, UpdateLogModelDetail, CachedPriceData, Channel, ChannelModelInfo, ChannelPriceComparison, ChannelModelPrice 接口
    - _Requirements: 4.4, 9.1, 9.2, 10.1_

- [ ] 2. 实现倍率转换核心模块
  - [x] 2.1 实现 `packages/server/src/services/ratioConverter.ts`
    - 实现 convert(price: ModelPrice): RatioResult 方法（modelRatio = inputPrice / 0.75, completionRatio = outputPrice / inputPrice）
    - 实现 convertBatch(prices: ModelPrice[]): RatioResult[] 方法
    - 实现 ratioToPrice(modelRatio, completionRatio) 反向转换方法
    - 精度控制：结果保留最多 6 位小数
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 2.2 编写倍率转换公式属性测试
    - **Property 1: 倍率转换公式正确性**
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ] 2.3 编写倍率-价格往返转换属性测试
    - **Property 2: 倍率-价格往返转换**
    - **Validates: Requirements 2.3, 4.1, 4.2**

  - [ ] 2.4 编写倍率格式序列化属性测试
    - **Property 10: 倍率格式序列化兼容性**
    - **Validates: Requirements 4.4**

- [ ] 3. 实现价格抓取模块
  - [x] 3.1 实现 LiteLLM 数据源解析器 `packages/server/src/services/priceFetcher.ts`
    - 从 LiteLLM GitHub JSON 获取价格数据
    - 解析 input_cost_per_token / output_cost_per_token 转换为 USD/1M tokens
    - 按 litellm_provider 字段筛选各厂商模型（openai, anthropic, deepseek, vertex_ai/google）
    - 过滤无效条目（缺少价格字段、mode 非 chat/completion 的条目）
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 3.2 编写 LiteLLM 价格数据解析属性测试
    - **Property 3: LiteLLM 价格数据解析**
    - **Validates: Requirements 3.3**

  - [x] 3.3 实现并行抓取与故障隔离逻辑
    - 使用 Promise.allSettled 并行获取各厂商数据
    - 单个厂商失败不影响其他厂商结果
    - 返回 ProviderPriceResult[] 包含每个厂商的成功/失败状态
    - _Requirements: 3.2, 3.4, 3.5_

  - [ ]* 3.4 编写厂商故障隔离属性测试
    - **Property 4: 厂商故障隔离**
    - **Validates: Requirements 3.4**

- [ ] 4. 实现 SQLite 持久化存储模块
  - [x] 4.1 实现 `packages/server/src/services/sqliteStore.ts`
    - 初始化 better-sqlite3 数据库连接，自动创建 price_history、update_logs、price_cache 三张表
    - 实现 savePriceHistory / getPriceHistory / getPriceHistoryByModel 方法
    - 实现 saveUpdateLog / getUpdateLogs 方法
    - 实现 getCachedPrices（含 30 分钟有效期判断）/ setCachedPrices / invalidateCache 方法
    - 实现 clearAll 方法（清除所有数据）
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7_

  - [ ] 4.2 编写价格历史存取往返属性测试
    - **Property 11: 价格历史存取往返一致性**
    - **Validates: Requirements 9.1**

  - [ ] 4.3 编写更新日志存取往返属性测试
    - **Property 12: 更新日志存取往返一致性**
    - **Validates: Requirements 9.2**

  - [ ] 4.4 编写缓存有效性判断属性测试
    - **Property 13: 缓存有效性判断**
    - **Validates: Requirements 9.5**

- [ ] 5. 实现渠道服务模块
  - [x] 5.1 实现 `packages/server/src/services/channelService.ts`
    - 实现 fetchChannels(targetUrl, apiKey) — 通过 GET /api/channel/ 获取渠道列表
    - 实现 parseChannelModels(channel) — 解析渠道模型列表，处理 model_mapping 映射
    - 实现 getChannelsForModel(channels, modelId) — 按模型名筛选支持的渠道
    - 实现 compareChannelPrices(channels, upstreamPrices) — 多渠道价格对比，标记最低价渠道
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7_

  - [ ]* 5.2 编写渠道模型筛选属性测试
    - **Property 14: 渠道模型筛选正确性**
    - **Validates: Requirements 10.3, 10.7**

  - [ ]* 5.3 编写最低价渠道标记属性测试
    - **Property 15: 最低价渠道标记正确性**
    - **Validates: Requirements 10.4**

  - [ ]* 5.4 编写模型名映射属性测试
    - **Property 16: 模型名映射一致性**
    - **Validates: Requirements 10.5**

- [x] 6. 实现后端 API 路由
  - [x] 6.1 实现 API 代理路由 `packages/server/src/routes/proxy.ts`
    - POST /api/proxy/forward — 通用代理转发，从请求体读取 targetUrl、apiKey、method、path、body
    - 设置 30 秒请求超时
    - 转发请求头中的 Authorization
    - _Requirements: 1.2, 2.1, 6.4_

  - [x] 6.2 实现价格抓取路由 `packages/server/src/routes/prices.ts`
    - POST /api/prices/fetch — 先检查缓存，未过期则返回缓存数据；否则调用 priceFetcher 获取并存入缓存和历史
    - POST /api/prices/fetch/:provider — 获取指定厂商价格
    - GET /api/prices/history — 获取价格抓取历史记录列表
    - GET /api/prices/history/:modelId — 获取指定模型的价格变化历史
    - POST /api/prices/invalidate-cache — 强制使缓存失效
    - _Requirements: 3.1, 3.2, 4.1, 9.1, 9.3, 9.5, 9.6_

  - [x] 6.3 实现更新日志路由 `packages/server/src/routes/logs.ts`
    - GET /api/logs/updates — 获取更新操作日志列表
    - _Requirements: 9.4_

  - [x] 6.4 实现渠道路由 `packages/server/src/routes/channels.ts`
    - POST /api/proxy/channels — 代理获取 New API 实例的渠道列表
    - POST /api/channels/compare — 接收渠道数据和上游价格，返回多渠道对比结果
    - _Requirements: 10.1, 10.3, 10.4_

  - [x] 6.5 创建 Express 应用入口 `packages/server/src/index.ts`
    - 配置 CORS、JSON body parser
    - 初始化 SQLite 数据库
    - 挂载 proxy、prices、logs、channels 路由
    - 错误处理中间件
    - _Requirements: 8.2, 9.7_

- [x] 7. Checkpoint — 确保后端所有测试通过
  - 运行所有后端测试，确保通过，有问题请询问用户。

- [ ] 8. 实现对比与更新核心逻辑
  - [x] 8.1 实现对比逻辑 `packages/web/src/utils/comparison.ts`
    - compareRatios(current: RatioConfig, upstream: RatioResult[]): ComparisonRow[]
    - 处理三种情况：双方都有、仅上游有（new）、仅当前有（removed）
    - 计算差异百分比和绝对差值
    - _Requirements: 5.1, 5.3, 5.5, 5.6_

  - [ ] 8.2 编写对比完整性与状态标记属性测试
    - **Property 5: 对比完整性与状态标记**
    - **Validates: Requirements 5.1, 5.5, 5.6**

  - [ ] 8.3 编写差异计算正确性属性测试
    - **Property 6: 差异计算正确性**
    - **Validates: Requirements 5.3**

  - [x] 8.4 实现排序与筛选工具函数 `packages/web/src/utils/sorting.ts`
    - sortComparison(rows, sortBy, sortOrder): ComparisonRow[]
    - filterComparison(rows, filters): ComparisonRow[]
    - _Requirements: 5.4_

  - [ ] 8.5 编写对比结果排序属性测试
    - **Property 7: 对比结果排序正确性**
    - **Validates: Requirements 5.4**

  - [x] 8.6 实现选择与更新载荷构建 `packages/web/src/utils/updatePayload.ts`
    - selectByFilter(rows, filter: 'all' | 'none' | 'decreased'): Set<string>
    - buildUpdatePayload(currentConfig: RatioConfig, selectedRows: ComparisonRow[]): OptionUpdateRequest[]
    - 确保未选中模型保持原值（全量替换逻辑）
    - _Requirements: 6.2, 6.4_

  - [ ] 8.7 编写选择过滤逻辑属性测试
    - **Property 8: 选择过滤逻辑**
    - **Validates: Requirements 6.2**

  - [ ] 8.8 编写更新载荷合并正确性属性测试
    - **Property 9: 更新载荷合并正确性**
    - **Validates: Requirements 6.4**

- [x] 9. Checkpoint — 确保所有核心逻辑测试通过
  - 运行所有测试，确保通过，有问题请询问用户。

- [x] 10. 实现前端连接配置与状态管理
  - [x] 10.1 实现 API 客户端 `packages/web/src/api/client.ts`
    - 封装 axios 实例，统一处理请求/响应
    - proxyForward(settings, method, path, body?) — 调用后端代理
    - fetchPrices(provider?, forceRefresh?) — 调用价格抓取接口（支持强制刷新）
    - fetchPriceHistory(modelId?) — 获取价格历史
    - fetchUpdateLogs() — 获取更新日志
    - fetchChannels(settings) — 获取渠道列表
    - compareChannels(channels, prices) — 多渠道价格对比
    - _Requirements: 1.2, 2.1, 3.2, 9.3, 9.4, 10.1_

  - [x] 10.2 实现应用状态管理 `packages/web/src/context/AppContext.tsx`
    - 使用 React Context + useReducer 管理 AppState
    - 连接配置从 localStorage 读取/写入
    - 提供 connect、fetchRatios、fetchPrices、updateRatios、fetchHistory、fetchLogs、fetchChannels 等 action
    - _Requirements: 1.4, 2.1, 3.2, 6.4, 9.3, 9.4, 10.1_

  - [x] 10.3 实现连接配置组件 `packages/web/src/components/ConnectionConfig.tsx`
    - 地址和 API Key 输入表单（Ant Design Form）
    - 连接测试按钮，调用代理验证
    - 成功后保存到 localStorage 并跳转主界面
    - 错误提示（网络不可达、认证失败等）
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 11. 实现前端核心页面
  - [x] 11.1 实现应用布局 `packages/web/src/components/AppLayout.tsx`
    - Ant Design Layout + Sider 侧边栏导航
    - 导航项：仪表盘、当前倍率、抓取价格、对比更新、渠道对比、价格历史、更新日志、设置
    - 顶部显示连接状态和最后同步时间
    - _Requirements: 7.4_

  - [x] 11.2 实现当前倍率页面 `packages/web/src/pages/CurrentRatios.tsx`
    - Ant Design Table 展示模型名称、模型倍率、补全倍率、等价 USD 价格
    - 支持搜索和排序
    - 加载状态和错误处理
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 11.3 实现价格抓取页面 `packages/web/src/pages/FetchPrices.tsx`
    - 一键抓取按钮，触发后端价格获取
    - 显示各厂商获取状态（成功/失败）和模型数量
    - 显示缓存状态（是否使用缓存、缓存时间）
    - 提供"强制刷新"按钮跳过缓存
    - 加载进度指示
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 7.2, 7.3, 9.5, 9.6_

  - [x] 11.4 实现对比与更新页面 `packages/web/src/pages/ComparisonUpdate.tsx`
    - 对比表格：颜色高亮（绿=下降、红=上升、蓝=新增、灰=移除）
    - 差异百分比和绝对差值列
    - 筛选栏：按厂商、按状态
    - 排序：按模型名、差异百分比、厂商
    - 复选框选择 + 快捷操作（全选/全不选/仅选下降）
    - 更新预览对话框 + 确认执行
    - 更新成功后自动记录 Update_Log 到后端
    - 更新结果反馈（成功/失败模型列表）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.2_

  - [x] 11.5 实现渠道对比页面 `packages/web/src/pages/ChannelComparison.tsx`
    - 渠道列表展示所有渠道名称、类型和支持的模型数量
    - 选择模型后展示各渠道的价格对比表格
    - 最低价渠道高亮标记（绿色背景）
    - 按渠道筛选模型列表
    - 加载状态和错误处理（含权限不足提示）
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 11.6 实现价格历史页面 `packages/web/src/pages/PriceHistory.tsx`
    - 时间线列表展示每次抓取记录（时间、厂商、模型数量）
    - 选择特定模型查看价格变化趋势（可用 Ant Design Charts 或简单表格）
    - 按厂商和时间范围筛选
    - _Requirements: 9.1, 9.3_

  - [x] 11.7 实现更新日志页面 `packages/web/src/pages/UpdateLogs.tsx`
    - 列表展示每次更新操作的时间和影响模型数量
    - 展开查看每个模型的新旧倍率值变化详情
    - _Requirements: 9.2, 9.4_

  - [x] 11.8 实现设置页面 `packages/web/src/pages/Settings.tsx`
    - 修改连接配置
    - 清除所有本地数据按钮（含浏览器 localStorage 和后端 SQLite 数据）
    - _Requirements: 1.5, 8.3_

- [x] 12. 实现前端入口与路由
  - [x] 12.1 创建 `packages/web/src/App.tsx` 和 `packages/web/src/main.tsx`
    - React Router 路由配置（含新增的渠道对比、价格历史、更新日志页面）
    - 未连接时重定向到配置页
    - AppContext Provider 包裹
    - Toast 通知（Ant Design message）
    - _Requirements: 1.1, 7.5_

- [x] 13. 最终 Checkpoint — 确保所有测试通过，应用可运行
  - 运行所有测试，确保通过，有问题请询问用户。

- [x] 14. 扩展共享类型定义
  - [x] 14.1 在 `packages/shared/types.ts` 中新增签到和活性检测相关类型
    - 新增 CheckinTarget、CheckinRecord、LivenessConfig、LivenessResult、HealthStatus、CheckFrequency 接口/类型
    - 更新 AppState 接口，新增 checkin 和 liveness 状态字段
    - _Requirements: 11.2, 11.5, 12.2, 12.4_

- [ ] 15. 实现签到服务后端模块
  - [x] 15.1 扩展 SQLite 存储层 `packages/server/src/services/sqliteStore.ts`
    - 新增 checkin_targets 和 checkin_records 表的初始化
    - 实现签到目标 CRUD 方法：addCheckinTarget、updateCheckinTarget、deleteCheckinTarget、getCheckinTargets、getCheckinTargetById
    - 实现签到记录方法：saveCheckinRecord、getCheckinRecords、getLatestCheckinRecord
    - _Requirements: 11.2, 11.3, 11.5, 11.6_

  - [ ] 15.2 编写签到配置存取往返属性测试
    - **Property 17: 签到配置存取往返一致性**
    - **Validates: Requirements 11.2, 11.3**

  - [ ]* 15.3 编写签到记录存取往返属性测试
    - **Property 19: 签到记录存取往返一致性**
    - **Validates: Requirements 11.5, 11.6**

  - [x] 15.4 实现签到服务 `packages/server/src/services/checkinService.ts`
    - 实现 checkinOne(targetId) — 对单个目标执行签到（POST /api/user/checkin）
    - 实现 checkinAll() — 对所有启用目标执行签到
    - 仅对 enabled=true 的目标发起签到请求
    - 记录签到结果（成功/失败、额度信息）到 SQLite
    - 设置 15 秒请求超时
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ]* 15.5 编写仅签到启用实例属性测试
    - **Property 18: 仅签到启用实例**
    - **Validates: Requirements 11.4**

  - [x] 15.6 实现签到定时任务 `packages/server/src/services/checkinScheduler.ts`
    - 使用 node-cron 注册每日 00:05 的定时任务（cron: `5 0 * * *`）
    - 定时任务触发时调用 checkinAll()
    - 提供 start/stop 方法控制定时任务
    - _Requirements: 11.8_

  - [x] 15.7 实现签到 API 路由 `packages/server/src/routes/checkin.ts`
    - GET /api/checkin/targets — 获取所有签到目标
    - POST /api/checkin/targets — 添加签到目标
    - PUT /api/checkin/targets/:id — 更新签到目标
    - DELETE /api/checkin/targets/:id — 删除签到目标
    - POST /api/checkin/execute/:id — 手动触发单个实例签到
    - POST /api/checkin/execute-all — 手动触发所有启用实例签到
    - GET /api/checkin/records — 获取签到记录
    - GET /api/checkin/records/:targetId/latest — 获取最新签到记录
    - _Requirements: 11.1, 11.7, 11.9_

  - [x] 15.8 在 `packages/server/src/index.ts` 中挂载签到路由和启动定时任务
    - 挂载 /api/checkin 路由
    - 初始化并启动签到定时任务
    - _Requirements: 11.8_

- [ ] 16. 实现活性检测服务后端模块
  - [x] 16.1 扩展 SQLite 存储层，新增活性检测相关表和方法
    - 新增 liveness_configs 和 liveness_results 表的初始化
    - 实现检测配置 CRUD 方法：addLivenessConfig、updateLivenessConfig、deleteLivenessConfig、getLivenessConfigs
    - 实现检测结果方法：saveLivenessResult、getLivenessResults、getLatestLivenessResults
    - _Requirements: 12.2, 12.4, 12.9_

  - [ ] 16.2 编写活性检测配置存取往返属性测试
    - **Property 20: 活性检测配置存取往返一致性**
    - **Validates: Requirements 12.2**

  - [ ] 16.3 编写活性检测结果存取往返属性测试
    - **Property 22: 活性检测结果存取往返一致性**
    - **Validates: Requirements 12.9**

  - [x] 16.4 实现活性检测服务 `packages/server/src/services/livenessService.ts`
    - 实现 determineStatus(responseTimeMs, success, error) — 健康状态判定逻辑
    - 实现 checkModel(configId, modelId) — 对单个模型发送测试请求（POST /v1/chat/completions）
    - 实现 checkAllModels(configId) — 检测配置下所有模型
    - 实现 checkAllConfigs() — 检测所有启用配置的所有模型
    - 设置 30 秒请求超时，超时标记为"响应慢"
    - 记录检测结果到 SQLite
    - _Requirements: 12.3, 12.4, 12.5, 12.6_

  - [ ] 16.5 编写健康状态判定正确性属性测试
    - **Property 21: 健康状态判定正确性**
    - **Validates: Requirements 12.4, 12.5, 12.6**

  - [x] 16.6 实现活性检测定时任务 `packages/server/src/services/livenessScheduler.ts`
    - 使用 node-cron 根据每个配置的 frequency 注册对应的 cron 表达式
    - 支持动态更新 cron 任务（配置变更时重新注册）
    - 提供 start/stop/refresh 方法
    - _Requirements: 12.10, 12.11_

  - [x] 16.7 实现活性检测 API 路由 `packages/server/src/routes/liveness.ts`
    - GET /api/liveness/configs — 获取所有检测配置
    - POST /api/liveness/configs — 添加检测配置
    - PUT /api/liveness/configs/:id — 更新检测配置
    - DELETE /api/liveness/configs/:id — 删除检测配置
    - POST /api/liveness/check/:configId/:modelId — 手动检测单个模型
    - POST /api/liveness/check/:configId — 手动检测配置下所有模型
    - POST /api/liveness/check-all — 手动检测所有配置的所有模型
    - GET /api/liveness/results — 获取检测结果
    - GET /api/liveness/results/:configId/latest — 获取最新检测结果
    - _Requirements: 12.1, 12.7, 12.8, 12.9_

  - [x] 16.8 在 `packages/server/src/index.ts` 中挂载活性检测路由和启动定时任务
    - 挂载 /api/liveness 路由
    - 初始化并启动活性检测定时任务
    - _Requirements: 12.11_

- [x] 17. Checkpoint — 确保签到和活性检测后端模块测试通过
  - 运行所有后端测试，确保通过，有问题请询问用户。

- [x] 18. 实现前端签到管理页面
  - [x] 18.1 实现签到 API 客户端方法
    - 在 `packages/web/src/api/client.ts` 中新增签到相关 API 调用方法
    - getCheckinTargets、addCheckinTarget、updateCheckinTarget、deleteCheckinTarget
    - executeCheckin、executeCheckinAll
    - getCheckinRecords、getLatestCheckinRecord
    - _Requirements: 11.1, 11.9_

  - [x] 18.2 实现签到管理页面 `packages/web/src/pages/CheckinManagement.tsx`
    - 签到目标列表表格：名称、地址、启用状态、最后签到时间、签到结果
    - 添加/编辑签到目标的 Modal 表单
    - 启用/禁用开关
    - 手动签到按钮（单个/全部）
    - 签到记录展开查看
    - 加载状态和错误处理
    - _Requirements: 11.1, 11.2, 11.3, 11.7, 11.9_

- [x] 19. 实现前端活性检测管理页面
  - [x] 19.1 实现活性检测 API 客户端方法
    - 在 `packages/web/src/api/client.ts` 中新增活性检测相关 API 调用方法
    - getLivenessConfigs、addLivenessConfig、updateLivenessConfig、deleteLivenessConfig
    - checkModel、checkAllModels、checkAllConfigs
    - getLivenessResults、getLatestLivenessResults
    - _Requirements: 12.1, 12.8_

  - [x] 19.2 实现活性检测管理页面 `packages/web/src/pages/LivenessManagement.tsx`
    - 检测配置列表：名称、实例地址、模型数量、检测频率、启用状态
    - 模型健康状态表格：在线（绿色 Tag）、离线（红色 Tag）、响应慢（黄色 Tag）
    - 添加/编辑检测配置的 Modal 表单（含模型列表输入和频率选择）
    - 手动触发检测按钮（单个模型/全部模型）
    - 历史检测记录查看（可展开）
    - 加载状态和错误处理
    - _Requirements: 12.1, 12.2, 12.7, 12.8, 12.9, 12.10_

- [x] 20. 更新前端路由和导航
  - [x] 20.1 更新 `packages/web/src/App.tsx` 路由配置
    - 新增 /checkin 路由指向 CheckinManagement 页面
    - 新增 /liveness 路由指向 LivenessManagement 页面
    - _Requirements: 11.1, 12.1_

  - [x] 20.2 更新 `packages/web/src/components/AppLayout.tsx` 导航菜单
    - 在侧边栏新增"签到管理"和"活性检测"导航项
    - _Requirements: 7.4_

- [x] 21. 安装 node-cron 依赖
  - [x] 21.1 在 `packages/server/package.json` 中添加 node-cron 依赖
    - 安装 node-cron 和 @types/node-cron
    - _Requirements: 11.8, 12.11_

- [x] 22. 最终 Checkpoint — 确保所有新功能测试通过，应用可运行
  - 运行所有测试，确保通过，有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号以便追溯
- Checkpoint 确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况

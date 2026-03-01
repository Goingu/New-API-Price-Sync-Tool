# 实现计划：按次计费模型支持

## 概述

在现有 New API 模型价格同步工具基础上，扩展对按次计费（per-request）模型的支持。修改涉及共享类型定义、后端价格抓取与转换模块、前端对比与更新逻辑，以及 UI 展示层。采用 Vitest + fast-check 进行测试。

## 任务

- [x] 1. 扩展共享类型定义
  - [x] 1.1 在 `packages/shared/types.ts` 中新增 `PricingType` 类型和扩展现有接口
    - 新增 `PricingType = 'per_token' | 'per_request'` 类型
    - `ModelPrice` 接口新增可选字段 `pricingType?: PricingType` 和 `pricePerRequest?: number`
    - `RatioResult` 接口新增可选字段 `pricingType?: PricingType` 和 `pricePerRequest?: number`
    - `RatioConfig` 接口新增可选字段 `modelPrice?: Record<string, number>`
    - `ComparisonRow` 接口新增可选字段 `pricingType?: PricingType`、`currentPrice?: number`、`newPrice?: number`
    - `UpdateLogModelDetail` 接口新增可选字段 `pricingType?: PricingType`、`oldPrice?: number`、`newPrice?: number`
    - `LiteLLMPriceEntry` 接口新增可选字段 `input_cost_per_request?: number`、`output_cost_per_request?: number`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3, 4.5, 6.3, 7.1, 7.3_

- [x] 2. 扩展后端价格抓取模块
  - [x] 2.1 修改 `packages/server/src/services/priceFetcher.ts` 的 `parseLiteLLMEntry` 函数
    - 优先检查 `input_cost_per_token` / `output_cost_per_token`（正数），归类为 `per_token`
    - 若无有效 per-token 字段，检查 `input_cost_per_request`（正数），归类为 `per_request`
    - per-request 模型：`pricePerRequest = input_cost_per_request + (output_cost_per_request ?? 0)`，`inputPricePerMillion = 0`，`outputPricePerMillion = 0`
    - per-token 模型：现有逻辑不变，新增 `pricingType: 'per_token'`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 编写按次计费模型分类属性测试
    - **Property 1: 按次计费模型正确分类**
    - **Property 2: 按 token 计费优先级**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 3. 扩展倍率转换模块
  - [x] 3.1 修改 `packages/server/src/services/ratioConverter.ts` 的 `convert` 和 `convertBatch` 函数
    - per-request 模型：返回 `modelRatio: 0`、`completionRatio: 0`、`pricingType: 'per_request'`、`pricePerRequest` 透传
    - per-token 模型：现有逻辑不变，新增 `pricingType: 'per_token'`
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 3.2 编写按次计费模型转换属性测试
    - **Property 3: 按次计费模型转换结果**
    - **Validates: Requirements 3.1, 3.2, 3.4**

- [x] 4. 扩展前端对比逻辑
  - [x] 4.1 修改 `packages/web/src/utils/comparison.ts` 的 `compareRatios` 函数
    - 函数签名新增 `currentConfig: RatioConfig` 参数（需要 `modelPrice` 字段）
    - per-request 模型：从 `RatioConfig.modelPrice` 获取当前价格，从 `RatioResult.pricePerRequest` 获取新价格
    - per-request 模型差异百分比：`(newPrice - currentPrice) / currentPrice * 100`
    - 构建 `ComparisonRow` 时填充 `pricingType`、`currentPrice`、`newPrice` 字段
    - 处理仅在 `modelPrice` 中存在的模型（标记为 `removed`）和仅在上游存在的 per-request 模型（标记为 `new`）
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 4.2 编写按次计费模型差异百分比属性测试
    - **Property 4: 按次计费模型差异百分比计算**
    - **Validates: Requirements 4.3**

- [x] 5. 扩展更新载荷构建逻辑
  - [x] 5.1 修改 `packages/web/src/utils/updatePayload.ts` 的 `buildUpdatePayload` 函数
    - 将选中行按 `pricingType` 分为 per-token 和 per-request 两组
    - per-token 组：现有 `ModelRatio`/`CompletionRatio` 载荷逻辑不变
    - per-request 组：生成 `ModelPrice` 载荷，合并 `currentConfig.modelPrice` 中未选中模型的现有价格
    - 返回的 `OptionUpdateRequest[]` 包含两组载荷
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 编写混合计费类型载荷分离属性测试
    - **Property 5: 混合计费类型载荷分离**
    - **Property 6: 未选中按次计费模型价格保留**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 6. Checkpoint — 确保所有核心逻辑测试通过
  - 运行所有后端和前端工具函数测试，确保通过，有问题请询问用户。

- [x] 7. 扩展前端 UI 页面
  - [x] 7.1 修改 `packages/web/src/pages/CurrentRatios.tsx`
    - 在表格中新增"计费类型"列，使用 Tag 区分"按 Token"和"按次"
    - 从 `RatioConfig.modelPrice` 读取按次计费模型数据并合并到表格中
    - 按次计费模型行：模型倍率和补全倍率列显示"不适用"，新增"模型价格"列显示 USD/次
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.2 修改 `packages/web/src/pages/ComparisonUpdate.tsx`
    - 新增"计费类型"标签列
    - per-request 模型行：显示"当前价格"和"新价格"（USD/次），补全倍率列显示"不适用"
    - 更新预览对话框：per-request 模型显示"当前价格 → 新价格"
    - 更新执行逻辑：调用 `buildUpdatePayload` 获取分离后的载荷，分别提交
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.5_

  - [x] 7.3 修改 `packages/web/src/pages/FetchPrices.tsx`
    - 在厂商模型数量统计中区分 per-token 和 per-request 模型数量
    - _Requirements: 1.1_

  - [x] 7.4 修改 `packages/web/src/pages/PriceHistory.tsx`
    - 价格历史展示中区分 per-token 和 per-request 模型
    - per-request 模型显示价格（USD/次）而非倍率
    - _Requirements: 7.1, 7.2_

  - [x] 7.5 修改 `packages/web/src/pages/UpdateLogs.tsx`
    - 更新日志详情中区分 per-token 和 per-request 模型
    - per-request 模型显示"旧价格 → 新价格"（USD/次）
    - _Requirements: 7.3_

  - [x] 7.6 修改 `packages/web/src/context/AppContext.tsx`
    - `fetchRatios` action 解析 `/api/ratio_config` 返回的 `model_price` 字段到 `RatioConfig.modelPrice`
    - _Requirements: 6.1, 6.2_

  - [x] 7.7 修改 `packages/web/src/api/client.ts`
    - 确保 `proxyForward` 返回的 ratio_config 数据包含 `model_price` 字段的解析
    - _Requirements: 6.1_

- [x] 8. 持久化存储兼容性
  - [x] 8.1 验证 `packages/server/src/services/sqliteStore.ts` 的 JSON 序列化兼容性
    - `savePriceHistory` 已使用 JSON.stringify 序列化 `ModelPrice[]`，新增的 `pricingType` 和 `pricePerRequest` 字段会自动包含
    - `saveUpdateLog` 已使用 JSON.stringify 序列化 `UpdateLogModelDetail[]`，新增的 `pricingType`、`oldPrice`、`newPrice` 字段会自动包含
    - 无需修改数据库表结构，仅需确认读取时能正确反序列化新字段
    - _Requirements: 7.1, 7.3_

  - [ ]* 8.2 编写按次计费模型价格历史存取属性测试
    - **Property 7: 按次计费模型价格历史存取往返一致性**
    - **Validates: Requirements 7.1**

  - [ ]* 8.3 编写按次计费模型更新日志存取属性测试
    - **Property 8: 按次计费模型更新日志存取往返一致性**
    - **Validates: Requirements 7.3**

- [x] 9. 最终 Checkpoint — 确保所有测试通过，应用可运行
  - 运行所有测试，确保通过，有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速开发
- 所有修改均为对现有文件的扩展，不新建文件
- 类型扩展使用可选字段，保持向后兼容
- SQLite 存储层无需修改表结构，JSON 序列化自动兼容新字段

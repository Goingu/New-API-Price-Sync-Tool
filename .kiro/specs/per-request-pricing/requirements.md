# 需求文档

## 简介

当前的价格同步工具仅支持按 token 计费的模型（通过模型倍率和补全倍率进行价格转换）。然而，New API 中存在一类"按次计费"模型（如 `gemini-3.1-flash-image-preview`，价格为 $0.100/次），这类模型在 LiteLLM 数据源中通过 `input_cost_per_request` / `output_cost_per_request` 字段标识，在 New API 中通过"模型价格"（而非模型倍率）字段直接设定价格。本需求旨在扩展同步工具，使其能够识别、展示和同步按次计费模型的价格。

## 术语表

- **Sync_Tool（同步工具）**: 本项目的 Web 应用整体
- **New_API_Instance**: 用户已部署的 New API 实例
- **Per_Token_Model（按 token 计费模型）**: 通过 `input_cost_per_token` / `output_cost_per_token` 定价的模型，使用模型倍率和补全倍率进行计费
- **Per_Request_Model（按次计费模型）**: 通过 `input_cost_per_request` / `output_cost_per_request` 定价的模型，使用固定模型价格进行计费
- **Model_Price（模型价格）**: New API 中按次计费模型的直接价格字段（单位：USD/次），区别于通过倍率间接计算的价格
- **Model_Ratio（模型倍率）**: New API 中按 token 计费模型的倍率参数
- **Completion_Ratio（补全倍率）**: 输出 token 相对于输入 token 的价格倍数
- **Price_Fetcher（价格抓取器）**: 负责从 LiteLLM 数据源获取最新模型定价的模块
- **Ratio_Converter（倍率转换器）**: 将厂商官方 USD 价格转换为 New API 倍率格式的模块
- **LiteLLM_Data（LiteLLM 数据源）**: LiteLLM 项目维护的模型价格 JSON 数据库，包含 `input_cost_per_token`、`output_cost_per_token`、`input_cost_per_request`、`output_cost_per_request` 等字段
- **Pricing_Type（计费类型）**: 模型的计费方式，分为 `per_token`（按 token）和 `per_request`（按次）两种
- **ModelPrice_Config（模型价格配置）**: New API 中通过 `PUT /api/option/` 接口设置的 `ModelPrice` 选项，存储按次计费模型的价格映射（JSON 格式：`{ "模型名": 价格 }`）

## 需求

### 需求 1：识别按次计费模型

**用户故事：** 作为管理员，我想要同步工具能够从 LiteLLM 数据源中识别按次计费模型，以便获取这类模型的价格信息。

#### 验收标准

1. WHEN Price_Fetcher 解析 LiteLLM_Data 条目时 THE Price_Fetcher SHALL 检查条目是否包含 `input_cost_per_request` 或 `output_cost_per_request` 字段
2. WHEN LiteLLM_Data 条目包含有效的 `input_cost_per_request` 字段（类型为正数）THE Price_Fetcher SHALL 将该条目识别为 Per_Request_Model
3. WHEN LiteLLM_Data 条目同时包含 `input_cost_per_token` 和 `input_cost_per_request` 字段 THE Price_Fetcher SHALL 优先使用 `input_cost_per_token` 将其归类为 Per_Token_Model
4. WHEN LiteLLM_Data 条目仅包含 `input_cost_per_request`（无有效的 `input_cost_per_token`）THE Price_Fetcher SHALL 将其解析为 Per_Request_Model 并提取每次请求的价格

### 需求 2：扩展模型价格数据结构

**用户故事：** 作为开发者，我想要共享类型能够表达按次计费模型的价格信息，以便前后端统一处理两种计费类型。

#### 验收标准

1. THE ModelPrice 接口 SHALL 包含一个 `pricingType` 字段，取值为 `per_token` 或 `per_request`
2. WHEN Pricing_Type 为 `per_request` 时 THE ModelPrice 接口 SHALL 包含 `pricePerRequest` 字段（单位：USD/次），表示每次请求的价格
3. WHEN Pricing_Type 为 `per_token` 时 THE ModelPrice 接口 SHALL 继续使用现有的 `inputPricePerMillion` 和 `outputPricePerMillion` 字段
4. THE Pricing_Type 字段的默认值 SHALL 为 `per_token`，以保持与现有数据的向后兼容性

### 需求 3：按次计费模型的价格转换

**用户故事：** 作为管理员，我想要同步工具能够将按次计费模型的上游价格转换为 New API 的模型价格格式，以便直接用于更新。

#### 验收标准

1. WHEN 处理 Per_Request_Model 时 THE Ratio_Converter SHALL 跳过模型倍率和补全倍率的计算
2. WHEN 处理 Per_Request_Model 时 THE Ratio_Converter SHALL 直接输出 `pricePerRequest` 值（USD/次），无需进行倍率转换
3. THE RatioResult 接口 SHALL 包含一个可选的 `pricingType` 字段和 `pricePerRequest` 字段，用于标识按次计费模型及其价格
4. WHEN Per_Request_Model 的 RatioResult 生成时 THE Ratio_Converter SHALL 将 `modelRatio` 和 `completionRatio` 设为 0

### 需求 4：按次计费模型的对比展示

**用户故事：** 作为管理员，我想要在对比页面中看到按次计费模型的价格差异，以便决定是否更新。

#### 验收标准

1. WHEN 展示对比结果时 THE Sync_Tool SHALL 在模型列表中使用标签区分 Per_Token_Model 和 Per_Request_Model
2. WHEN 展示 Per_Request_Model 的对比结果时 THE Sync_Tool SHALL 显示"当前模型价格"和"新模型价格"（USD/次），替代模型倍率和补全倍率列
3. WHEN 计算 Per_Request_Model 的差异百分比时 THE Sync_Tool SHALL 基于模型价格（USD/次）进行计算，而非基于倍率
4. WHEN 展示 Per_Request_Model 时 THE Sync_Tool SHALL 将补全倍率相关列显示为"不适用"
5. THE ComparisonRow 接口 SHALL 包含可选的 `pricingType`、`currentPrice` 和 `newPrice` 字段，用于支持按次计费模型的对比数据

### 需求 5：按次计费模型的价格更新

**用户故事：** 作为管理员，我想要能够将按次计费模型的价格批量更新到 New API 实例，以便保持价格同步。

#### 验收标准

1. WHEN 用户选择更新 Per_Request_Model 时 THE Sync_Tool SHALL 通过 `PUT /api/option/` 接口更新 `ModelPrice` 选项（JSON 格式：`{ "模型名": 价格 }`）
2. WHEN 构建更新载荷时 THE Sync_Tool SHALL 将 Per_Request_Model 的价格更新与 Per_Token_Model 的倍率更新分开处理
3. WHEN 同时选择了 Per_Token_Model 和 Per_Request_Model 时 THE Sync_Tool SHALL 分别生成倍率更新载荷（ModelRatio、CompletionRatio）和价格更新载荷（ModelPrice）
4. WHEN 更新 Per_Request_Model 的 ModelPrice 时 THE Sync_Tool SHALL 保留未被选中的按次计费模型的现有价格（全量替换逻辑）
5. WHEN 更新预览展示 Per_Request_Model 时 THE Sync_Tool SHALL 显示"当前价格 → 新价格"（USD/次），而非倍率变化

### 需求 6：获取 New API 当前按次计费模型价格

**用户故事：** 作为管理员，我想要查看 New API 实例中当前配置的按次计费模型价格，以便了解现状并与上游价格对比。

#### 验收标准

1. WHEN 连接成功后 THE Sync_Tool SHALL 通过 `/api/ratio_config` 接口获取 New_API_Instance 当前的模型价格配置（`model_price` 字段）
2. WHEN 模型价格数据获取成功 THE Sync_Tool SHALL 解析 `model_price` 字段中的 JSON 映射，提取每个按次计费模型的当前价格
3. THE RatioConfig 接口 SHALL 新增 `modelPrice` 字段（类型：`Record<string, number>`），用于存储按次计费模型的价格映射
4. WHEN 展示当前倍率页面时 THE Sync_Tool SHALL 同时展示按次计费模型的模型名称和模型价格（USD/次），并标注计费类型为"按次计费"

### 需求 7：价格历史记录支持按次计费模型

**用户故事：** 作为管理员，我想要价格历史记录能够包含按次计费模型的价格变化，以便追踪这类模型的价格趋势。

#### 验收标准

1. WHEN 保存价格历史时 THE SQLite_Store SHALL 保存 Per_Request_Model 的 `pricingType` 和 `pricePerRequest` 字段
2. WHEN 展示价格历史时 THE Sync_Tool SHALL 区分显示按 token 计费和按次计费模型的价格变化
3. WHEN 保存更新日志时 THE SQLite_Store SHALL 记录 Per_Request_Model 的旧价格和新价格（USD/次），而非倍率变化

# 需求文档

## 简介

New API 模型价格同步管理工具是一个独立的 Web 应用，用于从各 AI 厂商官网自动获取最新模型定价，将其转换为 New API 的倍率格式，与用户已部署的 New API 实例进行对比，并支持选择性批量更新。该工具旨在提供比 New API 内置界面更友好、更直观的倍率管理体验。

## 术语表

- **New_API_Instance**: 用户已部署的 QuantumNous/new-api 实例，通过其管理 API 进行交互
- **Model_Ratio（模型倍率）**: New API 中用于计费的核心参数，反映模型的相对价格
- **Completion_Ratio（补全倍率）**: 输出 token 相对于输入 token 的价格倍数
- **Group_Ratio（分组倍率）**: 按用户分组设置的价格倍数
- **Quota_Point（配额点数）**: New API 的内部计费单位，1 USD = 500,000 配额点数
- **Price_Fetcher（价格抓取器）**: 负责从 AI 厂商官网获取最新模型定价的模块
- **Ratio_Converter（倍率转换器）**: 将厂商官方 USD 价格转换为 New API 倍率格式的模块
- **Sync_Tool（同步工具）**: 本项目的 Web 应用整体
- **Provider（厂商）**: AI 模型提供商，如 OpenAI、Anthropic、DeepSeek、Google 等
- **Upstream_Price（上游价格）**: 厂商官网公布的模型定价（通常以 USD/1M tokens 为单位）
- **Channel（渠道）**: New API 中的渠道概念，每个渠道对应一个上游供应商，包含支持的模型列表和模型名映射
- **Price_History（价格历史）**: 每次价格抓取操作保存的历史记录，用于追踪价格变化趋势
- **Update_Log（更新日志）**: 每次批量更新操作的详细记录，包含修改的模型、新旧倍率值和时间戳
- **SQLite_Store（SQLite 存储）**: 使用 better-sqlite3 实现的后端轻量级持久化存储层
- **Checkin_Target（签到目标）**: 用户配置的需要定时签到的 New API 实例，包含实例地址和用户 Token
- **Checkin_Record（签到记录）**: 每次签到操作的结果记录，包含签到时间、成功/失败状态和获得的额度
- **Liveness_Check（活性检测）**: 通过发送测试请求检测模型是否正常可用的操作
- **Health_Status（健康状态）**: 模型的可用性状态，包括在线（online）、离线（offline）和响应慢（slow）
- **Liveness_Config（活性检测配置）**: 用户配置的模型活性检测任务，包含目标实例、模型列表和检测频率

## 需求

### 需求 1：连接 New API 实例

**用户故事：** 作为管理员，我想要配置并连接到我的 New API 实例，以便工具能读取和更新倍率数据。

#### 验收标准

1. WHEN 用户首次打开 Sync_Tool THEN Sync_Tool SHALL 显示一个配置界面，要求输入 New_API_Instance 的地址和管理员 API Key
2. WHEN 用户提交连接配置 THEN Sync_Tool SHALL 通过调用 New_API_Instance 的 `/api/pricing` 接口验证连接是否成功
3. IF 连接验证失败 THEN Sync_Tool SHALL 显示明确的错误信息，包含失败原因（如网络不可达、认证失败等）
4. WHEN 连接验证成功 THEN Sync_Tool SHALL 将配置持久化到浏览器本地存储，后续访问无需重复配置
5. WHEN 用户需要修改连接配置 THEN Sync_Tool SHALL 提供设置入口允许随时更改 New_API_Instance 地址和 API Key

### 需求 2：获取 New API 当前倍率

**用户故事：** 作为管理员，我想要查看 New API 实例当前的所有模型倍率配置，以便了解现状。

#### 验收标准

1. WHEN 连接成功后 THEN Sync_Tool SHALL 通过 `/api/ratio_config` 接口获取 New_API_Instance 当前的全部模型倍率和补全倍率配置
2. WHEN 倍率数据获取成功 THEN Sync_Tool SHALL 以表格形式展示每个模型的名称、模型倍率和补全倍率
3. WHEN 倍率数据获取成功 THEN Sync_Tool SHALL 将模型倍率转换为等价的 USD/1M tokens 价格并在表格中同时展示
4. IF 获取倍率数据失败 THEN Sync_Tool SHALL 显示错误提示并提供重试按钮

### 需求 3：从厂商官网抓取最新价格

**用户故事：** 作为管理员，我想要从各 AI 厂商官网获取最新的模型定价，以便与当前倍率进行对比。

#### 验收标准

1. THE Sync_Tool SHALL 支持从以下 Provider 获取最新模型定价：OpenAI、Anthropic（Claude）、DeepSeek、Google（Gemini）
2. WHEN 用户触发价格抓取操作 THEN Price_Fetcher SHALL 并行地从各 Provider 获取最新的模型定价数据
3. WHEN Price_Fetcher 成功获取到 Upstream_Price THEN Price_Fetcher SHALL 解析出每个模型的输入价格（USD/1M tokens）和输出价格（USD/1M tokens）
4. IF 某个 Provider 的价格获取失败 THEN Sync_Tool SHALL 标记该 Provider 为获取失败状态，同时继续处理其他 Provider 的数据
5. WHEN 价格数据获取完成 THEN Sync_Tool SHALL 显示每个 Provider 的获取状态（成功/失败）和获取到的模型数量

### 需求 4：价格转换为倍率

**用户故事：** 作为管理员，我想要将厂商官方价格自动转换为 New API 的倍率格式，以便直接用于更新。

#### 验收标准

1. WHEN Upstream_Price 获取成功 THEN Ratio_Converter SHALL 使用公式将 USD/1M tokens 价格转换为 Model_Ratio（基准：1 倍率 = GPT-3.5 的价格，即输入 $0.75/1M tokens）
2. WHEN 转换模型倍率时 THEN Ratio_Converter SHALL 同时计算 Completion_Ratio（输出价格 / 输入价格）
3. THE Ratio_Converter SHALL 对转换结果保留合理精度（小数点后最多 6 位）
4. THE Ratio_Converter SHALL 将转换后的倍率格式化为与 New_API_Instance 的 `/api/option/` 接口兼容的 JSON 格式
5. WHEN 转换完成 THEN Sync_Tool SHALL 在界面上同时展示原始 USD 价格和转换后的倍率值

### 需求 5：价格对比与差异展示

**用户故事：** 作为管理员，我想要直观地看到厂商最新价格与当前 New API 倍率之间的差异，以便决定是否更新。

#### 验收标准

1. WHEN 同时拥有当前倍率和最新上游价格时 THEN Sync_Tool SHALL 自动将两者进行逐模型对比
2. WHEN 展示对比结果时 THEN Sync_Tool SHALL 使用颜色高亮标记有差异的模型（如绿色表示价格下降、红色表示价格上升）
3. WHEN 展示对比结果时 THEN Sync_Tool SHALL 显示每个模型的差异百分比和绝对差值
4. WHEN 展示对比结果时 THEN Sync_Tool SHALL 支持按厂商、差异大小、模型名称进行排序和筛选
5. WHEN 存在仅在上游有而 New_API_Instance 中没有的新模型时 THEN Sync_Tool SHALL 将其标记为"新增模型"并单独展示
6. WHEN 存在仅在 New_API_Instance 中有而上游没有的模型时 THEN Sync_Tool SHALL 将其标记为"已移除/未匹配"

### 需求 6：选择性批量更新

**用户故事：** 作为管理员，我想要选择需要更新的模型并批量同步到 New API 实例，以便高效地管理倍率。

#### 验收标准

1. WHEN 对比结果展示后 THEN Sync_Tool SHALL 为每个有差异的模型提供复选框，允许用户选择要更新的模型
2. WHEN 用户选择模型后 THEN Sync_Tool SHALL 提供"全选"、"全不选"、"仅选择价格下降的"等快捷操作
3. WHEN 用户确认更新 THEN Sync_Tool SHALL 显示更新预览，列出所有将被修改的模型及其新旧倍率值
4. WHEN 用户最终确认执行更新 THEN Sync_Tool SHALL 通过 `PUT /api/option/` 接口将选中模型的新倍率批量提交到 New_API_Instance
5. IF 批量更新部分失败 THEN Sync_Tool SHALL 报告哪些模型更新成功、哪些失败，并提供失败模型的重试选项
6. WHEN 更新成功完成 THEN Sync_Tool SHALL 刷新当前倍率数据以确认更新已生效

### 需求 7：用户界面与体验

**用户故事：** 作为管理员，我想要一个友好、直观的 Web 界面，以便高效地完成价格同步管理工作。

#### 验收标准

1. THE Sync_Tool SHALL 提供响应式 Web 界面，在桌面和平板设备上均可正常使用
2. THE Sync_Tool SHALL 在所有数据加载和更新操作期间显示加载状态指示器
3. WHEN 执行耗时操作（如抓取价格、批量更新）时 THEN Sync_Tool SHALL 显示进度反馈，避免用户误以为界面卡死
4. THE Sync_Tool SHALL 使用清晰的导航结构，主要功能（查看当前倍率、抓取价格、对比、更新）可通过一级导航直达
5. WHEN 发生任何操作错误时 THEN Sync_Tool SHALL 使用 Toast 通知或内联消息展示错误详情

### 需求 8：数据安全

**用户故事：** 作为管理员，我想要确保我的 API Key 和实例信息安全，以便放心使用该工具。

#### 验收标准

1. THE Sync_Tool SHALL 仅在浏览器本地存储中保存 API Key，不向任何第三方服务器发送
2. WHEN 与 New_API_Instance 通信时 THEN Sync_Tool SHALL 通过 HTTPS 协议传输所有数据（当实例地址为 HTTPS 时）
3. THE Sync_Tool SHALL 在设置页面提供"清除所有本地数据"功能，一键删除保存的地址和 API Key、以及后端 SQLite 数据库中的历史数据

### 需求 9：持久化存储

**用户故事：** 作为管理员，我想要将价格抓取记录、更新操作日志和缓存数据持久化存储，以便回看价格变化趋势和操作历史。

#### 验收标准

1. WHEN 价格抓取操作完成 THEN SQLite_Store SHALL 将本次抓取的所有模型价格数据连同时间戳保存为一条 Price_History 记录
2. WHEN 批量更新操作执行后 THEN SQLite_Store SHALL 记录一条 Update_Log，包含更新时间、操作的模型列表、每个模型的旧倍率值和新倍率值
3. WHEN 用户查看价格历史时 THEN Sync_Tool SHALL 从 SQLite_Store 读取 Price_History 并以时间线形式展示价格变化趋势
4. WHEN 用户查看更新日志时 THEN Sync_Tool SHALL 从 SQLite_Store 读取 Update_Log 并以列表形式展示每次操作的详细信息
5. WHEN 用户触发价格抓取操作 THEN Sync_Tool SHALL 先检查 SQLite_Store 中是否存在未过期的缓存数据（默认缓存有效期 30 分钟），若存在则直接使用缓存数据
6. WHEN 缓存数据已过期或用户强制刷新 THEN Price_Fetcher SHALL 重新从上游获取价格数据并更新缓存
7. THE SQLite_Store SHALL 使用 better-sqlite3 作为 SQLite 驱动，数据库文件存储在后端服务的数据目录中

### 需求 10：多渠道价格对比

**用户故事：** 作为管理员，我想要查看 New API 实例中各渠道的模型配置，并对比同一模型在不同渠道下的价格，以便找出最便宜的渠道。

#### 验收标准

1. WHEN 用户进入渠道对比页面 THEN Sync_Tool SHALL 通过 `GET /api/channel/` 接口获取 New_API_Instance 中配置的所有 Channel 列表
2. WHEN Channel 列表获取成功 THEN Sync_Tool SHALL 展示每个 Channel 的名称、类型和支持的模型列表
3. WHEN 用户选择一个模型 THEN Sync_Tool SHALL 列出所有支持该模型的 Channel，并展示每个 Channel 下该模型的上游价格信息
4. WHEN 展示多渠道对比结果时 THEN Sync_Tool SHALL 高亮标记价格最低的 Channel，使管理员能直观识别最便宜的渠道
5. WHEN Channel 包含 model_mapping 字段 THEN Sync_Tool SHALL 使用映射关系将 Channel 内部模型名转换为标准模型名进行对比
6. IF 获取 Channel 列表失败 THEN Sync_Tool SHALL 显示错误信息并提供重试按钮
7. WHEN 用户筛选特定 Channel 时 THEN Sync_Tool SHALL 仅展示该 Channel 支持的模型及其价格

### 需求 11：定时签到其他 New API 实例

**用户故事：** 作为管理员，我想要配置多个 New API 实例并定时自动执行签到操作，以便自动领取各实例的每日额度/积分。

#### 验收标准

1. WHEN 用户进入签到管理页面 THEN Sync_Tool SHALL 显示签到目标实例的配置列表，包含实例名称、地址、API Key 和启用状态
2. WHEN 用户添加签到目标实例 THEN Sync_Tool SHALL 验证实例地址和 API Key 的格式有效性，并将配置持久化到 SQLite_Store
3. WHEN 用户编辑或删除签到目标实例 THEN Sync_Tool SHALL 更新 SQLite_Store 中对应的配置记录
4. WHEN 定时签到任务触发 THEN Sync_Tool SHALL 对所有启用状态的签到目标实例调用 `POST /api/user/checkin` 接口执行签到
5. WHEN 签到请求返回成功 THEN Sync_Tool SHALL 记录签到结果（包含获得的额度信息）到 SQLite_Store，并更新该实例的最后签到时间
6. IF 签到请求失败 THEN Sync_Tool SHALL 记录失败原因到 SQLite_Store，并在界面上标记该实例签到失败
7. WHEN 用户查看签到状态 THEN Sync_Tool SHALL 展示每个实例的最后签到时间、签到结果（成功/失败）和获得的额度信息
8. THE Sync_Tool SHALL 使用 node-cron 在后端实现每日定时签到任务，默认每天 00:05 执行
9. WHEN 用户手动触发签到 THEN Sync_Tool SHALL 立即对指定实例或所有启用实例执行签到操作

### 需求 12：定时测试渠道模型活性

**用户故事：** 作为管理员，我想要定时检测 New API 实例中各渠道模型的可用性，以便及时发现不可用的模型并采取措施。

#### 验收标准

1. WHEN 用户进入模型活性检测页面 THEN Sync_Tool SHALL 展示所有已配置的模型检测任务及其最新健康状态（在线/离线/响应慢）
2. WHEN 用户添加模型检测任务 THEN Sync_Tool SHALL 允许配置目标 New_API_Instance 地址、API Key、待检测的模型列表和检测频率
3. WHEN 定时检测任务触发 THEN Sync_Tool SHALL 对每个待检测模型通过 `POST /v1/chat/completions` 接口发送测试请求（payload: `{ model: "模型名", messages: [{ role: "user", content: "hi" }], max_tokens: 5 }`）
4. WHEN 检测请求在 30 秒内成功返回 THEN Sync_Tool SHALL 将该模型标记为"在线"，并记录响应时间到 SQLite_Store
5. WHEN 检测请求超过 30 秒未返回 THEN Sync_Tool SHALL 将该模型标记为"响应慢"，并记录超时信息到 SQLite_Store
6. IF 检测请求返回错误 THEN Sync_Tool SHALL 将该模型标记为"离线"，并记录错误信息到 SQLite_Store
7. WHEN 用户查看检测结果 THEN Sync_Tool SHALL 以表格形式展示每个模型的健康状态、最后检测时间、响应时间和错误信息
8. WHEN 用户手动触发检测 THEN Sync_Tool SHALL 支持对单个模型或全部模型立即执行活性检测
9. WHEN 用户查看历史检测记录 THEN Sync_Tool SHALL 从 SQLite_Store 读取历史数据并以时间线形式展示
10. THE Sync_Tool SHALL 支持配置检测频率，可选值包括每 30 分钟、每小时、每 6 小时和每天
11. THE Sync_Tool SHALL 使用 node-cron 在后端实现定时检测任务

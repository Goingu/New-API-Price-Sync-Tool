# 需求文档

## 简介

自动化渠道优先级调配功能是对现有价格同步工具的扩展。在 New API 中，同一个模型可能配置在多个渠道上。本功能旨在提供灵活的渠道优先级管理能力，允许管理员根据业务需求自动计算并调整渠道优先级（priority 字段），从而实现请求按预期路由到指定渠道。

## 术语表

- **Sync_Tool（同步工具）**: 本项目的 Web 应用整体
- **New_API_Instance**: 用户已部署的 New API 实例，通过其管理 API 进行交互
- **Channel（渠道）**: New API 中的渠道概念，每个渠道对应一个上游供应商，包含支持的模型列表、模型名映射和优先级字段
- **Channel_Priority（渠道优先级）**: New API 中 Channel 的 `priority` 字段，数值越大优先级越高，New API 优先将请求路由到高优先级渠道
- **Model_Ratio（模型倍率）**: New API 中用于计费的核心参数，反映模型的相对价格，由 New_API_Instance 的 `/api/ratio_config` 接口获取
- **Priority_Rule（优先级规则）**: 用户配置的自动优先级调配策略，定义优先级分配的方式和参数
- **Priority_Adjustment_Log（优先级调整日志）**: 每次自动或手动优先级调整操作的详细记录
- **SQLite_Store（SQLite 存储）**: 使用 better-sqlite3 实现的后端轻量级持久化存储层
- **Model_Group（模型组）**: 支持同一模型的所有渠道的集合，用于按模型维度进行优先级排序
- **Auto_Mode（自动模式）**: 用户可开启的模式开关，开启后手动触发优先级计算时跳过预览确认步骤，直接自动应用变更，行为与定时任务一致

## 需求

### 需求 1：自动优先级计算

**用户故事：** 作为管理员，我想要系统根据配置的规则自动计算各渠道的优先级排序，以便实现灵活的渠道调配。

#### 验收标准

1. WHEN 用户触发优先级计算 THEN Sync_Tool SHALL 按 Model_Group 维度对所有 Channel 进行分组
2. WHEN 对某个 Model_Group 计算优先级时 THEN Sync_Tool SHALL 根据配置的 Priority_Rule 为每个 Channel 分配优先级值
3. WHEN 排序完成后 THEN Sync_Tool SHALL 为排序结果中的每个 Channel 分配递减的 Channel_Priority 值（排名第一的渠道获得最高优先级值）
4. THE Sync_Tool SHALL 在计算完成后展示优先级调整预览，列出每个 Channel 的旧优先级值和新优先级值

### 需求 2：优先级调整预览与确认

**用户故事：** 作为管理员，我想要在实际应用优先级变更前预览所有调整内容，以便确认无误后再执行；同时我希望可以开启自动模式来跳过预览确认步骤，提高操作效率。

#### 验收标准

1. WHEN 优先级计算完成后且 Auto_Mode 关闭时 THEN Sync_Tool SHALL 以表格形式展示调整预览，包含渠道名称、模型列表、旧 Channel_Priority 和新 Channel_Priority
2. WHEN 展示调整预览时 THEN Sync_Tool SHALL 使用颜色标记区分优先级上升（绿色）、下降（红色）和不变（灰色）的渠道
3. WHEN 用户确认执行优先级调整 THEN Sync_Tool SHALL 通过 New_API_Instance 的渠道更新接口（`PUT /api/channel/`）逐一更新每个 Channel 的 priority 字段
4. IF 部分 Channel 的优先级更新失败 THEN Sync_Tool SHALL 报告哪些 Channel 更新成功、哪些失败，并提供失败 Channel 的重试选项
5. WHEN 所有更新完成后 THEN Sync_Tool SHALL 重新获取 Channel 列表以确认优先级已生效
6. THE Sync_Tool SHALL 在渠道优先级管理页面提供 Auto_Mode 开关，默认状态为关闭
7. WHEN 用户切换 Auto_Mode 开关状态 THEN Sync_Tool SHALL 将 Auto_Mode 的开启或关闭状态持久化到 SQLite_Store
8. WHEN 用户手动触发优先级计算且 Auto_Mode 开启时 THEN Sync_Tool SHALL 跳过预览确认步骤，直接自动应用优先级变更
9. WHEN Auto_Mode 开启且手动触发的优先级变更自动应用完成后 THEN Sync_Tool SHALL 以 Toast 通知形式展示变更摘要，包含受影响的 Channel 数量和变更结果
10. WHEN 页面加载时 THEN Sync_Tool SHALL 从 SQLite_Store 读取 Auto_Mode 状态并恢复开关的显示状态

### 需求 3：优先级调整日志

**用户故事：** 作为管理员，我想要查看每次优先级调整的历史记录，以便追踪变更和排查问题。

#### 验收标准

1. WHEN 优先级调整执行完成后 THEN SQLite_Store SHALL 保存一条 Priority_Adjustment_Log，包含调整时间、涉及的 Channel 列表和每个 Channel 的新旧优先级值
2. WHEN 用户查看优先级调整历史 THEN Sync_Tool SHALL 从 SQLite_Store 读取 Priority_Adjustment_Log 并以时间倒序列表形式展示
3. WHEN 用户展开某条 Priority_Adjustment_Log THEN Sync_Tool SHALL 显示该次调整的详细信息，包含每个 Channel 的名称、旧优先级和新优先级

### 需求 4：优先级规则配置

**用户故事：** 作为管理员，我想要配置优先级分配的具体参数，以便灵活控制优先级值的分配方式。

#### 验收标准

1. THE Sync_Tool SHALL 提供 Priority_Rule 配置界面，允许用户设置优先级值的起始值（默认 100）和步长（默认 10）
2. WHEN 用户修改 Priority_Rule 参数 THEN Sync_Tool SHALL 将配置持久化到 SQLite_Store
3. WHEN 执行优先级计算时 THEN Sync_Tool SHALL 使用用户配置的 Priority_Rule 参数分配优先级值（例如起始值 100、步长 10 时，排名第一的渠道优先级为 100，第二为 90，依此类推）
4. IF 计算出的优先级值小于 1 THEN Sync_Tool SHALL 将该 Channel 的优先级值设为 1，确保优先级值始终为正整数

### 需求 5：定时自动调配

**用户故事：** 作为管理员，我想要系统定时自动执行优先级调配，以便在需要时自动保持预期的优先级排序。

#### 验收标准

1. WHERE 用户启用定时自动调配功能 THE Sync_Tool SHALL 使用 node-cron 在后端按用户配置的频率定时执行优先级计算和更新
2. THE Sync_Tool SHALL 支持配置定时调配频率，可选值包括每小时、每 6 小时、每 12 小时和每天
3. WHEN 定时任务触发时 THEN Sync_Tool SHALL 自动执行优先级计算，并在计算结果与当前优先级不同时自动应用变更
4. WHEN 定时任务执行完成后 THEN Sync_Tool SHALL 记录执行结果到 Priority_Adjustment_Log，包含是否有变更和变更详情
5. WHEN 用户查看定时任务状态 THEN Sync_Tool SHALL 展示上次执行时间、执行结果和下次计划执行时间

### 需求 6：用户界面集成

**用户故事：** 作为管理员，我想要在现有工具界面中方便地访问渠道优先级管理功能，以便与其他功能无缝配合使用。

#### 验收标准

1. THE Sync_Tool SHALL 在侧边栏导航中新增"渠道优先级"菜单项，链接到渠道优先级管理页面
2. THE Sync_Tool SHALL 在渠道优先级管理页面中集成优先级计算、调整预览和日志查看功能
3. WHEN 执行耗时操作（如优先级计算、批量更新）时 THEN Sync_Tool SHALL 显示加载状态指示器和进度反馈
4. WHEN 发生操作错误时 THEN Sync_Tool SHALL 使用 Toast 通知展示错误详情

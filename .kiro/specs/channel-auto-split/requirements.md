# 需求文档

## 简介

渠道自动拆分功能旨在解决 New API 中无法为不同模型设置不同渠道优先级的核心问题。由于不同模型在不同渠道的价格存在差异，但 New API 仅支持渠道级别的优先级配置，导致无法实现模型级别的最优路由。本功能通过自动将支持多个模型的渠道拆分为多个单模型子渠道，使每个模型可以独立配置渠道优先级，从而实现基于模型的精细化成本优化。

## 术语表

- **Sync_Tool（同步工具）**: 本项目的 Web 应用整体
- **New_API_Instance**: 用户已部署的 New API 实例，通过其管理 API 进行交互
- **Channel（渠道）**: New API 中的渠道概念，每个渠道对应一个上游供应商，包含支持的模型列表、模型名映射、优先级和其他配置参数
- **Parent_Channel（父渠道）**: 待拆分的原始渠道，通常支持多个模型
- **Sub_Channel（子渠道）**: 拆分后生成的新渠道，每个子渠道仅支持一个模型
- **Channel_Split_Operation（渠道拆分操作）**: 将一个 Parent_Channel 拆分为多个 Sub_Channel 的完整流程
- **Split_Preview（拆分预览）**: 在执行拆分前展示的预览信息，包含将要创建的所有 Sub_Channel 及其配置
- **Model_Filter（模型筛选器）**: 用户指定的模型列表，用于限制只拆分特定模型
- **Channel_Configuration（渠道配置）**: 渠道的完整配置信息，包括 base_url、key、proxy、models、model_mapping、priority 等字段
- **Split_Naming_Pattern（拆分命名模式）**: 子渠道的命名规则，格式为 `{父渠道名}-拆分-{模型名}`
- **Channel_Price_Rate（渠道价格费率）**: 每个渠道的实际充值汇率，表示 1 元人民币可兑换的美金数量
- **Model_Ratio（模型倍率）**: New API 中用于计费的核心参数，反映模型的相对价格
- **Effective_Unit_Cost（综合单位成本）**: 某个模型在某个渠道上的真实成本，计算公式为 Model_Ratio × (1 / Channel_Price_Rate)
- **Auto_Priority_Assignment（自动优先级分配）**: 基于 Effective_Unit_Cost 自动计算并分配子渠道优先级的功能
- **Split_History（拆分历史）**: 记录每次拆分操作的详细信息，包括拆分时间、父渠道、生成的子渠道列表
- **Rollback_Operation（回滚操作）**: 撤销拆分操作，删除所有子渠道并恢复父渠道状态
- **Batch_Split（批量拆分）**: 一次性对多个渠道执行拆分操作
- **SQLite_Store（SQLite 存储）**: 使用 better-sqlite3 实现的后端轻量级持久化存储层
- **Split_Configuration（拆分配置）**: 用户保存的拆分参数配置，包括默认的模型筛选规则、命名模式等
- **Model_Group_View（模型分组视图）**: 按模型 ID 分组展示所有渠道的管理界面，支持批量操作
- **Batch_Delete（批量删除）**: 一次性删除多个渠道的操作，同时删除 New_API_Instance 中的渠道和本地记录
- **Batch_Priority_Update（批量优先级更新）**: 一次性更新多个渠道的优先级值
- **Merge_To_Parent（合并到父渠道）**: 将某个模型的所有拆分子渠道合并回父渠道的操作

## 需求

### 需求 1: 渠道选择与模型筛选

**用户故事:** 作为管理员，我想要选择一个或多个渠道进行拆分，并可以指定只拆分特定的模型，以便灵活控制拆分范围。

#### 验收标准

1. WHEN 用户进入渠道拆分页面 THEN Sync_Tool SHALL 从 New_API_Instance 获取所有 Channel 列表，并展示渠道名称、类型、支持的模型数量和当前优先级
2. THE Sync_Tool SHALL 提供多选界面，允许用户选择一个或多个 Parent_Channel 进行拆分
3. WHEN 用户选择某个 Parent_Channel THEN Sync_Tool SHALL 展示该渠道支持的所有模型列表
4. THE Sync_Tool SHALL 提供 Model_Filter 界面，允许用户选择只拆分特定的模型子集
5. WHEN 用户未指定 Model_Filter THEN Sync_Tool SHALL 默认拆分 Parent_Channel 中的所有模型
6. THE Sync_Tool SHALL 在界面上显示每个 Parent_Channel 的模型数量和预计生成的 Sub_Channel 数量
7. WHEN 用户选择的 Parent_Channel 只包含一个模型 THEN Sync_Tool SHALL 显示警告提示，说明该渠道无需拆分
8. THE Sync_Tool SHALL 支持通过搜索和筛选功能快速定位目标渠道和模型

### 需求 2: 拆分预览与配置验证

**用户故事:** 作为管理员，我想要在执行拆分前预览所有将要创建的子渠道及其配置，以便确认无误后再执行。

#### 验收标准

1. WHEN 用户完成渠道和模型选择后点击"预览拆分" THEN Sync_Tool SHALL 生成 Split_Preview，展示所有将要创建的 Sub_Channel
2. THE Split_Preview SHALL 为每个 Sub_Channel 显示以下信息：子渠道名称、包含的模型、继承的配置参数（base_url、key、proxy 等）、建议的初始优先级
3. THE Sync_Tool SHALL 使用 Split_Naming_Pattern 自动生成子渠道名称，格式为 `{父渠道名}-拆分-{模型名}`
4. WHEN 生成的子渠道名称与现有渠道名称冲突 THEN Sync_Tool SHALL 在名称后添加数字后缀（例如 `-2`、`-3`）以避免冲突
5. THE Sync_Tool SHALL 在 Split_Preview 中标识出名称冲突的子渠道，并显示调整后的名称
6. THE Sync_Tool SHALL 允许用户在 Split_Preview 中手动编辑子渠道名称
7. THE Sync_Tool SHALL 验证所有子渠道配置的完整性，确保必需字段（base_url、key、models）均已正确设置
8. WHEN 配置验证失败 THEN Sync_Tool SHALL 在 Split_Preview 中高亮显示问题项，并阻止执行拆分操作
9. THE Split_Preview SHALL 显示拆分操作的影响摘要，包括将创建的子渠道总数、涉及的模型总数

### 需求 3: 子渠道创建与配置继承

**用户故事:** 作为管理员，我想要系统自动创建子渠道并正确继承父渠道的所有配置，以便子渠道能够立即正常工作。

#### 验收标准

1. WHEN 用户确认执行拆分操作 THEN Sync_Tool SHALL 通过 New_API_Instance 的渠道创建接口（`POST /api/channel/`）为每个 Sub_Channel 创建新渠道
2. THE Sync_Tool SHALL 为每个 Sub_Channel 复制 Parent_Channel 的以下配置：base_url、key、type、proxy、config、model_mapping、group、test_model
3. THE Sync_Tool SHALL 为每个 Sub_Channel 设置 models 字段为仅包含一个模型的数组
4. WHEN Parent_Channel 的 model_mapping 包含当前模型的映射规则 THEN Sync_Tool SHALL 在 Sub_Channel 中保留该映射规则
5. WHEN Parent_Channel 的 model_mapping 不包含当前模型的映射规则 THEN Sync_Tool SHALL 在 Sub_Channel 中创建空的 model_mapping 对象
6. THE Sync_Tool SHALL 为每个 Sub_Channel 设置初始优先级，默认继承 Parent_Channel 的优先级值
7. WHEN 创建 Sub_Channel 时发生错误 THEN Sync_Tool SHALL 记录失败的子渠道信息，并继续创建其他子渠道
8. WHEN 所有 Sub_Channel 创建完成后 THEN Sync_Tool SHALL 展示创建结果摘要，包括成功数量、失败数量和失败详情
9. IF 部分 Sub_Channel 创建失败 THEN Sync_Tool SHALL 提供重试选项，允许用户重新创建失败的子渠道

### 需求 4: 自动优先级计算与分配

**用户故事:** 作为管理员，我想要系统根据每个模型在各渠道的实际成本自动计算并设置优先级，以便最便宜的渠道获得最高优先级。

#### 验收标准

1. WHERE 用户启用 Auto_Priority_Assignment 功能 THE Sync_Tool SHALL 在创建 Sub_Channel 后自动计算并分配优先级
2. WHEN 计算优先级时 THEN Sync_Tool SHALL 获取每个模型的 Model_Ratio 和每个渠道的 Channel_Price_Rate
3. WHEN Model_Ratio 和 Channel_Price_Rate 均可用时 THEN Sync_Tool SHALL 计算每个 Sub_Channel 的 Effective_Unit_Cost（Model_Ratio × (1 / Channel_Price_Rate)）
4. THE Sync_Tool SHALL 按模型维度对所有 Sub_Channel 进行分组，每组包含支持同一模型的所有子渠道
5. WHEN 对某个模型组计算优先级时 THEN Sync_Tool SHALL 按 Effective_Unit_Cost 从低到高排序（成本越低优先级越高）
6. THE Sync_Tool SHALL 为排序结果中的每个 Sub_Channel 分配递减的优先级值，排名第一的子渠道获得最高优先级
7. WHEN 某个 Sub_Channel 缺少 Channel_Price_Rate 配置 THEN Sync_Tool SHALL 跳过该子渠道的优先级计算，保留其初始优先级值
8. THE Sync_Tool SHALL 在 Split_Preview 中展示计算出的优先级值，并标识出哪些子渠道将获得最高优先级
9. THE Sync_Tool SHALL 在优先级计算完成后通过 New_API_Instance 的渠道更新接口（`PUT /api/channel/`）批量更新子渠道的优先级

### 需求 5: 父渠道处理选项

**用户故事:** 作为管理员，我想要在拆分完成后选择如何处理父渠道，以便根据实际需求保留或移除父渠道。

#### 验收标准

1. THE Sync_Tool SHALL 在 Split_Preview 中提供父渠道处理选项：禁用父渠道、保留父渠道、删除父渠道
2. WHEN 用户选择"禁用父渠道"选项 THEN Sync_Tool SHALL 在拆分完成后通过 New_API_Instance 的渠道更新接口将 Parent_Channel 的 status 字段设置为禁用状态
3. WHEN 用户选择"保留父渠道"选项 THEN Sync_Tool SHALL 在拆分完成后保持 Parent_Channel 的所有配置和状态不变
4. WHEN 用户选择"删除父渠道"选项 THEN Sync_Tool SHALL 在拆分完成后通过 New_API_Instance 的渠道删除接口（`DELETE /api/channel/:id`）删除 Parent_Channel
5. THE Sync_Tool SHALL 默认推荐"禁用父渠道"选项，并在界面上标识为推荐选项
6. WHEN 用户选择"删除父渠道"选项 THEN Sync_Tool SHALL 显示二次确认对话框，警告删除操作不可恢复
7. WHEN 父渠道处理操作失败 THEN Sync_Tool SHALL 显示错误信息，但不影响已创建的子渠道
8. THE Sync_Tool SHALL 在拆分结果摘要中显示父渠道的最终状态（已禁用、已保留或已删除）

### 需求 6: 拆分历史记录与追踪

**用户故事:** 作为管理员，我想要查看每次拆分操作的历史记录，以便追踪变更和管理拆分关系。

#### 验收标准

1. WHEN 拆分操作成功完成 THEN SQLite_Store SHALL 保存一条 Split_History 记录
2. THE Split_History 记录 SHALL 包含以下信息：拆分时间、操作用户、Parent_Channel 的 ID 和名称、生成的所有 Sub_Channel 的 ID 和名称列表、应用的 Model_Filter、父渠道处理方式
3. THE Sync_Tool SHALL 提供拆分历史查看页面，以时间倒序展示所有 Split_History 记录
4. WHEN 用户查看某条 Split_History 记录 THEN Sync_Tool SHALL 展示该次拆分的详细信息，包括父渠道配置快照、生成的子渠道列表、优先级分配结果
5. THE Sync_Tool SHALL 在拆分历史中标识出哪些子渠道当前仍然存在、哪些已被删除或修改
6. THE Sync_Tool SHALL 为每条 Split_History 记录提供快捷操作入口，允许用户查看相关子渠道或执行回滚操作
7. THE Sync_Tool SHALL 支持按父渠道名称、拆分时间范围筛选拆分历史记录

### 需求 7: 拆分回滚功能

**用户故事:** 作为管理员，我想要能够回滚某次拆分操作，以便在发现问题时快速恢复到拆分前的状态。

#### 验收标准

1. THE Sync_Tool SHALL 在拆分历史记录中为每条 Split_History 提供"回滚"操作按钮
2. WHEN 用户点击"回滚"按钮 THEN Sync_Tool SHALL 显示回滚确认对话框，列出将要删除的所有 Sub_Channel 和将要恢复的 Parent_Channel 状态
3. WHEN 用户确认执行回滚 THEN Sync_Tool SHALL 通过 New_API_Instance 的渠道删除接口删除该次拆分创建的所有 Sub_Channel
4. WHEN Parent_Channel 在拆分时被禁用 THEN Rollback_Operation SHALL 通过 New_API_Instance 的渠道更新接口重新启用 Parent_Channel
5. WHEN Parent_Channel 在拆分时被删除 THEN Sync_Tool SHALL 在回滚确认对话框中提示无法恢复已删除的父渠道，并询问用户是否仍要删除子渠道
6. WHEN 回滚操作中部分 Sub_Channel 删除失败 THEN Sync_Tool SHALL 报告哪些子渠道删除成功、哪些失败，并提供重试选项
7. WHEN 回滚操作完成 THEN SQLite_Store SHALL 更新对应的 Split_History 记录，标记为已回滚状态
8. THE Sync_Tool SHALL 在回滚完成后显示操作结果摘要，包括删除的子渠道数量和父渠道恢复状态

### 需求 8: 批量拆分操作

**用户故事:** 作为管理员，我想要一次性对多个渠道执行拆分操作，以便提高操作效率。

#### 验收标准

1. THE Sync_Tool SHALL 支持在渠道选择界面同时选择多个 Parent_Channel 进行批量拆分
2. WHEN 用户选择多个 Parent_Channel THEN Sync_Tool SHALL 在 Split_Preview 中按渠道分组展示所有将要创建的 Sub_Channel
3. THE Sync_Tool SHALL 允许用户为每个 Parent_Channel 单独配置 Model_Filter 和父渠道处理选项
4. THE Sync_Tool SHALL 提供"应用到所有渠道"快捷操作，允许用户将相同的配置应用到所有选中的父渠道
5. WHEN 执行批量拆分时 THEN Sync_Tool SHALL 按顺序处理每个 Parent_Channel，并实时显示进度条和当前处理的渠道名称
6. WHEN 批量拆分过程中某个渠道拆分失败 THEN Sync_Tool SHALL 记录失败信息并继续处理其他渠道
7. WHEN 批量拆分完成后 THEN Sync_Tool SHALL 展示汇总结果，包括成功拆分的渠道数量、失败的渠道数量、创建的子渠道总数
8. THE Sync_Tool SHALL 为批量拆分操作创建单独的 Split_History 记录，包含所有涉及的父渠道和子渠道信息

### 需求 9: 拆分配置管理

**用户故事:** 作为管理员，我想要保存和管理常用的拆分配置，以便快速应用到新的拆分操作中。

#### 验收标准

1. THE Sync_Tool SHALL 提供拆分配置保存功能，允许用户保存当前的 Model_Filter、命名模式、父渠道处理选项等配置
2. THE Sync_Tool SHALL 允许用户为每个 Split_Configuration 指定名称和描述
3. WHEN 用户保存拆分配置 THEN SQLite_Store SHALL 将配置持久化到数据库
4. THE Sync_Tool SHALL 在渠道拆分页面提供配置选择下拉菜单，展示所有已保存的 Split_Configuration
5. WHEN 用户选择某个 Split_Configuration THEN Sync_Tool SHALL 自动应用该配置的所有参数到当前拆分操作
6. THE Sync_Tool SHALL 支持编辑和删除已保存的 Split_Configuration
7. THE Sync_Tool SHALL 提供默认配置选项，包含推荐的拆分参数设置

### 需求 10: 智能拆分建议

**用户故事:** 作为管理员，我想要系统根据价格数据自动识别哪些渠道和模型需要拆分，以便快速定位优化机会。

#### 验收标准

1. WHERE 系统已获取 Channel_Price_Rate 和 Model_Ratio 数据 THE Sync_Tool SHALL 分析所有渠道，识别出存在显著价格差异的模型
2. THE Sync_Tool SHALL 在渠道拆分页面提供"智能建议"功能入口
3. WHEN 用户点击"智能建议" THEN Sync_Tool SHALL 展示建议拆分的渠道列表，并按潜在成本节省从高到低排序
4. THE Sync_Tool SHALL 为每个建议拆分的渠道显示以下信息：渠道名称、建议拆分的模型列表、预计成本节省百分比、当前优先级问题说明
5. THE Sync_Tool SHALL 计算成本节省百分比的方式为：比较当前统一优先级下的平均成本与拆分后按最优优先级路由的平均成本
6. THE Sync_Tool SHALL 允许用户一键选择所有建议拆分的渠道，并自动应用建议的 Model_Filter
7. WHEN 没有可用的价格数据 THEN Sync_Tool SHALL 提示用户先配置 Channel_Price_Rate 或获取 Model_Ratio 数据
8. THE Sync_Tool SHALL 在智能建议中标识出哪些模型在不同渠道的价格差异超过 20%，作为高优先级拆分目标

### 需求 11: 用户界面集成

**用户故事:** 作为管理员，我想要在现有工具界面中方便地访问渠道拆分功能，以便与其他功能无缝配合使用。

#### 验收标准

1. THE Sync_Tool SHALL 在侧边栏导航中新增"渠道拆分"菜单项，链接到渠道拆分管理页面
2. THE Sync_Tool SHALL 在渠道拆分管理页面中集成渠道选择、模型筛选、拆分预览、历史记录和配置管理功能
3. WHEN 执行耗时操作（如批量拆分、优先级计算）时 THEN Sync_Tool SHALL 显示加载状态指示器和进度反馈
4. WHEN 发生操作错误时 THEN Sync_Tool SHALL 使用 Toast 通知展示错误详情
5. THE Sync_Tool SHALL 在渠道优先级管理页面提供快捷入口，允许用户直接跳转到渠道拆分页面
6. THE Sync_Tool SHALL 在渠道对比页面识别出需要拆分的渠道时，提供快捷入口跳转到渠道拆分页面并自动选中相关渠道
7. THE Sync_Tool SHALL 使用响应式设计，确保在不同屏幕尺寸下均能良好展示拆分预览和历史记录

### 需求 12: 拆分操作的幂等性与安全性

**用户故事:** 作为管理员，我想要确保拆分操作是安全可靠的，避免重复拆分或意外删除渠道。

#### 验收标准

1. WHEN 用户尝试拆分已经是单模型的渠道 THEN Sync_Tool SHALL 阻止拆分操作，并显示提示信息
2. WHEN 用户尝试拆分已经被拆分过的渠道 THEN Sync_Tool SHALL 检查 Split_History，并警告用户该渠道已被拆分
3. THE Sync_Tool SHALL 在执行删除父渠道操作前验证该渠道不是其他功能的依赖项
4. WHEN 拆分操作过程中发生网络错误或 API 调用失败 THEN Sync_Tool SHALL 记录已完成的操作步骤，并提供继续或回滚选项
5. THE Sync_Tool SHALL 在执行批量操作前验证用户的 API key 具有足够的权限
6. WHEN 子渠道名称生成冲突无法自动解决 THEN Sync_Tool SHALL 阻止拆分操作，并要求用户手动调整命名规则
7. THE Sync_Tool SHALL 在所有破坏性操作（删除父渠道、回滚拆分）前要求用户二次确认

### 需求 13: 与现有功能的集成

**用户故事:** 作为管理员，我想要渠道拆分功能能够与现有的价格同步和优先级管理功能无缝配合，以便实现完整的成本优化工作流。

#### 验收标准

1. WHEN 拆分操作创建 Sub_Channel 后 THEN Sync_Tool SHALL 自动将这些子渠道纳入自动优先级调配功能的管理范围
2. THE Sync_Tool SHALL 支持为拆分后的 Sub_Channel 配置 Channel_Price_Rate，与父渠道的费率保持一致
3. WHEN 用户在渠道优先级管理页面查看子渠道时 THEN Sync_Tool SHALL 标识出该渠道是通过拆分创建的，并提供查看拆分历史的链接
4. THE Sync_Tool SHALL 在渠道对比页面中识别并标识出拆分关系，展示父渠道和子渠道的对应关系
5. WHEN 定时自动优先级调配任务运行时 THEN Sync_Tool SHALL 正确处理拆分后的子渠道，按模型维度计算优先级
6. THE Sync_Tool SHALL 在价格历史页面中支持查看拆分前后的成本变化趋势
7. WHEN 用户删除某个 Sub_Channel 时 THEN Sync_Tool SHALL 更新对应的 Split_History 记录，标记该子渠道已被删除

### 需求 14: 模型分组管理

**用户故事:** 作为管理员，我想要系统自动将支持相同模型的渠道分组，以便批量管理和操作这些渠道。

#### 验收标准

1. THE Sync_Tool SHALL 提供模型分组视图，按模型 ID 自动将所有渠道分组展示
2. WHEN 用户查看某个模型分组 THEN Sync_Tool SHALL 展示该模型在所有渠道中的配置信息，包括渠道名称、优先级、价格费率、实际成本
3. THE Sync_Tool SHALL 在模型分组视图中标识出哪些渠道是通过拆分创建的子渠道，并显示其父渠道信息
4. THE Sync_Tool SHALL 为每个模型分组提供批量操作功能，包括批量调整优先级、批量删除渠道
5. WHEN 用户选择批量删除某个模型分组中的渠道 THEN Sync_Tool SHALL 通过 New_API_Instance 的渠道删除接口（`DELETE /api/channel/:id`）删除选中的渠道
6. WHEN 执行批量删除操作 THEN Sync_Tool SHALL 显示二次确认对话框，列出将要删除的所有渠道名称和 ID
7. WHEN 批量删除完成后 THEN Sync_Tool SHALL 展示删除结果摘要，包括成功删除的渠道数量、失败的渠道数量和失败详情
8. THE Sync_Tool SHALL 在模型分组视图中提供筛选功能，允许用户按提供商、渠道类型、是否为拆分渠道等条件筛选
9. THE Sync_Tool SHALL 在模型分组视图中展示每个模型的统计信息，包括支持该模型的渠道总数、拆分渠道数量、平均优先级、最低成本渠道
10. WHEN 用户在模型分组视图中批量调整优先级 THEN Sync_Tool SHALL 允许用户为选中的渠道设置统一的优先级值或按成本自动分配优先级
11. THE Sync_Tool SHALL 在模型分组视图中提供"合并到父渠道"功能，允许用户将某个模型的所有拆分子渠道合并回父渠道
12. WHEN 用户删除某个拆分子渠道 THEN Sync_Tool SHALL 更新对应的 Split_History 记录，标记该子渠道已被删除

### 需求 15: 性能与可扩展性

**用户故事:** 作为管理员，我想要拆分功能能够高效处理大量渠道和模型，不影响系统响应性能。

#### 验收标准

1. THE Sync_Tool SHALL 在 2 秒内完成单个渠道的拆分预览生成
2. WHEN 批量拆分超过 10 个渠道时 THEN Sync_Tool SHALL 使用异步处理机制，避免阻塞用户界面
3. THE Sync_Tool SHALL 在批量创建子渠道时使用批处理 API 调用，减少网络往返次数
4. THE Sync_Tool SHALL 使用数据库事务确保拆分历史记录的原子性
5. WHEN 拆分操作涉及超过 100 个子渠道时 THEN Sync_Tool SHALL 分批创建子渠道，每批不超过 20 个
6. THE Sync_Tool SHALL 在拆分预览界面使用虚拟滚动技术，优化大量子渠道的渲染性能
7. THE SQLite_Store SHALL 在 Split_History 表的关键字段上创建索引，优化历史记录查询性能


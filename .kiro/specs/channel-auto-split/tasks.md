# 实现计划：渠道自动拆分

## 概述

本实现计划将渠道自动拆分功能分解为可执行的编码任务。实现顺序遵循从底层到上层的原则：首先实现共享类型和数据持久化，然后实现核心拆分逻辑，最后实现服务层、API 路由和前端界面。

## 任务列表

- [x] 1. 定义共享类型和接口
  - 在 `packages/shared/types.ts` 中新增拆分相关的 TypeScript 类型定义
  - 包括 ParentChannelAction、SubChannelPreview、SplitPreview、SplitExecutionOptions、SplitExecutionResult、SplitHistoryEntry、RollbackResult、SplitSuggestion、SplitConfiguration
  - _Requirements: 2.2, 3.8, 6.2, 9.2_

- [x] 2. 实现 SQLite 数据持久化层
  - [x] 2.1 创建数据库表结构
    - 在 `packages/server/src/db/schema.ts` 中定义 channel_split_history 和 split_configurations 表的 SQL 创建语句
    - 包含索引创建语句以优化查询性能
    - _Requirements: 6.1, 9.3, 14.4_

  - [x] 2.2 实现拆分历史存储方法
    - 在 `packages/server/src/db/splitStore.ts` 中实现 saveSplitHistory、getSplitHistory、getSplitHistoryById、updateRollbackStatus 方法
    - 使用 better-sqlite3 实现数据库操作
    - _Requirements: 6.1, 6.2, 6.3, 7.7_

  - [ ]* 2.3 编写拆分历史存储的属性测试
    - **Property 9: 拆分历史持久化往返**
    - **Property 10: 拆分历史时间排序**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - 文件：`packages/server/src/db/splitStore.test.ts`

  - [x] 2.4 实现拆分配置存储方法
    - 在 `packages/server/src/db/splitStore.ts` 中实现 saveSplitConfig、getSplitConfigs、getSplitConfigById、deleteSplitConfig 方法
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 2.5 编写拆分配置存储的属性测试
    - **Property 14: 拆分配置持久化往返**
    - **Validates: Requirements 9.1, 9.2, 9.3**
    - 文件：`packages/server/src/db/splitStore.test.ts`

- [x] 3. 实现拆分引擎核心逻辑
  - [x] 3.1 实现子渠道名称生成函数
    - 在 `packages/server/src/services/splitEngine.ts` 中实现 generateSubChannelName 函数
    - 处理名称冲突，自动添加数字后缀
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 3.2 编写名称生成的属性测试
    - **Property 1: 子渠道名称唯一性与冲突解决**
    - **Validates: Requirements 2.3, 2.4, 2.5, 12.6**
    - 文件：`packages/server/src/services/splitEngine.test.ts`

  - [x] 3.3 实现子渠道配置生成函数
    - 在 `packages/server/src/services/splitEngine.ts` 中实现 createSubChannelConfig 函数
    - 正确继承父渠道的所有配置字段
    - 处理 model_mapping 的提取逻辑
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.4 编写配置继承的属性测试
    - **Property 2: 配置继承完整性**
    - **Property 3: 模型字段单一性**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
    - 文件：`packages/server/src/services/splitEngine.test.ts`

  - [x] 3.5 实现拆分预览生成函数
    - 在 `packages/server/src/services/splitEngine.ts` 中实现 generateSplitPreview 函数
    - 应用模型筛选器逻辑
    - 检测名称冲突并标记
    - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.5_

  - [ ]* 3.6 编写拆分预览的属性测试
    - **Property 4: 模型筛选器正确性**
    - **Property 5: 拆分预览与执行一致性**
    - **Property 15: 单模型渠道拒绝拆分**
    - **Validates: Requirements 1.4, 1.5, 1.7, 2.1, 2.2, 12.1**
    - 文件：`packages/server/src/services/splitEngine.test.ts`

  - [x] 3.7 实现配置验证函数
    - 在 `packages/server/src/services/splitEngine.ts` 中实现 validateSplitConfig 函数
    - 验证必需字段完整性
    - 检测配置错误
    - _Requirements: 2.7, 2.8_

  - [ ]* 3.8 编写拆分引擎的单元测试
    - 测试具体示例和边界条件
    - 测试空渠道列表、单模型渠道等场景
    - 文件：`packages/server/src/services/splitEngine.test.ts`

- [x] 4. 实现优先级计算引擎
  - [x] 4.1 实现优先级计算函数
    - 在 `packages/server/src/services/priorityEngine.ts` 中实现 calculateEffectiveUnitCost 和 assignPriorities 函数
    - 计算 Effective_Unit_Cost = Model_Ratio × (1 / Channel_Price_Rate)
    - 按模型分组并按成本排序分配优先级
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 4.2 编写优先级计算的属性测试
    - **Property 6: 优先级计算单调性**
    - **Property 7: 优先级计算公式正确性**
    - **Property 8: 初始优先级继承**
    - **Validates: Requirements 3.6, 4.3, 4.4, 4.5, 4.6, 4.7**
    - 文件：`packages/server/src/services/priorityEngine.test.ts`

- [x] 5. 实现智能建议引擎
  - [x] 5.1 实现智能建议生成函数
    - 在 `packages/server/src/services/suggestionEngine.ts` 中实现 generateSplitSuggestions 函数
    - 分析渠道价格差异，识别拆分机会
    - 计算预计成本节省百分比
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 5.2 编写智能建议的属性测试
    - **Property 16: 智能建议成本排序**
    - **Validates: Requirements 10.3, 10.8**
    - 文件：`packages/server/src/services/suggestionEngine.test.ts`

  - [ ]* 5.3 编写智能建议的单元测试
    - 测试价格差异识别逻辑
    - 测试成本节省计算
    - 文件：`packages/server/src/services/suggestionEngine.test.ts`

- [x] 6. 实现拆分服务层
  - [x] 6.1 实现 SplitService 类基础结构
    - 在 `packages/server/src/services/splitService.ts` 中创建 SplitService 类
    - 注入 SQLiteStore 依赖
    - _Requirements: 所有需求_

  - [x] 6.2 实现拆分预览方法
    - 实现 SplitService.preview 方法
    - 调用 New API 获取渠道详情
    - 调用 SplitEngine 生成预览
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 6.3 实现拆分执行方法
    - 实现 SplitService.execute 方法
    - 批量创建子渠道（通过 New API）
    - 调用 PriorityEngine 计算并更新优先级
    - 处理父渠道（禁用/保留/删除）
    - 保存拆分历史
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 4.1, 4.9, 5.2, 5.3, 5.4, 6.1_

  - [x] 6.4 实现拆分历史查询方法
    - 实现 SplitService.getSplitHistory 和 getSplitHistoryById 方法
    - _Requirements: 6.3, 6.4, 6.5, 6.7_

  - [x] 6.5 实现回滚方法
    - 实现 SplitService.rollback 方法
    - 删除子渠道
    - 恢复父渠道状态
    - 更新历史记录
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 6.6 实现智能建议方法
    - 实现 SplitService.getSplitSuggestions 方法
    - 调用 SuggestionEngine 生成建议
    - _Requirements: 10.2, 10.3, 10.6, 10.7_

  - [x] 6.7 实现配置管理方法
    - 实现 SplitService.saveSplitConfig、getSplitConfigs、deleteSplitConfig 方法
    - _Requirements: 9.1, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 6.8 编写服务层的单元测试
    - **Property 11: 回滚操作逆向性**
    - **Property 12: 批量拆分独立性**
    - **Property 13: 父渠道处理正确性**
    - **Validates: Requirements 5.2, 5.3, 5.4, 7.3, 7.4, 7.7, 8.6**
    - Mock New API 调用
    - 测试错误处理和部分失败场景
    - 文件：`packages/server/src/services/splitService.test.ts`

- [ ] 7. 检查点 - 确保所有后端测试通过
  - 运行所有后端测试，确认核心逻辑正确
  - 如有问题请向用户询问

- [ ] 8. 实现 API 路由层
  - [ ] 8.1 创建拆分路由文件
    - 在 `packages/server/src/routes/channelSplit.ts` 中创建路由
    - 挂载到 `/api/channel-split` 路径
    - _Requirements: 所有需求_

  - [ ] 8.2 实现拆分预览路由
    - POST `/api/channel-split/preview`
    - 接收 channelIds 和 modelFilters 参数
    - 调用 SplitService.preview
    - _Requirements: 1.1, 2.1_

  - [ ] 8.3 实现拆分执行路由
    - POST `/api/channel-split/execute`
    - 接收 preview 和 options 参数
    - 调用 SplitService.execute
    - _Requirements: 3.1, 8.5_

  - [ ] 8.4 实现拆分历史路由
    - GET `/api/channel-split/history` - 获取历史列表
    - GET `/api/channel-split/history/:id` - 获取单条历史详情
    - _Requirements: 6.3, 6.4_

  - [ ] 8.5 实现回滚路由
    - POST `/api/channel-split/rollback/:id`
    - 调用 SplitService.rollback
    - _Requirements: 7.1, 7.2_

  - [ ] 8.6 实现智能建议路由
    - GET `/api/channel-split/suggestions`
    - 调用 SplitService.getSplitSuggestions
    - _Requirements: 10.2, 10.3_

  - [ ] 8.7 实现配置管理路由
    - GET `/api/channel-split/configs` - 获取配置列表
    - POST `/api/channel-split/configs` - 保存配置
    - DELETE `/api/channel-split/configs/:id` - 删除配置
    - _Requirements: 9.4, 9.5, 9.6_

  - [ ] 8.8 集成路由到主应用
    - 在 `packages/server/src/index.ts` 中注册拆分路由
    - _Requirements: 11.1_

- [ ] 9. 实现前端 API Client
  - [ ] 9.1 扩展 API Client
    - 在 `packages/web/src/api/client.ts` 中新增拆分相关的 API 调用函数
    - 包括 previewSplit、executeSplit、getSplitHistory、rollbackSplit、getSplitSuggestions、getSplitConfigs、saveSplitConfig、deleteSplitConfig
    - _Requirements: 所有需求_

- [ ] 10. 实现前端渠道拆分页面
  - [ ] 10.1 创建页面基础结构
    - 在 `packages/web/src/pages/ChannelSplit.tsx` 中创建页面组件
    - 使用 Ant Design Tabs 组织多个功能模块
    - _Requirements: 11.1, 11.2_

  - [ ] 10.2 实现渠道选择 Tab
    - 展示渠道列表（从 New API 获取）
    - 实现多选功能
    - 展示每个渠道的模型数量和支持的模型列表
    - 实现模型筛选器界面
    - 实现搜索和筛选功能
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ] 10.3 实现拆分预览 Tab
    - 调用 previewSplit API 生成预览
    - 展示子渠道列表和配置信息
    - 标识名称冲突的子渠道
    - 允许手动编辑子渠道名称
    - 展示配置验证结果
    - 提供父渠道处理选项（禁用/保留/删除）
    - 展示拆分影响摘要
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 5.1, 5.5_

  - [ ] 10.4 实现拆分执行与结果展示
    - 调用 executeSplit API 执行拆分
    - 显示进度条和当前处理状态
    - 展示执行结果摘要（成功/失败数量）
    - 展示失败详情和重试选项
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 8.5, 8.7_

  - [ ] 10.5 实现拆分历史 Tab
    - 调用 getSplitHistory API 获取历史记录
    - 以时间倒序展示历史列表
    - 实现历史详情展开
    - 标识子渠道当前状态（存在/已删除）
    - 提供回滚操作按钮和确认对话框
    - 实现按父渠道名称和时间范围筛选
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.8_

  - [ ] 10.6 实现智能建议 Tab
    - 调用 getSplitSuggestions API 获取建议
    - 展示建议列表，按成本节省排序
    - 展示每个建议的详细信息（渠道名称、模型列表、成本节省百分比、原因）
    - 提供一键选择建议渠道的功能
    - 处理无价格数据的情况
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 10.7 实现配置管理 Tab
    - 调用 getSplitConfigs API 获取配置列表
    - 展示配置列表
    - 实现配置选择和应用功能
    - 实现配置创建/编辑/删除功能
    - 提供默认配置选项
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7_

  - [ ] 10.8 实现错误处理和加载状态
    - 使用 Ant Design message 展示错误 Toast
    - 显示加载状态指示器
    - 实现二次确认对话框（删除父渠道、回滚操作）
    - _Requirements: 5.6, 11.3, 11.4_

  - [ ] 10.9 实现响应式设计
    - 确保在不同屏幕尺寸下良好展示
    - _Requirements: 11.7_

- [ ] 11. 实现模型分组管理页面
  - [ ] 11.1 创建模型分组管理页面
    - 在 `packages/web/src/pages/ModelGroupManagement.tsx` 中创建页面组件
    - _Requirements: 14.1_

  - [ ] 11.2 实现模型分组列表视图
    - 从 New API 获取所有渠道
    - 按模型 ID 自动分组
    - 展示每个模型的统计信息（渠道总数、拆分渠道数、平均优先级）
    - 标识最低成本渠道
    - _Requirements: 14.1, 14.9_

  - [ ] 11.3 实现模型分组详情视图
    - 展示某个模型在所有渠道中的配置信息
    - 显示渠道名称、优先级、价格费率、实际成本
    - 标识拆分子渠道并显示父渠道信息
    - _Requirements: 14.2, 14.3_

  - [ ] 11.4 实现批量删除功能
    - 提供多选功能选择要删除的渠道
    - 显示二次确认对话框，列出将要删除的渠道
    - 调用 New API 的 DELETE /api/channel/:id 接口删除渠道
    - 展示删除结果摘要（成功/失败数量）
    - 更新 Split_History 记录
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.12_

  - [ ]* 11.5 编写批量删除的属性测试
    - **Property 18: 批量删除原子性**
    - **Validates: Requirements 14.5, 14.6, 14.7, 14.12**
    - 文件：`packages/server/src/services/modelGroupService.test.ts`

  - [ ] 11.6 实现批量优先级调整功能
    - 允许用户为选中的渠道设置统一的优先级值
    - 提供"按成本自动分配"选项
    - 调用 New API 的 PUT /api/channel/:id 接口更新优先级
    - 展示更新结果摘要
    - _Requirements: 14.10_

  - [ ]* 11.7 编写批量优先级更新的属性测试
    - **Property 19: 批量优先级更新一致性**
    - **Validates: Requirements 14.10**
    - 文件：`packages/server/src/services/modelGroupService.test.ts`

  - [ ] 11.8 实现筛选功能
    - 按提供商筛选
    - 按渠道类型筛选
    - 按是否为拆分渠道筛选
    - _Requirements: 14.8_

  - [ ] 11.9 实现合并到父渠道功能
    - 识别某个模型的所有拆分子渠道
    - 提供"合并到父渠道"操作
    - 删除所有拆分子渠道，恢复父渠道
    - _Requirements: 14.11_

  - [ ]* 11.10 编写模型分组的属性测试
    - **Property 17: 模型分组完整性**
    - **Validates: Requirements 14.1, 14.2**
    - 文件：`packages/server/src/services/modelGroupService.test.ts`

- [ ] 12. 集成到应用导航
  - [ ] 12.1 添加侧边栏菜单项
    - 在 `packages/web/src/App.tsx` 或导航组件中新增"渠道拆分"和"模型分组管理"菜单项
    - 链接到 `/channel-split` 和 `/model-groups` 路由
    - _Requirements: 11.1, 14.1_

  - [ ] 12.2 配置路由
    - 在路由配置中添加渠道拆分页面和模型分组管理页面路由
    - _Requirements: 11.1, 14.1_

  - [ ] 12.3 添加跨页面快捷入口
    - 在渠道优先级管理页面添加跳转到拆分页面的快捷入口
    - 在渠道对比页面识别需要拆分的渠道时提供快捷入口
    - 在模型分组管理页面提供跳转到拆分页面的快捷入口
    - _Requirements: 11.5, 11.6, 13.3, 13.4_

- [ ] 13. 检查点 - 端到端功能验证
  - 手动测试完整的拆分流程
  - 验证拆分预览、执行、历史记录和回滚功能
  - 验证智能建议和配置管理功能
  - 验证模型分组管理和批量操作功能
  - 验证与现有功能的集成
  - 如有问题请向用户询问

- [ ] 14. 性能优化
  - [ ] 14.1 实现批处理优化
    - 在 SplitService.execute 中实现分批创建子渠道（每批最多 20 个）
    - 使用异步处理机制处理大量渠道
    - _Requirements: 15.2, 15.3, 15.5_

  - [ ] 14.2 实现前端虚拟滚动
    - 在拆分预览界面使用虚拟滚动技术优化大量子渠道的渲染
    - _Requirements: 15.6_

  - [ ] 14.3 优化数据库查询
    - 确认索引已创建
    - 验证查询性能
    - _Requirements: 15.7_

- [ ] 15. 最终检查点 - 完整性验证
  - 确保所有测试通过
  - 验证所有需求已实现
  - 验证所有正确性属性已测试
  - 如有问题请向用户询问

## 注意事项

- 标记 `*` 的任务为可选测试任务，可根据时间安排跳过
- 每个任务都引用了具体的需求编号，便于追溯
- 检查点任务确保增量验证，及早发现问题
- 属性测试验证通用正确性属性，单元测试验证具体示例
- 实现顺序从底层到上层，确保依赖关系正确

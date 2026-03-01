# 需求文档

## 简介

本功能为"渠道源倍率对比"页面添加持久化能力，使用户获取的倍率数据能够自动保存并在下次访问时自动加载，避免每次都需要手动重新获取数据的重复操作。

## 术语表

- **Channel_Source_Ratio_Cache**: 渠道源倍率缓存系统，负责存储和管理从渠道源获取的倍率数据
- **Ratio_Data**: 倍率数据，包含模型倍率（modelRatio）和补全倍率（completionRatio）的配置信息
- **Cache_Entry**: 缓存条目，包含渠道源 ID、倍率配置、获取时间戳等信息
- **User**: 使用 New API 价格同步工具的用户
- **Channel_Source**: 渠道源，指提供 API 服务的中转商
- **Comparison_Page**: 渠道源倍率对比页面，位于 `/channel-source-ratios` 路由

## 需求

### 需求 1: 持久化渠道源倍率数据

**用户故事:** 作为用户，我希望获取的渠道源倍率数据能够自动保存，这样我下次访问页面时不需要重新获取。

#### 验收标准

1. WHEN User 点击"获取倍率"按钮并成功获取数据，THE Channel_Source_Ratio_Cache SHALL 将每个渠道源的倍率数据保存到 SQLite 数据库
2. THE Channel_Source_Ratio_Cache SHALL 为每个 Cache_Entry 记录渠道源 ID、倍率配置（modelRatio 和 completionRatio）、获取时间戳和过期时间
3. WHEN 保存操作失败，THE Channel_Source_Ratio_Cache SHALL 记录错误日志但不影响用户当前的数据查看
4. THE Channel_Source_Ratio_Cache SHALL 支持同时保存多个渠道源的倍率数据
5. WHEN 同一渠道源的新数据到达，THE Channel_Source_Ratio_Cache SHALL 更新现有缓存条目而不是创建重复条目

### 需求 2: 自动加载缓存数据

**用户故事:** 作为用户，我希望进入页面时能自动看到上次获取的倍率数据，而不需要每次都手动点击获取按钮。

#### 验收标准

1. WHEN User 进入 Comparison_Page，THE Comparison_Page SHALL 自动从 Channel_Source_Ratio_Cache 加载所有有效的缓存数据
2. THE Comparison_Page SHALL 在加载缓存数据时显示加载状态指示器
3. WHEN 缓存数据加载成功，THE Comparison_Page SHALL 自动填充渠道源选择器并显示对比表格
4. WHEN 缓存为空或所有缓存已过期，THE Comparison_Page SHALL 显示空状态提示，引导用户选择渠道源并点击获取按钮
5. WHEN 缓存数据加载失败，THE Comparison_Page SHALL 显示错误提示但允许用户手动获取新数据

### 需求 3: 缓存过期管理

**用户故事:** 作为用户，我希望系统能自动识别过期的缓存数据，确保我看到的信息不会太陈旧。

#### 验收标准

1. THE Channel_Source_Ratio_Cache SHALL 为每个 Cache_Entry 设置 24 小时的默认过期时间
2. WHEN 查询缓存数据，THE Channel_Source_Ratio_Cache SHALL 自动过滤掉已过期的条目
3. THE Comparison_Page SHALL 在界面上显示每个渠道源数据的获取时间
4. WHEN 缓存数据已过期，THE Comparison_Page SHALL 在对应渠道源旁边显示"已过期"标识
5. THE Comparison_Page SHALL 提供"刷新过期数据"快捷操作，允许用户一键重新获取所有过期渠道源的数据

### 需求 4: 手动刷新机制

**用户故事:** 作为用户，我希望能够手动刷新特定渠道源或所有渠道源的倍率数据，以获取最新信息。

#### 验收标准

1. THE Comparison_Page SHALL 保留现有的"获取倍率"按钮，允许用户手动触发数据获取
2. WHEN User 点击"获取倍率"按钮，THE Comparison_Page SHALL 重新从渠道源获取最新数据并更新缓存
3. THE Comparison_Page SHALL 为每个渠道源提供单独的刷新按钮，允许用户只刷新特定渠道源
4. WHEN 手动刷新操作完成，THE Comparison_Page SHALL 显示成功提示并更新数据的获取时间戳
5. WHEN 手动刷新失败，THE Comparison_Page SHALL 显示错误信息但保留现有缓存数据

### 需求 5: 缓存状态可见性

**用户故事:** 作为用户，我希望能清楚地看到当前显示的数据是来自缓存还是实时获取的，以及数据的新鲜程度。

#### 验收标准

1. THE Comparison_Page SHALL 在每个渠道源的列标题旁显示数据来源标识（"缓存"或"实时"）
2. THE Comparison_Page SHALL 显示每个渠道源数据的获取时间，格式为相对时间（例如"5 分钟前"）
3. WHEN 数据来自缓存且距离获取时间超过 12 小时，THE Comparison_Page SHALL 使用警告色显示时间标识
4. THE Comparison_Page SHALL 在页面顶部显示整体缓存状态摘要（例如"已加载 3 个渠道源的缓存数据"）
5. THE Comparison_Page SHALL 提供工具提示，显示缓存数据的详细信息（获取时间、过期时间、数据条目数）

### 需求 6: 数据库架构扩展

**用户故事:** 作为开发者，我需要在 SQLite 数据库中添加新表来存储渠道源倍率缓存数据。

#### 验收标准

1. THE Channel_Source_Ratio_Cache SHALL 创建名为 `channel_source_ratio_cache` 的数据库表
2. THE `channel_source_ratio_cache` 表 SHALL 包含以下字段：id（主键）、source_id（渠道源 ID）、ratio_config（JSON 格式的倍率配置）、fetched_at（获取时间戳）、expires_at（过期时间戳）
3. THE `channel_source_ratio_cache` 表 SHALL 在 source_id 字段上创建唯一索引，确保每个渠道源只有一个有效缓存条目
4. THE Channel_Source_Ratio_Cache SHALL 在 SQLiteStore 类中实现数据库迁移逻辑，自动创建新表
5. THE Channel_Source_Ratio_Cache SHALL 提供 CRUD 方法：saveCachedRatio、getCachedRatios、getCachedRatioBySourceId、deleteCachedRatio、clearExpiredCache

### 需求 7: API 端点扩展

**用户故事:** 作为前端开发者，我需要新的 API 端点来管理渠道源倍率缓存。

#### 验收标准

1. THE Server SHALL 提供 GET `/api/channel-source-ratios/cache` 端点，返回所有有效的缓存数据
2. THE Server SHALL 提供 POST `/api/channel-source-ratios/cache` 端点，保存或更新缓存数据
3. THE Server SHALL 提供 DELETE `/api/channel-source-ratios/cache/:sourceId` 端点，删除特定渠道源的缓存
4. THE Server SHALL 提供 DELETE `/api/channel-source-ratios/cache` 端点，清除所有缓存数据
5. WHEN API 请求失败，THE Server SHALL 返回适当的 HTTP 状态码和错误描述

### 需求 8: 前端状态管理

**用户故事:** 作为前端开发者，我需要在前端状态中管理缓存数据的加载和更新。

#### 验收标准

1. THE Comparison_Page SHALL 在组件挂载时自动调用缓存加载 API
2. THE Comparison_Page SHALL 维护 `cacheLoaded` 状态标志，指示缓存是否已加载
3. THE Comparison_Page SHALL 维护 `dataSource` 状态标志，区分数据来源（"cache"、"live"或"mixed"）
4. WHEN 缓存数据和实时数据混合显示，THE Comparison_Page SHALL 为每个渠道源单独标记数据来源
5. THE Comparison_Page SHALL 在获取新数据后自动调用缓存保存 API

### 需求 9: 向后兼容性

**用户故事:** 作为现有用户，我希望新功能不会破坏我当前的使用习惯和工作流程。

#### 验收标准

1. THE Comparison_Page SHALL 保持现有的所有功能和 UI 元素不变
2. WHEN 缓存功能不可用（例如数据库错误），THE Comparison_Page SHALL 降级到原有的手动获取模式
3. THE Comparison_Page SHALL 保持现有的"应用倍率"功能完全不变
4. THE Comparison_Page SHALL 保持现有的搜索、筛选和排序功能完全不变
5. WHEN 用户首次使用新版本，THE Comparison_Page SHALL 显示功能介绍提示，说明新的自动加载能力

### 需求 10: 性能优化

**用户故事:** 作为用户，我希望缓存功能不会影响页面加载速度和响应性能。

#### 验收标准

1. THE Comparison_Page SHALL 在 500 毫秒内完成缓存数据的加载和渲染
2. THE Channel_Source_Ratio_Cache SHALL 使用数据库索引优化查询性能
3. WHEN 缓存数据超过 100 个模型，THE Comparison_Page SHALL 使用虚拟滚动或分页来优化渲染性能
4. THE Comparison_Page SHALL 使用防抖（debounce）机制，避免频繁的缓存保存操作
5. THE Channel_Source_Ratio_Cache SHALL 在后台异步执行过期缓存清理，不阻塞主线程

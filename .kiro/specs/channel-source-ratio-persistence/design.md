# 设计文档：渠道源倍率持久化

## Overview

本功能为"渠道源倍率对比"页面添加持久化能力，使用户获取的倍率数据能够自动保存到 SQLite 数据库并在下次访问时自动加载。这将显著改善用户体验，避免每次访问页面都需要重新获取数据的重复操作。

### 核心目标

1. 自动保存用户获取的渠道源倍率数据到本地数据库
2. 页面加载时自动从缓存恢复上次的数据
3. 提供缓存过期管理机制（默认 24 小时）
4. 保持现有功能完全向后兼容
5. 提供清晰的缓存状态可见性

### 技术栈

- 后端：Node.js + Express + better-sqlite3
- 前端：React + TypeScript + Ant Design
- 数据库：SQLite
- 状态管理：React Context API

## Architecture

### 系统架构

本功能采用三层架构：

```
┌─────────────────────────────────────────────────────────┐
│                    前端层 (React)                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  ChannelSourceRatios.tsx                         │  │
│  │  - 页面加载时自动获取缓存                          │  │
│  │  - 用户获取新数据后自动保存缓存                    │  │
│  │  - 显示缓存状态和过期标识                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP API
┌─────────────────────────────────────────────────────────┐
│                   API 层 (Express)                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/channel-source-ratios/cache                │  │
│  │  - GET: 获取所有有效缓存                          │  │
│  │  - POST: 保存/更新缓存                            │  │
│  │  - DELETE: 删除缓存                               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                 数据层 (SQLiteStore)                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │  channel_source_ratio_cache 表                    │  │
│  │  - 存储渠道源倍率配置                              │  │
│  │  - 记录获取时间和过期时间                          │  │
│  │  - 支持 CRUD 操作                                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```


### 数据流

#### 页面加载流程

```
用户访问页面
    ↓
前端自动调用 GET /api/channel-source-ratios/cache
    ↓
后端查询数据库，过滤过期数据
    ↓
返回有效缓存数据
    ↓
前端自动填充渠道源选择器和对比表格
    ↓
显示缓存状态（获取时间、数据来源标识）
```

#### 数据获取和保存流程

```
用户选择渠道源并点击"获取倍率"
    ↓
前端调用现有的 POST /api/channel-sources/compare-ratios
    ↓
获取成功后，前端调用 POST /api/channel-source-ratios/cache
    ↓
后端保存/更新每个渠道源的缓存（upsert 操作）
    ↓
前端更新 UI，显示"实时"数据来源标识
```

### 关键设计决策

1. **缓存粒度**：以渠道源为单位缓存，每个渠道源一条记录
2. **过期策略**：默认 24 小时，查询时自动过滤过期数据
3. **更新策略**：使用 UPSERT（INSERT OR REPLACE），避免重复记录
4. **向后兼容**：所有现有功能保持不变，缓存功能作为增强层
5. **错误处理**：缓存操作失败不影响核心功能，降级到手动模式

## Components and Interfaces

### 后端组件

#### 1. SQLiteStore 扩展

在 `packages/server/src/services/sqliteStore.ts` 中添加新方法：

```typescript
// 保存或更新缓存
saveCachedRatio(entry: CachedRatioEntry): void

// 获取所有有效缓存（自动过滤过期）
getCachedRatios(maxAgeHours?: number): CachedRatioEntry[]

// 根据渠道源 ID 获取缓存
getCachedRatioBySourceId(sourceId: number): CachedRatioEntry | null

// 删除特定渠道源的缓存
deleteCachedRatio(sourceId: number): void

// 清除所有过期缓存（后台任务）
clearExpiredRatioCache(): number
```


#### 2. API 路由扩展

在 `packages/server/src/routes/channelSources.ts` 中添加新端点：

```typescript
// GET /api/channel-source-ratios/cache
// 获取所有有效的缓存数据
router.get('/cache', (req, res) => {
  // 返回格式：{ success: true, cached: CachedRatioEntry[] }
})

// POST /api/channel-source-ratios/cache
// 保存或更新缓存数据
router.post('/cache', (req, res) => {
  // 请求体：{ sourceId, ratioConfig }
  // 返回格式：{ success: true, cached: CachedRatioEntry }
})

// DELETE /api/channel-source-ratios/cache/:sourceId
// 删除特定渠道源的缓存
router.delete('/cache/:sourceId', (req, res) => {
  // 返回格式：{ success: true }
})

// DELETE /api/channel-source-ratios/cache
// 清除所有缓存
router.delete('/cache', (req, res) => {
  // 返回格式：{ success: true, deleted: number }
})
```

### 前端组件

#### 1. ChannelSourceRatios 页面扩展

在 `packages/web/src/pages/ChannelSourceRatios.tsx` 中添加：

**新增状态**：
```typescript
const [cacheLoaded, setCacheLoaded] = useState(false);
const [cacheLoading, setCacheLoading] = useState(false);
const [dataSource, setDataSource] = useState<'cache' | 'live' | 'mixed'>('cache');
const [fetchedTimes, setFetchedTimes] = useState<Map<number, string>>(new Map());
```

**新增功能**：
- `useEffect` hook：页面加载时自动获取缓存
- `loadCachedRatios()`：从 API 加载缓存数据
- `saveCachedRatios()`：保存数据到缓存
- `refreshExpiredRatios()`：刷新所有过期数据
- `refreshSingleSource()`：刷新单个渠道源

#### 2. API 客户端扩展

在 `packages/web/src/api/client.ts` 中添加：

```typescript
export async function getCachedRatios(): Promise<{
  success: boolean;
  cached: CachedRatioEntry[];
  error?: string;
}>

export async function saveCachedRatio(
  sourceId: number,
  ratioConfig: RatioConfig
): Promise<{
  success: boolean;
  cached?: CachedRatioEntry;
  error?: string;
}>

export async function deleteCachedRatio(sourceId: number): Promise<{
  success: boolean;
  error?: string;
}>

export async function clearAllCachedRatios(): Promise<{
  success: boolean;
  deleted: number;
  error?: string;
}>
```


## Data Models

### 数据库表结构

#### channel_source_ratio_cache 表

```sql
CREATE TABLE IF NOT EXISTS channel_source_ratio_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  ratio_config_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES channel_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ratio_cache_expires 
  ON channel_source_ratio_cache(expires_at);
```

**字段说明**：
- `id`: 主键，自增
- `source_id`: 渠道源 ID，唯一索引（确保每个渠道源只有一条缓存）
- `source_name`: 渠道源名称（冗余字段，便于查询显示）
- `ratio_config_json`: 倍率配置的 JSON 字符串（包含 modelRatio 和 completionRatio）
- `fetched_at`: 数据获取时间（ISO 8601 格式）
- `expires_at`: 过期时间（ISO 8601 格式）

**索引**：
- `source_id` 上的唯一索引（自动创建）
- `expires_at` 上的索引（优化过期查询）

### TypeScript 类型定义

在 `packages/shared/types.ts` 中添加：

```typescript
/** 渠道源倍率缓存条目 */
export interface CachedRatioEntry {
  id?: number;
  sourceId: number;
  sourceName: string;
  ratioConfig: RatioConfig;
  fetchedAt: string;
  expiresAt: string;
}

/** 缓存状态元数据 */
export interface CacheMetadata {
  isFromCache: boolean;
  fetchedAt?: string;
  expiresAt?: string;
  isExpired?: boolean;
}

/** 扩展的渠道源倍率数据（包含缓存元数据） */
export interface SourceRatioDataWithCache {
  sourceId: number;
  sourceName: string;
  success: boolean;
  ratioConfig?: RatioConfig;
  error?: string;
  cache?: CacheMetadata;
}
```

### 数据转换

#### 保存到数据库

```typescript
// TypeScript 对象 → SQLite
const entry: CachedRatioEntry = {
  sourceId: 1,
  sourceName: "渠道源A",
  ratioConfig: { modelRatio: {...}, completionRatio: {...} },
  fetchedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
};

// 存储时
db.run(`
  INSERT OR REPLACE INTO channel_source_ratio_cache 
  (source_id, source_name, ratio_config_json, fetched_at, expires_at)
  VALUES (?, ?, ?, ?, ?)
`, [
  entry.sourceId,
  entry.sourceName,
  JSON.stringify(entry.ratioConfig),
  entry.fetchedAt,
  entry.expiresAt
]);
```

#### 从数据库读取

```typescript
// SQLite → TypeScript 对象
const row = db.get(`
  SELECT * FROM channel_source_ratio_cache 
  WHERE source_id = ? AND expires_at > ?
`, [sourceId, new Date().toISOString()]);

const entry: CachedRatioEntry = {
  id: row.id,
  sourceId: row.source_id,
  sourceName: row.source_name,
  ratioConfig: JSON.parse(row.ratio_config_json),
  fetchedAt: row.fetched_at,
  expiresAt: row.expires_at
};
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 缓存保存完整性

*For any* 渠道源倍率数据，当保存到缓存后，读取该缓存应返回包含所有必需字段（sourceId、sourceName、ratioConfig、fetchedAt、expiresAt）的完整数据，且 ratioConfig 的内容与保存时一致。

**Validates: Requirements 1.1, 1.2, 8.5**

### Property 2: 缓存更新幂等性

*For any* 渠道源 ID，对同一个渠道源保存两次不同的倍率数据后，数据库中应只存在一条记录，且该记录包含最后一次保存的数据。

**Validates: Requirements 1.5, 6.3**

### Property 3: 批量保存独立性

*For any* 多个不同的渠道源倍率数据，批量保存后，每个渠道源的数据应独立存储，且都可以通过各自的 sourceId 正确读取。

**Validates: Requirements 1.4**

### Property 4: 过期时间计算正确性

*For any* 保存的缓存条目，其 expiresAt 时间应等于 fetchedAt 时间加上 24 小时（默认过期时间）。

**Validates: Requirements 3.1**

### Property 5: 过期数据自动过滤

*For any* 查询缓存的操作，返回的结果中不应包含 expiresAt 时间早于当前时间的条目。

**Validates: Requirements 3.2**

### Property 6: 页面加载自动获取缓存

*For any* 页面加载操作，如果数据库中存在有效的缓存数据，页面应自动调用缓存加载 API 并填充 UI 组件。

**Validates: Requirements 2.1, 2.3, 8.1**

### Property 7: 缓存加载状态管理

*For any* 缓存加载操作，在加载开始时 loading 状态应为 true，加载完成后应为 false，且 cacheLoaded 状态应正确反映加载结果。

**Validates: Requirements 2.2, 8.2**

### Property 8: 数据来源标识正确性

*For any* 显示的渠道源数据，如果数据来自缓存，应标记为"缓存"；如果是实时获取，应标记为"实时"；混合场景下每个渠道源应有独立的来源标识。

**Validates: Requirements 5.1, 8.3, 8.4**

### Property 9: 手动刷新更新缓存

*For any* 手动刷新操作（全部刷新或单个刷新），成功获取新数据后，应自动更新对应渠道源的缓存，且 fetchedAt 时间应更新为当前时间。

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 10: 错误处理不影响核心功能

*For any* 缓存操作失败（保存失败、加载失败），系统应记录错误但不应阻止用户手动获取新数据或查看当前已有的数据。

**Validates: Requirements 1.3, 2.5, 4.5, 9.2**

### Property 11: API 端点操作正确性

*For any* 有效的 API 请求（GET、POST、DELETE），服务器应返回正确的响应格式和状态码，且数据库操作应与请求意图一致。

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 12: API 错误响应规范性

*For any* 无效的 API 请求，服务器应返回适当的 HTTP 错误状态码（4xx 或 5xx）和包含错误描述的响应体。

**Validates: Requirements 7.5**

### Property 13: 缓存状态可见性

*For any* 显示的缓存数据，UI 应显示获取时间（相对时间格式），且当数据距离获取时间超过 12 小时时，应使用警告色显示。

**Validates: Requirements 3.3, 3.4, 5.2, 5.3**

### Property 14: 防抖机制有效性

*For any* 在短时间内（如 1 秒内）触发多次缓存保存操作，实际执行的保存操作应少于触发次数（通过防抖机制合并）。

**Validates: Requirements 10.4**

### Property 15: 异步清理不阻塞

*For any* 过期缓存清理操作，该操作应在后台异步执行，不应阻塞其他数据库操作或 API 请求。

**Validates: Requirements 10.5**


## Error Handling

### 数据库错误

**场景**：数据库连接失败、表不存在、磁盘空间不足

**处理策略**：
1. 捕获所有数据库异常，记录详细错误日志
2. 向上层返回明确的错误信息（不暴露内部实现细节）
3. 前端降级到手动模式，允许用户继续使用核心功能
4. 显示友好的错误提示："缓存功能暂时不可用，您仍可手动获取数据"

**实现**：
```typescript
try {
  store.saveCachedRatio(entry);
} catch (error) {
  console.error('[Cache] Failed to save ratio:', error);
  // 不抛出异常，不影响用户当前操作
  return { success: false, error: 'Cache save failed' };
}
```

### API 请求错误

**场景**：网络超时、服务器错误、无效参数

**处理策略**：
1. 使用适当的 HTTP 状态码：
   - 400: 请求参数无效
   - 404: 资源不存在
   - 500: 服务器内部错误
2. 返回结构化的错误响应：`{ success: false, error: "错误描述" }`
3. 前端显示错误提示，但保留现有数据

**实现**：
```typescript
router.get('/cache', (req, res) => {
  try {
    const cached = store.getCachedRatios();
    res.json({ success: true, cached });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});
```

### 数据验证错误

**场景**：缓存数据格式错误、JSON 解析失败、必需字段缺失

**处理策略**：
1. 在保存前验证数据完整性
2. 在读取后验证 JSON 格式
3. 发现损坏的缓存数据时，删除该条目并记录警告
4. 不影响其他有效的缓存数据

**实现**：
```typescript
function validateCacheEntry(entry: any): entry is CachedRatioEntry {
  return (
    typeof entry.sourceId === 'number' &&
    typeof entry.sourceName === 'string' &&
    entry.ratioConfig &&
    typeof entry.ratioConfig.modelRatio === 'object' &&
    typeof entry.fetchedAt === 'string' &&
    typeof entry.expiresAt === 'string'
  );
}
```

### 过期数据处理

**场景**：用户查看已过期的缓存数据

**处理策略**：
1. 查询时自动过滤过期数据（不返回给前端）
2. 前端显示"数据已过期"标识（如果需要显示过期数据）
3. 提供"刷新过期数据"快捷操作
4. 定期清理过期数据（后台任务）

### 并发操作冲突

**场景**：多个请求同时更新同一渠道源的缓存

**处理策略**：
1. 使用数据库的 UPSERT 操作（INSERT OR REPLACE）
2. 依赖 SQLite 的事务机制保证原子性
3. 最后写入的数据生效（Last Write Wins）

### 降级策略

当缓存功能完全不可用时，系统应降级到原有的手动模式：

1. 页面加载时不自动获取缓存（跳过缓存加载步骤）
2. 用户可以正常选择渠道源并手动获取数据
3. 获取的数据正常显示，但不尝试保存到缓存
4. 所有核心功能（对比、应用倍率）保持完全可用


## Testing Strategy

### 双重测试方法

本功能将采用单元测试和基于属性的测试相结合的方法：

- **单元测试**：验证特定示例、边缘情况和错误条件
- **属性测试**：验证跨所有输入的通用属性
- 两者互补，共同确保全面覆盖

### 单元测试

单元测试专注于具体示例和边缘情况：

#### 数据库层测试 (sqliteStore.test.ts)

**示例测试**：
- 表创建：验证 `channel_source_ratio_cache` 表在初始化后存在
- 表结构：验证表包含所有必需字段和正确的数据类型
- 索引存在：验证 `source_id` 唯一索引和 `expires_at` 索引已创建
- CRUD 方法存在：验证所有方法（saveCachedRatio、getCachedRatios 等）可调用

**边缘情况测试**：
- 空数据库查询：getCachedRatios() 在空数据库上返回空数组
- 无效 sourceId 查询：getCachedRatioBySourceId(-1) 返回 null
- 删除不存在的记录：deleteCachedRatio(999) 不抛出异常
- JSON 解析错误：损坏的 ratio_config_json 应被优雅处理

**错误条件测试**：
- 数据库锁定：模拟数据库被锁定时的行为
- 磁盘空间不足：模拟写入失败的场景
- 外键约束违反：尝试保存不存在的 source_id

#### API 层测试 (channelSources.test.ts)

**示例测试**：
- GET /cache 返回正确格式：`{ success: true, cached: [...] }`
- POST /cache 保存成功：返回保存的条目
- DELETE /cache/:id 删除成功：返回 `{ success: true }`
- DELETE /cache 清除所有：返回删除数量

**错误条件测试**：
- 无效请求体：POST /cache 缺少必需字段返回 400
- 资源不存在：DELETE /cache/999 返回 404
- 服务器错误：数据库异常时返回 500

#### 前端组件测试 (ChannelSourceRatios.test.tsx)

**示例测试**：
- 空状态显示：无缓存时显示引导提示
- 缓存加载成功：自动填充选择器和表格
- 手动刷新按钮存在：验证"获取倍率"按钮可点击
- 应用倍率功能不变：验证现有功能正常工作

**交互测试**：
- 点击刷新按钮：触发数据获取和缓存保存
- 选择渠道源：更新 UI 状态
- 搜索过滤：正确过滤显示的模型

### 基于属性的测试

属性测试使用 **fast-check** 库（JavaScript/TypeScript 的属性测试库），每个测试运行最少 100 次迭代。

#### 测试配置

```typescript
import fc from 'fast-check';

// 配置：每个属性测试运行 100 次
const testConfig = { numRuns: 100 };
```

#### 生成器定义

```typescript
// 生成随机渠道源 ID
const sourceIdArb = fc.integer({ min: 1, max: 1000 });

// 生成随机倍率配置
const ratioConfigArb = fc.record({
  modelRatio: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.double({ min: 0.1, max: 10 })
  ),
  completionRatio: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.double({ min: 0.5, max: 5 })
  ),
});

// 生成随机缓存条目
const cacheEntryArb = fc.record({
  sourceId: sourceIdArb,
  sourceName: fc.string({ minLength: 1, maxLength: 100 }),
  ratioConfig: ratioConfigArb,
  fetchedAt: fc.date().map(d => d.toISOString()),
  expiresAt: fc.date().map(d => d.toISOString()),
});
```

#### 属性测试用例

**Property 1: 缓存保存完整性**
```typescript
// Feature: channel-source-ratio-persistence, Property 1: 缓存保存完整性
it('should preserve all fields when saving and reading cache', () => {
  fc.assert(
    fc.property(cacheEntryArb, (entry) => {
      store.saveCachedRatio(entry);
      const retrieved = store.getCachedRatioBySourceId(entry.sourceId);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.sourceId).toBe(entry.sourceId);
      expect(retrieved!.sourceName).toBe(entry.sourceName);
      expect(retrieved!.ratioConfig).toEqual(entry.ratioConfig);
      expect(retrieved!.fetchedAt).toBe(entry.fetchedAt);
      expect(retrieved!.expiresAt).toBe(entry.expiresAt);
    }),
    testConfig
  );
});
```

**Property 2: 缓存更新幂等性**
```typescript
// Feature: channel-source-ratio-persistence, Property 2: 缓存更新幂等性
it('should update existing cache entry instead of creating duplicates', () => {
  fc.assert(
    fc.property(
      sourceIdArb,
      ratioConfigArb,
      ratioConfigArb,
      (sourceId, config1, config2) => {
        const entry1 = { sourceId, sourceName: 'Test', ratioConfig: config1, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
        const entry2 = { sourceId, sourceName: 'Test', ratioConfig: config2, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
        
        store.saveCachedRatio(entry1);
        store.saveCachedRatio(entry2);
        
        const all = store.getCachedRatios();
        const forSource = all.filter(e => e.sourceId === sourceId);
        
        expect(forSource).toHaveLength(1);
        expect(forSource[0].ratioConfig).toEqual(config2);
      }
    ),
    testConfig
  );
});
```

**Property 4: 过期时间计算正确性**
```typescript
// Feature: channel-source-ratio-persistence, Property 4: 过期时间计算正确性
it('should set expiresAt to fetchedAt + 24 hours', () => {
  fc.assert(
    fc.property(cacheEntryArb, (entry) => {
      const fetchedTime = new Date(entry.fetchedAt).getTime();
      const expectedExpiry = new Date(fetchedTime + 24 * 60 * 60 * 1000).toISOString();
      
      const entryWithCorrectExpiry = {
        ...entry,
        expiresAt: expectedExpiry
      };
      
      store.saveCachedRatio(entryWithCorrectExpiry);
      const retrieved = store.getCachedRatioBySourceId(entry.sourceId);
      
      const retrievedExpiry = new Date(retrieved!.expiresAt).getTime();
      const retrievedFetched = new Date(retrieved!.fetchedAt).getTime();
      const diff = retrievedExpiry - retrievedFetched;
      
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }),
    testConfig
  );
});
```

**Property 5: 过期数据自动过滤**
```typescript
// Feature: channel-source-ratio-persistence, Property 5: 过期数据自动过滤
it('should filter out expired entries when querying', () => {
  fc.assert(
    fc.property(
      fc.array(cacheEntryArb, { minLength: 1, maxLength: 10 }),
      (entries) => {
        // 设置一半为过期，一半为有效
        const now = Date.now();
        entries.forEach((entry, i) => {
          const isExpired = i % 2 === 0;
          entry.expiresAt = new Date(now + (isExpired ? -1000 : 1000)).toISOString();
          store.saveCachedRatio(entry);
        });
        
        const validEntries = store.getCachedRatios();
        
        validEntries.forEach(entry => {
          const expiresAt = new Date(entry.expiresAt).getTime();
          expect(expiresAt).toBeGreaterThan(now);
        });
      }
    ),
    testConfig
  );
});
```

**Property 11: API 端点操作正确性**
```typescript
// Feature: channel-source-ratio-persistence, Property 11: API 端点操作正确性
it('should handle API operations correctly', async () => {
  await fc.assert(
    fc.asyncProperty(cacheEntryArb, async (entry) => {
      // POST: 保存
      const postResp = await request(app)
        .post('/api/channel-source-ratios/cache')
        .send({ sourceId: entry.sourceId, ratioConfig: entry.ratioConfig });
      expect(postResp.status).toBe(200);
      expect(postResp.body.success).toBe(true);
      
      // GET: 读取
      const getResp = await request(app)
        .get('/api/channel-source-ratios/cache');
      expect(getResp.status).toBe(200);
      expect(getResp.body.success).toBe(true);
      expect(getResp.body.cached).toContainEqual(
        expect.objectContaining({ sourceId: entry.sourceId })
      );
      
      // DELETE: 删除
      const deleteResp = await request(app)
        .delete(`/api/channel-source-ratios/cache/${entry.sourceId}`);
      expect(deleteResp.status).toBe(200);
      expect(deleteResp.body.success).toBe(true);
    }),
    testConfig
  );
});
```

### 测试覆盖目标

- 数据库层：90% 代码覆盖率
- API 层：85% 代码覆盖率
- 前端组件：80% 代码覆盖率
- 所有正确性属性：100% 实现

### 测试执行

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test sqliteStore.test.ts

# 运行属性测试（带详细输出）
npm test -- --verbose

# 生成覆盖率报告
npm test -- --coverage
```

### 持续集成

所有测试应在 CI/CD 流程中自动运行：
1. 每次提交时运行单元测试
2. 每次 PR 时运行完整测试套件（包括属性测试）
3. 测试失败时阻止合并
4. 生成并上传覆盖率报告


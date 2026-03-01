// ============================================================
// Shared type definitions for New API Price Sync Tool
// ============================================================

// --- Core Price & Ratio Types ---

/** Pricing type: per-token (default) or per-request */
export type PricingType = 'per_token' | 'per_request';

/** Model pricing data from upstream providers (USD/1M tokens) */
export interface ModelPrice {
  modelId: string;
  modelName: string;
  provider: string;
  pricingType?: PricingType;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  pricePerRequest?: number;
}

/** Converted ratio result for a model */
export interface RatioResult {
  modelId: string;
  provider?: string; // Provider name (e.g., "OpenAI", "Anthropic")
  modelRatio: number;
  completionRatio: number;
  pricingType?: PricingType;
  pricePerRequest?: number;
}

/** New API ratio configuration (from /api/ratio_config) */
export interface RatioConfig {
  modelRatio: Record<string, number>;
  completionRatio: Record<string, number>;
  modelPrice?: Record<string, number>;
}

/** Result of fetching prices from a single provider */
export interface ProviderPriceResult {
  provider: string;
  success: boolean;
  models: ModelPrice[];
  error?: string;
  fetchedAt: string;
}

// --- Comparison & Update Types ---

/** A single row in the price comparison table */
export interface ComparisonRow {
  modelId: string;
  provider: string;
  currentRatio?: number;
  currentCompletionRatio?: number;
  newRatio?: number;
  newCompletionRatio?: number;
  suggestedRatio?: number;
  suggestedCompletionRatio?: number;
  ratioDiffPercent?: number;
  status: 'unchanged' | 'increased' | 'decreased' | 'new' | 'removed';
  selected: boolean;
  pricingType?: PricingType;
  currentPrice?: number;
  newPrice?: number;
}

/** Preview of models about to be updated */
export interface UpdatePreview {
  modelsToUpdate: ComparisonRow[];
  totalChanges: number;
}

/** Request payload for PUT /api/option/ on New API */
export interface OptionUpdateRequest {
  key: string;
  value: string;
}

// --- Proxy Types ---

/** Request to the backend proxy endpoint */
export interface ProxyRequest {
  targetUrl: string;
  apiKey: string;
  userId?: string;
  method: string;
  path: string;
  body?: unknown;
}

/** Generic proxy response wrapper */
export interface ProxyResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Connection Types ---

/** User's connection settings for a New API instance */
export interface ConnectionSettings {
  baseUrl: string;
  apiKey: string;
  userId?: string;
}

// --- Persistence Types (SQLite Store) ---

/** A price history record stored in SQLite */
export interface PriceHistoryEntry {
  id?: number;
  fetchedAt: string;
  provider: string;
  models: ModelPrice[];
}

/** A record of a batch update operation */
export interface UpdateLogEntry {
  id?: number;
  updatedAt: string;
  modelsUpdated: UpdateLogModelDetail[];
}

/** Detail of a single model change within an update log */
export interface UpdateLogModelDetail {
  modelId: string;
  pricingType?: PricingType;
  oldModelRatio: number;
  newModelRatio: number;
  oldCompletionRatio: number;
  newCompletionRatio: number;
  oldPrice?: number;
  newPrice?: number;
}

/** Cached price data with timestamp */
export interface CachedPriceData {
  cachedAt: string;
  results: ProviderPriceResult[];
}

// --- Channel Types ---

/** A channel from New API's /api/channel/ endpoint */
export interface Channel {
  id: number;
  name: string;
  type: number;
  key?: string; // base_url or endpoint identifier
  base_url?: string; // New API channel base_url
  models: string;
  model_mapping: string;
  status: number;
  priority: number;
}

/** Parsed model info for a specific channel (after mapping) */
export interface ChannelModelInfo {
  channelId: number;
  channelName: string;
  channelType: number;
  modelId: string;
  originalModelId: string;
}

/** Multi-channel price comparison for a single model */
export interface ChannelPriceComparison {
  modelId: string;
  channels: ChannelModelPrice[];
  cheapestChannelId: number;
}

/** Price info for a model within a specific channel */
export interface ChannelModelPrice {
  channelId: number;
  channelName: string;
  modelId: string;
  originalModelId: string;
  upstreamInputPrice?: number;
  upstreamOutputPrice?: number;
  isCheapest: boolean;
}

// --- LiteLLM Data Source Types ---

/** A single entry from the LiteLLM price database JSON */
export interface LiteLLMPriceEntry {
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  input_cost_per_request?: number;
  output_cost_per_request?: number;
  litellm_provider: string;
  mode: string;
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  [key: string]: unknown;
}

// --- Channel Source Types ---

/** A configured New API instance for fetching channel prices */
export interface ChannelSource {
  id?: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  userId?: string;
  enabled: boolean;
  createdAt: string;
  isOwnInstance?: boolean; // 标记是否为自有实例
}

// --- Checkin Types ---

/** Check-in configuration for a channel source */
export interface CheckinConfig {
  id?: number;
  sourceId: number;
  autoCheckin: boolean;
  checkinTime: string;
  createdAt: string;
}

/** Extended channel source with check-in configuration */
export interface ChannelSourceWithCheckin extends ChannelSource {
  checkinConfig?: CheckinConfig;
}

/** A configured New API instance for daily check-in (for backward compatibility) */
export type CheckinTarget = ChannelSourceWithCheckin;

/** Result record of a single check-in attempt */
export interface CheckinRecord {
  id?: number;
  targetId: number;
  checkinAt: string;
  success: boolean;
  quota?: string;
  error?: string;
}

// --- Liveness Types ---

/** Health status of a model: online, offline, or slow */
export type HealthStatus = 'online' | 'offline' | 'slow';

/** Frequency for liveness checks */
export type CheckFrequency = '30m' | '1h' | '6h' | '24h';

/** Configuration for a model liveness check task */
export interface LivenessConfig {
  id?: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  userId?: string;
  models: string[];
  frequency: CheckFrequency;
  enabled: boolean;
  createdAt: string;
}

/** Result of a single model liveness check */
export interface LivenessResult {
  id?: number;
  configId: number;
  modelId: string;
  checkedAt: string;
  status: HealthStatus;
  responseTimeMs?: number;
  error?: string;
}

// --- Frontend State Model ---

/** Root application state for React Context */
export interface AppState {
  connection: {
    settings: ConnectionSettings | null;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    error?: string;
  };
  currentRatios: {
    data: RatioConfig | null;
    loading: boolean;
    error?: string;
  };
  upstreamPrices: {
    results: ProviderPriceResult[];
    loading: boolean;
    lastFetchedAt?: string;
    fromCache: boolean;
  };
  comparison: {
    rows: ComparisonRow[];
    filters: {
      provider?: string;
      status?: ComparisonRow['status'];
      searchText?: string;
    };
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
  update: {
    selectedModelIds: Set<string>;
    status: 'idle' | 'previewing' | 'updating' | 'done' | 'error';
    results?: UpdateResult[];
  };
  priceHistory: {
    entries: PriceHistoryEntry[];
    loading: boolean;
    error?: string;
  };
  updateLogs: {
    logs: UpdateLogEntry[];
    loading: boolean;
    error?: string;
  };
  channels: {
    list: Channel[];
    comparisons: ChannelPriceComparison[];
    loading: boolean;
    error?: string;
    selectedChannelId?: number;
    selectedModelId?: string;
  };
  channelSources: {
    sources: ChannelSource[];
    loading: boolean;
    error?: string;
  };
  checkin: {
    targets: CheckinTarget[];
    records: Map<number, CheckinRecord[]>;
    loading: boolean;
    error?: string;
  };
  liveness: {
    configs: LivenessConfig[];
    latestResults: Map<number, LivenessResult[]>;
    loading: boolean;
    error?: string;
  };
}

/** Result of a single model update attempt */
export interface UpdateResult {
  modelId: string;
  success: boolean;
  error?: string;
}


// --- Channel Priority Types ---

/** 渠道费率配置 */
export interface ChannelPriceRateConfig {
  channelId: number;
  channelName: string;
  priceRate: number;       // 1 元 = X 美金
  createdAt: string;
  updatedAt: string;
}

/** 渠道源费率配置 */
export interface ChannelSourcePriceRateConfig {
  sourceId: number;
  sourceName: string;
  priceRate: number;       // 1 元 = X 美金
  createdAt: string;
  updatedAt: string;
}

/** 优先级规则 */
export interface PriorityRule {
  startValue: number;      // 默认 100
  step: number;            // 默认 10
}

/** 模型组中的单个渠道条目 */
export interface ModelGroupEntry {
  channelId: number;
  channelName: string;
  modelId: string;
  modelRatio: number;
  priceRate: number;
  effectiveUnitCost: number;
  currentPriority: number;
}

/** 单个渠道的优先级分配结果 */
export interface PriorityAssignment {
  channelId: number;
  channelName: string;
  modelId: string;
  effectiveUnitCost: number;
  assignedPriority: number;
}

/** 汇总后的渠道优先级结果 */
export interface ChannelPriorityResult {
  channelId: number;
  channelName: string;
  oldPriority: number;
  newPriority: number;
  priceRate: number;
  modelDetails: {
    modelId: string;
    modelRatio: number;
    effectiveUnitCost: number;
    assignedPriority: number;
  }[];
  changed: boolean;        // newPriority !== oldPriority
}

/** 完整计算结果 */
export interface PriorityCalculationResult {
  channels: ChannelPriorityResult[];
  totalChannels: number;
  changedChannels: number;
  skippedChannels: number;  // 未配置费率的渠道数
  calculatedAt: string;
}

/** 应用结果 */
export interface ApplyResult {
  success: boolean;
  results: {
    channelId: number;
    channelName: string;
    success: boolean;
    error?: string;
  }[];
  totalSuccess: number;
  totalFailed: number;
}

/** 优先级调整日志 */
export interface PriorityAdjustmentLog {
  id: number;
  adjustedAt: string;
  triggerType: 'manual' | 'scheduled';
  hasChanges: boolean;
  details: ChannelPriorityResult[];
}

/** 定时调配配置 */
export interface PriorityScheduleConfig {
  enabled: boolean;
  frequency: '1h' | '6h' | '12h' | '24h';
}

/** 调度器状态 */
export interface SchedulerStatus {
  enabled: boolean;
  frequency: string;
  lastRunAt?: string;
  lastRunResult?: string;
  nextRunAt?: string;
}

// --- Channel Source Ratio Cache Types ---

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

// --- Channel Split Types ---

/** 父渠道处理方式 */
export type ParentChannelAction = 'disable' | 'keep' | 'delete';

/** 子渠道预览信息 */
export interface SubChannelPreview {
  name: string;
  modelId: string;
  parentChannelId: number;
  parentChannelName: string;
  config: Omit<Channel, 'id'>;
  suggestedPriority?: number;
  nameConflict: boolean;
  originalName?: string;
}

/** 拆分预览结果 */
export interface SplitPreview {
  parentChannels: {
    id: number;
    name: string;
    modelCount: number;
    subChannelCount: number;
  }[];
  subChannels: SubChannelPreview[];
  totalSubChannels: number;
  nameConflicts: number;
  validationErrors: string[];
}

/** 拆分执行选项 */
export interface SplitExecutionOptions {
  parentAction: ParentChannelAction;
  autoPriority: boolean;
  operator?: string;
}

/** 拆分执行结果 */
export interface SplitExecutionResult {
  success: boolean;
  createdSubChannels: {
    id: number;
    name: string;
    modelId: string;
    success: boolean;
    error?: string;
  }[];
  priorityUpdateResults?: {
    channelId: number;
    success: boolean;
    error?: string;
  }[];
  parentChannelResults: {
    channelId: number;
    action: ParentChannelAction;
    success: boolean;
    error?: string;
  }[];
  totalSuccess: number;
  totalFailed: number;
  historyId: number;
}

/** 拆分历史条目 */
export interface SplitHistoryEntry {
  id: number;
  splitAt: string;
  operator?: string;
  parentChannelId: number;
  parentChannelName: string;
  parentChannelConfig: Channel;
  subChannelIds: number[];
  modelFilter?: string[];
  parentAction: ParentChannelAction;
  autoPriorityEnabled: boolean;
  rollbackAt?: string;
  rollbackStatus?: 'success' | 'partial' | 'failed';
}

/** 回滚结果 */
export interface RollbackResult {
  success: boolean;
  deletedSubChannels: {
    id: number;
    name: string;
    success: boolean;
    error?: string;
  }[];
  parentChannelRestored: boolean;
  parentChannelError?: string;
  totalSuccess: number;
  totalFailed: number;
}

/** 智能拆分建议 */
export interface SplitSuggestion {
  channelId: number;
  channelName: string;
  modelCount: number;
  suggestedModels: string[];
  estimatedCostSaving: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

/** 拆分配置 */
export interface SplitConfiguration {
  id?: number;
  name: string;
  description?: string;
  modelFilter?: string[];
  namingPattern: string;
  parentAction: ParentChannelAction;
  autoPriority: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 模型分组信息 */
export interface ModelGroupInfo {
  modelId: string;
  channelCount: number;
  splitChannelCount: number;
  channels: {
    id: number;
    name: string;
    priority: number;
    isSplitChannel: boolean;
    parentChannelId?: number;
    parentChannelName?: string;
    priceRate?: number;
    effectiveUnitCost?: number;
  }[];
  averagePriority: number;
  lowestCostChannelId?: number;
}

/** 批量删除结果 */
export interface BatchDeleteResult {
  success: boolean;
  deletedChannels: {
    id: number;
    name: string;
    success: boolean;
    error?: string;
  }[];
  totalSuccess: number;
  totalFailed: number;
}

/** 批量优先级更新结果 */
export interface BatchPriorityUpdateResult {
  success: boolean;
  updatedChannels: {
    id: number;
    name: string;
    oldPriority: number;
    newPriority: number;
    success: boolean;
    error?: string;
  }[];
  totalSuccess: number;
  totalFailed: number;
}

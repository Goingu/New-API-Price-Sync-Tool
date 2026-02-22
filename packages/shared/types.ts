// ============================================================
// Shared type definitions for New API Price Sync Tool
// ============================================================

// --- Core Price & Ratio Types ---

/** Model pricing data from upstream providers (USD/1M tokens) */
export interface ModelPrice {
  modelId: string;
  modelName: string;
  provider: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

/** Converted ratio result for a model */
export interface RatioResult {
  modelId: string;
  provider?: string; // Provider name (e.g., "OpenAI", "Anthropic")
  modelRatio: number;
  completionRatio: number;
}

/** New API ratio configuration (from /api/ratio_config) */
export interface RatioConfig {
  modelRatio: Record<string, number>;
  completionRatio: Record<string, number>;
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
  ratioDiffPercent?: number;
  status: 'unchanged' | 'increased' | 'decreased' | 'new' | 'removed';
  selected: boolean;
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
  oldModelRatio: number;
  newModelRatio: number;
  oldCompletionRatio: number;
  newCompletionRatio: number;
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

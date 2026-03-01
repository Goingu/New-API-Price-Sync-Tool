import axios from 'axios';
import type {
  ConnectionSettings,
  ProxyResponse,
  ProviderPriceResult,
  PriceHistoryEntry,
  UpdateLogEntry,
  Channel,
  ModelPrice,
  ChannelPriceComparison,
  CheckinTarget,
  CheckinRecord,
  LivenessConfig,
  LivenessResult,
  ChannelSource,
  ChannelPriceRateConfig,
  ChannelSourcePriceRateConfig,
  PriorityRule,
  ChannelPriorityResult,
  PriorityCalculationResult,
  ApplyResult,
  PriorityScheduleConfig,
  SchedulerStatus,
  RatioConfig,
  PriorityAdjustmentLog,
  SplitPreview,
  SplitExecutionOptions,
  SplitExecutionResult,
  SplitHistoryEntry,
  RollbackResult,
  SplitSuggestion,
  SplitConfiguration,
} from '@newapi-sync/shared';

/**
 * API client for the New API Price Sync backend.
 *
 * In development, Vite proxies /api/* to the backend server.
 * The baseURL can be overridden for production or custom setups.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

/** Forward a request to the user's New API instance via the backend proxy. */
export async function proxyForward<T = unknown>(
  settings: ConnectionSettings,
  method: string,
  path: string,
  body?: unknown,
): Promise<ProxyResponse<T>> {
  const { data } = await api.post<ProxyResponse<T>>('/api/proxy/forward', {
    targetUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    userId: settings.userId,
    method,
    path,
    body,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

interface FetchPricesResponse {
  success: boolean;
  fromCache: boolean;
  cachedAt?: string;
  results: ProviderPriceResult[];
}

/** Fetch prices from all providers. If forceRefresh, invalidate cache first. */
export async function fetchPrices(forceRefresh?: boolean): Promise<FetchPricesResponse> {
  if (forceRefresh) {
    await api.post('/api/prices/invalidate-cache');
  }
  const { data } = await api.post<FetchPricesResponse>('/api/prices/fetch');
  return data;
}

/** Fetch prices for a single provider. */
export async function fetchProviderPrices(
  provider: string,
): Promise<{ success: boolean; result: ProviderPriceResult }> {
  const { data } = await api.post<{ success: boolean; result: ProviderPriceResult }>(
    `/api/prices/fetch/${encodeURIComponent(provider)}`,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Price History
// ---------------------------------------------------------------------------

interface PriceHistoryResponse {
  success: boolean;
  entries: PriceHistoryEntry[];
}

/** Get price history. Optionally filter by modelId. */
export async function fetchPriceHistory(modelId?: string): Promise<PriceHistoryResponse> {
  const url = modelId
    ? `/api/prices/history/${encodeURIComponent(modelId)}`
    : '/api/prices/history';
  const { data } = await api.get<PriceHistoryResponse>(url);
  return data;
}

// ---------------------------------------------------------------------------
// Update Logs
// ---------------------------------------------------------------------------

interface UpdateLogsResponse {
  success: boolean;
  logs: UpdateLogEntry[];
}

/** Get update logs. Optionally limit the number of results. */
export async function fetchUpdateLogs(limit?: number): Promise<UpdateLogsResponse> {
  const params = limit !== undefined ? { limit } : undefined;
  const { data } = await api.get<UpdateLogsResponse>('/api/logs/updates', { params });
  return data;
}

/** Save a new update log entry. */
export async function saveUpdateLog(log: UpdateLogEntry): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>('/api/logs/updates', log);
  return data;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Fetch channel list from the user's New API instance via proxy. */
export async function fetchChannels(
  settings: ConnectionSettings,
): Promise<ProxyResponse<Channel[]>> {
  const { data } = await api.post<ProxyResponse<Channel[]>>('/api/proxy/channels', {
    targetUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    userId: settings.userId,
  });
  return data;
}

/** Compare channel prices against upstream prices. */
export async function compareChannels(
  channels: Channel[],
  upstreamPrices: ModelPrice[],
): Promise<{ success: boolean; comparisons: ChannelPriceComparison[] }> {
  const { data } = await api.post<{
    success: boolean;
    comparisons: ChannelPriceComparison[];
  }>('/api/channels/compare', { channels, upstreamPrices });
  return data;
}

// ---------------------------------------------------------------------------
// Data Management
// ---------------------------------------------------------------------------

/** Clear all backend data (price history, update logs, cache). */
export async function clearAllData(): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>('/api/data/clear');
  return data;
}

// ---------------------------------------------------------------------------
// Checkin
// ---------------------------------------------------------------------------

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export async function getCheckinTargets(): Promise<ApiResponse<CheckinTarget[]>> {
  const { data } = await api.get<ApiResponse<CheckinTarget[]>>('/api/checkin/targets');
  return data;
}

export async function addCheckinTarget(target: Omit<CheckinTarget, 'id' | 'createdAt'>): Promise<ApiResponse<CheckinTarget>> {
  const { data } = await api.post<ApiResponse<CheckinTarget>>('/api/checkin/targets', target);
  return data;
}

export async function updateCheckinTarget(id: number, updates: Partial<CheckinTarget>): Promise<ApiResponse<CheckinTarget>> {
  const { data } = await api.put<ApiResponse<CheckinTarget>>(`/api/checkin/targets/${id}`, updates);
  return data;
}

export async function deleteCheckinTarget(id: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/checkin/targets/${id}`);
  return data;
}

export async function executeCheckin(targetId: number): Promise<ApiResponse<CheckinRecord>> {
  const { data } = await api.post<ApiResponse<CheckinRecord>>(`/api/checkin/execute/${targetId}`);
  return data;
}

export async function executeCheckinAll(): Promise<ApiResponse<CheckinRecord[]>> {
  const { data } = await api.post<ApiResponse<CheckinRecord[]>>('/api/checkin/execute-all');
  return data;
}

export async function getCheckinRecords(targetId?: number, limit?: number): Promise<ApiResponse<CheckinRecord[]>> {
  const params: Record<string, unknown> = {};
  if (targetId !== undefined) params.targetId = targetId;
  if (limit !== undefined) params.limit = limit;
  const { data } = await api.get<ApiResponse<CheckinRecord[]>>('/api/checkin/records', { params });
  return data;
}

export async function getLatestCheckinRecord(targetId: number): Promise<ApiResponse<CheckinRecord | null>> {
  const { data } = await api.get<ApiResponse<CheckinRecord | null>>(`/api/checkin/records/${targetId}/latest`);
  return data;
}

// ---------------------------------------------------------------------------
// Liveness
// ---------------------------------------------------------------------------

export async function getLivenessConfigs(): Promise<ApiResponse<LivenessConfig[]>> {
  const { data } = await api.get<ApiResponse<LivenessConfig[]>>('/api/liveness/configs');
  return data;
}

export async function addLivenessConfig(config: Omit<LivenessConfig, 'id' | 'createdAt'>): Promise<ApiResponse<LivenessConfig>> {
  const { data } = await api.post<ApiResponse<LivenessConfig>>('/api/liveness/configs', config);
  return data;
}

export async function updateLivenessConfig(id: number, updates: Partial<LivenessConfig>): Promise<ApiResponse<LivenessConfig>> {
  const { data } = await api.put<ApiResponse<LivenessConfig>>(`/api/liveness/configs/${id}`, updates);
  return data;
}

export async function deleteLivenessConfig(id: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/liveness/configs/${id}`);
  return data;
}

export async function checkModel(configId: number, modelId: string): Promise<ApiResponse<LivenessResult>> {
  const { data } = await api.post<ApiResponse<LivenessResult>>(`/api/liveness/check/${configId}/${encodeURIComponent(modelId)}`);
  return data;
}

export async function checkAllModels(configId: number): Promise<ApiResponse<LivenessResult[]>> {
  const { data } = await api.post<ApiResponse<LivenessResult[]>>(`/api/liveness/check/${configId}`);
  return data;
}

export async function checkAllConfigs(): Promise<ApiResponse<LivenessResult[]>> {
  const { data } = await api.post<ApiResponse<LivenessResult[]>>('/api/liveness/check-all');
  return data;
}

export async function getLivenessResults(options?: { configId?: number; modelId?: string; limit?: number }): Promise<ApiResponse<LivenessResult[]>> {
  const { data } = await api.get<ApiResponse<LivenessResult[]>>('/api/liveness/results', { params: options });
  return data;
}

export async function getLatestLivenessResults(configId: number): Promise<ApiResponse<LivenessResult[]>> {
  const { data } = await api.get<ApiResponse<LivenessResult[]>>(`/api/liveness/results/${configId}/latest`);
  return data;
}

// ---------------------------------------------------------------------------
// Channel Sources
// ---------------------------------------------------------------------------

export async function getChannelSources(): Promise<{ success: boolean; sources: ChannelSource[] }> {
  const { data } = await api.get<{ success: boolean; sources: ChannelSource[] }>('/api/channel-sources');
  return data;
}

export async function addChannelSource(source: Omit<ChannelSource, 'id' | 'createdAt'>): Promise<{ success: boolean; source: ChannelSource }> {
  const { data } = await api.post<{ success: boolean; source: ChannelSource }>('/api/channel-sources', source);
  return data;
}

export async function updateChannelSource(id: number, updates: Partial<ChannelSource>): Promise<{ success: boolean; source: ChannelSource }> {
  const { data } = await api.put<{ success: boolean; source: ChannelSource }>(`/api/channel-sources/${id}`, updates);
  return data;
}

export async function deleteChannelSource(id: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/channel-sources/${id}`);
  return data;
}

export interface ImportCandidate {
  baseUrl: string;
  key: string;
  suggestedName: string;
  channelNames: string[];
  channelCount: number;
  alreadyExists: boolean;
}

export async function getImportCandidates(settings: ConnectionSettings): Promise<{ success: boolean; candidates: ImportCandidate[] }> {
  const { data } = await api.post<{ success: boolean; candidates: ImportCandidate[] }>('/api/channel-sources/import-candidates', {
    targetUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    userId: settings.userId,
  });
  return data;
}

export async function importChannelSourcesBatch(sources: { name: string; baseUrl: string; apiKey: string }[]): Promise<{ success: boolean; imported: number }> {
  const { data } = await api.post<{ success: boolean; imported: number }>('/api/channel-sources/import-batch', { sources });
  return data;
}

export async function getChannelSourceRatios(id: number): Promise<{
  success: boolean;
  sourceId: number;
  sourceName: string;
  ratioConfig: RatioConfig;
  error?: string;
}> {
  const { data } = await api.get(`/api/channel-sources/${id}/ratios`);
  return data;
}

export async function compareChannelSourceRatios(sourceIds: number[]): Promise<{
  success: boolean;
  results: Array<{
    sourceId: number;
    sourceName: string;
    success: boolean;
    ratioConfig?: RatioConfig;
    error?: string;
  }>;
}> {
  const { data } = await api.post('/api/channel-sources/compare-ratios', { sourceIds });
  return data;
}

// ---------------------------------------------------------------------------
// Channel Source Ratio Cache
// ---------------------------------------------------------------------------

export async function getCachedRatios(): Promise<{
  success: boolean;
  cached: Array<{
    id?: number;
    sourceId: number;
    sourceName: string;
    ratioConfig: RatioConfig;
    fetchedAt: string;
    expiresAt: string;
  }>;
  error?: string;
}> {
  const { data } = await api.get('/api/channel-sources/ratios/cache');
  return data;
}

export async function saveCachedRatio(
  sourceId: number,
  sourceName: string,
  ratioConfig: RatioConfig
): Promise<{
  success: boolean;
  cached?: {
    id?: number;
    sourceId: number;
    sourceName: string;
    ratioConfig: RatioConfig;
    fetchedAt: string;
    expiresAt: string;
  };
  error?: string;
}> {
  const { data } = await api.post('/api/channel-sources/ratios/cache', {
    sourceId,
    sourceName,
    ratioConfig,
  });
  return data;
}

export async function deleteCachedRatio(sourceId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  const { data } = await api.delete(`/api/channel-sources/ratios/cache/${sourceId}`);
  return data;
}

export async function clearAllCachedRatios(): Promise<{
  success: boolean;
  deleted: number;
  error?: string;
}> {
  const { data } = await api.delete('/api/channel-sources/ratios/cache');
  return data;
}

// ---------------------------------------------------------------------------
// Channel Priority
// ---------------------------------------------------------------------------

/** 获取所有渠道费率配置 */
export async function getPriceRates(): Promise<ApiResponse<ChannelPriceRateConfig[]>> {
  const { data } = await api.get<ApiResponse<ChannelPriceRateConfig[]>>('/api/priority/price-rates');
  return data;
}

/** 设置/更新渠道费率 */
export async function setPriceRate(channelId: number, channelName: string, rate: number): Promise<{ success: boolean }> {
  const { data } = await api.put<{ success: boolean }>(`/api/priority/price-rates/${channelId}`, { channelName, rate });
  return data;
}

/** 删除渠道费率 */
export async function deletePriceRate(channelId: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/priority/price-rates/${channelId}`);
  return data;
}

// ============================================================================
// Channel Source Price Rates
// ============================================================================

/** 获取所有渠道源费率配置 */
export async function getChannelSourcePriceRates(): Promise<ApiResponse<ChannelSourcePriceRateConfig[]>> {
  const { data } = await api.get<ApiResponse<ChannelSourcePriceRateConfig[]>>('/api/channel-source-rates');
  return data;
}

/** 设置/更新渠道源费率 */
export async function setChannelSourcePriceRate(sourceId: number, sourceName: string, rate: number): Promise<{ success: boolean }> {
  const { data } = await api.put<{ success: boolean }>(`/api/channel-source-rates/${sourceId}`, { sourceName, rate });
  return data;
}

/** 删除渠道源费率 */
export async function deleteChannelSourcePriceRate(sourceId: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/channel-source-rates/${sourceId}`);
  return data;
}

/** 触发优先级计算，返回预览结果 */
export async function calculatePriority(connection: ConnectionSettings): Promise<ApiResponse<PriorityCalculationResult>> {
  const { data } = await api.post<ApiResponse<PriorityCalculationResult>>('/api/priority/calculate', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
  });
  return data;
}

/** 确认应用优先级变更 */
export async function applyPriority(connection: ConnectionSettings, changes: ChannelPriorityResult[]): Promise<ApiResponse<ApplyResult>> {
  const { data } = await api.post<ApiResponse<ApplyResult>>('/api/priority/apply', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
    changes,
  });
  return data;
}

/** 获取优先级规则 */
export async function getRule(): Promise<ApiResponse<PriorityRule>> {
  const { data } = await api.get<ApiResponse<PriorityRule>>('/api/priority/rule');
  return data;
}

/** 更新优先级规则 */
export async function setRule(rule: PriorityRule): Promise<{ success: boolean }> {
  const { data } = await api.put<{ success: boolean }>('/api/priority/rule', rule);
  return data;
}

/** 获取自动模式状态 */
export async function getAutoMode(): Promise<ApiResponse<{ enabled: boolean }>> {
  const { data } = await api.get<ApiResponse<{ enabled: boolean }>>('/api/priority/auto-mode');
  return data;
}

/** 设置自动模式状态 */
export async function setAutoMode(enabled: boolean): Promise<{ success: boolean }> {
  const { data } = await api.put<{ success: boolean }>('/api/priority/auto-mode', { enabled });
  return data;
}

/** 获取定时调配配置 */
export async function getScheduleConfig(): Promise<ApiResponse<PriorityScheduleConfig>> {
  const { data } = await api.get<ApiResponse<PriorityScheduleConfig>>('/api/priority/schedule');
  return data;
}

/** 更新定时调配配置 */
export async function setScheduleConfig(config: PriorityScheduleConfig): Promise<{ success: boolean }> {
  const { data } = await api.put<{ success: boolean }>('/api/priority/schedule', config);
  return data;
}

/** 获取定时任务状态 */
export async function getScheduleStatus(): Promise<ApiResponse<SchedulerStatus>> {
  const { data } = await api.get<ApiResponse<SchedulerStatus>>('/api/priority/schedule/status');
  return data;
}

/** 获取调整日志列表 */
export async function getAdjustmentLogs(limit?: number): Promise<ApiResponse<PriorityAdjustmentLog[]>> {
  const params = limit !== undefined ? { limit } : undefined;
  const { data } = await api.get<ApiResponse<PriorityAdjustmentLog[]>>('/api/priority/logs', { params });
  return data;
}

/** 获取单条调整日志详情 */
export async function getAdjustmentLogById(id: number): Promise<ApiResponse<PriorityAdjustmentLog>> {
  const { data } = await api.get<ApiResponse<PriorityAdjustmentLog>>(`/api/priority/logs/${id}`);
  return data;
}

// ---------------------------------------------------------------------------
// Connection Settings
// ---------------------------------------------------------------------------

/** Get connection settings from database */
export async function getConnectionSettings(): Promise<ApiResponse<ConnectionSettings | null>> {
  const { data } = await api.get<ApiResponse<ConnectionSettings | null>>('/api/settings/connection');
  return data;
}

/** Save connection settings to database */
export async function saveConnectionSettings(settings: ConnectionSettings): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>('/api/settings/connection', settings);
  return data;
}

/** Delete connection settings from database */
export async function deleteConnectionSettings(): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>('/api/settings/connection');
  return data;
}

// ---------------------------------------------------------------------------
// Channel Split
// ---------------------------------------------------------------------------

/** 生成拆分预览 */
export async function previewSplit(
  connection: ConnectionSettings,
  channelIds: number[],
  modelFilters?: Record<number, string[]>
): Promise<ApiResponse<SplitPreview>> {
  const { data } = await api.post<ApiResponse<SplitPreview>>('/api/channel-split/preview', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
    channelIds,
    modelFilters,
  });
  return data;
}

/** 执行拆分操作 */
export async function executeSplit(
  connection: ConnectionSettings,
  preview: SplitPreview,
  options: SplitExecutionOptions
): Promise<ApiResponse<SplitExecutionResult>> {
  const { data } = await api.post<ApiResponse<SplitExecutionResult>>('/api/channel-split/execute', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
    preview,
    options,
  });
  return data;
}

/** 获取拆分历史列表 */
export async function getSplitHistory(options?: {
  limit?: number;
  parentChannelId?: number;
}): Promise<ApiResponse<SplitHistoryEntry[]>> {
  const { data } = await api.get<ApiResponse<SplitHistoryEntry[]>>('/api/channel-split/history', {
    params: options,
  });
  return data;
}

/** 获取单条拆分历史详情 */
export async function getSplitHistoryById(id: number): Promise<ApiResponse<SplitHistoryEntry>> {
  const { data } = await api.get<ApiResponse<SplitHistoryEntry>>(`/api/channel-split/history/${id}`);
  return data;
}

/** 回滚拆分操作 */
export async function rollbackSplit(
  connection: ConnectionSettings,
  historyId: number
): Promise<ApiResponse<RollbackResult>> {
  const { data } = await api.post<ApiResponse<RollbackResult>>(`/api/channel-split/rollback/${historyId}`, {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
  });
  return data;
}

/** 获取智能拆分建议 */
export async function getSplitSuggestions(
  connection: ConnectionSettings
): Promise<ApiResponse<SplitSuggestion[]>> {
  const { data } = await api.get<ApiResponse<SplitSuggestion[]>>('/api/channel-split/suggestions', {
    params: {
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      userId: connection.userId,
    },
  });
  return data;
}

/** 获取拆分配置列表 */
export async function getSplitConfigs(): Promise<ApiResponse<SplitConfiguration[]>> {
  const { data } = await api.get<ApiResponse<SplitConfiguration[]>>('/api/channel-split/configs');
  return data;
}

/** 保存拆分配置 */
export async function saveSplitConfig(config: SplitConfiguration): Promise<ApiResponse<SplitConfiguration>> {
  const { data } = await api.post<ApiResponse<SplitConfiguration>>('/api/channel-split/configs', config);
  return data;
}

/** 删除拆分配置 */
export async function deleteSplitConfig(id: number): Promise<{ success: boolean }> {
  const { data } = await api.delete<{ success: boolean }>(`/api/channel-split/configs/${id}`);
  return data;
}

// ---------------------------------------------------------------------------
// Model Groups
// ---------------------------------------------------------------------------

/** 批量删除渠道 */
export async function batchDeleteChannels(
  connection: ConnectionSettings,
  channelIds: number[]
): Promise<ApiResponse<{
  results: { channelId: number; success: boolean; error?: string }[];
  totalSuccess: number;
  totalFailed: number;
}>> {
  const { data } = await api.post('/api/model-groups/batch-delete', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
    channelIds,
  });
  return data;
}

/** 批量更新优先级 */
export async function batchUpdatePriority(
  connection: ConnectionSettings,
  updates: { channelId: number; priority: number }[]
): Promise<ApiResponse<{
  results: { channelId: number; priority: number; success: boolean; error?: string }[];
  totalSuccess: number;
  totalFailed: number;
}>> {
  const { data } = await api.post('/api/model-groups/batch-update-priority', {
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    userId: connection.userId,
    updates,
  });
  return data;
}

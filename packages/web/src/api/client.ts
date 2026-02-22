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

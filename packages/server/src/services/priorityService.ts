import axios from 'axios';
import type {
  ConnectionSettings,
  Channel,
  RatioConfig,
  ChannelPriceRateConfig,
  PriorityRule,
  ChannelPriorityResult,
  PriorityCalculationResult,
  ApplyResult,
  PriorityAdjustmentLog,
  PriorityScheduleConfig,
} from '@newapi-sync/shared';
import type { SQLiteStore } from './sqliteStore.js';
import { calculatePriorities } from './priorityEngine.js';

/**
 * Fetch the channel list from a New API instance.
 */
async function fetchChannels(connection: ConnectionSettings): Promise<Channel[]> {
  const apiBaseUrl = connection.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  let channels: Channel[] = [];
  
  try {
    // Try with large page_size to get all channels
    const url = `${apiBaseUrl}/api/channel/?p=0&page_size=500`;
    const { data } = await axios.get(url, { headers, timeout: 30_000 });

    if (Array.isArray(data)) {
      channels = data;
    } else if (data?.data) {
      if (Array.isArray(data.data)) {
        channels = data.data;
      } else if (data.data?.data && Array.isArray(data.data.data)) {
        channels = data.data.data;
      } else if (data.data?.items && Array.isArray(data.data.items)) {
        channels = data.data.items;
      }
    }
  } catch {
    // Fallback: no pagination
    const url = `${apiBaseUrl}/api/channel/`;
    const { data } = await axios.get(url, { headers, timeout: 30_000 });

    if (Array.isArray(data)) {
      channels = data;
    } else if (data?.data) {
      if (Array.isArray(data.data)) {
        channels = data.data;
      } else if (data.data?.data && Array.isArray(data.data.data)) {
        channels = data.data.data;
      } else if (data.data?.items && Array.isArray(data.data.items)) {
        channels = data.data.items;
      }
    }
  }

  console.log(`[PriorityService] fetchChannels: got ${channels.length} channels total`);
  return channels;
}

/**
 * Fetch ratio configuration from a New API instance.
 */
async function fetchRatioConfig(connection: ConnectionSettings): Promise<RatioConfig> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/ratio_config`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  const { data } = await axios.get(url, { headers, timeout: 30_000 });

  let ratioConfig: RatioConfig;
  if (data?.data) {
    const apiData = data.data;
    ratioConfig = {
      modelRatio: apiData.model_ratio || apiData.modelRatio || {},
      completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
    };
  } else {
    ratioConfig = {
      modelRatio: data.model_ratio || data.modelRatio || {},
      completionRatio: data.completion_ratio || data.completionRatio || {},
    };
  }

  console.log(`[PriorityService] fetchRatioConfig: ${Object.keys(ratioConfig.modelRatio).length} model ratios`);
  return ratioConfig;
}

/**
 * Update a single channel's priority on a New API instance.
 */
async function updateChannelPriority(
  connection: ConnectionSettings,
  channelId: number,
  priority: number,
): Promise<void> {
  const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/channel/`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (connection.userId) {
    headers['New-Api-User'] = connection.userId;
  }

  await axios.put(url, { id: channelId, priority }, { headers, timeout: 30_000 });
}

/**
 * PriorityService coordinates PriorityEngine, SQLiteStore, and New API interactions
 * for channel priority management.
 */
export class PriorityService {
  constructor(private store: SQLiteStore) {}

  // ─── Price Rate CRUD (delegate to SQLiteStore) ──────────────────────

  getPriceRates(): ChannelPriceRateConfig[] {
    return this.store.getPriceRates();
  }

  setPriceRate(channelId: number, channelName: string, priceRate: number): void {
    this.store.setPriceRate(channelId, channelName, priceRate);
  }

  deletePriceRate(channelId: number): void {
    this.store.deletePriceRate(channelId);
  }

  // ─── Priority Calculation ───────────────────────────────────────────

  /**
   * Execute priority calculation: fetch channels and ratio config from New API,
   * read price rates and rule from SQLiteStore, run PriorityEngine, return preview.
   */
  async calculate(connection: ConnectionSettings): Promise<PriorityCalculationResult> {
    const [channels, ratioConfig] = await Promise.all([
      fetchChannels(connection),
      fetchRatioConfig(connection),
    ]);

    console.log(`[PriorityService] calculate: ${channels.length} channels, ${Object.keys(ratioConfig.modelRatio).length} model ratios`);

    const priceRates = new Map<number, number>();
    for (const rate of this.store.getPriceRates()) {
      priceRates.set(rate.channelId, rate.priceRate);
    }
    console.log(`[PriorityService] calculate: ${priceRates.size} price rates configured`);

    const rule = this.store.getRule();

    const result = calculatePriorities(channels, ratioConfig, priceRates, rule);
    console.log(`[PriorityService] calculate result: ${result.totalChannels} total, ${result.changedChannels} changed, ${result.skippedChannels} skipped`);
    return result;
  }

  // ─── Apply Changes ──────────────────────────────────────────────────

  /**
   * Apply priority changes to New API. Iterates through changes, calls PUT for
   * each channel that has changed, collects success/failure results, and saves
   * an adjustment log.
   */
  async apply(
    connection: ConnectionSettings,
    changes: ChannelPriorityResult[],
    triggerType: 'manual' | 'scheduled' = 'manual',
  ): Promise<ApplyResult> {
    const changedItems = changes.filter((c) => c.changed);

    const results: ApplyResult['results'] = [];

    for (const change of changedItems) {
      try {
        await updateChannelPriority(connection, change.channelId, change.newPriority);
        results.push({
          channelId: change.channelId,
          channelName: change.channelName,
          success: true,
        });
      } catch (error) {
        results.push({
          channelId: change.channelId,
          channelName: change.channelName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalSuccess = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;

    // Save adjustment log
    this.store.saveAdjustmentLog({
      adjustedAt: new Date().toISOString(),
      triggerType,
      hasChanges: changedItems.length > 0,
      details: changes,
    });

    return {
      success: totalFailed === 0,
      results,
      totalSuccess,
      totalFailed,
    };
  }

  // ─── Rule & Settings (delegate to SQLiteStore) ──────────────────────

  getRule(): PriorityRule {
    return this.store.getRule();
  }

  setRule(rule: PriorityRule): void {
    this.store.setRule(rule);
  }

  getAutoMode(): boolean {
    return this.store.getAutoMode();
  }

  setAutoMode(enabled: boolean): void {
    this.store.setAutoMode(enabled);
  }

  // ─── Schedule Config (delegate to SQLiteStore) ──────────────────────

  getScheduleConfig(): PriorityScheduleConfig {
    return this.store.getScheduleConfig();
  }

  setScheduleConfig(config: PriorityScheduleConfig): void {
    this.store.setScheduleConfig(config);
  }

  // ─── Adjustment Logs (delegate to SQLiteStore) ─────────────────────

  getLogs(limit?: number): PriorityAdjustmentLog[] {
    return this.store.getAdjustmentLogs(limit);
  }

  getLogById(id: number): PriorityAdjustmentLog | null {
    return this.store.getAdjustmentLogById(id);
  }
}

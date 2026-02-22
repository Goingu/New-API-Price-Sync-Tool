import axios from 'axios';
import type { HealthStatus, LivenessResult } from '@newapi-sync/shared';
import type { SQLiteStore } from './sqliteStore.js';

/**
 * Service responsible for checking model liveness by sending test
 * requests to configured New API instances and recording the results.
 */
export class LivenessService {
  constructor(private store: SQLiteStore) {}

  /**
   * Determine the health status of a model based on the check outcome.
   *
   * - success && responseTimeMs <= 30000 → 'online'
   * - success && responseTimeMs > 30000  → 'slow'
   * - !success                           → 'offline'
   */
  determineStatus(
    responseTimeMs: number | null,
    success: boolean,
    _error?: string,
  ): HealthStatus {
    if (!success) return 'offline';
    if (responseTimeMs !== null && responseTimeMs > 30_000) return 'slow';
    return 'online';
  }

  /**
   * Check a single model's liveness by sending a minimal chat completion
   * request and recording the result.
   */
  async checkModel(configId: number, modelId: string): Promise<LivenessResult> {
    const config = this.store.getLivenessConfigById(configId);
    if (!config) {
      throw new Error(`Liveness config not found: ${configId}`);
    }

    const checkedAt = new Date().toISOString();
    const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

    const start = Date.now();
    try {
      await axios.post(
        url,
        {
          model: modelId,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      );

      const responseTimeMs = Date.now() - start;
      const status = this.determineStatus(responseTimeMs, true);

      return this.store.saveLivenessResult({
        configId,
        modelId,
        checkedAt,
        status,
        responseTimeMs,
      });
    } catch (err: unknown) {
      const responseTimeMs = Date.now() - start;

      // Distinguish timeout (slow) from other errors (offline)
      const isTimeout =
        axios.isAxiosError(err) && err.code === 'ECONNABORTED';

      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.message ?? err.message
        : err instanceof Error
          ? err.message
          : String(err);

      const status = isTimeout
        ? this.determineStatus(responseTimeMs, true)
        : this.determineStatus(responseTimeMs, false, errorMessage);

      return this.store.saveLivenessResult({
        configId,
        modelId,
        checkedAt,
        status,
        responseTimeMs,
        error: errorMessage,
      });
    }
  }

  /**
   * Check all models defined in a specific liveness config.
   */
  async checkAllModels(configId: number): Promise<LivenessResult[]> {
    const config = this.store.getLivenessConfigById(configId);
    if (!config) {
      throw new Error(`Liveness config not found: ${configId}`);
    }

    const results: LivenessResult[] = [];
    for (const modelId of config.models) {
      const result = await this.checkModel(configId, modelId);
      results.push(result);
    }
    return results;
  }

  /**
   * Check all models across all enabled liveness configs.
   */
  async checkAllConfigs(): Promise<LivenessResult[]> {
    const configs = this.store.getLivenessConfigs().filter((c) => c.enabled);
    const results: LivenessResult[] = [];

    for (const config of configs) {
      const configResults = await this.checkAllModels(config.id!);
      results.push(...configResults);
    }
    return results;
  }
}

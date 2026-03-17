import type { ChannelSource, RatioConfig } from '@newapi-sync/shared';
import type { SQLiteStore } from './sqliteStore.js';
import { calculateEffectiveUnitCost } from './priorityEngine.js';

export interface RouteCandidate {
  source: ChannelSource;
  priceRate: number;
  modelRatio: number;
  effectiveUnitCost: number;
}

export class GatewayService {
  constructor(private store: SQLiteStore) {}

  /** Verify Bearer token against stored gateway_api_key */
  authenticate(token: string): boolean {
    const storedKey = this.store.getGatewaySetting('gateway_api_key');
    return !!storedKey && storedKey === token;
  }

  /** Check if gateway is enabled */
  isEnabled(): boolean {
    return this.store.getGatewaySetting('gateway_enabled') === 'true';
  }

  /**
   * Find channel sources that support the given model, sorted by cost ascending.
   */
  findCandidates(model: string): RouteCandidate[] {
    const sources = this.store.getChannelSources().filter(s => s.enabled && s.channelKey);
    const cachedRatios = this.store.getCachedRatios();
    const priceRates = this.store.getChannelSourcePriceRates();

    const priceRateMap = new Map(priceRates.map(r => [r.sourceId, r.priceRate]));
    const ratioMap = new Map(cachedRatios.map(r => [r.sourceId, r.ratioConfig]));

    const candidates: RouteCandidate[] = [];

    for (const source of sources) {
      const ratioConfig = ratioMap.get(source.id!);
      if (!ratioConfig) continue;

      const modelRatio = ratioConfig.modelRatio[model];
      if (modelRatio === undefined) continue;

      const priceRate = priceRateMap.get(source.id!) ?? 1;
      const effectiveUnitCost = calculateEffectiveUnitCost(modelRatio, priceRate);

      candidates.push({ source, priceRate, modelRatio, effectiveUnitCost });
    }

    candidates.sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost);
    return candidates;
  }

  /** Aggregate all available models across all enabled sources (deduplicated). */
  listAllModels(): Array<{ id: string; sources: number }> {
    const sources = this.store.getChannelSources().filter(s => s.enabled && s.channelKey);
    const cachedRatios = this.store.getCachedRatios();
    const ratioMap = new Map(cachedRatios.map(r => [r.sourceId, r.ratioConfig]));

    const modelSourceCount = new Map<string, number>();

    for (const source of sources) {
      const ratioConfig = ratioMap.get(source.id!);
      if (!ratioConfig) continue;

      for (const modelId of Object.keys(ratioConfig.modelRatio)) {
        modelSourceCount.set(modelId, (modelSourceCount.get(modelId) ?? 0) + 1);
      }
    }

    return Array.from(modelSourceCount.entries())
      .map(([id, sources]) => ({ id, sources }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

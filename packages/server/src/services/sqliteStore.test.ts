import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStore } from './sqliteStore';
import type {
  PriceHistoryEntry,
  UpdateLogEntry,
  CachedPriceData,
  ModelPrice,
} from '@newapi-sync/shared';

describe('SQLiteStore', () => {
  let store: SQLiteStore;

  beforeEach(() => {
    store = new SQLiteStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // --- Helpers ---

  function makeModelPrice(overrides?: Partial<ModelPrice>): ModelPrice {
    return {
      modelId: 'gpt-4o',
      modelName: 'GPT-4o',
      provider: 'openai',
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 10,
      ...overrides,
    };
  }

  function makePriceHistoryEntry(overrides?: Partial<PriceHistoryEntry>): PriceHistoryEntry {
    return {
      fetchedAt: new Date().toISOString(),
      provider: 'openai',
      models: [makeModelPrice()],
      ...overrides,
    };
  }

  function makeUpdateLogEntry(overrides?: Partial<UpdateLogEntry>): UpdateLogEntry {
    return {
      updatedAt: new Date().toISOString(),
      modelsUpdated: [
        {
          modelId: 'gpt-4o',
          oldModelRatio: 3.333333,
          newModelRatio: 3.5,
          oldCompletionRatio: 4,
          newCompletionRatio: 4.2,
        },
      ],
      ...overrides,
    };
  }

  // --- Price History ---

  describe('savePriceHistory / getPriceHistory', () => {
    it('saves and retrieves a price history entry', () => {
      const entry = makePriceHistoryEntry();
      store.savePriceHistory(entry);

      const results = store.getPriceHistory();
      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('openai');
      expect(results[0].fetchedAt).toBe(entry.fetchedAt);
      expect(results[0].models).toEqual(entry.models);
      expect(results[0].id).toBeDefined();
    });

    it('returns entries in descending order by id', () => {
      store.savePriceHistory(makePriceHistoryEntry({ provider: 'openai' }));
      store.savePriceHistory(makePriceHistoryEntry({ provider: 'anthropic' }));

      const results = store.getPriceHistory();
      expect(results[0].provider).toBe('anthropic');
      expect(results[1].provider).toBe('openai');
    });

    it('filters by provider', () => {
      store.savePriceHistory(makePriceHistoryEntry({ provider: 'openai' }));
      store.savePriceHistory(makePriceHistoryEntry({ provider: 'anthropic' }));
      store.savePriceHistory(makePriceHistoryEntry({ provider: 'openai' }));

      const results = store.getPriceHistory({ provider: 'openai' });
      expect(results).toHaveLength(2);
      results.forEach((r) => expect(r.provider).toBe('openai'));
    });

    it('respects limit option', () => {
      for (let i = 0; i < 5; i++) {
        store.savePriceHistory(makePriceHistoryEntry());
      }

      const results = store.getPriceHistory({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('returns empty array when no data', () => {
      expect(store.getPriceHistory()).toEqual([]);
    });
  });

  describe('getPriceHistoryByModel', () => {
    it('filters entries containing the specified model', () => {
      store.savePriceHistory(
        makePriceHistoryEntry({
          models: [
            makeModelPrice({ modelId: 'gpt-4o' }),
            makeModelPrice({ modelId: 'gpt-3.5-turbo' }),
          ],
        })
      );
      store.savePriceHistory(
        makePriceHistoryEntry({
          models: [makeModelPrice({ modelId: 'claude-3-opus' })],
        })
      );

      const results = store.getPriceHistoryByModel('gpt-4o');
      expect(results).toHaveLength(1);
      expect(results[0].models).toHaveLength(1);
      expect(results[0].models[0].modelId).toBe('gpt-4o');
    });

    it('returns empty array when model not found', () => {
      store.savePriceHistory(makePriceHistoryEntry());
      expect(store.getPriceHistoryByModel('nonexistent')).toEqual([]);
    });
  });

  // --- Update Logs ---

  describe('saveUpdateLog / getUpdateLogs', () => {
    it('saves and retrieves an update log', () => {
      const log = makeUpdateLogEntry();
      store.saveUpdateLog(log);

      const results = store.getUpdateLogs();
      expect(results).toHaveLength(1);
      expect(results[0].updatedAt).toBe(log.updatedAt);
      expect(results[0].modelsUpdated).toEqual(log.modelsUpdated);
      expect(results[0].id).toBeDefined();
    });

    it('returns logs in descending order', () => {
      store.saveUpdateLog(makeUpdateLogEntry({ updatedAt: '2024-01-01T00:00:00Z' }));
      store.saveUpdateLog(makeUpdateLogEntry({ updatedAt: '2024-01-02T00:00:00Z' }));

      const results = store.getUpdateLogs();
      expect(results[0].updatedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('respects limit option', () => {
      for (let i = 0; i < 5; i++) {
        store.saveUpdateLog(makeUpdateLogEntry());
      }

      const results = store.getUpdateLogs({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('returns empty array when no logs', () => {
      expect(store.getUpdateLogs()).toEqual([]);
    });
  });

  // --- Price Cache ---

  describe('setCachedPrices / getCachedPrices', () => {
    it('stores and retrieves cached prices', () => {
      const data: CachedPriceData = {
        cachedAt: new Date().toISOString(),
        results: [
          {
            provider: 'openai',
            success: true,
            models: [makeModelPrice()],
            fetchedAt: new Date().toISOString(),
          },
        ],
      };

      store.setCachedPrices(data);
      const cached = store.getCachedPrices();

      expect(cached).not.toBeNull();
      expect(cached!.cachedAt).toBe(data.cachedAt);
      expect(cached!.results).toEqual(data.results);
    });

    it('returns null when no cache exists', () => {
      expect(store.getCachedPrices()).toBeNull();
    });

    it('returns null when cache is expired (> 30 minutes)', () => {
      const expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      store.setCachedPrices({
        cachedAt: expired,
        results: [],
      });

      expect(store.getCachedPrices()).toBeNull();
    });

    it('returns data when cache is within 30 minutes', () => {
      const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      store.setCachedPrices({
        cachedAt: recent,
        results: [],
      });

      expect(store.getCachedPrices()).not.toBeNull();
    });

    it('supports custom maxAgeMinutes', () => {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      store.setCachedPrices({
        cachedAt: fifteenMinAgo,
        results: [],
      });

      // 10 min max → expired
      expect(store.getCachedPrices(10)).toBeNull();
      // 20 min max → still valid
      expect(store.getCachedPrices(20)).not.toBeNull();
    });

    it('overwrites existing cache on second set', () => {
      store.setCachedPrices({ cachedAt: '2024-01-01T00:00:00Z', results: [] });
      store.setCachedPrices({ cachedAt: new Date().toISOString(), results: [] });

      const cached = store.getCachedPrices();
      expect(cached).not.toBeNull();
      expect(cached!.cachedAt).not.toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('invalidateCache', () => {
    it('removes cached data', () => {
      store.setCachedPrices({ cachedAt: new Date().toISOString(), results: [] });
      expect(store.getCachedPrices()).not.toBeNull();

      store.invalidateCache();
      expect(store.getCachedPrices()).toBeNull();
    });

    it('does not throw when no cache exists', () => {
      expect(() => store.invalidateCache()).not.toThrow();
    });
  });

  // --- clearAll ---

  describe('clearAll', () => {
    it('removes all data from all tables', () => {
      store.savePriceHistory(makePriceHistoryEntry());
      store.saveUpdateLog(makeUpdateLogEntry());
      store.setCachedPrices({ cachedAt: new Date().toISOString(), results: [] });

      store.clearAll();

      expect(store.getPriceHistory()).toEqual([]);
      expect(store.getUpdateLogs()).toEqual([]);
      expect(store.getCachedPrices()).toBeNull();
    });
  });
});

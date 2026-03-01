import { Router, type Request, type Response } from 'express';
import type { SQLiteStore } from '../services/sqliteStore.js';
import { fetchAllPrices, fetchProviderPrices } from '../services/priceFetcher.js';
import { convertBatch } from '../services/ratioConverter.js';
import type { CachedPriceData } from '@newapi-sync/shared';

export function createPricesRouter(store: SQLiteStore): Router {
  const router = Router();

  /**
   * POST /api/prices/fetch
   * Check SQLite cache first (30 min). If valid, return cached.
   * Otherwise call fetchAllPrices(), save to cache and price_history, return results.
   */
  router.post('/fetch', async (_req: Request, res: Response) => {
    try {
      // Check cache first
      const cached = store.getCachedPrices(30);
      if (cached) {
        res.json({
          success: true,
          fromCache: true,
          cachedAt: cached.cachedAt,
          results: cached.results,
        });
        return;
      }

      // Fetch fresh data
      const results = await fetchAllPrices();

      // Save to cache
      const cacheData: CachedPriceData = {
        cachedAt: new Date().toISOString(),
        results,
      };
      store.setCachedPrices(cacheData);

      // Save each successful provider result to price_history
      for (const result of results) {
        if (result.success && result.models.length > 0) {
          store.savePriceHistory({
            fetchedAt: result.fetchedAt,
            provider: result.provider,
            models: result.models,
          });
        }
      }

      res.json({
        success: true,
        fromCache: false,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/prices/fetch/:provider
   * Fetch prices for a specific provider.
   */
  router.post('/fetch/:provider', async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider as string;
      const result = await fetchProviderPrices(provider);

      // Save to price_history if successful
      if (result.success && result.models.length > 0) {
        store.savePriceHistory({
          fetchedAt: result.fetchedAt,
          provider: result.provider,
          models: result.models,
        });
      }

      res.json({ success: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/prices/history
   * Get price history from SQLite. Supports ?limit and ?provider query params.
   */
  router.get('/history', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const provider = req.query.provider as string | undefined;

      const entries = store.getPriceHistory({ limit, provider });
      res.json({ success: true, entries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/prices/history/:modelId
   * Get price history for a specific model.
   */
  router.get('/history/:modelId', (req: Request, res: Response) => {
    try {
      const modelId = req.params.modelId as string;
      const entries = store.getPriceHistoryByModel(modelId);
      res.json({ success: true, entries });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/prices/invalidate-cache
   * Invalidate the SQLite price cache.
   */
  router.post('/invalidate-cache', (_req: Request, res: Response) => {
    try {
      store.invalidateCache();
      res.json({ success: true, message: 'Cache invalidated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

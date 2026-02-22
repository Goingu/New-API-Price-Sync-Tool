import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import type { SQLiteStore } from '../services/sqliteStore.js';
import type { ChannelSource, RatioConfig } from '@newapi-sync/shared';

export function createChannelSourcesRouter(store: SQLiteStore): Router {
  const router = Router();

  /**
   * GET /api/channel-sources
   * Get all channel sources.
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const sources = store.getChannelSources();
      res.json({ success: true, sources });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/channel-sources/:id
   * Get a specific channel source by ID.
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const source = store.getChannelSourceById(id);

      if (!source) {
        res.status(404).json({ success: false, error: 'Channel source not found' });
        return;
      }

      res.json({ success: true, source });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/channel-sources
   * Create a new channel source.
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, baseUrl, apiKey, userId, enabled } = req.body as Omit<ChannelSource, 'id' | 'createdAt'>;

      if (!name || !baseUrl || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: name, baseUrl, apiKey',
        });
        return;
      }

      const source = store.addChannelSource({
        name,
        baseUrl,
        apiKey,
        userId,
        enabled: enabled ?? true,
      });

      res.json({ success: true, source });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/channel-sources/:id
   * Update an existing channel source.
   */
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const updates = req.body as Partial<Omit<ChannelSource, 'id' | 'createdAt'>>;

      const source = store.updateChannelSource(id, updates);
      res.json({ success: true, source });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/channel-sources/:id
   * Delete a channel source.
   */
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      store.deleteChannelSource(id);
      res.json({ success: true, message: 'Channel source deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/channel-sources/:id/ratios
   * Fetch ratio configuration from a specific channel source.
   * Falls back to /api/pricing if /api/ratio_config returns 403.
   */
  router.get('/:id/ratios', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const source = store.getChannelSourceById(id);

      if (!source) {
        res.status(404).json({ success: false, error: 'Channel source not found' });
        return;
      }

      if (!source.enabled) {
        res.status(400).json({ success: false, error: 'Channel source is disabled' });
        return;
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${source.apiKey}`,
      };

      if (source.userId) {
        headers['New-Api-User'] = source.userId;
      }

      // Try /api/ratio_config first (requires admin permission)
      try {
        const url = `${source.baseUrl.replace(/\/+$/, '')}/api/ratio_config`;
        const response = await axios.get(url, {
          headers,
          timeout: 30_000,
        });

        // Handle different response formats
        let ratioConfig: RatioConfig;
        if (response.data?.data) {
          const apiData = response.data.data;
          ratioConfig = {
            modelRatio: apiData.model_ratio || apiData.modelRatio || {},
            completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
          };
        } else {
          ratioConfig = {
            modelRatio: response.data.model_ratio || response.data.modelRatio || {},
            completionRatio: response.data.completion_ratio || response.data.completionRatio || {},
          };
        }

        res.json({
          success: true,
          sourceId: id,
          sourceName: source.name,
          ratioConfig,
          method: 'ratio_config',
        });
        return;
      } catch (error) {
        // If 403, try /api/pricing as fallback
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          console.log(`Falling back to /api/pricing for source ${source.name}`);
        } else {
          throw error; // Re-throw other errors
        }
      }

      // Fallback: Use /api/pricing (public endpoint)
      const pricingUrl = `${source.baseUrl.replace(/\/+$/, '')}/api/pricing`;
      const pricingResponse = await axios.get(pricingUrl, {
        headers,
        timeout: 30_000,
      });

      // Parse pricing data and convert to ratios
      const BASE_INPUT_PRICE = 0.75;
      const modelRatio: Record<string, number> = {};
      const completionRatio: Record<string, number> = {};

      let pricingData: any[] = [];

      if (Array.isArray(pricingResponse.data)) {
        pricingData = pricingResponse.data;
      } else if (pricingResponse.data?.data && Array.isArray(pricingResponse.data.data)) {
        pricingData = pricingResponse.data.data;
      }

      console.log(`[${source.name}] Pricing data count:`, pricingData.length);
      if (pricingData.length > 0) {
        console.log(`[${source.name}] Sample pricing item:`, JSON.stringify(pricingData[0], null, 2));
      }

      for (const item of pricingData) {
        const modelName = item.model_name || item.modelName || item.model;

        // Check if this API returns ratios directly (model_ratio field exists)
        if (item.model_ratio !== undefined) {
          // This API returns ratios directly, not prices
          if (!modelName || item.model_ratio === undefined) continue;

          modelRatio[modelName] = item.model_ratio;
          completionRatio[modelName] = item.completion_ratio ?? 1;
          continue;
        }

        // Otherwise, try to parse as price and convert to ratio
        const inputPrice = item.input || item.input_price || item.inputPrice || item.prompt_price;
        const outputPrice = item.output || item.output_price || item.outputPrice || item.completion_price;

        if (!modelName || inputPrice === undefined) {
          if (pricingData.indexOf(item) < 3) {
            console.log(`[${source.name}] Skipping item (no modelName or inputPrice):`, JSON.stringify(item, null, 2));
          }
          continue;
        }

        // Convert price to ratio
        const ratio = inputPrice / BASE_INPUT_PRICE;
        modelRatio[modelName] = ratio;

        if (outputPrice !== undefined && inputPrice > 0) {
          completionRatio[modelName] = outputPrice / inputPrice;
        } else {
          completionRatio[modelName] = 1;
        }
      }

      console.log(`[${source.name}] Converted ${Object.keys(modelRatio).length} models`);

      const ratioConfig: RatioConfig = {
        modelRatio,
        completionRatio,
      };

      res.json({
        success: true,
        sourceId: id,
        sourceName: source.name,
        ratioConfig,
        method: 'pricing',
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 502;
        const message = error.response?.data?.message ?? error.message;
        res.status(status).json({ success: false, error: message });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/channel-sources/compare-ratios
   * Fetch and compare ratios from multiple channel sources.
   * Falls back to /api/pricing if /api/ratio_config returns 403.
   */
  router.post('/compare-ratios', async (req: Request, res: Response) => {
    try {
      const { sourceIds } = req.body as { sourceIds: number[] };

      if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
        res.status(400).json({ success: false, error: 'sourceIds array is required' });
        return;
      }

      const BASE_INPUT_PRICE = 0.75;

      const results = await Promise.all(
        sourceIds.map(async (id) => {
          try {
            const source = store.getChannelSourceById(id);
            if (!source || !source.enabled) {
              return {
                sourceId: id,
                sourceName: source?.name ?? 'Unknown',
                success: false,
                error: source ? 'Source is disabled' : 'Source not found',
              };
            }

            const headers: Record<string, string> = {
              Authorization: `Bearer ${source.apiKey}`,
            };

            if (source.userId) {
              headers['New-Api-User'] = source.userId;
            }

            // Try /api/ratio_config first
            try {
              const url = `${source.baseUrl.replace(/\/+$/, '')}/api/ratio_config`;
              const response = await axios.get(url, {
                headers,
                timeout: 30_000,
              });

              let ratioConfig: RatioConfig;
              if (response.data?.data) {
                const apiData = response.data.data;
                ratioConfig = {
                  modelRatio: apiData.model_ratio || apiData.modelRatio || {},
                  completionRatio: apiData.completion_ratio || apiData.completionRatio || {},
                };
              } else {
                ratioConfig = {
                  modelRatio: response.data.model_ratio || response.data.modelRatio || {},
                  completionRatio: response.data.completion_ratio || response.data.completionRatio || {},
                };
              }

              return {
                sourceId: id,
                sourceName: source.name,
                success: true,
                ratioConfig,
                method: 'ratio_config',
              };
            } catch (error) {
              // If 403, try /api/pricing as fallback
              if (axios.isAxiosError(error) && error.response?.status === 403) {
                console.log(`Falling back to /api/pricing for source ${source.name}`);
              } else {
                throw error;
              }
            }

            // Fallback: Use /api/pricing
            const pricingUrl = `${source.baseUrl.replace(/\/+$/, '')}/api/pricing`;
            const pricingResponse = await axios.get(pricingUrl, {
              headers,
              timeout: 30_000,
            });

            const modelRatio: Record<string, number> = {};
            const completionRatio: Record<string, number> = {};

            let pricingData: any[] = [];

            if (Array.isArray(pricingResponse.data)) {
              pricingData = pricingResponse.data;
            } else if (pricingResponse.data?.data && Array.isArray(pricingResponse.data.data)) {
              pricingData = pricingResponse.data.data;
            }

            console.log(`[${source.name}] Pricing data count:`, pricingData.length);
            if (pricingData.length > 0) {
              console.log(`[${source.name}] Sample pricing item:`, JSON.stringify(pricingData[0], null, 2));
            }

            for (const item of pricingData) {
              const modelName = item.model_name || item.modelName || item.model;

              // Check if this API returns ratios directly (model_ratio field exists)
              if (item.model_ratio !== undefined) {
                // This API returns ratios directly, not prices
                if (!modelName || item.model_ratio === undefined) continue;

                modelRatio[modelName] = item.model_ratio;
                completionRatio[modelName] = item.completion_ratio ?? 1;
                continue;
              }

              // Otherwise, try to parse as price and convert to ratio
              const inputPrice = item.input || item.input_price || item.inputPrice || item.prompt_price;
              const outputPrice = item.output || item.output_price || item.outputPrice || item.completion_price;

              if (!modelName || inputPrice === undefined) {
                if (pricingData.indexOf(item) < 3) {
                  console.log(`[${source.name}] Skipping item:`, JSON.stringify(item, null, 2));
                }
                continue;
              }

              const ratio = inputPrice / BASE_INPUT_PRICE;
              modelRatio[modelName] = ratio;

              if (outputPrice !== undefined && inputPrice > 0) {
                completionRatio[modelName] = outputPrice / inputPrice;
              } else {
                completionRatio[modelName] = 1;
              }
            }

            console.log(`[${source.name}] Converted ${Object.keys(modelRatio).length} models`);

            const ratioConfig: RatioConfig = {
              modelRatio,
              completionRatio,
            };

            return {
              sourceId: id,
              sourceName: source.name,
              success: true,
              ratioConfig,
              method: 'pricing',
            };
          } catch (error) {
            const source = store.getChannelSourceById(id);
            const message = error instanceof Error ? error.message : String(error);
            return {
              sourceId: id,
              sourceName: source?.name ?? 'Unknown',
              success: false,
              error: message,
            };
          }
        })
      );

      res.json({ success: true, results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

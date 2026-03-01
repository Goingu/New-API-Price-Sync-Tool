import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import type { SQLiteStore } from '../services/sqliteStore.js';
import type { ChannelSource, RatioConfig, CachedRatioEntry } from '@newapi-sync/shared';

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
      const id = parseInt(req.params.id as string, 10);
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

      if (!name || !baseUrl || apiKey === undefined) {
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
      const id = parseInt(req.params.id as string, 10);
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
      const id = parseInt(req.params.id as string, 10);
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
      const id = parseInt(req.params.id as string, 10);
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
            modelPrice: apiData.model_price || apiData.modelPrice,
          };
        } else {
          ratioConfig = {
            modelRatio: response.data.model_ratio || response.data.modelRatio || {},
            completionRatio: response.data.completion_ratio || response.data.completionRatio || {},
            modelPrice: response.data.model_price || response.data.modelPrice,
          };
        }

        // If ratio_config returned data, use it; otherwise fall through to /api/pricing
        if (Object.keys(ratioConfig.modelRatio).length > 0 || (ratioConfig.modelPrice && Object.keys(ratioConfig.modelPrice).length > 0)) {
          console.log(`[${source.name}] ratio_config returned ${Object.keys(ratioConfig.modelRatio).length} token-based models and ${ratioConfig.modelPrice ? Object.keys(ratioConfig.modelPrice).length : 0} per-request models`);
          res.json({
            success: true,
            sourceId: id,
            sourceName: source.name,
            ratioConfig,
            method: 'ratio_config',
          });
          return;
        }
        console.log(`[${source.name}] ratio_config returned empty data, falling back to /api/pricing`);
      } catch (error) {
        // If 403 or other client error, try /api/pricing as fallback
        if (axios.isAxiosError(error) && error.response?.status) {
          console.log(`[${source.name}] ratio_config returned ${error.response.status}, falling back to /api/pricing`);
        } else {
          throw error; // Re-throw network errors etc.
        }
      }

      // Fallback: Use /api/pricing (public endpoint)
      const pricingUrl = `${source.baseUrl.replace(/\/+$/, '')}/api/pricing`;
      console.log(`[${source.name}] Fetching pricing from: ${pricingUrl}`);
      const pricingResponse = await axios.get(pricingUrl, {
        headers,
        timeout: 30_000,
      });

      // Parse pricing data and convert to ratios
      const BASE_INPUT_PRICE = 0.75;
      const modelRatio: Record<string, number> = {};
      const completionRatio: Record<string, number> = {};
      const modelPrice: Record<string, number> = {};

      const pData = pricingResponse.data;

      // Check if response contains ModelRatio/CompletionRatio directly (New API /api/pricing format)
      const ratioSource = pData?.data || pData;
      const directModelRatio = ratioSource?.ModelRatio || ratioSource?.model_ratio || ratioSource?.modelRatio;
      const directCompletionRatio = ratioSource?.CompletionRatio || ratioSource?.completion_ratio || ratioSource?.completionRatio;
      const directModelPrice = ratioSource?.ModelPrice || ratioSource?.model_price || ratioSource?.modelPrice;

      if (directModelRatio && typeof directModelRatio === 'object' && !Array.isArray(directModelRatio)) {
        console.log(`[${source.name}] Pricing returned direct ratio config with ${Object.keys(directModelRatio).length} models`);
        Object.assign(modelRatio, directModelRatio);
        if (directCompletionRatio && typeof directCompletionRatio === 'object') {
          Object.assign(completionRatio, directCompletionRatio);
        }
        if (directModelPrice && typeof directModelPrice === 'object') {
          Object.assign(modelPrice, directModelPrice);
          console.log(`[${source.name}] Found ${Object.keys(directModelPrice).length} per-request pricing models`);
        }
      } else {
        let pricingData: any[] = [];

        if (Array.isArray(pData)) {
          pricingData = pData;
        } else if (pData?.data && Array.isArray(pData.data)) {
          pricingData = pData.data;
        }

        console.log(`[${source.name}] Pricing array data count:`, pricingData.length);
        if (pricingData.length > 0) {
          console.log(`[${source.name}] Sample pricing item:`, JSON.stringify(pricingData[0], null, 2));
        }

        for (const item of pricingData) {
          const modelName = item.model_name || item.modelName || item.model;

          // Check for per-request pricing first
          if (item.model_price !== undefined) {
            if (!modelName) continue;
            modelPrice[modelName] = item.model_price;
            console.log(`[${source.name}] Found per-request model: ${modelName} = ${item.model_price}`);
            continue;
          }

          if (item.model_ratio !== undefined) {
            if (!modelName) continue;
            modelRatio[modelName] = item.model_ratio;
            completionRatio[modelName] = item.completion_ratio ?? 1;
            continue;
          }

          const inputPrice = item.input || item.input_price || item.inputPrice || item.prompt_price;
          const outputPrice = item.output || item.output_price || item.outputPrice || item.completion_price;

          if (!modelName || inputPrice === undefined) continue;

          modelRatio[modelName] = inputPrice / BASE_INPUT_PRICE;
          if (outputPrice !== undefined && inputPrice > 0) {
            completionRatio[modelName] = outputPrice / inputPrice;
          } else {
            completionRatio[modelName] = 1;
          }
        }
      }

      console.log(`[${source.name}] Converted ${Object.keys(modelRatio).length} token-based models and ${Object.keys(modelPrice).length} per-request models`);

      const ratioConfig: RatioConfig = {
        modelRatio,
        completionRatio,
        modelPrice,
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
   * POST /api/channel-sources/import-candidates
   * Read channels from the connected New API instance and return deduplicated
   * candidates (grouped by base_url) that can be imported as channel sources.
   */
  router.post('/import-candidates', async (req: Request, res: Response) => {
    try {
      const { targetUrl, apiKey, userId } = req.body as {
        targetUrl: string;
        apiKey: string;
        userId?: string;
      };

      if (!targetUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing targetUrl or apiKey' });
        return;
      }

      const apiBaseUrl = targetUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
      if (userId) headers['New-Api-User'] = userId;

      // Fetch all channels - try with large page_size first, fallback to no pagination
      let channels: any[] = [];
      
      try {
        // Try fetching with explicit large page size
        const url = `${apiBaseUrl}/api/channel/?p=0&page_size=500`;
        console.log(`[import-candidates] Fetching from ${url}`);
        const response = await axios.get(url, { headers, timeout: 30_000 });

        if (Array.isArray(response.data)) {
          channels = response.data;
        } else if (response.data?.data) {
          if (Array.isArray(response.data.data)) {
            channels = response.data.data;
          } else if (response.data.data?.items && Array.isArray(response.data.data.items)) {
            channels = response.data.data.items;
          }
        }
      } catch (err) {
        // Fallback: try without pagination params
        console.log(`[import-candidates] Paginated request failed, trying without pagination`);
        const url = `${apiBaseUrl}/api/channel/`;
        const response = await axios.get(url, { headers, timeout: 30_000 });

        if (Array.isArray(response.data)) {
          channels = response.data;
        } else if (response.data?.data) {
          if (Array.isArray(response.data.data)) {
            channels = response.data.data;
          } else if (response.data.data?.items && Array.isArray(response.data.data.items)) {
            channels = response.data.data.items;
          }
        }
      }

      console.log(`[import-candidates] Total channels fetched: ${channels.length}`);
      if (channels.length > 0) {
        console.log(`[import-candidates] Sample channel keys:`, Object.keys(channels[0]).join(', '));
      }

      // Group by base_url, deduplicate
      const grouped = new Map<string, { name: string; baseUrl: string; key: string; channelNames: string[]; channelCount: number }>();
      let skippedCount = 0;
      for (const ch of channels) {
        // New API may use different field names for the base URL
        let baseUrl = ch.base_url || ch.baseUrl || ch.base_uri || ch.api_base || '';
        const key = ch.key || '';
        
        // If base_url is empty but the channel name looks like a URL, use it as base_url
        if (!baseUrl && ch.name && /^https?:\/\//i.test(ch.name)) {
          baseUrl = ch.name;
          console.log(`[import-candidates] Channel ${ch.id} (${ch.name}): using name as base_url`);
        }
        
        if (!baseUrl) {
          skippedCount++;
          console.log(`[import-candidates] Skipping channel ${ch.id} (${ch.name}): no base_url. Fields:`, Object.keys(ch).join(', '));
          continue;
        }

        const normalizedUrl = baseUrl.replace(/\/+$/, '');
        if (grouped.has(normalizedUrl)) {
          const existing = grouped.get(normalizedUrl)!;
          existing.channelNames.push(ch.name);
          existing.channelCount++;
          // If we find a non-empty key, use it
          if (key && !existing.key) {
            existing.key = key;
          }
        } else {
          grouped.set(normalizedUrl, {
            name: ch.name,
            baseUrl: normalizedUrl,
            key,
            channelNames: [ch.name],
            channelCount: 1,
          });
        }
      }

      console.log(`[import-candidates] Processed ${channels.length} channels, skipped ${skippedCount}, grouped into ${grouped.size} unique base URLs`);

      // Check which ones already exist as channel sources
      const existingSources = store.getChannelSources();
      const existingUrls = new Set(existingSources.map((s) => s.baseUrl.replace(/\/+$/, '')));

      const candidates = Array.from(grouped.values()).map((g) => ({
        baseUrl: g.baseUrl,
        key: g.key,
        suggestedName: g.channelCount > 1 ? `${g.name} 共${g.channelCount} 个渠道` : g.name,
        channelNames: g.channelNames,
        channelCount: g.channelCount,
        alreadyExists: existingUrls.has(g.baseUrl),
      }));

      console.log(`[import-candidates] Returning ${candidates.length} candidates`);
      if (candidates.length > 0) {
        console.log(`[import-candidates] Sample candidate:`, JSON.stringify(candidates[0], null, 2));
      }

      res.json({ success: true, candidates });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 502;
        const msg = error.response?.data?.message ?? error.message;
        res.status(status).json({ success: false, error: msg });
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  /**
   * POST /api/channel-sources/import-batch
   * Batch import selected candidates as channel sources.
   */
  router.post('/import-batch', (req: Request, res: Response) => {
    try {
      const { sources } = req.body as {
        sources: { name: string; baseUrl: string; apiKey: string }[];
      };

      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        res.status(400).json({ success: false, error: 'sources array is required' });
        return;
      }

      const results: ChannelSource[] = [];
      for (const s of sources) {
        if (!s.name || !s.baseUrl || s.apiKey === undefined) continue;
        const created = store.addChannelSource({
          name: s.name,
          baseUrl: s.baseUrl,
          apiKey: s.apiKey,
          enabled: true,
        });
        results.push(created);
      }

      res.json({ success: true, imported: results.length, sources: results });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
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
                  modelPrice: apiData.model_price || apiData.modelPrice,
                };
              } else {
                ratioConfig = {
                  modelRatio: response.data.model_ratio || response.data.modelRatio || {},
                  completionRatio: response.data.completion_ratio || response.data.completionRatio || {},
                  modelPrice: response.data.model_price || response.data.modelPrice,
                };
              }

              // If ratio_config returned data, use it; otherwise fall through to /api/pricing
              if (Object.keys(ratioConfig.modelRatio).length > 0 || (ratioConfig.modelPrice && Object.keys(ratioConfig.modelPrice).length > 0)) {
                console.log(`[${source.name}] ratio_config returned ${Object.keys(ratioConfig.modelRatio).length} token-based models and ${ratioConfig.modelPrice ? Object.keys(ratioConfig.modelPrice).length : 0} per-request models`);
                return {
                  sourceId: id,
                  sourceName: source.name,
                  success: true,
                  ratioConfig,
                  method: 'ratio_config',
                };
              }
              console.log(`[${source.name}] ratio_config returned empty data, falling back to /api/pricing`);
            } catch (error) {
              // If 403 or other client error, try /api/pricing as fallback
              if (axios.isAxiosError(error) && error.response?.status) {
                console.log(`[${source.name}] ratio_config returned ${error.response.status}, falling back to /api/pricing`);
              } else {
                throw error;
              }
            }

            // Fallback: Use /api/pricing
            const pricingUrl = `${source.baseUrl.replace(/\/+$/, '')}/api/pricing`;
            console.log(`[${source.name}] Fetching pricing from: ${pricingUrl}`);
            const pricingResponse = await axios.get(pricingUrl, {
              headers,
              timeout: 30_000,
            });

            const modelRatio: Record<string, number> = {};
            const completionRatio: Record<string, number> = {};
            const modelPrice: Record<string, number> = {};

            const pData = pricingResponse.data;

            // Check if response contains ModelRatio/CompletionRatio directly (New API /api/pricing format)
            const ratioSource = pData?.data || pData;
            const directModelRatio = ratioSource?.ModelRatio || ratioSource?.model_ratio || ratioSource?.modelRatio;
            const directCompletionRatio = ratioSource?.CompletionRatio || ratioSource?.completion_ratio || ratioSource?.completionRatio;
            const directModelPrice = ratioSource?.ModelPrice || ratioSource?.model_price || ratioSource?.modelPrice;

            if (directModelRatio && typeof directModelRatio === 'object' && !Array.isArray(directModelRatio)) {
              // Direct ratio config format: { ModelRatio: { "model": ratio }, CompletionRatio: { "model": ratio } }
              console.log(`[${source.name}] Pricing returned direct ratio config with ${Object.keys(directModelRatio).length} models`);
              Object.assign(modelRatio, directModelRatio);
              if (directCompletionRatio && typeof directCompletionRatio === 'object') {
                Object.assign(completionRatio, directCompletionRatio);
              }
              if (directModelPrice && typeof directModelPrice === 'object') {
                Object.assign(modelPrice, directModelPrice);
                console.log(`[${source.name}] Found ${Object.keys(directModelPrice).length} per-request pricing models`);
              }
            } else {
              // Array format: [{ model_name, model_ratio, ... }] or [{ model_name, input, output, ... }]
              let pricingData: any[] = [];

              if (Array.isArray(pData)) {
                pricingData = pData;
              } else if (pData?.data && Array.isArray(pData.data)) {
                pricingData = pData.data;
              }

              console.log(`[${source.name}] Pricing array data count:`, pricingData.length);
              if (pricingData.length > 0) {
                console.log(`[${source.name}] Sample pricing item:`, JSON.stringify(pricingData[0], null, 2));
              }

              for (const item of pricingData) {
                const modelName = item.model_name || item.modelName || item.model;

                // Check for per-request pricing first
                if (item.model_price !== undefined) {
                  if (!modelName) continue;
                  modelPrice[modelName] = item.model_price;
                  console.log(`[${source.name}] Found per-request model: ${modelName} = ${item.model_price}`);
                  continue;
                }

                // Check if this API returns ratios directly (model_ratio field exists)
                if (item.model_ratio !== undefined) {
                  if (!modelName) continue;
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
            }

            console.log(`[${source.name}] Converted ${Object.keys(modelRatio).length} token-based models and ${Object.keys(modelPrice).length} per-request models`);

            const ratioConfig: RatioConfig = {
              modelRatio,
              completionRatio,
              modelPrice,
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

  /**
   * GET /api/channel-sources/ratios/cache
   * Get all valid (non-expired) cached ratio entries.
   */
  router.get('/ratios/cache', (_req: Request, res: Response) => {
    try {
      const cached = store.getCachedRatios();
      res.json({ success: true, cached });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/channel-sources/ratios/cache
   * Save or update a cached ratio entry.
   */
  router.post('/ratios/cache', (req: Request, res: Response) => {
    try {
      const { sourceId, sourceName, ratioConfig } = req.body as {
        sourceId: number;
        sourceName: string;
        ratioConfig: RatioConfig;
      };

      if (!sourceId || !sourceName || !ratioConfig) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: sourceId, sourceName, ratioConfig',
        });
        return;
      }

      // Validate ratioConfig structure
      if (!ratioConfig.modelRatio || typeof ratioConfig.modelRatio !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Invalid ratioConfig: modelRatio must be an object',
        });
        return;
      }

      const now = new Date();
      const fetchedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const entry: Omit<CachedRatioEntry, 'id'> = {
        sourceId,
        sourceName,
        ratioConfig,
        fetchedAt,
        expiresAt,
      };

      store.saveCachedRatio(entry);

      // Return the saved entry
      const saved = store.getCachedRatioBySourceId(sourceId);
      res.json({ success: true, cached: saved });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/channel-sources/ratios/cache/:sourceId
   * Delete cached ratio for a specific source.
   */
  router.delete('/ratios/cache/:sourceId', (req: Request, res: Response) => {
    try {
      const sourceId = parseInt(req.params.sourceId as string, 10);

      if (isNaN(sourceId)) {
        res.status(400).json({ success: false, error: 'Invalid sourceId' });
        return;
      }

      store.deleteCachedRatio(sourceId);
      res.json({ success: true, message: 'Cache deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/channel-sources/ratios/cache
   * Clear all cached ratios.
   */
  router.delete('/ratios/cache', (_req: Request, res: Response) => {
    try {
      // Get all cached entries and delete them
      const cached = store.getCachedRatios();
      let deleted = 0;

      for (const entry of cached) {
        store.deleteCachedRatio(entry.sourceId);
        deleted++;
      }

      res.json({ success: true, deleted, message: 'All caches cleared' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { compareChannelPrices, addModelsToChannel, ChannelError } from '../services/channelService.js';
import type { Channel, ModelPrice, ProxyResponse, BatchModelMappingResult } from '@newapi-sync/shared';
import type { SQLiteStore } from '../services/sqliteStore.js';

export function createChannelsRouter(store: SQLiteStore): Router {
  const router = Router();

  /**
   * POST /api/proxy/channels
   * Proxy to get channel list from New API instance.
   * Reads targetUrl and apiKey from request body.
   */
  router.post('/proxy/channels', async (req: Request, res: Response) => {
    try {
      const { targetUrl, apiKey, userId } = req.body as {
        targetUrl: string;
        apiKey: string;
        userId?: string;
      };

      if (!targetUrl || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: targetUrl, apiKey',
        } satisfies ProxyResponse);
        return;
      }

      const apiBaseUrl = `${targetUrl.replace(/\/+$/, '')}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };

      if (userId) {
        headers['New-Api-User'] = userId;
      }

      // Fetch all channels with large page_size, fallback to no pagination
      let channels: Channel[] = [];
      try {
        const url = `${apiBaseUrl}/api/channel/?p=0&page_size=500`;
        const response = await axios.get(url, { headers, timeout: 30_000 });
        if (Array.isArray(response.data)) {
          channels = response.data;
        } else if (response.data?.data) {
          channels = Array.isArray(response.data.data)
            ? response.data.data
            : response.data.data.items ?? [];
        }
      } catch {
        const url = `${apiBaseUrl}/api/channel/`;
        const response = await axios.get(url, { headers, timeout: 30_000 });
        if (Array.isArray(response.data)) {
          channels = response.data;
        } else if (response.data?.data) {
          channels = Array.isArray(response.data.data)
            ? response.data.data
            : response.data.data.items ?? [];
        }
      }

      res.json({
        success: true,
        data: channels,
      } satisfies ProxyResponse);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 502;
        res.status(status).json({
          success: false,
          error: error.response?.data?.message ?? error.message,
        } satisfies ProxyResponse);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: message,
      } satisfies ProxyResponse);
    }
  });

  /**
   * POST /api/channels/compare
   * Receives { channels, upstreamPrices } in body, calls compareChannelPrices, returns results.
   */
  router.post('/compare', async (req: Request, res: Response) => {
    try {
      const { channels, upstreamPrices } = req.body as {
        channels: Channel[];
        upstreamPrices: ModelPrice[];
      };

      if (!channels || !upstreamPrices) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: channels, upstreamPrices',
        });
        return;
      }

      const comparisons = compareChannelPrices(channels, upstreamPrices);
      res.json({ success: true, comparisons });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/channels/:id/available-models
   * Get available models that can be added to a channel.
   * Fetches models from the channel's actual API endpoint and filters out models already configured.
   */
  router.get('/:id/available-models', async (req: Request, res: Response) => {
    let channelId: number | undefined;
    try {
      // Extract and validate channel ID from URL parameter
      const idParam = req.params.id;
      channelId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
      if (isNaN(channelId) || channelId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid channel ID',
        });
        return;
      }

      // Extract connection parameters from query string
      const { targetUrl, apiKey, userId } = req.query as {
        targetUrl?: string;
        apiKey?: string;
        userId?: string;
      };

      // Validate required fields
      if (!targetUrl || !apiKey) {
        res.status(400).json({
          success: false,
          error: 'Missing required query parameters: targetUrl, apiKey',
        });
        return;
      }

      // Fetch channel details to get current models and base URL
      let channel: Channel;
      try {
        const apiBaseUrl = `${targetUrl.replace(/\/+$/, '')}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
        };

        if (userId) {
          headers['New-Api-User'] = userId;
        }

        const channelResponse = await axios.get(
          `${apiBaseUrl}/api/channel/${channelId}`,
          { headers, timeout: 30_000 }
        );

        if (!channelResponse.data || !channelResponse.data.data) {
          res.status(404).json({
            success: false,
            error: `Channel not found: ${channelId}`,
          });
          return;
        }

        channel = channelResponse.data.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          res.status(404).json({
            success: false,
            error: `Channel not found: ${channelId}`,
          });
          return;
        }
        throw error;
      }

      // Parse existing models from the channel
      const existingModels = channel.models
        ? channel.models.split(',').map((m) => m.trim()).filter((m) => m.length > 0)
        : [];

      // Get channel sources from store
      const sources = store.getChannelSources();

      // Helper function to normalize base URL (same logic as frontend)
      const normalizeBaseUrl = (value: string | undefined): string | null => {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        const normalizePath = (path: string): string => {
          let normalized = path.replace(/\/+$/, '');
          normalized = normalized.replace(/\/v1$/i, '');
          normalized = normalized.replace(/\/api$/i, '');
          return normalized;
        };

        try {
          const parsed = new URL(trimmed);
          const protocol = parsed.protocol.toLowerCase();
          const host = parsed.host.toLowerCase();
          const pathname = normalizePath(parsed.pathname);
          return `${protocol}//${host}${pathname}`;
        } catch {
          return normalizePath(trimmed.toLowerCase());
        }
      };

      // Build source map by normalized base URL
      const sourceByUrl = new Map<string, typeof sources[0]>();
      for (const source of sources) {
        const normalized = normalizeBaseUrl(source.baseUrl);
        if (normalized) {
          sourceByUrl.set(normalized, source);
        }
      }

      // Get channel's base URL and find matching source
      const rawChannelUrl = channel.base_url?.trim() || 
        (channel.key?.trim() && /^https?:\/\//i.test(channel.key) ? channel.key.trim() : null);
      const normalizedChannelUrl = normalizeBaseUrl(rawChannelUrl ?? undefined);
      
      const matchedSource = normalizedChannelUrl ? sourceByUrl.get(normalizedChannelUrl) : null;

      if (!matchedSource) {
        // Log for debugging
        console.log('[Available Models] No matching source found', {
          channelId,
          channelBaseUrl: rawChannelUrl,
          normalizedChannelUrl,
          availableSources: Array.from(sourceByUrl.keys()),
        });
        res.status(400).json({
          success: false,
          error: '该渠道未关联到任何渠道源，无法获取模型列表',
        });
        return;
      }

      // Use the source's base URL to fetch models
      const channelBaseUrl = matchedSource.baseUrl;

      // Fetch real models from the channel source's /v1/models endpoint
      let realModels: string[] = [];
      try {
        // Strip trailing /v1 or /v1/ to avoid double /v1/v1/models
        const cleanBaseUrl = channelBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
        const modelsUrl = `${cleanBaseUrl}/v1/models`;
        const modelsResponse = await axios.get(modelsUrl, {
          headers: {
            // channel.key is the request key for the upstream /v1/ endpoints
            // matchedSource.channelKey is the optional request key on the source
            // matchedSource.apiKey is the admin key for /api/ endpoints (not for /v1/)
            Authorization: `Bearer ${channel.key || matchedSource.channelKey || matchedSource.apiKey || 'dummy'}`,
          },
          timeout: 15_000,
        });

        // Parse OpenAI-compatible models response
        if (modelsResponse.data?.data && Array.isArray(modelsResponse.data.data)) {
          realModels = modelsResponse.data.data
            .map((m: any) => m.id || m.model)
            .filter((id: any) => typeof id === 'string' && id.trim().length > 0);
        }
      } catch (error) {
        // If fetching real models fails, return error with more details
        const cleanBaseUrl = channelBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
        let errorMsg = `无法从渠道源获取模型列表 (${cleanBaseUrl}/v1/models)`;
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNREFUSED') {
            errorMsg = `无法连接到渠道源 API (${channelBaseUrl})`;
          } else if (error.response?.status === 401) {
            errorMsg = '渠道源 API Key 无效或已过期';
          } else if (error.response?.status === 403) {
            errorMsg = '没有权限访问渠道源的模型列表';
          } else if (error.response?.status === 404) {
            errorMsg = '渠道源不支持 /v1/models 端点';
          } else {
            errorMsg = `${errorMsg}: ${error.message}`;
          }
        }
        res.status(502).json({
          success: false,
          error: errorMsg,
        });
        return;
      }

      // Filter out models that are already configured
      const availableModels = realModels
        .filter((modelId) => !existingModels.includes(modelId))
        .map((modelId) => ({
          modelId,
          modelName: modelId,
          provider: matchedSource.name,
          description: `${matchedSource.name} - ${modelId}`,
        }));

      res.json({
        success: true,
        models: availableModels,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Get Available Models Error]', {
        timestamp: new Date().toISOString(),
        channelId: channelId ?? 'unknown',
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/channels/:id/models
   * Add models to a channel.
   * Validates channel existence, model IDs, and prevents duplicates.
   */
  router.post('/:id/models', async (req: Request, res: Response) => {
    let channelId: number | undefined;
    try {
      // Extract and validate channel ID from URL parameter
      const idParam = req.params.id;
      channelId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
      if (isNaN(channelId) || channelId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid channel ID',
        });
        return;
      }

      // Extract and validate request body
      const { modelIds, connection } = req.body as {
        modelIds?: string[];
        connection?: {
          targetUrl: string;
          apiKey: string;
          userId?: string;
        };
      };

      // Validate required fields
      if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No models selected',
        });
        return;
      }

      if (!connection || !connection.targetUrl || !connection.apiKey) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: connection.targetUrl, connection.apiKey',
        });
        return;
      }

      // Validate model IDs are non-empty strings
      const invalidModelIds = modelIds.filter(
        (id) => typeof id !== 'string' || id.trim().length === 0
      );
      if (invalidModelIds.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid model IDs: model IDs must be non-empty strings',
        });
        return;
      }

      // Validate empty selection
      if (modelIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No models selected',
        });
        return;
      }

      // Delegate to service layer
      const result = await addModelsToChannel(
        connection.targetUrl,
        connection.apiKey,
        connection.userId,
        channelId,
        modelIds
      );

      // Determine appropriate HTTP status code based on error type
      if (result.success) {
        res.json(result);
      } else if (result.error?.includes('Channel not found')) {
        res.status(404).json(result);
      } else if (result.error?.includes('Duplicate models')) {
        res.status(409).json(result);
      } else if (result.error?.includes('Invalid model IDs')) {
        res.status(400).json(result);
      } else if (result.error?.includes('No models selected')) {
        res.status(400).json(result);
      } else if (result.error?.includes('Connection timeout')) {
        res.status(504).json(result);
      } else if (result.error?.includes('API service unavailable') || result.error?.includes('unavailable')) {
        res.status(502).json(result);
      } else if (result.error?.includes('modified by another operation')) {
        res.status(409).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      // Handle ChannelError with proper status codes
      if (error instanceof ChannelError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Handle unexpected errors
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Channel Routes Error]', {
        timestamp: new Date().toISOString(),
        error: message,
        channelId: channelId ?? 'unknown',
      });
      
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  /**
   * PUT /api/channels/batch-model-mapping
   * Batch update model_mapping for multiple channels.
   * Merges new mappings into each channel's existing model_mapping.
   */
  router.put('/batch-model-mapping', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, channelIds, mappings } = req.body as {
        baseUrl: string;
        apiKey: string;
        userId?: string;
        channelIds: number[];
        mappings: Record<string, string>;
      };

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      if (!Array.isArray(channelIds) || channelIds.length === 0) {
        res.status(400).json({ success: false, error: 'channelIds must be a non-empty array' });
        return;
      }

      if (!mappings || typeof mappings !== 'object' || Object.keys(mappings).length === 0) {
        res.status(400).json({ success: false, error: 'mappings must be a non-empty object' });
        return;
      }

      const apiBaseUrl = baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (userId) {
        headers['New-Api-User'] = userId;
      }

      const results: BatchModelMappingResult['results'] = [];

      for (const channelId of channelIds) {
        try {
          // GET current channel
          const getResp = await axios.get(`${apiBaseUrl}/api/channel/${channelId}`, {
            headers,
            timeout: 30_000,
          });

          const channel: Channel = getResp.data?.data ?? getResp.data;
          if (!channel || !channel.id) {
            results.push({ channelId, channelName: '', success: false, error: 'Channel not found' });
            continue;
          }

          // Parse existing model_mapping
          let existingMapping: Record<string, string> = {};
          if (channel.model_mapping && channel.model_mapping.trim()) {
            try {
              existingMapping = JSON.parse(channel.model_mapping);
            } catch {
              existingMapping = {};
            }
          }

          // Merge new mappings
          const mergedMapping = { ...existingMapping, ...mappings };

          // PUT update
          await axios.put(
            `${apiBaseUrl}/api/channel/`,
            { id: channelId, model_mapping: JSON.stringify(mergedMapping) },
            { headers, timeout: 30_000 },
          );

          results.push({ channelId, channelName: channel.name, success: true });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.push({ channelId, channelName: '', success: false, error: msg });
        }
      }

      const totalSuccess = results.filter((r) => r.success).length;
      const totalFailed = results.filter((r) => !r.success).length;

      res.json({
        success: totalFailed === 0,
        data: { results, totalSuccess, totalFailed } satisfies BatchModelMappingResult,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  return router;
}

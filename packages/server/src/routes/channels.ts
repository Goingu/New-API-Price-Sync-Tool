import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { compareChannelPrices } from '../services/channelService.js';
import type { Channel, ModelPrice, ProxyResponse } from '@newapi-sync/shared';

export function createChannelsRouter(): Router {
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

  return router;
}

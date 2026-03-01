import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import type { ConnectionSettings, Channel } from '@newapi-sync/shared';

/**
 * Model Group Management Routes
 * Provides APIs for batch operations on channels grouped by model
 */
export function createModelGroupRouter(): Router {
  const router = Router();

  /**
   * POST /api/model-groups/batch-delete - 批量删除渠道
   */
  router.post('/batch-delete', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, channelIds } = req.body;

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      if (!Array.isArray(channelIds) || channelIds.length === 0) {
        res.status(400).json({ success: false, error: 'channelIds must be a non-empty array' });
        return;
      }

      const apiBaseUrl = baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (userId) {
        headers['New-Api-User'] = userId;
      }

      const results = [];
      for (const channelId of channelIds) {
        try {
          await axios.delete(`${apiBaseUrl}/api/channel/${channelId}`, {
            headers,
            timeout: 30_000,
          });
          results.push({ channelId, success: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ channelId, success: false, error: message });
        }
      }

      const totalSuccess = results.filter((r) => r.success).length;
      const totalFailed = results.filter((r) => !r.success).length;

      res.json({
        success: totalFailed === 0,
        data: {
          results,
          totalSuccess,
          totalFailed,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/model-groups/batch-update-priority - 批量更新优先级
   */
  router.post('/batch-update-priority', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, updates } = req.body;

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      if (!Array.isArray(updates) || updates.length === 0) {
        res.status(400).json({ success: false, error: 'updates must be a non-empty array' });
        return;
      }

      const apiBaseUrl = baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (userId) {
        headers['New-Api-User'] = userId;
      }

      const results = [];
      for (const update of updates) {
        const { channelId, priority } = update;
        try {
          await axios.put(
            `${apiBaseUrl}/api/channel/`,
            { id: channelId, priority },
            { headers, timeout: 30_000 }
          );
          results.push({ channelId, priority, success: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ channelId, priority, success: false, error: message });
        }
      }

      const totalSuccess = results.filter((r) => r.success).length;
      const totalFailed = results.filter((r) => !r.success).length;

      res.json({
        success: totalFailed === 0,
        data: {
          results,
          totalSuccess,
          totalFailed,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  return router;
}

import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import type { ProxyRequest, ProxyResponse } from '@newapi-sync/shared';

export function createProxyRouter(): Router {
  const router = Router();

  /**
   * POST /api/proxy/forward
   * Generic proxy that forwards requests to a New API instance.
   */
  router.post('/forward', async (req: Request, res: Response) => {
    try {
      const { targetUrl, apiKey, userId, method, path, body } = req.body as ProxyRequest;

      if (!targetUrl || !apiKey || !method || !path) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: targetUrl, apiKey, method, path',
        } satisfies ProxyResponse);
        return;
      }

      const url = `${targetUrl.replace(/\/+$/, '')}${path}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      if (userId) {
        headers['New-Api-User'] = userId;
      }

      // Debug logging (sensitive info masked)
      console.log('[Proxy] Request:', {
        method: method.toLowerCase(),
        url: url.replace(/\/\/[^@]+@/, '//***@'), // Mask credentials in URL
        hasUserId: !!userId,
        bodySize: body ? JSON.stringify(body).length : 0,
        bodyIsArray: Array.isArray(body),
      });

      const response = await axios({
        method: method.toLowerCase(),
        url,
        data: body,
        headers,
        timeout: 30_000,
      });

      res.json({
        success: true,
        data: response.data,
      } satisfies ProxyResponse);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? 502;
        console.error('[Proxy] Error:', {
          status,
          statusText: error.response?.statusText,
          message: error.message,
        });
        res.status(status).json({
          success: false,
          error: error.response?.data?.message ?? error.response?.data?.error ?? error.message,
        } satisfies ProxyResponse);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.error('[Proxy] Non-axios error:', message);
      res.status(500).json({
        success: false,
        error: message,
      } satisfies ProxyResponse);
    }
  });

  return router;
}

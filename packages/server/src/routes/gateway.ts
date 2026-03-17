import { Router, Request, Response } from 'express';
import axios from 'axios';
import type { SQLiteStore } from '../services/sqliteStore.js';
import { GatewayService } from '../services/gatewayService.js';

export function createGatewayRouter(store: SQLiteStore): Router {
  const router = Router();
  const gateway = new GatewayService(store);

  /** Extract Bearer token from Authorization header */
  function extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }

  /** Auth + enabled middleware */
  function authenticate(req: Request, res: Response): boolean {
    if (!gateway.isEnabled()) {
      res.status(503).json({ error: { message: 'Gateway is disabled', type: 'gateway_error' } });
      return false;
    }
    const token = extractToken(req);
    if (!token || !gateway.authenticate(token)) {
      res.status(401).json({ error: { message: 'Invalid API key', type: 'authentication_error' } });
      return false;
    }
    return true;
  }

  // GET /v1/models — aggregated model list
  router.get('/models', (req: Request, res: Response) => {
    if (!authenticate(req, res)) return;
    const models = gateway.listAllModels();
    res.json({
      object: 'list',
      data: models.map(m => ({
        id: m.id,
        object: 'model',
        created: 0,
        owned_by: 'gateway',
      })),
    });
  });

  // ALL /v1/* — generic proxy
  router.all('/*', async (req: Request, res: Response) => {
    if (!authenticate(req, res)) return;

    // Extract the sub-path after /v1/
    const subPath = req.params[0] || '';
    if (!subPath) {
      res.status(400).json({ error: { message: 'Missing endpoint path', type: 'invalid_request_error' } });
      return;
    }

    const body = req.body && Object.keys(req.body).length > 0 ? req.body : undefined;
    const model: string | undefined = body?.model;

    if (!model) {
      res.status(400).json({ error: { message: 'Missing model field in request body', type: 'invalid_request_error' } });
      return;
    }

    const candidates = gateway.findCandidates(model);
    if (candidates.length === 0) {
      res.status(404).json({ error: { message: `No available source for model: ${model}`, type: 'model_not_found' } });
      return;
    }

    const isStream = body?.stream === true;
    let lastError: unknown = null;

    for (const candidate of candidates) {
      const targetUrl = `${candidate.source.baseUrl.replace(/\/+$/, '')}/v1/${subPath}`;
      try {
        if (isStream) {
          const upstream = await axios({
            method: req.method as string,
            url: targetUrl,
            data: body,
            headers: {
              'Authorization': `Bearer ${candidate.source.channelKey}`,
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
            timeout: 120_000,
            validateStatus: (status) => true,
          });

          if (upstream.status >= 500 || upstream.status === 429) {
            upstream.data.destroy();
            lastError = new Error(`Upstream ${candidate.source.name} returned ${upstream.status}`);
            continue;
          }
          if (upstream.status >= 400) {
            // Client error — forward as-is, don't retry
            res.status(upstream.status);
            for (const h of ['content-type', 'x-request-id']) {
              if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]);
            }
            upstream.data.pipe(res);
            return;
          }

          // Success — pipe stream
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          upstream.data.pipe(res);
          return;
        } else {
          // Non-streaming
          const upstream = await axios({
            method: req.method as string,
            url: targetUrl,
            data: body,
            headers: {
              'Authorization': `Bearer ${candidate.source.channelKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 120_000,
            validateStatus: (status) => true,
          });

          if (upstream.status >= 500 || upstream.status === 429) {
            lastError = new Error(`Upstream ${candidate.source.name} returned ${upstream.status}`);
            continue;
          }

          // Forward response (including 4xx)
          res.status(upstream.status).json(upstream.data);
          return;
        }
      } catch (err) {
        // Network error or timeout — try next candidate
        lastError = err;
        continue;
      }
    }

    // All candidates failed
    const msg = lastError instanceof Error ? lastError.message : 'Unknown error';
    res.status(502).json({ error: { message: `All upstream sources failed. Last error: ${msg}`, type: 'gateway_error' } });
  });

  return router;
}

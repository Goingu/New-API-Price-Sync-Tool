import { Router, type Request, type Response } from 'express';
import type { PriorityService } from '../services/priorityService.js';
import type { SchedulerStatus } from '@newapi-sync/shared';

/**
 * Minimal interface for PriorityScheduler used by routes.
 * The full implementation lives in priorityScheduler.ts (task 8.1).
 */
export interface PrioritySchedulerLike {
  getStatus(): SchedulerStatus;
  refresh(): void;
  start(): void;
  stop(): void;
}

export function createPriorityRouter(
  priorityService: PriorityService,
  priorityScheduler: PrioritySchedulerLike,
): Router {
  const router = Router();

  // ─── Price Rate CRUD ────────────────────────────────────────────────

  /**
   * GET /api/priority/price-rates �?获取所有渠道费率配�?
   */
  router.get('/price-rates', (_req: Request, res: Response) => {
    try {
      const rates = priorityService.getPriceRates();
      res.json({ success: true, data: rates });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/priority/price-rates/:channelId �?设置/更新渠道费率
   */
  router.put('/price-rates/:channelId', (req: Request, res: Response) => {
    try {
      const channelId = parseInt(req.params.channelId as string, 10);
      if (isNaN(channelId)) {
        res.status(400).json({ success: false, error: 'Invalid channel ID' });
        return;
      }

      const { channelName, rate } = req.body;
      if (!channelName) {
        res.status(400).json({ success: false, error: 'Missing required field: channelName' });
        return;
      }
      if (typeof rate !== 'number' || rate <= 0) {
        res.status(400).json({ success: false, error: '费率必须大于 0' });
        return;
      }

      priorityService.setPriceRate(channelId, channelName, rate);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/priority/price-rates/:channelId �?删除渠道费率
   */
  router.delete('/price-rates/:channelId', (req: Request, res: Response) => {
    try {
      const channelId = parseInt(req.params.channelId as string, 10);
      if (isNaN(channelId)) {
        res.status(400).json({ success: false, error: 'Invalid channel ID' });
        return;
      }

      priorityService.deletePriceRate(channelId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Priority Calculation & Apply ───────────────────────────────────

  /**
   * POST /api/priority/calculate �?触发优先级计算，返回预览结果
   */
  router.post('/calculate', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId } = req.body;
      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      const result = await priorityService.calculate({ baseUrl, apiKey, userId });
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/priority/apply �?确认应用优先级变�?
   */
  router.post('/apply', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, changes } = req.body;
      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }
      if (!Array.isArray(changes)) {
        res.status(400).json({ success: false, error: 'Missing required field: changes (array)' });
        return;
      }

      const result = await priorityService.apply({ baseUrl, apiKey, userId }, changes);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  // ─── Priority Rule ──────────────────────────────────────────────────

  /**
   * GET /api/priority/rule �?获取优先级规�?
   */
  router.get('/rule', (_req: Request, res: Response) => {
    try {
      const rule = priorityService.getRule();
      res.json({ success: true, data: rule });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/priority/rule �?更新优先级规�?
   */
  router.put('/rule', (req: Request, res: Response) => {
    try {
      const { startValue, step } = req.body;
      if (typeof startValue !== 'number' || startValue <= 0) {
        res.status(400).json({ success: false, error: 'startValue 必须大于 0' });
        return;
      }
      if (typeof step !== 'number' || step <= 0) {
        res.status(400).json({ success: false, error: 'step 必须大于 0' });
        return;
      }

      priorityService.setRule({ startValue, step });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Auto Mode ──────────────────────────────────────────────────────

  /**
   * GET /api/priority/auto-mode �?获取自动模式状�?
   */
  router.get('/auto-mode', (_req: Request, res: Response) => {
    try {
      const enabled = priorityService.getAutoMode();
      res.json({ success: true, data: { enabled } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/priority/auto-mode �?设置自动模式状�?
   */
  router.put('/auto-mode', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'Missing required field: enabled (boolean)' });
        return;
      }

      priorityService.setAutoMode(enabled);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Schedule Config ────────────────────────────────────────────────

  /**
   * GET /api/priority/schedule �?获取定时调配配置
   */
  router.get('/schedule', (_req: Request, res: Response) => {
    try {
      const config = priorityService.getScheduleConfig();
      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/priority/schedule �?更新定时调配配置
   */
  router.put('/schedule', (req: Request, res: Response) => {
    try {
      const { enabled, frequency } = req.body;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'Missing required field: enabled (boolean)' });
        return;
      }
      const validFrequencies = ['1h', '6h', '12h', '24h'];
      if (!validFrequencies.includes(frequency)) {
        res.status(400).json({ success: false, error: `frequency 必须为以下值之一: ${validFrequencies.join(', ')}` });
        return;
      }

      priorityService.setScheduleConfig({ enabled, frequency });
      priorityScheduler.refresh();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/priority/schedule/status �?获取定时任务状�?
   */
  router.get('/schedule/status', (_req: Request, res: Response) => {
    try {
      const status = priorityScheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Adjustment Logs ────────────────────────────────────────────────

  /**
   * GET /api/priority/logs �?获取调整日志列表
   */
  router.get('/logs', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const logs = priorityService.getLogs(limit);
      res.json({ success: true, data: logs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/priority/logs/:id �?获取单条日志详情
   */
  router.get('/logs/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid log ID' });
        return;
      }

      const log = priorityService.getLogById(id);
      if (!log) {
        res.status(404).json({ success: false, error: 'Log not found' });
        return;
      }

      res.json({ success: true, data: log });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

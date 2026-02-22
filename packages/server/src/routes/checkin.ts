import { Router, type Request, type Response } from 'express';
import type { SQLiteStore } from '../services/sqliteStore.js';
import type { CheckinService } from '../services/checkinService.js';
import type { CheckinScheduler } from '../services/checkinScheduler.js';

export function createCheckinRouter(
  store: SQLiteStore,
  checkinService: CheckinService,
  checkinScheduler: CheckinScheduler,
): Router {
  const router = Router();

  /**
   * GET /api/checkin/targets — 获取所有渠道源及其签到配置
   */
  router.get('/targets', (_req: Request, res: Response) => {
    try {
      const targets = store.getChannelSourcesWithCheckin();
      res.json({ success: true, data: targets });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/checkin/targets — 添加签到目标（已废弃，应使用 channel-sources API）
   */
  router.post('/targets', (req: Request, res: Response) => {
    res.status(400).json({
      success: false,
      error: 'Please use /api/channel-sources to add new sources',
    });
  });

  /**
   * PUT /api/checkin/targets/:id — 更新签到配置
   */
  router.put('/targets/:id', (req: Request, res: Response) => {
    try {
      const sourceId = parseInt(req.params.id, 10);
      if (isNaN(sourceId)) {
        res.status(400).json({ success: false, error: 'Invalid source ID' });
        return;
      }

      const { autoCheckin, checkinTime } = req.body;
      if (autoCheckin === undefined || !checkinTime) {
        res.status(400).json({ success: false, error: 'Missing required fields: autoCheckin, checkinTime' });
        return;
      }

      const config = store.setCheckinConfig({
        sourceId,
        autoCheckin,
        checkinTime,
      });

      // Refresh scheduler to pick up changes
      checkinScheduler.refreshSchedules();

      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/checkin/targets/:id — 删除签到配置
   */
  router.delete('/targets/:id', (req: Request, res: Response) => {
    try {
      const sourceId = parseInt(req.params.id, 10);
      if (isNaN(sourceId)) {
        res.status(400).json({ success: false, error: 'Invalid source ID' });
        return;
      }
      store.deleteCheckinConfig(sourceId);
      // Refresh scheduler to remove deleted config
      checkinScheduler.refreshSchedules();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/checkin/execute/:id — 手动触发单个实例签到
   */
  router.post('/execute/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid target ID' });
        return;
      }
      const record = await checkinService.checkinOne(id);
      res.json({ success: true, data: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/checkin/execute-all — 手动触发所有启用实例签到
   */
  router.post('/execute-all', async (_req: Request, res: Response) => {
    try {
      const records = await checkinService.checkinAll();
      res.json({ success: true, data: records });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/checkin/records — 获取签到记录（支持 targetId 和 limit 查询参数）
   */
  router.get('/records', (req: Request, res: Response) => {
    try {
      const targetId = req.query.targetId ? parseInt(req.query.targetId as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const records = store.getCheckinRecords(targetId, limit);
      res.json({ success: true, data: records });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/checkin/records/:targetId/latest — 获取指定实例最新签到记录
   */
  router.get('/records/:targetId/latest', (req: Request, res: Response) => {
    try {
      const targetId = parseInt(req.params.targetId, 10);
      if (isNaN(targetId)) {
        res.status(400).json({ success: false, error: 'Invalid target ID' });
        return;
      }
      const record = store.getLatestCheckinRecord(targetId);
      res.json({ success: true, data: record });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

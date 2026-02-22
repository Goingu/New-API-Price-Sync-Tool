import { Router, type Request, type Response } from 'express';
import type { SQLiteStore } from '../services/sqliteStore.js';
import type { LivenessService } from '../services/livenessService.js';
import type { LivenessScheduler } from '../services/livenessScheduler.js';

export function createLivenessRouter(
  store: SQLiteStore,
  livenessService: LivenessService,
  livenessScheduler: LivenessScheduler,
): Router {
  const router = Router();

  /**
   * GET /api/liveness/configs — 获取所有检测配置
   */
  router.get('/configs', (_req: Request, res: Response) => {
    try {
      const configs = store.getLivenessConfigs();
      res.json({ success: true, data: configs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/liveness/configs — 添加检测配置
   */
  router.post('/configs', (req: Request, res: Response) => {
    try {
      const { name, baseUrl, apiKey, models, frequency, enabled } = req.body;
      if (!name || !baseUrl || !apiKey || !models) {
        res.status(400).json({ success: false, error: 'Missing required fields: name, baseUrl, apiKey, models' });
        return;
      }
      const config = store.addLivenessConfig({
        name,
        baseUrl,
        apiKey,
        models,
        frequency: frequency ?? '1h',
        enabled: enabled ?? true,
      });
      livenessScheduler.refresh();
      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/liveness/configs/:id — 更新检测配置
   */
  router.put('/configs/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }
      const config = store.updateLivenessConfig(id, req.body);
      livenessScheduler.refresh();
      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/liveness/configs/:id — 删除检测配置
   */
  router.delete('/configs/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }
      store.deleteLivenessConfig(id);
      livenessScheduler.refresh();
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/liveness/check/:configId/:modelId — 手动检测单个模型
   */
  router.post('/check/:configId/:modelId', async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId, 10);
      if (isNaN(configId)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }
      const { modelId } = req.params;
      const result = await livenessService.checkModel(configId, modelId);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/liveness/check/:configId — 手动检测配置下所有模型
   */
  router.post('/check/:configId', async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId, 10);
      if (isNaN(configId)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }
      const results = await livenessService.checkAllModels(configId);
      res.json({ success: true, data: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/liveness/check-all — 手动检测所有配置的所有模型
   */
  router.post('/check-all', async (_req: Request, res: Response) => {
    try {
      const results = await livenessService.checkAllConfigs();
      res.json({ success: true, data: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/liveness/results — 获取检测结果（支持 configId、modelId、limit 查询参数）
   */
  router.get('/results', (req: Request, res: Response) => {
    try {
      const configId = req.query.configId ? parseInt(req.query.configId as string, 10) : undefined;
      const modelId = req.query.modelId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const results = store.getLivenessResults({ configId, modelId, limit });
      res.json({ success: true, data: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/liveness/results/:configId/latest — 获取指定配置的最新检测结果
   */
  router.get('/results/:configId/latest', (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.configId, 10);
      if (isNaN(configId)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }
      const results = store.getLatestLivenessResults(configId);
      res.json({ success: true, data: results });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

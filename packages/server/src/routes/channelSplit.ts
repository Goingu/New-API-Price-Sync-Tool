import { Router, type Request, type Response } from 'express';
import type { SplitService } from '../services/splitService.js';

export function createChannelSplitRouter(splitService: SplitService): Router {
  const router = Router();

  // ─── Split Preview ──────────────────────────────────────────────────

  /**
   * POST /api/channel-split/preview - 生成拆分预览
   */
  router.post('/preview', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, channelIds, modelFilters } = req.body;

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      if (!Array.isArray(channelIds) || channelIds.length === 0) {
        res.status(400).json({ success: false, error: 'channelIds must be a non-empty array' });
        return;
      }

      // Convert modelFilters from object to Map if provided
      let modelFiltersMap: Map<number, string[]> | undefined;
      if (modelFilters && typeof modelFilters === 'object') {
        modelFiltersMap = new Map(Object.entries(modelFilters).map(([k, v]) => [parseInt(k, 10), v as string[]]));
      }

      const preview = await splitService.preview(
        { baseUrl, apiKey, userId },
        channelIds,
        modelFiltersMap
      );

      res.json({ success: true, data: preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  // ─── Split Execution ────────────────────────────────────────────────

  /**
   * POST /api/channel-split/execute - 执行拆分操作
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId, preview, options } = req.body;

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      if (!preview || typeof preview !== 'object') {
        res.status(400).json({ success: false, error: 'Missing required field: preview' });
        return;
      }

      if (!options || typeof options !== 'object') {
        res.status(400).json({ success: false, error: 'Missing required field: options' });
        return;
      }

      console.log('[ChannelSplit] Executing split:', {
        subChannels: preview.subChannels?.length,
        parentAction: options.parentAction,
        autoPriority: options.autoPriority,
      });

      const result = await splitService.execute(
        { baseUrl, apiKey, userId },
        preview,
        options
      );

      console.log('[ChannelSplit] Split execution completed:', {
        success: result.success,
        totalSuccess: result.totalSuccess,
        totalFailed: result.totalFailed,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ChannelSplit] Execute error:', error);
      res.status(502).json({ success: false, error: message });
    }
  });

  // ─── Split History ──────────────────────────────────────────────────

  /**
   * GET /api/channel-split/history - 获取拆分历史列表
   */
  router.get('/history', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const parentChannelId = req.query.parentChannelId ? parseInt(req.query.parentChannelId as string, 10) : undefined;

      const history = splitService.getSplitHistory({ limit, parentChannelId });
      res.json({ success: true, data: history });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/channel-split/history/:id - 获取单条历史详情
   */
  router.get('/history/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid history ID' });
        return;
      }

      const entry = splitService.getSplitHistoryById(id);
      if (!entry) {
        res.status(404).json({ success: false, error: 'Split history not found' });
        return;
      }

      res.json({ success: true, data: entry });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // ─── Rollback ───────────────────────────────────────────────────────

  /**
   * POST /api/channel-split/rollback/:id - 回滚拆分操作
   */
  router.post('/rollback/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid history ID' });
        return;
      }

      const { baseUrl, apiKey, userId } = req.body;
      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required fields: baseUrl, apiKey' });
        return;
      }

      const result = await splitService.rollback({ baseUrl, apiKey, userId }, id);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  // ─── Smart Suggestions ──────────────────────────────────────────────

  /**
   * GET /api/channel-split/suggestions - 获取智能拆分建议
   */
  router.get('/suggestions', async (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, userId } = req.query;

      if (!baseUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'Missing required query params: baseUrl, apiKey' });
        return;
      }

      const suggestions = await splitService.getSplitSuggestions({
        baseUrl: baseUrl as string,
        apiKey: apiKey as string,
        userId: userId as string | undefined,
      });

      res.json({ success: true, data: suggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ success: false, error: message });
    }
  });

  // ─── Split Configurations ───────────────────────────────────────────

  /**
   * GET /api/channel-split/configs - 获取拆分配置列表
   */
  router.get('/configs', (req: Request, res: Response) => {
    try {
      const configs = splitService.getSplitConfigs();
      res.json({ success: true, data: configs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/channel-split/configs - 保存拆分配置
   */
  router.post('/configs', (req: Request, res: Response) => {
    try {
      const config = req.body;

      if (!config || typeof config !== 'object') {
        res.status(400).json({ success: false, error: 'Missing required field: config' });
        return;
      }

      if (!config.name || typeof config.name !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: name' });
        return;
      }

      const saved = splitService.saveSplitConfig(config);
      res.json({ success: true, data: saved });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/channel-split/configs/:id - 删除拆分配置
   */
  router.delete('/configs/:id', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid config ID' });
        return;
      }

      splitService.deleteSplitConfig(id);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

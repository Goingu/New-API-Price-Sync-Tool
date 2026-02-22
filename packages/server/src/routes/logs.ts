import { Router, type Request, type Response } from 'express';
import type { SQLiteStore } from '../services/sqliteStore.js';
import type { UpdateLogEntry } from '@newapi-sync/shared';

export function createLogsRouter(store: SQLiteStore): Router {
  const router = Router();

  /**
   * GET /api/logs/updates
   * Get update logs from SQLite. Supports ?limit query param.
   */
  router.get('/updates', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const logs = store.getUpdateLogs({ limit });
      res.json({ success: true, logs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/logs/updates
   * Save a new update log entry.
   */
  router.post('/updates', (req: Request, res: Response) => {
    try {
      const logEntry = req.body as UpdateLogEntry;

      if (!logEntry.updatedAt || !logEntry.modelsUpdated) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: updatedAt, modelsUpdated',
        });
        return;
      }

      store.saveUpdateLog(logEntry);
      res.json({ success: true, message: 'Update log saved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

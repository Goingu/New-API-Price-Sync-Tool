import { Router, Request, Response } from 'express';
import { SQLiteStore } from '../services/sqliteStore.js';

export function createSettingsRouter(store: SQLiteStore): Router {
  const router = Router();

  // Get connection settings
  router.get('/connection', (_req: Request, res: Response) => {
    try {
      const settings = store.getConnectionSettings();
      res.json({ success: true, data: settings });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Save connection settings
  router.post('/connection', (req: Request, res: Response) => {
    try {
      const { baseUrl, apiKey, channelId, userId } = req.body;

      if (!baseUrl || typeof baseUrl !== 'string') {
        res.status(400).json({ success: false, error: 'baseUrl is required' });
        return;
      }

      if (!apiKey || typeof apiKey !== 'string') {
        res.status(400).json({ success: false, error: 'apiKey is required' });
        return;
      }

      store.saveConnectionSettings({
        baseUrl,
        apiKey,
        channelId: channelId || undefined,
        userId: userId || undefined,
      });

      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Delete connection settings
  router.delete('/connection', (_req: Request, res: Response) => {
    try {
      store.deleteConnectionSettings();
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  return router;
}

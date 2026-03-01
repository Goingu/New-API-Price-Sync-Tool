import { Router, Request, Response } from 'express';
import { SQLiteStore } from '../services/sqliteStore.js';

export function createChannelSourceRatesRouter(store: SQLiteStore): Router {
  const router = Router();

  // Get all channel source price rates
  router.get('/', (_req: Request, res: Response) => {
    try {
      const rates = store.getChannelSourcePriceRates();
      res.json({ success: true, data: rates });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Set/update channel source price rate
  router.put('/:sourceId', (req: Request<{ sourceId: string }>, res: Response) => {
    try {
      const sourceId = parseInt(req.params.sourceId, 10);
      const { sourceName, rate } = req.body;

      if (isNaN(sourceId)) {
        res.status(400).json({ success: false, error: 'Invalid sourceId' });
        return;
      }

      if (!sourceName || typeof sourceName !== 'string') {
        res.status(400).json({ success: false, error: 'sourceName is required' });
        return;
      }

      if (typeof rate !== 'number' || rate <= 0) {
        res.status(400).json({ success: false, error: 'rate must be a positive number' });
        return;
      }

      store.setChannelSourcePriceRate(sourceId, sourceName, rate);
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Delete channel source price rate
  router.delete('/:sourceId', (req: Request<{ sourceId: string }>, res: Response) => {
    try {
      const sourceId = parseInt(req.params.sourceId, 10);

      if (isNaN(sourceId)) {
        res.status(400).json({ success: false, error: 'Invalid sourceId' });
        return;
      }

      store.deleteChannelSourcePriceRate(sourceId);
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: msg });
    }
  });

  return router;
}

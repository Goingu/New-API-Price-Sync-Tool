import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SQLiteStore } from './services/sqliteStore.js';
import { createProxyRouter } from './routes/proxy.js';
import { createPricesRouter } from './routes/prices.js';
import { createLogsRouter } from './routes/logs.js';
import { createChannelsRouter } from './routes/channels.js';
import { createChannelSourcesRouter } from './routes/channelSources.js';
import { createCheckinRouter } from './routes/checkin.js';
import { CheckinService } from './services/checkinService.js';
import { CheckinScheduler } from './services/checkinScheduler.js';
import { createLivenessRouter } from './routes/liveness.js';
import { LivenessService } from './services/livenessService.js';
import { LivenessScheduler } from './services/livenessScheduler.js';
import { PriorityService } from './services/priorityService.js';
import { PriorityScheduler } from './services/priorityScheduler.js';
import { createPriorityRouter } from './routes/priority.js';
import { CacheCleanupScheduler } from './services/cacheCleanupScheduler.js';
import { createSettingsRouter } from './routes/settings.js';
import { createChannelSourceRatesRouter } from './routes/channelSourceRates.js';
import { SplitService } from './services/splitService.js';
import { createChannelSplitRouter } from './routes/channelSplit.js';
import { createModelGroupRouter } from './routes/modelGroups.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Initialize SQLite store
const store = new SQLiteStore();

// Initialize checkin service and scheduler
const checkinService = new CheckinService(store);
const checkinScheduler = new CheckinScheduler(checkinService, store);

// Initialize liveness service and scheduler
const livenessService = new LivenessService(store);
const livenessScheduler = new LivenessScheduler(livenessService, store);

// Initialize priority service and scheduler
const priorityService = new PriorityService(store);
const priorityScheduler = new PriorityScheduler(priorityService, store);

// Initialize split service
const splitService = new SplitService(store);

// Initialize cache cleanup scheduler
const cacheCleanupScheduler = new CacheCleanupScheduler(store);

// Create Express app
const app = express();

// CORS — allow all origins for dev
app.use(cors());

// JSON body parser with increased limit for large payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount routes
app.use('/api/proxy', createProxyRouter());
app.use('/api/prices', createPricesRouter(store));
app.use('/api/logs', createLogsRouter(store));

// Channels router has two mount points:
// - POST /api/proxy/channels  (proxied channel fetch)
// - POST /api/channels/compare (local comparison)
const channelsRouter = createChannelsRouter();
app.use('/api', channelsRouter);       // handles /api/proxy/channels
app.use('/api/channels', channelsRouter); // handles /api/channels/compare

// Checkin routes
app.use('/api/checkin', createCheckinRouter(store, checkinService, checkinScheduler));

// Liveness routes
app.use('/api/liveness', createLivenessRouter(store, livenessService, livenessScheduler));

// Channel sources routes
app.use('/api/channel-sources', createChannelSourcesRouter(store));

// Priority routes
app.use('/api/priority', createPriorityRouter(priorityService, priorityScheduler));

// Channel source rates routes
app.use('/api/channel-source-rates', createChannelSourceRatesRouter(store));

// Settings routes
app.use('/api/settings', createSettingsRouter(store));

// Channel split routes
app.use('/api/channel-split', createChannelSplitRouter(splitService));

// Model group routes
app.use('/api/model-groups', createModelGroupRouter());

// Serve static files from web dist in production
if (process.env.NODE_ENV === 'production') {
  const webDistPath = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDistPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Clear all data endpoint
app.post('/api/data/clear', (_req, res) => {
  try {
    store.clearAll();
    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

// Global error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  checkinScheduler.start();
  livenessScheduler.start();
  priorityScheduler.start();
  cacheCleanupScheduler.start();
});

export { app, store };

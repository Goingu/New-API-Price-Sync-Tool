import cron, { type ScheduledTask } from 'node-cron';
import type { SQLiteStore } from './sqliteStore.js';

/**
 * Schedules periodic cleanup of expired ratio cache entries.
 * Runs daily at 3:00 AM to remove expired cache data.
 */
export class CacheCleanupScheduler {
  private task: ScheduledTask | null = null;

  constructor(private store: SQLiteStore) {}

  /**
   * Start the scheduler to run cleanup daily at 3:00 AM.
   */
  start(): void {
    if (this.task) {
      console.log('[CacheCleanupScheduler] Already running');
      return;
    }

    // Run daily at 3:00 AM
    const cronExpression = '0 3 * * *';

    this.task = cron.schedule(cronExpression, async () => {
      console.log('[CacheCleanupScheduler] Running expired cache cleanup...');
      try {
        const deleted = this.store.clearExpiredRatioCache();
        console.log(`[CacheCleanupScheduler] Cleaned up ${deleted} expired cache entries`);
      } catch (err) {
        console.error('[CacheCleanupScheduler] Error during cache cleanup:', err);
      }
    });

    console.log('[CacheCleanupScheduler] Started - will run daily at 3:00 AM');
  }

  /**
   * Stop the scheduled cleanup task.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[CacheCleanupScheduler] Stopped');
    }
  }
}

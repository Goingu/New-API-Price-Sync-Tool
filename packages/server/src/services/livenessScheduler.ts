import cron, { type ScheduledTask } from 'node-cron';
import type { CheckFrequency } from '@newapi-sync/shared';
import type { LivenessService } from './livenessService.js';
import type { SQLiteStore } from './sqliteStore.js';

/** Map CheckFrequency values to cron expressions. */
const FREQUENCY_CRON: Record<CheckFrequency, string> = {
  '30m': '*/30 * * * *',
  '1h': '0 * * * *',
  '6h': '0 */6 * * *',
  '24h': '0 0 * * *',
};

/**
 * Schedules cron jobs for each enabled liveness config based on its
 * configured frequency. Supports dynamic updates via refresh().
 */
export class LivenessScheduler {
  private tasks: Map<number, ScheduledTask> = new Map();

  constructor(
    private livenessService: LivenessService,
    private store: SQLiteStore,
  ) {}

  /**
   * Read all enabled liveness configs and schedule a cron job for each.
   */
  start(): void {
    const configs = this.store.getLivenessConfigs();

    for (const config of configs) {
      if (!config.enabled || config.id == null) continue;

      const cronExpr = FREQUENCY_CRON[config.frequency];
      if (!cronExpr) {
        console.warn(
          `[LivenessScheduler] Unknown frequency "${config.frequency}" for config ${config.id}, skipping.`,
        );
        continue;
      }

      const configId = config.id;
      const task = cron.schedule(cronExpr, async () => {
        console.log(
          `[LivenessScheduler] Running liveness check for config ${configId} (${config.name})...`,
        );
        try {
          const results = await this.livenessService.checkAllModels(configId);
          const online = results.filter((r) => r.status === 'online').length;
          const offline = results.filter((r) => r.status === 'offline').length;
          const slow = results.filter((r) => r.status === 'slow').length;
          console.log(
            `[LivenessScheduler] Config ${configId} done — ${online} online, ${slow} slow, ${offline} offline out of ${results.length} models.`,
          );
        } catch (err) {
          console.error(
            `[LivenessScheduler] Error checking config ${configId}:`,
            err,
          );
        }
      });

      this.tasks.set(configId, task);
      console.log(
        `[LivenessScheduler] Scheduled config ${configId} (${config.name}) with cron "${cronExpr}".`,
      );
    }

    if (this.tasks.size === 0) {
      console.log('[LivenessScheduler] No enabled configs to schedule.');
    }
  }

  /**
   * Stop all running cron jobs.
   */
  stop(): void {
    for (const [configId, task] of this.tasks) {
      task.stop();
      console.log(`[LivenessScheduler] Stopped task for config ${configId}.`);
    }
    this.tasks.clear();
  }

  /**
   * Re-read configs and re-register all cron jobs.
   * Call this when liveness configs are added, updated, or deleted.
   */
  refresh(): void {
    console.log('[LivenessScheduler] Refreshing scheduled tasks...');
    this.stop();
    this.start();
  }
}

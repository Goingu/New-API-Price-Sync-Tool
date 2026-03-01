import cron, { type ScheduledTask } from 'node-cron';
import type { SchedulerStatus, PriorityScheduleConfig } from '@newapi-sync/shared';
import type { PriorityService } from './priorityService.js';
import type { SQLiteStore } from './sqliteStore.js';
import type { PrioritySchedulerLike } from '../routes/priority.js';

/** Map schedule frequency values to cron expressions. */
const FREQUENCY_CRON: Record<PriorityScheduleConfig['frequency'], string> = {
  '1h': '0 */1 * * *',
  '6h': '0 */6 * * *',
  '12h': '0 */12 * * *',
  '24h': '0 0 * * *',
};

/**
 * Schedules automatic priority recalculation and application based on
 * the user-configured frequency. Follows the same pattern as
 * CheckinScheduler / LivenessScheduler.
 */
export class PriorityScheduler implements PrioritySchedulerLike {
  private task: ScheduledTask | null = null;
  private lastRunAt: string | undefined;
  private lastRunResult: string | undefined;

  constructor(
    private priorityService: PriorityService,
    private store: SQLiteStore,
  ) {}

  /**
   * Start the scheduler by reading the current schedule config from
   * SQLiteStore. If enabled, creates a cron job at the configured frequency.
   */
  start(): void {
    console.log('[PriorityScheduler] Starting...');
    this.scheduleFromConfig();
  }

  /**
   * Refresh the scheduled task after a config change.
   * Stops the existing task (if any) and re-reads config.
   */
  refresh(): void {
    console.log('[PriorityScheduler] Refreshing scheduled task...');
    this.stopTask();
    this.scheduleFromConfig();
  }

  /**
   * Stop all scheduled tasks.
   */
  stop(): void {
    this.stopTask();
    console.log('[PriorityScheduler] Stopped.');
  }

  /**
   * Return the current scheduler status including last/next run times.
   */
  getStatus(): SchedulerStatus {
    const config = this.store.getScheduleConfig();

    let nextRunAt: string | undefined;
    if (this.task) {
      try {
        nextRunAt = this.computeNextRun(config.frequency);
      } catch {
        // ignore
      }
    }

    return {
      enabled: config.enabled,
      frequency: config.frequency,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      nextRunAt,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────

  private stopTask(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[PriorityScheduler] Stopped existing task.');
    }
  }

  private scheduleFromConfig(): void {
    const config = this.store.getScheduleConfig();

    if (!config.enabled) {
      console.log('[PriorityScheduler] Scheduling disabled, no task created.');
      return;
    }

    const cronExpr = FREQUENCY_CRON[config.frequency];
    if (!cronExpr) {
      console.warn(
        `[PriorityScheduler] Unknown frequency "${config.frequency}", skipping.`,
      );
      return;
    }

    this.task = cron.schedule(cronExpr, async () => {
      await this.executePriorityRun();
    });

    console.log(
      `[PriorityScheduler] Scheduled with frequency "${config.frequency}" (cron: ${cronExpr}).`,
    );
  }

  /**
   * Execute a single priority calculation + apply cycle.
   * Reads connection settings from the first enabled channel source.
   */
  private async executePriorityRun(): Promise<void> {
    console.log('[PriorityScheduler] Running scheduled priority adjustment...');
    const runStartedAt = new Date().toISOString();

    try {
      // Get connection settings from the first enabled channel source
      const sources = this.store.getChannelSources();
      const enabledSource = sources.find((s) => s.enabled);

      if (!enabledSource) {
        const msg = 'No enabled channel source found, skipping scheduled run.';
        console.warn(`[PriorityScheduler] ${msg}`);
        this.lastRunAt = runStartedAt;
        this.lastRunResult = msg;
        return;
      }

      const connection = {
        baseUrl: enabledSource.baseUrl,
        apiKey: enabledSource.apiKey,
        userId: enabledSource.userId,
      };

      // Calculate priorities
      const result = await this.priorityService.calculate(connection);

      if (result.changedChannels > 0) {
        // Apply changes
        const applyResult = await this.priorityService.apply(
          connection,
          result.channels,
          'scheduled',
        );

        this.lastRunAt = runStartedAt;
        this.lastRunResult =
          `Applied: ${applyResult.totalSuccess} succeeded, ${applyResult.totalFailed} failed ` +
          `(${result.changedChannels} changed out of ${result.totalChannels} total)`;

        console.log(`[PriorityScheduler] ${this.lastRunResult}`);
      } else {
        // No changes — still save a log entry
        this.store.saveAdjustmentLog({
          adjustedAt: runStartedAt,
          triggerType: 'scheduled',
          hasChanges: false,
          details: result.channels,
        });

        this.lastRunAt = runStartedAt;
        this.lastRunResult =
          `No changes needed (${result.totalChannels} channels, ${result.skippedChannels} skipped)`;

        console.log(`[PriorityScheduler] ${this.lastRunResult}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PriorityScheduler] Error during scheduled run:', err);

      this.lastRunAt = runStartedAt;
      this.lastRunResult = `Error: ${message}`;

      // Log the error as an adjustment log entry
      try {
        this.store.saveAdjustmentLog({
          adjustedAt: runStartedAt,
          triggerType: 'scheduled',
          hasChanges: false,
          details: [],
        });
      } catch {
        // Ignore secondary errors when saving the error log
      }
    }
  }

  /**
   * Compute an approximate next-run ISO timestamp based on frequency.
   */
  private computeNextRun(frequency: PriorityScheduleConfig['frequency']): string {
    const now = new Date();
    const next = new Date(now);

    switch (frequency) {
      case '1h':
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        break;
      case '6h': {
        next.setMinutes(0, 0, 0);
        const nextHour6 = Math.ceil((now.getHours() + 1) / 6) * 6;
        next.setHours(nextHour6);
        if (next <= now) next.setHours(next.getHours() + 6);
        break;
      }
      case '12h': {
        next.setMinutes(0, 0, 0);
        const nextHour12 = Math.ceil((now.getHours() + 1) / 12) * 12;
        next.setHours(nextHour12);
        if (next <= now) next.setHours(next.getHours() + 12);
        break;
      }
      case '24h':
        next.setHours(0, 0, 0, 0);
        next.setDate(next.getDate() + 1);
        break;
    }

    return next.toISOString();
  }
}

import cron, { type ScheduledTask } from 'node-cron';
import type { CheckinService } from './checkinService.js';
import type { SQLiteStore } from './sqliteStore.js';

/**
 * Schedules automatic check-ins based on each target's configured time.
 * Dynamically creates and manages cron jobs for each target with autoCheckin enabled.
 */
export class CheckinScheduler {
  private tasks: Map<number, ScheduledTask> = new Map();

  constructor(
    private checkinService: CheckinService,
    private store: SQLiteStore,
  ) {}

  /**
   * Start the scheduler by loading all targets and creating cron jobs
   * for those with autoCheckin enabled.
   */
  start(): void {
    console.log('[CheckinScheduler] Starting...');
    this.refreshSchedules();
  }

  /**
   * Refresh all schedules by stopping existing jobs and creating new ones
   * based on current channel source configurations.
   */
  refreshSchedules(): void {
    // Stop all existing tasks
    for (const [id, task] of this.tasks) {
      task.stop();
      console.log(`[CheckinScheduler] Stopped task for source ${id}`);
    }
    this.tasks.clear();

    // Load all channel sources with checkin configs
    const sources = this.store.getChannelSourcesWithCheckin();
    for (const source of sources) {
      if (source.enabled && source.checkinConfig?.autoCheckin) {
        this.scheduleTarget(source.id!, source.checkinConfig.checkinTime);
      }
    }

    console.log(`[CheckinScheduler] Scheduled ${this.tasks.size} auto check-in tasks`);
  }

  /**
   * Schedule a check-in task for a specific channel source.
   * @param sourceId - The channel source ID
   * @param checkinTime - Time in HH:mm format (e.g., "08:30")
   */
  private scheduleTarget(sourceId: number, checkinTime: string): void {
    // Parse time (format: HH:mm)
    const [hour, minute] = checkinTime.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error(`[CheckinScheduler] Invalid time format for source ${sourceId}: ${checkinTime}`);
      return;
    }

    // Create cron expression: minute hour * * *
    const cronExpression = `${minute} ${hour} * * *`;

    const task = cron.schedule(cronExpression, async () => {
      console.log(`[CheckinScheduler] Running auto check-in for source ${sourceId} at ${checkinTime}`);
      try {
        const record = await this.checkinService.checkinOne(sourceId);
        if (record.success) {
          console.log(`[CheckinScheduler] Source ${sourceId} check-in succeeded`);
        } else {
          console.log(`[CheckinScheduler] Source ${sourceId} check-in failed: ${record.error}`);
        }
      } catch (err) {
        console.error(`[CheckinScheduler] Error during check-in for source ${sourceId}:`, err);
      }
    });

    this.tasks.set(sourceId, task);
    console.log(`[CheckinScheduler] Scheduled source ${sourceId} at ${checkinTime} (cron: ${cronExpression})`);
  }

  /**
   * Stop all scheduled tasks.
   */
  stop(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
      console.log(`[CheckinScheduler] Stopped task for source ${id}`);
    }
    this.tasks.clear();
    console.log('[CheckinScheduler] All tasks stopped');
  }
}

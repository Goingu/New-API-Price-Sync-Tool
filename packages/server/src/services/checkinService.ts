import axios from 'axios';
import type { CheckinRecord } from '@newapi-sync/shared';
import type { SQLiteStore } from './sqliteStore.js';

/**
 * Service responsible for executing check-in operations against
 * configured New API instances and persisting the results.
 */
export class CheckinService {
  constructor(private store: SQLiteStore) {}

  /**
   * Execute check-in for a single target by ID.
   *
   * 1. Fetch the target from the store
   * 2. POST to {baseUrl}/api/user/checkin with Bearer token
   * 3. Save the result (success or failure) to SQLite
   * 4. Return the CheckinRecord
   */
  async checkinOne(targetId: number): Promise<CheckinRecord> {
    const target = this.store.getCheckinTargetById(targetId);
    if (!target) {
      throw new Error(`Checkin target not found: ${targetId}`);
    }

    console.log(`[CheckinService] Starting checkin for target ${targetId}: ${target.name}`);

    const checkinAt = new Date().toISOString();
    const url = `${target.baseUrl.replace(/\/+$/, '')}/api/user/checkin`;

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${target.apiKey}`,
      };

      if (target.userId) {
        headers['New-Api-User'] = target.userId;
      }

      console.log(`[CheckinService] Sending request to ${url}`);

      const { data } = await axios.post(url, {}, {
        headers,
        timeout: 15_000,
      });

      console.log(`[CheckinService] Response:`, data);

      // Check if the response indicates success
      const isSuccess = data?.success !== false;
      const message = data?.message || '';

      // Extract quota info from the response
      const quota = data ? JSON.stringify(data) : undefined;

      console.log(`[CheckinService] Saving record: success=${isSuccess}, message=${message}`);

      const record = this.store.saveCheckinRecord({
        targetId,
        checkinAt,
        success: isSuccess,
        quota,
        error: isSuccess ? undefined : message,
      });

      console.log(`[CheckinService] Record saved with id ${record.id}`);

      return record;
    } catch (err: unknown) {
      console.error(`[CheckinService] Error during checkin:`, err);

      const errorMessage =
        axios.isAxiosError(err)
          ? err.response?.data?.message ?? err.message
          : err instanceof Error
            ? err.message
            : String(err);

      return this.store.saveCheckinRecord({
        targetId,
        checkinAt,
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Execute check-in for all enabled targets sequentially.
   * Only targets with enabled=true are processed.
   */
  async checkinAll(): Promise<CheckinRecord[]> {
    const targets = this.store.getCheckinTargets().filter((t) => t.enabled);
    const records: CheckinRecord[] = [];

    for (const target of targets) {
      const record = await this.checkinOne(target.id!);
      records.push(record);
    }

    return records;
  }
}

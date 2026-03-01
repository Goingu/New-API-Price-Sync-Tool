import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  PriceHistoryEntry,
  UpdateLogEntry,
  CachedPriceData,
  CheckinTarget,
  CheckinRecord,
  LivenessConfig,
  LivenessResult,
  CheckFrequency,
  HealthStatus,
  ChannelSource,
  CheckinConfig,
  ChannelSourceWithCheckin,
  ChannelPriceRateConfig,
  PriorityRule,
  PriorityScheduleConfig,
  PriorityAdjustmentLog,
  CachedRatioEntry,
  SplitHistoryEntry,
  SplitConfiguration,
  ParentChannelAction,
} from '@newapi-sync/shared';

export class SQLiteStore {
  private db: Database.Database;

  constructor(dbPath: string = './data/sync-tool.db') {
    // Ensure the data directory exists (skip for in-memory DBs)
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetched_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        models_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS update_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        updated_at TEXT NOT NULL,
        models_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS price_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cached_at TEXT NOT NULL,
        results_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkin_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        user_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        auto_checkin INTEGER NOT NULL DEFAULT 0,
        checkin_time TEXT NOT NULL DEFAULT '00:05',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkin_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_id INTEGER NOT NULL,
        checkin_at TEXT NOT NULL,
        success INTEGER NOT NULL,
        quota TEXT,
        error TEXT,
        FOREIGN KEY (target_id) REFERENCES checkin_targets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS liveness_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        user_id TEXT,
        models_json TEXT NOT NULL,
        frequency TEXT NOT NULL DEFAULT '1h',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS liveness_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time_ms INTEGER,
        error TEXT,
        FOREIGN KEY (config_id) REFERENCES liveness_configs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS channel_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        user_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        is_own_instance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkin_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL UNIQUE,
        auto_checkin INTEGER NOT NULL DEFAULT 0,
        checkin_time TEXT NOT NULL DEFAULT '00:05',
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES channel_sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS channel_price_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL UNIQUE,
        channel_name TEXT NOT NULL,
        price_rate REAL NOT NULL CHECK (price_rate > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS priority_rules (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        start_value INTEGER NOT NULL DEFAULT 100,
        step INTEGER NOT NULL DEFAULT 10,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS priority_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS priority_adjustment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adjusted_at TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        has_changes INTEGER NOT NULL DEFAULT 0,
        details_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channel_source_ratio_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL UNIQUE,
        source_name TEXT NOT NULL,
        ratio_config_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES channel_sources(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ratio_cache_expires 
        ON channel_source_ratio_cache(expires_at);

      CREATE TABLE IF NOT EXISTS channel_source_price_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL UNIQUE,
        source_name TEXT NOT NULL,
        price_rate REAL NOT NULL CHECK (price_rate > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES channel_sources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS connection_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        channel_id TEXT,
        user_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS channel_split_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        split_at TEXT NOT NULL,
        operator TEXT,
        parent_channel_id INTEGER NOT NULL,
        parent_channel_name TEXT NOT NULL,
        parent_channel_config_json TEXT NOT NULL,
        sub_channel_ids_json TEXT NOT NULL,
        model_filter_json TEXT,
        parent_action TEXT NOT NULL,
        auto_priority_enabled INTEGER NOT NULL DEFAULT 0,
        rollback_at TEXT,
        rollback_status TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_split_history_parent 
        ON channel_split_history(parent_channel_id);

      CREATE INDEX IF NOT EXISTS idx_split_history_time 
        ON channel_split_history(split_at DESC);

      CREATE TABLE IF NOT EXISTS split_configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        model_filter_json TEXT,
        naming_pattern TEXT NOT NULL DEFAULT '{parent}-拆分-{model}',
        parent_action TEXT NOT NULL DEFAULT 'disable',
        auto_priority INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_manual_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        group_name TEXT NOT NULL,
        channel_ids_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_model_manual_groups_model
        ON model_manual_groups(model_id, sort_order ASC);
    `);

    // Migration: Add user_id column to existing tables if they don't have it
    this.migrateAddUserIdColumn();

    // Migration: Fix checkin_records foreign key to reference channel_sources
    this.migrateCheckinRecordsForeignKey();

    // Migration: Add user_id to connection_settings
    this.migrateConnectionSettingsUserId();

    // Migration: Add group_name and parent_source_id to channel_sources
    this.migrateChannelSourceGroups();
  }

  private migrateChannelSourceGroups(): void {
    const columns = this.db.pragma('table_info(channel_sources)') as Array<{ name: string }>;
    const hasGroupName = columns.some((col) => col.name === 'group_name');
    const hasParentSourceId = columns.some((col) => col.name === 'parent_source_id');

    if (!hasGroupName) {
      console.log('[SQLiteStore] Adding group_name column to channel_sources...');
      this.db.exec('ALTER TABLE channel_sources ADD COLUMN group_name TEXT');
    }

    if (!hasParentSourceId) {
      console.log('[SQLiteStore] Adding parent_source_id column to channel_sources...');
      this.db.exec('ALTER TABLE channel_sources ADD COLUMN parent_source_id INTEGER REFERENCES channel_sources(id) ON DELETE SET NULL');
    }

    console.log('[SQLiteStore] Channel source groups migration completed');
  }

  private migrateAddUserIdColumn(): void {
    // Check and add user_id to checkin_targets
    const checkinColumns = this.db.pragma('table_info(checkin_targets)') as Array<{ name: string }>;
    if (!checkinColumns.some(col => col.name === 'user_id')) {
      this.db.exec('ALTER TABLE checkin_targets ADD COLUMN user_id TEXT');
    }
    if (!checkinColumns.some(col => col.name === 'auto_checkin')) {
      this.db.exec('ALTER TABLE checkin_targets ADD COLUMN auto_checkin INTEGER NOT NULL DEFAULT 0');
    }
    if (!checkinColumns.some(col => col.name === 'checkin_time')) {
      this.db.exec('ALTER TABLE checkin_targets ADD COLUMN checkin_time TEXT NOT NULL DEFAULT \'00:05\'');
    }

    // Check and add user_id to liveness_configs
    const livenessColumns = this.db.pragma('table_info(liveness_configs)') as Array<{ name: string }>;
    if (!livenessColumns.some(col => col.name === 'user_id')) {
      this.db.exec('ALTER TABLE liveness_configs ADD COLUMN user_id TEXT');
    }

    // Check and add user_id and is_own_instance to channel_sources if table exists
    try {
      const channelColumns = this.db.pragma('table_info(channel_sources)') as Array<{ name: string }>;
      if (channelColumns.length > 0) {
        if (!channelColumns.some(col => col.name === 'user_id')) {
          this.db.exec('ALTER TABLE channel_sources ADD COLUMN user_id TEXT');
        }
        if (!channelColumns.some(col => col.name === 'is_own_instance')) {
          this.db.exec('ALTER TABLE channel_sources ADD COLUMN is_own_instance INTEGER NOT NULL DEFAULT 0');
        }
        // Remove auto_checkin and checkin_time from channel_sources if they exist
        // SQLite doesn't support DROP COLUMN, so we'll just ignore them
      }
    } catch {
      // Table doesn't exist yet, will be created above
    }
  }

  private migrateCheckinRecordsForeignKey(): void {
    // SQLite doesn't support modifying foreign keys directly
    // We need to disable foreign key checks for checkin_records
    // The simplest solution is to just disable foreign key enforcement
    // since we're managing the relationships in application code

    // Check if we need to migrate by seeing if checkin_records references checkin_targets
    try {
      const foreignKeys = this.db.pragma('foreign_key_list(checkin_records)') as Array<{
        table: string;
      }>;

      // If foreign key references checkin_targets, we need to recreate the table
      if (foreignKeys.some(fk => fk.table === 'checkin_targets')) {
        console.log('[SQLiteStore] Migrating checkin_records to reference channel_sources...');

        // Disable foreign keys temporarily
        this.db.exec('PRAGMA foreign_keys = OFF');

        // Rename old table
        this.db.exec('ALTER TABLE checkin_records RENAME TO checkin_records_old');

        // Create new table with correct foreign key
        this.db.exec(`
          CREATE TABLE checkin_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id INTEGER NOT NULL,
            checkin_at TEXT NOT NULL,
            success INTEGER NOT NULL,
            quota TEXT,
            error TEXT,
            FOREIGN KEY (target_id) REFERENCES channel_sources(id) ON DELETE CASCADE
          )
        `);

        // Copy data from old table
        this.db.exec(`
          INSERT INTO checkin_records (id, target_id, checkin_at, success, quota, error)
          SELECT id, target_id, checkin_at, success, quota, error
          FROM checkin_records_old
        `);

        // Drop old table
        this.db.exec('DROP TABLE checkin_records_old');

        // Re-enable foreign keys
        this.db.exec('PRAGMA foreign_keys = ON');

        console.log('[SQLiteStore] Migration completed successfully');
      }
    } catch (error) {
      console.error('[SQLiteStore] Migration failed:', error);
      // If migration fails, just continue - the app will work without strict foreign key enforcement
    }
  }

  private migrateConnectionSettingsUserId(): void {
    try {
      const columns = this.db.pragma('table_info(connection_settings)') as Array<{ name: string }>;
      if (!columns.some(col => col.name === 'user_id')) {
        console.log('[SQLiteStore] Adding user_id column to connection_settings...');
        this.db.exec('ALTER TABLE connection_settings ADD COLUMN user_id TEXT');
        console.log('[SQLiteStore] Migration completed successfully');
      }
    } catch (error) {
      console.error('[SQLiteStore] Failed to add user_id column:', error);
    }
  }

  // --- Price History ---

  savePriceHistory(entry: PriceHistoryEntry): void {
    const stmt = this.db.prepare(
      'INSERT INTO price_history (fetched_at, provider, models_json) VALUES (?, ?, ?)'
    );
    stmt.run(entry.fetchedAt, entry.provider, JSON.stringify(entry.models));
  }

  getPriceHistory(options?: { limit?: number; provider?: string }): PriceHistoryEntry[] {
    let sql = 'SELECT id, fetched_at, provider, models_json FROM price_history';
    const params: unknown[] = [];

    if (options?.provider) {
      sql += ' WHERE provider = ?';
      params.push(options.provider);
    }

    sql += ' ORDER BY id DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      fetched_at: string;
      provider: string;
      models_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      fetchedAt: row.fetched_at,
      provider: row.provider,
      models: JSON.parse(row.models_json),
    }));
  }

  getPriceHistoryByModel(modelId: string): PriceHistoryEntry[] {
    const rows = this.db
      .prepare('SELECT id, fetched_at, provider, models_json FROM price_history ORDER BY id DESC')
      .all() as Array<{
        id: number;
        fetched_at: string;
        provider: string;
        models_json: string;
      }>;

    return rows
      .map((row) => {
        const models = JSON.parse(row.models_json);
        const filtered = models.filter(
          (m: { modelId: string }) => m.modelId === modelId
        );
        if (filtered.length === 0) return null;
        return {
          id: row.id,
          fetchedAt: row.fetched_at,
          provider: row.provider,
          models: filtered,
        } as PriceHistoryEntry;
      })
      .filter((entry): entry is PriceHistoryEntry => entry !== null);
  }

  // --- Update Logs ---

  saveUpdateLog(log: UpdateLogEntry): void {
    const stmt = this.db.prepare(
      'INSERT INTO update_logs (updated_at, models_json) VALUES (?, ?)'
    );
    stmt.run(log.updatedAt, JSON.stringify(log.modelsUpdated));
  }

  getUpdateLogs(options?: { limit?: number }): UpdateLogEntry[] {
    let sql = 'SELECT id, updated_at, models_json FROM update_logs ORDER BY id DESC';
    const params: unknown[] = [];

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      updated_at: string;
      models_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      updatedAt: row.updated_at,
      modelsUpdated: JSON.parse(row.models_json),
    }));
  }

  // --- Price Cache ---

  getCachedPrices(maxAgeMinutes: number = 30): CachedPriceData | null {
    const row = this.db
      .prepare('SELECT cached_at, results_json FROM price_cache WHERE id = 1')
      .get() as { cached_at: string; results_json: string } | undefined;

    if (!row) return null;

    const cachedAt = new Date(row.cached_at).getTime();
    const now = Date.now();
    const ageMs = now - cachedAt;

    if (ageMs > maxAgeMinutes * 60 * 1000) {
      return null;
    }

    return {
      cachedAt: row.cached_at,
      results: JSON.parse(row.results_json),
    };
  }

  setCachedPrices(data: CachedPriceData): void {
    const stmt = this.db.prepare(
      `INSERT INTO price_cache (id, cached_at, results_json)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET cached_at = excluded.cached_at, results_json = excluded.results_json`
    );
    stmt.run(data.cachedAt, JSON.stringify(data.results));
  }

  invalidateCache(): void {
    this.db.prepare('DELETE FROM price_cache WHERE id = 1').run();
  }

  // --- Checkin Targets ---

  addCheckinTarget(target: Omit<CheckinTarget, 'id' | 'createdAt'>): CheckinTarget {
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(
      'INSERT INTO checkin_targets (name, base_url, api_key, user_id, enabled, auto_checkin, checkin_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      target.name,
      target.baseUrl,
      target.apiKey,
      target.userId ?? null,
      target.enabled ? 1 : 0,
      target.checkinConfig?.autoCheckin ? 1 : 0,
      target.checkinConfig?.checkinTime ?? '00:05',
      createdAt
    );
    return {
      id: result.lastInsertRowid as number,
      name: target.name,
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      userId: target.userId,
      enabled: target.enabled,
      checkinConfig: {
        sourceId: result.lastInsertRowid as number,
        autoCheckin: target.checkinConfig?.autoCheckin ?? false,
        checkinTime: target.checkinConfig?.checkinTime ?? '00:05',
        createdAt
      },
      createdAt,
    };
  }

  updateCheckinTarget(id: number, updates: Partial<Omit<CheckinTarget, 'id' | 'createdAt'>>): CheckinTarget {
    const existing = this.getCheckinTargetById(id);
    if (!existing) {
      throw new Error(`Checkin target with id ${id} not found`);
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.baseUrl !== undefined) {
      fields.push('base_url = ?');
      params.push(updates.baseUrl);
    }
    if (updates.apiKey !== undefined) {
      fields.push('api_key = ?');
      params.push(updates.apiKey);
    }
    if (updates.userId !== undefined) {
      fields.push('user_id = ?');
      params.push(updates.userId ?? null);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.checkinConfig?.autoCheckin !== undefined) {
      fields.push('auto_checkin = ?');
      params.push(updates.checkinConfig.autoCheckin ? 1 : 0);
    }
    if (updates.checkinConfig?.checkinTime !== undefined) {
      fields.push('checkin_time = ?');
      params.push(updates.checkinConfig.checkinTime);
    }

    if (fields.length > 0) {
      params.push(id);
      this.db.prepare(`UPDATE checkin_targets SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    return this.getCheckinTargetById(id)!;
  }

  deleteCheckinTarget(id: number): void {
    this.db.prepare('DELETE FROM checkin_targets WHERE id = ?').run(id);
  }

  getCheckinTargets(): CheckinTarget[] {
    const rows = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, enabled, auto_checkin, checkin_time, created_at FROM checkin_targets ORDER BY id ASC')
      .all() as Array<{
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        enabled: number;
        auto_checkin: number;
        checkin_time: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      enabled: row.enabled === 1,
      autoCheckin: row.auto_checkin === 1,
      checkinTime: row.checkin_time,
      createdAt: row.created_at,
    }));
  }

  getCheckinTargetById(id: number): CheckinTarget | null {
    // Query from channel_sources and join with checkin_configs
    const row = this.db
      .prepare(`
        SELECT
          cs.id, cs.name, cs.base_url, cs.api_key, cs.user_id, cs.enabled, cs.created_at,
          cc.auto_checkin, cc.checkin_time
        FROM channel_sources cs
        LEFT JOIN checkin_configs cc ON cs.id = cc.source_id
        WHERE cs.id = ?
      `)
      .get(id) as {
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        enabled: number;
        created_at: string;
        auto_checkin: number | null;
        checkin_time: string | null;
      } | undefined;

    if (!row) return null;

    const result: CheckinTarget = {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    };

    // Add checkin config if exists
    if (row.auto_checkin !== null && row.checkin_time !== null) {
      result.checkinConfig = {
        sourceId: row.id,
        autoCheckin: row.auto_checkin === 1,
        checkinTime: row.checkin_time,
        createdAt: row.created_at,
      };
    }

    return result;
  }

  // --- Checkin Records ---

  saveCheckinRecord(record: Omit<CheckinRecord, 'id'>): CheckinRecord {
    const stmt = this.db.prepare(
      'INSERT INTO checkin_records (target_id, checkin_at, success, quota, error) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      record.targetId,
      record.checkinAt,
      record.success ? 1 : 0,
      record.quota ?? null,
      record.error ?? null
    );
    return {
      id: result.lastInsertRowid as number,
      ...record,
    };
  }

  getCheckinRecords(targetId?: number, limit?: number): CheckinRecord[] {
    let sql = 'SELECT id, target_id, checkin_at, success, quota, error FROM checkin_records';
    const params: unknown[] = [];

    if (targetId !== undefined) {
      sql += ' WHERE target_id = ?';
      params.push(targetId);
    }

    sql += ' ORDER BY id DESC';

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      target_id: number;
      checkin_at: string;
      success: number;
      quota: string | null;
      error: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      targetId: row.target_id,
      checkinAt: row.checkin_at,
      success: row.success === 1,
      quota: row.quota ?? undefined,
      error: row.error ?? undefined,
    }));
  }

  getLatestCheckinRecord(targetId: number): CheckinRecord | null {
    const row = this.db
      .prepare(
        'SELECT id, target_id, checkin_at, success, quota, error FROM checkin_records WHERE target_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(targetId) as {
        id: number;
        target_id: number;
        checkin_at: string;
        success: number;
        quota: string | null;
        error: string | null;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      targetId: row.target_id,
      checkinAt: row.checkin_at,
      success: row.success === 1,
      quota: row.quota ?? undefined,
      error: row.error ?? undefined,
    };
  }

  // --- Liveness Configs ---

  addLivenessConfig(config: Omit<LivenessConfig, 'id' | 'createdAt'>): LivenessConfig {
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(
      'INSERT INTO liveness_configs (name, base_url, api_key, user_id, models_json, frequency, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      config.name,
      config.baseUrl,
      config.apiKey,
      config.userId ?? null,
      JSON.stringify(config.models),
      config.frequency,
      config.enabled ? 1 : 0,
      createdAt
    );
    return {
      id: result.lastInsertRowid as number,
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      userId: config.userId,
      models: config.models,
      frequency: config.frequency,
      enabled: config.enabled,
      createdAt,
    };
  }

  updateLivenessConfig(id: number, updates: Partial<Omit<LivenessConfig, 'id' | 'createdAt'>>): LivenessConfig {
    const existing = this.getLivenessConfigById(id);
    if (!existing) {
      throw new Error(`Liveness config with id ${id} not found`);
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.baseUrl !== undefined) {
      fields.push('base_url = ?');
      params.push(updates.baseUrl);
    }
    if (updates.apiKey !== undefined) {
      fields.push('api_key = ?');
      params.push(updates.apiKey);
    }
    if (updates.userId !== undefined) {
      fields.push('user_id = ?');
      params.push(updates.userId ?? null);
    }
    if (updates.models !== undefined) {
      fields.push('models_json = ?');
      params.push(JSON.stringify(updates.models));
    }
    if (updates.frequency !== undefined) {
      fields.push('frequency = ?');
      params.push(updates.frequency);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    if (fields.length > 0) {
      params.push(id);
      this.db.prepare(`UPDATE liveness_configs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    return this.getLivenessConfigById(id)!;
  }

  deleteLivenessConfig(id: number): void {
    this.db.prepare('DELETE FROM liveness_configs WHERE id = ?').run(id);
  }

  getLivenessConfigs(): LivenessConfig[] {
    const rows = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, models_json, frequency, enabled, created_at FROM liveness_configs ORDER BY id ASC')
      .all() as Array<{
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        models_json: string;
        frequency: string;
        enabled: number;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      models: JSON.parse(row.models_json) as string[],
      frequency: row.frequency as CheckFrequency,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    }));
  }

  getLivenessConfigById(id: number): LivenessConfig | null {
    const row = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, models_json, frequency, enabled, created_at FROM liveness_configs WHERE id = ?')
      .get(id) as {
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        models_json: string;
        frequency: string;
        enabled: number;
        created_at: string;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      models: JSON.parse(row.models_json) as string[],
      frequency: row.frequency as CheckFrequency,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    };
  }

  // --- Liveness Results ---

  saveLivenessResult(result: Omit<LivenessResult, 'id'>): LivenessResult {
    const stmt = this.db.prepare(
      'INSERT INTO liveness_results (config_id, model_id, checked_at, status, response_time_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const dbResult = stmt.run(
      result.configId,
      result.modelId,
      result.checkedAt,
      result.status,
      result.responseTimeMs ?? null,
      result.error ?? null
    );
    return {
      id: dbResult.lastInsertRowid as number,
      ...result,
    };
  }

  getLivenessResults(options?: { configId?: number; modelId?: string; limit?: number }): LivenessResult[] {
    let sql = 'SELECT id, config_id, model_id, checked_at, status, response_time_ms, error FROM liveness_results';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.configId !== undefined) {
      conditions.push('config_id = ?');
      params.push(options.configId);
    }
    if (options?.modelId !== undefined) {
      conditions.push('model_id = ?');
      params.push(options.modelId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id DESC';

    if (options?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      config_id: number;
      model_id: string;
      checked_at: string;
      status: string;
      response_time_ms: number | null;
      error: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      configId: row.config_id,
      modelId: row.model_id,
      checkedAt: row.checked_at,
      status: row.status as HealthStatus,
      responseTimeMs: row.response_time_ms ?? undefined,
      error: row.error ?? undefined,
    }));
  }

  getLatestLivenessResults(configId: number): LivenessResult[] {
    // Get the latest result for each model in the given config
    const rows = this.db
      .prepare(
        `SELECT lr.id, lr.config_id, lr.model_id, lr.checked_at, lr.status, lr.response_time_ms, lr.error
         FROM liveness_results lr
         INNER JOIN (
           SELECT model_id, MAX(id) as max_id
           FROM liveness_results
           WHERE config_id = ?
           GROUP BY model_id
         ) latest ON lr.id = latest.max_id
         ORDER BY lr.model_id ASC`
      )
      .all(configId) as Array<{
        id: number;
        config_id: number;
        model_id: string;
        checked_at: string;
        status: string;
        response_time_ms: number | null;
        error: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      configId: row.config_id,
      modelId: row.model_id,
      checkedAt: row.checked_at,
      status: row.status as HealthStatus,
      responseTimeMs: row.response_time_ms ?? undefined,
      error: row.error ?? undefined,
    }));
  }

  // --- Cleanup ---

  clearAll(): void {
    this.db.exec(`
      DELETE FROM price_history;
      DELETE FROM update_logs;
      DELETE FROM price_cache;
      DELETE FROM checkin_records;
      DELETE FROM checkin_targets;
      DELETE FROM liveness_results;
      DELETE FROM liveness_configs;
      DELETE FROM channel_sources;
    `);
  }

  // --- Channel Sources ---

  addChannelSource(source: Omit<ChannelSource, 'id' | 'createdAt'>): ChannelSource {
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(
      'INSERT INTO channel_sources (name, base_url, api_key, user_id, enabled, is_own_instance, group_name, parent_source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      source.name,
      source.baseUrl,
      source.apiKey,
      source.userId ?? null,
      source.enabled ? 1 : 0,
      source.isOwnInstance ? 1 : 0,
      source.groupName ?? null,
      source.parentSourceId ?? null,
      createdAt
    );
    return {
      id: result.lastInsertRowid as number,
      name: source.name,
      baseUrl: source.baseUrl,
      apiKey: source.apiKey,
      userId: source.userId,
      enabled: source.enabled,
      isOwnInstance: source.isOwnInstance,
      groupName: source.groupName,
      parentSourceId: source.parentSourceId,
      createdAt,
    };
  }

  updateChannelSource(id: number, updates: Partial<Omit<ChannelSource, 'id' | 'createdAt'>>): ChannelSource {
    const existing = this.getChannelSourceById(id);
    if (!existing) {
      throw new Error(`Channel source with id ${id} not found`);
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.baseUrl !== undefined) {
      fields.push('base_url = ?');
      params.push(updates.baseUrl);
    }
    if (updates.apiKey !== undefined) {
      fields.push('api_key = ?');
      params.push(updates.apiKey);
    }
    if (updates.userId !== undefined) {
      fields.push('user_id = ?');
      params.push(updates.userId ?? null);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.isOwnInstance !== undefined) {
      fields.push('is_own_instance = ?');
      params.push(updates.isOwnInstance ? 1 : 0);
    }
    if (updates.groupName !== undefined) {
      fields.push('group_name = ?');
      params.push(updates.groupName ?? null);
    }
    if (updates.parentSourceId !== undefined) {
      fields.push('parent_source_id = ?');
      params.push(updates.parentSourceId ?? null);
    }

    if (fields.length > 0) {
      params.push(id);
      this.db.prepare(`UPDATE channel_sources SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    return this.getChannelSourceById(id)!;
  }

  deleteChannelSource(id: number): void {
    this.db.prepare('DELETE FROM channel_sources WHERE id = ?').run(id);
  }

  getChannelSources(): ChannelSource[] {
    const rows = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, enabled, is_own_instance, group_name, parent_source_id, created_at FROM channel_sources ORDER BY id ASC')
      .all() as Array<{
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        enabled: number;
        is_own_instance: number;
        group_name: string | null;
        parent_source_id: number | null;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      enabled: Boolean(row.enabled),
      isOwnInstance: Boolean(row.is_own_instance),
      groupName: row.group_name ?? undefined,
      parentSourceId: row.parent_source_id ?? undefined,
      createdAt: row.created_at,
    }));
  }
      enabled: row.enabled === 1,
      isOwnInstance: row.is_own_instance === 1,
      createdAt: row.created_at,
    }));
  }

  getChannelSourceById(id: number): ChannelSource | null {
    const row = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, enabled, is_own_instance, group_name, parent_source_id, created_at FROM channel_sources WHERE id = ?')
      .get(id) as {
        id: number;
        name: string;
        base_url: string;
        api_key: string;
        user_id: string | null;
        enabled: number;
        is_own_instance: number;
        group_name: string | null;
        parent_source_id: number | null;
        created_at: string;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      enabled: Boolean(row.enabled),
      isOwnInstance: Boolean(row.is_own_instance),
      groupName: row.group_name ?? undefined,
      parentSourceId: row.parent_source_id ?? undefined,
      createdAt: row.created_at,
    };
  }
      userId: row.user_id ?? undefined,
      enabled: row.enabled === 1,
      isOwnInstance: row.is_own_instance === 1,
      createdAt: row.created_at,
    };
  }

  // --- Checkin Configs ---

  getCheckinConfig(sourceId: number): CheckinConfig | null {
    const row = this.db
      .prepare('SELECT id, source_id, auto_checkin, checkin_time, created_at FROM checkin_configs WHERE source_id = ?')
      .get(sourceId) as {
        id: number;
        source_id: number;
        auto_checkin: number;
        checkin_time: string;
        created_at: string;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sourceId: row.source_id,
      autoCheckin: row.auto_checkin === 1,
      checkinTime: row.checkin_time,
      createdAt: row.created_at,
    };
  }

  setCheckinConfig(config: Omit<CheckinConfig, 'id' | 'createdAt'>): CheckinConfig {
    const existing = this.getCheckinConfig(config.sourceId);

    if (existing) {
      // Update existing config
      this.db.prepare(
        'UPDATE checkin_configs SET auto_checkin = ?, checkin_time = ? WHERE source_id = ?'
      ).run(
        config.autoCheckin ? 1 : 0,
        config.checkinTime,
        config.sourceId
      );
      return this.getCheckinConfig(config.sourceId)!;
    } else {
      // Insert new config
      const createdAt = new Date().toISOString();
      const stmt = this.db.prepare(
        'INSERT INTO checkin_configs (source_id, auto_checkin, checkin_time, created_at) VALUES (?, ?, ?, ?)'
      );
      const result = stmt.run(
        config.sourceId,
        config.autoCheckin ? 1 : 0,
        config.checkinTime,
        createdAt
      );
      return {
        id: result.lastInsertRowid as number,
        sourceId: config.sourceId,
        autoCheckin: config.autoCheckin,
        checkinTime: config.checkinTime,
        createdAt,
      };
    }
  }

  deleteCheckinConfig(sourceId: number): void {
    this.db.prepare('DELETE FROM checkin_configs WHERE source_id = ?').run(sourceId);
  }

  getChannelSourcesWithCheckin(): ChannelSourceWithCheckin[] {
    const sources = this.getChannelSources();
    return sources.map(source => {
      const checkinConfig = this.getCheckinConfig(source.id!);
      return {
        ...source,
        checkinConfig: checkinConfig ?? undefined,
      };
    });
  }

  // ─── Channel Price Rates ───────────────────────────────────────────

  getPriceRates(): ChannelPriceRateConfig[] {
    const rows = this.db
      .prepare(
        'SELECT channel_id, channel_name, price_rate, created_at, updated_at FROM channel_price_rates ORDER BY channel_id ASC'
      )
      .all() as Array<{
        channel_id: number;
        channel_name: string;
        price_rate: number;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      channelId: row.channel_id,
      channelName: row.channel_name,
      priceRate: row.price_rate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  setPriceRate(channelId: number, channelName: string, priceRate: number): void {
    if (priceRate <= 0) {
      throw new Error('priceRate must be greater than 0');
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO channel_price_rates (channel_id, channel_name, price_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET
           channel_name = excluded.channel_name,
           price_rate = excluded.price_rate,
           updated_at = excluded.updated_at`
      )
      .run(channelId, channelName, priceRate, now, now);
  }

  deletePriceRate(channelId: number): void {
    this.db.prepare('DELETE FROM channel_price_rates WHERE channel_id = ?').run(channelId);
  }

  // ─── Channel Source Price Rates ────────────────────────────────────

  getChannelSourcePriceRates(): Array<{ sourceId: number; sourceName: string; priceRate: number; createdAt: string; updatedAt: string }> {
    const rows = this.db
      .prepare(
        'SELECT source_id, source_name, price_rate, created_at, updated_at FROM channel_source_price_rates ORDER BY source_id ASC'
      )
      .all() as Array<{
        source_id: number;
        source_name: string;
        price_rate: number;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      sourceId: row.source_id,
      sourceName: row.source_name,
      priceRate: row.price_rate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  setChannelSourcePriceRate(sourceId: number, sourceName: string, priceRate: number): void {
    if (priceRate <= 0) {
      throw new Error('priceRate must be greater than 0');
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO channel_source_price_rates (source_id, source_name, price_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           source_name = excluded.source_name,
           price_rate = excluded.price_rate,
           updated_at = excluded.updated_at`
      )
      .run(sourceId, sourceName, priceRate, now, now);
  }

  deleteChannelSourcePriceRate(sourceId: number): void {
    this.db.prepare('DELETE FROM channel_source_price_rates WHERE source_id = ?').run(sourceId);
  }

  // ─── Priority Rules & Settings ──────────────────────────────────────

  getRule(): PriorityRule {
    const row = this.db
      .prepare('SELECT start_value, step FROM priority_rules WHERE id = 1')
      .get() as { start_value: number; step: number } | undefined;

    if (!row) {
      return { startValue: 100, step: 10 };
    }

    return { startValue: row.start_value, step: row.step };
  }

  setRule(rule: PriorityRule): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO priority_rules (id, start_value, step, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           start_value = excluded.start_value,
           step = excluded.step,
           updated_at = excluded.updated_at`
      )
      .run(rule.startValue, rule.step, now);
  }

  getAutoMode(): boolean {
    const row = this.db
      .prepare("SELECT value FROM priority_settings WHERE key = 'auto_mode'")
      .get() as { value: string } | undefined;

    return row?.value === 'true';
  }

  setAutoMode(enabled: boolean): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO priority_settings (key, value, updated_at)
         VALUES ('auto_mode', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(String(enabled), now);
  }

  getScheduleConfig(): PriorityScheduleConfig {
    const rows = this.db
      .prepare("SELECT key, value FROM priority_settings WHERE key IN ('schedule_enabled', 'schedule_frequency')")
      .all() as Array<{ key: string; value: string }>;

    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
      enabled: map.get('schedule_enabled') === 'true',
      frequency: (map.get('schedule_frequency') as PriorityScheduleConfig['frequency']) || '24h',
    };
  }

  setScheduleConfig(config: PriorityScheduleConfig): void {
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      `INSERT INTO priority_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    );

    const setAll = this.db.transaction(() => {
      upsert.run('schedule_enabled', String(config.enabled), now);
      upsert.run('schedule_frequency', config.frequency, now);
    });

    setAll();
  }

  saveAdjustmentLog(log: Omit<PriorityAdjustmentLog, 'id'>): PriorityAdjustmentLog {
    const stmt = this.db.prepare(
      `INSERT INTO priority_adjustment_logs (adjusted_at, trigger_type, has_changes, details_json)
       VALUES (?, ?, ?, ?)`
    );

    const result = stmt.run(
      log.adjustedAt,
      log.triggerType,
      log.hasChanges ? 1 : 0,
      JSON.stringify(log.details)
    );

    return {
      id: result.lastInsertRowid as number,
      adjustedAt: log.adjustedAt,
      triggerType: log.triggerType,
      hasChanges: log.hasChanges,
      details: log.details,
    };
  }

  getAdjustmentLogs(limit?: number): PriorityAdjustmentLog[] {
    let sql = 'SELECT * FROM priority_adjustment_logs ORDER BY adjusted_at DESC';
    const params: unknown[] = [];

    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      adjusted_at: string;
      trigger_type: string;
      has_changes: number;
      details_json: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      adjustedAt: row.adjusted_at,
      triggerType: row.trigger_type as 'manual' | 'scheduled',
      hasChanges: row.has_changes === 1,
      details: JSON.parse(row.details_json),
    }));
  }

  getAdjustmentLogById(id: number): PriorityAdjustmentLog | null {
    const row = this.db
      .prepare('SELECT * FROM priority_adjustment_logs WHERE id = ?')
      .get(id) as {
        id: number;
        adjusted_at: string;
        trigger_type: string;
        has_changes: number;
        details_json: string;
      } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      adjustedAt: row.adjusted_at,
      triggerType: row.trigger_type as 'manual' | 'scheduled',
      hasChanges: row.has_changes === 1,
      details: JSON.parse(row.details_json),
    };
  }

  // ─── Channel Source Ratio Cache ─────────────────────────────────────

  /**
   * Save or update a cached ratio entry (upsert operation).
   * Uses INSERT OR REPLACE to ensure only one entry per source_id.
   */
  saveCachedRatio(entry: Omit<CachedRatioEntry, 'id'>): void {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO channel_source_ratio_cache 
         (source_id, source_name, ratio_config_json, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           source_name = excluded.source_name,
           ratio_config_json = excluded.ratio_config_json,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`
      );
      
      stmt.run(
        entry.sourceId,
        entry.sourceName,
        JSON.stringify(entry.ratioConfig),
        entry.fetchedAt,
        entry.expiresAt
      );
    } catch (error) {
      console.error('[SQLiteStore] Failed to save cached ratio:', error);
      throw error;
    }
  }

  /**
   * Get all cached ratios that haven't expired yet.
   * Automatically filters out entries where expires_at < current time.
   */
  getCachedRatios(maxAgeHours: number = 24): CachedRatioEntry[] {
    try {
      const now = new Date().toISOString();
      const rows = this.db
        .prepare(
          `SELECT id, source_id, source_name, ratio_config_json, fetched_at, expires_at
           FROM channel_source_ratio_cache
           WHERE expires_at > ?
           ORDER BY source_id ASC`
        )
        .all(now) as Array<{
          id: number;
          source_id: number;
          source_name: string;
          ratio_config_json: string;
          fetched_at: string;
          expires_at: string;
        }>;

      const parsedEntries: Array<CachedRatioEntry | null> = rows.map((row) => {
        try {
          return {
            id: row.id,
            sourceId: row.source_id,
            sourceName: row.source_name,
            ratioConfig: JSON.parse(row.ratio_config_json),
            fetchedAt: row.fetched_at,
            expiresAt: row.expires_at,
          };
        } catch (parseError) {
          console.error(`[SQLiteStore] Failed to parse ratio config for source ${row.source_id}:`, parseError);
          // Skip corrupted entries
          return null;
        }
      });

      return parsedEntries.filter((entry): entry is CachedRatioEntry => entry !== null);
    } catch (error) {
      console.error('[SQLiteStore] Failed to get cached ratios:', error);
      return [];
    }
  }

  /**
   * Get cached ratio for a specific source by ID.
   * Returns null if not found or expired.
   */
  getCachedRatioBySourceId(sourceId: number): CachedRatioEntry | null {
    try {
      const now = new Date().toISOString();
      const row = this.db
        .prepare(
          `SELECT id, source_id, source_name, ratio_config_json, fetched_at, expires_at
           FROM channel_source_ratio_cache
           WHERE source_id = ? AND expires_at > ?`
        )
        .get(sourceId, now) as {
          id: number;
          source_id: number;
          source_name: string;
          ratio_config_json: string;
          fetched_at: string;
          expires_at: string;
        } | undefined;

      if (!row) return null;

      try {
        return {
          id: row.id,
          sourceId: row.source_id,
          sourceName: row.source_name,
          ratioConfig: JSON.parse(row.ratio_config_json),
          fetchedAt: row.fetched_at,
          expiresAt: row.expires_at,
        };
      } catch (parseError) {
        console.error(`[SQLiteStore] Failed to parse ratio config for source ${sourceId}:`, parseError);
        return null;
      }
    } catch (error) {
      console.error(`[SQLiteStore] Failed to get cached ratio for source ${sourceId}:`, error);
      return null;
    }
  }

  /**
   * Delete cached ratio for a specific source.
   */
  deleteCachedRatio(sourceId: number): void {
    try {
      this.db.prepare('DELETE FROM channel_source_ratio_cache WHERE source_id = ?').run(sourceId);
    } catch (error) {
      console.error(`[SQLiteStore] Failed to delete cached ratio for source ${sourceId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all expired ratio cache entries.
   * Returns the number of deleted entries.
   */
  clearExpiredRatioCache(): number {
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare('DELETE FROM channel_source_ratio_cache WHERE expires_at <= ?')
        .run(now);
      return result.changes;
    } catch (error) {
      console.error('[SQLiteStore] Failed to clear expired ratio cache:', error);
      return 0;
    }
  }

  // ─── Connection Settings ────────────────────────────────────────────

  /**
   * Get the saved connection settings from database.
   * Returns null if no settings are saved.
   */
  getConnectionSettings(): { baseUrl: string; apiKey: string; channelId?: string; userId?: string } | null {
    try {
      const row = this.db
        .prepare('SELECT base_url, api_key, channel_id, user_id FROM connection_settings WHERE id = 1')
        .get() as {
          base_url: string;
          api_key: string;
          channel_id: string | null;
          user_id: string | null;
        } | undefined;

      if (!row) return null;

      return {
        baseUrl: row.base_url,
        apiKey: row.api_key,
        channelId: row.channel_id ?? undefined,
        userId: row.user_id ?? undefined,
      };
    } catch (error) {
      console.error('[SQLiteStore] Failed to get connection settings:', error);
      return null;
    }
  }

  /**
   * Save or update connection settings (upsert operation).
   */
  saveConnectionSettings(settings: { baseUrl: string; apiKey: string; channelId?: string; userId?: string }): void {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(
        `INSERT INTO connection_settings (id, base_url, api_key, channel_id, user_id, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           base_url = excluded.base_url,
           api_key = excluded.api_key,
           channel_id = excluded.channel_id,
           user_id = excluded.user_id,
           updated_at = excluded.updated_at`
      );
      
      stmt.run(
        settings.baseUrl,
        settings.apiKey,
        settings.channelId ?? null,
        settings.userId ?? null,
        now
      );
    } catch (error) {
      console.error('[SQLiteStore] Failed to save connection settings:', error);
      throw error;
    }
  }

  /**
   * Delete connection settings from database.
   */
  deleteConnectionSettings(): void {
    try {
      this.db.prepare('DELETE FROM connection_settings WHERE id = 1').run();
    } catch (error) {
      console.error('[SQLiteStore] Failed to delete connection settings:', error);
      throw error;
    }
  }

  // ─── Channel Split History ──────────────────────────────────────────

  /**
   * Save a split history record to the database.
   */
  saveSplitHistory(entry: Omit<SplitHistoryEntry, 'id'>): SplitHistoryEntry {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO channel_split_history 
         (split_at, operator, parent_channel_id, parent_channel_name, parent_channel_config_json, 
          sub_channel_ids_json, model_filter_json, parent_action, auto_priority_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const result = stmt.run(
        entry.splitAt,
        entry.operator ?? null,
        entry.parentChannelId,
        entry.parentChannelName,
        JSON.stringify(entry.parentChannelConfig),
        JSON.stringify(entry.subChannelIds),
        entry.modelFilter ? JSON.stringify(entry.modelFilter) : null,
        entry.parentAction,
        entry.autoPriorityEnabled ? 1 : 0
      );

      return {
        id: result.lastInsertRowid as number,
        ...entry,
      };
    } catch (error) {
      console.error('[SQLiteStore] Failed to save split history:', error);
      throw error;
    }
  }

  /**
   * Get split history records with optional filtering.
   */
  getSplitHistory(options?: { limit?: number; parentChannelId?: number }): SplitHistoryEntry[] {
    try {
      let sql = `SELECT id, split_at, operator, parent_channel_id, parent_channel_name, 
                        parent_channel_config_json, sub_channel_ids_json, model_filter_json, 
                        parent_action, auto_priority_enabled, rollback_at, rollback_status
                 FROM channel_split_history`;
      const params: unknown[] = [];

      if (options?.parentChannelId !== undefined) {
        sql += ' WHERE parent_channel_id = ?';
        params.push(options.parentChannelId);
      }

      sql += ' ORDER BY split_at DESC';

      if (options?.limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: number;
        split_at: string;
        operator: string | null;
        parent_channel_id: number;
        parent_channel_name: string;
        parent_channel_config_json: string;
        sub_channel_ids_json: string;
        model_filter_json: string | null;
        parent_action: string;
        auto_priority_enabled: number;
        rollback_at: string | null;
        rollback_status: string | null;
      }>;

      return rows.map((row) => ({
        id: row.id,
        splitAt: row.split_at,
        operator: row.operator ?? undefined,
        parentChannelId: row.parent_channel_id,
        parentChannelName: row.parent_channel_name,
        parentChannelConfig: JSON.parse(row.parent_channel_config_json),
        subChannelIds: JSON.parse(row.sub_channel_ids_json),
        modelFilter: row.model_filter_json ? JSON.parse(row.model_filter_json) : undefined,
        parentAction: row.parent_action as ParentChannelAction,
        autoPriorityEnabled: row.auto_priority_enabled === 1,
        rollbackAt: row.rollback_at ?? undefined,
        rollbackStatus: row.rollback_status as 'success' | 'partial' | 'failed' | undefined,
      }));
    } catch (error) {
      console.error('[SQLiteStore] Failed to get split history:', error);
      return [];
    }
  }

  /**
   * Get a single split history record by ID.
   */
  getSplitHistoryById(id: number): SplitHistoryEntry | null {
    try {
      const row = this.db
        .prepare(
          `SELECT id, split_at, operator, parent_channel_id, parent_channel_name, 
                  parent_channel_config_json, sub_channel_ids_json, model_filter_json, 
                  parent_action, auto_priority_enabled, rollback_at, rollback_status
           FROM channel_split_history
           WHERE id = ?`
        )
        .get(id) as {
          id: number;
          split_at: string;
          operator: string | null;
          parent_channel_id: number;
          parent_channel_name: string;
          parent_channel_config_json: string;
          sub_channel_ids_json: string;
          model_filter_json: string | null;
          parent_action: string;
          auto_priority_enabled: number;
          rollback_at: string | null;
          rollback_status: string | null;
        } | undefined;

      if (!row) return null;

      return {
        id: row.id,
        splitAt: row.split_at,
        operator: row.operator ?? undefined,
        parentChannelId: row.parent_channel_id,
        parentChannelName: row.parent_channel_name,
        parentChannelConfig: JSON.parse(row.parent_channel_config_json),
        subChannelIds: JSON.parse(row.sub_channel_ids_json),
        modelFilter: row.model_filter_json ? JSON.parse(row.model_filter_json) : undefined,
        parentAction: row.parent_action as ParentChannelAction,
        autoPriorityEnabled: row.auto_priority_enabled === 1,
        rollbackAt: row.rollback_at ?? undefined,
        rollbackStatus: row.rollback_status as 'success' | 'partial' | 'failed' | undefined,
      };
    } catch (error) {
      console.error(`[SQLiteStore] Failed to get split history by id ${id}:`, error);
      return null;
    }
  }

  /**
   * Update the rollback status of a split history record.
   */
  updateRollbackStatus(
    id: number,
    rollbackAt: string,
    rollbackStatus: 'success' | 'partial' | 'failed'
  ): void {
    try {
      this.db
        .prepare(
          'UPDATE channel_split_history SET rollback_at = ?, rollback_status = ? WHERE id = ?'
        )
        .run(rollbackAt, rollbackStatus, id);
    } catch (error) {
      console.error(`[SQLiteStore] Failed to update rollback status for history ${id}:`, error);
      throw error;
    }
  }

  // ─── Split Configurations ───────────────────────────────────────────

  /**
   * Save a split configuration to the database.
   */
  saveSplitConfig(config: Omit<SplitConfiguration, 'id'>): SplitConfiguration {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO split_configurations 
         (name, description, model_filter_json, naming_pattern, parent_action, auto_priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const result = stmt.run(
        config.name,
        config.description ?? null,
        config.modelFilter ? JSON.stringify(config.modelFilter) : null,
        config.namingPattern,
        config.parentAction,
        config.autoPriority ? 1 : 0,
        config.createdAt,
        config.updatedAt
      );

      return {
        id: result.lastInsertRowid as number,
        ...config,
      };
    } catch (error) {
      console.error('[SQLiteStore] Failed to save split config:', error);
      throw error;
    }
  }

  /**
   * Get all split configurations.
   */
  getSplitConfigs(): SplitConfiguration[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT id, name, description, model_filter_json, naming_pattern, parent_action, 
                  auto_priority, created_at, updated_at
           FROM split_configurations
           ORDER BY created_at DESC`
        )
        .all() as Array<{
          id: number;
          name: string;
          description: string | null;
          model_filter_json: string | null;
          naming_pattern: string;
          parent_action: string;
          auto_priority: number;
          created_at: string;
          updated_at: string;
        }>;

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        modelFilter: row.model_filter_json ? JSON.parse(row.model_filter_json) : undefined,
        namingPattern: row.naming_pattern,
        parentAction: row.parent_action as ParentChannelAction,
        autoPriority: row.auto_priority === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      console.error('[SQLiteStore] Failed to get split configs:', error);
      return [];
    }
  }

  /**
   * Get a single split configuration by ID.
   */
  getSplitConfigById(id: number): SplitConfiguration | null {
    try {
      const row = this.db
        .prepare(
          `SELECT id, name, description, model_filter_json, naming_pattern, parent_action, 
                  auto_priority, created_at, updated_at
           FROM split_configurations
           WHERE id = ?`
        )
        .get(id) as {
          id: number;
          name: string;
          description: string | null;
          model_filter_json: string | null;
          naming_pattern: string;
          parent_action: string;
          auto_priority: number;
          created_at: string;
          updated_at: string;
        } | undefined;

      if (!row) return null;

      return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        modelFilter: row.model_filter_json ? JSON.parse(row.model_filter_json) : undefined,
        namingPattern: row.naming_pattern,
        parentAction: row.parent_action as ParentChannelAction,
        autoPriority: row.auto_priority === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      console.error(`[SQLiteStore] Failed to get split config by id ${id}:`, error);
      return null;
    }
  }

  /**
   * Delete a split configuration by ID.
   */
  deleteSplitConfig(id: number): void {
    try {
      this.db.prepare('DELETE FROM split_configurations WHERE id = ?').run(id);
    } catch (error) {
      console.error(`[SQLiteStore] Failed to delete split config ${id}:`, error);
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

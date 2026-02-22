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
    `);

    // Migration: Add user_id column to existing tables if they don't have it
    this.migrateAddUserIdColumn();

    // Migration: Fix checkin_records foreign key to reference channel_sources
    this.migrateCheckinRecordsForeignKey();
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

    // Check and add user_id to channel_sources if table exists
    try {
      const channelColumns = this.db.pragma('table_info(channel_sources)') as Array<{ name: string }>;
      if (channelColumns.length > 0) {
        if (!channelColumns.some(col => col.name === 'user_id')) {
          this.db.exec('ALTER TABLE channel_sources ADD COLUMN user_id TEXT');
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
      target.autoCheckin ? 1 : 0,
      target.checkinTime ?? '00:05',
      createdAt
    );
    return {
      id: result.lastInsertRowid as number,
      name: target.name,
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
      userId: target.userId,
      enabled: target.enabled,
      autoCheckin: target.autoCheckin ?? false,
      checkinTime: target.checkinTime ?? '00:05',
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
    if (updates.autoCheckin !== undefined) {
      fields.push('auto_checkin = ?');
      params.push(updates.autoCheckin ? 1 : 0);
    }
    if (updates.checkinTime !== undefined) {
      fields.push('checkin_time = ?');
      params.push(updates.checkinTime);
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
      'INSERT INTO channel_sources (name, base_url, api_key, user_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      source.name,
      source.baseUrl,
      source.apiKey,
      source.userId ?? null,
      source.enabled ? 1 : 0,
      createdAt
    );
    return {
      id: result.lastInsertRowid as number,
      name: source.name,
      baseUrl: source.baseUrl,
      apiKey: source.apiKey,
      userId: source.userId,
      enabled: source.enabled,
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
      .prepare('SELECT id, name, base_url, api_key, user_id, enabled, created_at FROM channel_sources ORDER BY id ASC')
      .all() as Array<{
      id: number;
      name: string;
      base_url: string;
      api_key: string;
      user_id: string | null;
      enabled: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      userId: row.user_id ?? undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    }));
  }

  getChannelSourceById(id: number): ChannelSource | null {
    const row = this.db
      .prepare('SELECT id, name, base_url, api_key, user_id, enabled, created_at FROM channel_sources WHERE id = ?')
      .get(id) as {
      id: number;
      name: string;
      base_url: string;
      api_key: string;
      user_id: string | null;
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
      enabled: row.enabled === 1,
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

  close(): void {
    this.db.close();
  }
}

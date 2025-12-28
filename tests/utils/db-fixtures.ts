/**
 * Database Test Fixtures
 *
 * Utilities for creating isolated test databases.
 * Ensures tests don't pollute the real database at ~/.smartergpt/lex/memory.db
 *
 * @module
 */

import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import Database from "better-sqlite3-multiple-ciphers";

/**
 * Result of creating an isolated test database
 */
export interface IsolatedTestDb {
  /** Database handle */
  db: Database.Database;
  /** Path to the database file */
  path: string;
  /** Cleanup function to remove database and restore env */
  cleanup: () => void;
}

/**
 * Options for creating a test database
 */
export interface CreateTestDbOptions {
  /** Whether to create the lexsona_behavior_rules table (default: true) */
  createRulesTable?: boolean;
  /** Whether to create the personas table (default: false) */
  createPersonasTable?: boolean;
  /** Whether to create the schema_version table (default: false) */
  createSchemaVersionTable?: boolean;
  /** Schema version to set (default: 10) */
  schemaVersion?: number;
  /** Whether to close the database after schema creation (default: false) */
  closeAfterSetup?: boolean;
}

/**
 * Create an isolated test database with proper schema
 *
 * Creates a temporary database in a tmp directory with the LexSona schema.
 * The database is automatically cleaned up when cleanup() is called.
 *
 * @param options - Configuration for database creation
 * @returns Object with database handle, path, and cleanup function
 *
 * @example
 * ```typescript
 * import { createIsolatedTestDb } from './db-fixtures.js';
 *
 * let testDb: ReturnType<typeof createIsolatedTestDb>;
 *
 * beforeAll(() => {
 *   testDb = createIsolatedTestDb();
 *   process.env.LEX_DB_PATH = testDb.path;
 * });
 *
 * afterAll(() => testDb.cleanup());
 * ```
 */
export function createIsolatedTestDb(options: CreateTestDbOptions = {}): IsolatedTestDb {
  const {
    createRulesTable = true,
    createPersonasTable = false,
    createSchemaVersionTable = false,
    schemaVersion = 10,
    closeAfterSetup = false,
  } = options;

  // Create temp directory and database path
  const tmpDir = mkdtempSync(join(tmpdir(), "lexsona-test-"));
  const dbPath = join(tmpDir, `test-${randomUUID()}.db`);
  const db = new Database(dbPath);

  // Create schema_version table if requested
  if (createSchemaVersionTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(schemaVersion);
  }

  // Create lexsona_behavior_rules table (required for LexSona connection)
  if (createRulesTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lexsona_behavior_rules (
        rule_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '{}',
        alpha REAL NOT NULL DEFAULT 2.0,
        beta REAL NOT NULL DEFAULT 5.0,
        observation_count INTEGER NOT NULL DEFAULT 0,
        severity TEXT NOT NULL DEFAULT 'should',
        decay_tau REAL NOT NULL DEFAULT 30.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_observed TEXT NOT NULL,
        frame_id TEXT
      );
    `);
  }

  // Create personas table if requested
  if (createPersonasTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        manifest_yaml TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        source TEXT NOT NULL DEFAULT 'user' CHECK(source IN ('bundled', 'user', 'project')),
        checksum TEXT
      );
    `);
  }

  // Close database if requested (useful when you'll reconnect via LexSona)
  if (closeAfterSetup) {
    db.close();
  }

  const cleanup = () => {
    try {
      if (db.open) {
        db.close();
      }
    } catch (error) {
      // Log error but continue cleanup
      console.warn(`Warning: Failed to close database: ${error}`);
    }

    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  return { db, path: dbPath, cleanup };
}

/**
 * Environment variable state for restoration
 */
interface EnvState {
  LEX_DB_PATH: string | undefined;
}

/**
 * Store the current environment state
 */
function storeEnvState(): EnvState {
  return {
    LEX_DB_PATH: process.env.LEX_DB_PATH,
  };
}

/**
 * Restore environment state
 */
function restoreEnvState(state: EnvState): void {
  if (state.LEX_DB_PATH !== undefined) {
    process.env.LEX_DB_PATH = state.LEX_DB_PATH;
  } else {
    delete process.env.LEX_DB_PATH;
  }
}

/**
 * Run a function with a temporary test database path set in environment
 *
 * Temporarily sets LEX_DB_PATH to the provided path, runs the function,
 * then restores the original environment state.
 *
 * @param dbPath - Path to the test database
 * @param fn - Function to run with the test environment
 *
 * @example
 * ```typescript
 * import { createIsolatedTestDb, withTestEnv } from './db-fixtures.js';
 *
 * const testDb = createIsolatedTestDb();
 * await withTestEnv(testDb.path, async () => {
 *   // LEX_DB_PATH is set to testDb.path here
 *   const sona = await LexSona.connect();
 *   // ... test code ...
 * });
 * // LEX_DB_PATH is restored to original value here
 * testDb.cleanup();
 * ```
 */
export async function withTestEnv(dbPath: string, fn: () => Promise<void>): Promise<void> {
  const originalState = storeEnvState();
  process.env.LEX_DB_PATH = dbPath;
  try {
    await fn();
  } finally {
    restoreEnvState(originalState);
  }
}

/**
 * Run a function with a temporary test database path set in environment (sync version)
 *
 * Synchronous version of withTestEnv for non-async test functions.
 *
 * @param dbPath - Path to the test database
 * @param fn - Function to run with the test environment
 *
 * @example
 * ```typescript
 * import { createIsolatedTestDb, withTestEnvSync } from './db-fixtures.js';
 *
 * const testDb = createIsolatedTestDb();
 * withTestEnvSync(testDb.path, () => {
 *   // LEX_DB_PATH is set to testDb.path here
 *   const dbPath = process.env.LEX_DB_PATH;
 *   // ... test code ...
 * });
 * // LEX_DB_PATH is restored to original value here
 * testDb.cleanup();
 * ```
 */
export function withTestEnvSync(dbPath: string, fn: () => void): void {
  const originalState = storeEnvState();
  process.env.LEX_DB_PATH = dbPath;
  try {
    fn();
  } finally {
    restoreEnvState(originalState);
  }
}

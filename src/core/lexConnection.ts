/**
 * Lex Storage Connection
 *
 * Connects LexSona to Lex's behavioral rules storage APIs.
 * LexSona consumes Lex's storage socket - it never duplicates storage logic.
 *
 * Dependency chain:
 * - Lex can run by itself
 * - LexSona needs Lex
 * - LexRunner needs both
 *
 * @module
 */

import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Re-export types from Lex that LexSona consumers need
export type {
  BehaviorRule,
  BehaviorRuleWithConfidence,
  RuleScope,
  RuleContext,
  Correction,
  GetRulesOptions,
  RuleSeverity,
} from "@smartergpt/lex/lexsona";

export { LEXSONA_DEFAULTS } from "@smartergpt/lex/lexsona";

/**
 * Connection configuration
 */
export interface LexConnectionConfig {
  /**
   * Path to Lex database file
   * Default: ~/.smartergpt/lex/lex.db
   */
  dbPath?: string;

  /**
   * Whether to create database if it doesn't exist
   * Default: false (fail if not found)
   */
  createIfMissing?: boolean;
}

/**
 * Result of database path discovery
 */
export interface DbDiscoveryResult {
  /** Path being checked */
  path: string;
  /** Whether the file exists */
  exists: boolean;
  /** Source of the path (e.g., "LEX_DB_PATH", "project-local") */
  source: string;
  /** File size in bytes if exists */
  size?: number;
  /** Error if path check failed */
  error?: string;
}

/**
 * Result of connection attempt
 */
export interface ConnectionResult {
  /** Whether connection succeeded */
  success: boolean;
  /** Database handle (if success) */
  db?: Database.Database;
  /** Error message (if failed) */
  error?: string;
  /** Resolved database path */
  dbPath: string;
}

/**
 * Get all candidate database paths in discovery order
 */
function getCandidatePaths(): Array<{ path: string; source: string }> {
  const cwd = process.cwd();
  const home = homedir();

  return [
    // 1. Explicit override via environment variable
    ...(process.env.LEX_DB_PATH
      ? [{ path: process.env.LEX_DB_PATH, source: "LEX_DB_PATH" }]
      : []),
    // 2. Project-local database
    { path: join(cwd, ".smartergpt", "lex", "lex.db"), source: "project-local" },
    // 3. Local override with alternate name
    { path: join(cwd, ".smartergpt.local", "lex", "memory.db"), source: "local-override" },
    // 4. User global database
    { path: join(home, ".smartergpt", "lex", "lex.db"), source: "user-global" },
    // 5. User global with alternate name
    { path: join(home, ".smartergpt", "lex", "memory.db"), source: "user-global-alt" },
  ];
}

/**
 * Discover database path by checking candidates in order
 *
 * @returns Discovery results for all candidates
 */
export function discoverDbPath(): DbDiscoveryResult[] {
  const candidates = getCandidatePaths();
  const results: DbDiscoveryResult[] = [];

  for (const candidate of candidates) {
    try {
      const exists = existsSync(candidate.path);
      const result: DbDiscoveryResult = {
        path: candidate.path,
        source: candidate.source,
        exists,
      };

      if (exists) {
        try {
          const stats = statSync(candidate.path);
          result.size = stats.size;
        } catch (error) {
          result.error = `Could not stat file: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      results.push(result);
    } catch (error) {
      results.push({
        path: candidate.path,
        source: candidate.source,
        exists: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Default database path for Lex
 *
 * Uses auto-discovery to find the first existing database from candidates.
 * LEX_DB_PATH environment variable always takes precedence if set.
 */
export function getDefaultDbPath(): string {
  // LEX_DB_PATH always takes precedence, even if file doesn't exist
  const envPath = process.env.LEX_DB_PATH;
  if (envPath) {
    return envPath;
  }

  const discoveries = discoverDbPath();

  // Return the first existing path (excluding LEX_DB_PATH which is handled above)
  const found = discoveries.find((d) => d.exists && d.source !== "LEX_DB_PATH");
  if (found) {
    return found.path;
  }

  // Fall back to user home directory if nothing found
  return join(homedir(), ".smartergpt", "lex", "lex.db");
}

/**
 * Establish connection to Lex database
 *
 * @param config - Connection configuration
 * @returns Connection result with database handle or error
 */
export function connectToLex(config: LexConnectionConfig = {}): ConnectionResult {
  const dbPath = config.dbPath ?? getDefaultDbPath();

  // Check if database exists
  if (!existsSync(dbPath)) {
    if (config.createIfMissing) {
      // LexSona should NOT create databases - Lex owns that responsibility
      return {
        success: false,
        error: `Database not found at ${dbPath}. Run 'lex init' to create it.`,
        dbPath,
      };
    }

    // Generate helpful error message with searched paths
    const discoveries = discoverDbPath();
    const searchedPaths = discoveries.map((d) => `  - ${d.path} (${d.source})`).join("\n");

    const errorMessage = [
      `No Lex database found. LexSona needs a Lex database to store rules.`,
      ``,
      `To fix:`,
      `  1. Run 'lex init' in your project to create a database`,
      `  2. Or set LEX_DB_PATH to an existing database`,
      ``,
      `Searched:`,
      searchedPaths,
    ].join("\n");

    return {
      success: false,
      error: errorMessage,
      dbPath,
    };
  }

  try {
    const db = new Database(dbPath);

    // Verify the database has LexSona tables
    const tables = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='lexsona_behavior_rules'
    `
      )
      .all();

    if (tables.length === 0) {
      db.close();
      return {
        success: false,
        error: `Database at ${dbPath} is missing lexsona_behavior_rules table. Run 'lex migrate'.`,
        dbPath,
      };
    }

    return {
      success: true,
      db,
      dbPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      dbPath,
    };
  }
}

/**
 * Close database connection
 */
export function closeConnection(db: Database.Database): void {
  if (db.open) {
    db.close();
  }
}

/**
 * LexStorageClient - Wrapper around Lex storage APIs
 *
 * Provides a clean interface for LexSona to consume Lex storage.
 * All actual storage logic lives in Lex - this just delegates.
 */
export class LexStorageClient {
  private db: Database.Database;
  private dbPath: string;

  private constructor(db: Database.Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Create a new LexStorageClient
   */
  static connect(config: LexConnectionConfig = {}): LexStorageClient {
    const result = connectToLex(config);
    if (!result.success || !result.db) {
      throw new Error(result.error ?? "Unknown connection error");
    }
    return new LexStorageClient(result.db, result.dbPath);
  }

  /**
   * Get the database handle for direct API calls
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Get the resolved database path
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Check if connection is open
   */
  isConnected(): boolean {
    return this.db.open;
  }

  /**
   * Close the connection
   */
  close(): void {
    closeConnection(this.db);
  }
}

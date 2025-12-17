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
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  createLexDbNotFoundError,
  createLexMissingTableError,
  createLexConnectionError,
} from "../mcp/errors.js";

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
  /** Specific error type for better handling */
  errorType?: "not_found" | "missing_table" | "connection_failed";
}

/**
 * Default database path for Lex
 */
export function getDefaultDbPath(): string {
  const envPath = process.env.LEX_DB_PATH;
  if (envPath) {
    return envPath;
  }

  // Check project-local first
  const localPath = join(process.cwd(), ".smartergpt", "lex", "lex.db");
  if (existsSync(localPath)) {
    return localPath;
  }

  // Fall back to user home directory
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
        errorType: "not_found",
      };
    }
    return {
      success: false,
      error: `Database not found at ${dbPath}. Set LEX_DB_PATH or run 'lex init'.`,
      dbPath,
      errorType: "not_found",
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
        errorType: "missing_table",
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
      errorType: "connection_failed",
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
      // Use errorType for precise error handling instead of string matching
      switch (result.errorType) {
        case "not_found":
          throw createLexDbNotFoundError(result.dbPath);
        case "missing_table":
          throw createLexMissingTableError(result.dbPath);
        case "connection_failed":
        default:
          throw createLexConnectionError(result.dbPath, result.error ?? "Unknown connection error");
      }
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

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
  // Persona types (V10)
  PersonaRecord,
  PersonaSource,
  ListPersonasFilter,
} from "@smartergpt/lex/lexsona";

export { LEXSONA_DEFAULTS } from "@smartergpt/lex/lexsona";

// Import persona functions for client wrapper
import {
  getPersona as getPersonaFromDb,
  listPersonasFromDb,
  savePersona as savePersonaToDb,
  upsertPersona as upsertPersonaToDb,
  deletePersona as deletePersonaFromDb,
  getPersonaChecksum as getPersonaChecksumFromDb,
  // Rule management
  promoteRule as promoteRuleInDb,
  getBehaviorRuleById as getBehaviorRuleByIdFromDb,
  findRuleByContext as findRuleByContextFromDb,
} from "@smartergpt/lex/lexsona";
import type { PersonaRecord, PersonaSource, ListPersonasFilter } from "@smartergpt/lex/lexsona";

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
 * Result of database path discovery.
 */
export interface DbDiscoveryResult {
  /** Path being checked */
  path: string;
  /** Whether the file exists */
  exists: boolean;
  /** Source of the path (e.g., "LEX_DB_PATH", "project-local" relative to the current project root) */
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
  /** Specific error type for better handling */
  errorType?: "not_found" | "missing_table" | "connection_failed";
}

/**
 * Get all candidate database paths in discovery order
 */
function getCandidatePaths(): Array<{ path: string; source: string }> {
  const cwd = process.cwd();
  const home = homedir();

  return [
    // 1. Explicit override via environment variable
    ...(process.env.LEX_DB_PATH ? [{ path: process.env.LEX_DB_PATH, source: "LEX_DB_PATH" }] : []),
    // 2. Database under the current project root
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
 * Select the one legacy compatibility database candidate without weakening an
 * explicit LEX_DB_PATH into ambient path discovery.
 */
export function selectLegacyDbDiscovery(
  discoveries: readonly DbDiscoveryResult[] = discoverDbPath()
): DbDiscoveryResult | undefined {
  return (
    discoveries.find((candidate) => candidate.source === "LEX_DB_PATH") ??
    discoveries.find((candidate) => candidate.exists)
  );
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
  const found = selectLegacyDbDiscovery(discoveries);
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
        errorType: "not_found",
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
          throw createLexConnectionError(result.dbPath, result.error ?? "Unknown connection error");
        default:
          // Fallback for unexpected error types
          throw createLexConnectionError(
            result.dbPath,
            result.error ?? `Unexpected error type: ${result.errorType}`
          );
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

  // ============================================================================
  // PERSONA STORAGE (V10)
  // ============================================================================

  /**
   * Get a persona by ID from the database
   *
   * @param id - Persona identifier (e.g., "quality-first_engineering")
   * @returns PersonaRecord or null if not found
   */
  getPersona(id: string): PersonaRecord | null {
    return getPersonaFromDb(this.db, id);
  }

  /**
   * List all personas in the database
   *
   * @param filter - Optional filter by source
   * @returns Array of PersonaRecords
   */
  listPersonas(filter?: ListPersonasFilter): PersonaRecord[] {
    return listPersonasFromDb(this.db, filter);
  }

  /**
   * Save a persona to the database
   *
   * @param id - Persona identifier
   * @param manifest - Full YAML content
   * @param version - Semantic version
   * @param source - Source type (default: "user")
   */
  savePersona(id: string, manifest: string, version: string, source: PersonaSource = "user"): void {
    savePersonaToDb(this.db, id, manifest, version, source);
  }

  /**
   * Upsert a persona (update if exists, insert if not)
   *
   * @param id - Persona identifier
   * @param manifest - Full YAML content
   * @param version - Semantic version
   * @param source - Source type (default: "user")
   */
  upsertPersona(
    id: string,
    manifest: string,
    version: string,
    source: PersonaSource = "user"
  ): void {
    upsertPersonaToDb(this.db, id, manifest, version, source);
  }

  /**
   * Delete a persona from the database
   *
   * @param id - Persona identifier
   * @returns true if deleted, false if not found
   */
  deletePersona(id: string): boolean {
    return deletePersonaFromDb(this.db, id);
  }

  /**
   * Get the checksum for a persona (for sync detection)
   *
   * @param id - Persona identifier
   * @returns Checksum string or null if not found
   */
  getPersonaChecksum(id: string): string | null {
    return getPersonaChecksumFromDb(this.db, id);
  }

  // ============================================================================
  // RULE MANAGEMENT
  // ============================================================================

  /**
   * Get a behavior rule by ID
   *
   * @param ruleId - Rule identifier
   * @returns BehaviorRuleWithConfidence or null if not found
   */
  getBehaviorRuleById(
    ruleId: string
  ): import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence | null {
    return getBehaviorRuleByIdFromDb(this.db, ruleId);
  }

  /**
   * Find an existing rule by matching context (module_id and text)
   *
   * @param moduleId - Module ID to match (optional)
   * @param text - Rule text to match
   * @returns Rule if found, null otherwise
   */
  findRuleByContext(
    moduleId: string | undefined,
    text: string
  ): import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence | null {
    return findRuleByContextFromDb(this.db, moduleId, text);
  }

  /**
   * Promote a rule to "core" status
   *
   * Core rules are immediately visible without needing multiple observations.
   * This bumps observation_count to minN and adjusts alpha proportionally.
   *
   * @param ruleId - Rule ID to promote
   * @param targetN - Target observation count (default: MIN_OBSERVATION_COUNT = 3)
   * @returns Updated rule or null if not found
   */
  promoteRule(
    ruleId: string,
    targetN?: number
  ): import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence | null {
    return promoteRuleInDb(this.db, ruleId, targetN);
  }

  /**
   * Delete a behavior rule by ID
   *
   * @param ruleId - Rule identifier to delete
   * @returns true if deleted, false if not found
   */
  deleteRule(ruleId: string): boolean {
    const stmt = this.db.prepare("DELETE FROM lexsona_behavior_rules WHERE rule_id = ?");
    const result = stmt.run(ruleId);
    return result.changes > 0;
  }
}

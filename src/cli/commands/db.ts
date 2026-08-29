/**
 * Database Commands - lexsona db <verb>
 *
 * @module
 */

import { Command } from "commander";
import { discoverDbPath, connectToLex, selectLegacyDbDiscovery } from "../../core/lexConnection.js";
import { isJsonMode } from "../output.js";
import { LEGACY_DISCOVERY_REMOVAL_TARGET } from "../legacy-bootstrap.js";

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Database status result for JSON output
 */
interface DbStatusResult {
  mode: "legacy-path-discovery";
  removalTarget: typeof LEGACY_DISCOVERY_REMOVAL_TARGET;
  active: boolean;
  path: string | null;
  size: number | null;
  source: string | null;
  discoveries: Array<{
    path: string;
    source: string;
    exists: boolean;
    size?: number;
    error?: string;
  }>;
  connection: {
    success: boolean;
    error?: string;
    tables?: string[];
    counts?: {
      rules?: number;
      frames?: number;
    };
  };
}

/**
 * Get database status as structured data
 */
function getDatabaseStatus(): DbStatusResult {
  const discoveries = discoverDbPath();
  const selectedDb = selectLegacyDbDiscovery(discoveries);

  const discoveryResults = discoveries.map((discovery) => {
    const result = {
      path: discovery.path,
      source: discovery.source,
      exists: discovery.exists,
      size: discovery.size,
      error: discovery.error,
    };
    return result;
  });

  const statusResult: DbStatusResult = {
    mode: "legacy-path-discovery",
    removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
    active: selectedDb?.exists ?? false,
    path: selectedDb?.path ?? null,
    size: selectedDb?.size ?? null,
    source: selectedDb?.source ?? null,
    discoveries: discoveryResults,
    connection: { success: false },
  };

  if (selectedDb && !selectedDb.exists) {
    statusResult.connection.error = selectedDb.error ?? "Not found";
  } else if (selectedDb) {
    const result = connectToLex({ dbPath: selectedDb.path });

    if (result.success && result.db) {
      statusResult.connection.success = true;

      try {
        const tables = result.db
          .prepare(
            `
          SELECT name FROM sqlite_master
          WHERE type='table'
          ORDER BY name
        `
          )
          .all() as Array<{ name: string }>;

        statusResult.connection.tables = tables.map((t) => t.name);
        statusResult.connection.counts = {};

        const hasRulesTable = tables.some((t) => t.name === "lexsona_behavior_rules");
        if (hasRulesTable) {
          const rulesCount = result.db
            .prepare("SELECT COUNT(*) as count FROM lexsona_behavior_rules")
            .get() as { count: number };
          statusResult.connection.counts.rules = rulesCount.count;
        }

        const hasFramesTable = tables.some((t) => t.name === "frames");
        if (hasFramesTable) {
          const framesCount = result.db.prepare("SELECT COUNT(*) as count FROM frames").get() as {
            count: number;
          };
          statusResult.connection.counts.frames = framesCount.count;
        }

        result.db.close();
      } catch (error) {
        statusResult.connection.error = error instanceof Error ? error.message : String(error);
        result.db.close();
      }
    } else {
      statusResult.connection.error = result.error ?? "Unknown error";
    }
  }

  return statusResult;
}

/**
 * Display database status in human-readable format
 */
function displayDatabaseStatusText(status: DbStatusResult): void {
  console.log("Database Discovery");
  console.log("══════════════════\n");

  // Display each candidate path
  for (const discovery of status.discoveries) {
    const label = discovery.source === "LEX_DB_PATH" ? "LEX_DB_PATH" : discovery.path;
    console.log(`Checking: ${label}`);

    if (discovery.error) {
      console.log(`  ✗ Error: ${discovery.error}\n`);
      continue;
    }

    if (discovery.exists) {
      const sizeStr = discovery.size !== undefined ? ` (${formatSize(discovery.size)})` : "";
      console.log(`  ✓ Found${sizeStr}`);

      if (discovery.path === status.path) {
        console.log(`  → Active database\n`);
      } else {
        console.log();
      }
    } else {
      console.log("  Not found\n");
    }
  }

  // Show active database path
  if (status.active && status.path) {
    console.log(`Active database: ${status.path}\n`);

    // Show connection status
    console.log("Connection test:");
    if (status.connection.success) {
      console.log("  ✓ OK");

      if (status.connection.tables) {
        console.log(`  Tables: ${status.connection.tables.join(", ")}`);
      }

      if (status.connection.counts?.rules !== undefined) {
        console.log(`  Rules: ${status.connection.counts.rules}`);
      }

      if (status.connection.counts?.frames !== undefined) {
        console.log(`  Frames: ${status.connection.counts.frames}`);
      }
    } else {
      console.log(`  ✗ Failed: ${status.connection.error ?? "Unknown error"}`);
    }
  } else if (status.source === "LEX_DB_PATH" && status.path) {
    console.log("No database found.\n");
    console.log(`Selected compatibility database: ${status.path}`);
    console.log(`  ✗ ${status.connection.error ?? "Not found"}\n`);
    console.log("To fix:");
    console.log("  1. Repair or unset LEX_DB_PATH");
    console.log("  2. Or run 'lex init' for a deliberately selected legacy compatibility database");
  } else {
    console.log("No database found.\n");
    console.log("The legacy path-discovery adapter is optional; scoped health is host-bound.");
    console.log("To fix:");
    console.log("  1. Run 'lex init' in your project to create a database");
    console.log("  2. Or set LEX_DB_PATH to an existing database");
  }
}

/**
 * Register db noun commands
 */
export function registerDbCommands(program: Command): void {
  const db = program.command("db").description("Database diagnostics and status");

  // lexsona db status
  db.command("status")
    .description("Show database discovery and connection status")
    .action(async function (this: Command) {
      const jsonMode = isJsonMode(this);
      const status = getDatabaseStatus();

      if (jsonMode) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        displayDatabaseStatusText(status);
      }
    });
}

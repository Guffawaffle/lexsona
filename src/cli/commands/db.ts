/**
 * Database Commands - lexsona db <verb>
 *
 * @module
 */

import { Command } from "commander";
import { discoverDbPath, connectToLex } from "../../core/lexConnection.js";
import type { DbDiscoveryResult } from "../../core/lexConnection.js";

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Display database status and discovery information
 */
async function showDatabaseStatus(): Promise<void> {
  console.log("Database Discovery");
  console.log("══════════════════\n");

  const discoveries = discoverDbPath();
  let activeDb: DbDiscoveryResult | undefined;

  // Display each candidate path
  for (const discovery of discoveries) {
    const label = discovery.source === "LEX_DB_PATH" ? "LEX_DB_PATH" : discovery.path;
    console.log(`Checking: ${label}`);

    if (discovery.source === "LEX_DB_PATH" && !process.env.LEX_DB_PATH) {
      console.log("  Not set\n");
      continue;
    }

    if (discovery.error) {
      console.log(`  ✗ Error: ${discovery.error}\n`);
      continue;
    }

    if (discovery.exists) {
      const sizeStr = discovery.size !== undefined ? ` (${formatSize(discovery.size)})` : "";
      console.log(`  ✓ Found${sizeStr}`);

      if (!activeDb) {
        activeDb = discovery;
        console.log(`  → Active database\n`);
      } else {
        console.log();
      }
    } else {
      console.log("  Not found\n");
    }
  }

  // Show active database path
  if (activeDb) {
    console.log(`Active database: ${activeDb.path}\n`);

    // Test connection
    console.log("Connection test:");
    const result = connectToLex({ dbPath: activeDb.path });

    if (result.success && result.db) {
      console.log("  ✓ OK");

      try {
        // Get table list
        const tables = result.db
          .prepare(
            `
          SELECT name FROM sqlite_master
          WHERE type='table'
          ORDER BY name
        `
          )
          .all() as Array<{ name: string }>;

        console.log(`  Tables: ${tables.map((t) => t.name).join(", ")}`);

        // Get counts for key tables
        const hasRulesTable = tables.some((t) => t.name === "lexsona_behavior_rules");
        if (hasRulesTable) {
          const rulesCount = result.db
            .prepare("SELECT COUNT(*) as count FROM lexsona_behavior_rules")
            .get() as { count: number };
          console.log(`  Rules: ${rulesCount.count}`);
        }

        const hasFramesTable = tables.some((t) => t.name === "frames");
        if (hasFramesTable) {
          const framesCount = result.db
            .prepare("SELECT COUNT(*) as count FROM frames")
            .get() as { count: number };
          console.log(`  Frames: ${framesCount.count}`);
        }

        result.db.close();
      } catch (error) {
        console.log(`  Warning: Could not query database: ${error instanceof Error ? error.message : String(error)}`);
        result.db.close();
      }
    } else {
      console.log(`  ✗ Failed: ${result.error ?? "Unknown error"}`);
    }
  } else {
    console.log("No database found.\n");
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
    .action(async () => {
      await showDatabaseStatus();
    });
}

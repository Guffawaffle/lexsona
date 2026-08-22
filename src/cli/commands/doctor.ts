/**
 * Doctor Command - lexsona doctor
 *
 * Health check command to verify LexSona setup
 *
 * @module
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { discoverDbPath, connectToLex } from "../../core/lexConnection.js";
import { listPersonas } from "../../persona/loader.js";
import { getActivePersona } from "../../persona/config.js";
import { LEXSONA_TOOLS } from "../../mcp/tools.js";
import { isJsonMode } from "../output.js";
import { VERSION } from "../../index.js";

/**
 * Health check status
 */
interface HealthStatus {
  healthy: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): { version: string; ok: boolean } {
  const version = process.version;
  // Minimum required version from package.json engines
  const minimumMajor = 24;
  const currentMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  const ok = Number.isInteger(currentMajor) && currentMajor >= minimumMajor;
  return { version, ok };
}

/**
 * Check Lex peer dependency
 */
function checkLexPeer(): { version: string | null; ok: boolean; error?: string } {
  try {
    // Try to read Lex package.json
    const lexPackageJsonPath = join(
      process.cwd(),
      "node_modules",
      "@smartergpt",
      "lex",
      "package.json"
    );

    if (!existsSync(lexPackageJsonPath)) {
      return {
        version: null,
        ok: false,
        error: "Not found",
      };
    }

    const lexPackageJson = JSON.parse(readFileSync(lexPackageJsonPath, "utf-8"));
    return {
      version: lexPackageJson.version,
      ok: true,
    };
  } catch (error) {
    return {
      version: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check database connectivity
 */
function checkDatabase(): {
  path: string | null;
  connected: boolean;
  frames?: number;
  rules?: number;
  error?: string;
} {
  const discoveries = discoverDbPath();
  const activeDb = discoveries.find((d) => d.exists);

  if (!activeDb) {
    return {
      path: null,
      connected: false,
      error: "Not found",
    };
  }

  const result = connectToLex({ dbPath: activeDb.path });

  if (!result.success || !result.db) {
    return {
      path: activeDb.path,
      connected: false,
      error: result.error ?? "Unknown error",
    };
  }

  try {
    // Get frames count
    let frames: number | undefined;
    const hasFramesTable = result.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='frames'")
      .get();

    if (hasFramesTable) {
      const framesCount = result.db.prepare("SELECT COUNT(*) as count FROM frames").get() as {
        count: number;
      };
      frames = framesCount.count;
    }

    // Get rules count
    let rules: number | undefined;
    const hasRulesTable = result.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_behavior_rules'"
      )
      .get();

    if (hasRulesTable) {
      const rulesCount = result.db
        .prepare("SELECT COUNT(*) as count FROM lexsona_behavior_rules")
        .get() as { count: number };
      rules = rulesCount.count;
    }

    result.db.close();

    return {
      path: activeDb.path,
      connected: true,
      frames,
      rules,
    };
  } catch (error) {
    result.db.close();
    return {
      path: activeDb.path,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Perform health check
 */
async function performHealthCheck(): Promise<{
  status: HealthStatus;
  checks: {
    node: ReturnType<typeof checkNodeVersion>;
    lexsona: { version: string };
    lex: ReturnType<typeof checkLexPeer>;
    database: ReturnType<typeof checkDatabase>;
    personas: { count: number; list: Array<{ id: string; version: string }> };
    activePersona: { id: string | null; scope: string | null };
    mcpTools: { count: number };
  };
}> {
  const status: HealthStatus = {
    healthy: true,
    issues: [],
    warnings: [],
  };

  // Check Node.js
  const node = checkNodeVersion();
  if (!node.ok) {
    status.healthy = false;
    status.issues.push(`Node.js version ${node.version} is below minimum required v24.0.0`);
  }

  // Check LexSona version
  const lexsona = { version: VERSION };

  // Check Lex peer
  const lex = checkLexPeer();
  if (!lex.ok) {
    status.healthy = false;
    status.issues.push("Lex peer dependency not found");
  }

  // Check database
  const database = checkDatabase();
  if (!database.connected) {
    status.healthy = false;
    status.issues.push(`Database ${database.error ?? "not accessible"}`);
  }

  // Check personas
  const personaList = await listPersonas();
  const personas = {
    count: personaList.length,
    list: [] as Array<{ id: string; version: string }>,
  };

  for (const entry of personaList) {
    try {
      // Just load basic info - we already have the id from listPersonas
      const { loadPersonaFromFile } = await import("../../persona/loader.js");
      const p = loadPersonaFromFile(entry.path);
      personas.list.push({
        id: p.id,
        version: p.version,
      });
    } catch {
      // Skip personas that fail to load
    }
  }

  if (personas.count === 0) {
    status.warnings.push("No personas found");
  }

  // Check active persona
  const activePersonaData = getActivePersona();
  const activePersona = {
    id: activePersonaData.personaId,
    scope: activePersonaData.scope,
  };

  // Check MCP tools
  const mcpTools = {
    count: LEXSONA_TOOLS.length,
  };

  return {
    status,
    checks: {
      node,
      lexsona,
      lex,
      database,
      personas,
      activePersona,
      mcpTools,
    },
  };
}

/**
 * Format health check output for human reading
 */
function formatHealthCheck(result: Awaited<ReturnType<typeof performHealthCheck>>): string {
  const lines: string[] = [];
  const { status, checks } = result;

  lines.push("LexSona Health Check");
  lines.push("════════════════════");
  lines.push("");

  // Environment
  lines.push("Environment:");
  lines.push(`  Node.js: ${checks.node.version} ${checks.node.ok ? "✓" : "✗"}`);
  lines.push(`  LexSona: v${checks.lexsona.version} ✓`);
  if (checks.lex.ok && checks.lex.version) {
    lines.push(`  Lex peer: v${checks.lex.version} ✓`);
  } else {
    lines.push(`  Lex peer: ${checks.lex.error ?? "Not found"} ✗`);
  }
  lines.push("");

  // Database
  lines.push("Database:");
  if (checks.database.connected) {
    lines.push(`  Path: ${checks.database.path}`);
    lines.push(`  Status: ✓ Connected`);
    if (checks.database.frames !== undefined) {
      lines.push(`  Frames: ${checks.database.frames}`);
    }
    if (checks.database.rules !== undefined) {
      lines.push(`  Rules: ${checks.database.rules}`);
    }
  } else {
    lines.push(`  Path: ${checks.database.path ?? "unknown"}`);
    lines.push(`  Status: ✗ ${checks.database.error ?? "Not connected"}`);
  }
  lines.push("");

  // Personas
  lines.push("Personas:");
  lines.push(
    `  Found: ${checks.personas.count} persona${checks.personas.count !== 1 ? "s" : ""} ${checks.personas.count > 0 ? "✓" : "⚠️"}`
  );
  for (const p of checks.personas.list) {
    lines.push(`    - ${p.id} (v${p.version})`);
  }
  lines.push("");

  // Active persona
  lines.push("Active Persona:");
  if (checks.activePersona.id) {
    lines.push(`  ${checks.activePersona.id} ✓`);
  } else {
    lines.push(`  None`);
  }
  lines.push("");

  // MCP Server
  lines.push("MCP Server:");
  lines.push(`  Tools registered: ${checks.mcpTools.count} ✓`);
  lines.push("");

  // Overall status
  if (status.healthy) {
    lines.push("Overall: ✓ Healthy");
  } else {
    lines.push("Overall: ✗ Issues found");
    lines.push("");
    lines.push("To fix:");
    let fixNumber = 1;
    for (const issue of status.issues) {
      if (issue.includes("Database")) {
        lines.push(`  ${fixNumber}. Run 'lex init' to create database`);
        fixNumber++;
      }
      if (issue.includes("Lex peer")) {
        lines.push(`  ${fixNumber}. Install @smartergpt/lex as peer dependency`);
        fixNumber++;
      }
      if (issue.includes("Node.js")) {
        lines.push(`  ${fixNumber}. Upgrade Node.js to v24.0.0 or higher`);
        fixNumber++;
      }
    }
  }

  if (status.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of status.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}

/**
 * Register doctor command
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health check to verify LexSona setup")
    .action(async function (this: Command) {
      const jsonMode = isJsonMode(this);

      const result = await performHealthCheck();

      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatHealthCheck(result));
      }

      // Exit with non-zero code if unhealthy
      if (!result.status.healthy) {
        process.exitCode = 1;
      }
    });
}

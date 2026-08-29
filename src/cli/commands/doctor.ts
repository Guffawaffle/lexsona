/**
 * Doctor Command - lexsona doctor
 *
 * Health check command to verify LexSona setup
 *
 * @module
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { discoverDbPath, connectToLex, selectLegacyDbDiscovery } from "../../core/lexConnection.js";
import { listPersonas } from "../../persona/loader.js";
import { getActivePersona } from "../../persona/config.js";
import { LEXSONA_TOOLS } from "../../mcp/tools.js";
import { isJsonMode } from "../output.js";
import { VERSION } from "../../index.js";
import { LEGACY_DISCOVERY_REMOVAL_TARGET } from "../legacy-bootstrap.js";

/**
 * Health check status
 */
interface HealthStatus {
  healthy: boolean;
  scope: "bare-cli-diagnostics";
  assessment: "partial";
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
    const lexModulePath = fileURLToPath(import.meta.resolve("@smartergpt/lex/lexsona"));
    let packageDirectory = dirname(lexModulePath);

    while (true) {
      const lexPackageJsonPath = join(packageDirectory, "package.json");
      if (existsSync(lexPackageJsonPath)) {
        const lexPackageJson = JSON.parse(readFileSync(lexPackageJsonPath, "utf-8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (
          lexPackageJson.name === "@smartergpt/lex" &&
          typeof lexPackageJson.version === "string"
        ) {
          return {
            version: lexPackageJson.version,
            ok: true,
          };
        }
      }

      const parentDirectory = dirname(packageDirectory);
      if (parentDirectory === packageDirectory) {
        break;
      }
      packageDirectory = parentDirectory;
    }

    return {
      version: null,
      ok: false,
      error: "Not found",
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
  mode: "legacy-path-discovery";
  removalTarget: typeof LEGACY_DISCOVERY_REMOVAL_TARGET;
  status: "connected" | "not-configured" | "unavailable";
  explicit: boolean;
  path: string | null;
  source: string | null;
  connected: boolean;
  frames?: number;
  rules?: number;
  error?: string;
} {
  const discoveries = discoverDbPath();
  const explicitDb = discoveries.find((d) => d.source === "LEX_DB_PATH");
  const activeDb = selectLegacyDbDiscovery(discoveries);

  if (!activeDb) {
    return {
      mode: "legacy-path-discovery",
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      status: "not-configured",
      explicit: false,
      path: null,
      source: null,
      connected: false,
    };
  }

  if (!activeDb.exists) {
    return {
      mode: "legacy-path-discovery",
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      status: "unavailable",
      explicit: true,
      path: activeDb.path,
      source: activeDb.source,
      connected: false,
      error: activeDb.error ?? "Not found",
    };
  }

  const result = connectToLex({ dbPath: activeDb.path });

  if (!result.success || !result.db) {
    return {
      mode: "legacy-path-discovery",
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      status: "unavailable",
      explicit: explicitDb !== undefined,
      path: activeDb.path,
      source: activeDb.source,
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
      mode: "legacy-path-discovery",
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      status: "connected",
      explicit: explicitDb !== undefined,
      path: activeDb.path,
      source: activeDb.source,
      connected: true,
      frames,
      rules,
    };
  } catch (error) {
    result.db.close();
    return {
      mode: "legacy-path-discovery",
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      status: "unavailable",
      explicit: explicitDb !== undefined,
      path: activeDb.path,
      source: activeDb.source,
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
    scopedStore: {
      status: "not-assessed";
      reason: string;
    };
    personas: { count: number; list: Array<{ id: string; version: string }> };
    activePersona: {
      state: "configured" | "not-configured";
      id: string | null;
      scope: string | null;
      application: { status: "not-assessed" };
      outcome: { status: "not-assessed" };
      authority: { grantsAuthority: false };
    };
    mcpTools: { count: number; adapter: "source-compatibility"; status: "inventory-only" };
  };
}> {
  const status: HealthStatus = {
    healthy: true,
    scope: "bare-cli-diagnostics",
    assessment: "partial",
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
  const scopedStore = {
    status: "not-assessed" as const,
    reason: "Scoped storage requires a trusted host-provided binding",
  };
  if (database.status === "unavailable") {
    status.healthy = false;
    status.issues.push(`Legacy compatibility database ${database.error ?? "not accessible"}`);
  } else if (database.status === "not-configured") {
    status.warnings.push(
      "Legacy compatibility database is not configured; scoped runtime health must be verified by its trusted host"
    );
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
    state:
      activePersonaData.personaId === null ? ("not-configured" as const) : ("configured" as const),
    id: activePersonaData.personaId,
    scope: activePersonaData.scope,
    application: { status: "not-assessed" as const },
    outcome: { status: "not-assessed" as const },
    authority: { grantsAuthority: false as const },
  };

  // Check MCP tools
  const mcpTools = {
    count: LEXSONA_TOOLS.length,
    adapter: "source-compatibility" as const,
    status: "inventory-only" as const,
  };

  return {
    status,
    checks: {
      node,
      lexsona,
      lex,
      database,
      scopedStore,
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

  // Storage
  lines.push("Storage:");
  lines.push(
    `  Compatibility adapter: legacy path discovery (deprecated; removal target ${checks.database.removalTarget})`
  );
  if (checks.database.connected) {
    lines.push(`  Path: ${checks.database.path}`);
    lines.push(`  Source: ${checks.database.source}`);
    lines.push(`  Status: ✓ Connected`);
    if (checks.database.frames !== undefined) {
      lines.push(`  Frames: ${checks.database.frames}`);
    }
    if (checks.database.rules !== undefined) {
      lines.push(`  Rules: ${checks.database.rules}`);
    }
  } else if (checks.database.status === "not-configured") {
    lines.push("  Status: ○ Not configured (optional compatibility lane)");
  } else {
    lines.push(`  Path: ${checks.database.path ?? "unknown"}`);
    lines.push(`  Source: ${checks.database.source ?? "unknown"}`);
    lines.push(`  Status: ✗ ${checks.database.error ?? "Not connected"}`);
  }
  lines.push(`  Scoped adapter: ${checks.scopedStore.status} (${checks.scopedStore.reason})`);
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
  lines.push("Configured Persona:");
  if (checks.activePersona.id) {
    lines.push(`  ${checks.activePersona.id}`);
    lines.push("  Application/outcome: not assessed by the bare CLI");
    lines.push("  Authority: none (personas do not grant authority)");
  } else {
    lines.push(`  None`);
  }
  lines.push("");

  // MCP Server
  lines.push("Source MCP Adapter Inventory:");
  lines.push(`  Tool definitions: ${checks.mcpTools.count} (inventory only)`);
  lines.push("");

  // Overall status
  if (status.healthy) {
    lines.push("Overall (partial bare CLI diagnostics): ✓ Healthy");
    lines.push("Scoped runtime: not assessed; verify it through the trusted host");
  } else {
    lines.push("Overall (partial bare CLI diagnostics): ✗ Issues found");
    lines.push("");
    lines.push("To fix:");
    let fixNumber = 1;
    for (const issue of status.issues) {
      if (issue.includes("compatibility database")) {
        lines.push(
          `  ${fixNumber}. Repair or unset LEX_DB_PATH, or run 'lex init' for the legacy compatibility lane`
        );
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

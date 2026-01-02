/**
 * Constraints Commands - lexsona constraints <verb>
 *
 * @module
 */

import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { LexSona, type LexSonaConfig } from "../../core/lexsona.js";
import { loadPersona } from "../../persona/loader.js";
import { getActivePersona } from "../../persona/config.js";
import { type DeriveContext, type ConstraintSet } from "../../constraints/derive.js";
import { explainConstraint, explainAllConstraints } from "../../constraints/explainer.js";
import {
  formatExplanationProse,
  formatExplanationJson,
  formatAllExplanationsProse,
  formatAllExplanationsJson,
} from "../../constraints/narrative.js";
import { isJsonMode } from "../output.js";
import { formatProvenance } from "../../mcp/formatters.js";
import { inferScope } from "../../scope/index.js";

function getProjectConstraintsCachePath(): string {
  return join(process.cwd(), ".smartergpt", "lexsona-constraints.json");
}

function getUserConstraintsCachePath(): string {
  return join(homedir(), ".smartergpt", "lexsona-constraints.json");
}

function getConstraintsCachePath(): string {
  const envPath = process.env.LEXSONA_CONSTRAINTS_CACHE_PATH;
  if (envPath) {
    return envPath;
  }

  // Prefer project-local cache when a .smartergpt directory exists
  const projectPath = getProjectConstraintsCachePath();
  const projectDir = dirname(projectPath);
  if (existsSync(projectDir)) {
    return projectPath;
  }

  return getUserConstraintsCachePath();
}

function readCachedConstraintSet(): ConstraintSet | null {
  const cachePath = getConstraintsCachePath();
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    // Minimal shape check (avoid over-fitting to internal evolution)
    if (!parsed || typeof parsed !== "object") return null;

    const maybe = parsed as Partial<ConstraintSet>;
    if (typeof maybe.personaId !== "string") return null;
    if (typeof maybe.derivedAt !== "string") return null;

    const constraints = Array.isArray(maybe.constraints) ? maybe.constraints : [];
    const principles = Array.isArray(maybe.principles) ? maybe.principles : [];
    const context = (
      maybe.context && typeof maybe.context === "object" ? maybe.context : {}
    ) as ConstraintSet["context"];
    const metadataObj = (
      maybe.metadata && typeof maybe.metadata === "object" ? maybe.metadata : {}
    ) as Partial<ConstraintSet["metadata"]>;

    const normalized: ConstraintSet = {
      personaId: maybe.personaId,
      derivedAt: maybe.derivedAt,
      inputHash: typeof maybe.inputHash === "string" ? maybe.inputHash : "",
      context,
      constraints: constraints as ConstraintSet["constraints"],
      principles: principles as ConstraintSet["principles"],
      metadata: {
        rulesConsidered:
          typeof metadataObj.rulesConsidered === "number" ? metadataObj.rulesConsidered : 0,
        rulesFiltered:
          typeof metadataObj.rulesFiltered === "number" ? metadataObj.rulesFiltered : 0,
        confidenceThreshold:
          typeof metadataObj.confidenceThreshold === "number"
            ? metadataObj.confidenceThreshold
            : 0.3,
        offlineMode: typeof metadataObj.offlineMode === "boolean" ? metadataObj.offlineMode : true,
        confidenceCeiling:
          typeof metadataObj.confidenceCeiling === "number"
            ? metadataObj.confidenceCeiling
            : undefined,
      },
    };

    return normalized;
  } catch (error) {
    console.error(
      `Warning: Failed to read cached constraints (${cachePath}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function writeCachedConstraintSet(result: ConstraintSet): void {
  const cachePath = getConstraintsCachePath();
  try {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf-8");
  } catch (error) {
    console.error(
      `Warning: Failed to write cached constraints (${cachePath}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Format constraint set as JSON output matching the specification
 */
function formatConstraintsAsJson(result: ConstraintSet, provenanceMode?: string) {
  const provMode = provenanceMode === "compact" ? "compact" : "full";

  return {
    version: 1,
    persona: result.personaId,
    domain: result.context.domain,
    derivedAt: result.derivedAt,
    inputHash: result.inputHash,
    constraints: result.constraints.map((c) => ({
      id: c.rule_id,
      description: c.text,
      severity: c.severity === "must" ? "critical" : c.severity === "should" ? "high" : "medium",
      // v0.2.x note: constraints are currently derived from Lex behavioral rules (learned);
      // baseline guidance is emitted as "principles".
      source: c.source ?? "learned",
      confidence: c.confidence,
      // Include provenance for explainability (AX-004, AX-010)
      provenance: formatProvenance(c.provenance, provMode),
    })),
    principles: result.principles.map((p) => ({
      id: p.id,
      description: p.description,
    })),
  };
}

function formatConstraintSourceHumanReadable(c: ConstraintSet["constraints"][number]): string {
  const source = c.source ?? "learned";

  // Keep output aligned with the issue spec examples.
  if (source === "learned") {
    return `learned (confidence: ${c.confidence.toFixed(2)})`;
  }

  return String(source);
}

function writeConstraintsHumanReadable(result: ConstraintSet): void {
  // Human-readable output matching specification
  console.log("Constraint Set (v1)");
  console.log("═══════════════════\n");

  console.log(`Persona: ${result.personaId}`);
  if (result.context.domain) console.log(`Domain: ${result.context.domain}`);
  console.log(`Derived: ${result.derivedAt}\n`);

  // Group constraints by severity
  const criticalConstraints = result.constraints.filter((c) => c.severity === "must");
  const highConstraints = result.constraints.filter((c) => c.severity === "should");
  const mediumConstraints = result.constraints.filter((c) => c.severity === "style");

  console.log(`Constraints (${result.constraints.length}):`);
  console.log("────────────────");

  if (
    criticalConstraints.length === 0 &&
    highConstraints.length === 0 &&
    mediumConstraints.length === 0
  ) {
    console.log("  (none - Use 'lexsona rules learn' to add rules)\n");
  } else {
    // Display critical constraints
    for (const c of criticalConstraints) {
      console.log(`  [critical] ${c.rule_id}`);
      console.log(`    ${c.text}`);
      console.log(`    Source: ${formatConstraintSourceHumanReadable(c)}\n`);
    }

    // Display high constraints
    for (const c of highConstraints) {
      console.log(`  [high] ${c.rule_id}`);
      console.log(`    ${c.text}`);
      console.log(`    Source: ${formatConstraintSourceHumanReadable(c)}\n`);
    }

    // Display medium constraints
    for (const c of mediumConstraints) {
      console.log(`  [medium] ${c.rule_id}`);
      console.log(`    ${c.text}`);
      console.log(`    Source: ${formatConstraintSourceHumanReadable(c)}\n`);
    }
  }

  // Display principles
  if (result.principles.length > 0) {
    console.log(`Principles (${result.principles.length}):`);
    console.log("───────────────");
    for (const p of result.principles) {
      console.log(`  ${p.id}: ${p.description}`);
    }
    console.log("");
  }
}

/**
 * Register constraints noun commands
 */
export function registerConstraintsCommands(program: Command): void {
  const constraints = program.command("constraints").description("View and derive constraints");

  // lexsona constraints derive
  constraints
    .command("derive")
    .description("Derive constraints from active persona + rules")
    .option("--domain <domain>", "Domain context (deprecated, use --project)")
    .option("--project <name>", "Project context")
    .option("--module <id>", "Module ID context")
    .option("--task <type>", "Task type context")
    .option("--persona <name>", "Persona ID to use")
    .option("--auto-scope", "Automatically infer scope from git diff or touched files")
    .option("--verbose", "Show detailed information including inferred scope")
    .option("--json", "Output as JSON")
    .option("--provenance <mode>", "Provenance mode: 'full' (default) or 'compact'")
    .action(async function (this: Command, options) {
      // Check both local --json and global --json
      const jsonMode = options.json || isJsonMode(this);

      const active = getActivePersona().personaId;
      const personaId = options.persona ?? active ?? "quality-first_engineering";

      // Validate persona exists (so we can fail loud with a friendly message)
      try {
        await loadPersona(personaId);
      } catch {
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "Persona not found",
                message: `Persona "${personaId}" not found`,
                hint: "Use 'lexsona persona list' to see available personas",
              },
              null,
              2
            )
          );
        } else {
          console.error(`Error: Persona "${personaId}" not found.`);
          console.error("  Use 'lexsona persona list' to see available personas.");
        }
        process.exitCode = 1;
        return;
      }

      // Build context - prefer --project over --domain
      const projectOrDomain = options.project ?? options.domain;

      // Handle auto-scope inference
      let moduleId = options.module;

      if (options.autoScope && !moduleId) {
        try {
          const inferResult = await inferScope({
            includeStaged: true,
          });

          if (inferResult.moduleIds.length > 0) {
            // Use first matched module (could be enhanced to support multiple)
            moduleId = inferResult.moduleIds[0];

            if (options.verbose && !jsonMode) {
              console.log(
                `Inferred scope: [${inferResult.moduleIds.join(", ")}] from ${inferResult.touchedFiles.length} files`
              );
              console.log(`  Source: ${inferResult.source}`);
              console.log("");
            }
          } else if (options.verbose && !jsonMode) {
            console.log("No scope inferred (no lexmap found or no matching modules)");
            console.log("");
          }
        } catch (error) {
          // Don't fail hard on scope inference errors - just warn
          if (options.verbose && !jsonMode) {
            console.warn(
              `Warning: Scope inference failed: ${error instanceof Error ? error.message : String(error)}`
            );
            console.log("");
          }
        }
      }

      const context: DeriveContext = {
        domain: projectOrDomain,
        module_id: moduleId,
        taskType: options.task,
      };

      // Connect to Lex and get rules
      const config: LexSonaConfig = {
        lexDb: process.env.LEX_DB_PATH,
        persona: personaId,
        domain: projectOrDomain,
      };

      let instance: LexSona | null = null;
      try {
        instance = await LexSona.connect(config);
        const result = await instance.deriveConstraints(context);

        // Cache result for show/explain across invocations
        writeCachedConstraintSet(result);

        if (jsonMode) {
          console.log(JSON.stringify(formatConstraintsAsJson(result, options.provenance), null, 2));
          return;
        }

        writeConstraintsHumanReadable(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "Failed to derive constraints",
                message,
              },
              null,
              2
            )
          );
        } else {
          console.error(`Error: ${message}`);
        }
        process.exitCode = 1;
      } finally {
        instance?.close();
      }
    });

  // lexsona constraints show
  constraints
    .command("show")
    .description("Show last derived constraint set")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, options) {
      // Check both local --json and global --json
      const jsonMode = options.json || isJsonMode(this);

      const cached = readCachedConstraintSet();
      if (!cached) {
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "No cached constraints",
                message: "No constraint set cached",
                hint: "Use 'lexsona constraints derive' first",
              },
              null,
              2
            )
          );
        } else {
          console.log("No constraint set cached.");
          console.log("  (Use 'lexsona constraints derive' first)");
        }
        return;
      }

      if (jsonMode) {
        console.log(JSON.stringify(formatConstraintsAsJson(cached), null, 2));
        return;
      }

      writeConstraintsHumanReadable(cached);
    });

  // lexsona constraints explain [id]
  constraints
    .command("explain [id]")
    .description("Explain why constraint(s) are active")
    .option("--format <format>", "Output format: prose (default) or json")
    .action(async function (this: Command, id: string | undefined, options: { format?: string }) {
      const jsonMode = isJsonMode(this);
      const outputFormat = options.format || (jsonMode ? "json" : "prose");

      const cached = readCachedConstraintSet();
      if (!cached) {
        if (jsonMode || outputFormat === "json") {
          console.log(
            JSON.stringify(
              {
                error: "no_cache",
                message: "No constraint set cached",
                hint: "Use 'lexsona constraints derive' first",
              },
              null,
              2
            )
          );
        } else {
          console.log("No constraint set cached.");
          console.log("  (Use 'lexsona constraints derive' first)");
        }
        return;
      }

      // If no ID provided, explain all constraints
      if (!id) {
        const explanations = explainAllConstraints(cached);

        if (outputFormat === "json") {
          console.log(JSON.stringify(formatAllExplanationsJson(explanations), null, 2));
        } else {
          console.log(formatAllExplanationsProse(explanations));
        }
        return;
      }

      // Explain specific constraint
      const constraint = cached.constraints.find((c) => c.rule_id === id);
      if (!constraint) {
        if (jsonMode || outputFormat === "json") {
          console.log(
            JSON.stringify(
              {
                error: "not_found",
                id,
                message: `Constraint "${id}" not found in last derivation`,
                available: cached.constraints.map((c) => c.rule_id),
              },
              null,
              2
            )
          );
        } else {
          console.error(`Constraint "${id}" not found in last derivation.`);
          console.error(`  Available: ${cached.constraints.map((c) => c.rule_id).join(", ")}`);
        }
        process.exitCode = 1;
        return;
      }

      const explanation = explainConstraint(constraint, cached);

      if (outputFormat === "json") {
        console.log(JSON.stringify(formatExplanationJson(explanation), null, 2));
      } else {
        // Human-readable prose output
        console.log("\nConstraint Explanation");
        console.log("═════════════════════\n");
        console.log(formatExplanationProse(explanation));
        console.log("");
      }
    });
}

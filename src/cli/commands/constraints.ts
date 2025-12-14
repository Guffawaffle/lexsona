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
function formatConstraintsAsJson(result: ConstraintSet) {
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
      source: "learned",
      confidence: c.confidence,
    })),
    principles: result.principles.map((p) => ({
      id: p.id,
      description: p.description,
    })),
  };
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
      console.log(`    Source: learned (confidence: ${c.confidence.toFixed(2)})\n`);
    }

    // Display high constraints
    for (const c of highConstraints) {
      console.log(`  [high] ${c.rule_id}`);
      console.log(`    ${c.text}`);
      console.log(`    Source: learned (confidence: ${c.confidence.toFixed(2)})\n`);
    }

    // Display medium constraints
    for (const c of mediumConstraints) {
      console.log(`  [medium] ${c.rule_id}`);
      console.log(`    ${c.text}`);
      console.log(`    Source: learned (confidence: ${c.confidence.toFixed(2)})\n`);
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
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const active = getActivePersona().personaId;
      const personaId = options.persona ?? active ?? "quality-first_engineering";

      // Validate persona exists (so we can fail loud with a friendly message)
      try {
        await loadPersona(personaId);
      } catch {
        console.error(`Error: Persona "${personaId}" not found.`);
        console.error("  Use 'lexsona persona list' to see available personas.");
        process.exitCode = 1;
        return;
      }

      // Build context - prefer --project over --domain
      const projectOrDomain = options.project ?? options.domain;
      const context: DeriveContext = {
        domain: projectOrDomain,
        module_id: options.module,
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

        if (options.json) {
          console.log(JSON.stringify(formatConstraintsAsJson(result), null, 2));
          return;
        }

        writeConstraintsHumanReadable(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
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
    .action(async (options) => {
      const cached = readCachedConstraintSet();
      if (!cached) {
        console.log("No constraint set cached.");
        console.log("  (Use 'lexsona constraints derive' first)");
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(formatConstraintsAsJson(cached), null, 2));
        return;
      }

      writeConstraintsHumanReadable(cached);
    });

  // lexsona constraints explain <id>
  constraints
    .command("explain <id>")
    .description("Explain why a constraint is active")
    .action(async (id: string) => {
      const cached = readCachedConstraintSet();
      if (!cached) {
        console.log("No constraint set cached.");
        console.log("  (Use 'lexsona constraints derive' first)");
        return;
      }

      const constraint = cached.constraints.find((c) => c.rule_id === id);
      if (!constraint) {
        console.error(`Constraint "${id}" not found in last derivation.`);
        console.error(`  Available: ${cached.constraints.map((c) => c.rule_id).join(", ")}`);
        process.exitCode = 1;
        return;
      }

      console.log(`\nConstraint Explanation`);
      console.log("═════════════════════\n");

      console.log(`ID: ${constraint.rule_id}`);
      console.log(`Text: ${constraint.text}`);
      console.log(`Severity: ${constraint.severity}`);
      console.log(`Category: ${constraint.category}`);
      console.log(`Confidence: ${constraint.confidence.toFixed(2)}\n`);

      console.log(`Why is this constraint active?\n`);
      console.log(`  ✓ Persona "${cached.personaId}" includes category "${constraint.category}"`);
      console.log(
        `  ✓ Confidence ${constraint.confidence.toFixed(2)} >= threshold ${cached.metadata.confidenceThreshold}`
      );

      if (cached.metadata.confidenceCeiling !== undefined) {
        console.log(
          `  ✓ Offline confidence ceiling applied: <= ${cached.metadata.confidenceCeiling.toFixed(2)}`
        );
      }

      // Show derivation context if present
      const hasContext =
        cached.context.domain || cached.context.module_id || cached.context.taskType;

      if (hasContext) {
        console.log(`\nDerived in context:`);
        if (cached.context.domain) {
          console.log(`  Domain: ${cached.context.domain}`);
        }
        if (cached.context.module_id) {
          console.log(`  Module: ${cached.context.module_id}`);
        }
        if (cached.context.taskType) {
          console.log(`  Task: ${cached.context.taskType}`);
        }
      }

      console.log(`\nSource: learned from behavioral corrections`);
      console.log("");
    });
}

/**
 * Constraints Commands - lexsona constraints <verb>
 *
 * @module
 */

import { Command } from "commander";
import { LexSona, type LexSonaConfig } from "../../core/lexsona.js";
import { loadPersona } from "../../persona/loader.js";
import {
  deriveConstraints,
  type DeriveContext,
  type ConstraintSet,
} from "../../constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../../rules/types.js";

// Module-level state to cache last derivation
let lastDerivation: ConstraintSet | null = null;

/**
 * Format constraint set as JSON output matching the specification
 */
function formatConstraintsAsJson(result: ConstraintSet, domain?: string) {
  return {
    version: 1,
    persona: result.personaId,
    domain,
    derivedAt: result.derivedAt,
    inputHash: result.inputHash,
    constraints: result.constraints.map((c) => ({
      id: c.rule_id,
      description: c.text,
      severity:
        c.severity === "must" ? "critical" : c.severity === "should" ? "high" : "medium",
      source: "learned",
      confidence: c.confidence,
    })),
    principles: result.principles.map((p) => ({
      id: p.id,
      description: p.description,
    })),
  };
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
      const personaId = options.persona ?? "quality-first_engineering";

      // Load persona
      let persona;
      try {
        persona = await loadPersona(personaId);
      } catch {
        console.error(`Error: Persona "${personaId}" not found.`);
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

      const instance = await LexSona.connect(config);
      const lexRules = await instance.getRules({
        domain: projectOrDomain,
      });
      instance.close();

      // Convert Lex rules to LexSona format (include all required fields)
      const sonaRules: BehaviorRuleWithConfidence[] = lexRules.map((r) => ({
        rule_id: r.rule_id,
        text: r.text,
        severity: r.severity,
        category: r.category,
        source: "learned" as const,
        scope: r.scope ?? {},
        effective_confidence: r.effective_confidence,
        created_at: r.created_at,
        updated_at: r.updated_at,
        // Additional fields from Lex BehaviorRuleWithConfidence
        confidence: r.confidence,
        decay_factor: r.decay_factor,
        alpha: r.alpha,
        beta: r.beta,
        observation_count: r.observation_count,
        decay_tau: r.decay_tau,
        last_observed: r.last_observed,
      }));

      // Derive constraints using the persona directly
      const result = deriveConstraints(
        persona,
        sonaRules,
        [], // No baseline principles loaded yet
        context
      );

      // Cache result
      lastDerivation = result;

      if (options.json) {
        console.log(JSON.stringify(formatConstraintsAsJson(result, context.domain), null, 2));
        return;
      }

      // Human-readable output matching specification
      console.log("Constraint Set (v1)");
      console.log("═══════════════════\n");

      console.log(`Persona: ${result.personaId}`);
      if (context.domain) console.log(`Domain: ${context.domain}`);
      console.log(`Derived: ${result.derivedAt}\n`);

      // Group constraints by severity
      const criticalConstraints = result.constraints.filter((c) => c.severity === "must");
      const highConstraints = result.constraints.filter((c) => c.severity === "should");
      const mediumConstraints = result.constraints.filter((c) => c.severity === "style");

      console.log(`Constraints (${result.constraints.length}):`);
      console.log("────────────────");

      if (criticalConstraints.length === 0 && highConstraints.length === 0 && mediumConstraints.length === 0) {
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
    });

  // lexsona constraints show
  constraints
    .command("show")
    .description("Show last derived constraint set")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      if (!lastDerivation) {
        console.log("No constraint set cached.");
        console.log("  (Use 'lexsona constraints derive' first)");
        return;
      }

      if (options.json) {
        console.log(
          JSON.stringify(formatConstraintsAsJson(lastDerivation, lastDerivation.context.domain), null, 2)
        );
        return;
      }

      // Human-readable output matching specification
      console.log("Constraint Set (v1)");
      console.log("═══════════════════\n");

      console.log(`Persona: ${lastDerivation.personaId}`);
      if (lastDerivation.context.domain) console.log(`Domain: ${lastDerivation.context.domain}`);
      console.log(`Derived: ${lastDerivation.derivedAt}\n`);

      // Group constraints by severity
      const criticalConstraints = lastDerivation.constraints.filter((c) => c.severity === "must");
      const highConstraints = lastDerivation.constraints.filter((c) => c.severity === "should");
      const mediumConstraints = lastDerivation.constraints.filter((c) => c.severity === "style");

      console.log(`Constraints (${lastDerivation.constraints.length}):`);
      console.log("────────────────");

      if (criticalConstraints.length === 0 && highConstraints.length === 0 && mediumConstraints.length === 0) {
        console.log("  (none)\n");
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
      if (lastDerivation.principles.length > 0) {
        console.log(`Principles (${lastDerivation.principles.length}):`);
        console.log("───────────────");
        for (const p of lastDerivation.principles) {
          console.log(`  ${p.id}: ${p.description}`);
        }
        console.log("");
      }
    });

  // lexsona constraints explain <id>
  constraints
    .command("explain <id>")
    .description("Explain why a constraint is active")
    .action(async (id: string) => {
      if (!lastDerivation) {
        console.log("No constraint set cached.");
        console.log("  (Use 'lexsona constraints derive' first)");
        return;
      }

      const constraint = lastDerivation.constraints.find((c) => c.rule_id === id);
      if (!constraint) {
        console.error(`Constraint "${id}" not found in last derivation.`);
        console.error(
          `  Available: ${lastDerivation.constraints.map((c) => c.rule_id).join(", ")}`
        );
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
      console.log(`  ✓ Persona "${lastDerivation.personaId}" includes category "${constraint.category}"`);
      console.log(
        `  ✓ Confidence ${constraint.confidence.toFixed(2)} >= threshold ${lastDerivation.metadata.confidenceThreshold}`
      );

      // Show derivation context if present
      const hasContext =
        lastDerivation.context.domain ||
        lastDerivation.context.module_id ||
        lastDerivation.context.taskType;

      if (hasContext) {
        console.log(`\nDerived in context:`);
        if (lastDerivation.context.domain) {
          console.log(`  Domain: ${lastDerivation.context.domain}`);
        }
        if (lastDerivation.context.module_id) {
          console.log(`  Module: ${lastDerivation.context.module_id}`);
        }
        if (lastDerivation.context.taskType) {
          console.log(`  Task: ${lastDerivation.context.taskType}`);
        }
      }

      console.log(`\nSource: learned from behavioral corrections`);
      console.log("");
    });
}

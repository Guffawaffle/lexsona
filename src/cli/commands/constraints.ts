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
 * Register constraints noun commands
 */
export function registerConstraintsCommands(program: Command): void {
  const constraints = program.command("constraints").description("View and derive constraints");

  // lexsona constraints derive
  constraints
    .command("derive")
    .description("Derive constraints from active persona + rules")
    .option("--domain <domain>", "Domain context")
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

      // Build context
      const context: DeriveContext = {
        domain: options.domain,
        module_id: options.module,
        taskType: options.task,
      };

      // Connect to Lex and get rules
      const config: LexSonaConfig = {
        lexDb: process.env.LEX_DB_PATH,
        persona: personaId,
        domain: options.domain,
      };

      const instance = await LexSona.connect(config);
      const lexRules = await instance.getRules({
        domain: options.domain,
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
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Constraints derived for persona: ${result.personaId}\n`);
      console.log(`Context:`);
      if (context.domain) console.log(`  domain: ${context.domain}`);
      if (context.module_id) console.log(`  module: ${context.module_id}`);
      if (context.taskType) console.log(`  task: ${context.taskType}`);
      console.log("");

      console.log(`Metadata:`);
      console.log(`  rules considered: ${result.metadata.rulesConsidered}`);
      console.log(`  rules filtered: ${result.metadata.rulesFiltered}`);
      console.log(`  confidence threshold: ${result.metadata.confidenceThreshold}`);
      console.log("");

      if (result.constraints.length === 0) {
        console.log("No constraints derived.");
        console.log("  (Use 'lexsona rules learn' to add rules)");
        return;
      }

      console.log(`Constraints (${result.constraints.length}):\n`);
      for (const c of result.constraints) {
        const severityIcon = c.severity === "must" ? "🔴" : c.severity === "should" ? "🟡" : "⚪";
        console.log(`  ${severityIcon} [${c.rule_id}] ${c.text}`);
        console.log(`     confidence: ${c.confidence.toFixed(2)}, category: ${c.category}`);
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
        console.log(JSON.stringify(lastDerivation, null, 2));
        return;
      }

      console.log(`Last derivation for persona: ${lastDerivation.personaId}`);
      console.log(`  derived at: ${lastDerivation.derivedAt}`);
      console.log(`  constraints: ${lastDerivation.constraints.length}`);
      console.log(`  principles: ${lastDerivation.principles.length}`);
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

      console.log(`Constraint: ${constraint.rule_id}\n`);
      console.log(`Text: ${constraint.text}`);
      console.log(`Severity: ${constraint.severity}`);
      console.log(`Confidence: ${constraint.confidence.toFixed(2)}`);
      console.log(`Category: ${constraint.category}`);
      console.log("");
      console.log(`Active because:`);
      console.log(
        `  - Persona "${lastDerivation.personaId}" includes category "${constraint.category}"`
      );
      console.log(
        `  - Confidence ${constraint.confidence.toFixed(2)} >= threshold ${lastDerivation.metadata.confidenceThreshold}`
      );
    });
}

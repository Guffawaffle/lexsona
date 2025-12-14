/**
 * Rules Commands - lexsona rules <verb>
 *
 * @module
 */

import { Command } from "commander";
import { LexSona, type LexSonaConfig } from "../../core/lexsona.js";
import type { RuleScope } from "../../rules/types.js";

/**
 * Initialize LexSona with connection to Lex
 */
async function initLexSona(): Promise<LexSona | null> {
  const config: LexSonaConfig = {
    lexDb: process.env.LEX_DB_PATH,
  };

  const instance = await LexSona.connect(config);
  if (!instance.isConnected()) {
    console.error("Error: Not connected to Lex database.");
    console.error("  Set LEX_DB_PATH or run 'lex init' first.");
    return null;
  }
  return instance;
}

/**
 * Register rules noun commands
 */
export function registerRulesCommands(program: Command): void {
  const rules = program.command("rules").description("Manage behavioral rules");

  // lexsona rules list
  rules
    .command("list")
    .description("List active behavioral rules")
    .option("--domain <domain>", "Filter by project (deprecated name: domain)")
    .option("--min-confidence <n>", "Minimum confidence threshold", parseFloat)
    .action(async (options) => {
      const instance = await initLexSona();
      if (!instance) return;

      const rulesList = await instance.getRules({
        domain: options.domain,
        minConfidence: options.minConfidence ?? 0.3,
      });

      if (rulesList.length === 0) {
        console.log("No rules found.");
        return;
      }

      console.log(`Found ${rulesList.length} rules:\n`);
      for (const rule of rulesList) {
        const scopeStr = rule.scope.module_id ? ` [${rule.scope.module_id}]` : "";
        console.log(`  ${rule.rule_id}${scopeStr}`);
        console.log(`    ${rule.text}`);
        console.log(
          `    severity: ${rule.severity}, confidence: ${rule.effective_confidence.toFixed(2)}`
        );
        console.log("");
      }
    });

  // lexsona rules learn <correction>
  rules
    .command("learn <correction>")
    .description("Record a behavioral correction")
    .option("--domain <domain>", "Project context (deprecated name: domain)")
    .option("--module <id>", "Module scope")
    .option("--task <type>", "Task type context")
    .option("--severity <level>", "Severity: must, should, style", "should")
    .option("--category <cat>", "Rule category", "general")
    .option("--reinforce", "Reinforce (positive polarity)", true)
    .option("--counter", "Counterexample (negative polarity)")
    .action(async (correction: string, options) => {
      const instance = await initLexSona();
      if (!instance) return;

      const polarity = options.counter ? -1 : 1;
      const scope: RuleScope = {};
      if (options.domain) scope.project = options.domain;
      if (options.module) scope.module_id = options.module;
      if (options.task) scope.task_type = options.task;

      const severity = options.severity as "must" | "should" | "style";
      if (!["must", "should", "style"].includes(severity)) {
        console.error(`Invalid severity: ${severity}. Use: must, should, style`);
        return;
      }

      await instance.learn({
        correction,
        severity,
        category: options.category,
        polarity: polarity as 1 | -1,
        context: scope,
      });

      console.log(`✓ Learned: "${correction}"`);
      console.log(`  severity: ${severity}, polarity: ${polarity > 0 ? "reinforce" : "counter"}`);
      if (scope.project) console.log(`  project: ${scope.project}`);
      if (scope.module_id) console.log(`  module: ${scope.module_id}`);
    });

  // lexsona rules apply
  rules
    .command("apply")
    .description("Apply rules to derive current constraints")
    .option("--domain <domain>", "Domain context")
    .action(async (_options) => {
      // TODO: Implement rules application
      console.log("Applying rules to derive constraints...");
    });

  // lexsona rules forget <id>
  rules
    .command("forget <id>")
    .description("Forget a specific rule")
    .option("--force", "Skip confirmation")
    .action(async (id: string, _options) => {
      // TODO: Implement rule forgetting
      console.log(`Forgetting rule: ${id}`);
    });
}

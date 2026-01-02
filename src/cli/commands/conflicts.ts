/**
 * Conflicts Commands - lexsona conflicts <verb>
 *
 * @module
 */

import { Command } from "commander";
import { LexSona, type LexSonaConfig } from "../../core/lexsona.js";
import { checkConflicts } from "../../conflicts/detector.js";
import type { Conflict } from "../../conflicts/types.js";
import { isJsonMode } from "../output.js";

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
 * Format scope for display
 */
function formatScope(scope: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (scope.module_id) parts.push(`module: ${scope.module_id}`);
  if (scope.project) parts.push(`project: ${scope.project}`);
  if (scope.task_type) parts.push(`task: ${scope.task_type}`);
  return parts.length > 0 ? parts.join(", ") : "*";
}

/**
 * Format conflicts in prose format
 */
function formatConflictsProse(conflicts: Conflict[], totalRules: number): void {
  if (conflicts.length === 0) {
    console.log("✓ No conflicts detected");
    console.log(`  Analyzed ${totalRules} rules`);
    return;
  }

  console.log(`⚠️  ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} detected\n`);

  conflicts.forEach((conflict, index) => {
    console.log(`CONFLICT ${index + 1}: ${conflict.category}`);
    console.log(`  Rule A: ${conflict.ruleA} [prescriptive]`);
    console.log(`  Rule B: ${conflict.ruleB} [permissive]`);
    console.log(`  Severity: ${conflict.severity}`);

    if (conflict.scopeOverlap) {
      console.log(`  Scope overlap: ${formatScope(conflict.scopeOverlap)}`);
    }

    console.log(`  Suggested: ${conflict.resolution.description}`);
    console.log("");
  });

  console.log(
    `Total: ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} in ${totalRules} rules`
  );
}

/**
 * Register conflicts noun commands
 */
export function registerConflictsCommands(program: Command): void {
  const conflicts = program.command("conflicts").description("Detect rule conflicts");

  // lexsona conflicts check
  conflicts
    .command("check")
    .description("Check for conflicting rules")
    .option("--scope <scope>", "Filter rules by scope (e.g., module_id:cli)")
    .option("--format <format>", "Output format: json or prose", "prose")
    .action(async function (this: Command, options) {
      const jsonMode = isJsonMode(this) || options.format === "json";

      const instance = await initLexSona();
      if (!instance) {
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "Not connected",
                message: "Not connected to Lex database",
                hint: "Set LEX_DB_PATH environment variable or run 'lex init' first",
              },
              null,
              2
            )
          );
        }
        return;
      }

      try {
        // Get all rules with minimal observation threshold
        const allRules = await instance.getRules({ minN: 1 });

        // Apply scope filter if provided
        let rules = allRules;
        if (options.scope) {
          const [field, value] = options.scope.split(":");
          if (field && value) {
            rules = allRules.filter((rule) => {
              const scopeValue = rule.scope[field as keyof typeof rule.scope];
              return scopeValue === value;
            });
          }
        }

        // Detect conflicts
        const result = checkConflicts(rules);

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                totalRules: result.totalRules,
                conflictCount: result.conflictCount,
                conflicts: result.conflicts.map((c) => ({
                  ruleA: c.ruleA,
                  ruleB: c.ruleB,
                  category: c.category,
                  severity: c.severity,
                  scopeOverlap: c.scopeOverlap,
                  resolution: {
                    type: c.resolution.type,
                    description: c.resolution.description,
                  },
                })),
              },
              null,
              2
            )
          );
        } else {
          formatConflictsProse(result.conflicts, result.totalRules);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorObj = {
          error: "Failed to check conflicts",
          message: errorMsg,
        };

        if (jsonMode) {
          console.log(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`Error: ${errorObj.message}`);
        }
      }
    });
}

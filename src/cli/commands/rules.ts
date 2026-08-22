/**
 * Rules Commands - lexsona rules <verb>
 *
 * @module
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { LexSona } from "../../core/lexsona.js";
import type { RuleScope } from "../../rules/types.js";
import { isJsonMode } from "../output.js";
import { LEXSONA_DEFAULTS } from "../../core/lexConnection.js";
import { bootstrapLegacyLexSona } from "../legacy-bootstrap.js";

/**
 * Initialize LexSona with connection to Lex
 */
async function initLexSona(): Promise<LexSona | null> {
  const { config } = bootstrapLegacyLexSona();
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
    .option("--all", "Show all rules including those below observation threshold")
    .action(async function (this: Command, options) {
      const jsonMode = isJsonMode(this);
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

      // --all flag sets minN=1 to show all rules regardless of observation count
      const minN = options.all ? 1 : LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT;

      const rulesList = await instance.getRules({
        domain: options.domain,
        minConfidence: options.minConfidence ?? 0.3,
        minN,
      });

      if (rulesList.length === 0) {
        if (jsonMode) {
          const output: Record<string, unknown> = {
            rules: [],
            showingAll: !!options.all,
          };
          // Include hint for agents when rules list is empty (AX-004)
          if (!options.all) {
            output.hint = "Rules need 3+ observations to appear. Use --all to show all rules.";
            output.threshold = LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT;
          }
          console.log(JSON.stringify(output, null, 2));
        } else {
          if (options.all) {
            console.log("No rules found.");
          } else {
            console.log("No rules found (rules need 3+ observations to appear).");
            console.log("Use --all to show all rules including new ones.");
          }
        }
        return;
      }

      if (jsonMode) {
        const rulesOutput = rulesList.map((rule) => ({
          id: rule.rule_id,
          text: rule.text,
          category: rule.category,
          severity: rule.severity,
          confidence: rule.effective_confidence,
          observationCount: rule.observation_count,
          scope: rule.scope,
        }));
        console.log(JSON.stringify({ rules: rulesOutput, showingAll: !!options.all }, null, 2));
      } else {
        const allNote = options.all ? " (showing all)" : "";
        console.log(`Found ${rulesList.length} rules${allNote}:\n`);
        for (const rule of rulesList) {
          const scopeStr = rule.scope.module_id ? ` [${rule.scope.module_id}]` : "";
          const obsNote =
            rule.observation_count < LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT
              ? ` (${rule.observation_count}/${LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT} obs)`
              : "";
          console.log(`  ${rule.rule_id}${scopeStr}${obsNote}`);
          console.log(`    ${rule.text}`);
          console.log(
            `    severity: ${rule.severity}, confidence: ${rule.effective_confidence.toFixed(2)}`
          );
          console.log("");
        }
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
    .option("--json", "Output result as JSON")
    .action(async function (this: Command, correction: string, options) {
      // Check both local --json and global --json
      const jsonMode = options.json || isJsonMode(this);

      // Validate correction is not empty
      if (!correction || correction.trim().length === 0) {
        const error = {
          error: "Empty correction",
          message: "Correction text cannot be empty",
          usage: "lexsona rules learn <correction> [options]",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Usage: ${error.usage}`);
        }
        return;
      }

      const instance = await initLexSona();
      if (!instance) {
        const error = {
          error: "Not connected",
          message: "Not connected to Lex database",
          hint: "Set LEX_DB_PATH environment variable or run 'lex init' first",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        }
        // Error already logged by initLexSona in non-JSON mode
        return;
      }

      const polarity = options.counter ? -1 : 1;

      // Warn if both reinforce and counter are specified
      if (options.counter && options.reinforce !== true) {
        const warning = {
          warning: "Both --reinforce and --counter specified",
          message: "--counter takes precedence over --reinforce",
        };
        if (jsonMode) {
          // Include warning in JSON but continue
          console.error(JSON.stringify(warning, null, 2));
        } else {
          console.error(`Warning: ${warning.message}`);
        }
      }

      const scope: RuleScope = {};
      if (options.domain) scope.project = options.domain;
      if (options.module) scope.module_id = options.module;
      if (options.task) scope.task_type = options.task;

      const severity = options.severity as "must" | "should" | "style";
      if (!["must", "should", "style"].includes(severity)) {
        const error = {
          error: "Invalid severity",
          message: `Invalid severity: ${severity}`,
          validValues: ["must", "should", "style"],
          hint: "Use --severity with one of: must, should, style",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Valid values: ${error.validValues.join(", ")}`);
        }
        return;
      }

      try {
        const learnResult = await instance.learn({
          correction,
          severity,
          category: options.category,
          polarity: polarity as 1 | -1,
          context: scope,
        });

        // Get rule count summary for enhanced output
        const allRules = await instance.getRules({ minN: 1 });
        const severityCounts = {
          must: allRules.filter((r) => r.severity === "must").length,
          should: allRules.filter((r) => r.severity === "should").length,
          style: allRules.filter((r) => r.severity === "style").length,
        };

        if (jsonMode) {
          const result = {
            success: true,
            isNew: learnResult.isNew,
            rule: {
              id: learnResult.rule.rule_id,
              text: learnResult.rule.text,
              severity: learnResult.rule.severity,
              category: learnResult.rule.category,
              observationCount: learnResult.rule.observation_count,
              confidence: learnResult.rule.effective_confidence,
            },
            polarity: polarity > 0 ? "reinforce" : "counter",
            context: scope,
            summary: {
              totalRules: allRules.length,
              bySeverity: severityCounts,
            },
            ...(learnResult.isNew
              ? {}
              : {
                  previous: {
                    observationCount: learnResult.previousObservationCount,
                    confidence: learnResult.previousConfidence,
                  },
                }),
          };
          console.log(JSON.stringify(result, null, 2));
        } else {
          // Enhanced human-readable output
          if (learnResult.isNew) {
            console.log(`✓ Learned: "${correction}"`);
          } else {
            console.log(`✓ Updated rule: "${correction}"`);
          }
          console.log("");
          console.log(`  Severity:  ${severity}`);
          console.log(`  Polarity:  ${polarity > 0 ? "reinforce" : "counter"}`);
          console.log(`  Category:  ${options.category}`);
          if (scope.project) console.log(`  Project:   ${scope.project}`);
          if (scope.module_id) console.log(`  Module:    ${scope.module_id}`);
          if (scope.task_type) console.log(`  Task:      ${scope.task_type}`);

          // Show confidence change for updates
          if (!learnResult.isNew && learnResult.previousConfidence !== undefined) {
            const delta = learnResult.rule.effective_confidence - learnResult.previousConfidence;
            const deltaStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
            console.log("");
            console.log(
              `  Confidence: ${learnResult.previousConfidence.toFixed(2)} → ${learnResult.rule.effective_confidence.toFixed(2)} (${deltaStr})`
            );
            console.log(
              `  Observations: ${learnResult.previousObservationCount} → ${learnResult.rule.observation_count}`
            );
          }

          // Summary section
          console.log("");
          console.log("Rules summary:");
          console.log(
            `  Total: ${allRules.length} (${learnResult.isNew ? "1 new" : "updated existing"})`
          );
          console.log(
            `  By severity: ${severityCounts.must} must, ${severityCounts.should} should, ${severityCounts.style} style`
          );

          // Helpful guidance
          console.log("");
          console.log(
            "💡 Run 'lexsona constraints derive' to see how this affects your constraints."
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorObj = {
          error: "Failed to record correction",
          message: errorMsg,
          hint: "Check database connection and permissions",
        };
        if (jsonMode) {
          console.log(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`Error: ${errorObj.message}`);
          console.error(`Hint: ${errorObj.hint}`);
        }
      }
    });

  // lexsona rules teach <correction>
  rules
    .command("teach <correction>")
    .description("Teach a core rule that is immediately active (skips observation threshold)")
    .option("--domain <domain>", "Project context")
    .option("--module <id>", "Module scope")
    .option("--task <type>", "Task type context")
    .option("--severity <level>", "Severity: must, should, style", "should")
    .option("--category <cat>", "Rule category", "general")
    .option("--json", "Output result as JSON")
    .action(async function (this: Command, correction: string, options) {
      const jsonMode = options.json || isJsonMode(this);

      if (!correction || correction.trim().length === 0) {
        const error = {
          error: "Empty correction",
          message: "Correction text cannot be empty",
          usage: "lexsona rules teach <correction> [options]",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        } else {
          console.error(`Error: ${error.message}`);
          console.error(`Usage: ${error.usage}`);
        }
        return;
      }

      const instance = await initLexSona();
      if (!instance) {
        const error = {
          error: "Not connected",
          message: "Not connected to Lex database",
          hint: "Set LEX_DB_PATH environment variable or run 'lex init' first",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        }
        return;
      }

      const severity = options.severity as "must" | "should" | "style";
      if (!["must", "should", "style"].includes(severity)) {
        const error = {
          error: "Invalid severity",
          message: `Invalid severity: ${severity}`,
          validValues: ["must", "should", "style"],
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        } else {
          console.error(`Error: ${error.message}`);
        }
        return;
      }

      const scope: RuleScope = {};
      if (options.domain) scope.project = options.domain;
      if (options.module) scope.module_id = options.module;
      if (options.task) scope.task_type = options.task;

      try {
        const rule = await instance.teach({
          correction,
          severity,
          category: options.category,
          polarity: 1, // Teaching is always reinforcement
          context: scope,
        });

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                success: true,
                rule: {
                  id: rule.rule_id,
                  text: rule.text,
                  severity: rule.severity,
                  confidence: rule.effective_confidence,
                  observationCount: rule.observation_count,
                  status: "core",
                },
              },
              null,
              2
            )
          );
        } else {
          console.log(`✓ Taught core rule: "${correction}"`);
          console.log(`  id: ${rule.rule_id}`);
          console.log(
            `  severity: ${severity}, confidence: ${rule.effective_confidence.toFixed(2)}`
          );
          console.log(`  status: core (immediately active)`);
          if (scope.project) console.log(`  project: ${scope.project}`);
          if (scope.module_id) console.log(`  module: ${scope.module_id}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify({ error: "Failed to teach rule", message: errorMsg }, null, 2)
          );
        } else {
          console.error(`Error: ${errorMsg}`);
        }
      }
    });

  // lexsona rules promote <id>
  rules
    .command("promote <id>")
    .description("Promote an existing rule to core status (reach observation threshold)")
    .option("--json", "Output result as JSON")
    .action(async function (this: Command, ruleId: string, options) {
      const jsonMode = options.json || isJsonMode(this);

      const instance = await initLexSona();
      if (!instance) {
        const error = {
          error: "Not connected",
          message: "Not connected to Lex database",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        }
        return;
      }

      try {
        // First get the current rule to show before/after
        const before = await instance.getRuleById(ruleId);
        if (!before) {
          const error = {
            error: "Rule not found",
            message: `No rule found with ID: ${ruleId}`,
            hint: "Use 'lexsona rules list --all' to see all rule IDs",
          };
          if (jsonMode) {
            console.log(JSON.stringify(error, null, 2));
          } else {
            console.error(`Error: ${error.message}`);
            console.error(`Hint: ${error.hint}`);
          }
          return;
        }

        const previousN = before.observation_count;

        // Already at threshold?
        if (previousN >= LEXSONA_DEFAULTS.MIN_OBSERVATION_COUNT) {
          if (jsonMode) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  message: "Rule is already at core status",
                  rule: {
                    id: before.rule_id,
                    text: before.text,
                    observationCount: before.observation_count,
                    status: "core",
                  },
                },
                null,
                2
              )
            );
          } else {
            console.log(
              `ℹ Rule is already at core status (${before.observation_count} observations)`
            );
            console.log(`  ${before.text}`);
          }
          return;
        }

        const promoted = await instance.promoteRule(ruleId);
        if (!promoted) {
          throw new Error("Promotion failed unexpectedly");
        }

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                success: true,
                rule: {
                  id: promoted.rule_id,
                  text: promoted.text,
                  previousObservationCount: previousN,
                  newObservationCount: promoted.observation_count,
                  confidence: promoted.effective_confidence,
                  status: "core",
                },
              },
              null,
              2
            )
          );
        } else {
          console.log(`✓ Promoted rule to core status`);
          console.log(`  id: ${promoted.rule_id}`);
          console.log(`  ${promoted.text}`);
          console.log(`  observations: ${previousN} → ${promoted.observation_count}`);
          console.log(`  confidence: ${promoted.effective_confidence.toFixed(2)}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify({ error: "Failed to promote rule", message: errorMsg }, null, 2)
          );
        } else {
          console.error(`Error: ${errorMsg}`);
        }
      }
    });

  // lexsona rules forget <id>
  rules
    .command("forget <id>")
    .description("Forget a specific rule")
    .option("--force", "Skip confirmation")
    .option("--json", "Output result as JSON")
    .action(async function (this: Command, ruleId: string, options) {
      const jsonMode = options.json || isJsonMode(this);

      const instance = await initLexSona();
      if (!instance) {
        const error = {
          error: "Not connected",
          message: "Not connected to Lex database",
        };
        if (jsonMode) {
          console.log(JSON.stringify(error, null, 2));
        }
        return;
      }

      try {
        // First get the rule to validate it exists
        const rule = await instance.getRuleById(ruleId);
        if (!rule) {
          const error = {
            error: "Rule not found",
            message: `No rule found with ID: ${ruleId}`,
            hint: "Use 'lexsona rules list --all' to see all rule IDs",
          };
          if (jsonMode) {
            console.log(JSON.stringify(error, null, 2));
          } else {
            console.error(`Error: ${error.message}`);
            console.error(`Hint: ${error.hint}`);
          }
          return;
        }

        // Prompt for confirmation unless --force is specified
        if (!options.force) {
          if (jsonMode) {
            // In JSON mode without --force, we can't prompt, so error
            const error = {
              error: "Confirmation required",
              message: "Use --force to skip confirmation in JSON mode",
              rule: {
                id: rule.rule_id,
                text: rule.text,
              },
            };
            console.log(JSON.stringify(error, null, 2));
            return;
          }

          // Show rule details
          console.log(`About to delete rule:`);
          console.log(`  ID: ${rule.rule_id}`);
          console.log(`  Text: ${rule.text}`);
          console.log(`  Severity: ${rule.severity}`);
          console.log(`  Observations: ${rule.observation_count}`);
          console.log("");

          // Prompt for confirmation
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question("Are you sure you want to delete this rule? (y/N): ", resolve);
          });
          rl.close();

          if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
            console.log("Cancelled.");
            return;
          }
        }

        // Delete the rule
        // Note: Rule could have been deleted by another process between validation and deletion
        const deleted = await instance.forgetRule(ruleId);
        if (!deleted) {
          throw new Error("Failed to delete rule (may have been deleted by another process)");
        }

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                success: true,
                deletedRule: {
                  id: rule.rule_id,
                  text: rule.text,
                },
              },
              null,
              2
            )
          );
        } else {
          console.log(`✓ Deleted rule: ${rule.rule_id}`);
          console.log(`  ${rule.text}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify({ error: "Failed to delete rule", message: errorMsg }, null, 2)
          );
        } else {
          console.error(`Error: ${errorMsg}`);
        }
      }
    });
}

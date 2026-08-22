/**
 * Trust Commands - lexsona trust <verb>
 *
 * CLI commands for trust gap management and agent trust profiles.
 * Provides CLI access to trust_gap_record and agent_trust_profile MCP tools.
 *
 * @module
 */

import { Command } from "commander";
import { LexSona } from "../../core/lexsona.js";
import { isJsonMode } from "../output.js";
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
 * Register trust noun commands
 */
export function registerTrustCommands(program: Command): void {
  const trust = program.command("trust").description("Manage agent trust profiles and gaps");

  // lexsona trust profile <agent_family>
  trust
    .command("profile <agent_family>")
    .description("Get trust profile for an agent family")
    .action(async function (this: Command, agentFamily: string) {
      const jsonMode = isJsonMode(this);
      const instance = await initLexSona();
      if (!instance) {
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "Not connected",
                message: "Not connected to Lex database",
                nextActions: [
                  "Set LEX_DB_PATH environment variable",
                  "Run 'lex init' to initialize the database",
                ],
              },
              null,
              2
            )
          );
        }
        return;
      }

      try {
        const profile = await instance.getAgentTrustProfile(agentFamily);
        const ruleVersion = instance.getRuleVersion();

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                agent_family: profile.agent_family,
                ruleVersion,
                total_tasks: profile.total_tasks,
                trust_gaps: profile.trust_gaps,
                gap_rate: profile.gap_rate,
                common_failure_types: profile.common_failure_types,
                first_seen: profile.first_seen,
                last_seen: profile.last_seen,
              },
              null,
              2
            )
          );
        } else {
          console.log(`\nTrust Profile: ${profile.agent_family}`);
          console.log("─".repeat(40));
          console.log(`  Total Tasks: ${profile.total_tasks}`);
          console.log(`  Trust Gaps:  ${profile.trust_gaps}`);
          console.log(`  Gap Rate:    ${(profile.gap_rate * 100).toFixed(1)}%`);
          console.log(`  Rule Version: ${ruleVersion}`);

          if (profile.common_failure_types.length > 0) {
            console.log("\n  Common Failure Types:");
            for (const failureType of profile.common_failure_types) {
              console.log(`    - ${failureType}`);
            }
          }

          if (profile.first_seen) {
            console.log(`\n  First Seen: ${profile.first_seen}`);
            console.log(`  Last Seen:  ${profile.last_seen}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "TRUST_PROFILE_FAILED",
                message,
                nextActions: ["Check agent_family spelling", "Verify Lex database connection"],
              },
              null,
              2
            )
          );
        } else {
          console.error(`Error: ${message}`);
        }
      }
    });

  // lexsona trust gap record
  trust
    .command("gap")
    .description("Record a trust gap event")
    .requiredOption("--task-id <id>", "Task identifier")
    .requiredOption("--agent-family <family>", "Agent family (e.g., claude-4, gpt-4)")
    .requiredOption("--procedure <procedure>", "Verification procedure used")
    .option("--claimed", "Agent claimed success (default: true)", true)
    .option("--no-claimed", "Agent claimed failure")
    .requiredOption("--verified", "Engine verification result (true/false)")
    .option("--failures <types...>", "Failure types (e.g., LINT_FAILED TEST_FAILED)")
    .option("--context <json>", "Additional context as JSON")
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
                nextActions: [
                  "Set LEX_DB_PATH environment variable",
                  "Run 'lex init' to initialize the database",
                ],
              },
              null,
              2
            )
          );
        }
        return;
      }

      try {
        // Parse verified as boolean
        const verified = options.verified === "true" || options.verified === true;
        const agentClaimed = options.claimed !== false;

        // Parse context if provided
        let context: Record<string, unknown> | undefined;
        if (options.context) {
          try {
            context = JSON.parse(options.context);
          } catch {
            if (jsonMode) {
              console.log(
                JSON.stringify(
                  {
                    error: "INVALID_CONTEXT",
                    message: "Context must be valid JSON",
                    nextActions: ['Provide valid JSON, e.g., --context \'{"key":"value"}\''],
                  },
                  null,
                  2
                )
              );
            } else {
              console.error(
                'Error: Context must be valid JSON, e.g., --context \'{"key":"value"}\''
              );
            }
            return;
          }
        }

        await instance.recordTrustGap({
          task_id: options.taskId,
          agent_family: options.agentFamily,
          procedure: options.procedure,
          agent_claimed: agentClaimed,
          verified,
          failures: options.failures,
          context,
        });

        const trustGap = agentClaimed !== verified;
        const ruleVersion = instance.getRuleVersion();

        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                success: true,
                ruleVersion,
                trust_gap: trustGap,
                message: trustGap
                  ? `Trust gap recorded. Confidence decay applied for ${options.agentFamily}.`
                  : "No trust gap detected (claim matches verification).",
              },
              null,
              2
            )
          );
        } else {
          if (trustGap) {
            console.log(
              `✓ Trust gap recorded for ${options.agentFamily}. Confidence decay applied.`
            );
            console.log(`  Rule Version: ${ruleVersion}`);
          } else {
            console.log("✓ No trust gap detected (claim matches verification).");
            console.log(`  Rule Version: ${ruleVersion}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (jsonMode) {
          console.log(
            JSON.stringify(
              {
                error: "TRUST_GAP_RECORD_FAILED",
                message,
                nextActions: [
                  "Verify all required options are provided",
                  "Check Lex database connection",
                ],
              },
              null,
              2
            )
          );
        } else {
          console.error(`Error: ${message}`);
        }
      }
    });
}

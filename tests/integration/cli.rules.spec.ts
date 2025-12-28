/**
 * CLI integration tests for rules commands.
 *
 * These tests exercise the Commander command handlers (option parsing + output formatting)
 * while mocking LexSona's connection to keep tests deterministic and offline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

import { registerRulesCommands } from "../../src/cli/commands/rules.js";
import { LexSona } from "../../src/core/lexsona.js";
import type { BehaviorRuleWithConfidence } from "@smartergpt/lex/lexsona";

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerRulesCommands(program);
  return program;
}

describe("rules CLI", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let connectSpy: ReturnType<typeof vi.spyOn>;
  let learnedRules: BehaviorRuleWithConfidence[] = [];

  beforeEach(() => {
    learnedRules = [];

    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Mock LexSona.connect to return a stub instance
    connectSpy = vi.spyOn(LexSona, "connect").mockImplementation(async () => {
      return {
        isConnected: () => true,
        learn: vi.fn(async (correction) => {
          // Simulate recording the correction by adding to our test array
          // Note: These alpha/beta values are simplified for testing.
          // Real Bayesian updates in Lex use more sophisticated prior calculations.
          const rule: BehaviorRuleWithConfidence = {
            rule_id: `rule-${learnedRules.length + 1}`,
            text: correction.correction,
            category: correction.category || "general",
            severity: correction.severity || "should",
            scope: correction.context,
            alpha: correction.polarity === -1 ? 1 : 2,
            beta: correction.polarity === -1 ? 2 : 1,
            observation_count: 1,
            decay_tau: 30,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_observed: new Date().toISOString(),
            confidence: 0.67,
            decay_factor: 1.0,
            effective_confidence: 0.67,
          };
          learnedRules.push(rule);
          // Return LearnResult
          return {
            rule,
            isNew: true,
          };
        }),
        getRules: vi.fn(async (filter) => {
          // Filter learned rules by domain
          if (filter?.domain) {
            return learnedRules.filter((r) => r.scope.project === filter.domain);
          }
          return learnedRules;
        }),
        close: vi.fn(),
      } as unknown as LexSona;
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    connectSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("learn command", () => {
    it("records a simple correction", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Always use TypeScript for new files",
      ]);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("✓ Learned");
      expect(output).toContain("Always use TypeScript for new files");
    });

    it("records correction with --json output", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Always use TypeScript for new files",
        "--json",
      ]);

      expect(errorSpy).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.isNew).toBe(true);
      expect(result.rule.text).toBe("Always use TypeScript for new files");
      expect(result.rule.severity).toBe("should"); // default
      expect(result.polarity).toBe("reinforce"); // default
      expect(result.summary).toBeDefined();
      expect(result.summary.totalRules).toBeGreaterThanOrEqual(1);
    });

    it("maps --domain to scope.project", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Use ESLint for linting",
        "--domain",
        "lexsona-project",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.context.project).toBe("lexsona-project");
      expect(result.context.module_id).toBeUndefined();
    });

    it("maps --module to scope.module_id", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Keep functions under 50 lines",
        "--module",
        "src/cli/commands",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.context.module_id).toBe("src/cli/commands");
    });

    it("maps --task to scope.task_type", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Write comprehensive tests",
        "--task",
        "testing",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.context.task_type).toBe("testing");
    });

    it("handles --counter flag for negative polarity", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Use lodash for utilities",
        "--counter",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.polarity).toBe("counter");
    });

    it("accepts custom severity levels", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Never commit secrets",
        "--severity",
        "must",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.rule.severity).toBe("must");
    });

    it("validates severity values", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Test correction",
        "--severity",
        "invalid",
        "--json",
      ]);

      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Invalid severity");
      expect(result.validValues).toContain("must");
      expect(result.validValues).toContain("should");
      expect(result.validValues).toContain("style");
    });

    it("rejects empty correction", async () => {
      const program = createProgram();
      await program.parseAsync(["node", "lexsona", "rules", "learn", "", "--json"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Empty correction");
      expect(result.message).toContain("cannot be empty");
    });

    it("rejects whitespace-only correction", async () => {
      const program = createProgram();
      await program.parseAsync(["node", "lexsona", "rules", "learn", "   ", "--json"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Empty correction");
    });

    it("handles all scope fields together", async () => {
      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Follow style guide",
        "--domain",
        "test-project",
        "--module",
        "src/utils",
        "--task",
        "refactoring",
        "--severity",
        "style",
        "--category",
        "code_style",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.context.project).toBe("test-project");
      expect(result.context.module_id).toBe("src/utils");
      expect(result.context.task_type).toBe("refactoring");
      expect(result.rule.severity).toBe("style");
      expect(result.rule.category).toBe("code_style");
    });
  });

  describe("learn → list integration", () => {
    it("recorded rule can be retrieved via list", async () => {
      // Learn a rule
      const learnProgram = createProgram();
      await learnProgram.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Always run tests before commit",
        "--domain",
        "integration-test",
        "--severity",
        "must",
      ]);

      expect(errorSpy).not.toHaveBeenCalled();

      // Clear console mocks
      logSpy.mockClear();

      // List rules with domain filter
      const listProgram = createProgram();
      await listProgram.parseAsync([
        "node",
        "lexsona",
        "rules",
        "list",
        "--domain",
        "integration-test",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

      // Should find the rule we just learned
      expect(output).toContain("Always run tests before commit");
      expect(output).toContain("severity: must");
    });

    it("learns multiple rules and lists them", async () => {
      // Learn first rule
      const learn1 = createProgram();
      await learn1.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Use async/await",
        "--domain",
        "multi-test",
      ]);

      // Learn second rule
      const learn2 = createProgram();
      await learn2.parseAsync([
        "node",
        "lexsona",
        "rules",
        "learn",
        "Handle errors properly",
        "--domain",
        "multi-test",
      ]);

      logSpy.mockClear();

      // List all rules for this domain
      const listProgram = createProgram();
      await listProgram.parseAsync(["node", "lexsona", "rules", "list", "--domain", "multi-test"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");

      expect(output).toContain("Use async/await");
      expect(output).toContain("Handle errors properly");
    });
  });

  describe("error handling", () => {
    it("handles database connection failure gracefully in JSON mode", async () => {
      // Mock disconnected instance with minimal required methods
      connectSpy.mockResolvedValue({
        isConnected: () => false,
        // Add stubs for other methods to prevent runtime errors
        learn: vi.fn().mockRejectedValue(new Error("Not connected")),
        getRules: vi.fn().mockResolvedValue([]),
        close: vi.fn(),
      } as unknown as LexSona);

      const program = createProgram();
      await program.parseAsync(["node", "lexsona", "rules", "learn", "Test rule", "--json"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Not connected");
      expect(result.hint).toContain("LEX_DB_PATH");
    });
  });

  describe("forget command", () => {
    it("requires --force flag in JSON mode", async () => {
      // Mock instance with a rule
      connectSpy.mockResolvedValue({
        isConnected: () => true,
        getRuleById: vi.fn(async (id: string) => {
          if (id === "rule-1") {
            return {
              rule_id: "rule-1",
              text: "Test rule to forget",
              category: "general",
              severity: "should",
              scope: {},
              alpha: 2,
              beta: 1,
              observation_count: 5,
              decay_tau: 30,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_observed: new Date().toISOString(),
              confidence: 0.67,
              decay_factor: 1.0,
              effective_confidence: 0.67,
            };
          }
          return null;
        }),
        forgetRule: vi.fn(async () => true),
        close: vi.fn(),
      } as unknown as LexSona);

      const program = createProgram();
      await program.parseAsync(["node", "lexsona", "rules", "forget", "rule-1", "--json"]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Confirmation required");
      expect(result.message).toContain("--force");
    });

    it("deletes rule with --force flag in JSON mode", async () => {
      // Mock instance with a rule
      connectSpy.mockResolvedValue({
        isConnected: () => true,
        getRuleById: vi.fn(async (id: string) => {
          if (id === "rule-1") {
            return {
              rule_id: "rule-1",
              text: "Test rule to forget",
              category: "general",
              severity: "should",
              scope: {},
              alpha: 2,
              beta: 1,
              observation_count: 5,
              decay_tau: 30,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_observed: new Date().toISOString(),
              confidence: 0.67,
              decay_factor: 1.0,
              effective_confidence: 0.67,
            };
          }
          return null;
        }),
        forgetRule: vi.fn(async () => true),
        close: vi.fn(),
      } as unknown as LexSona);

      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "forget",
        "rule-1",
        "--force",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.success).toBe(true);
      expect(result.deletedRule.id).toBe("rule-1");
      expect(result.deletedRule.text).toBe("Test rule to forget");
    });

    it("handles rule not found error", async () => {
      // Mock instance without the rule
      connectSpy.mockResolvedValue({
        isConnected: () => true,
        getRuleById: vi.fn(async () => null),
        forgetRule: vi.fn(async () => false),
        close: vi.fn(),
      } as unknown as LexSona);

      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "forget",
        "nonexistent",
        "--force",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Rule not found");
      expect(result.message).toContain("nonexistent");
      expect(result.hint).toContain("lexsona rules list --all");
    });

    it("handles database connection failure", async () => {
      // Mock disconnected instance
      connectSpy.mockResolvedValue({
        isConnected: () => false,
        close: vi.fn(),
      } as unknown as LexSona);

      const program = createProgram();
      await program.parseAsync([
        "node",
        "lexsona",
        "rules",
        "forget",
        "rule-1",
        "--force",
        "--json",
      ]);

      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      const result = JSON.parse(output);

      expect(result.error).toBe("Not connected");
    });
  });
});

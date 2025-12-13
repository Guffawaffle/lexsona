/**
 * Rules Learn Integration Test
 *
 * End-to-end test verifying:
 * 1. Learning a rule via LexSona.learn()
 * 2. Retrieving the rule via LexSona.getRules()
 * 3. Verifying scope fields are correctly persisted
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LexSona } from "../../src/core/lexsona.js";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { createDatabase } from "@smartergpt/lex/store";

describe("rules learn integration", () => {
  const testDbDir = join("/tmp", "lexsona-test-" + Date.now());
  const testDbPath = join(testDbDir, "lex.db");
  let sona: LexSona;

  beforeEach(async () => {
    // Create test directory
    await mkdir(testDbDir, { recursive: true });

    // Initialize Lex database with schema
    try {
      const db = createDatabase(testDbPath);
      db.close(); // Close the database so LexSona can open it
    } catch (error) {
      console.warn("Failed to create test database:", error);
    }

    // Connect to test database
    sona = await LexSona.connect({ lexDb: testDbPath });
  });

  afterEach(async () => {
    // Cleanup
    if (sona) {
      sona.close();
    }
    if (existsSync(testDbDir)) {
      await rm(testDbDir, { recursive: true, force: true });
    }
  });

  it("persists learned rule and retrieves it", async () => {
    // Skip if not connected (e.g., in CI without proper Lex setup)
    if (!sona.isConnected()) {
      console.warn("Skipping integration test: not connected to Lex database");
      return;
    }

    // Learn a new rule
    await sona.learn({
      correction: "Always use TypeScript strict mode",
      severity: "must",
      category: "code_quality",
      polarity: 1,
      context: {
        project: "lexsona",
        module_id: "core",
        task_type: "implementation",
      },
    });

    // Retrieve rules with low thresholds to include newly created rules
    // (defaults are minN=3, minConfidence=0.5, but new rules have N=1)
    const rules = await sona.getRules({ minConfidence: 0.0 });

    // Verify the rule was persisted
    expect(rules.length).toBeGreaterThan(0);
    
    const learnedRule = rules.find(
      (r) => r.text === "Always use TypeScript strict mode"
    );
    
    expect(learnedRule).toBeDefined();
    expect(learnedRule?.severity).toBe("must");
    expect(learnedRule?.category).toBe("code_quality");
    expect(learnedRule?.scope.project).toBe("lexsona");
    expect(learnedRule?.scope.module_id).toBe("core");
    expect(learnedRule?.scope.task_type).toBe("implementation");
  });

  it("handles counterexample polarity", async () => {
    if (!sona.isConnected()) {
      console.warn("Skipping integration test: not connected to Lex database");
      return;
    }

    // Learn a rule as counterexample
    await sona.learn({
      correction: "Don't skip tests",
      severity: "should",
      category: "testing",
      polarity: -1,
      context: {
        project: "lexsona",
      },
    });

    // Retrieve and verify (with low confidence threshold)
    const rules = await sona.getRules({ minConfidence: 0.0 });
    const rule = rules.find((r) => r.text === "Don't skip tests");
    
    expect(rule).toBeDefined();
    // With polarity -1, beta should be higher than alpha initially
    // (counterexamples add to beta in Bayesian update)
    expect(rule?.beta).toBeGreaterThan(rule?.alpha || 0);
  });

  it("correctly scopes rules by project field", async () => {
    if (!sona.isConnected()) {
      console.warn("Skipping integration test: not connected to Lex database");
      return;
    }

    // Learn rules with different project scopes
    await sona.learn({
      correction: "Use ESLint",
      context: { project: "project-a" },
    });

    await sona.learn({
      correction: "Use Prettier",
      context: { project: "project-b" },
    });

    // Retrieve all rules (with low confidence threshold)
    const allRules = await sona.getRules({ minConfidence: 0.0 });
    expect(allRules.length).toBeGreaterThanOrEqual(2);

    // Filter by project (domain)
    const projectARules = await sona.getRules({ domain: "project-a", minConfidence: 0.0 });
    expect(projectARules.some((r) => r.text === "Use ESLint")).toBe(true);
    expect(projectARules.some((r) => r.text === "Use Prettier")).toBe(false);
  });

  it("supports all scope fields independently", async () => {
    if (!sona.isConnected()) {
      console.warn("Skipping integration test: not connected to Lex database");
      return;
    }

    await sona.learn({
      correction: "Complex scope test",
      context: {
        project: "my-project",
        module_id: "my-module",
        task_type: "refactoring",
        environment: "github-copilot",
        agent_family: "copilot",
      },
    });

    const rules = await sona.getRules({ minConfidence: 0.0 });
    const rule = rules.find((r) => r.text === "Complex scope test");

    expect(rule).toBeDefined();
    expect(rule?.scope.project).toBe("my-project");
    expect(rule?.scope.module_id).toBe("my-module");
    expect(rule?.scope.task_type).toBe("refactoring");
    expect(rule?.scope.environment).toBe("github-copilot");
    expect(rule?.scope.agent_family).toBe("copilot");
  });
});

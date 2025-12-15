/**
 * Scope Combinations Tests
 *
 * Tests various combinations of scope fields to ensure proper filtering and prioritization.
 * Validates all possible combinations of module, domain, taskType, and global scopes.
 */

import { describe, it, expect } from "vitest";
import {
  scopeMatches,
  calculateScopeSpecificity,
  deriveConstraints,
  type DeriveContext,
  type Constraint,
} from "../../../src/constraints/derive.js";
import type { BehaviorRuleWithConfidence, RuleScope } from "../../../src/rules/types.js";
import type { Persona } from "../../../src/persona/types.js";

// Test helpers
function createTestPersona(categories: string[] = ["test"]): Persona {
  return {
    id: "test-persona",
    version: "1.0.0",
    behavior: {
      primaryFocus: "test",
      domain: "test",
      description: "Test persona",
    },
    duties: {
      mustDo: [],
      mustNotDo: [],
    },
    triggers: {
      phrases: [],
      keywords: [],
    },
    ruleCategories: categories,
    requires_memory: false,
    offline_safe: {
      confidence_ceiling: 0.9,
      no_memory_disclaimer: "Test mode",
    },
  };
}

function createTestRule(
  rule_id: string,
  scope: RuleScope,
  category: string = "test",
  severity: "must" | "should" | "style" = "should"
): BehaviorRuleWithConfidence {
  const now = new Date().toISOString();
  return {
    rule_id,
    text: `Rule ${rule_id}`,
    severity,
    category,
    scope,
    alpha: 3,
    beta: 1,
    observation_count: 4,
    decay_tau: 180,
    created_at: now,
    updated_at: now,
    last_observed: now,
    confidence: 0.75,
    decay_factor: 1.0,
    effective_confidence: 0.8,
  };
}

describe("Scope Combinations", () => {
  describe("module + domain combination", () => {
    it("matches when both module and domain match", () => {
      const scope: RuleScope = { module_id: "cli", project: "lexsona" };
      const context: DeriveContext = { module_id: "cli", domain: "lexsona" };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("does not match when module matches but domain does not", () => {
      const scope: RuleScope = { module_id: "cli", project: "lexsona" };
      const context: DeriveContext = { module_id: "cli", domain: "other" };
      
      expect(scopeMatches(scope, context)).toBe(false);
    });

    it("does not match when domain matches but module does not", () => {
      const scope: RuleScope = { module_id: "cli", project: "lexsona" };
      const context: DeriveContext = { module_id: "core", domain: "lexsona" };
      
      expect(scopeMatches(scope, context)).toBe(false);
    });

    it("module+domain has higher priority than either alone", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("combined", { module_id: "cli", project: "lexsona" }),
        createTestRule("module-only", { module_id: "cli" }),
        createTestRule("domain-only", { project: "lexsona" }),
      ];
      const context: DeriveContext = { module_id: "cli", domain: "lexsona" };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints[0].rule_id).toBe("combined");
    });

    it("handles glob patterns in module+domain combination", () => {
      const scope: RuleScope = { module_id: "cli/*", project: "lexsona" };
      const context: DeriveContext = { module_id: "cli/commands", domain: "lexsona" };
      
      expect(scopeMatches(scope, context)).toBe(true);
      
      const spec = calculateScopeSpecificity(scope, context);
      expect(spec).toBeGreaterThan(0);
    });
  });

  describe("module only", () => {
    it("matches context with only module_id specified", () => {
      const scope: RuleScope = { module_id: "cli" };
      const context: DeriveContext = { module_id: "cli" };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("matches even when context has additional fields", () => {
      const scope: RuleScope = { module_id: "cli" };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "review",
      };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("filters correctly in derivation", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("cli-rule", { module_id: "cli" }),
        createTestRule("core-rule", { module_id: "core" }),
        createTestRule("global-rule", {}),
      ];
      const context: DeriveContext = { module_id: "cli" };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("cli-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("global-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).not.toContain("core-rule");
    });
  });

  describe("domain only", () => {
    it("matches context with only domain specified", () => {
      const scope: RuleScope = { project: "lexsona" };
      const context: DeriveContext = { domain: "lexsona" };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("matches even when context has additional fields", () => {
      const scope: RuleScope = { project: "lexsona" };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "review",
      };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("filters correctly in derivation", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("lexsona-rule", { project: "lexsona" }),
        createTestRule("lex-rule", { project: "lex" }),
        createTestRule("global-rule", {}),
      ];
      const context: DeriveContext = { domain: "lexsona" };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("lexsona-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("global-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).not.toContain("lex-rule");
    });
  });

  describe("taskType only", () => {
    it("matches context with taskType using partial match", () => {
      // Note: RuleScope uses 'task_type' while DeriveContext uses 'taskType'
      // This is intentional - RuleScope mirrors Lex API (snake_case), 
      // DeriveContext is LexSona's API (camelCase)
      const scope: RuleScope = { task_type: "review" };
      const context: DeriveContext = { taskType: "code-review" };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("matches case-insensitively", () => {
      const scope: RuleScope = { task_type: "REVIEW" };
      const context: DeriveContext = { taskType: "code-review" };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("filters correctly in derivation", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("review-rule", { task_type: "review" }),
        createTestRule("implementation-rule", { task_type: "implementation" }),
        createTestRule("global-rule", {}),
      ];
      const context: DeriveContext = { taskType: "code-review" };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints).toHaveLength(2);
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("review-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).toContain("global-rule");
      expect(result.constraints.map((c: Constraint) => c.rule_id)).not.toContain(
        "implementation-rule"
      );
    });
  });

  describe("all scopes combined", () => {
    it("matches when all fields match", () => {
      const scope: RuleScope = {
        module_id: "cli",
        project: "lexsona",
        task_type: "review",
        environment: "production",
        agent_family: "github-copilot",
      };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
        environment: "production",
        agent_family: "github-copilot",
      };
      
      expect(scopeMatches(scope, context)).toBe(true);
    });

    it("does not match if any field mismatches", () => {
      const scope: RuleScope = {
        module_id: "cli",
        project: "lexsona",
        task_type: "review",
      };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "implementation", // Mismatch
      };
      
      expect(scopeMatches(scope, context)).toBe(false);
    });

    it("has highest specificity when all fields match", () => {
      const allFields: RuleScope = {
        module_id: "cli",
        project: "lexsona",
        task_type: "review",
      };
      const twoFields: RuleScope = {
        module_id: "cli",
        project: "lexsona",
      };
      const oneField: RuleScope = {
        module_id: "cli",
      };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
      };
      
      const allSpec = calculateScopeSpecificity(allFields, context);
      const twoSpec = calculateScopeSpecificity(twoFields, context);
      const oneSpec = calculateScopeSpecificity(oneField, context);
      
      expect(allSpec).toBeGreaterThan(twoSpec);
      expect(twoSpec).toBeGreaterThan(oneSpec);
    });

    it("prioritizes correctly in derivation", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("all-scopes", {
          module_id: "cli",
          project: "lexsona",
          task_type: "review",
        }),
        createTestRule("two-scopes", { module_id: "cli", project: "lexsona" }),
        createTestRule("one-scope", { module_id: "cli" }),
        createTestRule("global", {}),
      ];
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
      };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints[0].rule_id).toBe("all-scopes");
      expect(result.constraints[1].rule_id).toBe("two-scopes");
      expect(result.constraints[2].rule_id).toBe("one-scope");
      expect(result.constraints[3].rule_id).toBe("global");
    });
  });

  describe("none specified (defaults/wildcards)", () => {
    it("empty scope matches any context", () => {
      const scope: RuleScope = {};
      
      expect(scopeMatches(scope, {})).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli" })).toBe(true);
      expect(scopeMatches(scope, { domain: "lexsona", taskType: "review" })).toBe(true);
    });

    it("empty scope has zero specificity", () => {
      const scope: RuleScope = {};
      const context: DeriveContext = { module_id: "cli", domain: "lexsona" };
      
      const spec = calculateScopeSpecificity(scope, context);
      expect(spec).toBe(0);
    });

    it("global rules are included but prioritized last", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("specific", { module_id: "cli", project: "lexsona" }),
        createTestRule("global-1", {}),
        createTestRule("global-2", {}),
      ];
      const context: DeriveContext = { module_id: "cli", domain: "lexsona" };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      expect(result.constraints).toHaveLength(3);
      expect(result.constraints[0].rule_id).toBe("specific");
      // Global rules come after specific ones
      expect([result.constraints[1].rule_id, result.constraints[2].rule_id]).toContain("global-1");
      expect([result.constraints[1].rule_id, result.constraints[2].rule_id]).toContain("global-2");
    });

    it("empty context matches wildcard scopes", () => {
      const scope: RuleScope = { module_id: "cli" };
      const context: DeriveContext = {}; // No fields specified
      
      // When context is empty, scope fields with values still pass (wildcard logic)
      expect(scopeMatches(scope, context)).toBe(true);
    });
  });

  describe("complex real-world scenarios", () => {
    it("handles mixed exact and glob patterns with multiple scopes", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule("exact-all", {
          module_id: "cli/commands",
          project: "lexsona",
          task_type: "review",
        }),
        createTestRule("glob-all", {
          module_id: "cli/*",
          project: "lexsona",
          task_type: "review",
        }),
        createTestRule("glob-partial", { module_id: "cli/*" }),
      ];
      const context: DeriveContext = {
        module_id: "cli/commands",
        domain: "lexsona",
        taskType: "code-review",
      };
      
      const result = deriveConstraints(persona, rules, [], context);
      
      // Exact match should be first
      expect(result.constraints[0].rule_id).toBe("exact-all");
      // Glob with all fields should be second
      expect(result.constraints[1].rule_id).toBe("glob-all");
      // Glob with partial fields should be third
      expect(result.constraints[2].rule_id).toBe("glob-partial");
    });

    it("handles environment and agent_family in combinations", () => {
      const scope: RuleScope = {
        module_id: "cli",
        environment: "production",
        agent_family: "github-copilot",
      };
      const matchingContext: DeriveContext = {
        module_id: "cli",
        environment: "production",
        agent_family: "github-copilot",
      };
      const mismatchContext: DeriveContext = {
        module_id: "cli",
        environment: "development",
        agent_family: "github-copilot",
      };
      
      expect(scopeMatches(scope, matchingContext)).toBe(true);
      expect(scopeMatches(scope, mismatchContext)).toBe(false);
    });

    it("handles context_tags in combinations", () => {
      const scope: RuleScope = {
        module_id: "cli",
        project: "lexsona",
        context_tags: ["urgent", "security"],
      };
      const matchingContext: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        context_tags: ["urgent", "security", "audit"],
      };
      const mismatchContext: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        context_tags: ["urgent"], // Missing "security"
      };
      
      expect(scopeMatches(scope, matchingContext)).toBe(true);
      expect(scopeMatches(scope, mismatchContext)).toBe(false);
    });
  });
});

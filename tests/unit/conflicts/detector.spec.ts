/**
 * Conflict Detection Tests
 *
 * Tests for the conflict detection engine.
 */

import { describe, it, expect } from "vitest";
import {
  inferPolarity,
  addPolarity,
  scopesOverlap,
  determineSeverity,
  suggestResolution,
  detectConflicts,
  checkConflicts,
} from "../../../src/conflicts/detector.js";
import type { BehaviorRule, RuleScope } from "../../../src/rules/types.js";
import type { RuleWithPolarity } from "../../../src/conflicts/types.js";

/**
 * Helper to create a test rule
 */
function createRule(
  id: string,
  text: string,
  category: string,
  scope: Partial<RuleScope> = {}
): BehaviorRule {
  return {
    rule_id: id,
    text,
    category,
    scope: {
      module_id: scope.module_id,
      project: scope.project,
      task_type: scope.task_type,
      environment: scope.environment,
      agent_family: scope.agent_family,
      context_tags: scope.context_tags,
    },
    severity: "should",
    alpha: 5,
    beta: 1,
    observation_count: 3,
    decay_tau: 30,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    last_observed: "2024-01-01T00:00:00Z",
  };
}

describe("Conflict Detection", () => {
  describe("inferPolarity", () => {
    it("infers positive polarity for prescriptive rules", () => {
      const rule = createRule("r1", "Always include tests", "testing");
      expect(inferPolarity(rule)).toBe(1);
    });

    it("infers negative polarity for exception rules", () => {
      const rule = createRule("r2", "Skip tests for documentation", "testing");
      expect(inferPolarity(rule)).toBe(-1);
    });

    it("infers negative polarity for 'don't' rules", () => {
      const rule = createRule("r3", "Don't write tests for trivial code", "testing");
      expect(inferPolarity(rule)).toBe(-1);
    });

    it("infers negative polarity for 'may skip' rules", () => {
      const rule = createRule("r4", "May skip tests for hotfixes only", "testing");
      expect(inferPolarity(rule)).toBe(-1);
    });

    it("defaults to positive polarity for neutral statements", () => {
      const rule = createRule("r5", "Use clear variable names", "style");
      expect(inferPolarity(rule)).toBe(1);
    });
  });

  describe("addPolarity", () => {
    it("adds polarity to all rules", () => {
      const rules = [
        createRule("r1", "Always run tests", "testing"),
        createRule("r2", "Skip tests for docs", "testing"),
      ];

      const result = addPolarity(rules);

      expect(result).toHaveLength(2);
      expect(result[0].polarity).toBe(1);
      expect(result[1].polarity).toBe(-1);
    });
  });

  describe("scopesOverlap", () => {
    it("returns true for empty scopes (wildcards)", () => {
      const scopeA: RuleScope = {};
      const scopeB: RuleScope = {};

      expect(scopesOverlap(scopeA, scopeB)).toBe(true);
    });

    it("returns true when one scope is wildcard", () => {
      const scopeA: RuleScope = { module_id: "cli" };
      const scopeB: RuleScope = {};

      expect(scopesOverlap(scopeA, scopeB)).toBe(true);
    });

    it("returns true for matching scopes", () => {
      const scopeA: RuleScope = { module_id: "cli", project: "lex" };
      const scopeB: RuleScope = { module_id: "cli", project: "lex" };

      expect(scopesOverlap(scopeA, scopeB)).toBe(true);
    });

    it("returns false for non-matching module_id", () => {
      const scopeA: RuleScope = { module_id: "cli" };
      const scopeB: RuleScope = { module_id: "core" };

      expect(scopesOverlap(scopeA, scopeB)).toBe(false);
    });

    it("returns false for non-matching project", () => {
      const scopeA: RuleScope = { project: "lex" };
      const scopeB: RuleScope = { project: "lexsona" };

      expect(scopesOverlap(scopeA, scopeB)).toBe(false);
    });

    it("returns true for overlapping context_tags", () => {
      const scopeA: RuleScope = { context_tags: ["security", "performance"] };
      const scopeB: RuleScope = { context_tags: ["performance", "style"] };

      expect(scopesOverlap(scopeA, scopeB)).toBe(true);
    });

    it("returns false for non-overlapping context_tags", () => {
      const scopeA: RuleScope = { context_tags: ["security"] };
      const scopeB: RuleScope = { context_tags: ["style"] };

      expect(scopesOverlap(scopeA, scopeB)).toBe(false);
    });
  });

  describe("determineSeverity", () => {
    it("returns high for two must rules", () => {
      const ruleA: RuleWithPolarity = {
        ...createRule("r1", "Always test", "testing"),
        severity: "must",
        polarity: 1,
      };
      const ruleB: RuleWithPolarity = {
        ...createRule("r2", "Skip tests", "testing"),
        severity: "must",
        polarity: -1,
      };

      expect(determineSeverity(ruleA, ruleB)).toBe("high");
    });

    it("returns medium for should rules", () => {
      const ruleA: RuleWithPolarity = {
        ...createRule("r1", "Should test", "testing"),
        severity: "should",
        polarity: 1,
      };
      const ruleB: RuleWithPolarity = {
        ...createRule("r2", "May skip", "testing"),
        severity: "style",
        polarity: -1,
      };

      expect(determineSeverity(ruleA, ruleB)).toBe("medium");
    });

    it("returns low for style rules", () => {
      const ruleA: RuleWithPolarity = {
        ...createRule("r1", "Use verbose names", "style"),
        severity: "style",
        polarity: 1,
      };
      const ruleB: RuleWithPolarity = {
        ...createRule("r2", "Keep concise", "style"),
        severity: "style",
        polarity: -1,
      };

      expect(determineSeverity(ruleA, ruleB)).toBe("low");
    });
  });

  describe("suggestResolution", () => {
    it("suggests scope refinement for wildcards", () => {
      const ruleA: RuleWithPolarity = {
        ...createRule("r1", "Always test", "testing", {}),
        polarity: 1,
      };
      const ruleB: RuleWithPolarity = {
        ...createRule("r2", "Skip tests", "testing", {}),
        polarity: -1,
      };

      const resolution = suggestResolution(ruleA, ruleB);
      expect(resolution.type).toBe("scope");
      expect(resolution.description).toContain("scope");
    });

    it("suggests prioritization for specific scopes", () => {
      const ruleA: RuleWithPolarity = {
        ...createRule("r1", "Always test", "testing", {
          module_id: "cli",
          project: "lex",
          task_type: "feature",
        }),
        polarity: 1,
      };
      const ruleB: RuleWithPolarity = {
        ...createRule("r2", "Skip tests", "testing", {
          module_id: "core",
          project: "lex",
          task_type: "feature",
        }),
        polarity: -1,
      };

      const resolution = suggestResolution(ruleA, ruleB);
      expect(resolution.type).toBe("prioritize");
    });
  });

  describe("detectConflicts", () => {
    it("detects no conflicts when rules are in different categories", () => {
      const rules: RuleWithPolarity[] = [
        { ...createRule("r1", "Always test", "testing"), polarity: 1 },
        { ...createRule("r2", "Use clear names", "style"), polarity: 1 },
      ];

      const conflicts = detectConflicts(rules);
      expect(conflicts).toHaveLength(0);
    });

    it("detects no conflicts when rules have same polarity", () => {
      const rules: RuleWithPolarity[] = [
        { ...createRule("r1", "Always test", "testing"), polarity: 1 },
        { ...createRule("r2", "Include unit tests", "testing"), polarity: 1 },
      ];

      const conflicts = detectConflicts(rules);
      expect(conflicts).toHaveLength(0);
    });

    it("detects conflict for same category, opposite polarity, overlapping scopes", () => {
      const rules: RuleWithPolarity[] = [
        {
          ...createRule("r1", "Always include tests", "testing", { project: "lex" }),
          polarity: 1,
        },
        {
          ...createRule("r2", "Skip tests for hotfixes", "testing", { project: "lex" }),
          polarity: -1,
        },
      ];

      const conflicts = detectConflicts(rules);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].ruleA).toBe("r1");
      expect(conflicts[0].ruleB).toBe("r2");
      expect(conflicts[0].category).toBe("testing");
    });

    it("detects no conflict for disjoint scopes", () => {
      const rules: RuleWithPolarity[] = [
        {
          ...createRule("r1", "Always test", "testing", { module_id: "cli" }),
          polarity: 1,
        },
        {
          ...createRule("r2", "Skip tests", "testing", { module_id: "core" }),
          polarity: -1,
        },
      ];

      const conflicts = detectConflicts(rules);
      expect(conflicts).toHaveLength(0);
    });

    it("detects multiple conflicts", () => {
      const rules: RuleWithPolarity[] = [
        { ...createRule("r1", "Always test", "testing"), polarity: 1 },
        { ...createRule("r2", "Skip tests for docs", "testing"), polarity: -1 },
        { ...createRule("r3", "Use verbose names", "style"), polarity: 1 },
        { ...createRule("r4", "Keep code concise", "style"), polarity: -1 },
      ];

      const conflicts = detectConflicts(rules);
      expect(conflicts).toHaveLength(2);
      expect(conflicts.map((c) => c.category)).toContain("testing");
      expect(conflicts.map((c) => c.category)).toContain("style");
    });
  });

  describe("checkConflicts", () => {
    it("returns complete result with no conflicts", () => {
      const rules = [
        createRule("r1", "Always test", "testing"),
        createRule("r2", "Use clear names", "style"),
      ];

      const result = checkConflicts(rules);

      expect(result.totalRules).toBe(2);
      expect(result.conflictCount).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it("returns complete result with conflicts", () => {
      const rules = [
        createRule("r1", "Always include tests", "testing"),
        createRule("r2", "Skip tests for docs", "testing"),
      ];

      const result = checkConflicts(rules);

      expect(result.totalRules).toBe(2);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].category).toBe("testing");
    });
  });
});

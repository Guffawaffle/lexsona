/**
 * Rule Scoping Tests
 *
 * Tests for the scope matching and filtering logic.
 */

import { describe, it, expect } from "vitest";
import {
  matchScope,
  filterRulesByScope,
  sortBySpecificity,
  scopeRules,
  createScope,
  isScopeEmpty,
  mergeScopes,
} from "../../../src/rules/scoping.js";
import type { RuleScope } from "../../../src/rules/types.js";

describe("Rule Scoping", () => {
  describe("matchScope", () => {
    it("matches when rule scope is empty (all wildcards)", () => {
      const ruleScope: RuleScope = {};
      const context: RuleScope = { module_id: "cli", project: "lex" };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(true);
      expect(result.specificity).toBe(0);
      expect(result.wildcardFields).toContain("module_id");
    });

    it("matches exact module_id", () => {
      const ruleScope: RuleScope = { module_id: "cli" };
      const context: RuleScope = { module_id: "cli" };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(true);
      expect(result.matchedFields).toContain("module_id");
      expect(result.specificity).toBeGreaterThan(0);
    });

    it("does not match mismatched module_id", () => {
      const ruleScope: RuleScope = { module_id: "cli" };
      const context: RuleScope = { module_id: "core" };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(false);
    });

    it("matches multiple fields", () => {
      const ruleScope: RuleScope = { module_id: "cli", project: "lex" };
      const context: RuleScope = { module_id: "cli", project: "lex" };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(true);
      expect(result.matchedFields).toContain("module_id");
      expect(result.matchedFields).toContain("project");
    });

    it("fails if any field mismatches", () => {
      const ruleScope: RuleScope = { module_id: "cli", project: "lex" };
      const context: RuleScope = { module_id: "cli", project: "other" };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(false);
    });

    it("matches context_tags with overlap", () => {
      const ruleScope: RuleScope = { context_tags: ["typescript", "testing"] };
      const context: RuleScope = { context_tags: ["typescript", "nodejs"] };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(true);
    });

    it("fails context_tags with no overlap", () => {
      const ruleScope: RuleScope = { context_tags: ["python"] };
      const context: RuleScope = { context_tags: ["typescript"] };

      const result = matchScope(ruleScope, context);

      expect(result.matches).toBe(false);
    });

    it("calculates higher specificity for more matched fields", () => {
      const general: RuleScope = { project: "lex" };
      const specific: RuleScope = { module_id: "cli", project: "lex" };
      const context: RuleScope = { module_id: "cli", project: "lex" };

      const generalMatch = matchScope(general, context);
      const specificMatch = matchScope(specific, context);

      expect(specificMatch.specificity).toBeGreaterThan(generalMatch.specificity);
    });

    describe("glob pattern matching", () => {
      it("matches module_id with wildcard pattern", () => {
        const ruleScope: RuleScope = { module_id: "cli/*" };
        const context: RuleScope = { module_id: "cli/commands" };

        const result = matchScope(ruleScope, context);

        expect(result.matches).toBe(true);
        expect(result.globFields).toContain("module_id");
      });

      it("does not match when glob pattern doesn't match", () => {
        const ruleScope: RuleScope = { module_id: "cli/*" };
        const context: RuleScope = { module_id: "core/utils" };

        const result = matchScope(ruleScope, context);

        expect(result.matches).toBe(false);
      });

      it("matches with double-star pattern", () => {
        const ruleScope: RuleScope = { module_id: "**/types.ts" };
        const context: RuleScope = { module_id: "src/rules/types.ts" };

        const result = matchScope(ruleScope, context);

        expect(result.matches).toBe(true);
        expect(result.globFields).toContain("module_id");
      });

      it("gives exact match higher specificity than glob match", () => {
        const exactScope: RuleScope = { module_id: "cli/commands" };
        const globScope: RuleScope = { module_id: "cli/*" };
        const context: RuleScope = { module_id: "cli/commands" };

        const exactMatch = matchScope(exactScope, context);
        const globMatch = matchScope(globScope, context);

        expect(exactMatch.specificity).toBeGreaterThan(globMatch.specificity);
        expect(exactMatch.matchedFields).toContain("module_id");
        expect(globMatch.globFields).toContain("module_id");
      });

      it("combines glob match with other field matches", () => {
        const ruleScope: RuleScope = { module_id: "cli/*", project: "lex" };
        const context: RuleScope = { module_id: "cli/commands", project: "lex" };

        const result = matchScope(ruleScope, context);

        expect(result.matches).toBe(true);
        expect(result.globFields).toContain("module_id");
        expect(result.matchedFields).toContain("project");
      });
    });
  });

  describe("filterRulesByScope", () => {
    const rules = [
      { id: "global", scope: {} },
      { id: "cli-specific", scope: { module_id: "cli" } },
      { id: "core-specific", scope: { module_id: "core" } },
    ];

    it("returns rules matching context", () => {
      const context: RuleScope = { module_id: "cli" };
      const filtered = filterRulesByScope(rules, context);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r.id)).toContain("global");
      expect(filtered.map((r) => r.id)).toContain("cli-specific");
    });

    it("excludes non-matching rules", () => {
      const context: RuleScope = { module_id: "cli" };
      const filtered = filterRulesByScope(rules, context);

      expect(filtered.map((r) => r.id)).not.toContain("core-specific");
    });
  });

  describe("sortBySpecificity", () => {
    it("sorts more specific rules first", () => {
      const rules = [
        { id: "general", scope: {} },
        { id: "specific", scope: { module_id: "cli", project: "lex" } },
        { id: "medium", scope: { project: "lex" } },
      ];
      const context: RuleScope = { module_id: "cli", project: "lex" };

      const sorted = sortBySpecificity(rules, context);

      expect(sorted[0].id).toBe("specific");
      expect(sorted[1].id).toBe("medium");
      expect(sorted[2].id).toBe("general");
    });
  });

  describe("scopeRules", () => {
    it("filters and sorts in one operation", () => {
      const rules = [
        { id: "general", scope: {} },
        { id: "cli-specific", scope: { module_id: "cli" } },
        { id: "other", scope: { module_id: "other" } },
      ];
      const context: RuleScope = { module_id: "cli" };

      const result = scopeRules(rules, context);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("cli-specific"); // More specific first
      expect(result[1].id).toBe("general");
    });
  });

  describe("createScope", () => {
    it("creates scope from partial input", () => {
      const scope = createScope({ module_id: "cli" });

      expect(scope.module_id).toBe("cli");
      expect(scope.project).toBeUndefined();
    });

    it("creates empty scope by default", () => {
      const scope = createScope();

      expect(scope.module_id).toBeUndefined();
    });
  });

  describe("isScopeEmpty", () => {
    it("returns true for empty scope", () => {
      expect(isScopeEmpty({})).toBe(true);
      expect(isScopeEmpty({ context_tags: [] })).toBe(true);
    });

    it("returns false for non-empty scope", () => {
      expect(isScopeEmpty({ module_id: "cli" })).toBe(false);
      expect(isScopeEmpty({ context_tags: ["test"] })).toBe(false);
    });
  });

  describe("mergeScopes", () => {
    it("overrides base with values from override", () => {
      const base: RuleScope = { module_id: "cli", project: "lex" };
      const override: RuleScope = { project: "other" };

      const result = mergeScopes(base, override);

      expect(result.module_id).toBe("cli"); // From base
      expect(result.project).toBe("other"); // From override
    });

    it("keeps base values when override is undefined", () => {
      const base: RuleScope = { module_id: "cli", project: "lex" };
      const override: RuleScope = {};

      const result = mergeScopes(base, override);

      expect(result.module_id).toBe("cli");
      expect(result.project).toBe("lex");
    });
  });
});

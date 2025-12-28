/**
 * Constraint Scoping Tests
 *
 * Comprehensive tests for rule scoping with glob patterns and priority ordering.
 * Tests the scoping logic in derive.ts: scopeMatches() and calculateScopeSpecificity()
 */

import { describe, it, expect } from "vitest";
import {
  scopeMatches,
  calculateScopeSpecificity,
  type DeriveContext,
} from "../../../src/constraints/derive.js";
import type { RuleScope } from "../../../src/rules/types.js";

describe("Constraint Scoping", () => {
  describe("scopeMatches - glob pattern support", () => {
    it("matches module_id with single wildcard pattern", () => {
      const scope: RuleScope = { module_id: "cli/*" };

      expect(scopeMatches(scope, { module_id: "cli/commands" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli/utils" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli/index" })).toBe(true);
    });

    it("does not match when glob pattern fails", () => {
      const scope: RuleScope = { module_id: "cli/*" };

      expect(scopeMatches(scope, { module_id: "core/utils" })).toBe(false);
      expect(scopeMatches(scope, { module_id: "cli" })).toBe(false); // No trailing segment
    });

    it("matches module_id with double-star pattern", () => {
      const scope: RuleScope = { module_id: "**/types.ts" };

      expect(scopeMatches(scope, { module_id: "types.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/types.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/rules/types.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "deep/nested/path/types.ts" })).toBe(true);
    });

    it("does not match when double-star pattern fails", () => {
      const scope: RuleScope = { module_id: "**/types.ts" };

      expect(scopeMatches(scope, { module_id: "src/utils.ts" })).toBe(false);
      expect(scopeMatches(scope, { module_id: "types.js" })).toBe(false);
    });

    it("matches complex glob patterns", () => {
      const scope: RuleScope = { module_id: "src/**/*.ts" };

      expect(scopeMatches(scope, { module_id: "src/index.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/cli/commands.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/deep/nested/file.ts" })).toBe(true);
    });

    it("does not match complex glob when pattern fails", () => {
      const scope: RuleScope = { module_id: "src/**/*.ts" };

      expect(scopeMatches(scope, { module_id: "tests/unit.ts" })).toBe(false);
      expect(scopeMatches(scope, { module_id: "src/file.js" })).toBe(false);
    });

    it("handles special characters in glob patterns", () => {
      const scope: RuleScope = { module_id: "src/**/*.{ts,tsx}" };

      expect(scopeMatches(scope, { module_id: "src/App.tsx" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/utils.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/component.jsx" })).toBe(false);
    });

    it("exact match still works with glob support", () => {
      const scope: RuleScope = { module_id: "core/utils" };

      expect(scopeMatches(scope, { module_id: "core/utils" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "core/other" })).toBe(false);
    });
  });

  describe("scopeMatches - exact match vs glob match", () => {
    it("exact match is preferred over glob in specificity", () => {
      const exactScope: RuleScope = { module_id: "cli/commands" };
      const globScope: RuleScope = { module_id: "cli/*" };
      const context: DeriveContext = { module_id: "cli/commands" };

      const exactSpecificity = calculateScopeSpecificity(exactScope, context);
      const globSpecificity = calculateScopeSpecificity(globScope, context);

      expect(exactSpecificity).toBeGreaterThan(globSpecificity);
    });

    it("both exact and glob match return true for matching", () => {
      const exactScope: RuleScope = { module_id: "cli/commands" };
      const globScope: RuleScope = { module_id: "cli/*" };
      const context: DeriveContext = { module_id: "cli/commands" };

      expect(scopeMatches(exactScope, context)).toBe(true);
      expect(scopeMatches(globScope, context)).toBe(true);
    });
  });

  describe("scopeMatches - priority ordering: module > domain > taskType > global", () => {
    it("module has highest specificity", () => {
      const moduleScope: RuleScope = { module_id: "cli" };
      const domainScope: RuleScope = { project: "lexsona" };
      const taskScope: RuleScope = { task_type: "review" };
      const globalScope: RuleScope = {};

      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
      };

      const moduleSpec = calculateScopeSpecificity(moduleScope, context);
      const domainSpec = calculateScopeSpecificity(domainScope, context);
      const taskSpec = calculateScopeSpecificity(taskScope, context);
      const globalSpec = calculateScopeSpecificity(globalScope, context);

      expect(moduleSpec).toBeGreaterThan(domainSpec);
      expect(domainSpec).toBeGreaterThan(taskSpec);
      expect(taskSpec).toBeGreaterThan(globalSpec);
      expect(globalSpec).toBe(0);
    });

    it("module + domain has higher specificity than domain alone", () => {
      const combined: RuleScope = { module_id: "cli", project: "lexsona" };
      const domainOnly: RuleScope = { project: "lexsona" };

      const context: DeriveContext = { module_id: "cli", domain: "lexsona" };

      const combinedSpec = calculateScopeSpecificity(combined, context);
      const domainSpec = calculateScopeSpecificity(domainOnly, context);

      expect(combinedSpec).toBeGreaterThan(domainSpec);
    });

    it("domain + taskType has higher specificity than taskType alone", () => {
      const combined: RuleScope = { project: "lexsona", task_type: "review" };
      const taskOnly: RuleScope = { task_type: "review" };

      const context: DeriveContext = { domain: "lexsona", taskType: "code-review" };

      const combinedSpec = calculateScopeSpecificity(combined, context);
      const taskSpec = calculateScopeSpecificity(taskOnly, context);

      expect(combinedSpec).toBeGreaterThan(taskSpec);
    });
  });

  describe("scopeMatches - determinism", () => {
    it("returns same result for same inputs", () => {
      const scope: RuleScope = { module_id: "cli/*", project: "lexsona" };
      const context: DeriveContext = { module_id: "cli/commands", domain: "lexsona" };

      const result1 = scopeMatches(scope, context);
      const result2 = scopeMatches(scope, context);
      const result3 = scopeMatches(scope, context);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it("calculateScopeSpecificity returns same value for same inputs", () => {
      const scope: RuleScope = { module_id: "cli", project: "lexsona", task_type: "review" };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
      };

      const spec1 = calculateScopeSpecificity(scope, context);
      const spec2 = calculateScopeSpecificity(scope, context);
      const spec3 = calculateScopeSpecificity(scope, context);

      expect(spec1).toBe(spec2);
      expect(spec2).toBe(spec3);
    });
  });

  describe("scopeMatches - edge cases", () => {
    it("handles empty scope (matches anything)", () => {
      const scope: RuleScope = {};

      expect(scopeMatches(scope, {})).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli" })).toBe(true);
      expect(scopeMatches(scope, { domain: "lexsona", module_id: "cli" })).toBe(true);
    });

    it("handles empty context (matches wildcard scopes)", () => {
      const scope: RuleScope = { module_id: "cli" };

      // Empty context means no module_id specified, so wildcard match
      expect(scopeMatches(scope, {})).toBe(true);
    });

    it("handles null/undefined in scope", () => {
      const scope: RuleScope = {
        module_id: undefined,
        project: undefined,
        task_type: undefined,
      };

      expect(scopeMatches(scope, { module_id: "cli" })).toBe(true);
      expect(scopeMatches(scope, { domain: "lexsona" })).toBe(true);
    });

    it("handles special characters in module_id", () => {
      const scope: RuleScope = { module_id: "src/@types/*.ts" };

      expect(scopeMatches(scope, { module_id: "src/@types/index.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/types/index.ts" })).toBe(false);
    });

    it("handles empty string patterns", () => {
      const scope: RuleScope = { module_id: "" };

      // Empty string is treated as a glob pattern by micromatch
      // In micromatch, an empty pattern matches everything (this is documented micromatch behavior)
      // This is the expected and correct behavior for the scoping system
      expect(scopeMatches(scope, { module_id: "" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli" })).toBe(true);
    });

    it("handles context_tags matching", () => {
      const scope: RuleScope = { context_tags: ["urgent", "security"] };

      expect(scopeMatches(scope, { context_tags: ["urgent", "security", "audit"] })).toBe(true);
      expect(scopeMatches(scope, { context_tags: ["urgent"] })).toBe(false);
      expect(scopeMatches(scope, { context_tags: [] })).toBe(false);
    });
  });

  describe("calculateScopeSpecificity - weighted scoring", () => {
    it("module_id has weight of 10 (exact) or 8 (glob)", () => {
      const exactScope: RuleScope = { module_id: "cli" };
      const globScope: RuleScope = { module_id: "cli/*" };
      const context: DeriveContext = { module_id: "cli/commands" };

      const exactSpec = calculateScopeSpecificity(exactScope, context);
      const globSpec = calculateScopeSpecificity(globScope, context);

      // "cli" doesn't match "cli/commands" exactly (different paths), so score is 0
      // "cli/*" matches "cli/commands" via glob, so score is 8
      // This test validates that glob matches score 8 when they do match
      expect(exactSpec).toBe(0); // No match, different paths
      expect(globSpec).toBe(8); // Glob match scores 8
    });

    it("project/domain has weight of 8", () => {
      const scope: RuleScope = { project: "lexsona" };
      const context: DeriveContext = { domain: "lexsona" };

      const spec = calculateScopeSpecificity(scope, context);
      expect(spec).toBe(8);
    });

    it("task_type has weight of 4", () => {
      const scope: RuleScope = { task_type: "review" };
      const context: DeriveContext = { taskType: "code-review" };

      const spec = calculateScopeSpecificity(scope, context);
      expect(spec).toBe(4);
    });

    it("combines weights additively", () => {
      const scope: RuleScope = {
        module_id: "cli",
        project: "lexsona",
        task_type: "review",
      };
      const context: DeriveContext = {
        module_id: "cli",
        domain: "lexsona",
        taskType: "code-review",
      };

      const spec = calculateScopeSpecificity(scope, context);
      // 10 (module exact) + 8 (project) + 4 (task) = 22
      expect(spec).toBe(22);
    });
  });
});

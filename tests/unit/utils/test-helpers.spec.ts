/**
 * Test Helpers Tests
 *
 * Tests for the test utility functions.
 */

import { describe, it, expect } from "vitest";
import {
  createTestRule,
  createTestScope,
  createTestPersona,
  createTestContext,
  createTestConstraint,
  createTestConstraintSet,
} from "../../utils/test-helpers.js";

describe("Test Helpers", () => {
  describe("createTestRule", () => {
    it("creates a rule with defaults", () => {
      const rule = createTestRule();

      expect(rule.rule_id).toMatch(/^test-rule-\d+$/);
      expect(rule.category).toBe("test_category");
      expect(rule.text).toBe("Test rule for unit testing");
      expect(rule.severity).toBe("should");
      expect(rule.alpha).toBe(2);
      expect(rule.beta).toBe(1);
    });

    it("applies overrides", () => {
      const rule = createTestRule({
        rule_id: "custom-id",
        severity: "must",
        text: "Custom rule text",
      });

      expect(rule.rule_id).toBe("custom-id");
      expect(rule.severity).toBe("must");
      expect(rule.text).toBe("Custom rule text");
    });

    it("includes timestamps", () => {
      const rule = createTestRule();

      expect(rule.created_at).toBeDefined();
      expect(rule.updated_at).toBeDefined();
      expect(rule.last_observed).toBeDefined();
    });
  });

  describe("createTestScope", () => {
    it("creates empty scope by default", () => {
      const scope = createTestScope();

      expect(scope.module_id).toBeUndefined();
      expect(scope.project).toBeUndefined();
    });

    it("applies overrides", () => {
      const scope = createTestScope({
        module_id: "cli",
        project: "lex",
      });

      expect(scope.module_id).toBe("cli");
      expect(scope.project).toBe("lex");
    });
  });

  describe("createTestPersona", () => {
    it("creates persona with defaults", () => {
      const persona = createTestPersona();

      expect(persona.id).toBe("quality-first_testing");
      expect(persona.version).toBe("1.0.0");
      expect(persona.behavior.primaryFocus).toBe("quality-first");
      expect(persona.duties.mustDo).toContain("Run tests");
    });

    it("uses behavioral classification ID format", () => {
      const persona = createTestPersona();

      // ID should be in format: focus_domain
      expect(persona.id).toMatch(/^[a-z-]+_[a-z]+$/);
    });

    it("includes rule categories", () => {
      const persona = createTestPersona();

      expect(persona.ruleCategories).toContain("test_category");
    });
  });

  describe("createTestContext", () => {
    it("creates empty context by default", () => {
      const context = createTestContext();

      expect(context.domain).toBeUndefined();
      expect(context.module_id).toBeUndefined();
    });

    it("applies context overrides", () => {
      const context = createTestContext({
        domain: "lex-pr-runner",
        taskType: "implementation",
      });

      expect(context.domain).toBe("lex-pr-runner");
      expect(context.taskType).toBe("implementation");
    });
  });

  describe("createTestConstraint", () => {
    it("creates constraint with defaults", () => {
      const constraint = createTestConstraint();

      expect(constraint.text).toBe("Test constraint");
      expect(constraint.severity).toBe("should");
      expect(constraint.confidence).toBe(0.8);
    });

    it("applies overrides", () => {
      const constraint = createTestConstraint({
        text: "Never use sed",
        severity: "must",
        confidence: 0.95,
      });

      expect(constraint.text).toBe("Never use sed");
      expect(constraint.severity).toBe("must");
      expect(constraint.confidence).toBe(0.95);
    });
  });

  describe("createTestConstraintSet", () => {
    it("creates constraint set with defaults", () => {
      const set = createTestConstraintSet();

      expect(set.personaId).toBe("quality-first_testing");
      expect(set.constraints).toEqual([]);
      expect(set.principles).toEqual([]);
      expect(set.metadata.confidenceThreshold).toBe(0.3);
    });

    it("includes derivation timestamp", () => {
      const set = createTestConstraintSet();

      expect(set.derivedAt).toBeDefined();
      expect(() => new Date(set.derivedAt)).not.toThrow();
    });
  });
});

/**
 * Tests for agent-integration constraint pack
 *
 * Verifies that persona constraint packs are correctly parsed and derived.
 */

import { describe, it, expect } from "vitest";
import { deriveConstraints } from "../../../src/constraints/derive.js";
import type { Persona } from "../../../src/persona/types.js";
import type { BehaviorRuleWithConfidence } from "../../../src/rules/types.js";

describe("Agent Integration Constraint Pack", () => {
  const testPersona: Persona = {
    id: "quality-first_engineering",
    version: "1.0.0",
    behavior: {
      primaryFocus: "quality-first",
      domain: "engineering",
      description: "Test persona",
    },
    duties: {
      mustDo: [],
      mustNotDo: [],
    },
    triggers: {
      phrases: ["test"],
    },
    ruleCategories: ["testing"],
    requires_memory: false,
    offline_safe: {
      confidence_ceiling: 0.7,
      no_memory_disclaimer: "Test disclaimer",
    },
    constraints: {
      "agent-integration": [
        {
          id: "interface-completeness",
          statement:
            "When adding properties to an interface, check all implementing types and test fixtures",
          severity: "error",
          appliesTo: ["**/*.ts"],
        },
        {
          id: "fixture-schema-sync",
          statement: "Test fixtures must include all required and commonly-used optional fields",
          severity: "warning",
          appliesTo: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
        },
        {
          id: "export-new-types",
          statement: "New public types must be exported from the nearest index.ts",
          severity: "error",
          appliesTo: ["src/**/*.ts"],
        },
        {
          id: "mock-data-realism",
          statement: "Mock data should use realistic values that match production patterns",
          severity: "warning",
          appliesTo: ["tests/**/*"],
        },
      ],
    },
  };

  const emptyRules: BehaviorRuleWithConfidence[] = [];
  const emptyPrinciples: { id: string; description: string }[] = [];

  describe("Constraint pack parsing", () => {
    it("includes all constraint pack constraints when no files are specified", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {});

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      expect(packConstraints.length).toBe(4);
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:interface-completeness"
      );
    });

    it("filters constraints by file scope when files are provided", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["tests/unit/example.spec.ts"],
      });

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      // Should include:
      // - interface-completeness (**/*.ts matches .spec.ts)
      // - fixture-schema-sync (tests/**/*.spec.ts)
      // - mock-data-realism (tests/**/* matches all test files)
      expect(packConstraints.length).toBe(3);
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:fixture-schema-sync"
      );
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:mock-data-realism"
      );
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:interface-completeness"
      );
    });

    it("includes src constraints when src files are in scope", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["src/core/types.ts"],
      });

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      // Should include interface-completeness (**/*.ts) and export-new-types (src/**/*.ts)
      expect(packConstraints.length).toBe(2);
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:interface-completeness"
      );
      expect(packConstraints.map((c) => c.rule_id)).toContain(
        "persona:quality-first_engineering:pack:agent-integration:export-new-types"
      );
    });

    it("maps error severity to must", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["src/core/types.ts"],
      });

      const interfaceConstraint = result.constraints.find(
        (c) =>
          c.rule_id ===
          "persona:quality-first_engineering:pack:agent-integration:interface-completeness"
      );

      expect(interfaceConstraint?.severity).toBe("must");
    });

    it("maps warning severity to should", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["tests/unit/example.spec.ts"],
      });

      const fixtureConstraint = result.constraints.find(
        (c) =>
          c.rule_id ===
          "persona:quality-first_engineering:pack:agent-integration:fixture-schema-sync"
      );

      expect(fixtureConstraint?.severity).toBe("should");
    });

    it("sets confidence to 1.0 for all pack constraints", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {});

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      expect(packConstraints.every((c) => c.confidence === 1.0)).toBe(true);
    });

    it("sets source to persona for all pack constraints", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {});

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      expect(packConstraints.every((c) => c.source === "persona")).toBe(true);
    });

    it("uses constraint statement as text", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["src/core/types.ts"],
      });

      const interfaceConstraint = result.constraints.find(
        (c) =>
          c.rule_id ===
          "persona:quality-first_engineering:pack:agent-integration:interface-completeness"
      );

      expect(interfaceConstraint?.text).toBe(
        "When adding properties to an interface, check all implementing types and test fixtures"
      );
    });
  });

  describe("Multiple file patterns", () => {
    it("matches multiple files correctly", () => {
      const result = deriveConstraints(testPersona, emptyRules, emptyPrinciples, {
        files: ["src/core/types.ts", "tests/unit/example.spec.ts", "README.md"],
      });

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      // Should include all constraints:
      // - interface-completeness (**/*.ts matches both .ts files)
      // - export-new-types (src/**/*.ts matches src/core/types.ts)
      // - fixture-schema-sync (tests/**/*.spec.ts matches tests/unit/example.spec.ts)
      // - mock-data-realism (tests/**/* matches tests/unit/example.spec.ts)
      expect(packConstraints.length).toBe(4);
    });
  });

  describe("Empty constraint packs", () => {
    it("handles personas without constraint packs", () => {
      const personaWithoutPacks: Persona = {
        ...testPersona,
        constraints: undefined,
      };

      const result = deriveConstraints(personaWithoutPacks, emptyRules, emptyPrinciples, {});

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      expect(packConstraints.length).toBe(0);
    });

    it("handles empty constraint packs", () => {
      const personaWithEmptyPacks: Persona = {
        ...testPersona,
        constraints: {},
      };

      const result = deriveConstraints(personaWithEmptyPacks, emptyRules, emptyPrinciples, {});

      const packConstraints = result.constraints.filter((c) =>
        c.category.startsWith("constraint-pack:")
      );

      expect(packConstraints.length).toBe(0);
    });
  });
});

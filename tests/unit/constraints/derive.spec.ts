/**
 * Tests for constraint derivation engine
 */
import { describe, it, expect } from "vitest";
import {
  deriveConstraints,
  scopeMatches,
  type DeriveContext,
  type Constraint,
  type Principle,
} from "../../../src/constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../../../src/rules/types.js";
import type { Persona } from "../../../src/persona/types.js";

// Test fixtures
function createTestPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "quality-first_engineering",
    name: "Quality First Engineering",
    description: "Prioritizes correctness and testing",
    version: "1.0.0",
    ruleCategories: ["testing", "code-quality", "documentation"],
    triggers: [],
    ...overrides,
  };
}

function createTestRule(
  overrides: Partial<BehaviorRuleWithConfidence> = {}
): BehaviorRuleWithConfidence {
  return {
    rule_id: "test-rule-1",
    text: "Always write tests before implementation",
    severity: "should",
    category: "testing",
    source: "learned",
    scope: {},
    effective_confidence: 0.8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const testPrinciples: Principle[] = [
  { id: "p1", description: "Return constraints, never execute" },
  { id: "p2", description: "Deterministic outputs" },
];

describe("scopeMatches", () => {
  it("matches empty scope with any context", () => {
    const scope = {};
    const context: DeriveContext = { domain: "test", module_id: "core" };
    expect(scopeMatches(scope, context)).toBe(true);
  });

  it("matches module_id exactly", () => {
    const scope = { module_id: "core" };
    expect(scopeMatches(scope, { module_id: "core" })).toBe(true);
    expect(scopeMatches(scope, { module_id: "cli" })).toBe(false);
  });

  it("matches empty context against any scope", () => {
    // When context doesn't specify a field, scope check passes
    const scope = { module_id: "core" };
    expect(scopeMatches(scope, {})).toBe(true);
  });

  it("matches task type with partial match", () => {
    const scope = { task_type: "review" };
    expect(scopeMatches(scope, { taskType: "code-review" })).toBe(true);
    expect(scopeMatches(scope, { taskType: "implementation" })).toBe(false);
  });

  it("matches environment exactly", () => {
    const scope = { environment: "production" };
    expect(scopeMatches(scope, { environment: "production" })).toBe(true);
    expect(scopeMatches(scope, { environment: "development" })).toBe(false);
  });

  it("matches agent_family exactly", () => {
    const scope = { agent_family: "github-copilot" };
    expect(scopeMatches(scope, { agent_family: "github-copilot" })).toBe(true);
    expect(scopeMatches(scope, { agent_family: "claude" })).toBe(false);
  });

  it("matches all context_tags", () => {
    const scope = { context_tags: ["urgent", "security"] };
    expect(scopeMatches(scope, { context_tags: ["urgent", "security", "audit"] })).toBe(true);
    expect(scopeMatches(scope, { context_tags: ["urgent"] })).toBe(false);
  });
});

describe("deriveConstraints", () => {
  describe("basic derivation", () => {
    it("returns a constraint set with correct structure", () => {
      const persona = createTestPersona();
      const rules = [createTestRule()];
      const context: DeriveContext = { domain: "test" };

      const result = deriveConstraints(persona, rules, testPrinciples, context);

      expect(result.personaId).toBe("quality-first_engineering");
      expect(result.derivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.context).toEqual(context);
      expect(result.principles).toEqual(testPrinciples);
      expect(result.constraints).toHaveLength(1);
      expect(result.metadata.rulesConsidered).toBe(1);
    });

    it("filters rules by persona categories", () => {
      const persona = createTestPersona({ ruleCategories: ["testing"] });
      const rules = [
        createTestRule({ rule_id: "r1", category: "testing" }),
        createTestRule({ rule_id: "r2", category: "security" }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0].rule_id).toBe("r1");
      expect(result.metadata.rulesFiltered).toBe(1);
    });

    it("filters rules by confidence threshold", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({ rule_id: "r1", effective_confidence: 0.8 }),
        createTestRule({ rule_id: "r2", effective_confidence: 0.2 }),
      ];

      const result = deriveConstraints(
        persona,
        rules,
        [],
        {},
        {
          confidenceThreshold: 0.5,
        }
      );

      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0].rule_id).toBe("r1");
    });

    it("respects includeStyle config", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({ rule_id: "r1", severity: "must" }),
        createTestRule({ rule_id: "r2", severity: "style" }),
      ];

      const withStyle = deriveConstraints(
        persona,
        rules,
        [],
        {},
        {
          includeStyle: true,
        }
      );
      const withoutStyle = deriveConstraints(
        persona,
        rules,
        [],
        {},
        {
          includeStyle: false,
        }
      );

      expect(withStyle.constraints).toHaveLength(2);
      expect(withoutStyle.constraints).toHaveLength(1);
      expect(withoutStyle.constraints[0].severity).toBe("must");
    });
  });

  describe("scope filtering", () => {
    it("filters rules by module_id scope", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({ rule_id: "r1", scope: { module_id: "core" } }),
        createTestRule({ rule_id: "r2", scope: { module_id: "cli" } }),
      ];
      const context: DeriveContext = { module_id: "core" };

      const result = deriveConstraints(persona, rules, [], context);

      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0].rule_id).toBe("r1");
    });

    it("includes rules with no scope restrictions", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({ rule_id: "r1", scope: {} }),
        createTestRule({ rule_id: "r2", scope: { module_id: "cli" } }),
      ];
      const context: DeriveContext = { module_id: "core" };

      const result = deriveConstraints(persona, rules, [], context);

      expect(result.constraints).toHaveLength(1);
      expect(result.constraints[0].rule_id).toBe("r1");
    });
  });

  describe("sorting", () => {
    it("sorts by severity (must > should > style)", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({
          rule_id: "r1",
          severity: "style",
          effective_confidence: 0.9,
        }),
        createTestRule({
          rule_id: "r2",
          severity: "must",
          effective_confidence: 0.5,
        }),
        createTestRule({
          rule_id: "r3",
          severity: "should",
          effective_confidence: 0.7,
        }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints.map((c: Constraint) => c.rule_id)).toEqual(["r2", "r3", "r1"]);
    });

    it("sorts by confidence within same severity", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({
          rule_id: "r1",
          severity: "should",
          effective_confidence: 0.5,
        }),
        createTestRule({
          rule_id: "r2",
          severity: "should",
          effective_confidence: 0.9,
        }),
        createTestRule({
          rule_id: "r3",
          severity: "should",
          effective_confidence: 0.7,
        }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints.map((c: Constraint) => c.rule_id)).toEqual(["r2", "r3", "r1"]);
    });
  });

  describe("limiting", () => {
    it("limits to maxConstraints", () => {
      const persona = createTestPersona();
      const rules = Array.from({ length: 100 }, (_, i) => createTestRule({ rule_id: `r${i}` }));

      const result = deriveConstraints(
        persona,
        rules,
        [],
        {},
        {
          maxConstraints: 10,
        }
      );

      expect(result.constraints).toHaveLength(10);
    });
  });

  describe("constraint structure", () => {
    it("creates constraints with correct fields", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({
          rule_id: "test-id",
          text: "Test rule text",
          severity: "must",
          effective_confidence: 0.95,
          category: "testing",
        }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints[0]).toEqual({
        rule_id: "test-id",
        text: "Test rule text",
        severity: "must",
        confidence: 0.95,
        category: "testing",
      });
    });
  });

  describe("determinism", () => {
    it("produces same output for same inputs", () => {
      const persona = createTestPersona();
      const rules = [createTestRule({ rule_id: "r1" }), createTestRule({ rule_id: "r2" })];
      const context: DeriveContext = { domain: "test" };

      const result1 = deriveConstraints(persona, rules, testPrinciples, context);
      const result2 = deriveConstraints(persona, rules, testPrinciples, context);

      // Everything except derivedAt should be equal
      expect(result1.personaId).toBe(result2.personaId);
      expect(result1.context).toEqual(result2.context);
      expect(result1.principles).toEqual(result2.principles);
      expect(result1.constraints).toEqual(result2.constraints);
      expect(result1.metadata).toEqual(result2.metadata);
    });
  });

  describe("edge cases", () => {
    it("handles empty rules array", () => {
      const persona = createTestPersona();
      const result = deriveConstraints(persona, [], [], {});

      expect(result.constraints).toHaveLength(0);
      expect(result.metadata.rulesConsidered).toBe(0);
    });

    it("handles empty principles array", () => {
      const persona = createTestPersona();
      const rules = [createTestRule()];
      const result = deriveConstraints(persona, rules, [], {});

      expect(result.principles).toHaveLength(0);
      expect(result.constraints).toHaveLength(1);
    });

    it("handles persona with no matching categories", () => {
      const persona = createTestPersona({ ruleCategories: [] });
      const rules = [createTestRule()];
      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints).toHaveLength(0);
      expect(result.metadata.rulesFiltered).toBe(1);
    });
  });
});

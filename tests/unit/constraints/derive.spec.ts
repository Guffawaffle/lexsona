/**
 * Tests for constraint derivation engine
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import {
  deriveConstraints,
  scopeMatches,
  PersonaRequiresMemoryError,
  type DeriveContext,
  type Constraint,
  type Principle,
} from "../../../src/constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../../../src/rules/types.js";
import type { Persona, OfflineSafeConfig } from "../../../src/persona/types.js";
import { PersonaManifestSchema } from "../../../src/persona/types.js";

// Test fixtures
function createTestPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "quality-first_engineering",
    version: "1.0.0",
    behavior: {
      primaryFocus: "quality-first",
      domain: "engineering",
      description: "Prioritizes correctness and testing",
    },
    duties: {
      mustDo: ["Write tests"],
      mustNotDo: ["Skip validation"],
    },
    triggers: {
      phrases: ["senior dev mode"],
      keywords: ["implementation"],
    },
    ruleCategories: ["testing", "code-quality", "documentation"],
    requires_memory: false,
    offline_safe: {
      confidence_ceiling: 0.7,
      no_memory_disclaimer: "Operating without Lex memory connection.",
    },
    ...overrides,
  };
}

function createTestRule(
  overrides: Partial<BehaviorRuleWithConfidence> = {}
): BehaviorRuleWithConfidence {
  const now = new Date().toISOString();
  return {
    rule_id: "test-rule-1",
    text: "Always write tests before implementation",
    severity: "should",
    category: "testing",
    scope: {},
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
    ...overrides,
  };
}

const testPrinciples: Principle[] = [
  { id: "p1", description: "Return constraints, never execute" },
  { id: "p2", description: "Deterministic outputs" },
];

/**
 * Helper to convert fixture rules to BehaviorRuleWithConfidence for testing
 */
function convertFixtureRulesToTestRules(fixtureRules: unknown[]): BehaviorRuleWithConfidence[] {
  const now = new Date().toISOString();
  return fixtureRules.map((rule: any) => ({
    ...rule,
    rule_id: rule.id,
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
  }));
}

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

  describe("glob pattern matching", () => {
    it("matches module_id with wildcard pattern", () => {
      const scope = { module_id: "cli/*" };
      expect(scopeMatches(scope, { module_id: "cli/commands" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli/utils" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "core/utils" })).toBe(false);
    });

    it("matches module_id with double-star pattern", () => {
      const scope = { module_id: "**/types.ts" };
      expect(scopeMatches(scope, { module_id: "src/types.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/rules/types.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/utils.ts" })).toBe(false);
    });

    it("matches module_id with complex glob", () => {
      const scope = { module_id: "src/**/*.ts" };
      expect(scopeMatches(scope, { module_id: "src/index.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "src/cli/commands.ts" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "tests/unit.ts" })).toBe(false);
    });

    it("still supports exact module_id match", () => {
      const scope = { module_id: "core" };
      expect(scopeMatches(scope, { module_id: "core" })).toBe(true);
      expect(scopeMatches(scope, { module_id: "cli" })).toBe(false);
    });
  });

  describe("domain/project scoping", () => {
    it("matches context.domain against scope.project", () => {
      const scope = { project: "lex" };
      expect(scopeMatches(scope, { domain: "lex" })).toBe(true);
      expect(scopeMatches(scope, { domain: "lexsona" })).toBe(false);
    });

    it("fails when project is specified but context has no domain", () => {
      const scope = { project: "lex" };
      expect(scopeMatches(scope, {})).toBe(true); // No domain in context = wildcard match
    });

    it("passes when project is not specified", () => {
      const scope = { module_id: "cli" };
      expect(scopeMatches(scope, { domain: "lex", module_id: "cli" })).toBe(true);
    });

    it("combines project and module_id filtering", () => {
      const scope = { project: "lex", module_id: "cli/*" };
      expect(scopeMatches(scope, { domain: "lex", module_id: "cli/commands" })).toBe(true);
      expect(scopeMatches(scope, { domain: "lexsona", module_id: "cli/commands" })).toBe(false);
      expect(scopeMatches(scope, { domain: "lex", module_id: "core/utils" })).toBe(false);
    });
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

    describe("scope specificity priority", () => {
      it("prioritizes module-scoped rules over global rules", () => {
        const persona = createTestPersona();
        const rules = [
          createTestRule({
            rule_id: "global",
            scope: {},
            severity: "should",
            effective_confidence: 0.9,
          }),
          createTestRule({
            rule_id: "module-specific",
            scope: { module_id: "cli" },
            severity: "should",
            effective_confidence: 0.8,
          }),
        ];
        const context: DeriveContext = { module_id: "cli" };

        const result = deriveConstraints(persona, rules, [], context);

        // Module-specific should come first despite lower confidence
        expect(result.constraints[0].rule_id).toBe("module-specific");
        expect(result.constraints[1].rule_id).toBe("global");
      });

      it("prioritizes domain/project-scoped rules over task-scoped rules", () => {
        const persona = createTestPersona();
        const rules = [
          createTestRule({
            rule_id: "task-scoped",
            scope: { task_type: "review" },
            severity: "should",
            effective_confidence: 0.9,
          }),
          createTestRule({
            rule_id: "domain-scoped",
            scope: { project: "lex" },
            severity: "should",
            effective_confidence: 0.8,
          }),
        ];
        const context: DeriveContext = { domain: "lex", taskType: "code-review" };

        const result = deriveConstraints(persona, rules, [], context);

        // Domain-scoped should come first (higher priority than task)
        expect(result.constraints[0].rule_id).toBe("domain-scoped");
        expect(result.constraints[1].rule_id).toBe("task-scoped");
      });

      it("prioritizes exact module match over glob match", () => {
        const persona = createTestPersona();
        const rules = [
          createTestRule({
            rule_id: "glob-match",
            scope: { module_id: "cli/*" },
            severity: "should",
            effective_confidence: 0.9,
          }),
          createTestRule({
            rule_id: "exact-match",
            scope: { module_id: "cli/commands" },
            severity: "should",
            effective_confidence: 0.8,
          }),
        ];
        const context: DeriveContext = { module_id: "cli/commands" };

        const result = deriveConstraints(persona, rules, [], context);

        // Exact match should come first despite lower confidence
        expect(result.constraints[0].rule_id).toBe("exact-match");
        expect(result.constraints[1].rule_id).toBe("glob-match");
      });

      it("follows full priority: module > domain > taskType > global", () => {
        const persona = createTestPersona();
        const rules = [
          createTestRule({
            rule_id: "global",
            scope: {},
            severity: "should",
          }),
          createTestRule({
            rule_id: "task-only",
            scope: { task_type: "review" },
            severity: "should",
          }),
          createTestRule({
            rule_id: "domain-only",
            scope: { project: "lex" },
            severity: "should",
          }),
          createTestRule({
            rule_id: "module-only",
            scope: { module_id: "cli" },
            severity: "should",
          }),
        ];
        const context: DeriveContext = {
          domain: "lex",
          module_id: "cli",
          taskType: "code-review",
        };

        const result = deriveConstraints(persona, rules, [], context);

        expect(result.constraints.map((c) => c.rule_id)).toEqual([
          "module-only",
          "domain-only",
          "task-only",
          "global",
        ]);
      });
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

      // Use hasLexConnection: true to avoid confidence ceiling
      const result = deriveConstraints(persona, rules, [], {}, { hasLexConnection: true });

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

    it("produces same inputHash for same inputs", () => {
      const persona = createTestPersona();
      const rules = [createTestRule({ rule_id: "r1" }), createTestRule({ rule_id: "r2" })];
      const context: DeriveContext = { domain: "test" };

      const result1 = deriveConstraints(persona, rules, testPrinciples, context);
      const result2 = deriveConstraints(persona, rules, testPrinciples, context);

      expect(result1.inputHash).toBe(result2.inputHash);
      expect(result1.inputHash).toBeTruthy();
    });

    it("produces different inputHash for different persona", () => {
      const persona1 = createTestPersona({ id: "quality-first_engineering", version: "1.0.0" });
      const persona2 = createTestPersona({ id: "momentum-first_product", version: "1.0.0" });
      const rules = [createTestRule({ rule_id: "r1" })];
      const context: DeriveContext = { domain: "test" };

      const result1 = deriveConstraints(persona1, rules, testPrinciples, context);
      const result2 = deriveConstraints(persona2, rules, testPrinciples, context);

      expect(result1.inputHash).not.toBe(result2.inputHash);
    });

    it("produces different inputHash for different rules", () => {
      const persona = createTestPersona();
      const rules1 = [createTestRule({ rule_id: "r1" })];
      const rules2 = [createTestRule({ rule_id: "r2" })];
      const context: DeriveContext = { domain: "test" };

      const result1 = deriveConstraints(persona, rules1, testPrinciples, context);
      const result2 = deriveConstraints(persona, rules2, testPrinciples, context);

      expect(result1.inputHash).not.toBe(result2.inputHash);
    });

    it("produces same inputHash regardless of rule order", () => {
      const persona = createTestPersona();
      const rules1 = [
        createTestRule({ rule_id: "r1" }),
        createTestRule({ rule_id: "r2" }),
        createTestRule({ rule_id: "r3" }),
      ];
      const rules2 = [
        createTestRule({ rule_id: "r3" }),
        createTestRule({ rule_id: "r1" }),
        createTestRule({ rule_id: "r2" }),
      ];
      const context: DeriveContext = { domain: "test" };

      const result1 = deriveConstraints(persona, rules1, testPrinciples, context);
      const result2 = deriveConstraints(persona, rules2, testPrinciples, context);

      expect(result1.inputHash).toBe(result2.inputHash);
    });

    it("sorts constraints deterministically by severity, confidence, then rule_id", () => {
      const persona = createTestPersona();
      const rules = [
        createTestRule({ rule_id: "r-b", severity: "should", effective_confidence: 0.8 }),
        createTestRule({ rule_id: "r-a", severity: "should", effective_confidence: 0.8 }),
        createTestRule({ rule_id: "r-c", severity: "must", effective_confidence: 0.5 }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      // Should be sorted: must first, then should by rule_id
      expect(result.constraints[0].rule_id).toBe("r-c"); // must
      expect(result.constraints[1].rule_id).toBe("r-a"); // should, alphabetically first
      expect(result.constraints[2].rule_id).toBe("r-b"); // should, alphabetically second
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

  describe("offline-safe guard (contract v0.2)", () => {
    it("throws PersonaRequiresMemoryError when persona requires memory but none available", () => {
      const persona = createTestPersona({
        requires_memory: true,
        offline_safe: undefined,
      });
      const rules = [createTestRule()];

      // Default config: hasLexConnection = false
      expect(() => deriveConstraints(persona, rules, [], {})).toThrow(PersonaRequiresMemoryError);
      expect(() => deriveConstraints(persona, rules, [], {})).toThrow(
        'Persona "quality-first_engineering" requires Lex memory connection'
      );
    });

    it("allows memory-requiring persona when Lex connection is available", () => {
      const persona = createTestPersona({
        requires_memory: true,
        offline_safe: undefined,
      });
      const rules = [createTestRule()];

      const result = deriveConstraints(persona, rules, [], {}, { hasLexConnection: true });

      expect(result.constraints).toHaveLength(1);
      expect(result.metadata.offlineMode).toBe(false);
    });

    it("allows offline-safe persona without Lex connection", () => {
      const persona = createTestPersona({
        requires_memory: false,
        offline_safe: {
          confidence_ceiling: 0.7,
          no_memory_disclaimer: "Operating offline.",
        },
      });
      const rules = [createTestRule()];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints).toHaveLength(1);
      expect(result.metadata.offlineMode).toBe(true);
    });

    it("includes offlineMode and confidenceCeiling in metadata", () => {
      const persona = createTestPersona({
        requires_memory: false,
        offline_safe: {
          confidence_ceiling: 0.6,
          no_memory_disclaimer: "No memory.",
        },
      });
      const rules = [createTestRule()];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.metadata.offlineMode).toBe(true);
      expect(result.metadata.confidenceCeiling).toBe(0.6);
    });
  });

  describe("confidence ceiling enforcement (contract v0.2)", () => {
    it("caps constraint confidence to offline_safe.confidence_ceiling", () => {
      const persona = createTestPersona({
        requires_memory: false,
        offline_safe: {
          confidence_ceiling: 0.5,
          no_memory_disclaimer: "Capped confidence.",
        },
      });
      const rules = [
        createTestRule({ rule_id: "r1", effective_confidence: 0.9 }),
        createTestRule({ rule_id: "r2", effective_confidence: 0.4 }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      // Rule with 0.9 confidence should be capped to 0.5
      const r1 = result.constraints.find((c) => c.rule_id === "r1");
      expect(r1?.confidence).toBe(0.5);

      // Rule with 0.4 confidence should remain unchanged (below ceiling)
      const r2 = result.constraints.find((c) => c.rule_id === "r2");
      expect(r2?.confidence).toBe(0.4);
    });

    it("does not cap confidence when Lex connection is available", () => {
      const persona = createTestPersona({
        requires_memory: false,
        offline_safe: {
          confidence_ceiling: 0.5,
          no_memory_disclaimer: "Should not apply.",
        },
      });
      const rules = [createTestRule({ rule_id: "r1", effective_confidence: 0.9 })];

      const result = deriveConstraints(persona, rules, [], {}, { hasLexConnection: true });

      const r1 = result.constraints.find((c) => c.rule_id === "r1");
      expect(r1?.confidence).toBe(0.9);
      expect(result.metadata.offlineMode).toBe(false);
      expect(result.metadata.confidenceCeiling).toBeUndefined();
    });

    it("applies ceiling even when all constraints exceed it", () => {
      const persona = createTestPersona({
        requires_memory: false,
        offline_safe: {
          confidence_ceiling: 0.3,
          no_memory_disclaimer: "Very conservative.",
        },
      });
      const rules = [
        createTestRule({ rule_id: "r1", effective_confidence: 0.95 }),
        createTestRule({ rule_id: "r2", effective_confidence: 0.85 }),
      ];

      const result = deriveConstraints(persona, rules, [], {});

      expect(result.constraints.every((c) => c.confidence === 0.3)).toBe(true);
    });
  });

  describe("with fixture data", () => {
    it("derives constraints using senior-dev persona and coding-style rules", () => {
      // Load persona fixture
      const personaPath = join(__dirname, "..", "..", "fixtures", "personas", "senior-dev.yaml");
      const personaData = parseYaml(readFileSync(personaPath, "utf-8"));
      const personaResult = PersonaManifestSchema.safeParse(personaData);
      expect(personaResult.success).toBe(true);

      if (!personaResult.success) return;
      const persona = personaResult.data as Persona;

      // Load rule fixtures
      const rulesPath = join(__dirname, "..", "..", "fixtures", "rules", "coding-style.yaml");
      const rulesData = parseYaml(readFileSync(rulesPath, "utf-8")) as { rules: unknown[] };

      // Convert to BehaviorRuleWithConfidence
      const rules = convertFixtureRulesToTestRules(rulesData.rules);

      // Derive constraints with context
      const context: DeriveContext = {
        domain: "engineering",
        module_id: "core",
      };

      const result = deriveConstraints(persona, rules, [], context);

      // Verify structure
      expect(result.personaId).toBe("quality-first_engineering");
      expect(result.context).toEqual(context);

      // Should include constraints from matching categories
      // senior-dev persona has categories: tool_preference, testing, code_quality
      // coding-style rules have: tool_preference, testing, code_quality
      expect(result.constraints.length).toBeGreaterThan(0);

      // Verify at least one constraint is from the fixtures
      const hasToolPreference = result.constraints.some((c) => c.category === "tool_preference");
      const hasTesting = result.constraints.some((c) => c.category === "testing");
      const hasCodeQuality = result.constraints.some((c) => c.category === "code_quality");

      expect(hasToolPreference || hasTesting || hasCodeQuality).toBe(true);
    });

    it("derives constraints using eager-pm persona and communication rules", () => {
      // Load persona fixture
      const personaPath = join(__dirname, "..", "..", "fixtures", "personas", "eager-pm.yaml");
      const personaData = parseYaml(readFileSync(personaPath, "utf-8"));
      const personaResult = PersonaManifestSchema.safeParse(personaData);
      expect(personaResult.success).toBe(true);

      if (!personaResult.success) return;
      const persona = personaResult.data as Persona;

      // Load rule fixtures
      const rulesPath = join(__dirname, "..", "..", "fixtures", "rules", "communication.yaml");
      const rulesData = parseYaml(readFileSync(rulesPath, "utf-8")) as { rules: unknown[] };

      // Convert to BehaviorRuleWithConfidence
      const rules = convertFixtureRulesToTestRules(rulesData.rules);

      // Derive constraints
      const context: DeriveContext = {
        domain: "product",
      };

      const result = deriveConstraints(persona, rules, [], context);

      // Verify structure
      expect(result.personaId).toBe("momentum-first_product");
      expect(result.context).toEqual(context);

      // Should include communication constraints
      // eager-pm persona has categories: workflow, completion, communication
      // communication rules have: communication
      const communicationConstraints = result.constraints.filter(
        (c) => c.category === "communication"
      );
      expect(communicationConstraints.length).toBeGreaterThan(0);
    });
  });
});

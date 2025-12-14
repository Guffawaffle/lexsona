/**
 * Test Helpers for LexSona
 *
 * Utility functions to reduce boilerplate in tests.
 *
 * @module
 */

import type { BehaviorRule, RuleScope } from "../../src/rules/types.js";
import type { Persona } from "../../src/persona/types.js";
import type { DeriveContext, ConstraintSet, Constraint } from "../../src/constraints/derive.js";

/**
 * Create a test BehaviorRule with sensible defaults
 */
export function createTestRule(overrides?: Partial<BehaviorRule>): BehaviorRule {
  const now = new Date().toISOString();
  return {
    rule_id: overrides?.rule_id ?? `test-rule-${Date.now()}`,
    category: overrides?.category ?? "test_category",
    text: overrides?.text ?? "Test rule for unit testing",
    scope: overrides?.scope ?? {},
    alpha: overrides?.alpha ?? 2,
    beta: overrides?.beta ?? 1,
    observation_count: overrides?.observation_count ?? 3,
    severity: overrides?.severity ?? "should",
    decay_tau: overrides?.decay_tau ?? 30,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
    last_observed: overrides?.last_observed ?? now,
  };
}

/**
 * Create a test RuleScope with optional overrides
 */
export function createTestScope(overrides?: Partial<RuleScope>): RuleScope {
  return {
    module_id: overrides?.module_id,
    task_type: overrides?.task_type,
    environment: overrides?.environment,
    project: overrides?.project,
    agent_family: overrides?.agent_family,
    context_tags: overrides?.context_tags,
  };
}

/**
 * Create a test Persona with sensible defaults
 */
export function createTestPersona(overrides?: Partial<Persona>): Persona {
  const requiresMemory = overrides?.requires_memory ?? false;

  return {
    id: overrides?.id ?? "quality-first_testing",
    version: overrides?.version ?? "1.0.0",
    behavior: overrides?.behavior ?? {
      primaryFocus: "quality-first",
      domain: "testing",
      description: "A test persona for unit testing",
    },
    duties: overrides?.duties ?? {
      mustDo: ["Run tests", "Check errors"],
      mustNotDo: ["Skip validation", "Ignore warnings"],
    },
    triggers: overrides?.triggers ?? {
      phrases: ["ok test persona", "test mode"],
    },
    ruleCategories: overrides?.ruleCategories ?? ["test_category"],
    requires_memory: requiresMemory,
    offline_safe: requiresMemory
      ? overrides?.offline_safe
      : (overrides?.offline_safe ?? {
          confidence_ceiling: 0.7,
          no_memory_disclaimer: "Operating without Lex memory connection.",
        }),
  };
}

/**
 * Create a test DeriveContext with optional overrides
 */
export function createTestContext(overrides?: Partial<DeriveContext>): DeriveContext {
  return {
    domain: overrides?.domain,
    module_id: overrides?.module_id,
    taskType: overrides?.taskType,
    environment: overrides?.environment,
    agent_family: overrides?.agent_family,
    context_tags: overrides?.context_tags,
  };
}

/**
 * Create a test Constraint
 */
export function createTestConstraint(overrides?: Partial<Constraint>): Constraint {
  return {
    rule_id: overrides?.rule_id ?? `rule-${Date.now()}`,
    text: overrides?.text ?? "Test constraint",
    severity: overrides?.severity ?? "should",
    confidence: overrides?.confidence ?? 0.8,
    category: overrides?.category ?? "test_category",
  };
}

/**
 * Create a test ConstraintSet
 */
export function createTestConstraintSet(overrides?: Partial<ConstraintSet>): ConstraintSet {
  return {
    personaId: overrides?.personaId ?? "quality-first_testing",
    derivedAt: overrides?.derivedAt ?? new Date().toISOString(),
    inputHash: overrides?.inputHash ?? "",
    context: overrides?.context ?? {},
    principles: overrides?.principles ?? [],
    constraints: overrides?.constraints ?? [],
    metadata: overrides?.metadata ?? {
      rulesConsidered: 0,
      rulesFiltered: 0,
      confidenceThreshold: 0.3,
      offlineMode: true,
      confidenceCeiling: undefined,
    },
  };
}

/**
 * Wait for a specified duration (useful for timing tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that a function throws with a specific message
 */
export async function expectToThrow(
  fn: () => Promise<unknown>,
  messagePattern: string | RegExp
): Promise<void> {
  let threw = false;
  let errorMessage = "";

  try {
    await fn();
  } catch (error) {
    threw = true;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  if (!threw) {
    throw new Error("Expected function to throw, but it did not");
  }

  const matches =
    typeof messagePattern === "string"
      ? errorMessage.includes(messagePattern)
      : messagePattern.test(errorMessage);

  if (!matches) {
    throw new Error(`Expected error message to match ${messagePattern}, but got: ${errorMessage}`);
  }
}

/**
 * Unit tests for constraint explainer
 */

import { describe, it, expect } from "vitest";
import { explainConstraint, explainAllConstraints } from "../../../src/constraints/explainer.js";
import type { ConstraintSet, Constraint } from "../../../src/constraints/derive.js";

const MOCK_TIMESTAMP = "2024-01-01T00:00:00.000Z";

describe("explainConstraint", () => {
  it("generates explanation for learned constraint", () => {
    const constraint: Constraint = {
      rule_id: "test-rule-1",
      text: "Always validate inputs",
      severity: "must",
      confidence: 0.85,
      category: "validation",
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: "test-rule-1",
        confidence: 0.85,
      },
    };

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {
        domain: "test-project",
        module_id: "test-module",
      },
      principles: [],
      constraints: [constraint],
      metadata: {
        rulesConsidered: 10,
        rulesFiltered: 5,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanation = explainConstraint(constraint, constraintSet);

    expect(explanation.constraintId).toBe("test-rule-1");
    expect(explanation.constraintStatement).toBe("Always validate inputs");
    expect(explanation.severity).toBe("must");
    expect(explanation.category).toBe("validation");
    expect(explanation.confidence).toBe("high"); // 0.85 >= 0.7
    expect(explanation.reasons.length).toBeGreaterThan(0);

    // Should have persona reason
    const personaReason = explanation.reasons.find((r) => r.type === "persona");
    expect(personaReason).toBeDefined();
    expect(personaReason?.narrative).toContain("quality-first_engineering");
    expect(personaReason?.narrative).toContain("validation");

    // Should have learned reason
    const learnedReason = explanation.reasons.find((r) => r.type === "learned");
    expect(learnedReason).toBeDefined();
    expect(learnedReason?.source).toBe("test-rule-1");

    // Should have confidence reason
    const confidenceReason = explanation.reasons.find((r) => r.type === "confidence");
    expect(confidenceReason).toBeDefined();
    expect(confidenceReason?.evidence?.confidenceValue).toBe(0.85);
    expect(confidenceReason?.evidence?.confidenceThreshold).toBe(0.3);
  });

  it("generates explanation for persona-based constraint", () => {
    const constraint: Constraint = {
      rule_id: "persona:quality:must:test",
      text: "Write comprehensive tests",
      severity: "must",
      confidence: 1.0,
      category: "persona-duty",
      source: "persona",
      provenance: {
        source: "persona",
        rule_id: null,
        confidence: 1.0,
      },
    };

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [constraint],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanation = explainConstraint(constraint, constraintSet);

    expect(explanation.confidence).toBe("high"); // 1.0 >= 0.7

    // Should have persona reason with high weight
    const personaReason = explanation.reasons.find((r) => r.type === "persona");
    expect(personaReason).toBeDefined();
    expect(personaReason?.weight).toBe(1.0);
    expect(personaReason?.narrative).toContain("explicitly requires");
  });

  it("includes scope-match reason when context has scope", () => {
    const constraint: Constraint = {
      rule_id: "test-rule",
      text: "Test constraint",
      severity: "should",
      confidence: 0.6,
      category: "testing",
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: "test-rule",
        confidence: 0.6,
      },
    };

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {
        domain: "lexsona",
        module_id: "cli/commands",
        taskType: "implementation",
      },
      principles: [],
      constraints: [constraint],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanation = explainConstraint(constraint, constraintSet);

    // Should have scope-match reason
    const scopeReason = explanation.reasons.find((r) => r.type === "scope-match");
    expect(scopeReason).toBeDefined();
    expect(scopeReason?.narrative).toContain("lexsona");
    expect(scopeReason?.narrative).toContain("cli/commands");
    expect(scopeReason?.narrative).toContain("implementation");

    // Should include matched context
    expect(explanation.matchedContext).toBeDefined();
    expect(explanation.matchedContext?.domain).toBe("lexsona");
    expect(explanation.matchedContext?.module_id).toBe("cli/commands");
    expect(explanation.matchedContext?.taskType).toBe("implementation");
  });

  it("determines correct confidence level", () => {
    const highConfidenceConstraint: Constraint = {
      rule_id: "high",
      text: "High confidence",
      severity: "must",
      confidence: 0.85,
      category: "test",
      source: "learned",
    };

    const mediumConfidenceConstraint: Constraint = {
      rule_id: "medium",
      text: "Medium confidence",
      severity: "should",
      confidence: 0.5,
      category: "test",
      source: "learned",
    };

    const lowConfidenceConstraint: Constraint = {
      rule_id: "low",
      text: "Low confidence",
      severity: "style",
      confidence: 0.35,
      category: "test",
      source: "learned",
    };

    const constraintSet: ConstraintSet = {
      personaId: "test",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [highConfidenceConstraint, mediumConfidenceConstraint, lowConfidenceConstraint],
      metadata: {
        rulesConsidered: 3,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const highExplanation = explainConstraint(highConfidenceConstraint, constraintSet);
    expect(highExplanation.confidence).toBe("high");

    const mediumExplanation = explainConstraint(mediumConfidenceConstraint, constraintSet);
    expect(mediumExplanation.confidence).toBe("medium");

    const lowExplanation = explainConstraint(lowConfidenceConstraint, constraintSet);
    expect(lowExplanation.confidence).toBe("low");
  });

  it("includes derivedAt timestamp", () => {
    const constraint: Constraint = {
      rule_id: "test",
      text: "Test",
      severity: "should",
      confidence: 0.5,
      category: "test",
      source: "learned",
    };

    const timestamp = "2025-12-15T10:30:00.000Z";
    const constraintSet: ConstraintSet = {
      personaId: "test",
      derivedAt: timestamp,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [constraint],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanation = explainConstraint(constraint, constraintSet);
    expect(explanation.derivedAt).toBe(timestamp);
  });
});

describe("explainAllConstraints", () => {
  it("generates explanations for all constraints", () => {
    const constraints: Constraint[] = [
      {
        rule_id: "rule-1",
        text: "First rule",
        severity: "must",
        confidence: 0.9,
        category: "validation",
        source: "learned",
      },
      {
        rule_id: "rule-2",
        text: "Second rule",
        severity: "should",
        confidence: 0.7,
        category: "testing",
        source: "learned",
      },
    ];

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints,
      metadata: {
        rulesConsidered: 2,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanations = explainAllConstraints(constraintSet);

    expect(explanations).toHaveLength(2);
    expect(explanations[0].constraintId).toBe("rule-1");
    expect(explanations[1].constraintId).toBe("rule-2");
  });

  it("returns empty array for constraint set with no constraints", () => {
    const constraintSet: ConstraintSet = {
      personaId: "test",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [],
      metadata: {
        rulesConsidered: 0,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const explanations = explainAllConstraints(constraintSet);
    expect(explanations).toHaveLength(0);
  });
});

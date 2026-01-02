/**
 * Unit tests for narrative formatters
 */

import { describe, it, expect } from "vitest";
import {
  formatExplanationProse,
  formatAllExplanationsProse,
  formatExplanationJson,
  formatAllExplanationsJson,
} from "../../../src/constraints/narrative.js";
import type { ConstraintExplanation } from "../../../src/constraints/explainer.js";

const MOCK_TIMESTAMP = "2024-01-01T00:00:00.000Z";

describe("formatExplanationProse", () => {
  it("formats a single explanation as prose", () => {
    const explanation: ConstraintExplanation = {
      constraintId: "test-rule",
      constraintStatement: "Always validate inputs",
      severity: "must",
      category: "validation",
      confidence: "high",
      reasons: [
        {
          type: "persona",
          source: "quality-first_engineering",
          narrative: 'The "quality-first_engineering" persona includes the "validation" category',
          weight: 0.8,
        },
        {
          type: "confidence",
          source: "threshold",
          narrative: "Confidence 0.85 exceeds threshold 0.30",
          weight: 0.85,
        },
      ],
      derivedAt: MOCK_TIMESTAMP,
    };

    const prose = formatExplanationProse(explanation);

    expect(prose).toContain("test-rule");
    expect(prose).toContain("confidence: high");
    expect(prose).toContain("Always validate inputs");
    expect(prose).toContain("Why active:");
    expect(prose).toContain("quality-first_engineering");
    expect(prose).toContain("Confidence 0.85 exceeds threshold 0.30");
  });

  it("includes index when provided", () => {
    const explanation: ConstraintExplanation = {
      constraintId: "test-rule",
      constraintStatement: "Test",
      severity: "should",
      category: "test",
      confidence: "medium",
      reasons: [],
      derivedAt: MOCK_TIMESTAMP,
    };

    const prose = formatExplanationProse(explanation, 3);
    expect(prose).toMatch(/^3\./);
  });

  it("includes matched context when present", () => {
    const explanation: ConstraintExplanation = {
      constraintId: "test-rule",
      constraintStatement: "Test",
      severity: "should",
      category: "test",
      confidence: "medium",
      reasons: [],
      matchedContext: {
        domain: "lexsona",
        module_id: "cli/commands",
        taskType: "implementation",
      },
      derivedAt: MOCK_TIMESTAMP,
    };

    const prose = formatExplanationProse(explanation);
    expect(prose).toContain("Scope:");
    expect(prose).toContain("lexsona");
    expect(prose).toContain("cli/commands");
    expect(prose).toContain("implementation");
  });
});

describe("formatAllExplanationsProse", () => {
  it("formats multiple explanations with title", () => {
    const explanations: ConstraintExplanation[] = [
      {
        constraintId: "rule-1",
        constraintStatement: "First rule",
        severity: "must",
        category: "validation",
        confidence: "high",
        reasons: [
          {
            type: "persona",
            source: "test",
            narrative: "Test narrative",
            weight: 1.0,
          },
        ],
        derivedAt: MOCK_TIMESTAMP,
      },
      {
        constraintId: "rule-2",
        constraintStatement: "Second rule",
        severity: "should",
        category: "testing",
        confidence: "medium",
        reasons: [
          {
            type: "confidence",
            source: "threshold",
            narrative: "Confidence reason",
            weight: 0.5,
          },
        ],
        derivedAt: MOCK_TIMESTAMP,
      },
    ];

    const prose = formatAllExplanationsProse(explanations);

    expect(prose).toContain("📋 Active Constraints");
    expect(prose).toContain("1. rule-1");
    expect(prose).toContain("2. rule-2");
    expect(prose).toContain("First rule");
    expect(prose).toContain("Second rule");
  });

  it("handles empty explanations array", () => {
    const prose = formatAllExplanationsProse([]);

    expect(prose).toContain("No active constraints");
    expect(prose).toContain("lexsona constraints derive");
  });

  it("uses custom title when provided", () => {
    const explanations: ConstraintExplanation[] = [];
    const prose = formatAllExplanationsProse(explanations, "Custom Title");

    expect(prose).toContain("Custom Title");
  });
});

describe("formatExplanationJson", () => {
  it("formats explanation as JSON-serializable object", () => {
    const explanation: ConstraintExplanation = {
      constraintId: "test-rule",
      constraintStatement: "Always validate inputs",
      severity: "must",
      category: "validation",
      confidence: "high",
      reasons: [
        {
          type: "persona",
          source: "quality-first_engineering",
          narrative: "Persona reason",
          weight: 0.8,
          evidence: {
            personaName: "quality-first_engineering",
          },
        },
        {
          type: "confidence",
          source: "threshold",
          narrative: "Confidence reason",
          weight: 0.85,
          evidence: {
            confidenceValue: 0.85,
            confidenceThreshold: 0.3,
          },
        },
      ],
      matchedContext: {
        domain: "test-domain",
      },
      derivedAt: MOCK_TIMESTAMP,
    };

    const json = formatExplanationJson(explanation) as any;

    expect(json.constraintId).toBe("test-rule");
    expect(json.statement).toBe("Always validate inputs");
    expect(json.severity).toBe("must");
    expect(json.category).toBe("validation");
    expect(json.confidence).toBe("high");
    expect(json.reasons).toHaveLength(2);
    expect(json.reasons[0].type).toBe("persona");
    expect(json.reasons[0].evidence.personaName).toBe("quality-first_engineering");
    expect(json.matchedContext.domain).toBe("test-domain");
    expect(json.derivedAt).toBe(MOCK_TIMESTAMP);
  });
});

describe("formatAllExplanationsJson", () => {
  it("formats multiple explanations as JSON", () => {
    const explanations: ConstraintExplanation[] = [
      {
        constraintId: "rule-1",
        constraintStatement: "First rule",
        severity: "must",
        category: "validation",
        confidence: "high",
        reasons: [],
        derivedAt: MOCK_TIMESTAMP,
      },
      {
        constraintId: "rule-2",
        constraintStatement: "Second rule",
        severity: "should",
        category: "testing",
        confidence: "medium",
        reasons: [],
        derivedAt: MOCK_TIMESTAMP,
      },
    ];

    const json = formatAllExplanationsJson(explanations) as any;

    expect(json.version).toBe(1);
    expect(json.count).toBe(2);
    expect(json.explanations).toHaveLength(2);
    expect(json.explanations[0].constraintId).toBe("rule-1");
    expect(json.explanations[1].constraintId).toBe("rule-2");
  });

  it("handles empty explanations array", () => {
    const json = formatAllExplanationsJson([]) as any;

    expect(json.version).toBe(1);
    expect(json.count).toBe(0);
    expect(json.explanations).toHaveLength(0);
  });
});

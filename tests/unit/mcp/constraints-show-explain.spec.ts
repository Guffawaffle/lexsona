/**
 * MCP Constraints Show/Explain Handler Tests (AX-008)
 *
 * Tests the constraints_show and constraints_explain tools.
 */

import { describe, it, expect } from "vitest";
import {
  handleConstraintsShow,
  handleConstraintsExplain,
} from "../../../src/mcp/handlers.js";
import type { ConstraintSet } from "../../../src/constraints/derive.js";
import { LexSonaErrorCode } from "../../../src/mcp/errors.js";

// Test constants
const MOCK_TIMESTAMP = "2024-01-01T00:00:00.000Z";

describe("handleConstraintsShow (AX-008)", () => {
  it("returns last derivation when available", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {
        domain: "test",
        module_id: "test-module",
        taskType: "implementation",
      },
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Always validate inputs",
          severity: "must",
          confidence: 0.9,
          category: "validation",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 10,
        rulesFiltered: 5,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsShow({}, state);

    expect(result).toEqual(mockDerivation);
  });

  it("throws NO_DERIVATION error when no derivation exists", async () => {
    const state = { lastDerivation: null };

    await expect(handleConstraintsShow({}, state)).rejects.toThrow();
    await expect(handleConstraintsShow({}, state)).rejects.toMatchObject({
      code: LexSonaErrorCode.NO_DERIVATION,
    });
  });

  it("includes metadata about derivation", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "momentum-first_product",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "xyz789",
      context: {},
      principles: [],
      constraints: [],
      metadata: {
        rulesConsidered: 5,
        rulesFiltered: 2,
        confidenceThreshold: 0.5,
        offlineMode: true,
        confidenceCeiling: 0.7,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = (await handleConstraintsShow({}, state)) as ConstraintSet;

    expect(result.metadata.offlineMode).toBe(true);
    expect(result.metadata.confidenceCeiling).toBe(0.7);
  });
});

describe("handleConstraintsExplain (AX-008)", () => {
  it("explains constraint with structured reasons", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {
        domain: "test",
        module_id: "test-module",
        taskType: "implementation",
      },
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Always validate inputs",
          severity: "must",
          confidence: 0.9,
          category: "validation",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 10,
        rulesFiltered: 5,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    expect(result).toMatchObject({
      constraintId: "rule_1",
      text: "Always validate inputs",
      severity: "must",
      category: "validation",
      confidence: 0.9,
      active: true,
    });

    expect((result as any).reasons).toBeDefined();
    expect(Array.isArray((result as any).reasons)).toBe(true);
    expect((result as any).reasons.length).toBeGreaterThan(0);
  });

  it("includes persona match reason", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.8,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    const reasons = (result as any).reasons;
    const personaReason = reasons.find((r: any) => r.source === "persona");
    expect(personaReason).toBeDefined();
    expect(personaReason?.detail).toContain("quality-first_engineering");
    expect(personaReason?.detail).toContain("testing");
  });

  it("includes confidence reason", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.75,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    const reasons = (result as any).reasons;
    const confidenceReason = reasons.find((r: any) => r.source === "confidence");
    expect(confidenceReason).toBeDefined();
    expect(confidenceReason?.weight).toBe(0.75);
    expect(confidenceReason?.detail).toContain("0.75");
    expect(confidenceReason?.detail).toContain("0.30");
  });

  it("includes offline ceiling reason when applicable", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.6,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: true,
        confidenceCeiling: 0.6,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    const reasons = (result as any).reasons;
    const ceilingReason = reasons.find((r: any) => r.source === "offline-ceiling");
    expect(ceilingReason).toBeDefined();
    expect(ceilingReason?.detail).toContain("0.60");
  });

  it("includes matched context", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {
        domain: "lexsona",
        module_id: "mcp/server",
        taskType: "implementation",
      },
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.8,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    expect((result as any).matchedContext).toMatchObject({
      domain: "lexsona",
      module_id: "mcp/server",
      taskType: "implementation",
    });
  });

  it("throws NO_DERIVATION error when no derivation exists", async () => {
    const state = { lastDerivation: null };

    await expect(
      handleConstraintsExplain({ constraint_id: "rule_1" }, state)
    ).rejects.toThrow();
    await expect(
      handleConstraintsExplain({ constraint_id: "rule_1" }, state)
    ).rejects.toMatchObject({
      code: LexSonaErrorCode.NO_DERIVATION,
    });
  });

  it("throws CONSTRAINT_NOT_FOUND error when constraint not found", async () => {
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: MOCK_TIMESTAMP,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.8,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };

    await expect(
      handleConstraintsExplain({ constraint_id: "nonexistent_rule" }, state)
    ).rejects.toThrow();
    await expect(
      handleConstraintsExplain({ constraint_id: "nonexistent_rule" }, state)
    ).rejects.toMatchObject({
      code: LexSonaErrorCode.CONSTRAINT_NOT_FOUND,
    });
  });

  it("includes derivedAt timestamp in response", async () => {
    const timestamp = "2024-06-15T10:30:00.000Z";
    const mockDerivation: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: timestamp,
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule_1",
          text: "Test rule",
          severity: "should",
          confidence: 0.8,
          category: "testing",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const state = { lastDerivation: mockDerivation };
    const result = await handleConstraintsExplain(
      { constraint_id: "rule_1" },
      state
    );

    expect((result as any).derivedAt).toBe(timestamp);
  });
});

/**
 * MCP Format Parameter Tests (AX-009)
 *
 * Tests compact format mode for all MCP tools that support it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleActivate, handleConstraints, handleRules } from "../../../src/mcp/handlers.js";
import type { ConstraintSet } from "../../../src/constraints/derive.js";
import { createTestConstraintSet } from "../../utils/test-helpers.js";

// Mock LexSona instance
const createMockLexSona = () => {
  const mockRules = [
    {
      rule_id: "rule_1",
      text: "Always validate inputs before processing",
      severity: "must" as const,
      category: "validation",
      effective_confidence: 0.95,
      scope: {},
      source: "learned" as const,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      confidence: 0.95,
      decay_factor: 0.1,
      alpha: 10,
      beta: 1,
      observation_count: 11,
      decay_tau: 30,
      last_observed: "2024-01-01T00:00:00.000Z",
    },
    {
      rule_id: "rule_2",
      text: "Write unit tests for all public APIs",
      severity: "should" as const,
      category: "testing",
      effective_confidence: 0.85,
      scope: {},
      source: "learned" as const,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      confidence: 0.85,
      decay_factor: 0.1,
      alpha: 9,
      beta: 2,
      observation_count: 11,
      decay_tau: 30,
      last_observed: "2024-01-01T00:00:00.000Z",
    },
  ];

  return {
    isConnected: vi.fn(() => false),
    getRuleVersion: vi.fn(() => 42),
    getRules: vi.fn(async () => mockRules),
  };
};

describe("handleActivate format parameter (AX-009)", () => {
  it("returns full format by default", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: null };

    const result = await handleActivate(
      { persona: "quality-first_engineering" },
      state,
      getLexSona
    );

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("ruleVersion", 42);
    expect(result).toHaveProperty("persona");
    expect((result as any).persona).toHaveProperty("id");
    expect((result as any).persona).toHaveProperty("version");
    expect((result as any).persona).toHaveProperty("behavior");
    expect((result as any).persona).toHaveProperty("ruleCategories");
    expect(result).not.toHaveProperty("_compact");
  });

  it("returns compact format when requested", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: null };

    const result = await handleActivate(
      { persona: "quality-first_engineering", format: "compact" },
      state,
      getLexSona
    );

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("ruleVersion", 42);
    expect(result).toHaveProperty("_compact", true);
    expect((result as any).persona).toHaveProperty("id");
    expect((result as any).persona).toHaveProperty("ver");
    expect((result as any).persona).toHaveProperty("bhv");
    expect((result as any).persona).toHaveProperty("cats");
    // Should NOT have full field names
    expect((result as any).persona).not.toHaveProperty("version");
    expect((result as any).persona).not.toHaveProperty("behavior");
  });

  it("returns full format when explicitly requested", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: null };

    const result = await handleActivate(
      { persona: "quality-first_engineering", format: "full" },
      state,
      getLexSona
    );

    expect(result).toHaveProperty("success", true);
    expect(result).not.toHaveProperty("_compact");
    expect((result as any).persona).toHaveProperty("version");
    expect((result as any).persona).toHaveProperty("behavior");
  });
});

describe("handleConstraints format parameter (AX-009)", () => {
  it("returns full format by default", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = await handleConstraints({}, state, getLexSona);

    expect(result).toHaveProperty("personaId");
    expect(result).toHaveProperty("derivedAt");
    expect(result).toHaveProperty("inputHash");
    expect(result).toHaveProperty("context");
    expect(result).toHaveProperty("constraints");
    expect(result).toHaveProperty("metadata");
    expect(result).not.toHaveProperty("_compact");
    expect(result).not.toHaveProperty("ctx");
    expect(result).not.toHaveProperty("meta");
    expect((result as any).constraints[0]).not.toHaveProperty("provenance");
  });

  it("returns compact format when requested", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = await handleConstraints({ format: "compact" }, state, getLexSona);

    expect(result).toHaveProperty("_compact", true);
    expect(result).toHaveProperty("ctx");
    expect(result).toHaveProperty("meta");
    expect(result).toHaveProperty("ruleVer");
    // Should NOT have full field names
    expect(result).not.toHaveProperty("metadata");
    expect(result).not.toHaveProperty("ruleVersion");
  });

  it("uses compact constraint format in compact mode", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = (await handleConstraints({ format: "compact" }, state, getLexSona)) as any;

    expect(result.constraints).toBeDefined();
    expect(Array.isArray(result.constraints)).toBe(true);

    if (result.constraints.length > 0) {
      const constraint = result.constraints[0];
      expect(constraint).toHaveProperty("id");
      expect(constraint).toHaveProperty("sev");
      expect(constraint).toHaveProperty("conf");
      expect(constraint).toHaveProperty("cat");
      // Should NOT have full field names or text (text omitted in compact mode)
      expect(constraint).not.toHaveProperty("rule_id");
      expect(constraint).not.toHaveProperty("text");
      expect(constraint).not.toHaveProperty("txt");
      expect(constraint).not.toHaveProperty("severity");
      expect(constraint).not.toHaveProperty("confidence");
      expect(constraint).not.toHaveProperty("category");
    }
  });

  it("uses compact metadata in compact mode", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = (await handleConstraints({ format: "compact" }, state, getLexSona)) as any;

    expect(result.meta).toBeDefined();
    expect(result.meta).toHaveProperty("rulesConsidered");
    expect(result.meta).toHaveProperty("rulesFiltered");
    expect(result.meta).toHaveProperty("confThreshold");
    expect(result.meta).toHaveProperty("offline");
    // Should NOT have full field names
    expect(result.meta).not.toHaveProperty("confidenceThreshold");
    expect(result.meta).not.toHaveProperty("offlineMode");
  });

  it("returns the canonical snapshot contract when requested", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = (await handleConstraints(
      {
        contract: "snapshot-v1",
        bindings: { workspace: "lex-mcp", attempt: "attempt-1" },
      },
      state,
      getLexSona
    )) as any;

    expect(result.contract).toBe("ConstraintSnapshot_v1");
    expect(result.schemaVersion).toBe(1);
    expect(result.bindings).toEqual({ workspace: "lex-mcp", attempt: "attempt-1" });
    expect(result.authority.grantsAuthority).toBe(false);
    expect(result.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.derivedAt).toBeUndefined();
  });

  it("returns the bounded embedded projection for compact snapshots", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = (await handleConstraints(
      { contract: "snapshot-v1", format: "compact" },
      state,
      getLexSona
    )) as any;

    expect(result.contract).toBe("ConstraintSnapshot_v1");
    expect(result.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.grantsAuthority).toBe(false);
    expect(result.constraints.length).toBeLessThanOrEqual(20);
    expect(result).not.toHaveProperty("sources");
  });
});

describe("handleRules format parameter (AX-009)", () => {
  it("returns full format by default", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;

    const result = await handleRules({}, getLexSona);

    expect(result).toHaveProperty("count");
    expect(result).toHaveProperty("ruleVersion");
    expect(result).toHaveProperty("rules");
    expect(result).not.toHaveProperty("_compact");
    expect(result).not.toHaveProperty("ruleVer");

    const rules = (result as any).rules;
    if (rules.length > 0) {
      expect(rules[0]).toHaveProperty("rule_id");
      expect(rules[0]).toHaveProperty("text");
      expect(rules[0]).toHaveProperty("severity");
      expect(rules[0]).toHaveProperty("confidence");
      expect(rules[0]).toHaveProperty("category");
    }
  });

  it("returns compact format when requested", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;

    const result = await handleRules({ format: "compact" }, getLexSona);

    expect(result).toHaveProperty("_compact", true);
    expect(result).toHaveProperty("count");
    expect(result).toHaveProperty("ruleVer");
    expect(result).toHaveProperty("rules");
    // Should NOT have full field names
    expect(result).not.toHaveProperty("ruleVersion");

    const rules = (result as any).rules;
    expect(rules).toBeDefined();
    expect(Array.isArray(rules)).toBe(true);

    if (rules.length > 0) {
      const rule = rules[0];
      expect(rule).toHaveProperty("id");
      expect(rule).toHaveProperty("sev");
      expect(rule).toHaveProperty("conf");
      expect(rule).toHaveProperty("cat");
      // Should NOT have full field names or text (text omitted in compact mode)
      expect(rule).not.toHaveProperty("rule_id");
      expect(rule).not.toHaveProperty("text");
      expect(rule).not.toHaveProperty("txt");
      expect(rule).not.toHaveProperty("severity");
      expect(rule).not.toHaveProperty("confidence");
      expect(rule).not.toHaveProperty("category");
    }
  });

  it("uses abbreviated severity codes in compact mode", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;

    const result = (await handleRules({ format: "compact" }, getLexSona)) as any;

    const rules = result.rules;
    const mustRule = rules.find((r: any) => r.sev === "m");
    const shouldRule = rules.find((r: any) => r.sev === "s");

    // At least one of these should exist based on our mock data
    expect(mustRule || shouldRule).toBeDefined();

    if (mustRule) {
      expect(mustRule.sev).toBe("m");
    }
    if (shouldRule) {
      expect(shouldRule.sev).toBe("s");
    }
  });

  it("rounds confidence to 2 decimals in compact mode", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;

    const result = (await handleRules({ format: "compact" }, getLexSona)) as any;

    const rules = result.rules;
    if (rules.length > 0) {
      const rule = rules[0];
      expect(rule.conf).toBeDefined();
      expect(typeof rule.conf).toBe("number");
      // Check it's rounded to at most 2 decimals
      const decimalPlaces = (rule.conf.toString().split(".")[1] || "").length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    }
  });
});

describe("format parameter payload reduction (AX-009)", () => {
  it("compact mode reduces payload size significantly", async () => {
    const mockLexSona = createMockLexSona();
    const getLexSona = async () => mockLexSona as any;

    const fullResult = await handleRules({ format: "full" }, getLexSona);
    const compactResult = await handleRules({ format: "compact" }, getLexSona);

    const fullSize = JSON.stringify(fullResult).length;
    const compactSize = JSON.stringify(compactResult).length;

    // Compact should be smaller
    expect(compactSize).toBeLessThan(fullSize);

    // Calculate reduction percentage
    const reduction = ((fullSize - compactSize) / fullSize) * 100;

    // Should achieve at least 20% reduction (conservative test)
    // Real-world usage should achieve 50%+ with larger payloads
    expect(reduction).toBeGreaterThan(20);
  });
});

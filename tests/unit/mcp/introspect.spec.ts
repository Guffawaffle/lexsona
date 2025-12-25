/**
 * MCP Introspect Handler Tests (AX-002)
 *
 * Tests the introspect tool for agent self-discovery.
 * Validates that it returns version, state, personas, capabilities, and error codes.
 */

import { describe, it, expect, vi } from "vitest";
import { handleIntrospect } from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";
import { LexSonaErrorCode } from "../../../src/mcp/errors.js";

describe("handleIntrospect (AX-002)", () => {
  it("returns version, state, personas, capabilities, and error codes", async () => {
    const mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "isConnected").mockReturnValue(true);
    vi.spyOn(mockLexSona, "getConfig").mockReturnValue({ lexDb: "/test/lex.db" });
    vi.spyOn(mockLexSona, "getRules").mockResolvedValue([
      {
        rule_id: "rule1",
        text: "Test rule 1",
        severity: "should",
        category: "general",
        source: "learned",
        scope: {},
        effective_confidence: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        confidence: 0.8,
        decay_factor: 1.0,
        alpha: 1,
        beta: 1,
        observation_count: 1,
        decay_tau: 30,
        last_observed: new Date().toISOString(),
      },
      {
        rule_id: "rule2",
        text: "Test rule 2",
        severity: "must",
        category: "security",
        source: "learned",
        scope: {},
        effective_confidence: 0.9,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        confidence: 0.9,
        decay_factor: 1.0,
        alpha: 1,
        beta: 1,
        observation_count: 1,
        decay_tau: 30,
        last_observed: new Date().toISOString(),
      },
    ]);

    const getLexSona = async () => mockLexSona;
    const state = { activePersonaId: "quality-first_engineering" };

    const result = await handleIntrospect({}, state, getLexSona);

    expect(result).toMatchObject({
      version: "0.3.0",
      state: {
        activePersona: "quality-first_engineering",
        ruleCount: 2,
        lexConnected: true,
        lexDbPath: "/test/lex.db",
      },
      capabilities: {
        caching: false,
        lexIntegration: true,
      },
    });

    // Check that personas array is present and contains expected personas
    expect(result).toHaveProperty("personas");
    expect(Array.isArray((result as any).personas)).toBe(true);
    expect((result as any).personas).toContain("quality-first_engineering");
    expect((result as any).personas).toContain("momentum-first_product");

    // Check that error codes are present and include expected codes
    expect(result).toHaveProperty("errorCodes");
    expect(Array.isArray((result as any).errorCodes)).toBe(true);
    expect((result as any).errorCodes).toContain(LexSonaErrorCode.PERSONA_NOT_FOUND);
    expect((result as any).errorCodes).toContain(LexSonaErrorCode.LEX_CONNECTION_FAILED);
  });

  it("returns null for activePersona when none is active", async () => {
    const mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "isConnected").mockReturnValue(false);
    vi.spyOn(mockLexSona, "getConfig").mockReturnValue({});

    const getLexSona = async () => mockLexSona;
    const state = { activePersonaId: null };

    const result = await handleIntrospect({}, state, getLexSona);

    expect(result).toMatchObject({
      version: "0.3.0",
      state: {
        activePersona: null,
        ruleCount: 0,
        lexConnected: false,
        lexDbPath: undefined,
      },
      capabilities: {
        caching: false,
        lexIntegration: false,
      },
    });
  });

  it("handles getLexSona errors gracefully", async () => {
    const getLexSona = async () => {
      throw new Error("Connection failed");
    };
    const state = { activePersonaId: "quality-first_engineering" };

    const result = await handleIntrospect({}, state, getLexSona);

    // Should still return introspection data, but with lexConnected: false
    expect(result).toMatchObject({
      version: "0.3.0",
      state: {
        activePersona: "quality-first_engineering",
        ruleCount: 0,
        lexConnected: false,
        lexDbPath: undefined,
      },
      capabilities: {
        caching: false,
        lexIntegration: false,
      },
    });
  });

  it("includes all available personas in the response", async () => {
    const mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "isConnected").mockReturnValue(false);
    vi.spyOn(mockLexSona, "getConfig").mockReturnValue({});

    const getLexSona = async () => mockLexSona;
    const state = { activePersonaId: null };

    const result = await handleIntrospect({}, state, getLexSona);

    // Check that both bundled personas are included
    expect((result as any).personas).toContain("quality-first_engineering");
    expect((result as any).personas).toContain("momentum-first_product");
  });
});

/**
 * MCP Handler Scoping Tests (AX-007)
 *
 * Tests that handleLearn correctly maps domain/module to Lex context fields.
 * Validates the fix for AX-007: domain was incorrectly stored as module_id.
 */

import { describe, it, expect, vi } from "vitest";
import { handleLearn } from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";

describe("handleLearn scoping (AX-007)", () => {
  it("maps module to module_id in context", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Always use TypeScript strict mode",
        module: "src/services/auth",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correction: "Always use TypeScript strict mode",
        context: expect.objectContaining({
          module_id: "src/services/auth",
        }),
      })
    );
  });

  it("maps domain to project in context", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use JWT for authentication",
        domain: "lex-core",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correction: "Use JWT for authentication",
        context: expect.objectContaining({
          project: "lex-core",
        }),
      })
    );
  });

  it("maps both module and domain correctly when both provided", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Always validate API inputs",
        module: "src/api/handlers",
        domain: "lex-core",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correction: "Always validate API inputs",
        context: expect.objectContaining({
          module_id: "src/api/handlers",
          project: "lex-core",
        }),
      })
    );
  });

  it("handles undefined module gracefully", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Prefer functional patterns",
        domain: "lex-core",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          module_id: undefined,
          project: "lex-core",
        }),
      })
    );
  });

  it("handles undefined domain gracefully", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use strict null checks",
        module: "src/utils",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          module_id: "src/utils",
          project: undefined,
        }),
      })
    );
  });

  it("does not use domain as fallback for module_id", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    // This is the key test case from AX-007:
    // When only domain is provided, it should NOT be stored as module_id
    await handleLearn(
      {
        correction: "Follow project conventions",
        domain: "lex-core",
      },
      getLexSona
    );

    const call = learnSpy.mock.calls[0][0];
    expect(call.context.module_id).toBeUndefined();
    expect(call.context.project).toBe("lex-core");
  });

  it("preserves other correction fields", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use error boundaries",
        severity: "must",
        category: "error-handling",
        module: "src/components",
        domain: "ui-framework",
        polarity: "reinforce",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        correction: "Use error boundaries",
        severity: "must",
        category: "error-handling",
        polarity: 1,
        context: expect.objectContaining({
          module_id: "src/components",
          project: "ui-framework",
        }),
      })
    );
  });

  it("converts counter polarity correctly", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Don't skip input validation",
        polarity: "counter",
        module: "src/api",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        polarity: -1,
      })
    );
  });

  it("returns success response with correct fields", async () => {
    const mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    const result = await handleLearn(
      {
        correction: "Test correction",
        severity: "should",
        polarity: "reinforce",
      },
      getLexSona
    );

    expect(result).toEqual({
      success: true,
      correction: "Test correction",
      severity: "should",
      polarity: "reinforce",
    });
  });
});

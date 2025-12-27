/**
 * MCP Handler Scoping Tests (AX-007)
 *
 * Tests that handleLearn correctly uses project/module_id canonical fields.
 * Validates proper scoping for rule learning.
 */

import { describe, it, expect, vi } from "vitest";
import { handleLearn } from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";

describe("handleLearn scoping (AX-007)", () => {
  it("maps module_id to context correctly", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Always use TypeScript strict mode",
        module_id: "src/services/auth",
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

  it("maps project to context correctly", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use JWT for authentication",
        project: "lex-core",
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

  it("handles both module_id and project correctly when both provided", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Always validate API inputs",
        module_id: "src/api/handlers",
        project: "lex-core",
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

  it("handles undefined module_id gracefully", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Prefer functional patterns",
        project: "lex-core",
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

  it("handles undefined project gracefully", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use strict null checks",
        module_id: "src/utils",
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

  it("preserves other correction fields", async () => {
    const mockLexSona = await LexSona.connect();
    const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
    const getLexSona = async () => mockLexSona;

    await handleLearn(
      {
        correction: "Use error boundaries",
        severity: "must",
        category: "error-handling",
        module_id: "src/components",
        project: "ui-framework",
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
        module_id: "src/api",
      },
      getLexSona
    );

    expect(learnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        polarity: -1,
      })
    );
  });
});

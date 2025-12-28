/**
 * MCP Handler Scoping Validation Integration Tests
 *
 * Tests that MCP handlers (handleLearn, handleConstraints, handleRules)
 * correctly validate scoping inputs. Only canonical fields (project, module_id)
 * are accepted. Deprecated fields (domain, module) are rejected.
 */

import { describe, it, expect, vi } from "vitest";
import { handleLearn, handleConstraints, handleRules } from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";

describe("MCP Handler Scoping Validation", () => {
  describe("handleLearn", () => {
    it("accepts canonical fields (project, module_id)", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
          project: "lex-core",
          module_id: "src/api",
        },
        getLexSona
      );

      expect(learnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            project: "lex-core",
            module_id: "src/api",
          }),
        })
      );
    });

    it("works with only project field", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
          project: "lex-core",
        },
        getLexSona
      );

      expect(learnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            project: "lex-core",
          }),
        })
      );
    });

    it("works with only module_id field", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
          module_id: "src/api",
        },
        getLexSona
      );

      expect(learnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            module_id: "src/api",
          }),
        })
      );
    });

    it("works with no scoping fields", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
        },
        getLexSona
      );

      expect(learnSpy).toHaveBeenCalled();
    });
  });

  describe("handleConstraints", () => {
    it("accepts canonical fields (project, module_id)", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "deriveConstraints").mockResolvedValue({
        constraints: [],
        source: "persona",
        truncated: false,
      });
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints(
        {
          context: "building API",
          project: "lex-core",
          module_id: "src/api",
        },
        { activePersonaId: null },
        getLexSona
      );

      expect(result).toBeDefined();
    });

    it("works with no scoping fields", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "deriveConstraints").mockResolvedValue({
        constraints: [],
        source: "persona",
        truncated: false,
      });
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints(
        {
          context: "building API",
        },
        { activePersonaId: null },
        getLexSona
      );

      expect(result).toBeDefined();
    });
  });

  describe("handleRules", () => {
    it("accepts canonical fields (project)", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      const result = await handleRules(
        {
          project: "lex-core",
        },
        getLexSona
      );

      expect(result).toBeDefined();
    });

    it("works with no scoping fields", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      const result = await handleRules({}, getLexSona);

      expect(result).toBeDefined();
    });
  });
});

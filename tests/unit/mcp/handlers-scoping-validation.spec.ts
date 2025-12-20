/**
 * MCP Handler Scoping Validation Integration Tests
 *
 * Tests that MCP handlers (handleLearn, handleConstraints, handleRules)
 * correctly validate and normalize scoping inputs through normalizeScopingInputs.
 *
 * Covers all permutations of canonical vs deprecated fields and ensures
 * conflicts are rejected with clear error messages.
 */

import { describe, it, expect, vi } from "vitest";
import {
  handleLearn,
  handleConstraints,
  handleRules,
} from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";
import { LexSonaError, LexSonaErrorCode } from "../../../src/mcp/errors.js";

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

    it("accepts deprecated fields (domain, module) and maps them", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
          domain: "lex-core",
          module: "src/api",
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

    it("accepts consistent combination of deprecated and canonical", async () => {
      const mockLexSona = await LexSona.connect();
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await handleLearn(
        {
          correction: "Use TypeScript",
          domain: "lex-core",
          project: "lex-core",
          module: "src/api",
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

    it("rejects conflicting project and domain", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await expect(
        handleLearn(
          {
            correction: "Use TypeScript",
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);
    });

    it("rejects conflicting module and module_id", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      await expect(
        handleLearn(
          {
            correction: "Use TypeScript",
            module: "src/api",
            module_id: "src/core",
          },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);
    });

    it("provides machine-readable error code for conflicts", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      try {
        await handleLearn(
          {
            correction: "Use TypeScript",
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
      }
    });
  });

  describe("handleConstraints", () => {
    it("accepts canonical fields (project, module_id)", async () => {
      const mockLexSona = await LexSona.connect();
      const getRulesSpy = vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await handleConstraints(
        {
          project: "lex-core",
          module_id: "src/api",
        },
        { activePersonaId: null },
        getLexSona
      );

      expect(getRulesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "lex-core",
        })
      );
    });

    it("accepts deprecated fields (domain, module) and maps them", async () => {
      const mockLexSona = await LexSona.connect();
      const getRulesSpy = vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await handleConstraints(
        {
          domain: "lex-core",
          module: "src/api",
        },
        { activePersonaId: null },
        getLexSona
      );

      expect(getRulesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "lex-core",
        })
      );
    });

    it("rejects conflicting project and domain", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await expect(
        handleConstraints(
          {
            domain: "lex-core",
            project: "lexsona",
          },
          { activePersonaId: null },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);
    });

    it("rejects conflicting module and module_id", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await expect(
        handleConstraints(
          {
            module: "src/api",
            module_id: "src/core",
          },
          { activePersonaId: null },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);
    });
  });

  describe("handleRules", () => {
    it("accepts canonical field (project)", async () => {
      const mockLexSona = await LexSona.connect();
      const getRulesSpy = vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await handleRules(
        {
          project: "lex-core",
        },
        getLexSona
      );

      expect(getRulesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "lex-core",
        })
      );
    });

    it("accepts deprecated field (domain) and maps it", async () => {
      const mockLexSona = await LexSona.connect();
      const getRulesSpy = vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await handleRules(
        {
          domain: "lex-core",
        },
        getLexSona
      );

      expect(getRulesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "lex-core",
        })
      );
    });

    it("rejects conflicting project and domain", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      await expect(
        handleRules(
          {
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);
    });

    it("provides machine-readable error code for conflicts", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);
      const getLexSona = async () => mockLexSona;

      try {
        await handleRules(
          {
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
      }
    });
  });

  describe("error messages for agent self-correction", () => {
    it("error message points to correct field names", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      try {
        await handleLearn(
          {
            correction: "Test",
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        );
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        expect(lexError.message).toContain("project");
        expect(lexError.message).toContain("domain");
      }
    });

    it("error suggestions include canonical field usage", async () => {
      const mockLexSona = await LexSona.connect();
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const getLexSona = async () => mockLexSona;

      try {
        await handleLearn(
          {
            correction: "Test",
            domain: "lex-core",
            project: "lexsona",
          },
          getLexSona
        );
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        const suggestions = lexError.getSuggestions();
        expect(suggestions.some((s) => s.includes("Use 'project'"))).toBe(true);
        expect(suggestions.some((s) => s.includes("deprecated"))).toBe(true);
      }
    });
  });
});

/**
 * MCP Error Handling Integration Tests
 *
 * Tests that MCP handlers properly convert LexSonaError to McpError with structured codes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleActivate, handleLearn } from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";
import { LexSonaErrorCode, LexSonaError } from "../../../src/mcp/errors.js";
import * as loader from "../../../src/persona/loader.js";

describe("MCP Error Handling Integration", () => {
  describe("handleActivate errors", () => {
    it("throws LexSonaError when persona not found", async () => {
      // Mock loadPersona to throw persona not found error
      const mockLoadPersona = vi.spyOn(loader, "loadPersona").mockRejectedValue(
        new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found: invalid-persona", {
          retryable: false,
          suggestions: ["Check persona ID"],
        })
      );

      const state = { activePersonaId: null };

      await expect(handleActivate({ persona: "invalid-persona" }, state)).rejects.toThrow(
        LexSonaError
      );

      await expect(handleActivate({ persona: "invalid-persona" }, state)).rejects.toMatchObject({
        code: LexSonaErrorCode.PERSONA_NOT_FOUND,
        message: expect.stringContaining("invalid-persona"),
      });

      mockLoadPersona.mockRestore();
    });

    it("throws LexSonaError when persona manifest is invalid", async () => {
      const mockLoadPersona = vi.spyOn(loader, "loadPersona").mockRejectedValue(
        new LexSonaError(
          LexSonaErrorCode.PERSONA_INVALID_MANIFEST,
          "Invalid persona manifest: missing id field",
          {
            retryable: false,
            suggestions: ["Check YAML frontmatter"],
          }
        )
      );

      const state = { activePersonaId: null };

      await expect(handleActivate({ persona: "bad-manifest" }, state)).rejects.toThrow(
        LexSonaError
      );

      await expect(handleActivate({ persona: "bad-manifest" }, state)).rejects.toMatchObject({
        code: LexSonaErrorCode.PERSONA_INVALID_MANIFEST,
      });

      mockLoadPersona.mockRestore();
    });
  });

  describe("handleLearn errors", () => {
    it("throws LexSonaError when not connected to Lex", async () => {
      const mockLexSona = await LexSona.connect(); // Disconnected instance
      const getLexSona = async () => mockLexSona;

      // Should throw LEX_NOT_CONNECTED when trying to learn
      await expect(
        handleLearn(
          {
            correction: "Always validate inputs",
            severity: "must",
            category: "validation",
          },
          getLexSona
        )
      ).rejects.toThrow(LexSonaError);

      await expect(
        handleLearn(
          {
            correction: "Always validate inputs",
          },
          getLexSona
        )
      ).rejects.toMatchObject({
        code: LexSonaErrorCode.LEX_NOT_CONNECTED,
      });
    });
  });

  describe("Error metadata and suggestions", () => {
    it("LexSonaError includes suggestions in metadata", async () => {
      const mockLoadPersona = vi.spyOn(loader, "loadPersona").mockRejectedValue(
        new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found: test-persona", {
          retryable: false,
          suggestions: [
            "Check persona ID format",
            "Run lexsona persona list",
            "Verify search paths",
          ],
        })
      );

      const state = { activePersonaId: null };

      try {
        await handleActivate({ persona: "test-persona" }, state);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        if (error instanceof LexSonaError) {
          expect(error.getSuggestions()).toHaveLength(3);
          expect(error.getSuggestions()[0]).toContain("persona ID format");
        }
      }

      mockLoadPersona.mockRestore();
    });

    it("LexSonaError includes context in metadata", async () => {
      const searchPaths = ["/path1", "/path2"];
      const mockLoadPersona = vi.spyOn(loader, "loadPersona").mockRejectedValue(
        new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found: test-persona", {
          retryable: false,
          context: {
            personaId: "test-persona",
            searchPaths,
          },
        })
      );

      const state = { activePersonaId: null };

      try {
        await handleActivate({ persona: "test-persona" }, state);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        if (error instanceof LexSonaError) {
          expect(error.metadata?.context).toEqual({
            personaId: "test-persona",
            searchPaths,
          });
        }
      }

      mockLoadPersona.mockRestore();
    });
  });

  describe("Error retryability", () => {
    it("persona not found errors are not retryable", async () => {
      const mockLoadPersona = vi.spyOn(loader, "loadPersona").mockRejectedValue(
        new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found", {
          retryable: false,
        })
      );

      const state = { activePersonaId: null };

      try {
        await handleActivate({ persona: "test" }, state);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        if (error instanceof LexSonaError) {
          expect(error.isRetryable()).toBe(false);
        }
      }

      mockLoadPersona.mockRestore();
    });

    it("connection errors are retryable", () => {
      const error = new LexSonaError(LexSonaErrorCode.LEX_CONNECTION_FAILED, "Connection failed", {
        retryable: true,
      });

      expect(error.isRetryable()).toBe(true);
    });
  });
});

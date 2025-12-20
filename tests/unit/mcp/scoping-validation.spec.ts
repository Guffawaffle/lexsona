/**
 * MCP Scoping Validation Tests
 *
 * Tests for the normalizeScopingInputs helper that validates and normalizes
 * deprecated (domain, module) to canonical (project, module_id) fields.
 *
 * This prevents silent mis-routing issues where fields are incorrectly mapped.
 */

import { describe, it, expect } from "vitest";
import { normalizeScopingInputs } from "../../../src/mcp/scoping.js";
import { LexSonaError, LexSonaErrorCode } from "../../../src/mcp/errors.js";

describe("normalizeScopingInputs", () => {
  describe("canonical fields only", () => {
    it("accepts project field only", () => {
      const result = normalizeScopingInputs({ project: "lex-core" });
      expect(result).toEqual({ project: "lex-core" });
    });

    it("accepts module_id field only", () => {
      const result = normalizeScopingInputs({ module_id: "src/api" });
      expect(result).toEqual({ module_id: "src/api" });
    });

    it("accepts both canonical fields", () => {
      const result = normalizeScopingInputs({
        project: "lex-core",
        module_id: "src/api",
      });
      expect(result).toEqual({
        project: "lex-core",
        module_id: "src/api",
      });
    });

    it("returns empty object when no fields provided", () => {
      const result = normalizeScopingInputs({});
      expect(result).toEqual({});
    });
  });

  describe("deprecated fields only", () => {
    it("maps domain to project", () => {
      const result = normalizeScopingInputs({ domain: "lex-core" });
      expect(result).toEqual({ project: "lex-core" });
    });

    it("maps module to module_id", () => {
      const result = normalizeScopingInputs({ module: "src/api" });
      expect(result).toEqual({ module_id: "src/api" });
    });

    it("maps both deprecated fields to canonical", () => {
      const result = normalizeScopingInputs({
        domain: "lex-core",
        module: "src/api",
      });
      expect(result).toEqual({
        project: "lex-core",
        module_id: "src/api",
      });
    });
  });

  describe("consistent combinations", () => {
    it("accepts domain and project with same value", () => {
      const result = normalizeScopingInputs({
        domain: "lex-core",
        project: "lex-core",
      });
      expect(result).toEqual({ project: "lex-core" });
    });

    it("accepts module and module_id with same value", () => {
      const result = normalizeScopingInputs({
        module: "src/api",
        module_id: "src/api",
      });
      expect(result).toEqual({ module_id: "src/api" });
    });

    it("accepts all four fields when values are consistent", () => {
      const result = normalizeScopingInputs({
        domain: "lex-core",
        project: "lex-core",
        module: "src/api",
        module_id: "src/api",
      });
      expect(result).toEqual({
        project: "lex-core",
        module_id: "src/api",
      });
    });
  });

  describe("conflicting combinations - project vs domain", () => {
    it("throws error when domain and project have different values", () => {
      expect(() =>
        normalizeScopingInputs({
          domain: "lex-core",
          project: "lexsona",
        })
      ).toThrow(LexSonaError);
    });

    it("provides clear error message for project conflict", () => {
      try {
        normalizeScopingInputs({
          domain: "lex-core",
          project: "lexsona",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
        expect(lexError.message).toContain("'project'");
        expect(lexError.message).toContain("'domain'");
        expect(lexError.message).toContain("lexsona");
        expect(lexError.message).toContain("lex-core");
      }
    });

    it("provides suggestions for project conflict", () => {
      try {
        normalizeScopingInputs({
          domain: "lex-core",
          project: "lexsona",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        const suggestions = lexError.getSuggestions();
        expect(suggestions).toContain(`Use 'project' field instead of deprecated 'domain' field`);
        expect(suggestions.some((s) => s.includes("remove domain field"))).toBe(true);
      }
    });

    it("includes context in error metadata", () => {
      try {
        normalizeScopingInputs({
          domain: "lex-core",
          project: "lexsona",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        expect(lexError.metadata?.context).toEqual({
          project: "lexsona",
          domain: "lex-core",
        });
      }
    });
  });

  describe("conflicting combinations - module_id vs module", () => {
    it("throws error when module and module_id have different values", () => {
      expect(() =>
        normalizeScopingInputs({
          module: "src/api",
          module_id: "src/core",
        })
      ).toThrow(LexSonaError);
    });

    it("provides clear error message for module_id conflict", () => {
      try {
        normalizeScopingInputs({
          module: "src/api",
          module_id: "src/core",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
        expect(lexError.message).toContain("'module_id'");
        expect(lexError.message).toContain("'module'");
        expect(lexError.message).toContain("src/api");
        expect(lexError.message).toContain("src/core");
      }
    });

    it("provides suggestions for module_id conflict", () => {
      try {
        normalizeScopingInputs({
          module: "src/api",
          module_id: "src/core",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        const suggestions = lexError.getSuggestions();
        expect(suggestions).toContain(
          `Use 'module_id' field instead of deprecated 'module' field`
        );
        expect(suggestions.some((s) => s.includes("remove module field"))).toBe(true);
      }
    });

    it("includes context in error metadata", () => {
      try {
        normalizeScopingInputs({
          module: "src/api",
          module_id: "src/core",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        expect(lexError.metadata?.context).toEqual({
          module_id: "src/core",
          module: "src/api",
        });
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty string values", () => {
      const result = normalizeScopingInputs({
        project: "",
        module_id: "",
      });
      expect(result).toEqual({
        project: "",
        module_id: "",
      });
    });

    it("detects conflict with empty strings", () => {
      expect(() =>
        normalizeScopingInputs({
          domain: "",
          project: "lex",
        })
      ).toThrow(LexSonaError);
    });

    it("handles whitespace-only values", () => {
      const result = normalizeScopingInputs({
        project: "  ",
        module_id: "\t",
      });
      expect(result).toEqual({
        project: "  ",
        module_id: "\t",
      });
    });
  });
});

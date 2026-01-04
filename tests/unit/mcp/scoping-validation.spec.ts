/**
 * MCP Scoping Validation Tests
 *
 * Tests for the normalizeScopingInputs helper that validates scoping inputs.
 * Only canonical fields (project, module_id) are accepted.
 * Deprecated fields (domain, module) are rejected with clear error messages.
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

  describe("deprecated fields are rejected", () => {
    it("rejects domain field with clear error", () => {
      expect(() =>
        normalizeScopingInputs({ domain: "lex-core" } as Record<string, unknown>)
      ).toThrow(LexSonaError);
    });

    it("rejects module field with clear error", () => {
      expect(() =>
        normalizeScopingInputs({ module: "src/api" } as Record<string, unknown>)
      ).toThrow(LexSonaError);
    });

    it("rejects both deprecated fields", () => {
      expect(() =>
        normalizeScopingInputs({
          domain: "lex-core",
          module: "src/api",
        } as Record<string, unknown>)
      ).toThrow(LexSonaError);
    });

    it("provides clear error message for deprecated domain field", () => {
      try {
        normalizeScopingInputs({ domain: "lex-core" } as Record<string, unknown>);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
        expect(lexError.message).toContain("Deprecated fields used");
        expect(lexError.message).toContain("domain");
        expect(lexError.message).toContain("project");
      }
    });

    it("provides clear error message for deprecated module field", () => {
      try {
        normalizeScopingInputs({ module: "src/api" } as Record<string, unknown>);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LexSonaError);
        const lexError = error as LexSonaError;
        expect(lexError.code).toBe(LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT);
        expect(lexError.message).toContain("Deprecated fields used");
        expect(lexError.message).toContain("module");
        expect(lexError.message).toContain("module_id");
      }
    });

    it("provides suggestions for deprecated field usage", () => {
      try {
        normalizeScopingInputs({ domain: "lex-core" } as Record<string, unknown>);
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        const suggestions = lexError.getSuggestions();
        expect(suggestions).toContain("Replace 'domain' with 'project'");
        expect(suggestions).toContain("Replace 'module' with 'module_id'");
      }
    });

    it("includes deprecated fields in error context", () => {
      try {
        normalizeScopingInputs({
          domain: "lex-core",
          module: "src/api",
        } as Record<string, unknown>);
        expect.fail("Should have thrown");
      } catch (error) {
        const lexError = error as LexSonaError;
        expect(lexError.context).toMatchObject({
          deprecatedFields: ["domain", "module"],
        });
      }
    });

    it("rejects deprecated fields even when canonical fields are also present", () => {
      expect(() =>
        normalizeScopingInputs({
          project: "lex-core",
          domain: "lex-core", // deprecated - should still fail
        } as Record<string, unknown>)
      ).toThrow(LexSonaError);
    });
  });

  describe("edge cases", () => {
    it("handles empty string values for canonical fields", () => {
      const result = normalizeScopingInputs({
        project: "",
        module_id: "",
      });
      expect(result).toEqual({
        project: "",
        module_id: "",
      });
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

    it("handles undefined values", () => {
      const result = normalizeScopingInputs({
        project: undefined,
        module_id: undefined,
      });
      expect(result).toEqual({
        project: undefined,
        module_id: undefined,
      });
    });
  });
});

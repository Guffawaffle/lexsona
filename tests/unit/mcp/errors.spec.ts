/**
 * Error Code Tests
 *
 * Tests for LexSona structured error codes and error handling.
 */

import { describe, it, expect } from "vitest";
import {
  LexSonaErrorCode,
  LexSonaError,
  createPersonaNotFoundError,
  createPersonaManifestError,
  createLexDbNotFoundError,
  createLexConnectionError,
  createLexNotConnectedError,
  createLexMissingTableError,
  createRuleValidationError,
  createValidationError,
} from "../../../src/mcp/errors.js";

describe("LexSonaErrorCode", () => {
  describe("Error Code Enum", () => {
    it("defines persona error codes", () => {
      expect(LexSonaErrorCode.PERSONA_NOT_FOUND).toBe("PERSONA_NOT_FOUND");
      expect(LexSonaErrorCode.PERSONA_INVALID_ID).toBe("PERSONA_INVALID_ID");
      expect(LexSonaErrorCode.PERSONA_INVALID_MANIFEST).toBe("PERSONA_INVALID_MANIFEST");
      expect(LexSonaErrorCode.PERSONA_PARSE_FAILED).toBe("PERSONA_PARSE_FAILED");
    });

    it("defines rule error codes", () => {
      expect(LexSonaErrorCode.RULE_VALIDATION_FAILED).toBe("RULE_VALIDATION_FAILED");
      expect(LexSonaErrorCode.RULE_SCOPE_INVALID).toBe("RULE_SCOPE_INVALID");
      expect(LexSonaErrorCode.RULE_TEXT_EMPTY).toBe("RULE_TEXT_EMPTY");
      expect(LexSonaErrorCode.RULE_CATEGORY_INVALID).toBe("RULE_CATEGORY_INVALID");
    });

    it("defines constraint error codes", () => {
      expect(LexSonaErrorCode.CONSTRAINT_DERIVATION_FAILED).toBe("CONSTRAINT_DERIVATION_FAILED");
      expect(LexSonaErrorCode.CONSTRAINT_INVALID_CONTEXT).toBe("CONSTRAINT_INVALID_CONTEXT");
    });

    it("defines Lex connection error codes", () => {
      expect(LexSonaErrorCode.LEX_CONNECTION_FAILED).toBe("LEX_CONNECTION_FAILED");
      expect(LexSonaErrorCode.LEX_DB_NOT_FOUND).toBe("LEX_DB_NOT_FOUND");
      expect(LexSonaErrorCode.LEX_DB_MISSING_TABLE).toBe("LEX_DB_MISSING_TABLE");
      expect(LexSonaErrorCode.LEX_NOT_CONNECTED).toBe("LEX_NOT_CONNECTED");
    });

    it("defines validation error codes", () => {
      expect(LexSonaErrorCode.VALIDATION_REQUIRED_FIELD).toBe("VALIDATION_REQUIRED_FIELD");
      expect(LexSonaErrorCode.VALIDATION_INVALID_FORMAT).toBe("VALIDATION_INVALID_FORMAT");
    });

    it("defines internal error codes", () => {
      expect(LexSonaErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    });
  });

  describe("LexSonaError Class", () => {
    it("creates error with code and message", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona"
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("LexSonaError");
      expect(error.code).toBe(LexSonaErrorCode.PERSONA_NOT_FOUND);
      expect(error.message).toBe("Persona not found: test-persona");
    });

    it("includes metadata when provided", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        {
          retryable: false,
          suggestions: ["Check persona ID", "Run lexsona persona list"],
          context: { personaId: "test-persona" },
        }
      );

      expect(error.metadata?.retryable).toBe(false);
      expect(error.metadata?.suggestions).toEqual(["Check persona ID", "Run lexsona persona list"]);
      expect(error.metadata?.context).toEqual({ personaId: "test-persona" });
    });

    it("isRetryable returns false by default", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona"
      );

      expect(error.isRetryable()).toBe(false);
    });

    it("isRetryable returns metadata value when provided", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.LEX_CONNECTION_FAILED,
        "Connection failed",
        {
          retryable: true,
        }
      );

      expect(error.isRetryable()).toBe(true);
    });

    it("getSuggestions returns empty array by default", () => {
      const error = new LexSonaError(LexSonaErrorCode.INTERNAL_ERROR, "Internal error");

      expect(error.getSuggestions()).toEqual([]);
    });

    it("getSuggestions returns metadata suggestions when provided", () => {
      const error = new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found", {
        retryable: false,
        suggestions: ["Suggestion 1", "Suggestion 2"],
      });

      expect(error.getSuggestions()).toEqual(["Suggestion 1", "Suggestion 2"]);
    });

    it("toResponse converts to MCP response format", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        {
          retryable: false,
          suggestions: ["Check persona ID"],
        }
      );

      const response = error.toResponse();

      expect(response).toEqual({
        error: {
          code: "PERSONA_NOT_FOUND",
          message: "Persona not found: test-persona",
          metadata: {
            retryable: false,
            suggestions: ["Check persona ID"],
          },
        },
      });
    });

    it("toResponse omits metadata when not provided", () => {
      const error = new LexSonaError(LexSonaErrorCode.INTERNAL_ERROR, "Internal error");

      const response = error.toResponse();

      expect(response).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal error",
        },
      });
    });
  });

  describe("Helper Functions", () => {
    describe("createPersonaNotFoundError", () => {
      it("creates error with persona ID and search paths", () => {
        const error = createPersonaNotFoundError("test-persona", ["/path1", "/path2"]);

        expect(error.code).toBe(LexSonaErrorCode.PERSONA_NOT_FOUND);
        expect(error.message).toBe("Persona not found: test-persona");
        expect(error.metadata?.retryable).toBe(false);
        expect(error.getSuggestions().length).toBeGreaterThan(0);
        expect(error.metadata?.context).toEqual({
          personaId: "test-persona",
          searchPaths: ["/path1", "/path2"],
        });
      });

      it("includes helpful suggestions", () => {
        const error = createPersonaNotFoundError("test-persona", ["/path1"]);
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("persona ID format"))).toBe(true);
        expect(suggestions.some((s) => s.includes("lexsona persona list"))).toBe(true);
      });
    });

    describe("createPersonaManifestError", () => {
      it("creates error with file path and validation errors", () => {
        const error = createPersonaManifestError("/path/to/persona.yaml", "id: Required");

        expect(error.code).toBe(LexSonaErrorCode.PERSONA_INVALID_MANIFEST);
        expect(error.message).toContain("/path/to/persona.yaml");
        expect(error.message).toContain("id: Required");
        expect(error.metadata?.retryable).toBe(false);
        expect(error.getSuggestions().length).toBeGreaterThan(0);
      });

      it("includes YAML syntax suggestions", () => {
        const error = createPersonaManifestError("/path/to/persona.yaml", "Parse error");
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("YAML"))).toBe(true);
      });
    });

    describe("createLexDbNotFoundError", () => {
      it("creates error with database path", () => {
        const error = createLexDbNotFoundError("/path/to/lex.db");

        expect(error.code).toBe(LexSonaErrorCode.LEX_DB_NOT_FOUND);
        expect(error.message).toContain("/path/to/lex.db");
        expect(error.metadata?.retryable).toBe(false);
        expect(error.metadata?.context).toEqual({ dbPath: "/path/to/lex.db" });
      });

      it("includes lex init suggestion", () => {
        const error = createLexDbNotFoundError("/path/to/lex.db");
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("lex init"))).toBe(true);
      });
    });

    describe("createLexConnectionError", () => {
      it("creates error with database path and reason", () => {
        const error = createLexConnectionError("/path/to/lex.db", "File is locked");

        expect(error.code).toBe(LexSonaErrorCode.LEX_CONNECTION_FAILED);
        expect(error.message).toContain("/path/to/lex.db");
        expect(error.message).toContain("File is locked");
        expect(error.metadata?.retryable).toBe(true);
        expect(error.metadata?.context).toEqual({
          dbPath: "/path/to/lex.db",
          reason: "File is locked",
        });
      });

      it("is retryable", () => {
        const error = createLexConnectionError("/path/to/lex.db", "Temporary failure");

        expect(error.isRetryable()).toBe(true);
      });
    });

    describe("createLexNotConnectedError", () => {
      it("creates error with helpful message", () => {
        const error = createLexNotConnectedError();

        expect(error.code).toBe(LexSonaErrorCode.LEX_NOT_CONNECTED);
        expect(error.message).toContain("Not connected");
        expect(error.metadata?.retryable).toBe(false);
      });

      it("includes connection verification suggestions", () => {
        const error = createLexNotConnectedError();
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("lex init"))).toBe(true);
        expect(suggestions.some((s) => s.includes("LEX_DB_PATH"))).toBe(true);
      });
    });

    describe("createLexMissingTableError", () => {
      it("creates error with database path", () => {
        const error = createLexMissingTableError("/path/to/lex.db");

        expect(error.code).toBe(LexSonaErrorCode.LEX_DB_MISSING_TABLE);
        expect(error.message).toContain("/path/to/lex.db");
        expect(error.message).toContain("lexsona_behavior_rules");
        expect(error.metadata?.retryable).toBe(false);
      });

      it("includes lex migrate suggestion", () => {
        const error = createLexMissingTableError("/path/to/lex.db");
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("lex migrate"))).toBe(true);
      });
    });

    describe("createRuleValidationError", () => {
      it("creates error with reason", () => {
        const error = createRuleValidationError("Rule text is empty");

        expect(error.code).toBe(LexSonaErrorCode.RULE_VALIDATION_FAILED);
        expect(error.message).toContain("Rule text is empty");
        expect(error.metadata?.retryable).toBe(false);
      });

      it("includes validation suggestions", () => {
        const error = createRuleValidationError("Invalid severity");
        const suggestions = error.getSuggestions();

        expect(suggestions.some((s) => s.includes("severity"))).toBe(true);
      });
    });

    describe("createValidationError", () => {
      it("creates error with custom code and message", () => {
        const error = createValidationError(
          LexSonaErrorCode.VALIDATION_REQUIRED_FIELD,
          "Field is required"
        );

        expect(error.code).toBe(LexSonaErrorCode.VALIDATION_REQUIRED_FIELD);
        expect(error.message).toBe("Field is required");
        expect(error.metadata?.retryable).toBe(false);
      });

      it("includes suggestions when provided", () => {
        const error = createValidationError(
          LexSonaErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid format",
          ["Use correct format", "Check documentation"]
        );

        expect(error.getSuggestions()).toEqual(["Use correct format", "Check documentation"]);
      });

      it("has no suggestions when not provided", () => {
        const error = createValidationError(
          LexSonaErrorCode.VALIDATION_REQUIRED_FIELD,
          "Field is required"
        );

        expect(error.getSuggestions()).toEqual([]);
      });
    });
  });

  describe("Error Code Categories", () => {
    it("all persona codes start with PERSONA_", () => {
      const personaCodes = [
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        LexSonaErrorCode.PERSONA_INVALID_ID,
        LexSonaErrorCode.PERSONA_INVALID_MANIFEST,
        LexSonaErrorCode.PERSONA_PARSE_FAILED,
      ];

      personaCodes.forEach((code) => {
        expect(code).toMatch(/^PERSONA_/);
      });
    });

    it("all rule codes start with RULE_", () => {
      const ruleCodes = [
        LexSonaErrorCode.RULE_VALIDATION_FAILED,
        LexSonaErrorCode.RULE_SCOPE_INVALID,
        LexSonaErrorCode.RULE_TEXT_EMPTY,
        LexSonaErrorCode.RULE_CATEGORY_INVALID,
      ];

      ruleCodes.forEach((code) => {
        expect(code).toMatch(/^RULE_/);
      });
    });

    it("all constraint codes start with CONSTRAINT_", () => {
      const constraintCodes = [
        LexSonaErrorCode.CONSTRAINT_DERIVATION_FAILED,
        LexSonaErrorCode.CONSTRAINT_INVALID_CONTEXT,
      ];

      constraintCodes.forEach((code) => {
        expect(code).toMatch(/^CONSTRAINT_/);
      });
    });

    it("all Lex codes start with LEX_", () => {
      const lexCodes = [
        LexSonaErrorCode.LEX_CONNECTION_FAILED,
        LexSonaErrorCode.LEX_DB_NOT_FOUND,
        LexSonaErrorCode.LEX_DB_MISSING_TABLE,
        LexSonaErrorCode.LEX_NOT_CONNECTED,
      ];

      lexCodes.forEach((code) => {
        expect(code).toMatch(/^LEX_/);
      });
    });

    it("all validation codes start with VALIDATION_", () => {
      const validationCodes = [
        LexSonaErrorCode.VALIDATION_REQUIRED_FIELD,
        LexSonaErrorCode.VALIDATION_INVALID_FORMAT,
      ];

      validationCodes.forEach((code) => {
        expect(code).toMatch(/^VALIDATION_/);
      });
    });
  });
});

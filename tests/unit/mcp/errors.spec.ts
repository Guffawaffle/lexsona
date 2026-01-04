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
  isClientError,
  formatErrorForMcp,
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
    it("creates error with code, message, and nextActions (AX-compliant)", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        ["Check persona ID", "Run lexsona persona list"]
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("LexSonaError");
      expect(error.code).toBe(LexSonaErrorCode.PERSONA_NOT_FOUND);
      expect(error.message).toBe("Persona not found: test-persona");
      expect(error.nextActions).toEqual(["Check persona ID", "Run lexsona persona list"]);
    });

    it("includes context when provided (AX-compliant)", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        ["Check persona ID", "Run lexsona persona list"],
        { personaId: "test-persona", retryable: false }
      );

      expect(error.context).toEqual({ personaId: "test-persona", retryable: false });
      expect(error.isRetryable()).toBe(false);
    });

    it("isRetryable returns false by default", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        ["Try a different persona"]
      );

      expect(error.isRetryable()).toBe(false);
    });

    it("isRetryable returns context value when provided", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.LEX_CONNECTION_FAILED,
        "Connection failed",
        ["Retry the connection"],
        { retryable: true }
      );

      expect(error.isRetryable()).toBe(true);
    });

    it("getSuggestions returns nextActions (deprecated alias)", () => {
      const error = new LexSonaError(LexSonaErrorCode.PERSONA_NOT_FOUND, "Persona not found", [
        "Suggestion 1",
        "Suggestion 2",
      ]);

      expect(error.getSuggestions()).toEqual(["Suggestion 1", "Suggestion 2"]);
    });

    it("toResponse converts to AXError response format", () => {
      const error = new LexSonaError(
        LexSonaErrorCode.PERSONA_NOT_FOUND,
        "Persona not found: test-persona",
        ["Check persona ID"],
        { personaId: "test-persona", retryable: false }
      );

      const response = error.toResponse();

      expect(response.error.code).toBe("PERSONA_NOT_FOUND");
      expect(response.error.message).toBe("Persona not found: test-persona");
      expect(response.error.nextActions).toEqual(["Check persona ID"]);
      expect(response.error.context).toEqual({ personaId: "test-persona", retryable: false });
    });
  });

  describe("Helper Functions", () => {
    describe("createPersonaNotFoundError", () => {
      it("creates error with persona ID and search paths", () => {
        const error = createPersonaNotFoundError("test-persona", ["/path1", "/path2"]);

        expect(error.code).toBe(LexSonaErrorCode.PERSONA_NOT_FOUND);
        expect(error.message).toBe("Persona not found: test-persona");
        expect(error.isRetryable()).toBe(false);
        expect(error.getSuggestions().length).toBeGreaterThan(0);
        expect(error.context).toMatchObject({
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
        expect(error.isRetryable()).toBe(false);
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
        expect(error.isRetryable()).toBe(false);
        expect(error.context).toMatchObject({ dbPath: "/path/to/lex.db" });
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
        expect(error.isRetryable()).toBe(true);
        expect(error.context).toMatchObject({
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
        expect(error.isRetryable()).toBe(false);
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
        expect(error.isRetryable()).toBe(false);
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
        expect(error.isRetryable()).toBe(false);
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
        expect(error.isRetryable()).toBe(false);
      });

      it("includes nextActions when provided", () => {
        const error = createValidationError(
          LexSonaErrorCode.VALIDATION_INVALID_FORMAT,
          "Invalid format",
          ["Use correct format", "Check documentation"]
        );

        expect(error.getSuggestions()).toEqual(["Use correct format", "Check documentation"]);
      });

      it("has default nextActions when not provided", () => {
        const error = createValidationError(
          LexSonaErrorCode.VALIDATION_REQUIRED_FIELD,
          "Field is required"
        );

        // Default action provided by createValidationError
        expect(error.getSuggestions().length).toBeGreaterThan(0);
      });
    });
  });

  describe("Utility Functions", () => {
    describe("isClientError", () => {
      it("returns true for VALIDATION_ errors", () => {
        expect(isClientError(LexSonaErrorCode.VALIDATION_REQUIRED_FIELD)).toBe(true);
        expect(isClientError(LexSonaErrorCode.VALIDATION_INVALID_FORMAT)).toBe(true);
      });

      it("returns true for PERSONA_ errors", () => {
        expect(isClientError(LexSonaErrorCode.PERSONA_NOT_FOUND)).toBe(true);
        expect(isClientError(LexSonaErrorCode.PERSONA_INVALID_MANIFEST)).toBe(true);
      });

      it("returns true for RULE_ errors", () => {
        expect(isClientError(LexSonaErrorCode.RULE_VALIDATION_FAILED)).toBe(true);
        expect(isClientError(LexSonaErrorCode.RULE_SCOPE_INVALID)).toBe(true);
      });

      it("returns true for CONSTRAINT_ errors", () => {
        expect(isClientError(LexSonaErrorCode.CONSTRAINT_DERIVATION_FAILED)).toBe(true);
      });

      it("returns false for LEX_ errors", () => {
        expect(isClientError(LexSonaErrorCode.LEX_CONNECTION_FAILED)).toBe(false);
        expect(isClientError(LexSonaErrorCode.LEX_DB_NOT_FOUND)).toBe(false);
      });

      it("returns false for INTERNAL_ errors", () => {
        expect(isClientError(LexSonaErrorCode.INTERNAL_ERROR)).toBe(false);
      });
    });

    describe("formatErrorForMcp", () => {
      it("formats error with code in brackets", () => {
        const error = new LexSonaError(
          LexSonaErrorCode.PERSONA_NOT_FOUND,
          "Persona not found: test",
          ["Try a different persona"]
        );

        const formatted = formatErrorForMcp(error);
        expect(formatted).toContain("[PERSONA_NOT_FOUND]");
        expect(formatted).toContain("Persona not found: test");
      });

      it("includes nextActions when present", () => {
        const error = new LexSonaError(
          LexSonaErrorCode.PERSONA_NOT_FOUND,
          "Persona not found: test",
          ["Check ID", "Run list command"]
        );

        const formatted = formatErrorForMcp(error);
        expect(formatted).toBe(
          "[PERSONA_NOT_FOUND] Persona not found: test\nNext actions: Check ID; Run list command"
        );
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

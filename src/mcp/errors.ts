/**
 * LexSona Error Codes
 *
 * Machine-readable error codes for LexSona MCP tool responses.
 * Enables agents to implement retry logic and graceful degradation.
 *
 * @example
 * ```typescript
 * if (response.error?.code === LexSonaErrorCode.PERSONA_NOT_FOUND) {
 *   // Fall back to default persona
 * }
 * ```
 */

/**
 * Error codes for LexSona MCP operations
 *
 * Naming convention: CATEGORY_SPECIFIC_ERROR
 * - PERSONA_* : Persona loading and activation errors
 * - RULE_* : Rule validation and scoping errors
 * - CONSTRAINT_* : Constraint derivation errors
 * - LEX_* : Lex connection and database errors
 * - VALIDATION_* : Input validation errors
 * - INTERNAL_* : Unexpected internal errors
 * 
 * Note: Enum values are explicitly set to match their keys to ensure stable
 * serialization and prevent potential breaking changes from TypeScript updates.
 */
export enum LexSonaErrorCode {
  // =============================================================================
  // PERSONA ERRORS
  // =============================================================================
  /** Persona with given ID not found in any search path */
  PERSONA_NOT_FOUND = "PERSONA_NOT_FOUND",
  /** Persona ID format is invalid (must follow behavioral naming convention) */
  PERSONA_INVALID_ID = "PERSONA_INVALID_ID",
  /** Persona manifest file has invalid structure or missing required fields */
  PERSONA_INVALID_MANIFEST = "PERSONA_INVALID_MANIFEST",
  /** Failed to parse persona YAML/frontmatter */
  PERSONA_PARSE_FAILED = "PERSONA_PARSE_FAILED",

  // =============================================================================
  // RULE ERRORS
  // =============================================================================
  /** Rule validation failed (empty text, invalid severity, etc.) */
  RULE_VALIDATION_FAILED = "RULE_VALIDATION_FAILED",
  /** Rule scope is invalid or cannot be applied */
  RULE_SCOPE_INVALID = "RULE_SCOPE_INVALID",
  /** Rule text is empty or whitespace-only */
  RULE_TEXT_EMPTY = "RULE_TEXT_EMPTY",
  /** Rule category is invalid or not recognized */
  RULE_CATEGORY_INVALID = "RULE_CATEGORY_INVALID",

  // =============================================================================
  // CONSTRAINT ERRORS
  // =============================================================================
  /** Failed to derive constraints from persona and rules */
  CONSTRAINT_DERIVATION_FAILED = "CONSTRAINT_DERIVATION_FAILED",
  /** Context provided for derivation is invalid */
  CONSTRAINT_INVALID_CONTEXT = "CONSTRAINT_INVALID_CONTEXT",

  // =============================================================================
  // LEX CONNECTION ERRORS
  // =============================================================================
  /** Failed to connect to Lex database */
  LEX_CONNECTION_FAILED = "LEX_CONNECTION_FAILED",
  /** Lex database file not found at specified path */
  LEX_DB_NOT_FOUND = "LEX_DB_NOT_FOUND",
  /** Lex database missing required lexsona_behavior_rules table */
  LEX_DB_MISSING_TABLE = "LEX_DB_MISSING_TABLE",
  /** Operation requires Lex connection but not connected */
  LEX_NOT_CONNECTED = "LEX_NOT_CONNECTED",

  // =============================================================================
  // VALIDATION ERRORS (input validation)
  // =============================================================================
  /** Required parameter is missing */
  VALIDATION_REQUIRED_FIELD = "VALIDATION_REQUIRED_FIELD",
  /** Parameter has invalid format or type */
  VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",
  /** Conflicting scoping parameters provided (e.g., domain vs project with different values) */
  VALIDATION_SCOPING_CONFLICT = "VALIDATION_SCOPING_CONFLICT",
  /** Ambiguous scoping parameters that cannot be resolved deterministically */
  VALIDATION_SCOPING_AMBIGUOUS = "VALIDATION_SCOPING_AMBIGUOUS",

  // =============================================================================
  // INTERNAL ERRORS
  // =============================================================================
  /** Unexpected internal error */
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Metadata for error codes
 * Provides context about error behavior and recovery
 */
interface ErrorMetadata {
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested actions to resolve the error */
  suggestions?: string[];
  /** Additional context-specific data */
  context?: Record<string, unknown>;
}

/**
 * LexSona Error with structured code and metadata
 *
 * Extends standard Error with machine-readable code and metadata
 * that agents can use for branching logic and error recovery.
 */
export class LexSonaError extends Error {
  readonly code: LexSonaErrorCode;
  readonly metadata?: ErrorMetadata;

  constructor(code: LexSonaErrorCode, message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = "LexSonaError";
    this.code = code;
    this.metadata = metadata;
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.metadata?.retryable ?? false;
  }

  /**
   * Get suggestions for resolving this error
   */
  getSuggestions(): string[] {
    return this.metadata?.suggestions ?? [];
  }

  /**
   * Convert to MCP response error format
   */
  toResponse(): {
    error: {
      code: string;
      message: string;
      metadata?: ErrorMetadata;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.metadata && { metadata: this.metadata }),
      },
    };
  }
}

/**
 * Helper to create persona not found error with search path suggestions
 */
export function createPersonaNotFoundError(
  personaId: string,
  searchPaths: string[]
): LexSonaError {
  return new LexSonaError(
    LexSonaErrorCode.PERSONA_NOT_FOUND,
    `Persona not found: ${personaId}`,
    {
      retryable: false,
      suggestions: [
        `Check persona ID format (should be: {behavioral-focus}_{domain})`,
        `Available search paths: ${searchPaths.join(", ")}`,
        "Run 'lexsona persona list' to see available personas",
      ],
      context: { personaId, searchPaths },
    }
  );
}

/**
 * Helper to create persona manifest validation error
 */
export function createPersonaManifestError(
  filePath: string,
  validationErrors: string
): LexSonaError {
  return new LexSonaError(
    LexSonaErrorCode.PERSONA_INVALID_MANIFEST,
    `Invalid persona manifest in ${filePath}: ${validationErrors}`,
    {
      retryable: false,
      suggestions: [
        "Check YAML frontmatter syntax",
        "Ensure all required fields are present: id, version, behavior",
        "Validate against PersonaManifest schema",
      ],
      context: { filePath, validationErrors },
    }
  );
}

/**
 * Helper to create Lex database not found error
 */
export function createLexDbNotFoundError(dbPath: string): LexSonaError {
  return new LexSonaError(LexSonaErrorCode.LEX_DB_NOT_FOUND, `Database not found at ${dbPath}`, {
    retryable: false,
    suggestions: [
      "Run 'lex init' to create the database",
      "Set LEX_DB_PATH environment variable to point to existing database",
      "Check that the database file exists and is readable",
    ],
    context: { dbPath },
  });
}

/**
 * Helper to create Lex connection failed error
 */
export function createLexConnectionError(dbPath: string, reason: string): LexSonaError {
  return new LexSonaError(
    LexSonaErrorCode.LEX_CONNECTION_FAILED,
    `Failed to connect to Lex database at ${dbPath}: ${reason}`,
    {
      retryable: true,
      suggestions: [
        "Verify database file is not corrupted",
        "Check file permissions",
        "Ensure database is not locked by another process",
      ],
      context: { dbPath, reason },
    }
  );
}

/**
 * Helper to create Lex not connected error
 */
export function createLexNotConnectedError(): LexSonaError {
  return new LexSonaError(
    LexSonaErrorCode.LEX_NOT_CONNECTED,
    "Not connected to Lex database. Cannot perform this operation.",
    {
      retryable: false,
      suggestions: [
        "Ensure Lex database is initialized with 'lex init'",
        "Check LEX_DB_PATH environment variable",
        "Verify LexSona connection before calling this operation",
      ],
    }
  );
}

/**
 * Helper to create Lex missing table error
 */
export function createLexMissingTableError(dbPath: string): LexSonaError {
  return new LexSonaError(
    LexSonaErrorCode.LEX_DB_MISSING_TABLE,
    `Database at ${dbPath} is missing lexsona_behavior_rules table`,
    {
      retryable: false,
      suggestions: ["Run 'lex migrate' to update database schema"],
      context: { dbPath },
    }
  );
}

/**
 * Helper to create rule validation error
 */
export function createRuleValidationError(reason: string): LexSonaError {
  return new LexSonaError(LexSonaErrorCode.RULE_VALIDATION_FAILED, `Rule validation failed: ${reason}`, {
    retryable: false,
    suggestions: ["Check rule text is not empty", "Verify severity is one of: must, should, style"],
    context: { reason },
  });
}

/**
 * Helper to create validation error with suggestions
 */
export function createValidationError(
  code: LexSonaErrorCode,
  message: string,
  suggestions?: string[]
): LexSonaError {
  return new LexSonaError(code, message, {
    retryable: false,
    suggestions,
  });
}

/**
 * Check if an error code represents a client-side validation error
 * (as opposed to server-side internal errors)
 */
export function isClientError(code: LexSonaErrorCode): boolean {
  return (
    code.startsWith("VALIDATION_") ||
    code.startsWith("PERSONA_") ||
    code.startsWith("RULE_") ||
    code.startsWith("CONSTRAINT_")
  );
}

/**
 * Format LexSonaError for MCP error message
 * Returns enhanced message with error code and suggestions
 */
export function formatErrorForMcp(error: LexSonaError): string {
  const suggestions = error.getSuggestions();
  return `[${error.code}] ${error.message}${
    suggestions.length > 0 ? `\nSuggestions: ${suggestions.join("; ")}` : ""
  }`;
}

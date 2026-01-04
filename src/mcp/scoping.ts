/**
 * MCP Scoping Input Validation
 *
 * Validates scoping inputs. Only canonical fields are accepted.
 *
 * @module
 */

import { LexSonaError, LexSonaErrorCode } from "./errors.js";

/**
 * Scoping inputs from MCP tools (canonical fields only)
 */
export interface ScopingInput {
  /** Project context */
  project?: string;
  /** Module identifier */
  module_id?: string;
}

/**
 * @deprecated Use ScopingInput instead. Kept for type compatibility during transition.
 */
export type RawScopingInput = ScopingInput;

/**
 * Normalized scoping output (same as input - canonical fields only)
 */
export interface NormalizedScoping {
  /** Project context */
  project?: string;
  /** Module identifier */
  module_id?: string;
}

/**
 * Validates scoping inputs from MCP tools.
 *
 * Only canonical fields (project, module_id) are accepted.
 *
 * @param input - Scoping inputs (canonical fields only)
 * @returns Validated scoping
 * @throws {LexSonaError} If deprecated fields are used
 *
 * @example
 * ```typescript
 * // Valid input
 * normalizeScopingInputs({ project: "lex", module_id: "core" })
 * // => { project: "lex", module_id: "core" }
 * ```
 */
export function normalizeScopingInputs(
  input: ScopingInput & Record<string, unknown>
): NormalizedScoping {
  // Check for deprecated fields and reject them
  const deprecatedFields = ["domain", "module"].filter((f) => f in input);
  if (deprecatedFields.length > 0) {
    throw new LexSonaError(
      LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT,
      `Deprecated fields used: ${deprecatedFields.join(", ")}. Use canonical fields: 'project' (not 'domain'), 'module_id' (not 'module').`,
      [`Replace 'domain' with 'project'`, `Replace 'module' with 'module_id'`],
      { deprecatedFields, retryable: false }
    );
  }

  return {
    project: input.project,
    module_id: input.module_id,
  };
}

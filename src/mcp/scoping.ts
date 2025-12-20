/**
 * MCP Scoping Input Validation
 *
 * Validates and normalizes scoping inputs to prevent silent mis-routing.
 * Handles the mapping from deprecated fields (domain, module) to canonical
 * fields (project, module_id).
 *
 * @module
 */

import { LexSonaError, LexSonaErrorCode } from "./errors.js";

/**
 * Raw scoping inputs from MCP tools (may contain deprecated or canonical fields)
 */
export interface RawScopingInput {
  /** Deprecated: Use 'project' instead */
  domain?: string;
  /** Deprecated: Use 'module_id' instead */
  module?: string;
  /** Canonical: Project context */
  project?: string;
  /** Canonical: Module identifier */
  module_id?: string;
}

/**
 * Normalized scoping output (canonical fields only)
 */
export interface NormalizedScoping {
  /** Project context (canonical) */
  project?: string;
  /** Module identifier (canonical) */
  module_id?: string;
}

/**
 * Validates and normalizes scoping inputs from MCP tools.
 *
 * Handles the mapping from deprecated fields (domain, module) to canonical
 * fields (project, module_id). Throws if inputs are conflicting or ambiguous.
 *
 * @param input - Raw scoping inputs (may contain deprecated or canonical fields)
 * @returns Normalized scoping with canonical fields only
 * @throws {LexSonaError} If inputs are conflicting or ambiguous
 *
 * @example
 * ```typescript
 * // Using only canonical fields
 * normalizeScopingInputs({ project: "lex", module_id: "core" })
 * // => { project: "lex", module_id: "core" }
 *
 * // Using only deprecated fields
 * normalizeScopingInputs({ domain: "lex", module: "core" })
 * // => { project: "lex", module_id: "core" }
 *
 * // Using both consistently
 * normalizeScopingInputs({ domain: "lex", project: "lex", module: "core", module_id: "core" })
 * // => { project: "lex", module_id: "core" }
 *
 * // Conflicting values throw an error
 * normalizeScopingInputs({ domain: "lex", project: "lexsona" })
 * // => throws VALIDATION_SCOPING_CONFLICT
 * ```
 */
export function normalizeScopingInputs(input: RawScopingInput): NormalizedScoping {
  const normalized: NormalizedScoping = {};

  // Validate and normalize project field
  if (input.project !== undefined && input.domain !== undefined) {
    // Both provided - they must match
    if (input.project !== input.domain) {
      throw new LexSonaError(
        LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT,
        `Conflicting scoping inputs: 'project' (${input.project}) and 'domain' (${input.domain}) have different values. Use 'project' (canonical) or 'domain' (deprecated), not both with different values.`,
        {
          retryable: false,
          suggestions: [
            `Use 'project' field instead of deprecated 'domain' field`,
            `If you must use 'domain', ensure it has the same value as 'project'`,
            `Preferred: { project: "${input.project}" } (remove domain field)`,
          ],
          context: { project: input.project, domain: input.domain },
        }
      );
    }
    // They match, use the canonical field
    normalized.project = input.project;
  } else if (input.project !== undefined) {
    // Only canonical field provided
    normalized.project = input.project;
  } else if (input.domain !== undefined) {
    // Only deprecated field provided - map to canonical
    normalized.project = input.domain;
  }

  // Validate and normalize module_id field
  if (input.module_id !== undefined && input.module !== undefined) {
    // Both provided - they must match
    if (input.module_id !== input.module) {
      throw new LexSonaError(
        LexSonaErrorCode.VALIDATION_SCOPING_CONFLICT,
        `Conflicting scoping inputs: 'module_id' (${input.module_id}) and 'module' (${input.module}) have different values. Use 'module_id' (canonical) or 'module' (deprecated), not both with different values.`,
        {
          retryable: false,
          suggestions: [
            `Use 'module_id' field instead of deprecated 'module' field`,
            `If you must use 'module', ensure it has the same value as 'module_id'`,
            `Preferred: { module_id: "${input.module_id}" } (remove module field)`,
          ],
          context: { module_id: input.module_id, module: input.module },
        }
      );
    }
    // They match, use the canonical field
    normalized.module_id = input.module_id;
  } else if (input.module_id !== undefined) {
    // Only canonical field provided
    normalized.module_id = input.module_id;
  } else if (input.module !== undefined) {
    // Only deprecated field provided - map to canonical
    normalized.module_id = input.module;
  }

  return normalized;
}

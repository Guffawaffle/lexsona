/**
 * LexSona - Behavioral Memory and Persona Engine
 *
 * Public API surface for the LexSona persona engine.
 *
 * @module
 */

export { LexSona, type LexSonaConfig } from "./core/lexsona.js";
export { deriveConstraints, type DeriveContext, type ConstraintSet } from "./constraints/derive.js";
export { type Persona, type PersonaManifest } from "./persona/types.js";
export {
  type BehaviorRule,
  type CorrectionInput,
  type TrustGapEvent,
  type TrustGapFailure,
  type AgentTrustProfile,
} from "./rules/types.js";
export {
  recordTrustGap,
  getAgentTrustProfile,
  applyTrustCalibration,
} from "./rules/trust.js";

// Error codes and types for agent consumption
export {
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
} from "./mcp/errors.js";

// Re-export version
export const VERSION = "0.1.0";

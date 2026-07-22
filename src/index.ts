/**
 * LexSona - Behavioral Memory and Persona Engine
 *
 * Public API surface for the LexSona persona engine.
 *
 * @module
 */

export {
  LexSona,
  type LexSonaConfig,
  type DeriveConstraintSnapshotOptions,
} from "./core/lexsona.js";
export { deriveConstraints, type DeriveContext, type ConstraintSet } from "./constraints/derive.js";
export {
  CONSTRAINT_SNAPSHOT_V1_CONTRACT,
  CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION,
  CONSTRAINT_SNAPSHOT_V1_JSON_SCHEMA,
  ConstraintSnapshotV1Schema,
  SnapshotBindingsV1Schema,
  SnapshotScopeV1Schema,
  canonicalizeConstraintSnapshotValue,
  createConstraintSnapshotV1,
  digestConstraintSnapshotValue,
  parseConstraintSnapshotV1,
  serializeConstraintSnapshotV1,
  type ConstraintSnapshotAuthorityCeilingV1,
  type ConstraintSnapshotV1,
  type CreateConstraintSnapshotV1Input,
  type SnapshotBindingsV1,
  type SnapshotScopeV1,
} from "./constraints/snapshot.js";
export {
  deriveTokenBudget,
  getOptimalBudget,
  type TokenBudgetConstraints,
  type TokenBudgetContext,
  type BudgetHistory,
  type OptimalBudgetRecommendation,
  type DeterminismLevel,
  type AgentFamily,
  type Procedure,
} from "./constraints/token-budget.js";
export { type Persona, type PersonaManifest } from "./persona/types.js";
export {
  type BehaviorRule,
  type CorrectionInput,
  type TrustGapEvent,
  type TrustGapFailure,
  type AgentTrustProfile,
} from "./rules/types.js";
export { recordTrustGap, getAgentTrustProfile, applyTrustCalibration } from "./rules/trust.js";

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

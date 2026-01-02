/**
 * Conflicts Module - Export Public API
 *
 * @module
 */

export type {
  RulePolarity,
  RuleWithPolarity,
  ConflictSeverity,
  ConflictResolution,
  Conflict,
  ConflictDetectionResult,
} from "./types.js";

export {
  inferPolarity,
  addPolarity,
  scopesOverlap,
  determineSeverity,
  suggestResolution,
  detectConflicts,
  checkConflicts,
} from "./detector.js";

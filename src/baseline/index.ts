/**
 * Baseline Constraints Module
 *
 * Exports baseline loading functionality for LexSona.
 *
 * @module
 */

export { loadBaseline, getBaseline, clearBaselineCache, type BaselineData } from "./loader.js";

// Primary exports (canonical names)
export {
  loadPhaseConstraints,
  getPhaseConstraints,
  getPhaseConstraintsForPhase,
  getPhaseConstraintsForProcedure,
  clearPhaseConstraintsCache,
  type PhaseConstraint,
} from "./pipeline-phase-loader.js";

// Deprecated aliases for backward compatibility
export {
  loadYellowBrickConstraints,
  getYellowBrickConstraints,
  getYellowBrickConstraintsForPhase,
  getYellowBrickConstraintsForProcedure,
  clearYellowBrickCache,
  type YellowBrickConstraint,
} from "./pipeline-phase-loader.js";

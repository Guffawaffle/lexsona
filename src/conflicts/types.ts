/**
 * Conflict Detection Types
 *
 * Types for detecting contradicting behavioral rules.
 *
 * @module
 */

import type { BehaviorRule, RuleScope } from "../rules/types.js";

/**
 * Rule polarity - indicates whether a rule is prescriptive or permissive
 */
export type RulePolarity = 1 | -1;

/**
 * Rule with polarity information for conflict detection
 */
export interface RuleWithPolarity extends BehaviorRule {
  /** +1 = prescriptive, -1 = permissive/exception */
  polarity: RulePolarity;
}

/**
 * Severity level for detected conflicts
 */
export type ConflictSeverity = "high" | "medium" | "low";

/**
 * Suggested resolution for a conflict
 */
export interface ConflictResolution {
  /** Type of resolution suggested */
  type: "scope" | "prioritize" | "merge" | "remove";
  /** Human-readable description of the resolution */
  description: string;
}

/**
 * Detected conflict between two rules
 */
export interface Conflict {
  /** ID of first rule */
  ruleA: string;
  /** ID of second rule */
  ruleB: string;
  /** Category where conflict occurs */
  category: string;
  /** Severity of the conflict */
  severity: ConflictSeverity;
  /** Suggested resolution(s) */
  resolution: ConflictResolution;
  /** Scope where overlap occurs (optional) */
  scopeOverlap?: Partial<RuleScope>;
}

/**
 * Result of conflict detection
 */
export interface ConflictDetectionResult {
  /** Total number of rules analyzed */
  totalRules: number;
  /** Number of conflicts detected */
  conflictCount: number;
  /** List of detected conflicts */
  conflicts: Conflict[];
}

/**
 * Conflict Detection Engine
 *
 * Detects contradicting behavioral rules based on polarity and scope overlap.
 *
 * @module
 */

import type { BehaviorRule, RuleScope } from "../rules/types.js";
import type {
  RuleWithPolarity,
  Conflict,
  ConflictDetectionResult,
  ConflictSeverity,
  ConflictResolution,
} from "./types.js";

/**
 * Wildcard indicator for scope overlap display
 */
const SCOPE_WILDCARD = "*";

/**
 * Infer polarity from rule text using heuristics
 * Returns +1 for prescriptive rules, -1 for permissive/exception rules
 */
export function inferPolarity(rule: BehaviorRule): 1 | -1 {
  const text = rule.text.toLowerCase();

  // Negative/exception indicators
  const negativePatterns = [
    /\b(skip|avoid|don't|never|not|except|unless|may skip|optional)\b/,
    /\b(can be (omitted|skipped)|may be (omitted|skipped)|is optional|no need|unnecessary)\b/,
    /\b(for .+ only|in .+ cases)\b/, // e.g., "for hotfixes only"
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(text)) {
      return -1;
    }
  }

  // Default to prescriptive
  return 1;
}

/**
 * Add polarity information to rules
 */
export function addPolarity(rules: BehaviorRule[]): RuleWithPolarity[] {
  return rules.map((rule) => ({
    ...rule,
    polarity: inferPolarity(rule),
  }));
}

/**
 * Check if two scopes overlap (can apply to same context)
 */
export function scopesOverlap(scopeA: RuleScope, scopeB: RuleScope): boolean {
  // Helper to check if field values can overlap
  const fieldsOverlap = (
    fieldA: string | string[] | undefined,
    fieldB: string | string[] | undefined
  ): boolean => {
    // Both undefined = overlap (wildcards)
    if (fieldA === undefined && fieldB === undefined) return true;

    // One undefined = overlap (wildcard matches anything)
    if (fieldA === undefined || fieldB === undefined) return true;

    // Array handling (context_tags)
    if (Array.isArray(fieldA) && Array.isArray(fieldB)) {
      return fieldA.some((tag) => fieldB.includes(tag));
    }

    // String comparison
    if (typeof fieldA === "string" && typeof fieldB === "string") {
      return fieldA === fieldB;
    }

    return false;
  };

  // Check all scope fields
  const fields: (keyof RuleScope)[] = [
    "module_id",
    "project",
    "environment",
    "agent_family",
    "task_type",
  ];

  // If ANY field doesn't overlap, scopes are disjoint
  for (const field of fields) {
    if (!fieldsOverlap(scopeA[field], scopeB[field])) {
      return false;
    }
  }

  // Special handling for context_tags
  if (scopeA.context_tags && scopeB.context_tags) {
    if (!fieldsOverlap(scopeA.context_tags, scopeB.context_tags)) {
      return false;
    }
  }

  return true;
}

/**
 * Determine conflict severity based on rule properties
 */
export function determineSeverity(
  ruleA: RuleWithPolarity,
  ruleB: RuleWithPolarity
): ConflictSeverity {
  // High severity: both rules are "must" level
  if (ruleA.severity === "must" && ruleB.severity === "must") {
    return "high";
  }

  // Medium severity: at least one "should" level
  if (ruleA.severity === "should" || ruleB.severity === "should") {
    return "medium";
  }

  // Low severity: style conflicts
  return "low";
}

/**
 * Suggest resolution for a conflict
 */
export function suggestResolution(
  ruleA: RuleWithPolarity,
  ruleB: RuleWithPolarity
): ConflictResolution {
  const scopeA = ruleA.scope;
  const scopeB = ruleB.scope;

  // Check if scopes can be made more specific
  const hasWildcardA = !scopeA.module_id && !scopeA.project && !scopeA.task_type;
  const hasWildcardB = !scopeB.module_id && !scopeB.project && !scopeB.task_type;

  if (hasWildcardA || hasWildcardB) {
    return {
      type: "scope",
      description: "Add explicit scope to rules to separate their applicability",
    };
  }

  // If scopes are very specific, suggest prioritization
  const specificityA = [scopeA.module_id, scopeA.project, scopeA.task_type].filter(Boolean).length;
  const specificityB = [scopeB.module_id, scopeB.project, scopeB.task_type].filter(Boolean).length;

  if (specificityA >= 2 && specificityB >= 2) {
    return {
      type: "prioritize",
      description: "Choose which rule should take precedence for this context",
    };
  }

  // Default: suggest removing one
  return {
    type: "remove",
    description: "Consider removing one rule or adding context conditions",
  };
}

/**
 * Helper to calculate overlap for a single scope field
 */
function calculateFieldOverlap(
  valueA: string | undefined,
  valueB: string | undefined
): string | undefined {
  if (valueA === valueB && valueA !== undefined) {
    return valueA;
  }
  if (!valueA || !valueB) {
    return valueA || valueB || SCOPE_WILDCARD;
  }
  return undefined;
}

/**
 * Calculate scope overlap information
 */
function calculateScopeOverlap(scopeA: RuleScope, scopeB: RuleScope): Partial<RuleScope> {
  const overlap: Partial<RuleScope> = {};

  overlap.module_id = calculateFieldOverlap(scopeA.module_id, scopeB.module_id);
  overlap.project = calculateFieldOverlap(scopeA.project, scopeB.project);
  overlap.task_type = calculateFieldOverlap(scopeA.task_type, scopeB.task_type);

  return overlap;
}

/**
 * Detect conflicts between rules
 */
export function detectConflicts(rules: RuleWithPolarity[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Compare all pairs of rules
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const ruleA = rules[i];
      const ruleB = rules[j];

      // Check if rules have same category, opposite polarity, and overlapping scopes
      if (
        ruleA.category === ruleB.category &&
        ruleA.polarity !== ruleB.polarity &&
        scopesOverlap(ruleA.scope, ruleB.scope)
      ) {
        conflicts.push({
          ruleA: ruleA.rule_id,
          ruleB: ruleB.rule_id,
          category: ruleA.category,
          severity: determineSeverity(ruleA, ruleB),
          resolution: suggestResolution(ruleA, ruleB),
          scopeOverlap: calculateScopeOverlap(ruleA.scope, ruleB.scope),
        });
      }
    }
  }

  return conflicts;
}

/**
 * Main entry point for conflict detection
 */
export function checkConflicts(rules: BehaviorRule[]): ConflictDetectionResult {
  const rulesWithPolarity = addPolarity(rules);
  const conflicts = detectConflicts(rulesWithPolarity);

  return {
    totalRules: rules.length,
    conflictCount: conflicts.length,
    conflicts,
  };
}

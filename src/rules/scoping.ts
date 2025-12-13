/**
 * Rule Scoping Engine
 *
 * Filters and prioritizes rules based on context matching.
 * Implements the scope lattice from LexSona Mathematical Framework.
 *
 * Scope matching follows a hierarchical specificity model:
 * - More specific scopes (module_id + task_type) override general ones
 * - Null/undefined scope fields match any context (wildcard)
 * - Exact matches score higher than wildcards
 * - Glob patterns supported for module_id (e.g., 'cli/*', 'src/**\/types.ts')
 *
 * @module
 */

import micromatch from "micromatch";
import type { RuleScope } from "./types.js";

/**
 * Scope match result with specificity score
 */
export interface ScopeMatch {
  /** Whether the rule matches the context */
  matches: boolean;
  /** Specificity score (higher = more specific) */
  specificity: number;
  /** Fields that matched explicitly */
  matchedFields: string[];
  /** Fields that matched via glob pattern */
  globFields: string[];
  /** Fields that matched via wildcard (null in scope) */
  wildcardFields: string[];
}

/**
 * Field weights for specificity scoring
 * Higher values = more important for matching
 */
const FIELD_WEIGHTS: Record<keyof RuleScope, number> = {
  module_id: 10,
  project: 8,
  environment: 6,
  agent_family: 5,
  task_type: 4,
  context_tags: 3,
};

/**
 * Check if a single field matches
 * 
 * @param fieldName - The name of the field being matched (for special handling)
 * @param ruleValue - The value from the rule scope
 * @param contextValue - The value from the context
 */
function fieldMatches(
  fieldName: keyof RuleScope,
  ruleValue: string | string[] | undefined,
  contextValue: string | string[] | undefined
): "exact" | "glob" | "wildcard" | "mismatch" {
  // Rule field is undefined = wildcard (matches anything)
  if (ruleValue === undefined) {
    return "wildcard";
  }

  // Context field is undefined = no match possible for non-wildcard rule
  if (contextValue === undefined) {
    return "mismatch";
  }

  // Array handling (context_tags)
  if (Array.isArray(ruleValue) && Array.isArray(contextValue)) {
    // Rule tags must have at least one overlap with context tags
    const hasOverlap = ruleValue.some((tag) => contextValue.includes(tag));
    return hasOverlap ? "exact" : "mismatch";
  }

  // String comparison with glob support for module_id
  if (typeof ruleValue === "string" && typeof contextValue === "string") {
    // Exact match
    if (ruleValue === contextValue) {
      return "exact";
    }
    
    // Glob match for module_id
    if (fieldName === "module_id" && micromatch.isMatch(contextValue, ruleValue)) {
      return "glob";
    }
  }

  return "mismatch";
}

/**
 * Calculate scope match between a rule and context
 */
export function matchScope(ruleScope: RuleScope, context: RuleScope): ScopeMatch {
  const matchedFields: string[] = [];
  const globFields: string[] = [];
  const wildcardFields: string[] = [];
  let specificity = 0;

  // Check each field
  const fields: (keyof RuleScope)[] = [
    "module_id",
    "project",
    "environment",
    "agent_family",
    "task_type",
    "context_tags",
  ];

  for (const field of fields) {
    const result = fieldMatches(field, ruleScope[field], context[field]);

    if (result === "mismatch") {
      // Any mismatch = rule doesn't apply
      return {
        matches: false,
        specificity: 0,
        matchedFields: [],
        globFields: [],
        wildcardFields: [],
      };
    }

    if (result === "exact") {
      matchedFields.push(field);
      specificity += FIELD_WEIGHTS[field];
    } else if (result === "glob") {
      // Glob matches are less specific than exact matches
      globFields.push(field);
      specificity += Math.floor(FIELD_WEIGHTS[field] * 0.8);
    } else {
      // Wildcard match
      wildcardFields.push(field);
    }
  }

  return {
    matches: true,
    specificity,
    matchedFields,
    globFields,
    wildcardFields,
  };
}

/**
 * Filter rules that match a given context
 */
export function filterRulesByScope<T extends { scope: RuleScope }>(
  rules: T[],
  context: RuleScope
): T[] {
  return rules.filter((rule) => matchScope(rule.scope, context).matches);
}

/**
 * Sort rules by scope specificity (most specific first)
 */
export function sortBySpecificity<T extends { scope: RuleScope }>(
  rules: T[],
  context: RuleScope
): T[] {
  return [...rules].sort((a, b) => {
    const matchA = matchScope(a.scope, context);
    const matchB = matchScope(b.scope, context);
    return matchB.specificity - matchA.specificity;
  });
}

/**
 * Filter and sort rules by scope match
 * Returns rules that match, ordered by specificity (most specific first)
 */
export function scopeRules<T extends { scope: RuleScope }>(rules: T[], context: RuleScope): T[] {
  const matching = filterRulesByScope(rules, context);
  return sortBySpecificity(matching, context);
}

/**
 * Create a scope from partial input with sensible defaults
 */
export function createScope(input: Partial<RuleScope> = {}): RuleScope {
  return {
    module_id: input.module_id,
    task_type: input.task_type,
    environment: input.environment,
    project: input.project,
    agent_family: input.agent_family,
    context_tags: input.context_tags,
  };
}

/**
 * Check if a scope is empty (all fields undefined)
 */
export function isScopeEmpty(scope: RuleScope): boolean {
  return (
    scope.module_id === undefined &&
    scope.task_type === undefined &&
    scope.environment === undefined &&
    scope.project === undefined &&
    scope.agent_family === undefined &&
    (scope.context_tags === undefined || scope.context_tags.length === 0)
  );
}

/**
 * Merge two scopes (context overrides base)
 */
export function mergeScopes(base: RuleScope, override: RuleScope): RuleScope {
  return {
    module_id: override.module_id ?? base.module_id,
    task_type: override.task_type ?? base.task_type,
    environment: override.environment ?? base.environment,
    project: override.project ?? base.project,
    agent_family: override.agent_family ?? base.agent_family,
    context_tags:
      override.context_tags && override.context_tags.length > 0
        ? override.context_tags
        : base.context_tags,
  };
}

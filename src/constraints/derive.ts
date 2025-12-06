/**
 * Constraint Derivation Engine
 *
 * Derives constraint sets from personas + rules.
 * This is the core of LexSona - it returns constraints, never executes.
 *
 * Invariants:
 * - Derivation is pure (no side effects)
 * - Same inputs → same outputs (deterministic)
 * - No network requests during derivation
 *
 * @module
 */

import type { BehaviorRuleWithConfidence, RuleScope } from "../rules/types.js";
import type { Persona } from "../persona/types.js";

/**
 * Context for constraint derivation
 */
export interface DeriveContext {
  /** Domain filter (e.g., 'lex-pr-runner') */
  domain?: string;
  /** Module filter (e.g., 'mcp/server') */
  module_id?: string;
  /** Task type (e.g., 'implementation', 'review', 'planning') */
  taskType?: string;
  /** Environment context */
  environment?: string;
  /** Agent family */
  agent_family?: string;
  /** Additional context tags */
  context_tags?: string[];
}

/**
 * A single constraint (derived from a rule)
 */
export interface Constraint {
  /** Source rule ID */
  rule_id: string;
  /** The constraint text */
  text: string;
  /** Severity: must/should/style */
  severity: "must" | "should" | "style";
  /** Effective confidence (after decay) */
  confidence: number;
  /** Category for grouping */
  category: string;
}

/**
 * A principle (higher-level guidance, from baseline.yaml)
 */
export interface Principle {
  /** Principle ID */
  id: string;
  /** Description */
  description: string;
}

/**
 * The complete constraint set returned by deriveConstraints()
 */
export interface ConstraintSet {
  /** Active persona ID (behavioral naming) */
  personaId: string;
  /** Timestamp of derivation */
  derivedAt: string;
  /** Context used for derivation */
  context: DeriveContext;
  /** Active principles (from baseline.yaml) */
  principles: Principle[];
  /** Derived constraints (from rules) */
  constraints: Constraint[];
  /** Metadata */
  metadata: {
    /** Number of rules considered */
    rulesConsidered: number;
    /** Number of rules filtered out by scope */
    rulesFiltered: number;
    /** Minimum confidence threshold applied */
    confidenceThreshold: number;
  };
}

/**
 * Configuration for constraint derivation
 */
export interface DeriveConfig {
  /** Minimum effective confidence to include a constraint (default: 0.3) */
  confidenceThreshold?: number;
  /** Maximum constraints to return (default: 50) */
  maxConstraints?: number;
  /** Include style-level constraints (default: true) */
  includeStyle?: boolean;
}

const DEFAULT_CONFIG: Required<DeriveConfig> = {
  confidenceThreshold: 0.3,
  maxConstraints: 50,
  includeStyle: true,
};

/**
 * Check if a rule scope matches the derivation context
 * Returns true if all specified scope fields match
 */
export function scopeMatches(scope: RuleScope, context: DeriveContext): boolean {
  // Module ID - exact match if specified
  if (scope.module_id && context.module_id && scope.module_id !== context.module_id) {
    return false;
  }

  // Task type - partial match if specified
  if (scope.task_type && context.taskType) {
    if (!context.taskType.toLowerCase().includes(scope.task_type.toLowerCase())) {
      return false;
    }
  }

  // Environment - exact match if specified
  if (scope.environment && context.environment && scope.environment !== context.environment) {
    return false;
  }

  // Agent family - exact match if specified
  if (scope.agent_family && context.agent_family && scope.agent_family !== context.agent_family) {
    return false;
  }

  // Context tags - all specified tags must be present
  if (scope.context_tags && scope.context_tags.length > 0 && context.context_tags) {
    const contextTagSet = new Set(context.context_tags);
    for (const tag of scope.context_tags) {
      if (!contextTagSet.has(tag)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Derive constraints from rules and persona
 *
 * This is a PURE function - no side effects, no network requests.
 */
export function deriveConstraints(
  persona: Persona,
  rules: BehaviorRuleWithConfidence[],
  principles: Principle[],
  context: DeriveContext,
  config: DeriveConfig = {}
): ConstraintSet {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Filter rules by:
  // 1. Category matches persona's ruleCategories
  // 2. Scope matches context
  // 3. Effective confidence above threshold
  // 4. Severity level (if style excluded)
  const personaCategories = new Set(persona.ruleCategories);

  const matchingRules = rules.filter((rule) => {
    // Category check
    if (!personaCategories.has(rule.category)) {
      return false;
    }

    // Scope check
    if (!scopeMatches(rule.scope, context)) {
      return false;
    }

    // Confidence check
    if (rule.effective_confidence < cfg.confidenceThreshold) {
      return false;
    }

    // Style exclusion
    if (!cfg.includeStyle && rule.severity === "style") {
      return false;
    }

    return true;
  });

  // Sort by severity (must > should > style), then by confidence
  const severityOrder = { must: 0, should: 1, style: 2 };
  const sortedRules = matchingRules.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.effective_confidence - a.effective_confidence;
  });

  // Limit to maxConstraints
  const limitedRules = sortedRules.slice(0, cfg.maxConstraints);

  // Convert to constraints
  const constraints: Constraint[] = limitedRules.map((rule) => ({
    rule_id: rule.rule_id,
    text: rule.text,
    severity: rule.severity,
    confidence: rule.effective_confidence,
    category: rule.category,
  }));

  return {
    personaId: persona.id,
    derivedAt: new Date().toISOString(),
    context,
    principles,
    constraints,
    metadata: {
      rulesConsidered: rules.length,
      rulesFiltered: rules.length - matchingRules.length,
      confidenceThreshold: cfg.confidenceThreshold,
    },
  };
}

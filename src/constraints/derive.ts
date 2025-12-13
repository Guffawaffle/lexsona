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
 * - Offline-safe personas are enforced: if requires_memory=true and no connection, fail loud
 *
 * @module
 */

import { createHash } from "crypto";
import type { BehaviorRuleWithConfidence, RuleScope } from "../rules/types.js";
import type { Persona } from "../persona/types.js";

/**
 * Error thrown when a persona requires memory but none is available
 */
export class PersonaRequiresMemoryError extends Error {
  constructor(personaId: string) {
    super(
      `Persona "${personaId}" requires Lex memory connection, but none is available. ` +
        `Use an offline-safe persona (requires_memory: false) when disconnected.`
    );
    this.name = "PersonaRequiresMemoryError";
  }
}

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
  /** Stable hash of inputs (persona + rules + baseline + context) */
  inputHash: string;
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
    /** True if operating in offline mode (no Lex connection) */
    offlineMode: boolean;
    /** Confidence ceiling applied (if offline-safe persona) */
    confidenceCeiling?: number;
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
  /**
   * Whether a Lex memory connection is available
   * If false and persona requires_memory=true, derivation will fail
   */
  hasLexConnection?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<DeriveConfig, "hasLexConnection">> & {
  hasLexConnection: boolean;
} = {
  confidenceThreshold: 0.3,
  maxConstraints: 50,
  includeStyle: true,
  hasLexConnection: false, // Conservative default: assume disconnected
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
 * Calculate a stable hash of the inputs for derivation
 * This ensures determinism - same inputs produce same hash
 */
function calculateInputHash(
  persona: Persona,
  rules: BehaviorRuleWithConfidence[],
  principles: Principle[],
  context: DeriveContext
): string {
  // Sort rule IDs for determinism
  const ruleIds = rules.map((r) => r.rule_id).sort();
  const principleIds = principles.map((p) => p.id).sort();

  // Create a stable representation of the input
  const input = {
    personaId: persona.id,
    personaVersion: persona.version,
    ruleIds,
    principleIds,
    context: {
      domain: context.domain || "",
      module_id: context.module_id || "",
      taskType: context.taskType || "",
      environment: context.environment || "",
      agent_family: context.agent_family || "",
      context_tags: (context.context_tags || []).slice().sort(),
    },
  };

  const hash = createHash("sha256");
  hash.update(JSON.stringify(input));
  return hash.digest("hex");
}

/**
 * Derive constraints from rules and persona
 *
 * This is a PURE function - no side effects, no network requests.
 *
 * @throws {PersonaRequiresMemoryError} If persona requires memory and no Lex connection is available
 */
export function deriveConstraints(
  persona: Persona,
  rules: BehaviorRuleWithConfidence[],
  principles: Principle[],
  context: DeriveContext,
  config: DeriveConfig = {}
): ConstraintSet {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // === OFFLINE-SAFE GUARD ===
  // Hard selection rule: fail loud if persona requires memory but none available
  if (persona.requires_memory && !cfg.hasLexConnection) {
    throw new PersonaRequiresMemoryError(persona.id);
  }

  // Determine if we're in offline mode
  const isOfflineMode = !cfg.hasLexConnection;
  const confidenceCeiling =
    isOfflineMode && persona.offline_safe ? persona.offline_safe.confidence_ceiling : undefined;

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

  // Sort by severity (must > should > style), then by confidence, then by rule_id (for determinism)
  const severityOrder = { must: 0, should: 1, style: 2 };
  const sortedRules = matchingRules.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    const confidenceDiff = b.effective_confidence - a.effective_confidence;
    if (Math.abs(confidenceDiff) > 0.0001) return confidenceDiff;
    return a.rule_id.localeCompare(b.rule_id);
  });

  // Limit to maxConstraints
  const limitedRules = sortedRules.slice(0, cfg.maxConstraints);

  // Convert to constraints, applying confidence ceiling if in offline mode
  const constraints: Constraint[] = limitedRules.map((rule) => ({
    rule_id: rule.rule_id,
    text: rule.text,
    severity: rule.severity,
    confidence:
      confidenceCeiling !== undefined
        ? Math.min(rule.effective_confidence, confidenceCeiling)
        : rule.effective_confidence,
    category: rule.category,
  }));

  // Calculate stable input hash
  const inputHash = calculateInputHash(persona, rules, principles, context);

  return {
    personaId: persona.id,
    derivedAt: new Date().toISOString(),
    inputHash,
    context,
    principles,
    constraints,
    metadata: {
      rulesConsidered: rules.length,
      rulesFiltered: rules.length - matchingRules.length,
      confidenceThreshold: cfg.confidenceThreshold,
      offlineMode: isOfflineMode,
      confidenceCeiling,
    },
  };
}

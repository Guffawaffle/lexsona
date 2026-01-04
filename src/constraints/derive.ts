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
import micromatch from "micromatch";
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
  /** Domain filter (e.g., 'lexrunner') */
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
  /** Procedure for scope constraint overrides */
  procedure?: string;
  /** Files in scope for constraint filtering (optional) */
  files?: string[];
}

export type ConstraintSource = "baseline" | "persona" | "learned";

/**
 * Provenance information for a constraint
 * Tracks why and how a constraint is active
 */
export interface ConstraintProvenance {
  /** Source type: persona duty, learned rule, or baseline principle */
  source: ConstraintSource;
  /** Rule ID if source is "learned", null otherwise */
  rule_id: string | null;
  /** Effective confidence value */
  confidence: number;
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
  /** Where this constraint came from (currently: derived from learned behavioral rules) */
  source?: ConstraintSource;
  /** Provenance information explaining why this constraint is active */
  provenance?: ConstraintProvenance;
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
  /** Rule version at time of derivation (for cache invalidation) */
  ruleVersion?: number;
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

/**
 * Floating-point tolerance for confidence comparison
 * Used to ensure deterministic sorting when confidences are effectively equal
 */
const CONFIDENCE_EPSILON = 0.0001;

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
 *
 * Supports glob patterns for module_id (e.g., 'cli/*', 'src/ ** /types.ts')
 * Domain/project matching: context.domain is matched against scope.project
 * (domain is deprecated alias for project, consulted when project is absent)
 */
export function scopeMatches(scope: RuleScope, context: DeriveContext): boolean {
  // Module ID - glob pattern match if specified
  if (scope.module_id && context.module_id) {
    // Use micromatch for glob support
    if (!micromatch.isMatch(context.module_id, scope.module_id)) {
      return false;
    }
  }

  // Domain/Project - match context.domain against scope.project
  // domain is a deprecated alias for project
  // When context.domain is undefined, treat as wildcard (matches any scope.project)
  if (scope.project && context.domain) {
    if (scope.project !== context.domain) {
      return false;
    }
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
 * Calculate scope specificity score for priority ordering
 * Higher score = more specific scope
 *
 * Priority ordering: module > domain/project > taskType > global
 */
export function calculateScopeSpecificity(scope: RuleScope, context: DeriveContext): number {
  let score = 0;

  // Module ID has highest weight (10 points)
  // Glob patterns are less specific than exact matches
  if (scope.module_id && context.module_id) {
    if (micromatch.isMatch(context.module_id, scope.module_id)) {
      // Check if it's an exact match vs glob
      if (scope.module_id === context.module_id) {
        score += 10; // Exact match
      } else {
        score += 8; // Glob match (less specific)
      }
    }
  }

  // Domain/Project has second highest weight (8 points)
  if (scope.project && context.domain && scope.project === context.domain) {
    score += 8;
  }

  // Task type has medium weight (4 points)
  if (scope.task_type && context.taskType) {
    if (context.taskType.toLowerCase().includes(scope.task_type.toLowerCase())) {
      score += 4;
    }
  }

  // Environment has lower weight (3 points)
  if (scope.environment && context.environment && scope.environment === context.environment) {
    score += 3;
  }

  // Agent family has lower weight (2 points)
  if (scope.agent_family && context.agent_family && scope.agent_family === context.agent_family) {
    score += 2;
  }

  // Context tags have lowest weight (1 point per matching tag)
  if (scope.context_tags && scope.context_tags.length > 0 && context.context_tags) {
    const contextTagSet = new Set(context.context_tags);
    for (const tag of scope.context_tags) {
      if (contextTagSet.has(tag)) {
        score += 1;
      }
    }
  }

  return score;
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

  // Include constraint pack IDs in hash for cache invalidation
  const constraintPackIds: string[] = [];
  if (persona.constraints) {
    for (const [packName, constraints] of Object.entries(persona.constraints)) {
      for (const constraint of constraints) {
        constraintPackIds.push(`${packName}:${constraint.id}`);
      }
    }
    constraintPackIds.sort();
  }

  // Create a stable representation of the input
  const input = {
    personaId: persona.id,
    personaVersion: persona.version,
    ruleIds,
    principleIds,
    constraintPackIds,
    context: {
      domain: context.domain || "",
      module_id: context.module_id || "",
      taskType: context.taskType || "",
      environment: context.environment || "",
      agent_family: context.agent_family || "",
      context_tags: (context.context_tags || []).slice().sort(),
      files: (context.files || []).slice().sort(),
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

  // Sort by:
  // 1. Scope specificity (most specific first)
  // 2. Severity (must > should > style)
  // 3. Effective confidence (higher first)
  // 4. Rule ID (for determinism when other factors are equal)
  const severityOrder = { must: 0, should: 1, style: 2 };
  const sortedRules = matchingRules.sort((a, b) => {
    // First, compare scope specificity
    const specificityA = calculateScopeSpecificity(a.scope, context);
    const specificityB = calculateScopeSpecificity(b.scope, context);
    const specificityDiff = specificityB - specificityA;
    if (specificityDiff !== 0) return specificityDiff;

    // Then severity
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Then confidence (with epsilon for floating-point tolerance)
    const confidenceDiff = b.effective_confidence - a.effective_confidence;
    if (Math.abs(confidenceDiff) > CONFIDENCE_EPSILON) return confidenceDiff;

    // Finally rule_id for determinism
    return a.rule_id.localeCompare(b.rule_id);
  });

  // Limit to maxConstraints
  const limitedRules = sortedRules.slice(0, cfg.maxConstraints);

  // Convert to constraints, applying confidence ceiling if in offline mode
  const constraints: Constraint[] = limitedRules.map((rule) => {
    const effectiveConfidence =
      confidenceCeiling !== undefined
        ? Math.min(rule.effective_confidence, confidenceCeiling)
        : rule.effective_confidence;
    return {
      rule_id: rule.rule_id,
      text: rule.text,
      severity: rule.severity,
      confidence: effectiveConfidence,
      category: rule.category,
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: rule.rule_id,
        confidence: effectiveConfidence,
      },
    };
  });

  // === PERSONA DUTIES → CONSTRAINTS ===
  // Convert persona duties (mustDo, shouldDo, mustNotDo) to constraints
  // Duties are optional - some test personas or minimal personas may not have them
  const personaConstraints: Constraint[] = [];
  const duties = persona.duties ?? { mustDo: [], mustNotDo: [] };

  // mustDo → severity: must, confidence: 1.0 (authoritative)
  if (duties.mustDo && duties.mustDo.length > 0) {
    for (const duty of duties.mustDo) {
      personaConstraints.push({
        rule_id: `persona:${persona.id}:must:${duty.slice(0, 20).replace(/\s+/g, "-")}`,
        text: duty,
        severity: "must",
        confidence: 1.0,
        category: "persona-duty",
        source: "persona",
        provenance: {
          source: "persona",
          rule_id: null,
          confidence: 1.0,
        },
      });
    }
  }

  // shouldDo → severity: should, confidence: 1.0 (authoritative)
  if (duties.shouldDo && duties.shouldDo.length > 0) {
    for (const duty of duties.shouldDo) {
      personaConstraints.push({
        rule_id: `persona:${persona.id}:should:${duty.slice(0, 20).replace(/\s+/g, "-")}`,
        text: duty,
        severity: "should",
        confidence: 1.0,
        category: "persona-duty",
        source: "persona",
        provenance: {
          source: "persona",
          rule_id: null,
          confidence: 1.0,
        },
      });
    }
  }

  // mustNotDo → severity: must, confidence: 1.0 (inverted - "Do not X")
  // We prefix with "Do not" to make it clear this is a prohibition
  if (duties.mustNotDo && duties.mustNotDo.length > 0) {
    for (const duty of duties.mustNotDo) {
      // If the duty already starts with "not" or "never", use as-is
      const text =
        duty.toLowerCase().startsWith("not ") || duty.toLowerCase().startsWith("never ")
          ? duty
          : `Do not: ${duty}`;
      personaConstraints.push({
        rule_id: `persona:${persona.id}:must-not:${duty.slice(0, 20).replace(/\s+/g, "-")}`,
        text,
        severity: "must",
        confidence: 1.0,
        category: "persona-duty",
        source: "persona",
        provenance: {
          source: "persona",
          rule_id: null,
          confidence: 1.0,
        },
      });
    }
  }

  // === PERSONA CONSTRAINT PACKS → CONSTRAINTS ===
  // Convert persona constraint packs to constraints
  // Apply file scope filtering if context.files is provided
  if (persona.constraints) {
    for (const [packName, packConstraints] of Object.entries(persona.constraints)) {
      for (const constraint of packConstraints) {
        // Filter by file scope if files are provided in context
        let includeConstraint = true;
        if (context.files && context.files.length > 0) {
          // Check if any of the context files matches the constraint's appliesTo patterns
          includeConstraint = context.files.some((file) =>
            micromatch.isMatch(file, constraint.appliesTo)
          );
        }

        if (includeConstraint) {
          // Map severity: error → must, warning → should, info → style
          const severityMap: Record<string, "must" | "should" | "style"> = {
            error: "must",
            warning: "should",
            info: "style",
          };
          const severity = severityMap[constraint.severity] || "should";

          personaConstraints.push({
            rule_id: `persona:${persona.id}:pack:${packName}:${constraint.id}`,
            text: constraint.statement,
            severity,
            confidence: 1.0,
            category: `constraint-pack:${packName}`,
            source: "persona",
            provenance: {
              source: "persona",
              rule_id: null,
              confidence: 1.0,
            },
          });
        }
      }
    }
  }

  // Merge: persona constraints come first (highest priority), then learned rules
  const allConstraints = [...personaConstraints, ...constraints];

  // Calculate stable input hash
  const inputHash = calculateInputHash(persona, rules, principles, context);

  return {
    personaId: persona.id,
    derivedAt: new Date().toISOString(),
    inputHash,
    context,
    principles,
    constraints: allConstraints,
    metadata: {
      rulesConsidered: rules.length,
      rulesFiltered: rules.length - matchingRules.length,
      confidenceThreshold: cfg.confidenceThreshold,
      offlineMode: isOfflineMode,
      confidenceCeiling,
    },
  };
}

/**
 * Scope constraints result for LexRunner integration
 */
export interface DerivedScopeConstraints {
  read_globs: string[];
  write_globs: string[];
  deny_globs: string[];
  cross_repo_allowed: boolean;
}

/**
 * Derive scope constraints from active persona
 *
 * Merge logic:
 * 1. Start with persona defaults
 * 2. Apply procedure override if provided
 * 3. deny_globs are never modified by overrides (safety constraint)
 *
 * @param persona - Active persona
 * @param procedure - Optional procedure for overrides (e.g., 'post-merge-fix')
 * @returns Derived scope constraints
 */
export function deriveScopeConstraints(
  persona: Persona,
  procedure?: string
): DerivedScopeConstraints {
  const base = persona.scope_constraints ?? {
    read_globs: ["**/*"],
    write_globs: [],
    deny_globs: ["node_modules/**", "dist/**", ".git/**", "*.lock"],
    cross_repo_allowed: false,
  };

  // Start with defaults
  const result: DerivedScopeConstraints = {
    read_globs: [...base.read_globs],
    write_globs: [...base.write_globs],
    deny_globs: [...base.deny_globs],
    cross_repo_allowed: base.cross_repo_allowed,
  };

  // Apply procedure override if exists
  if (procedure && base.overrides?.[procedure]) {
    const override = base.overrides[procedure];
    if (override.read_globs) result.read_globs = override.read_globs;
    if (override.write_globs) result.write_globs = override.write_globs;
    if (override.cross_repo_allowed !== undefined) {
      result.cross_repo_allowed = override.cross_repo_allowed;
    }
    // NOTE: deny_globs cannot be overridden - always union
  }

  return result;
}

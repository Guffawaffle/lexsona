/**
 * Constraint Explanation Engine
 *
 * Generates natural language explanations for why constraints are active.
 * Converts technical constraint derivation metadata into human-readable narratives.
 *
 * @module
 */

import type { ConstraintSet, Constraint, ConstraintProvenance } from "./derive.js";

/**
 * Type of explanation reason
 */
export type ExplanationReasonType =
  | "learned"
  | "baseline"
  | "persona"
  | "scope-match"
  | "confidence";

/**
 * Evidence supporting an explanation reason
 */
export interface ExplanationEvidence {
  /** Number of times this pattern was corrected */
  correctionCount?: number;
  /** Last correction timestamp (ISO 8601) */
  lastCorrected?: string;
  /** Persona name for persona-based constraints */
  personaName?: string;
  /** Baseline file or principle source */
  baselineSource?: string;
  /** Scope pattern that matched */
  scopePattern?: string;
  /** Confidence value */
  confidenceValue?: number;
  /** Confidence threshold */
  confidenceThreshold?: number;
}

/**
 * A single reason explaining why a constraint is active
 */
export interface ExplanationReason {
  /** Type of reason */
  type: ExplanationReasonType;
  /** Source identifier (rule ID, baseline file, etc.) */
  source: string;
  /** Human-readable narrative explanation */
  narrative: string;
  /** Weight/importance of this reason (0-1) */
  weight: number;
  /** Supporting evidence */
  evidence?: ExplanationEvidence;
}

/**
 * Confidence level for explanation
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Complete explanation for a constraint
 */
export interface ConstraintExplanation {
  /** Constraint ID being explained */
  constraintId: string;
  /** The constraint statement */
  constraintStatement: string;
  /** Severity level */
  severity: "must" | "should" | "style";
  /** Category */
  category: string;
  /** List of reasons why this constraint is active */
  reasons: ExplanationReason[];
  /** Overall confidence level */
  confidence: ConfidenceLevel;
  /** Derivation context that matched */
  matchedContext?: {
    domain?: string;
    module_id?: string;
    taskType?: string;
  };
  /** When this constraint was derived */
  derivedAt: string;
}

/**
 * Determine confidence level based on numeric confidence value
 */
function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

/**
 * Generate explanation for a constraint
 *
 * @param constraint - The constraint to explain
 * @param constraintSet - The full constraint set it belongs to
 * @returns Complete explanation with natural language narratives
 */
export function explainConstraint(
  constraint: Constraint,
  constraintSet: ConstraintSet
): ConstraintExplanation {
  const reasons: ExplanationReason[] = [];

  // 1. Persona reason (if persona-derived or category match)
  if (constraint.source === "persona") {
    reasons.push({
      type: "persona",
      source: constraintSet.personaId,
      narrative: `The "${constraintSet.personaId}" persona explicitly requires this`,
      weight: 1.0,
      evidence: {
        personaName: constraintSet.personaId,
      },
    });
  } else {
    // Learned rules still need to match persona categories
    reasons.push({
      type: "persona",
      source: constraintSet.personaId,
      narrative: `The "${constraintSet.personaId}" persona includes the "${constraint.category}" category`,
      weight: 0.8,
      evidence: {
        personaName: constraintSet.personaId,
      },
    });
  }

  // 2. Learned rule reason (with correction history if available)
  if (constraint.source === "learned" && constraint.provenance?.rule_id) {
    // For learned rules, we'd ideally query Lex for correction history
    // For now, we indicate it's learned from behavioral memory
    reasons.push({
      type: "learned",
      source: constraint.rule_id,
      narrative: `This pattern was learned from your behavioral corrections`,
      weight: constraint.confidence,
      evidence: {
        // In a full implementation, we'd query Lex for:
        // correctionCount: <count from Lex>,
        // lastCorrected: <timestamp from Lex>
      },
    });
  }

  // 3. Baseline reason (if from baseline principles)
  if (constraint.source === "baseline") {
    reasons.push({
      type: "baseline",
      source: constraint.rule_id,
      narrative: `Required by the baseline guidance for this domain`,
      weight: 1.0,
      evidence: {
        baselineSource: constraint.rule_id,
      },
    });
  }

  // 4. Scope matching reason (if context has scope fields)
  const hasScope = constraintSet.context.domain || constraintSet.context.module_id;
  if (hasScope) {
    const scopeParts: string[] = [];
    if (constraintSet.context.domain) {
      scopeParts.push(`project: ${constraintSet.context.domain}`);
    }
    if (constraintSet.context.module_id) {
      scopeParts.push(`module: ${constraintSet.context.module_id}`);
    }
    if (constraintSet.context.taskType) {
      scopeParts.push(`task: ${constraintSet.context.taskType}`);
    }

    reasons.push({
      type: "scope-match",
      source: scopeParts.join(", "),
      narrative: `Matches your current scope (${scopeParts.join(", ")})`,
      weight: 0.6,
      evidence: {
        scopePattern: scopeParts.join(", "),
      },
    });
  }

  // 5. Confidence reason
  const confidenceThreshold = constraintSet.metadata.confidenceThreshold;
  reasons.push({
    type: "confidence",
    source: "threshold",
    narrative: `Confidence ${constraint.confidence.toFixed(2)} exceeds threshold ${confidenceThreshold.toFixed(2)}`,
    weight: constraint.confidence,
    evidence: {
      confidenceValue: constraint.confidence,
      confidenceThreshold: confidenceThreshold,
    },
  });

  // Build matched context
  const matchedContext: ConstraintExplanation["matchedContext"] = {};
  if (constraintSet.context.domain) matchedContext.domain = constraintSet.context.domain;
  if (constraintSet.context.module_id) matchedContext.module_id = constraintSet.context.module_id;
  if (constraintSet.context.taskType) matchedContext.taskType = constraintSet.context.taskType;

  return {
    constraintId: constraint.rule_id,
    constraintStatement: constraint.text,
    severity: constraint.severity,
    category: constraint.category,
    reasons,
    confidence: getConfidenceLevel(constraint.confidence),
    matchedContext: Object.keys(matchedContext).length > 0 ? matchedContext : undefined,
    derivedAt: constraintSet.derivedAt,
  };
}

/**
 * Generate explanations for all constraints in a set
 *
 * @param constraintSet - The constraint set to explain
 * @returns Array of explanations, one per constraint
 */
export function explainAllConstraints(constraintSet: ConstraintSet): ConstraintExplanation[] {
  return constraintSet.constraints.map((constraint) =>
    explainConstraint(constraint, constraintSet)
  );
}

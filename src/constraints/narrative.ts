/**
 * Natural Language Narrative Formatters
 *
 * Formats constraint explanations as human-readable prose.
 * Provides multiple output formats (prose, structured).
 *
 * @module
 */

import type { ConstraintExplanation, ExplanationReason } from "./explainer.js";

/**
 * Format a single explanation reason as prose
 */
function formatReasonProse(reason: ExplanationReason): string {
  return reason.narrative;
}

/**
 * Format a single constraint explanation as prose
 *
 * @param explanation - The constraint explanation
 * @param index - Optional index for numbering (1-based)
 * @returns Formatted prose string
 */
export function formatExplanationProse(explanation: ConstraintExplanation, index?: number): string {
  const lines: string[] = [];

  // Header with numbering if provided
  const header = index !== undefined ? `${index}. ` : "";
  lines.push(`${header}${explanation.constraintId} (confidence: ${explanation.confidence})`);
  lines.push(`   "${explanation.constraintStatement}"`);
  lines.push("");
  lines.push("   Why active:");

  // Format each reason with a bullet point
  for (const reason of explanation.reasons) {
    lines.push(`   • ${formatReasonProse(reason)}`);
  }

  // Add matched context if present
  if (explanation.matchedContext) {
    const contextParts: string[] = [];
    if (explanation.matchedContext.domain) {
      contextParts.push(explanation.matchedContext.domain);
    }
    if (explanation.matchedContext.module_id) {
      contextParts.push(explanation.matchedContext.module_id);
    }
    if (explanation.matchedContext.taskType) {
      contextParts.push(explanation.matchedContext.taskType);
    }
    if (contextParts.length > 0) {
      lines.push(`   • Scope: ${contextParts.join(" / ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format multiple constraint explanations as prose
 *
 * @param explanations - Array of constraint explanations
 * @param title - Optional title for the output
 * @returns Formatted prose string
 */
export function formatAllExplanationsProse(
  explanations: ConstraintExplanation[],
  title: string = "📋 Active Constraints"
): string {
  const lines: string[] = [];

  lines.push(title);
  lines.push("═".repeat(title.length));
  lines.push("");

  if (explanations.length === 0) {
    lines.push("No active constraints.");
    lines.push("(Use 'lexsona constraints derive' to derive constraints)");
  } else {
    for (let i = 0; i < explanations.length; i++) {
      lines.push(formatExplanationProse(explanations[i], i + 1));
      if (i < explanations.length - 1) {
        lines.push(""); // Blank line between constraints
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format constraint explanation as structured JSON
 *
 * @param explanation - The constraint explanation
 * @returns JSON-serializable object
 */
export function formatExplanationJson(explanation: ConstraintExplanation): object {
  return {
    constraintId: explanation.constraintId,
    statement: explanation.constraintStatement,
    severity: explanation.severity,
    category: explanation.category,
    confidence: explanation.confidence,
    reasons: explanation.reasons.map((reason) => ({
      type: reason.type,
      source: reason.source,
      narrative: reason.narrative,
      weight: reason.weight,
      evidence: reason.evidence,
    })),
    matchedContext: explanation.matchedContext,
    derivedAt: explanation.derivedAt,
  };
}

/**
 * Format multiple constraint explanations as JSON
 *
 * @param explanations - Array of constraint explanations
 * @returns JSON-serializable object
 */
export function formatAllExplanationsJson(explanations: ConstraintExplanation[]): object {
  return {
    version: 1,
    count: explanations.length,
    explanations: explanations.map(formatExplanationJson),
  };
}

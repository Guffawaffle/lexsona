/**
 * MCP Output Formatters (AX-009, AX-010)
 *
 * Utilities for compact formatting of MCP responses to reduce payload size
 * for small-context agents.
 *
 * @module
 */

import type { Constraint, Principle, ConstraintProvenance } from "../constraints/derive.js";

export type OutputFormat = "full" | "compact";
export type ProvenanceMode = "full" | "compact";

/**
 * Compact provenance representation (AX-010)
 * Uses single-char source codes and abbreviated field names
 */
export interface CompactProvenance {
  /** Source: 'p' (persona), 'r' (rule/learned), 'b' (baseline) */
  src: "p" | "r" | "b";
  /** Weight/confidence (0-1, rounded to 2 decimals) */
  w: number;
  /** Rule ID if source is 'r' (rule) */
  rId?: string;
}

/**
 * Compact constraint representation
 * Omits full text to minimize payload - use constraint_id for lookups
 */
export interface CompactConstraint {
  id: string;
  sev: "m" | "s" | "st";
  conf: number;
  cat: string;
  src?: string;
  /** Compact provenance (AX-010) */
  prov?: CompactProvenance;
}

/**
 * Compact principle representation
 */
export interface CompactPrinciple {
  id: string;
  desc: string;
}

/**
 * Format provenance based on mode (AX-010)
 * In compact mode, uses single-char source codes and abbreviated fields
 */
export function formatProvenance(
  provenance: ConstraintProvenance | undefined,
  mode: ProvenanceMode
): ConstraintProvenance | CompactProvenance | undefined {
  if (!provenance) {
    return undefined;
  }

  if (mode === "compact") {
    // Map source to single-char code
    const sourceCode = provenance.source === "persona" ? "p" : 
                      provenance.source === "learned" ? "r" : "b";
    
    const compact: CompactProvenance = {
      src: sourceCode,
      w: Math.round(provenance.confidence * 100) / 100, // Round to 2 decimals
    };

    // Only include rId for learned rules
    if (provenance.source === "learned" && provenance.rule_id) {
      compact.rId = provenance.rule_id;
    }

    return compact;
  }

  return provenance;
}

/**
 * Format a constraint based on output format
 * In compact mode, omits full text to reduce payload size
 * Use constraints_explain tool to get full details for specific constraints
 */
export function formatConstraint(
  c: Constraint,
  format: OutputFormat,
  provenanceMode?: ProvenanceMode
): Constraint | CompactConstraint {
  // Use format as provenanceMode default if not specified
  const provMode = provenanceMode ?? format;

  if (format === "compact") {
    const compact: CompactConstraint = {
      id: c.rule_id,
      sev: c.severity === "must" ? "m" : c.severity === "should" ? "s" : "st",
      conf: Math.round(c.confidence * 100) / 100, // Round to 2 decimals
      cat: c.category,
      ...(c.source && { src: c.source }),
    };

    // Add provenance if available
    const formattedProv = formatProvenance(c.provenance, provMode);
    if (formattedProv) {
      compact.prov = formattedProv as CompactProvenance;
    }

    return compact;
  }

  // For full format, still apply provenance mode if specified
  if (provMode === "compact" && c.provenance) {
    return {
      ...c,
      provenance: formatProvenance(c.provenance, provMode) as CompactProvenance | ConstraintProvenance,
    };
  }

  return c;
}

/**
 * Format a principle based on output format
 */
export function formatPrinciple(
  p: Principle,
  format: OutputFormat
): Principle | CompactPrinciple {
  if (format === "compact") {
    return {
      id: p.id,
      desc: p.description,
    };
  }
  return p;
}

/**
 * Format an array of constraints
 */
export function formatConstraints(
  constraints: Constraint[],
  format: OutputFormat,
  provenanceMode?: ProvenanceMode
): (Constraint | CompactConstraint)[] {
  return constraints.map((c) => formatConstraint(c, format, provenanceMode));
}

/**
 * Format an array of principles
 */
export function formatPrinciples(
  principles: Principle[],
  format: OutputFormat
): (Principle | CompactPrinciple)[] {
  return principles.map((p) => formatPrinciple(p, format));
}

/**
 * Add compact mode flag to response if in compact mode
 */
export function addCompactFlag(
  response: Record<string, unknown>,
  format: OutputFormat
): Record<string, unknown> {
  if (format === "compact") {
    return {
      ...response,
      _compact: true,
    };
  }
  return response;
}

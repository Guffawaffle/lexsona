/**
 * MCP Output Formatters (AX-009)
 *
 * Utilities for compact formatting of MCP responses to reduce payload size
 * for small-context agents.
 *
 * @module
 */

import type { Constraint, Principle } from "../constraints/derive.js";

export type OutputFormat = "full" | "compact";

/**
 * Compact constraint representation
 */
export interface CompactConstraint {
  id: string;
  txt: string;
  sev: "m" | "s" | "st";
  conf: number;
  cat: string;
  src?: string;
}

/**
 * Compact principle representation
 */
export interface CompactPrinciple {
  id: string;
  desc: string;
}

/**
 * Format a constraint based on output format
 */
export function formatConstraint(
  c: Constraint,
  format: OutputFormat
): Constraint | CompactConstraint {
  if (format === "compact") {
    return {
      id: c.rule_id,
      txt: c.text,
      sev: c.severity === "must" ? "m" : c.severity === "should" ? "s" : "st",
      conf: Math.round(c.confidence * 100) / 100, // Round to 2 decimals
      cat: c.category,
      ...(c.source && { src: c.source }),
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
  format: OutputFormat
): (Constraint | CompactConstraint)[] {
  return constraints.map((c) => formatConstraint(c, format));
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
  response: Record<string, any>,
  format: OutputFormat
): Record<string, any> {
  if (format === "compact") {
    return {
      ...response,
      _compact: true,
    };
  }
  return response;
}

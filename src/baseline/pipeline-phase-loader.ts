/**
 * Pipeline Phase Constraints Loader
 *
 * Loads phase-specific constraints for the replayable analysis pipeline.
 * These constraints are activated based on the procedure context.
 *
 * @module
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Constraint } from "../constraints/derive.js";

/**
 * Raw phase rule from YAML
 */
interface PhaseRule {
  id: string;
  phase: "D0" | "D1" | "D2" | "D3" | "D4";
  text: string;
  severity: "must" | "should" | "style";
  category: string;
  scope?: {
    procedure?: string;
    module_id?: string;
    domain?: string;
  };
}

/**
 * Raw YAML structure for phase constraints
 */
interface PhaseConstraintsYaml {
  version: number;
  rules: PhaseRule[];
}

/**
 * Phase constraint with pipeline phase information
 */
export interface PhaseConstraint extends Constraint {
  /** Pipeline phase this constraint applies to */
  phase: "D0" | "D1" | "D2" | "D3" | "D4";
  /** Scope for filtering */
  scope?: {
    procedure?: string;
    module_id?: string;
    domain?: string;
  };
}

/**
 * Get path to bundled pipeline-phase-constraints.yaml
 */
function getBundledPhaseConstraintsPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // In dist, YAML is copied alongside loader.js
  const distPath = join(currentDir, "pipeline-phase-constraints.yaml");
  if (existsSync(distPath)) {
    return distPath;
  }

  // In src, it's in the same directory
  const srcPath = join(currentDir, "pipeline-phase-constraints.yaml");
  if (existsSync(srcPath)) {
    return srcPath;
  }

  // Optional: Phase constraints may not be installed
  return "";
}

/**
 * Load pipeline phase constraints
 *
 * @param customPath - Optional custom path to YAML file
 * @returns Array of phase constraints (empty if file not found)
 */
export function loadPhaseConstraints(customPath?: string): PhaseConstraint[] {
  const path = customPath ?? getBundledPhaseConstraintsPath();

  if (!path || !existsSync(path)) {
    // Phase constraints are optional
    return [];
  }

  const content = readFileSync(path, "utf-8");
  const yaml = parseYaml(content) as PhaseConstraintsYaml;

  if (yaml.version !== 1) {
    throw new Error(`Unsupported phase constraints version: ${yaml.version}`);
  }

  return (yaml.rules ?? []).map((rule) => ({
    rule_id: `phase:${rule.id}`,
    phase: rule.phase,
    text: rule.text,
    severity: rule.severity,
    confidence: 1.0, // Phase constraints are always fully confident
    category: rule.category,
    source: "baseline" as const,
    scope: rule.scope,
    provenance: {
      source: "baseline" as const,
      rule_id: `phase:${rule.id}`,
      confidence: 1.0,
    },
  }));
}

/**
 * Get phase constraints for a specific procedure
 *
 * @param procedure - The procedure name (e.g., 'fanout_harvest', 'fanout_analyze')
 * @returns Filtered constraints applicable to this procedure
 */
export function getPhaseConstraintsForProcedure(procedure: string): PhaseConstraint[] {
  const allConstraints = loadPhaseConstraints();

  return allConstraints.filter((c) => {
    if (!c.scope?.procedure) {
      // No scope means always applicable
      return true;
    }
    return c.scope.procedure === procedure;
  });
}

/**
 * Get phase constraints for a specific phase
 *
 * @param phase - The pipeline phase (D0, D1, D2, D3, D4)
 * @returns Filtered constraints for this phase
 */
export function getPhaseConstraintsForPhase(
  phase: "D0" | "D1" | "D2" | "D3" | "D4"
): PhaseConstraint[] {
  const allConstraints = loadPhaseConstraints();
  return allConstraints.filter((c) => c.phase === phase);
}

/**
 * Cached phase constraints
 */
let cachedConstraints: PhaseConstraint[] | null = null;

/**
 * Get cached phase constraints or load them
 */
export function getPhaseConstraints(customPath?: string): PhaseConstraint[] {
  if (!cachedConstraints || customPath) {
    cachedConstraints = loadPhaseConstraints(customPath);
  }
  return cachedConstraints;
}

/**
 * Clear the phase constraints cache (for testing)
 */
export function clearPhaseConstraintsCache(): void {
  cachedConstraints = null;
}

// =============================================
// DEPRECATED: Backward-compatible aliases
// These will be removed in a future version
// =============================================

/** @deprecated Use PhaseConstraint instead */
export type YellowBrickConstraint = PhaseConstraint;

/** @deprecated Use loadPhaseConstraints instead */
export const loadYellowBrickConstraints = loadPhaseConstraints;

/** @deprecated Use getPhaseConstraints instead */
export const getYellowBrickConstraints = getPhaseConstraints;

/** @deprecated Use getPhaseConstraintsForPhase instead */
export const getYellowBrickConstraintsForPhase = getPhaseConstraintsForPhase;

/** @deprecated Use getPhaseConstraintsForProcedure instead */
export const getYellowBrickConstraintsForProcedure = getPhaseConstraintsForProcedure;

/** @deprecated Use clearPhaseConstraintsCache instead */
export const clearYellowBrickCache = clearPhaseConstraintsCache;

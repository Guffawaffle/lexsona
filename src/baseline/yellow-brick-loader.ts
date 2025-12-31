/**
 * Yellow Brick Phase Constraints Loader
 *
 * Loads phase-specific constraints for the Yellow Brick pipeline.
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
 * Raw Yellow Brick rule from YAML
 */
interface YellowBrickRule {
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
 * Raw Yellow Brick YAML structure
 */
interface YellowBrickYaml {
  version: number;
  rules: YellowBrickRule[];
}

/**
 * Yellow Brick constraint with phase information
 */
export interface YellowBrickConstraint extends Constraint {
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
 * Get path to bundled yellow-brick-constraints.yaml
 */
function getBundledYellowBrickPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // In dist, YAML is copied alongside loader.js
  const distPath = join(currentDir, "yellow-brick-constraints.yaml");
  if (existsSync(distPath)) {
    return distPath;
  }

  // In src, it's in the same directory
  const srcPath = join(currentDir, "yellow-brick-constraints.yaml");
  if (existsSync(srcPath)) {
    return srcPath;
  }

  // Optional: Yellow Brick constraints may not be installed
  return "";
}

/**
 * Load Yellow Brick phase constraints
 *
 * @param customPath - Optional custom path to YAML file
 * @returns Array of phase constraints (empty if file not found)
 */
export function loadYellowBrickConstraints(customPath?: string): YellowBrickConstraint[] {
  const path = customPath ?? getBundledYellowBrickPath();

  if (!path || !existsSync(path)) {
    // Yellow Brick constraints are optional
    return [];
  }

  const content = readFileSync(path, "utf-8");
  const yaml = parseYaml(content) as YellowBrickYaml;

  if (yaml.version !== 1) {
    throw new Error(`Unsupported Yellow Brick constraints version: ${yaml.version}`);
  }

  return (yaml.rules ?? []).map((rule) => ({
    rule_id: `yellow_brick:${rule.id}`,
    phase: rule.phase,
    text: rule.text,
    severity: rule.severity,
    confidence: 1.0, // Yellow Brick constraints are always fully confident
    category: rule.category,
    source: "baseline" as const,
    scope: rule.scope,
    provenance: {
      source: "baseline" as const,
      rule_id: `yellow_brick:${rule.id}`,
      confidence: 1.0,
    },
  }));
}

/**
 * Get Yellow Brick constraints for a specific phase/procedure
 *
 * @param procedure - The procedure name (e.g., 'fanout_harvest', 'fanout_analyze')
 * @returns Filtered constraints applicable to this procedure
 */
export function getYellowBrickConstraintsForProcedure(procedure: string): YellowBrickConstraint[] {
  const allConstraints = loadYellowBrickConstraints();

  return allConstraints.filter((c) => {
    if (!c.scope?.procedure) {
      // No scope means always applicable
      return true;
    }
    return c.scope.procedure === procedure;
  });
}

/**
 * Get Yellow Brick constraints for a specific phase
 *
 * @param phase - The pipeline phase (D0, D1, D2, D3, D4)
 * @returns Filtered constraints for this phase
 */
export function getYellowBrickConstraintsForPhase(
  phase: "D0" | "D1" | "D2" | "D3" | "D4"
): YellowBrickConstraint[] {
  const allConstraints = loadYellowBrickConstraints();
  return allConstraints.filter((c) => c.phase === phase);
}

/**
 * Cached Yellow Brick constraints
 */
let cachedConstraints: YellowBrickConstraint[] | null = null;

/**
 * Get cached Yellow Brick constraints or load them
 */
export function getYellowBrickConstraints(customPath?: string): YellowBrickConstraint[] {
  if (!cachedConstraints || customPath) {
    cachedConstraints = loadYellowBrickConstraints(customPath);
  }
  return cachedConstraints;
}

/**
 * Clear the Yellow Brick constraints cache (for testing)
 */
export function clearYellowBrickCache(): void {
  cachedConstraints = null;
}

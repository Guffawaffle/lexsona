/**
 * Baseline Constraints Loader
 *
 * Loads baseline constraints from bundled YAML for offline mode
 * and from Lex's baseline when connected.
 *
 * Priority order:
 * 1. Custom path (if provided)
 * 2. Bundled baseline.yaml (default)
 *
 * @module
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Principle, Constraint } from "../constraints/derive.js";

/**
 * Raw baseline YAML structure
 */
interface BaselineYaml {
  version: number;
  principles: Array<{
    id: string;
    description: string;
  }>;
  constraints: Array<{
    id: string;
    description: string;
    severity: "critical" | "high" | "medium" | "low";
  }>;
  lexsona_hooks?: Array<{
    id: string;
    description: string;
    default: string;
  }>;
}

/**
 * Loaded baseline data
 */
export interface BaselineData {
  /** Baseline version */
  version: number;
  /** Core principles (always active) */
  principles: Principle[];
  /** Universal constraints */
  constraints: Constraint[];
  /** Source path of loaded baseline */
  source: string;
}

/**
 * Convert severity from YAML format to constraint format
 */
function mapSeverity(
  severity: "critical" | "high" | "medium" | "low"
): "must" | "should" | "style" {
  switch (severity) {
    case "critical":
    case "high":
      return "must";
    case "medium":
      return "should";
    case "low":
      return "style";
    default:
      return "should";
  }
}

/**
 * Get path to bundled baseline.yaml
 */
function getBundledBaselinePath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // In dist, baseline.yaml is copied alongside loader.js
  const distPath = join(currentDir, "baseline.yaml");
  if (existsSync(distPath)) {
    return distPath;
  }

  // In src, it's in the same directory
  const srcPath = join(currentDir, "baseline.yaml");
  if (existsSync(srcPath)) {
    return srcPath;
  }

  throw new Error(`Baseline not found. Searched: ${distPath}, ${srcPath}`);
}

/**
 * Load baseline constraints from YAML
 *
 * @param customPath - Optional custom path to baseline.yaml
 * @returns Parsed baseline data with principles and constraints
 */
export function loadBaseline(customPath?: string): BaselineData {
  const path = customPath ?? getBundledBaselinePath();

  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const content = readFileSync(path, "utf-8");
  const yaml = parseYaml(content) as BaselineYaml;

  if (yaml.version !== 1) {
    throw new Error(`Unsupported baseline version: ${yaml.version}`);
  }

  // Convert principles
  const principles: Principle[] = (yaml.principles ?? []).map((p) => ({
    id: p.id,
    description: p.description,
  }));

  // Convert constraints
  const constraints: Constraint[] = (yaml.constraints ?? []).map((c) => ({
    rule_id: `baseline:${c.id}`,
    text: c.description,
    severity: mapSeverity(c.severity),
    confidence: 1.0, // Baseline constraints are always fully confident
    category: "baseline",
    source: "baseline" as const,
    provenance: {
      source: "baseline" as const,
      rule_id: `baseline:${c.id}`,
      confidence: 1.0,
    },
  }));

  return {
    version: yaml.version,
    principles,
    constraints,
    source: path,
  };
}

/**
 * Cached baseline data (loaded once)
 */
let cachedBaseline: BaselineData | null = null;

/**
 * Get cached baseline data or load it
 */
export function getBaseline(customPath?: string): BaselineData {
  if (!cachedBaseline || customPath) {
    cachedBaseline = loadBaseline(customPath);
  }
  return cachedBaseline;
}

/**
 * Clear the baseline cache (for testing)
 */
export function clearBaselineCache(): void {
  cachedBaseline = null;
}

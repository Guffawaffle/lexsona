/**
 * Lexmap loader and path-to-module mapping
 *
 * Loads lexmap.policy.json which maps file paths to module IDs.
 * Used for auto-scope inference from touched files.
 *
 * @module
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import micromatch from "micromatch";
import { z } from "zod";

/**
 * Schema for module configuration in lexmap.policy.json
 */
const ModuleConfigSchema = z.object({
  paths: z.array(z.string()),
  constraints: z.array(z.string()).optional(),
});

/**
 * Schema for lexmap.policy.json
 */
const LexmapSchema = z.object({
  modules: z.record(z.string(), ModuleConfigSchema),
});

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;
export type Lexmap = z.infer<typeof LexmapSchema>;

/**
 * Options for loading lexmap
 */
export interface LoadLexmapOptions {
  /** Path to lexmap.policy.json (defaults to canon/policy/lexmap.policy.json) */
  lexmapPath?: string;
  /** Base directory to search for lexmap (defaults to process.cwd()) */
  baseDir?: string;
}

/**
 * Load and parse lexmap.policy.json
 *
 * @param options - Load options
 * @returns Parsed lexmap or null if not found
 */
export function loadLexmap(options: LoadLexmapOptions = {}): Lexmap | null {
  const baseDir = options.baseDir || process.cwd();

  // Try explicit path first
  if (options.lexmapPath) {
    if (existsSync(options.lexmapPath)) {
      return parseLexmap(options.lexmapPath);
    }
    return null;
  }

  // Try canonical locations
  const candidates = [
    join(baseDir, "canon", "policy", "lexmap.policy.json"),
    join(baseDir, ".smartergpt", "lexmap.policy.json"),
    join(baseDir, "lexmap.policy.json"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return parseLexmap(candidate);
    }
  }

  return null;
}

/**
 * Parse lexmap.policy.json file
 */
function parseLexmap(path: string): Lexmap | null {
  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    const result = LexmapSchema.safeParse(parsed);

    if (!result.success) {
      console.warn(`Warning: Invalid lexmap.policy.json at ${path}:`, result.error.message);
      return null;
    }

    return result.data;
  } catch (error) {
    console.warn(
      `Warning: Failed to read lexmap.policy.json at ${path}:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Map file paths to module IDs using lexmap
 *
 * @param files - File paths to map
 * @param lexmap - Loaded lexmap
 * @returns Set of module IDs that match the files
 */
export function mapFilesToModules(files: string[], lexmap: Lexmap): Set<string> {
  const matchedModules = new Set<string>();

  for (const file of files) {
    for (const [moduleId, config] of Object.entries(lexmap.modules)) {
      if (micromatch.isMatch(file, config.paths)) {
        matchedModules.add(moduleId);
      }
    }
  }

  return matchedModules;
}

/**
 * Scope inference from touched files
 *
 * Infers module_id scope from git diff, environment variables, or explicit files.
 * Uses lexmap.policy.json for path-to-module mapping.
 *
 * @module
 */

import { exec } from "child_process";
import { promisify } from "util";
import { loadLexmap, mapFilesToModules, type LoadLexmapOptions } from "./lexmap.js";

const execAsync = promisify(exec);

/**
 * Options for scope inference
 */
export interface InferScopeOptions {
  /** Explicit files to use (overrides all other sources) */
  files?: string[];
  /** Path to lexmap.policy.json */
  lexmapPath?: string;
  /** Base directory for git operations (defaults to process.cwd()) */
  baseDir?: string;
  /** Include staged files in addition to unstaged changes */
  includeStaged?: boolean;
}

/**
 * Result of scope inference
 */
export interface InferScopeResult {
  /** Inferred module IDs */
  moduleIds: string[];
  /** Files that were considered */
  touchedFiles: string[];
  /** Source of the inference */
  source: "explicit" | "env" | "git-diff" | "git-staged" | "none";
}

/**
 * Get touched files from various sources
 *
 * Priority order:
 * 1. Explicit files (options.files)
 * 2. LEX_TOUCHED_FILES environment variable
 * 3. Git diff (unstaged + optionally staged)
 *
 * @param options - Inference options
 * @returns Array of file paths and the source
 */
async function getTouchedFiles(
  options: InferScopeOptions
): Promise<{ files: string[]; source: InferScopeResult["source"] }> {
  // 1. Explicit files (highest priority)
  if (options.files && options.files.length > 0) {
    return { files: options.files, source: "explicit" };
  }

  // 2. Environment variable
  if (process.env.LEX_TOUCHED_FILES) {
    const files = process.env.LEX_TOUCHED_FILES.split(":")
      .map((f) => f.trim())
      .filter(Boolean);
    if (files.length > 0) {
      return { files, source: "env" };
    }
  }

  // 3. Git diff (fallback)
  try {
    const baseDir = options.baseDir || process.cwd();

    // Get unstaged changes
    const { stdout: unstaged } = await execAsync("git diff --name-only", {
      cwd: baseDir,
    });
    const unstagedFiles = unstaged.trim().split("\n").filter(Boolean);

    // Get staged changes if requested
    let stagedFiles: string[] = [];
    if (options.includeStaged) {
      const { stdout: staged } = await execAsync("git diff --cached --name-only", {
        cwd: baseDir,
      });
      stagedFiles = staged.trim().split("\n").filter(Boolean);
    }

    // Combine and deduplicate
    const allFiles = Array.from(new Set([...unstagedFiles, ...stagedFiles]));

    if (allFiles.length > 0) {
      const source = options.includeStaged && stagedFiles.length > 0 ? "git-staged" : "git-diff";
      return { files: allFiles, source };
    }
  } catch {
    // Git might not be available or not in a git repo
    // Fall through to return empty
  }

  return { files: [], source: "none" };
}

/**
 * Infer module_id scope from touched files
 *
 * Uses lexmap.policy.json to map file paths to module IDs.
 * Falls back gracefully if lexmap is not found.
 *
 * @param options - Inference options
 * @returns Inference result with module IDs and metadata
 */
export async function inferScope(options: InferScopeOptions = {}): Promise<InferScopeResult> {
  // Get touched files
  const { files: touchedFiles, source } = await getTouchedFiles(options);

  // If no files touched, return empty result
  if (touchedFiles.length === 0) {
    return {
      moduleIds: [],
      touchedFiles: [],
      source,
    };
  }

  // Load lexmap
  const lexmapOptions: LoadLexmapOptions = {
    lexmapPath: options.lexmapPath,
    baseDir: options.baseDir,
  };
  const lexmap = loadLexmap(lexmapOptions);

  // If no lexmap, we can't infer scope
  if (!lexmap) {
    return {
      moduleIds: [],
      touchedFiles,
      source,
    };
  }

  // Map files to modules
  const moduleSet = mapFilesToModules(touchedFiles, lexmap);
  const moduleIds = Array.from(moduleSet).sort();

  return {
    moduleIds,
    touchedFiles,
    source,
  };
}

/**
 * CLI Output Formatting Utilities
 *
 * Provides consistent JSON and human-readable output formatting
 * @module
 */

import type { Command } from "commander";

/**
 * Check if JSON mode is enabled via the global --json flag
 */
export function isJsonMode(command: Command): boolean {
  // Walk up the command tree to find the root program
  let current: Command | null = command;
  while (current.parent) {
    current = current.parent;
  }
  
  // Check if --json was passed at the global level
  const opts = current.opts() as { json?: boolean };
  return opts.json === true;
}

/**
 * Output data in JSON or human-readable format based on mode
 */
export function output(data: unknown, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // For non-JSON mode, data should already be formatted by caller
    // This function is only called when caller wants to output JSON
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Output an error in JSON or human-readable format
 */
export function outputError(error: { error: string; message?: string; [key: string]: unknown }, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(error, null, 2));
  } else {
    console.error(`Error: ${error.message || error.error}`);
    if (error.hint && typeof error.hint === "string") {
      console.error(`Hint: ${error.hint}`);
    }
  }
}

/**
 * Output success in JSON format or return for human-readable formatting
 */
export function formatSuccess(data: Record<string, unknown>): Record<string, unknown> {
  return { success: true, ...data };
}

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

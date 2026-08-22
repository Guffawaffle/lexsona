/**
 * Explicit compatibility bootstrap for legacy path-based LexSona commands.
 *
 * This is intentionally located at the CLI/MCP composition edge. Canonical
 * library calls never consult environment variables, cwd, or home directories.
 */

import { discoverDbPath, getDefaultDbPath } from "../core/lexConnection.js";
import type { LegacyLexSonaConfig } from "../core/lexsona.js";

export const LEGACY_DISCOVERY_REMOVAL_TARGET = "3.0.0" as const;

export interface LegacyDiscoveryReceipt {
  readonly mode: "legacy-path-discovery";
  readonly dbPath: string;
  readonly source: string;
  readonly exists: boolean;
  readonly removalTarget: typeof LEGACY_DISCOVERY_REMOVAL_TARGET;
}

export interface LegacyBootstrapResult {
  readonly config: LegacyLexSonaConfig;
  readonly discovery: LegacyDiscoveryReceipt;
}

export function bootstrapLegacyLexSona(
  options: {
    readonly persona?: string;
    readonly domain?: string;
  } = {}
): LegacyBootstrapResult {
  const dbPath = getDefaultDbPath();
  const selected = discoverDbPath().find((candidate) => candidate.path === dbPath);
  return Object.freeze({
    config: Object.freeze({
      lexDb: dbPath,
      ...(options.persona !== undefined ? { persona: options.persona } : {}),
      ...(options.domain !== undefined ? { domain: options.domain } : {}),
    }),
    discovery: Object.freeze({
      mode: "legacy-path-discovery",
      dbPath,
      source: selected?.source ?? "fallback",
      exists: selected?.exists ?? false,
      removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
    }),
  });
}

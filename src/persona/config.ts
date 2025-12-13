/**
 * Persona Configuration Management
 *
 * Handles persistent state for active persona across CLI invocations.
 * Stores in `.smartergpt/lexsona.yaml` (project-local by default, user-global with --global)
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

/**
 * Schema for lexsona.yaml configuration
 */
export const PersonaConfigSchema = z.object({
  version: z.number(),
  activePersona: z.string().optional(),
  activatedAt: z.string().datetime().optional(),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

/**
 * Get the path to the project-local config file
 */
export function getProjectConfigPath(): string {
  return join(process.cwd(), ".smartergpt", "lexsona.yaml");
}

/**
 * Get the path to the user-global config file
 */
export function getUserConfigPath(): string {
  return join(homedir(), ".smartergpt", "lexsona.yaml");
}

/**
 * Read configuration from a given path
 * Returns null if file doesn't exist
 * Throws if file exists but is invalid
 */
export function readConfig(configPath: string): PersonaConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const data = parseYaml(content);
    const result = PersonaConfigSchema.safeParse(data);

    if (!result.success) {
      throw new Error(
        `Invalid configuration at ${configPath}: ${result.error.errors.map((e) => e.message).join(", ")}`
      );
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read configuration at ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Write configuration to a given path
 * Creates directories if they don't exist
 */
export function writeConfig(configPath: string, config: PersonaConfig): void {
  try {
    // Ensure directory exists
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write YAML
    const yamlContent = stringifyYaml(config);
    writeFileSync(configPath, yamlContent, "utf-8");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write configuration to ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get the active persona from configuration
 * Checks project-local first, then user-global
 * Returns null if no active persona is set
 */
export function getActivePersona(): {
  personaId: string | null;
  scope: "project" | "global" | null;
} {
  // Check project-local first
  const projectConfig = readConfig(getProjectConfigPath());
  if (projectConfig?.activePersona) {
    return {
      personaId: projectConfig.activePersona,
      scope: "project",
    };
  }

  // Check user-global
  const userConfig = readConfig(getUserConfigPath());
  if (userConfig?.activePersona) {
    return {
      personaId: userConfig.activePersona,
      scope: "global",
    };
  }

  return {
    personaId: null,
    scope: null,
  };
}

/**
 * Set the active persona in configuration
 * @param personaId - The persona ID to activate
 * @param global - If true, store in user-global config; otherwise project-local
 */
export function setActivePersona(personaId: string, global: boolean = false): void {
  const configPath = global ? getUserConfigPath() : getProjectConfigPath();

  const config: PersonaConfig = {
    version: 1,
    activePersona: personaId,
    activatedAt: new Date().toISOString(),
  };

  writeConfig(configPath, config);
}

/**
 * Clear the active persona from configuration
 * @param global - If true, clear from user-global config; otherwise project-local
 */
export function clearActivePersona(global: boolean = false): void {
  const configPath = global ? getUserConfigPath() : getProjectConfigPath();

  // If config doesn't exist, nothing to do
  if (!existsSync(configPath)) {
    return;
  }

  const config: PersonaConfig = {
    version: 1,
  };

  writeConfig(configPath, config);
}

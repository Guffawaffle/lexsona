/**
 * Persona Types
 * 
 * Type definitions for persona manifests and configuration.
 * 
 * @module
 */

import { z } from "zod";

/**
 * Persona role definition
 */
export interface PersonaRole {
  /** Behavioral focus (e.g., "quality-focused engineering") */
  title: string;
  /** Brief scope description */
  scope: string;
  /** Primary repository path (optional) */
  repo?: string;
}

/**
 * Persona duties (invariants)
 */
export interface PersonaDuties {
  /** Actions the persona MUST always do */
  mustDo: string[];
  /** Actions the persona MUST NEVER do */
  mustNotDo: string[];
}

/**
 * Activation triggers for a persona
 */
export interface PersonaTriggers {
  /** Phrases that activate this persona */
  phrases: string[];
  /** Whether activation requires exact match */
  exactMatch?: boolean;
}

/**
 * Complete persona definition
 */
export interface Persona {
  /** Unique persona identifier */
  id: string;
  /** Display name */
  name: string;
  /** Version string */
  version: string;
  /** Role definition */
  role: PersonaRole;
  /** Behavioral duties */
  duties: PersonaDuties;
  /** Activation triggers */
  triggers: PersonaTriggers;
  /** Optional markdown body with detailed guidance */
  body?: string;
}

/**
 * Persona manifest (the YAML frontmatter part)
 */
export interface PersonaManifest {
  name: string;
  version: string;
  triggers: string[];
  role: PersonaRole;
  duties: PersonaDuties;
}

/**
 * Zod schema for persona manifest validation
 */
export const PersonaManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  triggers: z.array(z.string()),
  role: z.object({
    title: z.string(),
    scope: z.string(),
    repo: z.string().optional(),
  }),
  duties: z.object({
    mustDo: z.array(z.string()),
    mustNotDo: z.array(z.string()),
  }),
});

export type PersonaManifestInput = z.infer<typeof PersonaManifestSchema>;

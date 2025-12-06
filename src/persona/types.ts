/**
 * Persona Types
 *
 * Type definitions for persona manifests and configuration.
 * Uses behavioral naming for public IDs.
 *
 * @module
 */

import { z } from "zod";

/**
 * Persona behavioral focus
 *
 * Describes the operating lens/behavioral style, NOT a job role.
 */
export interface PersonaBehavior {
  /**
   * Primary behavioral focus
   * Examples: "quality-first", "momentum-first", "risk-reducer"
   */
  primaryFocus: string;

  /**
   * Domain context
   * Examples: "engineering", "product", "operations"
   */
  domain: string;

  /**
   * Description of the behavioral style
   */
  description: string;
}

/**
 * Persona duties (behavioral invariants)
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
  /** Keywords that suggest this persona */
  keywords?: string[];
}

/**
 * Complete persona definition
 */
export interface Persona {
  /**
   * Public persona identifier (behavioral naming)
   * Format: "{focus}_{domain}" e.g., "quality-first_engineering"
   */
  id: string;

  /** Version string */
  version: string;

  /** Behavioral focus (operating lens) */
  behavior: PersonaBehavior;

  /** Behavioral invariants */
  duties: PersonaDuties;

  /** Activation triggers */
  triggers: PersonaTriggers;

  /**
   * Rule categories this persona activates
   * References rules stored in Lex
   */
  ruleCategories: string[];

  /** Optional markdown body with detailed guidance */
  body?: string;
}

/**
 * Persona manifest (the YAML frontmatter part)
 */
export interface PersonaManifest {
  id: string;
  version: string;
  behavior: PersonaBehavior;
  duties: PersonaDuties;
  triggers: PersonaTriggers;
  ruleCategories: string[];
}

/**
 * Behavioral focus patterns (approved)
 */
export const APPROVED_FOCUS_PATTERNS = [
  "quality-first",
  "momentum-first",
  "risk-reducer",
  "scope-warden",
  "test-first",
  "observability-first",
  "minimal-diff",
  "user-advocate",
  "doc-first",
] as const;

export type ApprovedFocusPattern = (typeof APPROVED_FOCUS_PATTERNS)[number];

/**
 * Zod schema for persona manifest validation
 */
export const PersonaManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+_[a-z0-9-]+$/, {
      message: "ID must be behavioral-style: 'focus_domain' (e.g., 'quality-first_engineering')",
    }),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  behavior: z.object({
    primaryFocus: z.string(),
    domain: z.string(),
    description: z.string(),
  }),
  duties: z.object({
    mustDo: z.array(z.string()),
    mustNotDo: z.array(z.string()),
  }),
  triggers: z.object({
    phrases: z.array(z.string()),
    keywords: z.array(z.string()).optional(),
  }),
  ruleCategories: z.array(z.string()),
});

export type PersonaManifestInput = z.infer<typeof PersonaManifestSchema>;

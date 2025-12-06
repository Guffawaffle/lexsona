/**
 * Persona Types
 *
 * Type definitions for persona manifests and configuration.
 *
 * To maintain clear behavioral classification, LexSona uses decision-style
 * naming for persona IDs. This convention describes *how* an agent approaches
 * decisions rather than *what* it is.
 *
 * @module
 */

import { z } from "zod";

/**
 * Persona behavioral focus
 *
 * Describes the decision-making lens and behavioral style.
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
   * Public persona identifier (behavioral classification)
   * Format: "{behavioral-focus}_{domain}" e.g., "quality-first_engineering"
   */
  id: string;

  /** Version string */
  version: string;

  /** Behavioral focus (decision-making lens) */
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

  /**
   * Whether this persona requires a Lex memory connection
   */
  requires_memory: boolean;

  /**
   * Offline-safe configuration (required when requires_memory is false)
   */
  offline_safe?: OfflineSafeConfig;

  /** Optional markdown body with detailed guidance */
  body?: string;
}

/**
 * Offline-safe configuration
 * Required when requires_memory is false
 */
export interface OfflineSafeConfig {
  /**
   * Maximum confidence for any derived constraint
   * Must be <= 1.0
   */
  confidence_ceiling: number;
  /**
   * Human-readable disclaimer for agents
   * Explains limitations of offline mode
   */
  no_memory_disclaimer: string;
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
  /**
   * Whether this persona requires a Lex memory connection
   * - true: expects getRules() / recordCorrection() to work
   * - false: must function with empty/mocked responses (offline-safe)
   */
  requires_memory: boolean;
  /**
   * Required when requires_memory is false
   * Defines safety constraints for offline operation
   */
  offline_safe?: OfflineSafeConfig;
}

/**
 * Approved behavioral focus patterns
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
 *
 * ID format enforces behavioral classification naming:
 * {behavioral-focus}_{domain}
 */
/**
 * Schema for offline-safe configuration
 */
export const OfflineSafeConfigSchema = z.object({
  confidence_ceiling: z.number().min(0).max(1),
  no_memory_disclaimer: z.string().min(1),
});

/**
 * Zod schema for persona manifest validation
 *
 * ID format enforces behavioral classification naming:
 * {behavioral-focus}_{domain}
 */
export const PersonaManifestSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+_[a-z0-9-]+$/, {
        message:
          "ID must use behavioral classification: 'focus_domain' (e.g., 'quality-first_engineering')",
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
    requires_memory: z.boolean(),
    offline_safe: OfflineSafeConfigSchema.optional(),
  })
  .refine(
    (data) => {
      // If offline-safe (requires_memory: false), offline_safe config is required
      if (!data.requires_memory && !data.offline_safe) {
        return false;
      }
      return true;
    },
    {
      message:
        "Offline-safe personas (requires_memory: false) must include offline_safe configuration",
    }
  );

export type PersonaManifestInput = z.infer<typeof PersonaManifestSchema>;

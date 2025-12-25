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
  /** Actions the persona SHOULD do (recommended practices) */
  shouldDo?: string[];
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
 * Persona capability matrix for agent selection (AX-003)
 * Structured metadata to help agents autonomously select personas
 */
export interface PersonaCapability {
  /** What this persona optimizes for */
  optimizes: string[];
  /** What this persona deprioritizes */
  deprioritizes: string[];
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
   * Capability matrix for agent selection (AX-003)
   * Optional: if not provided, can be derived from other fields
   */
  capability?: PersonaCapability;

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

  /**
   * Scope constraints for task snapshots (ADR-007)
   */
  scope_constraints?: ScopeConstraints;

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
  capability?: PersonaCapability;
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
  /**
   * Scope constraints for task snapshots (ADR-007)
   */
  scope_constraints?: ScopeConstraints;
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
 * Schema for persona capability matrix (AX-003)
 */
export const PersonaCapabilitySchema = z.object({
  optimizes: z.array(z.string()),
  deprioritizes: z.array(z.string()),
});

/**
 * Scope constraints for task snapshots
 * Per ADR-007: Defines what agent can read/write
 */
export const ScopeConstraintsSchema = z.object({
  /** Default read scope patterns */
  read_globs: z.array(z.string()).default(["**/*"]),

  /** Default write scope patterns (conservative) */
  write_globs: z.array(z.string()).default([]),

  /** Always deny patterns (safety - merged, never removed) */
  deny_globs: z
    .array(z.string())
    .default(["node_modules/**", "dist/**", ".git/**", "*.lock"]),

  /** Whether cross-repo operations are allowed */
  cross_repo_allowed: z.boolean().default(false),

  /** Procedure-specific overrides */
  overrides: z
    .record(
      z.string(),
      z.object({
        read_globs: z.array(z.string()).optional(),
        write_globs: z.array(z.string()).optional(),
        // Note: deny_globs cannot be overridden (safety)
        cross_repo_allowed: z.boolean().optional(),
      })
    )
    .optional(),
});
export type ScopeConstraints = z.infer<typeof ScopeConstraintsSchema>;

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
      shouldDo: z.array(z.string()).optional(),
    }),
    triggers: z.object({
      phrases: z.array(z.string()),
      keywords: z.array(z.string()).optional(),
    }),
    capability: PersonaCapabilitySchema.optional(),
    ruleCategories: z.array(z.string()),
    requires_memory: z.boolean(),
    offline_safe: OfflineSafeConfigSchema.optional(),
    /** Scope constraints for task snapshots (ADR-007) */
    scope_constraints: ScopeConstraintsSchema.optional(),
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

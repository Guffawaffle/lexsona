/**
 * Behavioral Rules Types
 * 
 * Type definitions for behavioral rules and corrections.
 * These mirror the Lex storage schema but are owned by LexSona.
 * 
 * @module
 */

import { z } from "zod";

/**
 * A behavioral rule learned from user corrections
 */
export interface BehaviorRule {
  /** Unique rule identifier */
  ruleId: string;
  /** The behavioral correction text */
  correction: string;
  /** Context when the rule applies */
  context: RuleContext;
  /** Bayesian confidence (alpha / (alpha + beta)) */
  confidence: number;
  /** Number of times this rule has been observed */
  observationCount: number;
  /** Decay factor based on time since last observation */
  decayFactor: number;
  /** Effective confidence (confidence * decayFactor) */
  effectiveConfidence: number;
  /** Timestamp of last observation */
  lastObserved: string;
}

/**
 * Context for scoping rules
 */
export interface RuleContext {
  /** Module/namespace scope */
  moduleId?: string;
  /** Task type (implementation, review, planning, etc.) */
  taskType?: string;
  /** Domain (repo/project) */
  domain?: string;
  /** Associated Frame ID (for provenance) */
  frameId?: string;
}

/**
 * A user correction to record
 */
export interface Correction {
  /** The correction text */
  correction: string;
  /** Polarity: 1 = reinforce, -1 = counterexample */
  polarity: 1 | -1;
  /** Context for the correction */
  context?: RuleContext;
  /** Optional user ID */
  userId?: string;
  /** Timestamp (defaults to now) */
  timestamp?: string;
}

/**
 * Zod schema for correction validation
 */
export const CorrectionSchema = z.object({
  correction: z.string().min(1),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  context: z
    .object({
      moduleId: z.string().optional(),
      taskType: z.string().optional(),
      domain: z.string().optional(),
      frameId: z.string().optional(),
    })
    .optional(),
  userId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export type CorrectionInput = z.infer<typeof CorrectionSchema>;

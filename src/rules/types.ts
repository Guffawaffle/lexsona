/**
 * Rule Types
 *
 * Type definitions for behavioral rules.
 * These mirror the socket types from Lex (src/memory/store/lexsona-types.ts).
 * LexSona does NOT duplicate storage logic - it consumes Lex's APIs.
 *
 * @module
 */

import { z } from "zod";

/**
 * Scope definition for behavioral rules
 * Matches Lex's RuleScope from lexsona-types.ts
 */
export interface RuleScope {
  /** Module identifier (exact match for filtering) */
  module_id?: string;
  /** Task type (fuzzy matching for filtering) */
  task_type?: string;
  /** Environment context (e.g., 'github-copilot', 'awa', 'personal') */
  environment?: string;
  /** Project context (e.g., 'lex-core', 'awa-monorepo') */
  project?: string;
  /** Agent family (e.g., 'gpt', 'claude', 'copilot', 'coding-agent') */
  agent_family?: string;
  /** Context tags for fine-grained matching */
  context_tags?: string[];
}

/**
 * Severity level for behavioral rules
 */
export type RuleSeverity = "must" | "should" | "style";

/**
 * Behavioral rule - mirrors Lex's BehaviorRule type
 * LexSona receives these from Lex's getRules() API
 */
export interface BehaviorRule {
  /** Unique identifier for the rule */
  rule_id: string;
  /** Category for grouping (e.g., 'tool_preference', 'communication_style') */
  category: string;
  /** Human-readable rule statement */
  text: string;
  /** Context scope where this rule applies */
  scope: RuleScope;
  /** Bayesian confidence: successes (reinforcements + prior) */
  alpha: number;
  /** Bayesian confidence: failures (counterexamples + prior) */
  beta: number;
  /** Count of observations */
  observation_count: number;
  /** Severity level */
  severity: RuleSeverity;
  /** Decay time constant in days */
  decay_tau: number;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 update timestamp */
  updated_at: string;
  /** ISO 8601 last observation timestamp */
  last_observed: string;
  /** Associated frame ID (if any) */
  frame_id?: string;
}

/**
 * Rule with computed confidence fields
 * Added by LexSona during constraint derivation
 */
export interface BehaviorRuleWithConfidence extends BehaviorRule {
  /** Base confidence: alpha / (alpha + beta) */
  confidence: number;
  /** Decay factor: exp(-(now - last_observed) / tau) */
  decay_factor: number;
  /** Effective confidence: confidence * decay_factor */
  effective_confidence: number;
}

/**
 * Correction input - what LexSona sends to Lex's recordCorrection()
 */
export interface CorrectionInput {
  /** The correction statement */
  correction: string;
  /** Polarity: 1 = reinforce, -1 = weaken */
  polarity?: 1 | -1;
  /** Context where the correction applies */
  context: RuleScope;
  /** Optional rule ID if correcting a specific rule */
  rule_id?: string;
  /** Optional category for the rule */
  category?: string;
  /** Optional severity level */
  severity?: RuleSeverity;
  /** Optional reason for the correction */
  reason?: string;
}

/**
 * Zod schemas for validation
 */
export const RuleScopeSchema = z.object({
  module_id: z.string().optional(),
  task_type: z.string().optional(),
  environment: z.string().optional(),
  project: z.string().optional(),
  agent_family: z.string().optional(),
  context_tags: z.array(z.string()).optional(),
});

export const CorrectionInputSchema = z.object({
  correction: z.string().min(1),
  polarity: z.union([z.literal(-1), z.literal(1)]).optional(),
  context: RuleScopeSchema,
  rule_id: z.string().optional(),
  category: z.string().optional(),
  severity: z.enum(["must", "should", "style"]).optional(),
  reason: z.string().optional(),
});

export type RuleScopeInput = z.infer<typeof RuleScopeSchema>;

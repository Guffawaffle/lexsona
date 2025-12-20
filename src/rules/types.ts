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

/**
 * Trust gap event types (ADR-007)
 */

/**
 * Failure information from engine verification
 */
export interface TrustGapFailure {
  /** Type of failure (e.g., 'test_count_mismatch', 'assertion_changed') */
  type: string;
  /** Human-readable failure message */
  message: string;
  /** File where failure occurred (if applicable) */
  file?: string;
  /** Line number where failure occurred (if applicable) */
  line?: number;
}

/**
 * Trust gap event from LexRunner's EngineVerification_v1
 * Records when agent claims don't match engine verification
 */
export interface TrustGapEvent {
  /** Unique task identifier */
  task_id: string;
  /** Agent family that performed the task */
  agent_family: string;
  /** Procedure that was executed */
  procedure: string;
  /** What the agent claimed as the verification result */
  agent_claimed: boolean;
  /** What the engine actually verified */
  verified: boolean;
  /** List of failures detected by engine */
  failures: TrustGapFailure[];
  /** Optional context for the trust gap */
  context?: {
    project?: string;
    module_id?: string;
    task_type?: string;
  };
}

/**
 * Agent trust profile - tracks trust metrics for an agent family
 */
export interface AgentTrustProfile {
  /** Agent family identifier (e.g., 'claude-haiku', 'gpt-4o-mini') */
  agent_family: string;
  /** Total number of tasks completed */
  total_tasks: number;
  /** Number of trust gaps detected */
  trust_gaps: number;
  /** Gap rate: trust_gaps / total_tasks */
  gap_rate: number;
  /** Most common failure types encountered */
  common_failure_types: string[];
  /** ISO 8601 timestamp of first task */
  first_seen: string;
  /** ISO 8601 timestamp of last task */
  last_seen: string;
}

/**
 * Zod schemas for trust gap validation
 */
export const TrustGapFailureSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  file: z.string().optional(),
  line: z.number().optional(),
});

export const TrustGapEventSchema = z.object({
  task_id: z.string().min(1),
  agent_family: z.string().min(1),
  procedure: z.string().min(1),
  agent_claimed: z.boolean(),
  verified: z.boolean(),
  failures: z.array(TrustGapFailureSchema),
  context: z
    .object({
      project: z.string().optional(),
      module_id: z.string().optional(),
      task_type: z.string().optional(),
    })
    .optional(),
});

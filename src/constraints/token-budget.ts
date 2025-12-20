/**
 * Token Budget Optimization Constraints
 *
 * Per ADR-007: Derives token budget constraints for task snapshots based on:
 * 1. Agent family capabilities (context window size)
 * 2. Procedure complexity (post-merge-fix vs fanout-issue)
 * 3. Determinism level (D1 vs D2 vs D3)
 *
 * @module
 */

/**
 * Determinism level for tasks
 */
export type DeterminismLevel = "D1" | "D2" | "D3";

/**
 * Agent family identifiers
 */
export type AgentFamily = "claude-haiku" | "gpt-4o-mini" | "gemini-flash" | string;

/**
 * Known procedure types
 */
export type Procedure = "post-merge-fix" | "fanout-issue" | string;

/**
 * Token budget constraints for task snapshots
 */
export interface TokenBudgetConstraints {
  /** Maximum snapshot size in bytes */
  max_bytes: number;
  /** Maximum context lines to include */
  max_context_lines: number;
  /** Field paths that must never be truncated (MUST from ADR) */
  required_fields: string[];
  /** Field paths that can be truncated if needed (MAY from ADR) */
  optional_fields: string[];
  /** Order in which to truncate optional fields (highest priority first) */
  truncation_order: string[];
}

/**
 * Per-agent-family budget defaults
 */
export interface AgentBudgetDefaults {
  max_snapshot_bytes: number;
  max_context_lines: number;
}

/**
 * Per-procedure budget modifiers
 */
export interface ProcedureBudgetModifier {
  /** Multiplier applied to base budget (e.g., 0.8 = 80% of base) */
  multiplier: number;
  /** Fields that must never be truncated for this procedure */
  required_fields: string[];
}

/**
 * Budget history entry for tracking and optimization
 */
export interface BudgetHistory {
  procedure: string;
  agent_family: string;
  snapshot_bytes: number;
  success: boolean;
  /** Number of search/context tokens used by agent */
  agent_search_tokens?: number;
}

/**
 * Optimal budget recommendation result
 */
export interface OptimalBudgetRecommendation {
  recommended_bytes: number;
  confidence: number;
}

/**
 * Context for deriving token budgets
 */
export interface TokenBudgetContext {
  procedure: string;
  agent_family: string;
  determinism: DeterminismLevel;
}

/**
 * Agent family budget defaults
 * Based on context window sizes and capabilities
 */
const AGENT_BUDGET_DEFAULTS: Record<string, AgentBudgetDefaults> = {
  "claude-haiku": {
    max_snapshot_bytes: 8000,
    max_context_lines: 10,
  },
  "gpt-4o-mini": {
    max_snapshot_bytes: 6000,
    max_context_lines: 8,
  },
  "gemini-flash": {
    max_snapshot_bytes: 10000,
    max_context_lines: 12,
  },
};

/**
 * Default budget for unknown agent families
 */
const DEFAULT_AGENT_BUDGET: AgentBudgetDefaults = {
  max_snapshot_bytes: 8000,
  max_context_lines: 10,
};

/**
 * Procedure-specific budget modifiers
 */
const PROCEDURE_MODIFIERS: Record<string, ProcedureBudgetModifier> = {
  "post-merge-fix": {
    multiplier: 0.8, // Simpler task, less context needed
    required_fields: [
      "failure.runner_output_snip",
      "targets[].hunk",
    ],
  },
  "fanout-issue": {
    multiplier: 1.2, // More complex, more context
    required_fields: [
      "source_of_truth.excerpt",
    ],
  },
};

/**
 * Default procedure modifier for unknown procedures
 */
const DEFAULT_PROCEDURE_MODIFIER: ProcedureBudgetModifier = {
  multiplier: 1.0,
  required_fields: [],
};

/**
 * Base truncation order following ADR-007 priorities
 * Fields are ordered from lowest priority (truncate first) to highest
 */
const BASE_TRUNCATION_ORDER = [
  // MAY truncate (lowest priority)
  "context.additional_notes",
  "history.previous_attempts",
  "metadata.tags",
  "environment.variables",
  
  // SHOULD preserve (medium priority)
  "context.related_files",
  "diff.context_lines",
  "source.comments",
  
  // MUST preserve fields are never in truncation order
  // They are specified in required_fields
];

/**
 * Derive token budget constraints based on agent family, procedure, and determinism
 *
 * This is a PURE function - no side effects, deterministic output.
 *
 * @param context - Context for budget derivation
 * @returns Token budget constraints
 */
export function deriveTokenBudget(context: TokenBudgetContext): TokenBudgetConstraints {
  // Get agent family defaults
  const agentDefaults = AGENT_BUDGET_DEFAULTS[context.agent_family] ?? DEFAULT_AGENT_BUDGET;

  // Get procedure modifiers
  const procedureModifier = PROCEDURE_MODIFIERS[context.procedure] ?? DEFAULT_PROCEDURE_MODIFIER;

  // Calculate final budget with procedure multiplier
  const max_bytes = Math.round(agentDefaults.max_snapshot_bytes * procedureModifier.multiplier);
  const max_context_lines = agentDefaults.max_context_lines;

  // Build required fields (MUST from ADR-007)
  const required_fields = [...procedureModifier.required_fields];

  // All other fields are optional (MAY from ADR-007)
  const optional_fields = [...BASE_TRUNCATION_ORDER];

  // Truncation order: start with base order
  // Fields earlier in the list are truncated first
  const truncation_order = [...BASE_TRUNCATION_ORDER];

  return {
    max_bytes,
    max_context_lines,
    required_fields,
    optional_fields,
    truncation_order,
  };
}

/**
 * Get optimal budget recommendation based on historical data
 *
 * This function provides the interface for future historical optimization.
 * Current implementation returns baseline recommendations.
 *
 * Future enhancements will analyze historical data to:
 * - Calculate average successful snapshot size
 * - Determine confidence based on sample size
 * - Adjust for agent search token usage patterns
 * - Learn optimal budgets from actual task outcomes
 *
 * @param procedure - Procedure name
 * @param agent_family - Agent family
 * @param _history - Historical budget data (reserved for future implementation)
 * @returns Optimal budget recommendation
 */
export function getOptimalBudget(
  procedure: string,
  agent_family: string,
  _history?: BudgetHistory[]
): OptimalBudgetRecommendation {
  // Get base budget
  const agentDefaults = AGENT_BUDGET_DEFAULTS[agent_family] ?? DEFAULT_AGENT_BUDGET;
  const procedureModifier = PROCEDURE_MODIFIERS[procedure] ?? DEFAULT_PROCEDURE_MODIFIER;

  const recommended_bytes = Math.round(
    agentDefaults.max_snapshot_bytes * procedureModifier.multiplier
  );

  // Current implementation: Return baseline recommendations
  // Future implementation will analyze _history to optimize recommendations
  return {
    recommended_bytes,
    confidence: 0.5, // Medium confidence for baseline recommendations
  };
}

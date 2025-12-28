/**
 * Trust Gap Learning Module (ADR-007)
 *
 * Implements trust gap recording, agent profile tracking,
 * confidence decay, and pattern learning.
 *
 * @module
 */

import type Database from "better-sqlite3-multiple-ciphers";
import { recordCorrection, getRules } from "@smartergpt/lex/lexsona";
import type { TrustGapEvent, AgentTrustProfile, BehaviorRuleWithConfidence } from "./types.js";

/**
 * Minimum number of observations before pattern learning activates
 */
const PATTERN_LEARNING_THRESHOLD = 3;

/**
 * Gap rate threshold for applying trust adjustments (20%)
 * Agents with gap rates above this will have reduced confidence
 */
const GAP_RATE_THRESHOLD = 0.2;

/**
 * Maximum confidence reduction factor (30%)
 * Confidence will be reduced by at most this percentage
 */
const MAX_CONFIDENCE_REDUCTION = 0.3;

/**
 * Record a trust gap event and apply confidence decay
 *
 * When a trust gap is detected (agent claim !== engine verification):
 * 1. Apply confidence decay to related rules
 * 2. Track the gap for agent trust profile
 * 3. Check for patterns and generate learned rules if appropriate
 *
 * @param db - Lex database connection
 * @param event - Trust gap event from LexRunner
 */
export function recordTrustGap(db: Database.Database, event: TrustGapEvent): void {
  // Only process if there's actually a gap
  const trustGap = event.agent_claimed !== event.verified;
  if (!trustGap) {
    return;
  }

  // Get all rules that might be affected by this trust gap
  const affectedRules = getRules(db, {
    agent_family: event.agent_family,
    project: event.context?.project,
    module_id: event.context?.module_id,
    task_type: event.context?.task_type,
  });

  // Apply confidence decay to affected rules
  // This is done by recording a counterexample (polarity: -1)
  for (const rule of affectedRules) {
    recordCorrection(db, {
      context: rule.scope,
      correction: rule.text,
      category: rule.category,
      severity: rule.severity,
      polarity: -1, // Counterexample
    });
  }

  // Record the trust gap event itself as a correction
  // This creates a signal for future learning
  const gapContext = {
    agent_family: event.agent_family,
    project: event.context?.project,
    module_id: event.context?.module_id,
    task_type: event.context?.task_type,
  };

  // Create a correction describing the trust gap
  const gapDescription = `Trust gap on ${event.procedure}: agent claimed ${event.agent_claimed} but verification was ${event.verified}`;

  recordCorrection(db, {
    context: gapContext,
    correction: gapDescription,
    category: "trust_gap",
    severity: "should",
    polarity: -1, // This is a negative signal
  });

  // Check for patterns and generate learned rules if appropriate
  checkForPatterns(db, event);
}

/**
 * Check for repeated failure patterns and generate learned rules
 *
 * If the same type of failure occurs multiple times, generate a
 * learned rule to prevent it in the future.
 *
 * @param db - Lex database connection
 * @param event - Current trust gap event
 */
function checkForPatterns(db: Database.Database, event: TrustGapEvent): void {
  // Get all trust gap rules for this agent family
  const trustGapRules = getRules(db, {
    agent_family: event.agent_family,
    // Only get rules in the trust_gap category
  }).filter((r) => r.category === "trust_gap");

  // Count failure types
  const failureTypeCounts = new Map<string, number>();

  for (const rule of trustGapRules) {
    // Extract failure type from correction text
    // Format: "Trust gap on {procedure}: ..."
    const match = rule.text.match(/Trust gap on ([^:]+):/);
    if (match) {
      const procedure = match[1];
      failureTypeCounts.set(procedure, (failureTypeCounts.get(procedure) || 0) + 1);
    }
  }

  // For each failure type that meets the threshold, generate a learned rule
  for (const failure of event.failures) {
    const count = failureTypeCounts.get(event.procedure) || 0;
    if (count >= PATTERN_LEARNING_THRESHOLD) {
      // Generate a learned rule
      const learnedRuleText = generateLearnedRuleText(event, failure);

      recordCorrection(db, {
        context: {
          agent_family: event.agent_family,
          project: event.context?.project,
          module_id: event.context?.module_id,
          task_type: event.context?.task_type,
        },
        correction: learnedRuleText,
        category: "frequency_weighted_learning",
        severity: "should",
        polarity: 1, // This is a positive rule
      });
    }
  }
}

/**
 * Generate learned rule text from a trust gap pattern
 *
 * @param event - Trust gap event
 * @param failure - Specific failure that triggered the pattern
 * @returns Human-readable rule text
 */
function generateLearnedRuleText(
  event: TrustGapEvent,
  failure: { type: string; message: string }
): string {
  // Map common failure types to actionable rules
  switch (failure.type) {
    case "test_count_mismatch":
      return "Require D1 verification for test count changes";
    case "assertion_changed":
      return "Require manual review when test assertions are modified";
    case "coverage_decreased":
      return "Require coverage verification before claiming success";
    default:
      return `Require verification for ${failure.type} on ${event.procedure}`;
  }
}

/**
 * Get agent trust profile for a specific agent family
 *
 * Aggregates trust gap statistics to provide a profile of
 * how reliable this agent family has been.
 *
 * @param db - Lex database connection
 * @param agentFamily - Agent family identifier
 * @returns Trust profile with gap rate and common failure types
 */
export function getAgentTrustProfile(
  db: Database.Database,
  agentFamily: string
): AgentTrustProfile {
  // Get all rules for this agent family (including those with minimal observations and confidence)
  const allRules = getRules(
    db,
    {
      agent_family: agentFamily,
    },
    {
      minN: 0, // Include all rules, even with 0 observations
      minConfidence: 0, // Include all confidence levels
    }
  );

  // Count trust gaps (rules in trust_gap category with polarity -1 or beta > alpha)
  const trustGapRules = allRules.filter((r) => r.category === "trust_gap");
  const trustGaps = trustGapRules.length;

  // Count total tasks
  // TODO: This is a temporary approximation. In a production system,
  // task tracking should be implemented separately to accurately count
  // completed tasks per agent family.
  const totalObservations = allRules.reduce((sum, r) => sum + r.observation_count, 0);
  const totalTasks = Math.max(totalObservations, allRules.length, 1);

  // Calculate gap rate
  const gapRate = trustGaps / totalTasks;

  // Extract common failure types
  const failureTypes = new Map<string, number>();
  for (const rule of trustGapRules) {
    // Extract procedure from "Trust gap on {procedure}: ..." format
    const match = rule.text.match(/Trust gap on ([^:]+):/);
    if (match) {
      const procedure = match[1];
      failureTypes.set(procedure, (failureTypes.get(procedure) || 0) + 1);
    }
  }

  // Sort by frequency and take top 5
  const commonFailureTypes = Array.from(failureTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  // Find first and last seen timestamps
  let firstSeen = new Date().toISOString();
  let lastSeen = new Date(0).toISOString();

  for (const rule of allRules) {
    if (rule.created_at < firstSeen) {
      firstSeen = rule.created_at;
    }
    if (rule.last_observed > lastSeen) {
      lastSeen = rule.last_observed;
    }
  }

  return {
    agent_family: agentFamily,
    total_tasks: totalTasks,
    trust_gaps: trustGaps,
    gap_rate: gapRate,
    common_failure_types: commonFailureTypes,
    first_seen: firstSeen,
    last_seen: lastSeen,
  };
}

/**
 * Derive constraints with trust calibration
 *
 * Adjusts confidence levels based on agent trust profile.
 * Agents with high gap rates get lower confidence on their rules.
 *
 * @param rules - Base rules to calibrate
 * @param trustProfile - Trust profile for the agent
 * @returns Rules with adjusted confidence
 */
export function applyTrustCalibration(
  rules: BehaviorRuleWithConfidence[],
  trustProfile: AgentTrustProfile
): BehaviorRuleWithConfidence[] {
  // Calculate trust adjustment factor
  // High gap rate (>GAP_RATE_THRESHOLD) -> reduce confidence
  // Low gap rate (<GAP_RATE_THRESHOLD) -> no change
  let trustAdjustment = 1.0;

  if (trustProfile.gap_rate > GAP_RATE_THRESHOLD) {
    // Significant trust issues - reduce confidence by up to MAX_CONFIDENCE_REDUCTION
    trustAdjustment = 1.0 - Math.min(MAX_CONFIDENCE_REDUCTION, trustProfile.gap_rate);
  }

  // Apply adjustment to all rules
  return rules.map((rule) => ({
    ...rule,
    effective_confidence: rule.effective_confidence * trustAdjustment,
  }));
}

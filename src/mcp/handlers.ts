/**
 * MCP Tool Handlers for LexSona
 *
 * Implementation of tool handlers that delegate to core LexSona APIs.
 * Each handler is a thin adapter around LexSona core functions.
 *
 * @module
 */

import type { LexSona } from "../core/lexsona.js";
import { loadPersona, listPersonas } from "../persona/loader.js";
import {
  deriveConstraints,
  type DeriveContext,
  type ConstraintSet,
  type ConstraintSource,
} from "../constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../rules/types.js";
import { getBaseline } from "../baseline/index.js";
import { createConstraintSnapshotV1 } from "../constraints/snapshot.js";
import type {
  ActivateInput,
  ConstraintsInput,
  LearnInput,
  RulesInput,
  TrustGapInput,
  AgentTrustProfileInput,
  IntrospectInput,
  ConstraintsShowInput,
  ConstraintsExplainInput,
} from "./tools.js";
import { normalizeScopingInputs } from "./scoping.js";
import {
  LexSonaErrorCode,
  createNoDerivationError,
  createConstraintNotFoundError,
} from "./errors.js";
import {
  formatConstraints,
  formatPrinciples,
  addCompactFlag,
  type OutputFormat,
} from "./formatters.js";

// Constants
const DEFAULT_CONSTRAINT_SOURCE: ConstraintSource = "learned";

/**
 * Handler for persona_activate tool
 * Activates a persona and returns its info
 */
export async function handleActivate(
  input: ActivateInput,
  state: { activePersonaId: string | null },
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const persona = await loadPersona(input.persona);
  state.activePersonaId = persona.id;

  const instance = await getLexSona();
  const ruleVersion = instance.getRuleVersion();

  const format: OutputFormat = input.format ?? "full";

  if (format === "compact") {
    const compactResponse = {
      success: true,
      ruleVersion,
      persona: {
        id: persona.id,
        ver: persona.version,
        bhv: persona.behavior.primaryFocus,
        cats: persona.ruleCategories,
      },
    };
    return addCompactFlag(compactResponse, format);
  }

  const fullResponse = {
    success: true,
    ruleVersion,
    persona: {
      id: persona.id,
      version: persona.version,
      behavior: persona.behavior,
      ruleCategories: persona.ruleCategories,
    },
  };

  return addCompactFlag(fullResponse, format);
}

/**
 * Handler for constraints_derive tool
 * Derives constraints for a given context
 */
export async function handleConstraints(
  input: ConstraintsInput,
  state: { activePersonaId: string | null },
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  // Validate and normalize scoping inputs
  const scoping = normalizeScopingInputs(input);

  const personaId = input.persona ?? state.activePersonaId ?? "quality-first_engineering";

  const persona = await loadPersona(personaId);
  const instance = await getLexSona();

  const lexRules = await instance.getRules({
    domain: scoping.project,
  });

  // Convert to LexSona format
  const sonaRules: BehaviorRuleWithConfidence[] = lexRules.map((r) => ({
    rule_id: r.rule_id,
    text: r.text,
    severity: r.severity,
    category: r.category,
    source: "learned" as const,
    scope: r.scope ?? {},
    effective_confidence: r.effective_confidence,
    created_at: r.created_at,
    updated_at: r.updated_at,
    confidence: r.confidence,
    decay_factor: r.decay_factor,
    alpha: r.alpha,
    beta: r.beta,
    observation_count: r.observation_count,
    decay_tau: r.decay_tau,
    last_observed: r.last_observed,
  }));

  const context: DeriveContext = {
    domain: scoping.project,
    module_id: scoping.module_id,
    taskType: input.task,
    agent_family: input.agent_family,
    runtime_family: input.runtime_family,
    runtime_capabilities: input.runtime_capabilities,
  };

  if (input.contract === "snapshot-v1") {
    const baseline = getBaseline();
    const snapshotSet = deriveConstraints(persona, sonaRules, baseline.principles, context, {
      hasLexConnection: instance.isConnected(),
    });
    snapshotSet.constraints = [...baseline.constraints, ...snapshotSet.constraints];
    snapshotSet.ruleVersion = instance.getRuleVersion();
    const snapshot = createConstraintSnapshotV1({
      constraintSet: snapshotSet,
      persona,
      rules: sonaRules,
      baseline,
      bindings: input.bindings,
      canonicalTimestamp: input.canonicalTimestamp,
      provenanceRef: input.provenanceRef,
    });
    return input.format === "compact" ? snapshot.compact : snapshot;
  }

  const result = deriveConstraints(persona, sonaRules, [], context);

  const format: OutputFormat = input.format ?? "full";
  const provenanceMode = input.provenance;

  if (format === "compact") {
    const compactResult = {
      personaId: result.personaId,
      derivedAt: result.derivedAt,
      inputHash: result.inputHash,
      ctx: result.context,
      principles: formatPrinciples(result.principles, format),
      constraints: formatConstraints(result.constraints, format, provenanceMode),
      ruleVer: result.ruleVersion,
      meta: {
        rulesConsidered: result.metadata.rulesConsidered,
        rulesFiltered: result.metadata.rulesFiltered,
        confThreshold: result.metadata.confidenceThreshold,
        offline: result.metadata.offlineMode,
        ...(result.metadata.confidenceCeiling !== undefined && {
          confCeiling: result.metadata.confidenceCeiling,
        }),
        ...(result.metadata.applicability && {
          applicability: result.metadata.applicability,
        }),
      },
    };
    return addCompactFlag(compactResult, format);
  }

  // For full format, still apply provenance mode if specified
  if (provenanceMode === "compact") {
    return {
      ...result,
      constraints: formatConstraints(result.constraints, format, provenanceMode),
    };
  }

  if (!provenanceMode) {
    return {
      ...result,
      constraints: result.constraints.map(
        ({ provenance: _provenance, ...constraint }) => constraint
      ),
    };
  }

  return result;
}

/**
 * Handler for rules_learn tool
 * Records a behavioral correction
 */
export async function handleLearn(
  input: LearnInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  // Validate and normalize scoping inputs
  const scoping = normalizeScopingInputs(input);

  const instance = await getLexSona();

  await instance.learn({
    correction: input.correction,
    severity: input.severity,
    category: input.category,
    polarity: input.polarity === "counter" ? -1 : 1,
    context: {
      module_id: scoping.module_id,
      project: scoping.project,
    },
  });

  // Increment rule version after learning
  const ruleVersion = await instance.incrementRuleVersion();

  return {
    success: true,
    ruleVersion,
    correction: input.correction,
    severity: input.severity,
    polarity: input.polarity,
  };
}

/**
 * Handler for rules_list tool
 * Lists behavioral rules with optional filtering
 */
export async function handleRules(
  input: RulesInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  // Validate and normalize scoping inputs
  const scoping = normalizeScopingInputs(input);

  const instance = await getLexSona();

  const rules = await instance.getRules({
    domain: scoping.project,
    minConfidence: input.minConfidence,
  });

  const ruleVersion = instance.getRuleVersion();

  const format: OutputFormat = input.format ?? "full";

  if (format === "compact") {
    const compactRules = rules.map((r) => ({
      id: r.rule_id,
      sev: r.severity === "must" ? "m" : r.severity === "should" ? "s" : "st",
      cat: r.category,
      conf: Math.round(r.effective_confidence * 100) / 100,
    }));

    return addCompactFlag(
      {
        count: rules.length,
        ruleVer: ruleVersion,
        rules: compactRules,
      },
      format
    );
  }

  return {
    count: rules.length,
    ruleVersion,
    rules: rules.map((r) => ({
      rule_id: r.rule_id,
      text: r.text,
      severity: r.severity,
      category: r.category,
      confidence: r.effective_confidence,
    })),
  };
}

/**
 * Handler for persona_list tool
 * Lists available personas with capability matrix (AX-003)
 */
export async function handlePersonas(getLexSona: () => Promise<LexSona>): Promise<object> {
  const personas = await listPersonas();

  const details = await Promise.all(
    personas.map(async (p) => {
      try {
        const full = await loadPersona(p.id);
        return {
          id: full.id,
          behavior: full.behavior.primaryFocus,
          domain: full.behavior.domain,
          optimizes: full.capability?.optimizes ?? [],
          deprioritizes: full.capability?.deprioritizes ?? [],
          triggerPhrases: full.triggers?.phrases ?? [],
        };
      } catch {
        return { id: p.id, error: "Failed to load" };
      }
    })
  );

  const instance = await getLexSona();
  const ruleVersion = instance.getRuleVersion();

  return {
    count: details.length,
    ruleVersion,
    personas: details,
  };
}

/**
 * Handler for trust_gap_record tool (ADR-007)
 * Records a trust gap event when agent claims don't match verification
 */
export async function handleTrustGapRecord(
  input: TrustGapInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const instance = await getLexSona();

  await instance.recordTrustGap({
    task_id: input.task_id,
    agent_family: input.agent_family,
    procedure: input.procedure,
    agent_claimed: input.agent_claimed,
    verified: input.verified,
    failures: input.failures,
    context: input.context,
  });

  const trustGap = input.agent_claimed !== input.verified;
  const ruleVersion = instance.getRuleVersion();

  return {
    success: true,
    ruleVersion,
    trust_gap: trustGap,
    message: trustGap
      ? `Trust gap recorded. Confidence decay applied for ${input.agent_family}.`
      : "No trust gap detected (claim matches verification).",
  };
}

/**
 * Handler for agent_trust_profile tool (ADR-007)
 * Gets trust profile for an agent family
 */
export async function handleAgentTrustProfile(
  input: AgentTrustProfileInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const instance = await getLexSona();

  const profile = await instance.getAgentTrustProfile(input.agent_family);
  const ruleVersion = instance.getRuleVersion();

  return {
    agent_family: profile.agent_family,
    ruleVersion,
    total_tasks: profile.total_tasks,
    trust_gaps: profile.trust_gaps,
    gap_rate: profile.gap_rate,
    common_failure_types: profile.common_failure_types,
    first_seen: profile.first_seen,
    last_seen: profile.last_seen,
  };
}

/**
 * Handler for introspect tool (AX-002)
 * Returns current LexSona state, capabilities, and configuration for agent self-discovery
 */
export async function handleIntrospect(
  _input: IntrospectInput,
  state: { activePersonaId: string | null },
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  // Get available personas
  const personas = await listPersonas();
  const personaIds = personas.map((p) => p.id);

  // Get Lex connection state
  let lexConnected = false;
  let lexDbPath: string | undefined;
  let ruleCount = 0;
  let ruleVersion = 0;

  try {
    const instance = await getLexSona();
    lexConnected = instance.isConnected();
    const config = instance.getConfig();
    lexDbPath = "lexDb" in config ? config.lexDb : undefined;
    ruleVersion = instance.getRuleVersion();

    if (lexConnected) {
      const rules = await instance.getRules();
      ruleCount = rules.length;
    }
  } catch {
    // If we can't get LexSona instance, lexConnected remains false
  }

  // Get all error codes as an array of strings
  const errorCodes = Object.values(LexSonaErrorCode);

  return {
    version: "0.3.0",
    ruleVersion,
    state: {
      activePersona: state.activePersonaId,
      ruleCount,
      lexConnected,
      lexDbPath,
    },
    personas: personaIds,
    capabilities: {
      caching: false,
      lexIntegration: lexConnected,
    },
    errorCodes,
  };
}

/**
 * Handler for constraints_show tool (AX-008)
 * Returns the last derived constraint set with metadata
 */
export async function handleConstraintsShow(
  _input: ConstraintsShowInput,
  state: { lastDerivation: ConstraintSet | null }
): Promise<object> {
  if (!state.lastDerivation) {
    throw createNoDerivationError();
  }

  return state.lastDerivation;
}

/**
 * Handler for constraints_explain tool (AX-008)
 * Provides structured explanation for why a constraint is active
 */
export async function handleConstraintsExplain(
  input: ConstraintsExplainInput,
  state: { lastDerivation: ConstraintSet | null }
): Promise<object> {
  if (!state.lastDerivation) {
    throw createNoDerivationError();
  }

  const constraint = state.lastDerivation.constraints.find(
    (c) => c.rule_id === input.constraint_id
  );

  if (!constraint) {
    // Only compute availableIds in error path for better error message
    const availableIds = state.lastDerivation.constraints.map((c) => c.rule_id);
    throw createConstraintNotFoundError(input.constraint_id, availableIds);
  }

  // Build structured explanation
  const reasons: Array<{
    source: string;
    detail: string;
    weight?: number;
  }> = [];

  // Persona match reason
  reasons.push({
    source: "persona",
    detail: `Persona "${state.lastDerivation.personaId}" includes category "${constraint.category}"`,
    weight: 1.0,
  });

  // Confidence reason
  reasons.push({
    source: "confidence",
    detail: `Confidence ${constraint.confidence.toFixed(2)} >= threshold ${state.lastDerivation.metadata.confidenceThreshold.toFixed(2)}`,
    weight: constraint.confidence,
  });

  // Offline mode ceiling if applicable
  if (state.lastDerivation.metadata.confidenceCeiling !== undefined) {
    reasons.push({
      source: "offline-ceiling",
      detail: `Offline confidence ceiling applied: <= ${state.lastDerivation.metadata.confidenceCeiling.toFixed(2)}`,
    });
  }

  // Source information
  const source = constraint.source ?? DEFAULT_CONSTRAINT_SOURCE;
  reasons.push({
    source: source,
    detail:
      source === DEFAULT_CONSTRAINT_SOURCE
        ? "Derived from behavioral rules stored in Lex"
        : `Source: ${source}`,
  });

  // Build matched context
  const matchedContext: Record<string, string | undefined> = {};
  if (state.lastDerivation.context.domain) {
    matchedContext.domain = state.lastDerivation.context.domain;
  }
  if (state.lastDerivation.context.module_id) {
    matchedContext.module_id = state.lastDerivation.context.module_id;
  }
  if (state.lastDerivation.context.taskType) {
    matchedContext.taskType = state.lastDerivation.context.taskType;
  }

  return {
    constraintId: constraint.rule_id,
    text: constraint.text,
    severity: constraint.severity,
    category: constraint.category,
    confidence: constraint.confidence,
    active: true,
    reasons,
    matchedContext,
    derivedAt: state.lastDerivation.derivedAt,
  };
}

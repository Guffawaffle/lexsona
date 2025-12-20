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
import { deriveConstraints, type DeriveContext } from "../constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../rules/types.js";
import type { ActivateInput, ConstraintsInput, LearnInput, RulesInput } from "./tools.js";

/**
 * Handler for lexsona_activate tool
 * Activates a persona and returns its info
 */
export async function handleActivate(
  input: ActivateInput,
  state: { activePersonaId: string | null }
): Promise<object> {
  const persona = await loadPersona(input.persona);
  state.activePersonaId = persona.id;

  return {
    success: true,
    persona: {
      id: persona.id,
      version: persona.version,
      behavior: persona.behavior,
      ruleCategories: persona.ruleCategories,
    },
  };
}

/**
 * Handler for lexsona_constraints tool
 * Derives constraints for a given context
 */
export async function handleConstraints(
  input: ConstraintsInput,
  state: { activePersonaId: string | null },
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const personaId = input.persona ?? state.activePersonaId ?? "quality-first_engineering";

  const persona = await loadPersona(personaId);
  const instance = await getLexSona();

  const lexRules = await instance.getRules({
    domain: input.domain,
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
    domain: input.domain,
    module_id: input.module,
    taskType: input.task,
  };

  const result = deriveConstraints(persona, sonaRules, [], context);

  return result;
}

/**
 * Handler for lexsona_learn tool
 * Records a behavioral correction
 */
export async function handleLearn(
  input: LearnInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const instance = await getLexSona();

  await instance.learn({
    correction: input.correction,
    severity: input.severity,
    category: input.category,
    polarity: input.polarity === "counter" ? -1 : 1,
    context: {
      module_id: input.module,
      project: input.domain,
    },
  });

  return {
    success: true,
    correction: input.correction,
    severity: input.severity,
    polarity: input.polarity,
  };
}

/**
 * Handler for lexsona_rules tool
 * Lists behavioral rules with optional filtering
 */
export async function handleRules(
  input: RulesInput,
  getLexSona: () => Promise<LexSona>
): Promise<object> {
  const instance = await getLexSona();

  const rules = await instance.getRules({
    domain: input.domain,
    minConfidence: input.minConfidence,
  });

  return {
    count: rules.length,
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
 * Handler for lexsona_personas tool
 * Lists available personas
 */
export async function handlePersonas(): Promise<object> {
  const personas = await listPersonas();

  const details = await Promise.all(
    personas.map(async (p) => {
      try {
        const full = await loadPersona(p.id);
        return {
          id: full.id,
          behavior: full.behavior,
          triggers: full.triggers?.phrases ?? [],
        };
      } catch {
        return { id: p.id, error: "Failed to load" };
      }
    })
  );

  return {
    count: details.length,
    personas: details,
  };
}

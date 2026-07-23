/**
 * Canonical scoped behavioral-store adapter.
 *
 * Lex owns binding validation, capability enforcement, persistence, and
 * backend selection. LexSona receives only the public binder and immutable
 * binding contract; it never receives a database driver or raw query surface.
 */

import type {
  BehavioralEvidenceInputV1,
  BehavioralPromotionInputV1,
  BehavioralRevisionWriteV1,
  BehavioralSnapshotQueryV1,
  BehavioralSnapshotV1,
  BehavioralStoreBinder,
  BehavioralStoreBindingV1,
  BehavioralWriteReceiptV1,
  PersonaRevisionInputV1,
  RuleRevisionInputV1,
  RuleRevisionV1,
  ScopedBehavioralReadStore,
  ScopedBehavioralWriteStore,
} from "@smartergpt/lex/store";
import type { DeriveContext } from "../constraints/derive.js";
import { PersonaManifestSchema, type Persona } from "../persona/types.js";
import type { BehaviorRuleWithConfidence } from "../rules/types.js";

export type ScopedBehavioralAccessMode = "read-only" | "read-write";

/** An explicit persona identity. No filesystem or environment lookup occurs. */
export interface PersonaRefV1 {
  readonly personaId: string;
  readonly revision?: string;
}

/**
 * Trusted composition input for the canonical LexSona library path.
 *
 * The binding must have been minted by the Lex authority/bootstrap layer.
 * Supplying it does not make LexSona an authority source: the Lex binder
 * validates it again and enforces the requested read/write capability.
 */
export interface ScopedLexSonaConfig {
  readonly store: BehavioralStoreBinder;
  readonly binding: BehavioralStoreBindingV1;
  readonly personaRef: PersonaRefV1;
  readonly mode: ScopedBehavioralAccessMode;
  readonly domain?: string;
}

export interface ScopedBehavioralConnection {
  readonly read: ScopedBehavioralReadStore;
  readonly write?: ScopedBehavioralWriteStore;
  readonly personaRef: PersonaRefV1;
  readonly mode: ScopedBehavioralAccessMode;
}

export interface ScopedBehavioralSnapshot {
  readonly persona: Persona;
  readonly rules: readonly BehaviorRuleWithConfidence[];
  readonly snapshot: BehavioralSnapshotV1;
}

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Scoped LexSona requires a non-empty ${field}`);
  }
  return normalized;
}

export function isScopedLexSonaConfig(config: unknown): config is ScopedLexSonaConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "store" in config &&
    "binding" in config &&
    "personaRef" in config &&
    "mode" in config
  );
}

export async function openScopedBehavioralConnection(
  config: ScopedLexSonaConfig
): Promise<ScopedBehavioralConnection> {
  const personaRef = Object.freeze({
    personaId: nonEmpty(config.personaRef.personaId, "personaRef.personaId"),
    ...(config.personaRef.revision !== undefined
      ? { revision: nonEmpty(config.personaRef.revision, "personaRef.revision") }
      : {}),
  });

  if (config.mode !== "read-only" && config.mode !== "read-write") {
    throw new Error(`Unsupported scoped LexSona mode: ${String(config.mode)}`);
  }

  const read = config.store.bindRead(config.binding);
  if (config.mode === "read-only") {
    return Object.freeze({ read, personaRef, mode: config.mode });
  }

  try {
    const write = config.store.bindWrite(config.binding);
    return Object.freeze({ read, write, personaRef, mode: config.mode });
  } catch (error) {
    await read.close();
    throw error;
  }
}

function snapshotQuery(context: DeriveContext): BehavioralSnapshotQueryV1 {
  return {
    ...(context.module_id !== undefined ? { moduleId: context.module_id } : {}),
    ...(context.taskType !== undefined ? { taskType: context.taskType } : {}),
    ...(context.context_tags !== undefined ? { contextTags: context.context_tags } : {}),
  };
}

function personaFromSnapshot(snapshot: BehavioralSnapshotV1, personaRef: PersonaRefV1): Persona {
  const revision = snapshot.personas.find(
    (candidate) =>
      candidate.personaId === personaRef.personaId &&
      (personaRef.revision === undefined || candidate.revision === personaRef.revision)
  );

  if (!revision) {
    const expected = personaRef.revision
      ? `${personaRef.personaId}@${personaRef.revision}`
      : personaRef.personaId;
    throw new Error(
      `Scoped LexSona persona ${expected} is not present in the authorized behavioral snapshot`
    );
  }

  const parsed = PersonaManifestSchema.safeParse(revision.content);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "persona"}: ${issue.message}`)
      .join(", ");
    throw new Error(
      `Scoped LexSona persona ${revision.personaId}@${revision.revision} is invalid: ${details}`
    );
  }

  return Object.freeze({ ...parsed.data });
}

export function behaviorRuleFromRevision(rule: RuleRevisionV1): BehaviorRuleWithConfidence {
  const stableTimestamp = "1970-01-01T00:00:00.000Z";
  return {
    rule_id: rule.ruleId,
    category: rule.category,
    text: rule.directive,
    // Lex has already filtered the authorized snapshot by applicability.
    // Reconstructing one selector from a multi-value applicability set would
    // narrow or broaden it incorrectly, so the compatibility rule is unscoped.
    scope: {},
    alpha: rule.confidence.alpha,
    beta: rule.confidence.beta,
    observation_count: rule.confidence.observations,
    severity: rule.severity,
    decay_tau: 0,
    created_at: stableTimestamp,
    updated_at: stableTimestamp,
    last_observed: stableTimestamp,
    confidence: rule.confidence.value,
    decay_factor: 1,
    effective_confidence: rule.confidence.value,
  };
}

export async function readScopedBehavioralSnapshot(
  connection: ScopedBehavioralConnection,
  context: DeriveContext
): Promise<ScopedBehavioralSnapshot> {
  const snapshot = await connection.read.getSnapshot(snapshotQuery(context));
  return Object.freeze({
    persona: personaFromSnapshot(snapshot, connection.personaRef),
    rules: Object.freeze(snapshot.rules.map(behaviorRuleFromRevision)),
    snapshot,
  });
}

function requireWrite(connection: ScopedBehavioralConnection): ScopedBehavioralWriteStore {
  if (!connection.write) {
    throw new Error(
      'Scoped LexSona mutation requires mode "read-write" and behavior:write authority'
    );
  }
  return connection.write;
}

export function putScopedPersonaRevision(
  connection: ScopedBehavioralConnection,
  input: BehavioralRevisionWriteV1<PersonaRevisionInputV1>
): Promise<BehavioralWriteReceiptV1> {
  return requireWrite(connection).putPersonaRevision(input);
}

export function putScopedRuleRevision(
  connection: ScopedBehavioralConnection,
  input: BehavioralRevisionWriteV1<RuleRevisionInputV1>
): Promise<BehavioralWriteReceiptV1> {
  return requireWrite(connection).putRuleRevision(input);
}

export function recordScopedEvidence(
  connection: ScopedBehavioralConnection,
  input: BehavioralEvidenceInputV1
): Promise<BehavioralWriteReceiptV1> {
  return requireWrite(connection).recordEvidence(input);
}

export function promoteScopedRule(
  connection: ScopedBehavioralConnection,
  input: BehavioralPromotionInputV1
): Promise<BehavioralWriteReceiptV1> {
  return requireWrite(connection).promoteRule(input);
}

export type {
  BehavioralEvidenceInputV1,
  BehavioralPromotionInputV1,
  BehavioralRevisionWriteV1,
  BehavioralStoreBindingV1,
  BehavioralWriteReceiptV1,
  PersonaRevisionInputV1,
  RuleRevisionInputV1,
};

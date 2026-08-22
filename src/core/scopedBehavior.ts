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
import { BEHAVIORAL_STORE_CONTRACT_VERSION, behavioralContentDigest } from "@smartergpt/lex/store";
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
  readonly personaRef: PersonaRefV1;
  readonly mode: ScopedBehavioralAccessMode;
}

interface ScopedBehavioralConnectionState {
  readonly read: ScopedBehavioralReadStore;
  readonly write?: ScopedBehavioralWriteStore;
  readonly receiptBinding: ScopedBehavioralBindingReceipt;
}

const connectionStates = new WeakMap<ScopedBehavioralConnection, ScopedBehavioralConnectionState>();

export interface ScopedBehavioralSnapshot {
  readonly persona: Persona;
  readonly personaRevision: {
    readonly personaId: string;
    readonly revision: string;
    readonly contentDigest: string;
    readonly manifestId: string;
    readonly manifestVersion: string;
    readonly manifestDigest: string;
  };
  readonly rules: readonly BehaviorRuleWithConfidence[];
  readonly snapshot: BehavioralSnapshotV1;
  readonly binding: ScopedBehavioralBindingReceipt;
}

export interface ScopedBehavioralBindingReceipt {
  readonly schemaVersion: number;
  readonly scopeSchemaVersion: number;
  readonly grantId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly principalId: string;
  readonly repositoryId: string;
  readonly repositoryInstanceId: string;
  readonly capabilities: readonly string[];
  readonly authorityVersion: string;
  readonly scopeVersion: string;
  readonly authorityDigest: string;
  readonly verifiedAt: string;
  readonly expiresAt?: string;
  readonly digest: string;
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
  let write: ScopedBehavioralWriteStore | undefined;
  try {
    if (config.mode === "read-write") {
      write = config.store.bindWrite(config.binding);
    }

    const suppliedBindingDigest = behavioralContentDigest(config.binding);
    const readBindingDigest = behavioralContentDigest(read.binding);
    if (readBindingDigest !== suppliedBindingDigest) {
      throw new Error("Scoped LexSona read service returned a different authority binding");
    }
    if (write && behavioralContentDigest(write.binding) !== readBindingDigest) {
      throw new Error(
        "Scoped LexSona read and write services returned different authority bindings"
      );
    }

    const validatedBinding = read.binding;
    const connection = Object.freeze({ personaRef, mode: config.mode });
    const capabilities = Object.freeze([...validatedBinding.authorizedScope.capabilities].sort());
    const receiptBindingPayload = Object.freeze({
      schemaVersion: validatedBinding.schemaVersion,
      scopeSchemaVersion: validatedBinding.authorizedScope.schemaVersion,
      grantId: validatedBinding.authorizedScope.grantId,
      tenantId: validatedBinding.authorizedScope.tenantId,
      workspaceId: validatedBinding.authorizedScope.workspaceId,
      principalId: validatedBinding.authorizedScope.principalId,
      repositoryId: validatedBinding.repositoryId,
      repositoryInstanceId: validatedBinding.repositoryInstanceId,
      capabilities,
      authorityVersion: validatedBinding.authorizedScope.authorityVersion,
      scopeVersion: validatedBinding.authorizedScope.scopeVersion,
      authorityDigest: validatedBinding.authorizedScope.authorityDigest,
      verifiedAt: validatedBinding.authorizedScope.verifiedAt,
      ...(validatedBinding.authorizedScope.expiresAt !== undefined
        ? { expiresAt: validatedBinding.authorizedScope.expiresAt }
        : {}),
    });
    connectionStates.set(connection, {
      read,
      write,
      receiptBinding: Object.freeze({
        ...receiptBindingPayload,
        digest: behavioralContentDigest(receiptBindingPayload),
      }),
    });
    return connection;
  } catch (error) {
    const cleanup = await Promise.allSettled([
      Promise.resolve().then(() => read.close()),
      Promise.resolve().then(() => write?.close()),
    ]);
    const cleanupFailures = cleanup.filter((result) => result.status === "rejected").length;
    if (cleanupFailures > 0) {
      console.warn(
        `LexSona: ${cleanupFailures} scoped cleanup operation(s) failed while preserving the original binding error`
      );
    }
    throw error;
  }
}

function connectionState(connection: ScopedBehavioralConnection): ScopedBehavioralConnectionState {
  const state = connectionStates.get(connection);
  if (!state) {
    throw new Error("Scoped LexSona connection is closed or invalid");
  }
  return state;
}

function snapshotQuery(context: DeriveContext): BehavioralSnapshotQueryV1 {
  return {
    ...(context.module_id !== undefined ? { moduleId: context.module_id } : {}),
    ...(context.taskType !== undefined ? { taskType: context.taskType } : {}),
    ...(context.context_tags !== undefined
      ? { contextTags: [...new Set(context.context_tags)].sort() }
      : {}),
  };
}

function assertBehavioralSnapshotIntegrity(snapshot: BehavioralSnapshotV1): void {
  if (snapshot.schemaVersion !== BEHAVIORAL_STORE_CONTRACT_VERSION) {
    throw new Error(
      `Scoped LexSona received unsupported behavioral snapshot schema ${String(snapshot.schemaVersion)}`
    );
  }

  for (const persona of snapshot.personas) {
    if (behavioralContentDigest(persona.content) !== persona.contentDigest) {
      throw new Error(
        `Scoped LexSona persona ${persona.personaId}@${persona.revision} content digest does not match its snapshot revision`
      );
    }
  }
  for (const baseline of snapshot.baselines) {
    if (behavioralContentDigest(baseline.content) !== baseline.contentDigest) {
      throw new Error(
        `Scoped LexSona baseline ${baseline.baselineId}@${baseline.revision} content digest does not match its snapshot revision`
      );
    }
  }

  const revisionInput = {
    personas: snapshot.personas.map(({ personaId, revision, contentDigest }) => ({
      personaId,
      revision,
      contentDigest,
    })),
    rules: snapshot.rules.map(({ ruleId, revision, contentDigest, confidence, applicability }) => ({
      ruleId,
      revision,
      contentDigest,
      confidence,
      applicability,
    })),
    baselines: snapshot.baselines.map(
      ({ source, tenantId, baselineId, revision, contentDigest }) => ({
        source,
        ...(tenantId ? { tenantId } : {}),
        baselineId,
        revision,
        contentDigest,
      })
    ),
  };
  const contentInput = {
    personas: snapshot.personas.map(({ provenance: _provenance, ...value }) => value),
    rules: snapshot.rules.map(({ provenance: _provenance, ...value }) => value),
    baselines: snapshot.baselines,
  };
  if (behavioralContentDigest(revisionInput) !== snapshot.snapshotRevision) {
    throw new Error(
      "Scoped LexSona behavioral snapshot revision digest does not match its contents"
    );
  }
  if (behavioralContentDigest(contentInput) !== snapshot.contentDigest) {
    throw new Error(
      "Scoped LexSona behavioral snapshot content digest does not match its contents"
    );
  }
}

function personaFromSnapshot(
  snapshot: BehavioralSnapshotV1,
  personaRef: PersonaRefV1
): Pick<ScopedBehavioralSnapshot, "persona" | "personaRevision"> {
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

  const actualDigest = behavioralContentDigest(revision.content);
  if (revision.contentDigest !== actualDigest) {
    throw new Error(
      `Scoped LexSona persona ${revision.personaId}@${revision.revision} content digest does not match its selected revision`
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

  if (parsed.data.id !== revision.personaId) {
    throw new Error(
      `Scoped LexSona persona identity mismatch: selected ${revision.personaId}@${revision.revision}, parsed ${parsed.data.id}@${parsed.data.version}`
    );
  }

  const persona = Object.freeze({ ...parsed.data });
  return Object.freeze({
    persona,
    personaRevision: Object.freeze({
      personaId: revision.personaId,
      revision: revision.revision,
      contentDigest: revision.contentDigest,
      manifestId: persona.id,
      manifestVersion: persona.version,
      manifestDigest: behavioralContentDigest(persona),
    }),
  });
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
  const state = connectionState(connection);
  // One exact read feeds this derivation. Callers that need replay stability
  // retain the immutable receipt produced from this captured value; ordinary
  // scoped reads continue to observe later authorized revisions.
  const snapshot = await state.read.getSnapshot(snapshotQuery(context));
  assertBehavioralSnapshotIntegrity(snapshot);
  const resolvedPersona = personaFromSnapshot(snapshot, connection.personaRef);
  return Object.freeze({
    ...resolvedPersona,
    rules: Object.freeze(snapshot.rules.map(behaviorRuleFromRevision)),
    snapshot,
    binding: state.receiptBinding,
  });
}

export function getScopedBehavioralBindingReceipt(
  connection: ScopedBehavioralConnection
): ScopedBehavioralBindingReceipt {
  return connectionState(connection).receiptBinding;
}

export async function getScopedRuleRevision(
  connection: ScopedBehavioralConnection,
  ruleId: string
): Promise<RuleRevisionV1 | null> {
  return await connectionState(connection).read.getRule(ruleId);
}

export async function closeScopedBehavioralConnection(
  connection: ScopedBehavioralConnection
): Promise<void> {
  const state = connectionStates.get(connection);
  if (!state) {
    return;
  }
  connectionStates.delete(connection);
  await Promise.all([state.read.close(), state.write?.close()]);
}

function requireWrite(connection: ScopedBehavioralConnection): ScopedBehavioralWriteStore {
  const write = connectionState(connection).write;
  if (!write) {
    throw new Error(
      'Scoped LexSona mutation requires mode "read-write" and behavior:write authority'
    );
  }
  return write;
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

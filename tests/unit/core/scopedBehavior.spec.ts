import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  SqliteBehavioralStoreBackend,
  behavioralContentDigest,
  type BehavioralSnapshotQueryV1,
  type BehavioralSnapshotV1,
  type BehavioralStoreBackendOptionsV1,
  type BehavioralStoreBinder,
  type BehavioralStoreBindingV1,
} from "@smartergpt/lex/store";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "@smartergpt/lex/runtime-scope";
import { LexSona } from "../../../src/core/lexsona.js";
import { digestConstraintSnapshotValue } from "../../../src/constraints/snapshot.js";

interface ScopeIdentity {
  tenantId: string;
  workspaceId: string;
  repositoryId: string;
  repositoryInstanceId: string;
}

function identity(): ScopeIdentity {
  return {
    tenantId: randomUUID(),
    workspaceId: randomUUID(),
    repositoryId: randomUUID(),
    repositoryInstanceId: randomUUID(),
  };
}

function binding(scope: ScopeIdentity, capabilities: readonly string[]): BehavioralStoreBindingV1 {
  return {
    schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
    authorizedScope: {
      schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
      grantId: randomUUID(),
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      principalId: randomUUID(),
      capabilities,
      authorityVersion: "test-authority-v1",
      scopeVersion: "test-scope-v1",
      authorityDigest: "sha256:test-authority",
      verifiedAt: "2026-07-23T00:00:00.000Z",
    },
    repositoryId: scope.repositoryId,
    repositoryInstanceId: scope.repositoryInstanceId,
  } as BehavioralStoreBindingV1;
}

function persona(personaId: string) {
  return {
    id: personaId,
    version: "1.0.0",
    behavior: {
      primaryFocus: "quality-first",
      domain: "testing",
      description: `Scoped persona ${personaId}`,
    },
    duties: {
      mustDo: [`Honor ${personaId}`],
      mustNotDo: ["Cross an authorized scope"],
    },
    triggers: { phrases: [] },
    ruleCategories: ["quality"],
    requires_memory: true,
  };
}

const tempDirectories: string[] = [];
const openBackends = new Set<SqliteBehavioralStoreBackend>();
const openInstances = new Set<LexSona>();

function backend(options: BehavioralStoreBackendOptionsV1 = {}): SqliteBehavioralStoreBackend {
  const directory = mkdtempSync(join(tmpdir(), "lexsona-scoped-"));
  tempDirectories.push(directory);
  const store = new SqliteBehavioralStoreBackend(join(directory, "behavior.db"), options);
  openBackends.add(store);
  return store;
}

async function connect(config: Parameters<typeof LexSona.connect>[0]): Promise<LexSona> {
  const instance = await LexSona.connect(config);
  openInstances.add(instance);
  return instance;
}

async function seedScope(
  store: SqliteBehavioralStoreBackend,
  scope: ScopeIdentity,
  personaId: string,
  ruleId: string
): Promise<void> {
  const writer = store.bindWrite(
    binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.WRITE, BEHAVIORAL_STORE_CAPABILITIES.PROMOTE])
  );
  await writer.putPersonaRevision({
    idempotencyKey: `${personaId}:persona:v1`,
    value: {
      personaId,
      revision: "1",
      content: persona(personaId),
    },
  });
  await writer.putRuleRevision({
    idempotencyKey: `${ruleId}:rule:v1`,
    value: {
      ruleId,
      revision: "1",
      category: "quality",
      directive: `Apply ${ruleId}`,
      severity: "must",
      applicability: { layer: "workspace" },
      confidencePrior: { alpha: 2, beta: 1 },
    },
  });
  await writer.close();
}

function instrumentedBinder(
  store: SqliteBehavioralStoreBackend,
  onSnapshot: (query?: BehavioralSnapshotQueryV1) => void,
  transform: (snapshot: BehavioralSnapshotV1) => BehavioralSnapshotV1 = (snapshot) => snapshot
): BehavioralStoreBinder {
  return {
    bindRead: (storeBinding) => {
      const read = store.bindRead(storeBinding);
      return {
        binding: read.binding,
        getSnapshot: async (query) => {
          onSnapshot(query);
          return transform(await read.getSnapshot(query));
        },
        getPersona: (personaId, options) => read.getPersona(personaId, options),
        getRule: (ruleId, options) => read.getRule(ruleId, options),
        close: () => read.close(),
      };
    },
    bindWrite: (storeBinding) => store.bindWrite(storeBinding),
    close: () => store.close(),
  };
}

afterEach(async () => {
  try {
    await Promise.all([...openInstances].map((instance) => instance.closeAsync()));
  } finally {
    openInstances.clear();
    try {
      await Promise.all([...openBackends].map((store) => store.close()));
    } finally {
      openBackends.clear();
      while (tempDirectories.length > 0) {
        rmSync(tempDirectories.pop()!, { recursive: true, force: true });
      }
    }
  }
});

describe("scoped behavioral bindings", () => {
  it("derives through a read-only binding and independently denies mutation", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_read-only", "read-only-rule");

    const sona = await connect({
      store,
      binding: binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_read-only", revision: "1" },
      mode: "read-only",
    });

    const config = sona.getConfig();
    expect(config).toEqual({
      personaRef: { personaId: "quality-first_read-only", revision: "1" },
      mode: "read-only",
    });
    expect("store" in config).toBe(false);
    expect("binding" in config).toBe(false);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.personaRef)).toBe(true);

    const result = await sona.deriveConstraints({});
    expect(result.personaId).toBe("quality-first_read-only");
    expect(result.metadata.offlineMode).toBe(false);
    expect(
      result.constraints.some((constraint) => constraint.text === "Apply read-only-rule")
    ).toBe(true);
    const snapshot = await sona.deriveConstraintSnapshot({});
    expect(snapshot.diagnostics?.provenanceRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    const receipt = await sona.deriveScopedConstraintReceipt({});
    expect(receipt.contract).toBe("ScopedConstraintReceipt_v1");
    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.mode).toBe("read-only");
    expect(receipt.binding.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt.binding).toMatchObject({
      schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
      scopeSchemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      repositoryId: scope.repositoryId,
      repositoryInstanceId: scope.repositoryInstanceId,
      capabilities: [BEHAVIORAL_STORE_CAPABILITIES.READ],
    });
    const { digest: bindingDigest, ...bindingPayload } = receipt.binding;
    expect(bindingDigest).toBe(behavioralContentDigest(bindingPayload));
    expect(receipt.requestedPersona).toEqual({
      personaId: "quality-first_read-only",
      revision: "1",
    });
    expect(receipt.selectedPersona).toMatchObject({
      personaId: "quality-first_read-only",
      revision: "1",
    });
    expect(receipt.manifestPersona).toMatchObject({
      id: "quality-first_read-only",
      version: "1.0.0",
    });
    expect(receipt.behavioralSnapshot.snapshotRevision).toBe(
      receipt.constraintSnapshot.diagnostics?.provenanceRef
    );
    const { digest: receiptDigest, ...receiptPayload } = receipt;
    expect(receiptDigest).toBe(digestConstraintSnapshotValue(receiptPayload));
    await expect(
      sona.putRuleRevision({
        idempotencyKey: "denied",
        value: {
          ruleId: "denied",
          revision: "1",
          category: "quality",
          directive: "Must not be written",
          severity: "must",
          applicability: { layer: "workspace" },
          confidencePrior: { alpha: 2, beta: 1 },
        },
      })
    ).rejects.toThrow('requires mode "read-write"');

    expect(sona.close()).toBeUndefined();
    await sona.closeAsync();
    await store.close();
  });

  it("uses explicit idempotent revision and evidence writes in read-write mode", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_learning", "existing-rule");

    const sona = await connect({
      store,
      binding: binding(scope, [
        BEHAVIORAL_STORE_CAPABILITIES.READ,
        BEHAVIORAL_STORE_CAPABILITIES.WRITE,
      ]),
      personaRef: { personaId: "quality-first_learning" },
      mode: "read-write",
    });

    const write = await sona.putRuleRevision({
      idempotencyKey: "new-rule:v1",
      value: {
        ruleId: "new-rule",
        revision: "1",
        category: "quality",
        directive: "Use explicit scoped evidence",
        severity: "should",
        applicability: { layer: "workspace" },
        confidencePrior: { alpha: 2, beta: 1 },
      },
    });
    expect(write.status).toBe("applied");

    const evidence = await sona.recordEvidence({
      idempotencyKey: "new-rule:observation:1",
      ruleId: "new-rule",
      ruleRevision: "1",
      kind: "observation",
      sourceFrameIds: ["frame-scoped-test"],
    });
    expect(evidence.status).toBe("applied");

    // Writes before the first read are included in the captured snapshot.
    const pinnedRules = await sona.getRules();
    expect(pinnedRules.map((rule) => rule.rule_id)).toContain("new-rule");
    await sona.putRuleRevision({
      idempotencyKey: "late-rule:v1",
      value: {
        ruleId: "late-rule",
        revision: "1",
        category: "quality",
        directive: "Written after the derivation snapshot was pinned",
        severity: "should",
        applicability: { layer: "workspace" },
        confidencePrior: { alpha: 2, beta: 1 },
      },
    });
    expect((await sona.getRules()).map((rule) => rule.rule_id)).toContain("late-rule");
    await expect(sona.deriveScopedConstraintReceipt({})).rejects.toThrow(
      'requires a scoped LexSona connection in mode "read-only"'
    );
    await expect(
      sona.learn({ correction: "Ambiguous legacy mutation", context: {} })
    ).rejects.toThrow("cannot invent revisions or idempotency keys");

    await sona.closeAsync();
    await store.close();
  });

  it("rejects receipt composition before reading when the binding carries extra capability", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_overbound", "overbound-rule");
    let snapshotReads = 0;
    const observedStore = instrumentedBinder(store, () => snapshotReads++);
    const sona = await connect({
      store: observedStore,
      binding: binding(scope, [
        BEHAVIORAL_STORE_CAPABILITIES.READ,
        BEHAVIORAL_STORE_CAPABILITIES.WRITE,
      ]),
      personaRef: { personaId: "quality-first_overbound" },
      mode: "read-only",
    });

    await expect(sona.deriveScopedConstraintReceipt({})).rejects.toThrow(
      'requires exact capability set ["behavior:read"]'
    );
    expect(snapshotReads).toBe(0);
    await sona.closeAsync();
    await store.close();
  });

  it("rejects a read service that returns a different validated binding", async () => {
    const store = backend();
    const requestedScope = identity();
    const returnedScope = identity();
    const requestedBinding = binding(requestedScope, [BEHAVIORAL_STORE_CAPABILITIES.READ]);
    const returnedBinding = binding(returnedScope, [BEHAVIORAL_STORE_CAPABILITIES.READ]);
    const mismatchedBinder: BehavioralStoreBinder = {
      bindRead: () => store.bindRead(returnedBinding),
      bindWrite: (storeBinding) => store.bindWrite(storeBinding),
      close: () => store.close(),
    };

    await expect(
      LexSona.connect({
        store: mismatchedBinder,
        binding: requestedBinding,
        personaRef: { personaId: "quality-first_mismatch" },
        mode: "read-only",
      })
    ).rejects.toThrow("read service returned a different authority binding");
  });

  it("preserves the original binding failure when cleanup also fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scope = identity();
    const storeBinding = binding(scope, [
      BEHAVIORAL_STORE_CAPABILITIES.READ,
      BEHAVIORAL_STORE_CAPABILITIES.WRITE,
    ]);
    const failingBinder: BehavioralStoreBinder = {
      bindRead: () => ({
        binding: storeBinding,
        getSnapshot: async () => {
          throw new Error("not reached");
        },
        getPersona: async () => null,
        getRule: async () => null,
        close: () => {
          throw new Error("cleanup failed");
        },
      }),
      bindWrite: () => {
        throw new Error("original bind failure");
      },
      close: async () => undefined,
    };

    await expect(
      LexSona.connect({
        store: failingBinder,
        binding: storeBinding,
        personaRef: { personaId: "quality-first_cleanup" },
        mode: "read-write",
      })
    ).rejects.toThrow("original bind failure");
    expect(warning).toHaveBeenCalledWith(
      "LexSona: 1 scoped cleanup operation(s) failed while preserving the original binding error"
    );
    warning.mockRestore();
  });

  it("finishes an in-flight receipt derivation when close begins concurrently", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_close-race", "close-race-rule");
    const storeBinding = binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]);
    const sourceRead = store.bindRead(storeBinding);
    const snapshot = await sourceRead.getSnapshot();
    await sourceRead.close();

    let releaseSnapshot!: () => void;
    const snapshotReleased = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let snapshotReadStarted!: () => void;
    const snapshotStarted = new Promise<void>((resolve) => {
      snapshotReadStarted = resolve;
    });
    const delayedBinder: BehavioralStoreBinder = {
      bindRead: () => ({
        binding: storeBinding,
        getSnapshot: async () => {
          snapshotReadStarted();
          await snapshotReleased;
          return snapshot;
        },
        getPersona: async () => null,
        getRule: async () => null,
        close: async () => undefined,
      }),
      bindWrite: (requestedBinding) => store.bindWrite(requestedBinding),
      close: () => store.close(),
    };
    const sona = await connect({
      store: delayedBinder,
      binding: storeBinding,
      personaRef: { personaId: "quality-first_close-race", revision: "1" },
      mode: "read-only",
    });

    const receiptPromise = sona.deriveScopedConstraintReceipt({});
    await snapshotStarted;
    const closePromise = sona.closeAsync();
    releaseSnapshot();

    await expect(receiptPromise).resolves.toMatchObject({
      selectedPersona: { personaId: "quality-first_close-race", revision: "1" },
    });
    await closePromise;
  });

  it("contains concurrent reads across the ratified two-tenant/five-workspace topology", async () => {
    const store = backend();
    const topology = Array.from({ length: 5 }, (_, index) => ({
      ...identity(),
      tenantId:
        index < 3 ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002",
      personaId: `quality-first_workspace-${index + 1}`,
      ruleId: `workspace-${index + 1}-rule`,
    }));

    for (const entry of topology) {
      await seedScope(store, entry, entry.personaId, entry.ruleId);
    }

    const instances = await Promise.all(
      topology.map((entry) =>
        connect({
          store,
          binding: binding(entry, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
          personaRef: { personaId: entry.personaId },
          mode: "read-only",
        })
      )
    );
    const results = await Promise.all(instances.map((sona) => sona.deriveConstraints({})));

    for (const [index, result] of results.entries()) {
      const expected = topology[index];
      expect(result.personaId).toBe(expected.personaId);
      expect(
        result.constraints.some((constraint) => constraint.text === `Apply ${expected.ruleId}`)
      ).toBe(true);
      for (const other of topology.filter((entry) => entry !== expected)) {
        expect(
          result.constraints.some((constraint) => constraint.text === `Apply ${other.ruleId}`)
        ).toBe(false);
      }
    }

    await Promise.all(instances.map((sona) => sona.closeAsync()));
    await store.close();
  });

  it("fails closed when the selected persona revision is absent from the authorized scope", async () => {
    const store = backend();
    const victim = identity();
    const attacker = identity();
    await seedScope(store, victim, "quality-first_victim", "victim-rule");
    await seedScope(store, attacker, "quality-first_attacker", "attacker-rule");

    const sona = await connect({
      store,
      binding: binding(attacker, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_victim" },
      mode: "read-only",
    });
    await expect(sona.deriveConstraints({})).rejects.toThrow(
      "is not present in the authorized behavioral snapshot"
    );
    await sona.closeAsync();
    await store.close();
  });

  it("rejects selected persona rows whose parsed identity or digest does not match", async () => {
    const store = backend();
    const scope = identity();
    const writer = store.bindWrite(binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.WRITE]));
    await writer.putPersonaRevision({
      idempotencyKey: "selected-persona:mismatched-id",
      value: {
        personaId: "quality-first_selected",
        revision: "1",
        content: persona("quality-first_different"),
      },
    });
    await writer.close();

    const mismatchedPersona = await connect({
      store,
      binding: binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_selected", revision: "1" },
      mode: "read-only",
    });
    await expect(mismatchedPersona.deriveConstraints({})).rejects.toThrow(
      "selected quality-first_selected@1, parsed quality-first_different@1.0.0"
    );
    await mismatchedPersona.closeAsync();

    const digestStore = backend();
    const digestScope = identity();
    await seedScope(digestStore, digestScope, "quality-first_digest", "digest-rule");
    const tampered = instrumentedBinder(
      digestStore,
      () => undefined,
      (snapshot) => ({
        ...snapshot,
        personas: snapshot.personas.map((revision) => ({
          ...revision,
          contentDigest: `sha256:${"0".repeat(64)}`,
        })),
      })
    );
    const mismatchedDigest = await connect({
      store: tampered,
      binding: binding(digestScope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_digest", revision: "1" },
      mode: "read-only",
    });
    await expect(mismatchedDigest.deriveConstraints({})).rejects.toThrow(
      "content digest does not match its snapshot revision"
    );
    await mismatchedDigest.closeAsync();

    await Promise.all([store.close(), digestStore.close()]);
  });

  it("rejects behavioral snapshot and baseline digest tampering", async () => {
    const scope = identity();
    const store = backend();
    await seedScope(store, scope, "quality-first_snapshot", "snapshot-rule");
    const ruleTampered = instrumentedBinder(
      store,
      () => undefined,
      (snapshot) => ({
        ...snapshot,
        rules: snapshot.rules.map((rule) => ({
          ...rule,
          directive: `${rule.directive} tampered`,
        })),
      })
    );
    const ruleSona = await connect({
      store: ruleTampered,
      binding: binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_snapshot", revision: "1" },
      mode: "read-only",
    });
    await expect(ruleSona.deriveScopedConstraintReceipt({})).rejects.toThrow(
      "behavioral snapshot content digest does not match"
    );

    const baselineContent = { principles: [{ id: "reviewed", description: "Reviewed input" }] };
    const baselineStore = backend({
      baselines: [
        {
          source: "curated-global",
          baselineId: "reviewed-baseline",
          revision: "1",
          contentDigest: behavioralContentDigest(baselineContent),
          content: baselineContent,
          reviewedAt: "2026-08-22T00:00:00.000Z",
        },
      ],
    });
    const baselineScope = identity();
    await seedScope(baselineStore, baselineScope, "quality-first_baseline", "baseline-rule");
    const baselineTampered = instrumentedBinder(
      baselineStore,
      () => undefined,
      (snapshot) => ({
        ...snapshot,
        baselines: snapshot.baselines.map((baseline) => ({
          ...baseline,
          content: { tampered: true },
        })),
      })
    );
    const baselineSona = await connect({
      store: baselineTampered,
      binding: binding(baselineScope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_baseline", revision: "1" },
      mode: "read-only",
    });
    await expect(baselineSona.deriveScopedConstraintReceipt({})).rejects.toThrow(
      "baseline reviewed-baseline@1 content digest does not match"
    );
  });

  it("captures one immutable snapshot and replays it after latest state advances", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_pinned", "pinned-rule");
    const snapshotQueries: Array<BehavioralSnapshotQueryV1 | undefined> = [];
    const observedStore = instrumentedBinder(store, (query) => {
      snapshotQueries.push(query);
    });
    const sona = await connect({
      store: observedStore,
      binding: binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_pinned", revision: "1" },
      mode: "read-only",
    });

    const runtimeCapabilities = ["structured-edit"];
    const context = {
      module_id: "module-a",
      context_tags: ["z", "a", "a"],
      runtime_capabilities: runtimeCapabilities,
    };
    const firstReceiptPromise = sona.deriveScopedConstraintReceipt(context);
    runtimeCapabilities.push("network");
    const firstReceipt = await firstReceiptPromise;
    expect(firstReceipt.constraintSnapshot.persona.version).toBe("1.0.0");
    expect(firstReceipt.selectedPersona.revision).toBe("1");
    expect(firstReceipt.constraintSnapshot.contentDigest).toBeTruthy();
    expect(snapshotQueries).toEqual([{ moduleId: "module-a", contextTags: ["a", "z"] }]);
    expect(firstReceipt.constraintSnapshot.derivation.context.runtimeCapabilities).toEqual([
      "structured-edit",
    ]);

    const writer = store.bindWrite(binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.WRITE]));
    await writer.putRuleRevision({
      idempotencyKey: "mutable-rule:v1",
      value: {
        ruleId: "mutable-rule",
        revision: "1",
        category: "quality",
        directive: "Apply mutable latest",
        severity: "must",
        applicability: { layer: "workspace" },
        confidencePrior: { alpha: 2, beta: 1 },
      },
    });
    await writer.close();

    const secondReceipt = await sona.deriveScopedConstraintReceipt(context);
    expect(snapshotQueries).toHaveLength(2);
    expect(firstReceipt).not.toEqual(secondReceipt);
    expect(
      firstReceipt.constraintSnapshot.constraints.some(
        (constraint) => constraint.text === "Apply pinned-rule"
      )
    ).toBe(true);
    expect(
      firstReceipt.constraintSnapshot.constraints.some(
        (constraint) => constraint.text === "Apply mutable latest"
      )
    ).toBe(false);
    expect(
      secondReceipt.constraintSnapshot.constraints.some(
        (constraint) => constraint.text === "Apply mutable latest"
      )
    ).toBe(true);
    expect(secondReceipt.constraintSnapshot.diagnostics?.provenanceRef).toMatch(
      /^sha256:[0-9a-f]{64}$/
    );
    const spoofed = await (sona.deriveScopedConstraintReceipt as any)(context, {
      engineVersion: "spoofed",
      provenanceRef: "spoofed",
      bindings: { tenant: "spoofed" },
      authorityCeiling: {
        readGlobs: ["**/*"],
        writeGlobs: ["**/*"],
        denyGlobs: [],
        crossRepoAllowed: true,
      },
    });
    expect(spoofed).toEqual(secondReceipt);
    expect(spoofed.constraintSnapshot.engine.version).not.toBe("spoofed");
    expect(spoofed.constraintSnapshot.bindings).toBeUndefined();
    expect(spoofed.constraintSnapshot.authority.grantsAuthority).toBe(false);
    expect(snapshotQueries).toHaveLength(3);
    const otherContext = await sona.deriveScopedConstraintReceipt({ module_id: "module-b" });
    expect(otherContext.constraintSnapshot.derivation.context.moduleId).toBe("module-b");
    expect(snapshotQueries[3]).toEqual({ moduleId: "module-b" });
    expect(Object.isFrozen(firstReceipt)).toBe(true);
    expect(Object.isFrozen(firstReceipt.constraintSnapshot.constraints)).toBe(true);

    await sona.closeAsync();
    await store.close();
  });
});

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  SqliteBehavioralStoreBackend,
  type BehavioralStoreBindingV1,
} from "@smartergpt/lex/store";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "@smartergpt/lex/runtime-scope";
import { LexSona } from "../../../src/core/lexsona.js";

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

function backend(): SqliteBehavioralStoreBackend {
  const directory = mkdtempSync(join(tmpdir(), "lexsona-scoped-"));
  tempDirectories.push(directory);
  return new SqliteBehavioralStoreBackend(join(directory, "behavior.db"));
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

afterEach(() => {
  while (tempDirectories.length > 0) {
    rmSync(tempDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("scoped behavioral bindings", () => {
  it("derives through a read-only binding and independently denies mutation", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_read-only", "read-only-rule");

    const sona = await LexSona.connect({
      store,
      binding: binding(scope, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_read-only", revision: "1" },
      mode: "read-only",
    });

    const result = await sona.deriveConstraints({});
    expect(result.personaId).toBe("quality-first_read-only");
    expect(result.metadata.offlineMode).toBe(false);
    expect(
      result.constraints.some((constraint) => constraint.text === "Apply read-only-rule")
    ).toBe(true);
    const snapshot = await sona.deriveConstraintSnapshot({});
    expect(snapshot.diagnostics?.provenanceRef).toMatch(/^sha256:[0-9a-f]{64}$/);
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

    await sona.close();
    await store.close();
  });

  it("uses explicit idempotent revision and evidence writes in read-write mode", async () => {
    const store = backend();
    const scope = identity();
    await seedScope(store, scope, "quality-first_learning", "existing-rule");

    const sona = await LexSona.connect({
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

    const rules = await sona.getRules();
    expect(rules.map((rule) => rule.rule_id)).toContain("new-rule");
    await expect(
      sona.learn({ correction: "Ambiguous legacy mutation", context: {} })
    ).rejects.toThrow("cannot invent revisions or idempotency keys");

    await sona.close();
    await store.close();
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
        LexSona.connect({
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

    await Promise.all(instances.map((sona) => sona.close()));
    await store.close();
  });

  it("fails closed when the selected persona revision is absent from the authorized scope", async () => {
    const store = backend();
    const victim = identity();
    const attacker = identity();
    await seedScope(store, victim, "quality-first_victim", "victim-rule");
    await seedScope(store, attacker, "quality-first_attacker", "attacker-rule");

    const sona = await LexSona.connect({
      store,
      binding: binding(attacker, [BEHAVIORAL_STORE_CAPABILITIES.READ]),
      personaRef: { personaId: "quality-first_victim" },
      mode: "read-only",
    });

    await expect(sona.deriveConstraints({})).rejects.toThrow(
      "is not present in the authorized behavioral snapshot"
    );
    await sona.close();
    await store.close();
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  openPostgresBehavioralStore,
  type BehavioralStoreBinder,
  type BehavioralStoreBindingV1,
} from "@smartergpt/lex/store";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "@smartergpt/lex/runtime-scope";
import { LexSona } from "../../src/core/lexsona.js";

const runtimeUrl = process.env.LEXSONA_TEST_POSTGRES_RUNTIME_URL;
const schema = process.env.LEXSONA_TEST_POSTGRES_SCHEMA;
const integration = runtimeUrl && schema ? describe : describe.skip;

function binding(
  tenantId: string,
  workspaceId: string,
  repositoryId: string,
  repositoryInstanceId: string
): BehavioralStoreBindingV1 {
  return {
    schemaVersion: BEHAVIORAL_STORE_CONTRACT_VERSION,
    authorizedScope: {
      schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
      grantId: randomUUID(),
      tenantId,
      workspaceId,
      principalId: randomUUID(),
      capabilities: [BEHAVIORAL_STORE_CAPABILITIES.READ, BEHAVIORAL_STORE_CAPABILITIES.WRITE],
      authorityVersion: "postgres-proof-v1",
      scopeVersion: "postgres-proof-v1",
      authorityDigest: "sha256:postgres-proof",
      verifiedAt: "2026-07-23T00:00:00.000Z",
    },
    repositoryId,
    repositoryInstanceId,
  } as BehavioralStoreBindingV1;
}

integration("scoped PostgreSQL LexSona adapter", () => {
  let store: BehavioralStoreBinder;

  beforeAll(() => {
    store = openPostgresBehavioralStore(runtimeUrl!, { schema: schema! });
  });

  afterAll(async () => {
    await store?.close();
  });

  it("derives through the same API and rejects a cross-workspace persona lookup", async () => {
    const victim = binding(randomUUID(), randomUUID(), randomUUID(), randomUUID());
    const attacker = binding(randomUUID(), randomUUID(), randomUUID(), randomUUID());
    const writer = store.bindWrite(victim);
    await writer.putPersonaRevision({
      idempotencyKey: "postgres-persona:v1",
      value: {
        personaId: "quality-first_postgres",
        revision: "1",
        content: {
          id: "quality-first_postgres",
          version: "1.0.0",
          behavior: {
            primaryFocus: "quality-first",
            domain: "testing",
            description: "PostgreSQL scoped adapter proof",
          },
          duties: {
            mustDo: ["Preserve the authenticated scope"],
            mustNotDo: ["Use ambient authority"],
          },
          triggers: { phrases: [] },
          ruleCategories: ["quality"],
          requires_memory: true,
        },
      },
    });
    await writer.putRuleRevision({
      idempotencyKey: "postgres-rule:v1",
      value: {
        ruleId: "postgres-scoped-rule",
        revision: "1",
        category: "quality",
        directive: "Derive through the PostgreSQL scoped service",
        severity: "must",
        applicability: { layer: "workspace" },
        confidencePrior: { alpha: 2, beta: 1 },
      },
    });
    await writer.close();

    const victimSona = await LexSona.connect({
      store,
      binding: victim,
      personaRef: { personaId: "quality-first_postgres" },
      mode: "read-only",
    });
    const result = await victimSona.deriveConstraints({});
    expect(
      result.constraints.some(
        (constraint) => constraint.text === "Derive through the PostgreSQL scoped service"
      )
    ).toBe(true);

    const attackerSona = await LexSona.connect({
      store,
      binding: attacker,
      personaRef: { personaId: "quality-first_postgres" },
      mode: "read-only",
    });
    await expect(attackerSona.deriveConstraints({})).rejects.toThrow(
      "is not present in the authorized behavioral snapshot"
    );

    await Promise.all([victimSona.close(), attackerSona.close()]);
  });
});

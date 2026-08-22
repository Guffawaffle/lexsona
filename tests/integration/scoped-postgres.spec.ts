import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as lexStore from "@smartergpt/lex/store";
import {
  BEHAVIORAL_STORE_CAPABILITIES,
  BEHAVIORAL_STORE_CONTRACT_VERSION,
  openPostgresBehavioralStore,
  type BehavioralStoreBinder,
  type BehavioralStoreBindingV1,
} from "@smartergpt/lex/store";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "@smartergpt/lex/runtime-scope";
import { LexSona } from "../../src/core/lexsona.js";

const adminUrl = process.env.LEXSONA_TEST_POSTGRES_ADMIN_URL;
const schema = process.env.LEXSONA_TEST_POSTGRES_SCHEMA;
const integration = adminUrl && schema ? describe : describe.skip;
const protectedRelations = [
  "lex_behavioral_persona_revisions",
  "lex_behavioral_rule_revisions",
  "lex_behavioral_evidence",
  "lex_behavioral_promotions",
  "lex_behavioral_write_receipts",
] as const;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

type MigratePostgresBehavioralStore = (client: PoolClient, schema: string) => Promise<void>;

async function resolveBehavioralMigration(): Promise<MigratePostgresBehavioralStore> {
  const publicMigration = (
    lexStore as unknown as {
      migratePostgresBehavioralStore?: MigratePostgresBehavioralStore;
    }
  ).migratePostgresBehavioralStore;
  if (publicMigration) {
    return publicMigration;
  }

  // Lex 4.0.0 shipped the migration implementation but omitted it from the
  // public store entrypoint. Keep this compatibility path test-only while the
  // coordinated Lex export correction reaches a published package.
  const storeModuleUrl = import.meta.resolve("@smartergpt/lex/store");
  const migrationModuleUrl = new URL("./postgres/behavioral-migrations.js", storeModuleUrl).href;
  const internalModule = (await import(migrationModuleUrl)) as {
    migratePostgresBehavioralStore?: MigratePostgresBehavioralStore;
  };
  if (!internalModule.migratePostgresBehavioralStore) {
    throw new Error("Lex PostgreSQL behavioral migration API is unavailable");
  }
  return internalModule.migratePostgresBehavioralStore;
}

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
  let adminPool: Pool;
  let runtimePool: Pool;
  let runtimeRole: string;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: adminUrl!, allowExitOnIdle: true });
    const client = await adminPool.connect();
    try {
      if (!/^[a-z_][a-z0-9_]*$/i.test(schema!)) {
        throw new Error(`Unsafe PostgreSQL test schema: ${schema}`);
      }
      await client.query(`CREATE SCHEMA ${quoteIdentifier(schema!)}`);
      const migrate = await resolveBehavioralMigration();
      await migrate(client, schema!);

      const rls = await client.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
           FROM pg_catalog.pg_class AS c
           JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname = $1
            AND c.relname = ANY($2::text[])
          ORDER BY c.relname`,
        [schema!, protectedRelations]
      );
      expect(rls.rows).toEqual(
        [...protectedRelations]
          .sort()
          .map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true }))
      );
    } finally {
      client.release();
    }

    runtimeRole = `lexsona_runtime_${process.pid}_${randomUUID().replaceAll("-", "")}`;
    const runtimePassword = randomUUID();
    const target = quoteIdentifier(schema!);
    const role = quoteIdentifier(runtimeRole);
    await adminPool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}'`);
    await adminPool.query(`
      REVOKE CREATE ON SCHEMA ${target} FROM PUBLIC;
      REVOKE CREATE ON SCHEMA ${target} FROM ${role};
      GRANT USAGE ON SCHEMA ${target} TO ${role};
      GRANT SELECT ON ${target}.lex_behavioral_store_migrations TO ${role};
      GRANT SELECT, INSERT ON
        ${target}.lex_behavioral_persona_revisions,
        ${target}.lex_behavioral_rule_revisions,
        ${target}.lex_behavioral_evidence,
        ${target}.lex_behavioral_promotions,
        ${target}.lex_behavioral_write_receipts
      TO ${role};
      GRANT EXECUTE ON FUNCTION ${target}.lex_behavioral_runtime_scope_matches(UUID, UUID, UUID, UUID)
      TO ${role};
    `);

    const runtime = new URL(adminUrl!);
    runtime.username = runtimeRole;
    runtime.password = runtimePassword;
    const runtimeUrl = runtime.href;
    runtimePool = new Pool({ connectionString: runtimeUrl, allowExitOnIdle: true });
    store = openPostgresBehavioralStore(runtimeUrl, { schema: schema! });
  });

  afterAll(async () => {
    try {
      await store?.close();
    } finally {
      try {
        await runtimePool?.end();
      } finally {
        if (adminPool) {
          try {
            await adminPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema!)} CASCADE`);
            if (runtimeRole) {
              await adminPool.query(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`);
            }
          } finally {
            await adminPool.end();
          }
        }
      }
    }
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
    let attackerSona: LexSona | undefined;
    try {
      const result = await victimSona.deriveConstraints({});
      expect(
        result.constraints.some(
          (constraint) => constraint.text === "Derive through the PostgreSQL scoped service"
        )
      ).toBe(true);

      attackerSona = await LexSona.connect({
        store,
        binding: attacker,
        personaRef: { personaId: "quality-first_postgres" },
        mode: "read-only",
      });
      await expect(attackerSona.deriveConstraints({})).rejects.toThrow(
        "is not present in the authorized behavioral snapshot"
      );

      const direct = await runtimePool.connect();
      try {
        await direct.query("BEGIN READ ONLY");
        await direct.query(
          `SELECT
             set_config('lex.tenant_id', $1, true),
             set_config('lex.workspace_id', $2, true),
             set_config('lex.repository_id', $3, true),
             set_config('lex.repository_instance_id', $4, true),
             set_config('lex.principal_id', $5, true)`,
          [
            attacker.authorizedScope.tenantId,
            attacker.authorizedScope.workspaceId,
            attacker.repositoryId,
            attacker.repositoryInstanceId,
            attacker.authorizedScope.principalId,
          ]
        );
        const unfiltered = await direct.query(
          `SELECT persona_id FROM ${quoteIdentifier(schema!)}.lex_behavioral_persona_revisions`
        );
        expect(unfiltered.rows).toEqual([]);
        await direct.query("COMMIT");
      } catch (error) {
        await direct.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        direct.release();
      }
    } finally {
      await Promise.all([
        victimSona.closeAsync(),
        ...(attackerSona ? [attackerSona.closeAsync()] : []),
      ]);
    }
  });
});

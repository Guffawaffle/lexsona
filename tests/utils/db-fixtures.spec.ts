/**
 * Tests for Database Test Fixtures
 *
 * Validates that db-fixtures utilities work correctly for test isolation.
 */

import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "fs";
import Database from "better-sqlite3-multiple-ciphers";
import {
  createIsolatedTestDb,
  withTestEnv,
  withTestEnvSync,
  type IsolatedTestDb,
} from "./db-fixtures.js";

describe("Database Test Fixtures", () => {
  let testDb: IsolatedTestDb | null = null;

  afterEach(() => {
    // Clean up any test database created during tests
    if (testDb) {
      testDb.cleanup();
      testDb = null;
    }
  });

  describe("createIsolatedTestDb", () => {
    it("creates a temporary database with default options", () => {
      testDb = createIsolatedTestDb();

      expect(testDb.db).toBeDefined();
      expect(testDb.path).toBeDefined();
      expect(testDb.cleanup).toBeDefined();
      expect(existsSync(testDb.path)).toBe(true);
    });

    it("creates lexsona_behavior_rules table by default", () => {
      testDb = createIsolatedTestDb();

      const tables = testDb.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_behavior_rules'"
        )
        .all();

      expect(tables).toHaveLength(1);
    });

    it("does not create personas table by default", () => {
      testDb = createIsolatedTestDb();

      const tables = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personas'")
        .all();

      expect(tables).toHaveLength(0);
    });

    it("creates personas table when requested", () => {
      testDb = createIsolatedTestDb({ createPersonasTable: true });

      const tables = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personas'")
        .all();

      expect(tables).toHaveLength(1);
    });

    it("creates schema_version table when requested", () => {
      testDb = createIsolatedTestDb({ createSchemaVersionTable: true, schemaVersion: 10 });

      const tables = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .all();

      expect(tables).toHaveLength(1);

      // Verify version was inserted
      const version = testDb.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as {
        version: number;
      };
      expect(version.version).toBe(10);
    });

    it("can skip creating rules table", () => {
      testDb = createIsolatedTestDb({ createRulesTable: false });

      const tables = testDb.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_behavior_rules'"
        )
        .all();

      expect(tables).toHaveLength(0);
    });

    it("closes database after setup when requested", () => {
      testDb = createIsolatedTestDb({ closeAfterSetup: true });

      expect(testDb.db.open).toBe(false);
    });

    it("keeps database open by default", () => {
      testDb = createIsolatedTestDb();

      expect(testDb.db.open).toBe(true);
    });

    it("cleanup removes database file", () => {
      testDb = createIsolatedTestDb();
      const dbPath = testDb.path;

      expect(existsSync(dbPath)).toBe(true);

      testDb.cleanup();

      expect(existsSync(dbPath)).toBe(false);
    });

    it("cleanup closes database if still open", () => {
      testDb = createIsolatedTestDb();

      expect(testDb.db.open).toBe(true);

      testDb.cleanup();

      expect(testDb.db.open).toBe(false);
    });

    it("creates unique database paths for each call", () => {
      const db1 = createIsolatedTestDb();
      const db2 = createIsolatedTestDb();

      try {
        expect(db1.path).not.toBe(db2.path);
      } finally {
        db1.cleanup();
        db2.cleanup();
      }
    });
  });

  describe("withTestEnv", () => {
    it("temporarily sets LEX_DB_PATH", async () => {
      const originalEnv = process.env.LEX_DB_PATH;
      testDb = createIsolatedTestDb();

      let envDuringTest: string | undefined;

      await withTestEnv(testDb.path, async () => {
        envDuringTest = process.env.LEX_DB_PATH;
      });

      expect(envDuringTest).toBe(testDb.path);
      expect(process.env.LEX_DB_PATH).toBe(originalEnv);
    });

    it("restores LEX_DB_PATH even if function throws", async () => {
      const originalEnv = process.env.LEX_DB_PATH;
      testDb = createIsolatedTestDb();

      await expect(
        withTestEnv(testDb.path, async () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");

      expect(process.env.LEX_DB_PATH).toBe(originalEnv);
    });

    it("handles undefined original LEX_DB_PATH", async () => {
      const originalEnv = process.env.LEX_DB_PATH;
      delete process.env.LEX_DB_PATH;

      testDb = createIsolatedTestDb();

      await withTestEnv(testDb.path, async () => {
        expect(process.env.LEX_DB_PATH).toBe(testDb!.path);
      });

      expect(process.env.LEX_DB_PATH).toBeUndefined();

      // Restore original
      if (originalEnv !== undefined) {
        process.env.LEX_DB_PATH = originalEnv;
      }
    });
  });

  describe("withTestEnvSync", () => {
    it("temporarily sets LEX_DB_PATH synchronously", () => {
      const originalEnv = process.env.LEX_DB_PATH;
      testDb = createIsolatedTestDb();

      let envDuringTest: string | undefined;

      withTestEnvSync(testDb.path, () => {
        envDuringTest = process.env.LEX_DB_PATH;
      });

      expect(envDuringTest).toBe(testDb.path);
      expect(process.env.LEX_DB_PATH).toBe(originalEnv);
    });

    it("restores LEX_DB_PATH even if function throws", () => {
      const originalEnv = process.env.LEX_DB_PATH;
      testDb = createIsolatedTestDb();

      expect(() => {
        withTestEnvSync(testDb!.path, () => {
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      expect(process.env.LEX_DB_PATH).toBe(originalEnv);
    });

    it("handles undefined original LEX_DB_PATH", () => {
      const originalEnv = process.env.LEX_DB_PATH;
      delete process.env.LEX_DB_PATH;

      testDb = createIsolatedTestDb();

      withTestEnvSync(testDb.path, () => {
        expect(process.env.LEX_DB_PATH).toBe(testDb!.path);
      });

      expect(process.env.LEX_DB_PATH).toBeUndefined();

      // Restore original
      if (originalEnv !== undefined) {
        process.env.LEX_DB_PATH = originalEnv;
      }
    });
  });

  describe("Database Schema", () => {
    it("creates lexsona_behavior_rules with correct columns", () => {
      testDb = createIsolatedTestDb();

      const columns = testDb.db
        .prepare("PRAGMA table_info(lexsona_behavior_rules)")
        .all() as Array<{ name: string; type: string }>;

      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("rule_id");
      expect(columnNames).toContain("category");
      expect(columnNames).toContain("text");
      expect(columnNames).toContain("scope");
      expect(columnNames).toContain("alpha");
      expect(columnNames).toContain("beta");
      expect(columnNames).toContain("observation_count");
      expect(columnNames).toContain("severity");
      expect(columnNames).toContain("decay_tau");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
      expect(columnNames).toContain("last_observed");
      expect(columnNames).toContain("frame_id");
    });

    it("creates personas table with correct columns when requested", () => {
      testDb = createIsolatedTestDb({ createPersonasTable: true });

      const columns = testDb.db.prepare("PRAGMA table_info(personas)").all() as Array<{
        name: string;
        type: string;
      }>;

      const columnNames = columns.map((c) => c.name);

      expect(columnNames).toContain("id");
      expect(columnNames).toContain("version");
      expect(columnNames).toContain("manifest_yaml");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("updated_at");
      expect(columnNames).toContain("source");
      expect(columnNames).toContain("checksum");
    });

    it("allows inserting rows into lexsona_behavior_rules", () => {
      testDb = createIsolatedTestDb();

      const now = new Date().toISOString();
      testDb.db
        .prepare(
          `INSERT INTO lexsona_behavior_rules 
           (rule_id, category, text, scope, created_at, updated_at, last_observed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run("test-rule-1", "general", "Test rule", "{}", now, now, now);

      const rows = testDb.db.prepare("SELECT * FROM lexsona_behavior_rules").all();

      expect(rows).toHaveLength(1);
    });
  });
});

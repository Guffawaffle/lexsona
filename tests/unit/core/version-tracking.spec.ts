/**
 * Rule Version Tracking Tests (AX-005)
 *
 * Tests for rule version tracking and cache invalidation signals.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3-multiple-ciphers";
import { LexSona } from "../../../src/core/lexsona.js";

// Helper to create a test database with LexSona tables
function createTestDb(): { db: Database.Database; dbPath: string; cleanup: () => void } {
  const tmpDir = mkdtempSync(join(tmpdir(), "lexsona-version-test-"));
  const dbPath = join(tmpDir, "test.db");
  const db = new Database(dbPath);

  // Create minimal LexSona schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS lexsona_behavior_rules (
      rule_id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '{}',
      alpha REAL NOT NULL DEFAULT 2.0,
      beta REAL NOT NULL DEFAULT 5.0,
      observation_count INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'should',
      decay_tau REAL NOT NULL DEFAULT 30.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_observed TEXT NOT NULL,
      frame_id TEXT
    );
  `);

  const cleanup = () => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  };

  return { db, dbPath, cleanup };
}

describe("Rule Version Tracking (AX-005)", () => {
  describe("Version initialization", () => {
    let testDb: ReturnType<typeof createTestDb>;
    let sona: LexSona;

    beforeEach(async () => {
      testDb = createTestDb();
      sona = await LexSona.connect({ lexDb: testDb.dbPath });
    });

    afterEach(() => {
      sona.close();
      testDb.cleanup();
    });

    it("starts at version 0 for new database", () => {
      expect(sona.getRuleVersion()).toBe(0);
    });

    it("creates metadata table on first access", async () => {
      await sona.incrementRuleVersion();
      
      const tables = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lexsona_metadata'")
        .all();
      
      expect(tables.length).toBe(1);
    });
  });

  describe("Version increment", () => {
    let testDb: ReturnType<typeof createTestDb>;
    let sona: LexSona;

    beforeEach(async () => {
      testDb = createTestDb();
      sona = await LexSona.connect({ lexDb: testDb.dbPath });
    });

    afterEach(() => {
      sona.close();
      testDb.cleanup();
    });

    it("increments version manually", async () => {
      const initialVersion = sona.getRuleVersion();
      
      await sona.learn({
        correction: "Always use TypeScript strict mode",
        severity: "must",
        category: "code_quality",
        polarity: 1,
        context: { module_id: "src/test", project: "test-project" },
      });

      // Manually increment version (as MCP handler would do)
      await sona.incrementRuleVersion();

      const newVersion = sona.getRuleVersion();
      expect(newVersion).toBe(initialVersion + 1);
    });

    it("increments version atomically", async () => {
      const version1 = await sona.incrementRuleVersion();
      const version2 = await sona.incrementRuleVersion();
      const version3 = await sona.incrementRuleVersion();

      expect(version1).toBe(1);
      expect(version2).toBe(2);
      expect(version3).toBe(3);
      expect(sona.getRuleVersion()).toBe(3);
    });

    it("persists version to database", async () => {
      await sona.incrementRuleVersion();
      await sona.incrementRuleVersion();
      const expectedVersion = sona.getRuleVersion();

      // Close and reconnect
      sona.close();
      const sona2 = await LexSona.connect({ lexDb: testDb.dbPath });

      expect(sona2.getRuleVersion()).toBe(expectedVersion);
      
      sona2.close();
    });
  });

  describe("Version in responses", () => {
    let testDb: ReturnType<typeof createTestDb>;
    let sona: LexSona;

    beforeEach(async () => {
      testDb = createTestDb();
      sona = await LexSona.connect({ lexDb: testDb.dbPath });
    });

    afterEach(() => {
      sona.close();
      testDb.cleanup();
    });

    it("includes ruleVersion in deriveConstraints", async () => {
      await sona.activate("quality-first_engineering");
      const result = await sona.deriveConstraints({ domain: "test" });

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof result.ruleVersion).toBe("number");
    });

    it("ruleVersion can be incremented after learning", async () => {
      await sona.activate("quality-first_engineering");
      
      const result1 = await sona.deriveConstraints({ domain: "test" });
      const version1 = result1.ruleVersion;

      await sona.learn({
        correction: "Use strict typing",
        severity: "must",
        category: "code_quality",
        polarity: 1,
        context: { project: "test" },
      });
      
      // Manually increment version (as MCP handler would do)
      await sona.incrementRuleVersion();

      const result2 = await sona.deriveConstraints({ domain: "test" });
      const version2 = result2.ruleVersion;

      expect(version2).toBe(version1! + 1);
    });
  });

  describe("Disconnected mode", () => {
    it("returns version 0 when not connected", async () => {
      const sona = await LexSona.connect({ lexDb: "/nonexistent/path/db.sqlite" });
      expect(sona.getRuleVersion()).toBe(0);
    });

    it("includes ruleVersion in deriveConstraints when disconnected", async () => {
      const sona = await LexSona.connect({ lexDb: "/nonexistent/path/db.sqlite" });
      const result = await sona.deriveConstraints({ domain: "test" });

      expect(result).toHaveProperty("ruleVersion");
      expect(result.ruleVersion).toBe(0);
    });
  });
});

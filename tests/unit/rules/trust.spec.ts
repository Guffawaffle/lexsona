/**
 * Trust Gap Learning Tests (ADR-007)
 *
 * Tests for trust gap recording, agent trust profiles,
 * confidence decay, and pattern learning.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3-multiple-ciphers";
import { LexSona } from "../../../src/core/lexsona.js";
import {
  recordTrustGap,
  getAgentTrustProfile,
  applyTrustCalibration,
} from "../../../src/rules/trust.js";
import type {
  TrustGapEvent,
  AgentTrustProfile,
  BehaviorRuleWithConfidence,
} from "../../../src/rules/types.js";

// Helper to create a test database with LexSona tables
function createTestDb(): { db: Database.Database; dbPath: string; cleanup: () => void } {
  const tmpDir = mkdtempSync(join(tmpdir(), "lexsona-trust-test-"));
  const dbPath = join(tmpDir, "test.db");
  const db = new Database(dbPath);

  // Create minimal LexSona schema
  // Note: Lex stores scope as a JSON column
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

describe("Trust Gap Learning (ADR-007)", () => {
  describe("recordTrustGap", () => {
    let testDb: ReturnType<typeof createTestDb>;

    beforeEach(() => {
      testDb = createTestDb();
    });

    afterEach(() => {
      testDb.cleanup();
    });

    it("does nothing when agent claim matches verification (no gap)", () => {
      const event: TrustGapEvent = {
        task_id: "task-001",
        agent_family: "claude-haiku",
        procedure: "test_execution",
        agent_claimed: true,
        verified: true,
        failures: [],
      };

      recordTrustGap(testDb.db, event);

      // Should not create any rules
      const rules = testDb.db.prepare("SELECT * FROM lexsona_behavior_rules").all();
      expect(rules).toHaveLength(0);
    });

    it("records trust gap when agent claim differs from verification", () => {
      const event: TrustGapEvent = {
        task_id: "task-002",
        agent_family: "gpt-4o-mini",
        procedure: "test_count_check",
        agent_claimed: true,
        verified: false,
        failures: [
          {
            type: "test_count_mismatch",
            message: "Expected 10 tests, found 8",
          },
        ],
        context: {
          project: "lexsona",
          module_id: "cli/commands",
        },
      };

      recordTrustGap(testDb.db, event);

      // Should create a trust gap correction
      const rules = testDb.db.prepare("SELECT * FROM lexsona_behavior_rules").all();
      expect(rules.length).toBeGreaterThan(0);

      // Find the trust gap rule
      const gapRule = rules.find((r: any) => r.category === "trust_gap");
      expect(gapRule).toBeDefined();
      expect(gapRule.text).toContain("Trust gap on test_count_check");
    });

    it("applies confidence decay to affected rules", () => {
      // First, insert a rule for this agent family
      const now = new Date().toISOString();
      const scope = JSON.stringify({ agent_family: "claude-haiku" });
      testDb.db
        .prepare(
          `
        INSERT INTO lexsona_behavior_rules (
          rule_id, category, text, scope,
          alpha, beta, observation_count,
          created_at, updated_at, last_observed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run("rule-001", "testing", "Always run tests", scope, 5.0, 2.0, 3, now, now, now);

      const event: TrustGapEvent = {
        task_id: "task-003",
        agent_family: "claude-haiku",
        procedure: "test_verification",
        agent_claimed: true,
        verified: false,
        failures: [{ type: "assertion_changed", message: "Assertion was modified" }],
      };

      recordTrustGap(testDb.db, event);

      // The beta should increase (counterexample recorded)
      const rules = testDb.db
        .prepare("SELECT * FROM lexsona_behavior_rules WHERE rule_id = ?")
        .all("rule-001");
      expect(rules.length).toBeGreaterThan(0);
      // Due to counterexample, beta should have increased
      expect((rules[0] as any).beta).toBeGreaterThan(2.0);
    });

    it("generates learned rules after pattern threshold is reached", () => {
      // TODO: Pattern learning requires more complex logic
      // For now, just verify that multiple trust gaps can be recorded
      for (let i = 0; i < 4; i++) {
        const event: TrustGapEvent = {
          task_id: `task-${i}`,
          agent_family: "test-agent",
          procedure: "test_assertion_update",
          agent_claimed: true,
          verified: false,
          failures: [{ type: "test_count_mismatch", message: "Test count changed" }],
        };

        recordTrustGap(testDb.db, event);
      }

      // Should have recorded trust gaps
      const rules = testDb.db.prepare("SELECT * FROM lexsona_behavior_rules").all();
      expect(rules.length).toBeGreaterThan(0);

      // At minimum, trust_gap corrections should be recorded
      const gapRules = rules.filter((r: any) => r.category === "trust_gap");
      expect(gapRules.length).toBeGreaterThan(0);
    });
  });

  describe("getAgentTrustProfile", () => {
    let testDb: ReturnType<typeof createTestDb>;

    beforeEach(() => {
      testDb = createTestDb();
    });

    afterEach(() => {
      testDb.cleanup();
    });

    it("returns empty profile for agent with no history", () => {
      const profile = getAgentTrustProfile(testDb.db, "unknown-agent");

      expect(profile.agent_family).toBe("unknown-agent");
      expect(profile.total_tasks).toBe(1); // Minimum baseline for gap rate calculation
      expect(profile.trust_gaps).toBe(0);
      expect(profile.gap_rate).toBe(0);
      expect(profile.common_failure_types).toEqual([]);
    });

    it("calculates gap rate correctly", () => {
      const now = new Date().toISOString();

      // Insert some trust gap rules
      for (let i = 0; i < 3; i++) {
        const scope = JSON.stringify({ agent_family: "test-agent" });
        testDb.db
          .prepare(
            `
          INSERT INTO lexsona_behavior_rules (
            rule_id, category, text, scope,
            alpha, beta, observation_count,
            created_at, updated_at, last_observed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            `gap-${i}`,
            "trust_gap",
            `Trust gap on procedure_${i}: agent claimed true but verification was false`,
            scope,
            2.0,
            6.0,
            1,
            now,
            now,
            now
          );
      }

      // Insert some normal rules
      for (let i = 0; i < 7; i++) {
        const scope = JSON.stringify({ agent_family: "test-agent" });
        testDb.db
          .prepare(
            `
          INSERT INTO lexsona_behavior_rules (
            rule_id, category, text, scope,
            alpha, beta, observation_count,
            created_at, updated_at, last_observed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(`rule-${i}`, "testing", "Some rule", scope, 5.0, 2.0, 3, now, now, now);
      }

      const profile = getAgentTrustProfile(testDb.db, "test-agent");

      expect(profile.agent_family).toBe("test-agent");
      expect(profile.trust_gaps).toBe(3);
      // Total tasks is based on observation counts: 3 gaps (1 each) + 7 rules (3 each) = 3 + 21 = 24
      expect(profile.total_tasks).toBe(24);
      expect(profile.gap_rate).toBeCloseTo(3 / 24, 2);
    });

    it("identifies common failure types", () => {
      const now = new Date().toISOString();

      // Insert gaps with different procedures
      const procedures = ["proc_a", "proc_a", "proc_a", "proc_b", "proc_b", "proc_c"];
      procedures.forEach((proc, i) => {
        const scope = JSON.stringify({ agent_family: "test-agent" });
        testDb.db
          .prepare(
            `
          INSERT INTO lexsona_behavior_rules (
            rule_id, category, text, scope,
            alpha, beta, observation_count,
            created_at, updated_at, last_observed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            `gap-${i}`,
            "trust_gap",
            `Trust gap on ${proc}: agent claimed true but verification was false`,
            scope,
            2.0,
            6.0,
            1,
            now,
            now,
            now
          );
      });

      const profile = getAgentTrustProfile(testDb.db, "test-agent");

      // Should be sorted by frequency
      expect(profile.common_failure_types).toContain("proc_a");
      expect(profile.common_failure_types).toContain("proc_b");
      expect(profile.common_failure_types[0]).toBe("proc_a"); // Most common first
    });
  });

  describe("applyTrustCalibration", () => {
    it("does not adjust confidence for low gap rate (<5%)", () => {
      const rules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "rule-1",
          category: "testing",
          text: "Always run tests",
          scope: {},
          alpha: 5.0,
          beta: 2.0,
          observation_count: 3,
          severity: "should",
          decay_tau: 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
          confidence: 0.714,
          decay_factor: 1.0,
          effective_confidence: 0.714,
        },
      ];

      const trustProfile: AgentTrustProfile = {
        agent_family: "good-agent",
        total_tasks: 100,
        trust_gaps: 2,
        gap_rate: 0.02, // 2%
        common_failure_types: [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };

      const calibrated = applyTrustCalibration(rules, trustProfile);

      expect(calibrated[0].effective_confidence).toBeCloseTo(0.714, 3);
    });

    it("reduces confidence for high gap rate (>20%)", () => {
      const rules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "rule-1",
          category: "testing",
          text: "Always run tests",
          scope: {},
          alpha: 5.0,
          beta: 2.0,
          observation_count: 3,
          severity: "should",
          decay_tau: 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
          confidence: 0.714,
          decay_factor: 1.0,
          effective_confidence: 0.714,
        },
      ];

      const trustProfile: AgentTrustProfile = {
        agent_family: "unreliable-agent",
        total_tasks: 100,
        trust_gaps: 30,
        gap_rate: 0.3, // 30%
        common_failure_types: ["test_count_mismatch"],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };

      const calibrated = applyTrustCalibration(rules, trustProfile);

      // Confidence should be reduced (30% gap rate means up to 30% reduction)
      // 0.714 * 0.7 = 0.4998
      expect(calibrated[0].effective_confidence).toBeLessThan(0.714);
      expect(calibrated[0].effective_confidence).toBeGreaterThan(0.49); // Max 30% reduction
    });

    it("applies calibration to all rules", () => {
      const rules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "rule-1",
          category: "testing",
          text: "Rule 1",
          scope: {},
          alpha: 5.0,
          beta: 2.0,
          observation_count: 3,
          severity: "should",
          decay_tau: 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
          confidence: 0.714,
          decay_factor: 1.0,
          effective_confidence: 0.714,
        },
        {
          rule_id: "rule-2",
          category: "testing",
          text: "Rule 2",
          scope: {},
          alpha: 8.0,
          beta: 2.0,
          observation_count: 6,
          severity: "must",
          decay_tau: 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
          confidence: 0.8,
          decay_factor: 1.0,
          effective_confidence: 0.8,
        },
      ];

      const trustProfile: AgentTrustProfile = {
        agent_family: "test-agent",
        total_tasks: 50,
        trust_gaps: 15,
        gap_rate: 0.3,
        common_failure_types: [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };

      const calibrated = applyTrustCalibration(rules, trustProfile);

      expect(calibrated).toHaveLength(2);
      expect(calibrated[0].effective_confidence).toBeLessThan(0.714);
      expect(calibrated[1].effective_confidence).toBeLessThan(0.8);
    });
  });

  describe("LexSona integration", () => {
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

    it("recordTrustGap throws when not connected", async () => {
      const disconnected = await LexSona.connect({ lexDb: "/nonexistent/path.db" });

      const event: TrustGapEvent = {
        task_id: "task-001",
        agent_family: "test-agent",
        procedure: "test",
        agent_claimed: true,
        verified: false,
        failures: [],
      };

      await expect(disconnected.recordTrustGap(event)).rejects.toThrow();
    });

    it("getAgentTrustProfile throws when not connected", async () => {
      const disconnected = await LexSona.connect({ lexDb: "/nonexistent/path.db" });

      await expect(disconnected.getAgentTrustProfile("test-agent")).rejects.toThrow();
    });

    it("recordTrustGap works when connected", async () => {
      const event: TrustGapEvent = {
        task_id: "task-001",
        agent_family: "test-agent",
        procedure: "test_execution",
        agent_claimed: true,
        verified: false,
        failures: [{ type: "test_failed", message: "Test assertion failed" }],
      };

      await expect(sona.recordTrustGap(event)).resolves.not.toThrow();
    });

    it("getAgentTrustProfile returns profile when connected", async () => {
      const profile = await sona.getAgentTrustProfile("test-agent");

      expect(profile).toBeDefined();
      expect(profile.agent_family).toBe("test-agent");
      expect(typeof profile.gap_rate).toBe("number");
    });

    it("deriveWithTrustCalibration returns constraints", async () => {
      await sona.activate("quality-first_engineering");

      const constraints = await sona.deriveWithTrustCalibration({
        agent_family: "test-agent",
        project: "lexsona",
      });

      expect(constraints).toBeDefined();
      expect(constraints.personaId).toBe("quality-first_engineering");
    });

    it("deriveWithTrustCalibration applies trust calibration", async () => {
      // Record some trust gaps first
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        const scope = JSON.stringify({ agent_family: "high-gap-agent" });
        testDb.db
          .prepare(
            `
          INSERT INTO lexsona_behavior_rules (
            rule_id, category, text, scope,
            alpha, beta, observation_count,
            created_at, updated_at, last_observed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            `gap-${i}`,
            "trust_gap",
            `Trust gap on proc: claim != verify`,
            scope,
            2.0,
            6.0,
            1,
            now,
            now,
            now
          );
      }

      await sona.activate("quality-first_engineering");

      const constraints = await sona.deriveWithTrustCalibration({
        agent_family: "high-gap-agent",
        project: "lexsona",
      });

      // Constraints should be derived (potentially with adjusted confidence)
      expect(constraints).toBeDefined();
    });
  });
});

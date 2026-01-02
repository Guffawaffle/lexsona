/**
 * Conflicts Command Integration Tests
 *
 * Tests for the lexsona conflicts check command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("CLI conflicts commands", () => {
  let testDir: string;
  let testDbPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lexsona-conflicts-test-"));
    testDbPath = join(testDir, "test.db");
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("conflicts check", () => {
    it("runs without errors when no database is found", async () => {
      // This test verifies that the command handles missing database gracefully
      // The actual functionality test requires a Lex database which may not be available in CI

      // For now, we test that the module loads correctly
      const { checkConflicts } = await import("../../src/conflicts/detector.js");

      // Test with empty rules
      const result = checkConflicts([]);
      expect(result.totalRules).toBe(0);
      expect(result.conflictCount).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it("detects conflicts in test data", async () => {
      const { checkConflicts } = await import("../../src/conflicts/detector.js");
      const { BehaviorRule } = await import("../../src/rules/types.js");

      // Create test rules
      const rules: any[] = [
        {
          rule_id: "test-always",
          text: "Always write unit tests",
          category: "testing",
          scope: {},
          severity: "must",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
        {
          rule_id: "test-skip-docs",
          text: "Skip tests for documentation changes",
          category: "testing",
          scope: {},
          severity: "should",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
      ];

      const result = checkConflicts(rules);

      expect(result.totalRules).toBe(2);
      expect(result.conflictCount).toBe(1);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].category).toBe("testing");
      expect(result.conflicts[0].severity).toBe("medium"); // must + should = medium
    });

    it("respects scope filtering", async () => {
      const { checkConflicts } = await import("../../src/conflicts/detector.js");

      // Create test rules with different scopes
      const rules: any[] = [
        {
          rule_id: "cli-test",
          text: "Always test CLI code",
          category: "testing",
          scope: { module_id: "cli" },
          severity: "must",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
        {
          rule_id: "core-skip",
          text: "Skip tests for core utilities",
          category: "testing",
          scope: { module_id: "core" },
          severity: "should",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
      ];

      const result = checkConflicts(rules);

      // Should not detect conflict because scopes don't overlap
      expect(result.conflictCount).toBe(0);
    });

    it("outputs JSON format correctly", async () => {
      const { checkConflicts } = await import("../../src/conflicts/detector.js");

      const rules: any[] = [
        {
          rule_id: "r1",
          text: "Always test",
          category: "testing",
          scope: {},
          severity: "must",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
        {
          rule_id: "r2",
          text: "Skip tests",
          category: "testing",
          scope: {},
          severity: "must",
          alpha: 5,
          beta: 1,
          observation_count: 3,
          decay_tau: 30,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          last_observed: "2024-01-01T00:00:00Z",
        },
      ];

      const result = checkConflicts(rules);

      // Verify result can be serialized to JSON
      const json = JSON.stringify(result);
      expect(json).toBeTruthy();

      const parsed = JSON.parse(json);
      expect(parsed.totalRules).toBe(2);
      expect(parsed.conflictCount).toBe(1);
      expect(parsed.conflicts).toHaveLength(1);
    });
  });
});

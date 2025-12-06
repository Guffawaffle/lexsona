/**
 * Mock Lex Client Tests
 *
 * Tests for the mock Lex client used in LexSona testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockLexClient, MockLexClient } from "../../mocks/lex-client.js";
import { createTestRule, createTestScope } from "../../utils/test-helpers.js";

describe("MockLexClient", () => {
  let client: MockLexClient;

  beforeEach(() => {
    client = createMockLexClient();
  });

  describe("isConnected", () => {
    it("returns true by default", () => {
      expect(client.isConnected()).toBe(true);
    });

    it("returns false when connection is failed", () => {
      client.setConnectionFailed(true);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("getRules", () => {
    it("returns empty array when no rules configured", async () => {
      const rules = await client.getRules();
      expect(rules).toEqual([]);
    });

    it("returns pre-configured rules", async () => {
      const rule = createTestRule({ rule_id: "test-1" });
      client = createMockLexClient({ rules: [rule] });

      const rules = await client.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_id).toBe("test-1");
    });

    it("filters by module_id", async () => {
      const rule1 = createTestRule({
        rule_id: "cli-rule",
        scope: { module_id: "cli" },
      });
      const rule2 = createTestRule({
        rule_id: "core-rule",
        scope: { module_id: "core" },
      });
      client = createMockLexClient({ rules: [rule1, rule2] });

      const rules = await client.getRules({ module_id: "cli" });
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_id).toBe("cli-rule");
    });

    it("filters by project", async () => {
      const rule1 = createTestRule({
        rule_id: "lex-rule",
        scope: { project: "lex" },
      });
      const rule2 = createTestRule({
        rule_id: "runner-rule",
        scope: { project: "lex-pr-runner" },
      });
      client = createMockLexClient({ rules: [rule1, rule2] });

      const rules = await client.getRules({ project: "lex" });
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_id).toBe("lex-rule");
    });

    it("throws when connection failed", async () => {
      client.setConnectionFailed(true);
      await expect(client.getRules()).rejects.toThrow("Database connection failed");
    });
  });

  describe("recordCorrection", () => {
    it("records correction successfully", async () => {
      const result = await client.recordCorrection({
        correction: "Use editing tools",
        polarity: 1,
        context: { module_id: "cli" },
      });

      expect(result.success).toBe(true);
      expect(client.getRecordedCorrections()).toHaveLength(1);
    });

    it("includes correction details", async () => {
      await client.recordCorrection({
        correction: "Never use sed",
        polarity: -1,
        context: { project: "lex-pr-runner" },
      });

      const corrections = client.getRecordedCorrections();
      expect(corrections[0]).toMatchObject({
        correction: "Never use sed",
        polarity: -1,
        context: { project: "lex-pr-runner" },
      });
    });

    it("returns failure when configured", async () => {
      client = createMockLexClient({ recordSuccess: false });

      const result = await client.recordCorrection({
        correction: "Test",
        polarity: 1,
        context: {},
      });

      expect(result.success).toBe(false);
    });

    it("throws when connection failed", async () => {
      client.setConnectionFailed(true);
      await expect(
        client.recordCorrection({
          correction: "Test",
          polarity: 1,
          context: {},
        })
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("addRule", () => {
    it("adds rules for test setup", async () => {
      const rule = createTestRule({ rule_id: "added-rule" });
      client.addRule(rule);

      const rules = await client.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_id).toBe("added-rule");
    });
  });

  describe("reset", () => {
    it("clears all state", async () => {
      client.addRule(createTestRule());
      await client.recordCorrection({
        correction: "Test",
        polarity: 1,
        context: {},
      });

      client.reset();

      expect(await client.getRules()).toEqual([]);
      expect(client.getRecordedCorrections()).toEqual([]);
    });
  });
});

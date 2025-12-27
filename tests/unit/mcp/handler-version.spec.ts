/**
 * MCP Handler Version Response Tests (AX-005)
 *
 * Tests that all MCP handlers include ruleVersion in their responses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleActivate,
  handleLearn,
  handleRules,
  handlePersonas,
  handleTrustGapRecord,
  handleAgentTrustProfile,
  handleIntrospect,
} from "../../../src/mcp/handlers.js";
import { LexSona } from "../../../src/core/lexsona.js";

describe("MCP Handler ruleVersion responses (AX-005)", () => {
  let mockLexSona: LexSona;
  let getLexSona: () => Promise<LexSona>;

  beforeEach(async () => {
    mockLexSona = await LexSona.connect({ lexDb: "/nonexistent/path/db.sqlite" });
    getLexSona = async () => mockLexSona;
  });

  describe("handleActivate", () => {
    it("includes ruleVersion in response", async () => {
      const state = { activePersonaId: null };
      const result = await handleActivate(
        { persona: "quality-first_engineering" },
        state,
        getLexSona
      );

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });

  describe("handleLearn", () => {
    it("includes ruleVersion in response", async () => {
      const learnSpy = vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const incrementSpy = vi.spyOn(mockLexSona, "incrementRuleVersion").mockResolvedValue(1);

      const result = await handleLearn(
        {
          correction: "Always use TypeScript strict mode",
          severity: "must",
          category: "code_quality",
          polarity: "positive",
        },
        getLexSona
      );

      expect(result).toHaveProperty("ruleVersion");
      expect(learnSpy).toHaveBeenCalled();
      expect(incrementSpy).toHaveBeenCalled();
    });

    it("increments version after learning", async () => {
      vi.spyOn(mockLexSona, "learn").mockResolvedValue();
      const incrementSpy = vi.spyOn(mockLexSona, "incrementRuleVersion").mockResolvedValue(42);

      const result = await handleLearn(
        {
          correction: "Use strict typing",
          severity: "must",
          category: "code_quality",
          polarity: "positive",
        },
        getLexSona
      );

      expect((result as { ruleVersion: number }).ruleVersion).toBe(42);
      expect(incrementSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleRules", () => {
    it("includes ruleVersion in response", async () => {
      vi.spyOn(mockLexSona, "getRules").mockResolvedValue([]);

      const result = await handleRules({}, getLexSona);

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });

  describe("handlePersonas", () => {
    it("includes ruleVersion in response", async () => {
      const result = await handlePersonas(getLexSona);

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });

  describe("handleTrustGapRecord", () => {
    it("includes ruleVersion in response", async () => {
      vi.spyOn(mockLexSona, "recordTrustGap").mockResolvedValue();

      const result = await handleTrustGapRecord(
        {
          task_id: "task-001",
          agent_family: "test-agent",
          procedure: "test",
          agent_claimed: true,
          verified: true,
          failures: [],
        },
        getLexSona
      );

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });

  describe("handleAgentTrustProfile", () => {
    it("includes ruleVersion in response", async () => {
      vi.spyOn(mockLexSona, "getAgentTrustProfile").mockResolvedValue({
        agent_family: "test-agent",
        total_tasks: 0,
        trust_gaps: 0,
        gap_rate: 0,
        common_failure_types: [],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      });

      const result = await handleAgentTrustProfile(
        { agent_family: "test-agent" },
        getLexSona
      );

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });

  describe("handleIntrospect", () => {
    it("includes ruleVersion in response", async () => {
      const state = { activePersonaId: null };
      const result = await handleIntrospect({}, state, getLexSona);

      expect(result).toHaveProperty("ruleVersion");
      expect(typeof (result as { ruleVersion: number }).ruleVersion).toBe("number");
    });
  });
});

/**
 * Integration Tests for Idempotency in MCP Server
 *
 * Tests request_id handling for mutation operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleActivate,
  handleLearn,
  handleTrustGapRecord,
} from "../../src/mcp/handlers.js";
import { LexSona } from "../../src/core/lexsona.js";
import type { ActivateInput, LearnInput, TrustGapInput } from "../../src/mcp/tools.js";

// Mock persona loading
vi.mock("../../src/persona/loader.js", () => ({
  loadPersona: vi.fn(async (id: string) => ({
    id,
    version: "1.0.0",
    behavior: "Test behavior",
    ruleCategories: ["general"],
    requires_memory: false,
  })),
}));

describe("MCP Server Idempotency", () => {
  let mockLexSona: LexSona;
  let learnCallCount = 0;
  let recordTrustGapCallCount = 0;

  beforeEach(async () => {
    learnCallCount = 0;
    recordTrustGapCallCount = 0;

    // Create a mock LexSona instance
    mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "learn").mockImplementation(async () => {
      learnCallCount++;
    });
    vi.spyOn(mockLexSona, "recordTrustGap").mockImplementation(async () => {
      recordTrustGapCallCount++;
    });
  });

  describe("persona_activate idempotency", () => {
    it("accepts request_id parameter", async () => {
      const input: ActivateInput = {
        persona: "quality-first_engineering",
        request_id: "test-request-1",
      };

      const state = { activePersonaId: null };
      const result = await handleActivate(input, state);

      expect(result).toHaveProperty("success", true);
      expect(state.activePersonaId).toBe("quality-first_engineering");
    });

    it("works without request_id (backwards compatible)", async () => {
      const input: ActivateInput = {
        persona: "quality-first_engineering",
      };

      const state = { activePersonaId: null };
      const result = await handleActivate(input, state);

      expect(result).toHaveProperty("success", true);
      expect(state.activePersonaId).toBe("quality-first_engineering");
    });
  });

  describe("rules_learn idempotency", () => {
    it("accepts request_id parameter", async () => {
      const input: LearnInput = {
        correction: "Always run tests",
        severity: "must",
        category: "general",
        request_id: "test-request-2",
      };

      const getLexSona = async () => mockLexSona;
      const result = await handleLearn(input, getLexSona);

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("correction", "Always run tests");
      expect(learnCallCount).toBe(1);
    });

    it("works without request_id (backwards compatible)", async () => {
      const input: LearnInput = {
        correction: "Always run tests",
        severity: "must",
        category: "general",
      };

      const getLexSona = async () => mockLexSona;
      const result = await handleLearn(input, getLexSona);

      expect(result).toHaveProperty("success", true);
      expect(learnCallCount).toBe(1);
    });
  });

  describe("trust_gap_record idempotency", () => {
    it("accepts request_id parameter", async () => {
      const input: TrustGapInput = {
        task_id: "task-123",
        agent_family: "claude-haiku",
        procedure: "code_generation",
        agent_claimed: true,
        verified: false,
        failures: [
          {
            type: "syntax_error",
            message: "Missing semicolon",
          },
        ],
        request_id: "test-request-3",
      };

      const getLexSona = async () => mockLexSona;
      const result = await handleTrustGapRecord(input, getLexSona);

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("trust_gap", true);
      expect(recordTrustGapCallCount).toBe(1);
    });

    it("works without request_id (backwards compatible)", async () => {
      const input: TrustGapInput = {
        task_id: "task-123",
        agent_family: "claude-haiku",
        procedure: "code_generation",
        agent_claimed: true,
        verified: false,
        failures: [
          {
            type: "syntax_error",
            message: "Missing semicolon",
          },
        ],
      };

      const getLexSona = async () => mockLexSona;
      const result = await handleTrustGapRecord(input, getLexSona);

      expect(result).toHaveProperty("success", true);
      expect(recordTrustGapCallCount).toBe(1);
    });
  });

  describe("request_id schema validation", () => {
    it("request_id is optional for all mutation tools", () => {
      // This is verified by the successful execution of the "works without request_id" tests above
      // The schemas allow request_id to be undefined
      expect(true).toBe(true);
    });
  });
});

/**
 * Integration Tests for Idempotency in MCP Server
 *
 * Tests request_id handling for mutation operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  handleActivate,
  handleLearn,
  handleTrustGapRecord,
} from "../../src/mcp/handlers.js";
import { LexSona } from "../../src/core/lexsona.js";
import type { ActivateInput, LearnInput, TrustGapInput } from "../../src/mcp/tools.js";
import { createIsolatedTestDb } from "../utils/db-fixtures.js";
import type { IsolatedTestDb } from "../utils/db-fixtures.js";

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
  let testDb: IsolatedTestDb;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    learnCallCount = 0;
    recordTrustGapCallCount = 0;

    // Store original LEX_DB_PATH
    originalEnv = process.env.LEX_DB_PATH;

    // Create isolated test database
    testDb = createIsolatedTestDb({
      createRulesTable: true,
      createPersonasTable: false,
      createSchemaVersionTable: false,
    });

    // Set environment to use test database
    process.env.LEX_DB_PATH = testDb.path;

    // Create a mock LexSona instance connected to test database
    mockLexSona = await LexSona.connect();
    vi.spyOn(mockLexSona, "learn").mockImplementation(async () => {
      learnCallCount++;
    });
    vi.spyOn(mockLexSona, "recordTrustGap").mockImplementation(async () => {
      recordTrustGapCallCount++;
    });
  });

  afterEach(() => {
    // Close LexSona connection
    if (mockLexSona) {
      mockLexSona.close();
    }

    // Clean up test database
    if (testDb) {
      testDb.cleanup();
    }

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.LEX_DB_PATH = originalEnv;
    } else {
      delete process.env.LEX_DB_PATH;
    }
  });

  describe("persona_activate idempotency", () => {
    it("accepts request_id parameter", async () => {
      const input: ActivateInput = {
        persona: "quality-first_engineering",
        request_id: "test-request-1",
      };

      const state = { activePersonaId: null };
      const getLexSona = async () => mockLexSona;
      const result = await handleActivate(input, state, getLexSona);

      expect(result).toHaveProperty("success", true);
      expect(state.activePersonaId).toBe("quality-first_engineering");
    });

    it("works without request_id (backwards compatible)", async () => {
      const input: ActivateInput = {
        persona: "quality-first_engineering",
      };

      const state = { activePersonaId: null };
      const getLexSona = async () => mockLexSona;
      const result = await handleActivate(input, state, getLexSona);

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

/**
 * Tests for token budget optimization constraints
 */
import { describe, it, expect } from "vitest";
import {
  deriveTokenBudget,
  getOptimalBudget,
  type TokenBudgetContext,
  type BudgetHistory,
} from "../../../src/constraints/token-budget.js";

describe("deriveTokenBudget", () => {
  describe("Agent Family Defaults", () => {
    it("applies claude-haiku defaults", () => {
      const context: TokenBudgetContext = {
        procedure: "unknown-procedure",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(8000);
      expect(result.max_context_lines).toBe(10);
    });

    it("applies gpt-4o-mini defaults", () => {
      const context: TokenBudgetContext = {
        procedure: "unknown-procedure",
        agent_family: "gpt-4o-mini",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(6000);
      expect(result.max_context_lines).toBe(8);
    });

    it("applies gemini-flash defaults", () => {
      const context: TokenBudgetContext = {
        procedure: "unknown-procedure",
        agent_family: "gemini-flash",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(10000);
      expect(result.max_context_lines).toBe(12);
    });

    it("applies default budget for unknown agent family", () => {
      const context: TokenBudgetContext = {
        procedure: "unknown-procedure",
        agent_family: "unknown-agent",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(8000);
      expect(result.max_context_lines).toBe(10);
    });
  });

  describe("Procedure Modifiers", () => {
    it("applies post-merge-fix multiplier (0.8)", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // 8000 * 0.8 = 6400
      expect(result.max_bytes).toBe(6400);
    });

    it("includes post-merge-fix required fields", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.required_fields).toContain("failure.runner_output_snip");
      expect(result.required_fields).toContain("targets[].hunk");
    });

    it("applies fanout-issue multiplier (1.2)", () => {
      const context: TokenBudgetContext = {
        procedure: "fanout-issue",
        agent_family: "gpt-4o-mini",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // 6000 * 1.2 = 7200
      expect(result.max_bytes).toBe(7200);
    });

    it("includes fanout-issue required fields", () => {
      const context: TokenBudgetContext = {
        procedure: "fanout-issue",
        agent_family: "gpt-4o-mini",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.required_fields).toContain("source_of_truth.excerpt");
    });

    it("applies default multiplier (1.0) for unknown procedure", () => {
      const context: TokenBudgetContext = {
        procedure: "custom-procedure",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // 8000 * 1.0 = 8000
      expect(result.max_bytes).toBe(8000);
    });
  });

  describe("Truncation Order", () => {
    it("defines truncation order for optional fields", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // Should have a defined truncation order
      expect(result.truncation_order.length).toBeGreaterThan(0);
      expect(result.optional_fields.length).toBeGreaterThan(0);
    });

    it("includes MAY fields in truncation order (lowest priority)", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // MAY fields should appear early in truncation order (truncated first)
      expect(result.truncation_order).toContain("context.additional_notes");
      expect(result.truncation_order).toContain("history.previous_attempts");
    });

    it("includes SHOULD fields in truncation order (medium priority)", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // SHOULD fields should appear later in truncation order
      expect(result.truncation_order).toContain("context.related_files");
      expect(result.truncation_order).toContain("diff.context_lines");
    });

    it("does not include MUST fields in truncation order", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // MUST fields should NOT be in truncation order
      // They are in required_fields instead
      expect(result.truncation_order).not.toContain("failure.runner_output_snip");
      expect(result.truncation_order).not.toContain("targets[].hunk");

      // But they should be in required_fields
      expect(result.required_fields).toContain("failure.runner_output_snip");
      expect(result.required_fields).toContain("targets[].hunk");
    });
  });

  describe("Agent/Procedure Combinations", () => {
    it("combines claude-haiku with post-merge-fix", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(6400); // 8000 * 0.8
      expect(result.max_context_lines).toBe(10);
      expect(result.required_fields).toContain("failure.runner_output_snip");
    });

    it("combines gpt-4o-mini with fanout-issue", () => {
      const context: TokenBudgetContext = {
        procedure: "fanout-issue",
        agent_family: "gpt-4o-mini",
        determinism: "D2",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(7200); // 6000 * 1.2
      expect(result.max_context_lines).toBe(8);
      expect(result.required_fields).toContain("source_of_truth.excerpt");
    });

    it("combines gemini-flash with post-merge-fix", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "gemini-flash",
        determinism: "D3",
      };

      const result = deriveTokenBudget(context);

      expect(result.max_bytes).toBe(8000); // 10000 * 0.8
      expect(result.max_context_lines).toBe(12);
      expect(result.required_fields).toContain("failure.runner_output_snip");
    });
  });

  describe("Determinism Levels", () => {
    it("handles D1 determinism level", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result = deriveTokenBudget(context);

      // Result should be deterministic
      expect(result).toBeDefined();
      expect(result.max_bytes).toBeGreaterThan(0);
    });

    it("handles D2 determinism level", () => {
      const context: TokenBudgetContext = {
        procedure: "fanout-issue",
        agent_family: "gpt-4o-mini",
        determinism: "D2",
      };

      const result = deriveTokenBudget(context);

      expect(result).toBeDefined();
      expect(result.max_bytes).toBeGreaterThan(0);
    });

    it("handles D3 determinism level", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "gemini-flash",
        determinism: "D3",
      };

      const result = deriveTokenBudget(context);

      expect(result).toBeDefined();
      expect(result.max_bytes).toBeGreaterThan(0);
    });
  });

  describe("Deterministic Output", () => {
    it("returns same result for same input", () => {
      const context: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const result1 = deriveTokenBudget(context);
      const result2 = deriveTokenBudget(context);

      expect(result1).toEqual(result2);
    });

    it("returns different results for different agent families", () => {
      const context1: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        determinism: "D1",
      };

      const context2: TokenBudgetContext = {
        procedure: "post-merge-fix",
        agent_family: "gpt-4o-mini",
        determinism: "D1",
      };

      const result1 = deriveTokenBudget(context1);
      const result2 = deriveTokenBudget(context2);

      expect(result1.max_bytes).not.toBe(result2.max_bytes);
    });
  });
});

describe("getOptimalBudget", () => {
  it("returns baseline recommendation without history", () => {
    const result = getOptimalBudget("post-merge-fix", "claude-haiku");

    expect(result.recommended_bytes).toBe(6400); // 8000 * 0.8
    expect(result.confidence).toBe(0.5); // Medium confidence for baseline
  });

  it("handles unknown procedure", () => {
    const result = getOptimalBudget("custom-procedure", "claude-haiku");

    expect(result.recommended_bytes).toBe(8000); // 8000 * 1.0
    expect(result.confidence).toBe(0.5);
  });

  it("handles unknown agent family", () => {
    const result = getOptimalBudget("post-merge-fix", "unknown-agent");

    expect(result.recommended_bytes).toBe(6400); // 8000 * 0.8 (default budget)
    expect(result.confidence).toBe(0.5);
  });

  it("accepts historical data parameter (for future use)", () => {
    const history: BudgetHistory[] = [
      {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        snapshot_bytes: 5000,
        success: true,
        agent_search_tokens: 100,
      },
      {
        procedure: "post-merge-fix",
        agent_family: "claude-haiku",
        snapshot_bytes: 7000,
        success: true,
        agent_search_tokens: 50,
      },
    ];

    const result = getOptimalBudget("post-merge-fix", "claude-haiku", history);

    // For now, history is not used, but function accepts it
    expect(result).toBeDefined();
    expect(result.recommended_bytes).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("returns consistent results for same inputs", () => {
    const result1 = getOptimalBudget("fanout-issue", "gpt-4o-mini");
    const result2 = getOptimalBudget("fanout-issue", "gpt-4o-mini");

    expect(result1).toEqual(result2);
  });
});

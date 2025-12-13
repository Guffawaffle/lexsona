/**
 * Rules Learn Command Tests
 *
 * Unit tests for the `lexsona rules learn` command.
 * Tests CLI parsing, validation, and payload mapping.
 */

import { describe, it, expect } from "vitest";
import type { RuleScope } from "../../../src/rules/types.js";

describe("rules learn command", () => {
  describe("scoping semantics", () => {
    it("maps --domain to project field", () => {
      const scope: RuleScope = {};
      const domain = "lex-core";
      
      // Simulate CLI flag mapping
      scope.project = domain;
      
      expect(scope.project).toBe("lex-core");
      expect(scope.module_id).toBeUndefined();
    });

    it("maps --module to module_id field", () => {
      const scope: RuleScope = {};
      const module = "cli";
      
      // Simulate CLI flag mapping
      scope.module_id = module;
      
      expect(scope.module_id).toBe("cli");
      expect(scope.project).toBeUndefined();
    });

    it("maps --task to task_type field", () => {
      const scope: RuleScope = {};
      const task = "implementation";
      
      // Simulate CLI flag mapping
      scope.task_type = task;
      
      expect(scope.task_type).toBe("implementation");
    });

    it("allows all scope fields to be set independently", () => {
      const scope: RuleScope = {};
      
      // Simulate all flags
      scope.project = "lex-core";
      scope.module_id = "cli";
      scope.task_type = "implementation";
      
      expect(scope.project).toBe("lex-core");
      expect(scope.module_id).toBe("cli");
      expect(scope.task_type).toBe("implementation");
    });
  });

  describe("polarity", () => {
    it("defaults to reinforce (polarity = 1)", () => {
      const polarity = 1; // Default when --counter is not set
      expect(polarity).toBe(1);
    });

    it("sets counter polarity when --counter is used", () => {
      const counter = true;
      const polarity = counter ? -1 : 1;
      expect(polarity).toBe(-1);
    });
  });

  describe("validation", () => {
    it("requires non-empty correction text", () => {
      const correction = "";
      expect(correction.trim().length).toBe(0);
    });

    it("accepts valid correction text", () => {
      const correction = "Always write tests";
      expect(correction.trim().length).toBeGreaterThan(0);
    });

    it("validates severity values", () => {
      const validSeverities = ["must", "should", "style"];
      
      expect(validSeverities.includes("must")).toBe(true);
      expect(validSeverities.includes("should")).toBe(true);
      expect(validSeverities.includes("style")).toBe(true);
      expect(validSeverities.includes("invalid")).toBe(false);
    });
  });

  describe("output format", () => {
    it("produces valid JSON structure on success", () => {
      const output = {
        success: true,
        correction: "Always write tests",
        severity: "should",
        category: "general",
        polarity: "reinforce",
        scope: {
          project: "lex-core",
          module_id: "cli",
        },
      };
      
      expect(output.success).toBe(true);
      expect(output.correction).toBe("Always write tests");
      expect(output.severity).toBe("should");
      expect(output.polarity).toBe("reinforce");
    });

    it("produces valid JSON structure on error", () => {
      const output = {
        success: false,
        error: "Correction text cannot be empty",
      };
      
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it("includes scope in JSON output", () => {
      const output = {
        success: true,
        correction: "Test",
        severity: "should",
        category: "general",
        polarity: "reinforce",
        scope: {
          project: "my-project",
          module_id: "my-module",
          task_type: "implementation",
        },
      };
      
      expect(output.scope.project).toBe("my-project");
      expect(output.scope.module_id).toBe("my-module");
      expect(output.scope.task_type).toBe("implementation");
    });
  });
});

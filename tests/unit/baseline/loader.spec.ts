/**
 * Tests for baseline constraints loader
 *
 * Verifies that baseline.yaml is correctly loaded and parsed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadBaseline, getBaseline, clearBaselineCache } from "../../../src/baseline/loader.js";

describe("Baseline Loader", () => {
  beforeEach(() => {
    clearBaselineCache();
  });

  describe("loadBaseline", () => {
    it("loads bundled baseline.yaml", () => {
      const baseline = loadBaseline();

      expect(baseline.version).toBe(1);
      expect(baseline.source).toContain("baseline.yaml");
    });

    it("parses principles correctly", () => {
      const baseline = loadBaseline();

      expect(baseline.principles.length).toBe(3);
      expect(baseline.principles[0]).toEqual({
        id: "transparency",
        description: "Be clear about what you're doing and why",
      });
      expect(baseline.principles[1]).toEqual({
        id: "determinism",
        description: "Same inputs should produce same outputs",
      });
      expect(baseline.principles[2]).toEqual({
        id: "auditability",
        description: "All decisions should be traceable and inspectable",
      });
    });

    it("parses constraints correctly", () => {
      const baseline = loadBaseline();

      expect(baseline.constraints.length).toBe(8);

      // Check a critical constraint is mapped to 'must'
      const noFalseMemories = baseline.constraints.find(
        (c) => c.rule_id === "baseline:no_false_memories"
      );
      expect(noFalseMemories).toBeDefined();
      expect(noFalseMemories!.severity).toBe("must");
      expect(noFalseMemories!.confidence).toBe(1.0);
      expect(noFalseMemories!.source).toBe("baseline");
      expect(noFalseMemories!.category).toBe("baseline");

      // Check a medium constraint is mapped to 'should'
      const structuredOutputs = baseline.constraints.find(
        (c) => c.rule_id === "baseline:structured_outputs"
      );
      expect(structuredOutputs).toBeDefined();
      expect(structuredOutputs!.severity).toBe("should");
    });

    it("includes provenance for each constraint", () => {
      const baseline = loadBaseline();

      for (const constraint of baseline.constraints) {
        expect(constraint.provenance).toBeDefined();
        expect(constraint.provenance!.source).toBe("baseline");
        expect(constraint.provenance!.rule_id).toBe(constraint.rule_id);
        expect(constraint.provenance!.confidence).toBe(1.0);
      }
    });
  });

  describe("getBaseline (cached)", () => {
    it("returns cached baseline on subsequent calls", () => {
      const baseline1 = getBaseline();
      const baseline2 = getBaseline();

      // Should be the same object reference (cached)
      expect(baseline1).toBe(baseline2);
    });

    it("can be cleared and reloaded", () => {
      const baseline1 = getBaseline();
      clearBaselineCache();
      const baseline2 = getBaseline();

      // Should be different object references after cache clear
      expect(baseline1).not.toBe(baseline2);
      // But same content
      expect(baseline1.version).toBe(baseline2.version);
      expect(baseline1.principles.length).toBe(baseline2.principles.length);
    });
  });

  describe("severity mapping", () => {
    it("maps severity levels correctly", () => {
      const baseline = loadBaseline();

      // Critical → must
      const critical = baseline.constraints.find(
        (c) => c.rule_id === "baseline:no_credential_logging"
      );
      expect(critical!.severity).toBe("must");

      // High → must
      const high = baseline.constraints.find(
        (c) => c.rule_id === "baseline:honor_module_boundaries"
      );
      expect(high!.severity).toBe("must");

      // Medium → should
      const medium = baseline.constraints.find((c) => c.rule_id === "baseline:structured_outputs");
      expect(medium!.severity).toBe("should");
    });
  });
});

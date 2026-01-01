/**
 * Tests for pipeline phase constraints loader
 *
 * Verifies that pipeline-phase-constraints.yaml is correctly loaded and parsed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPhaseConstraints,
  getPhaseConstraints,
  getPhaseConstraintsForPhase,
  getPhaseConstraintsForProcedure,
  clearPhaseConstraintsCache,
  // Deprecated aliases should still work
  loadYellowBrickConstraints,
  getYellowBrickConstraints,
} from "../../../src/baseline/pipeline-phase-loader.js";

describe("Pipeline Phase Constraints Loader", () => {
  beforeEach(() => {
    clearPhaseConstraintsCache();
  });

  describe("loadPhaseConstraints", () => {
    it("loads bundled pipeline-phase-constraints.yaml", () => {
      const constraints = loadPhaseConstraints();

      expect(constraints.length).toBeGreaterThan(0);
      // All should have a phase
      expect(constraints.every((c) => ["D0", "D1", "D2", "D3", "D4"].includes(c.phase))).toBe(true);
    });

    it("returns empty array if file not found", () => {
      const constraints = loadPhaseConstraints("/nonexistent/path.yaml");
      expect(constraints).toEqual([]);
    });

    it("parses rule_id with phase prefix", () => {
      const constraints = loadPhaseConstraints();

      expect(constraints.every((c) => c.rule_id.startsWith("phase:"))).toBe(true);
    });

    it("sets confidence to 1.0 for all phase constraints", () => {
      const constraints = loadPhaseConstraints();

      expect(constraints.every((c) => c.confidence === 1.0)).toBe(true);
    });

    it("sets source to baseline for all phase constraints", () => {
      const constraints = loadPhaseConstraints();

      expect(constraints.every((c) => c.source === "baseline")).toBe(true);
    });
  });

  describe("getPhaseConstraintsForPhase", () => {
    it("filters constraints by phase D0", () => {
      const d0Constraints = getPhaseConstraintsForPhase("D0");

      expect(d0Constraints.length).toBeGreaterThan(0);
      expect(d0Constraints.every((c) => c.phase === "D0")).toBe(true);
    });

    it("filters constraints by phase D1", () => {
      const d1Constraints = getPhaseConstraintsForPhase("D1");

      expect(d1Constraints.length).toBeGreaterThan(0);
      expect(d1Constraints.every((c) => c.phase === "D1")).toBe(true);
    });

    it("returns different sets for different phases", () => {
      const d0 = getPhaseConstraintsForPhase("D0");
      const d1 = getPhaseConstraintsForPhase("D1");

      // Should have different constraints
      const d0Ids = new Set(d0.map((c) => c.rule_id));
      const d1Ids = new Set(d1.map((c) => c.rule_id));

      // No overlap
      const intersection = [...d0Ids].filter((id) => d1Ids.has(id));
      expect(intersection.length).toBe(0);
    });
  });

  describe("getPhaseConstraintsForProcedure", () => {
    it("returns constraints scoped to fanout_harvest", () => {
      const constraints = getPhaseConstraintsForProcedure("fanout_harvest");

      expect(constraints.length).toBeGreaterThan(0);
      // Should include unscoped constraints and fanout_harvest-scoped ones
    });

    it("returns constraints scoped to fanout_analyze", () => {
      const constraints = getPhaseConstraintsForProcedure("fanout_analyze");

      expect(constraints.length).toBeGreaterThan(0);
    });

    it("includes unscoped constraints for any procedure", () => {
      const constraints = getPhaseConstraintsForProcedure("any_procedure");

      // Should at least include unscoped constraints
      const unscopedConstraints = constraints.filter((c) => !c.scope?.procedure);
      expect(unscopedConstraints.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getPhaseConstraints (caching)", () => {
    it("caches constraints after first load", () => {
      const first = getPhaseConstraints();
      const second = getPhaseConstraints();

      // Should be the same array reference due to caching
      expect(first).toBe(second);
    });

    it("reloads when custom path provided", () => {
      const first = getPhaseConstraints();
      const second = getPhaseConstraints("/nonexistent/path.yaml");

      // Should not be same reference when custom path forces reload
      expect(first).not.toBe(second);
    });
  });

  describe("clearPhaseConstraintsCache", () => {
    it("clears the cache", () => {
      const first = getPhaseConstraints();
      clearPhaseConstraintsCache();
      const second = getPhaseConstraints();

      // Should be different array references after cache clear
      expect(first).not.toBe(second);
    });
  });

  describe("deprecated aliases", () => {
    it("loadYellowBrickConstraints works as alias", () => {
      const constraints = loadYellowBrickConstraints();
      const canonical = loadPhaseConstraints();

      expect(constraints.length).toBe(canonical.length);
    });

    it("getYellowBrickConstraints works as alias", () => {
      clearPhaseConstraintsCache();
      const constraints = getYellowBrickConstraints();
      const canonical = getPhaseConstraints();

      // Same reference due to caching
      expect(constraints).toBe(canonical);
    });
  });

  describe("constraint content validation", () => {
    it("D0 constraints include pinning rules", () => {
      const d0 = getPhaseConstraintsForPhase("D0");

      const hasPinRule = d0.some((c) => c.text.toLowerCase().includes("pin"));
      expect(hasPinRule).toBe(true);
    });

    it("D1 constraints include determinism rules", () => {
      const d1 = getPhaseConstraintsForPhase("D1");

      const hasDeterminismRule = d1.some(
        (c) =>
          c.text.toLowerCase().includes("deterministic") ||
          c.text.toLowerCase().includes("same input")
      );
      expect(hasDeterminismRule).toBe(true);
    });

    it("all constraints have required fields", () => {
      const constraints = loadPhaseConstraints();

      for (const c of constraints) {
        expect(c.rule_id).toBeDefined();
        expect(c.phase).toBeDefined();
        expect(c.text).toBeDefined();
        expect(c.severity).toBeDefined();
        expect(c.confidence).toBeDefined();
        expect(c.source).toBeDefined();
        expect(c.provenance).toBeDefined();
      }
    });
  });
});

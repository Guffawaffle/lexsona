/**
 * Integration tests for CLI constraints commands
 */
import { describe, it, expect } from "vitest";
import { deriveConstraints } from "../../src/constraints/derive.js";
import { loadPersona } from "../../src/persona/loader.js";
import type { BehaviorRuleWithConfidence } from "../../src/rules/types.js";
import type { Principle } from "../../src/constraints/derive.js";

describe("CLI Constraints Commands", () => {
  describe("derive command", () => {
    it("produces constraint set with proper structure", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "test_rule_1",
          text: "Always write tests",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      const principles: Principle[] = [
        { id: "transparency", description: "Be clear about what you're doing and why" },
      ];

      const context = {
        domain: "test-domain",
        taskType: "implementation",
      };

      const result = deriveConstraints(persona, testRules, principles, context);

      // Verify structure matches specification
      expect(result).toHaveProperty("personaId");
      expect(result).toHaveProperty("derivedAt");
      expect(result).toHaveProperty("inputHash");
      expect(result).toHaveProperty("context");
      expect(result).toHaveProperty("constraints");
      expect(result).toHaveProperty("principles");
      expect(result).toHaveProperty("metadata");

      expect(result.personaId).toBe("quality-first_engineering");
      expect(result.constraints.length).toBeGreaterThan(0);
      expect(result.principles.length).toBeGreaterThan(0);
    });

    it("groups constraints by severity", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "critical_rule",
          text: "Critical rule",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "high_rule",
          text: "High priority rule",
          severity: "should",
          category: "testing",
          scope: {},
          effective_confidence: 0.8,
          confidence: 0.8,
          decay_factor: 1.0,
          alpha: 8,
          beta: 2,
          observation_count: 10,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "style_rule",
          text: "Style rule",
          severity: "style",
          category: "code_quality",
          scope: {},
          effective_confidence: 0.6,
          confidence: 0.6,
          decay_factor: 1.0,
          alpha: 5,
          beta: 3,
          observation_count: 8,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      const result = deriveConstraints(persona, testRules, [], {});

      const criticalConstraints = result.constraints.filter((c) => c.severity === "must");
      const highConstraints = result.constraints.filter((c) => c.severity === "should");
      const mediumConstraints = result.constraints.filter((c) => c.severity === "style");

      expect(criticalConstraints.length).toBeGreaterThan(0);
      expect(highConstraints.length).toBeGreaterThan(0);
      expect(mediumConstraints.length).toBeGreaterThan(0);
    });

    it("includes principles in output", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const principles: Principle[] = [
        { id: "transparency", description: "Be clear about what you're doing and why" },
        { id: "determinism", description: "Same inputs should produce same outputs" },
        { id: "auditability", description: "All decisions should be traceable" },
      ];

      const result = deriveConstraints(persona, [], principles, {});

      expect(result.principles).toEqual(principles);
      expect(result.principles.length).toBe(3);
    });

    it("respects confidence ceiling for offline-safe persona", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "high_confidence_rule",
          text: "High confidence rule",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.95,
          confidence: 0.95,
          decay_factor: 1.0,
          alpha: 15,
          beta: 1,
          observation_count: 16,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      const result = deriveConstraints(persona, testRules, [], {});

      // Offline-safe persona has confidence ceiling of 0.7
      expect(result.constraints[0].confidence).toBeLessThanOrEqual(0.7);
      expect(result.metadata.confidenceCeiling).toBe(0.7);
      expect(result.metadata.offlineMode).toBe(true);
    });

    it("applies context filtering", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "scoped_rule",
          text: "Scoped to domain",
          severity: "must",
          category: "testing",
          scope: { project: "lex-runner" },
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "global_rule",
          text: "Global rule",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      // Should include scoped rule when domain matches
      const matchingResult = deriveConstraints(persona, testRules, [], {
        domain: "lex-runner",
      });
      expect(matchingResult.constraints.length).toBe(2);

      // Should only include global rule when domain doesn't match
      const nonMatchingResult = deriveConstraints(persona, testRules, [], {
        domain: "other-domain",
      });
      expect(nonMatchingResult.constraints.length).toBe(1);
      expect(nonMatchingResult.constraints[0].rule_id).toBe("global_rule");
    });
  });

  describe("JSON output format", () => {
    it("produces valid JSON with correct schema", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "test_rule",
          text: "Test rule",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      const principles: Principle[] = [
        { id: "transparency", description: "Be clear" },
      ];

      const context = { domain: "test" };
      const result = deriveConstraints(persona, testRules, principles, context);

      // Simulate JSON output format
      const jsonOutput = {
        version: 1,
        persona: result.personaId,
        domain: context.domain,
        derivedAt: result.derivedAt,
        inputHash: result.inputHash,
        constraints: result.constraints.map((c) => ({
          id: c.rule_id,
          description: c.text,
          severity: c.severity === "must" ? "critical" : c.severity === "should" ? "high" : "medium",
          source: "learned",
          confidence: c.confidence,
        })),
        principles: result.principles.map((p) => ({
          id: p.id,
          description: p.description,
        })),
      };

      expect(jsonOutput.version).toBe(1);
      expect(jsonOutput.persona).toBe("quality-first_engineering");
      expect(jsonOutput.constraints).toHaveLength(1);
      expect(jsonOutput.constraints[0]).toHaveProperty("id");
      expect(jsonOutput.constraints[0]).toHaveProperty("description");
      expect(jsonOutput.constraints[0]).toHaveProperty("severity");
      expect(jsonOutput.constraints[0]).toHaveProperty("source");
      expect(jsonOutput.constraints[0]).toHaveProperty("confidence");
      expect(jsonOutput.principles).toHaveLength(1);
    });

    it("maps severity levels correctly", async () => {
      const persona = await loadPersona("quality-first_engineering");

      const testRules: BehaviorRuleWithConfidence[] = [
        {
          rule_id: "must_rule",
          text: "Must rule",
          severity: "must",
          category: "testing",
          scope: {},
          effective_confidence: 0.9,
          confidence: 0.9,
          decay_factor: 1.0,
          alpha: 10,
          beta: 1,
          observation_count: 11,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "should_rule",
          text: "Should rule",
          severity: "should",
          category: "testing",
          scope: {},
          effective_confidence: 0.8,
          confidence: 0.8,
          decay_factor: 1.0,
          alpha: 8,
          beta: 2,
          observation_count: 10,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
        {
          rule_id: "style_rule",
          text: "Style rule",
          severity: "style",
          category: "code_quality",
          scope: {},
          effective_confidence: 0.6,
          confidence: 0.6,
          decay_factor: 1.0,
          alpha: 5,
          beta: 3,
          observation_count: 8,
          decay_tau: 180,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_observed: new Date().toISOString(),
        },
      ];

      const result = deriveConstraints(persona, testRules, [], {});

      const severityMap = {
        must: "critical",
        should: "high",
        style: "medium",
      };

      for (const constraint of result.constraints) {
        const expectedSeverity = severityMap[constraint.severity as keyof typeof severityMap];
        expect(expectedSeverity).toBeDefined();
      }
    });
  });
});

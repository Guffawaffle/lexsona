import { describe, expect, it } from "vitest";
import type { BaselineData } from "../../../src/baseline/loader.js";
import type { ConstraintSet } from "../../../src/constraints/derive.js";
import {
  CONSTRAINT_SNAPSHOT_V1_JSON_SCHEMA,
  canonicalizeConstraintSnapshotValue,
  createConstraintSnapshotV1,
  digestConstraintSnapshotValue,
  parseConstraintSnapshotV1,
  serializeConstraintSnapshotV1,
} from "../../../src/constraints/snapshot.js";
import type { Persona } from "../../../src/persona/types.js";
import type { BehaviorRuleWithConfidence } from "../../../src/rules/types.js";

const persona: Persona = {
  id: "quality-first_engineering",
  version: "1.2.0",
  behavior: {
    primaryFocus: "quality-first",
    domain: "engineering",
    description: "Prefer verified changes",
  },
  duties: {
    mustDo: ["Run relevant tests"],
    mustNotDo: ["Claim unverified success"],
    shouldDo: ["Keep changes scoped"],
  },
  triggers: { phrases: ["quality first"] },
  ruleCategories: ["testing"],
  constraints: {
    release: [
      {
        id: "release-proof",
        statement: "Capture release proof",
        severity: "error",
        appliesTo: ["src/**"],
      },
    ],
  },
  requires_memory: false,
  offline_safe: {
    confidence_ceiling: 0.7,
    no_memory_disclaimer: "Memory is unavailable",
  },
  scope_constraints: {
    read_globs: ["src/**", "tests/**"],
    write_globs: ["src/**"],
    deny_globs: [".git/**"],
    cross_repo_allowed: true,
  },
};

function rule(overrides: Partial<BehaviorRuleWithConfidence> = {}): BehaviorRuleWithConfidence {
  return {
    rule_id: "rule:test",
    category: "testing",
    text: "Run touched and adjacent tests",
    scope: {},
    alpha: 9,
    beta: 1,
    observation_count: 10,
    severity: "must",
    decay_tau: 30,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_observed: "2026-01-01T00:00:00.000Z",
    confidence: 0.9,
    decay_factor: 1,
    effective_confidence: 0.9,
    ...overrides,
  };
}

const baseline: BaselineData = {
  version: 1,
  source: "/observation/path/does-not-bind-identity.yaml",
  principles: [{ id: "determinism", description: "Same inputs produce the same outputs" }],
  constraints: [
    {
      rule_id: "baseline:truth",
      text: "Report observed results",
      severity: "must",
      confidence: 1,
      category: "baseline",
      source: "baseline",
    },
  ],
};

function constraintSet(overrides: Partial<ConstraintSet> = {}): ConstraintSet {
  return {
    personaId: persona.id,
    derivedAt: "2026-07-21T12:00:00.000Z",
    inputHash: "legacy-input-hash",
    context: {
      domain: "lexsona",
      module_id: "constraints",
      taskType: "implementation",
      context_tags: ["release", "typescript"],
      files: ["tests/snapshot.spec.ts", "src/constraints/snapshot.ts"],
    },
    principles: [...baseline.principles],
    constraints: [
      {
        rule_id: "rule:test",
        text: "Run touched and adjacent tests",
        severity: "must",
        confidence: 0.7,
        category: "testing",
        source: "learned",
      },
      ...baseline.constraints,
    ],
    ruleVersion: 9,
    metadata: {
      rulesConsidered: 2,
      rulesFiltered: 1,
      confidenceThreshold: 0.3,
      offlineMode: true,
      confidenceCeiling: 0.7,
    },
    ...overrides,
  };
}

function build(overrides: Partial<Parameters<typeof createConstraintSnapshotV1>[0]> = {}) {
  return createConstraintSnapshotV1({
    constraintSet: constraintSet(),
    persona,
    rules: [rule(), rule({ rule_id: "rule:excluded", text: "Excluded candidate" })],
    baseline,
    bindings: {
      workspace: "lex-mcp",
      repositoryInstance: "lexsona",
      run: "run-42",
      attempt: "attempt-1",
      workerRole: "implementation",
      modelFamily: "gpt-5",
      task: "issue-126",
      phase: "build",
    },
    ...overrides,
  });
}

describe("ConstraintSnapshot_v1", () => {
  it("serializes byte-identically when runtime timestamps and input order differ", () => {
    const first = build();
    const second = build({
      constraintSet: constraintSet({
        derivedAt: "2099-01-01T00:00:00.000Z",
        context: {
          ...constraintSet().context,
          context_tags: ["typescript", "release"],
          files: ["src/constraints/snapshot.ts", "tests/snapshot.spec.ts"],
        },
        constraints: [...constraintSet().constraints].reverse(),
      }),
      rules: [rule({ rule_id: "rule:excluded", text: "Excluded candidate" }), rule()],
    });

    expect(serializeConstraintSnapshotV1(first)).toBe(serializeConstraintSnapshotV1(second));
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first).not.toHaveProperty("derivedAt");
  });

  it("changes identity when behavior-bearing content changes", () => {
    const first = build();
    const changedRule = build({ rules: [rule({ text: "Run the complete test suite" })] });
    const changedPersona = build({
      persona: {
        ...persona,
        duties: { ...persona.duties, mustDo: ["Run all tests"] },
      },
    });

    expect(changedRule.contentDigest).not.toBe(first.contentDigest);
    expect(changedPersona.contentDigest).not.toBe(first.contentDigest);
  });

  it("binds runtime applicability context and omission decisions into identity", () => {
    const withoutCapability = build({
      constraintSet: constraintSet({
        context: { runtime_family: "generic-host", runtime_capabilities: [] },
        metadata: {
          ...constraintSet().metadata,
          applicability: {
            omitted: 1,
            samples: [
              {
                id: "structured-edits",
                classification: "capability-precondition",
                reason: "capability-missing",
                missing: ["structured-edit"],
              },
            ],
          },
        },
      }),
    });
    const withCapability = build({
      constraintSet: constraintSet({
        context: {
          runtime_family: "generic-host",
          runtime_capabilities: ["structured-edit"],
        },
        metadata: {
          ...constraintSet().metadata,
          applicability: { omitted: 0, samples: [] },
        },
      }),
    });

    expect(withoutCapability.derivation.context.runtimeCapabilities).toEqual([]);
    expect(withoutCapability.resolutions.applicability?.omitted).toBe(1);
    expect(withCapability.contentDigest).not.toBe(withoutCapability.contentDigest);
  });

  it("fails closed on unknown schema majors", () => {
    const unsupported = { ...build(), schemaVersion: 2 };
    expect(() => parseConstraintSnapshotV1(unsupported)).toThrow();
  });

  it("orders actionable output and bounds normal projections", () => {
    const constraints = Array.from({ length: 30 }, (_, index) => ({
      rule_id: `rule:${String(29 - index).padStart(2, "0")}`,
      text: `Constraint ${index}`,
      severity: index % 2 === 0 ? ("should" as const) : ("must" as const),
      confidence: 0.8,
      category: "testing",
      source: "learned" as const,
    }));
    const snapshot = build({ constraintSet: constraintSet({ constraints }) });

    expect(snapshot.constraints.slice(0, 15).every((entry) => entry.severity === "must")).toBe(
      true
    );
    expect(snapshot.compact.constraints).toHaveLength(20);
    expect(snapshot.compact.omitted.constraints).toBe(10);
    expect(snapshot.resolutions.exclusions.sampleRuleIds.length).toBeLessThanOrEqual(12);
  });

  it("keeps diagnostic provenance out of behavioral identity", () => {
    const withoutDiagnostics = build();
    const withDiagnostics = build({ provenanceRef: "lex-frame:abc123" });

    expect(withDiagnostics.diagnostics?.provenanceRef).toBe("lex-frame:abc123");
    expect(withDiagnostics.contentDigest).toBe(withoutDiagnostics.contentDigest);
  });

  it("includes only caller-supplied canonical timestamps in identity", () => {
    const absent = build();
    const supplied = build({ canonicalTimestamp: "2026-07-21T07:00:00-05:00" });

    expect(absent.canonicalTimestamp).toBeUndefined();
    expect(supplied.canonicalTimestamp).toBe("2026-07-21T12:00:00.000Z");
    expect(supplied.contentDigest).not.toBe(absent.contentDigest);
    expect(() => build({ canonicalTimestamp: "2026-07-21T07:00:00" })).toThrow();
  });

  it("never grants authority and intersects requests with the authorized ceiling", () => {
    const snapshot = build({
      authorityCeiling: {
        digest: digestConstraintSnapshotValue({ policy: "sandbox-v3" }),
        readGlobs: ["src/**"],
        writeGlobs: [],
        denyGlobs: ["secrets/**"],
        crossRepoAllowed: false,
      },
    });

    expect(snapshot.authority.grantsAuthority).toBe(false);
    expect(snapshot.authority.effectiveScope).toEqual({
      readGlobs: ["src/**"],
      writeGlobs: [],
      denyGlobs: [".git/**", "secrets/**"],
      crossRepoAllowed: false,
    });
    expect(snapshot.authority.rejectedRequests).toEqual({
      readGlobs: ["tests/**"],
      writeGlobs: ["src/**"],
      crossRepo: true,
    });
  });

  it("exports JSON Schema from the same Zod contract", () => {
    expect(CONSTRAINT_SNAPSHOT_V1_JSON_SCHEMA).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
    });
    expect(parseConstraintSnapshotV1(build()).contract).toBe("ConstraintSnapshot_v1");
  });

  it("canonicalizes nested keys and rejects unsupported JSON values", () => {
    expect(canonicalizeConstraintSnapshotValue({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}'
    );
    expect(() => canonicalizeConstraintSnapshotValue({ bad: Number.NaN })).toThrow();
  });
});

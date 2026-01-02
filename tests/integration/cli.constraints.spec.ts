/**
 * CLI integration tests for constraints commands.
 *
 * These tests exercise the Commander command handlers (option parsing + output formatting)
 * while stubbing LexSona's connection/derivation to keep things deterministic and offline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { registerConstraintsCommands } from "../../src/cli/commands/constraints.js";
import { LexSona } from "../../src/core/lexsona.js";
import type { ConstraintSet } from "../../src/constraints/derive.js";

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerConstraintsCommands(program);
  return program;
}

describe("constraints CLI", () => {
  let tempDir: string;
  let cachePath: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-constraints-tests-"));
    cachePath = join(tempDir, "constraints-cache.json");
    process.env.LEXSONA_CONSTRAINTS_CACHE_PATH = cachePath;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.LEXSONA_CONSTRAINTS_CACHE_PATH;

    logSpy.mockRestore();
    errorSpy.mockRestore();

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  it("derive --json outputs schema-like JSON and writes cache", async () => {
    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: {
        domain: "lexrunner",
        module_id: "cli/commands",
        taskType: "implementation",
      },
      principles: [
        { id: "transparency", description: "Be clear about what you're doing and why" },
        { id: "determinism", description: "Same inputs should produce same outputs" },
        { id: "auditability", description: "All decisions should be traceable" },
      ],
      constraints: [
        {
          rule_id: "no_credential_logging",
          text: "Never log or store credentials, tokens, or secrets",
          severity: "must",
          confidence: 0.7,
          category: "security_policy",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "no_credential_logging",
            confidence: 0.7,
          },
        },
        {
          rule_id: "run_local_ci",
          text: "Run local-ci before any commit",
          severity: "should",
          confidence: 0.65,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "run_local_ci",
            confidence: 0.65,
          },
        },
      ],
      metadata: {
        rulesConsidered: 12,
        rulesFiltered: 10,
        confidenceThreshold: 0.3,
        offlineMode: true,
        confidenceCeiling: 0.7,
      },
    };

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    const connectSpy = vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--persona",
      "quality-first_engineering",
      "--project",
      "lexrunner",
      "--module",
      "cli/commands",
      "--task",
      "implementation",
      "--json",
    ]);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(stubInstance.deriveConstraints).toHaveBeenCalledTimes(1);
    expect(stubInstance.close).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    // First (and only) log should be JSON
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    expect(parsed.version).toBe(1);
    expect(parsed.persona).toBe("quality-first_engineering");
    expect(parsed.domain).toBe("lexrunner");
    expect(parsed.derivedAt).toBe("2025-12-05T23:30:00Z");
    expect(parsed.inputHash).toBe("abc123");
    expect(parsed.constraints).toHaveLength(2);
    expect(parsed.constraints[0].severity).toBe("critical");
    expect(parsed.constraints[0].source).toBe("learned");

    // Cache should be written (raw ConstraintSet)
    expect(existsSync(cachePath)).toBe(true);
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as ConstraintSet;
    expect(cached.personaId).toBe("quality-first_engineering");
    expect(cached.context.domain).toBe("lexrunner");
  });

  it("show --json reads cached derivation and does not reconnect", async () => {
    // Seed cache with a minimal-but-valid ConstraintSet
    const seeded: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner" },
      principles: [{ id: "transparency", description: "Be clear" }],
      constraints: [
        {
          rule_id: "no_false_memories",
          text: "Never fabricate or hallucinate stored memories",
          severity: "must",
          confidence: 0.7,
          category: "safety",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "no_false_memories",
            confidence: 0.7,
          },
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: true,
      },
    };
    // Write file directly (the CLI reads raw ConstraintSet cache)
    writeFileSync(cachePath, JSON.stringify(seeded, null, 2), "utf-8");

    const connectSpy = vi.spyOn(LexSona, "connect");

    const program = createProgram();
    await program.parseAsync(["node", "lexsona", "constraints", "show", "--json"]);

    expect(connectSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    expect(parsed.version).toBe(1);
    expect(parsed.persona).toBe("quality-first_engineering");
    expect(parsed.domain).toBe("lexrunner");
    expect(parsed.constraints).toHaveLength(1);
    expect(parsed.constraints[0].severity).toBe("critical");
  });

  it("explain <id> prints explanation from cached derivation", async () => {
    const seeded: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner", taskType: "review" },
      principles: [],
      constraints: [
        {
          rule_id: "no_credential_logging",
          text: "Never log credentials",
          severity: "must",
          confidence: 0.7,
          category: "security_policy",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "no_credential_logging",
            confidence: 0.7,
          },
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: true,
        confidenceCeiling: 0.7,
      },
    };
    writeFileSync(cachePath, JSON.stringify(seeded, null, 2), "utf-8");

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "explain",
      "no_credential_logging",
    ]);

    expect(errorSpy).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Constraint Explanation");
    expect(output).toContain("no_credential_logging (confidence:");
    expect(output).toContain("learned");
  });

  it("derive --json includes provenance in output", async () => {
    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner" },
      principles: [],
      constraints: [
        {
          rule_id: "test-rule",
          text: "Test constraint",
          severity: "must",
          confidence: 0.8,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "test-rule",
            confidence: 0.8,
          },
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--persona",
      "quality-first_engineering",
      "--json",
    ]);

    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    // Check that provenance is in the output
    expect(parsed.constraints[0].provenance).toBeDefined();
    expect(parsed.constraints[0].provenance.source).toBe("learned");
    expect(parsed.constraints[0].provenance.rule_id).toBe("test-rule");
    expect(parsed.constraints[0].provenance.confidence).toBe(0.8);
  });

  it("derive --json --provenance compact outputs compact provenance (AX-010)", async () => {
    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner" },
      principles: [],
      constraints: [
        {
          rule_id: "test-rule",
          text: "Test constraint",
          severity: "must",
          confidence: 0.8765,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "test-rule",
            confidence: 0.8765,
          },
        },
        {
          rule_id: "persona:duty:1",
          text: "Persona duty",
          severity: "must",
          confidence: 1.0,
          category: "persona-duty",
          source: "persona",
          provenance: {
            source: "persona",
            rule_id: null,
            confidence: 1.0,
          },
        },
      ],
      metadata: {
        rulesConsidered: 2,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--persona",
      "quality-first_engineering",
      "--json",
      "--provenance",
      "compact",
    ]);

    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    // Check learned rule provenance is compact
    expect(parsed.constraints[0].provenance).toBeDefined();
    expect(parsed.constraints[0].provenance.src).toBe("r"); // learned -> 'r'
    expect(parsed.constraints[0].provenance.w).toBe(0.88); // Rounded to 2 decimals
    expect(parsed.constraints[0].provenance.rId).toBe("test-rule");
    expect(parsed.constraints[0].provenance.source).toBeUndefined(); // Should not have full field

    // Check persona provenance is compact
    expect(parsed.constraints[1].provenance).toBeDefined();
    expect(parsed.constraints[1].provenance.src).toBe("p"); // persona -> 'p'
    expect(parsed.constraints[1].provenance.w).toBe(1.0);
    expect(parsed.constraints[1].provenance.rId).toBeUndefined(); // Persona has no rId
  });

  it("explain with no ID explains all constraints in prose format", async () => {
    const seeded: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner" },
      principles: [],
      constraints: [
        {
          rule_id: "rule-1",
          text: "First constraint",
          severity: "must",
          confidence: 0.8,
          category: "validation",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "rule-1",
            confidence: 0.8,
          },
        },
        {
          rule_id: "rule-2",
          text: "Second constraint",
          severity: "should",
          confidence: 0.6,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "rule-2",
            confidence: 0.6,
          },
        },
      ],
      metadata: {
        rulesConsidered: 2,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };
    writeFileSync(cachePath, JSON.stringify(seeded, null, 2), "utf-8");

    const program = createProgram();
    await program.parseAsync(["node", "lexsona", "constraints", "explain"]);

    expect(errorSpy).not.toHaveBeenCalled();

    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("📋 Active Constraints");
    expect(output).toContain("1. rule-1");
    expect(output).toContain("2. rule-2");
    expect(output).toContain("First constraint");
    expect(output).toContain("Second constraint");
    expect(output).toContain("Why active:");
  });

  it("explain with --format json outputs structured JSON", async () => {
    const seeded: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: { domain: "lexrunner", module_id: "cli/commands" },
      principles: [],
      constraints: [
        {
          rule_id: "test-rule",
          text: "Test constraint",
          severity: "should",
          confidence: 0.75,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "test-rule",
            confidence: 0.75,
          },
        },
      ],
      metadata: {
        rulesConsidered: 1,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };
    writeFileSync(cachePath, JSON.stringify(seeded, null, 2), "utf-8");

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "explain",
      "test-rule",
      "--format",
      "json",
    ]);

    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    expect(parsed.constraintId).toBe("test-rule");
    expect(parsed.statement).toBe("Test constraint");
    expect(parsed.severity).toBe("should");
    expect(parsed.category).toBe("testing");
    expect(parsed.confidence).toBe("high"); // 0.75 >= 0.7
    expect(Array.isArray(parsed.reasons)).toBe(true);
    expect(parsed.reasons.length).toBeGreaterThan(0);
    expect(parsed.matchedContext).toBeDefined();
    expect(parsed.matchedContext.domain).toBe("lexrunner");
    expect(parsed.matchedContext.module_id).toBe("cli/commands");
  });

  it("explain all with --format json outputs array of explanations", async () => {
    const seeded: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [
        {
          rule_id: "rule-1",
          text: "First",
          severity: "must",
          confidence: 0.9,
          category: "test",
          source: "learned",
        },
        {
          rule_id: "rule-2",
          text: "Second",
          severity: "should",
          confidence: 0.5,
          category: "test",
          source: "learned",
        },
      ],
      metadata: {
        rulesConsidered: 2,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: false,
      },
    };
    writeFileSync(cachePath, JSON.stringify(seeded, null, 2), "utf-8");

    const program = createProgram();
    await program.parseAsync(["node", "lexsona", "constraints", "explain", "--format", "json"]);

    expect(errorSpy).not.toHaveBeenCalled();

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(logged) as any;

    expect(parsed.version).toBe(1);
    expect(parsed.count).toBe(2);
    expect(Array.isArray(parsed.explanations)).toBe(true);
    expect(parsed.explanations).toHaveLength(2);
    expect(parsed.explanations[0].constraintId).toBe("rule-1");
    expect(parsed.explanations[1].constraintId).toBe("rule-2");
  });
});

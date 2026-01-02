/**
 * Integration tests for auto-scope feature
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";
import { registerConstraintsCommands } from "../../src/cli/commands/constraints.js";
import { LexSona } from "../../src/core/lexsona.js";
import type { ConstraintSet } from "../../src/constraints/derive.js";

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerConstraintsCommands(program);
  return program;
}

describe("auto-scope integration", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-autoscope-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  it("uses auto-scope with lexmap when --auto-scope is provided", async () => {
    // Setup lexmap
    const lexmapDir = join(tempDir, "canon", "policy");
    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      join(lexmapDir, "lexmap.policy.json"),
      JSON.stringify({
        modules: {
          cli: {
            paths: ["src/cli/**"],
          },
        },
      }),
      "utf-8"
    );

    // Set LEX_TOUCHED_FILES to simulate touched files
    process.env.LEX_TOUCHED_FILES = "src/cli/commands/persona.ts";

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: {
        module_id: "cli",
      },
      principles: [],
      constraints: [
        {
          rule_id: "test-rule",
          text: "Test constraint",
          severity: "must",
          confidence: 0.7,
          category: "testing",
          source: "learned",
          provenance: {
            source: "learned",
            rule_id: "test-rule",
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

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    const connectSpy = vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    process.chdir(tempDir);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--auto-scope",
      "--verbose",
      "--persona",
      "quality-first_engineering",
    ]);

    expect(connectSpy).toHaveBeenCalledTimes(1);

    // Check that deriveConstraints was called with module_id set to "cli"
    expect(stubInstance.deriveConstraints).toHaveBeenCalledTimes(1);
    const calledContext = (stubInstance.deriveConstraints as any).mock.calls[0][0];
    expect(calledContext.module_id).toBe("cli");

    // Check verbose output
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Inferred scope: [cli]");
    expect(output).toContain("Source: env");

    delete process.env.LEX_TOUCHED_FILES;
  });

  it("shows warning when --auto-scope is used but no lexmap found", async () => {
    // No lexmap created
    process.env.LEX_TOUCHED_FILES = "src/cli/commands/persona.ts";

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: {},
      principles: [],
      constraints: [],
      metadata: {
        rulesConsidered: 0,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: true,
      },
    };

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    process.chdir(tempDir);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--auto-scope",
      "--verbose",
      "--persona",
      "quality-first_engineering",
    ]);

    // Check that module_id is undefined (not inferred)
    const calledContext = (stubInstance.deriveConstraints as any).mock.calls[0][0];
    expect(calledContext.module_id).toBeUndefined();

    // Check verbose output shows no scope inferred
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("No scope inferred");

    delete process.env.LEX_TOUCHED_FILES;
  });

  it("explicit --module overrides auto-scope", async () => {
    // Setup lexmap
    const lexmapDir = join(tempDir, "canon", "policy");
    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      join(lexmapDir, "lexmap.policy.json"),
      JSON.stringify({
        modules: {
          cli: {
            paths: ["src/cli/**"],
          },
        },
      }),
      "utf-8"
    );

    process.env.LEX_TOUCHED_FILES = "src/cli/commands/persona.ts";

    const constraintSet: ConstraintSet = {
      personaId: "quality-first_engineering",
      derivedAt: "2025-12-05T23:30:00Z",
      inputHash: "abc123",
      context: {
        module_id: "memory",
      },
      principles: [],
      constraints: [],
      metadata: {
        rulesConsidered: 0,
        rulesFiltered: 0,
        confidenceThreshold: 0.3,
        offlineMode: true,
      },
    };

    const stubInstance = {
      deriveConstraints: vi.fn(async () => constraintSet),
      close: vi.fn(),
    } as unknown as LexSona;

    vi.spyOn(LexSona, "connect").mockResolvedValue(stubInstance);

    process.chdir(tempDir);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "lexsona",
      "constraints",
      "derive",
      "--auto-scope",
      "--module",
      "memory",
      "--persona",
      "quality-first_engineering",
    ]);

    // Explicit module should take precedence
    const calledContext = (stubInstance.deriveConstraints as any).mock.calls[0][0];
    expect(calledContext.module_id).toBe("memory");

    delete process.env.LEX_TOUCHED_FILES;
  });
});

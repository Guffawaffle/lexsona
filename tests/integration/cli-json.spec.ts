/**
 * CLI integration tests for global --json flag
 *
 * Tests that all commands support the global --json output mode
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { registerPersonaCommands } from "../../src/cli/commands/persona.js";
import { registerRulesCommands } from "../../src/cli/commands/rules.js";
import { registerConstraintsCommands } from "../../src/cli/commands/constraints.js";

/**
 * Create a test program with all commands registered (like the main CLI)
 */
function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option("--json", "Output as JSON");

  registerPersonaCommands(program);
  registerRulesCommands(program);
  registerConstraintsCommands(program);

  return program;
}

/**
 * Capture console output during test execution
 */
function captureOutput(fn: () => void | Promise<void>): Promise<string> {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: any[]) => {
    logs.push(args.map(String).join(" "));
  };

  const result = fn();

  if (result instanceof Promise) {
    return result
      .finally(() => {
        console.log = originalLog;
        console.error = originalError;
      })
      .then(() => logs.join("\n"));
  }

  console.log = originalLog;
  console.error = originalError;
  return Promise.resolve(logs.join("\n"));
}

describe("Global --json flag", () => {
  let tempDir: string;
  let homeDir: string;
  let projectDir: string;
  let originalCwd: string;
  let originalHome: string;

  beforeEach(() => {
    // Create temporary directories
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-json-cli-"));
    homeDir = join(tempDir, "home");
    projectDir = join(tempDir, "project");

    // Create directories
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    // Save original values
    originalCwd = process.cwd();
    originalHome = process.env.HOME || "";

    // Set test environment
    process.chdir(projectDir);
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    // Restore original values
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Clean up
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("persona commands", () => {
    it("persona list outputs valid JSON with --json", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "lexsona", "--json", "persona", "list"]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("personas");
      expect(Array.isArray(parsed.personas)).toBe(true);
      expect(parsed.personas.length).toBeGreaterThan(0);

      // Validate structure of first persona
      const persona = parsed.personas[0];
      expect(persona).toHaveProperty("id");
      expect(persona).toHaveProperty("version");
      expect(persona).toHaveProperty("focus");
      expect(persona).toHaveProperty("domain");
      expect(persona).toHaveProperty("description");
      expect(persona).toHaveProperty("triggers");
      expect(Array.isArray(persona.triggers)).toBe(true);
    });

    it("persona show outputs valid JSON with --json", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "--json",
          "persona",
          "show",
          "quality-first_engineering",
        ]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("persona");
      expect(parsed.persona).toHaveProperty("id", "quality-first_engineering");
      expect(parsed.persona).toHaveProperty("version");
      expect(parsed.persona).toHaveProperty("focus");
      expect(parsed.persona).toHaveProperty("domain");
      expect(parsed.persona).toHaveProperty("description");
      expect(parsed.persona).toHaveProperty("ruleCategories");
      expect(parsed.persona).toHaveProperty("triggers");
      expect(parsed.persona).toHaveProperty("mustDo");
      expect(parsed.persona).toHaveProperty("mustNotDo");
    });

    it("persona activate outputs valid JSON with --json", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "--json",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("success", true);
      expect(parsed).toHaveProperty("persona");
      expect(parsed).toHaveProperty("scope");
      expect(parsed.persona).toHaveProperty("id", "quality-first_engineering");
      expect(parsed.persona).toHaveProperty("mustDo");
      expect(parsed.persona).toHaveProperty("mustNotDo");
    });

    it("persona deactivate outputs valid JSON with --json", async () => {
      // First activate a persona
      const activateProgram = createProgram();
      await captureOutput(async () => {
        await activateProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      // Then deactivate with JSON output
      const deactivateProgram = createProgram();
      const output = await captureOutput(async () => {
        await deactivateProgram.parseAsync(["node", "lexsona", "--json", "persona", "deactivate"]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("success", true);
      expect(parsed).toHaveProperty("message");
      expect(parsed).toHaveProperty("scope");
    });

    it("persona show with no active persona outputs error JSON", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "lexsona", "--json", "persona", "show"]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("error");
      expect(parsed).toHaveProperty("message");
      expect(parsed.error).toBe("No active persona");
    });

    it("persona activate with invalid name outputs error JSON", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "lexsona",
            "--json",
            "persona",
            "activate",
            "non-existent-persona",
          ]);
        } catch (error) {
          // Commander throws on exit
        }
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("error");
      expect(parsed).toHaveProperty("message");
      expect(parsed.error).toBe("Persona not found");
      expect(parsed.message).toContain("non-existent-persona");
    });
  });

  describe("persona commands without --json", () => {
    it("persona list outputs human-readable text without --json", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "lexsona", "persona", "list"]);
      });

      // Should not be JSON
      expect(() => JSON.parse(output)).toThrow();
      // Should contain expected text
      expect(output).toContain("Available personas:");
      expect(output).toContain("quality-first_engineering");
    });

    it("persona show outputs human-readable text without --json", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "persona",
          "show",
          "quality-first_engineering",
        ]);
      });

      // Should not be JSON
      expect(() => JSON.parse(output)).toThrow();
      // Should contain expected text
      expect(output).toContain("Persona: quality-first_engineering");
      expect(output).toContain("Version:");
      expect(output).toContain("Behavior:");
    });
  });

  describe("JSON output validation", () => {
    it("all JSON outputs are valid and parseable", async () => {
      const commands = [
        ["--json", "persona", "list"],
        ["--json", "persona", "show", "quality-first_engineering"],
        ["--json", "persona", "activate", "quality-first_engineering"],
      ];

      for (const cmd of commands) {
        const program = createProgram();
        const output = await captureOutput(async () => {
          await program.parseAsync(["node", "lexsona", ...cmd]);
        });

        // Should parse without error
        expect(() => JSON.parse(output)).not.toThrow();

        // Should be properly formatted JSON (with indentation)
        const parsed = JSON.parse(output);
        const reformatted = JSON.stringify(parsed, null, 2);
        expect(output).toBe(reformatted);
      }
    });
  });
});

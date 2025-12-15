/**
 * CLI integration tests for persona commands.
 *
 * These tests exercise the full persona command workflow including
 * activation, deactivation, and state persistence across invocations.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { registerPersonaCommands } from "../../src/cli/commands/persona.js";
import {
  getProjectConfigPath,
  getUserConfigPath,
  readConfig,
} from "../../src/persona/config.js";

/**
 * Create a test program with persona commands registered
 */
function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerPersonaCommands(program);
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
    return result.finally(() => {
      console.log = originalLog;
      console.error = originalError;
    }).then(() => logs.join("\n"));
  }

  console.log = originalLog;
  console.error = originalError;
  return Promise.resolve(logs.join("\n"));
}

describe("persona CLI integration", () => {
  let tempDir: string;
  let homeDir: string;
  let projectDir: string;
  let originalCwd: string;
  let originalHome: string;

  beforeEach(() => {
    // Create temporary directories
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-persona-cli-"));
    homeDir = join(tempDir, "home");
    projectDir = join(tempDir, "project");

    // Create directories
    require("fs").mkdirSync(homeDir, { recursive: true });
    require("fs").mkdirSync(projectDir, { recursive: true });

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

  describe("activate command", () => {
    it("activates persona by ID (project-local by default)", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      expect(output).toContain("✓ Activated persona for this project: quality-first_engineering");

      // Verify state was persisted
      const configPath = getProjectConfigPath();
      expect(existsSync(configPath)).toBe(true);

      const config = readConfig(configPath);
      expect(config?.activePersona).toBe("quality-first_engineering");
      expect(config?.activatedAt).toBeDefined();
    });

    it("activates persona globally with --global flag", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "--global",
          "momentum-first_product",
        ]);
      });

      expect(output).toContain("✓ Activated persona globally: momentum-first_product");

      // Verify state was persisted globally
      const configPath = getUserConfigPath();
      expect(existsSync(configPath)).toBe(true);

      const config = readConfig(configPath);
      expect(config?.activePersona).toBe("momentum-first_product");
    });

    it("activates persona by trigger phrase", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "senior dev",
        ]);
      });

      expect(output).toContain("✓ Activated persona for this project: quality-first_engineering");

      // Verify correct persona was activated
      const config = readConfig(getProjectConfigPath());
      expect(config?.activePersona).toBe("quality-first_engineering");
    });

    it("reports error for non-existent persona", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "lexsona",
            "persona",
            "activate",
            "non-existent-persona",
          ]);
        } catch (error) {
          // Commander throws on exit
        }
      });

      expect(output).toContain('Error: Persona "non-existent-persona" not found');
      expect(process.exitCode).toBe(1);
    });
  });

  describe("show command", () => {
    it("displays currently active persona (project-local)", async () => {
      // Activate a persona first
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

      // Show active persona
      const showProgram = createProgram();
      const output = await captureOutput(async () => {
        await showProgram.parseAsync(["node", "lexsona", "persona", "show"]);
      });

      expect(output).toContain("Currently active persona (for this project)");
      expect(output).toContain("Persona: quality-first_engineering");
    });

    it("displays currently active persona (global)", async () => {
      // Activate a persona globally
      const activateProgram = createProgram();
      await captureOutput(async () => {
        await activateProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "--global",
          "momentum-first_product",
        ]);
      });

      // Show active persona
      const showProgram = createProgram();
      const output = await captureOutput(async () => {
        await showProgram.parseAsync(["node", "lexsona", "persona", "show"]);
      });

      expect(output).toContain("Currently active persona (globally)");
      expect(output).toContain("Persona: momentum-first_product");
    });

    it("prefers project-local over global", async () => {
      // Activate global first
      const globalProgram = createProgram();
      await captureOutput(async () => {
        await globalProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "--global",
          "momentum-first_product",
        ]);
      });

      // Then activate project-local
      const projectProgram = createProgram();
      await captureOutput(async () => {
        await projectProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      // Show should display project-local
      const showProgram = createProgram();
      const output = await captureOutput(async () => {
        await showProgram.parseAsync(["node", "lexsona", "persona", "show"]);
      });

      expect(output).toContain("Currently active persona (for this project)");
      expect(output).toContain("Persona: quality-first_engineering");
      expect(output).not.toContain("momentum-first_product");
    });

    it("reports when no persona is active", async () => {
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "lexsona", "persona", "show"]);
      });

      expect(output).toContain("No persona currently active");
      expect(output).toContain("Use 'lexsona persona activate <name>' to activate one");
    });

    it("shows specific persona when name is provided", async () => {
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

      expect(output).toContain("Persona: quality-first_engineering");
      expect(output).toContain("Version:");
      expect(output).toContain("Behavior:");
    });
  });

  describe("deactivate command", () => {
    it("deactivates project-local persona by default", async () => {
      // Activate first
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

      // Deactivate
      const deactivateProgram = createProgram();
      const output = await captureOutput(async () => {
        await deactivateProgram.parseAsync(["node", "lexsona", "persona", "deactivate"]);
      });

      expect(output).toContain("✓ Persona deactivated for this project");

      // Verify state was cleared
      const config = readConfig(getProjectConfigPath());
      expect(config?.activePersona).toBeUndefined();
    });

    it("deactivates global persona with --global flag", async () => {
      // Activate globally
      const activateProgram = createProgram();
      await captureOutput(async () => {
        await activateProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "--global",
          "momentum-first_product",
        ]);
      });

      // Deactivate globally
      const deactivateProgram = createProgram();
      const output = await captureOutput(async () => {
        await deactivateProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "deactivate",
          "--global",
        ]);
      });

      expect(output).toContain("✓ Persona deactivated globally");

      // Verify state was cleared
      const config = readConfig(getUserConfigPath());
      expect(config?.activePersona).toBeUndefined();
    });

    it("does not error when deactivating non-existent state", async () => {
      // Reset exitCode from previous tests
      process.exitCode = 0;
      
      const program = createProgram();
      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "lexsona", "persona", "deactivate"]);
      });

      expect(output).toContain("✓ Persona deactivated for this project");
      expect(process.exitCode).not.toBe(1);
    });

    it("only clears specified scope", async () => {
      // Activate both scopes
      const globalProgram = createProgram();
      await captureOutput(async () => {
        await globalProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "--global",
          "momentum-first_product",
        ]);
      });

      const projectProgram = createProgram();
      await captureOutput(async () => {
        await projectProgram.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      // Deactivate only project-local
      const deactivateProgram = createProgram();
      await captureOutput(async () => {
        await deactivateProgram.parseAsync(["node", "lexsona", "persona", "deactivate"]);
      });

      // Verify project-local is cleared but global remains
      const projectConfig = readConfig(getProjectConfigPath());
      expect(projectConfig?.activePersona).toBeUndefined();

      const globalConfig = readConfig(getUserConfigPath());
      expect(globalConfig?.activePersona).toBe("momentum-first_product");
    });
  });

  describe("state persistence across invocations", () => {
    it("maintains state across multiple CLI invocations", async () => {
      // First invocation: activate
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

      // Second invocation: show (simulating new shell)
      const showProgram = createProgram();
      const output = await captureOutput(async () => {
        await showProgram.parseAsync(["node", "lexsona", "persona", "show"]);
      });

      expect(output).toContain("Currently active persona (for this project)");
      expect(output).toContain("Persona: quality-first_engineering");
    });

    it("persists activation timestamp", async () => {
      const beforeActivation = new Date();

      const program = createProgram();
      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "lexsona",
          "persona",
          "activate",
          "quality-first_engineering",
        ]);
      });

      const afterActivation = new Date();

      const config = readConfig(getProjectConfigPath());
      expect(config?.activatedAt).toBeDefined();

      const activatedAt = new Date(config!.activatedAt!);
      expect(activatedAt.getTime()).toBeGreaterThanOrEqual(beforeActivation.getTime());
      expect(activatedAt.getTime()).toBeLessThanOrEqual(afterActivation.getTime());
    });
  });
});

/**
 * CLI Database Command Tests
 *
 * Tests for the lexsona db command
 */

import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import { join } from "path";

const CLI_PATH = join(process.cwd(), "dist", "cli", "lexsona.js");

/**
 * Run CLI command and capture output
 */
async function runCLI(args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve(stdout + stderr);
      }
    });

    proc.on("error", reject);
  });
}

describe("CLI db commands", () => {
  describe("db status", () => {
    it("displays discovery information when no database found", async () => {
      const output = await runCLI(["db", "status"]);

      expect(output).toContain("Database Discovery");
      expect(output).toContain("Checking:");
      expect(output).toMatch(/(Not found|No database found)/);
    });

    it("shows help message when no database found", async () => {
      const output = await runCLI(["db", "status"]);

      expect(output).toContain("To fix:");
      expect(output).toContain("lex init");
      expect(output).toContain("LEX_DB_PATH");
    });

    it("lists all candidate paths in order", async () => {
      const output = await runCLI(["db", "status"]);

      // Should check project-local first
      expect(output).toContain(".smartergpt/lex/lex.db");

      // Should check local override
      expect(output).toContain(".smartergpt.local/lex/memory.db");

      // Should check user-global paths
      expect(output).toMatch(/\.smartergpt\/lex\/(lex|memory)\.db/);
    });

    it("shows LEX_DB_PATH when set", async () => {
      const output = await runCLI(["db", "status"], {
        LEX_DB_PATH: "/custom/path.db",
      });

      expect(output).toContain("LEX_DB_PATH");
    });

    it("shows LEX_DB_PATH as first candidate when set", async () => {
      const output = await runCLI(["db", "status"], {
        LEX_DB_PATH: "/custom/path.db",
      });

      // LEX_DB_PATH should appear before project-local paths
      const envIndex = output.indexOf("LEX_DB_PATH");
      const projectIndex = output.indexOf(".smartergpt/lex/lex.db");

      expect(envIndex).toBeGreaterThan(-1);
      expect(envIndex).toBeLessThan(projectIndex);
    });
  });

  describe("db help", () => {
    it("shows db command in main help", async () => {
      const output = await runCLI(["--help"]);

      expect(output).toContain("db");
      expect(output).toContain("Database diagnostics");
    });

    it("shows status subcommand in db help", async () => {
      const output = await runCLI(["db", "--help"]);

      expect(output).toContain("status");
      expect(output).toContain("discovery");
    });
  });
});

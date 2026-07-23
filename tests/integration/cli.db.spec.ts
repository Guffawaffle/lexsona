/**
 * CLI Database Command Tests
 *
 * Every path visible to the subprocess belongs to this test file. The suite
 * never discovers or opens a project or user database from the host machine.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3-multiple-ciphers";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI_PATH = fileURLToPath(new URL("../../dist/cli/lexsona.js", import.meta.url));

interface CliTestSandbox {
  root: string;
  project: string;
  home: string;
  config: string;
  temp: string;
  missingDatabase: string;
}

let sandbox: CliTestSandbox;

function createSandbox(): CliTestSandbox {
  const root = mkdtempSync(join(tmpdir(), "lexsona-cli-db-"));
  const result = {
    root,
    project: join(root, "project"),
    home: join(root, "home"),
    config: join(root, "config"),
    temp: join(root, "temp"),
    missingDatabase: join(root, "missing", "lex.db"),
  };
  for (const directory of [result.project, result.home, result.config, result.temp]) {
    mkdirSync(directory, { recursive: true });
  }
  return result;
}

function createDatabaseFixture(path: string, ruleCount: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.exec("CREATE TABLE lexsona_behavior_rules (rule_id TEXT PRIMARY KEY)");
    const insert = db.prepare("INSERT INTO lexsona_behavior_rules(rule_id) VALUES (?)");
    for (let index = 0; index < ruleCount; index += 1) {
      insert.run(`rule-${index}`);
    }
  } finally {
    db.close();
  }
}

function isolatedEnvironment(
  overrides: Record<string, string> = {},
  inheritedEnvironment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...inheritedEnvironment,
    HOME: sandbox.home,
    USERPROFILE: sandbox.home,
    XDG_CONFIG_HOME: sandbox.config,
    APPDATA: sandbox.config,
    LOCALAPPDATA: sandbox.config,
    TMPDIR: sandbox.temp,
    TEMP: sandbox.temp,
    TMP: sandbox.temp,
    PWD: sandbox.project,
    INIT_CWD: sandbox.project,
  };
  delete environment.LEX_DB_PATH;
  return { ...environment, ...overrides };
}

async function runCLI(
  args: string[],
  env: Record<string, string> = {},
  inheritedEnvironment: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: sandbox.project,
      env: isolatedEnvironment(env, inheritedEnvironment),
      stdio: ["ignore", "pipe", "pipe"],
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
      if (code === 0) {
        resolve(stdout + stderr);
      } else {
        reject(new Error(stderr || stdout || `Process exited with code ${String(code)}`));
      }
    });
    proc.on("error", reject);
  });
}

beforeAll(() => {
  sandbox = createSandbox();
});

afterAll(() => {
  rmSync(sandbox.root, { recursive: true, force: true });
});

describe("CLI db commands", () => {
  describe("db status", () => {
    it("reports a deterministic no-database result from an explicit test-owned path", async () => {
      const output = await runCLI(["db", "status"], {
        LEX_DB_PATH: sandbox.missingDatabase,
      });

      expect(output).toContain("Database Discovery");
      expect(output).toContain("No database found.");
      expect(output).toContain("To fix:");
      expect(output).toContain("lex init");
    });

    it("checks only isolated project and home candidates", async () => {
      const output = await runCLI(["db", "status"], {
        LEX_DB_PATH: sandbox.missingDatabase,
      });

      expect(output).toContain(join(sandbox.project, ".smartergpt", "lex", "lex.db"));
      expect(output).toContain(join(sandbox.project, ".smartergpt.local", "lex", "memory.db"));
      expect(output).toContain(join(sandbox.home, ".smartergpt", "lex", "lex.db"));
      expect(output).not.toContain(REPOSITORY_ROOT);
    });

    it("shows an explicit test-owned LEX_DB_PATH as the first candidate", async () => {
      const output = await runCLI(["db", "status"], {
        LEX_DB_PATH: sandbox.missingDatabase,
      });

      const environmentIndex = output.indexOf("Checking: LEX_DB_PATH");
      const projectIndex = output.indexOf(join(sandbox.project, ".smartergpt", "lex", "lex.db"));
      expect(environmentIndex).toBeGreaterThan(-1);
      expect(environmentIndex).toBeLessThan(projectIndex);
    });

    it("connects to a fresh test-owned fixture and reports only its rows", async () => {
      const fixturePath = join(sandbox.root, "fixtures", "positive.db");
      createDatabaseFixture(fixturePath, 2);

      const output = await runCLI(["db", "status"], { LEX_DB_PATH: fixturePath });

      expect(output).toContain(`Active database: ${fixturePath}`);
      expect(output).toContain("Connection test:");
      expect(output).toContain("✓ OK");
      expect(output).toContain("Rules: 2");
    });

    it("ignores populated inherited database locations outside the sandbox", async () => {
      const ambientProject = join(sandbox.root, "ambient-project");
      const ambientHome = join(sandbox.root, "ambient-home");
      const ambientExplicit = join(sandbox.root, "ambient-explicit", "lex.db");
      const ambientProjectDb = join(ambientProject, ".smartergpt", "lex", "lex.db");
      const ambientHomeDb = join(ambientHome, ".smartergpt", "lex", "lex.db");
      for (const path of [ambientExplicit, ambientProjectDb, ambientHomeDb]) {
        createDatabaseFixture(path, 99);
      }

      const pollutedEnvironment = {
        ...process.env,
        HOME: ambientHome,
        USERPROFILE: ambientHome,
        PWD: ambientProject,
        INIT_CWD: ambientProject,
        LEX_DB_PATH: ambientExplicit,
      };
      const output = await runCLI(
        ["db", "status"],
        { LEX_DB_PATH: sandbox.missingDatabase },
        pollutedEnvironment
      );

      expect(output).toContain("No database found.");
      expect(output).not.toContain(ambientExplicit);
      expect(output).not.toContain(ambientProject);
      expect(output).not.toContain(ambientHome);
      expect(output).not.toContain("Rules: 99");
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

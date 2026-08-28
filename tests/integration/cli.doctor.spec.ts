/**
 * CLI doctor integration tests.
 *
 * The subprocess runs from a test-owned directory with no node_modules so the
 * Lex peer check must resolve from the installed LexSona package graph rather
 * than from the caller's current working directory.
 */

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";

const CLI_PATH = fileURLToPath(new URL("../../dist/cli/lexsona.js", import.meta.url));

interface DoctorSandbox {
  root: string;
  project: string;
  home: string;
  config: string;
  temp: string;
  database: string;
}

let sandbox: DoctorSandbox;

function createSandbox(): DoctorSandbox {
  const root = mkdtempSync(join(tmpdir(), "lexsona-cli-doctor-"));
  const result = {
    root,
    project: join(root, "project"),
    home: join(root, "home"),
    config: join(root, "config"),
    temp: join(root, "temp"),
    database: join(root, "fixture", "lex.db"),
  };

  for (const directory of [result.project, result.home, result.config, result.temp]) {
    mkdirSync(directory, { recursive: true });
  }
  mkdirSync(join(root, "fixture"), { recursive: true });
  const database = new Database(result.database);
  database.exec("CREATE TABLE lexsona_behavior_rules (rule_id TEXT PRIMARY KEY)");
  database.close();
  return result;
}

function runDoctor(): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, "--json", "doctor"], {
      cwd: sandbox.project,
      env: {
        ...process.env,
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
        LEX_DB_PATH: sandbox.database,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", reject);
  });
}

beforeAll(() => {
  sandbox = createSandbox();
});

afterAll(() => {
  rmSync(sandbox.root, { recursive: true, force: true });
});

describe("lexsona doctor", () => {
  it("resolves the Lex peer from LexSona's package graph outside a consumer project", async () => {
    const result = await runDoctor();
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout) as {
      status: { healthy: boolean };
      checks: { lex: { version: string | null; ok: boolean } };
    };
    expect(result.code, result.stdout).toBe(0);
    expect(report.status.healthy).toBe(true);
    expect(report.checks.lex).toEqual({ version: "4.0.3", ok: true });
  });
});

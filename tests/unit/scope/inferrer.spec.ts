/**
 * Unit tests for scope inference
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { inferScope } from "../../../src/scope/inferrer.js";
import * as child_process from "child_process";

// Mock child_process exec
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof child_process>("child_process");
  return {
    ...actual,
    exec: vi.fn(),
  };
});

describe("inferScope", () => {
  let tempDir: string;
  const originalEnv = process.env.LEX_TOUCHED_FILES;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-infer-test-"));
    delete process.env.LEX_TOUCHED_FILES;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (originalEnv !== undefined) {
      process.env.LEX_TOUCHED_FILES = originalEnv;
    } else {
      delete process.env.LEX_TOUCHED_FILES;
    }
  });

  it("uses explicit files when provided", async () => {
    const lexmapDir = join(tempDir, "canon", "policy");
    const lexmapPath = join(lexmapDir, "lexmap.policy.json");

    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          memory: {
            paths: ["src/memory/**"],
          },
        },
      }),
      "utf-8"
    );

    const result = await inferScope({
      files: ["src/memory/store.ts", "src/memory/index.ts"],
      baseDir: tempDir,
    });

    expect(result.source).toBe("explicit");
    expect(result.touchedFiles).toEqual(["src/memory/store.ts", "src/memory/index.ts"]);
    expect(result.moduleIds).toContain("memory");
  });

  it("uses LEX_TOUCHED_FILES environment variable", async () => {
    process.env.LEX_TOUCHED_FILES = "src/cli/commands/persona.ts:src/cli/index.ts";

    const lexmapDir = join(tempDir, "canon", "policy");
    const lexmapPath = join(lexmapDir, "lexmap.policy.json");

    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          cli: {
            paths: ["src/cli/**"],
          },
        },
      }),
      "utf-8"
    );

    const result = await inferScope({
      baseDir: tempDir,
    });

    expect(result.source).toBe("env");
    expect(result.touchedFiles).toContain("src/cli/commands/persona.ts");
    expect(result.touchedFiles).toContain("src/cli/index.ts");
    expect(result.moduleIds).toContain("cli");
  });

  it("returns empty result when no lexmap found", async () => {
    const result = await inferScope({
      files: ["src/memory/store.ts"],
      baseDir: tempDir,
    });

    expect(result.source).toBe("explicit");
    expect(result.touchedFiles).toEqual(["src/memory/store.ts"]);
    expect(result.moduleIds).toEqual([]);
  });

  it("returns empty result when no files match any module", async () => {
    const lexmapDir = join(tempDir, "canon", "policy");
    const lexmapPath = join(lexmapDir, "lexmap.policy.json");

    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          memory: {
            paths: ["src/memory/**"],
          },
        },
      }),
      "utf-8"
    );

    const result = await inferScope({
      files: ["README.md", "package.json"],
      baseDir: tempDir,
    });

    expect(result.source).toBe("explicit");
    expect(result.touchedFiles).toEqual(["README.md", "package.json"]);
    expect(result.moduleIds).toEqual([]);
  });

  it("returns sorted module IDs", async () => {
    const lexmapDir = join(tempDir, "canon", "policy");
    const lexmapPath = join(lexmapDir, "lexmap.policy.json");

    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          cli: {
            paths: ["src/cli/**"],
          },
          memory: {
            paths: ["src/memory/**"],
          },
          constraints: {
            paths: ["src/constraints/**"],
          },
        },
      }),
      "utf-8"
    );

    const result = await inferScope({
      files: ["src/memory/store.ts", "src/cli/index.ts", "src/constraints/derive.ts"],
      baseDir: tempDir,
    });

    expect(result.moduleIds).toEqual(["cli", "constraints", "memory"]);
  });

  it("returns empty when no files touched", async () => {
    const result = await inferScope({
      files: [],
      baseDir: tempDir,
    });

    expect(result.source).toBe("explicit");
    expect(result.touchedFiles).toEqual([]);
    expect(result.moduleIds).toEqual([]);
  });
});

/**
 * Unit tests for lexmap loading and path-to-module mapping
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadLexmap, mapFilesToModules, type Lexmap } from "../../../src/scope/lexmap.js";

describe("lexmap loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lexsona-lexmap-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads lexmap from canonical location", () => {
    const lexmapDir = join(tempDir, "canon", "policy");
    const lexmapPath = join(lexmapDir, "lexmap.policy.json");

    // Create directory structure
    mkdirSync(lexmapDir, { recursive: true });
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          memory: {
            paths: ["src/memory/**", "memory/**"],
            constraints: ["no-side-effects"],
          },
          cli: {
            paths: ["src/cli/**"],
            constraints: ["user-facing"],
          },
        },
      }),
      "utf-8"
    );

    const lexmap = loadLexmap({ baseDir: tempDir });

    expect(lexmap).not.toBeNull();
    expect(lexmap?.modules).toHaveProperty("memory");
    expect(lexmap?.modules).toHaveProperty("cli");
    expect(lexmap?.modules.memory.paths).toContain("src/memory/**");
  });

  it("loads lexmap from explicit path", () => {
    const lexmapPath = join(tempDir, "custom-lexmap.json");

    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: {
          core: {
            paths: ["src/core/**"],
          },
        },
      }),
      "utf-8"
    );

    const lexmap = loadLexmap({ lexmapPath });

    expect(lexmap).not.toBeNull();
    expect(lexmap?.modules).toHaveProperty("core");
  });

  it("returns null if lexmap not found", () => {
    const lexmap = loadLexmap({ baseDir: tempDir });
    expect(lexmap).toBeNull();
  });

  it("returns null if lexmap is invalid JSON", () => {
    const lexmapPath = join(tempDir, "lexmap.policy.json");
    writeFileSync(lexmapPath, "invalid json {", "utf-8");

    const lexmap = loadLexmap({ baseDir: tempDir });
    expect(lexmap).toBeNull();
  });

  it("returns null if lexmap schema is invalid", () => {
    const lexmapPath = join(tempDir, "lexmap.policy.json");
    writeFileSync(
      lexmapPath,
      JSON.stringify({
        modules: "not an object",
      }),
      "utf-8"
    );

    const lexmap = loadLexmap({ baseDir: tempDir });
    expect(lexmap).toBeNull();
  });
});

describe("mapFilesToModules", () => {
  it("maps files to modules using glob patterns", () => {
    const lexmap: Lexmap = {
      modules: {
        memory: {
          paths: ["src/memory/**", "memory/**"],
        },
        cli: {
          paths: ["src/cli/**"],
        },
        constraints: {
          paths: ["src/constraints/**"],
        },
      },
    };

    const files = [
      "src/memory/store.ts",
      "src/cli/commands/persona.ts",
      "src/constraints/derive.ts",
    ];

    const modules = mapFilesToModules(files, lexmap);

    expect(modules).toContain("memory");
    expect(modules).toContain("cli");
    expect(modules).toContain("constraints");
    expect(modules.size).toBe(3);
  });

  it("handles files that don't match any module", () => {
    const lexmap: Lexmap = {
      modules: {
        memory: {
          paths: ["src/memory/**"],
        },
      },
    };

    const files = ["src/cli/commands/persona.ts", "README.md"];

    const modules = mapFilesToModules(files, lexmap);

    expect(modules.size).toBe(0);
  });

  it("deduplicates modules when multiple files match the same module", () => {
    const lexmap: Lexmap = {
      modules: {
        memory: {
          paths: ["src/memory/**"],
        },
      },
    };

    const files = ["src/memory/store.ts", "src/memory/types.ts", "src/memory/index.ts"];

    const modules = mapFilesToModules(files, lexmap);

    expect(modules.size).toBe(1);
    expect(modules).toContain("memory");
  });

  it("matches files using micromatch glob patterns", () => {
    const lexmap: Lexmap = {
      modules: {
        tests: {
          paths: ["**/*.spec.ts", "**/*.test.ts"],
        },
      },
    };

    const files = ["src/memory/store.spec.ts", "tests/unit/utils.test.ts"];

    const modules = mapFilesToModules(files, lexmap);

    expect(modules.size).toBe(1);
    expect(modules).toContain("tests");
  });
});

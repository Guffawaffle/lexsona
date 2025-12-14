/**
 * Persona Configuration Tests
 *
 * Tests for persistent persona activation state management.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getProjectConfigPath,
  getUserConfigPath,
  readConfig,
  writeConfig,
  getActivePersona,
  setActivePersona,
  clearActivePersona,
} from "../../../src/persona/config.js";

describe("Persona Config", () => {
  let testDir: string;
  let homeDir: string;
  let projectDir: string;
  let originalCwd: string;
  let originalHome: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = join(tmpdir(), `lexsona-test-${Date.now()}`);
    homeDir = join(testDir, "home");
    projectDir = join(testDir, "project");

    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    // Save original cwd and HOME
    originalCwd = process.cwd();
    originalHome = process.env.HOME || "";

    // Change to project directory for tests
    process.chdir(projectDir);
    process.env.HOME = homeDir;
  });

  afterEach(() => {
    // Restore original values
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("path functions", () => {
    it("getProjectConfigPath returns .smartergpt/lexsona.yaml in cwd", () => {
      const path = getProjectConfigPath();
      expect(path).toBe(join(projectDir, ".smartergpt", "lexsona.yaml"));
    });

    it("getUserConfigPath returns .smartergpt/lexsona.yaml in home", () => {
      const path = getUserConfigPath();
      expect(path).toBe(join(homeDir, ".smartergpt", "lexsona.yaml"));
    });
  });

  describe("readConfig", () => {
    it("returns null for non-existent file", () => {
      const config = readConfig(join(testDir, "nonexistent.yaml"));
      expect(config).toBeNull();
    });

    it("reads valid config file", () => {
      const configPath = join(testDir, "test-config.yaml");
      const configContent = `version: 1
activePersona: quality-first_engineering
activatedAt: 2025-12-13T00:00:00Z
`;
      writeFileSync(configPath, configContent, "utf-8");

      const config = readConfig(configPath);
      expect(config).not.toBeNull();
      expect(config?.version).toBe(1);
      expect(config?.activePersona).toBe("quality-first_engineering");
      expect(config?.activatedAt).toBe("2025-12-13T00:00:00Z");
    });

    it("throws for invalid config file", () => {
      const configPath = join(testDir, "invalid-config.yaml");
      const configContent = `version: "not a number"
`;
      writeFileSync(configPath, configContent, "utf-8");

      expect(() => readConfig(configPath)).toThrow();
    });
  });

  describe("writeConfig", () => {
    it("writes valid config file", () => {
      const configPath = join(projectDir, ".smartergpt", "lexsona.yaml");
      const config = {
        version: 1,
        activePersona: "quality-first_engineering",
        activatedAt: "2025-12-13T00:00:00Z",
      };

      writeConfig(configPath, config);

      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("version: 1");
      expect(content).toContain("activePersona: quality-first_engineering");
      expect(content).toContain("activatedAt: 2025-12-13T00:00:00Z");
    });

    it("creates directory if it doesn't exist", () => {
      const configPath = join(projectDir, ".smartergpt", "lexsona.yaml");
      const config = {
        version: 1,
        activePersona: "quality-first_engineering",
      };

      writeConfig(configPath, config);

      expect(existsSync(join(projectDir, ".smartergpt"))).toBe(true);
      expect(existsSync(configPath)).toBe(true);
    });
  });

  describe("getActivePersona", () => {
    it("returns null when no config exists", () => {
      const result = getActivePersona();
      expect(result.personaId).toBeNull();
      expect(result.scope).toBeNull();
    });

    it("returns project-local persona when set", () => {
      setActivePersona("quality-first_engineering", false);
      const result = getActivePersona();

      expect(result.personaId).toBe("quality-first_engineering");
      expect(result.scope).toBe("project");
    });

    it("returns global persona when set", () => {
      setActivePersona("momentum-first_product", true);
      const result = getActivePersona();

      expect(result.personaId).toBe("momentum-first_product");
      expect(result.scope).toBe("global");
    });

    it("prefers project-local over global", () => {
      setActivePersona("momentum-first_product", true);
      setActivePersona("quality-first_engineering", false);

      const result = getActivePersona();
      expect(result.personaId).toBe("quality-first_engineering");
      expect(result.scope).toBe("project");
    });
  });

  describe("setActivePersona", () => {
    it("sets project-local persona by default", () => {
      setActivePersona("quality-first_engineering");

      const projectPath = getProjectConfigPath();
      expect(existsSync(projectPath)).toBe(true);

      const config = readConfig(projectPath);
      expect(config?.activePersona).toBe("quality-first_engineering");
      expect(config?.activatedAt).toBeDefined();
    });

    it("sets global persona when global=true", () => {
      setActivePersona("momentum-first_product", true);

      const globalPath = getUserConfigPath();
      expect(existsSync(globalPath)).toBe(true);

      const config = readConfig(globalPath);
      expect(config?.activePersona).toBe("momentum-first_product");
      expect(config?.activatedAt).toBeDefined();
    });

    it("sets activatedAt to current timestamp", () => {
      const before = new Date();
      setActivePersona("quality-first_engineering");
      const after = new Date();

      const config = readConfig(getProjectConfigPath());
      const activatedAt = new Date(config?.activatedAt || "");

      expect(activatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(activatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("clearActivePersona", () => {
    it("clears project-local persona by default", () => {
      setActivePersona("quality-first_engineering", false);
      clearActivePersona(false);

      const result = getActivePersona();
      expect(result.personaId).toBeNull();
    });

    it("clears global persona when global=true", () => {
      setActivePersona("momentum-first_product", true);
      clearActivePersona(true);

      const result = getActivePersona();
      expect(result.personaId).toBeNull();
    });

    it("does nothing if config doesn't exist", () => {
      // Should not throw
      expect(() => clearActivePersona(false)).not.toThrow();
    });

    it("only clears specified scope", () => {
      setActivePersona("quality-first_engineering", false);
      setActivePersona("momentum-first_product", true);

      clearActivePersona(false);

      const result = getActivePersona();
      // Should now return global persona
      expect(result.personaId).toBe("momentum-first_product");
      expect(result.scope).toBe("global");
    });
  });
});

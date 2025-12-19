/**
 * Lex Connection Tests
 *
 * Tests for the Lex storage connection module.
 * Note: These tests use mocks since we don't have a real Lex database in CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDefaultDbPath, discoverDbPath } from "../../../src/core/lexConnection.js";
import { join } from "path";
import { homedir } from "os";

describe("lexConnection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDefaultDbPath", () => {
    it("returns LEX_DB_PATH when set, even if file doesn't exist", () => {
      process.env.LEX_DB_PATH = "/custom/path/lex.db";
      expect(getDefaultDbPath()).toBe("/custom/path/lex.db");
    });

    it("returns first existing path or fallback when LEX_DB_PATH not set", () => {
      delete process.env.LEX_DB_PATH;
      const result = getDefaultDbPath();
      const discoveries = discoverDbPath();

      // Find the first existing database in discovery order
      const firstExisting = discoveries.find((d) => d.exists);

      if (firstExisting) {
        // If a database exists, that should be returned
        expect(result).toBe(firstExisting.path);
      } else {
        // If no database exists, should fall back to home directory path
        expect(result).toBe(join(homedir(), ".smartergpt", "lex", "lex.db"));
      }
    });
  });

  describe("discoverDbPath", () => {
    it("returns all candidate paths with their status", () => {
      delete process.env.LEX_DB_PATH;
      const results = discoverDbPath();

      // Should have 4 candidates when LEX_DB_PATH is not set
      // (project-local, local-override, user-global, user-global-alt)
      expect(results).toHaveLength(4);

      // Each result should have required fields
      results.forEach((result) => {
        expect(result).toHaveProperty("path");
        expect(result).toHaveProperty("source");
        expect(result).toHaveProperty("exists");
      });
    });

    it("includes LEX_DB_PATH in candidates when set", () => {
      process.env.LEX_DB_PATH = "/custom/path.db";
      const results = discoverDbPath();

      // Should have 5 candidates when LEX_DB_PATH is set
      expect(results.length).toBeGreaterThanOrEqual(5);

      // First candidate should be LEX_DB_PATH
      expect(results[0].source).toBe("LEX_DB_PATH");
      expect(results[0].path).toBe("/custom/path.db");
    });

    it("checks expected paths in correct order", () => {
      delete process.env.LEX_DB_PATH;
      const results = discoverDbPath();
      const cwd = process.cwd();
      const home = homedir();

      // Verify order of discovery (excluding LEX_DB_PATH since it's not set)
      expect(results[0].source).toBe("project-local");
      expect(results[0].path).toBe(join(cwd, ".smartergpt", "lex", "lex.db"));

      expect(results[1].source).toBe("local-override");
      expect(results[1].path).toBe(join(cwd, ".smartergpt.local", "lex", "memory.db"));

      expect(results[2].source).toBe("user-global");
      expect(results[2].path).toBe(join(home, ".smartergpt", "lex", "lex.db"));

      expect(results[3].source).toBe("user-global-alt");
      expect(results[3].path).toBe(join(home, ".smartergpt", "lex", "memory.db"));
    });
  });
});

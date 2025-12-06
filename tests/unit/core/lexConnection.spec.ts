/**
 * Lex Connection Tests
 *
 * Tests for the Lex storage connection module.
 * Note: These tests use mocks since we don't have a real Lex database in CI.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDefaultDbPath } from "../../../src/core/lexConnection.js";
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
    it("returns LEX_DB_PATH when set", () => {
      process.env.LEX_DB_PATH = "/custom/path/lex.db";
      expect(getDefaultDbPath()).toBe("/custom/path/lex.db");
    });

    it("returns user home path as fallback when local doesn't exist", () => {
      delete process.env.LEX_DB_PATH;
      const result = getDefaultDbPath();

      // Should fall back to home directory path
      expect(result).toBe(join(homedir(), ".smartergpt", "lex", "lex.db"));
    });
  });
});

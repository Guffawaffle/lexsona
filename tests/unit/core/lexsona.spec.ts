/**
 * LexSona Core Tests
 *
 * Tests for the main LexSona runtime engine.
 * Uses disconnected mode since we don't have a real Lex database in CI.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LexSona } from "../../../src/core/lexsona.js";

describe("LexSona", () => {
  let sona: LexSona;

  beforeEach(async () => {
    // Create LexSona in disconnected mode by specifying a non-existent path
    // This ensures consistent behavior across dev and CI environments
    sona = await LexSona.connect({ lexDb: "/nonexistent/path/db.sqlite" });
  });

  describe("connect", () => {
    it("creates instance without database", async () => {
      // Use explicit non-existent path to ensure disconnected state
      const instance = await LexSona.connect({ lexDb: "/nonexistent/path/db.sqlite" });
      expect(instance).toBeInstanceOf(LexSona);
    });

    it("accepts config options", async () => {
      const instance = await LexSona.connect({
        lexDb: "/nonexistent/path/db.sqlite",
        persona: "quality-first_engineering",
        domain: "test-domain",
      });

      expect(instance.getActivePersona()).toBe("quality-first_engineering");
      expect(instance.getConfig().domain).toBe("test-domain");
    });

    it("returns disconnected status when no database", async () => {
      // sona is already created with nonexistent path in beforeEach
      expect(sona.isConnected()).toBe(false);
    });
  });

  describe("activate", () => {
    it("sets active persona", async () => {
      await sona.activate("momentum-first_product");
      expect(sona.getActivePersona()).toBe("momentum-first_product");
    });
  });

  describe("deriveConstraints", () => {
    it("returns baseline principles when disconnected", async () => {
      const result = await sona.deriveConstraints({});

      expect(result.personaId).toBe("none");
      expect(result.constraints).toEqual([]);
      expect(result.principles).toEqual([
        {
          id: "transparency",
          description: "Be clear about what you're doing and why",
        },
        {
          id: "determinism",
          description: "Same inputs should produce same outputs",
        },
        {
          id: "auditability",
          description: "All decisions should be traceable",
        },
      ]);
      expect(result.metadata.rulesConsidered).toBe(0);
    });

    it("includes active persona in constraint set", async () => {
      await sona.activate("quality-first_engineering");
      const result = await sona.deriveConstraints({});

      expect(result.personaId).toBe("quality-first_engineering");
    });

    it("includes context in result", async () => {
      const context = { domain: "test", taskType: "implementation" };
      const result = await sona.deriveConstraints(context);

      expect(result.context).toEqual(context);
    });

    it("includes timestamp", async () => {
      const before = new Date().toISOString();
      const result = await sona.deriveConstraints({});
      const after = new Date().toISOString();

      expect(result.derivedAt >= before).toBe(true);
      expect(result.derivedAt <= after).toBe(true);
    });

    it("includes inputHash in result", async () => {
      await sona.activate("quality-first_engineering");
      const result = await sona.deriveConstraints({});

      expect(result.inputHash).toBeDefined();
      expect(typeof result.inputHash).toBe("string");
      expect(result.inputHash.length).toBeGreaterThan(0);
    });

    it("produces stable inputHash for same inputs", async () => {
      await sona.activate("quality-first_engineering");
      const context = { domain: "test", taskType: "implementation" };

      const result1 = await sona.deriveConstraints(context);
      const result2 = await sona.deriveConstraints(context);

      // InputHash should be the same (ignoring derivedAt)
      expect(result1.inputHash).toBe(result2.inputHash);
    });

    it("actually loads persona and derives constraints when persona is active", async () => {
      await sona.activate("quality-first_engineering");
      const context = { domain: "engineering" };

      const result = await sona.deriveConstraints(context);

      // Should have loaded the persona
      expect(result.personaId).toBe("quality-first_engineering");
      // Should have inputHash computed
      expect(result.inputHash).toBeTruthy();
      // Metadata should indicate offline mode (no DB)
      expect(result.metadata.offlineMode).toBe(true);
      expect(result.metadata.rulesConsidered).toBe(0);
      // Should have empty constraints (no rules from DB)
      expect(result.constraints).toEqual([]);
    });
  });

  describe("learn", () => {
    it("throws when not connected", async () => {
      await expect(
        sona.learn({
          correction: "Test correction",
          context: {},
        })
      ).rejects.toThrow("Not connected to Lex database");
    });
  });

  describe("getConfig", () => {
    it("returns the configuration", async () => {
      const instance = await LexSona.connect({
        lexDb: "/custom/path.db",
        persona: "test-persona",
        domain: "test-domain",
      });

      const config = instance.getConfig();
      expect(config.lexDb).toBe("/custom/path.db");
      expect(config.persona).toBe("test-persona");
      expect(config.domain).toBe("test-domain");
    });
  });
});

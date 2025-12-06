/**
 * Persona Loader Tests
 *
 * Tests for persona manifest loading from YAML/Markdown files.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import {
  loadPersonaFromFile,
  findPersonaPath,
  loadPersona,
  listPersonas,
  matchTrigger,
} from "../../../src/persona/loader.js";

// Use test fixtures
const fixturesDir = join(process.cwd(), "tests", "fixtures", "personas");

describe("Persona Loader", () => {
  describe("loadPersonaFromFile", () => {
    it("loads persona from valid markdown file", () => {
      const filePath = join(fixturesDir, "senior-dev.md");
      const persona = loadPersonaFromFile(filePath);

      expect(persona.id).toBe("quality-first_engineering");
      expect(persona.version).toBe("1.0.0");
      expect(persona.behavior.primaryFocus).toBe("quality-first");
      expect(persona.behavior.domain).toBe("engineering");
    });

    it("parses duties correctly", () => {
      const filePath = join(fixturesDir, "senior-dev.md");
      const persona = loadPersonaFromFile(filePath);

      expect(persona.duties.mustDo).toContain("Run local-ci before any commit");
      expect(persona.duties.mustNotDo).toContain("Skip type checking");
    });

    it("parses triggers correctly", () => {
      const filePath = join(fixturesDir, "eager-pm.md");
      const persona = loadPersonaFromFile(filePath);

      expect(persona.triggers.phrases).toContain("ok eager pm");
      expect(persona.triggers.keywords).toContain("planning");
    });

    it("includes markdown body", () => {
      const filePath = join(fixturesDir, "senior-dev.md");
      const persona = loadPersonaFromFile(filePath);

      expect(persona.body).toContain("Senior Dev Persona");
      expect(persona.body).toContain("Behavioral Focus");
    });

    it("throws for non-existent file", () => {
      expect(() => loadPersonaFromFile("/nonexistent/path.md")).toThrow(
        "Persona file not found"
      );
    });

    it("includes ruleCategories", () => {
      const filePath = join(fixturesDir, "senior-dev.md");
      const persona = loadPersonaFromFile(filePath);

      expect(persona.ruleCategories).toContain("tool_preference");
      expect(persona.ruleCategories).toContain("testing");
    });
  });

  describe("findPersonaPath", () => {
    it("finds persona by filename (without extension)", () => {
      // This test depends on bundled personas existing
      const path = findPersonaPath("quality-first_engineering");
      expect(path).not.toBeNull();
      expect(path).toContain("quality-first_engineering.md");
    });

    it("returns null for non-existent persona", () => {
      const path = findPersonaPath("nonexistent-persona");
      expect(path).toBeNull();
    });
  });

  describe("loadPersona", () => {
    it("loads persona by ID", async () => {
      const persona = await loadPersona("quality-first_engineering");
      expect(persona.id).toBe("quality-first_engineering");
    });

    it("throws for non-existent persona", async () => {
      await expect(loadPersona("nonexistent")).rejects.toThrow("Persona not found");
    });
  });

  describe("listPersonas", () => {
    it("returns list of available personas", async () => {
      const personas = await listPersonas();

      expect(personas.length).toBeGreaterThan(0);
      expect(personas.some((p) => p.id === "quality-first_engineering")).toBe(true);
      expect(personas.some((p) => p.id === "momentum-first_product")).toBe(true);
    });

    it("includes path for each persona", async () => {
      const personas = await listPersonas();

      for (const persona of personas) {
        expect(persona.path).toBeDefined();
        expect(persona.path.endsWith(".md")).toBe(true);
      }
    });
  });

  describe("matchTrigger", () => {
    it("matches trigger phrase", async () => {
      const id = await matchTrigger("ok senior dev");
      expect(id).toBe("quality-first_engineering");
    });

    it("matches trigger phrase case-insensitive", async () => {
      const id = await matchTrigger("OK EAGER PM");
      expect(id).toBe("momentum-first_product");
    });

    it("matches keyword", async () => {
      const id = await matchTrigger("let's do some planning");
      expect(id).toBe("momentum-first_product");
    });

    it("returns null for no match", async () => {
      const id = await matchTrigger("random unrelated text");
      expect(id).toBeNull();
    });
  });
});

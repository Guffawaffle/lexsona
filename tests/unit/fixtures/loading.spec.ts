/**
 * Fixture Loading Tests
 *
 * Demonstrates loading and using test fixtures.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { MockCorrection } from "../../mocks/lex-client.js";

const fixturesDir = join(process.cwd(), "tests", "fixtures");

// Polarity constants for correction records
const POLARITY_POSITIVE = 1;
const POLARITY_NEGATIVE = -1;

/**
 * Helper function to load and parse corrections fixture
 */
function loadCorrectionsFixture() {
  const filePath = join(fixturesDir, "corrections", "sample-corrections.json");
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

describe("Test Fixtures", () => {
  describe("Corrections Fixture", () => {
    it("loads sample corrections from JSON", () => {
      const data = loadCorrectionsFixture();

      expect(data.corrections).toBeDefined();
      expect(Array.isArray(data.corrections)).toBe(true);
      expect(data.corrections.length).toBeGreaterThan(0);
    });

    it("corrections have required fields", () => {
      const data = loadCorrectionsFixture();

      for (const correction of data.corrections) {
        expect(correction.correction).toBeDefined();
        expect(typeof correction.correction).toBe("string");
        expect(correction.polarity).toBeDefined();
        expect([POLARITY_NEGATIVE, POLARITY_POSITIVE]).toContain(correction.polarity);
        expect(correction.context).toBeDefined();
        expect(typeof correction.context).toBe("object");
        expect(correction.recordedAt).toBeDefined();
      }
    });

    it("includes corrections with positive polarity", () => {
      const data = loadCorrectionsFixture();

      const positive = data.corrections.filter(
        (c: MockCorrection) => c.polarity === POLARITY_POSITIVE
      );
      expect(positive.length).toBeGreaterThan(0);
    });

    it("includes corrections with negative polarity", () => {
      const data = loadCorrectionsFixture();

      const negative = data.corrections.filter(
        (c: MockCorrection) => c.polarity === POLARITY_NEGATIVE
      );
      expect(negative.length).toBeGreaterThan(0);
    });

    it("includes corrections with different context scopes", () => {
      const data = loadCorrectionsFixture();

      const withModuleId = data.corrections.filter(
        (c: MockCorrection) => c.context.module_id !== undefined
      );
      const withTaskType = data.corrections.filter(
        (c: MockCorrection) => c.context.task_type !== undefined
      );
      const withProject = data.corrections.filter(
        (c: MockCorrection) => c.context.project !== undefined
      );

      expect(withModuleId.length).toBeGreaterThan(0);
      expect(withTaskType.length).toBeGreaterThan(0);
      expect(withProject.length).toBeGreaterThan(0);
    });
  });

  describe("Rules Fixtures", () => {
    it("loads coding-style rules from YAML", () => {
      const filePath = join(fixturesDir, "rules", "coding-style.yaml");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("rules:");
      expect(content).toContain("use-editing-tools");
      expect(content).toContain("run-tests-before-commit");
    });

    it("loads communication rules from YAML", () => {
      const filePath = join(fixturesDir, "rules", "communication.yaml");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("rules:");
      expect(content).toContain("clear-commit-messages");
      expect(content).toContain("document-decisions");
    });
  });

  describe("Persona Fixtures", () => {
    it("loads senior-dev persona", () => {
      const filePath = join(fixturesDir, "personas", "senior-dev.md");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("id: quality-first_engineering");
      expect(content).toContain("version: 1.1.0");
      expect(content).toContain("Senior Dev Persona");
    });

    it("loads eager-pm persona", () => {
      const filePath = join(fixturesDir, "personas", "eager-pm.md");
      const content = readFileSync(filePath, "utf-8");

      expect(content).toContain("id: momentum-first_product");
      expect(content).toContain("version: 1.1.0");
      expect(content).toContain("Eager PM Persona");
    });
  });
});

/**
 * Fixtures Loading Tests
 *
 * Validates that test fixtures (personas and rules) load correctly.
 * This ensures our test infrastructure works as expected.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { PersonaManifestSchema } from "../../../src/persona/types.js";
import type { BehaviorRule } from "../../../src/rules/types.js";

const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures");
const PERSONAS_DIR = join(FIXTURES_DIR, "personas");
const RULES_DIR = join(FIXTURES_DIR, "rules");

describe("Test Fixtures", () => {
  describe("Persona Fixtures", () => {
    it("loads senior-dev.yaml correctly", () => {
      const filePath = join(PERSONAS_DIR, "senior-dev.yaml");
      const content = readFileSync(filePath, "utf-8");
      const data = parseYaml(content);

      // Validate against schema
      const result = PersonaManifestSchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        const persona = result.data;
        expect(persona.id).toBe("quality-first_engineering");
        expect(persona.version).toBe("1.1.0");
        expect(persona.behavior.primaryFocus).toBe("quality-first");
        expect(persona.behavior.domain).toBe("engineering");
        expect(persona.requires_memory).toBe(false);
        expect(persona.offline_safe).toBeDefined();
        expect(persona.offline_safe?.confidence_ceiling).toBe(0.7);
        expect(persona.duties.mustDo).toContain("Run local-ci before any commit");
        expect(persona.duties.mustNotDo).toContain("Create PRs without tests");
        expect(persona.ruleCategories).toContain("testing");
        expect(persona.triggers.phrases).toContain("ok senior dev");
      }
    });

    it("loads eager-pm.yaml correctly", () => {
      const filePath = join(PERSONAS_DIR, "eager-pm.yaml");
      const content = readFileSync(filePath, "utf-8");
      const data = parseYaml(content);

      // Validate against schema
      const result = PersonaManifestSchema.safeParse(data);
      expect(result.success).toBe(true);

      if (result.success) {
        const persona = result.data;
        expect(persona.id).toBe("momentum-first_product");
        expect(persona.version).toBe("1.1.0");
        expect(persona.behavior.primaryFocus).toBe("momentum-first");
        expect(persona.behavior.domain).toBe("product");
        expect(persona.requires_memory).toBe(false);
        expect(persona.offline_safe).toBeDefined();
        expect(persona.offline_safe?.confidence_ceiling).toBe(0.7);
        expect(persona.duties.mustDo).toContain("Complete full workflows without stopping");
        expect(persona.duties.mustNotDo).toContain("Stop mid-task to ask questions");
        expect(persona.ruleCategories).toContain("workflow");
        expect(persona.triggers.phrases).toContain("ok eager pm");
      }
    });
  });

  describe("Rule Fixtures", () => {
    it("loads coding-style.yaml correctly", () => {
      const filePath = join(RULES_DIR, "coding-style.yaml");
      const content = readFileSync(filePath, "utf-8");
      const data = parseYaml(content) as { rules: BehaviorRule[] };

      expect(data.rules).toBeDefined();
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBeGreaterThan(0);

      // Check specific rules
      const useEditingTools = data.rules.find((r) => r.id === "use-editing-tools");
      expect(useEditingTools).toBeDefined();
      expect(useEditingTools?.category).toBe("tool_preference");
      expect(useEditingTools?.severity).toBe("must");
      expect(useEditingTools?.text).toContain("Use editing tools");

      const runTests = data.rules.find((r) => r.id === "run-tests-before-commit");
      expect(runTests).toBeDefined();
      expect(runTests?.category).toBe("testing");
      expect(runTests?.severity).toBe("must");

      const preferConst = data.rules.find((r) => r.id === "prefer-const");
      expect(preferConst).toBeDefined();
      expect(preferConst?.category).toBe("code_quality");
      expect(preferConst?.severity).toBe("style");
      expect(preferConst?.scope.context_tags).toContain("typescript");
    });

    it("loads communication.yaml correctly", () => {
      const filePath = join(RULES_DIR, "communication.yaml");
      const content = readFileSync(filePath, "utf-8");
      const data = parseYaml(content) as { rules: BehaviorRule[] };

      expect(data.rules).toBeDefined();
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBeGreaterThan(0);

      // Check specific rules
      const clearCommits = data.rules.find((r) => r.id === "clear-commit-messages");
      expect(clearCommits).toBeDefined();
      expect(clearCommits?.category).toBe("communication");
      expect(clearCommits?.severity).toBe("should");

      const documentDecisions = data.rules.find((r) => r.id === "document-decisions");
      expect(documentDecisions).toBeDefined();
      expect(documentDecisions?.scope.task_type).toBe("planning");

      const avoidJargon = data.rules.find((r) => r.id === "avoid-jargon");
      expect(avoidJargon).toBeDefined();
      expect(avoidJargon?.scope.module_id).toBe("docs/*");
    });
  });

  describe("Integration", () => {
    it("loads all fixture personas without errors", () => {
      const personaFiles = ["senior-dev.yaml", "eager-pm.yaml"];

      for (const file of personaFiles) {
        const filePath = join(PERSONAS_DIR, file);
        const content = readFileSync(filePath, "utf-8");
        const data = parseYaml(content);
        const result = PersonaManifestSchema.safeParse(data);

        expect(result.success).toBe(true);
        if (!result.success) {
          console.error(`Failed to load ${file}:`, result.error.errors);
        }
      }
    });

    it("loads all fixture rule files without errors", () => {
      const ruleFiles = ["coding-style.yaml", "communication.yaml"];

      for (const file of ruleFiles) {
        const filePath = join(RULES_DIR, file);
        const content = readFileSync(filePath, "utf-8");
        const data = parseYaml(content);

        expect(data).toBeDefined();
        expect(data.rules).toBeDefined();
        expect(Array.isArray(data.rules)).toBe(true);
      }
    });

    it("persona fixture rule categories match available rule categories", () => {
      // Load personas
      const seniorDevPath = join(PERSONAS_DIR, "senior-dev.yaml");
      const seniorDevData = parseYaml(readFileSync(seniorDevPath, "utf-8"));
      const seniorDevResult = PersonaManifestSchema.safeParse(seniorDevData);
      expect(seniorDevResult.success).toBe(true);

      // Load all rules
      const codingStylePath = join(RULES_DIR, "coding-style.yaml");
      const communicationPath = join(RULES_DIR, "communication.yaml");

      const codingStyleData = parseYaml(readFileSync(codingStylePath, "utf-8")) as {
        rules: BehaviorRule[];
      };
      const communicationData = parseYaml(readFileSync(communicationPath, "utf-8")) as {
        rules: BehaviorRule[];
      };

      const allRules = [...codingStyleData.rules, ...communicationData.rules];
      const ruleCategories = new Set(allRules.map((r) => r.category));

      if (seniorDevResult.success) {
        const persona = seniorDevResult.data;
        // Check that at least some of the persona's categories exist in the rules
        const matchingCategories = persona.ruleCategories.filter((cat) => ruleCategories.has(cat));
        expect(matchingCategories.length).toBeGreaterThan(0);
      }
    });
  });
});

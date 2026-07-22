import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { deriveConstraints, scopeMatches } from "../../../src/constraints/derive.js";
import { loadPersonaFromFile } from "../../../src/persona/loader.js";
import { BehaviorApplicabilitySchema } from "../../../src/persona/types.js";
import type { Persona } from "../../../src/persona/types.js";

const root = process.cwd();
const qualityYaml = join(root, "personas", "quality-first_engineering.yaml");
const qualityMarkdown = join(root, "personas", "quality-first_engineering.md");
const momentumYaml = join(root, "personas", "momentum-first_product.yaml");
const momentumMarkdown = join(root, "personas", "momentum-first_product.md");

function ids(persona: Persona, context: Parameters<typeof deriveConstraints>[3]): string[] {
  return deriveConstraints(persona, [], [], context).constraints.map((entry) => entry.rule_id);
}

describe("runtime-neutral persona applicability", () => {
  it("keeps applicability selectors within snapshot diagnostic bounds", () => {
    expect(() =>
      BehaviorApplicabilitySchema.parse({
        requires_capabilities: Array.from({ length: 33 }, (_, index) => `capability-${index}`),
      })
    ).toThrow();
  });

  it("omits capability-conditioned behavior when capability state is unknown", () => {
    const persona = loadPersonaFromFile(qualityYaml);
    const result = deriveConstraints(persona, [], [], {});

    expect(result.constraints.some((item) => item.rule_id.endsWith(":structured-edits"))).toBe(
      false
    );
    expect(result.metadata.applicability).toEqual({
      omitted: 1,
      samples: [
        {
          id: "structured-edits",
          classification: "capability-precondition",
          reason: "capabilities-unknown",
        },
      ],
    });
  });

  it("includes conditioned behavior only when the host declares every requirement", () => {
    const persona = loadPersonaFromFile(qualityYaml);
    const withoutCapability = deriveConstraints(persona, [], [], {
      runtime_capabilities: ["filesystem-read"],
    });
    const withCapability = deriveConstraints(persona, [], [], {
      runtime_capabilities: ["structured-edit", "filesystem-read"],
    });

    expect(withoutCapability.metadata.applicability?.samples[0]).toMatchObject({
      reason: "capability-missing",
      missing: ["structured-edit"],
    });
    expect(
      withCapability.constraints.some((item) => item.rule_id.endsWith(":structured-edits"))
    ).toBe(true);
    expect(withCapability.metadata.applicability?.omitted).toBe(0);
  });

  it("keeps agent and runtime profiles isolated and reports why items were omitted", () => {
    const persona: Persona = {
      id: "quality-first_testing",
      version: "1.0.0",
      behavior: {
        primaryFocus: "quality-first",
        domain: "testing",
        description: "Applicability fixture",
      },
      duties: {
        mustDo: [
          {
            id: "codex-only",
            statement: "Use the Codex-specific projection",
            classification: "host-runtime-procedure",
            applicability: { agent_families: ["openai"], runtime_families: ["codex"] },
          },
          {
            id: "portable",
            statement: "Keep evidence explicit",
            classification: "behavioral-invariant",
          },
          {
            id: "repository-owned",
            statement: "Use a repository-specific release command",
            classification: "repository-policy",
          },
        ],
        mustNotDo: [],
      },
      triggers: { phrases: [] },
      ruleCategories: [],
      requires_memory: false,
      offline_safe: { confidence_ceiling: 0.7, no_memory_disclaimer: "Static fixture" },
    };

    const matching = deriveConstraints(persona, [], [], {
      agent_family: "openai",
      runtime_family: "codex",
    });
    const otherAgent = deriveConstraints(persona, [], [], {
      agent_family: "anthropic",
      runtime_family: "codex",
    });
    const unknownRuntime = deriveConstraints(persona, [], [], { agent_family: "openai" });

    expect(matching.constraints.map((item) => item.rule_id)).toContain(
      "persona:quality-first_testing:must:codex-only"
    );
    expect(otherAgent.constraints.map((item) => item.rule_id)).not.toContain(
      "persona:quality-first_testing:must:codex-only"
    );
    expect(otherAgent.metadata.applicability?.samples[0].reason).toBe("agent-family-not-supported");
    expect(unknownRuntime.metadata.applicability?.samples[0].reason).toBe("runtime-family-unknown");
    expect(matching.constraints.map((item) => item.rule_id)).not.toContain(
      "persona:quality-first_testing:must:repository-owned"
    );
    expect(matching.metadata.applicability?.samples).toContainEqual({
      id: "repository-owned",
      classification: "repository-policy",
      reason: "classification-not-actionable",
    });
  });

  it("fails closed for learned agent, environment, and tag scopes with missing context", () => {
    expect(scopeMatches({ agent_family: "openai" }, {})).toBe(false);
    expect(scopeMatches({ environment: "windows" }, {})).toBe(false);
    expect(scopeMatches({ context_tags: ["reviewed"] }, {})).toBe(false);
  });

  it("keeps the default actionable set bounded across persona and learned content", () => {
    const persona = loadPersonaFromFile(qualityYaml);
    const result = deriveConstraints(
      persona,
      [],
      [],
      { runtime_capabilities: [] },
      { maxConstraints: 3 }
    );

    expect(result.constraints).toHaveLength(3);
  });

  it("keeps YAML and Markdown bundled behavior aligned and free of authority-era instructions", () => {
    const pairs = [
      [qualityYaml, qualityMarkdown],
      [momentumYaml, momentumMarkdown],
    ] as const;
    const forbidden =
      /replace_string_in_file|never sed|shell commands? (?:to|for) edit|remote ci|push changes|execute merge|close issues|publish packages?|sign releases?/i;

    for (const [yamlPath, markdownPath] of pairs) {
      const yamlPersona = loadPersonaFromFile(yamlPath);
      const markdownPersona = loadPersonaFromFile(markdownPath);
      expect(markdownPersona.version).toBe(yamlPersona.version);
      expect(markdownPersona.duties).toEqual(yamlPersona.duties);
      expect(JSON.stringify(yamlPersona.duties)).not.toMatch(forbidden);

      for (const duty of [
        ...yamlPersona.duties.mustDo,
        ...yamlPersona.duties.mustNotDo,
        ...(yamlPersona.duties.shouldDo ?? []),
      ]) {
        expect(typeof duty).toBe("object");
        expect(typeof duty === "string" ? undefined : duty.classification).toBeDefined();
      }
      for (const entries of Object.values(yamlPersona.constraints ?? {})) {
        expect(entries.every((entry) => entry.classification !== undefined)).toBe(true);
      }
    }
  });

  it("tracks every bundled trigger in the reviewed inventory", () => {
    const inventory = readFileSync(join(root, "docs", "persona-content-governance.md"), "utf8");
    for (const personaPath of [qualityYaml, momentumYaml]) {
      const parsed = parseYaml(readFileSync(personaPath, "utf8")) as {
        triggers: { phrases: string[]; keywords?: string[] };
      };
      for (const trigger of [...parsed.triggers.phrases, ...(parsed.triggers.keywords ?? [])]) {
        expect(inventory.toLowerCase()).toContain(trigger.toLowerCase());
      }
    }
  });

  it("uses deterministic, non-learning rack fixtures for a conservative static profile", () => {
    const fixture = JSON.parse(
      readFileSync(join(root, "tests", "fixtures", "rack", "runtime-neutral-static.json"), "utf8")
    ) as {
      profileMode: string;
      learningDuringRun: boolean;
      personaVersion: string;
      cases: Array<{
        context: Parameters<typeof deriveConstraints>[3];
        expectedIncluded: string[];
        expectedOmitted: string[];
      }>;
    };
    const persona = loadPersonaFromFile(qualityYaml);

    expect(fixture.profileMode).toBe("static");
    expect(fixture.learningDuringRun).toBe(false);
    expect(fixture.personaVersion).toBe(persona.version);
    for (const testCase of fixture.cases) {
      const first = deriveConstraints(persona, [], [], testCase.context);
      const second = deriveConstraints(persona, [], [], testCase.context);
      expect(first.inputHash).toBe(second.inputHash);
      const activeIds = ids(persona, testCase.context);
      for (const expected of testCase.expectedIncluded) {
        expect(activeIds.some((id) => id.endsWith(`:${expected}`))).toBe(true);
      }
      for (const expected of testCase.expectedOmitted) {
        expect(activeIds.some((id) => id.endsWith(`:${expected}`))).toBe(false);
      }
    }
  });
});

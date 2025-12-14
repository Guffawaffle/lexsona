/**
 * MCP Server Integration Tests
 *
 * Tests the MCP server with mocked LexSona components.
 * Validates tool registration and handler functionality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Import tools and handlers
import { LEXSONA_TOOLS } from "../../src/mcp/tools.js";
import {
  handleActivate,
  handleConstraints,
  handleLearn,
  handleRules,
  handlePersonas,
} from "../../src/mcp/handlers.js";
import { LexSona } from "../../src/core/lexsona.js";

// Mock persona data
vi.mock("../../src/persona/loader.js", () => ({
  loadPersona: vi.fn(async (id: string) => ({
    id,
    version: "1.0.0",
    behavior: "Test behavior description",
    ruleCategories: ["general", "testing"],
    requires_memory: false,
    triggers: {
      phrases: ["test phrase"],
      keywords: ["test"],
    },
  })),
  listPersonas: vi.fn(async () => [
    { id: "quality-first_engineering", path: "/test/path/quality.md" },
    { id: "momentum-first_product", path: "/test/path/momentum.md" },
  ]),
}));

describe("MCP Server Integration", () => {
  let mockLexSona: LexSona;

  beforeEach(async () => {
    // Create a disconnected LexSona instance for testing
    mockLexSona = await LexSona.connect();
  });

  describe("Tool Registration", () => {
    it("exports LEXSONA_TOOLS array with all required tools", () => {
      expect(LEXSONA_TOOLS).toHaveLength(5);

      const toolNames = LEXSONA_TOOLS.map((t) => t.name);
      expect(toolNames).toContain("lexsona_activate");
      expect(toolNames).toContain("lexsona_constraints");
      expect(toolNames).toContain("lexsona_learn");
      expect(toolNames).toContain("lexsona_rules");
      expect(toolNames).toContain("lexsona_personas");
    });

    it("has proper schema for lexsona_activate", () => {
      const tool = LEXSONA_TOOLS.find((t) => t.name === "lexsona_activate");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Activate a persona");
      expect(tool?.inputSchema.properties).toHaveProperty("persona");
      expect(tool?.inputSchema.required).toContain("persona");
    });

    it("has proper schema for lexsona_constraints", () => {
      const tool = LEXSONA_TOOLS.find((t) => t.name === "lexsona_constraints");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Derive constraints");
      expect(tool?.inputSchema.properties).toHaveProperty("domain");
      expect(tool?.inputSchema.properties).toHaveProperty("module");
      expect(tool?.inputSchema.properties).toHaveProperty("task");
    });

    it("has proper schema for lexsona_learn", () => {
      const tool = LEXSONA_TOOLS.find((t) => t.name === "lexsona_learn");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("behavioral correction");
      expect(tool?.inputSchema.properties).toHaveProperty("correction");
      expect(tool?.inputSchema.required).toContain("correction");
    });

    it("has proper schema for lexsona_rules", () => {
      const tool = LEXSONA_TOOLS.find((t) => t.name === "lexsona_rules");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("behavioral rules");
      expect(tool?.inputSchema.properties).toHaveProperty("domain");
      expect(tool?.inputSchema.properties).toHaveProperty("minConfidence");
    });

    it("has proper schema for lexsona_personas", () => {
      const tool = LEXSONA_TOOLS.find((t) => t.name === "lexsona_personas");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("available personas");
    });
  });

  describe("lexsona_activate handler", () => {
    it("returns persona info when activated", async () => {
      const state = { activePersonaId: null };
      const result = await handleActivate({ persona: "quality-first_engineering" }, state);

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("persona");
      expect((result as any).persona.id).toBe("quality-first_engineering");
      expect((result as any).persona.behavior).toBeDefined();
      expect((result as any).persona.ruleCategories).toBeDefined();
      expect(state.activePersonaId).toBe("quality-first_engineering");
    });

    it("updates state with active persona ID", async () => {
      const state = { activePersonaId: null };
      await handleActivate({ persona: "momentum-first_product" }, state);

      expect(state.activePersonaId).toBe("momentum-first_product");
    });
  });

  describe("lexsona_constraints handler", () => {
    it("derives constraints with JSON output", async () => {
      const state = { activePersonaId: "quality-first_engineering" };
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints(
        {
          domain: "test",
          module: "test-module",
          task: "implementation",
        },
        state,
        getLexSona
      );

      expect(result).toHaveProperty("personaId");
      expect(result).toHaveProperty("derivedAt");
      expect(result).toHaveProperty("context");
      expect(result).toHaveProperty("constraints");
      expect(result).toHaveProperty("principles");
      expect(result).toHaveProperty("metadata");

      // Metadata should indicate offline mode
      expect((result as any).metadata.offlineMode).toBe(true);
    });

    it("uses default persona when none active", async () => {
      const state = { activePersonaId: null };
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints({}, state, getLexSona);

      expect((result as any).personaId).toBe("quality-first_engineering");
    });

    it("allows persona override", async () => {
      const state = { activePersonaId: "quality-first_engineering" };
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints(
        { persona: "momentum-first_product" },
        state,
        getLexSona
      );

      expect((result as any).personaId).toBe("momentum-first_product");
    });
  });

  describe("lexsona_learn handler", () => {
    it("records correction when connected", async () => {
      // Create a connected instance with mocked learn
      const connectedSona = await LexSona.connect();
      const learnSpy = vi.spyOn(connectedSona, "learn").mockResolvedValue();
      const getLexSona = async () => connectedSona;

      const result = await handleLearn(
        {
          correction: "Always validate inputs",
          severity: "must",
          category: "validation",
          polarity: "reinforce",
        },
        getLexSona
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("correction", "Always validate inputs");
      expect(result).toHaveProperty("severity", "must");
      expect(result).toHaveProperty("polarity", "reinforce");
    });

    it("handles counter polarity", async () => {
      const connectedSona = await LexSona.connect();
      const learnSpy = vi.spyOn(connectedSona, "learn").mockResolvedValue();
      const getLexSona = async () => connectedSona;

      const result = await handleLearn(
        {
          correction: "Don't skip error handling",
          polarity: "counter",
        },
        getLexSona
      );

      expect(result).toHaveProperty("polarity", "counter");
      expect(learnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          polarity: -1,
        })
      );
    });
  });

  describe("lexsona_rules handler", () => {
    it("lists rules with count", async () => {
      const getLexSona = async () => mockLexSona;

      const result = await handleRules({}, getLexSona);

      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("rules");
      expect(Array.isArray((result as any).rules)).toBe(true);
    });

    it("filters rules by domain", async () => {
      const getLexSona = async () => mockLexSona;

      const result = await handleRules({ domain: "test-domain" }, getLexSona);

      expect(result).toHaveProperty("rules");
      // In disconnected mode, returns empty array
      expect((result as any).count).toBe(0);
    });

    it("filters rules by confidence", async () => {
      const getLexSona = async () => mockLexSona;

      const result = await handleRules({ minConfidence: 0.5 }, getLexSona);

      expect(result).toHaveProperty("rules");
    });
  });

  describe("lexsona_personas handler", () => {
    it("lists available personas", async () => {
      const result = await handlePersonas();

      expect(result).toHaveProperty("count", 2);
      expect(result).toHaveProperty("personas");
      expect(Array.isArray((result as any).personas)).toBe(true);
    });

    it("includes persona details", async () => {
      const result = await handlePersonas();
      const personas = (result as any).personas;

      expect(personas[0]).toHaveProperty("id");
      expect(personas[0]).toHaveProperty("behavior");
      expect(personas[0]).toHaveProperty("triggers");
    });
  });

  describe("JSON Output Format", () => {
    it("activate returns valid JSON", async () => {
      const state = { activePersonaId: null };
      const result = await handleActivate({ persona: "quality-first_engineering" }, state);

      const json = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(result);
    });

    it("constraints returns valid JSON", async () => {
      const state = { activePersonaId: "quality-first_engineering" };
      const getLexSona = async () => mockLexSona;

      const result = await handleConstraints({}, state, getLexSona);

      const json = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(result);
    });

    it("rules returns valid JSON", async () => {
      const getLexSona = async () => mockLexSona;
      const result = await handleRules({}, getLexSona);

      const json = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(result);
    });

    it("personas returns valid JSON", async () => {
      const result = await handlePersonas();

      const json = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed).toEqual(result);
    });
  });
});

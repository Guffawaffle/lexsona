#!/usr/bin/env node

/**
 * MCP server adapter for LexSona
 *
 * Exposes LexSona APIs to AI agents via Model Context Protocol.
 * Read-mostly: only lexsona_learn mutates state.
 *
 * @module
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { LexSona, type LexSonaConfig } from "../core/lexsona.js";
import { loadPersona, listPersonas } from "../persona/loader.js";
import { deriveConstraints, type DeriveContext } from "../constraints/derive.js";
import type { BehaviorRuleWithConfidence } from "../rules/types.js";

// Tool input schemas
const ActivateInputSchema = z.object({
  persona: z.string().describe("Persona ID to activate (e.g., 'quality-first_engineering')"),
});

const ConstraintsInputSchema = z.object({
  domain: z.string().optional().describe("Domain context filter"),
  module: z.string().optional().describe("Module ID filter"),
  task: z.string().optional().describe("Task type (e.g., 'implementation', 'review')"),
  persona: z.string().optional().describe("Override active persona"),
});

const LearnInputSchema = z.object({
  correction: z.string().describe("The behavioral correction to learn"),
  severity: z.enum(["must", "should", "style"]).optional().default("should"),
  category: z.string().optional().default("general"),
  domain: z.string().optional().describe("Domain scope"),
  module: z.string().optional().describe("Module scope"),
  polarity: z.enum(["reinforce", "counter"]).optional().default("reinforce"),
});

const RulesInputSchema = z.object({
  domain: z.string().optional().describe("Filter by domain"),
  minConfidence: z.number().optional().describe("Minimum confidence threshold"),
});

// Server state
let lexSonaInstance: LexSona | null = null;
let activePersonaId: string | null = null;

/**
 * Initialize LexSona connection
 */
async function ensureConnected(): Promise<LexSona> {
  if (lexSonaInstance?.isConnected()) {
    return lexSonaInstance;
  }

  const config: LexSonaConfig = {
    lexDb: process.env.LEX_DB_PATH,
    persona: activePersonaId ?? undefined,
  };

  lexSonaInstance = await LexSona.connect(config);
  return lexSonaInstance;
}

/**
 * Start the MCP server
 */
async function main(): Promise<void> {
  const server = new Server(
    {
      name: "lexsona",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "lexsona_activate",
        description: "Activate a persona by ID. Returns persona info.",
        inputSchema: {
          type: "object",
          properties: {
            persona: {
              type: "string",
              description: "Persona ID to activate (e.g., 'quality-first_engineering')",
            },
          },
          required: ["persona"],
        },
      },
      {
        name: "lexsona_constraints",
        description: "Derive constraints for the active persona given a context.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Domain context filter" },
            module: { type: "string", description: "Module ID filter" },
            task: { type: "string", description: "Task type" },
            persona: { type: "string", description: "Override persona" },
          },
        },
      },
      {
        name: "lexsona_learn",
        description: "Record a behavioral correction to adjust rule weights.",
        inputSchema: {
          type: "object",
          properties: {
            correction: { type: "string", description: "The correction text" },
            severity: {
              type: "string",
              enum: ["must", "should", "style"],
              description: "Severity level",
            },
            category: { type: "string", description: "Rule category" },
            domain: { type: "string", description: "Domain scope" },
            module: { type: "string", description: "Module scope" },
            polarity: {
              type: "string",
              enum: ["reinforce", "counter"],
              description: "Reinforce or counter the behavior",
            },
          },
          required: ["correction"],
        },
      },
      {
        name: "lexsona_rules",
        description: "List loaded behavioral rules.",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Filter by domain" },
            minConfidence: { type: "number", description: "Min confidence" },
          },
        },
      },
      {
        name: "lexsona_personas",
        description: "List available personas.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "lexsona_activate": {
          const input = ActivateInputSchema.parse(args);
          const persona = await loadPersona(input.persona);
          activePersonaId = persona.id;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    persona: {
                      id: persona.id,
                      version: persona.version,
                      behavior: persona.behavior,
                      ruleCategories: persona.ruleCategories,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "lexsona_constraints": {
          const input = ConstraintsInputSchema.parse(args);
          const personaId = input.persona ?? activePersonaId ?? "quality-first_engineering";

          const persona = await loadPersona(personaId);
          const instance = await ensureConnected();

          const lexRules = await instance.getRules({
            domain: input.domain,
          });

          // Convert to LexSona format
          const sonaRules: BehaviorRuleWithConfidence[] = lexRules.map((r) => ({
            rule_id: r.rule_id,
            text: r.text,
            severity: r.severity,
            category: r.category,
            source: "learned" as const,
            scope: r.scope ?? {},
            effective_confidence: r.effective_confidence,
            created_at: r.created_at,
            updated_at: r.updated_at,
            confidence: r.confidence,
            decay_factor: r.decay_factor,
            alpha: r.alpha,
            beta: r.beta,
            observation_count: r.observation_count,
            decay_tau: r.decay_tau,
            last_observed: r.last_observed,
          }));

          const context: DeriveContext = {
            domain: input.domain,
            module_id: input.module,
            taskType: input.task,
          };

          const result = deriveConstraints(persona, sonaRules, [], context);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "lexsona_learn": {
          const input = LearnInputSchema.parse(args);
          const instance = await ensureConnected();

          await instance.learn({
            correction: input.correction,
            severity: input.severity,
            category: input.category,
            polarity: input.polarity === "counter" ? -1 : 1,
            context: {
              module_id: input.domain ?? input.module,
            },
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  correction: input.correction,
                  severity: input.severity,
                  polarity: input.polarity,
                }),
              },
            ],
          };
        }

        case "lexsona_rules": {
          const input = RulesInputSchema.parse(args);
          const instance = await ensureConnected();

          const rules = await instance.getRules({
            domain: input.domain,
            minConfidence: input.minConfidence,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    count: rules.length,
                    rules: rules.map((r) => ({
                      rule_id: r.rule_id,
                      text: r.text,
                      severity: r.severity,
                      category: r.category,
                      confidence: r.effective_confidence,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "lexsona_personas": {
          const personas = await listPersonas();

          const details = await Promise.all(
            personas.map(async (p) => {
              try {
                const full = await loadPersona(p.id);
                return {
                  id: full.id,
                  behavior: full.behavior,
                  triggers: full.triggers?.phrases ?? [],
                };
              } catch {
                return { id: p.id, error: "Failed to load" };
              }
            })
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    count: details.length,
                    personas: details,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`
        );
      }
      if (error instanceof McpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, message);
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LexSona MCP server started");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});

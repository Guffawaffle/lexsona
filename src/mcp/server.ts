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
import {
  LEXSONA_TOOLS,
  ActivateInputSchema,
  ConstraintsInputSchema,
  LearnInputSchema,
  RulesInputSchema,
} from "./tools.js";
import {
  handleActivate,
  handleConstraints,
  handleLearn,
  handleRules,
  handlePersonas,
} from "./handlers.js";
import { LexSonaError } from "./errors.js";

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
    tools: LEXSONA_TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const state = { activePersonaId };

      let result: object;
      switch (name) {
        // Canonical names (VS Code displays as mcp_lexsona_{category}_{action})
        case "persona_activate":
        case "lexsona_persona_activate": // deprecated alias
        case "lexsona_activate": {
          // Deprecated alias
          const input = ActivateInputSchema.parse(args);
          result = await handleActivate(input, state);
          activePersonaId = state.activePersonaId;
          break;
        }

        case "constraints_derive":
        case "lexsona_constraint_derive": // deprecated alias
        case "lexsona_constraints": {
          // Deprecated alias
          const input = ConstraintsInputSchema.parse(args);
          result = await handleConstraints(input, state, ensureConnected);
          break;
        }

        case "rules_learn":
        case "lexsona_rule_learn": // deprecated alias
        case "lexsona_learn": {
          // Deprecated alias
          const input = LearnInputSchema.parse(args);
          result = await handleLearn(input, ensureConnected);
          break;
        }

        case "rules_list":
        case "lexsona_rule_list": // deprecated alias
        case "lexsona_rules": {
          // Deprecated alias
          const input = RulesInputSchema.parse(args);
          result = await handleRules(input, ensureConnected);
          break;
        }

        case "persona_list":
        case "lexsona_persona_list": // deprecated alias
        case "lexsona_personas": {
          // Deprecated alias
          result = await handlePersonas();
          break;
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${error.issues.map((issue) => issue.message).join(", ")}`
        );
      }
      if (error instanceof LexSonaError) {
        // Map LexSonaError to McpError with metadata preserved
        // Use InvalidParams for validation errors, InternalError for others
        const mcpCode =
          error.code.startsWith("VALIDATION_") || error.code.startsWith("PERSONA_") || error.code.startsWith("RULE_")
            ? ErrorCode.InvalidParams
            : ErrorCode.InternalError;
        
        // Include structured error code in message for agent parsing
        const enhancedMessage = `[${error.code}] ${error.message}${
          error.getSuggestions().length > 0
            ? `\nSuggestions: ${error.getSuggestions().join("; ")}`
            : ""
        }`;
        throw new McpError(mcpCode, enhancedMessage);
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

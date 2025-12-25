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
  TrustGapInputSchema,
  AgentTrustProfileInputSchema,
} from "./tools.js";
import {
  handleActivate,
  handleConstraints,
  handleLearn,
  handleRules,
  handlePersonas,
  handleTrustGapRecord,
  handleAgentTrustProfile,
} from "./handlers.js";
import { LexSonaError, isClientError, formatErrorForMcp } from "./errors.js";

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
        // Canonical names with namespace prefix
        case "lexsona_persona_activate":
        case "persona_activate": // deprecated alias (v0.3.x)
        case "lexsona_activate": {
          // deprecated alias (v0.1.x)
          const input = ActivateInputSchema.parse(args);
          result = await handleActivate(input, state);
          activePersonaId = state.activePersonaId;
          break;
        }

        case "lexsona_constraints_derive":
        case "constraints_derive": // deprecated alias (v0.3.x)
        case "lexsona_constraints": {
          // deprecated alias (v0.1.x)
          const input = ConstraintsInputSchema.parse(args);
          result = await handleConstraints(input, state, ensureConnected);
          break;
        }

        case "lexsona_rules_learn":
        case "rules_learn": // deprecated alias (v0.3.x)
        case "lexsona_learn": {
          // deprecated alias (v0.1.x)
          const input = LearnInputSchema.parse(args);
          result = await handleLearn(input, ensureConnected);
          break;
        }

        case "lexsona_rules_list":
        case "rules_list": // deprecated alias (v0.3.x)
        case "lexsona_rules": {
          // deprecated alias (v0.1.x)
          const input = RulesInputSchema.parse(args);
          result = await handleRules(input, ensureConnected);
          break;
        }

        case "lexsona_persona_list":
        case "persona_list": // deprecated alias (v0.3.x)
        case "lexsona_personas": {
          // deprecated alias (v0.1.x)
          result = await handlePersonas();
          break;
        }

        case "trust_gap_record": {
          const input = TrustGapInputSchema.parse(args);
          result = await handleTrustGapRecord(input, ensureConnected);
          break;
        }

        case "agent_trust_profile": {
          const input = AgentTrustProfileInputSchema.parse(args);
          result = await handleAgentTrustProfile(input, ensureConnected);
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
        // Use InvalidParams for client errors, InternalError for server errors
        const mcpCode = isClientError(error.code) ? ErrorCode.InvalidParams : ErrorCode.InternalError;
        
        // Format error message with embedded error code and suggestions
        const enhancedMessage = formatErrorForMcp(error);
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

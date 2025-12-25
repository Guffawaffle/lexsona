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
import { RequestCache } from "./idempotency.js";

// Server state
let lexSonaInstance: LexSona | null = null;
let activePersonaId: string | null = null;
const requestCache = new RequestCache(300); // 5 minutes TTL

// Periodic cleanup of expired cache entries (every minute)
setInterval(() => {
  requestCache.cleanup();
}, 60000);

// Mutation operations that should be cached for idempotency
const MUTATION_OPERATIONS = new Set([
  "persona_activate",
  "lexsona_persona_activate",
  "lexsona_activate",
  "rules_learn",
  "lexsona_rule_learn",
  "lexsona_learn",
  "trust_gap_record",
]);

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

      // Check for request_id in args and see if we have a cached response
      const requestId = (args as { request_id?: string }).request_id;
      if (requestId) {
        const cached = requestCache.get(requestId);
        if (cached) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(cached, null, 2),
              },
            ],
          };
        }
      }

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

      // Store in cache if request_id was provided (only for mutation operations)
      if (requestId && MUTATION_OPERATIONS.has(name)) {
        requestCache.set(requestId, result);
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

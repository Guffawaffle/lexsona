/**
 * MCP Tool Definitions for LexSona
 *
 * Defines the tools exposed by the LexSona MCP server.
 * Each tool has a name, description, and JSON schema for inputs.
 *
 * @module
 */

import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Input validation schemas
export const ActivateInputSchema = z.object({
  persona: z.string().describe("Persona ID to activate (e.g., 'quality-first_engineering')"),
});

export const ConstraintsInputSchema = z.object({
  domain: z.string().optional().describe("(Deprecated: use 'project') Domain context filter"),
  module: z.string().optional().describe("(Deprecated: use 'module_id') Module ID filter"),
  project: z.string().optional().describe("Project context filter (canonical)"),
  module_id: z.string().optional().describe("Module ID filter (canonical)"),
  task: z.string().optional().describe("Task type (e.g., 'implementation', 'review')"),
  persona: z.string().optional().describe("Override active persona"),
});

export const LearnInputSchema = z.object({
  correction: z.string().describe("The behavioral correction to learn"),
  severity: z.enum(["must", "should", "style"]).optional().default("should"),
  category: z.string().optional().default("general"),
  domain: z.string().optional().describe("(Deprecated: use 'project') Domain scope"),
  module: z.string().optional().describe("(Deprecated: use 'module_id') Module scope"),
  project: z.string().optional().describe("Project scope (canonical)"),
  module_id: z.string().optional().describe("Module scope (canonical)"),
  polarity: z.enum(["reinforce", "counter"]).optional().default("reinforce"),
});

export const RulesInputSchema = z.object({
  domain: z.string().optional().describe("(Deprecated: use 'project') Filter by domain"),
  project: z.string().optional().describe("Filter by project (canonical)"),
  minConfidence: z.number().optional().describe("Minimum confidence threshold"),
});

export const TrustGapInputSchema = z.object({
  task_id: z.string().describe("Unique task identifier"),
  agent_family: z.string().describe("Agent family (e.g., 'claude-haiku', 'gpt-4o-mini')"),
  procedure: z.string().describe("Procedure that was executed"),
  agent_claimed: z.boolean().describe("What agent claimed as verification result"),
  verified: z.boolean().describe("What engine actually verified"),
  failures: z
    .array(
      z.object({
        type: z.string().describe("Failure type"),
        message: z.string().describe("Failure message"),
        file: z.string().optional().describe("File where failure occurred"),
        line: z.number().optional().describe("Line number"),
      })
    )
    .describe("List of failures detected"),
  context: z
    .object({
      project: z.string().optional(),
      module_id: z.string().optional(),
      task_type: z.string().optional(),
    })
    .optional()
    .describe("Optional context"),
});

export const AgentTrustProfileInputSchema = z.object({
  agent_family: z.string().describe("Agent family to get trust profile for"),
});

export const IntrospectInputSchema = z.object({
  // No parameters needed - returns current state
});

export type ActivateInput = z.infer<typeof ActivateInputSchema>;
export type ConstraintsInput = z.infer<typeof ConstraintsInputSchema>;
export type LearnInput = z.infer<typeof LearnInputSchema>;
export type RulesInput = z.infer<typeof RulesInputSchema>;
export type TrustGapInput = z.infer<typeof TrustGapInputSchema>;
export type AgentTrustProfileInput = z.infer<typeof AgentTrustProfileInputSchema>;
export type IntrospectInput = z.infer<typeof IntrospectInputSchema>;

/**
 * Tool definitions for the MCP server
 */
export const LEXSONA_TOOLS: Tool[] = [
  {
    name: "persona_activate",
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
    name: "constraints_derive",
    description: "Derive constraints for the active persona given a context.",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "(Deprecated: use 'project') Domain context filter",
        },
        module: { type: "string", description: "(Deprecated: use 'module_id') Module ID filter" },
        project: { type: "string", description: "Project context filter (canonical)" },
        module_id: { type: "string", description: "Module ID filter (canonical)" },
        task: { type: "string", description: "Task type" },
        persona: { type: "string", description: "Override persona" },
      },
    },
  },
  {
    name: "rules_learn",
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
        domain: { type: "string", description: "(Deprecated: use 'project') Domain scope" },
        module: { type: "string", description: "(Deprecated: use 'module_id') Module scope" },
        project: { type: "string", description: "Project scope (canonical)" },
        module_id: { type: "string", description: "Module scope (canonical)" },
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
    name: "rules_list",
    description: "List loaded behavioral rules.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "(Deprecated: use 'project') Filter by domain" },
        project: { type: "string", description: "Filter by project (canonical)" },
        minConfidence: { type: "number", description: "Min confidence" },
      },
    },
  },
  {
    name: "persona_list",
    description: "List available personas.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "trust_gap_record",
    description:
      "Record a trust gap event when agent claims don't match engine verification. Applies confidence decay and tracks agent reliability (ADR-007).",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Unique task identifier" },
        agent_family: {
          type: "string",
          description: "Agent family (e.g., 'claude-haiku', 'gpt-4o-mini')",
        },
        procedure: { type: "string", description: "Procedure that was executed" },
        agent_claimed: { type: "boolean", description: "What agent claimed" },
        verified: { type: "boolean", description: "What engine verified" },
        failures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Failure type" },
              message: { type: "string", description: "Failure message" },
              file: { type: "string", description: "File where failure occurred" },
              line: { type: "number", description: "Line number" },
            },
            required: ["type", "message"],
          },
          description: "List of failures detected",
        },
        context: {
          type: "object",
          properties: {
            project: { type: "string" },
            module_id: { type: "string" },
            task_type: { type: "string" },
          },
          description: "Optional context",
        },
      },
      required: ["task_id", "agent_family", "procedure", "agent_claimed", "verified", "failures"],
    },
  },
  {
    name: "agent_trust_profile",
    description:
      "Get trust profile for an agent family showing gap rate and common failure types (ADR-007).",
    inputSchema: {
      type: "object",
      properties: {
        agent_family: {
          type: "string",
          description: "Agent family to get trust profile for",
        },
      },
      required: ["agent_family"],
    },
  },
  {
    name: "introspect",
    description:
      "Get current LexSona state and capabilities for agent self-discovery. Returns version, active persona, available personas, Lex connection status, rule count, and error codes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

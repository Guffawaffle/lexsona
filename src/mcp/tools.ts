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
  domain: z.string().optional().describe("Domain context filter"),
  module: z.string().optional().describe("Module ID filter"),
  task: z.string().optional().describe("Task type (e.g., 'implementation', 'review')"),
  persona: z.string().optional().describe("Override active persona"),
});

export const LearnInputSchema = z.object({
  correction: z.string().describe("The behavioral correction to learn"),
  severity: z.enum(["must", "should", "style"]).optional().default("should"),
  category: z.string().optional().default("general"),
  domain: z.string().optional().describe("Domain scope"),
  module: z.string().optional().describe("Module scope"),
  polarity: z.enum(["reinforce", "counter"]).optional().default("reinforce"),
});

export const RulesInputSchema = z.object({
  domain: z.string().optional().describe("Filter by domain"),
  minConfidence: z.number().optional().describe("Minimum confidence threshold"),
});

export type ActivateInput = z.infer<typeof ActivateInputSchema>;
export type ConstraintsInput = z.infer<typeof ConstraintsInputSchema>;
export type LearnInput = z.infer<typeof LearnInputSchema>;
export type RulesInput = z.infer<typeof RulesInputSchema>;

/**
 * Tool definitions for the MCP server
 */
export const LEXSONA_TOOLS: Tool[] = [
  {
    name: "lexsona_persona_activate",
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
    name: "lexsona_constraint_derive",
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
    name: "lexsona_rule_learn",
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
    name: "lexsona_rule_list",
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
    name: "lexsona_persona_list",
    description: "List available personas.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

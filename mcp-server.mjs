#!/usr/bin/env node

/**
 * MCP server launcher for LexSona
 *
 * Usage:
 *   node mcp-server.mjs
 *
 * Environment:
 *   LEX_DB_PATH - Path to Lex database (optional)
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the compiled MCP server
const serverPath = path.join(__dirname, "dist", "mcp", "server.js");

import(serverPath).catch((error) => {
  console.error("Failed to load MCP server:", error);
  process.exit(1);
});

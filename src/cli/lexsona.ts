#!/usr/bin/env node
/**
 * LexSona CLI - Main Entry Point
 * 
 * Usage: lexsona <noun> [verb] [options]
 * 
 * Examples:
 *   lexsona persona list
 *   lexsona persona activate quality-first_engineering
 *   lexsona rules learn "Always run tests"
 *   lexsona constraints derive
 */

import { Command } from "commander";
import { registerPersonaCommands } from "./commands/persona.js";
import { registerRulesCommands } from "./commands/rules.js";
import { registerConstraintsCommands } from "./commands/constraints.js";
import { VERSION } from "../index.js";

const program = new Command();

program
  .name("lexsona")
  .description("Behavioral memory and persona engine for AI agents")
  .version(VERSION)
  .option("--json", "Output results in JSON format")
  .option("--verbose", "Enable verbose output");

// Register noun commands
registerPersonaCommands(program);
registerRulesCommands(program);
registerConstraintsCommands(program);

// Parse and run
program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});

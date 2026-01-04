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
import { registerConflictsCommands } from "./commands/conflicts.js";
import { registerDbCommands } from "./commands/db.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerTrustCommands } from "./commands/trust.js";
import { VERSION } from "../index.js";

const program = new Command();

program
  .name("lexsona")
  .description("Behavioral memory and persona engine for AI agents")
  .version(VERSION)
  .option("--verbose", "Enable verbose output")
  .option("--json", "Output as JSON");

// Register noun commands
registerPersonaCommands(program);
registerRulesCommands(program);
registerConstraintsCommands(program);
registerConflictsCommands(program);
registerDbCommands(program);
registerDoctorCommand(program);
registerTrustCommands(program);

// Parse and run
program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});

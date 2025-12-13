/**
 * Persona Commands - lexsona persona <verb>
 *
 * @module
 */

import { Command } from "commander";
import { loadPersona, listPersonas, matchTrigger } from "../../persona/loader.js";
import type { Persona } from "../../persona/types.js";
import {
  getActivePersona,
  setActivePersona,
  clearActivePersona,
} from "../../persona/config.js";

/**
 * Register persona noun commands
 */
export function registerPersonaCommands(program: Command): void {
  const persona = program.command("persona").description("Manage personas");

  // lexsona persona list
  persona
    .command("list")
    .description("List available personas")
    .action(async () => {
      const personaList = await listPersonas();

      if (personaList.length === 0) {
        console.log("No personas found.");
        return;
      }

      console.log("Available personas:\n");
      for (const entry of personaList) {
        // Load full persona to get description
        try {
          const p = await loadPersona(entry.id);
          console.log(`  ${p.id}`);
          console.log(`    ${p.behavior.description}`);
          console.log(`    triggers: ${p.triggers?.phrases?.join(", ") ?? "(none)"}`);
          console.log("");
        } catch {
          console.log(`  ${entry.id} (failed to load)`);
        }
      }
    });

  // lexsona persona activate <name>
  persona
    .command("activate <name>")
    .description("Activate a persona by ID or trigger phrase")
    .option("--global", "Store activation in user-global config instead of project-local")
    .action(async (name: string, options: { global?: boolean }) => {
      // Try to match as trigger phrase first
      const matchedId = await matchTrigger(name);

      // If no trigger match, try as direct ID
      const personaId = matchedId ?? name;

      try {
        const p = await loadPersona(personaId);

        // Persist activation
        try {
          setActivePersona(p.id, options.global ?? false);
        } catch (error) {
          console.error(
            `Warning: Could not persist activation: ${error instanceof Error ? error.message : error}`
          );
        }

        const scope = options.global ? "globally" : "for this project";
        console.log(`✓ Activated persona ${scope}: ${p.id}`);
        console.log(`  Focus: ${p.behavior.primaryFocus}`);
        console.log(`  Domain: ${p.behavior.domain}`);
        console.log(`  Description: ${p.behavior.description}`);

        if (p.duties?.mustDo && p.duties.mustDo.length > 0) {
          console.log("\n  Must do:");
          for (const duty of p.duties.mustDo) {
            console.log(`    - ${duty}`);
          }
        }
      } catch {
        console.error(`Error: Persona "${name}" not found.`);
        console.error("  Use 'lexsona persona list' to see available personas.");
        process.exitCode = 1;
      }
    });

  // lexsona persona show [name]
  persona
    .command("show [name]")
    .description("Show persona details (current active if no name provided)")
    .action(async (name?: string) => {
      let personaId = name;

      // If no name provided, show the currently active persona
      if (!personaId) {
        try {
          const { personaId: activeId, scope } = getActivePersona();
          if (!activeId) {
            console.log("No persona currently active.");
            console.log("  Use 'lexsona persona activate <name>' to activate one.");
            return;
          }

          personaId = activeId;
          const scopeText = scope === "global" ? "globally" : "for this project";
          console.log(`Currently active persona (${scopeText}):\n`);
        } catch (error) {
          console.error(
            `Error reading active persona: ${error instanceof Error ? error.message : error}`
          );
          process.exitCode = 1;
          return;
        }
      }

      try {
        const p: Persona = await loadPersona(personaId);

        console.log(`Persona: ${p.id}\n`);
        console.log(`Version: ${p.version}`);

        if (p.behavior) {
          console.log(`\nBehavior:`);
          console.log(`  Focus: ${p.behavior.primaryFocus}`);
          console.log(`  Domain: ${p.behavior.domain}`);
          console.log(`  Description: ${p.behavior.description}`);
        }

        if (p.ruleCategories && p.ruleCategories.length > 0) {
          console.log(`\nRule Categories: ${p.ruleCategories.join(", ")}`);
        }

        if (p.triggers?.phrases && p.triggers.phrases.length > 0) {
          console.log(`\nTrigger phrases:`);
          for (const t of p.triggers.phrases) {
            console.log(`  - "${t}"`);
          }
        }

        if (p.duties?.mustDo && p.duties.mustDo.length > 0) {
          console.log(`\nMust do:`);
          for (const d of p.duties.mustDo) {
            console.log(`  - ${d}`);
          }
        }

        if (p.duties?.mustNotDo && p.duties.mustNotDo.length > 0) {
          console.log(`\nMust NOT do:`);
          for (const d of p.duties.mustNotDo) {
            console.log(`  - ${d}`);
          }
        }
      } catch {
        console.error(`Error: Persona "${personaId}" not found.`);
        process.exitCode = 1;
      }
    });

  // lexsona persona deactivate
  persona
    .command("deactivate")
    .description("Deactivate the current persona")
    .option("--global", "Clear activation from user-global config instead of project-local")
    .action(async (options: { global?: boolean }) => {
      try {
        clearActivePersona(options.global ?? false);
        const scope = options.global ? "globally" : "for this project";
        console.log(`✓ Persona deactivated ${scope}`);
      } catch (error) {
        console.error(
          `Error deactivating persona: ${error instanceof Error ? error.message : error}`
        );
        process.exitCode = 1;
      }
    });
}

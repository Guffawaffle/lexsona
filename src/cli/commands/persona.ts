/**
 * Persona Commands - lexsona persona <verb>
 *
 * @module
 */

import { Command } from "commander";
import { loadPersona, listPersonas, matchTrigger } from "../../persona/loader.js";
import type { Persona } from "../../persona/types.js";

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
    .action(async (name: string) => {
      // Try to match as trigger phrase first
      const matchedId = await matchTrigger(name);

      // If no trigger match, try as direct ID
      const personaId = matchedId ?? name;

      try {
        const p = await loadPersona(personaId);
        console.log(`✓ Activated persona: ${p.id}`);
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

  // lexsona persona show <name>
  persona
    .command("show <name>")
    .description("Show persona details")
    .action(async (name: string) => {
      try {
        const p: Persona = await loadPersona(name);

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
        console.error(`Error: Persona "${name}" not found.`);
        process.exitCode = 1;
      }
    });

  // lexsona persona deactivate
  persona
    .command("deactivate")
    .description("Deactivate the current persona")
    .action(async () => {
      console.log("✓ Persona deactivated");
    });
}

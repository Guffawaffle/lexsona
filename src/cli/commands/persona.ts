/**
 * Persona Commands - lexsona persona <verb>
 *
 * @module
 */

import { Command } from "commander";
import { loadPersona, listPersonas, matchTrigger } from "../../persona/loader.js";
import type { Persona } from "../../persona/types.js";
import { getActivePersona, setActivePersona, clearActivePersona } from "../../persona/config.js";
import { isJsonMode } from "../output.js";

/**
 * Register persona noun commands
 */
export function registerPersonaCommands(program: Command): void {
  const persona = program.command("persona").description("Manage personas");

  // lexsona persona list
  persona
    .command("list")
    .description("List available personas")
    .action(async function (this: Command) {
      const jsonMode = isJsonMode(this);
      const personaList = await listPersonas();

      if (personaList.length === 0) {
        if (jsonMode) {
          console.log(JSON.stringify({ personas: [] }, null, 2));
        } else {
          console.log("No personas found.");
        }
        return;
      }

      // Load full personas to get descriptions
      const personas = [];
      for (const entry of personaList) {
        try {
          const p = await loadPersona(entry.id);
          personas.push({
            id: p.id,
            version: p.version,
            focus: p.behavior.primaryFocus,
            domain: p.behavior.domain,
            description: p.behavior.description,
            triggers: p.triggers?.phrases ?? [],
          });
        } catch {
          // Skip personas that fail to load
        }
      }

      if (jsonMode) {
        console.log(JSON.stringify({ personas }, null, 2));
      } else {
        console.log("Available personas:\n");
        for (const p of personas) {
          console.log(`  ${p.id}`);
          console.log(`    ${p.description}`);
          console.log(`    triggers: ${p.triggers.join(", ") || "(none)"}`);
          console.log("");
        }
      }
    });

  // lexsona persona activate <name>
  persona
    .command("activate <name>")
    .description("Activate a persona by ID or trigger phrase")
    .option("--global", "Store activation in user-global config instead of project-local")
    .action(async function (this: Command, name: string, options: { global?: boolean }) {
      const jsonMode = isJsonMode(this);
      
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
          const errorObj = {
            error: "Failed to persist activation",
            message: error instanceof Error ? error.message : String(error),
          };
          
          if (jsonMode) {
            console.log(JSON.stringify(errorObj, null, 2));
          } else {
            console.error(
              `Warning: Could not persist activation: ${error instanceof Error ? error.message : error}`
            );
          }
        }

        const scope = options.global ? "global" : "project";
        
        if (jsonMode) {
          console.log(JSON.stringify({
            success: true,
            persona: {
              id: p.id,
              version: p.version,
              focus: p.behavior.primaryFocus,
              domain: p.behavior.domain,
              description: p.behavior.description,
              mustDo: p.duties?.mustDo ?? [],
              mustNotDo: p.duties?.mustNotDo ?? [],
            },
            scope,
          }, null, 2));
        } else {
          const scopeText = options.global ? "globally" : "for this project";
          console.log(`✓ Activated persona ${scopeText}: ${p.id}`);
          console.log(`  Focus: ${p.behavior.primaryFocus}`);
          console.log(`  Domain: ${p.behavior.domain}`);
          console.log(`  Description: ${p.behavior.description}`);

          if (p.duties?.mustDo && p.duties.mustDo.length > 0) {
            console.log("\n  Must do:");
            for (const duty of p.duties.mustDo) {
              console.log(`    - ${duty}`);
            }
          }
        }
      } catch {
        const errorObj = {
          error: "Persona not found",
          message: `Persona "${name}" not found`,
          hint: "Use 'lexsona persona list' to see available personas",
        };
        
        if (jsonMode) {
          console.log(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`Error: Persona "${name}" not found.`);
          console.error("  Use 'lexsona persona list' to see available personas.");
        }
        process.exitCode = 1;
      }
    });

  // lexsona persona show [name]
  persona
    .command("show [name]")
    .description("Show persona details (current active if no name provided)")
    .action(async function (this: Command, name?: string) {
      const jsonMode = isJsonMode(this);
      let personaId = name;

      // If no name provided, show the currently active persona
      if (!personaId) {
        try {
          const { personaId: activeId, scope } = getActivePersona();
          if (!activeId) {
            if (jsonMode) {
              console.log(JSON.stringify({
                error: "No active persona",
                message: "No persona currently active",
                hint: "Use 'lexsona persona activate <name>' to activate one",
              }, null, 2));
            } else {
              console.log("No persona currently active.");
              console.log("  Use 'lexsona persona activate <name>' to activate one.");
            }
            return;
          }

          personaId = activeId;
          
          if (!jsonMode) {
            const scopeText = scope === "global" ? "globally" : "for this project";
            console.log(`Currently active persona (${scopeText}):\n`);
          }
        } catch (error) {
          const errorObj = {
            error: "Failed to read active persona",
            message: error instanceof Error ? error.message : String(error),
          };
          
          if (jsonMode) {
            console.log(JSON.stringify(errorObj, null, 2));
          } else {
            console.error(
              `Error reading active persona: ${error instanceof Error ? error.message : error}`
            );
          }
          process.exitCode = 1;
          return;
        }
      }

      try {
        const p: Persona = await loadPersona(personaId);

        if (jsonMode) {
          console.log(JSON.stringify({
            persona: {
              id: p.id,
              version: p.version,
              focus: p.behavior.primaryFocus,
              domain: p.behavior.domain,
              description: p.behavior.description,
              ruleCategories: p.ruleCategories ?? [],
              triggers: p.triggers?.phrases ?? [],
              mustDo: p.duties?.mustDo ?? [],
              mustNotDo: p.duties?.mustNotDo ?? [],
            },
          }, null, 2));
        } else {
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
        }
      } catch {
        const errorObj = {
          error: "Persona not found",
          message: `Persona "${personaId}" not found`,
        };
        
        if (jsonMode) {
          console.log(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`Error: Persona "${personaId}" not found.`);
        }
        process.exitCode = 1;
      }
    });

  // lexsona persona deactivate
  persona
    .command("deactivate")
    .description("Deactivate the current persona")
    .option("--global", "Clear activation from user-global config instead of project-local")
    .action(async function (this: Command, options: { global?: boolean }) {
      const jsonMode = isJsonMode(this);
      
      try {
        clearActivePersona(options.global ?? false);
        const scope = options.global ? "global" : "project";
        
        if (jsonMode) {
          console.log(JSON.stringify({
            success: true,
            message: "Persona deactivated",
            scope,
          }, null, 2));
        } else {
          const scopeText = options.global ? "globally" : "for this project";
          console.log(`✓ Persona deactivated ${scopeText}`);
        }
      } catch (error) {
        const errorObj = {
          error: "Failed to deactivate persona",
          message: error instanceof Error ? error.message : String(error),
        };
        
        if (jsonMode) {
          console.log(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(
            `Error deactivating persona: ${error instanceof Error ? error.message : error}`
          );
        }
        process.exitCode = 1;
      }
    });
}

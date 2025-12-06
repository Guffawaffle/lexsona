/**
 * Persona Commands - lexsona persona <verb>
 * 
 * @module
 */

import { Command } from "commander";

/**
 * Register persona noun commands
 */
export function registerPersonaCommands(program: Command): void {
  const persona = program
    .command("persona")
    .description("Manage personas");

  // lexsona persona list
  persona
    .command("list")
    .description("List available personas")
    .action(async () => {
      // TODO: Implement persona listing
      console.log("Available personas:");
      console.log("  - quality-first_engineering: quality-focused engineering");
      console.log("  - momentum-first_product: Eager Project Manager");
    });

  // lexsona persona activate <name>
  persona
    .command("activate <name>")
    .description("Activate a persona")
    .action(async (name: string) => {
      // TODO: Implement persona activation
      console.log(\`Activating persona: \${name}\`);
    });

  // lexsona persona show <name>
  persona
    .command("show <name>")
    .description("Show persona details")
    .action(async (name: string) => {
      // TODO: Implement persona details
      console.log(\`Persona: \${name}\`);
    });

  // lexsona persona deactivate
  persona
    .command("deactivate")
    .description("Deactivate the current persona")
    .action(async () => {
      // TODO: Implement deactivation
      console.log("Persona deactivated");
    });
}

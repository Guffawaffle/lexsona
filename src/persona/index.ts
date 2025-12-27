/**
 * Persona Module - Persona Loading and Management
 *
 * @module
 */

export * from "./types.js";
export {
  loadPersona,
  listPersonas,
  listPersonasWithSource,
  findPersonaPath,
  loadPersonaFromFile,
  getPersonaSearchPaths,
  matchTrigger,
} from "./loader.js";
export type { PersonaListSource, PersonaListEntry } from "./loader.js";
export {
  getActivePersona,
  setActivePersona,
  clearActivePersona,
  getProjectConfigPath,
  getUserConfigPath,
  readConfig,
  writeConfig,
} from "./config.js";

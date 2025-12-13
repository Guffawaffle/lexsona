/**
 * Persona Module - Persona Loading and Management
 *
 * @module
 */

export * from "./types.js";
export {
  loadPersona,
  listPersonas,
  findPersonaPath,
  loadPersonaFromFile,
  getPersonaSearchPaths,
  matchTrigger,
} from "./loader.js";
export {
  getActivePersona,
  setActivePersona,
  clearActivePersona,
  getProjectConfigPath,
  getUserConfigPath,
  readConfig,
  writeConfig,
} from "./config.js";

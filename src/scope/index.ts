/**
 * Scope inference and lexmap loading
 * @module
 */

export { inferScope, type InferScopeOptions, type InferScopeResult } from "./inferrer.js";
export {
  loadLexmap,
  mapFilesToModules,
  type Lexmap,
  type ModuleConfig,
  type LoadLexmapOptions,
} from "./lexmap.js";

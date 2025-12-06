/**
 * Rules Module - Behavioral Rule Management
 *
 * @module
 */

export * from "./types.js";
export {
  matchScope,
  filterRulesByScope,
  sortBySpecificity,
  scopeRules,
  createScope,
  isScopeEmpty,
  mergeScopes,
  type ScopeMatch,
} from "./scoping.js";

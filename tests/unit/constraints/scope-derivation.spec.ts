/**
 * Tests for scope constraint derivation (ADR-007)
 */
import { describe, it, expect } from "vitest";
import {
  deriveScopeConstraints,
  type DerivedScopeConstraints,
} from "../../../src/constraints/derive.js";
import type { Persona, ScopeConstraints } from "../../../src/persona/types.js";

// Test fixture helper
function createTestPersona(
  overrides: Partial<Persona> = {}
): Persona {
  return {
    id: "quality-first_engineering",
    version: "1.0.0",
    behavior: {
      primaryFocus: "quality-first",
      domain: "engineering",
      description: "Prioritizes correctness and testing",
    },
    duties: {
      mustDo: ["Write tests"],
      mustNotDo: ["Skip validation"],
    },
    triggers: {
      phrases: ["senior dev mode"],
      keywords: ["implementation"],
    },
    ruleCategories: ["testing", "code-quality", "documentation"],
    requires_memory: false,
    offline_safe: {
      confidence_ceiling: 0.7,
      no_memory_disclaimer: "Operating without Lex memory connection.",
    },
    ...overrides,
  };
}

describe("deriveScopeConstraints", () => {
  it("returns defaults when no scope_constraints", () => {
    const persona = createTestPersona();
    const result = deriveScopeConstraints(persona);

    expect(result).toEqual({
      read_globs: ["**/*"],
      write_globs: [],
      deny_globs: ["node_modules/**", "dist/**", ".git/**", "*.lock"],
      cross_repo_allowed: false,
    });
  });

  it("uses persona scope_constraints", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["src/**/*.ts", "tests/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**", ".git/**"],
      cross_repo_allowed: false,
      overrides: undefined,
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona);

    expect(result).toEqual({
      read_globs: ["src/**/*.ts", "tests/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**", ".git/**"],
      cross_repo_allowed: false,
    });
  });

  it("applies procedure override for read_globs", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: ["src/**"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "post-merge-fix": {
          read_globs: ["tests/**/*.spec.ts"],
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "post-merge-fix");

    expect(result.read_globs).toEqual(["tests/**/*.spec.ts"]);
    expect(result.write_globs).toEqual(["src/**"]); // Not overridden
  });

  it("applies procedure override for write_globs", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: ["src/**"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "post-merge-fix": {
          write_globs: ["tests/**/*.spec.ts"],
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "post-merge-fix");

    expect(result.write_globs).toEqual(["tests/**/*.spec.ts"]);
    expect(result.read_globs).toEqual(["**/*"]); // Not overridden
  });

  it("applies procedure override for cross_repo_allowed", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: [],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "cross-repo-task": {
          cross_repo_allowed: true,
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "cross-repo-task");

    expect(result.cross_repo_allowed).toBe(true);
  });

  it("never removes deny_globs (always uses base)", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: ["src/**"],
      deny_globs: ["node_modules/**", "dist/**", ".git/**"],
      cross_repo_allowed: false,
      overrides: {
        "post-merge-fix": {
          write_globs: ["tests/**"],
          // NOTE: deny_globs cannot be specified in overrides per schema
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "post-merge-fix");

    // deny_globs should remain unchanged from base
    expect(result.deny_globs).toEqual([
      "node_modules/**",
      "dist/**",
      ".git/**",
    ]);
  });

  it("handles missing override for procedure", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "post-merge-fix": {
          write_globs: ["tests/**"],
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    // Request a procedure that doesn't exist
    const result = deriveScopeConstraints(persona, "non-existent-procedure");

    // Should use base constraints
    expect(result).toEqual({
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
    });
  });

  it("handles undefined procedure parameter", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "post-merge-fix": {
          write_globs: ["tests/**"],
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona);

    // Should use base constraints
    expect(result).toEqual({
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
    });
  });

  it("handles persona without overrides property", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      // No overrides property
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "some-procedure");

    // Should use base constraints without error
    expect(result).toEqual({
      read_globs: ["src/**/*.ts"],
      write_globs: ["src/**/*.ts"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
    });
  });

  it("applies multiple override fields simultaneously", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: ["src/**"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
      overrides: {
        "fanout-issue": {
          read_globs: ["src/**/*.ts", "tests/**/*.ts"],
          write_globs: ["src/**/*.ts", "tests/**/*.ts", "docs/**/*.md"],
          cross_repo_allowed: true,
        },
      },
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona, "fanout-issue");

    expect(result).toEqual({
      read_globs: ["src/**/*.ts", "tests/**/*.ts"],
      write_globs: ["src/**/*.ts", "tests/**/*.ts", "docs/**/*.md"],
      deny_globs: ["node_modules/**"], // Never overridden
      cross_repo_allowed: true,
    });
  });

  it("preserves array immutability (does not mutate persona)", () => {
    const scopeConstraints: ScopeConstraints = {
      read_globs: ["**/*"],
      write_globs: ["src/**"],
      deny_globs: ["node_modules/**"],
      cross_repo_allowed: false,
    };

    const persona = createTestPersona({
      scope_constraints: scopeConstraints,
    });

    const result = deriveScopeConstraints(persona);

    // Mutate the result
    result.read_globs.push("NEW_GLOB");
    result.write_globs.push("NEW_WRITE");
    result.deny_globs.push("NEW_DENY");

    // Original should be unchanged
    expect(persona.scope_constraints?.read_globs).toEqual(["**/*"]);
    expect(persona.scope_constraints?.write_globs).toEqual(["src/**"]);
    expect(persona.scope_constraints?.deny_globs).toEqual(["node_modules/**"]);
  });
});

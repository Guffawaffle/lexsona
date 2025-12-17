/**
 * Persona Loader
 *
 * Loads persona manifests from YAML/Markdown files.
 * Supports multiple search paths with precedence:
 * 1. Project-local: .smartergpt/personas/
 * 2. User-global: ~/.smartergpt/personas/
 * 3. Bundled: LexSona package personas/
 *
 * @module
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import { PersonaManifestSchema, type Persona, type PersonaManifest } from "./types.js";
import {
  LexSonaErrorCode,
  createPersonaNotFoundError,
  createPersonaManifestError,
  LexSonaError,
} from "../mcp/errors.js";

/**
 * Get the directory containing bundled personas
 */
function getBundledPersonasDir(): string {
  // In ESM, we need to derive __dirname from import.meta.url
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Go up from dist/persona to package root, then into personas/
  return join(__dirname, "..", "..", "personas");
}

/**
 * Search paths for personas (in precedence order)
 */
export function getPersonaSearchPaths(): string[] {
  const paths: string[] = [];

  // 1. Project-local
  const localPath = join(process.cwd(), ".smartergpt", "personas");
  if (existsSync(localPath)) {
    paths.push(localPath);
  }

  // 2. User-global
  const globalPath = join(homedir(), ".smartergpt", "personas");
  if (existsSync(globalPath)) {
    paths.push(globalPath);
  }

  // 3. Bundled (always available)
  const bundledPath = getBundledPersonasDir();
  if (existsSync(bundledPath)) {
    paths.push(bundledPath);
  }

  return paths;
}

/**
 * Parse frontmatter from a markdown file
 * Returns { frontmatter: object, body: string }
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2].trim() };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Load a persona from a file path
 * Supports both .yaml and .md (with YAML frontmatter) files
 */
export function loadPersonaFromFile(filePath: string): Persona {
  if (!existsSync(filePath)) {
    throw new LexSonaError(
      LexSonaErrorCode.PERSONA_NOT_FOUND,
      `Persona file not found: ${filePath}`,
      {
        retryable: false,
        suggestions: ["Check that the file path is correct", "Verify file permissions"],
        context: { filePath },
      }
    );
  }

  const content = readFileSync(filePath, "utf-8");

  let manifest: PersonaManifest;
  let body: string | undefined;

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    // Pure YAML file
    try {
      const parsed = parseYaml(content) as Record<string, unknown>;
      const result = PersonaManifestSchema.safeParse(parsed);
      if (!result.success) {
        const errors = result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw createPersonaManifestError(filePath, errors);
      }
      manifest = result.data as PersonaManifest;
      body = undefined;
    } catch (error) {
      if (error instanceof LexSonaError) {
        throw error;
      }
      throw new LexSonaError(
        LexSonaErrorCode.PERSONA_PARSE_FAILED,
        `Failed to parse YAML in ${filePath}: ${error}`,
        {
          retryable: false,
          suggestions: ["Check YAML syntax", "Validate file encoding"],
          context: { filePath },
        }
      );
    }
  } else {
    // Markdown file with YAML frontmatter
    const { frontmatter, body: mdBody } = parseFrontmatter(content);

    // Validate manifest against schema
    const result = PersonaManifestSchema.safeParse(frontmatter);
    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      throw createPersonaManifestError(filePath, errors);
    }

    manifest = result.data as PersonaManifest;
    body = mdBody || undefined;
  }

  return {
    ...manifest,
    body,
  };
}

/**
 * Find persona file by name/id
 * Searches in precedence order and returns first match
 * Supports both .yaml and .md files
 */
export function findPersonaPath(nameOrId: string): string | null {
  const searchPaths = getPersonaSearchPaths();

  // Try exact match with .yaml first, then .md
  for (const searchPath of searchPaths) {
    for (const ext of [".yaml", ".yml", ".md"]) {
      const exactPath = join(searchPath, `${nameOrId}${ext}`);
      if (existsSync(exactPath)) {
        return exactPath;
      }
    }
  }

  // Try matching by persona ID in files
  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    const files = readdirSync(searchPath).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md")
    );
    for (const file of files) {
      const filePath = join(searchPath, file);
      try {
        const persona = loadPersonaFromFile(filePath);
        if (persona.id === nameOrId) {
          return filePath;
        }
      } catch {
        // Skip invalid personas
        continue;
      }
    }
  }

  return null;
}

/**
 * Load a persona by name or ID
 */
export async function loadPersona(nameOrId: string): Promise<Persona> {
  const filePath = findPersonaPath(nameOrId);
  if (!filePath) {
    const searchPaths = getPersonaSearchPaths();
    throw createPersonaNotFoundError(nameOrId, searchPaths);
  }
  return loadPersonaFromFile(filePath);
}

/**
 * List all available personas
 * Supports both .yaml and .md files
 */
export async function listPersonas(): Promise<{ id: string; path: string }[]> {
  const searchPaths = getPersonaSearchPaths();
  const seen = new Set<string>();
  const result: { id: string; path: string }[] = [];

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;

    const files = readdirSync(searchPath).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md")
    );
    for (const file of files) {
      const filePath = join(searchPath, file);
      try {
        const persona = loadPersonaFromFile(filePath);
        // Skip duplicates (earlier paths take precedence)
        if (!seen.has(persona.id)) {
          seen.add(persona.id);
          result.push({ id: persona.id, path: filePath });
        }
      } catch {
        // Skip invalid personas
        continue;
      }
    }
  }

  return result;
}

/**
 * Match input against persona triggers
 * Returns the first matching persona ID or null
 */
export async function matchTrigger(input: string): Promise<string | null> {
  const personas = await listPersonas();
  const lowerInput = input.toLowerCase();

  for (const { id } of personas) {
    try {
      const persona = await loadPersona(id);
      for (const phrase of persona.triggers.phrases) {
        if (lowerInput.includes(phrase.toLowerCase())) {
          return id;
        }
      }
      // Check keywords if present
      if (persona.triggers.keywords) {
        for (const keyword of persona.triggers.keywords) {
          if (lowerInput.includes(keyword.toLowerCase())) {
            return id;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

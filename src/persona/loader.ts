/**
 * Persona Loader
 *
 * Loads persona manifests from YAML/Markdown files or Lex database.
 * Supports multiple search paths with precedence:
 * 1. Project-local filesystem: .smartergpt/personas/ (developer overrides)
 * 2. Lex database: personas table (shared team/project personas)
 * 3. User-global filesystem: ~/.smartergpt/personas/ (personal preferences)
 * 4. Bundled: LexSona package personas/ (fallback defaults)
 *
 * @module
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import {
  PersonaManifestSchema,
  type Persona,
  type PersonaManifest,
  type PersonaCapability,
} from "./types.js";
import {
  LexSonaErrorCode,
  createPersonaNotFoundError,
  createPersonaManifestError,
  LexSonaError,
} from "../mcp/errors.js";
import { connectToLex, type PersonaRecord } from "../core/lexConnection.js";

/**
 * Source of a persona listing entry
 */
export type PersonaListSource = "project-local" | "database" | "user-global" | "bundled";

/**
 * Result of listing personas with source information
 */
export interface PersonaListEntry {
  id: string;
  path?: string;
  source: PersonaListSource;
  version?: string;
}

/**
 * Optional Lex database connection for persona lookup
 * Initialized lazily on first use
 */
let lexDbConnection: ReturnType<typeof connectToLex> | null = null;
let lexDbInitialized = false;

/**
 * Get Lex database connection (lazy initialization)
 * Returns null if database is not available
 */
function getLexDb(): ReturnType<typeof connectToLex>["db"] | null {
  if (!lexDbInitialized) {
    lexDbInitialized = true;
    try {
      const result = connectToLex();
      if (result.success && result.db) {
        // Check if personas table exists
        const tables = result.db
          .prepare(
            `
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='personas'
        `
          )
          .all();

        if (tables.length > 0) {
          lexDbConnection = result;
        } else {
          // Personas table not available yet
          result.db.close();
          lexDbConnection = null;
        }
      }
    } catch {
      // Database not available, continue without it
      lexDbConnection = null;
    }
  }
  return lexDbConnection?.db ?? null;
}

/**
 * Load a persona from the Lex database by ID
 * Returns null if not found or database not available
 */
function loadPersonaFromDatabase(id: string): Persona | null {
  const db = getLexDb();
  if (!db) return null;

  try {
    const stmt = db.prepare(`SELECT * FROM personas WHERE id = ?`);
    const row = stmt.get(id) as PersonaRecord | undefined;

    if (!row) return null;

    // Parse the YAML manifest
    const parsed = parseYaml(row.manifest_yaml) as Record<string, unknown>;
    const result = PersonaManifestSchema.safeParse(parsed);

    if (!result.success) {
      // Invalid manifest in database, skip it
      return null;
    }

    const manifest = result.data as PersonaManifest;

    return {
      ...manifest,
      capability: manifest.capability ?? deriveCapability(manifest),
      body: undefined,
    };
  } catch {
    // Error loading from database, continue without it
    return null;
  }
}

/**
 * List personas from the Lex database
 * Returns empty array if database not available
 */
function listPersonasFromDatabase(): PersonaListEntry[] {
  const db = getLexDb();
  if (!db) return [];

  try {
    const stmt = db.prepare(`SELECT id, version FROM personas ORDER BY updated_at DESC`);
    const rows = stmt.all() as Array<{ id: string; version: string }>;

    return rows.map((row) => ({
      id: row.id,
      source: "database" as const,
      version: row.version,
    }));
  } catch {
    return [];
  }
}

/**
 * Derive capability matrix from persona manifest (AX-003)
 * Used when capability is not explicitly defined
 */
function deriveCapability(manifest: PersonaManifest): PersonaCapability {
  const focus = manifest.behavior.primaryFocus;

  // Map of focus patterns to their optimizations and deprioritizations
  const focusMap: Record<string, { optimizes: string[]; deprioritizes: string[] }> = {
    "quality-first": {
      optimizes: ["correctness", "testing", "maintainability"],
      deprioritizes: ["velocity"],
    },
    "momentum-first": {
      optimizes: ["velocity", "iteration", "shipping"],
      deprioritizes: ["perfection"],
    },
    "risk-reducer": {
      optimizes: ["safety", "validation", "error-handling"],
      deprioritizes: ["speed"],
    },
    "test-first": {
      optimizes: ["test-coverage", "reliability", "regression-prevention"],
      deprioritizes: ["rapid-prototyping"],
    },
    "minimal-diff": {
      optimizes: ["focused-changes", "review-efficiency", "minimal-impact"],
      deprioritizes: ["comprehensive-refactoring"],
    },
  };

  // Return mapped values or derive from behavior description
  if (focusMap[focus]) {
    return focusMap[focus];
  }

  // Fallback: basic derivation from focus name
  return {
    optimizes: [focus.replace("-first", ""), manifest.behavior.domain || "general"].filter(Boolean),
    deprioritizes: ["unknown"],
  };
}

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
      ["Check that the file path is correct", "Verify file permissions"],
      { filePath, retryable: false }
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
        ["Check YAML syntax", "Validate file encoding"],
        { filePath, retryable: false }
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
    capability: manifest.capability ?? deriveCapability(manifest),
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
 *
 * Precedence order:
 * 1. Project-local filesystem (highest - developer overrides)
 * 2. Lex database (shared team/project personas)
 * 3. User-global filesystem (personal preferences)
 * 4. Bundled (fallback defaults)
 */
export async function loadPersona(nameOrId: string): Promise<Persona> {
  // 1. Check project-local filesystem first
  const projectLocalPath = join(process.cwd(), ".smartergpt", "personas");
  if (existsSync(projectLocalPath)) {
    for (const ext of [".yaml", ".yml", ".md"]) {
      const localPath = join(projectLocalPath, `${nameOrId}${ext}`);
      if (existsSync(localPath)) {
        return loadPersonaFromFile(localPath);
      }
    }
    // Also try matching by ID in files
    const files = readdirSync(projectLocalPath).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md")
    );
    for (const file of files) {
      const filePath = join(projectLocalPath, file);
      try {
        const persona = loadPersonaFromFile(filePath);
        if (persona.id === nameOrId) {
          return persona;
        }
      } catch {
        continue;
      }
    }
  }

  // 2. Check Lex database (new in V10)
  const dbPersona = loadPersonaFromDatabase(nameOrId);
  if (dbPersona) {
    return dbPersona;
  }

  // 3. Check user-global and bundled via existing file search
  const filePath = findPersonaPath(nameOrId);
  if (filePath) {
    return loadPersonaFromFile(filePath);
  }

  // Not found anywhere
  const searchPaths = getPersonaSearchPaths();
  throw createPersonaNotFoundError(nameOrId, searchPaths);
}

/**
 * List all available personas with source information
 *
 * Precedence order for deduplication:
 * 1. Project-local filesystem
 * 2. Lex database
 * 3. User-global filesystem
 * 4. Bundled
 */
export async function listPersonasWithSource(): Promise<PersonaListEntry[]> {
  const seen = new Set<string>();
  const result: PersonaListEntry[] = [];

  // Helper to add entries from a filesystem path
  const addFromPath = (searchPath: string, source: PersonaListSource) => {
    if (!existsSync(searchPath)) return;

    const files = readdirSync(searchPath).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md")
    );
    for (const file of files) {
      const filePath = join(searchPath, file);
      try {
        const persona = loadPersonaFromFile(filePath);
        if (!seen.has(persona.id)) {
          seen.add(persona.id);
          result.push({ id: persona.id, path: filePath, source });
        }
      } catch {
        continue;
      }
    }
  };

  // 1. Project-local
  addFromPath(join(process.cwd(), ".smartergpt", "personas"), "project-local");

  // 2. Database
  const dbPersonas = listPersonasFromDatabase();
  for (const entry of dbPersonas) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      result.push(entry);
    }
  }

  // 3. User-global
  addFromPath(join(homedir(), ".smartergpt", "personas"), "user-global");

  // 4. Bundled
  const bundledPath = getBundledPersonasDir();
  addFromPath(bundledPath, "bundled");

  return result;
}

/**
 * List all available personas
 * Supports both .yaml and .md files
 * @deprecated Use listPersonasWithSource() for source information
 */
export async function listPersonas(): Promise<{ id: string; path: string }[]> {
  const entries = await listPersonasWithSource();
  return entries.map((entry) => ({
    id: entry.id,
    path: entry.path ?? `database:${entry.id}`,
  }));
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

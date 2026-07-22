/**
 * Canonical ConstraintSnapshot_v1 contract.
 *
 * A snapshot binds deterministic behavioral guidance to its inputs. It is not
 * an authority token and cannot grant filesystem, process, network, or tool
 * permissions.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type { BaselineData } from "../baseline/loader.js";
import { checkConflicts } from "../conflicts/detector.js";
import type { Persona } from "../persona/types.js";
import type { BehaviorRuleWithConfidence } from "../rules/types.js";
import { deriveScopeConstraints, type Constraint, type ConstraintSet } from "./derive.js";

export const CONSTRAINT_SNAPSHOT_V1_CONTRACT = "ConstraintSnapshot_v1" as const;
export const CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION = 1 as const;
export const DEFAULT_LEXSONA_ENGINE_VERSION = "1.1.0";

const MAX_CONSTRAINTS = 128;
const MAX_PRINCIPLES = 64;
const MAX_CONFLICT_SAMPLES = 8;
const MAX_EXCLUSION_SAMPLES = 12;
const MAX_COMPACT_CONSTRAINTS = 20;
const MAX_COMPACT_PRINCIPLES = 12;
const MAX_TEXT_LENGTH = 2_048;
const MAX_COMPACT_TEXT_LENGTH = 240;

const DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const BoundedIdentifierSchema = z.string().min(1).max(256);
const BoundedTextSchema = z.string().min(1).max(MAX_TEXT_LENGTH);

export const SnapshotBindingsV1Schema = z
  .object({
    tenant: BoundedIdentifierSchema.optional(),
    workspace: BoundedIdentifierSchema.optional(),
    repositoryInstance: BoundedIdentifierSchema.optional(),
    run: BoundedIdentifierSchema.optional(),
    attempt: BoundedIdentifierSchema.optional(),
    workerRole: BoundedIdentifierSchema.optional(),
    modelFamily: BoundedIdentifierSchema.optional(),
    task: BoundedIdentifierSchema.optional(),
    phase: BoundedIdentifierSchema.optional(),
  })
  .strict();

export const SnapshotScopeV1Schema = z
  .object({
    readGlobs: z.array(BoundedIdentifierSchema).max(256),
    writeGlobs: z.array(BoundedIdentifierSchema).max(256),
    denyGlobs: z.array(BoundedIdentifierSchema).max(256),
    crossRepoAllowed: z.boolean(),
  })
  .strict();

const SnapshotConstraintV1Schema = z
  .object({
    id: BoundedIdentifierSchema,
    text: BoundedTextSchema,
    severity: z.enum(["must", "should", "style"]),
    confidence: z.number().min(0).max(1),
    category: BoundedIdentifierSchema,
    source: z.enum(["baseline", "persona", "learned"]),
  })
  .strict();

const SnapshotPrincipleV1Schema = z
  .object({
    id: BoundedIdentifierSchema,
    description: BoundedTextSchema,
  })
  .strict();

const SnapshotSourceRefV1Schema = z
  .object({
    revision: BoundedIdentifierSchema,
    digest: DigestSchema,
  })
  .strict();

const CompactConstraintV1Schema = z
  .object({
    id: BoundedIdentifierSchema,
    severity: z.enum(["must", "should", "style"]),
    text: z.string().min(1).max(MAX_COMPACT_TEXT_LENGTH),
  })
  .strict();

export const ConstraintSnapshotV1Schema = z
  .object({
    contract: z.literal(CONSTRAINT_SNAPSHOT_V1_CONTRACT),
    schemaVersion: z.literal(CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION),
    engine: z
      .object({
        name: z.literal("@smartergpt/lexsona"),
        version: BoundedIdentifierSchema,
      })
      .strict(),
    bindings: SnapshotBindingsV1Schema.optional(),
    persona: z
      .object({
        id: BoundedIdentifierSchema,
        version: BoundedIdentifierSchema,
        digest: DigestSchema,
      })
      .strict(),
    sources: z
      .object({
        baseline: SnapshotSourceRefV1Schema,
        ruleSet: SnapshotSourceRefV1Schema.extend({ count: z.number().int().min(0) }).strict(),
        constraintPacks: z
          .array(SnapshotSourceRefV1Schema.extend({ id: BoundedIdentifierSchema }).strict())
          .max(128),
      })
      .strict(),
    derivation: z
      .object({
        mode: z.enum(["connected", "offline"]),
        context: z
          .object({
            domain: BoundedIdentifierSchema.optional(),
            moduleId: BoundedIdentifierSchema.optional(),
            taskType: BoundedIdentifierSchema.optional(),
            environment: BoundedIdentifierSchema.optional(),
            agentFamily: BoundedIdentifierSchema.optional(),
            contextTags: z.array(BoundedIdentifierSchema).max(256),
            procedure: BoundedIdentifierSchema.optional(),
            files: z.array(BoundedIdentifierSchema).max(1_024),
          })
          .strict(),
        confidence: z
          .object({
            threshold: z.number().min(0).max(1),
            ceiling: z.number().min(0).max(1).optional(),
          })
          .strict(),
      })
      .strict(),
    authority: z
      .object({
        grantsAuthority: z.literal(false),
        requestedScope: SnapshotScopeV1Schema,
        authorizedCeilingDigest: DigestSchema.optional(),
        effectiveScope: SnapshotScopeV1Schema.optional(),
        rejectedRequests: z
          .object({
            readGlobs: z.array(BoundedIdentifierSchema).max(256),
            writeGlobs: z.array(BoundedIdentifierSchema).max(256),
            crossRepo: z.boolean(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    principles: z.array(SnapshotPrincipleV1Schema).max(MAX_PRINCIPLES),
    constraints: z.array(SnapshotConstraintV1Schema).max(MAX_CONSTRAINTS),
    resolutions: z
      .object({
        contradictions: z
          .object({
            count: z.number().int().min(0),
            samples: z
              .array(
                z
                  .object({
                    ruleA: BoundedIdentifierSchema,
                    ruleB: BoundedIdentifierSchema,
                    severity: z.enum(["high", "medium", "low"]),
                  })
                  .strict()
              )
              .max(MAX_CONFLICT_SAMPLES),
          })
          .strict(),
        exclusions: z
          .object({
            count: z.number().int().min(0),
            reasonCounts: z
              .array(
                z
                  .object({
                    reason: z.literal("not-selected"),
                    count: z.number().int().min(0),
                  })
                  .strict()
              )
              .max(1),
            sampleRuleIds: z.array(BoundedIdentifierSchema).max(MAX_EXCLUSION_SAMPLES),
          })
          .strict(),
      })
      .strict(),
    canonicalTimestamp: z.string().datetime({ offset: true }).optional(),
    diagnostics: z.object({ provenanceRef: BoundedIdentifierSchema }).strict().optional(),
    contentDigest: DigestSchema,
    compact: z
      .object({
        contract: z.literal(CONSTRAINT_SNAPSHOT_V1_CONTRACT),
        schemaVersion: z.literal(CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION),
        digest: DigestSchema,
        persona: BoundedIdentifierSchema,
        mode: z.enum(["connected", "offline"]),
        grantsAuthority: z.literal(false),
        principles: z.array(BoundedIdentifierSchema).max(MAX_COMPACT_PRINCIPLES),
        constraints: z.array(CompactConstraintV1Schema).max(MAX_COMPACT_CONSTRAINTS),
        omitted: z
          .object({
            principles: z.number().int().min(0),
            constraints: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type SnapshotBindingsV1 = z.infer<typeof SnapshotBindingsV1Schema>;
export type SnapshotScopeV1 = z.infer<typeof SnapshotScopeV1Schema>;
export type ConstraintSnapshotV1 = z.infer<typeof ConstraintSnapshotV1Schema>;

export interface ConstraintSnapshotAuthorityCeilingV1 extends SnapshotScopeV1 {
  /** Stable authority-policy digest supplied by the actual sandbox/broker. */
  digest: string;
}

export interface CreateConstraintSnapshotV1Input {
  constraintSet: ConstraintSet;
  persona: Persona;
  rules: BehaviorRuleWithConfidence[];
  baseline: Pick<BaselineData, "version" | "principles" | "constraints">;
  bindings?: SnapshotBindingsV1;
  authorityCeiling?: ConstraintSnapshotAuthorityCeilingV1;
  engineVersion?: string;
  canonicalTimestamp?: string;
  provenanceRef?: string;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON does not support non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = normalizeJson(entry);
    }
    return result;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}`);
}

/** Return canonical JSON with recursively sorted object keys. */
export function canonicalizeConstraintSnapshotValue(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

/** Return a tagged SHA-256 digest over canonical JSON. */
export function digestConstraintSnapshotValue(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeConstraintSnapshotValue(value))
    .digest("hex")}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function boundedText(value: string): string {
  if (value.length <= MAX_TEXT_LENGTH) return value;
  throw new RangeError(`Snapshot text exceeds ${MAX_TEXT_LENGTH} characters`);
}

function compactText(value: string): string {
  return value.length <= MAX_COMPACT_TEXT_LENGTH
    ? value
    : `${value.slice(0, MAX_COMPACT_TEXT_LENGTH - 1)}…`;
}

function severityRank(severity: Constraint["severity"]): number {
  return severity === "must" ? 0 : severity === "should" ? 1 : 2;
}

function normalizeScope(scope: {
  read_globs: string[];
  write_globs: string[];
  deny_globs: string[];
  cross_repo_allowed: boolean;
}): SnapshotScopeV1 {
  return {
    readGlobs: uniqueSorted(scope.read_globs),
    writeGlobs: uniqueSorted(scope.write_globs),
    denyGlobs: uniqueSorted(scope.deny_globs),
    crossRepoAllowed: scope.cross_repo_allowed,
  };
}

function applyAuthorityCeiling(
  requested: SnapshotScopeV1,
  ceiling: ConstraintSnapshotAuthorityCeilingV1
): Pick<ConstraintSnapshotV1["authority"], "effectiveScope" | "rejectedRequests"> {
  const allowedRead = new Set(ceiling.readGlobs);
  const allowedWrite = new Set(ceiling.writeGlobs);
  const rejectedRead = requested.readGlobs.filter((glob) => !allowedRead.has(glob));
  const rejectedWrite = requested.writeGlobs.filter((glob) => !allowedWrite.has(glob));
  const rejectedCrossRepo = requested.crossRepoAllowed && !ceiling.crossRepoAllowed;

  return {
    effectiveScope: {
      readGlobs: requested.readGlobs.filter((glob) => allowedRead.has(glob)),
      writeGlobs: requested.writeGlobs.filter((glob) => allowedWrite.has(glob)),
      denyGlobs: uniqueSorted([...ceiling.denyGlobs, ...requested.denyGlobs]),
      crossRepoAllowed: requested.crossRepoAllowed && ceiling.crossRepoAllowed,
    },
    rejectedRequests: {
      readGlobs: rejectedRead,
      writeGlobs: rejectedWrite,
      crossRepo: rejectedCrossRepo,
    },
  };
}

function canonicalTimestamp(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new TypeError("canonicalTimestamp must be RFC 3339");
  return parsed.toISOString();
}

/**
 * Build the canonical v1 snapshot. Runtime observation time is deliberately
 * absent. A timestamp participates in identity only when the caller supplies
 * `canonicalTimestamp`.
 */
export function createConstraintSnapshotV1(
  input: CreateConstraintSnapshotV1Input
): ConstraintSnapshotV1 {
  const { constraintSet, persona, rules, baseline } = input;
  if (constraintSet.personaId !== persona.id) {
    throw new TypeError(
      `ConstraintSet persona "${constraintSet.personaId}" does not match snapshot persona "${persona.id}"`
    );
  }
  const principles = constraintSet.principles
    .map((principle) => ({ id: principle.id, description: boundedText(principle.description) }))
    .sort((a, b) => compareText(a.id, b.id) || compareText(a.description, b.description));
  const constraints = constraintSet.constraints
    .map((constraint) => ({
      id: constraint.rule_id,
      text: boundedText(constraint.text),
      severity: constraint.severity,
      confidence: constraint.confidence,
      category: constraint.category,
      source: constraint.source ?? "learned",
    }))
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        compareText(a.id, b.id) ||
        compareText(a.text, b.text)
    );

  if (principles.length > MAX_PRINCIPLES) {
    throw new RangeError(`Snapshot exceeds ${MAX_PRINCIPLES} principles`);
  }
  if (constraints.length > MAX_CONSTRAINTS) {
    throw new RangeError(`Snapshot exceeds ${MAX_CONSTRAINTS} constraints`);
  }

  const constraintPacks = Object.entries(persona.constraints ?? {})
    .map(([id, entries]) => ({
      id,
      revision: persona.version,
      digest: digestConstraintSnapshotValue(
        [...entries].sort(
          (a, b) => compareText(a.id, b.id) || compareText(a.statement, b.statement)
        )
      ),
    }))
    .sort((a, b) => compareText(a.id, b.id));

  const includedLearnedRuleIds = new Set(
    constraints
      .filter((constraint) => constraint.source === "learned")
      .map((constraint) => constraint.id)
  );
  const excludedRuleIds = uniqueSorted(
    rules.map((rule) => rule.rule_id).filter((ruleId) => !includedLearnedRuleIds.has(ruleId))
  );
  const conflicts = checkConflicts(rules)
    .conflicts.map((conflict) => ({
      ruleA: conflict.ruleA,
      ruleB: conflict.ruleB,
      severity: conflict.severity,
    }))
    .sort(
      (a, b) =>
        compareText(a.ruleA, b.ruleA) ||
        compareText(a.ruleB, b.ruleB) ||
        compareText(a.severity, b.severity)
    );

  const requestedScope = normalizeScope(
    deriveScopeConstraints(persona, constraintSet.context.procedure)
  );
  const ceiling = input.authorityCeiling;
  const authorityFromCeiling = ceiling ? applyAuthorityCeiling(requestedScope, ceiling) : {};
  const timestamp = canonicalTimestamp(input.canonicalTimestamp);

  const identity = {
    contract: CONSTRAINT_SNAPSHOT_V1_CONTRACT,
    schemaVersion: CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION,
    engine: {
      name: "@smartergpt/lexsona" as const,
      version: input.engineVersion ?? DEFAULT_LEXSONA_ENGINE_VERSION,
    },
    ...(input.bindings && { bindings: SnapshotBindingsV1Schema.parse(input.bindings) }),
    persona: {
      id: persona.id,
      version: persona.version,
      digest: digestConstraintSnapshotValue(persona),
    },
    sources: {
      baseline: {
        revision: String(baseline.version),
        digest: digestConstraintSnapshotValue({
          version: baseline.version,
          principles: [...baseline.principles].sort((a, b) => compareText(a.id, b.id)),
          constraints: [...baseline.constraints].sort((a, b) => compareText(a.rule_id, b.rule_id)),
        }),
      },
      ruleSet: {
        revision: String(constraintSet.ruleVersion ?? 0),
        digest: digestConstraintSnapshotValue(
          [...rules].sort((a, b) => compareText(a.rule_id, b.rule_id))
        ),
        count: rules.length,
      },
      constraintPacks,
    },
    derivation: {
      mode: constraintSet.metadata.offlineMode ? ("offline" as const) : ("connected" as const),
      context: {
        ...(constraintSet.context.domain && { domain: constraintSet.context.domain }),
        ...(constraintSet.context.module_id && { moduleId: constraintSet.context.module_id }),
        ...(constraintSet.context.taskType && { taskType: constraintSet.context.taskType }),
        ...(constraintSet.context.environment && {
          environment: constraintSet.context.environment,
        }),
        ...(constraintSet.context.agent_family && {
          agentFamily: constraintSet.context.agent_family,
        }),
        contextTags: uniqueSorted(constraintSet.context.context_tags ?? []),
        ...(constraintSet.context.procedure && { procedure: constraintSet.context.procedure }),
        files: uniqueSorted(constraintSet.context.files ?? []),
      },
      confidence: {
        threshold: constraintSet.metadata.confidenceThreshold,
        ...(constraintSet.metadata.confidenceCeiling !== undefined && {
          ceiling: constraintSet.metadata.confidenceCeiling,
        }),
      },
    },
    authority: {
      grantsAuthority: false as const,
      requestedScope,
      ...(ceiling && { authorizedCeilingDigest: DigestSchema.parse(ceiling.digest) }),
      ...authorityFromCeiling,
    },
    principles,
    constraints,
    resolutions: {
      contradictions: {
        count: conflicts.length,
        samples: conflicts.slice(0, MAX_CONFLICT_SAMPLES),
      },
      exclusions: {
        count: excludedRuleIds.length,
        reasonCounts:
          excludedRuleIds.length > 0
            ? [{ reason: "not-selected" as const, count: excludedRuleIds.length }]
            : [],
        sampleRuleIds: excludedRuleIds.slice(0, MAX_EXCLUSION_SAMPLES),
      },
    },
    ...(timestamp && { canonicalTimestamp: timestamp }),
    ...(input.provenanceRef && { diagnostics: { provenanceRef: input.provenanceRef } }),
  };

  // Diagnostic references are observation aids, not behavior, so they do not
  // participate in the behavioral content identity.
  const { diagnostics: _diagnostics, ...behavioralIdentity } = identity;
  const contentDigest = digestConstraintSnapshotValue(behavioralIdentity);
  const compactPrinciples = principles.slice(0, MAX_COMPACT_PRINCIPLES).map((p) => p.id);
  const compactConstraints = constraints.slice(0, MAX_COMPACT_CONSTRAINTS).map((constraint) => ({
    id: constraint.id,
    severity: constraint.severity,
    text: compactText(constraint.text),
  }));

  return ConstraintSnapshotV1Schema.parse({
    ...identity,
    contentDigest,
    compact: {
      contract: CONSTRAINT_SNAPSHOT_V1_CONTRACT,
      schemaVersion: CONSTRAINT_SNAPSHOT_V1_SCHEMA_VERSION,
      digest: contentDigest,
      persona: `${persona.id}@${persona.version}`,
      mode: identity.derivation.mode,
      grantsAuthority: false,
      principles: compactPrinciples,
      constraints: compactConstraints,
      omitted: {
        principles: principles.length - compactPrinciples.length,
        constraints: constraints.length - compactConstraints.length,
      },
    },
  });
}

/** Validate a snapshot and fail closed on unsupported schema majors. */
export function parseConstraintSnapshotV1(value: unknown): ConstraintSnapshotV1 {
  return ConstraintSnapshotV1Schema.parse(value);
}

/** Serialize a validated snapshot to byte-stable canonical JSON. */
export function serializeConstraintSnapshotV1(value: ConstraintSnapshotV1): string {
  return canonicalizeConstraintSnapshotValue(parseConstraintSnapshotV1(value));
}

/** JSON Schema generated from the canonical Zod contract. */
export const CONSTRAINT_SNAPSHOT_V1_JSON_SCHEMA = z.toJSONSchema(ConstraintSnapshotV1Schema, {
  target: "draft-2020-12",
  reused: "ref",
});

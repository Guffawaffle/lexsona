/**
 * LexSona Core - Main Runtime Engine
 *
 * The central engine for persona activation and constraint derivation.
 * Connects to Lex for behavioral rule storage.
 *
 * Invariant: LexSona returns constraints, never executes work.
 *
 * @module
 */

import type { DeriveContext, ConstraintSet, Principle } from "../constraints/derive.js";
import { deriveConstraints as deriveConstraintsPure } from "../constraints/derive.js";
import type {
  CorrectionInput,
  BehaviorRuleWithConfidence,
  TrustGapEvent,
  AgentTrustProfile,
} from "../rules/types.js";
import {
  recordTrustGap as recordTrustGapInternal,
  getAgentTrustProfile as getAgentTrustProfileInternal,
  applyTrustCalibration,
} from "../rules/trust.js";
import { LexStorageClient, type LexConnectionConfig } from "./lexConnection.js";
import { loadPersona } from "../persona/loader.js";
import type { Persona } from "../persona/types.js";
import { createLexNotConnectedError } from "../mcp/errors.js";
import { getBaseline, type BaselineData } from "../baseline/index.js";
import {
  createConstraintSnapshotV1,
  digestConstraintSnapshotValue,
  type ConstraintSnapshotAuthorityCeilingV1,
  type ConstraintSnapshotV1,
  type SnapshotBindingsV1,
} from "../constraints/snapshot.js";
import {
  behaviorRuleFromRevision,
  closeScopedBehavioralConnection,
  getScopedBehavioralBindingReceipt,
  getScopedRuleRevision,
  isScopedLexSonaConfig,
  openScopedBehavioralConnection,
  promoteScopedRule,
  putScopedPersonaRevision,
  putScopedRuleRevision,
  readScopedBehavioralSnapshot,
  recordScopedEvidence,
  type BehavioralEvidenceInputV1,
  type BehavioralPromotionInputV1,
  type BehavioralRevisionWriteV1,
  type BehavioralWriteReceiptV1,
  type PersonaRevisionInputV1,
  type RuleRevisionInputV1,
  type ScopedBehavioralConnection,
  type ScopedLexSonaConfig,
} from "./scopedBehavior.js";

// Import Lex APIs through the lexsona subpath
import { getRules, recordCorrection } from "@smartergpt/lex/lexsona";
import type { RuleContext, Correction } from "@smartergpt/lex/lexsona";

// Cached baseline data (loaded from baseline.yaml)
let cachedBaseline: BaselineData | null = null;

/**
 * Get baseline data (cached)
 */
function getBaselineData(): BaselineData {
  if (!cachedBaseline) {
    try {
      cachedBaseline = getBaseline();
    } catch (error) {
      // Fallback to minimal baseline if loading fails
      console.warn(
        `LexSona: Could not load baseline.yaml: ${error instanceof Error ? error.message : error}`
      );
      cachedBaseline = {
        version: 1,
        principles: [
          { id: "transparency", description: "Be clear about what you're doing and why" },
          { id: "determinism", description: "Same inputs should produce same outputs" },
          { id: "auditability", description: "All decisions should be traceable" },
        ],
        constraints: [],
        source: "fallback",
      };
    }
  }
  return cachedBaseline;
}

/**
 * Configuration for LexSona connection
 */
export interface LegacyLexSonaConfig {
  /**
   * Explicit path to a legacy Lex SQLite database.
   *
   * @deprecated Use ScopedLexSonaConfig. Environment, cwd, and home discovery
   * are retained only by trusted CLI/bootstrap adapters.
   */
  lexDb?: string;
  /**
   * Persona selected through legacy filesystem/database discovery.
   *
   * @deprecated Use ScopedLexSonaConfig.personaRef.
   */
  persona?: string;
  /** Domain/namespace for rule scoping */
  domain?: string;
}

export type LexSonaConfig = LegacyLexSonaConfig | ScopedLexSonaConfig;

/**
 * Result of learning a correction
 */
export interface LearnResult {
  /** The created or updated rule */
  rule: import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence;
  /** Whether this was a new rule (true) or update to existing (false) */
  isNew: boolean;
  /** Previous observation count (for updates) */
  previousObservationCount?: number;
  /** Previous confidence (for updates) */
  previousConfidence?: number;
}

/** Optional identity and authority bindings for a canonical v1 snapshot. */
export interface DeriveConstraintSnapshotOptions {
  bindings?: SnapshotBindingsV1;
  authorityCeiling?: ConstraintSnapshotAuthorityCeilingV1;
  engineVersion?: string;
  canonicalTimestamp?: string;
  provenanceRef?: string;
}

export const SCOPED_CONSTRAINT_RECEIPT_V1 = "ScopedConstraintReceipt_v1" as const;
export const SCOPED_CONSTRAINT_RECEIPT_SCHEMA_VERSION = 1 as const;

/** Evidence that one read-only scoped snapshot produced one constraint snapshot. */
export interface ScopedConstraintReceiptV1 {
  readonly contract: typeof SCOPED_CONSTRAINT_RECEIPT_V1;
  readonly schemaVersion: typeof SCOPED_CONSTRAINT_RECEIPT_SCHEMA_VERSION;
  readonly mode: "read-only";
  readonly binding: {
    readonly schemaVersion: number;
    readonly scopeSchemaVersion: number;
    readonly grantId: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly principalId: string;
    readonly repositoryId: string;
    readonly repositoryInstanceId: string;
    readonly capabilities: readonly string[];
    readonly authorityVersion: string;
    readonly scopeVersion: string;
    readonly authorityDigest: string;
    readonly verifiedAt: string;
    readonly expiresAt?: string;
    readonly digest: string;
  };
  readonly requestedPersona: {
    readonly personaId: string;
    readonly revision?: string;
  };
  readonly selectedPersona: {
    readonly personaId: string;
    readonly revision: string;
    readonly contentDigest: string;
  };
  readonly manifestPersona: {
    readonly id: string;
    readonly version: string;
    readonly contentDigest: string;
  };
  readonly behavioralSnapshot: {
    readonly schemaVersion: number;
    readonly snapshotRevision: string;
    readonly contentDigest: string;
  };
  readonly constraintSnapshot: ConstraintSnapshotV1;
  readonly digest: string;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

/**
 * LexSona Runtime Engine
 *
 * Provides the public API for:
 * - Persona activation
 * - Constraint derivation
 * - Behavioral learning
 *
 * This is a constraint engine, NOT an orchestrator.
 * It returns constraints for consumers to apply.
 */
export class LexSona {
  private readonly _config:
    | Readonly<LegacyLexSonaConfig>
    | Readonly<Pick<ScopedLexSonaConfig, "personaRef" | "mode" | "domain">>;
  private activePersona: string | null = null;
  private storageClient: LexStorageClient | null = null;
  private scopedConnection: ScopedBehavioralConnection | null = null;
  private closePromise: Promise<void> | null = null;
  private ruleVersion: number = 0;

  private constructor(config: LexSonaConfig) {
    this._config = isScopedLexSonaConfig(config)
      ? Object.freeze({
          personaRef: Object.freeze({ ...config.personaRef }),
          mode: config.mode,
          ...(config.domain !== undefined ? { domain: config.domain } : {}),
        })
      : Object.freeze({ ...config });
    this.activePersona = isScopedLexSonaConfig(config)
      ? config.personaRef.personaId
      : (config.persona ?? null);
  }

  /**
   * Connect to LexSona with the given configuration
   */
  static async connect(config: LexSonaConfig = {}): Promise<LexSona> {
    const instance = new LexSona(config);

    if (isScopedLexSonaConfig(config)) {
      instance.scopedConnection = await openScopedBehavioralConnection(config);
      return instance;
    }

    // The library never discovers storage from environment, cwd, or home.
    // Legacy callers must supply an explicit path; trusted CLI/bootstrap code
    // may still perform visible compatibility discovery before this boundary.
    if (config.lexDb) {
      const connectionConfig: LexConnectionConfig = { dbPath: config.lexDb };
      try {
        instance.storageClient = LexStorageClient.connect(connectionConfig);
        instance.loadRuleVersion();
      } catch (error) {
        // Preserve the bounded legacy disconnected behavior during migration.
        console.warn(
          `LexSona: Could not connect to explicit legacy database: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    return instance;
  }

  /**
   * Check if connected to Lex storage
   */
  isConnected(): boolean {
    return this.scopedConnection !== null || (this.storageClient?.isConnected() ?? false);
  }

  /**
   * Activate a named persona
   *
   * @param personaId - Persona identifier (behavioral naming, e.g., 'quality-first_engineering')
   */
  async activate(personaId: string): Promise<void> {
    if (this.scopedConnection && personaId !== this.scopedConnection.personaRef.personaId) {
      throw new Error(
        "Scoped LexSona persona selection is immutable; create a separately bound instance for another persona"
      );
    }
    this.activePersona = personaId;
  }

  private async loadBehavior(context: DeriveContext): Promise<{
    persona: Persona | null;
    rules: BehaviorRuleWithConfidence[];
    hasLexConnection: boolean;
    provenanceRef?: string;
  }> {
    if (this.scopedConnection) {
      const scoped = await readScopedBehavioralSnapshot(this.scopedConnection, context);
      return {
        persona: scoped.persona,
        rules: [...scoped.rules],
        hasLexConnection: true,
        provenanceRef: scoped.snapshot.snapshotRevision,
      };
    }

    const hasLexConnection = this.storageClient?.isConnected() ?? false;
    let persona: Persona | null = null;
    if (this.activePersona) {
      try {
        persona = await loadPersona(this.activePersona);
      } catch (error) {
        console.warn(
          `LexSona: Could not load legacy persona "${this.activePersona}": ${error instanceof Error ? error.message : error}`
        );
      }
    }

    let rules: BehaviorRuleWithConfidence[] = [];
    if (hasLexConnection) {
      const db = this.storageClient!.getDatabase();
      rules = getRules(db, this.createRuleContext(context));
    }

    return { persona, rules, hasLexConnection };
  }

  /**
   * Derive constraints for the current context
   *
   * Combines:
   * - Lex baseline constraints
   * - Active persona rules
   * - Learned behavioral rules from Lex store
   *
   * @returns Deterministic constraint set
   */
  async deriveConstraints(context: DeriveContext): Promise<ConstraintSet> {
    const { persona, rules, hasLexConnection } = await this.loadBehavior(context);

    // If no persona loaded, return empty constraint set with baseline
    // InputHash is empty since there are no inputs to hash
    if (!persona) {
      const baseline = getBaselineData();
      return {
        personaId: this.activePersona ?? "none",
        derivedAt: new Date().toISOString(),
        inputHash: "", // No persona/rules to hash
        context,
        constraints: baseline.constraints,
        principles: baseline.principles,
        ruleVersion: this.ruleVersion,
        metadata: {
          rulesConsidered: 0,
          rulesFiltered: 0,
          confidenceThreshold: 0.3,
          offlineMode: !hasLexConnection,
          confidenceCeiling: undefined,
        },
      };
    }

    // Load baseline from bundled YAML
    const baseline = getBaselineData();
    const principles: Principle[] = baseline.principles;

    // Call pure derivation function
    const result = deriveConstraintsPure(persona, rules, principles, context, {
      hasLexConnection,
    });

    // Merge baseline constraints with derived constraints
    // Baseline constraints have source: "baseline" and are always included
    result.constraints = [...baseline.constraints, ...result.constraints];

    // Add rule version to result
    result.ruleVersion = this.ruleVersion;

    return result;
  }

  /**
   * Derive a byte-stable ConstraintSnapshot_v1.
   *
   * Unlike the compatibility ConstraintSet, this contract excludes runtime
   * observation time from identity unless the caller supplies a canonical
   * timestamp. Scope requests in the snapshot never grant authority.
   */
  async deriveConstraintSnapshot(
    context: DeriveContext,
    options: DeriveConstraintSnapshotOptions = {}
  ): Promise<ConstraintSnapshotV1> {
    if (!this.activePersona) {
      throw new Error("ConstraintSnapshot_v1 requires an active persona");
    }

    const behavior = await this.loadBehavior(context);
    if (!behavior.persona) {
      throw new Error(`Persona not found: ${this.activePersona}`);
    }
    const { persona, rules, hasLexConnection, provenanceRef } = behavior;

    const baseline = getBaselineData();
    const constraintSet = deriveConstraintsPure(persona, rules, baseline.principles, context, {
      hasLexConnection,
    });
    constraintSet.constraints = [...baseline.constraints, ...constraintSet.constraints];
    constraintSet.ruleVersion = this.ruleVersion;

    return createConstraintSnapshotV1({
      constraintSet,
      persona,
      rules,
      baseline,
      ...options,
      provenanceRef: options.provenanceRef ?? provenanceRef,
    });
  }

  /**
   * Derive an evidence-bound receipt from one exact scoped read-only snapshot.
   *
   * This surface intentionally accepts no provider, binding, authority,
   * engine, or provenance overrides. Those identities are derived from the
   * already-bound connection and the Lex-owned behavioral snapshot.
   */
  async deriveScopedConstraintReceipt(context: DeriveContext): Promise<ScopedConstraintReceiptV1> {
    const connection = this.scopedConnection;
    if (!connection || connection.mode !== "read-only") {
      throw new Error(
        'deriveScopedConstraintReceipt() requires a scoped LexSona connection in mode "read-only"'
      );
    }

    const pinnedContext: DeriveContext = Object.freeze({
      ...context,
      ...(context.context_tags !== undefined
        ? { context_tags: [...new Set(context.context_tags)].sort() }
        : {}),
      ...(context.runtime_capabilities !== undefined
        ? { runtime_capabilities: [...new Set(context.runtime_capabilities)].sort() }
        : {}),
      ...(context.files !== undefined ? { files: [...new Set(context.files)].sort() } : {}),
    });
    const binding = getScopedBehavioralBindingReceipt(connection);
    if (binding.capabilities.length !== 1 || binding.capabilities[0] !== "behavior:read") {
      throw new Error(
        'deriveScopedConstraintReceipt() requires exact capability set ["behavior:read"]'
      );
    }
    const behavior = await readScopedBehavioralSnapshot(connection, pinnedContext);
    const baseline = getBaselineData();
    const constraintSet = deriveConstraintsPure(
      behavior.persona,
      [...behavior.rules],
      baseline.principles,
      pinnedContext,
      { hasLexConnection: true }
    );
    constraintSet.constraints = [...baseline.constraints, ...constraintSet.constraints];
    constraintSet.ruleVersion = this.ruleVersion;
    const constraintSnapshot = deepFreeze(
      createConstraintSnapshotV1({
        constraintSet,
        persona: behavior.persona,
        rules: [...behavior.rules],
        baseline,
        provenanceRef: behavior.snapshot.snapshotRevision,
      })
    );

    const payload = Object.freeze({
      contract: SCOPED_CONSTRAINT_RECEIPT_V1,
      schemaVersion: SCOPED_CONSTRAINT_RECEIPT_SCHEMA_VERSION,
      mode: "read-only" as const,
      binding,
      requestedPersona: Object.freeze({ ...connection.personaRef }),
      selectedPersona: Object.freeze({
        personaId: behavior.personaRevision.personaId,
        revision: behavior.personaRevision.revision,
        contentDigest: behavior.personaRevision.contentDigest,
      }),
      manifestPersona: Object.freeze({
        id: behavior.personaRevision.manifestId,
        version: behavior.personaRevision.manifestVersion,
        contentDigest: behavior.personaRevision.manifestDigest,
      }),
      behavioralSnapshot: Object.freeze({
        schemaVersion: behavior.snapshot.schemaVersion,
        snapshotRevision: behavior.snapshot.snapshotRevision,
        contentDigest: behavior.snapshot.contentDigest,
      }),
      constraintSnapshot,
    });
    return Object.freeze({
      ...payload,
      digest: digestConstraintSnapshotValue(payload),
    });
  }

  /**
   * Learn from a behavioral correction
   *
   * Records the correction to Lex's behavioral rules store
   * for future constraint derivation.
   *
   * @returns The created/updated rule and metadata about the operation
   */
  async learn(correction: CorrectionInput): Promise<LearnResult> {
    if (this.scopedConnection) {
      throw new Error(
        "learn() is a legacy mutable-row API and cannot invent revisions or idempotency keys for a scoped store; use putRuleRevision() and recordEvidence()"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    const db = this.storageClient.getDatabase();

    // Check if a matching rule already exists
    const existingRule = this.storageClient.findRuleByContext(
      correction.context.module_id,
      correction.correction
    );

    // Convert CorrectionInput to Lex's Correction type
    const lexCorrection: Correction = {
      context: {
        module_id: correction.context.module_id,
        task_type: correction.context.task_type,
        environment: correction.context.environment,
        project: correction.context.project,
        agent_family: correction.context.agent_family,
        context_tags: correction.context.context_tags,
      },
      correction: correction.correction,
      category: correction.category,
      severity: correction.severity,
      polarity: correction.polarity,
    };

    const rule = recordCorrection(db, lexCorrection);

    if (existingRule) {
      return {
        rule,
        isNew: false,
        previousObservationCount: existingRule.observation_count,
        previousConfidence: existingRule.effective_confidence,
      };
    }

    return {
      rule,
      isNew: true,
    };
  }

  /** Write an immutable persona revision through the Lex-owned scoped service. */
  async putPersonaRevision(
    input: BehavioralRevisionWriteV1<PersonaRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1> {
    if (!this.scopedConnection) {
      throw new Error("putPersonaRevision() requires a scoped LexSona connection");
    }
    return await putScopedPersonaRevision(this.scopedConnection, input);
  }

  /** Write an immutable rule revision through the Lex-owned scoped service. */
  async putRuleRevision(
    input: BehavioralRevisionWriteV1<RuleRevisionInputV1>
  ): Promise<BehavioralWriteReceiptV1> {
    if (!this.scopedConnection) {
      throw new Error("putRuleRevision() requires a scoped LexSona connection");
    }
    return await putScopedRuleRevision(this.scopedConnection, input);
  }

  /** Record explicit, idempotent learning evidence through the scoped service. */
  async recordEvidence(input: BehavioralEvidenceInputV1): Promise<BehavioralWriteReceiptV1> {
    if (!this.scopedConnection) {
      throw new Error("recordEvidence() requires a scoped LexSona connection");
    }
    return await recordScopedEvidence(this.scopedConnection, input);
  }

  /** Promote a rule revision through the separately authorized promotion capability. */
  async promoteRuleRevision(input: BehavioralPromotionInputV1): Promise<BehavioralWriteReceiptV1> {
    if (!this.scopedConnection) {
      throw new Error("promoteRuleRevision() requires a scoped LexSona connection");
    }
    return await promoteScopedRule(this.scopedConnection, input);
  }

  /**
   * Teach a "core" rule that is immediately active
   *
   * Unlike `learn()` which starts with observation_count=1,
   * `teach()` creates the rule with observation_count=minN (default 3)
   * so it's immediately visible in getRules().
   *
   * @param correction - The correction to teach as a core rule
   * @returns The created rule with confidence scores
   */
  async teach(
    correction: CorrectionInput
  ): Promise<import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence> {
    if (this.scopedConnection) {
      throw new Error(
        "teach() is a legacy mutable-row API; use putRuleRevision() and promoteRuleRevision() with explicit revisions and idempotency keys"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    const db = this.storageClient.getDatabase();

    // First create the rule via normal learn path
    const lexCorrection: Correction = {
      context: {
        module_id: correction.context.module_id,
        task_type: correction.context.task_type,
        environment: correction.context.environment,
        project: correction.context.project,
        agent_family: correction.context.agent_family,
        context_tags: correction.context.context_tags,
      },
      correction: correction.correction,
      category: correction.category,
      severity: correction.severity,
      polarity: correction.polarity ?? 1, // Default to reinforcement
    };

    const createdRule = recordCorrection(db, lexCorrection);

    // Now promote it to core status
    const promoted = this.storageClient.promoteRule(createdRule.rule_id);
    return promoted ?? createdRule;
  }

  /**
   * Promote an existing rule to "core" status
   *
   * Core rules have observation_count >= minN and are immediately
   * visible in getRules() without the minN threshold filtering.
   *
   * @param ruleId - Rule ID to promote
   * @returns Updated rule or null if not found
   */
  async promoteRule(
    ruleId: string
  ): Promise<import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence | null> {
    if (this.scopedConnection) {
      throw new Error(
        "promoteRule() is a legacy mutable-row API; use promoteRuleRevision() with an explicit revision and idempotency key"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    return this.storageClient.promoteRule(ruleId);
  }

  /**
   * Get a behavior rule by ID
   *
   * @param ruleId - Rule identifier
   * @returns Rule or null if not found
   */
  async getRuleById(
    ruleId: string
  ): Promise<import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence | null> {
    if (this.scopedConnection) {
      const rule = await getScopedRuleRevision(this.scopedConnection, ruleId);
      return rule ? behaviorRuleFromRevision(rule) : null;
    }
    if (!this.storageClient?.isConnected()) {
      return null;
    }

    return this.storageClient.getBehaviorRuleById(ruleId);
  }

  /**
   * Forget (delete) a behavior rule by ID
   *
   * @param ruleId - Rule identifier to delete
   * @returns true if deleted, false if not found
   */
  async forgetRule(ruleId: string): Promise<boolean> {
    if (this.scopedConnection) {
      throw new Error(
        "Scoped behavioral revisions are immutable; deletion requires a separate Lex lifecycle contract"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    return this.storageClient.deleteRule(ruleId);
  }

  /**
   * Get the currently active persona ID
   */
  getActivePersona(): string | null {
    return this.activePersona;
  }

  /**
   * Get the current configuration
   */
  getConfig():
    | Readonly<LegacyLexSonaConfig>
    | Readonly<Pick<ScopedLexSonaConfig, "personaRef" | "mode" | "domain">> {
    return this._config;
  }

  /**
   * Create a RuleContext from a DeriveContext
   * Helper to reduce code duplication
   */
  private createRuleContext(context: DeriveContext): RuleContext {
    return {
      module_id: context.module_id,
      task_type: context.taskType,
      environment: context.environment,
      project: context.domain,
      agent_family: context.agent_family,
      context_tags: context.context_tags,
    };
  }

  /**
   * Get rules from Lex storage with optional filtering
   */
  async getRules(filter?: {
    domain?: string;
    minConfidence?: number;
    /** Set to 1 to include all rules regardless of observation count */
    minN?: number;
  }): Promise<import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence[]> {
    if (this.scopedConnection) {
      const scoped = await readScopedBehavioralSnapshot(this.scopedConnection, {});
      return scoped.rules.filter(
        (rule) =>
          rule.observation_count >= (filter?.minN ?? 0) &&
          rule.effective_confidence >= (filter?.minConfidence ?? 0)
      );
    }
    if (!this.storageClient?.isConnected()) {
      return [];
    }

    const db = this.storageClient.getDatabase();
    const context: RuleContext = {
      project: filter?.domain,
    };

    const rules = getRules(db, context, {
      minN: filter?.minN,
      minConfidence: filter?.minConfidence ?? 0, // Default to 0 to not filter by confidence in query
    });

    // Apply confidence filter post-query if specified
    if (filter?.minConfidence !== undefined && filter.minConfidence > 0) {
      return rules.filter((r) => r.effective_confidence >= filter.minConfidence!);
    }

    return rules;
  }

  /**
   * Record a trust gap event (ADR-007)
   *
   * When agent claims don't match engine verification:
   * - Applies confidence decay to related rules
   * - Tracks the gap for agent trust profile
   * - Generates learned rules from patterns
   *
   * @param event - Trust gap event from LexRunner
   */
  async recordTrustGap(event: TrustGapEvent): Promise<void> {
    if (this.scopedConnection) {
      throw new Error(
        "recordTrustGap() cannot infer scoped rule revision or idempotency; use recordEvidence()"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    const db = this.storageClient.getDatabase();
    recordTrustGapInternal(db, event);
  }

  /**
   * Get trust profile for an agent family (ADR-007)
   *
   * Returns aggregated statistics about trust gaps
   * for a specific agent family.
   *
   * @param agentFamily - Agent family identifier
   * @returns Trust profile with gap rate and common failure types
   */
  async getAgentTrustProfile(agentFamily: string): Promise<AgentTrustProfile> {
    if (this.scopedConnection) {
      throw new Error(
        "Agent trust aggregation is not part of the scoped behavioral-store read contract"
      );
    }
    if (!this.storageClient?.isConnected()) {
      throw createLexNotConnectedError();
    }

    const db = this.storageClient.getDatabase();
    return getAgentTrustProfileInternal(db, agentFamily);
  }

  /**
   * Derive constraints with trust calibration (ADR-007)
   *
   * Like deriveConstraints, but adjusts confidence levels
   * based on the agent's trust profile.
   *
   * @param context - Derivation context including agent_family
   * @returns Constraint set with trust-adjusted confidences
   */
  async deriveWithTrustCalibration(
    context: DeriveContext & { agent_family: string }
  ): Promise<ConstraintSet> {
    if (this.scopedConnection) {
      throw new Error(
        "Trust calibration requires an explicit scoped aggregation contract; ordinary scoped derivation remains available"
      );
    }
    // Get base constraint set
    const baseConstraints = await this.deriveConstraints(context);

    // If not connected, can't get trust profile, so return base
    if (!this.storageClient?.isConnected()) {
      return baseConstraints;
    }

    // Get agent trust profile
    const trustProfile = await this.getAgentTrustProfile(context.agent_family);

    // Get the rules that were used
    const db = this.storageClient.getDatabase();
    const ruleContext = this.createRuleContext(context);
    const rules = getRules(db, ruleContext);

    // Apply trust calibration
    const calibratedRules = applyTrustCalibration(rules, trustProfile);

    // Re-derive constraints with calibrated rules
    let persona: Persona | null = null;
    if (this.activePersona) {
      try {
        persona = await loadPersona(this.activePersona);
      } catch (error) {
        console.warn(
          `LexSona: Could not load persona "${this.activePersona}": ${error instanceof Error ? error.message : error}`
        );
      }
    }

    if (!persona) {
      return baseConstraints; // Return base if no persona
    }

    const baseline = getBaselineData();
    const principles: Principle[] = baseline.principles;

    const result = deriveConstraintsPure(persona, calibratedRules, principles, context, {
      hasLexConnection: true,
    });

    // Merge baseline constraints with derived constraints
    result.constraints = [...baseline.constraints, ...result.constraints];

    // Add rule version to result
    result.ruleVersion = this.ruleVersion;

    return result;
  }

  /**
   * Get the current rule version
   *
   * @returns Current rule version number
   */
  getRuleVersion(): number {
    return this.ruleVersion;
  }

  /**
   * Increment the rule version (called when rules change)
   * Persists the new version to the database
   *
   * @returns New version number
   */
  async incrementRuleVersion(): Promise<number> {
    if (this.scopedConnection) {
      throw new Error(
        "Scoped rule revisions are owned by Lex and cannot be incremented by LexSona"
      );
    }
    this.ruleVersion++;
    await this.persistRuleVersion();
    return this.ruleVersion;
  }

  /**
   * Ensure metadata table exists
   * Called before any metadata operations
   */
  private ensureMetadataTable(): void {
    if (!this.storageClient?.isConnected()) {
      return;
    }

    const db = this.storageClient.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS lexsona_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Load rule version from database
   * Called during initialization
   */
  private loadRuleVersion(): void {
    if (!this.storageClient?.isConnected()) {
      return;
    }

    try {
      this.ensureMetadataTable();

      const db = this.storageClient.getDatabase();
      const result = db
        .prepare(`SELECT value FROM lexsona_metadata WHERE key = 'rule_version' LIMIT 1`)
        .get() as { value: string } | undefined;

      if (result) {
        const parsed = parseInt(result.value, 10);
        // Validate parsed value is a valid positive integer
        if (!isNaN(parsed) && parsed >= 0) {
          this.ruleVersion = parsed;
        }
      }
    } catch {
      // If table creation or query fails, version stays at 0
      // This is fine for new databases
    }
  }

  /**
   * Persist rule version to database
   * Uses INSERT OR REPLACE for atomic updates
   */
  private async persistRuleVersion(): Promise<void> {
    if (!this.storageClient?.isConnected()) {
      return;
    }

    try {
      this.ensureMetadataTable();

      const db = this.storageClient.getDatabase();
      db.prepare(
        `INSERT OR REPLACE INTO lexsona_metadata (key, value, updated_at)
         VALUES ('rule_version', ?, datetime('now'))`
      ).run(this.ruleVersion.toString());
    } catch (error) {
      // Log error but don't throw - version tracking is non-critical
      console.warn(
        `LexSona: Could not persist rule version: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Close the connection.
   *
   * This retains the legacy synchronous public signature. Scoped consumers
   * should use closeAsync() when they need to await store teardown.
   */
  close(): void {
    void this.beginClose().catch((error: unknown) => {
      console.warn(
        `LexSona: Scoped close failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }

  /** Close the connection and await scoped store teardown. */
  closeAsync(): Promise<void> {
    return this.beginClose();
  }

  private beginClose(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }

    this.storageClient?.close();
    this.storageClient = null;
    const connection = this.scopedConnection;
    this.scopedConnection = null;
    this.closePromise = connection
      ? closeScopedBehavioralConnection(connection)
      : Promise.resolve();
    return this.closePromise;
  }
}

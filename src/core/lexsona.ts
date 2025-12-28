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
export interface LexSonaConfig {
  /** Path to Lex database (uses default if not provided) */
  lexDb?: string;
  /** Active persona ID (behavioral naming, e.g., 'quality-first_engineering') */
  persona?: string;
  /** Domain/namespace for rule scoping */
  domain?: string;
}

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
  private _config: LexSonaConfig;
  private activePersona: string | null = null;
  private storageClient: LexStorageClient | null = null;
  private ruleVersion: number = 0;

  private constructor(config: LexSonaConfig) {
    this._config = config;
    this.activePersona = config.persona ?? null;
  }

  /**
   * Connect to LexSona with the given configuration
   */
  static async connect(config: LexSonaConfig = {}): Promise<LexSona> {
    const instance = new LexSona(config);

    // Initialize Lex connection
    const connectionConfig: LexConnectionConfig = {};
    if (config.lexDb) {
      connectionConfig.dbPath = config.lexDb;
    }

    try {
      instance.storageClient = LexStorageClient.connect(connectionConfig);
      // Load persisted rule version
      instance.loadRuleVersion();
    } catch (error) {
      // Log warning but allow LexSona to work in disconnected mode
      console.warn(
        `LexSona: Could not connect to Lex database: ${error instanceof Error ? error.message : error}`
      );
    }

    return instance;
  }

  /**
   * Check if connected to Lex storage
   */
  isConnected(): boolean {
    return this.storageClient?.isConnected() ?? false;
  }

  /**
   * Activate a named persona
   *
   * @param personaId - Persona identifier (behavioral naming, e.g., 'quality-first_engineering')
   */
  async activate(personaId: string): Promise<void> {
    // TODO: Load persona manifest
    // TODO: Validate persona exists
    // TODO: Set as active
    this.activePersona = personaId;
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
    // Determine connection state
    const hasLexConnection = this.storageClient?.isConnected() ?? false;

    // Load persona (if active)
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

    // Load learned rules from Lex store if connected
    let rules: BehaviorRuleWithConfidence[] = [];
    if (hasLexConnection) {
      const db = this.storageClient!.getDatabase();
      const ruleContext = this.createRuleContext(context);
      rules = getRules(db, ruleContext);
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
   * Learn from a behavioral correction
   *
   * Records the correction to Lex's behavioral rules store
   * for future constraint derivation.
   *
   * @returns The created/updated rule and metadata about the operation
   */
  async learn(correction: CorrectionInput): Promise<LearnResult> {
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
  getConfig(): LexSonaConfig {
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
   * Close the connection
   */
  close(): void {
    this.storageClient?.close();
    this.storageClient = null;
  }
}

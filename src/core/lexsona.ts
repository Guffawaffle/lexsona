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
import type { CorrectionInput, BehaviorRuleWithConfidence } from "../rules/types.js";
import { LexStorageClient, type LexConnectionConfig } from "./lexConnection.js";
import { loadPersona } from "../persona/loader.js";
import type { Persona } from "../persona/types.js";

// Import Lex APIs through the lexsona subpath
import { getRules, recordCorrection } from "@smartergpt/lex/lexsona";
import type { RuleContext, Correction } from "@smartergpt/lex/lexsona";

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

    // If no persona loaded, return empty constraint set
    if (!persona) {
      return {
        personaId: this.activePersona ?? "none",
        derivedAt: new Date().toISOString(),
        inputHash: "",
        context,
        constraints: [],
        principles: [],
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
      const ruleContext: RuleContext = {
        module_id: context.module_id,
        task_type: context.taskType,
        environment: context.environment,
        agent_family: context.agent_family,
        context_tags: context.context_tags,
      };

      rules = getRules(db, ruleContext);
    }

    // Load baseline principles (TODO: wire to Lex baseline.yaml when available)
    const principles: Principle[] = [];

    // Call pure derivation function
    return deriveConstraintsPure(persona, rules, principles, context, {
      hasLexConnection,
    });
  }

  /**
   * Learn from a behavioral correction
   *
   * Records the correction to Lex's behavioral rules store
   * for future constraint derivation.
   */
  async learn(correction: CorrectionInput): Promise<void> {
    if (!this.storageClient?.isConnected()) {
      throw new Error("LexSona: Not connected to Lex database. Cannot record correction.");
    }

    const db = this.storageClient.getDatabase();

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

    recordCorrection(db, lexCorrection);
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
   * Get rules from Lex storage with optional filtering
   */
  async getRules(filter?: {
    domain?: string;
    minConfidence?: number;
  }): Promise<import("@smartergpt/lex/lexsona").BehaviorRuleWithConfidence[]> {
    if (!this.storageClient?.isConnected()) {
      return [];
    }

    const db = this.storageClient.getDatabase();
    const context: RuleContext = {
      module_id: filter?.domain,
    };

    const rules = getRules(db, context);

    // Apply confidence filter
    if (filter?.minConfidence !== undefined) {
      return rules.filter((r) => r.effective_confidence >= filter.minConfidence!);
    }

    return rules;
  }

  /**
   * Close the connection
   */
  close(): void {
    this.storageClient?.close();
    this.storageClient = null;
  }
}

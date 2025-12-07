/**
 * Mock Lex Client for LexSona Tests
 *
 * Provides isolated testing without requiring a real Lex database.
 * Mocks the storage socket APIs that LexSona consumes.
 *
 * @module
 */

import type { BehaviorRule, RuleScope, RuleSeverity } from "../../src/rules/types.js";

/**
 * Correction record for mock tracking
 */
export interface MockCorrection {
  correction: string;
  polarity: number;
  context: RuleScope;
  recordedAt: Date;
}

/**
 * Options for creating a mock Lex client
 */
export interface MockLexClientOptions {
  /** Pre-loaded rules for getRules() */
  rules?: BehaviorRule[];
  /** Whether recordCorrection should succeed */
  recordSuccess?: boolean;
  /** Simulate database connection failure */
  connectionFailed?: boolean;
}

/**
 * Mock implementation of Lex storage APIs
 *
 * This mock provides:
 * - In-memory rule storage
 * - Correction recording with tracking
 * - Configurable failure modes for testing error paths
 */
export class MockLexClient {
  private rules: BehaviorRule[];
  private corrections: MockCorrection[] = [];
  private recordSuccess: boolean;
  private connectionFailed: boolean;

  constructor(options: MockLexClientOptions = {}) {
    this.rules = options.rules ?? [];
    this.recordSuccess = options.recordSuccess ?? true;
    this.connectionFailed = options.connectionFailed ?? false;
  }

  /**
   * Check if connection is available
   */
  isConnected(): boolean {
    return !this.connectionFailed;
  }

  /**
   * Mock getRules - returns pre-configured rules filtered by scope
   */
  async getRules(filter?: Partial<RuleScope>): Promise<BehaviorRule[]> {
    if (this.connectionFailed) {
      throw new Error("Mock: Database connection failed");
    }

    if (!filter) {
      return [...this.rules];
    }

    return this.rules.filter((rule) => {
      // Filter by module_id if specified
      if (filter.module_id && rule.scope.module_id !== filter.module_id) {
        return false;
      }
      // Filter by task_type if specified
      if (filter.task_type && rule.scope.task_type !== filter.task_type) {
        return false;
      }
      // Filter by project if specified
      if (filter.project && rule.scope.project !== filter.project) {
        return false;
      }
      return true;
    });
  }

  /**
   * Mock recordCorrection - stores correction in memory
   */
  async recordCorrection(correction: {
    correction: string;
    polarity: number;
    context: RuleScope;
  }): Promise<{ success: boolean }> {
    if (this.connectionFailed) {
      throw new Error("Mock: Database connection failed");
    }

    if (!this.recordSuccess) {
      return { success: false };
    }

    this.corrections.push({
      ...correction,
      recordedAt: new Date(),
    });

    return { success: true };
  }

  // Test helpers

  /**
   * Get all recorded corrections (for test assertions)
   */
  getRecordedCorrections(): MockCorrection[] {
    return [...this.corrections];
  }

  /**
   * Add a rule (for test setup)
   */
  addRule(rule: BehaviorRule): void {
    this.rules.push(rule);
  }

  /**
   * Clear all state (for test cleanup)
   */
  reset(): void {
    this.rules = [];
    this.corrections = [];
  }

  /**
   * Set connection failure mode (for error testing)
   */
  setConnectionFailed(failed: boolean): void {
    this.connectionFailed = failed;
  }
}

/**
 * Factory function to create a mock Lex client
 */
export function createMockLexClient(options?: MockLexClientOptions): MockLexClient {
  return new MockLexClient(options);
}

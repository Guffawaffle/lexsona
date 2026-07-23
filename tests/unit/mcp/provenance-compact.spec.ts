/**
 * Compact Provenance Mode Tests (AX-010)
 *
 * Tests lightweight provenance format for token-constrained agents.
 */

import { describe, it, expect } from "vitest";
import {
  formatProvenance,
  formatConstraint,
  formatConstraints,
  type ProvenanceMode,
  type CompactProvenance,
} from "../../../src/mcp/formatters.js";
import type { Constraint, ConstraintProvenance } from "../../../src/constraints/derive.js";

describe("formatProvenance (AX-010)", () => {
  it("returns undefined for undefined provenance", () => {
    const result = formatProvenance(undefined, "full");
    expect(result).toBeUndefined();
  });

  it("returns full provenance when mode is full", () => {
    const provenance: ConstraintProvenance = {
      source: "learned",
      rule_id: "rule_123",
      confidence: 0.85,
    };

    const result = formatProvenance(provenance, "full");
    expect(result).toEqual(provenance);
  });

  it("converts persona source to 'p' in compact mode", () => {
    const provenance: ConstraintProvenance = {
      source: "persona",
      rule_id: null,
      confidence: 0.95,
    };

    const result = formatProvenance(provenance, "compact");
    expect(result).toEqual({
      src: "p",
      w: 0.95,
    });
  });

  it("converts learned source to 'r' with rId in compact mode", () => {
    const provenance: ConstraintProvenance = {
      source: "learned",
      rule_id: "rule_abc123",
      confidence: 0.7823,
    };

    const result = formatProvenance(provenance, "compact");
    expect(result).toEqual({
      src: "r",
      w: 0.78, // Rounded to 2 decimals
      rId: "rule_abc123",
    });
  });

  it("converts baseline source to 'b' in compact mode", () => {
    const provenance: ConstraintProvenance = {
      source: "baseline",
      rule_id: null,
      confidence: 1.0,
    };

    const result = formatProvenance(provenance, "compact");
    expect(result).toEqual({
      src: "b",
      w: 1.0,
    });
  });

  it("rounds confidence to 2 decimal places", () => {
    const provenance: ConstraintProvenance = {
      source: "learned",
      rule_id: "test",
      confidence: 0.6789123,
    };

    const result = formatProvenance(provenance, "compact");
    expect((result as CompactProvenance).w).toBe(0.68);
  });

  it("handles exact 2 decimal confidence values", () => {
    const provenance: ConstraintProvenance = {
      source: "learned",
      rule_id: "test",
      confidence: 0.75,
    };

    const result = formatProvenance(provenance, "compact");
    expect((result as CompactProvenance).w).toBe(0.75);
  });

  it("omits rId when source is persona", () => {
    const provenance: ConstraintProvenance = {
      source: "persona",
      rule_id: null,
      confidence: 0.9,
    };

    const result = formatProvenance(provenance, "compact");
    expect(result).not.toHaveProperty("rId");
  });

  it("omits rId when source is baseline", () => {
    const provenance: ConstraintProvenance = {
      source: "baseline",
      rule_id: null,
      confidence: 1.0,
    };

    const result = formatProvenance(provenance, "compact");
    expect(result).not.toHaveProperty("rId");
  });
});

describe("formatConstraint with provenance mode (AX-010)", () => {
  it("includes compact provenance in compact format", () => {
    const constraint: Constraint = {
      rule_id: "rule_123",
      text: "Always validate inputs",
      severity: "must",
      confidence: 0.85,
      category: "validation",
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: "rule_123",
        confidence: 0.85,
      },
    };

    const result = formatConstraint(constraint, "compact", "compact");
    expect(result).toHaveProperty("prov");
    expect((result as any).prov).toEqual({
      src: "r",
      w: 0.85,
      rId: "rule_123",
    });
  });

  it("applies compact provenance to full format when provenance mode is compact", () => {
    const constraint: Constraint = {
      rule_id: "rule_123",
      text: "Always validate inputs",
      severity: "must",
      confidence: 0.85,
      category: "validation",
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: "rule_123",
        confidence: 0.85,
      },
    };

    const result = formatConstraint(constraint, "full", "compact");
    expect(result).toHaveProperty("text", "Always validate inputs");
    expect(result).toHaveProperty("provenance");
    expect((result as any).provenance).toEqual({
      src: "r",
      w: 0.85,
      rId: "rule_123",
    });
  });

  it("includes persona provenance in compact format", () => {
    const constraint: Constraint = {
      rule_id: "persona:duty:1",
      text: "Always review code before merging",
      severity: "must",
      confidence: 1.0,
      category: "persona-duty",
      source: "persona",
      provenance: {
        source: "persona",
        rule_id: null,
        confidence: 1.0,
      },
    };

    const result = formatConstraint(constraint, "compact", "compact");
    expect((result as any).prov).toEqual({
      src: "p",
      w: 1.0,
    });
  });

  it("omits provenance if not present", () => {
    const constraint: Constraint = {
      rule_id: "rule_123",
      text: "Test rule",
      severity: "should",
      confidence: 0.7,
      category: "testing",
    };

    const result = formatConstraint(constraint, "compact");
    expect(result).not.toHaveProperty("prov");
  });

  it("omits provenance unless a provenance mode is explicitly requested", () => {
    const constraint: Constraint = {
      rule_id: "rule_123",
      text: "Test rule",
      severity: "must",
      confidence: 0.8,
      category: "testing",
      provenance: {
        source: "learned",
        rule_id: "rule_123",
        confidence: 0.8,
      },
    };

    const result = formatConstraint(constraint, "compact");
    expect(result).not.toHaveProperty("prov");
  });
});

describe("formatConstraints with provenance mode (AX-010)", () => {
  it("applies provenance mode to all constraints", () => {
    const constraints: Constraint[] = [
      {
        rule_id: "rule_1",
        text: "Rule 1",
        severity: "must",
        confidence: 0.9,
        category: "test",
        provenance: {
          source: "learned",
          rule_id: "rule_1",
          confidence: 0.9,
        },
      },
      {
        rule_id: "rule_2",
        text: "Rule 2",
        severity: "should",
        confidence: 0.8,
        category: "test",
        provenance: {
          source: "persona",
          rule_id: null,
          confidence: 1.0,
        },
      },
    ];

    const result = formatConstraints(constraints, "compact", "compact");

    expect(result).toHaveLength(2);
    expect((result[0] as any).prov.src).toBe("r");
    expect((result[1] as any).prov.src).toBe("p");
  });

  it("preserves full provenance when mode is full", () => {
    const constraints: Constraint[] = [
      {
        rule_id: "rule_1",
        text: "Rule 1",
        severity: "must",
        confidence: 0.9,
        category: "test",
        provenance: {
          source: "learned",
          rule_id: "rule_1",
          confidence: 0.9,
        },
      },
    ];

    const result = formatConstraints(constraints, "full", "full");

    expect(result[0]).toHaveProperty("provenance");
    expect((result[0] as any).provenance.source).toBe("learned");
  });
});

describe("provenance payload reduction (AX-010)", () => {
  it("compact provenance reduces payload size", () => {
    const constraint: Constraint = {
      rule_id: "rule_with_very_long_identifier_12345",
      text: "This is a detailed constraint with lots of text",
      severity: "must",
      confidence: 0.8765432,
      category: "validation",
      source: "learned",
      provenance: {
        source: "learned",
        rule_id: "rule_with_very_long_identifier_12345",
        confidence: 0.8765432,
      },
    };

    const fullResult = formatConstraint(constraint, "full", "full");
    const compactProvResult = formatConstraint(constraint, "full", "compact");

    const fullSize = JSON.stringify((fullResult as any).provenance).length;
    const compactSize = JSON.stringify((compactProvResult as any).provenance).length;

    expect(compactSize).toBeLessThan(fullSize);

    // Calculate reduction
    const reduction = ((fullSize - compactSize) / fullSize) * 100;

    // Should achieve significant reduction (>25%)
    expect(reduction).toBeGreaterThan(25);
  });

  it("compact format with compact provenance achieves maximum reduction", () => {
    const constraints: Constraint[] = [
      {
        rule_id: "rule_long_id_1",
        text: "This is a long constraint text that takes up space",
        severity: "must",
        confidence: 0.8765,
        category: "validation",
        source: "learned",
        provenance: {
          source: "learned",
          rule_id: "rule_long_id_1",
          confidence: 0.8765,
        },
      },
      {
        rule_id: "rule_long_id_2",
        text: "Another long constraint text for testing",
        severity: "should",
        confidence: 0.7234,
        category: "testing",
        source: "learned",
        provenance: {
          source: "learned",
          rule_id: "rule_long_id_2",
          confidence: 0.7234,
        },
      },
    ];

    const fullFull = formatConstraints(constraints, "full", "full");
    const compactCompact = formatConstraints(constraints, "compact", "compact");

    const fullSize = JSON.stringify(fullFull).length;
    const compactSize = JSON.stringify(compactCompact).length;

    expect(compactSize).toBeLessThan(fullSize);

    // Should achieve substantial reduction (>40% with text omission)
    const reduction = ((fullSize - compactSize) / fullSize) * 100;
    expect(reduction).toBeGreaterThan(40);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_DISCOVERY_REMOVAL_TARGET,
  bootstrapLegacyLexSona,
} from "../../../src/cli/legacy-bootstrap.js";
import { createIsolatedTestDb } from "../../utils/db-fixtures.js";

const originalLexDbPath = process.env.LEX_DB_PATH;

afterEach(() => {
  if (originalLexDbPath === undefined) {
    delete process.env.LEX_DB_PATH;
  } else {
    process.env.LEX_DB_PATH = originalLexDbPath;
  }
});

describe("legacy CLI bootstrap", () => {
  it("makes compatibility discovery explicit and observable", () => {
    const testDb = createIsolatedTestDb({ closeAfterSetup: true });
    process.env.LEX_DB_PATH = testDb.path;
    try {
      const result = bootstrapLegacyLexSona({
        persona: "quality-first_engineering",
        domain: "lexsona",
      });

      expect(result.config).toEqual({
        lexDb: testDb.path,
        persona: "quality-first_engineering",
        domain: "lexsona",
      });
      expect(result.discovery).toEqual({
        mode: "legacy-path-discovery",
        dbPath: testDb.path,
        source: "LEX_DB_PATH",
        exists: true,
        removalTarget: LEGACY_DISCOVERY_REMOVAL_TARGET,
      });
    } finally {
      testDb.cleanup();
    }
  });
});

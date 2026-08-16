import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_LEXSONA_ENGINE_VERSION } from "../../src/constraints/snapshot.js";
import { VERSION } from "../../src/index.js";
import { LEXSONA_MCP_SERVER_INFO } from "../../src/mcp/server-info.js";

interface PackageMetadata {
  version: string;
}

const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const cliPath = fileURLToPath(new URL("../../dist/cli/lexsona.js", import.meta.url));
const packageMetadata = JSON.parse(readFileSync(packagePath, "utf8")) as PackageMetadata;

describe("runtime version metadata", () => {
  it("uses the package version for public and protocol metadata", () => {
    expect(VERSION).toBe(packageMetadata.version);
    expect(LEXSONA_MCP_SERVER_INFO.version).toBe(packageMetadata.version);
    expect(DEFAULT_LEXSONA_ENGINE_VERSION).toBe(packageMetadata.version);
  });

  it("prints the package version from the built CLI", () => {
    const output = execFileSync(process.execPath, [cliPath, "--version"], {
      encoding: "utf8",
    });

    expect(output.trim()).toBe(packageMetadata.version);
  });
});

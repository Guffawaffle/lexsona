import { createRequire } from "node:module";

interface PackageMetadata {
  version?: unknown;
}

const packageMetadata = createRequire(import.meta.url)("../package.json") as PackageMetadata;

if (typeof packageMetadata.version !== "string" || packageMetadata.version.length === 0) {
  throw new Error("LexSona package metadata is missing a valid version");
}

/** The version declared by the published package manifest. */
export const VERSION = packageMetadata.version;

import path from "node:path";

export function resolveExpectedPackTarball(repoRoot, packEntry, packageJson) {
  const expectedFilename = `${packageJson.name.replace(/^@/, "").replaceAll("/", "-")}-${packageJson.version}.tgz`;
  if (
    packEntry?.name !== packageJson.name ||
    packEntry?.version !== packageJson.version ||
    packEntry?.filename !== expectedFilename
  ) {
    throw new Error("npm pack returned an unexpected package identity or tarball filename");
  }

  const canonicalRoot = path.resolve(repoRoot);
  const tarballPath = path.resolve(canonicalRoot, packEntry.filename);
  if (path.dirname(tarballPath) !== canonicalRoot) {
    throw new Error("npm pack tarball must be a direct child of the repository root");
  }
  return tarballPath;
}

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
// @ts-expect-error Release tooling is plain ESM outside the package build.
import {
  assertArtifactVerified,
  assertPublishedArtifact,
  assertPublishedIdentity,
  requiredCandidateGates,
} from "../scripts/release-candidate.mjs";

function receipt(published = false) {
  const names = published
    ? [...requiredCandidateGates.slice(0, -1), "npm-published-integrity"]
    : requiredCandidateGates;
  return {
    artifactStatus: "verified",
    acceptanceStatus: "external-required",
    verifiedAt: "2026-09-06T00:00:00.000Z",
    ...(published ? { publicationMode: "published" } : {}),
    source: { commit: "a".repeat(40) },
    package: { version: "2.0.4" },
    artifact: { integrity: "sha512-reviewed" },
    gates: names.map((name: string) => ({
      name,
      status: "passed",
      exitCode: 0,
      commit: "a".repeat(40),
      invocation: { executable: "node", argv: ["verified-command"] },
      output: { stdout: { text: "verified" }, stderr: { text: "" } },
    })),
  };
}

describe("post-publication artifact verification", () => {
  it("preserves valid original dry-run receipts and records a distinct published gate", () => {
    expect(() => assertArtifactVerified(receipt())).not.toThrow();
    expect(() => assertArtifactVerified(receipt(true))).not.toThrow();
  });

  it("does not relabel a dry-run as verified publication or accept an unknown mode", () => {
    expect(() => assertArtifactVerified({ ...receipt(), publicationMode: "published" })).toThrow(
      "exact required"
    );
    expect(() => assertArtifactVerified({ ...receipt(), publicationMode: "skip" })).toThrow(
      "Unknown"
    );
  });

  it("rejects failed integrity verification and missing prior package gates", () => {
    const failed = receipt(true);
    failed.gates.at(-1)!.exitCode = 1;
    expect(() => assertArtifactVerified(failed)).toThrow("incomplete or unsuccessful");
    const missing = receipt(true);
    missing.gates.splice(3, 1);
    expect(() => assertArtifactVerified(missing)).toThrow("exact required");
  });

  it("requires both published version and integrity to match", () => {
    const candidate = receipt(true);
    expect(() =>
      assertPublishedIdentity(candidate, { version: "2.0.4", "dist.integrity": "sha512-reviewed" })
    ).not.toThrow();
    expect(() =>
      assertPublishedIdentity(candidate, { version: "2.0.3", "dist.integrity": "sha512-reviewed" })
    ).toThrow("does not match");
    expect(() =>
      assertPublishedIdentity(candidate, { version: "2.0.4", "dist.integrity": "sha512-changed" })
    ).toThrow("does not match");
    expect(() =>
      assertPublishedArtifact(
        { ...candidate, artifactStatus: "prepared" },
        { version: "2.0.4", "dist.integrity": "sha512-reviewed" }
      )
    ).toThrow("not completed");
  });
});

describe("published release recovery authority", () => {
  const text = fs.readFileSync(".github/workflows/complete-published-release.yml", "utf8");
  const workflow = parse(text);
  it("requires verification before granting release-write authority", () => {
    expect(workflow.jobs.verify.permissions).toEqual({ contents: "read", actions: "read" });
    expect(workflow.jobs.release.needs).toBe("verify");
    expect(workflow.jobs.release.permissions).toEqual({ contents: "write" });
    expect(workflow.jobs.release.steps).toHaveLength(1);
    expect(text).not.toMatch(/npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/);
    expect(text).toContain('test "$ACTUAL_OBJECT" = "$EXPECTED_OBJECT"');
  });
  it("binds the signed source, successful candidate dispatch and exact archive bytes", () => {
    expect(text).toContain('test "$GITHUB_REF" = refs/heads/main');
    expect(text).toContain('git merge-base --is-ancestor "$TARGET" origin/main');
    expect(text).toContain('git verify-tag --raw "$RELEASE_TAG"');
    expect(text).toContain('.path == ".github/workflows/release.yml"');
    expect(text).toContain('.event == "workflow_dispatch"');
    expect(text).toContain(".workflow_run.id == $run");
    expect(text).toContain('sha256sum "$RUNNER_TEMP/candidate.zip"');
    expect(text).toContain("set(names) != expected");
    expect(text).toContain("node scripts/verify-release-candidate.mjs --check-only");
    expect(text).toContain("node scripts/verify-published-candidate.mjs");
    for (const job of Object.values(workflow.jobs) as {
      steps: { uses?: string; run?: string }[];
    }[]) {
      for (const step of job.steps) {
        if (step.uses) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
        if (step.run) expect(step.run).not.toContain("${{");
      }
    }
  });
});

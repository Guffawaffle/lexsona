import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = fs.readFileSync(
  path.resolve(process.cwd(), ".github", "workflows", "release.yml"),
  "utf8"
);
const document = parse(workflow) as {
  jobs: Record<
    string,
    {
      if?: string;
      permissions?: Record<string, string>;
      steps?: Array<{ name?: string; run?: string; uses?: string }>;
    }
  >;
};

describe("release workflow authority policy", () => {
  it("permits candidate dispatch only from the exact current main tip", () => {
    const validation = document.jobs["validate-identity"].steps?.find(
      (step) => step.name === "Validate package and event identity"
    )?.run;
    expect(validation).toContain('[ "$WORKFLOW_REF" != "refs/heads/main" ]');
    expect(validation).toContain('[ "$WORKFLOW_SHA" != "$(git rev-parse origin/main)" ]');
  });

  it("pins every action to a full commit SHA", () => {
    const uses = workflow.split(/\r?\n/).filter((line) => /^\s*-?\s*uses:\s+/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/@[0-9a-f]{40}(?:\s+#\s+v\S+)?$/);
    }
  });

  it("keeps release creation tag-only and npm publication absent", () => {
    expect(document.jobs["create-github-release"].if).toBe("github.event_name == 'push'");
    const commands = Object.values(document.jobs).flatMap((job) =>
      (job.steps ?? []).flatMap((step) => (step.run ? [step.run] : []))
    );
    expect(commands.join("\n")).not.toMatch(/\bnpm\s+publish\b/);
    for (const job of Object.values(document.jobs)) {
      expect(job.permissions?.packages).not.toBe("write");
      expect(job.permissions?.["id-token"]).not.toBe("write");
      expect(job.permissions?.attestations).not.toBe("write");
    }
  });

  it("binds tag consumption to the exact immutable artifact service record", () => {
    const releaseSteps = document.jobs["create-github-release"].steps ?? [];
    const serviceCheck = releaseSteps.find(
      (step) => step.name === "Verify immutable artifact service record"
    )?.run;
    const download = releaseSteps.find(
      (step) => step.name === "Download exact candidate evidence by immutable ID"
    );
    expect(serviceCheck).toContain("actions/artifacts/$ARTIFACT_ID");
    expect(serviceCheck).toContain('"sha256:$ARTIFACT_DIGEST"');
    expect(serviceCheck).toContain('"$GITHUB_RUN_ID"');
    expect(download?.uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}$/);
    expect(workflow).toContain("artifact-ids: ${{ needs.build-candidate.outputs.artifact-id }}");
  });

  it("verifies public registry bytes without a private read credential", () => {
    const verification = document.jobs["create-github-release"].steps?.find(
      (step) => step.name === "Bind release to exact public npm bytes"
    );
    expect(verification?.run).toBe("node scripts/verify-published-candidate.mjs");
    expect(workflow).not.toContain("NPM_READ_TOKEN");
  });
});

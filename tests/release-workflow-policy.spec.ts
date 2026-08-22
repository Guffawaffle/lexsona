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
    }
  });
});

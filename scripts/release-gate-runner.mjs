import { spawnSync } from "node:child_process";

const outputLimit = 8_000;

function boundOutput(value) {
  const text = value ?? "";
  if (text.length <= outputLimit) return { text, truncated: false };
  return { text: text.slice(-outputLimit), truncated: true };
}

export function executeReleaseGate({ name, command, args, cwd, commit, evidence }) {
  const startedAt = Date.now();
  const execution = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (execution.stdout) process.stdout.write(execution.stdout);
  if (execution.stderr) process.stderr.write(execution.stderr);
  const result = {
    name,
    status: execution.status === 0 && !execution.error ? "passed" : "failed",
    invocation: { executable: command, argv: args },
    cwd,
    commit,
    durationMs: Date.now() - startedAt,
    exitCode: execution.status,
    output: {
      stdout: boundOutput(execution.stdout),
      stderr: boundOutput(execution.stderr),
    },
    evidence,
  };
  if (execution.error) result.error = execution.error.message;
  return { result, stdout: execution.stdout ?? "" };
}

export function notRunReleaseGate({ name, command, args, cwd, commit, evidence }) {
  return {
    name,
    status: "not-run",
    invocation: { executable: command, argv: args },
    cwd,
    commit,
    durationMs: 0,
    exitCode: null,
    output: {
      stdout: { text: "", truncated: false },
      stderr: { text: "", truncated: false },
    },
    evidence,
  };
}

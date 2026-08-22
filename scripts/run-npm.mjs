import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function resolveNpmInvocation() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, prefixArgs: [process.env.npm_execpath] };
  }
  if (process.platform === "win32") {
    const bundledCli = path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    );
    if (!fs.existsSync(bundledCli)) {
      throw new Error("Cannot locate npm-cli.js; run this command through npm");
    }
    return { command: process.execPath, prefixArgs: [bundledCli] };
  }
  return { command: "npm", prefixArgs: [] };
}

export function runNpm(args, { cwd, capture = false } = {}) {
  const { command, prefixArgs } = resolveNpmInvocation();
  return execFileSync(command, [...prefixArgs, ...args], {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

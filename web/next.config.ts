import type { NextConfig } from "next";
import { execSync } from "child_process";
import { resolve } from "path";

function getGitInfo() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const msg = execSync("git log -1 --pretty=%s", { encoding: "utf-8" }).trim();
    return { sha, msg };
  } catch {
    return { sha: "unknown", msg: "" };
  }
}

const git = getGitInfo();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, "./"),
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_GIT_SHA: git.sha,
    NEXT_PUBLIC_GIT_MSG: git.msg,
  },
};

export default nextConfig;

#!/usr/bin/env node
// Computes the next release tag from existing git tags, creates it and pushes
// it — the push triggers the Release workflow, whose tag shape picks the
// channel (semver "-beta.N" suffix → prerelease, plain → stable).
import { execFileSync } from "node:child_process";

// Pure: kept exported for the vitest suite. `latest` may be null (no tags).
export function computeNextTag(latest, channel) {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(latest ?? "");
  const [x, y, z, n] = m
    ? [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        m[4] === undefined ? null : Number(m[4]),
      ]
    : [0, 0, 0, null];
  if (channel === "beta") {
    return n !== null
      ? `v${x}.${y}.${z}-beta.${n + 1}`
      : `v${x}.${y + 1}.0-beta.1`;
  }
  return n !== null ? `v${x}.${y}.${z}` : `v${x}.${y + 1}.0`;
}

function latestTag() {
  const tags = execFileSync("git", ["tag", "-l", "v*"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  // Zero-padded lexical sort matches semver order for our tag shapes; a plain
  // vX.Y.Z sorts after its own -beta.N line, which is also the semver order.
  const pad = (t) => t.replace(/\d+/g, (n) => n.padStart(6, "0"));
  return tags.sort((a, b) => pad(a).localeCompare(pad(b))).at(-1) ?? null;
}

// Only when run directly, not when imported by the test suite.
if (process.argv[1]?.endsWith("release.mjs")) {
  const channel = process.argv[2];
  if (channel !== "beta" && channel !== "stable") {
    console.error("usage: node scripts/release.mjs beta|stable");
    process.exit(1);
  }
  const latest = latestTag();
  const tag = computeNextTag(latest, channel);
  console.log(`${latest ?? "(no tags yet)"} → ${tag}`);
  // Annotated tag: an editor opens for the message, which the Release
  // workflow uses as the GitHub release body — write it for humans
  // (what changed and why), an empty message aborts the tag.
  console.log("Write the release notes in the editor that opens now.");
  execFileSync("git", ["tag", "-a", tag], { stdio: "inherit" });
  execFileSync("git", ["push", "origin", tag], { stdio: "inherit" });
  console.log("Release workflow triggered — watch with: gh run watch");
}

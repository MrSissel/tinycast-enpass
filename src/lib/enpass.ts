import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VaultItem } from "./item";

// enpass-cli opens the SQLite vault read-write, which creates transient
// -wal/-shm files in the vault directory — a write side effect on the real
// vault, and a running Enpass reacts to that "external change" (its window
// pops up / it re-locks). Snapshot from a mirror of the encrypted files
// instead: the real vault directory is never opened by enpass-cli.
// The mirror path is STABLE so the Keychain account enpass-cli derives from
// the vault path stays the same across runs (biometric enrollment survives).
// NOTE: Tinycast's fs shim only implements the classic calls — cpSync/rmSync
// are absent there (crash: "cpSync is not a function"). Copy via read/write,
// remove via unlink.
const MIRROR_DIR = join(tmpdir(), "raycast-enpass-vault");
const VAULT_FILES = [
  "vault.enpassdb",
  "vault.json",
  "vault.enpassdb-wal",
  "vault.enpassdb-shm",
];

export function mirrorVault(realVault: string): string {
  mkdirSync(MIRROR_DIR, { recursive: true });
  wipeMirrorFiles();
  for (const name of VAULT_FILES) {
    const src = join(realVault, name);
    if (existsSync(src))
      writeFileSync(join(MIRROR_DIR, name), readFileSync(src));
  }
  return MIRROR_DIR;
}

function wipeMirrorFiles(): void {
  for (const name of VAULT_FILES) {
    try {
      unlinkSync(join(MIRROR_DIR, name));
    } catch {
      /* absent */
    }
  }
}

function removeMirror(): void {
  wipeMirrorFiles();
  try {
    rmdirSync(MIRROR_DIR);
  } catch {
    /* absent or non-empty */
  }
}

export interface SnapshotOptions {
  cliPath: string;
  vaultPath: string;
  keyfilePath?: string;
  biometric: boolean;
  includeTrashed: boolean;
  masterPassword?: string; // passed via MASTERPW env only, never as an argument
}

// HARD REQUIREMENT: enpass-cli uses Go's flag package, which stops parsing flags
// at the first positional argument. Every flag must come before the subcommand —
// `enpass-cli -vault=X show -detailed` silently treats -detailed as a search
// filter and returns nothing.
export function buildSnapshotArgs(o: SnapshotOptions): string[] {
  const args = [`-vault=${o.vaultPath}`];
  if (o.keyfilePath) args.push(`-keyfile=${o.keyfilePath}`);
  if (o.biometric) args.push("-biometric");
  if (o.includeTrashed) args.push("-trashed");
  args.push("-detailed", "-json", "-sort", "show");
  return args;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runCli(
  cliPath: string,
  args: string[],
  masterPassword?: string,
): Promise<CliResult> {
  const { promise, resolve, reject } = Promise.withResolvers<CliResult>();
  const env = { ...process.env };
  if (masterPassword !== undefined) env.MASTERPW = masterPassword;
  const child = spawn(cliPath, args, { env });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
  child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
  child.on("error", reject);
  child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  return promise;
}

export function cliErrorMessage(stderr: string): string {
  const msg = /msg="([^"]+)"/.exec(stderr)?.[1];
  const err = /error="([^"]+)"/.exec(stderr)?.[1];
  if (msg && err) return `${msg}: ${err}`;
  return msg ?? err ?? stderr.trim() ?? "unknown error";
}

export function parseSnapshot(stdout: string): VaultItem[] {
  const data: unknown = JSON.parse(stdout);
  if (!Array.isArray(data))
    throw new Error("unexpected enpass-cli output: not a JSON array");
  return data.filter(
    (e): e is VaultItem =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as VaultItem).title === "string" &&
      Array.isArray((e as VaultItem).fields),
  );
}

// Full-vault snapshot: every item, every field, one CLI call (one Touch ID
// prompt). Runs against a mirror of the encrypted vault files, never the
// real vault directory; the mirror is wiped afterwards either way.
export async function getSnapshot(o: SnapshotOptions): Promise<VaultItem[]> {
  try {
    const result = await runCli(
      o.cliPath,
      buildSnapshotArgs({ ...o, vaultPath: mirrorVault(o.vaultPath) }),
      o.masterPassword,
    );
    if (result.code !== 0) throw new Error(cliErrorMessage(result.stderr));
    return parseSnapshot(result.stdout);
  } finally {
    removeMirror();
  }
}

// Cheap liveness check: `enpass-cli version` needs no vault and no credentials.
export async function checkCli(cliPath: string): Promise<string> {
  const result = await runCli(cliPath, ["version"]);
  if (result.code !== 0) throw new Error(cliErrorMessage(result.stderr));
  return result.stderr.trim() || result.stdout.trim(); // version logs to stderr via logrus
}

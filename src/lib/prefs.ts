import { getPreferenceValues } from "@raycast/api";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { detectCliPath, detectVaultPaths } from "./detect";
import { AutoLock } from "./session";

export interface Preferences {
  cliPath: string;
  vaultPath: string; // "auto" | path (possibly with ~)
  customVaultPath?: string;
  keyfilePath?: string;
  primaryAction: "copy" | "paste";
  unlockMethod: "touchid" | "masterpw" | "masterpw-keychain";
  clearClipboardSeconds: "10" | "30" | "60" | "90" | "never";
  autoLock: "never" | "15" | "30" | "60" | "afterEachUse";
  includeTrashed?: boolean;
}

export function prefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

export function expandHome(path: string): string {
  return path.startsWith("~/") || path === "~" ? path.replace(/^~/, homedir()) : path;
}

function whichEnpassCli(): string | null {
  try {
    const found = execFileSync("/usr/bin/which", ["enpass-cli"], { encoding: "utf8" }).trim();
    return found.length > 0 ? found : null;
  } catch {
    return null;
  }
}

// Configured path first; when missing, fall back to the standard locations.
export function resolveCliPath(p: Preferences): string | null {
  if (p.cliPath && existsSync(expandHome(p.cliPath))) return expandHome(p.cliPath);
  return detectCliPath({ exists: existsSync }, whichEnpassCli);
}

export function resolveVaultPath(p: Preferences): string | null {
  if (p.customVaultPath?.trim()) return expandHome(p.customVaultPath.trim());
  if (p.vaultPath && p.vaultPath !== "auto") return expandHome(p.vaultPath);
  const hits = detectVaultPaths(
    {
      exists: existsSync,
      listDirs: (dir) => {
        try {
          return readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => `${dir}/${e.name}`);
        } catch {
          return [];
        }
      },
    },
    homedir(),
  );
  return hits[0] ?? null; // multiple candidates: first (most standard) wins, user can pin via dropdown
}

export function clearSeconds(p: Preferences): number | null {
  return p.clearClipboardSeconds === "never" ? null : Number(p.clearClipboardSeconds);
}

export function autoLockMode(p: Preferences): AutoLock {
  if (p.autoLock === "never" || p.autoLock === "afterEachUse") return p.autoLock;
  return Number(p.autoLock);
}

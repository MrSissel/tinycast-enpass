import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutoLock } from "./session";

// Cross-launch idle lock for the masterpw-keychain method (alfred-enpass
// parity): each successful unlock stamps the time; once the auto-lock window
// has passed since that stamp, the silent Keychain unlock is refused and the
// password form appears instead. The stamp holds no secrets — just an epoch.
// "never"/"afterEachUse" never gate: in-session re-unlock is silent for both.
const STAMP = join(tmpdir(), "raycast-enpass-unlock-stamp");

function lastUnlock(): number | null {
  try {
    const t = Number(readFileSync(STAMP, "utf8"));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null; // no stamp yet: trusted first run, the window starts now
  }
}

export function touchUnlock(now = Date.now()): void {
  try {
    writeFileSync(STAMP, String(now), { mode: 0o600 });
  } catch {
    // best-effort: a lost stamp just restarts the window
  }
}

export function idleLockExpired(
  mode: AutoLock,
  read: () => number | null = lastUnlock,
  now = Date.now(),
): boolean {
  if (typeof mode !== "number") return false;
  const last = read();
  return last !== null && now - last > mode * 60_000;
}

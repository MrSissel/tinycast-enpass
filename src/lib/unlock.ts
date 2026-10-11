import { existsSync } from "node:fs";
import { clipboardGuard } from "./actions";
import { checkCli, getSnapshot } from "./enpass";
import { idleLockExpired, touchUnlock } from "./idle-lock";
import {
  deleteKeychainPassword,
  readKeychainPassword,
  writeKeychainPassword,
} from "./keychain";
import { autoLockMode, prefs, resolveCliPath, resolveVaultPath } from "./prefs";
import { setSnapshot } from "./session";

// Thrown when the masterpw-keychain method has no usable stored password:
// the UI shows the password form rather than an error.
export class PasswordRequiredError extends Error {
  constructor() {
    super("master password required");
    this.name = "PasswordRequiredError";
  }
}

// First-run preflight (hard requirement): verify the CLI works and the vault
// directory contains vault.enpassdb BEFORE attempting a snapshot, and fail with
// actionable guidance — never a raw log dump.
export async function unlock(
  masterPassword?: string,
  remember = true,
): Promise<number> {
  const p = prefs();

  const cliPath = resolveCliPath(p);
  if (!cliPath) {
    throw new Error(
      "enpass-cli not found. Install it first: brew install enpass-cli",
    );
  }
  try {
    await checkCli(cliPath);
  } catch (e) {
    throw new Error(
      `enpass-cli at ${cliPath} failed to run: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const vaultPath = resolveVaultPath(p);
  if (!vaultPath || !existsSync(`${vaultPath}/vault.enpassdb`)) {
    throw new Error(
      `No vault.enpassdb found${vaultPath ? ` in ${vaultPath}` : ""}. ` +
        "In Enpass: Settings → Advanced → Data Location, then set that folder as 'Custom Vault Path' in the extension preferences.",
    );
  }

  let password = masterPassword;
  let usedSaved = false;
  if (p.unlockMethod === "masterpw-keychain" && password === undefined) {
    // Auto-lock window expired since the last unlock: refuse the silent
    // Keychain read and let the password form appear instead.
    if (idleLockExpired(autoLockMode(p))) throw new PasswordRequiredError();
    password = (await readKeychainPassword(vaultPath)) ?? undefined;
    usedSaved = password !== undefined;
    if (!usedSaved) throw new PasswordRequiredError();
  }

  try {
    const items = await getSnapshot({
      cliPath,
      vaultPath,
      keyfilePath: p.keyfilePath?.trim() || undefined,
      biometric: p.unlockMethod === "touchid",
      includeTrashed: p.includeTrashed ?? false,
      masterPassword: password,
    });
    if (
      p.unlockMethod === "masterpw-keychain" &&
      masterPassword !== undefined &&
      remember
    ) {
      // Persist only AFTER a successful unlock proves the password right.
      // Best-effort: a failed write just means the form appears again next time.
      await writeKeychainPassword(vaultPath, masterPassword).catch(
        () => undefined,
      );
    }
    setSnapshot(items, autoLockMode(p), () => clipboardGuard.lock());
    if (p.unlockMethod === "masterpw-keychain") touchUnlock();
    return items.length;
  } catch (e) {
    // A stored password that no longer opens the vault was changed in Enpass:
    // drop the stale item and ask again, instead of failing forever.
    if (
      usedSaved &&
      /open vault|decrypt/i.test(e instanceof Error ? e.message : String(e))
    ) {
      await deleteKeychainPassword(vaultPath);
      throw new PasswordRequiredError();
    }
    throw e;
  }
}

import { showHUD } from "@raycast/api";
import { deleteKeychainPassword } from "./lib/keychain";
import { prefs, resolveVaultPath } from "./lib/prefs";
import { lock } from "./lib/session";

export default async function LockVault() {
  await lock(); // wipes the snapshot and clears the clipboard if it still holds the last secret
  const p = prefs();
  if (p.unlockMethod === "masterpw-keychain") {
    // Alfred parity: lock forgets the remembered master password too.
    const vaultPath = resolveVaultPath(p);
    if (vaultPath) await deleteKeychainPassword(vaultPath);
  }
  await showHUD("Vault locked");
}

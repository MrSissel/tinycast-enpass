import { cliErrorMessage, runCli } from "./enpass";

// Login-Keychain persistence for the "masterpw-keychain" unlock method —
// the same model alfred-enpass uses (service com.x-o-r-r-o.alfred.enpass) and
// the same one enpass-cli uses for its own biometric item: the entry has no
// kSecAttrAccessControl, so while the login keychain is unlocked any process
// running as this user can read it with this tool, without a prompt.

const SECURITY = "/usr/bin/security";
const SERVICE = "raycast-enpass";

export async function readKeychainPassword(account: string): Promise<string | null> {
  const r = await runCli(SECURITY, ["find-generic-password", "-s", SERVICE, "-a", account, "-w"]);
  if (r.code !== 0) return null;
  const password = r.stdout.replace(/\n$/, "");
  return password === "" ? null : password;
}

export async function writeKeychainPassword(account: string, password: string): Promise<void> {
  // NOTE: -w exposes the password in this process's argument list for the
  // (millisecond) lifetime of the call — Apple's `security` tool offers no
  // stdin/env alternative; alfred-enpass documents the same tradeoff.
  const r = await runCli(SECURITY, ["add-generic-password", "-s", SERVICE, "-a", account, "-w", password, "-U"]);
  if (r.code !== 0) throw new Error(cliErrorMessage(r.stderr));
}

export async function deleteKeychainPassword(account: string): Promise<void> {
  // Not-found is success: the goal is "no item".
  await runCli(SECURITY, ["delete-generic-password", "-s", SERVICE, "-a", account]);
}

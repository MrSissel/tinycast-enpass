import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deleteKeychainPassword,
  readKeychainPassword,
  writeKeychainPassword,
} from "../src/lib/keychain";

// Roundtrip against the real login Keychain via /usr/bin/security, with a
// throwaway account. No prompts: items created by the security tool carry no
// access control, so it reads them back silently (the documented trust model).
const itWithSecurity = existsSync("/usr/bin/security") ? it : it.skip;

describe("keychain helper", () => {
  const account = `vitest-${process.pid}-${Date.now()}`;

  itWithSecurity("write → read → delete roundtrip", async () => {
    expect(await readKeychainPassword(account)).toBeNull();
    await writeKeychainPassword(account, "s3cret value/with$chars");
    expect(await readKeychainPassword(account)).toBe("s3cret value/with$chars");
    await writeKeychainPassword(account, "updated"); // -U overwrites in place
    expect(await readKeychainPassword(account)).toBe("updated");
    await deleteKeychainPassword(account);
    expect(await readKeychainPassword(account)).toBeNull();
    await deleteKeychainPassword(account); // deleting nothing is fine
  });
});

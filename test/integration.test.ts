import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSnapshotArgs, checkCli, getSnapshot, mirrorVault, runCli } from "../src/lib/enpass";
import { passwordOf, totpSecretOf } from "../src/lib/item";

// End-to-end against the PUBLIC test vault from hazcod/enpass-cli v1.14.0
// (password "absolutely-No-clue"). Never touches a real vault.
const CLI = ["/opt/homebrew/bin/enpass-cli", "/usr/local/bin/enpass-cli"].find(existsSync);
const VAULT = `${__dirname}/fixtures/testvault`;
const MASTERPW = "absolutely-No-clue";

const itWithCli = CLI && existsSync(`${VAULT}/vault.enpassdb`) ? it : it.skip;

describe("mirrorVault", () => {
  const mirror = join(tmpdir(), "raycast-enpass-vault");
  afterEach(() => rmSync(mirror, { recursive: true, force: true }));

  it("mirrors only vault files to the stable path, verbatim", () => {
    const src = mkdtempSync(`${tmpdir()}/enpass-mirror-src-`);
    writeFileSync(`${src}/vault.enpassdb`, "db-bytes");
    writeFileSync(`${src}/vault.json`, "{}");
    writeFileSync(`${src}/vault.enpassdb-wal`, "wal");
    writeFileSync(`${src}/intruder.txt`, "nope");
    const out = mirrorVault(src);
    expect(out).toBe(mirror); // stable path: enpass-cli's keychain account derives from it
    expect(readdirSync(out).sort()).toEqual(["vault.enpassdb", "vault.enpassdb-wal", "vault.json"]);
    rmSync(src, { recursive: true, force: true });
  });

  it("removes stale vault files the source no longer has", () => {
    const src = mkdtempSync(`${tmpdir()}/enpass-mirror-src-`);
    writeFileSync(`${src}/vault.enpassdb`, "fresh");
    writeFileSync(`${src}/vault.json`, "{}");
    mkdirSync(mirror, { recursive: true });
    writeFileSync(`${mirror}/vault.enpassdb-wal`, "stale-wal");
    mirrorVault(src);
    expect(existsSync(`${mirror}/vault.enpassdb-wal`)).toBe(false);
    expect(readFileSync(`${mirror}/vault.enpassdb`, "utf8")).toBe("fresh");
    rmSync(src, { recursive: true, force: true });
  });
});

describe("buildSnapshotArgs", () => {
  it("puts every flag before the subcommand (Go flag parsing stops at the first positional)", () => {
    const args = buildSnapshotArgs({
      cliPath: "enpass-cli",
      vaultPath: "/v",
      keyfilePath: "/k",
      biometric: true,
      includeTrashed: true,
    });
    const showAt = args.indexOf("show");
    expect(showAt).toBeGreaterThan(0);
    expect(args.slice(0, showAt).every((a) => a.startsWith("-"))).toBe(true);
    expect(args).toEqual(["-vault=/v", "-keyfile=/k", "-biometric", "-trashed", "-detailed", "-json", "-sort", "show"]);
  });
});

describe("enpass-cli against the test vault", () => {
  itWithCli("checkCli runs version without credentials", async () => {
    await expect(checkCli(CLI!)).resolves.toContain("1.14.0");
  });

  itWithCli("snapshots the test vault with MASTERPW env", async () => {
    const items = await getSnapshot({
      cliPath: CLI!,
      vaultPath: VAULT,
      biometric: false,
      includeTrashed: false,
      masterPassword: MASTERPW,
    });
    expect(items.map((i) => i.title)).toEqual(["Whatever"]);
    expect(passwordOf(items[0])).toBe("noIdeaata11");
    expect(totpSecretOf(items[0])).toBeUndefined();
  });

  itWithCli("leaves no SQLite artifacts in the real vault directory", async () => {
    await getSnapshot({ cliPath: CLI!, vaultPath: VAULT, biometric: false, includeTrashed: false, masterPassword: MASTERPW });
    expect(readdirSync(VAULT).sort()).toEqual(["vault.enpassdb", "vault.json"]);
    expect(existsSync(join(tmpdir(), "raycast-enpass-vault"))).toBe(false); // mirror wiped
  });

  itWithCli("fails cleanly with a wrong master password", async () => {
    await expect(
      getSnapshot({ cliPath: CLI!, vaultPath: VAULT, biometric: false, includeTrashed: false, masterPassword: "wrong" }),
    ).rejects.toThrow();
  });

  itWithCli("documents the flags-after-subcommand trap: -detailed after show is silently swallowed", async () => {
    // This is the bug the arg builder prevents: Go's flag package stops at "show",
    // so "-detailed" becomes a search FILTER and matches nothing.
    const mirror = mirrorVault(VAULT);
    const result = await runCli(CLI!, [`-vault=${mirror}`, "-json", "show", "-detailed"], MASTERPW);
    rmSync(mirror, { recursive: true, force: true });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});

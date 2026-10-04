import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectCliPath, detectVaultPaths, DetectFs } from "../src/lib/detect";

const realFs: DetectFs = {
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
};

function makeVault(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/vault.enpassdb`, "fake");
}

describe("detectCliPath", () => {
  it("prefers /opt/homebrew, then /usr/local, then PATH", () => {
    const only = (p: string) => ({ exists: (q: string) => q === p });
    expect(
      detectCliPath(only("/opt/homebrew/bin/enpass-cli"), () => null),
    ).toBe("/opt/homebrew/bin/enpass-cli");
    expect(detectCliPath(only("/usr/local/bin/enpass-cli"), () => null)).toBe(
      "/usr/local/bin/enpass-cli",
    );
    expect(detectCliPath(only("/nope"), () => "/weird/path/enpass-cli")).toBe(
      "/weird/path/enpass-cli",
    );
    expect(detectCliPath(only("/nope"), () => null)).toBeNull();
  });
});

describe("detectVaultPaths", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(`${tmpdir()}/enpass-detect-`);
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("finds the App Store sandbox vault first", () => {
    makeVault(
      `${home}/Library/Containers/in.sinew.Enpass-Desktop/Data/Documents/Vaults/primary`,
    );
    makeVault(`${home}/Documents/Enpass/Vaults/primary`);
    expect(detectVaultPaths(realFs, home)).toEqual([
      `${home}/Library/Containers/in.sinew.Enpass-Desktop/Data/Documents/Vaults/primary`,
      `${home}/Documents/Enpass/Vaults/primary`,
    ]);
  });

  it("discovers extra vaults under ~/Documents/Enpass/**/Vaults/*", () => {
    makeVault(`${home}/Documents/Enpass/work/Vaults/secondary`);
    expect(detectVaultPaths(realFs, home)).toEqual([
      `${home}/Documents/Enpass/work/Vaults/secondary`,
    ]);
  });

  it("ignores directories without vault.enpassdb and never duplicates", () => {
    mkdirSync(`${home}/Documents/Enpass/Vaults/empty`, { recursive: true });
    makeVault(`${home}/Documents/Enpass/Vaults/primary`);
    expect(detectVaultPaths(realFs, home)).toEqual([
      `${home}/Documents/Enpass/Vaults/primary`,
    ]);
  });

  it("returns [] when nothing exists", () => {
    expect(detectVaultPaths(realFs, home)).toEqual([]);
  });
});

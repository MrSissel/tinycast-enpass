// Pure path detection for the enpass-cli binary and Enpass vault directories.
// All fs access is injected so the logic is unit-testable with temp dirs.

export interface DetectFs {
  exists(path: string): boolean;
  listDirs(path: string): string[]; // absolute paths of immediate subdirectories; [] when missing/unreadable
}

export const CLI_CANDIDATES = ["/opt/homebrew/bin/enpass-cli", "/usr/local/bin/enpass-cli"];

// First match wins: fixed Homebrew locations, then PATH lookup via `which` (injected).
export function detectCliPath(fs: Pick<DetectFs, "exists">, which: () => string | null): string | null {
  for (const p of CLI_CANDIDATES) {
    if (fs.exists(p)) return p;
  }
  return which();
}

function hasVaultDb(fs: DetectFs, dir: string): boolean {
  return fs.exists(`${dir}/vault.enpassdb`);
}

// Ordered candidates: App Store sandbox → ~/Documents/Enpass/Vaults/primary →
// any other ~/Documents/Enpass/**/Vaults/* directory containing vault.enpassdb.
export function detectVaultPaths(fs: DetectFs, home: string): string[] {
  const hits: string[] = [];
  const push = (dir: string) => {
    if (hasVaultDb(fs, dir) && !hits.includes(dir)) hits.push(dir);
  };

  push(`${home}/Library/Containers/in.sinew.Enpass-Desktop/Data/Documents/Vaults/primary`);
  push(`${home}/Documents/Enpass/Vaults/primary`);

  // Bounded walk of ~/Documents/Enpass: <root>/<anything>/Vaults/<name> and <root>/Vaults/<name>.
  const enpassRoot = `${home}/Documents/Enpass`;
  const roots = [enpassRoot, ...fs.listDirs(enpassRoot)];
  for (const root of roots) {
    if (root.endsWith("/Vaults")) {
      for (const dir of fs.listDirs(root)) push(dir);
    } else {
      for (const dir of fs.listDirs(`${root}/Vaults`)) push(dir);
    }
  }
  return hits;
}

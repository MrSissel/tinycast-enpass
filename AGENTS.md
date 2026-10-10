# AGENTS.md

Raycast/Tinycast extension: search an Enpass 6 vault via enpass-cli, copy
secrets without opening Enpass. **Read-only by design — never add a write
operation** (no create/edit/trash/delete, no vault mutation of any kind).

## Commands

```sh
npm install
npm run lint        # eslint + prettier --check (must stay clean)
npm run test        # vitest, must stay green (incl. live CLI integration tests)
npm run typecheck   # tsc --noEmit
npm run build       # ray build -e dist -o dist → dist/ is what Tinycast imports
```

CI runs the same four gates on macos-14 (`.github/workflows/ci.yml`); tags
`v*` cut a GitHub Release with the zipped `dist/` (`.github/workflows/release.yml`)
— a semver prerelease suffix in the tag (`v0.2.0-beta.1`) marks it prerelease,
plain `v0.2.0` ships stable.

Lint is `eslint` + `prettier` directly, NOT `ray lint`: this is a private
extension, and `ray lint`'s manifest validation hard-requires a raycast.com
author account (its `--relaxed` flag does not exempt it). The manifest carries
`author`/`description` so stock Raycast can import the built `dist/` folder —
that's import compat only; if the extension is ever submitted to the Raycast
Store, `author` must become a real raycast.com username and CI switches to
`ray lint`. TypeScript must stay on 5.x
— typescript-eslint (inside @raycast/eslint-config) hard-throws on TS 7.

Tinycast installs the extension via Settings → Extensions → Add from folder →
**`dist/`** (not the repo root). Folder installs never auto-update: rebuild and
re-add to ship a change. Store preferences in
`~/Library/Application Support/com.tinycast.app/extension-data/enpass.json`
survive reinstalls — a changed default does not reach existing installs.

## Releasing

Tags are the only version source (the manifest carries no version field).

1. Land changes on `main`; gates must be green (`npm run lint && npm test &&
   npm run build` locally, or the CI run on main).
2. Tag and push the tag — the tag's shape picks the channel. Use the helper,
   which computes the next number from existing tags and pushes:
   - **Beta**: `npm run release:beta` — increments the `-beta.N` suffix on a
     beta line, or opens `vX.(Y+1).0-beta.1` after a stable tag. Release
     marked **prerelease** on GitHub; "Latest" untouched.
   - **Stable**: `npm run release:stable` — cuts the base version off a beta
     line, or bumps minor from a stable tag. Full release, becomes "Latest".
   Manual `git tag vX.Y.Z[-beta.N] && git push origin <tag>` works the same;
   the helpers just do the numbering (`scripts/release.mjs`).
3. Verify: `gh run watch`, then `gh release view v<tag>` — the asset
   `enpass-tinycast.zip` must be attached.
4. Install/update in Tinycast from the release zip (or a local
   `npm run build`) → Settings → Extensions → Add from folder.

Retract a bad tag before its release exists:
`git tag -d v<X> && git push origin :refs/tags/v<X>`; if the release already
published, `gh release delete v<X>` first.

## Hard constraints (all learned the hard way — do not regress)

- **enpass-cli flags go BEFORE the subcommand.** Go's `flag` stops parsing at
  the first positional; `show -detailed` silently treats `-detailed` as a
  search filter and returns nothing. Only `buildSnapshotArgs` in
  `src/lib/enpass.ts` constructs CLI argv; the integration test pins the trap.
- **Never open the real vault directory with enpass-cli.** Its read-write
  SQLite open drops transient `-wal/-shm` files there and wakes a running
  Enpass. `getSnapshot` mirrors the encrypted files to a stable temp path and
  wipes it after. Keep the mirror path stable: the Keychain account derives
  from the vault path passed to the CLI.
- **Tinycast's fs shim has only classic calls.** No `cpSync`/`rmSync` — copy
  via `readFileSync`/`writeFileSync`, delete via `unlinkSync`/`rmdirSync`.
  `child_process.spawn` streams stdout/stderr and passes `env`, but stdin is
  written once at start (never rely on interactive stdin).
- **One JSContext per command launch, destroyed on leave.** Module state never
  survives into the next run — the snapshot's lifetime IS the command session.
  Cross-command "lock" works only because a new launch preempts the old context.
- **Secrets are never persisted.** No LocalStorage, no Cache, no disk, no logs,
  no recent-items. The only two files that survive a command session: the
  login-Keychain master password in `masterpw-keychain` mode
  (`src/lib/keychain.ts`, service `raycast-enpass`, deleted by Lock Vault) and
  the non-secret unlock timestamp `$TMPDIR/raycast-enpass-unlock-stamp`
  (`src/lib/idle-lock.ts`, 0600) that gates the silent Keychain unlock once
  the auto-lock window has passed.
- **Every sensitive copy goes through `copyValue(…, sensitive=true)`**
  (`src/lib/actions.ts`) → `Clipboard.copy(…, { concealed: true })`. Never add
  a raw `Clipboard.copy` for a secret. Usernames are non-sensitive on purpose.
- **Tinycast form quirks**: extension forms never auto-focus (verified
  0.11.12 → 0.11.19 stable and upstream main, 2026-10-11; no open PR) — the
  JS runtime forwards `autoFocus` fine, and Swift consumes it in
  `ExtensionFormView.onAppear { focus(screen.autoFocusedField) }`, but
  `.onAppear` fires before the panel/AppKit picks a first responder, so that
  pick wins. Same bug class upstream fixed for its own native dialogs in PR
  #1369 (moved to `.task` + `Task.yield()`), never applied to extension
  forms — render unlock forms as root screens anyway, and Tab/↓ to focus;
  ↩ submits from non-text controls, ⌘↩ from text fields; **the ⌘K action
  panel dispatches plain ↩ only** — modifier+Return shortcuts (⌘↩/⌃↩/⇧↩)
  beep or fall through to the search field, and panel-listed list shortcuts
  (⌘R/⌘L) don't fire while the panel is open (observed on 0.11.12,
  2026-10-09; fixed upstream in PR #1400 — the panel's
  search field held focus so the chord never reached the extension;
  shipped in stable v0.11.19. Stock Raycast had the same bug class and fixed it, so
  keep declaring standard shortcuts and let Tinycast catch up);
  `List.EmptyView`
  actions never fire — use real `List.Item`s for primary actions.
- **Tests touch ONLY `test/fixtures/testvault`** (public hazcod/enpass-cli test
  vault, password `absolutely-No-clue`, passed via MASTERPW env). Never point a
  test or a dev script at `~/Library/Containers/in.sinew.Enpass-Desktop/…` or
  any real vault — not even reads.
- **Error toasts must stay short** — Tinycast grows the palette to fit long
  toast text. Map known enpass-cli errors in `unlockErrorText`
  (`src/lib/unlock-view.tsx`).

## Layout

- `src/search-vault.tsx`, `lock-vault.ts`, `refresh-vault.tsx` — commands
  (thin wrappers around `lib/vault-command.tsx` / `lib/session.ts`)
- `src/lib/enpass.ts` — CLI spawn, argv order, vault mirroring, stdout parsing
- `src/lib/unlock.ts` — unlock flow + first-run preflight; `unlock-view.tsx` —
  locked screen, password forms, silent keychain unlock
- `src/lib/session.ts` — in-memory snapshot + auto-lock; `clipboard.ts` —
  auto-clear countdown (injectable, tested)
- `src/lib/item.ts` — vault model, sensitive-field masking, URL validation;
  `totp.ts` — RFC 6238; `detect.ts`/`prefs.ts` — path detection + preferences
- `test/` — vitest; `test/fixtures/` — public test vault + real CLI output
- Docs for users: `README.md` (English) and `README.zh-CN.md` (中文) — when you
  change commands, preferences, shortcuts or behavior, update BOTH.

## Definition of done

`npm run typecheck` and `npm run test` green, `npm run build` succeeds, and no
new violation of the constraints above. UI changes can't be verified headless
— say so and leave acceptance steps in the PR/commit description.

# AGENTS.md

Raycast/Tinycast extension: search an Enpass 6 vault via enpass-cli, copy
secrets without opening Enpass. **Read-only by design — never add a write
operation** (no create/edit/trash/delete, no vault mutation of any kind).

## Commands

```sh
npm install
npm run test        # vitest, must stay green (incl. live CLI integration tests)
npm run typecheck   # tsc --noEmit
npm run build       # ray build -e dist -o dist → dist/ is what Tinycast imports
```

Tinycast installs the extension via Settings → Extensions → Add from folder →
**`dist/`** (not the repo root). Folder installs never auto-update: rebuild and
re-add to ship a change. Store preferences in
`~/Library/Application Support/com.tinycast.app/extension-data/enpass.json`
survive reinstalls — a changed default does not reach existing installs.

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
  no recent-items. The single allowed persistence is the login-Keychain master
  password in `masterpw-keychain` mode (`src/lib/keychain.ts`,
  service `raycast-enpass`), deleted by Lock Vault.
- **Every sensitive copy goes through `copyValue(…, sensitive=true)`**
  (`src/lib/actions.ts`) → `Clipboard.copy(…, { concealed: true })`. Never add
  a raw `Clipboard.copy` for a secret. Usernames are non-sensitive on purpose.
- **Only http/https may be opened**, via `safeHttpUrl` in `src/lib/item.ts`.
- **Tests touch ONLY `test/fixtures/testvault`** (public hazcod/enpass-cli test
  vault, password `absolutely-No-clue`, passed via MASTERPW env). Never point a
  test or a dev script at `~/Library/Containers/in.sinew.Enpass-Desktop/…` or
  any real vault — not even reads.
- **Tinycast form quirks**: pushed forms don't auto-focus (0.11.12) — render
  unlock forms as root screens; ↩ submits from non-text controls, ⌘↩ from text
  fields; `List.EmptyView` actions never fire — use real `List.Item`s for
  primary actions; `fn` modifier is Tinycast-only (type assertion in
  `vault-command.tsx`).
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

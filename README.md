# Enpass for Tinycast / Raycast

> English | [中文](README.zh-CN.md)

Search your Enpass vault from the launcher and copy passwords, usernames and one-time codes (TOTP) — without opening Enpass. UX mirrors [alfred-enpass](https://github.com/x-o-r-r-o/alfred-enpass).

The backend is [enpass-cli](https://github.com/hazcod/enpass-cli) (Go, reads the local Enpass 6 vault file directly; Enpass has no official API). This extension is **read-only**: it implements no create/edit/trash/delete operations.

## Commands

| Command | Suggested alias | What it does |
|---|---|---|
| Search Vault | `enp` | Unlock, then fuzzy-search the in-memory snapshot in real time (title / username / category / website / url) |
| Lock Vault | `enp-lock` | Lock immediately: destroys the search command's runtime, wiping the snapshot; in Keychain mode also deletes the remembered master password |
| Refresh Vault | `enp-refresh` | Rebuild the snapshot and land directly in the search (asks for Touch ID / master password again) |

### Search Vault shortcuts

| Key | Action |
|---|---|
| ↩ | Copy password (or paste it, per preference); copying starts the clipboard auto-clear countdown |
| ⇧⌘↩ | The opposite of the default action (paste when default is copy, and vice versa) |
| ⌘↩ | Copy username |
| ⌥↩ | Copy the current TOTP code (computed locally from the secret via RFC 6238) |
| ⌥⌘↩ | Open website (http/https only — every other scheme is refused) |
| ⇧↩ | Field detail list: ↩ copy field, ⌘↩ paste field, ⌥⌘↩ open a URL field |
| ⌘R | Rebuild the snapshot in place (re-verify, without leaving the command) |
| ⌘L | Lock immediately (wipe the in-memory snapshot; with a timed auto-lock in Keychain mode, also ends the idle window — re-unlocking asks for the master password) |

Passwords, PINs, card numbers, recovery codes and TOTP secrets are masked (`••••••••`) in every list UI; TOTP fields show only the current 6-digit code in the detail view.

## Preferences

| Preference | Default | Notes |
|---|---|---|
| enpass-cli Path | `/opt/homebrew/bin/enpass-cli` | If the configured path is missing: `/usr/local/bin/enpass-cli` → PATH |
| Vault | Auto-detect | Candidates: `~/Library/Containers/in.sinew.Enpass-Desktop/Data/Documents/Vaults/primary` → `~/Documents/Enpass/Vaults/primary` → other `~/Documents/Enpass/**/Vaults/*` (a hit contains `vault.enpassdb`) |
| Custom Vault Path | empty | Overrides Vault. In Enpass: Settings → Advanced → Data Location |
| Keyfile Path | empty | Only for keyfile-protected vaults |
| Unlock Method | Keychain | Keychain (default — type once, then zero prompts) / Touch ID (`-biometric`, prompt every time) / master password every time (`MASTERPW`) |
| Default ↩ Action | Copy | Whether ↩ copies or pastes; ⇧⌘↩ always does the opposite |
| Clear Clipboard After | 30 s | 10 / 30 / 60 / 90 s or never. Skipped when the clipboard no longer holds the secret |
| Auto-Lock Session | 30 min | Never / 15 / 30 / 60 min / after each use. Expiry performs the equivalent of Lock. In Keychain unlock mode it also gates the silent unlock across launches: once the window has passed since the last unlock, the master password is asked again (alfred-enpass parity) |
| Trash | off | Include trashed items (`enpass-cli -trashed`) |

## Unlock methods

### Master password, remembered in Keychain (default — alfred-enpass parity)

The first entry shows the password form; only after the password **proves correct** it is stored in the login Keychain (service=`raycast-enpass`, account=vault path) via `/usr/bin/security`. Every later `enp` reads it silently — zero prompts, straight to the list. If the stored password stops working (the master password changed in Enpass), the stale item is deleted and you're asked again. `enp-lock` deletes the item and wipes the snapshot, returning to first-run state.

### Touch ID

Unlocking raises the system Touch ID prompt. **The prompt's "Use Password" button does not work** — enpass-cli uses the biometrics-only policy (`LAPolicyDeviceOwnerAuthenticationWithBiometrics`: no device-password fallback, no Apple Watch approval), so scanning your finger is the only way through; the button only produces an error.

**First use enrolls once, inside the extension**: on the locked screen choose **Use Master Password…** and enter the Enpass master password once (no fingerprint this time) → enpass-cli unlocks and writes the derived key to the login Keychain (service=`enpass-cli`, account=mirror path) → afterwards Touch ID alone unlocks. The password travels only via that spawn's `MASTERPW` environment variable and is never stored by the extension. If the fingerprint keeps failing, the master-password path remains available.

**One snapshot = one Touch ID prompt**: enpass-cli's `-biometric` mode builds a fresh `LAContext` and calls `evaluatePolicy` on every run (no caching of any kind). Hence the architecture: one full-vault snapshot per unlock, then instant in-memory searching for the rest of the session.

### Master password, asked every time (MASTERPW)

The password form is rendered as the command's root screen (works around Tinycast 0.11.12 not auto-focusing pushed forms; Esc exits the command). Type, then **⌘↩** to submit — in Tinycast forms ↩ is owned by the text control, ⌘↩ is the submit key. The master password reaches enpass-cli only through that **single spawn's `MASTERPW` environment variable**: never on a command line, never persisted, gone when the form closes. Everything after that runs off the in-memory snapshot. Refresh / ⌘R asks again.

## Security model

- **In-memory snapshot**: one `enpass-cli -vault=<path> -biometric -detailed -json -sort show` per unlock reads every item (including plaintext passwords and TOTP secrets) into the extension's process memory. The snapshot lives **only in memory**: no LocalStorage, no disk, no logs, no caches, no recent-items.
- **Zero contact with the real vault**: enpass-cli opens SQLite read-write, which would drop transient `-wal`/`-shm` files into the real vault directory — and a running Enpass reacts to that "external change" (its window pops up / it re-locks). So each snapshot first copies the **encrypted** files (`vault.enpassdb`, `vault.json`, plus WAL files) to a stable temp path `$TMPDIR/raycast-enpass-vault`, enpass-cli opens only the mirror, and the mirror is wiped afterwards — the real vault directory sees no reads or writes at all. The stable mirror path keeps the Keychain account enpass-cli derives from it stable across runs; enrollment you may have done in a terminal against the real path is independent.
- **Snapshot lifetime = command session** (Tinycast runtime model): Tinycast boots a fresh JSContext per command launch and destroys it when you leave, so module state never survives into the next run — **leaving the search (back to root / closing the palette / launching another command) locks the vault for free**; the auto-lock timers only matter while the command stays open. Lock Vault works by the same mechanism: launching it preempts and destroys the search command's context.
- **Clipboard**: every sensitive value (passwords, TOTP codes, sensitive-flagged fields) goes through `Clipboard.copy(text, { concealed: true })` — the pasteboard carries the `org.nspasteboard.ConcealedType` marker, which Tinycast's clipboard-history poller skips unconditionally (ConcealedType / TransientType / com.apple.is-sensitive). At countdown expiry the clipboard is cleared only if it still holds that value; copy anything else in the meantime and it's left alone. Non-sensitive values (usernames) are plain copies and do land in clipboard history, matching the Alfred workflow.
- **Keychain trust model**: two kinds of entries — enpass-cli's derived key in Touch ID mode (service=`enpass-cli`) and the master password itself in Keychain mode (service=`raycast-enpass`) — **neither sets `kSecAttrAccessControl`**: while the login keychain is unlocked, any process running as your user can read them (reading via the `security` tool is prompt-free — verified). This is the same trust model as "master password in the login keychain", common to password-manager workflows like alfred-enpass — **do not use on a Mac whose account you share**. Also: for the millisecond lifetime of the write, the master password appears in the `security` process's argument list — Apple's `security` tool offers no stdin/env alternative; alfred-enpass accepts the same tradeoff.
- **MASTERPW mode**: the master password lives in the child process's environment for under a second; same-user processes could theoretically read it there. enpass-cli has no other non-interactive way to receive it.
- **Links**: only `http`/`https` is opened; `javascript:`, `file:` and friends are refused.
- **IPC**: only enpass-cli's stdout JSON is consumed; passwords never appear in any enpass-cli command-line argument (the single exception is the `security -w` **write** in Keychain mode, above).
- **No network**: the extension itself makes no network requests; vault reading is fully local.

## Install (Tinycast)

Verified against the [Tinycast extensions doc](https://github.com/abue-ammar/tinycast/blob/main/docs/features/extensions.md):

1. Install the backend: `brew install enpass-cli`
2. **Settings → Extensions**: turn extensions on (off by default; enabling consents to running third-party code).
3. **Install New → Install from GitHub** → paste `MrSissel/tinycast-enpass`. Tinycast clones, installs dependencies and runs `ray build` itself; only the build is kept. Requires Node plus npm/pnpm/Yarn/Bun on the Mac.
4. **Settings → Extensions → Enpass**: set an Alias on each command row (Tinycast's keyword equivalent): `enp` / `enp-lock` / `enp-refresh`; a global hotkey recorder sits beside it. The extension title "Enpass" is itself a search term for all its commands.
5. First run self-checks before unlocking: missing CLI or missing `vault.enpassdb` produces actionable guidance (e.g. `brew install enpass-cli`, Enpass → Settings → Advanced → Data Location) instead of silent failure.

Or build from source and **Install New → Add from folder** → select the **`dist/` directory** (not the project root):

```sh
git clone https://github.com/MrSissel/tinycast-enpass.git
cd tinycast-enpass
npm install
npm run build   # produces dist/: package.json + three <command>.js + assets/
```

**Updates**: installs don't auto-update — repeat the same install step to pick up a new version (preferences carry over). Release zips (`enpass-tinycast.zip`) on the Releases page unzip to the same `dist/` layout.

## Development

```sh
npm run test        # vitest: snapshot parsing / TOTP / path detection / clipboard countdown + live test-vault runs
npm run typecheck   # tsc --noEmit
npm run build       # ray build -e dist -o dist → dist/
```

Tests only ever touch the public test vault shipped with enpass-cli (`test/fixtures/testvault`, password `absolutely-No-clue`) — never a real vault.

## Known limitations

- **Every unlock / refresh prompts once** (Touch ID scan or master password entry in non-Keychain modes) — enpass-cli has no session cache. In Keychain mode, re-unlocks are silent, so auto-lock and ⌘R become frictionless there.
- **Sessions end with the command UI**: Tinycast destroys the JSContext when you leave a command, so leaving the search locks the vault. The in-session auto-lock timer only matters while the command stays open, but in Keychain mode the auto-lock window also applies across launches: a timestamp of the last unlock is kept at `$TMPDIR/raycast-enpass-unlock-stamp` (0600, no secrets), and once the window has passed, reopening asks for the master password instead of unlocking silently.
- **The clipboard countdown only runs while the command session lives**: copy a password and leave immediately, and the JSContext dies with the timer — the clipboard won't be auto-cleared (the value still carries the concealed marker, so Tinycast history skips it regardless). Keep the palette open when the countdown matters.
- **Paste goes through the system clipboard** (Raycast API's `Clipboard.paste` works that way); the transient content may be captured by clipboard managers. Use the default copy action (concealed) if that bothers you.
- **On stock Raycast, copied secrets land in Clipboard History** (verified 2.4.1–2.7.3): RC's `Clipboard.copy(…, { concealed: true })` marks the pasteboard `AutoGeneratedType` but not `ConcealedType`, and RC's history only filters the latter — contradicting RC's own API docs. Tinycast is not affected. Delete any stray entries from Clipboard History by hand.
- **Forms don't auto-focus on Tinycast** (verified 0.11.12–0.11.19; [upstream issue](https://github.com/abue-ammar/tinycast/issues/1495) declined — considered permanent): focus there only follows a *change* of the palette selection, which a one-field form can never produce — so the Keychain-mode unlock form carries a **Remember in Keychain** checkbox (also a real per-unlock opt-out of password persistence). Press ↓ then ↑ (or ⇥ then ⇧⇥) to land the caret in the password field without the mouse. Stock Raycast focuses it directly. ↩ submits from non-text controls, ⌘↩ from text fields — platform behavior.
- TOTP uses the standard 30-second period and 6 digits (as does enpass-cli).
- Trashed items (when Trash is enabled) render like any other entry.

## Real-vault acceptance checklist

> Verify against your real vault (read-only throughout — nothing is ever written).

- [ ] **First enrollment (Touch ID method)**: `enp` → locked screen → **Use Master Password…** → enter the Enpass master password once → unlocked (derived key written to the Keychain).
- [ ] **Unlock (Touch ID)**: `enp` → ↩ → system Touch ID prompt → **scan your finger** (don't click "Use Password") → all items listed; searching within the same session doesn't re-prompt.
- [ ] **Keychain mode (default)**: `enp` → enter the master password once → quit and re-enter `enp` → **straight to the list, no prompt**; after `enp-lock` the form is back.
- [ ] **Search**: keywords filter by title / username / category / website; no plaintext password anywhere.
- [ ] **Copy password**: ↩ → pastes correctly at the target; the password does **not** appear in Tinycast's clipboard history.
- [ ] **Clipboard countdown**: keep the command open — the clipboard clears after 30 s; copy something else in the meantime and it isn't cleared.
- [ ] **Copy username**: ⌘↩ → pastes correctly.
- [ ] **TOTP**: the ⌥↩ 6-digit code matches what Enpass shows right now (compare inside the same 30 s window).
- [ ] **Open website**: ⌃↩ opens the right URL in the default browser; the action is absent on entries without a URL.
- [ ] **Field detail**: ⇧↩ → sensitive fields masked; ↩ copies a field, ⌘↩ pastes it.
- [ ] **In-place refresh**: ⌘R → re-verify → list rebuilt; rename an entry in Enpass, then ⌘R shows the new title.
- [ ] **Lock (both paths)**: ① ⌘L in the list → back to the unlock screen (Keychain mode with a timed auto-lock: the master password form appears, a silent reopen would be a bug); ② `enp-lock` → HUD → the next `enp` requires re-auth. Leaving the palette (Esc) and re-entering also requires it.
- [ ] **Refresh**: `enp-refresh` → re-verify (silent in Keychain mode) → lands directly in the search list.
- [ ] **Master-password mode** (optional): switch the preference to MASTERPW → `enp` shows the form → a wrong password fails with a short clear error, the right one unlocks; the password never shows up in `ps`/Activity Monitor command lines.

## License

MIT. Unofficial and not affiliated with or endorsed by the makers of Enpass, Raycast, or Tinycast; all product names are trademarks of their respective owners.

// Clipboard auto-clear with injectable side effects, so the countdown logic is
// unit-testable without touching the real pasteboard.

export interface ClipboardEffects {
  readText(): Promise<string | undefined>;
  clear(): Promise<void>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PendingClear {
  cancel(): void;
  flushNow(): Promise<void>; // run the check immediately (used by Lock Vault)
}

// Schedules "clear the clipboard in `seconds` if it still holds `text`".
// If the user copied something else in the meantime, the clipboard is left alone.
export function scheduleClipboardClear(
  text: string,
  seconds: number,
  fx: ClipboardEffects,
): PendingClear {
  let done = false;
  const run = async () => {
    if (done) return;
    done = true;
    if ((await fx.readText()) === text) await fx.clear();
  };
  const handle = fx.setTimeout(run, seconds * 1000);
  return {
    cancel() {
      done = true;
      fx.clearTimeout(handle);
    },
    flushNow: async () => {
      fx.clearTimeout(handle);
      await run();
    },
  };
}

// At most one pending clear: copying a new secret supersedes the previous one.
// The copied text lives only in this module's closure — never persisted.
export class ClipboardGuard {
  private pending: PendingClear | null = null;

  constructor(private fx: ClipboardEffects) {}

  registerCopied(text: string, seconds: number | null): void {
    this.pending?.cancel();
    this.pending =
      seconds === null ? null : scheduleClipboardClear(text, seconds, this.fx);
  }

  // Lock Vault: immediately clear the clipboard if it still holds the last
  // secret, then forget everything.
  async lock(): Promise<void> {
    const p = this.pending;
    this.pending = null;
    await p?.flushNow();
  }
}

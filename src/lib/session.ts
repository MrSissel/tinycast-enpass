import { VaultItem } from "./item";

// The vault snapshot lives ONLY in this module's memory: no LocalStorage, no
// disk, no logs. Lock Vault, auto-lock and process exit all end it.

export type AutoLock = "never" | "afterEachUse" | number; // number = minutes

let snapshot: VaultItem[] | null = null;

let timer: NodeJS.Timeout | null = null;
let autoLock: AutoLock = "never";
let onLock: (() => Promise<void>) | null = null; // clipboard guard hook

const listeners: Array<() => void> = [];

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function getSnapshot(): VaultItem[] | null {
  return snapshot;
}

export function isUnlocked(): boolean {
  return snapshot !== null;
}

export function setSnapshot(items: VaultItem[], lockMode: AutoLock, onLockHook?: () => Promise<void>): void {
  clearTimer();
  snapshot = items;
  autoLock = lockMode;
  onLock = onLockHook ?? null;
  if (typeof lockMode === "number") {
    timer = setTimeout(() => void lock(), lockMode * 60_000);
  }
  notify();
}

// Wipes the snapshot and every sensitive side channel (pending clipboard clear).
export async function lock(): Promise<void> {
  clearTimer();
  snapshot = null;
  const hook = onLock;
  onLock = null;
  notify();
  await hook?.();
}

// Called after each copy/paste action; "afterEachUse" mode locks immediately.
export async function afterUse(): Promise<void> {
  if (autoLock === "afterEachUse") await lock();
}

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

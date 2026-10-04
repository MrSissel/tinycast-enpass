import { describe, expect, it } from "vitest";
import { ClipboardEffects, ClipboardGuard } from "../src/lib/clipboard";

function fakeClipboard() {
  let content: string | undefined;
  let scheduled: { fn: () => void; ms: number } | null = null;
  const fx: ClipboardEffects = {
    readText: async () => content,
    clear: async () => {
      content = undefined;
    },
    setTimeout: (fn, ms) => {
      scheduled = { fn, ms };
      return scheduled;
    },
    clearTimeout: (h) => {
      if (h === scheduled) scheduled = null;
    },
  };
  return {
    fx,
    set: (v: string | undefined) => (content = v),
    get: () => content,
    fire: async () => {
      const s = scheduled;
      scheduled = null;
      await s?.fn();
    },
    delayMs: () => scheduled?.ms ?? null,
  };
}

describe("clipboard auto-clear", () => {
  it("clears the clipboard after the countdown when content is unchanged", async () => {
    const c = fakeClipboard();
    const guard = new ClipboardGuard(c.fx);
    c.set("s3cret");
    guard.registerCopied("s3cret", 30);
    expect(c.delayMs()).toBe(30_000);
    await c.fire();
    expect(c.get()).toBeUndefined();
  });

  it("leaves the clipboard alone when the user copied something else", async () => {
    const c = fakeClipboard();
    const guard = new ClipboardGuard(c.fx);
    guard.registerCopied("s3cret", 30);
    c.set("unrelated text");
    await c.fire();
    expect(c.get()).toBe("unrelated text");
  });

  it("never mode schedules nothing", () => {
    const c = fakeClipboard();
    new ClipboardGuard(c.fx).registerCopied("s3cret", null);
    expect(c.delayMs()).toBeNull();
  });

  it("a new copy supersedes the previous pending clear", async () => {
    const c = fakeClipboard();
    const guard = new ClipboardGuard(c.fx);
    guard.registerCopied("first", 30);
    c.set("second");
    guard.registerCopied("second", 10);
    expect(c.delayMs()).toBe(10_000);
    await c.fire();
    expect(c.get()).toBeUndefined(); // cleared because clipboard still held "second"
  });

  it("lock() clears immediately when the clipboard still holds the secret", async () => {
    const c = fakeClipboard();
    const guard = new ClipboardGuard(c.fx);
    c.set("s3cret");
    guard.registerCopied("s3cret", 30);
    await guard.lock();
    expect(c.get()).toBeUndefined();
    expect(c.delayMs()).toBeNull();
  });
});

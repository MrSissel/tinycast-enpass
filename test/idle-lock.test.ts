import { describe, expect, it } from "vitest";
import { idleLockExpired } from "../src/lib/idle-lock";

const NOW = 1_000_000_000_000;

describe("idle lock gate", () => {
  it("never and afterEachUse never gate the silent unlock", () => {
    const ancient = () => 0;
    expect(idleLockExpired("never", ancient, NOW)).toBe(false);
    expect(idleLockExpired("afterEachUse", ancient, NOW)).toBe(false);
  });

  it("a stamp inside the window keeps the silent unlock allowed", () => {
    const fresh = () => NOW - 29 * 60_000;
    expect(idleLockExpired(30, fresh, NOW)).toBe(false);
  });

  it("a stamp exactly at the window edge is still allowed", () => {
    const edge = () => NOW - 30 * 60_000;
    expect(idleLockExpired(30, edge, NOW)).toBe(false);
  });

  it("a stamp older than the window requires the password again", () => {
    const stale = () => NOW - 31 * 60_000;
    expect(idleLockExpired(30, stale, NOW)).toBe(true);
  });

  it("a missing stamp is trusted (first run after upgrade)", () => {
    expect(idleLockExpired(30, () => null, NOW)).toBe(false);
  });
});

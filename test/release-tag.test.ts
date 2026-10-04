import { describe, expect, it } from "vitest";
import { computeNextTag } from "../scripts/release.mjs";

describe("computeNextTag", () => {
  it("beta: increments the suffix on a beta tag", () => {
    expect(computeNextTag("v0.1.0-beta.3", "beta")).toBe("v0.1.0-beta.4");
  });

  it("beta: opens a new minor beta line after a stable tag", () => {
    expect(computeNextTag("v0.1.0", "beta")).toBe("v0.2.0-beta.1");
  });

  it("stable: cuts the base version from a beta tag", () => {
    expect(computeNextTag("v0.1.0-beta.3", "stable")).toBe("v0.1.0");
  });

  it("stable: bumps minor from a stable tag", () => {
    expect(computeNextTag("v0.1.0", "stable")).toBe("v0.2.0");
  });

  it("handles no tags yet", () => {
    expect(computeNextTag(null, "beta")).toBe("v0.1.0-beta.1");
    expect(computeNextTag(null, "stable")).toBe("v0.1.0");
  });
});

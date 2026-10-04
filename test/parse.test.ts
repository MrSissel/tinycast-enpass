import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSnapshot } from "../src/lib/enpass";
import {
  isSensitiveField,
  passwordOf,
  safeHttpUrl,
  urlOf,
  usernameOf,
} from "../src/lib/item";

// Fixture: real `enpass-cli -detailed -json -sort show` output of the public
// test vault (hazcod/enpass-cli v1.14.0, password "absolutely-No-clue").
const fixture = readFileSync(`${__dirname}/fixtures/snapshot.json`, "utf8");

describe("parseSnapshot", () => {
  const items = parseSnapshot(fixture);

  it("parses the test vault snapshot", () => {
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Whatever");
    expect(items[0].category).toBe("login");
    expect(items[0].fields).toHaveLength(13);
  });

  it("derives username, password and url from fields", () => {
    expect(usernameOf(items[0])).toBe("johndoe@whatever.com");
    expect(passwordOf(items[0])).toBe("noIdeaata11");
    expect(urlOf(items[0])).toBe("https://www.whatever.com"); // type "text", label "URL"
  });

  it("rejects non-array output", () => {
    expect(() => parseSnapshot("{}")).toThrow();
    expect(parseSnapshot('[{"x":1}]')).toHaveLength(0); // entries without title/fields dropped
  });
});

describe("isSensitiveField", () => {
  it("honours the sensitive flag", () => {
    expect(isSensitiveField({ type: "password", sensitive: true })).toBe(true);
  });

  it("catches unflagged secrets by label/type", () => {
    expect(isSensitiveField({ type: "totp" })).toBe(true);
    expect(isSensitiveField({ type: "text", label: "PIN" })).toBe(true);
    expect(isSensitiveField({ type: "text", label: "Card Number" })).toBe(true);
    expect(isSensitiveField({ type: "text", label: "Recovery Codes" })).toBe(
      true,
    );
  });

  it("does not mask ordinary fields", () => {
    expect(isSensitiveField({ type: "text", label: "URL" })).toBe(false);
    expect(isSensitiveField({ type: "text", label: "Port No." })).toBe(false);
    expect(isSensitiveField({ type: "text", label: "Authentification" })).toBe(
      false,
    );
  });
});

describe("safeHttpUrl", () => {
  it("allows http/https only", () => {
    expect(safeHttpUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
    expect(safeHttpUrl("ftp://example.com")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

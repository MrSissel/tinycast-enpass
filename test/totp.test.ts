import { describe, expect, it } from "vitest";
import { totpCode } from "../src/lib/totp";

// RFC 6238 Appendix B test secret (SHA-1, ASCII "12345678901234567890").
const BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totpCode", () => {
  it("computes RFC 6238 vectors (8-digit values truncated to 6)", () => {
    expect(totpCode(BASE32, 59_000)).toBe("287082"); // 94287082
    expect(totpCode(BASE32, 1_111_111_109_000)).toBe("081804"); // 07081804
  });

  it("accepts otpauth:// URIs", () => {
    expect(totpCode(`otpauth://totp/Example?secret=${BASE32}`, 59_000)).toBe("287082");
  });

  it("tolerates lowercase, spaces and dashes in bare secrets", () => {
    expect(totpCode("gezd gnbv-gy3t qojq-gezd gnbv-gy3t qojq", 59_000)).toBe("287082");
  });

  it("returns null for garbage instead of throwing", () => {
    expect(totpCode("!!!not-base32!!!")).toBeNull();
    expect(totpCode("")).toBeNull();
  });
});

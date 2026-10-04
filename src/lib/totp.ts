import * as OTPAuth from "otpauth";

// Current RFC 6238 code for a TOTP field value. Accepts an otpauth:// URI or a
// bare base32 secret (Enpass stores both shapes). Returns null when unparseable.
export function totpCode(raw: string, timestamp: number = Date.now()): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    if (value.startsWith("otpauth://")) {
      return OTPAuth.URI.parse(value).generate({ timestamp });
    }
    const secret = OTPAuth.Secret.fromBase32(value.replace(/[\s-]+/g, "").toUpperCase());
    return new OTPAuth.TOTP({ secret }).generate({ timestamp });
  } catch {
    return null;
  }
}

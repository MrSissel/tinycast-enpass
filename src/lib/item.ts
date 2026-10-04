// Vault item model + pure field derivations. No @raycast/api imports: unit-testable.

export interface VaultField {
  type: string;
  label?: string;
  value?: string;
  sensitive?: boolean;
}

export interface VaultItem {
  uuid: string;
  title: string;
  subtitle?: string;
  category?: string;
  fields: VaultField[];
}

export const MASK = "••••••••";

// Labels that mark secrets even when enpass-cli does not set `sensitive`.
// Over-masking is the safe direction: worst case a harmless field is hidden.
const SENSITIVE_RE = /pass|secret|totp|pin|cvv|cvc|card\s*(no|num|number)|recovery|security\s*code/i;

export function isSensitiveField(field: VaultField): boolean {
  if (field.sensitive === true) return true;
  return SENSITIVE_RE.test(`${field.type} ${field.label ?? ""}`);
}

export function firstField(item: VaultItem, pred: (f: VaultField) => boolean): VaultField | undefined {
  return item.fields.find((f) => f.value && pred(f));
}

export function passwordOf(item: VaultItem): string | undefined {
  return firstField(item, (f) => f.type === "password")?.value;
}

export function usernameOf(item: VaultItem): string | undefined {
  return firstField(item, (f) => f.type === "username")?.value ?? item.subtitle ?? undefined;
}

const URL_LABEL_RE = /^(url|web\s?site|homepage)$/i;

export function urlOf(item: VaultItem): string | undefined {
  return firstField(
    item,
    (f) => f.type === "url" || f.type === "website" || URL_LABEL_RE.test(f.label ?? ""),
  )?.value;
}

export function totpSecretOf(item: VaultItem): string | undefined {
  return firstField(item, (f) => f.type === "totp")?.value;
}

// Only http/https may ever be opened. Anything else (javascript:, file:, …) is refused.
export function safeHttpUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function searchKeywords(item: VaultItem): string[] {
  const kw = [item.category, usernameOf(item), urlOf(item)];
  for (const f of item.fields) {
    if (f.type === "url" || f.type === "website") kw.push(f.value);
  }
  return kw.filter((s): s is string => !!s);
}

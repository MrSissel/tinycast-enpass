import { Clipboard, open, showHUD, showToast, Toast } from "@raycast/api";
import { ClipboardGuard } from "./clipboard";
import { safeHttpUrl } from "./item";
import { clearSeconds, prefs } from "./prefs";
import { afterUse } from "./session";

export const clipboardGuard = new ClipboardGuard({
  readText: () => Clipboard.readText(),
  clear: () => Clipboard.clear(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
});

// Sensitive values ALWAYS go through Clipboard.copy(…, { concealed: true }) so
// Tinycast's clipboard-history poller skips them (ConcealedType marker).
export async function copyValue(
  text: string,
  label: string,
  sensitive: boolean,
): Promise<void> {
  if (sensitive) {
    await Clipboard.copy(text, { concealed: true });
    clipboardGuard.registerCopied(text, clearSeconds(prefs()));
  } else {
    await Clipboard.copy(text);
  }
  await showHUD(`${label} copied`);
  await afterUse();
}

export async function pasteValue(text: string, label: string): Promise<void> {
  await Clipboard.paste(text);
  await showHUD(`${label} pasted`);
  await afterUse();
}

export async function openWebsite(raw: string | undefined): Promise<void> {
  const url = safeHttpUrl(raw);
  if (!url) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Not opened",
      message: "Only http/https URLs are allowed.",
    });
    return;
  }
  await open(url);
  await afterUse();
}

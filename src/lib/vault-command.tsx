import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { copyValue, openWebsite, pasteValue } from "./actions";
import { expireUnlock } from "./idle-lock";
import {
  isSensitiveField,
  MASK,
  passwordOf,
  safeHttpUrl,
  searchKeywords,
  totpSecretOf,
  urlOf,
  usernameOf,
  VaultItem,
} from "./item";
import { prefs } from "./prefs";
import { getSnapshot, lock, subscribe } from "./session";
import { totpCode } from "./totp";
import { LockedList } from "./unlock-view";

// Tinycast runtime model (docs/features/extensions.md): one JSContext per
// command launch, discarded when you leave the command — module state never
// survives into the next run. So the snapshot's lifetime IS this command's
// session: leaving the palette locks the vault for free. Both Search Vault and
// Refresh Vault render this; Refresh just auto-starts the unlock prompt.

// ⇧⌘↩: the one Return chord left (⌘/⌥/⌃/⇧ are taken) that both hosts
// dispatch — fn↩ was Tinycast-only and renders as an untriggerable tofu
// box on stock Raycast.
const SECONDARY_RETURN: Keyboard.Shortcut = {
  modifiers: ["cmd", "shift"],
  key: "return",
};

const ICON_BY_CATEGORY: Record<string, Icon> = {
  login: Icon.Key,
  creditcard: Icon.CreditCard,
  finance: Icon.CreditCard,
  identity: Icon.Person,
  note: Icon.Document,
  securenote: Icon.Document,
  password: Icon.Lock,
};

export function VaultCommand(props: {
  autoStart: boolean;
  verb: "unlocked" | "refreshed";
}) {
  const [snapshot, setSnapshot] = useState(getSnapshot());
  const [isRefreshing, setIsRefreshing] = useState(false);
  useEffect(() => subscribe(() => setSnapshot(getSnapshot())), []);

  if (!snapshot || isRefreshing) {
    return (
      <LockedList
        autoStart={props.autoStart || isRefreshing}
        onSuccess={async (n) => {
          setIsRefreshing(false);
          // showToast, not showHUD: showHUD dismisses the window on stock
          // Raycast, leaving the freshly unlocked list hidden.
          await showToast({
            style: Toast.Style.Success,
            title: `Vault ${props.verb} — ${n} items`,
          });
        }}
      />
    );
  }
  return (
    <List searchBarPlaceholder="Search Enpass vault…">
      {snapshot.map((item) => (
        <VaultListItem
          key={item.uuid}
          item={item}
          onRefresh={() => setIsRefreshing(true)}
        />
      ))}
    </List>
  );
}

function VaultListItem({
  item,
  onRefresh,
}: {
  item: VaultItem;
  onRefresh: () => void;
}) {
  const password = passwordOf(item);
  const username = usernameOf(item);
  const totpSecret = totpSecretOf(item);
  const url = urlOf(item);
  const primary = prefs().primaryAction;

  const copyPassword = () => password && copyValue(password, "Password", true);
  const pastePassword = async () => {
    if (!password) return;
    await pasteValue(password, "Password");
  };
  const copyTotp = async () => {
    if (!totpSecret) return;
    const code = totpCode(totpSecret);
    if (code === null) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid TOTP secret on this entry",
      });
      return;
    }
    await copyValue(code, "One-time code", true);
  };

  return (
    <List.Item
      icon={ICON_BY_CATEGORY[(item.category ?? "").toLowerCase()] ?? Icon.Lock}
      title={item.title}
      subtitle={username}
      accessories={item.category ? [{ text: item.category }] : []}
      keywords={searchKeywords(item)}
      actions={
        <ActionPanel>
          {password &&
            (primary === "copy" ? (
              <Action
                title="Copy Password"
                icon={Icon.Clipboard}
                onAction={copyPassword}
              />
            ) : (
              <Action
                title="Paste Password"
                icon={Icon.Clipboard}
                onAction={pastePassword}
              />
            ))}
          {password &&
            (primary === "copy" ? (
              <Action
                title="Paste Password"
                icon={Icon.Clipboard}
                shortcut={SECONDARY_RETURN}
                onAction={pastePassword}
              />
            ) : (
              <Action
                title="Copy Password"
                icon={Icon.Clipboard}
                shortcut={SECONDARY_RETURN}
                onAction={copyPassword}
              />
            ))}
          {username && (
            <Action
              title="Copy Username"
              icon={Icon.Person}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              onAction={() => copyValue(username, "Username", false)}
            />
          )}
          {totpSecret && (
            <Action
              title="Copy One-Time Code"
              icon={Icon.Clock}
              shortcut={{ modifiers: ["opt"], key: "return" }}
              onAction={copyTotp}
            />
          )}
          {safeHttpUrl(url) && (
            <Action
              title="Open Website"
              icon={Icon.Globe}
              shortcut={{ modifiers: ["ctrl"], key: "return" }}
              onAction={() => openWebsite(url)}
            />
          )}
          <Action.Push
            title="Show Fields"
            icon={Icon.Document}
            shortcut={{ modifiers: ["shift"], key: "return" }}
            target={<FieldsList item={item} />}
          />
          <ActionPanel.Section title="Vault">
            <Action
              title="Refresh Vault"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={onRefresh}
            />
            <Action
              title="Lock Vault"
              icon={Icon.Lock}
              shortcut={{ modifiers: ["cmd"], key: "l" }}
              onAction={() => {
                // End the idle window first, so the Keychain-mode re-unlock
                // after the wipe asks for the master password instead of
                // silently reopening (which looked exactly like a refresh).
                expireUnlock();
                void lock();
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function FieldsList({ item }: { item: VaultItem }) {
  const fields = item.fields.filter((f) => f.value && f.type !== "section");
  return (
    <List navigationTitle={`Fields — ${item.title}`}>
      {fields.map((f, i) => {
        const sensitive = isSensitiveField(f);
        const value = f.value ?? "";
        const url = safeHttpUrl(value);
        const liveCode = f.type === "totp" ? totpCode(value) : null;
        return (
          <List.Item
            key={`${f.label ?? f.type}-${i}`}
            icon={sensitive ? Icon.EyeDisabled : Icon.Eye}
            title={f.label ?? f.type}
            subtitle={sensitive ? MASK : value}
            accessories={liveCode ? [{ text: `Code: ${liveCode}` }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Copy Field"
                  icon={Icon.Clipboard}
                  onAction={() =>
                    copyValue(value, f.label ?? "Field", sensitive)
                  }
                />
                <Action
                  title="Paste Field"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => pasteValue(value, f.label ?? "Field")}
                />
                {url && (
                  <Action
                    title="Open Website"
                    icon={Icon.Globe}
                    shortcut={{ modifiers: ["ctrl"], key: "return" }}
                    onAction={() => openWebsite(value)}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

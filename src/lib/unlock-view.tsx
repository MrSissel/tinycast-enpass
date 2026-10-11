import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { prefs } from "./prefs";
import { PasswordRequiredError, unlock } from "./unlock";

// enpass-cli failure modes → actionable text. Raw logrus lines never surface.
export function unlockErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Keep messages SHORT: Tinycast grows the palette to fit long toast text.
  if (/invalid password|unsupported database version/i.test(msg)) {
    return "Wrong master password — try again.";
  }
  // enpass-cli uses LAPolicyDeviceOwnerAuthenticationWithBiometrics: the
  // prompt's "Use Password" button only produces an error — scanning is the
  // only way through, cancelling lands here too.
  if (/biometric authentication failed/i.test(msg)) {
    return "Touch ID failed or was cancelled. Scan your fingerprint (the 'Use Password' button is unsupported by enpass-cli). First time? Press ⌘↩ to enroll with your master password.";
  }
  // First-ever biometric run: Touch ID succeeded but the Keychain holds no key
  // yet, and enpass-cli's interactive password prompt has no TTY here.
  if (/could not prompt for vault password/i.test(msg)) {
    return "First-time Touch ID setup: press ⌘↩ and enter your Enpass master password once to enroll.";
  }
  return msg;
}

export async function runUnlock(
  masterPassword: string | undefined,
  onSuccess: (itemCount: number) => Promise<void>,
  remember = true,
): Promise<void> {
  try {
    const itemCount = await unlock(masterPassword, remember);
    await onSuccess(itemCount);
  } catch (e) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Unlock failed",
      message: unlockErrorText(e),
    });
  }
}

// In Touch ID mode this doubles as first-time enrollment: spawned with
// MASTERPW set, enpass-cli skips store.Read (no fingerprint needed this once),
// unlocks with the password and writes the derived key to the Keychain —
// afterwards Touch ID alone unlocks.

export function PasswordUnlockForm(props: {
  pushed: boolean;
  onSuccess: (itemCount: number) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const method = prefs().unlockMethod;
  return (
    <Form
      isLoading={isUnlocking}
      navigationTitle={
        method === "touchid"
          ? "Master Password (Touch ID Setup)"
          : "Unlock with Master Password"
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={method === "touchid" ? "Enroll & Unlock" : "Unlock Vault"}
            onSubmit={async (values: {
              password?: string;
              remember?: boolean;
            }) => {
              const password = values.password ?? "";
              if (!password) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Master password required",
                });
                return;
              }
              setIsUnlocking(true);
              // The password is passed to enpass-cli via the MASTERPW environment
              // variable of that single spawn — never an argument, never stored.
              await runUnlock(
                password,
                async (n) => {
                  if (props.pushed) pop();
                  await props.onSuccess(n);
                },
                values.remember ?? true,
              );
              setIsUnlocking(false);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField
        id="password"
        title="Master Password"
        placeholder="Enpass master password"
        autoFocus
      />
      {
        // Tinycast moves form focus only when the palette selection *changes*,
        // which a one-field form can never do (upstream wontfix:
        // abue-ammar/tinycast#1495) — the password field needs a sibling so
        // ↓↑/⇥ can carry focus onto it. The checkbox earns its keep as a real
        // per-unlock opt-out, not just a focus rung.
        method === "masterpw-keychain" && (
          <Form.Checkbox
            id="remember"
            title="Remember"
            label="Store in Keychain — afterwards enp opens instantly"
            defaultValue={true}
          />
        )
      }
      <Form.Description
        text={
          method === "touchid"
            ? "First-time enrollment: enpass-cli stores the derived vault key in your macOS Keychain (service 'enpass-cli'); afterwards Touch ID alone unlocks. Passed via the MASTERPW environment variable, never stored by this extension. Press ⌘↩ to unlock."
            : method === "masterpw-keychain"
              ? "Stored in your login Keychain after a success (service 'raycast-enpass'); enp-lock removes it again. Press ⌘↩ to unlock. On Tinycast: if the password field has no caret, press ↓ then ↑."
              : "Used once for this unlock via the MASTERPW environment variable. Never stored, never on the command line. Press ⌘↩ to unlock."
        }
      />
    </Form>
  );
}

// NOTE: the unlock action must be a real List.Item — List.EmptyView actions
// don't fire under Tinycast (↩ on an empty screen does nothing there).
export function LockedList(props: {
  autoStart: boolean;
  onSuccess: (itemCount: number) => Promise<void>;
}) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const method = prefs().unlockMethod;

  const unlockTouchId = async () => {
    setIsUnlocking(true);
    await runUnlock(undefined, props.onSuccess);
    setIsUnlocking(false);
  };

  useEffect(() => {
    if (props.autoStart && method === "touchid") void unlockTouchId();
  }, []);

  if (method === "masterpw-keychain") {
    return <KeychainUnlock onSuccess={props.onSuccess} />;
  }

  // Master-password mode renders the form AS the command's root screen, not
  // via Action.Push: a pushed form only adds a navigation step on top.
  if (method === "masterpw") {
    return <PasswordUnlockForm pushed={false} onSuccess={props.onSuccess} />;
  }

  return (
    <List isLoading={isUnlocking} searchBarPlaceholder="Vault locked">
      <List.Item
        icon={Icon.Lock}
        title="Unlock with Touch ID"
        subtitle="Scan your fingerprint — searching afterwards is instant"
        actions={
          <ActionPanel>
            <Action
              title="Unlock with Touch ID"
              icon={Icon.Lock}
              onAction={unlockTouchId}
            />
          </ActionPanel>
        }
      />
      <List.Item
        icon={Icon.Keyboard}
        title="Use Master Password…"
        subtitle="Type your Enpass master password — first use also enrolls Touch ID"
        actions={
          <ActionPanel>
            <Action.Push
              title="Use Master Password…"
              icon={Icon.Keyboard}
              target={<PasswordUnlockForm pushed onSuccess={props.onSuccess} />}
            />
          </ActionPanel>
        }
      />
      <List.EmptyView
        icon={Icon.Lock}
        title="Vault Locked"
        description="Clear the search field to get back to the unlock action."
      />
    </List>
  );
}

// masterpw-keychain: one silent unlock attempt from the stored Keychain item
// (prompt-free); only when it is missing or stale does the form appear.
function KeychainUnlock(props: {
  onSuccess: (itemCount: number) => Promise<void>;
}) {
  const [needsPassword, setNeedsPassword] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        await props.onSuccess(await unlock());
      } catch (e) {
        if (!(e instanceof PasswordRequiredError)) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Unlock failed",
            message: unlockErrorText(e),
          });
        }
        setNeedsPassword(true);
      }
    })();
  }, []);

  if (needsPassword)
    return <PasswordUnlockForm pushed={false} onSuccess={props.onSuccess} />;
  return (
    <List isLoading>
      <List.EmptyView icon={Icon.Lock} title="Unlocking…" />
    </List>
  );
}

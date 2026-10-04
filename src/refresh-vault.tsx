import { VaultCommand } from "./lib/vault-command";

// Refresh = discard the old snapshot and rebuild it from the vault file. Under
// Tinycast's one-context-per-command model the old snapshot is already gone
// when this command boots, so refreshing IS unlocking again — afterwards we
// land directly in the search list. Inside Search Vault, ⌘R rebuilds the
// snapshot without leaving the command.
export default function RefreshVault() {
  return <VaultCommand autoStart hudVerb="refreshed" />;
}

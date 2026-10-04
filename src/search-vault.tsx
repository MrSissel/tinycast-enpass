import { VaultCommand } from "./lib/vault-command";

export default function SearchVault() {
  return <VaultCommand autoStart={false} hudVerb="unlocked" />;
}

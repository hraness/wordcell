import { AgentCommandTabs, AgentSetupPrompt } from "@hraness/design-kit/react";
import { SETUP_PROMPT, SETUP_VAULT_PATH, setupTargets } from "./setup-prompt";

export function SetupLinks() {
  const targets = setupTargets(SETUP_PROMPT);
  const links = targets.filter((target) => target.kind === "link");
  const commands = targets.filter((target) => target.kind === "command");
  return (
    <div className="wordcell-setup">
      <AgentSetupPrompt label="Set up Wordcell with your coding agent" prompt={SETUP_PROMPT} targets={links} />
      <AgentCommandTabs commands={commands} label="Register the MCP server" />
      <p className="install-note">For manual setup, replace <code>{SETUP_VAULT_PATH}</code> with your vault’s absolute path.</p>
    </div>
  );
}

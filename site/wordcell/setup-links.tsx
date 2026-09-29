import { Terminal } from "./code-block";
import { CopyPromptButton } from "./copy-prompt-button";
import { SETUP_PROMPT, SETUP_VAULT_PATH, setupTargets } from "./setup-prompt";

/* One prompt for the copy button and every assistant link. The prompt
 * installs the release this site has admitted. */
export function SetupLinks() {
  const targets = setupTargets(SETUP_PROMPT);
  return (
    <div className="wordcell-setup">
      <pre className="wordcell-setup__prompt" tabIndex={0}><code>{SETUP_PROMPT}</code></pre>
      <CopyPromptButton prompt={SETUP_PROMPT} />
      <ul className="wordcell-setup__links">
        {targets.map((target) => target.kind === "link" ? (
          <li key={target.id}>
            <a href={target.href}>Open in {target.label}</a>
            <span>{target.note}</span>
          </li>
        ) : null)}
      </ul>
      <p className="install-note">
        ChatGPT and Grok cannot run commands on your computer. They give you each command to run, and the vault then serves a local agent such as Claude Code, Codex, or Cursor.
      </p>
      <p className="install-note">
        In Claude Code or Codex, paste the prompt. With Wordcell installed, you can register the server yourself. Replace <code>{SETUP_VAULT_PATH}</code> with your vault’s absolute path.
      </p>
      {targets.map((target) => target.kind === "command" ? (
        <figure className="wordcell-step" key={target.id}>
          <figcaption>{target.label}</figcaption>
          <Terminal code={target.command} />
        </figure>
      ) : null)}
    </div>
  );
}

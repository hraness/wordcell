"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

const statusText: Readonly<Record<CopyState, string>> = {
  idle: "",
  copied: "Copied the setup prompt",
  failed: "Copy failed; select the prompt above",
};

/* The prompt is already on the page in a <pre>, so the button only saves a
 * selection. Without a clipboard (an insecure origin or a refused permission)
 * the status says so and the text stays selectable. */
export function CopyPromptButton({ prompt }: { readonly prompt: string }) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="wordcell-copy">
      <button className="wordcell-copy__button" onClick={() => void copy()} type="button">
        Copy prompt
      </button>
      <span aria-live="polite" className="wordcell-copy__status" role="status">
        {statusText[state]}
      </span>
    </div>
  );
}

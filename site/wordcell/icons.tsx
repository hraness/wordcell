/* wordcell topic icons — hand-drawn 1.6px strokes on a 24 grid, rendered in
 * currentColor so they inherit the section's accent in every palette. */

const PATHS = {
  /* Files you own — a page with a folded corner and text lines. */
  markdown: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M9 12h6M9 15h6" />
    </>
  ),
  /* A typed ontology — three nodes with labelled edges. */
  kb: (
    <>
      <circle cx="7" cy="7" r="2.6" />
      <circle cx="17" cy="7" r="2.6" />
      <circle cx="12" cy="17" r="2.6" />
      <path d="M9.4 8.4l5.2-1M14.8 9.3l-1.9 5.2M9.3 15.1l-1.4-5.7" />
    </>
  ),
  /* Search by words or meaning — a lens over text. */
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.5 14.5L20 20" />
      <path d="M8.2 10.5h4.6" />
    </>
  ),
  /* Backlinks — two cards aware of each other. */
  backlinks: (
    <>
      <rect height="9" rx="1.5" width="7" x="3.5" y="4" />
      <rect height="9" rx="1.5" width="7" x="13.5" y="11" />
      <path d="M13 8.5h2.5a2 2 0 0 1 2 2v.5M11 15.5H8.5a2 2 0 0 1-2-2V13" />
      <path d="M14.8 6.7L13 8.5l1.8 1.8M9.2 17.3L11 15.5l-1.8-1.8" />
    </>
  ),
  /* History you can inspect — a commit graph. */
  "git-provenance": (
    <>
      <circle cx="7" cy="6" r="2.3" />
      <circle cx="7" cy="18" r="2.3" />
      <circle cx="16" cy="12" r="2.3" />
      <path d="M7 8.3v7.4M9 6.9c4 .8 5.5 2.3 6.5 3.4" />
    </>
  ),
  /* Sources you can reopen — a page arriving in a tray. */
  capture: (
    <>
      <path d="M12 3.5v8M9 8.5l3 3 3-3" />
      <path d="M4.5 13.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
      <path d="M7.5 13.5h9" />
    </>
  ),
  /* Context for a code path — a scoped route through code. */
  scopes: (
    <>
      <path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5" />
      <path d="M12 8.5l.7 2.5" opacity=".9" />
      <circle cx="12.9" cy="13.4" r="1.1" />
    </>
  ),
  /* Publish a selection — a slice leaving the vault. */
  cli: (
    <>
      <rect height="12" rx="1.5" width="13" x="3" y="6" />
      <path d="M3 10h13" />
      <path d="M17.5 12.5h4M19.5 10.5l2 2-2 2" />
    </>
  ),
  /* SDK — a module carrying code braces. */
  sdk: (
    <>
      <rect height="13" rx="2" width="15" x="4.5" y="5.5" />
      <path d="M10 9.5L7.8 12l2.2 2.5M14 9.5l2.2 2.5-2.2 2.5" />
    </>
  ),
  /* Agent skill — a spark inside a rounded tool shape. */
  "agent-skill": (
    <>
      <rect height="14" rx="3" width="14" x="5" y="5" />
      <path d="M12 8.2l1.05 2.75L15.8 12l-2.75 1.05L12 15.8l-1.05-2.75L8.2 12l2.75-1.05z" />
    </>
  ),
} as const;

export type WordcellIconName = keyof typeof PATHS;

export function WordcellIcon({ className, name }: Readonly<{ className?: string; name: WordcellIconName }>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="44"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="44"
    >
      {PATHS[name]}
    </svg>
  );
}

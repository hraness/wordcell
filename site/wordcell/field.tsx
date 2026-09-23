"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/* A muted wall of vault notes behind the hero. The same DOM renders on the
 * server; after hydration a pointer-proximity pass sets --prox on each card,
 * edge label, and edge path so the pointer quietly reveals what is near it.
 * Everything is decorative: aria-hidden, pointer-transparent, reduced-motion
 * collapses drift to a still collage. */

export interface FieldNote {
  readonly id: string;
  readonly type: "person" | "book" | "meeting" | "decision" | "plan" | "concept" | "question" | "idea" | "source";
  readonly title: string;
  /** May contain `[[wikilinks]]`, rendered as vault links. */
  readonly body: string;
  readonly tags?: readonly string[];
  /** Center position as a percentage of the field; may sit past the edges. */
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly width: number;
  readonly drift: readonly [number, number];
  readonly seconds: number;
  readonly delay: number;
  readonly bloom?: boolean;
}

export interface FieldEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly pulse?: boolean;
}

const NOTES: readonly FieldNote[] = [
  {
    id: "mira",
    type: "person",
    title: "Mira Chen",
    body: "Research librarian. Sent the [[hayek]] pointer; prefers calls over email.",
    tags: ["reading-group"],
    x: 12, y: 30, rotate: -1.8, width: 176,
    drift: [10, 14], seconds: 38, delay: -8,
  },
  {
    id: "authority",
    type: "decision",
    title: "Markdown stays the only authority",
    body: "Indexes rebuild; files do not. Whatever ships must read them cold.",
    tags: ["architecture"],
    x: 30, y: 34, rotate: 1.6, width: 196,
    drift: [12, 10], seconds: 42, delay: -21, bloom: true,
  },
  {
    id: "reading-group",
    type: "meeting",
    title: "Reading group — February",
    body: "Pattern Language discussion ran long; Jonas wants the printed edition.",
    x: 47, y: 14, rotate: -1.4, width: 184,
    drift: [9, 12], seconds: 40, delay: -5,
  },
  {
    id: "selective-publish",
    type: "decision",
    title: "Publish only the selected slice",
    body: "The site renders the chosen neighborhood. The vault itself stays private.",
    tags: ["release"],
    x: 64, y: 44, rotate: -1.2, width: 194,
    drift: [11, 13], seconds: 45, delay: -14,
  },
  {
    id: "stigmergy",
    type: "concept",
    title: "Stigmergy",
    body: "Coordination through traces in the environment, not meetings.",
    x: 80, y: 16, rotate: 1.8, width: 164,
    drift: [13, 9], seconds: 44, delay: -30,
  },
  {
    id: "pattern-language",
    type: "book",
    title: "A Pattern Language — Alexander",
    body: "\u201CEach pattern depends both on the smaller patterns it contains and the larger patterns within which it is contained.\u201D",
    x: 55, y: 62, rotate: 0.8, width: 200,
    drift: [8, 11], seconds: 48, delay: -26,
  },
  {
    id: "half-life",
    type: "concept",
    title: "Half-life of facts",
    body: "Decay rates differ by domain. Stable notes should not imply stable claims.",
    x: 18, y: 76, rotate: -0.9, width: 180,
    drift: [9, 12], seconds: 41, delay: -19,
  },
  {
    id: "garden-office",
    type: "plan",
    title: "Garden office — spring",
    body: "Desk by the north window. Shelves after Jonas sends the wiring quote.",
    tags: ["home"],
    x: 80, y: 72, rotate: -0.6, width: 180,
    drift: [14, 8], seconds: 39, delay: -2,
  },
  {
    id: "prototypes",
    type: "idea",
    title: "Prototypes over definitions",
    body: "Categories organize around their best example. Name the prototype.",
    x: 84, y: 58, rotate: 1.5, width: 172,
    drift: [9, 15], seconds: 43, delay: -22,
  },
  {
    id: "percolation",
    type: "question",
    title: "Does percolation surface stale links?",
    body: "If it does, that is a review signal, not a bug. See [[graph-authority]].",
    tags: ["maintenance"],
    x: 44, y: 80, rotate: 0.9, width: 186,
    drift: [12, 9], seconds: 35, delay: -15, bloom: true,
  },
  {
    id: "hayek",
    type: "source",
    title: "Hayek — local knowledge",
    body: "\u201CThe particular circumstances of time and place.\u201D Why context cannot be centralized.",
    x: 28, y: 92, rotate: -2.4, width: 170,
    drift: [10, 10], seconds: 36, delay: -33,
  },
  {
    id: "other-minds",
    type: "book",
    title: "Other Minds — Godfrey-Smith",
    body: "Octopus minds as a second experiment in large nervous systems.",
    tags: ["reading-group"],
    x: 66, y: 88, rotate: 2.2, width: 174,
    drift: [10, 12], seconds: 46, delay: -9,
  },
  {
    id: "jonas",
    type: "person",
    title: "Jonas Berg",
    body: "Printer in Lisbon. Two-week turnaround; always ask for the matte stock.",
    tags: ["vendor"],
    x: 92, y: 40, rotate: 0.7, width: 164,
    drift: [8, 13], seconds: 47, delay: -18,
  },
  {
    id: "dev-journal",
    type: "decision",
    title: "Dev journal — context, not memory",
    body: "Re-deriving what [[parser-contract]] already decided is not search.",
    tags: ["infrastructure"],
    x: 66, y: 8, rotate: 1.7, width: 184,
    drift: [11, 10], seconds: 39, delay: -29,
  },
  {
    id: "retro",
    type: "meeting",
    title: "Onboarding retro, Q2",
    body: "New readers found the graph before the commands. Keep the docs that way.",
    x: 8, y: 58, rotate: 1.3, width: 180,
    drift: [9, 11], seconds: 44, delay: -27,
  },
  {
    id: "janeway",
    type: "source",
    title: "Janeway's Immunobiology",
    body: "\u201CThe immune system recognizes self. Everything else gets a response.\u201D",
    tags: ["recognition"],
    x: 36, y: 52, rotate: -1.1, width: 172,
    drift: [10, 11], seconds: 37, delay: -24,
  },
];

const EDGES: readonly FieldEdge[] = [
  { from: "authority", to: "selective-publish", label: "constrains" },
  { from: "mira", to: "hayek", label: "recommended" },
  { from: "mira", to: "reading-group", label: "attends", pulse: true },
  { from: "reading-group", to: "pattern-language", label: "discussed" },
  { from: "reading-group", to: "jonas", label: "prints" },
  { from: "jonas", to: "garden-office", label: "quoted" },
  { from: "retro", to: "authority", label: "informed" },
  { from: "retro", to: "dev-journal", label: "produced" },
  { from: "dev-journal", to: "authority", label: "follows", pulse: true },
  { from: "stigmergy", to: "prototypes", label: "extends" },
  { from: "other-minds", to: "stigmergy", label: "relates" },
  { from: "half-life", to: "percolation", label: "motivates" },
  { from: "janeway", to: "half-life", label: "informs" },
  { from: "pattern-language", to: "garden-office", label: "informs" },
  { from: "percolation", to: "selective-publish", label: "feeds" },
];

/* The developers variant: same wall, code-flavored vault. Still a working
 * vault, not a diagram — scopes, rules, evals, and the people behind them. */
export const DEVELOPER_NOTES: readonly FieldNote[] = [
  {
    id: "parser-contract",
    type: "concept",
    title: "Parser contract",
    body: "Retries stop after three attempts. Callers see a typed failure, not a hang.",
    tags: ["infrastructure"],
    x: 30, y: 32, rotate: 1.6, width: 192,
    drift: [12, 10], seconds: 42, delay: -21, bloom: true,
  },
  {
    id: "agents-rules",
    type: "source",
    title: "AGENTS.md — edit rules",
    body: "Never bypass the gate. Serialize merges. Required stays green.",
    x: 13, y: 52, rotate: -1.8, width: 176,
    drift: [10, 14], seconds: 38, delay: -8,
  },
  {
    id: "repo-scopes",
    type: "concept",
    title: "repository_scopes are exact paths",
    body: "Match directories lexically to descendants. Never infer a scope from Git history.",
    x: 46, y: 14, rotate: -1.4, width: 190,
    drift: [9, 12], seconds: 40, delay: -5,
  },
  {
    id: "eval-rerun",
    type: "decision",
    title: "Eval rerun stays frozen",
    body: "LoCoMo window pinned to the sealed corpus. Rerank evidence lives in a sidecar.",
    tags: ["evals"],
    x: 62, y: 46, rotate: -1.2, width: 194,
    drift: [11, 13], seconds: 45, delay: -14,
  },
  {
    id: "stopped-session",
    type: "plan",
    title: "Stopped-session recovery",
    body: "Resume from the last written note, not the transcript. The vault is the handoff.",
    x: 80, y: 18, rotate: 1.8, width: 178,
    drift: [13, 9], seconds: 44, delay: -30,
  },
  {
    id: "provenance",
    type: "concept",
    title: "Provenance over recall",
    body: "A match without its commit or source is a guess. [[half-life]] applies.",
    x: 56, y: 66, rotate: 0.8, width: 186,
    drift: [8, 11], seconds: 48, delay: -26,
  },
  {
    id: "field-notes",
    type: "source",
    title: "Field notes — search latency",
    body: "Exact scans stay under 40ms on the public vault. Semantic adds model load.",
    x: 18, y: 80, rotate: -0.9, width: 182,
    drift: [9, 12], seconds: 41, delay: -19,
  },
  {
    id: "release-checklist",
    type: "plan",
    title: "Release checklist — 0.22.x",
    body: "Required green, threads resolved, immutable tag, attested assets.",
    x: 84, y: 70, rotate: -0.6, width: 178,
    drift: [14, 8], seconds: 39, delay: -2,
  },
  {
    id: "publish-decision",
    type: "decision",
    title: "Ship the digest, not the vault",
    body: "Publication emits selected notes only. The working tree stays private.",
    tags: ["release"],
    x: 66, y: 88, rotate: 1.7, width: 186,
    drift: [11, 10], seconds: 39, delay: -29,
  },
  {
    id: "stale-question",
    type: "question",
    title: "Does percolation catch stale links?",
    body: "If it does, that is a review signal, not a bug. See [[graph-authority]].",
    x: 38, y: 86, rotate: 0.9, width: 186,
    drift: [12, 9], seconds: 35, delay: -15,
  },
  {
    id: "ada",
    type: "person",
    title: "Ada Mikkelsen",
    body: "Owns the eval harness. Reviewing the paired-win table before publish.",
    tags: ["evals"],
    x: 92, y: 42, rotate: 0.7, width: 168,
    drift: [8, 13], seconds: 47, delay: -18,
  },
  {
    id: "docs-retro",
    type: "meeting",
    title: "Docs retro",
    body: "Readers found the graph before the commands. Lead with the graph.",
    x: 8, y: 28, rotate: 1.3, width: 172,
    drift: [9, 11], seconds: 44, delay: -27,
  },
  {
    id: "qmd-seam",
    type: "idea",
    title: "Semantic search is a cache",
    body: "Delete the index, keep the knowledge. Rebuild from files anytime.",
    x: 74, y: 62, rotate: -2.2, width: 168,
    drift: [8, 14], seconds: 40, delay: -11,
  },
];

export const DEVELOPER_EDGES: readonly FieldEdge[] = [
  { from: "agents-rules", to: "repo-scopes", label: "inherits" },
  { from: "agents-rules", to: "release-checklist", label: "gates", pulse: true },
  { from: "repo-scopes", to: "parser-contract", label: "scopes" },
  { from: "ada", to: "eval-rerun", label: "owns" },
  { from: "eval-rerun", to: "publish-decision", label: "clears" },
  { from: "stopped-session", to: "parser-contract", label: "recovers" },
  { from: "stopped-session", to: "provenance", label: "needs", pulse: true },
  { from: "provenance", to: "stale-question", label: "motivates" },
  { from: "field-notes", to: "qmd-seam", label: "measures" },
  { from: "docs-retro", to: "field-notes", label: "informed" },
  { from: "docs-retro", to: "agents-rules", label: "shaped" },
  { from: "qmd-seam", to: "eval-rerun", label: "feeds" },
];

function edgePath(from: FieldNote, to: FieldNote): string {
  const midX = (from.x + to.x) / 2;
  const lift = Math.min(10, Math.abs(from.y - to.y) * 0.5 + 5);
  const controlY = Math.min(from.y, to.y) - lift;
  return `M ${from.x} ${from.y} Q ${midX} ${controlY} ${to.x} ${to.y}`;
}

function edgeLabelPoint(from: FieldNote, to: FieldNote): readonly [number, number] {
  const midX = (from.x + to.x) / 2;
  const lift = Math.min(8, Math.abs(from.y - to.y) * 0.4 + 4);
  const midY = (from.y + to.y) / 2 - lift * 0.5;
  return [midX, midY];
}

/** Renders `[[wikilink]]` spans inside a note body, mirroring vault syntax. */
function NoteBody({ body }: Readonly<{ body: string }>) {
  const parts = body.split(/(\[\[[^\]]+\]\])/u);
  return (
    <p className="wordcell-note-body">
      {parts.map((part, index) => (
        part.startsWith("[[") && part.endsWith("]]")
          ? <span className="wordcell-note-link" key={index}>{part}</span>
          : part
      ))}
    </p>
  );
}

const REVEAL_RADIUS = 330;

export function WordcellField({
  className,
  edges = EDGES,
  notes = NOTES,
}: Readonly<{ className?: string; edges?: readonly FieldEdge[]; notes?: readonly FieldNote[] }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const noteById = new Map(notes.map((note) => [note.id, note]));

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-prox]"));
    if (targets.length === 0) return;
    const centers = new Map<HTMLElement, readonly [number, number]>();
    const measure = () => {
      centers.clear();
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        centers.set(el, [rect.left + rect.width / 2, rect.top + rect.height / 2]);
      }
    };
    measure();

    /* A focus point wanders the field on a slow organic path, waking whatever
     * it passes over. A real pointer takes precedence and hands control back
     * a few seconds after it rests. The smoothed focus lerps toward the
     * active target so mode changes glide instead of jump. */
    const born = performance.now();
    let raf = 0;
    let running = false;
    let focusX: number | null = null;
    let focusY: number | null = null;
    let pointerX = -10000;
    let pointerY = -10000;
    let lastPointerAt = -10000;

    const wander = (now: number) => {
      const rect = root.getBoundingClientRect();
      const t = (now - born) / 1000;
      // Incommensurate sine pairs: a non-repeating drift that visits the
      // whole wall while keeping clear of the outer rim.
      return {
        x: rect.left + (0.5 + 0.33 * Math.sin(t * 0.19 + 0.7) + 0.09 * Math.sin(t * 0.47 + 2.1)) * rect.width,
        y: rect.top + (0.5 + 0.33 * Math.sin(t * 0.141 + 2.9) + 0.09 * Math.cos(t * 0.37)) * rect.height,
      };
    };

    const tick = (now: number) => {
      raf = 0;
      const target = now - lastPointerAt < 3500 ? { x: pointerX, y: pointerY } : wander(now);
      if (focusX === null || focusY === null) {
        focusX = target.x;
        focusY = target.y;
      }
      focusX += (target.x - focusX) * 0.055;
      focusY += (target.y - focusY) * 0.055;
      for (const el of targets) {
        const center = centers.get(el);
        if (center === undefined) continue;
        const distance = Math.hypot(center[0] - focusX, center[1] - focusY);
        const proximity = Math.max(0, 1 - distance / REVEAL_RADIUS);
        el.style.setProperty("--prox", proximity.toFixed(3));
      }
      if (running) raf = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };
    const stopLoop = () => {
      running = false;
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      lastPointerAt = performance.now();
    };
    const onAway = () => {
      lastPointerAt = -10000;
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) return;
      if (entry.isIntersecting) startLoop();
      else stopLoop();
    });
    observer.observe(root);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    document.documentElement.addEventListener("pointerleave", onAway);
    window.addEventListener("blur", onAway);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      document.documentElement.removeEventListener("pointerleave", onAway);
      window.removeEventListener("blur", onAway);
      stopLoop();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`wordcell-field${className === undefined ? "" : ` ${className}`}`}
      ref={rootRef}
    >
      <svg className="wordcell-edges" preserveAspectRatio="none" viewBox="0 0 100 100">
        {edges.map((edge) => {
          const from = noteById.get(edge.from);
          const to = noteById.get(edge.to);
          if (from === undefined || to === undefined) return null;
          return (
            <path
              className={edge.pulse === true ? "wordcell-edge wordcell-edge--pulse" : "wordcell-edge"}
              d={edgePath(from, to)}
              data-prox=""
              key={`${edge.from}-${edge.to}`}
            />
          );
        })}
      </svg>
      {edges.map((edge) => {
        if (edge.label === undefined) return null;
        const from = noteById.get(edge.from);
        const to = noteById.get(edge.to);
        if (from === undefined || to === undefined) return null;
        const [labelX, labelY] = edgeLabelPoint(from, to);
        return (
          <span
            className="wordcell-edge-label"
            data-prox=""
            key={`label-${edge.from}-${edge.to}`}
            style={{ left: `${labelX}%`, top: `${labelY}%` }}
          >
            {edge.label}
          </span>
        );
      })}
      {notes.map((note) => (
        <article
          className={`wordcell-note${note.bloom === true ? " wordcell-note--bloom" : ""}`}
          data-prox=""
          data-type={note.type}
          key={note.id}
          style={{
            "--x": `${note.x}%`,
            "--y": `${note.y}%`,
            "--w": `${note.width}px`,
            "--r": `${note.rotate}deg`,
            "--dx": `${note.drift[0]}px`,
            "--dy": `${note.drift[1]}px`,
            "--s": `${note.seconds}s`,
            "--d": `${note.delay}s`,
            "--bd": `${note.delay * 0.7}s`,
          } as CSSProperties}
        >
          <span className="wordcell-note-type">{note.type}</span>
          <h3 className="wordcell-note-title">
            {note.type === "person" && (
              <span className="wordcell-note-avatar">
                {note.title.split(/\s+/u).map((word) => word[0]).join("")}
              </span>
            )}
            {note.title}
          </h3>
          <NoteBody body={note.body} />
          {note.tags !== undefined && (
            <div className="wordcell-note-tags">
              {note.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

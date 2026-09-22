import type { CSSProperties } from "react";

/**
 * A living wall of vault notes — the wordcell hero. Pure DOM + CSS: positions,
 * drift, and edge pulses are deterministic and server-rendered; motion is
 * decorative (pointer-transparent, reduced-motion collapses to a still field).
 */
interface FieldNote {
  readonly id: string;
  readonly type: "decision" | "source" | "concept" | "plan" | "question";
  readonly title: string;
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

interface FieldEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly pulse?: boolean;
}

const NOTES: readonly FieldNote[] = [
  {
    id: "authority",
    type: "decision",
    title: "Markdown stays the only authority",
    body: "Indexes, embeddings, and graph views rebuild from the files.",
    tags: ["storage"],
    x: 47, y: 20, rotate: -1.4, width: 190,
    drift: [9, 14], seconds: 38, delay: -4,
  },
  {
    id: "other-minds",
    type: "source",
    title: "Other Minds — Godfrey-Smith",
    body: "\u201CThe octopus has 350 million neurons in its arms.\u201D",
    tags: ["distributed-cognition"],
    x: 12, y: 14, rotate: 1.8, width: 176,
    drift: [12, 10], seconds: 44, delay: -19,
  },
  {
    id: "stigmergy",
    type: "concept",
    title: "Stigmergy",
    body: "Coordination through traces left in the environment, not signals.",
    tags: ["emergence"],
    x: 79, y: 9, rotate: 2.1, width: 168,
    drift: [10, 16], seconds: 41, delay: -8, bloom: true,
  },
  {
    id: "retro",
    type: "decision",
    title: "Onboarding retro, Q2",
    body: "The retention question resurfaced. Nobody connected them then.",
    tags: ["decisions"],
    x: 90, y: 34, rotate: -1.9, width: 158,
    drift: [8, 12], seconds: 36, delay: -27,
  },
  {
    id: "pattern-language",
    type: "source",
    title: "A Pattern Language — Alexander",
    body: "\u201CA network of patterns that call upon one another.\u201D",
    tags: ["design-patterns"],
    x: 24, y: 38, rotate: 1.2, width: 182,
    drift: [14, 8], seconds: 47, delay: -13,
  },
  {
    id: "half-life",
    type: "concept",
    title: "Half-life of facts",
    body: "Physics: ~13 years. Surgery: closer to 7. Knowledge decays.",
    tags: ["epistemology"],
    x: 55, y: 45, rotate: -0.8, width: 176,
    drift: [11, 13], seconds: 33, delay: -31,
  },
  {
    id: "site-reframe",
    type: "plan",
    title: "Site reframe",
    body: "General-purpose vault first; coding workflow is one lane.",
    tags: ["marketing"],
    x: 16, y: 64, rotate: -1.6, width: 172,
    drift: [10, 12], seconds: 39, delay: -6,
  },
  {
    id: "prototypes",
    type: "concept",
    title: "Prototypes over definitions",
    body: "Lakoff: categories organize around prototypes, not boundaries.",
    tags: ["cognition"],
    x: 84, y: 60, rotate: 1.5, width: 180,
    drift: [9, 15], seconds: 43, delay: -22,
  },
  {
    id: "percolation",
    type: "question",
    title: "Does percolation surface stale links?",
    body: "If it does, that is a review signal, not a bug.",
    tags: ["maintenance"],
    x: 48, y: 72, rotate: 0.9, width: 178,
    drift: [12, 9], seconds: 35, delay: -15, bloom: true,
  },
  {
    id: "hayek",
    type: "source",
    title: "Hayek — local knowledge",
    body: "\u201CNever exists in concentrated or integrated form.\u201D",
    tags: ["local-knowledge"],
    x: 8, y: 88, rotate: 1.9, width: 168,
    drift: [13, 8], seconds: 45, delay: -36,
  },
  {
    id: "selective-publish",
    type: "decision",
    title: "Publish only the selected slice",
    body: "The vault stays private; the slice ships as a static site.",
    tags: ["privacy"],
    x: 74, y: 84, rotate: -2.2, width: 176,
    drift: [8, 14], seconds: 40, delay: -11,
  },
  {
    id: "janeway",
    type: "source",
    title: "Janeway's Immunobiology",
    body: "\u201CThe immune system recognizes self. Everything else gets a response.\u201D",
    tags: ["recognition"],
    x: 38, y: 96, rotate: -1.1, width: 172,
    drift: [10, 11], seconds: 37, delay: -24,
  },
];

const EDGES: readonly FieldEdge[] = [
  { from: "authority", to: "selective-publish", label: "constrains" },
  { from: "stigmergy", to: "prototypes", label: "extends", pulse: true },
  { from: "pattern-language", to: "site-reframe", label: "informs" },
  { from: "half-life", to: "percolation", label: "motivates", pulse: true },
  { from: "retro", to: "percolation", label: "answers" },
  { from: "hayek", to: "authority", label: "supports" },
];

const centers = new Map(NOTES.map((note) => [note.id, note]));

function edgePath(from: FieldNote, to: FieldNote): string {
  const midX = (from.x + to.x) / 2;
  const lift = Math.min(8, Math.abs(from.y - to.y) * 0.4 + 4);
  const controlY = Math.min(from.y, to.y) - lift;
  return `M ${from.x} ${from.y} Q ${midX} ${controlY} ${to.x} ${to.y}`;
}

function edgeLabelPoint(from: FieldNote, to: FieldNote): readonly [number, number] {
  const midX = (from.x + to.x) / 2;
  const lift = Math.min(8, Math.abs(from.y - to.y) * 0.4 + 4);
  const midY = (from.y + to.y) / 2 - lift * 0.5;
  return [midX, midY];
}

export function WordcellField({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      aria-hidden="true"
      className={["wordcell-field", className].filter(Boolean).join(" ")}
    >
      <svg className="wordcell-edges" preserveAspectRatio="none" viewBox="0 0 100 100">
        {EDGES.map((edge) => {
          const from = centers.get(edge.from)!;
          const to = centers.get(edge.to)!;
          const path = edgePath(from, to);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path className="wordcell-edge" d={path} vectorEffect="non-scaling-stroke" />
              {edge.pulse === true && (
                <path
                  className="wordcell-edge--pulse"
                  d={path}
                  style={{ animationDelay: `${-edge.from.length * 3}s` }}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </svg>
      {EDGES.map((edge) => {
        const [labelX, labelY] = edgeLabelPoint(centers.get(edge.from)!, centers.get(edge.to)!);
        return (
          <span
            className="wordcell-edge-label"
            key={`${edge.from}-${edge.to}-label`}
            style={{ left: `${labelX}%`, top: `${labelY}%` }}
          >
            {edge.label}
          </span>
        );
      })}
      {NOTES.map((note) => (
        <article
          className={note.bloom === true ? "wordcell-note wordcell-note--bloom" : "wordcell-note"}
          key={note.id}
          style={{
            "--x": `${note.x}%`,
            "--y": `${note.y}%`,
            "--r": `${note.rotate}deg`,
            "--w": `${note.width}px`,
            "--dx": `${note.drift[0]}px`,
            "--dy": `${note.drift[1]}px`,
            "--t": `${note.seconds}s`,
            "--d": `${note.delay}s`,
            "--bd": `${note.delay * 0.7}s`,
          } as CSSProperties}
        >
          <span className="wordcell-note-type">{note.type}</span>
          <h3 className="wordcell-note-title">{note.title}</h3>
          <p className="wordcell-note-body">{note.body}</p>
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

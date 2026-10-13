/**
 * The card index: one command turns a source path into the index cards tied
 * to it. Drawn in HTML so it reflows at phone width and stays legible. Names
 * and the rule come from the recorded transcript the other mockups replay.
 */
import { NOTE_RULE, SOURCE_FILE } from "./transcript";

const cards = [
  { kind: "concept", title: "Parser contract", line: NOTE_RULE, path: "notes/parser-contract.md" },
  { kind: "plan", title: "Parser timeouts", line: "Keep the retry limit when adding timeouts.", path: "plans/parser-timeouts.md" },
  { kind: "guide", title: "AGENTS.md", line: "Rules for packages/parser.", path: "packages/parser/AGENTS.md" },
] as const;

export function CardIndexDiagram() {
  return (
    <figure
      aria-label={`Illustration: wordcell context for ${SOURCE_FILE} returns three index cards tied to that path: the Parser contract note, the Parser timeouts plan, and the package guide.`}
      className="wordcell-index"
      role="img"
    >
      <div aria-hidden="true" className="wordcell-index__file">
        <span className="wordcell-index__path">{SOURCE_FILE}</span>
        <span className="wordcell-index__code" />
        <span className="wordcell-index__code" />
        <span className="wordcell-index__code wordcell-index__code--short" />
      </div>
      <div aria-hidden="true" className="wordcell-index__command">
        <code>wordcell context</code>
        <span className="wordcell-index__arrow" />
      </div>
      <ol aria-hidden="true" className="wordcell-index__cards">
        {cards.map((card) => (
          <li className="wordcell-index__card" data-kind={card.kind} key={card.path}>
            <span className="wordcell-index__card-head">
              <strong>{card.title}</strong>
              <span className="wordcell-index__kind">{card.kind}</span>
            </span>
            <span className="wordcell-index__card-line">{card.line}</span>
            <span className="wordcell-index__card-path">{card.path}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

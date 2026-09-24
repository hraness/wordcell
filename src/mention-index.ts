/** Finite UTF-16 multi-pattern matching for complete vault analysis. */
export type MentionIndexLimits = {
  readonly maxNodes?: number;
  readonly maxWork?: number;
  readonly maxMatches?: number;
  readonly maxInputCodeUnits?: number;
};

export const MENTION_INDEX_LIMITS = {
  maxNodes: 262_144,
  maxWork: 64 * 1_024 * 1_024,
  maxMatches: 1_000_000,
  maxInputCodeUnits: 256 * 1_024 * 1_024,
} as const;

export type MentionIndexBudgetKind =
  | "mention-index-nodes"
  | "mention-index-work"
  | "mention-matches"
  | "mention-input-code-units";

export class MentionIndexBudgetError extends RangeError {
  constructor(readonly kind: MentionIndexBudgetKind, readonly limit: number) {
    super(`Vault analysis exceeds the ${limit} ${kind} limit.`);
  }
}

function checkedLimits(options: MentionIndexLimits): Record<keyof MentionIndexLimits, number> {
  const limits: Record<keyof MentionIndexLimits, number> = { ...MENTION_INDEX_LIMITS };
  for (const name of Object.keys(MENTION_INDEX_LIMITS) as (keyof MentionIndexLimits)[]) {
    const value = options[name] ?? MENTION_INDEX_LIMITS[name];
    if (!Number.isSafeInteger(value) || value < 0 || value > MENTION_INDEX_LIMITS[name]) {
      throw new RangeError(`${name} must be a safe integer from 0 through ${MENTION_INDEX_LIMITS[name]}.`);
    }
    limits[name] = value;
  }
  return limits;
}

/** Admit original strings before trimming, normalizing, or indexing any phrase. */
export function preflightMentionInput(inputs: Iterable<string>, options: MentionIndexLimits): { rawInputCodeUnits: number; work: number } {
  const limits = checkedLimits(options);
  let rawInputCodeUnits = 0, work = 0;
  for (const input of inputs) {
    rawInputCodeUnits += input.length;
    if (rawInputCodeUnits > limits.maxInputCodeUnits) throw new MentionIndexBudgetError("mention-input-code-units", limits.maxInputCodeUnits);
    work += input.length + 1;
    if (work > limits.maxWork) throw new MentionIndexBudgetError("mention-index-work", limits.maxWork);
  }
  return { rawInputCodeUnits, work };
}

export type MentionPattern = {
  readonly targetId: string;
  readonly phrase: string;
  readonly lowerPhrase: string;
  readonly rank: number;
};
export type IndexedMention = { readonly pattern: MentionPattern; readonly offset: number };
type TrieNode = {
  readonly next: Map<number, number>;
  failure: number;
  output: number;
  pattern: MentionPattern | undefined;
};

/** The legacy matcher uses ASCII word boundaries, even for Unicode phrases. */
export function cleanMentionBoundary(text: string, phrase: string, offset: number): boolean {
  const word = (value: string): boolean => /[A-Za-z0-9]/.test(value);
  return (!word(phrase[0] ?? "") || !word(text[offset - 1] ?? ""))
    && (!word(phrase.at(-1) ?? "") || !word(text[offset + phrase.length] ?? ""));
}

export class MentionMatcher {
  private readonly limits: Record<keyof MentionIndexLimits, number>;
  private readonly nodes: TrieNode[] = [];
  private work = 0;
  private matches = 0;
  private input = 0;

  constructor(patterns: readonly MentionPattern[], options: MentionIndexLimits = {}, rawInputCodeUnits = 0, preflightWork = 0) {
    this.limits = checkedLimits(options);
    if (!Number.isSafeInteger(preflightWork) || preflightWork < 0) throw new RangeError("Invalid mention preflight work.");
    if (preflightWork > this.limits.maxWork) this.fail("mention-index-work", this.limits.maxWork);
    this.work = preflightWork;
    if (!Number.isSafeInteger(rawInputCodeUnits) || rawInputCodeUnits < 0) throw new RangeError("Invalid mention input length.");
    if (rawInputCodeUnits > this.limits.maxInputCodeUnits) this.fail("mention-input-code-units", this.limits.maxInputCodeUnits);
    this.node();
    for (const pattern of patterns) {
      this.inputUnits(pattern.lowerPhrase.length);
      let state = 0;
      for (let index = 0; index < pattern.lowerPhrase.length; index += 1) {
        this.step();
        const character = pattern.lowerPhrase.charCodeAt(index);
        let next = this.nodes[state]!.next.get(character);
        if (next === undefined) {
          next = this.node();
          this.nodes[state]!.next.set(character, next);
        }
        state = next;
      }
      if (pattern.lowerPhrase.length === 0 || this.nodes[state]!.pattern !== undefined) {
        throw new TypeError("Mention index requires nonempty, uniquely owned normalized phrases.");
      }
      this.nodes[state]!.pattern = pattern;
    }
    const queue = [...this.nodes[0]!.next.values()];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const state = queue[cursor]!;
      for (const [character, child] of this.nodes[state]!.next) {
        this.step();
        let fallback = this.nodes[state]!.failure;
        while (fallback !== 0 && !this.nodes[fallback]!.next.has(character)) {
          this.step();
          fallback = this.nodes[fallback]!.failure;
        }
        const failure = this.nodes[fallback]!.next.get(character) ?? 0;
        this.nodes[child]!.failure = failure;
        this.nodes[child]!.output = this.nodes[failure]!.pattern === undefined
          ? this.nodes[failure]!.output : failure;
        queue.push(child);
      }
    }
  }

  private fail(kind: MentionIndexBudgetKind, limit: number): never { throw new MentionIndexBudgetError(kind, limit); }
  private step(): void {
    if (this.work >= this.limits.maxWork) this.fail("mention-index-work", this.limits.maxWork);
    this.work += 1;
  }
  private node(): number {
    if (this.nodes.length >= this.limits.maxNodes) this.fail("mention-index-nodes", this.limits.maxNodes);
    this.nodes.push({ next: new Map(), failure: 0, output: -1, pattern: undefined });
    return this.nodes.length - 1;
  }
  private inputUnits(count: number): void {
    this.input += count;
    if (this.input > this.limits.maxInputCodeUnits) this.fail("mention-input-code-units", this.limits.maxInputCodeUnits);
  }

  newlineOffsets(originalText: string): readonly number[] {
    const offsets: number[] = [];
    for (let index = 0; index < originalText.length; index += 1) {
      this.step();
      if (originalText.charCodeAt(index) === 10) offsets.push(index);
    }
    return offsets;
  }

  lineAt(offsets: readonly number[], offset: number): number {
    let low = 0, high = offsets.length;
    while (low < high) {
      this.step();
      const middle = low + Math.floor((high - low) / 2);
      if (offsets[middle]! < offset) low = middle + 1;
      else high = middle;
    }
    return low + 1;
  }

  scan(lowerText: string): ReadonlyMap<string, IndexedMention> {
    this.inputUnits(lowerText.length);
    const result = new Map<string, IndexedMention>();
    let state = 0;
    for (let index = 0; index < lowerText.length; index += 1) {
      this.step();
      const character = lowerText.charCodeAt(index);
      while (state !== 0 && !this.nodes[state]!.next.has(character)) {
        this.step();
        state = this.nodes[state]!.failure;
      }
      state = this.nodes[state]!.next.get(character) ?? 0;
      let output = this.nodes[state]!.pattern === undefined ? this.nodes[state]!.output : state;
      while (output !== -1) {
        if (this.matches >= this.limits.maxMatches) this.fail("mention-matches", this.limits.maxMatches);
        this.matches += 1; // Count overlapping/repeated outputs before deduplication or boundary filtering.
        const pattern = this.nodes[output]!.pattern!;
        const offset = index + 1 - pattern.lowerPhrase.length;
        const existing = result.get(pattern.targetId);
        if (cleanMentionBoundary(lowerText, pattern.lowerPhrase, offset)
          && (existing === undefined || pattern.rank < existing.pattern.rank)) {
          result.set(pattern.targetId, { pattern, offset });
        }
        output = this.nodes[output]!.output;
      }
    }
    return result;
  }
}

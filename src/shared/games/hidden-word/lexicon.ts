/**
 * The words of 히든 워드 (Hidden Word) and how similar two of them are.
 *
 * Design: design/games/hidden-word.md. The show scored a clue against a
 * hidden word with a language model it did not name, and said itself that
 * the scores were not fixed. This is a stand-in, not the show's scores: a
 * list of nouns, each with a vector worked out once, outside the game
 * (`tools/hidden-word-lexicon.py`), so that the same two words always score
 * the same and a game asks nothing of anyone while it is played.
 *
 * A score has a direction, as the show's checker had a "reference word" and
 * a "similar word": it says how near `word` is among all the words of the
 * list as seen from `reference`. The words nearest a reference score 95 or
 * more whatever the reference is, so every hidden word has clues that end
 * the giving of clues.
 *
 * The rules (`rules.ts`) are given a {@link Lexicon} and know nothing of
 * vectors; a test gives them one of its own.
 */

/** What the game asks of its list of words. */
export interface Lexicon {
  /** Whether `word` is in the list: a clue has to be. */
  has(word: string): boolean;
  /**
   * How similar `word` is to `reference`, in percent, by halves, 0 to 100;
   * `null` where either is not in the list. 100 is the word itself.
   */
  score(reference: string, word: string): number | null;
  /** The `count` words nearest `reference`, the nearest first, without `reference` and without any of `except`. */
  nearest(reference: string, count: number, except?: readonly string[]): string[];
  /** The words an envelope may be filled from: familiar ones, written one way. */
  readonly envelope: readonly string[];
}

/** The list as its file has it (`lexicon-ko.json`). */
export interface LexiconData {
  version: number;
  /** How many numbers a word's vector has. */
  dims: number;
  /**
   * The scores a reference word's anchors stand for, rising. A word's
   * anchors are as many cosines, rising: how near the words at fixed places
   * among all the others are to it (the farthest, the middle one, … the
   * nearest).
   */
  percents: number[];
  /** The words. */
  words: string[];
  /**
   * For each word, in the order of `words`: its vector (`dims` bytes,
   * signed) and then its anchors (two bytes each, low byte first; 0 is a
   * cosine of -1 and 65535 one of 1), and then the places in `words` of the
   * `near` words nearest it, the nearest first (two bytes each, low byte
   * first), in base64.
   */
  packed: string[];
  /** How many of its nearest words each word comes with: enough that the game seldom has to look through the whole list. */
  near: number;
  envelope: string[];
}

/** A word of the list, read. */
interface Entry {
  vector: Int8Array;
  /** The vector's length. */
  length: number;
  anchors: number[];
  /** The places of the words nearest it, the nearest first. */
  near: number[];
}

/** The list in `data`, for a game to ask. A word is read when it is first asked for. */
export function makeLexicon(data: LexiconData): Lexicon {
  const steps = data.percents.length;
  const read: (Entry | undefined)[] = [];
  let index: Map<string, number> | null = null;

  const at = (word: string): number | undefined => {
    index ??= new Map(data.words.map((each, place) => [each, place]));
    return index.get(word);
  };

  function entry(place: number): Entry {
    const kept = read[place];
    if (kept !== undefined) return kept;
    const raw = atob(data.packed[place]);
    const vector = new Int8Array(data.dims);
    let squares = 0;
    for (let i = 0; i < data.dims; i++) {
      const byte = raw.charCodeAt(i);
      const value = byte > 127 ? byte - 256 : byte;
      vector[i] = value;
      squares += value * value;
    }
    const anchors: number[] = [];
    const pair = (from: number): number => raw.charCodeAt(from) + 256 * raw.charCodeAt(from + 1);
    for (let i = 0; i < steps; i++) anchors.push(pair(data.dims + 2 * i) / 32767.5 - 1);
    const near: number[] = [];
    for (let i = 0; i < data.near; i++) near.push(pair(data.dims + 2 * steps + 2 * i));
    const made = { vector, length: Math.sqrt(squares), anchors, near };
    read[place] = made;
    return made;
  }

  function cosine(a: Entry, b: Entry): number {
    let dot = 0;
    for (let i = 0; i < data.dims; i++) dot += a.vector[i] * b.vector[i];
    return a.length === 0 || b.length === 0 ? 0 : dot / (a.length * b.length);
  }

  /** The score a cosine stands for as seen from a reference with `anchors`: straight lines from anchor to anchor. */
  function percentOf(anchors: readonly number[], cos: number): number {
    if (cos <= anchors[0]) return data.percents[0];
    for (let i = 1; i < steps; i++) {
      if (cos > anchors[i]) continue;
      const span = anchors[i] - anchors[i - 1];
      const along = span <= 0 ? 1 : (cos - anchors[i - 1]) / span;
      return data.percents[i - 1] + along * (data.percents[i] - data.percents[i - 1]);
    }
    return data.percents[steps - 1];
  }

  return {
    has: (word) => at(word) !== undefined,
    score(reference, word) {
      const from = at(reference);
      const to = at(word);
      if (from === undefined || to === undefined) return null;
      if (from === to) return 100;
      const seen = entry(from);
      return Math.round(percentOf(seen.anchors, cosine(seen, entry(to))) * 2) / 2;
    },
    nearest(reference, count, except = []) {
      const from = at(reference);
      if (from === undefined || count < 1) return [];
      const seen = entry(from);
      const out = new Set<number>([from]);
      for (const word of except) {
        const place = at(word);
        if (place !== undefined) out.add(place);
      }
      // the nearest words came with the word: the whole list is looked through only when those run out
      const kept = seen.near.filter((place) => place < data.words.length && !out.has(place));
      if (kept.length >= count) return kept.slice(0, count).map((place) => data.words[place]);
      // (the list's own order parts two words that are as near: the same answer every time)
      const found: { place: number; cos: number }[] = [];
      for (let place = 0; place < data.words.length; place++) {
        if (out.has(place)) continue;
        const cos = cosine(seen, entry(place));
        if (found.length === count && cos <= found[count - 1].cos) continue;
        let slot = found.length;
        while (slot > 0 && found[slot - 1].cos < cos) slot -= 1;
        found.splice(slot, 0, { place, cos });
        if (found.length > count) found.pop();
      }
      return found.map((each) => data.words[each.place]);
    },
    envelope: data.envelope,
  };
}

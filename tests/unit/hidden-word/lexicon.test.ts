import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/hidden-word/config.json";
import lexiconJson from "../../../src/shared/games/hidden-word/lexicon-ko.json";
import { makeLexicon, type LexiconData } from "../../../src/shared/games/hidden-word/lexicon";

/** A word of a list as its file keeps it: the vector, the anchors and the places of its nearest words. */
function packed(vector: number[], anchors: number[], near: number[]): string {
  const bytes = [...vector.map((value) => (value + 256) % 256)];
  for (const cos of anchors) {
    const kept = Math.round((cos + 1) * 32767.5);
    bytes.push(kept % 256, Math.floor(kept / 256));
  }
  for (const place of near) bytes.push(place % 256, Math.floor(place / 256));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Five words on a plane. Seen from 가, 나 is at a cosine of 0.8, 다 at 0.6, 라
 * at 0 and 마 at -1. 가's anchors say: a cosine of -1 is 0%, 0 is 50%, 0.6 is
 * 90% and 0.8 is 99%.
 */
const SMALL: LexiconData = {
  version: 1,
  dims: 2,
  percents: [0, 50, 90, 99],
  near: 2,
  words: ["가", "나", "다", "라", "마"],
  packed: [
    packed([100, 0], [-1, 0, 0.6, 0.8], [1, 2]),
    packed([80, 60], [-1, 0, 0.6, 0.8], [0, 2]),
    packed([60, 80], [-1, 0, 0.6, 0.8], [1, 0]),
    packed([0, 100], [-1, 0, 0.6, 0.8], [2, 1]),
    packed([-100, 0], [-1, 0, 0.6, 0.8], [3, 2]),
  ],
  envelope: ["가", "라"],
};

describe("a list of words", () => {
  const list = makeLexicon(SMALL);

  it("knows which words it has", () => {
    expect(list.has("가")).toBe(true);
    expect(list.has("하")).toBe(false);
    expect(list.has("toString")).toBe(false);
    expect(list.envelope).toEqual(["가", "라"]);
  });

  it("scores a word against a reference by the reference's anchors, in halves", () => {
    expect(list.score("가", "나")).toBe(99);
    expect(list.score("가", "다")).toBe(90);
    expect(list.score("가", "라")).toBe(50);
    expect(list.score("가", "마")).toBe(0);
    // between two anchors the score runs straight: a cosine of 0.96 from 나 to 다 is past the last anchor
    expect(list.score("나", "다")).toBe(99);
    // 나 to 라: a cosine of 0.6
    expect(list.score("나", "라")).toBe(90);
  });

  it("scores a word against itself 100, and nothing against a word it has not", () => {
    expect(list.score("가", "가")).toBe(100);
    expect(list.score("가", "하")).toBeNull();
    expect(list.score("하", "가")).toBeNull();
  });

  it("names the nearest words, the nearest first", () => {
    expect(list.nearest("가", 1)).toEqual(["나"]);
    expect(list.nearest("가", 2)).toEqual(["나", "다"]);
    expect(list.nearest("하", 2)).toEqual([]);
  });

  it("looks through the whole list where the nearest it came with are left out", () => {
    expect(list.nearest("가", 1, ["나"])).toEqual(["다"]);
    expect(list.nearest("가", 2, ["나", "다"])).toEqual(["라", "마"]);
    expect(list.nearest("가", 4)).toEqual(["나", "다", "라", "마"]);
    expect(list.nearest("가", 9, ["가"])).toEqual(["나", "다", "라", "마"]);
  });
});

describe("the game's own list (lexicon-ko.json)", () => {
  const data: LexiconData = lexiconJson;
  const list = makeLexicon(data);

  it("has thousands of words of Hangul, each once, each with its bytes", () => {
    expect(data.words.length).toBeGreaterThan(5000);
    expect(data.words.length).toBeLessThan(65536);
    expect(new Set(data.words).size).toBe(data.words.length);
    expect(data.packed.length).toBe(data.words.length);
    const bytes = data.dims + 2 * data.percents.length + 2 * data.near;
    for (const word of data.words) expect(word).toMatch(/^[가-힣]{1,10}$/);
    for (const each of data.packed) expect(atob(each).length).toBe(bytes);
  });

  it("has scores that rise from anchor to anchor, the mark that ends the clues among them", () => {
    expect([...data.percents].sort((a, b) => a - b)).toEqual(data.percents);
    expect(data.percents).toContain(configJson.threshold);
    expect(data.percents[0]).toBe(0);
    expect(data.percents.at(-1)).toBeLessThan(100);
  });

  it("has enough familiar words to fill six envelopes many times over, all of them in the list", () => {
    expect(data.envelope.length).toBeGreaterThan(configJson.maxPlayers * configJson.envelope * 5);
    for (const word of data.envelope) expect(list.has(word)).toBe(true);
    expect(new Set(data.envelope).size).toBe(data.envelope.length);
  });

  it("gives every envelope word a few clues that end the giving of clues, and not a great many", () => {
    for (const word of data.envelope.filter((_, at) => at % 20 === 0)) {
      const near = list.nearest(word, 8);
      expect(near.length).toBe(8);
      expect(list.score(word, near[0])).toBeGreaterThanOrEqual(configJson.threshold);
      const reaching = data.words.filter((other) => other !== word && (list.score(word, other) ?? 0) >= configJson.threshold).length;
      expect(reaching).toBeGreaterThanOrEqual(8);
      expect(reaching).toBeLessThan(80);
    }
  });

  it("has the nearest words it came with agree with a look through the whole list", () => {
    for (const word of ["나무", "대기", "우비"]) {
      const kept = list.nearest(word, 3);
      const [first] = kept;
      // with the first left out the stored ones still serve; with all of them left out the whole list is looked through
      expect(list.nearest(word, 2, [first])).toEqual(kept.slice(1));
      const all = list.nearest(word, data.near);
      const beyond = list.nearest(word, 1, all);
      expect(beyond.length).toBe(1);
      expect(all).not.toContain(beyond[0]);
      expect(list.score(word, beyond[0]) ?? 0).toBeLessThanOrEqual(list.score(word, all[0]) ?? 0);
    }
  });

  it("scores the show's plainest pairs the way the show did: near ones high, a stray one low", () => {
    // not the show's numbers (design/games/hidden-word.md): only which side of the mark, for pairs where the show said
    expect(list.score("우비", "우산")).toBeGreaterThanOrEqual(configJson.threshold);
    expect(list.score("손님", "고객")).toBeGreaterThanOrEqual(configJson.threshold);
    expect(list.score("목욕탕", "목욕")).toBeGreaterThanOrEqual(configJson.threshold);
    expect(list.score("우비", "소설")).toBeLessThan(50);
    expect(list.score("이별", "지구")).toBeLessThan(50);
    expect(list.score("나무", "꾸중")).toBeLessThan(50);
  });
});

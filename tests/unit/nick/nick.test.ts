import { describe, expect, it } from "vitest";
import { LANGS } from "../../../src/shared/lang";
import { normalizeNick } from "../../../src/shared/lobby";
import { maskLine } from "../../../src/shared/mask";
import maskConfig from "../../../src/shared/mask-config.json";
import { suggestNick, type NickWords } from "../../../src/shared/nick";
import shipped from "../../../src/shared/nick-config.json";
import roomConfig from "../../../src/shared/room-config.json";

/** Two words of each sort in each language, so which is picked is told from the name. */
const WORDS: NickWords = { ko: { first: ["가", "나"], second: ["다", "라"] }, en: { first: ["A", "B"], second: ["C", "D"] } };

/** A source of numbers that gives `values` in turn. */
function numbers(...values: number[]): () => number {
  let next = 0;
  return () => values[next++ % values.length];
}

describe("suggestNick", () => {
  it("makes a name of one word from each list, in the language asked for", () => {
    expect(suggestNick("ko", WORDS, numbers(0, 0), 12)).toBe("가 다");
    expect(suggestNick("en", WORDS, numbers(0, 0), 12)).toBe("A C");
  });

  it("picks each word by the number it is given", () => {
    expect(suggestNick("ko", WORDS, numbers(0.5, 0), 12)).toBe("나 다");
    expect(suggestNick("ko", WORDS, numbers(0, 0.99), 12)).toBe("가 라");
  });

  it("picks the last word for a number that is not below 1, rather than none", () => {
    expect(suggestNick("en", WORDS, numbers(1, 1), 12)).toBe("B D");
  });

  it("cuts a name that would be longer than the longest allowed", () => {
    const long: NickWords = { ...WORDS, en: { first: ["Abcdef"], second: ["Ghijkl"] } };

    expect(suggestNick("en", long, numbers(0), 8)).toBe("Abcdef G");
  });

  it("makes a name of the one word there is where a list is empty", () => {
    const half: NickWords = { ...WORDS, ko: { first: [], second: ["다"] } };

    expect(suggestNick("ko", half, numbers(0), 12)).toBe("다");
  });
});

describe("the names the site offers", () => {
  /** Every name that can be offered in `lang`. */
  function all(lang: (typeof LANGS)[number]): string[] {
    const { first, second } = shipped[lang];
    return first.flatMap((a) => second.map((b) => `${a} ${b}`));
  }

  it("has words of both sorts in every language", () => {
    for (const lang of LANGS) {
      expect(shipped[lang].first.length).toBeGreaterThan(1);
      expect(shipped[lang].second.length).toBeGreaterThan(1);
    }
  });

  it("offers no word twice in a list", () => {
    for (const lang of LANGS) for (const list of [shipped[lang].first, shipped[lang].second]) expect(new Set(list).size).toBe(list.length);
  });

  it("offers only names a room takes as they are: none too long, none with anything a room would clean away", () => {
    for (const lang of LANGS) for (const name of all(lang)) expect(normalizeNick(name, roomConfig)).toBe(name);
  });

  it("offers no name with a word the site covers in it", () => {
    for (const lang of LANGS) for (const name of all(lang)) expect(maskLine(name, maskConfig)).toBe(name);
  });

  it("gives one of them for any number", () => {
    for (const lang of LANGS) {
      const names = new Set(all(lang));
      for (const n of [0, 0.25, 0.5, 0.75, 0.999]) expect(names.has(suggestNick(lang, shipped, () => n, roomConfig.nickMaxLength))).toBe(true);
    }
  });
});

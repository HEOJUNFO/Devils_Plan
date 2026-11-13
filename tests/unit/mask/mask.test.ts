import { describe, expect, it } from "vitest";
import { maskLine, type MaskConfig } from "../../../src/shared/mask";
import shipped from "../../../src/shared/mask-config.json";

/** Made-up words, so that what is tested is how a line is covered and not which words are on the list. */
const CONFIG: MaskConfig = { anywhere: ["굴뚝", "blarg", "blargest"], whole: ["zot"], spared: ["굴뚝새", "blargain"] };

describe("maskLine", () => {
  it("gives a line with none of the words back as it was", () => {
    expect(maskLine("안녕하세요, good game", CONFIG)).toBe("안녕하세요, good game");
    expect(maskLine("", CONFIG)).toBe("");
  });

  it("covers a word with as many asterisks as it has characters, and leaves the rest", () => {
    expect(maskLine("이 굴뚝 좀 봐", CONFIG)).toBe("이 ** 좀 봐");
    expect(maskLine("you blarg, you", CONFIG)).toBe("you *****, you");
  });

  it("covers a word wherever it is, inside a longer one too, and every time it comes", () => {
    expect(maskLine("왕굴뚝이다 굴뚝", CONFIG)).toBe("왕**이다 **");
    expect(maskLine("unblargable", CONFIG)).toBe("un*****able");
  });

  it("covers a word whatever case it is written in", () => {
    expect(maskLine("BLARG Blarg bLaRg", CONFIG)).toBe("***** ***** *****");
  });

  it("covers the longer of two words that begin at the same place", () => {
    expect(maskLine("the blargest", CONFIG)).toBe("the ********");
  });

  it("covers a word that is covered only alone where it stands alone, and not inside another", () => {
    expect(maskLine("zot! a zot, ZOT", CONFIG)).toBe("***! a ***, ***");
    expect(maskLine("azote zots 1zot zot2", CONFIG)).toBe("azote zots 1zot zot2");
    expect(maskLine("그건zot이야", CONFIG)).toBe("그건zot이야");
  });

  it("leaves a spared word whole, and covers the word beside it", () => {
    expect(maskLine("굴뚝새가 굴뚝에", CONFIG)).toBe("굴뚝새가 **에");
    expect(maskLine("a Blargain, blarg", CONFIG)).toBe("a Blargain, *****");
  });

  it("covers nothing with nothing on the list", () => {
    expect(maskLine("굴뚝 blarg zot", { anywhere: [], whole: [], spared: [] })).toBe("굴뚝 blarg zot");
  });

  it("reads a word with a mark of a regular expression in it as that word", () => {
    const config: MaskConfig = { anywhere: ["a.c", "(x)"], whole: [], spared: [] };

    expect(maskLine("abc a.c (x) x", config)).toBe("abc *** *** x");
  });
});

describe("the words the site covers", () => {
  const all = [...shipped.anywhere, ...shipped.whole];

  it("covers every word on its own list", () => {
    for (const word of all) expect(maskLine(word, shipped)).toBe("*".repeat(Array.from(word).length));
  });

  it("spares every word it says it spares", () => {
    for (const word of shipped.spared) expect(maskLine(word, shipped)).toBe(word);
  });

  it("covers nothing of what the games are called and of what is said with one press", () => {
    const ordinary = [
      "러시안 룰렛 네모 세기 잔디 깔기 큐브 세기 기억 포커 무거운 13 미스터리 거래소",
      "안녕하세요 잘했어요 고마워요 미안해요 잠깐만요 가요 앗 수고했어요",
      "한번 해보지 뭐, 자지 말고 시발점에서 만나",
      "Russian Roulette, Count the Rectangles, Lay the Grass, Memory Poker, Mystery Stock Market",
      "hello nice thanks sorry wait go oops gg, class of grapes in Scunthorpe, shiitake",
    ];

    for (const line of ordinary) expect(maskLine(line, shipped)).toBe(line);
  });
});

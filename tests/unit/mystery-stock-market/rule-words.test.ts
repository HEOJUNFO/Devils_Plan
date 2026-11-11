import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { RULE_KINDS, STOCKS, type Rule, type RuleKind, type StockId } from "../../../src/shared/games/mystery-stock-market/prices";
import {
  CARD,
  STOCK_NAMES,
  cardOf,
  placeWords,
  sentenceOf,
  textOf,
  widthOf,
  wordsOf,
  type CardPiece,
  type RulePiece,
} from "../../../src/shared/games/mystery-stock-market/rule-words";
import { drawRules, showRules, type DrawConfig, type Rulebook } from "../../../src/shared/games/mystery-stock-market/rulebook";
import { LANGS, type Lang } from "../../../src/shared/lang";

const draw: DrawConfig = shipped.draw;
const SHOW = showRules(shipped.rules);
/** How many stages a sentence is opened in beyond the first: one for each round the rules are opened in. */
const STAGES = shipped.revealRounds.length;
const EVERY_STAGE = Array.from({ length: STAGES + 1 }, (_, stage) => stage);
/** How many seeds a property of every drawn rule is tried on. */
const SEEDS = 200;

/** The words of a piece. */
const said = (lang: Lang, piece: RulePiece): string => textOf(lang, piece.key, piece.args);
/** A sentence as it is read once it is all open. */
function read(lang: Lang, pieces: readonly RulePiece[]): string {
  return pieces.reduce((sentence, piece, at) => sentence + (at === 0 || piece.glue === true ? "" : " ") + said(lang, piece), "");
}
/** The words of a sentence that are opened at each stage, in the order they stand in it. */
function openedAt(lang: Lang, pieces: readonly RulePiece[]): string[][] {
  return EVERY_STAGE.map((stage) => pieces.filter((piece) => piece.stage === stage).map((piece) => said(lang, piece)));
}
const showSentence = (lang: Lang, stock: StockId): RulePiece[] => sentenceOf(lang, stock, SHOW[stock], "show");

/** One rule of each kind, with the widest numbers the shipped ranges give, for `stock` and about `other`. */
function widestRules(stock: StockId, other: StockId): Record<RuleKind, Rule> {
  const { count, percentUp, percentDown, wonUp, wonDown, perShare, bandFrom, bandWidth, volume } = draw;
  return {
    breadth: { kind: "breadth", count: count.to, up: percentUp.to, down: percentDown.to },
    follows: { kind: "follows", of: other, way: "down", up: percentUp.to, down: percentDown.to },
    "per-share": { kind: "per-share", of: other, won: perShare.to },
    emblem: { kind: "emblem" },
    secret: { kind: "secret", on: other, up: percentUp.to, down: wonDown.to },
    outbuy: { kind: "outbuy", volume: "bought", than: other, up: wonUp.to, down: wonDown.to },
    band: { kind: "band", of: other, from: bandFrom.to, to: bandFrom.to + bandWidth.to, up: wonUp.to, down: wonDown.to },
    volume: { kind: "volume", volume: "bought", of: other, atLeast: volume.to, up: wonUp.to, down: wonDown.to },
    net: { kind: "net", of: other, up: wonUp.to, down: wonDown.to },
    outhold: { kind: "outhold", than: other, up: wonUp.to, down: wonDown.to },
  };
}

describe("미스터리 거래소, the rule board: the show's sentences", () => {
  it.each<[StockId, string]>([
    ["finance", "4개 이상의 주식이 상승할 경우 다음 라운드 +20%, 4개 이상의 주식이 하락할 경우 다음 라운드 -10%"],
    ["build", "방어제철의 가격이 올랐으면 +10%, 그렇지 않으면 -10%"],
    ["steel", "방어제철의 보유 총량이 증가한 만큼 1주당 -200원, 감소한 만큼 1주당 +200원"],
    ["alt", "알트엔터의 주가 변동 그래프는 미스터리 거래소 로고와 일치한다"],
    ["open", "후자전자에 시크릿이 걸려 있으면 +13%, 그렇지 않으면 -1000원"],
    ["coyo", "코요테크의 매수량이 후자전자의 매수량보다 많을 경우 +1400원, 그렇지 않으면 -700원"],
    ["latter", "후자전자의 보유 총량이 10주 이상 30주 이하이면 +1500원, 그렇지 않으면 -1000원"],
  ])("writes the rule of %s as the show's board has it", (stock, sentence) => {
    expect(read("ko", showSentence("ko", stock))).toBe(sentence);
  });

  it.each<[StockId, string[][]]>([
    ["finance", [["다음"], ["주식이", "경우", "주식이"], ["다음 라운드 +20%,", "경우", "라운드"], ["상승할", "하락할", "-10%"], ["4개 이상의", "4개 이상의"]]],
    ["build", [["가격이"], ["그렇지 않으면"], ["올랐으면", "+10%,"], ["-10%"], ["방어제철의"]]],
    ["steel", [["-200원,", "+200원"], ["보유 총량이"], ["1주당", "1주당"], ["증가한 만큼", "감소한 만큼"], ["방어제철의"]]],
    ["alt", [["한다"], ["알트엔터의"], ["주가 변동 그래프는"], ["와 일치"], ["미스터리 거래소 로고"]]],
    ["open", [["있으면", ", 그렇지"], ["+13%", "않으면"], ["-1000원"], ["후자전자에"], ["시크릿이 걸려"]]],
    ["coyo", [["매수량", "많을 경우"], ["코요테크의", "그렇지 않으면"], ["+1400원,", "-700원"], ["매수량이", "보다"], ["후자전자의"]]],
    ["latter", [["+1500원,"], ["이상", "이하이면", "그렇지 않으면"], ["보유 총량이", "-1000원"], ["후자전자의"], ["10주", "30주"]]],
  ])("opens the rule of %s in the show's order: what is read from the start, then at rounds 5, 10, 15 and 20", (stock, stages) => {
    expect(openedAt("ko", showSentence("ko", stock))).toEqual(stages);
  });

  it.each<[StockId, string]>([
    ["finance", "If 4 or more stocks rise, +20% next round; if 4 or more stocks fall, -10% next round."],
    ["build", "If Defense Steel's price rose, +10%; otherwise -10%."],
    ["steel", "Defense Steel's total holdings: for each share more, -200 won; for each share fewer, +200 won."],
    ["alt", "Alt Entertainment's price chart is the same as the Mystery Stock Market logo."],
    ["open", "If a secret is on Latter Electronics, +13%; if not, -1000 won."],
    ["coyo", "If CoyoTech's bought volume is higher than Latter Electronics' bought volume, +1400 won; otherwise -700 won."],
    ["latter", "If Latter Electronics' total holdings are 10 shares or more and 30 shares or fewer, +1500 won; otherwise -1000 won."],
  ])("writes the rule of %s in English", (stock, sentence) => {
    expect(read("en", showSentence("en", stock))).toBe(sentence);
  });

  it.each<[StockId, string[][]]>([
    ["finance", [["next"], ["If", "stocks", "stocks"], ["+20% next round;", "if", "round."], ["rise,", "fall,", "-10%"], ["4 or more", "4 or more"]]],
    ["build", [["price"], ["otherwise"], ["If", "rose,", "+10%;"], ["-10%."], ["Defense Steel's"]]],
    ["steel", [["-200 won;", "+200 won."], ["total holdings:"], ["for each share", "for each share"], ["more,", "fewer,"], ["Defense Steel's"]]],
    ["alt", [["is"], ["Alt Entertainment's"], ["price chart"], ["the same as"], ["the Mystery Stock Market logo."]]],
    ["open", [["If", "if"], ["+13%;", "not,"], ["-1000 won."], ["Latter Electronics,"], ["a secret is on"]]],
    ["coyo", [["If", "is higher", "bought volume,"], ["CoyoTech's", "otherwise"], ["+1400 won;", "-700 won."], ["bought volume", "than"], ["Latter Electronics'"]]],
    ["latter", [["+1500 won;"], ["If", "are", "or more", "and", "or fewer,", "otherwise"], ["total holdings", "-1000 won."], ["Latter Electronics'"], ["10 shares", "30 shares"]]],
  ])("opens the English rule of %s as the Korean one is opened", (stock, stages) => {
    expect(openedAt("en", showSentence("en", stock))).toEqual(stages);
  });

  it("writes a rule with the numbers the rule has", () => {
    const other = showRules({ ...shipped.rules, latter: { from: 3, to: 8, up: 70, down: 60 } });

    expect(read("ko", sentenceOf("ko", "latter", other.latter, "show"))).toBe("후자전자의 보유 총량이 3주 이상 8주 이하이면 +70원, 그렇지 않으면 -60원");
    expect(read("en", sentenceOf("en", "latter", other.latter, "show"))).toBe("If Latter Electronics' total holdings are 3 shares or more and 8 shares or fewer, +70 won; otherwise -60 won.");
  });
});

describe("미스터리 거래소, the rule board: the sentences of a game's own rules", () => {
  it.each<[string, StockId, Rule, string, string]>([
    [
      "a count of rising stocks",
      "coyo",
      { kind: "breadth", count: 3, up: 8, down: 5 },
      "3개 이상의 주식이 상승할 경우 다음 라운드 +8%, 3개 이상의 주식이 하락할 경우 다음 라운드 -5%",
      "If 3 or more stocks rise, +8% next round; if 3 or more stocks fall, -5% next round.",
    ],
    ["a stock followed down", "open", { kind: "follows", of: "finance", way: "down", up: 12, down: 7 }, "맛소금융의 가격이 내렸으면 +12%, 그렇지 않으면 -7%", "If Seasoned's price fell, +12%; otherwise -7%."],
    [
      "another stock's holdings, share by share",
      "coyo",
      { kind: "per-share", of: "build", won: 300 },
      "무조건설의 보유 총량이 증가한 만큼 1주당 -300원, 감소한 만큼 1주당 +300원",
      "Airtight's total holdings: for each share more, -300 won; for each share fewer, +300 won.",
    ],
    ["the emblem", "coyo", { kind: "emblem" }, "코요테크의 주가 변동 그래프는 미스터리 거래소 로고와 일치한다", "CoyoTech's price chart is the same as the Mystery Stock Market logo."],
    ["a secret on its own stock", "alt", { kind: "secret", on: "alt", up: 15, down: 800 }, "알트엔터에 시크릿이 걸려 있으면 +15%, 그렇지 않으면 -800원", "If a secret is on Alt Ent, +15%; if not, -800 won."],
    [
      "more sold than of another",
      "latter",
      { kind: "outbuy", volume: "sold", than: "steel", up: 1100, down: 900 },
      "후자전자의 매도량이 방어제철의 매도량보다 많을 경우 +1100원, 그렇지 않으면 -900원",
      "If Latter's sold volume is higher than Defense's sold volume, +1100 won; otherwise -900 won.",
    ],
    [
      "another stock's holdings in a band",
      "finance",
      { kind: "band", of: "open", from: 12, to: 37, up: 2000, down: 1500 },
      "열림보안의 보유 총량이 12주 이상 37주 이하이면 +2000원, 그렇지 않으면 -1500원",
      "If Open's total holdings are 12 shares or more and 37 shares or fewer, +2000 won; otherwise -1500 won.",
    ],
    [
      "so many shares sold",
      "finance",
      { kind: "volume", volume: "sold", of: "coyo", atLeast: 15, up: 900, down: 600 },
      "코요테크의 매도량이 15주 이상이면 +900원, 그렇지 않으면 -600원",
      "If CoyoTech's sold volume is 15 shares or more, +900 won; otherwise -600 won.",
    ],
    [
      "more bought than sold",
      "steel",
      { kind: "net", of: "open", up: 1200, down: 800 },
      "열림보안의 매수량이 매도량보다 많을 경우 +1200원, 그렇지 않으면 -800원",
      "If Open's bought volume is higher than its sold volume, +1200 won; otherwise -800 won.",
    ],
    [
      "more held than of another",
      "steel",
      { kind: "outhold", than: "alt", up: 1000, down: 500 },
      "방어제철의 보유 총량이 알트엔터의 보유 총량보다 많을 경우 +1000원, 그렇지 않으면 -500원",
      "If Defense's total holdings are higher than Alt Ent's total holdings, +1000 won; otherwise -500 won.",
    ],
  ])("writes a rule about %s, naming companies as the monitor's table does", (_what, stock, rule, korean, english) => {
    expect(read("ko", sentenceOf("ko", stock, rule, "fresh"))).toBe(korean);
    expect(read("en", sentenceOf("en", stock, rule, "fresh"))).toBe(english);
  });

  it.each<[string, StockId, Rule, string[][], string[][]]>([
    [
      "so many shares sold",
      "finance",
      { kind: "volume", volume: "sold", of: "coyo", atLeast: 15, up: 900, down: 600 },
      [["+900원,"], ["이상이면", "그렇지 않으면"], ["매도량이", "-600원"], ["15주"], ["코요테크의"]],
      [["+900 won;"], ["If", "is", "or more,", "otherwise"], ["sold volume", "-600 won."], ["15 shares"], ["CoyoTech's"]],
    ],
    [
      "more bought than sold",
      "steel",
      { kind: "net", of: "open", up: 1200, down: 800 },
      [["많을 경우"], ["+1200원,", "그렇지 않으면"], ["매수량이", "-800원"], ["매도량", "보다"], ["열림보안의"]],
      [["If", "is higher"], ["+1200 won;", "otherwise"], ["bought volume", "-800 won."], ["than", "its sold volume,"], ["Open's"]],
    ],
    [
      "more held than of another",
      "steel",
      { kind: "outhold", than: "alt", up: 1000, down: 500 },
      [["보유 총량", "많을 경우"], ["방어제철의", "그렇지 않으면"], ["+1000원,", "-500원"], ["보유 총량이", "보다"], ["알트엔터의"]],
      [["If", "are higher", "total holdings,"], ["Defense's", "otherwise"], ["+1000 won;", "-500 won."], ["total holdings", "than"], ["Alt Ent's"]],
    ],
  ])("opens a rule about %s in the same order in both languages: from the start, then at rounds 5, 10, 15 and 20", (_what, stock, rule, korean, english) => {
    expect(openedAt("ko", sentenceOf("ko", stock, rule, "fresh"))).toEqual(korean);
    expect(openedAt("en", sentenceOf("en", stock, rule, "fresh"))).toEqual(english);
  });

  it("opens a rule of a kind the show has in the show's order, whichever company and numbers a game drew for it", () => {
    const drawn: [StockId, Rule][] = [
      ["coyo", { kind: "breadth", count: 5, up: 8, down: 5 }],
      ["open", { kind: "follows", of: "steel", way: "up", up: 12, down: 7 }],
      ["coyo", { kind: "per-share", of: "steel", won: 300 }],
      ["coyo", { kind: "emblem" }],
      ["alt", { kind: "secret", on: "latter", up: 15, down: 800 }],
      ["latter", { kind: "outbuy", volume: "bought", than: "latter", up: 1100, down: 900 }],
      ["finance", { kind: "band", of: "latter", from: 12, to: 37, up: 2000, down: 1500 }],
    ];
    const shown: StockId[] = ["finance", "build", "steel", "alt", "open", "coyo", "latter"];
    const stagesOf = (pieces: readonly RulePiece[]): [string, number][] => pieces.map((piece) => [piece.key, piece.stage]);

    for (const lang of LANGS) {
      drawn.forEach(([stock, rule], at) => {
        expect(stagesOf(sentenceOf(lang, stock, rule, "fresh")), `${lang} ${rule.kind}`).toEqual(stagesOf(showSentence(lang, shown[at])));
      });
    }
  });

  it("has a sentence for every kind of rule in each language, with something to open at every stage and nothing after the last", () => {
    for (const lang of LANGS) {
      for (const kind of RULE_KINDS) {
        const pieces = sentenceOf(lang, "coyo", widestRules("coyo", "latter")[kind], "fresh");
        const stages = [...new Set(pieces.map((piece) => piece.stage))].sort((a, b) => a - b);

        expect(stages, `${lang} ${kind}`).toEqual(EVERY_STAGE);
        expect(pieces.every((piece) => said(lang, piece) !== ""), `${lang} ${kind}`).toBe(true);
      }
    }
  });

  it("opens the name of another stock a rule goes by last of all, or last but one", () => {
    for (const lang of LANGS) {
      for (const kind of ["follows", "per-share", "secret", "outbuy", "band", "volume", "net", "outhold"] as const) {
        const pieces = sentenceOf(lang, "coyo", widestRules("coyo", "latter")[kind], "fresh");
        const naming = pieces.filter((piece) => piece.args.includes("latter"));

        expect(naming, `${lang} ${kind}`).toHaveLength(1);
        expect(naming[0].stage, `${lang} ${kind}`).toBeGreaterThanOrEqual(STAGES - 1);
      }
    }
  });

  it("says nothing for words a language does not have", () => {
    expect(textOf("ko", "no-such-words", [])).toBe("");
    expect(textOf("en", "toString", [])).toBe("");
    expect(textOf("ko", "held", [])).toBe("보유 총량이");
  });

  it("names the seven companies in both languages, and in English shorter for the table", () => {
    for (const lang of LANGS) {
      expect(Object.keys(STOCK_NAMES[lang].name).sort()).toEqual([...STOCKS].sort());
      expect(Object.keys(STOCK_NAMES[lang].short).sort()).toEqual([...STOCKS].sort());
    }
    expect(STOCK_NAMES.ko.name).toEqual(STOCK_NAMES.ko.short);
    expect(STOCKS.every((stock) => STOCK_NAMES.en.short[stock].length <= STOCK_NAMES.en.name[stock].length)).toBe(true);
  });
});

describe("미스터리 거래소, the rule board: how wide words are", () => {
  it("counts a Korean letter as 12 pixels and a Latin one by the font's own table", () => {
    expect(widthOf("")).toBe(0);
    expect(widthOf("가")).toBe(12);
    expect(widthOf("보유 총량이")).toBe(5 * 12 + 5);
    expect(widthOf("If")).toBe(4 + 6);
    expect(widthOf("+1500")).toBe(8 + 6 + 8 + 8 + 8);
    expect(widthOf("mW%")).toBe(30);
    expect(widthOf(".,;:'")).toBe(20);
  });

  it("takes a letter it has no width for to be a wide one", () => {
    expect(widthOf("→")).toBe(12);
  });
});

describe("미스터리 거래소, the rule board: what a player is sent", () => {
  /** Every piece of every sentence there is to check: the show's, and those of many drawn games. */
  function everySentence(): { lang: Lang; rulebook: Rulebook; pieces: RulePiece[] }[] {
    const all: { lang: Lang; rulebook: Rulebook; pieces: RulePiece[] }[] = [];
    for (const lang of LANGS) {
      for (const stock of STOCKS) all.push({ lang, rulebook: "show", pieces: showSentence(lang, stock) });
      for (let seed = 0; seed < SEEDS; seed++) {
        const rules = drawRules(seed, draw);
        for (const stock of STOCKS) all.push({ lang, rulebook: "fresh", pieces: sentenceOf(lang, stock, rules[stock], "fresh") });
      }
    }
    return all;
  }

  it("sends the pieces opened so far as they are, and of the others no word, number or company: only a shape", () => {
    for (const { lang, pieces } of everySentence()) {
      for (const readable of EVERY_STAGE) {
        const card = cardOf(lang, pieces, readable);

        expect(card).toHaveLength(pieces.length);
        card.forEach((shown, at) => {
          const piece = pieces[at];
          if (piece.stage <= readable) expect(shown).toEqual({ open: true, key: piece.key, args: piece.args, ...(piece.glue === true ? { glue: true } : {}) });
          else {
            expect(Object.keys(shown).sort()).toEqual(piece.glue === true ? ["glue", "next", "open", "words"] : ["next", "open", "words"]);
            expect(shown).toMatchObject({ open: false, next: piece.stage === readable + 1 });
          }
        });
      }
    }
  });

  it("opens everything to someone who may read every stage, and marks nothing as next", () => {
    for (const { lang, pieces } of everySentence()) {
      expect(cardOf(lang, pieces, STAGES).every((shown) => shown.open)).toBe(true);
    }
  });

  it("shapes a covered word as its letters: a square to each, a low mark for a comma, and the width it will be read at", () => {
    const pieces = sentenceOf("ko", "latter", SHOW.latter, "show");
    const card = cardOf("ko", pieces, 0);
    const covered = (text: string): CardPiece => card[pieces.findIndex((piece) => said("ko", piece) === text)];

    expect(covered("후자전자의")).toEqual({ open: false, next: false, words: [[[5, 60]]] });
    expect(covered("보유 총량이")).toEqual({ open: false, next: false, words: [[[2, 24]], [[3, 36]]] });
    expect(covered("이상")).toEqual({ open: false, next: true, words: [[[2, 24]]] });
    expect(covered("10주")).toEqual({ open: false, next: false, words: [[[3, 26]]] });
    // a minus and a one are 6 wide, a plus and the other figures 8
    expect(covered("-1000원")).toEqual({ open: false, next: false, words: [[[6, 6 + 6 + 3 * 8 + 12]]] });
    expect(cardOf("ko", sentenceOf("ko", "coyo", SHOW.coyo, "show"), 0)[6]).toEqual({ open: false, next: false, words: [[[6, 8 + 6 + 3 * 8 + 12], [0, 4]]] });
  });

  it("keeps a mark inside a word where it is: a square for what is before it and after", () => {
    const card = cardOf("en", sentenceOf("en", "build", SHOW.build, "show"), 0);

    // "Defense Steel's": seven letters; five, the mark, and one more
    expect(card[1]).toEqual({ open: false, next: false, words: [[[7, widthOf("Defense")]], [[5, widthOf("Steel")], [0, 4], [1, widthOf("s")]]] });
  });

  it("keeps a piece that stands against the one before it standing against it, open or covered", () => {
    const pieces = sentenceOf("ko", "alt", SHOW.alt, "show");

    expect(cardOf("ko", pieces, 0).map((shown) => shown.glue === true)).toEqual([false, false, false, true, true]);
    expect(cardOf("ko", pieces, STAGES).map((shown) => shown.glue === true)).toEqual([false, false, false, true, true]);
  });

  it("covers every company alike in a game's own rules: the shape does not tell which one a rule goes by", () => {
    for (const lang of LANGS) {
      const shapes = new Set(
        STOCKS.filter((other) => other !== "coyo").map((other) => {
          const rules = widestRules("coyo", other);
          return JSON.stringify((["follows", "per-share", "secret", "outbuy", "band", "volume", "net", "outhold"] as const).map((kind) => cardOf(lang, sentenceOf(lang, "coyo", rules[kind], "fresh"), 0)));
        }),
      );

      expect(shapes.size, lang).toBe(1);
    }
  });

  it("covers the company that has a rule like any other, where its name is not open yet", () => {
    for (const lang of LANGS) {
      const shapes = new Set(STOCKS.map((stock) => JSON.stringify(cardOf(lang, sentenceOf(lang, stock, { kind: "emblem" }, "fresh"), 0))));

      expect(shapes.size, lang).toBe(1);
    }
  });

  it("covers what was bought and what was sold alike", () => {
    for (const lang of LANGS) {
      const shape = (volume: "bought" | "sold"): string =>
        JSON.stringify([
          cardOf(lang, sentenceOf(lang, "coyo", { kind: "outbuy", volume, than: "alt", up: 900, down: 600 }, "fresh"), 0).filter((shown) => !shown.open),
          cardOf(lang, sentenceOf(lang, "coyo", { kind: "volume", volume, of: "alt", atLeast: 10, up: 900, down: 600 }, "fresh"), 0).filter((shown) => !shown.open),
        ]);

      expect(shape("sold"), lang).toBe(shape("bought"));
    }
  });

  it("covers a company no narrower than any company's name is once it is open", () => {
    const covered = cardOf("en", sentenceOf("en", "coyo", { kind: "follows", of: "alt", way: "up", up: 10, down: 10 }, "fresh"), 0)[1];
    const width = covered.open ? 0 : covered.words.reduce((sum, word) => sum + word.reduce((all, [, each]) => all + each, 0), 0);

    for (const stock of STOCKS) expect(width, stock).toBeGreaterThanOrEqual(widthOf(textOf("en", "of", [stock, "short"])));
  });

  it("covers the show's own rules as they are written, a company's name by its own letters", () => {
    const steel = cardOf("en", sentenceOf("en", "build", SHOW.build, "show"), 0)[1];
    const latter = cardOf("en", sentenceOf("en", "coyo", SHOW.coyo, "show"), 0)[5];

    expect(steel).not.toEqual(latter);
    expect(latter).toEqual({ open: false, next: false, words: [[[6, widthOf("Latter")]], [[11, widthOf("Electronics")], [0, 4]]] });
  });
});

describe("미스터리 거래소, the rule board: where the words go", () => {
  const word = (width: number, glue = false): { width: number; glue: boolean } => ({ width, glue });

  it("sets words one after another, a gap apart, from the left", () => {
    expect(placeWords([word(30), word(20), word(10)], 100, 4)).toEqual([
      { x: 0, line: 0 },
      { x: 34, line: 0 },
      { x: 58, line: 0 },
    ]);
  });

  it("begins the next line with a word that would pass the room, and lets one that just fits stay", () => {
    expect(placeWords([word(60), word(36), word(10)], 100, 4)).toEqual([
      { x: 0, line: 0 },
      { x: 64, line: 0 },
      { x: 0, line: 1 },
    ]);
    expect(placeWords([word(60), word(37)], 100, 4)[1]).toEqual({ x: 0, line: 1 });
  });

  it("sets a word that stands against the one before it right after it, and takes both to the next line together", () => {
    expect(placeWords([word(30), word(20, true)], 100, 4)).toEqual([
      { x: 0, line: 0 },
      { x: 30, line: 0 },
    ]);
    expect(placeWords([word(60), word(30), word(20, true)], 100, 4)).toEqual([
      { x: 0, line: 0 },
      { x: 0, line: 1 },
      { x: 30, line: 1 },
    ]);
  });

  it("places nothing where there is nothing", () => {
    expect(placeWords([], 100, 4)).toEqual([]);
  });

  it("turns a card into the words the screen draws: an open piece word by word, a covered one shape by shape", () => {
    const card = cardOf("ko", showSentence("ko", "alt"), 1);

    expect(wordsOf("ko", card)).toEqual([
      { open: true, text: "알트엔터의", width: 60, glue: false },
      { open: false, next: true, shape: [[2, 24]], width: 24, glue: false },
      { open: false, next: true, shape: [[2, 24]], width: 24, glue: false },
      { open: false, next: true, shape: [[4, 48]], width: 48, glue: false },
      { open: false, next: false, shape: [[4, 48]], width: 48, glue: false },
      { open: false, next: false, shape: [[3, 36]], width: 36, glue: false },
      { open: false, next: false, shape: [[2, 24]], width: 24, glue: false },
      { open: false, next: false, shape: [[1, 12]], width: 12, glue: true },
      { open: false, next: false, shape: [[2, 24]], width: 24, glue: false },
      { open: true, text: "한다", width: 24, glue: true },
    ]);
  });

  it("measures an open word as it is told to", () => {
    const card = cardOf("en", showSentence("en", "alt"), STAGES);

    expect(wordsOf("en", card, () => 7).every((each) => each.width === 7)).toBe(true);
  });

  /** How many lines a sentence takes on the board, and how far its widest line reaches, at every stage of its opening. */
  function roomTaken(lang: Lang, pieces: readonly RulePiece[]): { lines: number; reach: number } {
    let lines = 0;
    let reach = 0;
    for (const readable of EVERY_STAGE) {
      const words = wordsOf(lang, cardOf(lang, pieces, readable));
      placeWords(words, CARD.width, CARD.gap).forEach((place, at) => {
        lines = Math.max(lines, place.line + 1);
        reach = Math.max(reach, place.x + words[at].width);
      });
    }
    return { lines, reach };
  }

  it("has room on the board for each of the show's rules in each language, covered and open", () => {
    for (const lang of LANGS) {
      for (const stock of STOCKS) {
        const taken = roomTaken(lang, showSentence(lang, stock));

        expect(taken.lines, `${lang} ${stock}`).toBeLessThanOrEqual(CARD.lines);
        expect(taken.reach, `${lang} ${stock}`).toBeLessThanOrEqual(CARD.width);
      }
    }
  });

  it("has room for a rule of every kind with the widest numbers, about any company, in each language", () => {
    for (const lang of LANGS) {
      for (const stock of STOCKS) {
        for (const other of STOCKS.filter((each) => each !== stock)) {
          const rules = widestRules(stock, other);
          for (const kind of RULE_KINDS) {
            const taken = roomTaken(lang, sentenceOf(lang, stock, rules[kind], "fresh"));

            expect(taken.lines, `${lang} ${kind} of ${stock} about ${other}`).toBeLessThanOrEqual(CARD.lines);
            expect(taken.reach, `${lang} ${kind} of ${stock} about ${other}`).toBeLessThanOrEqual(CARD.width);
          }
        }
      }
    }
  });

  it("has room for every rule of many drawn games", () => {
    for (const lang of LANGS) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const rules = drawRules(seed, draw);
        for (const stock of STOCKS) {
          const taken = roomTaken(lang, sentenceOf(lang, stock, rules[stock], "fresh"));

          expect(taken.lines, `${lang} seed ${seed} ${stock}`).toBeLessThanOrEqual(CARD.lines);
          expect(taken.reach, `${lang} seed ${seed} ${stock}`).toBeLessThanOrEqual(CARD.width);
        }
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/mystery-stock-market/config.json";
import { RULE_KINDS, STOCKS, type Rule, type RuleKind, type StockId } from "../../../src/shared/games/mystery-stock-market/prices";
import {
  CARD,
  STOCK_NAMES,
  cardOf,
  nextStageOf,
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
/** What a rule by the share is given here: the show's own number, as no fresh game draws that kind. */
const PER_SHARE_WON = shipped.rules.steel.perShare;
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
/**
 * A Korean sentence as the board shows it to someone who may read `readable`
 * stages of it: an open word as it is, a covered one as a square to each
 * letter, and the comma of a covered word as itself (the only mark the
 * show's Korean sentences have).
 */
function written(pieces: readonly RulePiece[], readable: number): string {
  return cardOf("ko", pieces, readable).reduce((line, shown, at) => {
    const words = shown.open
      ? textOf("ko", shown.key, shown.args)
      : shown.words.map((word) => word.map(([squares]) => (squares === 0 ? "," : "□".repeat(squares))).join("")).join(" ");
    return line + (at === 0 || shown.glue === true ? "" : " ") + words;
  }, "");
}

/** One rule of each kind, with the widest numbers the shipped ranges give, for `stock` and about `other`. */
function widestRules(stock: StockId, other: StockId): Record<RuleKind, Rule> {
  const { count, percentUp, percentDown, wonUp, wonDown, bandFrom, bandWidth, volume } = draw;
  return {
    breadth: { kind: "breadth", count: count.to, up: percentUp.to, down: percentDown.to },
    follows: { kind: "follows", of: other, way: "down", up: percentUp.to, down: percentDown.to },
    "per-share": { kind: "per-share", of: other, won: PER_SHARE_WON },
    emblem: { kind: "emblem" },
    secret: { kind: "secret", on: other, up: percentUp.to, down: wonDown.to },
    outbuy: { kind: "outbuy", volume: "bought", than: other, up: wonUp.to, down: wonDown.to },
    band: { kind: "band", of: other, from: bandFrom.to, to: bandFrom.to + bandWidth.to, up: wonUp.to, down: wonDown.to },
    volume: { kind: "volume", volume: "bought", of: other, atLeast: volume.to, up: wonUp.to, down: wonDown.to },
    net: { kind: "net", of: other, up: wonUp.to, down: wonDown.to },
    outhold: { kind: "outhold", than: other, up: wonUp.to, down: wonDown.to },
    signal: { kind: "signal", what: "held", of: other, up: wonUp.to, down: wonDown.to },
  };
}

/** The rules a drawn game has the other way round than the show, and the emblem's signal for each count, with the widest numbers. */
function turnedRules(other: StockId): Rule[] {
  const { wonUp, wonDown, bandFrom, bandWidth } = draw;
  const won = { up: wonUp.to, down: wonDown.to };
  return [
    { kind: "outbuy", volume: "bought", than: other, less: true, ...won },
    { kind: "outbuy", volume: "sold", than: other, less: true, ...won },
    { kind: "band", what: "bought", of: other, from: bandFrom.to, to: bandFrom.to + bandWidth.to, ...won },
    { kind: "band", what: "sold", of: other, from: bandFrom.to, to: bandFrom.to + bandWidth.to, ...won },
    { kind: "signal", what: "bought", of: other, ...won },
    { kind: "signal", what: "sold", of: other, ...won },
  ];
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
    ["finance", [["다음"], ["주식이", "경우", "주식이"], ["다음 라운드 +20%,", "라운드", "-10%"], ["상승할", "하락할", "경우"], ["4개 이상의", "4개 이상의"]]],
    ["build", [["가격이"], ["그렇지 않으면"], ["올랐으면", "+10%,"], ["-10%"], ["방어제철의"]]],
    ["steel", [["-200원,", "+200원"], ["보유 총량이"], ["1주당", "1주당"], ["증가한 만큼", "감소한 만큼"], ["방어제철의"]]],
    ["alt", [["한다"], ["알트엔터의"], ["주가 변동"], ["그래프는", "와 일치"], ["미스터리 거래소 로고"]]],
    ["open", [["있으면", ", 그렇지"], ["+13%", "않으면"], ["-1000원"], ["후자전자에"], ["시크릿이 걸려"]]],
    ["coyo", [["매수량", "많을 경우"], ["코요테크의", "그렇지 않으면"], ["+1400원,", "-700원"], ["매수량이", "보다"], ["후자전자의"]]],
    ["latter", [["+1500원,"], ["이상", "이하이면", "그렇지 않으면"], ["후자전자의"], ["보유 총량이", "-1000원"], ["10주", "30주"]]],
  ])("opens the rule of %s in the show's order: what is read from the start, then at rounds 5, 10, 15 and 20", (stock, stages) => {
    expect(openedAt("ko", showSentence("ko", stock))).toEqual(stages);
  });

  /**
   * The board as a record of the show has it: at the start, and after rounds
   * 5, 10 and 15 opened more of it (Namuwiki, 데블스 플랜: 데드 어게인/2일차,
   * the four tables of the board before the last, read 2026-11-12). Two words
   * of that record are not followed, in the rule and so here: its last amount
   * of 후자전자 is -1500원, where the prices of the same record fall by 1000
   * (design/games/mystery-stock-market.md).
   */
  it.each<[StockId, [string, string, string, string]]>([
    [
      "finance",
      [
        "□□ □□□ □□□ □□□ □□ □□ □□□ □□□□, □□ □□□ □□□ □□□ □□ 다음 □□□ □□□□",
        "□□ □□□ 주식이 □□□ 경우 □□ □□□ □□□□, □□ □□□ 주식이 □□□ □□ 다음 □□□ □□□□",
        "□□ □□□ 주식이 □□□ 경우 다음 라운드 +20%, □□ □□□ 주식이 □□□ □□ 다음 라운드 -10%",
        "□□ □□□ 주식이 상승할 경우 다음 라운드 +20%, □□ □□□ 주식이 하락할 경우 다음 라운드 -10%",
      ],
    ],
    [
      "build",
      [
        "□□□□□ 가격이 □□□□ □□□□, □□□ □□□ □□□□",
        "□□□□□ 가격이 □□□□ □□□□, 그렇지 않으면 □□□□",
        "□□□□□ 가격이 올랐으면 +10%, 그렇지 않으면 □□□□",
        "□□□□□ 가격이 올랐으면 +10%, 그렇지 않으면 -10%",
      ],
    ],
    [
      "steel",
      [
        "□□□□□ □□ □□□ □□□ □□ □□□ -200원, □□□ □□ □□□ +200원",
        "□□□□□ 보유 총량이 □□□ □□ □□□ -200원, □□□ □□ □□□ +200원",
        "□□□□□ 보유 총량이 □□□ □□ 1주당 -200원, □□□ □□ 1주당 +200원",
        "□□□□□ 보유 총량이 증가한 만큼 1주당 -200원, 감소한 만큼 1주당 +200원",
      ],
    ],
    [
      "alt",
      [
        "□□□□□ □□ □□ □□□□ □□□□ □□□ □□□ □□한다",
        "알트엔터의 □□ □□ □□□□ □□□□ □□□ □□□ □□한다",
        "알트엔터의 주가 변동 □□□□ □□□□ □□□ □□□ □□한다",
        "알트엔터의 주가 변동 그래프는 □□□□ □□□ □□와 일치한다",
      ],
    ],
    [
      "open",
      [
        "□□□□□ □□□□ □□ 있으면 □□□□, 그렇지 □□□ □□□□□□",
        "□□□□□ □□□□ □□ 있으면 +13%, 그렇지 않으면 □□□□□□",
        "□□□□□ □□□□ □□ 있으면 +13%, 그렇지 않으면 -1000원",
        "후자전자에 □□□□ □□ 있으면 +13%, 그렇지 않으면 -1000원",
      ],
    ],
    [
      "coyo",
      [
        "□□□□□ □□□□ □□□□□ 매수량□□ 많을 경우 □□□□□□, □□□ □□□ □□□□□",
        "코요테크의 □□□□ □□□□□ 매수량□□ 많을 경우 □□□□□□, 그렇지 않으면 □□□□□",
        "코요테크의 □□□□ □□□□□ 매수량□□ 많을 경우 +1400원, 그렇지 않으면 -700원",
        "코요테크의 매수량이 □□□□□ 매수량보다 많을 경우 +1400원, 그렇지 않으면 -700원",
      ],
    ],
    [
      "latter",
      [
        "□□□□□ □□ □□□ □□□ □□ □□□ □□□□ +1500원, □□□ □□□ □□□□□□",
        "□□□□□ □□ □□□ □□□ 이상 □□□ 이하이면 +1500원, 그렇지 않으면 □□□□□□",
        "후자전자의 □□ □□□ □□□ 이상 □□□ 이하이면 +1500원, 그렇지 않으면 □□□□□□",
        "후자전자의 보유 총량이 □□□ 이상 □□□ 이하이면 +1500원, 그렇지 않으면 -1000원",
      ],
    ],
  ])("covers the rule of %s as the record of the show's board has it, from the start and after rounds 5, 10 and 15", (stock, boards) => {
    const pieces = showSentence("ko", stock);

    expect([0, 1, 2, 3].map((readable) => written(pieces, readable))).toEqual(boards);
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
    ["finance", [["next"], ["If", "stocks", "stocks"], ["+20% next round;", "-10%", "round."], ["rise,", "if", "fall,"], ["4 or more", "4 or more"]]],
    ["build", [["price"], ["otherwise"], ["If", "rose,", "+10%;"], ["-10%."], ["Defense Steel's"]]],
    ["steel", [["-200 won;", "+200 won."], ["total holdings:"], ["for each share", "for each share"], ["more,", "fewer,"], ["Defense Steel's"]]],
    ["alt", [["is"], ["Alt Entertainment's"], ["price"], ["chart", "the same as"], ["the Mystery Stock Market logo."]]],
    ["open", [["If", "if"], ["+13%;", "not,"], ["-1000 won."], ["Latter Electronics,"], ["a secret is on"]]],
    ["coyo", [["If", "is higher", "bought volume,"], ["CoyoTech's", "otherwise"], ["+1400 won;", "-700 won."], ["bought volume", "than"], ["Latter Electronics'"]]],
    ["latter", [["+1500 won;"], ["If", "are", "or more", "and", "or fewer,", "otherwise"], ["Latter Electronics'"], ["total holdings", "-1000 won."], ["10 shares", "30 shares"]]],
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
    [
      "fewer bought than of another",
      "latter",
      { kind: "outbuy", volume: "bought", than: "steel", less: true, up: 1100, down: 300 },
      "후자전자의 매수량이 방어제철의 매수량보다 적을 경우 +1100원, 그렇지 않으면 -300원",
      "If Latter's bought volume is lower than Defense's bought volume, +1100 won; otherwise -300 won.",
    ],
    [
      "a band on what was sold",
      "finance",
      { kind: "band", what: "sold", of: "open", from: 12, to: 37, up: 1500, down: 300 },
      "열림보안의 매도량이 12주 이상 37주 이하이면 +1500원, 그렇지 않으면 -300원",
      "If Open's sold volume is 12 shares or more and 37 shares or fewer, +1500 won; otherwise -300 won.",
    ],
    [
      "the emblem as a signal for what is held",
      "coyo",
      { kind: "signal", what: "held", of: "alt", up: 900, down: 200 },
      "알트엔터의 보유 총량이 미스터리 거래소 로고를 따라 움직이면 +900원, 그렇지 않으면 -200원",
      "If Alt Ent's total holdings moved with the Mystery Stock Market logo, +900 won; otherwise -200 won.",
    ],
    [
      "the emblem as a signal for what was bought",
      "coyo",
      { kind: "signal", what: "bought", of: "coyo", up: 900, down: 200 },
      "코요테크의 매수량이 미스터리 거래소 로고를 따라 움직이면 +900원, 그렇지 않으면 -200원",
      "If CoyoTech's bought volume moved with the Mystery Stock Market logo, +900 won; otherwise -200 won.",
    ],
  ])("writes a rule about %s, naming companies as the monitor's table does", (_what, stock, rule, korean, english) => {
    expect(read("ko", sentenceOf("ko", stock, rule, "fresh"))).toBe(korean);
    expect(read("en", sentenceOf("en", stock, rule, "fresh"))).toBe(english);
  });

  it.each<[string, StockId, Rule, string[][], string[][]]>([
    [
      "a count of rising stocks",
      "coyo",
      { kind: "breadth", count: 5, up: 8, down: 5 },
      [["주식이", "상승할", "경우", "주식이", "하락할", "경우", "다음", "라운드"], ["다음 라운드 +8%,"], ["-5%"], [], ["5개 이상의", "5개 이상의"]],
      [["If", "stocks", "rise,", "if", "stocks", "fall,", "next", "round."], ["+8% next round;"], ["-5%"], [], ["5 or more", "5 or more"]],
    ],
    [
      "a stock followed",
      "open",
      { kind: "follows", of: "steel", way: "up", up: 12, down: 7 },
      [["가격이", "그렇지 않으면"], ["+12%,"], ["-7%"], ["올랐으면"], ["방어제철의"]],
      [["If", "price", "otherwise"], ["+12%;"], ["-7%."], ["rose,"], ["Defense's"]],
    ],
    [
      "a secret",
      "alt",
      { kind: "secret", on: "latter", up: 15, down: 800 },
      [["시크릿이 걸려", "있으면", ", 그렇지", "않으면"], ["+15%"], ["-800원"], [], ["후자전자에"]],
      [["If", "a secret is on", "if", "not,"], ["+15%;"], ["-800 won."], [], ["Latter,"]],
    ],
    [
      "fewer bought than of another",
      "coyo",
      { kind: "outbuy", volume: "bought", than: "latter", less: true, up: 1100, down: 300 },
      [["코요테크의", "보다", "그렇지 않으면"], ["+1100원,"], ["-300원"], ["매수량이", "매수량", "적을 경우"], ["후자전자의"]],
      [["If", "CoyoTech's", "than", "otherwise"], ["+1100 won;"], ["-300 won."], ["bought volume", "is lower", "bought volume,"], ["Latter's"]],
    ],
    [
      "a band on what was sold",
      "finance",
      { kind: "band", what: "sold", of: "open", from: 12, to: 37, up: 1500, down: 300 },
      [["이상", "이하이면", "그렇지 않으면"], ["+1500원,"], ["-300원"], ["매도량이", "12주", "37주"], ["열림보안의"]],
      [["If", "or more", "and", "or fewer,", "otherwise"], ["+1500 won;"], ["-300 won."], ["sold volume", "is", "12 shares", "37 shares"], ["Open's"]],
    ],
    [
      "so many shares sold",
      "finance",
      { kind: "volume", volume: "sold", of: "coyo", atLeast: 15, up: 900, down: 600 },
      [["이상이면", "그렇지 않으면"], ["+900원,"], ["-600원"], ["매도량이", "15주"], ["코요테크의"]],
      [["If", "is", "or more,", "otherwise"], ["+900 won;"], ["-600 won."], ["sold volume", "15 shares"], ["CoyoTech's"]],
    ],
    [
      "more bought than sold",
      "steel",
      { kind: "net", of: "open", up: 1200, down: 800 },
      [["매수량이", "매도량", "보다", "많을 경우", "그렇지 않으면"], ["+1200원,"], ["-800원"], [], ["열림보안의"]],
      [["If", "bought volume", "is higher", "than", "its sold volume,", "otherwise"], ["+1200 won;"], ["-800 won."], [], ["Open's"]],
    ],
    [
      "more held than of another",
      "steel",
      { kind: "outhold", than: "alt", up: 1000, down: 500 },
      [["방어제철의", "보유 총량이", "보유 총량", "보다", "많을 경우", "그렇지 않으면"], ["+1000원,"], ["-500원"], [], ["알트엔터의"]],
      [["If", "Defense's", "total holdings", "are higher", "than", "total holdings,", "otherwise"], ["+1000 won;"], ["-500 won."], [], ["Alt Ent's"]],
    ],
    [
      "the emblem as a signal",
      "coyo",
      { kind: "signal", what: "sold", of: "alt", up: 900, down: 200 },
      [["미스터리 거래소 로고를", "따라", "움직이면", "그렇지 않으면"], ["+900원,"], ["-200원"], ["매도량이"], ["알트엔터의"]],
      [["If", "moved with", "the Mystery Stock Market logo,", "otherwise"], ["+900 won;"], ["-200 won."], ["sold volume"], ["Alt Ent's"]],
    ],
  ])(
    "shows the frame of a rule about %s from the start in both languages, and opens what the game drew at rounds 5, 10, 15 and 20: the gain, the loss, which and how many, the company",
    (_what, stock, rule, korean, english) => {
      expect(openedAt("ko", sentenceOf("ko", stock, rule, "fresh"))).toEqual(korean);
      expect(openedAt("en", sentenceOf("en", stock, rule, "fresh"))).toEqual(english);
    },
  );

  it("shows from the start nothing a game drew: the open words of a kind of rule are the same in every game, whatever company, count, way and numbers it has", () => {
    for (const lang of LANGS) {
      const frames = new Map<string, Set<string>>();
      for (let seed = 0; seed < SEEDS; seed++) {
        const rules = drawRules(seed, draw);
        for (const stock of STOCKS) {
          const rule = rules[stock];
          // a company's own name stands open in a rule that sets it against another: one frame to a company there
          const frame = rule.kind === "outbuy" || rule.kind === "outhold" ? `${rule.kind} ${stock}` : rule.kind;
          const open = openedAt(lang, sentenceOf(lang, stock, rule, "fresh"))[0].join(" ");
          frames.set(frame, (frames.get(frame) ?? new Set()).add(open));
        }
      }

      for (const [frame, open] of frames) expect([...open], `${lang} ${frame}`).toHaveLength(1);
    }
  });

  it("leaves the show's own order to the show's own rules", () => {
    const stagesOf = (lang: Lang, rulebook: Rulebook): number[] => sentenceOf(lang, "latter", SHOW.latter, rulebook).map((piece) => piece.stage);

    for (const lang of LANGS) expect(stagesOf(lang, "fresh"), lang).not.toEqual(stagesOf(lang, "show"));
    // the show opens what 후자전자 gains from the start, and its company at round 10; a drawn game the gain at round 5 and the company last
    expect(openedAt("ko", showSentence("ko", "latter"))[0]).toEqual(["+1500원,"]);
    expect(openedAt("ko", showSentence("ko", "latter"))[2]).toEqual(["후자전자의"]);
  });

  it("has a sentence for every kind of rule in each language: it opens the gain at round 5, the loss at round 10 and something at round 20, and nothing after", () => {
    for (const kind of RULE_KINDS) {
      const stagesIn = (lang: Lang): number[] => [...new Set(sentenceOf(lang, "coyo", widestRules("coyo", "latter")[kind], "fresh").map((piece) => piece.stage))].sort((a, b) => a - b);

      for (const lang of LANGS) {
        const pieces = sentenceOf(lang, "coyo", widestRules("coyo", "latter")[kind], "fresh");

        expect(stagesIn(lang).every((stage) => EVERY_STAGE.includes(stage)), `${lang} ${kind}`).toBe(true);
        // (알트엔터's own rule has no numbers: of a game's own kinds every one has a gain and a loss)
        if (kind !== "emblem") expect(stagesIn(lang), `${lang} ${kind}`).toEqual(expect.arrayContaining([0, 1, 2, STAGES]));
        expect(pieces.every((piece) => said(lang, piece) !== ""), `${lang} ${kind}`).toBe(true);
      }
      // a piece opens the next stage of a rule that has anything: that has to be the same stage in every language
      expect(stagesIn("en"), kind).toEqual(stagesIn("ko"));
    }
  });

  it("opens the same stages in both languages for every rule of many drawn games", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const rules = drawRules(seed, draw);
      for (const stock of STOCKS) {
        const stagesIn = (lang: Lang): number[] => [...new Set(sentenceOf(lang, stock, rules[stock], "fresh").map((piece) => piece.stage))].sort((a, b) => a - b);

        expect(stagesIn("en"), `seed ${seed} ${stock}`).toEqual(stagesIn("ko"));
      }
    }
  });

  it("opens the name of another stock a rule goes by last of all", () => {
    for (const lang of LANGS) {
      for (const kind of ["follows", "per-share", "secret", "outbuy", "band", "volume", "net", "outhold", "signal"] as const) {
        const pieces = sentenceOf(lang, "coyo", widestRules("coyo", "latter")[kind], "fresh");
        const naming = pieces.filter((piece) => piece.args.includes("latter"));

        expect(naming, `${lang} ${kind}`).toHaveLength(1);
        expect(naming[0].stage, `${lang} ${kind}`).toBe(STAGES);
      }
    }
  });

  it("covers the company a rule is about where that is the company that has the rule, and shows a company's own name only where it is set against another", () => {
    for (const lang of LANGS) {
      const own = (rule: Rule): number[] => sentenceOf(lang, "coyo", rule, "fresh").filter((piece) => piece.args.includes("coyo")).map((piece) => piece.stage);

      expect(own({ kind: "band", of: "coyo", from: 10, to: 30, up: 900, down: 200 }), lang).toEqual([STAGES]);
      expect(own({ kind: "signal", what: "held", of: "coyo", up: 900, down: 200 }), lang).toEqual([STAGES]);
      expect(own({ kind: "secret", on: "coyo", up: 10, down: 200 }), lang).toEqual([STAGES]);
      expect(own({ kind: "outbuy", volume: "bought", than: "alt", up: 900, down: 200 }), lang).toEqual([0]);
      expect(own({ kind: "outhold", than: "alt", up: 900, down: 200 }), lang).toEqual([0]);
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
            expect(shown).toMatchObject({ open: false, next: piece.stage === nextStageOf(pieces, readable) });
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

    expect(cardOf("ko", pieces, 0).map((shown) => shown.glue === true)).toEqual([false, false, false, false, true, true]);
    expect(cardOf("ko", pieces, STAGES).map((shown) => shown.glue === true)).toEqual([false, false, false, false, true, true]);
  });

  it("covers every company alike in a game's own rules: the shape does not tell which one a rule goes by", () => {
    for (const lang of LANGS) {
      const shapes = new Set(
        STOCKS.filter((other) => other !== "coyo").map((other) => {
          const rules = widestRules("coyo", other);
          return JSON.stringify((["follows", "per-share", "secret", "outbuy", "band", "volume", "net", "outhold", "signal"] as const).map((kind) => cardOf(lang, sentenceOf(lang, "coyo", rules[kind], "fresh"), 0)));
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

  it("covers a count that may be what is held or what was traded alike: neither a band nor the emblem's signal tells which by its shape", () => {
    for (const lang of LANGS) {
      const covered = (rule: Rule, readable: number): string => JSON.stringify(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), readable).filter((shown) => !shown.open));
      const band = (what?: "bought" | "sold"): Rule => ({ kind: "band", of: "alt", ...(what === undefined ? {} : { what }), from: 10, to: 30, up: 900, down: 200 });
      const signal = (what: "held" | "bought" | "sold"): Rule => ({ kind: "signal", what, of: "alt", up: 900, down: 200 });

      // until the count is opened, at round 15
      for (const readable of [0, 1, 2]) {
        expect(covered(band("bought"), readable), `${lang} band ${readable}`).toBe(covered(band(), readable));
        expect(covered(band("sold"), readable), `${lang} band ${readable}`).toBe(covered(band(), readable));
        expect(covered(signal("bought"), readable), `${lang} signal ${readable}`).toBe(covered(signal("held"), readable));
        expect(covered(signal("sold"), readable), `${lang} signal ${readable}`).toBe(covered(signal("held"), readable));
      }
      // and what is open before then is the same words whichever count it is
      const open = (rule: Rule, readable: number): string => JSON.stringify(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), readable).filter((shown) => shown.open));
      expect(open(band("sold"), 2), lang).toBe(open(band(), 2));
      expect(open(signal("sold"), 2), lang).toBe(open(signal("held"), 2));
    }
  });

  it("covers which way round a rule goes alike: fewer as more, and a stock followed down as one followed up", () => {
    for (const lang of LANGS) {
      const card = (rule: Rule, readable: number): string => JSON.stringify(cardOf(lang, sentenceOf(lang, "coyo", rule, "fresh"), readable));
      const outbuy = (less: boolean): Rule => ({ kind: "outbuy", volume: "bought", than: "alt", ...(less ? { less: true as const } : {}), up: 900, down: 200 });
      const follows = (way: "up" | "down"): Rule => ({ kind: "follows", of: "alt", way, up: 10, down: 5 });

      for (const readable of [0, 1, 2]) {
        expect(card(outbuy(true), readable), `${lang} outbuy ${readable}`).toBe(card(outbuy(false), readable));
        expect(card(follows("down"), readable), `${lang} follows ${readable}`).toBe(card(follows("up"), readable));
      }
      expect(card(outbuy(true), 3), lang).not.toBe(card(outbuy(false), 3));
      expect(card(follows("down"), 3), lang).not.toBe(card(follows("up"), 3));
    }
  });

  it("marks as next the pieces of the first stage that has any left to open: a rule with nothing for round 15 marks what round 20 opens", () => {
    const net = sentenceOf("ko", "steel", { kind: "net", of: "open", up: 1200, down: 800 }, "fresh");
    const marked = (readable: number): string[] => {
      const card = cardOf("ko", net, readable);
      return net.filter((_piece, at) => !card[at].open && card[at].next === true).map((piece) => said("ko", piece));
    };

    expect(nextStageOf(net, 0)).toBe(1);
    expect(nextStageOf(net, 2)).toBe(STAGES);
    expect(nextStageOf(net, STAGES - 1)).toBe(STAGES);
    expect(nextStageOf(net, STAGES)).toBeNull();
    expect(marked(0)).toEqual(["+1200원,"]);
    expect(marked(2)).toEqual(["열림보안의"]);
    expect(marked(STAGES)).toEqual([]);
    // the show's sentences open something at every stage: the next is always the one after
    for (const stock of STOCKS) for (const readable of EVERY_STAGE.slice(0, -1)) expect(nextStageOf(showSentence("ko", stock), readable), stock).toBe(readable + 1);
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
      { open: false, next: false, shape: [[4, 48]], width: 48, glue: false },
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
          for (const rule of [...RULE_KINDS.map((kind) => rules[kind]), ...turnedRules(other), ...turnedRules(stock).filter((rule) => rule.kind !== "outbuy")]) {
            const taken = roomTaken(lang, sentenceOf(lang, stock, rule, "fresh"));

            expect(taken.lines, `${lang} ${JSON.stringify(rule)} of ${stock}`).toBeLessThanOrEqual(CARD.lines);
            expect(taken.reach, `${lang} ${JSON.stringify(rule)} of ${stock}`).toBeLessThanOrEqual(CARD.width);
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

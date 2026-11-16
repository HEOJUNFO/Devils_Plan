/**
 * The price rules of 미스터리 거래소 as the rule board writes them: each
 * rule as a sentence of pieces that are opened one after another, and what a
 * player is shown of it while some are not open yet.
 *
 * Design: design/games/mystery-stock-market.md. The show writes every rule
 * on a board with most of its words covered: a covered word is a row of
 * squares, one to a letter, and the words are uncovered at rounds 5, 10, 15
 * and 20. The Korean sentences of the show's seven rules are the show's own,
 * and so is the order their words are uncovered in (as a record of the
 * board at each of its five stages has it; the rule-words test holds the
 * record); the English ones are translated here, and (gap) so are both of
 * the four kinds the show does not have, and the words of a rule a game
 * draws the other way round than the show has it.
 *
 * Why the words are here and not beside the screen, where a screen's words
 * are kept (.claude/rules/languages.md): what a player may not read yet must
 * not be sent to them, so it is the room that has to know how long each
 * covered word is, in each language. The room still sends no sentence. Of a
 * piece that is open it sends which words they are (a key of the tables
 * here, and what they are filled with), and the page writes them in its own
 * language; of one that is not, only its shape.
 */
import type { Lang } from "../../lang";
import { STOCKS, type PerStock, type Rule, type StockId } from "./prices";
import type { Rulebook } from "./rulebook";

/** The companies, in each language: in full, and as the monitor's table has room for. */
export const STOCK_NAMES: Record<Lang, { name: PerStock<string>; short: PerStock<string> }> = {
  ko: {
    name: { finance: "맛소금융", build: "무조건설", steel: "방어제철", alt: "알트엔터", open: "열림보안", coyo: "코요테크", latter: "후자전자" },
    short: { finance: "맛소금융", build: "무조건설", steel: "방어제철", alt: "알트엔터", open: "열림보안", coyo: "코요테크", latter: "후자전자" },
  },
  // the names of the show's English release, as its closed captions have them; in the table, the first word of each
  en: {
    name: {
      finance: "Seasoned Financial",
      build: "Airtight Construction",
      steel: "Defense Steel",
      alt: "Alt Entertainment",
      open: "Open Security",
      coyo: "CoyoTech",
      latter: "Latter Electronics",
    },
    short: { finance: "Seasoned", build: "Airtight", steel: "Defense", alt: "Alt Ent", open: "Open", coyo: "CoyoTech", latter: "Latter" },
  },
};

/** What a piece's words are filled with: a number, a stock, a sign. */
export type RuleArg = string | number;

/**
 * A piece of a rule's sentence: one word or a few that are opened together.
 * `stage` is when: 0 from the start, then one more at each of the rounds the
 * rules are opened in. `glue` sets it against the piece before it with no
 * space between.
 */
export interface RulePiece {
  /** Which words: a key of the language's table, and what they are filled with. */
  key: string;
  args: RuleArg[];
  stage: number;
  glue?: true;
}

type Wording = (...args: RuleArg[]) => string;

/** How a company is called in a sentence: by its whole name, as the show's rules do, or as the table has it. */
type Naming = "name" | "short";

const called = (lang: Lang, stock: RuleArg, naming: RuleArg): string => STOCK_NAMES[lang][naming === "short" ? "short" : "name"][stock as StockId] ?? "";
/** A name as the owner of what follows: "Defense Steel's", "Latter Electronics'". */
const owning = (name: string): string => `${name}'${name.endsWith("s") ? "" : "s"}`;

/** The words of the rule board, by key, in each language. A language has the keys its own sentences use. */
const WORDS: Record<Lang, Record<string, Wording>> = {
  ko: {
    count: (n) => `${n}개 이상의`,
    stocks: () => "주식이",
    rise: () => "상승할",
    fall: () => "하락할",
    case: () => "경우",
    upNextRound: (n) => `다음 라운드 +${n}%,`,
    next: () => "다음",
    round: () => "라운드",
    of: (stock, naming) => `${called("ko", stock, naming)}의`,
    on: (stock, naming) => `${called("ko", stock, naming)}에`,
    price: () => "가격이",
    moved: (way) => (way === "up" ? "올랐으면" : "내렸으면"),
    amount: (sign, n, unit, end) => `${sign}${n}${unit === "%" ? "%" : "원"}${end}`,
    otherwise: () => "그렇지 않으면",
    otherwiseFirst: () => ", 그렇지",
    otherwiseLast: () => "않으면",
    held: () => "보유 총량이",
    heldBare: () => "보유 총량",
    grew: () => "증가한 만큼",
    shrank: () => "감소한 만큼",
    aShare: () => "1주당",
    swing: () => "주가 변동",
    chart: () => "그래프는",
    logo: () => "미스터리 거래소 로고",
    same: () => "와 일치",
    does: () => "한다",
    secret: () => "시크릿이 걸려",
    ifSo: () => "있으면",
    volume: (which) => (which === "bought" ? "매수량이" : "매도량이"),
    volumeBare: (which) => (which === "bought" ? "매수량" : "매도량"),
    than: () => "보다",
    ifMore: () => "많을 경우",
    ifFewer: () => "적을 경우",
    counted: (what) => (what === "held" ? "보유 총량이" : what === "bought" ? "매수량이" : "매도량이"),
    logoWay: () => "미스터리 거래소 로고를",
    along: () => "따라",
    ifMoves: () => "움직이면",
    shares: (n) => `${n}주`,
    orMore: () => "이상",
    orFewerIf: () => "이하이면",
    orMoreIf: () => "이상이면",
  },
  en: {
    if: () => "If",
    ifAgain: () => "if",
    count: (n) => `${n} or more`,
    stocks: () => "stocks",
    rise: () => "rise,",
    fall: () => "fall,",
    upNextRound: (n) => `+${n}% next round;`,
    next: () => "next",
    round: () => "round.",
    of: (stock, naming) => owning(called("en", stock, naming)),
    named: (stock, naming) => `${called("en", stock, naming)},`,
    price: () => "price",
    moved: (way) => (way === "up" ? "rose," : "fell,"),
    amount: (sign, n, unit, end) => `${sign}${n}${unit === "%" ? "%" : " won"}${end}`,
    otherwise: () => "otherwise",
    held: () => "total holdings",
    heldFirst: () => "total holdings:",
    heldLast: () => "total holdings,",
    eachShare: () => "for each share",
    more: () => "more,",
    fewer: () => "fewer,",
    chart: () => "chart",
    is: () => "is",
    sameAs: () => "the same as",
    logo: () => "the Mystery Stock Market logo.",
    secretOn: () => "a secret is on",
    not: () => "not,",
    volume: (which) => `${which === "bought" ? "bought" : "sold"} volume`,
    volumeLast: (which) => `${which === "bought" ? "bought" : "sold"} volume,`,
    itsSold: () => "its sold volume,",
    isHigher: () => "is higher",
    isLower: () => "is lower",
    areHigher: () => "are higher",
    than: () => "than",
    are: () => "are",
    counted: (what) => (what === "held" ? "total holdings" : what === "bought" ? "bought volume" : "sold volume"),
    be: (what) => (what === "held" ? "are" : "is"),
    movedWith: () => "moved with",
    logoWay: () => "the Mystery Stock Market logo,",
    shares: (n) => `${n} shares`,
    orMore: () => "or more",
    orMoreLast: () => "or more,",
    and: () => "and",
    orFewerLast: () => "or fewer,",
  },
};

/** The words `key` stands for in `lang`, filled with `args`; nothing for a key the language does not have. */
export function textOf(lang: Lang, key: string, args: readonly RuleArg[]): string {
  const wording = Object.hasOwn(WORDS[lang], key) ? WORDS[lang][key] : undefined;
  return wording === undefined ? "" : wording(...args);
}

const piece = (stage: number, key: string, ...args: RuleArg[]): RulePiece => ({ key, args, stage });
const glued = (stage: number, key: string, ...args: RuleArg[]): RulePiece => ({ key, args, stage, glue: true });

/** A rule's sentence in Korean. Those of the show's seven kinds are the show's, word for word and stage for stage. */
function korean(stock: StockId, rule: Rule, naming: Naming): RulePiece[] {
  const drawn = naming === "short";
  const up = (stage: number, n: number, unit: string, end = ","): RulePiece => piece(stage, "amount", "+", n, unit, end);
  const down = (stage: number, n: number, unit: string, end = ""): RulePiece => piece(stage, "amount", "-", n, unit, end);
  switch (rule.kind) {
    case "breadth":
      return [
        piece(4, "count", rule.count),
        piece(1, "stocks"),
        piece(3, "rise"),
        piece(1, "case"),
        piece(2, "upNextRound", rule.up),
        piece(4, "count", rule.count),
        piece(1, "stocks"),
        piece(3, "fall"),
        piece(3, "case"),
        piece(0, "next"),
        piece(2, "round"),
        down(2, rule.down, "%"),
      ];
    case "follows":
      return [piece(4, "of", rule.of, naming), piece(0, "price"), piece(2, "moved", rule.way), up(2, rule.up, "%"), piece(1, "otherwise"), down(3, rule.down, "%")];
    case "per-share":
      return [
        piece(4, "of", rule.of, naming),
        piece(1, "held"),
        piece(3, "grew"),
        piece(2, "aShare"),
        down(0, rule.won, "won", ","),
        piece(3, "shrank"),
        piece(2, "aShare"),
        up(0, rule.won, "won", ""),
      ];
    case "emblem":
      return [piece(1, "of", stock, naming), piece(2, "swing"), piece(3, "chart"), piece(4, "logo"), glued(3, "same"), glued(0, "does")];
    case "secret":
      return [
        piece(3, "on", rule.on, naming),
        piece(4, "secret"),
        piece(0, "ifSo"),
        up(1, rule.up, "%", ""),
        glued(0, "otherwiseFirst"),
        piece(1, "otherwiseLast"),
        down(2, rule.down, "won"),
      ];
    case "outbuy":
      return [
        piece(1, "of", stock, naming),
        piece(3, "volume", rule.volume),
        piece(4, "of", rule.than, naming),
        piece(0, "volumeBare", rule.volume),
        glued(3, "than"),
        piece(0, rule.less === true ? "ifFewer" : "ifMore"),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "band":
      return [
        piece(2, "of", rule.of, naming),
        // a drawn game's band may be on what was traded: its count is written, and covered, as any count is
        drawn ? piece(3, "counted", rule.what ?? "held") : piece(3, "held"),
        piece(4, "shares", rule.from),
        piece(1, "orMore"),
        piece(4, "shares", rule.to),
        piece(1, "orFewerIf"),
        up(0, rule.up, "won"),
        piece(1, "otherwise"),
        down(3, rule.down, "won"),
      ];
    case "volume":
      return [
        piece(4, "of", rule.of, naming),
        piece(2, "volume", rule.volume),
        piece(3, "shares", rule.atLeast),
        piece(1, "orMoreIf"),
        up(0, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "net":
      return [
        piece(4, "of", rule.of, naming),
        piece(2, "volume", "bought"),
        piece(3, "volumeBare", "sold"),
        glued(3, "than"),
        piece(0, "ifMore"),
        up(1, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "outhold":
      return [
        piece(1, "of", stock, naming),
        piece(3, "held"),
        piece(4, "of", rule.than, naming),
        piece(0, "heldBare"),
        glued(3, "than"),
        piece(0, "ifMore"),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "signal":
      return [
        piece(4, "of", rule.of, naming),
        piece(2, "counted", rule.what),
        piece(3, "logoWay"),
        piece(1, "along"),
        piece(0, "ifMoves"),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
  }
}

/** A rule's sentence in English: a translation, opened in the order of the Korean it follows. */
function english(stock: StockId, rule: Rule, naming: Naming): RulePiece[] {
  const drawn = naming === "short";
  const up = (stage: number, n: number, unit: string): RulePiece => piece(stage, "amount", "+", n, unit, ";");
  const down = (stage: number, n: number, unit: string): RulePiece => piece(stage, "amount", "-", n, unit, ".");
  switch (rule.kind) {
    case "breadth":
      return [
        piece(1, "if"),
        piece(4, "count", rule.count),
        piece(1, "stocks"),
        piece(3, "rise"),
        piece(2, "upNextRound", rule.up),
        piece(3, "ifAgain"),
        piece(4, "count", rule.count),
        piece(1, "stocks"),
        piece(3, "fall"),
        piece(2, "amount", "-", rule.down, "%", ""),
        piece(0, "next"),
        piece(2, "round"),
      ];
    case "follows":
      return [piece(2, "if"), piece(4, "of", rule.of, naming), piece(0, "price"), piece(2, "moved", rule.way), up(2, rule.up, "%"), piece(1, "otherwise"), down(3, rule.down, "%")];
    case "per-share":
      return [
        piece(4, "of", rule.of, naming),
        piece(1, "heldFirst"),
        piece(2, "eachShare"),
        piece(3, "more"),
        piece(0, "amount", "-", rule.won, "won", ";"),
        piece(2, "eachShare"),
        piece(3, "fewer"),
        piece(0, "amount", "+", rule.won, "won", "."),
      ];
    case "emblem":
      return [piece(1, "of", stock, naming), piece(2, "price"), piece(3, "chart"), piece(0, "is"), piece(3, "sameAs"), piece(4, "logo")];
    case "secret":
      return [piece(0, "if"), piece(4, "secretOn"), piece(3, "named", rule.on, naming), up(1, rule.up, "%"), piece(0, "ifAgain"), piece(1, "not"), down(2, rule.down, "won")];
    case "outbuy":
      return [
        piece(0, "if"),
        piece(1, "of", stock, naming),
        piece(3, "volume", rule.volume),
        piece(0, rule.less === true ? "isLower" : "isHigher"),
        piece(3, "than"),
        piece(4, "of", rule.than, naming),
        piece(0, "volumeLast", rule.volume),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "band":
      return [
        piece(1, "if"),
        piece(2, "of", rule.of, naming),
        // a drawn game's band may be on what was traded: the count and its verb are opened together, and covered as any count's are
        ...(drawn ? [piece(3, "counted", rule.what ?? "held"), piece(3, "be", rule.what ?? "held")] : [piece(3, "held"), piece(1, "are")]),
        piece(4, "shares", rule.from),
        piece(1, "orMore"),
        piece(1, "and"),
        piece(4, "shares", rule.to),
        piece(1, "orFewerLast"),
        up(0, rule.up, "won"),
        piece(1, "otherwise"),
        down(3, rule.down, "won"),
      ];
    case "volume":
      return [
        piece(1, "if"),
        piece(4, "of", rule.of, naming),
        piece(2, "volume", rule.volume),
        piece(1, "is"),
        piece(3, "shares", rule.atLeast),
        piece(1, "orMoreLast"),
        up(0, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "net":
      return [
        piece(0, "if"),
        piece(4, "of", rule.of, naming),
        piece(2, "volume", "bought"),
        piece(0, "isHigher"),
        piece(3, "than"),
        piece(3, "itsSold"),
        up(1, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "outhold":
      return [
        piece(0, "if"),
        piece(1, "of", stock, naming),
        piece(3, "held"),
        piece(0, "areHigher"),
        piece(3, "than"),
        piece(4, "of", rule.than, naming),
        piece(0, "heldLast"),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
    case "signal":
      return [
        piece(0, "if"),
        piece(4, "of", rule.of, naming),
        piece(2, "counted", rule.what),
        piece(1, "movedWith"),
        piece(3, "logoWay"),
        up(2, rule.up, "won"),
        piece(1, "otherwise"),
        down(2, rule.down, "won"),
      ];
  }
}

/** The words that name a company. */
const COMPANY_KEYS: readonly string[] = ["of", "on", "named"];

/**
 * Of each kind of rule, the words a game draws beside its companies and its
 * numbers: which way, which count, how many shares.
 */
const DRAWN_WORDS: Partial<Record<Rule["kind"], readonly string[]>> = {
  follows: ["moved"],
  outbuy: ["volume", "volumeBare", "volumeLast", "ifMore", "ifFewer", "isHigher", "isLower"],
  band: ["counted", "be", "shares"],
  volume: ["volume", "shares"],
  signal: ["counted"],
};

/**
 * (gap) The stage a piece is opened at in a game that draws its own rules.
 *
 * The show covers most of every sentence, and whoever knows its sentences
 * (from the show, or from games played here) tells from the squares alone
 * which kind of rule a company has, where someone new sees squares. So a
 * drawn game covers only what it drew, and the frame of every sentence is
 * open to everyone from the first round: knowing the frames is then worth
 * nothing. What is covered opens in four stages, the same for every kind:
 * what the price gains, what it loses, then which way or which count and
 * how many, and last the company (and, of a count of stocks, how many). A
 * company's own name in its own rule is no draw, and is open. The user
 * asked for this on 2026-11-16 ("한계도 돌파해줘").
 */
function drawnStage(rule: Rule, stock: StockId, piece: RulePiece): number {
  const { key, args } = piece;
  if (key === "upNextRound" || (key === "amount" && args[0] === "+")) return 1;
  if (key === "amount") return 2;
  if (COMPANY_KEYS.includes(key)) return (rule.kind === "outbuy" || rule.kind === "outhold") && args[0] === stock ? 0 : 4;
  if (rule.kind === "breadth" && key === "count") return 4;
  return (DRAWN_WORDS[rule.kind] ?? []).includes(key) ? 3 : 0;
}

/**
 * The sentence of the rule `stock` has, in `lang`. The show's rules name a
 * company in full, as the show does, and open in the show's order; (gap) a
 * game's own rules name it as the monitor's table does, which is what leaves
 * an English sentence room on the board, and cover only what the game drew
 * ({@link drawnStage}).
 */
export function sentenceOf(lang: Lang, stock: StockId, rule: Rule, rulebook: Rulebook): RulePiece[] {
  const naming: Naming = rulebook === "show" ? "name" : "short";
  const pieces = lang === "ko" ? korean(stock, rule, naming) : english(stock, rule, naming);
  return rulebook === "show" ? pieces : pieces.map((piece) => ({ ...piece, stage: drawnStage(rule, stock, piece) }));
}

/**
 * The stage that opens the next of `pieces` to someone who may read
 * `readable` stages beyond the first: the one after, in the show's
 * sentences, which open something at every stage; in a drawn game's, the
 * first that has anything left to open. `null` when all is open.
 */
export function nextStageOf(pieces: readonly RulePiece[], readable: number): number | null {
  const later = pieces.map((piece) => piece.stage).filter((stage) => stage > readable);
  return later.length === 0 ? null : Math.min(...later);
}

// ---- How wide words are ------------------------------------------------------------------------------

/**
 * How wide each letter from the space to the tilde is in the screen's font
 * (Galmuri11 at 12 pixels), one hexadecimal figure a letter: read from the
 * font file's own table of advances. Every Korean syllable is 12 wide.
 */
const NARROW_WIDTHS = "54488a84446846468688888888445656a889877984787a898988898a887464684787886874674a788867688a8875458";
const WIDE_WIDTH = 12;
const FIRST_NARROW = 0x20;

/**
 * How many pixels `text` takes on the rule board. The page's own measure may
 * come to a pixel or two less where the font sets two letters closer; never
 * to more.
 */
export function widthOf(text: string): number {
  let width = 0;
  for (const letter of text) {
    const at = (letter.codePointAt(0) ?? 0) - FIRST_NARROW;
    width += at >= 0 && at < NARROW_WIDTHS.length ? Number.parseInt(NARROW_WIDTHS[at], 16) : WIDE_WIDTH;
  }
  return width;
}

// ---- What a player is shown ---------------------------------------------------------------------------

/** What a covered word shows a low mark for and not a square: a comma, a stop and their like. */
const MARKS = ".,;:'";

/**
 * A word that is not open, as its shape alone: each run of letters as how
 * many squares it is over how many pixels, and each mark between them as no
 * squares over its own width.
 */
export type HiddenWord = [squares: number, width: number][];

/** A piece of a rule as a player is shown it: its words, or only the shape of them. */
export type CardPiece =
  | { open: true; key: string; args: RuleArg[]; glue?: true }
  /** `next`: it is the piece the next opening shows. */
  | { open: false; next: boolean; words: HiddenWord[]; glue?: true };

/** The shape of `word` while it is covered. */
function shapeOf(word: string): HiddenWord {
  const shape: HiddenWord = [];
  let run = "";
  const close = (): void => {
    if (run !== "") shape.push([[...run].length, widthOf(run)]);
    run = "";
  };
  for (const letter of word) {
    if (MARKS.includes(letter)) {
      close();
      shape.push([0, widthOf(letter)]);
    } else run += letter;
  }
  close();
  return shape;
}

/** The widest of `texts` on the board. */
const widest = (texts: readonly string[]): string => texts.reduce((most, text) => (widthOf(text) > widthOf(most) ? text : most));

/**
 * What stands in for a piece while it is covered, where its own shape would
 * give it away: (gap) the companies' English names are of different lengths,
 * and so are "bought" and "sold", so in a game with rules of its own every
 * company is covered alike, by the widest of them, and every volume as
 * "bought volume". The show's own rules are covered as they are written, as
 * on the show's board. In Korean the names are all four letters long and
 * need no stand-in. A count that may be what is held or what was traded
 * (`counted`, and the English verb after it) is covered as what is held, in
 * both languages; "is lower" as "is higher", and the way a stock was
 * followed as the wider of the two ("rose,": what the show's own rule says,
 * so that one is covered as it is written).
 */
const COVERS: Record<Lang, Record<string, Wording>> = {
  ko: {
    counted: () => textOf("ko", "counted", ["held"]),
  },
  en: {
    counted: () => textOf("en", "counted", ["held"]),
    be: () => textOf("en", "be", ["held"]),
    isLower: () => textOf("en", "isHigher", []),
    moved: () => widest([textOf("en", "moved", ["up"]), textOf("en", "moved", ["down"])]),
    of: (stock, naming) => (naming === "short" ? widest(STOCKS.map((each) => textOf("en", "of", [each, naming]))) : textOf("en", "of", [stock, naming])),
    named: (stock, naming) => (naming === "short" ? widest(STOCKS.map((each) => textOf("en", "named", [each, naming]))) : textOf("en", "named", [stock, naming])),
    volume: () => textOf("en", "volume", ["bought"]),
    volumeLast: () => textOf("en", "volumeLast", ["bought"]),
  },
};

/**
 * A rule's sentence as someone who may read `readable` stages of it beyond
 * the first is shown it: the pieces opened by then as they are, and the
 * rest as shapes, with nothing in them of what they say.
 */
export function cardOf(lang: Lang, pieces: readonly RulePiece[], readable: number): CardPiece[] {
  const next = nextStageOf(pieces, readable);
  return pieces.map((each): CardPiece => {
    const glue = each.glue === true ? ({ glue: true } as const) : {};
    if (each.stage <= readable) return { open: true, key: each.key, args: [...each.args], ...glue };
    const cover = Object.hasOwn(COVERS[lang], each.key) ? COVERS[lang][each.key](...each.args) : textOf(lang, each.key, each.args);
    return { open: false, next: each.stage === next, words: cover.split(" ").map(shapeOf), ...glue };
  });
}

// ---- Where the words go on the board -----------------------------------------------------------------

/** The room the board has for a rule: so many pixels across, so many between two words, and so many lines. The screen draws by these. */
export const CARD = { width: 292, gap: 4, lines: 3 } as const;

/** A word of a card as the screen draws it: what it says, or its shape; how wide it is; whether it stands against the word before it. */
export type CardWord = ({ open: true; text: string } | { open: false; next: boolean; shape: HiddenWord }) & { width: number; glue: boolean };

/**
 * The words of `card` in `lang`, one after another. An open word is as wide
 * as `measure` says (the page's own measure, where there is one).
 */
export function wordsOf(lang: Lang, card: readonly CardPiece[], measure: (text: string) => number = widthOf): CardWord[] {
  return card.flatMap((each): CardWord[] => {
    const glue = (at: number): boolean => at === 0 && each.glue === true;
    if (each.open) {
      return textOf(lang, each.key, each.args)
        .split(" ")
        .map((text, at) => ({ open: true, text, width: measure(text), glue: glue(at) }));
    }
    return each.words.map((shape, at) => ({ open: false, next: each.next, shape, width: shape.reduce((sum, [, width]) => sum + width, 0), glue: glue(at) }));
  });
}

/**
 * Where each of `words` goes: how far in, and on which line from 0. Words
 * follow each other `gap` apart; a word that would pass `room` begins the
 * next line, and takes with it those that stand against it.
 */
export function placeWords(words: readonly { width: number; glue: boolean }[], room: number, gap: number): { x: number; line: number }[] {
  const places: { x: number; line: number }[] = [];
  let x = 0;
  let line = 0;
  for (let from = 0; from < words.length; ) {
    let to = from + 1;
    while (to < words.length && words[to].glue) to += 1;
    const width = words.slice(from, to).reduce((sum, word) => sum + word.width, 0);
    const space = x === 0 ? 0 : gap;
    if (x + space + width > room) {
      x = 0;
      line += 1;
    } else x += space;
    for (let at = from; at < to; at++) {
      places.push({ x, line });
      x += words[at].width;
    }
    from = to;
  }
  return places;
}

/**
 * The words of 미스터리 거래소 (Mystery Stock Market), in each language
 * (`lang.ts`): its rules as the page shows them before a game and everything
 * its screen says. The words of the price rules on the rule board are taken
 * from `rule-words.ts`, beside the game's rules: the room has to know how
 * long each covered word is, so they are kept where it can read them.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import type { StockId } from "../../../shared/games/mystery-stock-market/prices";
import { STOCK_NAMES, textOf, type RuleArg } from "../../../shared/games/mystery-stock-market/rule-words";
import type { Rulebook } from "../../../shared/games/mystery-stock-market/rulebook";
import type { MarketEnd } from "../../../shared/games/mystery-stock-market/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  stocks: number;
  rounds: number;
  roundMinutes: number;
  startCash: number;
  startPrice: number;
  floorPrice: number;
  revealRounds: number[];
  secretRounds: number;
  pieceCash: number;
  pieceRounds: number;
  /** Which rules the game on the screen is played by. */
  rulebook: Rulebook;
}

/** Writes a number with its thousands apart. Made once: the screen writes some fifty numbers on every frame. */
const GROUPS = new Intl.NumberFormat("en-US");
/** `n` with its thousands apart: 1,234,567. */
export const grouped = (n: number): string => GROUPS.format(n);
/** The rounds the rules are opened in but the last, and the last: "5·10·15" and "20". */
const opened = (rounds: number[], between: string): [string, string] => [rounds.slice(0, -1).join(between), `${rounds[rounds.length - 1] ?? ""}`];

const ko = {
  sheet: {
    title: "미스터리 거래소: 규칙",
    brief: {
      goal: "주식을 사고팔아 자산(현금과 주식)을 가장 많이 만듭니다.",
      play: "라운드마다 주식을 사고팔며, 차츰 열리는 주가 규칙을 읽습니다.",
      end: "24라운드가 끝나면 자산이 가장 많은 사람이 1위입니다.",
    },
    parts: [
      "일곱 회사의 주식을 24라운드 동안 사고팝니다. 모두 가상 현금 100,000원으로 시작하고, 24라운드가 끝났을 때 자산(현금과 주식)이 가장 많은 사람이 1위입니다.",
      [
        "모든 주식은 10,000원에서 시작하고 100원 아래로는 내려가지 않습니다. 라운드는 5분이고, 그동안 그 라운드의 가격으로 원하는 만큼 사고팔 수 있습니다.",
        "주가는 라운드가 끝날 때 회사마다 다른 규칙으로 움직입니다. 규칙은 처음에 일부만 보입니다. 5·10·15라운드가 시작될 때 가려진 낱말이 더 열리고, 20라운드에 모두 열립니다.",
        "규칙은 판마다 새로 뽑습니다: 어느 회사가 어떤 규칙인지, 숫자가 얼마인지 판마다 다릅니다. 방장은 대기실에서 방송의 규칙 그대로 하는 판으로 바꿀 수 있습니다.",
        "라운드가 시작되면 바뀐 주가, 지난 라운드에 사고판 수량, 모두가 가진 수량의 합(총 보유), 모든 사람의 자산과 순위가 공개됩니다.",
        "시크릿: 게임 중 한 번, 한 종목에 쓸 수 있습니다. 쓴 다음 두 라운드 동안 그 종목의 주가와 수량이 모두에게 가려지고, 그동안 모든 사람의 자산도 가려집니다 (순위는 보입니다). 그 종목을 가졌거나 거래한 사람은 자기 현금과 자산도 볼 수 없습니다. 누가 썼는지는 알려지지 않습니다.",
        "피스: 모두 3개씩 가지고 시작합니다. 20라운드까지, 1개로 한 종목의 다음에 열릴 규칙 낱말을 혼자 미리 보거나 현금 10,000원으로 바꿀 수 있습니다.",
        "모두가 라운드를 마치면 5분을 기다리지 않고 다음 라운드로 넘어갑니다. 라운드를 마친 사람은 그 라운드에 더 거래할 수 없습니다.",
      ],
      "최종 자산이 150만 원 이상이면 피스 1개, 300만 원 이상이면 2개, 600만 원 이상이면 3개, 1,000만 원 이상이면 상금의 징표를 받은 것으로 표시됩니다. 자산이 같으면 게임 도중 자산이 가장 낮았던 쪽이 아래입니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "round-over": "그 라운드는 이미 끝났습니다",
    "round-done": "이번 라운드는 이미 마쳤습니다",
    "no-cash": "현금이 모자랍니다",
    "no-shares": "가진 주식이 모자랍니다",
    "secret-used": "시크릿은 이미 썼습니다",
    "no-pieces": "피스가 없습니다",
    "pieces-closed": "피스는 이제 쓸 수 없습니다",
    "nothing-hidden": "그 규칙에는 더 가려진 곳이 없습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    rounds: "모든 라운드가 끝남",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<MarketEnd, string>,
  /** The companies: in full, and as the table has room for (58 pixels). */
  name: STOCK_NAMES.ko.name as Record<StockId, string>,
  short: STOCK_NAMES.ko.short as Record<StockId, string>,
  /** The words of a piece of a price rule that is open: `key` and `args` are what the room sends of it. */
  rule: (key: string, args: readonly RuleArg[]): string => textOf("ko", key, args),
  /** The heads of the table's columns: each ends where its numbers end. */
  column: { price: "주가", bought: "매수", sold: "매도", held: "총 보유", mine: "내 보유" },
  /**
   * Where the table's columns are, in pixels: where the companies' names end,
   * and where the numbers of each column end. They are set out for the widths
   * of this language's names and heads, and so are words of a kind.
   */
  columnAt: { name: 55, price: 117, bought: 157, sold: 197, held: 246, mine: 296 },
  /** A number too long for its place in the table, shortened: 12,345 as 1.2만. */
  figure: (n: number): string => (n < 100000 ? `${Math.floor(n / 1000) / 10}만` : n < 100000000 ? `${grouped(Math.floor(n / 10000))}만` : `${grouped(Math.floor(n / 10000000) / 10)}억`),
  /**
   * The colours of a price that rose and of one that fell. They are words of
   * a kind: a Korean market shows a rise in red and a fall in blue, as the
   * show's monitor does; an English one shows a rise in green and a fall in red.
   */
  colour: { up: "#e23b4a", down: "#4f8df6" },
  /** In place of a number a secret keeps back: on the monitor, and in a narrow cell. */
  veiled: "???",
  veiledShort: "?",
  /** Under the emblem among the charts. */
  emblem: "거래소 로고",
  /** An amount of money; and the same for the list of a crowded game, in 36 pixels at most: 4.7만, 477만, 0.5억. */
  won: (amount: number): string => `${grouped(amount)}원`,
  wonShort: (amount: number): string =>
    amount < 10000
      ? `${amount}`
      : amount < 100000
        ? `${Math.floor(amount / 1000) / 10}만`
        : amount < 10000000
          ? `${Math.floor(amount / 10000)}만`
          : amount < 1000000000
            ? `${Math.floor(amount / 10000000) / 10}억`
            : `${grouped(Math.floor(amount / 100000000))}억`,
  shares: (count: number): string => `${grouped(count)}주`,
  /** The column's heading, with the clock beside it. */
  round: (round: number, rounds: number) => `라운드 ${round}/${rounds}`,
  /** Beside a company's name over its rule: what the player holds of it. */
  position: (shares: string) => `내 보유 ${shares}`,
  /** The first line of the bar: what the player has. */
  wallet: (cash: string, assets: string, pieces: number, secret: boolean) => `현금 ${cash} · 자산 ${assets} · 피스 ${pieces} · 시크릿 ${secret ? 1 : 0}`,
  /** Said in the bar for a moment. */
  say: {
    bought: (name: string, shares: string) => `${name} ${shares} 매수`,
    sold: (name: string, shares: string) => `${name} ${shares} 매도`,
    secret: (name: string) => `${name}에 시크릿을 썼습니다. 다음 라운드부터 가려집니다`,
    peeked: (name: string) => `${name}의 다음 규칙 낱말이 열렸습니다 (나만 봄)`,
    cashed: (amount: string) => `피스 1개를 ${amount}으로 바꿨습니다`,
    paused: "판이 멈춰 있습니다",
    noShares: "수량을 1 이상으로 넣으세요",
    noMax: "가려져 있어 계산할 수 없습니다",
    opened: "규칙이 더 공개됐습니다",
  },
  /** Over the table while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /**
   * To a player in their first game of it, in place of `wallet` until they have bought anything (468
   * pixels): what moves a price and what the game is won by. What is held then is what everyone starts
   * with; a piece taken as money, or a share bought, brings the wallet back.
   */
  coach: {
    start: "주가는 라운드 끝에 종목의 규칙대로 움직입니다 · 마지막에 현금+주식이 많으면 1위",
  },
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    watching: (done: number, of: number) => `관전 중 · 라운드를 마친 사람 ${done}/${of}`,
    done: (done: number, of: number) => `라운드를 마쳤습니다 · 다른 사람을 기다리는 중 (${done}/${of})`,
    askSecret: (name: string, rounds: number) => `${name}에 시크릿을 씁니다 (한 번뿐) · 다음 ${rounds}라운드 동안 가려집니다`,
    askPiece: (name: string, amount: string) =>
      byInput(`피스 1개를 씁니다 · 1: ${name}의 다음 규칙 낱말 · 2: 현금 ${amount}`, `피스 1개를 씁니다 · 규칙: ${name}의 다음 낱말 · 현금: ${amount}`),
    askDone: "이번 라운드를 마칩니다 · 마치면 이 라운드에는 더 거래할 수 없습니다",
  },
  /** The buttons of the bar. */
  button: {
    max: keyed("A", "최대"),
    all: keyed("Z", "전량"),
    buy: keyed("B", "매수"),
    sell: keyed("S", "매도"),
    secret: keyed("X", "시크릿"),
    piece: keyed("P", "피스"),
    done: keyed("Enter", "마침"),
    charts: keyed("C", "차트"),
    table: keyed("C", "시세"),
    use: keyed("Enter", "사용"),
    finish: keyed("Enter", "마침"),
    peek: keyed("1", "규칙"),
    cash: keyed("2", "현금"),
    cancel: keyed("Esc", "취소"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    /** On the pad of figures a finger enters a number of shares with: takes a figure back, and puts the pad away. */
    erase: "지움",
    enter: "입력",
  },
  log: {
    /** The first line of the log: which rules the game is played by. A line of the column, 168 pixels. */
    rulebook: { fresh: "이 판만의 새 규칙", show: "방송의 규칙" } as Record<Rulebook, string>,
    round: (round: number) => `라운드 ${round}`,
    opened: (stage: number, of: number) => `규칙 추가 공개 (${stage}/${of})`,
    hidden: (name: string, from: number, until: number) => (from === until ? `시크릿: ${name} ${from}R` : `시크릿: ${name} ${from}~${until}R`),
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, rank: number): string => (seated ? `${rank}위` : "종료"),
    place: (rank: number, who: string, assets: string) => `${rank}위 ${who} ${assets}`,
    mine: (assets: string) => `내 자산: ${assets}`,
    /** What the show gives for assets like these: so many pieces, and its prize token. `won` is put before them. */
    award: (pieces: number): string => `피스 ${pieces}개`,
    prize: "상금의 징표",
    won: (what: string) => `획득: ${what}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => {
    const [early, last] = opened(n.revealRounds, "·");
    return [
      { text: "미스터리 거래소: 규칙", tone: "title" },
      { text: `주식 ${n.stocks}종목을 ${n.rounds}라운드 동안 사고팔아 자산이 가장 많으면 1위.` },
      { text: `${grouped(n.startCash)}원으로 시작. 주식은 ${grouped(n.startPrice)}원에서 시작, 최저 ${grouped(n.floorPrice)}원.` },
      { text: "주가는 라운드가 끝날 때 종목마다 제 규칙으로 움직입니다." },
      { text: `규칙은 ${early}라운드에 더 열리고 ${last}라운드에 다 열립니다.`, tone: "dim" },
      { text: n.rulebook === "show" ? "파란 칸이 다음에 열릴 낱말입니다. 규칙은 방송의 것입니다." : "파란 칸이 다음에 열릴 낱말입니다. 규칙은 이 판에서 새로 뽑았습니다.", tone: "dim" },
      { text: "" },
      { text: `시크릿 (한 번): 한 종목을 다음 ${n.secretRounds}라운드 동안 모니터에서 가립니다.` },
      { text: "그동안 모두의 자산도 가려지고, 그 종목을 가졌거나 거래했으면", tone: "dim" },
      { text: "내 현금과 자산도 보이지 않습니다.", tone: "dim" },
      { text: `피스 (${n.pieceRounds}라운드까지): 한 종목의 다음 낱말 미리 보기, 또는 ${grouped(n.pieceCash)}원.` },
      { text: `모두 라운드를 마치면 ${n.roundMinutes}분을 기다리지 않고 넘어갑니다.` },
      { text: "" },
      { text: byInput("↑↓: 종목 · 숫자: 수량 · ←→: 한 주씩 · A: 최대 · Z: 전량 · B: 매수 · S: 매도", "종목은 눌러서 고릅니다. 수량 칸을 누르면 숫자판이 열립니다."), tone: "dim" },
      { text: byInput("X: 시크릿 · P: 피스 · C: 차트 · Enter: 라운드 마침", "마침을 누르면 이번 라운드의 거래를 마칩니다."), tone: "dim" },
      { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
    ];
  },
};

const en: typeof ko = {
  sheet: {
    title: "Mystery Stock Market: rules",
    brief: {
      goal: "Trade stocks to end with the most assets (cash and shares).",
      play: "Buy and sell each round; read the price rules as they open.",
      end: "After round 24, whoever has the most assets wins.",
    },
    parts: [
      "Trade the stocks of seven companies over 24 rounds. Everyone starts with 100,000 won of virtual cash, and whoever has the most assets (cash and shares) after round 24 wins.",
      [
        "Every stock opens at 10,000 won and never goes under 100 won. A round lasts 5 minutes, and in it you may buy and sell as much as you like at the round's price.",
        "Prices move when a round ends, each company's by a rule of its own. Only part of each rule is shown at first. More of its words open at the start of rounds 5, 10 and 15, and all of them at round 20.",
        "The rules are drawn afresh for every game: which company has which rule, and its numbers, differ from game to game. In the room the host can switch to a game played by the show's own rules.",
        "At the start of a round the monitor shows the new prices, what was bought and sold in the round before, the total holdings of all players, and everyone's assets and rank.",
        "Secret: once in the game you may use it on one stock. For the two rounds after, that stock's price and volumes are hidden from everyone, and so are everyone's assets (ranks stay). Whoever holds or trades that stock cannot see their own cash and assets either. Nobody is told who used it.",
        "Pieces: everyone starts with 3. Until round 20, one Piece shows you alone the next word to open in one stock's rule, or turns into 10,000 won.",
        "When everyone is done with a round it ends without waiting for the 5 minutes. Once you are done you cannot trade again in that round.",
      ],
      "Final assets of 1.5 million won or more are marked as winning 1 Piece, 3 million 2, 6 million 3, and 10 million the prize token. Between equal assets, whoever's assets were ever the lowest during the game ranks lower.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "round-over": "That round is already over",
    "round-done": "You are done with this round",
    "no-cash": "Not enough cash",
    "no-shares": "You do not hold that many shares",
    "secret-used": "You have used your secret",
    "no-pieces": "You have no Piece left",
    "pieces-closed": "Pieces can no longer be used",
    "nothing-hidden": "Nothing of that rule is hidden any more",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    rounds: "Over: all rounds played",
    left: "Over: nobody left to play",
    abandoned: "Over: everyone has gone",
  },
  name: STOCK_NAMES.en.name,
  short: STOCK_NAMES.en.short,
  rule: (key, args) => textOf("en", key, args),
  column: { price: "Price", bought: "Bought", sold: "Sold", held: "Held", mine: "Mine" },
  columnAt: { name: 70, price: 127, bought: 181, sold: 220, held: 259, mine: 298 },
  figure: (n) => (n < 1000000 ? `${Math.floor(n / 1000)}K` : n < 100000000 ? `${Math.floor(n / 100000) / 10}M` : `${grouped(Math.floor(n / 1000000))}M`),
  colour: { up: "#3fd0b6", down: "#e23b4a" },
  veiled: "???",
  veiledShort: "?",
  emblem: "The logo",
  won: (amount) => `${grouped(amount)} won`,
  wonShort: (amount) =>
    amount < 1000
      ? `${amount}`
      : amount < 10000
        ? `${Math.floor(amount / 100) / 10}K`
        : amount < 1000000
          ? `${Math.floor(amount / 1000)}K`
          : amount < 100000000
            ? `${(Math.floor(amount / 100000) / 10).toFixed(1)}M`
            : amount < 1000000000
              ? `${Math.floor(amount / 1000000)}M`
              : `${(Math.floor(amount / 100000000) / 10).toFixed(1)}B`,
  shares: (count) => (count === 1 ? "1 share" : `${grouped(count)} shares`),
  round: (round, rounds) => `Round ${round}/${rounds}`,
  position: (shares) => `You hold ${shares}`,
  wallet: (cash, assets, pieces, secret) => `Cash ${cash} · Assets ${assets} · Pieces ${pieces} · Secret ${secret ? 1 : 0}`,
  say: {
    bought: (name, shares) => `Bought ${shares} of ${name}`,
    sold: (name, shares) => `Sold ${shares} of ${name}`,
    secret: (name) => `Secret used on ${name}: hidden from next round`,
    peeked: (name) => `The next word of ${name}'s rule is open to you alone`,
    cashed: (amount) => `One Piece turned into ${amount}`,
    paused: "The game is paused",
    noShares: "Enter 1 share or more",
    noMax: "It is hidden: that cannot be worked out",
    opened: "More of the rules is open",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  coach: {
    start: "Prices move by the rules as each round ends · most cash + shares wins",
  },
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    watching: (done, of) => `Watching · done with the round: ${done}/${of}`,
    done: (done, of) => `You are done with the round · waiting for the others (${done}/${of})`,
    askSecret: (name, rounds) => `Use your one secret on ${name}: hidden for the next ${rounds} rounds`,
    askPiece: (name, amount) => byInput(`Spend a Piece · 1: next word of ${name}'s rule · 2: ${amount}`, `Spend a Piece · Rule: next word of ${name}'s · Cash: ${amount}`),
    askDone: "Be done with this round: you cannot trade in it again",
  },
  button: {
    max: keyed("A", "max"),
    all: keyed("Z", "all"),
    buy: keyed("B", "buy"),
    sell: keyed("S", "sell"),
    secret: keyed("X", "secret"),
    piece: keyed("P", "Piece"),
    done: keyed("Enter", "done"),
    charts: keyed("C", "charts"),
    table: keyed("C", "table"),
    use: keyed("Enter", "use"),
    finish: keyed("Enter", "done"),
    peek: keyed("1", "rule"),
    cash: keyed("2", "cash"),
    cancel: keyed("Esc", "cancel"),
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
    erase: "Del",
    enter: "OK",
  },
  log: {
    rulebook: { fresh: "New rules this game", show: "The show's rules" },
    round: (round) => `Round ${round}`,
    opened: (stage, of) => `More rules open (${stage}/${of})`,
    hidden: (name, from, until) => (from === until ? `Secret: ${name} R${from}` : `Secret: ${name} R${from}-${until}`),
  },
  result: {
    verdict: (seated, rank) => (seated ? englishOrdinal(rank) : "Over"),
    place: (rank, who, assets) => `${englishOrdinal(rank)} ${who} ${assets}`,
    mine: (assets) => `Your assets: ${assets}`,
    award: (pieces) => (pieces === 1 ? "1 Piece" : `${pieces} Pieces`),
    prize: "prize token",
    won: (what) => `Won: ${what}`,
    hostNext: "Play again with these players or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  help: (n) => {
    const [early, last] = opened(n.revealRounds, ", ");
    return [
      { text: "Mystery Stock Market: rules", tone: "title" },
      { text: `Trade ${n.stocks} stocks over ${n.rounds} rounds. The most assets wins.` },
      { text: `You start with ${grouped(n.startCash)} won. Stocks open at ${grouped(n.startPrice)}; floor ${grouped(n.floorPrice)}.` },
      { text: "Prices move when a round ends, each stock by its own rule." },
      { text: `More of each rule opens at rounds ${early}; all of it at ${last}.`, tone: "dim" },
      { text: n.rulebook === "show" ? "Blue blocks open next. These are the show's own rules." : "Blue blocks open next. These rules were drawn for this game.", tone: "dim" },
      { text: "" },
      { text: `Secret (once): takes a stock off the monitor for ${n.secretRounds} rounds.` },
      { text: "Assets are hidden meanwhile; if you hold or trade that stock,", tone: "dim" },
      { text: "so are your own cash and assets.", tone: "dim" },
      { text: `Piece (until round ${n.pieceRounds}): a stock's next word early, or ${grouped(n.pieceCash)} won.` },
      { text: `When everyone is done, the round ends before its ${n.roundMinutes} minutes.` },
      { text: "" },
      { text: byInput("↑↓ stock · digits shares · ←→ ±1 · A max · Z all · B buy · S sell", "Tap a stock to choose it. Tap the share count for a number pad."), tone: "dim" },
      { text: byInput("X secret · P Piece · C charts · Enter done with the round", "Done ends your trading for the round."), tone: "dim" },
      { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
    ];
  },
};

/** The words of 미스터리 거래소 (Mystery Stock Market), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

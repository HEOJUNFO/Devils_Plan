/**
 * The words of 경매 빙고 (Auction Bingo), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * shapes (triangle, circle, star), name ticket, coins, won, bid, winning bid,
 * bingo card, squares, the secret bid.
 */
import type { BingoEnd, Shape } from "../../../shared/games/auction-bingo/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  rounds: number;
  /** How many coins a player starts with, what they come to, and how many pieces. */
  coins: number;
  total: number;
  pieces: number;
  /** The seconds this game gives the two steps of a round. */
  chooseSeconds: number;
  bidSeconds: number;
}

/** Seconds as the sheet says them: whole minutes where they are, seconds otherwise. */
const koTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`);
const enTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

const ko = {
  sheet: {
    title: "경매 빙고: 규칙",
    brief: {
      goal: "도형을 낙찰받아 빙고판을 채웁니다. 빙고가 많을수록 좋습니다.",
      play: "라운드마다 도형 하나를 고르고, 그 도형에 코인을 몰래 겁니다.",
      end: "7라운드 뒤 빙고 수, 채운 칸, 남은 코인 순으로 순위를 가립니다.",
    },
    parts: [
      "모두 같은 빙고판을 씁니다. 9칸에 세모 3개, 동그라미 4개, 별 2개가 정해져 있습니다. 각자 코인 10개(1원 3개, 2원 3개, 3원 2개, 5원 1개, 10원 1개)와 피스 3개로 시작합니다. 코인은 더 작은 코인으로 쪼개 쓸 수 없습니다.",
      [
        "도형 선택: 이번 라운드에 낙찰받고 싶은 도형 하나에 네임 티켓을 넣습니다. 모두 넣으면 누가 어디에 넣었는지 공개됩니다. 넣은 티켓은 옮길 수 없습니다.",
        "입찰: 고른 도형에 1원 이상의 코인을 몰래 겁니다. 피스 1개를 1원 코인으로 바꿔 쓸 수 있습니다. 건 코인은 낙찰받지 못해도 돌아오지 않습니다.",
        "도형마다 가장 많이 건 사람이 낙찰자가 되어, 그 도형을 고른 사람 수만큼 그 도형을 얻습니다. 낙찰자가 여럿이면 똑같이 나누고 나머지는 버립니다.",
        "누가 낙찰받았는지는 낙찰받은 본인에게도 알려 주지 않습니다. 도형별 낙찰가만 공개되고, 그중 가장 높은 낙찰가는 시크릿으로 가려집니다.",
        "코인도 피스도 없어 1원을 걸 수 없으면 그 라운드부터 빠지고 최하위가 됩니다.",
        "시간이 지나면 방이 대신합니다: 도형은 무작위로 고르고, 입찰은 가장 작은 코인 하나를 겁니다.",
      ],
      "7라운드가 끝나면 얻은 도형이 공개되고, 빙고가 가장 많이 나오도록 빙고판에 자동으로 놓입니다. 놓을 칸이 없는 도형은 버립니다. 순위는 빙고 수(가로·세로·대각선 8줄), 채운 칸 수, 남은 코인 순입니다. 코인으로 바꾸지 않은 피스는 치지 않습니다. 끝나면 라운드별 낙찰가와 낙찰자가 모두 공개됩니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "out-of-coins": "코인과 피스가 없어 더는 입찰할 수 없습니다",
    "not-choosing": "지금은 도형을 고르는 때가 아닙니다",
    "already-chosen": "이미 티켓을 넣었습니다. 옮길 수 없습니다",
    "not-bidding": "지금은 입찰하는 때가 아닙니다",
    "already-bid": "이미 입찰했습니다",
    "coins-not-held": "그 코인은 갖고 있지 않습니다",
    "pieces-not-held": "피스가 모자랍니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "세 명 이상이어야 합니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar says it. */
  ended: {
    rounds: "모든 라운드가 끝남",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<BingoEnd, string>,
  /** The shapes by name: on their buttons, in the bar and in the log. */
  shape: { triangle: "세모", circle: "동그라미", star: "별" } as Record<Shape, string>,
  /** The column's heading, with the clock beside it. */
  round: (round: number, rounds: number) => `라운드 ${round}/${rounds}`,
  /** Over the card: 94 pixels. */
  card: "빙고판",
  /** In a shape's box and in the table of the rounds: how many chose it, and what it went for (`bidShort` in a cell of the table, 57 pixels with the votes). */
  votes: (count: number) => `${count}표`,
  price: (won: number) => `${won}원`,
  bidShort: (won: number) => `${won}원`,
  secret: "시크릿",
  noBid: "유찰",
  /** In the list, beside the player's own name: the worth of the coins they hold. Beside one who can no longer bid. */
  coins: (won: number) => `${won}원`,
  outMark: "코인 없음",
  /** Said in the bar for a moment. */
  say: {
    pickShape: "도형을 먼저 고르세요",
    pickCoins: "걸 코인을 먼저 고르세요 (1원 이상)",
    noPieces: "바꿀 피스가 없습니다",
    chosenForYou: (shape: string) => `시간이 지나 방이 ${shape}에 티켓을 넣었습니다`,
    bidForYou: (won: number) => `시간이 지나 방이 ${won}원을 걸었습니다`,
    out: "코인과 피스가 없어 이번 라운드부터 빠집니다",
  },
  /** Over the card while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    choose: (clock: string) => `낙찰받을 도형을 고르세요 · 넣은 티켓은 옮길 수 없습니다 · ${clock}`,
    chooseReady: (shape: string, clock: string) => byInput(`${shape} · Enter로 티켓을 넣습니다 (못 옮김) · ${clock}`, `${shape} · 넣기를 누르면 티켓을 넣습니다 (못 옮김) · ${clock}`),
    chosen: (shape: string, have: number, of: number, clock: string) => `${shape}에 넣었습니다 · 다른 사람을 기다리는 중 (${have}/${of}) · ${clock}`,
    watchChoose: (have: number, of: number, clock: string) => `관전 중 · 도형을 고르는 중 (${have}/${of}) · ${clock}`,
    bid: (shape: string, clock: string) => `${shape}에 걸 코인을 고르세요 (1원 이상, 돌려받지 못함) · ${clock}`,
    bidReady: (shape: string, won: number, clock: string) => byInput(`${shape}에 ${won}원 · Enter로 입찰합니다 (못 바꿈) · ${clock}`, `${shape}에 ${won}원 · 입찰을 누르면 겁니다 (못 바꿈) · ${clock}`),
    bidDone: (shape: string, won: number, have: number, of: number, clock: string) => `${shape}에 ${won}원을 걸었습니다 · 기다리는 중 (${have}/${of}) · ${clock}`,
    watchBid: (have: number, of: number, clock: string) => `관전 중 · 입찰하는 중 (${have}/${of}) · ${clock}`,
    result: (round: number, seconds: number) => `라운드 ${round} 낙찰가 공개 · 다음 라운드까지 ${seconds}초`,
    lastResult: (seconds: number) => `마지막 라운드 낙찰가 공개 · 결과까지 ${seconds}초`,
    out: "코인과 피스가 없어 입찰할 수 없습니다 · 최하위로 끝납니다",
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
  },
  /** The buttons of the bar. `piece` is two lines of a button 60 pixels wide. */
  button: {
    put: keyed("Enter", "넣기"),
    bid: keyed("Enter", "입찰"),
    piece: (pieces: number): [string, string] => [`피스 ×${pieces}`, "→ 1원"],
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    rounds: keyed("V", "라운드 보기"),
    places: keyed("V", "순위 보기"),
  },
  /** The log: the player's own bids, a line of the column, 168 pixels. */
  log: {
    bid: (round: number, shape: string, won: number) => `R${round} ${shape}에 ${won}원`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string, lines: number) => `${place}위 ${who} 빙고 ${lines}`,
    mine: (lines: number, cells: number, coins: number) => `내 빙고 ${lines}줄 · 채운 칸 ${cells} · 남은 코인 ${coins}원`,
    mineOut: "입찰하지 못한 라운드가 있어 최하위입니다",
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
    /** Over the two pages of the results, and the columns of the first: bingos, squares filled, coins left. */
    places: "순위와 빙고판",
    rounds: "라운드별 낙찰가와 낙찰자",
    columns: { lines: "빙고", cells: "칸", coins: "코인" },
    /** In a cell of the second page: how many of the shape each winner got. */
    each: (share: number) => `각 ${share}`,
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "경매 빙고: 규칙", tone: "title" },
    { text: "모두 같은 빙고판을 씁니다. 칸마다 세모·동그라미·별이 정해져 있습니다." },
    { text: `각자 코인 ${n.coins}개(${n.total}원)와 피스 ${n.pieces}개. 코인은 쪼갤 수 없습니다.` },
    { text: "" },
    { text: `① 도형 선택 (${koTime(n.chooseSeconds)}): 낙찰받고 싶은 도형 하나에 티켓을 넣습니다.` },
    { text: "모두 넣으면 누가 어디에 넣었는지 공개됩니다. 옮길 수 없습니다.", tone: "dim" },
    { text: `② 입찰 (${koTime(n.bidSeconds)}): 고른 도형에 1원 이상을 몰래 겁니다. 건 코인은 사라집니다.` },
    { text: "피스 1개를 1원 코인으로 바꿀 수 있습니다. 걸 것이 없으면 최하위.", tone: "dim" },
    { text: "③ 도형마다 가장 많이 건 사람이, 그 도형을 고른 사람 수만큼 얻습니다." },
    { text: "같은 금액이면 똑같이 나누고 나머지는 버립니다.", tone: "dim" },
    { text: "누가 낙찰받았는지는 본인도 모릅니다. 낙찰가만 공개되고," },
    { text: "가장 높은 낙찰가는 시크릿으로 가려집니다." },
    { text: "" },
    { text: `${n.rounds}라운드 뒤 얻은 도형이 빙고가 가장 많게 자동으로 놓입니다.` },
    { text: "순위: 빙고 수(대각선 포함 8줄) → 채운 칸 → 남은 코인.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Auction Bingo: rules",
    brief: {
      goal: "Win shapes at auction to make bingos on your card.",
      play: "Each round, pick one shape, then bid coins on it in secret.",
      end: "After 7 rounds: most bingos, then squares, then coins left.",
    },
    parts: [
      "Everyone has the same bingo card: nine squares marked with 3 triangles, 4 circles and 2 stars. You start with 10 coins (three of 1 won, three of 2, two of 3, one of 5 and one of 10) and 3 Pieces. A coin cannot be split into smaller coins.",
      [
        "Shape selection: put your name ticket in the box of the one shape you want to win this round. When every ticket is in, everyone sees who chose what. A ticket cannot be moved.",
        "Bidding: secretly bid 1 won or more in coins on the shape you chose. A Piece can be turned into a 1-won coin. Coins you bid are gone whether or not you win.",
        "For each shape the highest bidder wins as many of that shape as players chose it. Those who tie for the highest bid share them evenly, and the remainder is thrown away.",
        "Nobody is told who won, not even the winner. Only the winning bid for each shape is shown, and the highest of them is kept secret.",
        "With no coin and no Piece left you cannot bid 1 won: you sit out from that round on and finish last.",
        "When the time is up the room acts for you: a shape picked at random, and a bid of your smallest coin.",
      ],
      "After round 7 the shapes everyone won are shown and placed on each card automatically to make the most bingos. Shapes with no square left for them are thrown away. Places go by bingos (8 lines: rows, columns and diagonals), then squares filled, then coins left. Pieces not turned into coins count for nothing. At the end every round's winning bids and winners are shown.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "out-of-coins": "No coins or Pieces left: you can no longer bid",
    "not-choosing": "Shapes are not being chosen now",
    "already-chosen": "Your ticket is in already and cannot be moved",
    "not-bidding": "Bids are not being made now",
    "already-bid": "You have bid already",
    "coins-not-held": "You do not hold those coins",
    "pieces-not-held": "Not enough Pieces",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-playing": "You are watching, not playing",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes three players or more",
    "already-playing": "A game is being played already",
    "bots-not-allowed": "This server does not offer bots",
    "too-fast": "Too fast: try again in a moment",
    "not-kept": "The server could not take that now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    rounds: "Every round was played",
    left: "Too few players left",
    abandoned: "Everyone left",
  } as Record<BingoEnd, string>,
  shape: { triangle: "Triangle", circle: "Circle", star: "Star" } as Record<Shape, string>,
  round: (round, rounds) => `Round ${round}/${rounds}`,
  card: "Bingo card",
  votes: (count) => `×${count}`,
  price: (won) => `${won} won`,
  bidShort: (won) => `${won}`,
  secret: "Secret",
  noBid: "No bid",
  coins: (won) => `${won} won`,
  outMark: "No coins",
  say: {
    pickShape: "Pick a shape first",
    pickCoins: "Pick the coins to bid first (1 won or more)",
    noPieces: "No Pieces left to turn into coins",
    chosenForYou: (shape) => `Time was up: the room put your ticket on ${shape}`,
    bidForYou: (won) => `Time was up: the room bid ${won} won for you`,
    out: "No coins or Pieces left: you sit out from this round",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for someone to come back" : `Waiting for someone to come back · ${seconds}s`),
  standing: {
    offline: "The connection is down. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    choose: (clock) => `Pick the shape you want to win · a ticket cannot be moved · ${clock}`,
    chooseReady: (shape, clock) => byInput(`${shape} · Enter puts your ticket in (cannot be moved) · ${clock}`, `${shape} · Put in to place your ticket (cannot be moved) · ${clock}`),
    chosen: (shape, have, of, clock) => `Ticket on ${shape} · waiting for the others (${have}/${of}) · ${clock}`,
    watchChoose: (have, of, clock) => `Watching · shapes are being chosen (${have}/${of}) · ${clock}`,
    bid: (shape, clock) => `Pick coins to bid on ${shape} (1 won or more, not returned) · ${clock}`,
    bidReady: (shape, won, clock) => byInput(`${won} won on ${shape} · Enter bids (cannot be changed) · ${clock}`, `${won} won on ${shape} · Bid to confirm (cannot be changed) · ${clock}`),
    bidDone: (shape, won, have, of, clock) => `You bid ${won} won on ${shape} · waiting (${have}/${of}) · ${clock}`,
    watchBid: (have, of, clock) => `Watching · bids are being made (${have}/${of}) · ${clock}`,
    result: (round, seconds) => `Round ${round}: the winning bids · next round in ${seconds}s`,
    lastResult: (seconds) => `Last round: the winning bids · results in ${seconds}s`,
    out: "No coins or Pieces left: you cannot bid, and finish last",
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
  },
  button: {
    put: keyed("Enter", "put in"),
    bid: keyed("Enter", "bid"),
    piece: (pieces) => [`Piece ×${pieces}`, "→ 1 won"],
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
    rounds: keyed("V", "rounds"),
    places: keyed("V", "places"),
  },
  log: {
    bid: (round, shape, won) => `R${round} ${won} won on ${shape}`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who, lines) => `${englishOrdinal(place)} ${who}: ${lines} ${lines === 1 ? "bingo" : "bingos"}`,
    mine: (lines, cells, coins) => `You: ${lines} ${lines === 1 ? "bingo" : "bingos"} · ${cells} squares · ${coins} won left`,
    mineOut: "You missed a bid, which puts you last",
    hostNext: "Play again with these players or go back",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
    places: "Places and bingo cards",
    rounds: "Winning bids and winners",
    columns: { lines: "Bingo", cells: "Sq.", coins: "Won" },
    each: (share) => `${share} each`,
  },
  help: (n) => [
    { text: "Auction Bingo: rules", tone: "title" },
    { text: "Everyone has the same bingo card of triangles, circles and stars." },
    { text: `You have ${n.coins} coins (${n.total} won) and ${n.pieces} Pieces. Coins cannot be split.` },
    { text: "" },
    { text: `1. Shape selection (${enTime(n.chooseSeconds)}): put your ticket on one shape to win.` },
    { text: "When all are in, everyone sees who chose what. It stays put.", tone: "dim" },
    { text: `2. Bidding (${enTime(n.bidSeconds)}): secretly bid 1 won or more. Bids are spent.` },
    { text: "A Piece turns into a 1-won coin. With nothing to bid you finish last.", tone: "dim" },
    { text: "3. For each shape the highest bidder wins as many as chose it." },
    { text: "A tie shares them evenly; the remainder is thrown away.", tone: "dim" },
    { text: "Nobody is told who won, not even the winner. Only the winning" },
    { text: "bids are shown, and the highest of them is kept secret." },
    { text: "" },
    { text: `After ${n.rounds} rounds your shapes are placed to make the most bingos.` },
    { text: "Places: bingos (8 lines) → squares filled → coins left.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 경매 빙고 (Auction Bingo), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

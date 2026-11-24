/**
 * The words of HIT, STAY (힛, 스테이), in each language (`lang.ts`): its rules
 * as the page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Hit, Stay, limit, basic bet, first and second round of betting, call,
 * raise, fold, all in, pot, first player, "the round is tied". The Korean
 * ones are the wiki's (한계 숫자, 기본 베팅, 1차·2차 베팅, 콜·레이즈·포기,
 * 힛·스테이, 추가 카드, 선 플레이어, 칩); 판돈 and 올인 are plain words, the
 * show's own not having been found (design/games/hit-stay.md).
 */
import type { HitEnd, Outcome } from "../../../shared/games/hit-stay/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many cards the deck has, and how many each player is dealt. */
  cards: number;
  dealt: number;
  startChips: number;
  /** After how many rounds the basic bet goes up by one. */
  basicBetEvery: number;
  limitLowest: number;
  limitHighest: number;
  /** Seconds to choose the card to reveal. */
  revealSeconds: number;
}

/** A line of the bar with the step's clock after it, where the step has one. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "HIT, STAY: 규칙",
    brief: {
      goal: "카드의 합이 한계 숫자를 넘지 않으면서 가장 가까우면 판돈을 가져갑니다.",
      play: "3장 가운데 한 장만 보여 주고, 칩을 걸고, 더 받을지(힛) 멈출지(스테이) 고릅니다.",
      end: "칩이 0이 되면 빠집니다. 마지막까지 남은 한 사람이 1위.",
    },
    parts: [
      "2~5명이 합니다. 각자 칩 30개로 시작하고, 숫자 카드 35장을 씁니다: 7이 1장, 6이 2장, 5가 3장, 4가 4장, 3이 5장, 2가 6장, 1이 7장, -1이 7장. 자리와 첫 선 플레이어는 추첨하고, 라운드마다 선 플레이어가 왼쪽 사람으로 넘어갑니다.",
      [
        "기본 베팅: 라운드가 시작되면 모두 기본 베팅 칩 1개를 냅니다. 10라운드가 끝날 때마다 1개씩 늘어납니다. 칩이 그보다 적은 사람이 있으면 그 사람의 칩 수만큼만 냅니다.",
        "한계 숫자: 8면체 주사위(5~12)로 그 라운드의 한계 숫자를 정합니다. 카드의 합이 넘으면 안 되는 수입니다.",
        "카드: 덱을 새로 섞어 3장씩 뒤집어 받습니다. 그 가운데 한 장을 골라 모두에게 공개합니다 (30초; 지나면 방이 한 장을 뽑아 공개합니다).",
        "1차 베팅: 선 플레이어부터 차례로 합니다. 걸린 베팅이 없으면 1개 이상 걸거나 포기하고, 있으면 콜·레이즈·포기 가운데 고릅니다. 남은 사람들이 건 칩이 같아지면 끝납니다. 한 사람이 한 라운드에 낼 수 있는 칩은 그 라운드에 남아 있는 사람 가운데 칩이 가장 적은 사람의 칩 수까지입니다.",
        "힛·스테이: 선 플레이어부터 한 번에 한 장씩, 추가 카드를 받을지(힛) 받지 않을지(스테이) 고릅니다. 추가 카드는 모두에게 공개됩니다. 스테이한 사람에게는 다시 묻지 않고, 모두가 스테이하거나 카드가 떨어지면 끝납니다.",
        "2차 베팅을 한 뒤 남은 사람이 카드를 모두 공개합니다. 누군가 올인(낼 수 있는 칩을 다 냄)했으면 그 뒤의 베팅은 없습니다.",
      ],
      "승부: 합이 한계 숫자를 넘은 사람은 그 라운드의 최하위입니다. 넘지 않은 사람 가운데 한계 숫자에 가장 가까운 사람이 판돈을 가져갑니다. 합이 같으면 카드가 많은 쪽이 이깁니다. 합도 장수도 같거나 모두가 한계를 넘으면 무승부이고, 판돈을 똑같이 나눕니다. 나누고 남은 칩은 선 플레이어부터 차례로 한 개씩 받습니다. 한 사람만 남고 모두 포기하면 그 사람이 카드를 공개하지 않고 판돈을 가져갑니다.",
      "칩이 0개가 된 사람은 빠지고, 빠진 순서가 늦을수록 순위가 높습니다. 마지막까지 남은 한 사람이 1위입니다. 베팅과 힛·스테이의 시간은 방장이 대기실에서 정하며, 지나면 포기 또는 스테이가 됩니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-revealing": "지금은 공개할 카드를 고르는 때가 아닙니다",
    "bad-card": "그런 카드는 없습니다",
    "already-revealed": "공개할 카드를 이미 골랐습니다",
    "not-betting": "지금은 베팅하는 때가 아닙니다",
    "not-hitting": "지금은 추가 카드를 받는 때가 아닙니다",
    "not-your-turn": "내 차례가 아닙니다",
    "nothing-to-call": "받을 베팅이 없습니다. 1개 이상 걸거나 포기하세요",
    "bet-too-low": "앞의 베팅보다 많이 걸어야 합니다",
    "bet-over-most": "칩이 가장 적은 사람의 칩 수를 넘을 수 없습니다",
    "not-playing": "이번 라운드에서 빠져 있습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "too-many": "다섯 명까지 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "한 사람이 남아 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<HitEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, limit: number) => `${round}라운드 · 한계 ${limit}`,
  /** Over the table, beside the limit: two lines of 200 pixels. */
  top: {
    limit: "한계",
    round: (round: number, basic: number) => `${round}라운드 · 기본 베팅 ${basic}`,
    pot: (pot: number, left: number) => `판돈 ${pot} · 남은 카드 ${left}`,
    /** How the round came out, in place of the pot once it has. */
    won: (who: string, pot: number) => `${who} 승 · 판돈 ${pot}`,
    moreCards: (who: string, pot: number) => `${who} 승 (카드 수) · 판돈 ${pot}`,
    took: (who: string, pot: number) => `모두 포기 · ${who} 판돈 ${pot}`,
    tied: (each: number) => `무승부 · ${each}개씩 나눔`,
    allOver: (each: number) => `모두 한계 초과 · ${each}개씩 나눔`,
  },
  /** In a player's row, 64 pixels: their chips, and what they are in the round. */
  row: {
    stake: (stake: number) => `건 ${stake}`,
    folded: "포기",
    out: "탈락",
    stayed: "스테이",
    choosing: "고르는 중",
    total: (total: number) => `= ${total}`,
    share: (chips: number) => `+${chips}`,
  },
  /** Said in the bar for a moment. */
  say: {
    cannotRaise: "더 올릴 수 없습니다",
    revealedForYou: "시간이 지나 방이 공개할 카드를 골랐습니다",
    foldedForYou: "시간이 지나 포기가 되었습니다",
    stayedForYou: "시간이 지나 스테이가 되었습니다",
    out: "칩이 없어 빠졌습니다. 남은 판은 구경합니다",
  },
  /** Over the table while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    reveal: (clock: string) => timed(byInput("공개할 카드 한 장을 고르세요 (1·2·3)", "공개할 카드 한 장을 누르세요"), clock),
    revealed: (clock: string) => timed("다른 사람이 공개할 카드를 고르는 중", clock),
    revealOther: (clock: string) => timed("모두 공개할 카드를 고르는 중", clock),
    betOpen: (betting: number, most: number, clock: string) => timed(`${betting}차 베팅 · 1~${most}개를 걸거나 포기하세요`, clock),
    betCall: (betting: number, call: number, most: number, clock: string) => timed(`${betting}차 베팅 · 콜 ${call}개 · 레이즈는 ${most}개까지`, clock),
    betCallOnly: (betting: number, call: number, clock: string) => timed(`${betting}차 베팅 · 콜 ${call}개 또는 포기`, clock),
    betOther: (betting: number, who: string, clock: string) => timed(`${betting}차 베팅 · ${who}의 차례`, clock),
    hit: (total: number, limit: number, clock: string) => timed(`힛(한 장 더) 또는 스테이 · 내 합 ${total} / 한계 ${limit}`, clock),
    hitOther: (who: string, clock: string) => timed(`${who}: 힛 또는 스테이를 고르는 중`, clock),
    show: (clock: string) => timed("다음 라운드로 넘어갑니다", clock),
    outOf: "칩이 없어 빠졌습니다 · 구경 중",
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    bet: "F 포기 · C 콜 · ←→ 금액 · ↑ 최대 · Enter 베팅",
    hit: "D 힛 · S 스테이",
  },
  /** The buttons over the bar. */
  button: {
    fold: keyed("F", "포기"),
    call: (chips: number) => keyed("C", `콜 ${chips}`),
    callNone: keyed("C", "콜"),
    bet: (chips: number) => keyed("Enter", `베팅 ${chips}`),
    raise: (chips: number) => keyed("Enter", `레이즈 ${chips}`),
    allIn: (chips: number) => keyed("Enter", `올인 ${chips}`),
    hit: keyed("D", "힛"),
    stay: keyed("S", "스테이"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number, limit: number, basic: number) => `${round}R · 한계 ${limit} · 기본 ${basic}`,
    revealed: "카드 공개",
    bet: (who: string, to: number) => `${who}: 베팅 ${to}`,
    raise: (who: string, to: number) => `${who}: 레이즈 ${to}`,
    allIn: (who: string, to: number) => `${who}: 올인 ${to}`,
    call: (who: string) => `${who}: 콜`,
    callAllIn: (who: string) => `${who}: 콜 (올인)`,
    fold: (who: string, forced: boolean) => (forced ? `${who}: 포기 (시간)` : `${who}: 포기`),
    hit: (who: string, card: number) => `${who}: 힛 → ${card}`,
    stay: (who: string, forced: boolean) => (forced ? `${who}: 스테이 (시간)` : `${who}: 스테이`),
    won: (who: string, pot: number) => `${who} 승 · 판돈 ${pot}`,
    tied: (pot: number) => `무승부 · 판돈 ${pot}`,
    out: (who: string) => `${who} 탈락`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "종료" : `${place}위`),
    place: (place: number, who: string) => `${place}위 ${who}`,
    how: (rounds: number) => `${rounds}라운드 만에 한 사람이 남음`,
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "HIT, STAY: 규칙", tone: "title" },
    { text: "합이 한계 숫자를 넘지 않으면서 가장 가까운 사람이 판돈을 가져갑니다." },
    { text: `카드 ${n.cards}장: 7×1, 6×2, 5×3, 4×4, 3×5, 2×6, 1×7, -1×7. 칩 ${n.startChips}개로 시작.`, tone: "dim" },
    { text: `라운드: 기본 베팅(${n.basicBetEvery}라운드마다 +1) → 한계 숫자(${n.limitLowest}~${n.limitHighest}) → 카드 ${n.dealt}장씩.` },
    { text: `받은 ${n.dealt}장 가운데 한 장을 골라 공개합니다 (${n.revealSeconds}초).` },
    { text: "1차 베팅: 선 플레이어부터 베팅·콜·레이즈·포기. 건 칩이 같아지면 끝." },
    { text: "낼 수 있는 칩은 남은 사람 가운데 칩이 가장 적은 사람의 칩 수까지.", tone: "dim" },
    { text: "힛: 한 장 더 받습니다 (공개). 스테이: 그만 받습니다. 한 장씩 돌아갑니다." },
    { text: "모두 스테이하면 2차 베팅, 그 뒤 남은 사람의 카드를 모두 공개합니다." },
    { text: "한계를 넘으면 최하위. 합이 같으면 카드가 많은 쪽이 이깁니다." },
    { text: "합도 장수도 같거나 모두 넘으면 무승부: 판돈을 나눕니다.", tone: "dim" },
    { text: "올인 뒤에는 베팅이 없습니다. 모두 포기하면 남은 사람이 가져갑니다.", tone: "dim" },
    { text: "칩이 0이 되면 탈락. 마지막까지 남은 한 사람이 1위." },
    { text: "이름 앞 네모: 선 플레이어. 어두운 카드: 나만 보는 내 카드.", tone: "dim" },
    { text: byInput("1·2·3 공개 · F 포기 · C 콜 · ←→↑ 금액 · Enter 베팅 · D 힛 · S 스테이", "카드와 단추를 눌러서 합니다"), tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Hit, Stay: rules",
    brief: {
      goal: "The card total closest to the limit, without exceeding it, wins the pot.",
      play: "Reveal one of three cards, bet chips, then hit for more cards or stay.",
      end: "A player with no chips is out. The last player remaining wins.",
    },
    parts: [
      "For 2 to 5 players. Each starts with 30 chips. The deck has 35 number cards: one 7, two 6s, three 5s, four 4s, five 3s, six 2s, seven 1s and seven negative ones (-1). Seats and the first player are drawn, and after each round the player to the left becomes the first player.",
      [
        "Basic bet: when a round starts, everyone puts in one chip. At the end of every tenth round the basic bet increases by one chip. If someone has fewer chips than that, everyone puts in only as many as that player has.",
        "Limit: an eight-sided die showing 5 through 12 gives the limit for the round, the number your total card value cannot exceed.",
        "Cards: the deck is shuffled anew and three cards are dealt face down to each player. You choose one card from your hand and reveal it to the table (30 seconds; after that the room reveals one at random).",
        "First round of betting: it starts with the first player. With no bet to call, you bet one chip or more, or fold; otherwise you call, raise or fold. It ends once all the players still in have put in the same. Nobody can put in, over a round, more than the number of chips held by the player with the fewest chips among those still in it.",
        "Hit or stay: starting with the first player and one at a time, each player still in can receive an additional card (hit) or not (stay). All additional cards are revealed to the table. A player who stays is not asked again; it goes on until every player stays or there are no cards left.",
        "After a second round of betting, every player still in the round reveals their full hand. Once someone is all in (has put in all they can), there is no more betting.",
      ],
      "Winning: a player whose total exceeds the limit is the lowest-ranking player of the round. Among those within the limit, the total closest to the limit wins the pot. If totals are tied, the player with more cards wins. If both the total and the number of cards are tied, or all players have exceeded the limit, the round is tied and the chips are split evenly; any remaining chips are distributed in order, starting with the first player. If everyone else folds, the last player takes the pot without revealing any card.",
      "A player who loses all their chips is out, and the later you are out, the higher you rank. The last player remaining wins. The host sets the time for a bet and for hit or stay in the waiting room; when it runs out, it is a fold, or a stay.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-revealing": "No card to reveal is being chosen now",
    "bad-card": "There is no such card",
    "already-revealed": "You have chosen your card to reveal",
    "not-betting": "There is no betting now",
    "not-hitting": "No additional cards are being dealt now",
    "not-your-turn": "It is not your turn",
    "nothing-to-call": "There is no bet to call. Bet one chip or more, or fold",
    "bet-too-low": "A bet must be higher than the one before it",
    "bet-over-most": "That is more than the player with the fewest chips has",
    "not-playing": "You are out of this round",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "too-many": "It takes five players at most",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    played: "One player remains",
    left: "Too few players left",
    abandoned: "Everyone left",
  } as Record<HitEnd, string>,
  heading: (round, limit) => `Round ${round} · limit ${limit}`,
  top: {
    limit: "Limit",
    round: (round, basic) => `Round ${round} · basic bet ${basic}`,
    pot: (pot, left) => `Pot ${pot} · ${left} cards left`,
    won: (who, pot) => `${who} wins the pot: ${pot}`,
    moreCards: (who, pot) => `${who} wins (more cards): ${pot}`,
    took: (who, pot) => `All folded · ${who} takes ${pot}`,
    tied: (each) => `The round is tied · ${each} each`,
    allOver: (each) => `All over the limit · ${each} each`,
  },
  row: {
    stake: (stake) => `in ${stake}`,
    folded: "fold",
    out: "out",
    stayed: "stay",
    choosing: "choosing",
    total: (total) => `= ${total}`,
    share: (chips) => `+${chips}`,
  },
  say: {
    cannotRaise: "It cannot be raised further",
    revealedForYou: "Time ran out: the room chose your card to reveal",
    foldedForYou: "Time ran out: you folded",
    stayedForYou: "Time ran out: you stay",
    out: "You are out of chips. You can watch the rest",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for the players" : `Waiting for the players · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    reveal: (clock) => timed(byInput("Choose one card to reveal (1, 2 or 3)", "Tap one card to reveal"), clock),
    revealed: (clock) => timed("The others are choosing a card to reveal", clock),
    revealOther: (clock) => timed("Everyone is choosing a card to reveal", clock),
    betOpen: (betting, most, clock) => timed(`${betting === 1 ? "First" : "Second"} round of betting · bet 1 to ${most}, or fold`, clock),
    betCall: (betting, call, most, clock) => timed(`${betting === 1 ? "First" : "Second"} round of betting · call ${call} · raise to ${most} at most`, clock),
    betCallOnly: (betting, call, clock) => timed(`${betting === 1 ? "First" : "Second"} round of betting · call ${call}, or fold`, clock),
    betOther: (betting, who, clock) => timed(`${betting === 1 ? "First" : "Second"} round of betting · ${who}'s turn`, clock),
    hit: (total, limit, clock) => timed(`Hit or stay? · your total ${total}, the limit ${limit}`, clock),
    hitOther: (who, clock) => timed(`${who}: hit or stay?`, clock),
    show: (clock) => timed("On to the next round", clock),
    outOf: "You are out of chips · watching",
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    bet: "F fold · C call · ←→ amount · ↑ most · Enter bet",
    hit: "D hit · S stay",
  },
  button: {
    fold: keyed("F", "Fold"),
    call: (chips) => keyed("C", `Call ${chips}`),
    callNone: keyed("C", "Call"),
    bet: (chips) => keyed("Enter", `Bet ${chips}`),
    raise: (chips) => keyed("Enter", `Raise ${chips}`),
    allIn: (chips) => keyed("Enter", `All in ${chips}`),
    hit: keyed("D", "Hit"),
    stay: keyed("S", "Stay"),
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round, limit, basic) => `R${round} · limit ${limit} · basic ${basic}`,
    revealed: "Cards revealed",
    bet: (who, to) => `${who}: bet ${to}`,
    raise: (who, to) => `${who}: raise to ${to}`,
    allIn: (who, to) => `${who}: all in, ${to}`,
    call: (who) => `${who}: call`,
    callAllIn: (who) => `${who}: call (all in)`,
    fold: (who, forced) => (forced ? `${who}: fold (time)` : `${who}: fold`),
    hit: (who, card) => `${who}: hit → ${card}`,
    stay: (who, forced) => (forced ? `${who}: stay (time)` : `${who}: stay`),
    won: (who, pot) => `${who} wins ${pot}`,
    tied: (pot) => `Tied · pot ${pot}`,
    out: (who) => `${who} is out`,
  },
  result: {
    verdict: (seated, place) => (!seated || place === null ? "Over" : englishOrdinal(place)),
    place: (place, who) => `${englishOrdinal(place)} ${who}`,
    how: (rounds) => `One player remained after ${rounds} ${rounds === 1 ? "round" : "rounds"}`,
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Hit, Stay: rules", tone: "title" },
    { text: "The total closest to the limit, without exceeding it, wins the pot." },
    { text: `${n.cards} cards: 7×1, 6×2, 5×3, 4×4, 3×5, 2×6, 1×7, -1×7. Start: ${n.startChips} chips.`, tone: "dim" },
    { text: `A round: basic bet (+1 per ${n.basicBetEvery} rounds), limit ${n.limitLowest}-${n.limitHighest}, ${n.dealt} cards each.` },
    { text: `Choose one of your ${n.dealt} cards and reveal it to the table (${n.revealSeconds} s).` },
    { text: "First round of betting from the first player: bet, call, raise, fold." },
    { text: "No one can put in more than the player with the fewest chips has.", tone: "dim" },
    { text: "Hit: one more card, face up. Stay: no more. One card at a time." },
    { text: "When all stay: a second round of betting, then all hands are shown." },
    { text: "Over the limit ranks lowest. Equal totals: more cards win." },
    { text: "Equal in both, or all over the limit: the round is tied, pot split.", tone: "dim" },
    { text: "No betting after an all in. If all others fold, you take the pot.", tone: "dim" },
    { text: "No chips, and you are out. The last player remaining wins." },
    { text: "Square before a name: first player. Dark cards: yours, hidden.", tone: "dim" },
    { text: byInput("Keys: 1-3 · F fold · C call · ←→↑ · Enter bet · D hit · S stay", "Tap the cards and the buttons to play"), tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** How a round came out, over the table: who took the pot and how. `who` names the first to take a share. */
export function outcomeWords(lang: typeof ko, outcome: Pick<Outcome, "how" | "pot" | "shares">, who: string): string {
  const each = outcome.shares[0]?.chips ?? 0;
  if (outcome.how === "fold") return lang.top.took(who, outcome.pot);
  if (outcome.how === "tied") return lang.top.tied(each);
  if (outcome.how === "all-over") return lang.top.allOver(each);
  return outcome.how === "more-cards" ? lang.top.moreCards(who, outcome.pot) : lang.top.won(who, outcome.pot);
}

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

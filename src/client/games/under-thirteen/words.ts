/**
 * The words of 무거운 13 (Heavy 13), in each language (`lang.ts`): its rules
 * as the page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import type { Chip, Stand, UnderEnd } from "../../../shared/games/under-thirteen/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  limit: number;
  /** The lowest and the highest card. */
  low: number;
  high: number;
  /** How many chips of each colour, and how many rounds a set lasts and the game. */
  chipsOfEach: number;
  perSet: number;
  rounds: number;
  submitSeconds: number;
  turnSeconds: number;
}

const ko = {
  sheet: {
    title: "무거운 13: 규칙",
    brief: {
      goal: "내 바위로 받침대 합이 13 이상이 되면 벌점. 적을수록 좋습니다.",
      play: "바위 카드와 칩을 몰래 내고, 차례에 바위를 놓거나 패스합니다.",
      end: "14라운드를 하면 끝나고, 벌점이 가장 적은 사람이 1위입니다.",
    },
    parts: [
      "모두가 0~6이 적힌 바위 카드 1장과 색깔 칩 1개를 몰래 냅니다. 칩의 색은 바위를 올릴 받침대를, 카드의 숫자는 바위의 무게를 정합니다. 내는 시간은 3분입니다.",
      [
        "칩을 먼저, 카드를 그다음에 공개하고, 한 사람씩 순서대로 바위를 올립니다. 레인보우 칩을 낸 사람들이 먼저이고 나머지가 그다음입니다. 그 안에서는 카드 숫자가 높은 사람부터, 숫자가 같으면 선 플레이어부터 시계 방향입니다.",
        "세 명 이상이면 판을 시작할 때 각자 설 자리를 고릅니다. 한 번 서면 바꿀 수 없고, 시계 방향은 이 자리의 순서입니다.",
        "레인보우 칩을 냈으면 자기 차례에 받침대를 고릅니다.",
        "자기 차례에 바위를 놓거나, 라운드마다 한 번 패스할 수 있습니다. 순서가 마지막인 사람은 패스할 수 없고 바로 놓습니다.",
        "패스한 바위는 다른 바위가 모두 놓인 뒤에 더 묻지 않고 놓이며, 여럿이 패스했으면 먼저 패스한 사람이 가장 나중입니다.",
        "내 바위로 받침대의 합이 13 이상이 되면, 내 바위만 남기고 모두 걷어 내며 걷어 낸 개수만큼 벌점을 받습니다.",
        "라운드에서 마지막으로 벌점을 받은 사람이 다음 라운드의 선 플레이어입니다.",
      ],
      "카드와 칩은 7라운드 동안 한 번씩 씁니다. 7라운드가 끝나면 같은 세트를 다시 받아 14라운드까지 하고, 받침대는 비우지 않습니다. 벌점이 가장 적은 사람이 1위이고, 벌점이 같으면 더 최근에 벌점을 받은 사람이 아래입니다. 14라운드를 다 하면 1위는 피스 4개를 받아 방에 쌓입니다 (1위가 여럿이면 똑같이 나누고 남는 것은 버립니다).",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "spots-not-open": "지금은 자리를 고르는 때가 아닙니다",
    "spot-held": "이미 자리를 잡았습니다. 자리는 바꿀 수 없습니다",
    "spot-taken": "다른 사람이 먼저 선 자리입니다",
    "not-submitting": "지금은 낼 수 없습니다",
    "already-submitted": "이미 냈습니다",
    "not-held": "그 카드나 칩은 이미 썼습니다",
    "not-placing": "지금은 바위를 놓는 때가 아닙니다",
    "not-your-turn": "내 차례가 아닙니다",
    "choose-stand": "받침대를 고르세요",
    "cannot-pass": "패스할 수 없습니다: 마지막 순서이거나 이미 패스했습니다",
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
  } as Record<UnderEnd, string>,
  /** The stands by name, under each and in the log. */
  stand: { red: "빨강", green: "초록", blue: "파랑" } as Record<Stand, string>,
  /** A chip by name: on its button's tip and in the bar. */
  chip: { red: "빨강", green: "초록", blue: "파랑", rainbow: "레인보우" } as Record<Chip, string>,
  /** The column's heading, with the clock beside it. */
  round: (round: number, rounds: number) => `라운드 ${round}/${rounds}`,
  /**
   * While everyone takes a spot, before round 1: the column's heading, and
   * the lines in the middle of the ring. With eight players or fewer the
   * ring is at its narrowest, and its middle has this many pixels for each:
   * the title 123, the two lines 143 and 149, `kept` 141, and `first` 120
   * with a name of 70. `first` names whoever holds the first-player marker.
   */
  spots: {
    heading: "자리 고르기",
    title: "설 자리를 고르세요",
    lines: ["숫자가 같으면 선부터", "시계 방향으로 놓습니다"],
    kept: "한 번 서면 못 바꿉니다",
    first: (who: string) => `선: ${who}`,
  },
  /** Beside a name in the list: who holds the first-player marker. `_short` where the list is crowded: one letter does for both here. */
  firstMark: (_short: boolean): string => "선",
  /** In the list, beside a name: penalty points. */
  points: (points: number, short: boolean) => (short ? `${points}` : `벌점 ${points}`),
  /** On a player's tile of the round: a pass, and the same in a tile too narrow for the word. */
  tile: { passed: "패스", passedShort: "패" },
  /** Said in the bar for a moment. */
  say: {
    paused: "판이 멈춰 있습니다",
    pickBoth: "카드 1장과 칩 1개를 고르세요",
    pickSpot: "설 자리를 먼저 고르세요",
    stoodForYou: (spot: number) => `시간이 지나 방이 ${spot}번 자리에 세웠습니다`,
    penalty: (points: number) => `받침대가 무너졌습니다: 벌점 ${points}`,
  },
  /** Over the stands while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    spots: (clock: string) => `설 자리를 고르세요 · 한 번 서면 바꿀 수 없습니다 · ${clock}`,
    spotReady: (spot: number, clock: string) =>
      byInput(`${spot}번 자리 · Enter로 섭니다 (서면 바꿀 수 없음) · ${clock}`, `${spot}번 자리 · 서기를 누르면 섭니다 (서면 바꿀 수 없음) · ${clock}`),
    spotTaken: (have: number, of: number, clock: string) => `자리를 잡았습니다 · 다른 사람을 기다리는 중 (${have}/${of}) · ${clock}`,
    watchSpots: (have: number, of: number, clock: string) => `관전 중 · 자리를 고르는 중 (${have}/${of}) · ${clock}`,
    submit: (clock: string) => `바위 카드 1장과 색깔 칩 1개를 몰래 내세요 · ${clock}`,
    ready: (clock: string) => byInput(`Enter로 냅니다 (내면 바꿀 수 없음) · ${clock}`, `내기를 누르면 냅니다 (내면 바꿀 수 없음) · ${clock}`),
    submitted: (have: number, of: number, clock: string) => `냈습니다 · 다른 사람을 기다리는 중 (${have}/${of}) · ${clock}`,
    watchSubmit: (have: number, of: number, clock: string) => `관전 중 · 카드와 칩을 내는 중 (${have}/${of}) · ${clock}`,
    chips: "칩 공개! 곧 카드를 공개합니다",
    myTurn: (stand: string, weight: number, seconds: number) =>
      byInput(`내 차례: ${stand}에 ${weight} · 놓기(Enter) 또는 패스(P) · ${seconds}초`, `내 차례: ${stand}에 ${weight} · 놓기 또는 패스 · ${seconds}초`),
    mineGoing: (stand: string, weight: number) => `내 바위를 놓는 중: ${stand}에 ${weight}`,
    myRainbow: (weight: number, seconds: number) =>
      byInput(`내 차례: 무게 ${weight} · 받침대를 고르세요 (1·2·3 또는 클릭) · ${seconds}초`, `내 차례: 무게 ${weight} · 받침대를 눌러 고르세요 · ${seconds}초`),
    theirTurn: (who: string, seconds: number) => `${who}의 바위를 놓는 중 · ${seconds}초`,
    roundOver: (round: number, seconds: number) => `라운드 ${round} 끝 · 다음 라운드까지 ${seconds}초`,
    lastOver: (seconds: number) => `마지막 라운드 끝 · 결과까지 ${seconds}초`,
  },
  /**
   * To a player in their first game of it, in place of some of `standing`
   * and beside the buttons: what the pieces are for, and what the rock in
   * hand would come to as the stands are now (`points` is the penalty, 0
   * where the stand holds). The three with a clock are the bar's top line,
   * 468 pixels; `place` has 278 beside the buttons and `rainbow` 164.
   */
  coach: {
    submit: (limit: number, clock: string) => `칩의 색이 받침대, 카드의 숫자가 무게 · 합 ${limit} 이상을 만들면 벌점 · ${clock}`,
    ready: (stand: string, total: number, points: number, clock: string) =>
      `지금 그대로면 ${stand} 합 ${total}${points > 0 ? `: 무너져 벌점 ${points}` : ""} · ${byInput("Enter로 냅니다", "내기를 누르면 냅니다")} (못 바꿈) · ${clock}`,
    readyRainbow: (clock: string) => `레인보우: 받침대는 내 차례에 고릅니다 · ${byInput("Enter로 냅니다", "내기를 누르면 냅니다")} (못 바꿈) · ${clock}`,
    place: (stand: string, total: number, points: number, limit: number) =>
      points > 0 ? `놓으면 ${stand} 합 ${total}: 무너져 벌점 ${points}` : `놓으면 ${stand} 합 ${total} · ${limit}부터 무너집니다`,
    rainbow: (limit: number) => `합 ${limit} 이상이면 벌점`,
  },
  /** Under the standing line: what the keys do, by what is asked. */
  keys: {
    spots: byInput("←→: 자리 · Enter: 서기 (눌러도 같음)", "자리를 누른 뒤 서기"),
    submit: byInput("숫자 키: 카드 · ←→: 칩 · Enter: 내기 (버튼도 같음)", "카드와 칩을 하나씩 누르고 내기"),
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
  },
  /** The buttons of the bar. */
  button: { take: keyed("Enter", "서기"), submit: keyed("Enter", "내기"), place: keyed("Enter", "놓기"), pass: keyed("P", "패스"), again: keyed("Enter", "새 판"), lobby: keyed("Esc", "대기실로") },
  log: {
    round: (round: number, first: string) => `라운드 ${round} · 선 ${first}`,
    dealt: "카드와 칩을 다시 받음",
    chips: "칩 공개",
    cards: "카드 공개",
    passed: (who: string) => `${who}: 패스`,
    placed: (who: string, stand: string, weight: number, sum: number) => `${who}: ${stand} +${weight} = ${sum}`,
    cleared: (who: string, stand: string, weight: number, points: number) => `${who}: ${stand} +${weight} 벌점 ${points}`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string, points: number) => `${place}위 ${who} 벌점 ${points}`,
    mine: (points: number) => `내 벌점: ${points}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "무거운 13: 규칙", tone: "title" },
    { text: `모두가 ${n.low}~${n.high}이 적힌 바위 카드 1장과 색깔 칩 1개를 몰래 냅니다 (${Math.round(n.submitSeconds / 60)}분).` },
    { text: "칩의 색은 바위를 올릴 받침대를, 카드의 숫자는 바위의 무게를 정합니다." },
    { text: "" },
    { text: "칩을 먼저, 카드를 그다음에 공개하고, 한 사람씩 순서대로 바위를 올립니다:" },
    { text: "레인보우 칩이 먼저이고, 각각 카드 숫자가 높은 순, 같으면 선부터 시계 방향." },
    { text: "세 명부터는 시작할 때 설 자리를 고릅니다 (못 바꿈): 시계 방향은 그 순서." },
    { text: "레인보우 칩을 냈으면 자기 차례에 받침대를 고릅니다.", tone: "dim" },
    { text: "자기 차례에 라운드마다 한 번 패스할 수 있습니다 (마지막 순서는 바로 놓음)." },
    { text: "패스한 바위는 맨 뒤에 묻지 않고 놓이며, 먼저 패스한 사람이 가장 나중입니다." },
    { text: "" },
    { text: `내 바위로 받침대의 합이 ${n.limit} 이상이 되면, 내 바위만 남기고 모두 걷어 내며` },
    { text: "걷어 낸 개수만큼 벌점을 받습니다. 마지막으로 벌점을 받은 사람이 다음 선." },
    { text: `카드와 칩은 ${n.perSet}라운드에 한 번씩 쓰고, 같은 세트를 다시 받아 ${n.rounds}라운드까지.` },
    { text: "벌점이 가장 적으면 1위. 벌점이 같으면 더 최근에 벌점을 받은 사람이 아래.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Heavy 13: rules",
    brief: {
      goal: "Avoid penalty points: don't take a stand to 13 or more.",
      play: "Secretly play a rock card and a chip, then place or pass.",
      end: "After 14 rounds, the fewest penalty points wins.",
    },
    parts: [
      "Everyone secretly puts in one rock card, numbered 0 to 6, and one color chip. The chip's color says which stand the rock goes on; the card's number is the rock's weight. You have 3 minutes.",
      [
        "The chips are shown first, then the cards, and the rocks are placed one player at a time: those with a rainbow chip first, then the rest. In each group the higher card goes first, and between equal cards it is clockwise from the first player.",
        "With three or more players, everyone picks a spot to stand at as the game starts. A spot once taken cannot be changed, and clockwise is the order of those spots.",
        "With the rainbow chip you choose the stand when your rock is placed.",
        "When your rock comes up you place it or pass, once a round. The last player in the order cannot pass: their rock is placed at once.",
        "A passed rock is placed after all the others, with nothing more asked; if several pass, the first to pass goes last.",
        "If your rock brings a stand to 13 or more, every rock on it but yours is cleared and you take a penalty point for each one cleared.",
        "Whoever last took a penalty in a round is first player in the next.",
      ],
      "Each card and chip is used once in 7 rounds. After round 7 you get the same set again and play to round 14; the stands are not cleared. The fewest penalty points wins; between equal points, whoever took a penalty more recently ranks lower. When all 14 rounds are played, first place is paid 4 Pieces, kept in the room (shared evenly between several in first place, the remainder dropped).",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "spots-not-open": "Spots are not being taken now",
    "spot-held": "You have a spot already, and it cannot be changed",
    "spot-taken": "Someone else took that spot first",
    "not-submitting": "Nothing can be put in now",
    "already-submitted": "You have already put yours in",
    "not-held": "That card or chip is already used",
    "not-placing": "Rocks are not being placed now",
    "not-your-turn": "It is not your turn",
    "choose-stand": "Choose a stand",
    "cannot-pass": "You cannot pass: you are last in the order or have passed",
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
  stand: { red: "Red", green: "Green", blue: "Blue" },
  chip: { red: "Red", green: "Green", blue: "Blue", rainbow: "Rainbow" },
  round: (round, rounds) => `Round ${round}/${rounds}`,
  spots: {
    heading: "Spots",
    title: "Pick your spot",
    lines: ["Ties go clockwise", "from the first player"],
    kept: "A spot taken is kept",
    first: (who) => `First: ${who}`,
  },
  // "1st" beside a name reads as a place in the ranking: the word, where there is room for it
  firstMark: (short) => (short ? "1st" : "first"),
  points: (points, short) => (short ? `${points}` : `${points} pts`),
  tile: { passed: "pass", passedShort: "P" },
  say: {
    paused: "The game is paused",
    pickBoth: "Pick one card and one chip",
    pickSpot: "Pick a spot first",
    stoodForYou: (spot) => `Time was up: the room put you at spot ${spot}`,
    penalty: (points) => `The stand gave way: ${points} penalty points`,
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    spots: (clock) => `Pick a spot to stand at · once taken it cannot be changed · ${clock}`,
    spotReady: (spot, clock) => byInput(`Spot ${spot} · Enter takes it (it cannot be changed) · ${clock}`, `Spot ${spot} · tap Take (it cannot be changed) · ${clock}`),
    spotTaken: (have, of, clock) => `You have your spot · waiting for the others (${have}/${of}) · ${clock}`,
    watchSpots: (have, of, clock) => `Watching · spots being taken (${have}/${of}) · ${clock}`,
    submit: (clock) => `Secretly put in one rock card and one color chip · ${clock}`,
    ready: (clock) => byInput(`Enter puts them in (it cannot be changed) · ${clock}`, `Tap Put in (it cannot be changed) · ${clock}`),
    submitted: (have, of, clock) => `Yours is in · waiting for the others (${have}/${of}) · ${clock}`,
    watchSubmit: (have, of, clock) => `Watching · cards and chips going in (${have}/${of}) · ${clock}`,
    chips: "The chips! The cards are shown next",
    myTurn: (stand, weight, seconds) =>
      byInput(`Your turn: ${weight} on ${stand} · place (Enter) or pass (P) · ${seconds}s`, `Your turn: ${weight} on ${stand} · place or pass · ${seconds}s`),
    mineGoing: (stand, weight) => `Your rock is going on: ${weight} on ${stand}`,
    myRainbow: (weight, seconds) =>
      byInput(`Your turn: weight ${weight} · choose a stand (1, 2, 3 or click) · ${seconds}s`, `Your turn: weight ${weight} · tap a stand to choose it · ${seconds}s`),
    theirTurn: (who, seconds) => `Placing ${who}'s rock · ${seconds}s`,
    roundOver: (round, seconds) => `Round ${round} over · next round in ${seconds}s`,
    lastOver: (seconds) => `Last round over · result in ${seconds}s`,
  },
  coach: {
    submit: (limit, clock) => `Chip = stand, card = weight · reaching ${limit} on a stand: penalty · ${clock}`,
    ready: (stand, total, points, clock) =>
      `As it stands: ${stand} makes ${total}${points > 0 ? `, ${points} penalty` : ""} · ${byInput("Enter to put in", "tap Put in")} (final) · ${clock}`,
    readyRainbow: (clock) => `Rainbow: you pick its stand on your turn · ${byInput("Enter to put in", "tap Put in")} (final) · ${clock}`,
    place: (stand, total, points, limit) => (points > 0 ? `Placing makes ${stand} ${total}: ${points} penalty` : `Placing makes ${stand} ${total} · it falls at ${limit}`),
    rainbow: (limit) => `${limit} or more: penalty`,
  },
  keys: {
    spots: byInput("←→: spot · Enter: take it (or click)", "Tap a spot, then Take"),
    submit: byInput("Digits: card · ←→: chip · Enter: put in (or the buttons)", "Tap a card and a chip, then Put in"),
    idle: "H: rules · M: mute · T: chat",
  },
  button: { take: keyed("Enter", "take"), submit: keyed("Enter", "put in"), place: keyed("Enter", "place"), pass: keyed("P", "pass"), again: keyed("Enter", "again"), lobby: keyed("Esc", "to room") },
  log: {
    round: (round, first) => `Round ${round} · first: ${first}`,
    dealt: "A fresh set is dealt",
    chips: "The chips are shown",
    cards: "The cards are shown",
    passed: (who) => `${who}: pass`,
    placed: (who, stand, weight, sum) => `${who}: ${stand} +${weight} = ${sum}`,
    cleared: (who, stand, weight, points) => `${who}: ${stand} +${weight}, ${points} pts`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who, points) => `${englishOrdinal(place)} ${who} ${points} pts`,
    mine: (points) => `Your penalty points: ${points}`,
    hostNext: "Play again with these players or go back",
    waitHost: "Waiting for the host · \"Again\" to join in",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Heavy 13: rules", tone: "title" },
    { text: `Everyone secretly puts in a rock card (${n.low} to ${n.high}) and a color chip.` },
    { text: "The chip says which stand; the card's number is the rock's weight." },
    { text: `You have ${Math.round(n.submitSeconds / 60)} minutes.`, tone: "dim" },
    { text: "Chips are shown first, then cards. Rocks go on one at a time:" },
    { text: "rainbow chips first; in each group higher cards, ties clockwise." },
    { text: "With 3 or more, spots are picked first and kept: that is clockwise." },
    { text: "With the rainbow chip you choose the stand on your turn.", tone: "dim" },
    { text: "On your turn you may pass once a round, unless you are last:" },
    { text: "a passed rock goes on after the others, the first to pass last." },
    { text: `If your rock brings a stand to ${n.limit} or more, every rock but yours is` },
    { text: "cleared and you take a penalty point for each one cleared." },
    { text: "The last to take a penalty is first player next round.", tone: "dim" },
    { text: `Cards and chips last ${n.perSet} rounds, then are dealt again: ${n.rounds} rounds.` },
    { text: "Fewest penalty points wins; a more recent penalty ranks lower.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 무거운 13 (Heavy 13), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

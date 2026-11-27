/**
 * The words of 비밀 코드 (Secret Code), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says, the conditions of a round among it.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English name and terms are the ones the English captions of the show's
 * release give: "Secret Code", "code", "suit", "color", "buzzer" (episode 7;
 * design/games/secret-code.md). The Korean captions of that episode were
 * not read: 색, 모양, 버저 are plain words. A condition is sent as what it
 * holds and written here, shorter than the show's sentence so that it fits
 * the screen.
 */
import type { CodeEnd, Condition, How, NobodyWhy } from "../../../shared/games/secret-code/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** Seconds a round lasts. */
  roundSeconds: number;
}

/** A line of the bar with the clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const koBound = (how: How, value: number): string => (how === "is" ? `${value}` : how === "most" ? `${value} 이하` : `${value} 이상`);
const koNth = ["가장 작은 수", "두 번째로 작은 수", "세 번째로 작은 수", "가장 큰 수"];
const koRank = (rank: number, kinds: number): string => (rank === 1 ? "가장 많은" : rank === kinds ? "가장 적은" : rank === 2 ? "두 번째로 많은" : "세 번째로 많은");

const enBound = (how: How, value: number): string => (how === "is" ? `${value}` : how === "most" ? `at most ${value}` : `at least ${value}`);
const enOrd = ["first", "second", "third", "fourth"];
const enNth = ["lowest", "second-lowest", "third-lowest", "highest"];
const enRank = (rank: number, kinds: number): string => (rank === 1 ? "most common" : rank === kinds ? "least common" : rank === 2 ? "second most common" : "third most common");

const ko = {
  sheet: {
    title: "비밀 코드: 규칙",
    brief: {
      goal: "조건을 모두 만족하는 카드 네 장의 코드를 먼저 찾으면 통과.",
      play: "A부터 Z까지 카드 26장에는 수와 색, 모양이 있습니다. 조건에 맞는 코드는 하나뿐입니다.",
      end: "맞히면 그 자리에서 통과, 틀리면 그 라운드는 더 답할 수 없습니다. 끝까지 못 맞히면 꼴찌.",
    },
    parts: [
      "두 명에서 여섯 명이 합니다. 카드는 A부터 Z까지 26장이고, 카드마다 수 하나와 색, 모양이 있습니다. 수는 알파벳 순서입니다 (A는 1, Z는 26). 색과 모양은 네 가지씩이고, 판마다 새로 정해집니다.",
      [
        "라운드마다 조건이 네 개에서 여섯 개 나옵니다. 조건을 모두 만족하는 카드 네 장이 그 라운드의 코드이고, 그런 코드는 하나뿐입니다.",
        "코드는 알파벳 순서로 놓습니다. 「두 번째 카드」는 네 장 가운데 알파벳이 두 번째로 빠른 카드이고, 수도 두 번째로 작습니다.",
        "네 장을 고르고 버저를 누르면 답이 됩니다. 맞히면 그 자리에서 통과하고 남은 라운드에서 빠집니다.",
        "틀리면 그 라운드에서는 더 답할 수 없습니다. 틀린 답은 모두에게 보입니다.",
        "한 사람이 맞히면 그 라운드는 끝나고 코드가 공개됩니다.",
      ],
      "조건은 방송에 나온 종류입니다: 네 수의 합, 색이나 모양이 몇 가지인지, 두 카드의 수의 차나 곱, 가장 큰 수와 가장 작은 수의 합, 그리고 어느 카드의 색(모양)이 26장 가운데 몇 번째로 많은 색(모양)인지.",
      [
        "방송에서는 네 사람이 3라운드를 했고, 끝까지 못 맞힌 한 사람이 탈락했습니다. 이 사이트에서는 맞힌 순서대로 순위가 정해지고, 못 맞힌 사람은 그 다음 순위를 함께 받습니다.",
        "라운드는 3번이고, 다섯 명 이상이면 사람 수보다 하나 적게 합니다. 아직 못 맞힌 사람이 한 명만 남으면 판이 끝납니다.",
        "한 라운드는 4분입니다. 시간이 다 되거나 남은 사람이 모두 틀리면 아무도 통과하지 못한 채 코드가 공개됩니다. 방송에는 제한 시간이 나오지 않습니다.",
        "방송에서는 버저를 누른 뒤 10초 안에 답했습니다. 여기서는 네 장을 먼저 고르고 버저를 누릅니다.",
        "어느 카드가 무슨 색과 모양이었는지는 방송 화면에만 있어, 카드와 조건은 판마다 새로 만듭니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, or the screen did before asking, for the bar. */
  refused: {
    "bad-code": "카드 네 장을 골라야 합니다",
    full: "네 장까지 고를 수 있습니다. 고른 카드를 다시 누르면 빠집니다",
    locked: "이번 라운드에는 이미 틀렸습니다",
    "already-passed": "이미 통과했습니다",
    "not-now": "지금은 답할 수 없습니다",
    "not-playing": "이 판의 플레이어가 아닙니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "too-many": "여섯 명까지 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** A condition, as a line of the list. `kinds` is how many colours or suits there are. */
  condition: (c: Condition, kinds: number): string => {
    switch (c.kind) {
      case "sum":
        return `네 수의 합은 ${koBound(c.how, c.value)}`;
      case "colors":
        return `네 카드의 색은 ${c.count}가지`;
      case "suits":
        return `네 카드의 모양은 ${c.count}가지`;
      case "difference":
        return `${c.first}번째와 ${c.second}번째 카드의 수의 차는 ${c.value}`;
      case "product":
        return `${c.first}번째와 ${c.second}번째 카드의 수의 곱은 ${koBound(c.how, c.value)}`;
      case "ends":
        return `가장 큰 수와 가장 작은 수의 합은 ${koBound(c.how, c.value)}`;
      case "common":
        return `${koNth[c.nth - 1]} 카드의 ${c.of === "color" ? "색" : "모양"}은 A~Z에서 ${koRank(c.rank, kinds)} ${c.of === "color" ? "색" : "모양"}`;
    }
  },
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "순위가 정해져 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<CodeEnd, string>,
  /** The column's heading, with the round after it. */
  heading: (round: number, rounds: number) => `비밀 코드 ${round}/${rounds}`,
  /** In the list, beside a player: how they stand. */
  status: {
    safe: (place: number) => `통과 · ${place}위`,
    wrong: "오답",
    failed: "실패",
    left: "나감",
  },
  /** Said in the bar for a moment. */
  say: {
    passedOther: (who: string, code: string) => `${who}: ${code} 정답, 통과`,
    wrongMine: (code: string) => `${code}: 틀렸습니다. 이번 라운드는 더 답할 수 없습니다`,
    wrongOther: (who: string, code: string) => `${who}: ${code} 오답`,
    leftOther: (who: string) => `${who}: 나갔습니다`,
  },
  /** Over the cards while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    play: (code: string, clock: string) => timed(`조건에 모두 맞는 카드 네 장을 고르고 버저 · ${code}`, clock),
    locked: (clock: string) => timed("이번 라운드는 틀렸습니다 · 다음 라운드를 기다리는 중", clock),
    safe: (place: number, clock: string) => timed(`${place}번째로 통과했습니다 · 남은 라운드를 지켜보는 중`, clock),
    watching: (clock: string) => timed("모두가 같은 조건의 코드를 찾는 중", clock),
    shown: (code: string, who: string | null, why: NobodyWhy | null) =>
      who !== null ? `정답 ${code} · ${who} 통과` : why === "time" ? `정답 ${code} · 시간이 다 되어 통과한 사람 없음` : `정답 ${code} · 모두 틀려 통과한 사람 없음`,
  },
  /** Under the standing line, left of the buzzer: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    play: "방향키 · Space: 고르기 · Enter: 버저",
  },
  /** The buttons of the bar. */
  button: {
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    buzz: keyed("Enter", "버저"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number) => `${round}라운드`,
    passed: (who: string, code: string, place: number) => `${who}: ${code} 정답 · ${place}위`,
    wrong: (who: string, code: string) => `${who}: ${code} 오답`,
    nobody: (code: string, why: NobodyWhy) => (why === "time" ? `시간 끝 · 정답 ${code}` : `모두 오답 · 정답 ${code}`),
    left: (who: string) => `${who}: 나감`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    passed: "통과",
    failed: "실패",
    over: "종료",
    place: (place: number, round: number) => `${place}위 · ${round}라운드에 통과`,
    notPassed: (misses: number) => `맞히지 못함 · 오답 ${misses}번`,
    first: (who: string) => `1위 ${who}`,
    nobody: "통과한 사람 없음",
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
    sending: "보내는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "비밀 코드: 규칙", tone: "title" },
    { text: "카드 26장(A~Z)에는 수와 색, 모양이 있습니다. 수는 A=1 … Z=26." },
    { text: "조건을 모두 만족하는 카드 네 장을 찾습니다. 답은 하나뿐.", tone: "mark" },
    { text: "「2번째 카드」는 네 장 가운데 알파벳이 두 번째로 빠른 카드입니다." },
    { text: "「A~Z에서 가장 많은 색」은 26장 가운데 가장 많은 카드의 색입니다." },
    { text: "" },
    { text: "네 장을 고르고 버저. 맞히면 그 자리에서 통과합니다.", tone: "mark" },
    { text: "틀리면 그 라운드는 더 답할 수 없고, 틀린 답은 모두에게 보입니다." },
    { text: "한 사람이 맞히면 라운드가 끝나고 코드가 공개됩니다." },
    { text: `한 라운드 ${koTime(n.roundSeconds)}. 시간이 다 되면 아무도 통과하지 못합니다.` },
    { text: "맞힌 순서대로 순위. 못 맞힌 사람이 한 명만 남으면 끝.", tone: "dim" },
    { text: "" },
    { text: byInput("카드를 눌러 고르고, 다시 누르면 빠집니다", "카드를 눌러 고르고, 다시 누르면 빠집니다") },
    { text: byInput("방향키 · Space: 고르기 · Backspace: 빼기 · Enter: 버저", "버저는 화면 오른쪽 아래에 있습니다") },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Secret Code: rules",
    brief: {
      goal: "Be the first to find the code of four cards that meets every condition.",
      play: "The 26 cards, A to Z, each have a number, a color and a suit. Exactly one code meets the conditions.",
      end: "A right answer makes you safe at once; a wrong one locks you out of the round. Never right means last.",
    },
    parts: [
      "For two to six players. There are 26 cards, A to Z, each with a number, a color and a suit. The numbers follow the alphabet (A is 1, Z is 26). There are four colors and four suits, dealt anew every game.",
      [
        "Each round shows four to six conditions. The four cards that meet all of them are the round's code, and there is only one such code.",
        "A code is laid out in alphabetical order. \"The second card\" is the one of the four that comes second in the alphabet, which also has the second-lowest number.",
        "Pick four cards and press the buzzer to answer. A right answer makes you safe at once and takes you out of the remaining rounds.",
        "A wrong answer locks you out of that round. Everyone sees the answer that was wrong.",
        "When someone is right the round ends and the code is shown.",
      ],
      "The conditions are of the kinds the show had: the sum of the four numbers, how many different colors or suits, the difference or product of two of the numbers, the sum of the largest and smallest, and that a card's color (or suit) is the most common, second most common and so on among all 26.",
      [
        "In the show four players had three rounds, and the one who never answered right was eliminated. On this site players are ranked in the order they answer right, and those who never do share the place after them.",
        "There are 3 rounds, or one fewer than the players when there are five or six. The game ends as soon as only one player has yet to be right.",
        "A round lasts 4 minutes. When time is up, or everyone still in has been wrong, the code is shown with nobody safe. The show gives no time limit.",
        "In the show you pressed the buzzer and then had 10 seconds to answer. Here you pick the four cards first, then press the buzzer.",
        "Which card had which color and suit was only on the show's screen, so the cards and the conditions are made anew every game.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-code": "Pick four cards first",
    full: "Four cards at most. Press a picked card again to drop it",
    locked: "You were wrong in this round already",
    "already-passed": "You are safe already",
    "not-now": "No answer can be given now",
    "not-playing": "You are not a player of this game",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "too-many": "It takes six players at most",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  condition: (c, kinds) => {
    switch (c.kind) {
      case "sum":
        return `The four numbers add up to ${enBound(c.how, c.value)}`;
      case "colors":
        return c.count === 1 ? "The four cards are all of one color" : `The four cards are of ${c.count} different colors`;
      case "suits":
        return c.count === 1 ? "The four cards are all of one suit" : `The four cards are of ${c.count} different suits`;
      case "difference":
        return `The ${enOrd[c.first - 1]} and ${enOrd[c.second - 1]} numbers are ${c.value} apart`;
      case "product":
        return `${enOrd[c.first - 1][0].toUpperCase()}${enOrd[c.first - 1].slice(1)} number × ${enOrd[c.second - 1]} number: ${enBound(c.how, c.value)}`;
      case "ends":
        return `Largest and smallest add up to ${enBound(c.how, c.value)}`;
      case "common":
        return `The card with the ${enNth[c.nth - 1]} number has the ${enRank(c.rank, kinds)} ${c.of} of A–Z`;
    }
  },
  ended: {
    played: "Places decided",
    left: "Too few players left",
    abandoned: "Nobody left to play on",
  },
  heading: (round, rounds) => `Secret Code ${round}/${rounds}`,
  status: {
    safe: (place) => `safe · no. ${place}`,
    wrong: "wrong",
    failed: "failed",
    left: "left",
  },
  say: {
    passedOther: (who, code) => `${who}: ${code} is right, safe`,
    wrongMine: (code) => `${code} is wrong. You are out of this round`,
    wrongOther: (who, code) => `${who}: ${code} is wrong`,
    leftOther: (who) => `${who} left`,
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    play: (code, clock) => timed(`Pick four cards that meet every condition · ${code}`, clock),
    locked: (clock) => timed("You were wrong this round · waiting for the next", clock),
    safe: (place, clock) => timed(`You are safe, no. ${place} · watching the rounds left`, clock),
    watching: (clock) => timed("Everyone is looking for the code that meets the conditions", clock),
    shown: (code, who, why) => (who !== null ? `The code was ${code} · ${who} is safe` : why === "time" ? `The code was ${code} · time is up, nobody is safe` : `The code was ${code} · all wrong, nobody is safe`),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    play: "Arrows · Space: pick · Enter: buzzer",
  },
  button: {
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
    buzz: keyed("Enter", "Buzzer"),
  },
  log: {
    round: (round) => `Round ${round}`,
    passed: (who, code, place) => `${who}: ${code} right · no. ${place}`,
    wrong: (who, code) => `${who}: ${code} wrong`,
    nobody: (code, why) => (why === "time" ? `Time up · it was ${code}` : `All wrong · it was ${code}`),
    left: (who) => `${who}: left`,
  },
  result: {
    passed: "SAFE",
    failed: "FAIL",
    over: "OVER",
    place: (place, round) => `No. ${place} · right in round ${round}`,
    notPassed: (misses) => `Never right · wrong ${misses} ${misses === 1 ? "time" : "times"}`,
    first: (who) => `First: ${who}`,
    nobody: "Nobody was right",
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
    sending: "Sending",
  },
  help: (n) => [
    { text: "Secret Code: rules", tone: "title" },
    { text: "26 cards, A to Z: a number (A=1 … Z=26), a color and a suit." },
    { text: "Find the four cards that meet every condition: one code only.", tone: "mark" },
    { text: "\"The second number\" is that of the second card in the alphabet." },
    { text: "\"Most common color of A–Z\": the color most of the 26 cards have." },
    { text: "" },
    { text: "Pick four cards and buzz. Right: you are safe at once.", tone: "mark" },
    { text: "Wrong: you are out of that round, and all see your answer." },
    { text: "When someone is right the round ends and the code is shown." },
    { text: `A round lasts ${enTime(n.roundSeconds)}. When time is up, nobody is safe.` },
    { text: "Ranked in the order you are right. It ends when one is left.", tone: "dim" },
    { text: "" },
    { text: byInput("Click a card to pick it, and again to drop it", "Press a card to pick it, and again to drop it") },
    { text: byInput("Arrows · Space: pick · Backspace: drop · Enter: buzzer", "The buzzer is at the bottom right") },
    { text: "" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Press anywhere to close"), tone: "title" },
  ],
};

/** The words of the screen, in the page's language. */
export const WORDS = words({ ko, en });

/** The rules of the game as the page shows them, in each language: for the pages a search engine reads. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

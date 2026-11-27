/**
 * The words of 울타리 치기 (Loop Fence Puzzle), in each language (`lang.ts`):
 * its rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English name and terms are the ones the English captions of the show's
 * release give: "Loop Fence Puzzle", "fence", "dots", "lines", "closed
 * loop", "buzzer" (episode 8; design/games/loop-fence.md). The Korean ones
 * are the show's: 울타리, 점, 선, 버저.
 */
import type { FenceFault } from "../../../shared/games/loop-fence/fence";
import type { FenceEnd } from "../../../shared/games/loop-fence/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** Seconds the players have. */
  seconds: number;
  /** Seconds the buzzer is locked after a wrong fence. */
  lockSeconds: number;
}

/** A line of the bar with the clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "울타리 치기: 규칙",
    brief: {
      goal: "점을 이어 숫자에 맞는 울타리 하나를 먼저 완성하면 승리.",
      play: "칸의 숫자는 그 칸을 둘러싼 선의 수이고, 모든 선은 하나의 닫힌 고리여야 합니다.",
      end: "다 그리면 버저. 맞으면 통과. 한 사람만 남거나 20분이 지나면 끝납니다.",
    },
    parts: [
      "두 명에서 여섯 명이 같은 문제를 각자 자기 판에서 풉니다. 판은 가로 7칸, 세로 7칸이고 칸마다 네 귀퉁이에 점이 있습니다. 일부 칸에는 0부터 3까지의 숫자가 적혀 있습니다.",
      [
        "옆에 있는 점과 점을 가로나 세로로 이어 울타리를 만듭니다.",
        "칸의 숫자는 그 칸을 둘러싼 네 변 가운데 선이 지나는 변의 수입니다. 숫자가 없는 칸은 몇 개든 됩니다.",
        "모든 선은 이어져 하나의 닫힌 고리가 되어야 합니다. 울타리가 둘 이상이면 안 되고, 선이 갈라지거나 서로 지나가도 안 됩니다.",
        "모든 점을 쓸 필요는 없지만 모든 숫자는 맞아야 합니다.",
        "다 그렸으면 버저를 눌러 확인받습니다. 맞으면 통과합니다.",
      ],
      "방송에서는 유배지의 네 사람이 같은 문제를 동시에 풀었고, 끝까지 완성하지 못한 한 사람이 탈락했습니다. 이 사이트에서는 먼저 통과한 순서대로 순위가 정해집니다. 판의 크기와 제한 시간, 틀렸을 때 어떻게 되는지는 방송에 나오지 않아 채웠습니다.",
      [
        "아직 풀고 있는 사람이 한 명만 남으면 판이 끝납니다 (두 명이면 한 사람이 통과하는 순간). 20분이 지나도 끝나며, 통과하지 못한 사람은 통과한 사람 다음 순위를 함께 받습니다.",
        "틀린 울타리로 버저를 누르면 15초 동안 버저를 다시 누를 수 없습니다. 고리가 아닌지, 숫자가 안 맞는지만 알려 줍니다.",
        "선을 한 번 더 누르면 ×가 됩니다. 선이 없다고 적어 두는 내 표시이고, 확인할 때는 보지 않습니다.",
        "다른 사람의 판은 보이지 않습니다. 그린 선의 수와 틀린 횟수만 보이고, 판이 끝나면 정답이 나옵니다.",
        "문제는 마흔여덟 개 가운데 하나가 무작위로 나옵니다. 문제마다 답은 하나뿐입니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, or the screen did before asking, for the bar. */
  refused: {
    "bad-side": "그곳에는 그릴 수 없습니다",
    "no-change": "바뀐 것이 없습니다",
    locked: "버저는 잠시 뒤에 다시 누를 수 있습니다",
    empty: "먼저 울타리를 그리세요",
    "already-passed": "이미 통과했습니다",
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
  /** What was wrong with the fence the buzzer was pressed with. */
  fault: {
    "not-loop": "틀렸습니다: 하나로 이어진 닫힌 고리가 아닙니다",
    "wrong-count": "틀렸습니다: 숫자와 선의 수가 다른 칸이 있습니다",
  } as Record<FenceFault, string>,
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "순위가 정해져 끝",
    time: "시간이 다 되어 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<FenceEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: "울타리 치기",
  /** In the list, beside a player: how far they are. */
  status: {
    at: (lines: number, wrong: number) => (wrong > 0 ? `선 ${lines} · 오답 ${wrong}` : `선 ${lines}`),
    passed: (time: string) => `통과 ${time}`,
    failed: "실패",
    left: "나감",
  },
  /** Left of the board: 98 pixels. */
  side: {
    lines: (lines: number) => `선 ${lines}개`,
    wrong: (wrong: number) => `오답 ${wrong}번`,
    each: byInput("누를 때마다", "누를 때마다"),
    cycle: "선 → × → 지움",
    answer: "정답",
  },
  /** Said in the bar for a moment. */
  say: {
    passedOther: (who: string, place: number) => `${who}: ${place}번째로 통과`,
    wrongOther: (who: string) => `${who}: 버저를 눌렀지만 틀렸습니다`,
    leftOther: (who: string) => `${who}: 나갔습니다`,
    clearAgain: "한 번 더 누르면 모두 지웁니다",
  },
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    play: (clock: string) => timed("점을 이어 울타리 하나를 만드세요 · 다 되면 버저", clock),
    locked: (seconds: number, clock: string) => timed(`버저는 ${seconds}초 뒤에 다시 누를 수 있습니다`, clock),
    passed: (place: number, clock: string) => timed(`${place}번째로 통과했습니다 · 다른 사람을 기다리는 중`, clock),
    watching: (clock: string) => timed("모두가 같은 문제의 울타리를 그리는 중", clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    play: "방향키: 점 이동 · Shift+방향키: 그리기 · Enter: 버저 · Backspace: 모두 지우기",
  },
  /** The buttons of the bar and beside the board. */
  button: {
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    buzz: keyed("Enter", "버저"),
    locked: (seconds: number) => `버저 · ${seconds}초`,
    clear: "모두 지우기",
    clearAgain: "한 번 더: 지우기",
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    passed: (who: string, place: number, time: string) => `${who}: 통과 · ${place}위 · ${time}`,
    wrong: (who: string) => `${who}: 오답`,
    left: (who: string) => `${who}: 나감`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    passed: "통과",
    failed: "실패",
    over: "종료",
    place: (place: number, time: string) => `${place}위 · ${time}에 통과`,
    notPassed: (lines: number, wrong: number) => `선 ${lines}개 · 오답 ${wrong}번`,
    first: (who: string) => `1위 ${who}`,
    nobody: "통과한 사람 없음",
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
    sending: "보내는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "울타리 치기: 규칙", tone: "title" },
    { text: "옆에 있는 점과 점을 이어 울타리 하나를 만듭니다." },
    { text: "칸의 숫자 = 그 칸을 둘러싼 선의 수 (0~3).", tone: "mark" },
    { text: "숫자가 없는 칸은 선이 몇 개든 됩니다." },
    { text: "모든 선은 하나의 닫힌 고리. 갈라지거나 둘로 나뉘면 안 됩니다.", tone: "mark" },
    { text: "" },
    { text: `다 그리면 버저. 맞으면 통과, 틀리면 ${n.lockSeconds}초 동안 버저가 잠깁니다.` },
    { text: `제한 시간 ${koTime(n.seconds)}. 한 사람만 남거나 시간이 다 되면 끝납니다.` },
    { text: "먼저 통과한 순서대로 순위가 정해집니다." },
    { text: "×는 선이 없다는 내 표시일 뿐, 확인할 때는 보지 않습니다.", tone: "dim" },
    { text: "다른 사람은 그린 선의 수와 틀린 횟수만 보입니다.", tone: "dim" },
    { text: "" },
    { text: "점 사이를 누를 때마다 선 → × → 지움 · 끌면 이어서 그립니다" },
    { text: byInput("방향키: 점 이동 · Shift+방향키: 그리기 · Enter: 버저", "버저와 모두 지우기는 판 왼쪽에 있습니다") },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Loop Fence Puzzle: rules",
    brief: {
      goal: "Be the first to join the dots into the one fence that fits the numbers.",
      play: "A number says how many lines run round its square, and all the lines must form one closed loop.",
      end: "Press the buzzer when it is done. A right fence passes. It ends when one player is left, or after 20 minutes.",
    },
    parts: [
      "For two to six players, each solving the same puzzle on a board of their own. The board is 7 squares by 7, with a dot at every corner of every square. Some squares hold a number from 0 to 3.",
      [
        "Join dots that are next to each other, across or down, to make a fence.",
        "A number says how many of the four sides of its square have a line. A square with no number may have any.",
        "All the lines must join into one closed loop. More than one fence is not allowed, and the lines may not branch or cross.",
        "Not every dot has to be used, but every number has to be met.",
        "When you are done, press the buzzer to have it checked. A right fence passes.",
      ],
      "In the show the four players in the place of exile solved one puzzle at the same time, and the one who never finished was eliminated. On this site players are ranked in the order they pass. The show does not say how large the board was, how long there was, or what a wrong answer cost: those are filled in here.",
      [
        "The game ends when only one player is still working (with two players, the moment one passes). It also ends after 20 minutes; those who have not passed share the place after those who have.",
        "Pressing the buzzer with a wrong fence locks your buzzer for 15 seconds. You are told only whether it is not a loop or a number is not met.",
        "Pressing a line once more makes it a ×: your own note that no line goes there. It is not checked.",
        "You do not see anyone else's board, only how many lines they have drawn and how often they were wrong. The answer is shown when the game is over.",
        "The puzzle is drawn at random from forty-eight. Each has exactly one answer.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-side": "Nothing can be drawn there",
    "no-change": "Nothing changed",
    locked: "The buzzer is locked for a moment",
    empty: "Draw a fence first",
    "already-passed": "You have passed already",
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
  fault: {
    "not-loop": "Wrong: the lines are not one closed loop",
    "wrong-count": "Wrong: a square does not have the lines its number says",
  },
  ended: {
    played: "Places decided",
    time: "Time is up",
    left: "Too few players left",
    abandoned: "Nobody left to play on",
  },
  heading: "Loop Fence Puzzle",
  status: {
    at: (lines, wrong) => (wrong > 0 ? `lines ${lines} · ×${wrong}` : `lines ${lines}`),
    passed: (time) => `passed ${time}`,
    failed: "failed",
    left: "left",
  },
  side: {
    lines: (lines) => `Lines: ${lines}`,
    wrong: (wrong) => `Wrong: ${wrong}`,
    each: byInput("Each click:", "Each press:"),
    cycle: "line → × → off",
    answer: "Answer",
  },
  say: {
    passedOther: (who, place) => `${who} passed, no. ${place}`,
    wrongOther: (who) => `${who} pressed the buzzer: wrong`,
    leftOther: (who) => `${who} left`,
    clearAgain: "Press once more to clear everything",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    play: (clock) => timed("Join the dots into one fence · press the buzzer when done", clock),
    locked: (seconds, clock) => timed(`The buzzer can be pressed again in ${seconds} s`, clock),
    passed: (place, clock) => timed(`You passed, no. ${place} · waiting for the others`, clock),
    watching: (clock) => timed("Everyone is drawing the fence of the same puzzle", clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    play: "Arrows: move · Shift+arrows: draw · Enter: buzzer · Backspace: clear",
  },
  button: {
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
    buzz: keyed("Enter", "Buzzer"),
    locked: (seconds) => `Buzzer · ${seconds} s`,
    clear: "Clear all",
    clearAgain: "Again: clear",
  },
  log: {
    passed: (who, place, time) => `${who}: passed · no. ${place} · ${time}`,
    wrong: (who) => `${who}: wrong`,
    left: (who) => `${who}: left`,
  },
  result: {
    passed: "PASS",
    failed: "FAIL",
    over: "OVER",
    place: (place, time) => `No. ${place} · passed in ${time}`,
    notPassed: (lines, wrong) => `Lines ${lines} · wrong ${wrong}`,
    first: (who) => `First: ${who}`,
    nobody: "Nobody passed",
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
    sending: "Sending",
  },
  help: (n) => [
    { text: "Loop Fence Puzzle: rules", tone: "title" },
    { text: "Join dots next to each other to make one fence." },
    { text: "A number: how many lines run round its square (0 to 3).", tone: "mark" },
    { text: "A square with no number may have any." },
    { text: "All lines form one closed loop: no branch, no second loop.", tone: "mark" },
    { text: "" },
    { text: `Buzz when done. Right: you pass. Wrong: no buzzer for ${n.lockSeconds} s.` },
    { text: `Time limit ${enTime(n.seconds)}. It ends when one is left or time is up.` },
    { text: "Players are ranked in the order they pass." },
    { text: "A × is your own note for \"no line here\". It is not checked.", tone: "dim" },
    { text: "Of the others you see only lines drawn and wrong answers.", tone: "dim" },
    { text: "" },
    { text: "Press between two dots: line → × → off · drag to go on" },
    { text: byInput("Arrows: move · Shift+arrows: draw · Enter: buzzer", "The buzzer and Clear all are left of the board") },
    { text: "" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Press anywhere to close"), tone: "title" },
  ],
};

/** The words of the screen, in the page's language. */
export const WORDS = words({ ko, en });

/** The rules of the game as the page shows them, in each language: for the pages a search engine reads. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

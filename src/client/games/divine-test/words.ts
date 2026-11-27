/**
 * The words of 신의 시험 (The Divine Test), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English name is the one the English captions of the show's release give
 * the test ("the divine test"); "magic square", "tile", "row", "column" and
 * "diagonal" are the plain words (design/games/divine-test.md). The Korean
 * ones are the wiki's: 마방진, 숫자 타일, 게임판, 통과.
 */
import type { DivineEnd } from "../../../shared/games/divine-test/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many squares the board is across and down. */
  size: number;
  /** Seconds the players have. */
  seconds: number;
}

/** A line of the bar with the clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "신의 시험: 규칙",
    brief: {
      goal: "1부터 49까지의 타일로 7×7 마방진을 먼저 완성하면 승리.",
      play: "가로, 세로, 대각선의 합이 모두 175가 되도록 타일을 판에 놓습니다.",
      end: "올바르게 다 놓는 순간 통과. 한 사람만 남거나 30분이 지나면 끝납니다.",
    },
    parts: [
      "두 명에서 여섯 명이 각자 자기 판에서 합니다. 판은 가로 7칸, 세로 7칸이고, 1부터 49까지의 숫자 타일이 하나씩 있습니다. 1은 맨 윗줄 가운데 칸에 놓여 있고 옮길 수 없습니다.",
      [
        "나머지 타일 48개를 판에 모두 놓아, 가로 7줄과 세로 7줄, 대각선 2줄의 합이 모두 같게 (175) 만듭니다.",
        "올바르게 다 놓는 순간 통과합니다. 제출하는 버튼은 없습니다.",
        "놓은 타일은 몇 번이든 옮기거나 뺄 수 있습니다. 타일이 있는 칸에 다른 타일을 옮기면 둘이 자리를 바꿉니다.",
        "답은 하나가 아닙니다. 줄의 합이 모두 맞으면 어떤 배치든 통과합니다.",
      ],
      "방송에서는 유배지에서 한 사람이 1시간 안에 푸는 시험이었고, 통과하지 못하면 탈락이었습니다. 이 사이트에서는 한 방의 모두가 같은 30분 동안 각자 풀고, 먼저 통과한 순서대로 순위가 정해집니다.",
      [
        "아직 풀고 있는 사람이 한 명만 남으면 판이 끝납니다 (두 명이면 한 사람이 통과하는 순간). 30분이 지나도 끝나며, 통과하지 못한 사람은 통과한 사람 다음 순위를 함께 받습니다.",
        "다른 사람의 판은 보이지 않습니다. 놓은 타일의 수와 합이 맞은 줄의 수만 보입니다.",
        "판 옆과 아래에 각 줄의 합이 나옵니다. 방송의 판에는 없던 도움입니다.",
        "타일의 숫자는 방송의 유배지 글자 대신 보통 숫자로 적었습니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, or the screen did before asking, for the bar. */
  refused: {
    "bad-tile": "놓을 수 없는 타일입니다 (2부터 49까지)",
    "bad-cell": "그 칸에는 놓을 수 없습니다",
    "empty-cell": "그 칸에는 타일이 없습니다",
    "no-change": "그 타일은 이미 그 칸에 있습니다",
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
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "순위가 정해져 끝",
    time: "시간이 다 되어 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<DivineEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: "신의 시험",
  /** In the list, beside a player: how far they are. */
  status: {
    at: (placed: number, all: number, lines: number, of: number) => `${placed}/${all} · ${lines}/${of}줄`,
    passed: (time: string) => `통과 ${time}`,
    failed: "실패",
    left: "나감",
  },
  /** Left of the board, under the tiles: 88 pixels. */
  side: {
    placed: (placed: number, all: number) => `타일 ${placed}/${all}`,
    lines: (lines: number, of: number) => `맞은 줄 ${lines}/${of}`,
  },
  /** Said in the bar for a moment. */
  say: {
    passedOther: (who: string, place: number) => `${who}: ${place}번째로 통과`,
    leftOther: (who: string) => `${who}: 나갔습니다`,
  },
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    play: (magic: number, clock: string) => timed(byInput(`타일을 골라 판에 놓으세요 · 모든 줄의 합이 ${magic}`, `타일을 누르고 칸을 누르세요 · 모든 줄의 합이 ${magic}`), clock),
    held: (tile: number, clock: string) => timed(`${tile}: 놓을 칸을 고르세요`, clock),
    typed: (typed: string, clock: string) => timed(`${typed}_ · Enter로 놓기`, clock),
    full: (wrong: number, clock: string) => timed(`다 놓았지만 합이 맞지 않는 줄이 ${wrong}개 있습니다`, clock),
    passed: (place: number, clock: string) => timed(`${place}번째로 통과했습니다 · 다른 사람을 기다리는 중`, clock),
    watching: (magic: number, clock: string) => timed(`모두가 자기 판에 마방진을 만드는 중 · 모든 줄의 합이 ${magic}`, clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    play: "방향키 · 숫자+Enter: 놓기 · Backspace: 빼기",
  },
  /** The buttons of the bar. */
  button: {
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    passed: (who: string, place: number, time: string) => `${who}: 통과 · ${place}위 · ${time}`,
    left: (who: string) => `${who}: 나감`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    passed: "통과",
    failed: "실패",
    over: "종료",
    place: (place: number, time: string) => `${place}위 · ${time}에 통과`,
    notPassed: (placed: number, all: number, lines: number, of: number) => `타일 ${placed}/${all} · 맞은 줄 ${lines}/${of}`,
    first: (who: string) => `1위 ${who}`,
    nobody: "통과한 사람 없음",
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
    sending: "보내는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "신의 시험: 규칙", tone: "title" },
    { text: `1부터 ${n.size * n.size}까지의 타일을 ${n.size}×${n.size} 판에 모두 놓습니다.` },
    { text: `가로 ${n.size}줄, 세로 ${n.size}줄, 대각선 2줄의 합이 모두 ${(n.size * (n.size * n.size + 1)) / 2}이어야 합니다.`, tone: "mark" },
    { text: "1은 맨 윗줄 가운데에 놓여 있고 옮길 수 없습니다." },
    { text: "" },
    { text: "올바르게 다 놓는 순간 통과합니다. 제출 버튼은 없습니다." },
    { text: "놓은 타일은 몇 번이든 옮기거나 뺄 수 있습니다." },
    { text: `제한 시간 ${koTime(n.seconds)}. 한 사람만 남거나 시간이 다 되면 끝납니다.` },
    { text: "먼저 통과한 순서대로 순위가 정해집니다." },
    { text: "판 옆과 아래의 숫자는 그 줄의 합입니다. 맞으면 초록색.", tone: "dim" },
    { text: "다른 사람은 놓은 타일 수와 맞은 줄 수만 보입니다.", tone: "dim" },
    { text: "" },
    { text: byInput("타일을 누르고 칸을 누르기 · 또는 방향키로 칸, 숫자+Enter", "타일을 누르고 놓을 칸을 누르세요") },
    { text: byInput("Backspace: 타일 빼기 · Esc: 고른 것 취소", "판의 타일을 누른 뒤 왼쪽 빈자리를 누르면 뺍니다") },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "The Divine Test: rules",
    brief: {
      goal: "Be the first to complete a 7 by 7 magic square with the tiles 1 to 49.",
      play: "Place the tiles so every row, column and diagonal adds up to 175.",
      end: "You pass the moment the board is right. It ends when one player is left, or after 30 minutes.",
    },
    parts: [
      "For two to six players, each on a board of their own. The board is 7 squares by 7, and there is one number tile for each number from 1 to 49. The 1 is on the middle square of the top row and cannot be moved.",
      [
        "Place the other 48 tiles so that all 7 rows, all 7 columns and both diagonals add up to the same number (175).",
        "You pass the moment the board is right. There is no button to hand it in.",
        "A tile on the board can be moved or taken back as often as you like. Moving a tile onto a square that has one makes the two change places.",
        "There is more than one answer. Any arrangement whose lines all add up passes.",
      ],
      "In the show this was a test one player took alone in the place of exile, with one hour, and failing it meant elimination. On this site everyone in the room has the same 30 minutes, each on their own board, and players are ranked in the order they pass.",
      [
        "The game ends when only one player is still working (with two players, the moment one passes). It also ends after 30 minutes; those who have not passed share the place after those who have.",
        "You do not see anyone else's board, only how many tiles they have placed and how many of their lines are right.",
        "The sum of each line is shown beside and under the board. The show's board had no such help.",
        "The tiles carry plain numbers in place of the show's script of the place of exile.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-tile": "That tile cannot be placed (2 to 49)",
    "bad-cell": "Nothing can be placed on that square",
    "empty-cell": "There is no tile on that square",
    "no-change": "That tile is on that square already",
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
  ended: {
    played: "Places decided",
    time: "Time is up",
    left: "Too few players left",
    abandoned: "Nobody left to play on",
  },
  heading: "The Divine Test",
  status: {
    at: (placed, all, lines, of) => `${placed}/${all} · ${lines}/${of}`,
    passed: (time) => `passed ${time}`,
    failed: "failed",
    left: "left",
  },
  side: {
    placed: (placed, all) => `Tiles ${placed}/${all}`,
    lines: (lines, of) => `Lines ${lines}/${of}`,
  },
  say: {
    passedOther: (who, place) => `${who} passed, no. ${place}`,
    leftOther: (who) => `${who} left`,
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    play: (magic, clock) => timed(byInput(`Pick a tile and place it · every line must add up to ${magic}`, `Press a tile, then a square · every line must add up to ${magic}`), clock),
    held: (tile, clock) => timed(`${tile}: pick a square for it`, clock),
    typed: (typed, clock) => timed(`${typed}_ · Enter to place`, clock),
    full: (wrong, clock) => timed(`All placed, but ${wrong} ${wrong === 1 ? "line does" : "lines do"} not add up`, clock),
    passed: (place, clock) => timed(`You passed, no. ${place} · waiting for the others`, clock),
    watching: (magic, clock) => timed(`Everyone is making a magic square · every line must add up to ${magic}`, clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    play: "Arrows · number+Enter: place · Backspace: take back",
  },
  button: {
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    passed: (who, place, time) => `${who}: passed · no. ${place} · ${time}`,
    left: (who) => `${who}: left`,
  },
  result: {
    passed: "PASS",
    failed: "FAIL",
    over: "OVER",
    place: (place, time) => `No. ${place} · passed in ${time}`,
    notPassed: (placed, all, lines, of) => `Tiles ${placed}/${all} · lines right ${lines}/${of}`,
    first: (who) => `First: ${who}`,
    nobody: "Nobody passed",
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
    sending: "Sending",
  },
  help: (n) => [
    { text: "The Divine Test: rules", tone: "title" },
    { text: `Place all the tiles, 1 to ${n.size * n.size}, on the board of ${n.size} by ${n.size}.` },
    { text: `All ${n.size} rows, ${n.size} columns and both diagonals must add up to ${(n.size * (n.size * n.size + 1)) / 2}.`, tone: "mark" },
    { text: "The 1 is on the middle of the top row and cannot be moved." },
    { text: "" },
    { text: "You pass the moment the board is right. Nothing is handed in." },
    { text: "A tile can be moved or taken back as often as you like." },
    { text: `Time limit ${enTime(n.seconds)}. It ends when one is left or time is up.` },
    { text: "Players are ranked in the order they pass." },
    { text: "The numbers by the board are each line's sum: green is right.", tone: "dim" },
    { text: "Of the others you see only tiles placed and lines right.", tone: "dim" },
    { text: "" },
    { text: byInput("Click a tile, then a square · or arrows, then number + Enter", "Press a tile, then a square") },
    { text: byInput("Backspace: take a tile back · Esc: cancel", "Press a tile on the board, then an empty place on the left") },
    { text: "" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Press anywhere to close"), tone: "title" },
  ],
};

/** The words of the screen, in the page's language. */
export const WORDS = words({ ko, en });

/** The rules of the game as the page shows them, in each language: for the pages a search engine reads. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

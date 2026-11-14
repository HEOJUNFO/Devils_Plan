/**
 * The words of 큐브 세기 (Count the Cubes), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

const ko = {
  sheet: {
    title: "큐브 세기: 규칙",
    brief: {
      goal: "쌓인 큐브가 모두 몇 개인지 남보다 먼저 맞힙니다.",
      play: "그림을 돌려 가며 세어 수를 입력합니다. 틀리면 20초 쉽니다.",
      end: "한 명만 남기고 모두 맞히거나 시간이 다 되면 끝납니다.",
    },
    parts: [
      "큐브를 쌓아 만든 입체가 나옵니다. 큐브가 모두 몇 개인지 세어, 그 수를 각자 입력합니다.",
      [
        "입체는 속이 꽉 차 있습니다. 보이는 큐브 밑에 깔린 큐브도 셉니다. 처음 보이는 쪽에서는 뒤가 앞보다 낮은 곳이 없어, 다른 큐브 뒤에 숨은 기둥이 없습니다.",
        byInput("그림은 마우스로 끌어서 (또는 방향키로) 돌려 볼 수 있습니다.", "그림은 손가락으로 끌어서 돌려 볼 수 있습니다."),
        "맞힌 순서대로 순위가 정해집니다. 누가 맞히고 틀렸는지는 모두에게 알려지지만, 입력한 숫자는 알려지지 않습니다.",
        "틀리면 20초 동안 답할 수 없습니다.",
        "한 명만 남기고 모두 맞히면 끝납니다.",
      ],
      "제한 시간은 5분입니다 (방장이 3분이나 10분으로 바꿀 수 있습니다). 시간이 지나면 그때까지 맞힌 사람만 순위에 듭니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "locked": "아직 답할 수 없습니다",
    "too-soon": "아직 답할 수 없습니다",
    "already-right": "이미 맞혔습니다",
    "bad-action": "그 숫자는 답으로 낼 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "시작할 사람이 없습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    ranked: "순위가 정해져 끝",
    time: "제한 시간이 지나 끝",
    abandoned: "이어갈 사람이 없어 끝",
  },
  /** The two buttons after the digits, 28 pixels wide inside. */
  pad: { erase: "지움", enter: "입력" },
  /** `ms` as seconds with one decimal: how long an answer took. */
  took: (ms: number) => `${(ms / 1000).toFixed(1)}초`,
  /** Said in the bar for a moment. */
  say: {
    right: (place: number) => `정답! ${place}위`,
    wrong: (seconds: number) => `오답! ${seconds}초 동안 답할 수 없습니다`,
    paused: "판이 멈춰 있습니다",
    lockedFor: (seconds: number) => `${seconds}초 뒤에 다시 답할 수 있습니다`,
    /** An answer in the first moments of a problem, before the room takes one. */
    soonFor: (seconds: number) => `${seconds}초 뒤부터 답할 수 있습니다`,
  },
  /** In the corner of the picture: how the solid is turned, and, once it has been, how the first view comes back. */
  turn: { hint: "끌어서 돌려 보기", back: keyed("V:", "처음 보던 쪽으로") },
  /** Over the picture while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line over the entry, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    watching: (solved: string) => `관전 중 · ${solved}`,
    right: (place: number, solved: string) => `정답! ${place}위 · 다른 사람들을 기다리는 중 (${solved})`,
    sending: "보내는 중",
    wrong: (seconds: number) => `오답 · ${seconds}초 뒤에 다시 답할 수 있습니다`,
    ask: byInput("큐브는 모두 몇 개? 숫자를 넣고 Enter (또는 아래 버튼)", "큐브는 모두 몇 개? 아래 버튼으로 숫자를 넣고 입력"),
  },
  /** To a player in their first game of it, in place of `standing.ask` (468 pixels): what is counted, and what a wrong answer costs. */
  coach: {
    ask: (lock: number) => `밑에 깔려 안 보이는 큐브도 셉니다 · 틀리면 ${lock}초 잠김 · ${byInput("숫자를 넣고 Enter", "아래 버튼으로 입력")}`,
  },
  /** How many have the answer of how many it takes: the column's heading, with the clock beside it. */
  solved: (have: number, needed: number) => `정답 ${have}/${needed}명`,
  log: {
    right: (who: string, place: number, took: string) => `${who}: 정답 (${place}위, ${took})`,
    wrong: (who: string) => `${who}: 오답`,
  },
  /**
   * What the list says of a player beside their name: several ways of saying
   * it, the longest first. `short` is for a crowded list, where an entry has
   * half the width and the name needs most of it.
   */
  state: {
    took: (ms: number, short: boolean) => (short ? [`${Math.floor(ms / 1000)}초`, `${Math.floor(ms / 1000)}`] : [`${(ms / 1000).toFixed(1)}초`]),
    locked: (seconds: number, short: boolean) => (short ? [`잠김 ${seconds}`, `${seconds}초`, `${seconds}`] : [`잠김 ${seconds}초`]),
    unanswered: (short: boolean) => (short ? ["-"] : ["미정답"]),
    wrong: (times: number, short: boolean) => (short ? [`오답 ${times}`, `×${times}`] : [`오답 ${times}번`]),
    counting: (short: boolean) => (short ? [""] : ["세는 중"]),
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated ? "종료" : place === null ? "미정답" : `${place}위`),
    place: (place: number, who: string) => `${place}위 ${who}`,
    nobody: "아무도 맞히지 못했습니다",
    answer: (cubes: string) => `큐브는 모두 ${cubes}개였습니다`,
    hostNext: (alone: boolean): string => (alone ? "한 판 더 하거나 대기실로" : "같은 사람들과 한 판 더 하거나 대기실로"),
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The two buttons under the results, 88 pixels wide inside. */
  button: { again: keyed("Enter", "새 판"), lobby: keyed("Esc", "대기실로") },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (lockSeconds: number, minutes: number, alone: boolean): HelpLine[] => [
    { text: "큐브 세기: 규칙", tone: "title" },
    { text: "그림의 입체가 큐브 몇 개로 되어 있는지 세어, 그 수를 각자 입력합니다." },
    { text: "" },
    { text: "입체는 속이 꽉 차 있습니다. 보이는 큐브 밑에 깔린 큐브도 셉니다." },
    { text: "처음 보이는 쪽에서는 뒤가 앞보다 낮은 곳이 없어, 숨은 기둥이 없습니다.", tone: "dim" },
    { text: byInput("그림은 끌어서 돌려 볼 수 있습니다 (방향키도 같음). V: 처음 보던 쪽으로.", "그림은 끌어서 돌려 볼 수 있습니다. 처음 보던 쪽은 그림 구석의 버튼으로."), tone: "dim" },
    { text: "" },
    { text: "답이 맞으면 맞힌 순서대로 순위가 정해집니다. 누가 맞히고 틀렸는지는" },
    { text: "모두에게 알려지지만, 입력한 숫자는 알려지지 않습니다." },
    { text: `틀리면 ${lockSeconds}초 동안 답할 수 없습니다.` },
    { text: alone ? "혼자 하는 판은 맞히면 끝납니다." : "한 명만 남기고 모두 맞히면 끝납니다." },
    { text: `제한 시간은 ${minutes}분입니다. 시간이 지나면 그때까지 맞힌 사람만 순위에 듭니다.`, tone: "dim" },
    { text: "" },
    { text: byInput("숫자 키: 입력 · Backspace: 지움 · Enter: 답하기 (아래 버튼도 같음)", "숫자는 아래 버튼으로 넣고, 입력을 누르면 답합니다."), tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Count the Cubes: rules",
    brief: {
      goal: "Count the solid's cubes and be right before the others.",
      play: "Turn it, count, enter a number. A miss costs 20 seconds.",
      end: "Over when all but one are right, or when time runs out.",
    },
    parts: [
      "A solid built of stacked cubes comes up. Count how many cubes there are in all, and enter the number, each player for themselves.",
      [
        "The solid has no hollows. The cubes under the ones you see count too. Seen from where it is first shown, nowhere is the back lower than the front, so no column hides behind other cubes.",
        byInput(
          "Drag the picture with the mouse (or use the arrow keys) to turn the solid and look at it from another side.",
          "Drag the picture with a finger to turn the solid and look at it from another side.",
        ),
        "Players are ranked in the order they get it right. Everyone is told who was right and who was wrong, but not the numbers entered.",
        "A wrong answer locks you out for 20 seconds.",
        "The game ends when all but one have got it right.",
      ],
      "The time limit is 5 minutes (the host can make it 3 or 10). When it runs out, only those who were right by then are ranked.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "locked": "You cannot answer yet",
    "too-soon": "You cannot answer yet",
    "already-right": "You already got it right",
    "bad-action": "That number cannot be given as an answer",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "too-few": "There is nobody to start with",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    ranked: "Over: everyone is ranked",
    time: "Over: time ran out",
    abandoned: "Over: nobody left to play",
  },
  pad: { erase: "Del", enter: "OK" },
  took: (ms) => `${(ms / 1000).toFixed(1)}s`,
  say: {
    right: (place) => `Right! ${englishOrdinal(place)} place`,
    wrong: (seconds) => `Wrong! You cannot answer for ${seconds} seconds`,
    paused: "The game is paused",
    lockedFor: (seconds) => `You can answer again in ${seconds}s`,
    soonFor: (seconds) => `You can answer in ${seconds}s`,
  },
  turn: { hint: "Drag to turn", back: keyed("V:", "first view") },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    watching: (solved) => `Watching · ${solved}`,
    right: (place, solved) => `Right! ${englishOrdinal(place)} place · waiting for the others (${solved})`,
    sending: "Sending",
    wrong: (seconds) => `Wrong · you can answer again in ${seconds}s`,
    ask: byInput("How many cubes in all? Type the number, then Enter (or the buttons)", "How many cubes in all? Enter the number with the buttons, then OK"),
  },
  coach: {
    ask: (lock) => `Hidden cubes below count too · wrong: locked ${lock}s · ${byInput("type it, then Enter", "enter it below")}`,
  },
  solved: (have, needed) => `Solved ${have}/${needed}`,
  log: {
    right: (who, place, took) => `${who}: right, ${englishOrdinal(place)}, ${took}`,
    wrong: (who) => `${who}: wrong`,
  },
  state: {
    took: (ms, short) => (short ? [`${Math.floor(ms / 1000)}s`, `${Math.floor(ms / 1000)}`] : [`${(ms / 1000).toFixed(1)}s`]),
    locked: (seconds, short) => (short ? [`lock ${seconds}`, `${seconds}s`, `${seconds}`] : [`locked ${seconds}s`]),
    unanswered: (short) => (short ? ["-"] : ["no answer"]),
    wrong: (times, short) => (short ? [`×${times}`] : [`wrong ×${times}`]),
    counting: (short) => (short ? [""] : ["counting"]),
  },
  result: {
    verdict: (seated, place) => (!seated ? "Over" : place === null ? "Miss" : englishOrdinal(place)),
    place: (place, who) => `${englishOrdinal(place)} ${who}`,
    nobody: "Nobody got it right",
    answer: (cubes) => `There were ${cubes} cubes in all`,
    hostNext: (alone) => (alone ? "Play again or go back" : "Play again with the same people or go back"),
    waitHost: "Waiting for the host · \"Again\" to join in",
    waitHostOut: "Waiting for the host to start a new game",
  },
  button: { again: keyed("Enter", "again"), lobby: keyed("Esc", "to room") },
  help: (lockSeconds, minutes, alone) => [
    { text: "Count the Cubes: rules", tone: "title" },
    { text: "Count how many cubes the solid in the picture is made of," },
    { text: "and enter the number, each player for themselves." },
    { text: "" },
    { text: "No hollows: cubes under the ones you see count too." },
    { text: "At first the back is never lower than the front: none is hidden.", tone: "dim" },
    { text: byInput("Drag the picture to turn it (arrow keys too). V: the first view.", "Drag the picture to turn it. The button in its corner: the first view."), tone: "dim" },
    { text: "" },
    { text: "Players are ranked in the order they get it right. All are told" },
    { text: "who was right and who was wrong, but not the numbers entered." },
    { text: `A wrong answer locks you out for ${lockSeconds} seconds.` },
    { text: alone ? "A game played alone ends when you get it right." : "The game ends when all but one have got it right." },
    { text: `Limit: ${minutes} minutes. After that only those who were right are ranked.`, tone: "dim" },
    { text: "" },
    { text: byInput("Digits: type · Backspace: delete · Enter: answer (or the buttons)", "Enter the number with the buttons; OK answers."), tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 큐브 세기 (Count the Cubes), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

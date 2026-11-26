/**
 * The words of 만국기 (Flags Around the World), in each language
 * (`lang.ts`): its rules as the page shows them before a game, and
 * everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Flags Around the World, national flags, circle, round, tiebreaker round,
 * "one point for each correct answer". The Korean ones are the wiki's (만국기,
 * 국기, 동그라미, 연장): design/games/flags-around-the-world.md.
 */
import type { FlagsEnd } from "../../../shared/games/flags-around-the-world/rules";
import { enTime, englishOrdinal, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  shown: number;
  showSeconds: number;
  passes: number;
  gapSeconds: number;
  choices: number;
  answers: number;
  chooseSeconds: number;
  rounds: number;
  tiebreaks: number;
}


/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "만국기: 규칙",
    brief: {
      goal: "잠깐 지나간 국기 10개 가운데 5개를, 25개 속에서 찾아내는 기억력 게임.",
      play: "국기 10개가 1초씩, 같은 순서로 세 번 지나갑니다. 5초 뒤 25개가 나오면 30초 안에 고릅니다.",
      end: "맞힌 국기 하나에 1점. 3라운드의 점수 합이 가장 높으면 승리.",
    },
    parts: [
      "2명부터 16명까지 함께 합니다. 라운드마다 서로 다른 나라의 국기 10개가 1초에 하나씩 차례로 나오고, 같은 순서로 세 번 되풀이됩니다 (30초).",
      "마지막 국기가 지나가고 5초 뒤, 화면에 국기 25개가 나옵니다. 그 가운데 5개가 방금 본 10개에 들어 있던 국기입니다. 30초 안에 그 5개를 찾아 동그라미를 칩니다.",
      [
        "맞힌 국기 하나에 1점입니다. 틀린 국기를 골라도 점수가 깎이지 않습니다.",
        "5개까지만 고를 수 있습니다. 덜 골라도 됩니다.",
        "「제출」을 누른 뒤에는 바꿀 수 없습니다. 누르지 않아도 30초가 다 되면 그때까지 고른 것이 제출됩니다.",
        "모두 제출하면 30초를 기다리지 않고 정답을 공개합니다.",
      ],
      "3라운드를 하고 점수 합이 가장 높은 사람이 1위입니다. 1위가 여럿이면 그 사람들끼리 연장 라운드를 하고 (3번까지), 그래도 같으면 공동 1위입니다. 그 아래의 동점은 같은 순위가 됩니다.",
      "국기는 유엔 회원국 193개국의 것이고, 모두 가로 4 세로 3의 비율로 작게 그렸습니다. 이 크기에서 구별되지 않는 국기(루마니아와 차드, 인도네시아와 모나코)는 한 라운드에 함께 나오지 않습니다. 한 판 안에서는 앞 라운드에 지나간 국기가 다시 나오지 않습니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-choosing": "지금은 국기를 고르는 때가 아닙니다",
    "not-playing": "이번 라운드는 고르는 사람이 아닙니다",
    "already-picked": "이번 라운드는 이미 제출했습니다",
    "too-many-flags": "다섯 개까지만 고를 수 있습니다",
    "bad-flags": "고를 수 없는 국기가 있습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "too-many": "사람이 너무 많습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "모든 라운드 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<FlagsEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, rounds: number, tiebreak: number) => (tiebreak > 0 ? `연장 ${tiebreak}` : `${round}/${rounds} 라운드`),
  /** In the list, beside a player: their points, and what the round last scored added. */
  points: (total: number) => `${total}점`,
  gained: (total: number, round: number) => `${total}점 +${round}`,
  /** Over the scene while a round's flags are shown, 300 pixels. */
  show: {
    ready: (count: number, seconds: number) => `국기 ${count}개가 지나갑니다 · ${seconds}`,
    pass: (pass: number, passes: number, at: number, count: number) => `${pass}/${passes}번째 · ${at}/${count}`,
    wait: (count: number, seconds: number) => `곧 국기 ${count}개가 나옵니다 · ${seconds}`,
    watching: "연장 라운드를 지켜보는 중",
  },
  /** Over the flags laid out, at the right, 150 pixels. */
  count: (chosen: number, of: number) => `동그라미 ${chosen}/${of}`,
  scored: (points: number) => `이번 라운드 ${points}점`,
  answersShown: "정답 공개",
  /** Said in the bar for a moment. */
  say: {
    full: (count: number) => `${count}개까지만 고를 수 있습니다`,
    laid: "국기가 나왔습니다 · 지나간 국기를 찾으세요",
    tied: "1위가 여럿입니다 · 연장 라운드",
    tiedWatch: "1위가 여럿이라 연장 라운드를 합니다",
    autoSent: "시간이 다 되어 고른 대로 제출했습니다",
  },
  /** Over the scene while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    show: "국기를 잘 봐 두세요 · 같은 순서로 세 번 지나갑니다",
    wait: "곧 국기가 나옵니다",
    choose: (left: number, clock: string) => timed(`지나간 국기에 동그라미를 치세요 · ${left}개 더 고를 수 있습니다`, clock),
    chooseReady: (clock: string) => timed(byInput("다 골랐으면 Enter로 제출", "다 골랐으면 「제출」"), clock),
    chosen: (clock: string) => timed("제출했습니다 · 다른 사람을 기다리는 중", clock),
    chooseOther: (clock: string) => timed("국기를 고르는 중", clock),
    reveal: (clock: string) => timed("초록 테두리가 지나간 국기입니다", clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    choose: "방향키 · Space 동그라미 · Esc 지우기",
  },
  /** The buttons of the bar. */
  button: {
    send: keyed("Enter", "제출"),
    clear: "모두 지우기",
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number, tiebreak: number): string => (tiebreak > 0 ? `연장 ${tiebreak} 시작` : `${round}라운드 시작`),
    picked: (who: string) => `${who}: 제출`,
    scored: (who: string, points: number) => `${who} ${points}점`,
    tied: "1위 동점 · 연장",
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "종료" : `${place}위`),
    place: (place: number, who: string, total: number) => `${place}위 ${who} ${total}점`,
    how: (rounds: number, tiebreaks: number) => (tiebreaks > 0 ? `${rounds}라운드와 연장 ${tiebreaks}번` : `${rounds}라운드의 점수 합`),
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "만국기: 규칙", tone: "title" },
    { text: `국기 ${n.shown}개가 ${n.showSeconds}초씩, 같은 순서로 ${n.passes}번 지나갑니다.` },
    { text: `${n.gapSeconds}초 뒤 국기 ${n.choices}개가 나옵니다. 그중 ${n.answers}개가 지나간 국기입니다.` },
    { text: `${koTime(n.chooseSeconds)} 안에 그 ${n.answers}개를 찾아 동그라미를 치세요.` },
    { text: "" },
    { text: "맞힌 국기 하나에 1점. 틀려도 깎이지 않습니다." },
    { text: `${n.answers}개까지만 고를 수 있고, 덜 골라도 됩니다.`, tone: "dim" },
    { text: "제출하면 바꿀 수 없습니다. 시간이 다 되면 고른 대로 제출됩니다.", tone: "dim" },
    { text: "" },
    { text: `${n.rounds}라운드의 점수 합이 가장 높으면 1위.` },
    { text: `1위가 여럿이면 그 사람들끼리 연장 라운드 (${n.tiebreaks}번까지).`, tone: "dim" },
    { text: "" },
    { text: "국기는 유엔 회원국 193개국. 한 판에서 지나간 국기는 다시 안 나옵니다.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Flags Around the World: rules",
    brief: {
      goal: "A memory game: of ten national flags that flash by, find five among 25.",
      play: "Ten flags are shown for a second each, three times in the same order. Five seconds later 25 appear: you have 30 seconds.",
      end: "One point for each correct flag. The highest total over three rounds wins.",
    },
    parts: [
      "For 2 to 16 players. Each round, ten different national flags are shown back to back for one second each, and the sequence is repeated three times in the same order (30 seconds).",
      "Five seconds after the last flag, 25 flags appear on the screen. Included in the 25 are five of the ten you have just seen. You have 30 seconds to find and circle those five.",
      [
        "You score one point for each correct flag. A wrong flag costs nothing.",
        "You may circle five flags at most, or fewer.",
        "Once you submit you cannot change your circles. If you do not submit, what you have circled when the minute is up is submitted for you.",
        "When everyone has submitted, the answers are shown without waiting for the minute.",
      ],
      "There are three rounds, and the highest total wins. Players tied for first play tiebreaker rounds among themselves (three at most); if they are still tied they share first place. Players tied below that share a place.",
      "The flags are those of the 193 member states of the United Nations, all drawn small at four by three. Flags that cannot be told apart at this size (Romania and Chad, Indonesia and Monaco) never appear in the same round, and a flag shown in one round does not appear again in the same game.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-choosing": "No flags are out to choose from right now",
    "not-playing": "This round is not yours to choose in",
    "already-picked": "You have already submitted this round",
    "too-many-flags": "You may circle five flags at most",
    "bad-flags": "One of those flags cannot be chosen",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "too-many": "Too many players",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done right now",
  ended: {
    played: "All rounds played",
    left: "Too few players left",
    abandoned: "Nobody left to go on",
  } as Record<FlagsEnd, string>,
  heading: (round: number, rounds: number, tiebreak: number) => (tiebreak > 0 ? `Tiebreaker ${tiebreak}` : `Round ${round}/${rounds}`),
  points: (total: number) => `${total} pt`,
  gained: (total: number, round: number) => `${total} pt +${round}`,
  show: {
    ready: (count: number, seconds: number) => `${count} flags coming up · ${seconds}`,
    pass: (pass: number, passes: number, at: number, count: number) => `Time ${pass}/${passes} · ${at}/${count}`,
    wait: (count: number, seconds: number) => `${count} flags will appear · ${seconds}`,
    watching: "Watching the tiebreaker round",
  },
  count: (chosen: number, of: number) => `Circled ${chosen}/${of}`,
  scored: (points: number) => `This round: ${points} pt`,
  answersShown: "Answers",
  say: {
    full: (count: number) => `You may circle ${count} at most`,
    laid: "The flags are out · find the ones you saw",
    tied: "Tied for first · tiebreaker round",
    tiedWatch: "Tied for first: a tiebreaker round is played",
    autoSent: "Time is up: your circles were submitted",
  },
  waitingBack: (seconds: number | null) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is standing still",
    sending: "Sending",
    show: "Watch the flags · they go by three times in the same order",
    wait: "The flags are about to appear",
    choose: (left: number, clock: string) => timed(`Circle the flags you saw · ${left} more to choose`, clock),
    chooseReady: (clock: string) => timed(byInput("Press Enter to submit when you are done", "Press Submit when you are done"), clock),
    chosen: (clock: string) => timed("Submitted · waiting for the others", clock),
    chooseOther: (clock: string) => timed("The players are choosing", clock),
    reveal: (clock: string) => timed("The flags with a green edge were shown", clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    choose: "Arrows · Space circles · Esc clears",
  },
  button: {
    send: keyed("Enter", "Submit"),
    clear: "Clear all",
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round: number, tiebreak: number): string => (tiebreak > 0 ? `Tiebreaker ${tiebreak} begins` : `Round ${round} begins`),
    picked: (who: string) => `${who}: submitted`,
    scored: (who: string, points: number) => `${who}: ${points} pt`,
    tied: "Tie for first · tiebreaker",
  },
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "Over" : englishOrdinal(place)),
    place: (place: number, who: string, total: number) => `${englishOrdinal(place)} ${who} ${total} pt`,
    how: (rounds: number, tiebreaks: number) => (tiebreaks > 0 ? `${rounds} rounds and ${tiebreaks} tiebreaker${tiebreaks === 1 ? "" : "s"}` : `Total over ${rounds} rounds`),
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Flags Around the World: rules", tone: "title" },
    { text: `${n.shown} flags are shown ${n.showSeconds} s each, ${n.passes} times in the same order.` },
    { text: `${n.gapSeconds} s later ${n.choices} flags appear. ${n.answers} of them were shown.` },
    { text: `You have ${enTime(n.chooseSeconds)} to find and circle those ${n.answers}.` },
    { text: "" },
    { text: "One point for each correct flag. A wrong one costs nothing." },
    { text: `Circle ${n.answers} at most, or fewer.`, tone: "dim" },
    { text: "Submitting is final. At time-up your circles are submitted.", tone: "dim" },
    { text: "" },
    { text: `The highest total over ${n.rounds} rounds wins.` },
    { text: `Players tied for first play tiebreaker rounds (${n.tiebreaks} at most).`, tone: "dim" },
    { text: "" },
    { text: "Flags of the 193 UN member states, none shown twice in a game.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

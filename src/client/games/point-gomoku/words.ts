/**
 * The words of 포인트 오목 (Point Gomoku), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Point Gomoku, selector, selection, betting, stone placement, spot, points,
 * carry over, five in a row, black stones, white stones. The Korean ones are
 * the show's own (선택 플레이어, 선택·베팅·착수, 포인트, 이월, 오목, 육목,
 * 흑돌·백돌): design/games/point-gomoku.md.
 */
import type { OmokEnd, OmokPhase } from "../../../shared/games/point-gomoku/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many lines the board has each way. */
  size: number;
  /** How many stones in a row win. */
  line: number;
  /** How many spots a selector marks. */
  spots: number;
  /** The points given every round, and the least that can be bet on a spot. */
  roundPoints: number;
  minBet: number;
  /** Seconds to mark the spots, and seconds to bet. */
  selectSeconds: number;
  betSeconds: number;
}

/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "포인트 오목: 규칙",
    brief: {
      goal: "내 돌 다섯 개를 한 줄로 먼저 이으면 승리.",
      play: "라운드마다 세 점에 포인트를 걸고, 더 많이 건 사람의 돌이 놓입니다.",
      end: "건 포인트와 남은 포인트는 상대에게 보이지 않습니다.",
    },
    parts: [
      "두 사람이 가로세로 19줄 판에서 합니다. 한 사람은 흑돌, 한 사람은 백돌입니다. 라운드는 선택, 베팅, 착수의 순서로 진행됩니다.",
      [
        "선택: 선택 플레이어가 45초 안에 판 위의 연속된 세 점을 고릅니다. 가로, 세로, 대각선 가운데 한 줄로 이어진 빈 점이어야 합니다. 1라운드의 선택 플레이어는 흑이고, 2라운드부터 번갈아 맡습니다.",
        "베팅: 두 사람 모두 라운드마다 10포인트를 새로 받습니다. 45초 안에 세 점 각각에 걸 포인트를 정합니다. 점마다 1포인트 이상을 정수로 겁니다.",
        "착수: 점마다 포인트를 더 많이 건 사람의 돌이 놓입니다. 같은 포인트를 걸었으면 선택 플레이어가 아닌 사람의 돌이 놓입니다.",
        "이월: 베팅하고 남은 포인트의 절반이 다음 라운드로 넘어갑니다 (소수점 아래는 버립니다). 5포인트가 남으면 2포인트가 넘어가, 다음 라운드에는 12포인트를 씁니다.",
        "건 포인트와 남은 포인트는 상대에게 공개되지 않습니다.",
      ],
      "세 점에 모든 돌이 놓인 뒤, 자기 돌 다섯 개로 한 줄을 만든 사람이 이깁니다. 여섯 개 이상 이어진 줄(육목)은 오목이 아닙니다. 두 사람이 동시에 오목을 만들면 오목이 더 많은 사람이 이깁니다.",
      [
        "누가 흑인지는 방이 무작위로 정합니다.",
        "시간 안에 세 점을 고르지 못하면 방이 대신 고르고, 베팅하지 못하면 점마다 1포인트를 건 것으로 합니다.",
        "동시에 만든 오목의 수가 같으면 무승부입니다. 연속된 빈 세 점이 판에 남지 않아도 무승부입니다.",
        "판이 끝나면 마지막 라운드에 건 포인트와 남은 포인트가 공개됩니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "bad-spots": "판 위의 서로 다른 세 점을 골라야 합니다",
    "spot-taken": "돌이 놓인 자리는 고를 수 없습니다",
    "not-in-line": "한 줄로 이어진 세 점이어야 합니다",
    "bad-bets": "점마다 포인트를 정수로 걸어야 합니다",
    "bet-too-low": "점마다 1포인트 이상 걸어야 합니다",
    "bets-over": "가진 포인트보다 많이 걸 수 없습니다",
    "not-selecting": "지금은 세 점을 고르는 때가 아닙니다",
    "not-selector": "이번 라운드의 선택 플레이어가 아닙니다",
    "not-betting": "지금은 베팅하는 때가 아닙니다",
    "not-playing": "이 판의 플레이어가 아닙니다",
    "already-bet": "이번 라운드의 포인트는 이미 제출했습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명이어야 합니다",
    "too-many": "두 명만 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "오목이 완성되어 끝",
    level: "같은 수의 오목 · 무승부",
    full: "고를 세 점이 없어 무승부",
    left: "상대가 나가 끝",
    abandoned: "이어갈 사람이 없어 끝",
    stalled: "아무도 두지 않아 끝",
  } as Record<OmokEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, phase: OmokPhase) => `${round}라운드${phase === "select" ? " · 선택" : phase === "bet" ? " · 베팅" : ""}`,
  /** In the list, beside a player: what they are doing in the step being played. */
  status: { selecting: "선택 중", betting: "베팅 중", done: "제출함" },
  /** The two stones, as a line of the log names them. */
  stone: { black: "흑", white: "백" },
  /** Left of the board, 98 pixels. */
  side: {
    round: (round: number) => `${round}라운드`,
    selector: (who: string) => `선택 ${who}`,
    points: "내 포인트",
    leftOver: "남은 포인트",
    last: (round: number) => `${round}라운드 착수`,
  },
  /** Said in the bar for a moment. */
  say: {
    markedForYou: "시간이 지나 방이 세 점을 골랐습니다",
    markedForThem: "선택 플레이어의 시간이 지나 방이 세 점을 골랐습니다",
    betForYou: "시간이 지나 점마다 1포인트를 걸었습니다",
    placed: (mine: number, all: number) => `돌이 착수되었습니다 · ${all}점 가운데 ${mine}점이 내 돌`,
    marksFull: (spots: number) => `${spots}점을 모두 골랐습니다. 바꾸려면 고른 점을 다시 누르세요`,
    marksShort: (left: number) => `${left}점을 더 골라야 합니다`,
  },
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    select: (spots: number, left: number, clock: string) => timed(`돌이 놓일 연속된 ${spots}점을 판에서 고르세요 · ${left}점 남음`, clock),
    selectReady: (clock: string) => timed(byInput("Enter로 위치 확정", "「확정」을 누르세요"), clock),
    selectWait: (clock: string) => timed("상대가 돌이 놓일 세 점을 고르는 중", clock),
    selectOther: (clock: string) => timed("선택 플레이어가 세 점을 고르는 중", clock),
    bet: (least: number, clock: string) => timed(`세 점에 포인트를 거세요 (점마다 ${least} 이상) · 더 많이 건 사람의 돌이 놓입니다`, clock),
    betWait: (clock: string) => timed("상대의 포인트 제출을 기다리는 중", clock),
    betOther: (clock: string) => timed("두 사람이 포인트를 거는 중", clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    select: "판을 누르거나 방향키 · Space로 고르기",
  },
  /** Beside the bets, 96 pixels: the points on no spot, and what of them carries over. */
  bar: {
    unbet: (points: number) => `남김 ${points}`,
    carried: (points: number) => `이월 ${points}`,
  },
  /** The buttons of the bar. */
  button: {
    confirm: keyed("Enter", "확정"),
    clear: "다시 고르기",
    bet: keyed("Enter", "제출"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number, who: string) => `${round}라운드 · 선택 ${who}`,
    selected: (who: string, forced: boolean) => (forced ? "방이 세 점을 고름" : `${who}: 세 점 선택`),
    bet: (who: string, forced: boolean) => (forced ? `${who}: 시간 초과 · 1씩` : `${who}: 포인트 제출`),
    placed: (stones: string) => `착수 ${stones}`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    outcome: (kind: "won" | "lost" | "level"): string => (kind === "won" ? "승리" : kind === "lost" ? "패배" : "무승부"),
    over: "종료",
    nobody: "승자 없음",
    winner: (who: string) => `${who} 승리`,
    how: (round: number, line: number) => `${round}라운드에 돌 ${line}개를 한 줄로 이음`,
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "포인트 오목: 규칙", tone: "title" },
    { text: `${n.size}줄 판에 내 돌 ${n.line}개를 먼저 한 줄로 이으면 승리. 선택 → 베팅 → 착수.` },
    { text: "" },
    { text: `선택 (${koTime(n.selectSeconds)}): 선택 플레이어가 한 줄로 이어진 빈 ${n.spots}점을 고릅니다.` },
    { text: "가로·세로·대각선. 1라운드는 흑이 고르고, 그 뒤로 번갈아 고릅니다.", tone: "dim" },
    { text: `베팅 (${koTime(n.betSeconds)}): 둘 다 ${n.roundPoints}포인트를 새로 받아 점마다 ${n.minBet} 이상을 겁니다.` },
    { text: "착수: 점마다 더 많이 건 사람의 돌. 같으면 선택 플레이어가 아닌 사람의 돌." },
    { text: "이월: 남은 포인트의 절반(버림)이 다음 라운드로 넘어갑니다." },
    { text: "건 포인트와 남은 포인트는 상대에게 보이지 않습니다.", tone: "mark" },
    { text: "" },
    { text: `돌 ${n.line + 1}개 이상이 이어진 줄(육목)은 오목이 아닙니다.` },
    { text: "동시에 오목을 만들면 오목이 더 많은 사람이 승리, 같으면 무승부." },
    { text: `시간이 지나면 방이 대신 고르거나 점마다 ${n.minBet}포인트를 겁니다.`, tone: "dim" },
    { text: "연속된 빈 세 점이 판에 없으면 무승부.", tone: "dim" },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Point Gomoku: rules",
    brief: {
      goal: "Complete a line of five of your stones first to win.",
      play: "Each round, bet points on three spots; the higher bet gets the stone.",
      end: "Points bet and points remaining are not revealed to your opponent.",
    },
    parts: [
      "For two players on a board of 19 lines by 19. One has the black stones and one the white. Each round goes through selection, betting and stone placement.",
      [
        "Selection: the selector has 45 seconds to mark three consecutive points on the board. They must be empty and next to each other in one straight or diagonal line. Black is the selector in Round 1, and from Round 2 you take turns.",
        "Betting: you each get ten new points every round. You have 45 seconds to allocate points to each of the three spots. You must bet at least one point on each spot, and bets are whole numbers.",
        "Stone placement: for each spot, the player who bet more points gets their stone placed there. If both bet the same number of points on a spot, the non-selector gets their stone on it.",
        "Carrying over: half the points you have left after betting, rounded down, carry over to the next round. With five left, two carry over, and you have 12 points in the next round.",
        "The number of points bet and the number of points remaining are not revealed to your opponent.",
      ],
      "Once all three stones are placed, whoever has completed a line of five of their stones wins. A line of six or more is not five in a row. If both complete lines at the same time, whoever has more five-in-a-row lines wins.",
      [
        "The room draws who has the black stones.",
        "If the selector marks no spots in time, the room marks them. If you do not bet in time, you bet one point on each spot.",
        "If both complete as many lines at the same time, the game is a draw. It is also a draw once the board has no three consecutive empty points left.",
        "When the game is over, the points bet in the last round and the points remaining are shown.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-spots": "Mark three different points of the board",
    "spot-taken": "That spot has a stone on it",
    "not-in-line": "The three spots must be consecutive, in one line",
    "bad-bets": "Bet a whole number on each spot",
    "bet-too-low": "Bet at least one point on each spot",
    "bets-over": "You cannot bet more points than you have",
    "not-selecting": "No spots are being marked now",
    "not-selector": "You are not this round's selector",
    "not-betting": "No bets are being taken now",
    "not-playing": "You are not a player of this game",
    "already-bet": "You have submitted this round's points",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players",
    "too-many": "It takes two players, no more",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    played: "Five in a row",
    level: "Equal lines · a draw",
    full: "No three spots · a draw",
    left: "The opponent left",
    abandoned: "Everyone left",
    stalled: "Nobody was playing",
  } as Record<OmokEnd, string>,
  heading: (round, phase) => `Round ${round}${phase === "select" ? " · select" : phase === "bet" ? " · betting" : ""}`,
  status: { selecting: "selecting", betting: "betting", done: "submitted" },
  stone: { black: "black", white: "white" },
  side: {
    round: (round) => `Round ${round}`,
    selector: (who) => `Marks: ${who}`,
    points: "Your points",
    leftOver: "Points left",
    last: (round) => `Round ${round}`,
  },
  say: {
    markedForYou: "Time ran out: the room marked the spots",
    markedForThem: "The selector ran out of time: the room marked the spots",
    betForYou: "Time ran out: one point was bet on each spot",
    placed: (mine, all) => `The stones have been placed · ${mine} of the ${all} are yours`,
    marksFull: (spots) => `All ${spots} spots are marked. Press a marked spot to change it`,
    marksShort: (left) => (left === 1 ? "Mark one more spot" : `Mark ${left} more spots`),
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for players" : `Waiting for players · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    select: (spots, left, clock) => timed(`Mark ${spots} consecutive spots on the board for the stones · ${left} to go`, clock),
    selectReady: (clock) => timed(byInput("Enter confirms the spots", "Press \"Confirm\""), clock),
    selectWait: (clock) => timed("Your opponent is marking the spots", clock),
    selectOther: (clock) => timed("The selector is marking the spots", clock),
    bet: (least, clock) => timed(`Bet on each spot (at least ${least}) · the higher bet gets the stone`, clock),
    betWait: (clock) => timed("Waiting for your opponent's points", clock),
    betOther: (clock) => timed("Both players are betting", clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    select: "Press the board, or arrows · Space",
  },
  bar: {
    unbet: (points) => `Left ${points}`,
    carried: (points) => `Carries ${points}`,
  },
  button: {
    confirm: keyed("Enter", "Confirm"),
    clear: "Clear",
    bet: keyed("Enter", "Submit"),
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round, who) => `Round ${round}: ${who}`,
    selected: (who, forced) => (forced ? "The room marked spots" : `${who}: spots marked`),
    bet: (who, forced) => (forced ? `${who}: late · 1 each` : `${who}: points in`),
    placed: (stones) => stones,
  },
  result: {
    outcome: (kind) => (kind === "won" ? "Won" : kind === "lost" ? "Lost" : "Draw"),
    over: "Over",
    nobody: "No winner",
    winner: (who) => `${who} wins`,
    how: (round, line) => `A line of ${line} stones in round ${round}`,
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Point Gomoku: rules", tone: "title" },
    { text: `Complete a line of ${n.line} stones on the ${n.size}-line board first to win.` },
    { text: "A round is selection, betting, then stone placement.", tone: "dim" },
    { text: `Selection (${enTime(n.selectSeconds)}): the selector marks ${n.spots} consecutive empty spots,` },
    { text: "in a straight or diagonal line. Black first, then you take turns.", tone: "dim" },
    { text: `Betting (${enTime(n.betSeconds)}): each gets ${n.roundPoints} new points; bet ${n.minBet} or more a spot.` },
    { text: "Placement: on each spot, the stone of whoever bet more points." },
    { text: "The same bet on a spot: the non-selector gets it.", tone: "dim" },
    { text: "Half the points you have left, rounded down, carry over." },
    { text: "Points bet and points remaining are not revealed.", tone: "mark" },
    { text: "" },
    { text: `A line of ${n.line + 1} or more stones is not five in a row.` },
    { text: "Both at the same time: more lines wins; as many, a draw." },
    { text: `Out of time: the room marks the spots, or bets ${n.minBet} on each for you.`, tone: "dim" },
    { text: "No three consecutive empty spots left: a draw.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

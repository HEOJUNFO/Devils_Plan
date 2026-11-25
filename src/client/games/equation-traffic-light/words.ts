/**
 * The words of 수식 신호등 (Equation Traffic Light), in each language
 * (`lang.ts`): its rules as the page shows them before a game, and
 * everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Equation Traffic Light, color clues (red, yellow, green), nine-cell
 * equation, cell, answer, symbol, exponent, leading zero. The Korean ones are
 * the wiki's (수식, 예상 답안, 색깔 힌트, 빨강·노랑·초록, 제곱):
 * design/games/equation-traffic-light.md.
 */
import type { EqEnd, EquationRefusal } from "../../../shared/games/equation-traffic-light/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many cells an equation has. */
  cells: number;
  /** Seconds to create an equation, and seconds for an answer. */
  createSeconds: number;
  guessSeconds: number;
}

/** Seconds as the sheet says them: whole minutes where they are, seconds otherwise. */
const koTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`);
const enTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "수식 신호등: 규칙",
    brief: {
      goal: "색깔 힌트로 상대가 만든 아홉 칸 수식을 먼저 맞히면 승리.",
      play: "턴마다 둘이 함께 답안을 내고, 칸마다 빨강·노랑·초록을 받습니다.",
      end: "초록은 자리까지 맞음, 노랑은 자리가 다름, 빨강은 없음.",
    },
    parts: [
      "두 사람이 합니다. 먼저 5분 안에 각자 9칸짜리 수식 하나를 만들어 상대 몰래 냅니다. 숫자 0~9와 기호 +, -, ×, ÷, =, ^(제곱)를 쓰고, 같은 것을 여러 번 써도 됩니다.",
      [
        "수식은 올바르게 성립해야 합니다. 등호는 하나 이상 있어야 하고, 어느 쪽이든 식이어도 됩니다. 등호가 여럿이면 등호로 나뉜 값이 모두 같아야 합니다 (2+2=4=2^2).",
        "기호는 이웃해서 쓸 수 없고, 수식의 처음과 끝은 숫자입니다. 곱할 때는 반드시 ×를 쓰고, 제곱(^) 뒤에는 반드시 숫자가 옵니다.",
        "수의 앞자리에 0을 붙일 수 없습니다 (05, 012). 0 하나는 수입니다.",
        "계산은 제곱 먼저, 그다음 곱셈과 나눗셈을 왼쪽부터, 그다음 덧셈과 뺄셈을 왼쪽부터 합니다. 제곱이 이어지면 오른쪽부터입니다 (2^3^2 = 2^9). 나눗셈은 분수로 정확히 셉니다. 0으로 나누는 수식과 0^0은 성립하지 않습니다.",
        "5분 안에 내지 못하면 방이 수식 하나를 대신 정하고, 그 사실을 두 사람에게 알립니다.",
      ],
      "둘 다 수식을 내면 서로의 수식을 맞히기 시작합니다. 턴마다 5분 안에 숫자와 기호 9칸으로 답안을 냅니다. 답안은 성립하는 수식이 아니어도 됩니다. 두 답안이 모두 나오면 칸마다 색깔 힌트가 붙어 함께 공개됩니다.",
      [
        "초록: 그 숫자나 기호가 정확한 자리에 있습니다.",
        "노랑: 그 숫자나 기호가 상대의 수식에 있지만 자리가 다릅니다.",
        "빨강: 그 숫자나 기호가 상대의 수식에 없습니다.",
        "상대의 수식에 하나뿐인 것을 답안에 여러 개 쓰면, 하나만 자리에 따라 초록이나 노랑이고 나머지는 빨강입니다 (여러 개 있으면 있는 만큼만 표시됩니다).",
        "시간 안에 답안을 내지 못하면 그 턴의 힌트가 없습니다.",
      ],
      "상대의 수식을 그대로 낸 사람이 이깁니다. 같은 턴에 둘 다 맞히면 새 수식으로 처음부터 다시 합니다. 세 턴을 이어서 아무도 답안을 내지 않으면 판을 끝냅니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "wrong-length": "아홉 칸을 모두 채워야 합니다",
    "bad-symbol": "쓸 수 없는 글자가 있습니다",
    "symbol-at-edge": "수식의 처음과 끝은 숫자여야 합니다",
    "symbols-together": "기호를 이웃해서 쓸 수 없습니다",
    "no-equals": "등호가 하나 이상 있어야 합니다",
    "leading-zero": "수의 앞자리에 0을 붙일 수 없습니다",
    "no-value": "계산할 수 없는 수식입니다 (0으로 나누기, 0^0, 너무 큰 수)",
    "not-true": "성립하지 않는 수식입니다",
    "not-creating": "지금은 수식을 만드는 때가 아닙니다",
    "not-guessing": "지금은 답안을 내는 때가 아닙니다",
    "not-playing": "이 판의 플레이어가 아닙니다",
    "already-answered": "이번 턴의 답안은 이미 냈습니다",
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
    played: "수식을 맞혀 끝",
    left: "상대가 나가 끝",
    abandoned: "이어갈 사람이 없어 끝",
    stalled: "아무도 답안을 내지 않아 끝",
  } as Record<EqEnd, string>,
  /** Beside the cells being written, 88 pixels: whether they are an equation yet. */
  check: {
    ok: "성립",
    "wrong-length": "",
    "bad-symbol": "쓸 수 없는 글자",
    "symbol-at-edge": "양 끝은 숫자",
    "symbols-together": "기호가 이웃함",
    "no-equals": "등호 없음",
    "leading-zero": "앞자리 0",
    "no-value": "계산 불가",
    "not-true": "성립 안 함",
  } as Record<EquationRefusal | "ok", string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, turn: number) => `${round > 1 ? `다시 ${round - 1} · ` : ""}${turn === 0 ? "수식 만들기" : `${turn}턴`}`,
  /** In the list, beside a player: what they have done in the step being played. */
  status: { writing: "쓰는 중", done: "제출함" },
  /** Over the two boards, 135 pixels each. */
  board: {
    mine: "내 답안",
    theirs: "상대의 답안",
    of: (who: string) => `${who}의 답안`,
    secret: (equation: string) => `내 수식 ${equation}`,
    answerWas: (equation: string) => `정답 ${equation}`,
    noAnswer: "미제출",
  },
  /** Said in the bar for a moment. */
  say: {
    full: "아홉 칸이 다 찼습니다",
    createdForYou: "시간이 지나 방이 내 수식을 정했습니다",
    createdForThem: (who: string) => `${who} 님의 수식은 시간이 지나 방이 정했습니다`,
    noClues: "답안을 내지 못해 이번 턴의 힌트가 없습니다",
    again: "둘 다 맞혔습니다 · 새 수식으로 다시 합니다",
  },
  /** Over the boards while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    create: (left: number, clock: string) => timed(`상대가 맞힐 수식을 만드세요 · ${left}칸 남음`, clock),
    createWrong: (why: string, clock: string) => timed(why, clock),
    createReady: (clock: string) => timed(byInput("성립합니다 · Enter로 제출", "성립합니다 · 「제출」을 누르세요"), clock),
    created: (clock: string) => timed("상대가 수식을 만드는 중 · 다시 쓸 수 있습니다", clock),
    createOther: (clock: string) => timed("두 사람이 수식을 만드는 중", clock),
    guess: (left: number, clock: string) => timed(`상대의 수식을 맞혀 보세요 · ${left}칸 남음`, clock),
    guessReady: (clock: string) => timed(byInput("Enter로 답안 제출 (성립하지 않아도 됩니다)", "「제출」로 답안 제출 (성립하지 않아도 됩니다)"), clock),
    guessed: (clock: string) => timed("상대의 답안을 기다리는 중", clock),
    guessOther: (clock: string) => timed("두 사람이 답안을 쓰는 중", clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    write: "0~9 + - * / ^ = 쓰기 · Backspace 지우기",
  },
  /** The buttons of the bar. */
  button: {
    send: keyed("Enter", "제출"),
    redo: keyed("Enter", "다시 쓰기"),
    erase: "← 지우기",
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number): string => (round > 1 ? "둘 다 정답 · 새 수식으로 다시" : "수식 만들기"),
    created: (who: string, forced: boolean) => (forced ? `${who}: 방이 수식 정함` : `${who}: 수식 제출`),
    answered: (who: string) => `${who}: 답안 제출`,
    clues: (turn: number) => `${turn}턴 힌트 공개`,
    solved: (who: string) => `${who} 정답!`,
    missed: (who: string) => `${who}: 답안 미제출`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "종료" : `${place}위`),
    place: (place: number, who: string) => `${place}위 ${who}`,
    how: (turn: number) => `${turn}턴 만에 맞힘`,
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "수식 신호등: 규칙", tone: "title" },
    { text: `각자 ${n.cells}칸 수식을 몰래 만들고 (${koTime(n.createSeconds)}), 상대의 수식을 먼저 맞히면 승리.` },
    { text: "쓸 수 있는 것: 0~9와 + - × ÷ = ^(제곱). 여러 번 써도 됩니다." },
    { text: "수식은 성립해야 하고 등호는 하나 이상. 어느 쪽이든 식이어도 됩니다.", tone: "dim" },
    { text: "기호는 이웃할 수 없고 처음과 끝은 숫자. 05처럼 앞에 0을 못 붙입니다.", tone: "dim" },
    { text: "계산: 제곱 → 곱셈·나눗셈(왼쪽부터) → 덧셈·뺄셈(왼쪽부터).", tone: "dim" },
    { text: "" },
    { text: `턴마다 (${koTime(n.guessSeconds)}) 둘이 함께 ${n.cells}칸 답안을 냅니다. 성립하지 않아도 됩니다.` },
    { text: "둘 다 내면 칸마다 색깔 힌트와 함께 공개됩니다." },
    { text: "초록(꽉 찬 칸): 그 자리가 맞음.   노랑(테두리): 있지만 다른 자리." },
    { text: "빨강(어두운 칸): 없음. 수식에 있는 개수만큼만 초록·노랑이 됩니다." },
    { text: "시간 안에 내지 못하면 그 턴의 힌트가 없습니다.", tone: "dim" },
    { text: "" },
    { text: "상대의 수식을 그대로 낸 사람이 승리. 같은 턴에 둘 다 맞히면 다시." },
    { text: "수식을 시간 안에 못 만들면 방이 대신 정합니다.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Equation Traffic Light: rules",
    brief: {
      goal: "Use color clues to work out your opponent's nine-cell equation first.",
      play: "Each turn both submit an answer; every cell comes back red, yellow or green.",
      end: "Green: right position. Yellow: another position. Red: not in it.",
    },
    parts: [
      "For two players. First, in 5 minutes, each creates one nine-cell equation, hidden from the opponent. You may use the numbers 0 to 9 and the symbols +, -, ×, ÷, = and ^ (exponent), any of them more than once.",
      [
        "The equation must be mathematically valid. It has one equals symbol or more, and any side may be an expression. With more than one, every side must come to the same value (2+2=4=2^2).",
        "Two symbols may not be next to each other, and the equation begins and ends with a number. You must write × when multiplying, and a number must always follow the exponent symbol.",
        "A number may not be written with a leading zero (05, 012). A 0 alone is a number.",
        "The exponent is done first, then multiplication and division from the left, then addition and subtraction from the left. Exponents in a row go from the right (2^3^2 = 2^9). Division is exact, in fractions. An equation that divides by zero, or has 0^0, is not valid.",
        "If you have none in after 5 minutes, the room sets one for you, and tells both players so.",
      ],
      "Once both equations are in, each tries to guess the other's. Every turn you have 5 minutes to submit an answer of nine cells of the numbers and symbols. An answer does not need to be a valid equation. Once both answers are in, they are shown with a color clue on every cell.",
      [
        "Green: the number or symbol is in the correct position.",
        "Yellow: the number or symbol is in the opponent's equation, but in a different position.",
        "Red: the number or symbol is not in the opponent's equation.",
        "If your answer has several of something the equation has only one of, one of them is green or yellow by its position and the rest are red (with more in the equation, as many are marked as it has).",
        "If you do not submit an answer in time, you get no clues that turn.",
      ],
      "Whoever submits the opponent's equation wins. If both do on the same turn, you play again from new equations. If nobody submits an answer for three turns running, the game ends.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "wrong-length": "Fill all nine cells",
    "bad-symbol": "That has something that cannot be used",
    "symbol-at-edge": "An equation begins and ends with a number",
    "symbols-together": "Two symbols may not be next to each other",
    "no-equals": "An equation has at least one equals symbol",
    "leading-zero": "A number may not have a leading zero",
    "no-value": "That cannot be worked out (division by zero, 0^0, too large)",
    "not-true": "That equation is not valid",
    "not-creating": "Equations are not being created now",
    "not-guessing": "No answer is being taken now",
    "not-playing": "You are not a player of this game",
    "already-answered": "You have submitted this turn's answer",
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
    played: "Equation guessed",
    left: "The opponent left",
    abandoned: "Everyone left",
    stalled: "Nobody was answering",
  } as Record<EqEnd, string>,
  check: {
    ok: "valid",
    "wrong-length": "",
    "bad-symbol": "not usable",
    "symbol-at-edge": "edge symbol",
    "symbols-together": "two symbols",
    "no-equals": "needs an =",
    "leading-zero": "leading zero",
    "no-value": "no value",
    "not-true": "not valid",
  } as Record<EquationRefusal | "ok", string>,
  heading: (round, turn) => `${round > 1 ? `Again ${round - 1} · ` : ""}${turn === 0 ? "Equations" : `Turn ${turn}`}`,
  status: { writing: "writing", done: "submitted" },
  board: {
    mine: "Your answers",
    theirs: "Opponent's answers",
    of: (who) => `${who}'s answers`,
    secret: (equation) => `Yours ${equation}`,
    answerWas: (equation) => `It was ${equation}`,
    noAnswer: "no answer",
  },
  say: {
    full: "All nine cells are filled",
    createdForYou: "Time ran out: the room set your equation",
    createdForThem: (who) => `Time ran out: the room set ${who}'s equation`,
    noClues: "No answer from you: no clues this turn",
    again: "Both guessed correctly · play again from new equations",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for the players" : `Waiting for the players · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    create: (left, clock) => timed(`Create an equation for your opponent to guess · ${left} to go`, clock),
    createWrong: (why, clock) => timed(why, clock),
    createReady: (clock) => timed(byInput("It is valid · Enter submits it", "It is valid · press \"Submit\""), clock),
    created: (clock) => timed("Your opponent is creating an equation · you can rewrite yours", clock),
    createOther: (clock) => timed("Both players are creating equations", clock),
    guess: (left, clock) => timed(`Guess your opponent's equation · ${left} to go`, clock),
    guessReady: (clock) => timed(byInput("Enter submits your answer (it need not be valid)", "\"Submit\" sends your answer (it need not be valid)"), clock),
    guessed: (clock) => timed("Waiting for your opponent's answer", clock),
    guessOther: (clock) => timed("Both players are writing answers", clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    write: "Keys 0-9 + - * / ^ = · Backspace",
  },
  button: {
    send: keyed("Enter", "Submit"),
    redo: keyed("Enter", "Rewrite"),
    erase: "← Erase",
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round) => (round > 1 ? "Both correct · play again" : "Creating equations"),
    created: (who, forced) => (forced ? `${who}: set by room` : `${who}: equation in`),
    answered: (who) => `${who}: answer in`,
    clues: (turn) => `Turn ${turn}: color clues`,
    solved: (who) => `${who} is correct!`,
    missed: (who) => `${who}: no answer`,
  },
  result: {
    verdict: (seated, place) => (!seated || place === null ? "Over" : englishOrdinal(place)),
    place: (place, who) => `${englishOrdinal(place)} ${who}`,
    how: (turn) => (turn === 1 ? "Guessed on the first turn" : `Guessed in ${turn} turns`),
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Equation Traffic Light: rules", tone: "title" },
    { text: `Each creates a hidden ${n.cells}-cell equation (${enTime(n.createSeconds)}). Guess theirs first.` },
    { text: "Use 0 to 9 and + - × ÷ = ^ (exponent), any of them more than once." },
    { text: "It must be valid, with one = or more. Any side may be a sum.", tone: "dim" },
    { text: "No two symbols together; numbers at both ends; no leading zero.", tone: "dim" },
    { text: "Order: exponent, then × ÷ from the left, then + - from the left.", tone: "dim" },
    { text: "" },
    { text: `Each turn (${enTime(n.guessSeconds)}) both submit ${n.cells} cells. An answer need not be valid.` },
    { text: "Once both are in, they are shown with a color clue on every cell." },
    { text: "Green (filled): correct position.   Yellow (outline): elsewhere." },
    { text: "Red (dark): not in it. Only as many are marked as the equation has." },
    { text: "No answer in time: no clues that turn.", tone: "dim" },
    { text: "" },
    { text: "Submit the opponent's equation to win. Both at once: play again." },
    { text: "No equation in time: the room sets one for you.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

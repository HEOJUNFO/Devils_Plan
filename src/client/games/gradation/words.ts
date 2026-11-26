/**
 * The words of 그라데이션 (Gradation), in each language (`lang.ts`): its rules
 * as the page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Gradation, cube cup, number cube, to distribute, to submit, first player,
 * round, match, rematch, black, dark gray, light gray and white. The Korean
 * ones are the wiki's (큐브 통, 숫자 큐브, 선 플레이어, 대결, 재대결); the
 * Korean names of the four shades are plain ones, the show's own not having
 * been found (design/games/gradation.md).
 */
import type { GradEnd } from "../../../shared/games/gradation/rules";
import { enTime, englishOrdinal, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many cups a player has, the highest number on a cube, and how many cubes there are of a number. */
  cups: number;
  highest: number;
  copies: number;
  /** The most the numbers in the cups may add up to. */
  maxSum: number;
  /** How many matches in a row win the game of three. */
  winsInARow: number;
  /** The most matches a game has. */
  maxMatches: number;
  /** Seconds to distribute the cubes, and seconds the room gives a cup (0 for no limit). */
  arrangeSeconds: number;
  turnSeconds: number;
}


/** A line of the bar with the step's clock after it, where the step has one. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "그라데이션: 규칙",
    brief: {
      goal: "숫자 큐브를 통 일곱 개에 숨겨 담고, 한 통씩 내어 큰 수로 이깁니다.",
      play: "상대는 내가 낸 통의 색만 봅니다. 양 끝이 검고 가운데가 흰 통입니다.",
      end: "일곱 라운드 뒤 승점이 높으면 대결 승리. 셋이면 2연승하면 끝납니다.",
    },
    parts: [
      "각자 큐브 통 7개와 숫자 큐브 20개(0~9가 2개씩)를 받습니다. 통은 양 끝이 검정이고 가운데로 갈수록 밝아집니다: 검정, 짙은 회색, 옅은 회색, 흰색, 옅은 회색, 짙은 회색, 검정. 게임은 1:1 대결로 합니다.",
      [
        "담기: 2분 30초 안에 통마다 숫자 큐브를 1개씩, 상대 몰래 담습니다. 담은 수의 합은 30 이하여야 하고, 왼쪽 통에서 오른쪽으로 갈수록 수가 같거나 커져야 합니다. 시간 안에 담지 못하면 방이 규칙에 맞게 무작위로 담습니다.",
        "라운드: 선 플레이어가 통 하나를 냅니다. 상대에게는 그 통의 색만 보이고, 몇 번째 통인지는 보이지 않습니다. 이어서 상대도 통 하나를 냅니다.",
        "공개: 둘 다 내면 수를 공개합니다. 큰 쪽이 1점입니다. 같으면 아무도 점수를 얻지 못합니다.",
        "선 플레이어: 직전 라운드를 이긴 사람이 다음 라운드의 선입니다. 비기면 바뀌지 않습니다.",
        "대결: 통 하나는 한 번만 냅니다. 7라운드가 끝났을 때 승점이 높은 쪽이 대결을 이기고, 남은 라운드로 뒤집을 수 없게 되면 거기서 끝납니다. 승점이 같으면 큐브를 새로 담아 재대결합니다.",
        "통을 내는 시간은 방장이 대기실에서 정합니다. 지나면 방이 남은 통 가운데 하나를 무작위로 냅니다.",
      ],
      "세 사람이면 방송대로 합니다. 추첨으로 1번과 2번이 첫 대결을 하고 1번이 선입니다. 대결을 이긴 사람이 남아, 기다리던 사람과 다음 대결을 합니다. 이긴 사람이 그 대결 1라운드의 선이고, 대결마다 큐브를 새로 담습니다. 2연승한 사람이 1위이고 나머지 두 사람은 공동 2위입니다. 두 사람이면 대결 한 번으로 정합니다.",
      "대결은 재대결을 포함해 6번까지 합니다. 여섯 번째 대결이 끝나도 승부가 나지 않으면 대결을 많이 이긴 순서로 순위를 정하고, 이긴 수가 같으면 순위도 같습니다. 방송에는 없는 한도입니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "wrong-count": "통마다 큐브를 하나씩 담아야 합니다",
    "bad-cube": "그런 숫자 큐브는 없습니다",
    "too-many-of-one": "그 숫자의 큐브가 모자랍니다",
    "over-sum": "담은 수의 합이 너무 큽니다",
    "not-ascending": "왼쪽에서 오른쪽으로 수가 같거나 커져야 합니다",
    "not-arranging": "지금은 큐브를 담는 때가 아닙니다",
    "not-submitting": "지금은 통을 내는 때가 아닙니다",
    "not-playing": "이번 대결에는 나서지 않습니다",
    "not-your-turn": "내 차례가 아닙니다",
    "cup-used": "이미 낸 통입니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "too-many": "세 명까지만 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "승부가 나서 끝",
    limit: "대결 한도까지 해서 끝",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<GradEnd, string>,
  /** The shades of a cup, from the ends to the middle. */
  shade: ["검정", "짙은 회색", "옅은 회색", "흰색"],
  /** The column's heading, with the clock beside it. */
  heading: (match: number, round: number, rounds: number) => (round === 0 ? `대결 ${match} · 담는 중` : `대결 ${match} · ${round}/${rounds}R`),
  /** In the list, beside a player: their points in the match, waiting for its winner, and matches won in a row. */
  points: (points: number) => `${points}점`,
  waiting: "대기",
  row: (wins: number) => `${wins}승`,
  /** In the scene. */
  scene: {
    round: "R",
    mine: "내 통",
    sum: (sum: number, most: number) => `합 ${sum}/${most}`,
    tray: "숫자 큐브",
    left: (who: string) => `${who}의 남은 통`,
    firstMark: "선",
    arranging: "두 사람이 큐브를 담는 중",
    shown: (who: string, shade: string) => `${who}: ${shade} 통을 냈습니다`,
    revealWin: (who: string, high: number, low: number) => `${high} 대 ${low} · ${who} 1점`,
    revealTie: (value: number) => `${value} 대 ${value} · 무승부`,
    matchWon: (who: string, a: number, b: number) => `${who} 대결 승리 (${a}:${b})`,
    matchTied: (points: number, last: boolean) => (last ? `${points}:${points} 동점` : `${points}:${points} 동점 · 재대결`),
    waitNext: "이 대결의 승자와 다음 대결을 합니다",
    waitLast: "마지막 대결입니다 · 끝나면 대결 승수로 순위",
    watching: "두 사람의 통 안은 보이지 않습니다",
    matches: "지난 대결",
    match: (match: number, a: string, b: string, x: number, y: number) => `${match}. ${a} ${x}:${y} ${b}`,
  },
  /** Said in the bar for a moment. */
  say: {
    cubesGone: "그 숫자의 큐브는 다 썼습니다",
    cupsFull: "통이 다 찼습니다. 통을 눌러 큐브를 빼세요",
    notFull: (left: number) => `통을 다 채워야 합니다 · ${left}개 남음`,
    overSum: (sum: number, most: number) => `합이 ${sum}입니다. ${most} 이하여야 합니다`,
    cupUsed: "이미 낸 통입니다",
    arrangedForYou: "시간이 지나 방이 큐브를 담았습니다",
    cupForYou: "시간이 지나 방이 통을 냈습니다",
  },
  /** Over the cups while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    arrange: (left: number, clock: string) => timed(`통에 담을 숫자 큐브를 고르세요 · ${left}개 남음`, clock),
    arrangeFull: (clock: string) => timed(byInput("다 담았으면 Enter", "다 담았으면 「다 담았다」"), clock),
    arrangeOver: (sum: number, most: number, clock: string) => timed(`합이 ${sum}입니다 · ${most} 이하가 되게 통을 눌러 큐브를 바꾸세요`, clock),
    arranged: (clock: string) => timed("상대가 담기를 기다리는 중 · 다시 담을 수 있습니다", clock),
    arrangeOther: (clock: string) => timed("두 사람이 큐브를 담는 중", clock),
    submit: (clock: string) => timed("선 플레이어입니다 · 낼 통을 고르세요", clock),
    submitSecond: (shade: string, clock: string) => timed(`상대가 ${shade} 통을 냈습니다 · 낼 통을 고르세요`, clock),
    submitReady: (cup: number, clock: string) => timed(byInput(`${cup}번 통 · Enter로 냅니다`, `${cup}번 통 · 「내기」로 냅니다`), clock),
    submitOther: (who: string, clock: string) => timed(`${who} 님이 통을 고르는 중`, clock),
    reveal: "수를 공개했습니다",
    between: (seconds: number, rematch: boolean) => (rematch ? `동점 · ${seconds}초 뒤 재대결` : `${seconds}초 뒤 다음 대결`),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    arrange: "0~9: 담기 · Backspace: 빼기 · H: 규칙",
    submit: "1~7·방향키: 통 고르기 · Enter: 내기 · H: 규칙",
  },
  /** The buttons of the bar. */
  button: {
    done: keyed("Enter", "다 담았다"),
    redo: keyed("Enter", "다시 담기"),
    clear: keyed("C", "비우기"),
    submit: keyed("Enter", "내기"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    match: (match: number, rematch: boolean, last: boolean) => (last ? `대결 ${match} 시작 (마지막)` : rematch ? `대결 ${match} 시작 (재대결)` : `대결 ${match} 시작`),
    arranged: (who: string, forced: boolean) => (forced ? `${who}: 시간 초과` : `${who}: 다 담음`),
    submitted: (who: string, shade: string) => `${who}: ${shade} 통`,
    revealed: (round: number, who: string | null) => (who === null ? `${round}R 무승부` : `${round}R ${who} 1점`),
    won: (who: string, row: number) => (row > 1 ? `${who} 대결 승리 · ${row}연승` : `${who} 대결 승리`),
    tied: (last: boolean): string => (last ? "동점" : "동점 · 재대결"),
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string) => `${place}위 ${who}`,
    how: (matches: number) => `대결 ${matches}번으로 끝`,
    limit: (matches: number) => `대결 ${matches}번을 모두 해 대결 승수로 순위`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "그라데이션: 규칙", tone: "title" },
    { text: `숫자 큐브를 통 ${n.cups}개에 숨겨 담고, 한 통씩 내어 큰 수로 이기는 1:1 대결.` },
    { text: `큐브는 0~${n.highest}가 ${n.copies}개씩. 통은 양 끝이 검고 가운데로 갈수록 밝습니다.` },
    { text: `담기 (${koTime(n.arrangeSeconds)}): 통마다 큐브 1개. 담은 수의 합은 ${n.maxSum} 이하.` },
    { text: "왼쪽에서 오른쪽으로 갈수록 수가 같거나 커야 합니다.", tone: "dim" },
    { text: "라운드: 선 플레이어가 통 하나를 내고, 이어서 상대가 냅니다." },
    { text: "상대는 낸 통의 색만 봅니다. 몇 번째 통인지는 보이지 않습니다.", tone: "dim" },
    { text: "둘 다 내면 수를 공개합니다. 큰 수가 1점, 같으면 점수 없음." },
    { text: "라운드를 이긴 사람이 다음 라운드의 선. 비기면 그대로.", tone: "dim" },
    { text: `${n.cups}라운드 뒤 승점이 높으면 대결 승리. 뒤집을 수 없으면 거기서 끝.` },
    { text: "승점이 같으면 큐브를 새로 담아 재대결합니다.", tone: "dim" },
    { text: "세 명: 이긴 사람이 남아, 기다리던 사람과 선 플레이어로 대결합니다." },
    { text: `${n.winsInARow}연승하면 1위. 두 명이면 대결 한 번으로 정합니다.`, tone: "dim" },
    { text: `대결은 ${n.maxMatches}번까지. 그래도 정해지지 않으면 대결을 많이 이긴 순서로 순위.` },
    { text: n.turnSeconds > 0 ? `통을 내는 시간 ${koTime(n.turnSeconds)}. 지나면 남은 통 하나가 무작위로 나갑니다.` : "통을 내는 시간 제한 없음 (방장이 대기실에서 정합니다).", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Gradation: rules",
    brief: {
      goal: "Hide number cubes in seven cups, then win rounds with the higher one.",
      play: "Your opponent sees only the shade of a cup: black ends, white middle.",
      end: "More points after seven rounds wins a match. Of three, two in a row wins.",
    },
    parts: [
      "Each player has 7 cube cups and 20 number cubes, two of each number from 0 to 9. The cups are black at both ends and lighter toward the middle: black, dark gray, light gray, white, light gray, dark gray, black. The game is a series of one-on-one matches.",
      [
        "Distributing: in 2 minutes 30 seconds, put one number cube in each cup, unseen by your opponent. The numbers may add up to 30 at most, and from the left cup to the right each must be equal to or higher than the one before. If you are not done in time, the room distributes cubes at random within the rules.",
        "A round: the first player submits one cup. The opponent sees only its shade, not which of the cups it was. Then the opponent submits one.",
        "Reveal: once both are in, the numbers are revealed. The higher scores one point. If they are equal, nobody scores.",
        "First player: the winner of a round is the first player of the next. A tie changes nothing.",
        "A match: a cup is submitted once. After 7 rounds the player with more points wins the match, and it ends early once one cannot be caught. If the points are level, cubes are distributed anew for a rematch.",
        "The host sets the time for a cup in the waiting room. After that the room submits one of your cups left at random.",
      ],
      "With three players it goes as in the show. By draw, numbers one and two play the first match, number one as the first player. The winner of a match stays and plays whoever waited. The winner is the first player of that match's first round, and cubes are distributed anew for every match. Two consecutive wins make first place, and the other two share second. With two players one match decides.",
      "A game has 6 matches at most, rematches included. If the sixth leaves it undecided, players are placed by the matches they won, and equal wins share a place. The show has no such limit.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "wrong-count": "Every cup takes one cube",
    "bad-cube": "There is no such number cube",
    "too-many-of-one": "There are no more cubes of that number",
    "over-sum": "The numbers add up to too much",
    "not-ascending": "From left to right, each number must be equal or higher",
    "not-arranging": "Cubes are not being distributed now",
    "not-submitting": "No cup is being submitted now",
    "not-playing": "You are not in this match",
    "not-your-turn": "It is not your turn",
    "cup-used": "That cup has been submitted",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "too-many": "It takes three players at most",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    played: "The game is decided",
    limit: "Match limit reached",
    left: "Too few players left",
    abandoned: "Everyone left",
  } as Record<GradEnd, string>,
  shade: ["black", "dark gray", "light gray", "white"],
  heading: (match, round, rounds) => (round === 0 ? `Match ${match} · cubes` : `Match ${match} · R${round}/${rounds}`),
  points: (points) => `${points} pt`,
  waiting: "waits",
  row: (wins) => `${wins} won`,
  scene: {
    round: "R",
    mine: "Your cups",
    sum: (sum, most) => `Total ${sum}/${most}`,
    tray: "Number cubes",
    left: (who) => `${who}: cups left`,
    firstMark: "1st",
    arranging: "Both are distributing cubes",
    shown: (who, shade) => `${who} submitted a ${shade} cup`,
    revealWin: (who, high, low) => `${high} to ${low} · ${who} scores`,
    revealTie: (value) => `${value} to ${value} · a tie`,
    matchWon: (who, a, b) => `${who} wins the match (${a}:${b})`,
    matchTied: (points, last) => (last ? `${points}:${points}, level` : `${points}:${points}, level · rematch`),
    waitNext: "You play the winner of this match next",
    waitLast: "The last match · then placed by matches won",
    watching: "Nobody sees inside the two players' cups",
    matches: "Matches so far",
    match: (match, a, b, x, y) => `${match}. ${a} ${x}:${y} ${b}`,
  },
  say: {
    cubesGone: "No cubes of that number are left",
    cupsFull: "The cups are full. Press a cup to take its cube out",
    notFull: (left) => `Fill every cup first · ${left} to go`,
    overSum: (sum, most) => `The total is ${sum}. It must be ${most} or less`,
    cupUsed: "That cup has been submitted",
    arrangedForYou: "Time ran out: the room distributed your cubes",
    cupForYou: "Time ran out: the room submitted a cup",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for the players" : `Waiting for the players · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    arrange: (left, clock) => timed(`Pick number cubes for your cups · ${left} to go`, clock),
    arrangeFull: (clock) => timed(byInput("Enter when you are done", "Press \"Done\" when you are done"), clock),
    arrangeOver: (sum, most, clock) => timed(`The total is ${sum} · press a cup to swap cubes until it is ${most} or less`, clock),
    arranged: (clock) => timed("Waiting for your opponent · you can distribute again", clock),
    arrangeOther: (clock) => timed("Both players are distributing cubes", clock),
    submit: (clock) => timed("You are the first player · pick a cup to submit", clock),
    submitSecond: (shade, clock) => timed(`Your opponent submitted a ${shade} cup · pick yours`, clock),
    submitReady: (cup, clock) => timed(byInput(`Cup ${cup} · Enter submits it`, `Cup ${cup} · "Submit" sends it`), clock),
    submitOther: (who, clock) => timed(`${who} is picking a cup`, clock),
    reveal: "The numbers are revealed",
    between: (seconds, rematch) => (rematch ? `Level · rematch in ${seconds} s` : `Next match in ${seconds} s`),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    arrange: "0-9: add · Backspace: undo · H: rules",
    submit: "1-7, arrows: pick a cup · Enter: submit · H: rules",
  },
  button: {
    done: keyed("Enter", "Done"),
    redo: keyed("Enter", "Redo"),
    clear: keyed("C", "Clear"),
    submit: keyed("Enter", "Submit"),
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    match: (match, rematch, last) => (last ? `Match ${match} (the last)` : rematch ? `Match ${match} (rematch)` : `Match ${match}`),
    arranged: (who, forced) => (forced ? `${who}: time out` : `${who}: done`),
    submitted: (who, shade) => `${who}: ${shade} cup`,
    revealed: (round, who) => (who === null ? `R${round}: a tie` : `R${round}: ${who} scores`),
    won: (who, row) => (row > 1 ? `${who}: ${row} in a row` : `${who} wins the match`),
    tied: (last) => (last ? "Level" : "Level · rematch"),
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who) => `${englishOrdinal(place)} ${who}`,
    how: (matches) => (matches === 1 ? "Decided in 1 match" : `Decided in ${matches} matches`),
    limit: (matches) => `All ${matches} matches played: placed by wins`,
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Gradation: rules", tone: "title" },
    { text: `Hide number cubes in ${n.cups} cups, then win rounds with the higher.` },
    { text: `Cubes: ${n.copies} each of 0 to ${n.highest}. Cups: black at the ends, lighter inward.` },
    { text: `Distribute (${enTime(n.arrangeSeconds)}): one cube a cup, a total of ${n.maxSum} at most.` },
    { text: "From left to right each number is equal to or higher than the last.", tone: "dim" },
    { text: "A round: the first player submits a cup, then the opponent." },
    { text: "The opponent sees only the cup's shade, not which cup it was.", tone: "dim" },
    { text: "Both in: the numbers are revealed. Higher scores 1; a tie, none." },
    { text: "A round's winner is the next first player. A tie changes nothing.", tone: "dim" },
    { text: `More points after ${n.cups} rounds wins the match. It ends once decided.` },
    { text: "Level on points: new cubes, and a rematch.", tone: "dim" },
    { text: "Of three, the winner stays as first player against whoever waited." },
    { text: `${n.winsInARow} wins in a row is first place. Two players: one match decides.`, tone: "dim" },
    { text: `${n.maxMatches} matches at most. Undecided by then: placed by matches won.` },
    { text: n.turnSeconds > 0 ? `${enTime(n.turnSeconds)} for a cup. After that one of your cups goes at random.` : "No time limit for a cup (the host sets one in the waiting room).", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

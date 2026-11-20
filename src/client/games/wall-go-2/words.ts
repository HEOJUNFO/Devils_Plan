/**
 * The words of 벽바둑Ⅱ (Wall Go II), in each language (`lang.ts`): its rules
 * as the page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Wall Go II, square counter and round counter, to place a wall, the wall
 * breaker, territory, squares. The show calls its two games rounds.
 */
import type { Dir, Kind, WallEnd } from "../../../shared/games/wall-go-2/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many squares the board has. */
  squares: number;
  /** How far a square counter goes. */
  reach: number;
  /** How many counters of each kind a player has in the round of three, and in the round of two. */
  three: number;
  two: number;
  /** Seconds the room gives a turn; 0 for no limit. */
  turnSeconds: number;
}

/** Seconds as the sheet says them: whole minutes where they are, seconds otherwise. */
const koTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`);
const enTime = (seconds: number): string => (seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

/** A line of the bar with the turn's clock after it, where the turn has one. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "벽바둑Ⅱ: 규칙",
    brief: {
      goal: "벽을 세워, 내 말이 든 영역을 가장 넓게 만듭니다.",
      play: "차례마다 내 말 하나를 움직이고, 그 말 옆에 벽을 세웁니다.",
      end: "말들이 벽으로 서로 갈리면 끝. 영역의 칸 수가 점수입니다.",
    },
    parts: [
      "가로세로 7칸, 49칸의 판에서 합니다. 말은 두 가지입니다. 사각 말은 상하좌우 한 방향으로 1~2칸 갑니다. 원형 말은 상하좌우로 1칸 가고, 거기서 왼쪽이나 오른쪽으로 꺾어 1칸 더 갈 수 있습니다. 다른 말이 있는 칸으로는 갈 수 없고 넘어갈 수도 없으며, 벽이 막은 방향으로는 갈 수 없습니다. 제자리에 둘 수는 없습니다.",
      [
        "말 놓기: 선부터 차례로 원하는 빈칸에 말을 하나씩 놓고, 다음 말은 역순으로 놓습니다.",
        "차례: 내 말 하나를 골라 움직인 다음, 방금 움직인 말의 상하좌우 면 가운데 한 곳에 반드시 벽을 세웁니다. 이미 벽이 있는 면과 판의 테두리에는 세울 수 없습니다. 움직일 수 있는 말이 하나도 없으면 벽만 세웁니다.",
        "끝: 서로 다른 사람의 말이 한 영역에 함께 있는 일이 없어지면 바로 끝납니다.",
        "점수: 내 말이 든 영역의 칸 수를 더합니다. 같으면 그 가운데 더 넓은 영역을 견줍니다. 말이 없는 영역은 누구의 것도 아닙니다.",
        "시간이 지나면 말은 움직이지 않고, 방이 무작위로 벽을 세웁니다. 차례 시간은 방장이 대기실에서 정합니다 (방송은 90초).",
      ],
      "세 사람이면 방송대로 2라운드로 합니다. 1라운드는 3인전입니다. 각자 사각 말 1개와 원형 말 1개를 놓고, 게임 중 단 한 번 벽 부수기를 쓸 수 있습니다: 가는 길에 있는 벽 하나를 부수고 지나갑니다. 가장 넓은 사람이 1위로 확정되고, 나머지 두 사람이 2라운드를 합니다. 2라운드는 1:1입니다. 각자 사각 말 2개와 원형 말 2개이고, 원형 말은 정해진 자리에서 시작합니다. 벽 부수기는 없고, 1라운드에서 더 넓게 차지한 사람이 먼저 둡니다. 두 사람이면 2라운드의 규칙으로 한 판을 합니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-your-turn": "내 차례가 아닙니다",
    "not-placing": "지금은 말을 놓는 때가 아닙니다",
    "not-moving": "지금은 말을 움직이는 때가 아닙니다",
    "not-walling": "지금은 벽을 세우는 때가 아닙니다",
    "square-taken": "그 칸에는 놓을 수 없습니다",
    "kind-placed": "그 말은 이미 다 놓았습니다",
    "not-your-counter": "내 말이 아닙니다",
    "bad-move": "그 칸으로는 갈 수 없습니다",
    "wall-in-the-way": "벽이 막고 있습니다",
    "nothing-to-break": "부술 벽이 없는 길입니다",
    "must-move": "움직일 수 있는 말이 있습니다. 먼저 말을 움직이세요",
    "wall-there": "그 면에는 벽을 세울 수 없습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "이번 라운드에는 두지 않습니다",
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
  /** How a match ended, as the bar and the log say it. */
  ended: {
    played: "영역이 모두 갈려 끝",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<WallEnd, string>,
  /** The two kinds of counter, and the sides of a square. */
  kind: { square: "사각 말", round: "원형 말" } as Record<Kind, string>,
  side: { up: "위", right: "오른쪽", down: "아래", left: "왼쪽" } as Record<Dir, string>,
  /** The column's heading, with the clock beside it: which round of how many, and how many play it. */
  heading: (stage: number, stages: number, three: boolean) => (stages === 1 ? "1:1" : `${stage}라운드 · ${three ? "3인전" : "1:1"}`),
  /** Beside the board, 88 pixels: how each kind goes, and what a player holds. */
  legend: { square: "곧게 1~2칸", round: "1칸+꺾어 1칸", territory: "영역", breaker: "벽 부수기" },
  squares: (count: number) => `${count}칸`,
  /** In the list, beside a player: first of three and out of the second round; watching the round. */
  safe: "1위 확정",
  /** Said in the bar for a moment. */
  say: {
    pickEmpty: "빈칸을 고르세요",
    notYours: "내 말을 고르세요",
    cantGo: "그 칸으로는 갈 수 없습니다",
    wallThere: "그 면에는 벽을 세울 수 없습니다",
    breakerGone: "벽 부수기는 이미 썼습니다",
    noBreaker: "이 라운드에는 벽 부수기가 없습니다",
    nothingToBreak: "부수고 갈 수 있는 길이 없습니다",
    breakerUsed: (who: string) => `${who} 님이 벽 부수기를 썼습니다`,
    placedForYou: "시간이 지나 방이 말을 놓았습니다",
    wallForYou: "시간이 지나 방이 벽을 세웠습니다",
  },
  /** Over the board while the match stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** Over the board between the two rounds. */
  between: (who: string, squares: number) => `${who} ${squares}칸 · 1위 확정`,
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    place: (kind: string, clock: string) => timed(`${kind}을 놓을 빈칸을 고르세요`, clock),
    placeOther: (who: string, clock: string) => timed(`${who} 님이 말을 놓는 중`, clock),
    move: (clock: string) => timed("움직일 내 말을 고르세요", clock),
    moveTo: (clock: string) => timed("갈 칸을 고르세요 (점이 찍힌 칸)", clock),
    breaker: (clock: string) => timed("벽 부수기: 부수고 갈 칸을 고르세요 (빨간 점)", clock),
    breakerReady: (clock: string, ways: number) =>
      timed(ways > 1 ? "빨간 벽을 부수고 갑니다 · 같은 칸을 또 누르면 다른 벽" : byInput("빨간 벽을 부수고 갑니다 · Enter로 확정", "빨간 벽을 부수고 갑니다 · 「이동」으로 확정"), clock),
    stuck: (clock: string) => timed("움직일 수 있는 말이 없습니다 · 벽만 세웁니다: 내 말 옆의 면을 고르세요", clock),
    wall: (clock: string) => timed("움직인 말 옆, 벽을 세울 면을 고르세요", clock),
    wallReady: (side: string, clock: string) => timed(`${side}에 벽 · Enter로 세웁니다`, clock),
    moveOther: (who: string, clock: string) => timed(`${who} 님의 차례 · 말 이동`, clock),
    wallOther: (who: string, clock: string) => timed(`${who} 님의 차례 · 벽 설치`, clock),
    between: (seconds: number) => `1라운드 끝 · ${seconds}초 뒤 나머지 두 사람의 2라운드`,
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    board: "방향키: 칸 이동 · Enter: 고르기 · Esc: 취소 · H: 규칙",
    place: "방향키·Enter: 놓기 · H: 규칙",
    wall: "방향키: 면 고르기 · Enter: 벽 세우기 · H: 규칙",
  },
  /** The buttons of the bar. */
  button: {
    kind: (key: string, kind: string) => keyed(key, kind),
    breaker: keyed("B", "벽 부수기"),
    breakerOff: keyed("B", "부수기 취소"),
    confirm: keyed("Enter", "이동"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    stage: (stage: number, three: boolean) => `${stage}라운드 시작 (${three ? "3인전" : "1:1"})`,
    placed: (who: string, kind: string) => `${who}: ${kind} 놓음`,
    moved: (who: string, kind: string) => `${who}: ${kind} 이동`,
    broke: (who: string) => `${who}: 벽 부수고 이동`,
    wall: (who: string) => `${who}: 벽 설치`,
    wallForced: (who: string) => `${who}: 시간 초과, 벽`,
    passed: (who: string) => `${who}: 둘 곳이 없어 넘김`,
    scored: (who: string, squares: number) => `${who} ${squares}칸`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string) => `${place}위 ${who}`,
    mine: (rounds: { stage: number; squares: number }[]) => (rounds.length === 1 ? `내 영역 ${rounds[0].squares}칸` : `내 영역 · ${rounds.map((each) => `${each.stage}라운드 ${each.squares}칸`).join(" · ")}`),
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "벽바둑Ⅱ: 규칙", tone: "title" },
    { text: `${n.squares}칸의 판에 벽을 세워, 내 말이 든 영역을 가장 넓게 만듭니다.` },
    { text: `사각 말: 상하좌우 한 방향으로 1~${n.reach}칸.` },
    { text: "원형 말: 1칸, 또는 1칸 간 뒤 왼쪽이나 오른쪽으로 꺾어 1칸 더." },
    { text: "다른 말이 있는 칸과 벽 너머로는 못 갑니다. 제자리에 둘 수 없습니다.", tone: "dim" },
    { text: "차례: 내 말 하나를 움직이고, 그 말의 네 면 중 한 곳에 벽을 세웁니다." },
    { text: "움직일 말이 없으면 벽만 세웁니다. 판의 테두리는 처음부터 벽입니다.", tone: "dim" },
    { text: "서로 다른 사람의 말이 벽으로 완전히 갈리면 바로 끝납니다." },
    { text: "점수: 내 말이 든 영역의 칸 수 합. 같으면 더 넓은 영역을 견줍니다." },
    { text: "" },
    { text: `1라운드 (3인전): 사각 ${n.three}개, 원형 ${n.three}개. 차례로, 다음 말은 역순으로 놓습니다.` },
    { text: "벽 부수기: 각자 한 번, 가는 길의 벽 하나를 부수고 지나갑니다.", tone: "dim" },
    { text: "가장 넓은 사람이 1위 확정. 나머지 두 사람이 2라운드를 합니다.", tone: "dim" },
    { text: `2라운드 (1:1): 사각 ${n.two}개, 원형 ${n.two}개. 원형 말은 정해진 자리. 벽 부수기 없음.` },
    { text: n.turnSeconds > 0 ? `차례마다 ${koTime(n.turnSeconds)}. 지나면 말은 그대로, 벽이 무작위로 세워집니다.` : "차례 시간 제한 없음 (방장이 대기실에서 정합니다).", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Wall Go II: rules",
    brief: {
      goal: "Wall off the largest territory around your counters.",
      play: "Each turn, move one counter, then place a wall beside it.",
      end: "When walls part everyone, your territory's squares score.",
    },
    parts: [
      "The board is 7 by 7, 49 squares. There are two kinds of counter. A square counter moves 1 or 2 squares in a straight line, up, down, left or right. A round counter moves 1 square up, down, left or right, and may then turn left or right for 1 more. A counter cannot move onto or through another counter, nor through a wall. It cannot stay where it is.",
      [
        "Placing: from the first player on, each places one counter on any empty square; the next counter is placed in the reverse order.",
        "A turn: move one of your counters, then you must place a wall on one of the four sides of the counter you just moved. Not on a side that has a wall, and not on the edge of the board. If none of your counters can move, you only place a wall.",
        "The end: as soon as no territory holds counters of two different players, the game ends.",
        "Scoring: add up the squares of the territories your counters are in. If level, compare the larger of those territories. A territory with no counter in it is nobody's.",
        "When the time runs out, no counter is moved and the room places a wall at random. The host sets the turn time in the waiting room (the show's is 90 seconds).",
      ],
      "With three players the match is the show's two rounds. Round 1 is played by all three. Each places 1 square counter and 1 round counter, and may use the wall breaker once in the game: break one wall on your way and move through it. Whoever has the largest territory is first, and the other two play round 2. Round 2 is one on one. Each has 2 square counters and 2 round counters, and the round counters start on set squares. There is no wall breaker, and whoever had more territory in round 1 goes first. With two players the match is one game by the rules of round 2.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-your-turn": "It is not your turn",
    "not-placing": "Counters are not being placed now",
    "not-moving": "This is not the time to move a counter",
    "not-walling": "This is not the time to place a wall",
    "square-taken": "A counter cannot be placed there",
    "kind-placed": "All of those counters are placed",
    "not-your-counter": "That is not your counter",
    "bad-move": "The counter cannot move there",
    "wall-in-the-way": "A wall is in the way",
    "nothing-to-break": "There is no wall to break on that way",
    "must-move": "One of your counters can move. Move first",
    "wall-there": "A wall cannot be placed on that side",
    "bad-action": "That cannot be done",
    "game-over": "This match is over",
    "not-playing": "You do not play in this round",
    "not-seated": "You are watching, not playing",
    "no-game": "No match is being played",
    "not-host": "Only the host can start a new match",
    "too-few": "It takes two players or more",
    "too-many": "It takes three players at most",
    "already-playing": "A match is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    played: "Every territory is parted",
    left: "Too few players left",
    abandoned: "Everyone left",
  } as Record<WallEnd, string>,
  kind: { square: "Square counter", round: "Round counter" } as Record<Kind, string>,
  side: { up: "above", right: "on the right", down: "below", left: "on the left" } as Record<Dir, string>,
  heading: (stage, stages, three) => (stages === 1 ? "One on one" : `Round ${stage} · ${three ? "3 players" : "1 on 1"}`),
  legend: { square: "1-2 straight", round: "1, turn, 1", territory: "Territory", breaker: "Wall breaker" },
  squares: (count) => `${count} sq`,
  safe: "1st, safe",
  say: {
    pickEmpty: "Pick an empty square",
    notYours: "Pick one of your counters",
    cantGo: "The counter cannot move there",
    wallThere: "A wall cannot be placed on that side",
    breakerGone: "You have used your wall breaker",
    noBreaker: "There is no wall breaker in this round",
    nothingToBreak: "No way through a wall from here",
    breakerUsed: (who) => `${who} has used the wall breaker`,
    placedForYou: "Time ran out: the room placed a counter",
    wallForYou: "Time ran out: the room placed a wall",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for the players" : `Waiting for the players · ${seconds} s`),
  between: (who, squares) => `${who}: ${squares} squares · 1st`,
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The match is over",
    paused: "The match is paused",
    sending: "Sending",
    place: (kind, clock) => timed(`Pick an empty square for your ${kind.toLowerCase()}`, clock),
    placeOther: (who, clock) => timed(`${who} is placing a counter`, clock),
    move: (clock) => timed("Pick one of your counters to move", clock),
    moveTo: (clock) => timed("Pick a square to move to (the dotted ones)", clock),
    breaker: (clock) => timed("Wall breaker: pick a square behind a wall (red dots)", clock),
    breakerReady: (clock, ways) => timed(ways > 1 ? "Breaks the red wall · press the square again for the other wall" : byInput("Breaks the red wall · Enter confirms", "Breaks the red wall · \"Move\" confirms"), clock),
    stuck: (clock) => timed("None of your counters can move · pick a side of one for a wall", clock),
    wall: (clock) => timed("Pick a side of the counter you moved to place a wall", clock),
    wallReady: (side, clock) => timed(`Wall ${side} · Enter places it`, clock),
    moveOther: (who, clock) => timed(`${who}'s turn · moving`, clock),
    wallOther: (who, clock) => timed(`${who}'s turn · placing a wall`, clock),
    between: (seconds) => `Round 1 is over · round 2 for the other two in ${seconds} s`,
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    board: "Arrows: move · Enter: pick · Esc: cancel · H: rules",
    place: "Arrows, Enter: place · H: rules",
    wall: "Arrows: pick a side · Enter: place the wall · H: rules",
  },
  button: {
    kind: (key, kind) => keyed(key, kind.replace(" counter", "")),
    breaker: keyed("B", "Breaker"),
    breakerOff: keyed("B", "Cancel"),
    confirm: keyed("Enter", "Move"),
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    stage: (stage, three) => `Round ${stage} (${three ? "3 players" : "1 on 1"})`,
    placed: (who, kind) => `${who}: ${kind.replace(" counter", "").toLowerCase()} placed`,
    moved: (who, kind) => `${who}: ${kind.replace(" counter", "").toLowerCase()} moved`,
    broke: (who) => `${who}: wall breaker`,
    wall: (who) => `${who}: wall placed`,
    wallForced: (who) => `${who}: time out, wall`,
    passed: (who) => `${who}: passed`,
    scored: (who, squares) => `${who}: ${squares} squares`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who) => `${englishOrdinal(place)} ${who}`,
    mine: (rounds) => (rounds.length === 1 ? `Your territory: ${rounds[0].squares} squares` : `Your territory · ${rounds.map((each) => `round ${each.stage}: ${each.squares}`).join(" · ")}`),
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new match",
  },
  help: (n) => [
    { text: "Wall Go II: rules", tone: "title" },
    { text: `Place walls on the ${n.squares} squares to make the largest territory.` },
    { text: `Square counter: 1 to ${n.reach} squares in a straight line.` },
    { text: "Round counter: 1 square, or 1 and then 1 more to its left or right." },
    { text: "Not onto or through a counter, not through a wall. It must move.", tone: "dim" },
    { text: "A turn: move one counter, then place a wall on one of its sides." },
    { text: "If none can move, only place a wall. The board's edge is a wall.", tone: "dim" },
    { text: "The game ends as soon as walls part every player's counters." },
    { text: "Score: the squares of your territories. If level, the larger one." },
    { text: "" },
    { text: `Round 1 (3 players): ${n.three} square, ${n.three} round each, placed in turn.` },
    { text: "Wall breaker: once each, break one wall on your way and pass.", tone: "dim" },
    { text: "The largest territory is 1st. The other two play round 2.", tone: "dim" },
    { text: `Round 2 (1 on 1): ${n.two} square, ${n.two} round on set squares. No breaker.` },
    { text: n.turnSeconds > 0 ? `${enTime(n.turnSeconds)} a turn. After that no move, and a wall at random.` : "No turn limit (the host sets one in the waiting room).", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

/**
 * The words of 컬러 링크 (Color Link), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Color Link, piece, pair, path, board, declare impossibility, prove the
 * connections, forfeit the proof. The Korean ones are the show's own (말,
 * 짝, 길, 연결 불가 선언, 증명, 증명 포기, 선공·후공):
 * design/games/color-link.md.
 */
import type { LinkEnd, LinkPhase, RoundHow } from "../../../shared/games/color-link/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** The letters of the colours: two pieces of each. */
  letters: string;
  /** The fewest squares a path has, its two pieces included. */
  minPath: number;
  /** How many pieces a round's first turn is, and every turn after it. */
  firstPieces: number;
  turnPieces: number;
  /** How many rounds there are at most, and the points that win. */
  rounds: number;
  goal: number;
  /** Seconds to place a turn's pieces, to choose who goes first, and to prove. */
  placeSeconds: number;
  chooseSeconds: number;
  proveSeconds: number;
}

/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "컬러 링크: 규칙",
    brief: {
      goal: "같은 색 말 두 개를 길로 이을 수 있게 놓는 게임. 3점을 먼저 얻으면 승리.",
      play: "번갈아 말을 놓다가, 더는 이을 수 없다고 보면 연결 불가를 선언합니다.",
      end: "마지막에 놓은 사람이 모든 짝을 이어 보이면 1점, 못 하면 선언한 사람이 1점.",
    },
    parts: [
      "두 사람이 합니다. 말은 14가지 색이 두 개씩, 모두 28개이고 색마다 A부터 N까지의 글자가 적혀 있습니다. 판은 라운드마다 다르고, 검은 말 X 두 개와 흰 말 Y 두 개가 미리 놓여 있는 판도 있습니다.",
      [
        "선공이 먼저 말 1개를 놓고, 그 뒤로는 번갈아 서로 다른 색의 말을 2개씩 놓습니다. 한 차례는 1분 30초입니다.",
        "같은 색의 두 말은 길로 이어져야 합니다. 길은 가로세로로만 가고, 두 말이 놓인 칸까지 세어 6칸 이상이어야 합니다.",
        "길끼리는 겹치거나 엇갈릴 수 없고, 다른 말이 놓인 칸을 지날 수 없습니다. 미리 놓인 X와 Y도 각각 이어져야 합니다.",
        "짝이 아직 없는 말은 나중에 짝을 놓아 이을 수 있는 자리에 있어야 합니다. 놓을 때는 아무도 이를 확인하지 않습니다.",
      ],
      "자기 차례에 말을 놓는 대신 연결 불가를 선언할 수 있습니다. 판 위의 말들을 규칙대로 모두 이을 수 없다는 선언입니다.",
      [
        "선언이 나오면 마지막에 말을 놓은 사람이 2분 30초 안에 증명합니다. 짝이 없는 말마다 짝을 놓고, 모든 짝을 길로 잇습니다.",
        "증명에 성공하면 증명한 사람이 1점, 실패하거나 포기하면 선언한 사람이 1점을 얻습니다.",
        "5라운드 가운데 3점을 먼저 얻은 사람이 이깁니다.",
        "1라운드의 선공은 방이 무작위로 정합니다. 2라운드부터는 앞 라운드에서 진 사람이 1분 30초 안에 선공과 후공 가운데 고릅니다.",
      ],
      [
        "이 사이트에서는 틀린 증명을 내면 받아들여지지 않을 뿐이고, 남은 시간 안에 고쳐 다시 낼 수 있습니다.",
        "차례의 시간이 지나도록 말을 놓지 않으면 그 라운드는 상대가 1점을 얻습니다. 선공·후공을 시간 안에 고르지 않으면 후공이 됩니다.",
        "1·2라운드의 판은 방송의 판이고, 나머지 판은 이 사이트가 만든 판입니다. 시간은 모두 방송의 절반입니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, or the screen did before asking, for the bar. */
  refused: {
    "bad-pieces": "이번 차례에 놓을 개수만큼 말을 놓아야 합니다",
    "cell-taken": "빈칸에만 놓을 수 있습니다",
    "same-colour": "한 차례의 두 말은 서로 다른 색이어야 합니다",
    "colour-used": "그 색의 말은 두 개 모두 놓였습니다",
    "bad-partners": "짝이 없는 말마다 길을 그어 짝의 자리를 정해야 합니다",
    "bad-path": "길이 아닙니다",
    "wrong-ends": "길은 같은 색의 두 말을 이어야 합니다",
    "pair-missing": "아직 잇지 않은 짝이 있습니다",
    "not-adjacent": "길은 가로세로로 붙은 칸으로만 갑니다",
    "through-piece": "길은 다른 말이 놓인 칸을 지날 수 없습니다",
    "paths-overlap": "길끼리 겹칠 수 없습니다",
    "path-too-short": "두 말까지 세어 6칸보다 짧은 길이 있습니다",
    "not-choosing": "지금은 선공·후공을 고르는 때가 아닙니다",
    "not-placing": "지금은 말을 놓는 때가 아닙니다",
    "not-your-turn": "상대의 차례입니다",
    "nothing-placed": "말이 하나도 놓이지 않아 선언할 수 없습니다",
    "not-proving": "지금은 증명하는 때가 아닙니다",
    "not-playing": "이 판의 플레이어가 아닙니다",
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
    played: "승부가 나 끝",
    left: "상대가 나가 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<LinkEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, phase: LinkPhase) => `${round}라운드${phase === "choose" ? " · 순서" : phase === "place" ? " · 배치" : phase === "prove" ? " · 증명" : phase === "show" ? " · 결과" : ""}`,
  /** In the list, beside a player: what they are doing in the step being played. */
  status: { choosing: "고르는 중", placing: "놓는 중", proving: "증명 중", declared: "선언" },
  /** Left of the board, 98 pixels. */
  side: {
    round: (round: number, rounds: number) => `${round} / ${rounds} 라운드`,
    pieces: (count: number) => `놓인 말 ${count}`,
    joined: (done: number, all: number) => `이은 짝 ${done} / ${all}`,
  },
  /** Said in the bar for a moment. */
  say: {
    turnFull: (count: number) => `한 차례에 말 ${count}개입니다. 옮기려면 놓은 말을 다시 누르세요`,
    turnShort: (left: number) => `말을 ${left}개 더 놓아야 합니다`,
    declareAgain: "한 번 더 누르면 연결 불가를 선언합니다",
    forfeitAgain: "한 번 더 누르면 증명을 포기합니다",
    declaredOnYou: "상대가 연결 불가를 선언했습니다. 증명하세요",
    choseForYou: "시간이 지나 후공이 되었습니다",
    noWay: "그쪽으로는 길을 낼 수 없습니다",
    pathDone: "짝을 이었습니다",
    startOnPiece: "말이 놓인 칸에서 길을 시작하세요",
  },
  /** In the bar for a while after a round: who has its point, and how. */
  round: {
    proved: (who: string) => `증명 성공 · ${who} 1점`,
    forfeit: (who: string) => `증명 포기 · ${who} 1점`,
    unproved: (who: string) => `증명 시간 초과 · ${who} 1점`,
    late: (who: string) => `배치 시간 초과 · ${who} 1점`,
  } as Record<RoundHow, (who: string) => string>,
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    choose: (clock: string) => timed("이번 라운드의 선공과 후공 가운데 고르세요", clock),
    chooseWait: (clock: string) => timed("상대가 선공·후공을 고르는 중", clock),
    chooseOther: (who: string, clock: string) => timed(`${who}: 선공·후공을 고르는 중`, clock),
    place: (count: number, left: number, clock: string) => timed(count === 1 ? "왼쪽에서 색을 고르고 판의 빈칸에 말 1개를 놓으세요" : `서로 다른 색의 말 ${count}개를 놓으세요 · ${left}개 남음`, clock),
    placeReady: (clock: string) => timed(byInput("Enter로 놓기 · 이을 수 없어 보이면 말을 놓는 대신 선언", "「놓기」를 누르세요 · 이을 수 없어 보이면 놓는 대신 선언"), clock),
    placeNone: (clock: string) => timed("놓을 말이나 빈칸이 모자랍니다. 연결 불가를 선언하세요", clock),
    placeWait: (clock: string) => timed("상대가 말을 놓는 중", clock),
    placeOther: (who: string, clock: string) => timed(`${who}: 말을 놓는 중`, clock),
    prove: (done: number, all: number, clock: string) => timed(byInput(`말에서 길을 그어 모든 짝을 이으세요 · ${done} / ${all}`, `말을 누른 채 끌어 모든 짝을 이으세요 · ${done} / ${all}`), clock),
    proveReady: (clock: string) => timed(byInput("Enter로 증명 제출", "「증명 제출」을 누르세요"), clock),
    proveWait: (clock: string) => timed("상대가 연결을 증명하는 중", clock),
    proveOther: (who: string, clock: string) => timed(`${who}: 연결을 증명하는 중`, clock),
    show: (outcome: string, clock: string) => timed(outcome === "" ? "다음 라운드를 준비하는 중" : `${outcome} · 곧 다음 라운드`, clock),
  },
  /** Under the standing line, 140 pixels beside the buttons: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    place: "Space 놓기 · Q/E 색",
    prove: "Space 길 시작·멈춤",
  },
  /** The buttons of the bar. */
  button: {
    place: keyed("Enter", "놓기"),
    clear: "지우기",
    declare: keyed("X", "연결 불가 선언"),
    declareSure: "선언 확인",
    prove: keyed("Enter", "증명 제출"),
    clearPath: "길 지우기",
    forfeit: keyed("X", "증명 포기"),
    forfeitSure: "포기 확인",
    first: keyed("1", "선공"),
    second: keyed("2", "후공"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number) => `${round}라운드`,
    drawn: (who: string) => `추첨 · 선공 ${who}`,
    chose: (who: string, first: boolean) => `${who}: ${first ? "선공" : "후공"} 선택`,
    choseLate: (who: string) => `${who}: 시간 초과 · 후공`,
    placed: (who: string, letters: string) => `${who}: ${letters} 놓음`,
    declared: (who: string) => `${who}: 연결 불가 선언`,
    over: {
      proved: (who: string) => `증명 성공 · ${who} +1`,
      forfeit: (who: string) => `증명 포기 · ${who} +1`,
      unproved: (who: string) => `증명 못 함 · ${who} +1`,
      late: (who: string) => `시간 초과 · ${who} +1`,
    } as Record<RoundHow, (who: string) => string>,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    outcome: (kind: "won" | "lost" | "level"): string => (kind === "won" ? "승리" : kind === "lost" ? "패배" : "무승부"),
    over: "종료",
    nobody: "승자 없음",
    winner: (who: string) => `${who} 승리`,
    how: (mine: number, theirs: number, round: number) => `${mine} : ${theirs} · ${round}라운드에 끝`,
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "컬러 링크: 규칙", tone: "title" },
    { text: `같은 색 말 두 개를 길로 이을 수 있게 놓습니다. ${n.rounds}라운드, ${n.goal}점을 먼저 얻으면 승리.` },
    { text: "" },
    { text: `말은 ${n.letters.length}색이 두 개씩. 선공이 ${n.firstPieces}개, 그 뒤로 번갈아 다른 색 ${n.turnPieces}개씩 (${koTime(n.placeSeconds)}).` },
    { text: `길: 가로세로로만, 두 말까지 세어 ${n.minPath}칸 이상. 겹치거나 말을 지날 수 없습니다.` },
    { text: "미리 놓인 X와 Y도 각각 이어져야 합니다. 놓을 때는 아무도 확인하지 않습니다.", tone: "dim" },
    { text: "" },
    { text: "차례에 말을 놓는 대신 「연결 불가」를 선언할 수 있습니다.", tone: "mark" },
    { text: `마지막에 놓은 사람이 ${koTime(n.proveSeconds)} 안에 증명: 짝 없는 말의 짝을 놓고 모든 짝을 잇기.` },
    { text: "증명 성공이면 증명한 사람이, 실패·포기면 선언한 사람이 1점." },
    { text: `진 사람이 다음 라운드의 선공·후공을 고릅니다 (${koTime(n.chooseSeconds)}, 지나면 후공).`, tone: "dim" },
    { text: "차례의 시간이 지나면 상대가 1점. 틀린 증명은 고쳐 다시 낼 수 있습니다.", tone: "dim" },
    { text: "" },
    { text: byInput("방향키·Space: 칸 · Q/E: 색 · Enter: 보내기 · X: 선언·포기 · Backspace: 지우기", "증명: 말을 누른 채 끌면 길, 길의 끝이 짝 없는 말의 짝 자리") },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Color Link: rules",
    brief: {
      goal: "Place pieces so that the two of each color can be linked by a path. First to 3 points wins.",
      play: "Take turns placing pieces, and declare impossibility when you think they can no longer be linked.",
      end: "Whoever placed last scores by proving the connections; if they cannot, the declarer scores.",
    },
    parts: [
      "For two players. There are 28 pieces: two each of 14 colors, lettered A to N. The board is different every round, and some boards come with two black pieces, X, and two white pieces, Y, already on them.",
      [
        "The first player places one piece. After that you take turns placing two pieces of different colors. A turn is 1 minute 30 seconds.",
        "The two pieces of a color must be connected by a path. A path runs up, down, left and right only, and must be at least 6 spaces long, counting the spaces of its two pieces.",
        "Paths cannot overlap or cross, and cannot pass through a space with another piece on it. The X pair and the Y pair on a board must be connected too.",
        "A piece with no matching piece yet must be where a matching piece could still be placed and linked. Nobody checks this while pieces are placed.",
      ],
      "On your turn, instead of placing pieces, you may declare impossibility: that the pieces on the board cannot all be connected by the rules.",
      [
        "The player who placed last then has 2 minutes 30 seconds to prove the connections: place the matching piece of every unpaired piece, and link every pair with a path.",
        "If the proof succeeds, the prover gets a point. If it fails or is forfeited, the declarer gets the point.",
        "There are five rounds, and the first to 3 points wins.",
        "The room draws who goes first in Round 1. From Round 2, the loser of the previous round has 1 minute 30 seconds to choose to go first or second.",
      ],
      [
        "On this site a wrong proof is simply not accepted, and can be corrected and sent again in the time that is left.",
        "If your turn runs out with no pieces placed, your opponent gets the round's point. If you do not choose in time, you go second.",
        "The boards of Rounds 1 and 2 are the show's; the others were made for this site. Every time limit is half the show's.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-pieces": "Place as many pieces as this turn takes",
    "cell-taken": "Pieces go on empty spaces only",
    "same-colour": "The two pieces of a turn must be different colors",
    "colour-used": "Both pieces of that color are on the board",
    "bad-partners": "Draw a path from every unpaired piece to where its match goes",
    "bad-path": "That is not a path",
    "wrong-ends": "A path must link the two pieces of one color",
    "pair-missing": "Some pairs are not linked yet",
    "not-adjacent": "A path moves to the space beside, above or below",
    "through-piece": "A path cannot pass through another piece",
    "paths-overlap": "Paths cannot overlap",
    "path-too-short": "A path is under 6 spaces, counting its two pieces",
    "not-choosing": "Nobody is choosing who goes first now",
    "not-placing": "No pieces are being placed now",
    "not-your-turn": "It is your opponent's turn",
    "nothing-placed": "No piece has been placed yet: nothing to declare",
    "not-proving": "No proof is being made now",
    "not-playing": "You are not a player of this game",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players",
    "too-many": "It takes two players only",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    played: "Game decided",
    left: "Your opponent left",
    abandoned: "Nobody left to play on",
  },
  heading: (round, phase) => `Round ${round}${phase === "choose" ? " · order" : phase === "place" ? " · placing" : phase === "prove" ? " · proof" : phase === "show" ? " · result" : ""}`,
  status: { choosing: "choosing", placing: "placing", proving: "proving", declared: "declared" },
  side: {
    round: (round, rounds) => `Round ${round} / ${rounds}`,
    pieces: (count) => `${count} placed`,
    joined: (done, all) => `Linked ${done} / ${all}`,
  },
  say: {
    turnFull: (count) => `A turn is ${count} ${count === 1 ? "piece" : "pieces"}. Press a placed piece to take it back`,
    turnShort: (left) => `Place ${left} more ${left === 1 ? "piece" : "pieces"}`,
    declareAgain: "Press again to declare impossibility",
    forfeitAgain: "Press again to forfeit the proof",
    declaredOnYou: "Your opponent declared impossibility. Prove the connections",
    choseForYou: "Time is up: you go second",
    noWay: "No path can go that way",
    pathDone: "Pair linked",
    startOnPiece: "Start a path on a space with a piece",
  },
  round: {
    proved: (who) => `Proof succeeded · point to ${who}`,
    forfeit: (who) => `Proof forfeited · point to ${who}`,
    unproved: (who) => `Proof ran out of time · point to ${who}`,
    late: (who) => `Turn ran out of time · point to ${who}`,
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    choose: (clock) => timed("Choose to go first or second this round", clock),
    chooseWait: (clock) => timed("Your opponent is choosing who goes first", clock),
    chooseOther: (who, clock) => timed(`${who} is choosing who goes first`, clock),
    place: (count, left, clock) => timed(count === 1 ? "Pick a color on the left and place 1 piece on an empty space" : `Place ${count} pieces of different colors · ${left} to go`, clock),
    placeReady: (clock) => timed(byInput("Enter to place · or declare instead if it looks impossible", "Press Place · or declare instead if it looks impossible"), clock),
    placeNone: (clock) => timed("No pieces or spaces left for a turn. Declare impossibility", clock),
    placeWait: (clock) => timed("Your opponent is placing pieces", clock),
    placeOther: (who, clock) => timed(`${who} is placing pieces`, clock),
    prove: (done, all, clock) => timed(byInput(`Draw a path from a piece to link every pair · ${done} / ${all}`, `Press a piece and drag to link every pair · ${done} / ${all}`), clock),
    proveReady: (clock) => timed(byInput("Enter to submit the proof", "Press Submit proof"), clock),
    proveWait: (clock) => timed("Your opponent is proving the connections", clock),
    proveOther: (who, clock) => timed(`${who} is proving the connections`, clock),
    show: (outcome, clock) => timed(outcome === "" ? "Getting the next round ready" : `${outcome} · next round soon`, clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    place: "Q/E color · Space",
    prove: "Space: draw path",
  },
  button: {
    place: keyed("Enter", "Place"),
    clear: "Clear",
    declare: keyed("X", "Declare"),
    declareSure: "Confirm declare",
    prove: keyed("Enter", "Submit proof"),
    clearPath: "Clear path",
    forfeit: keyed("X", "Forfeit"),
    forfeitSure: "Confirm forfeit",
    first: keyed("1", "Go first"),
    second: keyed("2", "Go second"),
    again: keyed("Enter", "New game"),
    lobby: keyed("Esc", "To the lobby"),
  },
  log: {
    round: (round) => `Round ${round}`,
    drawn: (who) => `Drawn · ${who} first`,
    chose: (who, first) => `${who}: goes ${first ? "first" : "second"}`,
    choseLate: (who) => `${who}: time up · second`,
    placed: (who, letters) => `${who}: placed ${letters}`,
    declared: (who) => `${who}: declared`,
    over: {
      proved: (who) => `Proved · ${who} +1`,
      forfeit: (who) => `Forfeit · ${who} +1`,
      unproved: (who) => `No proof · ${who} +1`,
      late: (who) => `Time up · ${who} +1`,
    },
  },
  result: {
    outcome: (kind) => (kind === "won" ? "WIN" : kind === "lost" ? "LOSS" : "DRAW"),
    over: "OVER",
    nobody: "No winner",
    winner: (who) => `${who} wins`,
    how: (mine, theirs, round) => `${mine} : ${theirs} · over in Round ${round}`,
    hostNext: "Play again with the same player, or to the lobby",
    waitHost: "Waiting for the host · say so with 'One more'",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Color Link: rules", tone: "title" },
    { text: `Place pieces so each color's two can be linked. ${n.rounds} rounds, first to ${n.goal} points wins.` },
    { text: "" },
    { text: `${n.letters.length} colors, two pieces each. First ${n.firstPieces} piece, then ${n.turnPieces} of different colors a turn (${enTime(n.placeSeconds)}).` },
    { text: `Path: up, down, left, right; ${n.minPath} spaces or more with its two pieces; no overlap.` },
    { text: "The X and Y pairs must be linked too. Nobody checks while pieces are placed.", tone: "dim" },
    { text: "" },
    { text: "On your turn you may declare impossibility instead of placing.", tone: "mark" },
    { text: `Whoever placed last has ${enTime(n.proveSeconds)} to prove: place every missing match, link every pair.` },
    { text: "A proof scores for the prover; a failed or forfeited one for the declarer." },
    { text: `The loser chooses to go first or second next round (${enTime(n.chooseSeconds)}, else second).`, tone: "dim" },
    { text: "A turn out of time gives the opponent the point. A wrong proof can be redone.", tone: "dim" },
    { text: "" },
    { text: byInput("Arrows, Space: space · Q/E: color · Enter: send · X: declare, forfeit · Backspace: clear", "Proof: press a piece and drag a path; an unpaired piece's path ends where its match goes") },
    { text: "" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Press anywhere to close"), tone: "title" },
  ],
};

/** The words of the screen, in the page's language. */
export const WORDS = words({ ko, en });

/** The rules of the game as the page shows them, in each language: for the pages a search engine reads. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

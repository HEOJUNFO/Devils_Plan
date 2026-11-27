/**
 * The words of 수식의 탑 (Tower of Equations), in each language (`lang.ts`):
 * its rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Tower of Equations, target number, target height, number blocks, move,
 * declare, buzzer, flip, position, a number without an operator, forfeit.
 * The Korean ones are the wiki's and the show's screen's (타깃 넘버, 목표 층수,
 * 이동 횟수, 제시·선언, 최초 제시, 추가 제시):
 * design/games/tower-of-equations.md.
 */
import type { FailReason, TowerEnd, TowerPhase } from "../../../shared/games/tower-of-equations/rules";
import { enTime, englishOrdinal, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many blocks and how many positions there are. */
  blocks: number;
  positions: number;
  /** The points that end the game, and the points of the first to declare and of someone who declared fewer. */
  goal: number;
  firstPoints: number;
  morePoints: number;
  /** Seconds for the buzzer, to declare, to declare fewer, and to make the moves. */
  thinkSeconds: number;
  saySeconds: number;
  moreSeconds: number;
  moveSeconds: number;
}

/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

/** Points with their sign. */
const signed = (points: number): string => (points > 0 ? `+${points}` : `${points}`);

const ko = {
  sheet: {
    title: "수식의 탑: 규칙",
    brief: {
      goal: "타깃 넘버가 되는 탑을 몇 번의 이동으로 쌓을지 세어, 먼저 7점.",
      play: "먼저 버저를 눌러 이동 횟수를 선언하고, 가장 적게 부른 사람이 옮깁니다.",
      end: "최초 제시는 성공 +1 · 실패 -1, 더 적게 부른 추가 제시는 +2 · -2.",
    },
    parts: [
      "숫자 블록 16개가 네 자리에 탑으로 쌓여 있습니다. 블록은 기호 없는 숫자 2, 3, 5, 7과, 같은 숫자에 +, -, ×가 붙은 것들입니다. 라운드마다 타깃 넘버와 목표 층수가 주어지고, 목표 층수만큼 쌓인 탑 하나의 수식이 타깃 넘버가 되게 만드는 것이 문제입니다.",
      [
        "수식은 탑의 위에서 아래로 읽습니다. 맨 위층에는 기호 없는 숫자가 와야 하고, 그 아래 블록은 모두 기호가 있어야 합니다. 곱셈을 먼저 계산합니다 (위에서부터 2, +7, ×3, +2면 2 + 7 × 3 + 2 = 25).",
        "한 번의 이동: 한 탑의 위쪽에서 원하는 개수만큼 블록을 집어 다른 자리로 옮깁니다. 옮기면서 위아래를 뒤집을 수 있고, 뒤집으면 집은 블록의 순서가 거꾸로 됩니다. 옮기지 않고 같은 자리에서 뒤집는 것도 1회의 이동입니다.",
        "탑은 하나만 맞으면 됩니다. 다른 탑은 어떤 모양이어도 됩니다.",
      ],
      "문제가 공개되면 블록에 손대지 않고 머리로 이동 횟수를 셉니다. 2분 30초 안에 먼저 버저를 누른 사람이 5초 안에 이동 횟수를 선언합니다 (최초 제시). 그러면 다른 사람들에게 1분이 주어지고, 그 안에 더 적은 이동 횟수를 한 번씩 제시할 수 있습니다 (추가 제시).",
      [
        "가장 적은 이동 횟수를 제시한 한 사람이 1분 안에, 제시한 횟수만큼만 실제로 옮깁니다. 횟수를 다 쓴 순간의 탑으로 성공과 실패를 가립니다. 포기하거나 시간이 끝나면 실패입니다.",
        "최초 제시 플레이어가 도전하면 성공 +1점, 실패 -1점. 추가 제시 플레이어가 도전하면 성공 +2점, 실패 -2점. 도전자가 실패해도 다른 사람에게 기회가 넘어가지 않습니다.",
        "버저를 누르고 5초 안에 선언하지 못하면 그 라운드에는 다시 선언할 수 없습니다. 감점은 없습니다.",
        "2분 30초 동안 아무도 버저를 누르지 않으면 다음 라운드로 넘어갑니다.",
      ],
      "다음 라운드는 탑을 그대로 둔 채 새 타깃 넘버와 목표 층수로 시작합니다. 누군가 7점이 되면 판이 끝나고 점수순으로 순위를 가립니다.",
      [
        "문제는 방이 냅니다. 세 번에서 다섯 번의 이동으로 풀 수 있고, 두 번 이하로는 풀 수 없는 문제만 나옵니다. 라운드가 끝나면 방이 아는 횟수를 알려 줍니다.",
        "방을 만들 때 처음 배치를 고릅니다: 판마다 새로 섞은 배치, 또는 방송의 배치.",
        "세 라운드 연달아 아무도 선언하지 않으면 판을 끝냅니다. 40라운드까지 아무도 7점이 되지 못하면 그때의 점수로 끝냅니다.",
        "방송에서는 최하위가 탈락이어서, 최하위가 동점이면 그 사람들끼리 누군가 7점이 될 때까지 연장전을 했습니다. 여기서는 연장전 없이 점수가 같으면 같은 순위입니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "bad-move": "그렇게는 옮길 수 없습니다",
    "too-many-blocks": "그 탑에는 블록이 그만큼 없습니다",
    "not-moved": "같은 자리에는 뒤집어야 놓을 수 있습니다",
    "not-open": "지금은 버저를 누를 수 없습니다",
    "shut-out": "이번 라운드에는 다시 선언할 수 없습니다",
    "not-declaring": "지금은 이동 횟수를 제시할 수 없습니다",
    "already-declared": "이번 라운드에는 이미 제시했습니다",
    "bad-moves": "이동 횟수는 1 이상이어야 합니다",
    "not-fewer": "지금 가장 적은 횟수보다 적어야 합니다",
    "not-moving": "지금은 블록을 옮기는 때가 아닙니다",
    "not-challenger": "가장 적게 제시한 사람만 옮길 수 있습니다",
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
    played: "7점이 나와 끝",
    rounds: "마지막 라운드까지 마쳐 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
    stalled: "아무도 선언하지 않아 끝",
  } as Record<TowerEnd, string>,
  /** Why a challenge failed. */
  failed: { wrong: "타깃 넘버가 아님", time: "시간 초과", forfeit: "포기" } as Record<FailReason, string>,
  /** The same in a line of the log, which is 168 pixels. */
  failedShort: { wrong: "오답", time: "시간", forfeit: "포기" } as Record<FailReason, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, phase: TowerPhase) =>
    `${round}라운드${phase === "think" ? "" : phase === "say" ? " · 선언" : phase === "more" ? " · 추가 제시" : phase === "move" ? " · 도전" : phase === "result" ? " · 결과" : ""}`,
  /** In the list, beside a player: their points, and what they have done in the round. */
  points: (points: number) => `${points}점`,
  status: {
    saying: "선언 중",
    bid: (moves: number) => `${moves}회`,
    passed: "안 함",
    out: "제외",
    moving: "도전",
  },
  /** Left of the towers, 98 pixels. */
  side: {
    target: "타깃 넘버",
    height: "목표 층수",
    floors: (height: number) => `${height}층`,
    fewest: (moves: number) => `최소 ${moves}회`,
    first: "최초",
    more: "추가",
    made: (made: number, of: number) => `이동 ${made} / ${of}`,
    known: (moves: number) => `방의 풀이 ${moves}회`,
  },
  /** Said in the bar for a moment. */
  say: {
    silentYou: "선언하지 못했습니다 · 이번 라운드에는 다시 선언할 수 없습니다",
    least: "이동 횟수는 1 이상이어야 합니다",
    most: (moves: number) => `${moves}회까지 선언할 수 있습니다`,
    notFewer: (moves: number) => `${moves}회보다 적어야 합니다`,
    sameSpot: "같은 자리에는 뒤집어야 놓을 수 있습니다",
    forfeitSure: "한 번 더 누르면 포기합니다 (실패 처리)",
    emptyTower: "그 자리에는 집을 블록이 없습니다",
  },
  /** While a round's result is on show: in the bar, and `short` over the towers, 180 pixels. */
  outcome: {
    short: (success: boolean, points: number) => `${success ? "성공" : "실패"} · ${signed(points)}점`,
    success: (who: string, points: number) => `${who} 성공 · ${signed(points)}점`,
    failure: (who: string, points: number, why: string) => `${who} 실패 · ${signed(points)}점 (${why})`,
    nobody: "아무도 선언하지 않았습니다",
  },
  /** Over the towers while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    think: (clock: string) => timed("몇 번 옮기면 되는지 머리로 세어 버저를 누르세요", clock),
    thinkOut: (clock: string) => timed("이번 라운드에는 다시 선언할 수 없습니다", clock),
    thinkOther: (clock: string) => timed("먼저 버저를 누른 사람이 이동 횟수를 선언합니다", clock),
    say: (clock: string) => timed(byInput("이동 횟수를 정해 Enter로 선언하세요", "이동 횟수를 정해 「선언」을 누르세요"), clock),
    sayOther: (who: string, clock: string) => timed(`${who} 님이 이동 횟수를 선언하는 중`, clock),
    more: (clock: string) => timed("더 적은 횟수를 제시할 수 있습니다 · 성공 +2, 실패 -2", clock),
    moreWait: (clock: string) => timed("다른 사람의 추가 제시를 기다리는 중", clock),
    moreOther: (clock: string) => timed("더 적은 이동 횟수를 제시하는 시간", clock),
    move: (made: number, of: number, clock: string) => timed(`${made} / ${of}회 · 블록을 눌러 집으세요 (그 위의 블록도 함께 집힙니다)`, clock),
    moveHeld: (count: number, flip: boolean, clock: string) => timed(`${count}개를 ${flip ? "뒤집어 " : ""}집었습니다 · 놓을 자리를 누르세요`, clock),
    moveOther: (who: string, made: number, of: number, clock: string) => timed(`${who} 님이 도전 중 · ${made} / ${of}회`, clock),
    result: (clock: string) => timed("다음 라운드를 준비하는 중", clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    count: "↑↓ 횟수",
    move: "←→ 자리 · ↑↓ 개수",
  },
  /** The buttons of the bar. */
  button: {
    buzz: keyed("Space", "버저"),
    declare: (moves: number) => keyed("Enter", `${moves}회 선언`),
    fewer: (moves: number) => keyed("Enter", `${moves}회 제시`),
    pass: keyed("P", "제시 안 함"),
    flip: (on: boolean) => keyed("F", on ? "뒤집기 켬" : "뒤집기 끔"),
    drop: keyed("Esc", "내려놓기"),
    forfeit: "포기",
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number, target: number, height: number) => `${round}라운드: ${target} · ${height}층`,
    buzz: (who: string) => `${who} 버저!`,
    silent: (who: string) => `${who}: 선언 못 함`,
    declared: (who: string, moves: number, first: boolean) => `${who}: ${moves}회 ${first ? "선언" : "추가 제시"}`,
    pass: (who: string) => `${who}: 제시 안 함`,
    moved: (made: number, count: number, from: number, to: number, flip: boolean) => `${made}) ${from}→${to} ${count}개${flip ? " 뒤집음" : ""}`,
    success: (who: string, points: number) => `${who} 성공 ${signed(points)}`,
    failure: (who: string, points: number, why: string) => `${who} 실패 ${signed(points)} · ${why}`,
    nobody: "아무도 선언하지 않음",
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "종료" : `${place}위`),
    place: (place: number, who: string, points: number) => `${place}위 ${who} ${points}점`,
    how: (rounds: number) => `${rounds}라운드 만에 끝`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "수식의 탑: 규칙", tone: "title" },
    { text: `블록 ${n.blocks}개가 ${n.positions}자리에 쌓여 있습니다.` },
    { text: "목표 층수만큼 쌓인 탑 하나의 수식이 타깃 넘버가 되게 만드세요." },
    { text: "수식은 위에서 아래로. 맨 위는 기호 없는 숫자, 곱셈 먼저 계산.", tone: "dim" },
    { text: "이동 1회: 탑 위쪽의 블록 몇 개를 다른 자리로. 뒤집으면 순서가 거꾸로." },
    { text: "같은 자리에서 뒤집기만 하는 것도 이동 1회입니다.", tone: "dim" },
    { text: "" },
    { text: `${koTime(n.thinkSeconds)} 안에 먼저 버저를 누른 사람이 ${koTime(n.saySeconds)} 안에 이동 횟수를 선언.` },
    { text: `그 뒤 ${koTime(n.moreSeconds)} 동안 다른 사람은 더 적은 횟수를 한 번씩 제시할 수 있습니다.` },
    { text: `가장 적게 제시한 사람이 ${koTime(n.moveSeconds)} 안에 정확히 그 횟수만큼 옮깁니다.` },
    { text: `최초 제시: 성공 +${n.firstPoints} · 실패 -${n.firstPoints}.   추가 제시: 성공 +${n.morePoints} · 실패 -${n.morePoints}.`, tone: "mark" },
    { text: "버저를 누르고 선언하지 못하면 그 라운드에는 다시 선언할 수 없습니다.", tone: "dim" },
    { text: "" },
    { text: `탑은 다음 라운드에 그대로 남습니다. 누군가 ${n.goal}점이면 끝.` },
    { text: "문제는 방이 냅니다: 3~5번에 풀 수 있고 2번 이하로는 안 풀립니다.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Tower of Equations: rules",
    brief: {
      goal: "Count the moves to a tower that makes the target number. First to 7.",
      play: "Buzz first to declare your moves; whoever declares the fewest moves the blocks.",
      end: "First to declare: +1 or -1. Declared fewer: +2 or -2.",
    },
    parts: [
      "Sixteen number blocks stand in towers on four positions. They are the numbers 2, 3, 5 and 7 without an operator, and the same numbers with +, - and ×. Each round gives a target number and a target height: the problem is to make one tower of that many blocks whose equation comes to the target number.",
      [
        "An equation is read from the top of a tower down. The top block must be a number without an operator, and every block under it must have one. Multiplication is done first (from the top 2, +7, ×3, +2 is 2 + 7 × 3 + 2 = 25).",
        "One move: take one block or more from the top of a tower to another position. You may flip them over on the way, which reverses their order. Flipping blocks over and putting them back in the same position is one move as well.",
        "One tower is enough. The other towers may be anything.",
      ],
      "Once the problem is shown, count the moves in your head, without touching a block. Whoever presses the buzzer first within 2 minutes 30 seconds has 5 seconds to declare a number of moves (the first to declare). The others then have 1 minute in which each may declare fewer moves, once.",
      [
        "Whoever declared the fewest moves has 1 minute to make exactly that many moves. Success or failure is judged on the towers as they stand once the moves are used up. Forfeiting or running out of time is a failure.",
        "If the first to declare is the challenger: +1 point for success, -1 for failure. If someone who declared fewer is: +2 for success, -2 for failure. When the challenger fails, nobody else gets a turn.",
        "If you press the buzzer and declare nothing in 5 seconds, you cannot declare again that round. No points are lost.",
        "If nobody presses the buzzer in 2 minutes 30 seconds, the next round begins.",
      ],
      "The next round begins with the towers as they are, and a new target number and target height. The game ends when someone reaches 7 points, and players are placed by their points.",
      [
        "The room sets the problems: each can be solved in three to five moves, and none in two or fewer. After a round the room says how many moves it knew.",
        "The host chooses the first towers when making the room: shuffled anew every game, or the show's.",
        "If nobody declares for three rounds running, the game ends. If nobody has 7 points after 40 rounds, it ends on the points as they stand.",
        "In the show the last player was eliminated, so players level in last place played a tiebreaker until one of them had 7 points. Here there is no tiebreaker: players level on points share a place.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-move": "That cannot be moved so",
    "too-many-blocks": "That tower has not that many blocks",
    "not-moved": "Flip the blocks to put them back in the same position",
    "not-open": "The buzzer cannot be pressed now",
    "shut-out": "You cannot declare again this round",
    "not-declaring": "You cannot declare a number of moves now",
    "already-declared": "You have declared this round",
    "bad-moves": "Declare one move or more",
    "not-fewer": "Declare fewer moves than the fewest so far",
    "not-moving": "No blocks are being moved now",
    "not-challenger": "Only whoever declared the fewest moves the blocks",
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
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done now",
  ended: {
    played: "Someone has 7 points",
    rounds: "The last round is over",
    left: "Too few players left",
    abandoned: "Everyone left",
    stalled: "Nobody was declaring",
  } as Record<TowerEnd, string>,
  failed: { wrong: "not the target", time: "out of time", forfeit: "forfeit" } as Record<FailReason, string>,
  failedShort: { wrong: "wrong", time: "time", forfeit: "forfeit" } as Record<FailReason, string>,
  heading: (round, phase) =>
    `Round ${round}${phase === "think" ? "" : phase === "say" ? " · declare" : phase === "more" ? " · fewer?" : phase === "move" ? " · moves" : phase === "result" ? " · result" : ""}`,
  points: (points) => `${points} pt`,
  status: {
    saying: "buzzed",
    bid: (moves) => `${moves} mv`,
    passed: "no",
    out: "out",
    moving: "moving",
  },
  side: {
    target: "Target number",
    height: "Target height",
    floors: (height) => `${height}`,
    fewest: (moves) => `Fewest: ${moves}`,
    first: "first",
    more: "fewer",
    made: (made, of) => `Moves ${made} / ${of}`,
    known: (moves) => `Room's way: ${moves}`,
  },
  say: {
    silentYou: "You declared nothing · you cannot declare again this round",
    least: "Declare one move or more",
    most: (moves) => `You can declare ${moves} moves at most`,
    notFewer: (moves) => `It has to be fewer than ${moves}`,
    sameSpot: "Flip the blocks to put them back in the same position",
    forfeitSure: "Press again to forfeit (it counts as a failure)",
    emptyTower: "That position has no blocks to take",
  },
  outcome: {
    short: (success, points) => `${success ? "SUCCESS" : "FAILURE"} · ${signed(points)}`,
    success: (who, points) => `${who}: success · ${signed(points)}`,
    failure: (who, points, why) => `${who}: failure · ${signed(points)} (${why})`,
    nobody: "Nobody declared",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for players" : `Waiting for players · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    think: (clock) => timed("Count the moves in your head, then press the buzzer", clock),
    thinkOut: (clock) => timed("You cannot declare again this round", clock),
    thinkOther: (clock) => timed("Whoever presses the buzzer first declares a number of moves", clock),
    say: (clock) => timed(byInput("Set your number of moves · Enter declares it", "Set your number of moves, then press \"Declare\""), clock),
    sayOther: (who, clock) => timed(`${who} is declaring a number of moves`, clock),
    more: (clock) => timed("You may declare fewer moves · +2 for success, -2 for failure", clock),
    moreWait: (clock) => timed("Waiting for anyone to declare fewer moves", clock),
    moreOther: (clock) => timed("Time to declare fewer moves", clock),
    move: (made, of, clock) => timed(`${made} / ${of} moves · press a block to take it and those on it`, clock),
    moveHeld: (count, flip, clock) => timed(`${count} ${count === 1 ? "block" : "blocks"} taken${flip ? ", flipped" : ""} · press a position to put ${count === 1 ? "it" : "them"} on`, clock),
    moveOther: (who, made, of, clock) => timed(`${who} is making the moves · ${made} / ${of}`, clock),
    result: (clock) => timed("The next round is coming", clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    count: "↑↓ moves",
    move: "←→ position · ↑↓ blocks",
  },
  button: {
    buzz: keyed("Space", "Buzzer"),
    declare: (moves) => keyed("Enter", `Declare ${moves}`),
    fewer: (moves) => keyed("Enter", `Declare ${moves}`),
    pass: keyed("P", "No fewer"),
    flip: (on) => keyed("F", on ? "Flip: on" : "Flip: off"),
    drop: keyed("Esc", "Put back"),
    forfeit: "Forfeit",
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round, target, height) => `Round ${round}: ${target} · height ${height}`,
    buzz: (who) => `${who} buzzed!`,
    silent: (who) => `${who}: said nothing`,
    declared: (who, moves, first) => (first ? `${who}: ${moves} ${moves === 1 ? "move" : "moves"}` : `${who}: down to ${moves}`),
    pass: (who) => `${who}: no fewer`,
    moved: (made, count, from, to, flip) => `${made}) ${from}→${to} ×${count}${flip ? " flipped" : ""}`,
    success: (who, points) => `${who}: success ${signed(points)}`,
    failure: (who, points, why) => `${who}: ${signed(points)} · ${why}`,
    nobody: "Nobody declared",
  },
  result: {
    verdict: (seated, place) => (!seated || place === null ? "Over" : englishOrdinal(place)),
    place: (place, who, points) => `${englishOrdinal(place)} ${who} ${points}`,
    how: (rounds) => (rounds === 1 ? "Over in one round" : `Over in ${rounds} rounds`),
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Tower of Equations: rules", tone: "title" },
    { text: `${n.blocks} blocks on ${n.positions} positions. Make one tower of the target height` },
    { text: "whose equation comes to the target number." },
    { text: "Read from the top down: a plain number on top, × done first.", tone: "dim" },
    { text: "One move: some blocks off the top of a tower to another position." },
    { text: "Flipping reverses their order; flipping in place is a move too.", tone: "dim" },
    { text: "" },
    { text: `Buzz first within ${enTime(n.thinkSeconds)}, then declare your moves in ${enTime(n.saySeconds)}.` },
    { text: `The others have ${enTime(n.moreSeconds)} to declare fewer moves, once each.` },
    { text: `The fewest declarer makes exactly that many moves in ${enTime(n.moveSeconds)}.` },
    { text: `First to declare: +${n.firstPoints} or -${n.firstPoints}.   Declared fewer: +${n.morePoints} or -${n.morePoints}.`, tone: "mark" },
    { text: "Buzz and declare nothing: no declaring again that round.", tone: "dim" },
    { text: "" },
    { text: `The towers stay for the next round. First to ${n.goal} points ends it.` },
    { text: "Problems are the room's: 3 to 5 moves, never 2 or fewer.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

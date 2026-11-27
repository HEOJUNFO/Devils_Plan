/**
 * The words of 카드 장기 (Card Janggi), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Card Janggi, movement card, great piece, small piece, rat, horse, monkey,
 * elephant, giraffe, first player, second player, arrange, rearrange,
 * capture, resign. The Korean ones are the show's own (행마 카드, 큰 말,
 * 작은 말, 시작 칸, 선공·후공, 배치·재배치, 기권). The horse's card is
 * written 「말 카드」 where it could be taken for a piece (말):
 * design/games/card-janggi.md.
 */
import type { JanggiEnd, JanggiPhase, RoundHow } from "../../../shared/games/card-janggi/rules";
import { enTime, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many of the cards a round's second player lays at its beginning. */
  secondCards: number;
  /** How many rounds there are at most, and the wins that take the game. */
  rounds: number;
  goal: number;
  /** Seconds to lay the cards, to lay them again, to move, and for the opponent to move for a player out of time. */
  arrangeSeconds: number;
  rearrangeSeconds: number;
  moveSeconds: number;
  proxySeconds: number;
}

/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "카드 장기: 규칙",
    brief: {
      goal: "내 큰 말이 상대 큰 말의 시작 칸에 들어가거나, 상대의 큰 말을 잡으면 승리.",
      play: "행마 카드 다섯 장을 쓸 순서대로 엎어 두고, 앞면인 카드대로 말 하나를 옮깁니다.",
      end: "3라운드 가운데 2승을 먼저 거두면 이깁니다.",
    },
    parts: [
      "두 사람이 가로 6칸, 세로 5칸 판에서 합니다. 각자 큰 말 1개와 작은 말 3개, 행마 카드 5장을 받습니다. 말에는 정해진 행마가 없고, 카드가 내 말 가운데 아무것이나 하나를 옮깁니다.",
      [
        "쥐: 상하좌우로 1칸.",
        "원숭이: 둘레의 8칸 가운데 하나로.",
        "코끼리: 대각선으로 1칸 또는 2칸.",
        "기린: 상하좌우로 꼭 2칸.",
        "말 카드: 체스의 나이트처럼 여덟 칸 가운데 하나로.",
      ],
      [
        "라운드가 시작되면 1분 30초 안에 카드를 쓸 순서대로 엎어 놓습니다. 선공은 5장 모두, 후공은 5장 가운데 4장만 고릅니다.",
        "두 사람의 첫 카드를 동시에 공개하고, 선공부터 번갈아 45초 안에 앞면인 카드대로 말 하나를 옮깁니다. 옮기고 나면 내 다음 카드가 공개됩니다.",
        "상대의 말이 있는 칸으로 가면 그 말을 잡습니다. 내 말이 있는 칸으로는 갈 수 없습니다.",
        "놓아 둔 카드를 다 쓰면 곧바로 5장을 모두 다시 배치하고 첫 카드를 공개합니다. 후공이 먼저 다 쓰므로, 선공은 후공이 새로 공개한 첫 카드를 보고 나서 마지막 카드를 씁니다.",
        "45초 안에 옮기지 않으면, 내가 써야 하는 카드대로 상대가 원하는 내 말을 옮깁니다.",
      ],
      "내 큰 말이 상대 큰 말의 시작 칸으로 가거나, 내 말로 상대의 큰 말을 잡으면 그 라운드를 이깁니다. 모두 3라운드이고 2승을 먼저 거둔 사람이 이깁니다. 1라운드의 선공은 방이 무작위로 정하고, 라운드마다 번갈아 맡습니다.",
      [
        "이 사이트에서는 카드가 가리키는 칸으로 바로 갑니다. 사이에 다른 말이 있어도 막히지 않습니다.",
        "앞면인 카드로 옮길 수 있는 말이 하나도 없으면 그 카드는 쓴 것으로 치고 차례가 넘어갑니다.",
        "시간 안에 카드를 배치하지 않으면 방이 무작위로 배치합니다. 상대도 20초 안에 내 말을 옮기지 않으면 방이 무작위로 옮깁니다.",
        "자기 차례에 기권하면 그 라운드를 내줍니다. 한 라운드가 100수에 이르면 그 라운드는 승자 없이 끝납니다.",
        "판과 카드의 행마는 방송 화면에서 읽은 것이고, 시간은 모두 방송의 절반입니다.",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, or the screen did before asking, for the bar. */
  refused: {
    "bad-order": "서로 다른 카드를 정해진 장수만큼 골라야 합니다",
    "not-arranging": "지금은 카드를 배치하는 때가 아닙니다",
    "not-moving": "지금은 말을 옮기는 때가 아닙니다",
    "not-your-turn": "상대의 차례입니다",
    "not-your-piece": "지금 옮길 수 있는 말이 아닙니다",
    "cannot-reach": "앞면인 카드로는 그 칸에 갈 수 없습니다",
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
  } as Record<JanggiEnd, string>,
  /** A card's name: on a button, and as a sentence names it. */
  card: { rat: "쥐", horse: "말", monkey: "원숭이", elephant: "코끼리", giraffe: "기린" } as Record<string, string>,
  cardNamed: { rat: "쥐", horse: "말 카드", monkey: "원숭이", elephant: "코끼리", giraffe: "기린" } as Record<string, string>,
  /** What a card does, 98 pixels at most. */
  cardDoes: { rat: "상하좌우 1칸", horse: "나이트 8칸", monkey: "둘레 8칸", elephant: "대각선 1·2칸", giraffe: "상하좌우 꼭 2칸" } as Record<string, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, phase: JanggiPhase) => `${round}라운드${phase === "arrange" ? " · 배치" : phase === "rearrange" ? " · 재배치" : phase === "show" ? " · 결과" : ""}`,
  /** In the list, beside a player: what they are doing in the step being played. */
  status: { arranging: "배치 중", ready: "배치함", moving: "차례", late: "시간 초과", proxy: "대신 두는 중" },
  /** Left of the board, 98 pixels. */
  side: {
    round: (round: number, rounds: number) => `${round}/${rounds} 라운드`,
    /** Under a card picked: the place it has in the order. */
    nth: (place: number) => `${place}번째`,
    moves: (count: number) => `${count}수`,
    theirs: "상대의 카드",
    mine: "내 카드",
    of: (who: string) => `${who}의 카드`,
  },
  /** Said in the bar for a moment. */
  say: {
    pickMore: (left: number) => `카드를 ${left}장 더 골라야 합니다`,
    resignAgain: "한 번 더 누르면 이 라운드를 기권합니다",
    arrangedForYou: "시간이 지나 방이 카드를 무작위로 배치했습니다",
    lateYou: "시간이 지났습니다. 상대가 내 말을 옮깁니다",
    lateThem: "상대의 시간이 지났습니다. 상대의 말을 옮기세요",
    stuckYou: (card: string) => `${card}: 옮길 수 있는 말이 없어 차례가 넘어갔습니다`,
    stuckThem: (card: string) => `상대의 ${card}: 옮길 수 있는 말이 없어 차례가 넘어왔습니다`,
    captured: "말을 잡았습니다",
    lost: "말이 잡혔습니다",
  },
  /** In the bar for a while after a round: who has it, and how. */
  round: {
    home: (who: string) => `${who}: 큰 말이 상대의 시작 칸에 도착`,
    capture: (who: string) => `${who}: 상대의 큰 말을 잡음`,
    resign: (who: string) => `기권 · ${who} 승`,
    moves: () => "수가 다 되어 승자 없이 끝",
  } as Record<RoundHow, (who: string) => string>,
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    arrange: (due: number, all: number, left: number, clock: string) => timed(due < all ? `행마 카드 ${all}장 가운데 ${due}장을 쓸 순서대로 고르세요 · ${left}장 남음` : `행마 카드 ${all}장을 쓸 순서대로 고르세요 · ${left}장 남음`, clock),
    arrangeReady: (clock: string) => timed(byInput("Enter로 배치 확정 · 순서는 상대에게 보이지 않습니다", "「배치 확정」을 누르세요 · 순서는 상대에게 보이지 않습니다"), clock),
    arrangeWait: (clock: string) => timed("상대가 카드를 배치하는 중", clock),
    arrangeOther: (clock: string) => timed("두 사람이 카드를 배치하는 중", clock),
    rearrange: (all: number, left: number, clock: string) => timed(`카드를 다 썼습니다. ${all}장을 다시 쓸 순서대로 고르세요 · ${left}장 남음`, clock),
    rearrangeWait: (clock: string) => timed("상대가 카드를 다시 배치하는 중", clock),
    rearrangeOther: (who: string, clock: string) => timed(`${who}: 카드를 다시 배치하는 중`, clock),
    move: (card: string, clock: string) => timed(`${card}: 옮길 내 말을 고르세요`, clock),
    moveTo: (card: string, clock: string) => timed(`${card}: 표시된 칸 가운데 갈 칸을 고르세요`, clock),
    moveWait: (card: string, clock: string) => timed(`상대의 차례 · ${card}`, clock),
    moveOther: (who: string, card: string, clock: string) => timed(`${who}의 차례 · ${card}`, clock),
    proxy: (card: string, clock: string) => timed(`상대의 시간이 지났습니다. ${card}대로 상대의 말을 옮기세요`, clock),
    proxyWait: (clock: string) => timed("시간이 지나 상대가 내 말을 옮깁니다", clock),
    proxyOther: (who: string, clock: string) => timed(`${who}의 시간이 지나 상대가 대신 옮기는 중`, clock),
    show: (outcome: string, clock: string) => timed(outcome === "" ? "다음 라운드를 준비하는 중" : `${outcome} · 곧 다음 라운드`, clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    move: "방향키 · Space: 고르기",
    arrange: "1~5: 고르기",
  },
  /** The buttons of the bar. */
  button: {
    confirm: keyed("Enter", "배치 확정"),
    clear: "다시",
    resign: keyed("X", "기권"),
    resignSure: "기권 확인",
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number, who: string) => `${round}라운드 · 선공 ${who}`,
    arranged: (who: string, forced: boolean) => (forced ? `${who}: 시간 초과 · 무작위 배치` : `${who}: 카드 배치`),
    moved: (who: string, card: string, from: string, to: string, captured: boolean, how: "own" | "proxy" | "room") => `${who}: ${card} ${from}→${to}${captured ? " 잡음" : ""}${how === "proxy" ? " (상대가)" : how === "room" ? " (자동)" : ""}`,
    stuck: (who: string, card: string) => `${who}: ${card} 갈 곳 없음`,
    late: (who: string) => `${who}: 시간 초과`,
    over: {
      home: (who: string) => `시작 칸 도착 · ${who} 승`,
      capture: (who: string) => `큰 말 잡음 · ${who} 승`,
      resign: (who: string) => `기권 · ${who} 승`,
      moves: () => "승자 없이 끝",
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
    { text: "카드 장기: 규칙", tone: "title" },
    { text: "내 큰 말이 상대 큰 말의 시작 칸에 가거나 상대 큰 말을 잡으면 승리." },
    { text: `${n.rounds}라운드 가운데 ${n.goal}승을 먼저 거두면 이깁니다.` },
    { text: "카드는 내 말 아무것이나 하나를 옮깁니다. 상대 말이 있는 칸에 가면 잡습니다.", tone: "mark" },
    { text: "쥐: 상하좌우 1칸 · 원숭이: 둘레 8칸 · 코끼리: 대각선 1칸 또는 2칸" },
    { text: "기린: 상하좌우 꼭 2칸 · 말 카드: 나이트처럼. 사이의 말에 막히지 않습니다." },
    { text: "" },
    { text: `배치 (${koTime(n.arrangeSeconds)}): 쓸 순서대로 엎어 놓기. 선공 5장, 후공은 ${n.secondCards}장만.` },
    { text: `첫 카드를 함께 공개하고, 선공부터 번갈아 ${koTime(n.moveSeconds)} 안에 한 수씩.` },
    { text: "놓은 카드를 다 쓰면 곧바로 5장을 다시 배치하고 첫 카드를 공개합니다." },
    { text: `시간이 지나면 상대가 내 카드대로 내 말을 옮깁니다 (${koTime(n.proxySeconds)}, 지나면 무작위).`, tone: "dim" },
    { text: "옮길 말이 없는 카드는 쓴 것으로 칩니다. 100수면 승자 없이 끝.", tone: "dim" },
    { text: "" },
    { text: byInput("방향키·Space: 말과 칸 · 1~5: 카드 · Enter: 확정 · X: 기권 · Esc: 취소", "말을 누르고 표시된 칸을 누르면 옮깁니다") },
    { text: "" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Card Janggi: rules",
    brief: {
      goal: "Move your great piece onto your opponent's great piece square, or capture their great piece.",
      play: "Arrange your five movement cards face down in order, then move a piece by the card face up.",
      end: "Three rounds; the first to win two wins the game.",
    },
    parts: [
      "For two players on a board of 6 squares by 5. You each get one great piece, three small pieces and five movement cards. No piece has a movement of its own: a card moves any one of your pieces.",
      [
        "Rat: one square up, down, left or right.",
        "Monkey: to any of the eight squares around it.",
        "Elephant: one or two squares diagonally.",
        "Giraffe: exactly two squares up, down, left or right.",
        "Horse: like a knight in chess, to one of eight squares.",
      ],
      [
        "When a round begins you have 1 minute 30 seconds to arrange your cards face down in the order you will use them. The first player arranges all five; the second player picks only four of the five.",
        "Both turn over their first card at the same time. Starting with the first player, you take turns moving one piece by your face-up card within 45 seconds. After you move, your next card is turned over.",
        "Moving onto a square with an opponent's piece captures it. You cannot move onto a square with a piece of your own.",
        "When you have used the last card you arranged, you immediately rearrange all five and turn over the first. The second player runs out first, so the first player sees the second player's new first card before using their own last card.",
        "If you do not move within 45 seconds, your opponent moves any piece of yours they like, by the card you had to use.",
      ],
      "You win the round when your great piece moves onto the starting square of your opponent's great piece, or when one of your pieces captures their great piece. There are three rounds, and the first to win two wins. The room draws the first player of Round 1, and after that you take turns.",
      [
        "On this site a piece goes straight to the square the card shows. A piece in between does not block it.",
        "If your face-up card can move none of your pieces, the card counts as used and the turn passes.",
        "If you do not arrange your cards in time, the room arranges them at random. If your opponent does not move your piece within 20 seconds either, the room moves one at random.",
        "Resigning on your turn gives your opponent the round. A round that reaches 100 moves ends with no winner.",
        "The board and the cards' movements were read from the broadcast; every time limit is half the show's.",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "bad-order": "Pick as many different cards as you are to arrange",
    "not-arranging": "No cards are being arranged now",
    "not-moving": "No piece is being moved now",
    "not-your-turn": "It is your opponent's turn",
    "not-your-piece": "That piece cannot be moved now",
    "cannot-reach": "The face-up card cannot move it there",
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
  card: { rat: "Rat", horse: "Horse", monkey: "Monkey", elephant: "Elephant", giraffe: "Giraffe" },
  cardNamed: { rat: "Rat", horse: "Horse", monkey: "Monkey", elephant: "Elephant", giraffe: "Giraffe" },
  cardDoes: { rat: "1 straight", horse: "knight's move", monkey: "1 any way", elephant: "1-2 diagonal", giraffe: "2 straight" },
  heading: (round, phase) => `Round ${round}${phase === "arrange" ? " · arrange" : phase === "rearrange" ? " · rearrange" : phase === "show" ? " · result" : ""}`,
  status: { arranging: "arranging", ready: "arranged", moving: "to move", late: "time up", proxy: "for them" },
  side: {
    round: (round, rounds) => `Round ${round}/${rounds}`,
    nth: (place) => `no. ${place}`,
    moves: (count) => `#${count}`,
    theirs: "Their cards",
    mine: "Your cards",
    of: (who) => `${who}'s cards`,
  },
  say: {
    pickMore: (left) => `Pick ${left} more ${left === 1 ? "card" : "cards"}`,
    resignAgain: "Press again to resign this round",
    arrangedForYou: "Time is up: the room arranged your cards at random",
    lateYou: "Time is up. Your opponent moves your piece",
    lateThem: "Your opponent is out of time. Move a piece of theirs",
    stuckYou: (card) => `${card}: no piece could move, so the turn passed`,
    stuckThem: (card) => `Their ${card}: no piece could move, so it is your turn`,
    captured: "Piece captured",
    lost: "Your piece was captured",
  },
  round: {
    home: (who) => `${who} reached the opponent's square`,
    capture: (who) => `${who} captured the great piece`,
    resign: (who) => `Resigned · ${who} wins`,
    moves: () => "Out of moves: no winner",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    arrange: (due, all, left, clock) => timed(due < all ? `Pick ${due} of your ${all} cards in order of use · ${left} to go` : `Pick your ${all} cards in order of use · ${left} to go`, clock),
    arrangeReady: (clock) => timed(byInput("Enter to confirm · your opponent does not see the order", "Press Confirm · your opponent does not see the order"), clock),
    arrangeWait: (clock) => timed("Your opponent is arranging their cards", clock),
    arrangeOther: (clock) => timed("Both are arranging their cards", clock),
    rearrange: (all, left, clock) => timed(`Out of cards. Pick all ${all} again in order of use · ${left} to go`, clock),
    rearrangeWait: (clock) => timed("Your opponent is rearranging their cards", clock),
    rearrangeOther: (who, clock) => timed(`${who} is rearranging their cards`, clock),
    move: (card, clock) => timed(`${card}: pick a piece of yours to move`, clock),
    moveTo: (card, clock) => timed(`${card}: pick one of the marked squares`, clock),
    moveWait: (card, clock) => timed(`Your opponent's turn · ${card}`, clock),
    moveOther: (who, card, clock) => timed(`${who}'s turn · ${card}`, clock),
    proxy: (card, clock) => timed(`Opponent out of time: move a piece of theirs by ${card}`, clock),
    proxyWait: (clock) => timed("Out of time: your opponent moves your piece", clock),
    proxyOther: (who, clock) => timed(`${who} is out of time: the opponent moves for them`, clock),
    show: (outcome, clock) => timed(outcome === "" ? "Getting the next round ready" : `${outcome} · next round soon`, clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    move: "Arrows · Space: pick",
    arrange: "1-5: pick",
  },
  button: {
    confirm: keyed("Enter", "Confirm"),
    clear: "Clear",
    resign: keyed("X", "Resign"),
    resignSure: "Confirm resign",
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round, who) => `Round ${round} · ${who} first`,
    arranged: (who, forced) => (forced ? `${who}: time up · random` : `${who}: arranged`),
    moved: (who, card, from, to, captured, how) => `${who}: ${card} ${from}→${to}${captured ? " x" : ""}${how === "proxy" ? " (by opp.)" : how === "room" ? " (auto)" : ""}`,
    stuck: (who, card) => `${who}: ${card} no move`,
    late: (who) => `${who}: time up`,
    over: {
      home: (who) => `Reached square · ${who}`,
      capture: (who) => `Captured · ${who} wins`,
      resign: (who) => `Resigned · ${who} wins`,
      moves: () => "No winner",
    },
  },
  result: {
    outcome: (kind) => (kind === "won" ? "WIN" : kind === "lost" ? "LOSS" : "DRAW"),
    over: "OVER",
    nobody: "No winner",
    winner: (who) => `${who} wins`,
    how: (mine, theirs, round) => `${mine} : ${theirs} · over in Round ${round}`,
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Card Janggi: rules", tone: "title" },
    { text: "Get your great piece to their start square, or capture theirs." },
    { text: `${n.rounds} rounds; the first to win ${n.goal} wins the game.` },
    { text: "A card moves any one of your pieces. Land on theirs to capture.", tone: "mark" },
    { text: "Rat: 1 straight · Monkey: 1 any way · Elephant: 1-2 diagonal" },
    { text: "Giraffe: exactly 2 straight · Horse: knight. Nothing blocks." },
    { text: "" },
    { text: `Arrange (${enTime(n.arrangeSeconds)}): face down, in order. First 5, second ${n.secondCards}.` },
    { text: `First cards open together; then a move each within ${enTime(n.moveSeconds)}.` },
    { text: "Out of cards? Rearrange all five at once and turn over the first." },
    { text: "Out of time: the opponent moves your piece by your card.", tone: "dim" },
    { text: "A card that moves nothing counts as used. 100 moves: no winner.", tone: "dim" },
    { text: "" },
    { text: byInput("Arrows, Space: move · 1-5: cards · Enter: confirm · X: resign", "Press a piece, then one of the marked squares") },
    { text: "" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Press anywhere to close"), tone: "title" },
  ],
};

/** The words of the screen, in the page's language. */
export const WORDS = words({ ko, en });

/** The rules of the game as the page shows them, in each language: for the pages a search engine reads. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

/**
 * The words of 러시안 룰렛 (Russian Roulette), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { words } from "../lang";
import type { HelpLine, RulesSheet } from "../sheet";

const ko = {
  sheet: {
    title: "러시안 룰렛: 규칙",
    parts: [
      "약실 중 몇 칸에 실탄이 있습니다 (6명이면 여섯 칸 중 두 칸). 한 자리에 약실 한 칸이 마주 보고, 마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다.",
      "내 차례에는 다섯 가지 중 하나를 합니다. 크레딧은 16개로 시작합니다.",
      [
        "공개 조사 (1): 이웃한 두 칸이 찼는지 모두에게 공개",
        "비공개 조사 (2): 이웃한 두 칸을 나만 확인",
        "1칸 회전 (3), 2칸 회전 (4): 총구와 실린더가 시계 방향으로 돌아 모든 약실이 옆자리로 넘어감",
        "조작: 한 번에 1~3개씩 몰래 모아 6이 되면 이웃한 두 칸의 탄을 맞바꿈",
      ],
      "남은 크레딧은 본인만 압니다. 크레딧이 남아 있으면 쉴 수 없습니다. 절반이 크레딧을 다 쓰면 끝나고, 총구가 향한 자리부터 시계 방향으로 한 발씩 격발합니다.",
    ],
  } as RulesSheet,
  /** Why the room refused a move, for the bar. */
  refused: {
    "not-your-turn": "지금은 내 차례가 아닙니다",
    "not-enough-credits": "크레딧이 모자랍니다",
    "out-of-credits": "크레딧을 다 써서 더는 행동할 수 없습니다",
    "swap-pending": "먼저 맞바꿀 두 칸을 골라야 합니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 행동할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "bad-player-count": "지금 인원으로는 시작할 수 없습니다 (4~6명)",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "그 행동은 지금 할 수 없습니다",
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** What a chamber holds, in a word. */
  round: (round: 0 | 1): string => (round === 1 ? "실탄" : "빔"),
  /** Over a seat as the gun fires at it. */
  bang: "탕!",
  click: "철컥",
  /** The moves, a line each in a column 168 pixels wide; `who` is a name cut to 52. */
  log: {
    /** A public check: one line, or two where one does not hold it. */
    publicCheck: (who: string, a: string, b: string, inA: string, inB: string) => [`${who} 공개 ${a}${inA} ${b}${inB}`],
    privateCheck: (who: string, a: string, b: string) => `${who} 비공개 ${a}·${b}`,
    onlyYou: (a: string, b: string, inA: string, inB: string) => `나만: ${a} ${inA}, ${b} ${inB}`,
    turned: (who: string, steps: number) => `${who} 총구 ${steps}칸 회전`,
    timedOut: (who: string) => `${who} 시간 초과: 1개 제출`,
    /** Credits put in the pot; `amount` is `null` to those who are not told how many. */
    putIn: (who: string, amount: number | null) => (amount === null ? `${who} 조작함에 제출` : `${who} 조작함에 ${amount}개`),
    earnedSwap: (who: string) => `${who} 조작권 획득!`,
    swapped: (who: string, a: string, b: string) => `${who} 조작: ${a}·${b} 맞바꿈`,
    lostSwap: (who: string) => `${who} 조작권을 놓침`,
    outOfCredits: (who: string) => `${who} 크레딧 소진`,
    oneMore: "한 명만 더 바닥나면 끝!",
    fire: "격발!",
    shot: (who: string, hit: boolean) => (hit ? `탕! ${who} 탈락` : `철컥. ${who} 생존`),
  },
  /** Beside a seat's name. */
  seat: {
    /** Leads this round: on a small plate after the name. */
    lead: "선",
    shot: "탈락",
    spent: "소진",
    left: "나감",
    offline: "끊김",
  },
  /** The column on the right, 168 pixels wide. */
  panel: {
    watching: "관전 중",
    noSeat: "이 판에는 자리가 없습니다",
    credits: "크레딧",
    /** No wider than 40 pixels: the pot's pips start beside it. */
    pot: "조작함",
    /** The chamber in front of the player: `known` as the table gives it, `chance` the percentage of its being live while unknown. */
    mine: (letter: string, known: 0 | 1 | null, chance: number) =>
      known === 1 ? `내 앞 약실 ${letter}: 실탄!` : known === 0 ? `내 앞 약실 ${letter}: 비었음` : `내 앞 약실 ${letter}: 모름 ${chance}%`,
    allKnow: "모두 앎",
    onlyIKnow: "나만 앎",
    status: (round: number, out: number, endWhenOut: number) => `${round}라운드 · 소진 ${out}/${endWhenOut} · H 규칙`,
  },
  /** The line over the buttons: 468 pixels, or 330 while a move waits to be confirmed. */
  prompt: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    dealing: "자리 추첨 중",
    firing: "격발: 총구가 향한 자리부터 시계 방향으로 한 발씩",
    away: (who: string, seconds: number) => `${who} 자리 비움: ${seconds}초 뒤 자동으로 1크레딧 제출`,
    turnOf: (who: string) => `${who} 차례`,
    sending: "보내는 중",
    lastCredits: "내 차례: 누구든 크레딧을 다 쓰면 그 자리에서 격발입니다",
    firstCheck: "내 차례: 1이나 2로 내 앞 약실부터 조사해 보세요",
    liveAhead: "내 앞이 실탄! 3이나 4로 총구를 돌려 옆자리로 넘기세요",
    emptyAhead: "내 앞은 비었습니다. 크레딧을 아끼며 다른 자리를 살피세요",
    yourTurn: "내 차례: 행동을 고르세요 (1~5)",
    pick: (open: boolean, pair: string) => `${open ? "공개 조사" : "비공개 조사"}: ${pair} 칸 · 좌우 키로 고르기`,
    swap: (pair: string) => `조작권! 맞바꿀 두 칸 ${pair} · 좌우 키로 고르기`,
    amount: (amount: number, pot: number, need: number) => `조작함에 ${amount}개 · 좌우 키로 개수 · 모은 ${pot}/${need}`,
    turn: (steps: number, letter: string, known: 0 | 1 | null) =>
      `${steps}칸 회전: ${letter} 약실(${known === 1 ? "실탄" : known === 0 ? "빔" : "모름"})이 내 앞으로`,
    watching: "관전 중입니다. 다음 판부터 함께할 수 있습니다.",
  },
  /** The small buttons: confirm and cancel 62 pixels wide inside, the two under the results 88. */
  button: {
    confirm: "Enter 확정",
    cancel: "Esc 취소",
    again: "Enter 새 판",
    lobby: "Esc 대기실로",
  },
  /** The five moves, on buttons 82 pixels wide inside: the name after its key, and the price under it. */
  action: {
    names: ["공개 조사", "비공개 조사", "1칸 회전", "2칸 회전", "조작"],
    price: (credits: number) => `크레딧 ${credits}`,
    tamper: (most: number, pot: number, need: number) => `1~${most}개씩 · ${pot}/${need}`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 290. */
  result: {
    verdict: (seated: boolean, lost: boolean): string => (!seated ? "종료" : lost ? "탈락" : "생존!"),
    live: (letters: string) => `실탄은 ${letters} 약실에 있었습니다`,
    fallen: (names: string) => `쓰러진 자리: ${names}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The rules over the table (H): at most 16 lines of 436 pixels, by the room's own numbers. `dim` lines are the list of moves. */
  help: (rules: { bullets: number; startCredits: number; costPublic: number; costPrivate: number; costRotate1: number; costRotate2: number; tamperMaxPerTurn: number; tamperNeed: number; endWhenOut: number; turnSeconds: number }, chambers: number): HelpLine[] => [
    { text: "러시안 룰렛: 규칙", tone: "title" },
    { text: `약실 ${chambers}칸 중 ${rules.bullets}칸에 실탄이 있습니다. 한 자리에 약실 한 칸이 마주` },
    { text: "보고, 마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다." },
    { text: "" },
    { text: `내 차례에는 다섯 가지 중 하나를 합니다. 크레딧은 ${rules.startCredits}개로 시작합니다.` },
    { text: `1 공개 조사 (${rules.costPublic}): 이웃한 두 칸이 찼는지 모두에게 공개`, tone: "dim" },
    { text: `2 비공개 조사 (${rules.costPrivate}): 이웃한 두 칸을 나만 확인`, tone: "dim" },
    { text: `3 1칸 회전 (${rules.costRotate1}) · 4 2칸 회전 (${rules.costRotate2}): 총구와 실린더가 시계 방향으로`, tone: "dim" },
    { text: "   돕니다. 모든 약실이 그만큼 옆자리로 넘어갑니다.", tone: "dim" },
    { text: `5 조작: 한 번에 1~${rules.tamperMaxPerTurn}개씩 몰래 모아 ${rules.tamperNeed}이 되면 이웃한 두 칸의 탄을 맞바꿈`, tone: "dim" },
    { text: "" },
    { text: "남은 크레딧은 본인만 압니다. 크레딧이 남아 있으면 쉴 수 없습니다." },
    { text: `${rules.endWhenOut}명이 크레딧을 다 쓰면 끝. 총구가 향한 자리부터 시계 방향으로` },
    { text: "한 발씩 격발하고, 실탄을 맞은 사람이 탈락합니다." },
    {
      text:
        rules.turnSeconds > 0
          ? `이 방은 차례마다 ${rules.turnSeconds}초: 넘기면 자동으로 1크레딧 제출 (접속이 끊기면 더 빨리).`
          : "접속이 끊긴 사람의 차례는 잠시 뒤 자동으로 1크레딧 제출로 넘어갑니다.",
      tone: "dim",
    },
    { text: "H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Russian Roulette: rules",
    parts: [
      "Some of the chambers hold a live round (with 6 players, two of the six). Each seat faces one chamber, and you live if the chamber in front of you is empty at the last volley.",
      "On your turn you do one of five things. You start with 16 credits.",
      [
        "Public check (1): shows everyone whether two neighbouring chambers are loaded",
        "Private check (2): shows only you two neighbouring chambers",
        "Turn 1 (3), turn 2 (4): the muzzle and the cylinder turn clockwise, and every chamber moves on to the next seat",
        "Tamper: put in 1 to 3 at a time in secret; when they add up to 6, swap the rounds of two neighbouring chambers",
      ],
      "Only you know how many credits you have left. While you have credits you cannot pass. The game ends when half the players have spent theirs, and the gun fires one shot at each seat, clockwise from the one the muzzle points at.",
    ],
  } as RulesSheet,
  refused: {
    "not-your-turn": "It is not your turn",
    "not-enough-credits": "Not enough credits",
    "out-of-credits": "You are out of credits and cannot act any more",
    "swap-pending": "Pick the two chambers to swap first",
    "game-over": "This game is over",
    "not-seated": "You cannot act while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "bad-player-count": "The game cannot start with this many players (4 to 6)",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  notSent: "Not sent: the connection is down. Try again",
  round: (round) => (round === 1 ? "live" : "empty"),
  bang: "BANG!",
  click: "click",
  log: {
    // what was seen takes a line of its own: the two would not fit the column on one
    publicCheck: (who, a, b, inA, inB) => [`${who} public ${a}·${b}`, `all see: ${a} ${inA}, ${b} ${inB}`],
    privateCheck: (who, a, b) => `${who} private ${a}·${b}`,
    onlyYou: (a, b, inA, inB) => `only you: ${a} ${inA}, ${b} ${inB}`,
    turned: (who, steps) => `${who} turns the gun ${steps}`,
    timedOut: (who) => `${who} time up: 1 in pot`,
    putIn: (who, amount) => (amount === null ? `${who} adds to the pot` : `${who} puts ${amount} in pot`),
    earnedSwap: (who) => `${who} earns a swap!`,
    swapped: (who, a, b) => `${who} swaps ${a}·${b}`,
    lostSwap: (who) => `${who} loses the swap`,
    outOfCredits: (who) => `${who} is out of credits`,
    oneMore: "One more out ends it!",
    fire: "Fire!",
    shot: (who, hit) => (hit ? `Bang! ${who} is shot` : `Click. ${who} lives`),
  },
  seat: {
    lead: "1st",
    shot: "Shot",
    spent: "Spent",
    left: "Left",
    offline: "Offline",
  },
  panel: {
    watching: "Watching",
    noSeat: "No seat in this game",
    credits: "Credits",
    pot: "Pot",
    mine: (letter, known, chance) =>
      known === 1 ? `My chamber ${letter}: live!` : known === 0 ? `My chamber ${letter}: empty` : `My chamber ${letter}: live? ${chance}%`,
    allKnow: "All know",
    onlyIKnow: "Only me",
    status: (round, out, endWhenOut) => `Round ${round}, ${out}/${endWhenOut} out, H rules`,
  },
  prompt: {
    offline: "Connection lost. Reconnecting",
    dealing: "Drawing seats",
    firing: "Fire: one shot at each seat, clockwise from the muzzle",
    away: (who, seconds) => `${who} is away: 1 credit goes in for them in ${seconds}s`,
    turnOf: (who) => `${who}'s turn`,
    sending: "Sending",
    lastCredits: "Your turn: once anyone runs out of credits, the gun fires at once",
    firstCheck: "Your turn: check the chamber in front of you first, with 1 or 2",
    liveAhead: "Live in front of you! Turn the muzzle with 3 or 4 to pass it on",
    emptyAhead: "Empty in front of you. Save credits and look at the other seats",
    yourTurn: "Your turn: pick a move (1-5)",
    pick: (open, pair) => `${open ? "Public check" : "Private check"}: ${pair} · pick with the arrow keys`,
    swap: (pair) => `A swap! Chambers ${pair} · pick with the arrow keys`,
    amount: (amount, pot, need) => `Put in ${amount} · left and right to change · pot ${pot}/${need}`,
    turn: (steps, letter, known) => `Turn ${steps}: chamber ${letter} (${known === 1 ? "live" : known === 0 ? "empty" : "unknown"}) comes to you`,
    watching: "You are watching. You can play from the next game.",
  },
  button: {
    confirm: "Enter OK",
    cancel: "Esc back",
    again: "Enter again",
    lobby: "Esc to room",
  },
  action: {
    // "check" is left to the line over the buttons: a button holds one word after its key
    names: ["Public", "Private", "Turn 1", "Turn 2", "Tamper"],
    price: (credits) => (credits === 1 ? "1 credit" : `${credits} credits`),
    tamper: (most, pot, need) => `1-${most} · pot ${pot}/${need}`,
  },
  result: {
    verdict: (seated, lost) => (!seated ? "Over" : lost ? "Shot" : "Alive!"),
    live: (letters) => `The live rounds were in chambers ${letters}`,
    fallen: (names) => `Shot: ${names}`,
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  help: (rules, chambers) => [
    { text: "Russian Roulette: rules", tone: "title" },
    { text: `${rules.bullets} of the ${chambers} chambers are loaded. Each seat faces one chamber,` },
    { text: "and you live if yours is empty at the last volley." },
    { text: "" },
    { text: `On your turn you do one of five things. You start with ${rules.startCredits} credits.` },
    { text: `1 Public check (${rules.costPublic}): shows everyone two neighbouring chambers`, tone: "dim" },
    { text: `2 Private check (${rules.costPrivate}): shows only you two neighbouring chambers`, tone: "dim" },
    { text: `3 Turn 1 (${rules.costRotate1}) · 4 Turn 2 (${rules.costRotate2}): the muzzle and cylinder turn clockwise.`, tone: "dim" },
    { text: "   Every chamber moves on that many seats.", tone: "dim" },
    { text: `5 Tamper: put in 1-${rules.tamperMaxPerTurn} a turn, unseen; at ${rules.tamperNeed}, swap two neighbours`, tone: "dim" },
    { text: "" },
    { text: "Only you know your credits. While you have any you cannot pass." },
    { text: `When ${rules.endWhenOut} players have spent theirs it ends: the gun fires a shot at` },
    { text: "each seat, clockwise from the muzzle. A live round takes you out." },
    {
      text:
        rules.turnSeconds > 0
          ? `A turn is ${rules.turnSeconds}s: then 1 credit goes in for you (sooner if offline).`
          : "An offline player has 1 credit put in for them after a moment.",
      tone: "dim",
    },
    { text: "H or Esc: close · M: mute · T: chat", tone: "title" },
  ],
};

/** The words of 러시안 룰렛 (Russian Roulette), in the language the page is read in. */
export const WORDS = words({ ko, en });

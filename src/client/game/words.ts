/**
 * The words of 러시안 룰렛 (Russian Roulette), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { words } from "../lang";
import type { HelpLine, RulesSheet } from "../sheet";
import { byInput, keyed } from "../touch";

const ko = {
  sheet: {
    title: "러시안 룰렛: 규칙",
    brief: {
      goal: "마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다.",
      play: "차례마다 크레딧을 써서 조사, 회전, 조작 중 하나를 합니다.",
      end: "절반이 크레딧을 다 쓰면 자리마다 한 발씩 격발하고 끝납니다.",
    },
    parts: [
      "약실 중 몇 칸에 실탄이 있습니다 (6명이면 여섯 칸 중 두 칸). 한 자리에 약실 한 칸이 마주 보고, 마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다.",
      "내 차례에는 다섯 가지 중 하나를 합니다. 크레딧은 16개로 시작합니다.",
      [
        "공개 조사 (1): 이웃한 두 칸이 찼는지 모두에게 공개",
        "비공개 조사 (2): 이웃한 두 칸을 나만 확인",
        "1칸 회전 (3), 2칸 회전 (4): 총구와 실린더가 시계 방향으로 돌아 모든 약실이 옆자리로 넘어감",
        "조작 (1~3): 모두가 낸 크레딧이 합쳐 6이 되면, 그때 낸 사람이 이웃한 두 칸의 탄을 맞바꿈. 넘친 크레딧은 사라지고 다시 0부터 모임",
      ],
      "공개 조사와 회전 말고는 누가 했는지만 '비공개 행동'으로 알려집니다. 무엇을 했는지, 조작 크레딧이 얼마나 모였는지, 탄이 바뀌었는지는 알려 주지 않습니다.",
      "남은 크레딧은 본인만 압니다. 크레딧이 남아 있으면 쉴 수 없고, 다 쓰면 차례마다 자동으로 패스됩니다 (패스도 비공개 행동). 절반(5명이면 2명)이 크레딧을 다 쓰면 그 즉시 끝나고, 총구가 향한 자리부터 시계 방향으로 한 발씩 격발합니다.",
    ],
  } as RulesSheet,
  /** Why the room refused a move, for the bar. */
  refused: {
    "not-your-turn": "지금은 내 차례가 아닙니다",
    "not-enough-credits": "크레딧이 모자랍니다",
    "out-of-credits": "크레딧을 다 써서 차례가 자동으로 패스됩니다",
    "cannot-pass": "크레딧이 남아 있으면 패스할 수 없습니다",
    "swap-pending": "먼저 맞바꿀 두 칸을 골라야 합니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 행동할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "bad-player-count": "지금 인원으로는 시작할 수 없습니다 (4~6명)",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
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
    /** The player's own private check, and under it what it found. */
    privateCheck: (who: string, a: string, b: string) => `${who} 비공개 ${a}·${b}`,
    onlyYou: (a: string, b: string, inA: string, inB: string) => `나만: ${a} ${inA}, ${b} ${inB}`,
    turned: (who: string, steps: number) => `${who} 총구 ${steps}칸 회전`,
    /** All the table is told of another player's private check, credits for the swap, swap or pass. */
    hidden: (who: string) => `${who} 비공개 행동`,
    timedOut: (who: string) => `${who} 시간 초과`,
    /** The player's own credits towards the swap. */
    putIn: (who: string, amount: number) => `${who} 조작에 ${amount}개 제출`,
    /** What the player is told of them: not enough yet (one line, or two where one does not hold it), or the swap. */
    stored: ["조작 불가능: 크레딧 누적"],
    earnedSwap: "조작 성공! 두 칸을 고르세요",
    swapped: (who: string, a: string, b: string) => `${who} 조작: ${a}·${b} 맞바꿈`,
    lostSwap: "시간 초과: 교체하지 못함",
    passed: (who: string) => `${who} 패스`,
    /**
     * After the last shot, at a table that tells the hidden moves when the game is over: the line over them,
     * what another player's private check found, and a swap another player won and ran out of time to make.
     */
    revealed: "- 숨은 행동 공개 -",
    found: (a: string, b: string, inA: string, inB: string) => `  ${a} ${inA}, ${b} ${inB}`,
    lostSwapBy: (who: string) => `${who} 교체 시간 초과`,
    /** The player's own: nobody else is told. */
    outOfCredits: (who: string) => `${who} 크레딧 소진`,
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
    /**
     * The chamber in front of the player: `known` as the player last saw it, `chance` the percentage of its being
     * live while unknown, `doubtful` when a hidden action since may have changed it.
     */
    mine: (letter: string, known: 0 | 1 | null, chance: number, doubtful: boolean) =>
      known === 1
        ? `내 앞 약실 ${letter}: ${doubtful ? "실탄?" : "실탄!"}`
        : known === 0
          ? `내 앞 약실 ${letter}: ${doubtful ? "빔?" : "비었음"}`
          : `내 앞 약실 ${letter}: 모름 ${chance}%`,
    /**
     * Beside the mark of a chamber known only as it was, in 155 pixels: how many hidden actions there have been
     * since the player saw the chamber in front of them, or (`null`) that there have been some since another was seen.
     */
    since: (count: number | null) => (count === null ? "본 뒤 비공개 행동 있음" : `본 뒤 비공개 행동 ${count}회`),
    allKnow: "모두 앎",
    onlyIKnow: "나만 앎",
    status: (round: number) => byInput(`${round}라운드 · H 규칙`, `${round}라운드`),
  },
  /** The line over the buttons: 468 pixels, or 330 while a move waits to be confirmed. */
  prompt: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    dealing: "자리 추첨 중",
    firing: "격발: 총구가 향한 자리부터 시계 방향으로 한 발씩",
    away: (who: string, seconds: number) => `${who} 자리 비움: ${seconds}초 뒤 시간 초과`,
    turnOf: (who: string) => `${who} 차례`,
    sending: "보내는 중",
    /** To a player with no credits, on their turn: there is nothing to press, the room passes for them after a pause. */
    passing: "크레딧이 없어 잠시 뒤 자동으로 패스됩니다 (비공개 행동으로 알려짐)",
    firstCheck: "내 차례: 1이나 2로 내 앞 약실부터 조사해 보세요",
    liveAhead: "내 앞이 실탄! 3이나 4로 총구를 돌려 옆자리로 넘기세요",
    emptyAhead: "내 앞은 비었습니다. 크레딧을 아끼며 다른 자리를 살피세요",
    yourTurn: "내 차례: 행동을 고르세요 (1~5)",
    pick: (open: boolean, pair: string) => `${open ? "공개 조사" : "비공개 조사"}: ${pair} 칸 · ${byInput("좌우 키로 고르기", "약실을 눌러 고르기")}`,
    swap: (pair: string) => `조작 성공! 맞바꿀 두 칸 ${pair} · ${byInput("좌우 키로 고르기", "약실을 눌러 고르기")}`,
    amount: (amount: number, need: number) => `조작에 ${amount}개 제출 · ${byInput("좌우 키로 개수", "- +로 개수")} · 모두 합쳐 ${need}이면 교체`,
    turn: (steps: number, letter: string, known: 0 | 1 | null, doubtful: boolean) =>
      `${steps}칸 회전: ${letter} 약실(${known === 1 ? "실탄" : known === 0 ? "빔" : "모름"}${doubtful ? "?" : ""})이 내 앞으로`,
    /** To someone watching: when they can play. Whoever the room's 탈락전 put out (`out`) cannot from the next game. */
    watching: (out: boolean): string => (out ? "탈락해 구경 중입니다. 우승자가 나오면 모두 다시 참가합니다." : "관전 중입니다. 다음 판부터 함께할 수 있습니다."),
  },
  /** The small buttons: confirm and cancel 62 pixels wide inside, the two under the results 88. */
  button: {
    confirm: keyed("Enter", "확정"),
    cancel: keyed("Esc", "취소"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The five moves, on buttons 82 pixels wide inside: the name after its key, and the price under it. */
  action: {
    names: ["공개 조사", "비공개 조사", "1칸 회전", "2칸 회전", "조작"],
    price: (credits: number) => `크레딧 ${credits}`,
    tamper: (most: number) => `크레딧 1~${most}`,
    /** On the fifth button while credits are counted out for the swap: how many, on a button 30 pixels wide inside. Pressed, it puts them in. */
    count: (credits: number) => `${credits}개`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 290. */
  result: {
    verdict: (seated: boolean, lost: boolean): string => (!seated ? "종료" : lost ? "탈락" : "생존!"),
    live: (letters: string) => `실탄은 ${letters} 약실에 있었습니다`,
    fallen: (names: string) => `쓰러진 자리: ${names}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The rules over the table (H): at most 16 lines of 436 pixels, by the room's own numbers. `dim` lines are the list of moves. */
  help: (rules: { bullets: number; startCredits: number; costPublic: number; costPrivate: number; costRotate1: number; costRotate2: number; tamperMaxPerTurn: number; tamperNeed: number; endWhenOut: number; turnSeconds: number; costTimeout: number }, chambers: number): HelpLine[] => [
    { text: "러시안 룰렛: 규칙", tone: "title" },
    { text: `약실 ${chambers}칸 중 ${rules.bullets}칸에 실탄이 있습니다. 한 자리에 약실 한 칸이 마주` },
    { text: "보고, 마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다." },
    { text: `내 차례에는 다섯 가지 중 하나를 합니다. 크레딧은 ${rules.startCredits}개로 시작합니다.` },
    { text: `1 공개 조사 (${rules.costPublic}): 이웃한 두 칸이 찼는지 모두에게 공개`, tone: "dim" },
    { text: `2 비공개 조사 (${rules.costPrivate}): 이웃한 두 칸을 나만 확인`, tone: "dim" },
    { text: `3 1칸 회전 (${rules.costRotate1}) · 4 2칸 회전 (${rules.costRotate2}): 총구와 실린더가 시계 방향으로`, tone: "dim" },
    { text: "   돕니다. 모든 약실이 그만큼 옆자리로 넘어갑니다.", tone: "dim" },
    { text: `5 조작 (1~${rules.tamperMaxPerTurn}): 모두가 낸 크레딧이 합쳐 ${rules.tamperNeed}이 되면, 그때 낸 사람이 이웃한`, tone: "dim" },
    { text: "   두 칸의 탄을 맞바꿉니다. 넘친 것은 사라지고, 모인 수는 아무도 모릅니다.", tone: "dim" },
    { text: "" },
    { text: "공개 조사·회전 말고는 누가 했는지만 '비공개 행동'으로 알려집니다." },
    { text: "크레딧은 본인만 압니다. 남으면 쉴 수 없고, 다 쓰면 자동 패스(비공개 행동)." },
    { text: `${rules.endWhenOut}명이 크레딧을 다 쓰면 그 즉시 격발: 총구가 향한 자리부터 한 발씩.` },
    {
      text:
        rules.turnSeconds > 0
          ? `이 방은 차례마다 ${rules.turnSeconds}초: 넘기면 크레딧 ${rules.costTimeout}개를 잃음 (접속이 끊기면 더 빨리).`
          : `접속이 끊긴 사람의 차례는 잠시 뒤 크레딧 ${rules.costTimeout}개를 잃고 넘어갑니다.`,
      tone: "dim",
    },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Russian Roulette: rules",
    brief: {
      goal: "Have an empty chamber in front of you at the last volley.",
      play: "On your turn, spend credits to check, turn or tamper.",
      end: "When half are out of credits, one shot is fired at each seat.",
    },
    parts: [
      "Some of the chambers hold a live round (with 6 players, two of the six). Each seat faces one chamber, and you live if the chamber in front of you is empty at the last volley.",
      "On your turn, do one of five things. You start with 16 credits.",
      [
        "Public check (1): shows everyone whether two neighbouring chambers are loaded",
        "Private check (2): shows only you two neighbouring chambers",
        "Turn 1 (3), turn 2 (4): the muzzle and the cylinder turn clockwise, and every chamber moves on to the next seat",
        "Tamper (1 to 3): the credits all players put in add up in one place. Whoever takes them to 6 swaps the rounds of two neighbouring chambers; what is over 6 is lost and the count starts again",
      ],
      "Only a public check and a turn are announced as they are. Anything else is announced as a hidden action: the table hears who, not what. Nobody is told how many credits have gathered, or that two rounds changed places.",
      "Only you know how many credits you have left. While you have credits you cannot pass; once you run out you automatically pass on every turn, and that too is announced as a hidden action. The game ends the moment half the players (two of five) have spent theirs, and the gun fires one shot at each seat, clockwise from the one the muzzle points at.",
    ],
  } as RulesSheet,
  refused: {
    "not-your-turn": "It is not your turn",
    "not-enough-credits": "Not enough credits",
    "out-of-credits": "You are out of credits: your turn passes automatically",
    "cannot-pass": "You cannot pass while you have credits",
    "swap-pending": "Pick the two chambers to swap first",
    "game-over": "This game is over",
    "not-seated": "You cannot act while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "bad-player-count": "The game cannot start with this many players (4 to 6)",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
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
    hidden: (who) => `${who}: hidden action`,
    timedOut: (who) => `${who}: time up`,
    putIn: (who, amount) => `${who} tampers: ${amount}`,
    // the two would not fit the column on one line
    stored: ["Tamper unavailable:", "credits accumulated"],
    earnedSwap: "Tamper successful!",
    swapped: (who, a, b) => `${who} swaps ${a}·${b}`,
    lostSwap: "Time up: no swap made",
    passed: (who) => `${who} passes`,
    revealed: "- hidden moves, told -",
    found: (a, b, inA, inB) => `  ${a} ${inA}, ${b} ${inB}`,
    lostSwapBy: (who) => `${who}: no swap made`,
    outOfCredits: (who) => `${who} is out of credits`,
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
    mine: (letter, known, chance, doubtful) =>
      known === 1
        ? `My chamber ${letter}: ${doubtful ? "was live" : "live!"}`
        : known === 0
          ? `My chamber ${letter}: ${doubtful ? "was empty" : "empty"}`
          : `My chamber ${letter}: live? ${chance}%`,
    since: (count) => (count === null ? "hidden action since" : count === 1 ? "1 hidden action since" : `${count} hidden actions since`),
    allKnow: "All know",
    onlyIKnow: "Only me",
    status: (round) => byInput(`Round ${round}, H rules`, `Round ${round}`),
  },
  prompt: {
    offline: "Connection lost. Reconnecting",
    dealing: "Drawing seats",
    firing: "Fire: one shot at each seat, clockwise from the muzzle",
    away: (who, seconds) => `${who} is away: their turn goes by in ${seconds}s`,
    turnOf: (who) => `${who}'s turn`,
    sending: "Sending",
    passing: "No credits: you will automatically pass (announced as a hidden action)",
    firstCheck: "Your turn: check the chamber in front of you first, with 1 or 2",
    liveAhead: "Live in front of you! Turn the muzzle with 3 or 4 to pass it on",
    emptyAhead: "Empty in front of you. Save credits and look at the other seats",
    yourTurn: "Your turn: pick a move (1-5)",
    pick: (open, pair) => `${open ? "Public check" : "Private check"}: ${pair} · ${byInput("pick with the arrow keys", "tap a chamber to pick")}`,
    swap: (pair) => `Tamper successful! Swap ${pair} · ${byInput("arrow keys to pick", "tap a chamber")}`,
    amount: (amount, need) => `Put in ${amount} · ${byInput("left and right to change", "- and + to change")} · swap at ${need}`,
    turn: (steps, letter, known, doubtful) =>
      `Turn ${steps}: chamber ${letter} (${known === null ? "unknown" : `${doubtful ? "was " : ""}${known === 1 ? "live" : "empty"}`}) comes to you`,
    watching: (out) => (out ? "You are out, watching until someone wins." : "You are watching. You can play from the next game."),
  },
  button: {
    confirm: keyed("Enter", "OK"),
    cancel: keyed("Esc", "back"),
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
  },
  action: {
    // "check" is left to the line over the buttons: a button holds one word after its key
    names: ["Public", "Private", "Turn 1", "Turn 2", "Tamper"],
    price: (credits) => (credits === 1 ? "1 credit" : `${credits} credits`),
    tamper: (most) => `1-${most} credits`,
    count: (credits) => `${credits}`,
  },
  result: {
    verdict: (seated, lost) => (!seated ? "Over" : lost ? "Shot" : "Alive!"),
    live: (letters) => `The live rounds were in chambers ${letters}`,
    fallen: (names) => `Shot: ${names}`,
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host · \"Again\" to join in",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (rules, chambers) => [
    { text: "Russian Roulette: rules", tone: "title" },
    { text: `${rules.bullets} of the ${chambers} chambers are loaded. Each seat faces one chamber,` },
    { text: "and you live if yours is empty at the last volley." },
    { text: `On your turn you do one of five things. You start with ${rules.startCredits} credits.` },
    { text: `1 Public check (${rules.costPublic}): shows everyone two neighbouring chambers`, tone: "dim" },
    { text: `2 Private check (${rules.costPrivate}): shows only you two neighbouring chambers`, tone: "dim" },
    { text: `3 Turn 1 (${rules.costRotate1}) · 4 Turn 2 (${rules.costRotate2}): the muzzle and cylinder turn clockwise.`, tone: "dim" },
    { text: "   Every chamber moves on that many seats.", tone: "dim" },
    { text: `5 Tamper (1-${rules.tamperMaxPerTurn}): all players' credits add up. Whoever takes them`, tone: "dim" },
    { text: `   to ${rules.tamperNeed} swaps two neighbours. Extra is lost; no count is shown.`, tone: "dim" },
    { text: "" },
    { text: "All but a public check and a turn is told only as a hidden action." },
    { text: "Only you know your credits. With none you automatically pass." },
    { text: `When ${rules.endWhenOut} players are out the gun fires at once, a shot at each seat.` },
    {
      text:
        rules.turnSeconds > 0
          ? `A turn is ${rules.turnSeconds}s (less if offline). Run out and you lose ${rules.costTimeout === 1 ? "1 credit" : `${rules.costTimeout} credits`}.`
          : `An offline player's turn runs out after a moment, at ${rules.costTimeout === 1 ? "1 credit" : `${rules.costTimeout} credits`}.`,
      tone: "dim",
    },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 러시안 룰렛 (Russian Roulette), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

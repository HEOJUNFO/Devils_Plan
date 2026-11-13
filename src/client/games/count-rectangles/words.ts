/**
 * The words of 네모 세기 (Count the Rectangles), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

const ko = {
  sheet: {
    title: "네모 세기: 규칙",
    brief: {
      goal: "숫자를 더하면 타깃이 되는 네모가 몇 개인지 먼저 맞힙니다.",
      play: "다 세었으면 버저를 누르고 10초 안에 개수를 답합니다.",
      end: "두 번 맞히면 승리이고, 전체 팀의 절반이 승리하면 끝납니다.",
    },
    parts: [
      "숫자가 적힌 칸과 빈칸으로 된 판, 그리고 타깃 넘버가 나옵니다. 안의 숫자를 더하면 타깃이 되는 네모가 모두 몇 개인지 셉니다.",
      [
        "네모는 판 위의 칸으로 된 모든 직사각형입니다: 한 칸짜리부터. 판이 네모반듯하지 않을 수 있고, 칸이 없는 자리는 걸칠 수 없습니다.",
        "빈칸은 0으로 칩니다. 타깃이 0이면 빈칸만으로 된 네모도 셉니다.",
        "다 세었으면 버저를 누르고 10초 안에 개수를 답합니다. 버저는 한 번에 한 사람만 누를 수 있습니다.",
        "틀리거나 답하지 못하면 그 문제에서는 다시 답할 수 없습니다. 팀이면 팀 전체가 그렇습니다.",
        "두 번 맞히면 승리하고 이후 문제에서 빠집니다. 전체 팀의 절반이 승리하면 끝납니다.",
      ],
      "시작 전에 세 사람은 팀을 맺을 수 있습니다 (세 명이 아닌 팀은 각자 혼자 합니다). 팀을 가장 먼저 고른 사람이 그 팀의 대표입니다. 혼자 하는 사람도 한 팀으로 셉니다. 문제마다 제한 시간은 5분입니다.",
      "끝나면 선택 3으로 승점을 나눕니다. 모두 동시에 고르고, 한 번 고르면 바꿀 수 없습니다.",
      [
        "승리 팀 (팀의 다수결): 독식은 대표 5점·두 팀원 1점씩, 헌신은 대표 1점·두 팀원 3점씩.",
        "패배 팀 (팀의 다수결): 희생은 대표만 3점 차감, 질책은 두 팀원만 2점씩 차감.",
        "개인: 승리 7점, 패배 3점 차감. 안전은 1점 더 차감, 도전은 추가 대결 (도전한 사람끼리 먼저 맞히면 승리: 피스 3개, 지면 3점 차감).",
      ],
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 눌러 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-choosing": "지금은 선택하는 때가 아닙니다",
    "already-chosen": "이미 골랐습니다. 선택은 바꿀 수 없습니다",
    "not-in-duel": "추가 대결은 도전을 고른 사람끼리 합니다",
    "not-open": "지금은 버저를 누를 수 없습니다",
    "shut-out": "이 문제는 이미 틀렸습니다",
    "already-won": "이미 승리했습니다",
    "not-your-answer": "버저를 누른 사람만 답합니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "bad-teams": "팀 인원이 맞지 않습니다",
    "too-few": "시작할 사람이 없습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** The one refusal whose words hold a number of the rules. */
  badCount: (most: number) => `0부터 ${most}까지의 수로 답하세요`,
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    half: "절반이 승리: 끝!",
    problems: "마지막 문제까지 끝",
    abandoned: "이어갈 사람이 없어 끝",
  },
  /** With one side alone, "half have won" would say nothing. */
  endedUnopposed: "끝!",
  /** The third choice, "선택 3": its name, and the cards over the board. */
  choice: {
    name: "선택 3",
    /** What the two options of each card are called, as the show calls them. */
    options: {
      winners: ["독식", "헌신"],
      losers: ["희생", "질책"],
      alone: ["도전", "안전"],
    } as Record<"winners" | "losers" | "alone", readonly [string, string]>,
    /** How large an option's name is written on its card, in pixels: 78 are free for it before what the option does. */
    optionSize: 24 as number,
    /** Whom each card is for, as its heading says: 206 pixels after the choice's name. */
    cardFor: {
      winners: "승리 팀 · 팀의 다수결로 정합니다",
      losers: "패배 팀 · 팀의 다수결로 정합니다",
      alone: "개인 플레이어",
    },
    /** What an option does, in lines of 184 pixels, with the numbers of the rules. */
    hog: (leader: number, member: number) => [`대표 승점 ${leader}점 획득,`, `두 팀원 승점 각 ${member}점씩 획득`],
    devote: (leader: number, member: number) => [`대표 승점 ${leader}점 획득,`, `두 팀원 승점 각 ${member}점씩 획득`],
    sacrifice: (leader: number) => [`대표만 승점 ${leader}점 차감`],
    blame: (member: number) => [`두 팀원만 승점 ${member}점씩 차감`],
    dare: (pieces: number, loss: number) => ["추가 대결을 진행한다.", `승리 시 피스 ${pieces}개 획득,`, `패배 시 승점 ${loss}점 차감`],
    safe: (loss: number) => ["대결하지 않고,", `승점 ${loss}점 차감`],
    picked: (have: number, of: number) => `${have}/${of}명이 골랐습니다`,
    everyone: "모두 고르는 중입니다",
    /** Before how many have picked: who leads the viewer's team. */
    leader: (who: string | null) => (who === null ? "우리 팀 대표: 나 · " : `우리 팀 대표: ${who} · `),
    /** Under the line that says where the game stands, 468 pixels. */
    watching: "승리 팀은 독식·헌신, 패배 팀은 희생·질책을 다수결로, 개인은 도전·안전을 고릅니다.",
    done: "골랐습니다. 모두 고르면 한꺼번에 공개됩니다.",
    confirm: byInput("한 번 더 누르거나 Enter로 확정합니다. 한 번 고르면 바꿀 수 없습니다.", "한 번 더 누르면 확정합니다. 한 번 고르면 바꿀 수 없습니다."),
    how: byInput("1 또는 2, 또는 카드를 눌러 고릅니다. 한 번 고르면 바꿀 수 없습니다.", "카드를 눌러 고릅니다. 한 번 고르면 바꿀 수 없습니다."),
    rules: byInput("H: 규칙 (선택 3의 승점 나누기 포함)", "선택 3의 승점 나누기는 왼쪽 위 메뉴의 규칙 보기에 있습니다"),
  },
  /** Beside the board: over the target number (70 pixels), and under it once the problem is closed. */
  target: "타깃",
  answer: (count: number) => `정답 ${count}개`,
  /** Over a player's head where a name has room: in the added contest, wrong, or their place. */
  mark: {
    duel: "도전",
    wrong: "오답",
    place: (place: number) => `${place}위`,
  },
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line over the buzzer, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    sending: "보내는 중",
    choose: (seconds: number) => `선택 3: 하나를 고르세요 · ${seconds}초`,
    chooseWait: (seconds: number) => `선택 3: 모두 고르기를 기다리는 중 · ${seconds}초`,
    answer: (seconds: number) => `답을 말하세요 · ${seconds}초`,
    answering: (who: string, seconds: number) => `${who} 답하는 중 · ${seconds}초`,
    /** How a problem closed (`who` got it right, the time ran out, or everyone was wrong), and how long until the next. */
    next: (how: { right: string } | "time" | "all-wrong", seconds: number) =>
      `${how === "time" ? "시간 종료" : how === "all-wrong" ? "모두 오답" : `${how.right} 정답!`} · 다음 문제까지 ${seconds}초`,
    over: "판이 끝났습니다",
    watching: "관전 중입니다. 다음 판부터 함께할 수 있습니다",
    /** Between the names of those in the added contest. */
    versus: " 대 ",
    duelWatch: (names: string) => `추가 대결을 구경합니다: ${names}`,
    wrong: "오답: 이 문제에서는 다시 답할 수 없습니다",
    duel: byInput("추가 대결! 먼저 맞히면 승리 · 버저 (Space)", "추가 대결! 먼저 맞히면 승리 · 버저를 누르세요"),
    won: "승리! 남은 문제를 구경합니다",
    buzz: byInput("다 세었으면 버저! (Space)", "다 세었으면 버저!"),
  },
  /** The moves, a line each in a column 168 pixels wide. */
  log: {
    problem: (round: number) => `문제 ${round}`,
    duelProblem: (round: number) => `추가 대결 문제 ${round}`,
    buzz: (who: string) => `${who} 버저!`,
    right: (who: string, said: number) => `${who}: ${said}개 정답!`,
    wrong: (who: string, said: number) => `${who}: ${said}개 오답`,
    silent: (who: string) => `${who}: 답하지 못함`,
    time: "제한 시간 종료",
    allWrong: "모두 오답",
    won: (unit: string, place: number) => `${unit} 승리 (${place}위)`,
    /** The race is over and the choice begins: because half have won (said only where there was someone to race), or the problems ran out. */
    raced: (reason: "half" | "problems", unopposed: boolean): string =>
      reason === "half" ? (unopposed ? "선택 3" : "절반이 승리 · 선택 3") : "마지막 문제까지 · 선택 3",
    /** What a team decided; the screen cuts the team's name to what the rest leaves it. */
    decided: (unit: string, option: string) => `${unit}: ${option}`,
    alone: (option: string, names: readonly string[]) => `${option} ${names.length}명: ${names.join(", ")}`,
    duel: (names: string) => `추가 대결: ${names}`,
    duelNobody: "추가 대결: 승자 없음",
    duelWon: (who: string, pieces: number) => `대결 승리: ${who} · 피스 ${pieces}개`,
    scored: "승점을 셌습니다",
  },
  /** The column on the right. */
  panel: {
    problem: (round: number) => `문제 ${round}`,
    duel: (round: number) => `추가 대결 ${round}`,
    seconds: (seconds: number) => `${seconds}초`,
    place: (place: number) => `${place}위`,
    toWin: (wins: number) => byInput(`${wins}번 맞히면 승리 · H 규칙`, `${wins}번 맞히면 승리`),
    toEnd: (units: number, needed: number) => (units === 1 ? "상대 없는 판: 승리하면 끝" : `${units}팀 중 ${needed}팀이 이기면 끝`),
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, won: boolean): string => (!seated ? "종료" : won ? "승리!" : "패배"),
    place: (place: number, unit: string) => `${place}위 ${unit}`,
    nobody: "승리한 팀이 없습니다",
    upTo: (round: number) => `문제 ${round}까지 했습니다`,
    points: (total: string) => `승점 ${total}`,
    team: (option: string, leads: boolean) => `${option} (${leads ? "대표" : "팀원"})`,
    race: (points: string) => `네모 세기 ${points}`,
    safe: (points: string) => `안전 ${points}`,
    duel: (points: string) => `추가 대결 ${points}`,
    duelWon: (pieces: number) => `추가 대결 승리: 피스 ${pieces}개`,
    hostNext: (alone: boolean): string => (alone ? "한 판 더 하거나 대기실로" : "같은 사람들과 한 판 더 하거나 대기실로"),
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons along the bar: the two under the results 88 pixels wide inside, the buzzer 140, the one that takes a digit back 28. */
  button: {
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    buzzer: "버저",
    buzzerKeys: byInput("Space 또는 Enter", "누르고 답하기"),
    buzzerShut: "지금은 누를 수 없음",
    erase: "지움",
    /** Gives the number entered as the answer: the key that does, or under a finger a word for it. */
    say: byInput("Enter", "입력"),
  },
  /** Before the number being typed: 16 pixels. */
  typed: "답",
  /** Beside the buzzer: two lines of 312 pixels. */
  brief: ["네모: 판 위의 칸으로 된 모든 직사각형 (한 칸도).", "합이 타깃이면 셉니다. 빈칸은 0. 틀리면 이 문제는 끝."],
  /** The rules over the screen (H), by the room's own numbers: 16 lines of 436 pixels at most (a seventeenth would lie on the sheet's frame). */
  help: (rules: {
    answerSeconds: number;
    teamSize: number;
    winsNeeded: number;
    problemSeconds: number;
    winPoints: number;
    losePoints: number;
    hogLeader: number;
    hogMember: number;
    devoteLeader: number;
    devoteMember: number;
    sacrificeLeader: number;
    blameMember: number;
    safeLoss: number;
    duelPieces: number;
    duelLoss: number;
  }): HelpLine[] => [
    { text: "네모 세기: 규칙", tone: "title" },
    { text: "판에는 숫자가 적힌 칸과 빈칸이 있습니다. 안의 숫자를 더하면 타깃 넘버가" },
    { text: "되는 네모가 모두 몇 개인지 셉니다." },
    { text: "네모는 판 위의 칸으로 된 모든 직사각형입니다: 한 칸짜리부터. 판이 네모반듯", tone: "dim" },
    { text: "하지 않을 수 있고, 칸이 없는 자리는 걸칠 수 없습니다. 빈칸은 0으로 칩니다.", tone: "dim" },
    { text: "" },
    { text: `다 세었으면 버저를 누르고 ${rules.answerSeconds}초 안에 개수를 답합니다.` },
    { text: "틀리면 (또는 답하지 못하면) 그 문제에서는 다시 답할 수 없습니다." },
    { text: `${rules.teamSize}명이 팀을 맺었으면 팀 전체가 그렇습니다. 문제마다 제한 시간은 ${Math.round(rules.problemSeconds / 60)}분입니다.`, tone: "dim" },
    { text: `${rules.winsNeeded}번 맞히면 승리하고 이후 문제에서 빠집니다.` },
    { text: "전체 팀(혼자도 한 팀)의 절반이 승리하면 끝납니다." },
    { text: `끝나면 선택 3. 승리 팀은 승점 ${rules.winPoints}점을 독식(대표 ${rules.hogLeader}, 팀원 ${rules.hogMember}씩)이나` },
    { text: `헌신(대표 ${rules.devoteLeader}, 팀원 ${rules.devoteMember}씩)으로 나누고, 패배 팀은 희생(대표만 -${rules.sacrificeLeader})이나` },
    { text: `질책(두 팀원 -${rules.blameMember}씩)으로 나눕니다. 팀의 다수결, 대표는 팀을 먼저 고른 사람.` },
    { text: `개인: 승리 +${rules.winPoints}, 패배 -${rules.losePoints}. 안전 -${rules.safeLoss}. 도전: 추가 대결, 이기면 피스 ${rules.duelPieces}개, 지면 -${rules.duelLoss}.` },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Count the Rectangles: rules",
    brief: {
      goal: "Be first to say how many rectangles add up to the target.",
      play: "Press the buzzer, then give your count within 10 seconds.",
      end: "Two right answers win. Over when half the teams have won.",
    },
    parts: [
      "A board of numbered cells and blank cells comes up, with a target number. Count how many rectangles there are whose numbers add up to the target.",
      [
        "A rectangle is any rectangle made of cells of the board, from a single cell up. The board itself may not be a neat rectangle, and a rectangle cannot lie over a place with no cell.",
        "A blank cell counts as 0. When the target is 0, rectangles of blank cells alone count too.",
        "When you have counted, press the buzzer and give the number within 10 seconds. Only one player holds the buzzer at a time.",
        "Answer wrong, or not at all, and you cannot answer that problem again. In a team, that goes for the whole team.",
        "Two right answers win, and a winner sits out the problems after. The game ends when half of all the teams have won.",
      ],
      "Before the start, three players can form a team (a team of any other size plays as players alone). Whoever picks a team first is its leader. A player alone counts as a team too. Each problem has a limit of 5 minutes.",
      "At the end, Selection 3 shares out the points. Everyone picks at once, and a pick cannot be changed.",
      [
        "Winning team (by its majority): Monopolize gives the leader 5 and the two others 1 each; Sacrifice gives the leader 1 and the two others 3 each.",
        "Losing team (by its majority): Sacrifice takes 3 from the leader alone; Punish takes 2 from each of the two others.",
        "Alone: 7 for a win, 3 off for a loss. Safety takes 1 more off; Challenge is an added contest (those who chose it race to answer first: the winner gets 3 Pieces, the losers lose 3 points).",
      ],
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Press again",
  refused: {
    "not-choosing": "This is not the time to pick",
    "already-chosen": "You have picked. A pick cannot be changed",
    "not-in-duel": "The playoff is among those who chose Challenge",
    "not-open": "The buzzer cannot be pressed now",
    "shut-out": "You already got this problem wrong",
    "already-won": "You have already won",
    "not-your-answer": "Only whoever pressed the buzzer answers",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "bad-teams": "The teams are the wrong size",
    "too-few": "There is nobody to start with",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  badCount: (most) => `Answer with a number from 0 to ${most}`,
  ended: {
    half: "Half have won: over!",
    problems: "Over: last problem done",
    abandoned: "Over: nobody left to play",
  },
  endedUnopposed: "Over!",
  choice: {
    name: "Selection 3",
    // The show's English gives 헌신 and 희생 the same word. A team is only ever shown one of the two.
    options: {
      winners: ["Monopolize", "Sacrifice"],
      losers: ["Sacrifice", "Punish"],
      alone: ["Challenge", "Safety"],
    },
    // "Monopolize" in large letters would run over what the option does
    optionSize: 12,
    cardFor: {
      winners: "Winning team · by its majority",
      losers: "Losing team · by its majority",
      alone: "Players alone",
    },
    hog: (leader, member) => [`Leader gets ${leader} points,`, `the two others ${member} each`],
    devote: (leader, member) => [`Leader gets ${leader} point${leader === 1 ? "" : "s"},`, `the two others ${member} each`],
    sacrifice: (leader) => [`The leader alone loses ${leader}`],
    blame: (member) => [`The two others lose ${member} each`],
    dare: (pieces, loss) => ["Play a playoff.", `Win: ${pieces} Pieces,`, `lose: ${loss} points off`],
    safe: (loss) => ["No playoff,", `${loss} point${loss === 1 ? "" : "s"} off`],
    picked: (have, of) => `${have}/${of} have picked`,
    everyone: "Everyone is picking",
    leader: (who) => (who === null ? "Our leader: you · " : `Our leader: ${who} · `),
    watching: "Winning teams, losing teams and players alone each pick one of two.",
    done: "Picked. All picks are shown at once when everyone has picked.",
    confirm: byInput("Press it again, or Enter, to confirm. A pick cannot be changed.", "Tap it again to confirm. A pick cannot be changed."),
    how: byInput("Press 1 or 2, or a card, to pick. A pick cannot be changed.", "Tap a card to pick. A pick cannot be changed."),
    rules: byInput("H: rules (with how Selection 3 shares the points)", "How Selection 3 shares the points: Menu (top left), Rules"),
  },
  target: "Target",
  answer: (count) => `Answer: ${count}`,
  mark: {
    duel: "playoff",
    wrong: "wrong",
    place: (place) => englishOrdinal(place),
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    sending: "Sending",
    choose: (seconds) => `Selection 3: pick one · ${seconds}s`,
    chooseWait: (seconds) => `Selection 3: waiting for everyone to pick · ${seconds}s`,
    answer: (seconds) => `Give your answer · ${seconds}s`,
    answering: (who, seconds) => `${who} is answering · ${seconds}s`,
    next: (how, seconds) => `${how === "time" ? "Time is up" : how === "all-wrong" ? "All wrong" : `${how.right} is right!`} · next problem in ${seconds}s`,
    over: "The game is over",
    watching: "You are watching. You can play from the next game",
    versus: " vs ",
    duelWatch: (names) => `Watching the playoff: ${names}`,
    wrong: "Wrong: you cannot answer this problem again",
    duel: byInput("Playoff! First right answer wins · buzzer (Space)", "Playoff! First right answer wins · hit the buzzer"),
    won: "You won! Watch the rest of the problems",
    buzz: byInput("Counted? Hit the buzzer! (Space)", "Counted? Hit the buzzer!"),
  },
  log: {
    problem: (round) => `Problem ${round}`,
    duelProblem: (round) => `Playoff problem ${round}`,
    buzz: (who) => `${who} buzzes!`,
    right: (who, said) => `${who}: ${said}, right!`,
    wrong: (who, said) => `${who}: ${said}, wrong`,
    silent: (who) => `${who}: no answer`,
    time: "Time is up",
    allWrong: "All wrong",
    won: (unit, place) => `${unit} wins (${englishOrdinal(place)})`,
    raced: (reason, unopposed) => (reason === "half" ? (unopposed ? "Selection 3" : "Half won · Selection 3") : "All problems · Selection 3"),
    decided: (unit, option) => `${unit}: ${option}`,
    alone: (option, names) => `${option} (${names.length}): ${names.join(", ")}`,
    duel: (names) => `Playoff: ${names}`,
    duelNobody: "Playoff: no winner",
    // the lines before it say that this is the playoff
    duelWon: (who, pieces) => `${who} wins · ${pieces} Pieces`,
    scored: "Points are counted",
  },
  panel: {
    problem: (round) => `Problem ${round}`,
    duel: (round) => `Playoff ${round}`,
    seconds: (seconds) => `${seconds}s`,
    place: (place) => englishOrdinal(place),
    toWin: (wins) => byInput(`${wins} right to win · H rules`, `${wins} right to win`),
    toEnd: (units, needed) => (units === 1 ? "No rival: a win ends it" : `Over when ${needed} of ${units} win`),
  },
  result: {
    verdict: (seated, won) => (!seated ? "Over" : won ? "Won!" : "Lost"),
    place: (place, unit) => `${englishOrdinal(place)} ${unit}`,
    nobody: "No team won",
    upTo: (round) => `Played up to problem ${round}`,
    points: (total) => `Points ${total}`,
    team: (option, leads) => `${option} (${leads ? "leader" : "member"})`,
    race: (points) => `Race ${points}`,
    safe: (points) => `Safety ${points}`,
    duel: (points) => `Playoff ${points}`,
    duelWon: (pieces) => `Playoff won: ${pieces} Pieces`,
    hostNext: (alone) => (alone ? "Play again or go back" : "Play again with the same people or go back"),
    waitHost: "Waiting for the host to start a new game",
  },
  button: {
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
    buzzer: "Buzzer",
    buzzerKeys: byInput("Space or Enter", "Tap to answer"),
    buzzerShut: "Not available now",
    erase: "Del",
    say: byInput("Enter", "OK"),
  },
  typed: "#",
  brief: ["Rectangle: any rectangle of cells (one cell too).", "Sum = target counts. Blank = 0. One wrong: out."],
  help: (rules) => [
    { text: "Count the Rectangles: rules", tone: "title" },
    { text: "The board has numbered and blank cells. Count the rectangles" },
    { text: "whose numbers add up to the target number." },
    { text: "A rectangle: any rectangle of cells of the board, one cell or more.", tone: "dim" },
    { text: "The board may be ragged: none lies over a gap. A blank is 0.", tone: "dim" },
    { text: "" },
    { text: `Counted? Press the buzzer and answer within ${rules.answerSeconds} seconds.` },
    { text: `Wrong (or no answer) and you cannot answer that problem again;` },
    { text: `nor can your team (of ${rules.teamSize}). A problem lasts ${Math.round(rules.problemSeconds / 60)} minutes at most.`, tone: "dim" },
    { text: `${rules.winsNeeded} right answers win, and a winner sits out the problems after.` },
    { text: "It ends when half the teams (a player alone is a team) have won." },
    { text: `Then Selection 3. Winners share ${rules.winPoints}: Monopolize (leader ${rules.hogLeader}, others ${rules.hogMember})` },
    { text: `or Sacrifice (leader ${rules.devoteLeader}, others ${rules.devoteMember}). Losers: Sacrifice (leader -${rules.sacrificeLeader}) or` },
    { text: `Punish (others -${rules.blameMember} each), by majority. Alone: win +${rules.winPoints}, lose -${rules.losePoints};` },
    { text: `Safety -${rules.safeLoss}; Challenge is a playoff: winner ${rules.duelPieces} Pieces, losers -${rules.duelLoss}.` },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 네모 세기 (Count the Rectangles), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

/**
 * The words of 돼지 저금통 (Piggy Bank), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the show's English release (its closed
 * captions): suspicion, reset, challenge, top shelf and bottom shelf.
 */
import type { Colour, PiggyEnd } from "../../../shared/games/piggy-bank/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  putMin: number;
  putMax: number;
  answerSeconds: number;
  suspectSeconds: number;
  suspectGain: number;
  suspectedLoss: number;
  suspectMissLoss: number;
  challengeGain: number;
  challengeLoss: number;
  target: number;
  prize: number;
  /** How many have to ask for a reset in this game. */
  resetNeeds: number;
}

/** A number of points with its sign: "+1", "-2", "0". */
const signed = (points: number): string => (points > 0 ? `+${points}` : `${points}`);

const ko = {
  sheet: {
    title: "돼지 저금통: 규칙",
    brief: {
      goal: "저금통마다 든 흑·백 동전의 수를 기억해, 틀린 답을 의심합니다.",
      play: "동전을 넣고 말한 뒤 건네면, 받은 사람이 한 색의 개수를 답합니다.",
      end: "누가 5점이 되고 꼴찌가 한 명으로 정해지면 끝납니다.",
    },
    parts: [
      "모두 흑 동전 1개와 백 동전 1개가 든 저금통을 하나씩 받아 아래 칸에 둡니다. 저금통은 인원보다 하나 많고, 남는 하나는 선 플레이어의 위 칸에 놓입니다. 순서와 선 플레이어는 추첨으로 정합니다.",
      [
        "차례인 사람은 아래 칸의 저금통에 흑·백 동전을 합쳐 1개에서 5개까지 넣고, 넣은 색과 개수를 모두에게 알린 뒤 원하는 사람에게 건넵니다. 건넨 사람은 위 칸의 저금통을 아래 칸으로 내립니다.",
        "받은 사람은 그 저금통을 위 칸에 놓고, 10초 안에 그 안의 흑 또는 백 동전이 모두 몇 개인지 답합니다. 묻는 색은 질문마다 흑, 백이 번갈아 나옵니다.",
        "답이 틀렸다고 생각하면 다른 사람은 5초 안에 의심을 선언합니다. 가장 먼저 선언한 한 명만 인정됩니다. 의심이 나오면 저금통을 열어 확인하고, 열린 저금통은 게임에서 빠집니다.",
        "의심이 맞으면 의심한 사람이 1점을 얻고 답한 사람이 1점을 잃습니다. 답이 맞았으면 의심한 사람이 1점을 잃습니다. 점수를 잃은 사람은 새 번호의 저금통을 받고 이어서 동전을 넣습니다.",
        "아무도 의심하지 않으면 받은 사람이 자기 아래 칸의 저금통에 동전을 넣고 건넵니다.",
      ],
      "누구나 언제든 리셋을 신청할 수 있습니다. 한 명만 빼고 모두 신청하면 리셋이 확정되어, 쓰던 저금통을 모두 치우고 새 저금통을 다시 나눠 줍니다. 그 전에 리셋을 신청하지 않은 사람은 도전할 수 있습니다: 쓰던 모든 저금통의 흑·백 개수를 전부 맞히면 3점을 얻고, 하나라도 틀리면 2점을 잃습니다.",
      "누가 5점이 되면 점수로 순위를 가립니다. 이때 꼴찌가 한 명으로 정해져 있으면 게임이 끝나고, 꼴찌가 여럿이면 한 명으로 정해질 때까지 이어집니다. 1위는 피스 3개를 받고, 1위가 여럿이면 똑같이 나눕니다.",
      "넣은 개수와 답은 그때 한 번만 보여 줍니다. 기록은 남지 않으니 외워야 합니다. 방송에는 넣는 데 시간제한이 없지만 여기서는 15초이고, 시간이 지나면 방이 흑 동전 1개를 넣어 다음 사람에게 건넵니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-your-turn": "지금은 내 차례가 아닙니다",
    "bad-coins": "동전은 1개에서 5개까지 넣습니다",
    "bad-receiver": "방에 있는 다른 사람에게 건네세요",
    "not-suspecting": "지금은 의심할 수 없습니다",
    "own-answer": "내 답은 의심할 수 없습니다",
    "passed": "이미 넘겼습니다",
    "no-reset": "지금은 리셋을 신청할 수 없습니다",
    "reset-asked": "이미 리셋을 신청했습니다",
    "no-challenge": "지금은 도전할 수 없습니다",
    "bad-banks": "모든 저금통의 개수를 적어야 합니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "세 명 이상이어야 합니다",
    "too-many": "여섯 명까지 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    target: "목표 점수에 닿아 끝",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<PiggyEnd, string>,
  colour: { black: "흑", white: "백" } as Record<Colour, string>,
  /** A bank by its number, on a table and in a sentence. */
  bank: (id: number) => `${id}번`,
  /** A player's points beside their name. */
  points: (points: number) => `${points}점`,
  signed,
  /** The column's heading, with the clock beside it. */
  heading: (target: number) => `목표 ${target}점`,
  watching: "관전 중",
  /** In the scene, 296 pixels a line. */
  scene: {
    /** What was put in, as it is said aloud. */
    said: (who: string, bank: number, black: number, white: number, to: string) => `${who}: ${bank}번에 흑 ${black}개, 백 ${white}개 → ${to}`,
    asked: (who: string, bank: number, colour: string) => `${who}: ${bank}번의 ${colour} 동전은 모두 몇 개?`,
    answer: (count: number | null) => (count === null ? "답: 없음 (시간 초과)" : `답: ${count}개`),
    next: (colour: string) => `다음 질문: ${colour}`,
    opened: (bank: number, black: number, white: number) => `${bank}번을 열었습니다: 흑 ${black}개, 백 ${white}개`,
    held: (by: string, who: string, gain: number, loss: number) => `의심 성공! ${by} ${signed(gain)}, ${who} ${signed(-loss)}`,
    failed: (by: string, loss: number) => `의심 실패. ${by} ${signed(-loss)}`,
    resetSettled: "리셋이 확정됐습니다",
    challenger: (who: string) => `${who}의 도전: 모든 저금통의 흑·백 개수`,
    challengeRight: (who: string, gain: number) => `도전 성공! ${who} ${signed(gain)}`,
    challengeWrong: (who: string, loss: number) => `도전 실패. ${who} ${signed(-loss)}`,
    /** The heads of the rows of a challenge: what was named, and what a bank held. */
    named: "말한 것",
    held2: "실제",
    put: "넣을 동전",
    to: (who: string) => `받을 사람: ${who}`,
    noReceiver: byInput("받을 사람: ←→로 고르기", "받을 사람: 자리를 눌러 고르기"),
    yourAnswer: "내 답",
  },
  /** The reset button at the top of the scene: how many have asked of how many it takes; 80 pixels. */
  reset: (have: number, needs: number) => `${keyed("R", "리셋")} ${have}/${needs}`,
  resetArmed: "한 번 더 누르면 리셋을 신청합니다 (취소할 수 없음)",
  /** Said in the bar for a moment. */
  say: {
    paused: "판이 멈춰 있습니다",
    pickReceiver: "받을 사람을 먼저 고르세요",
    noCoins: "동전을 1개 이상 넣으세요",
    tooMany: (most: number) => `동전은 합쳐서 ${most}개까지 넣습니다`,
  },
  /** Over the scene while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels (358 while a button is beside it). */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    put: (bank: number, seconds: number) => `내 차례: ${bank}번 저금통에 동전을 넣고 건네세요 · ${seconds}초`,
    putOther: (who: string, seconds: number) => `${who}이(가) 동전을 넣는 중 · ${seconds}초`,
    answer: (bank: number, colour: string, seconds: number) => `${bank}번의 ${colour} 동전은 모두 몇 개? · ${seconds}초`,
    answerOther: (who: string, seconds: number) => `${who}이(가) 답하는 중 · ${seconds}초`,
    suspect: (seconds: number) => `답이 틀렸다면 의심하세요 · ${seconds}초`,
    suspectMine: (seconds: number) => `의심을 기다리는 중 · ${seconds}초`,
    suspectPassed: (seconds: number) => `넘겼습니다 · 다른 사람을 기다리는 중 · ${seconds}초`,
    watchSuspect: (seconds: number) => `의심할 시간 · ${seconds}초`,
    opened: (seconds: number) => `저금통을 열었습니다 · ${seconds}초`,
    call: (seconds: number) => `리셋 확정 · 모든 저금통 맞히기에 도전할까요? · ${seconds}초`,
    callOther: (seconds: number) => `리셋 확정 · 도전을 기다리는 중 · ${seconds}초`,
    challenge: (seconds: number) => `모든 저금통의 흑·백 개수를 적고 제출하세요 · ${seconds}초`,
    challengeOther: (who: string, seconds: number) => `${who}이(가) 도전하는 중 · ${seconds}초`,
    challenged: (seconds: number) => `도전 결과 · 곧 저금통을 새로 나눕니다 · ${seconds}초`,
  },
  /** To a player in their first game of it, in place of `standing.put` and `standing.putOther`: what the counting is for. */
  coach: {
    put: (bank: number, seconds: number) => `${bank}번에 넣고 건네면, 받은 사람이 개수를 답합니다 · ${seconds}초`,
    putOther: (who: string, seconds: number) => `${who}이(가) 넣는 수를 저금통마다 더해 외워 두세요 · ${seconds}초`,
  },
  /** Under the standing line, 358 pixels. */
  keys: {
    put: byInput("↑↓: 개수 · Space: 흑/백 · ←→: 받을 사람 · Enter: 건네기", "+/-로 개수를 정하고, 받을 사람의 자리를 누른 뒤 건네기"),
    answer: byInput("↑↓ 또는 숫자: 개수 · Enter: 답하기", "+/-로 개수를 정하고 답하기"),
    suspect: byInput("Space: 의심 · Enter: 넘기기 (의심 안 함)", "의심하거나 넘기세요"),
    call: byInput("Space: 도전 · Enter: 넘기기 (도전 안 함)", "도전하거나 넘기세요"),
    challenge: byInput("←→: 칸 옮기기 · ↑↓ 또는 숫자: 개수 · Enter: 제출", "칸을 누르고 +/-로 개수를 정한 뒤 제출"),
  },
  hint: "H: 규칙 · M: 음소거 · T: 채팅",
  /** The moves, a line of the column each: 168 pixels. */
  log: {
    dealt: (first: string) => `새 저금통 · 선 ${first}`,
    put: (who: string, bank: number, to: string) => `${who} → ${to} · ${bank}번`,
    autoPut: (who: string, bank: number, to: string) => `${who} → ${to} · ${bank}번 자동`,
    silent: (who: string) => `${who}: 답 없음`,
    trusted: "의심 없음",
    held: (by: string, who: string) => `의심 성공: ${by} ▶ ${who}`,
    failed: (by: string, who: string) => `의심 실패: ${by} ▶ ${who}`,
    openedBank: (bank: number, black: number, white: number) => `${bank}번: 흑 ${black} 백 ${white}`,
    issued: (who: string, bank: number) => `${who}: 새 ${bank}번`,
    resetAsked: (who: string) => `리셋 신청: ${who}`,
    reset: "리셋 확정",
    challenge: (who: string) => `${who}: 도전`,
    challengeRight: (who: string, gain: number) => `도전 성공: ${who} ${signed(gain)}`,
    challengeWrong: (who: string, loss: number) => `도전 실패: ${who} ${signed(-loss)}`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string, points: number) => `${place}위 ${who} ${points}점`,
    mine: (points: number, pieces: number) => (pieces > 0 ? `내 점수: ${points}점 · 피스 ${pieces}개` : `내 점수: ${points}점`),
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons of the bar, 102 pixels wide inside. */
  button: {
    pass: keyed("Enter", "건네기"),
    answer: keyed("Enter", "답하기"),
    suspect: keyed("Space", "의심!"),
    trust: keyed("Enter", "넘기기"),
    challenge: keyed("Space", "도전!"),
    decline: keyed("Enter", "넘기기"),
    submit: keyed("Enter", "제출"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "돼지 저금통: 규칙", tone: "title" },
    { text: "저금통마다 흑·백 동전이 1개씩 들어 있습니다. 넣는 것을 보며 개수를 외웁니다." },
    { text: "" },
    { text: `내 차례: 아래 칸 저금통에 흑·백 합쳐 ${n.putMin}~${n.putMax}개를 넣고 누군가에게 건넵니다.` },
    { text: "넣은 색과 개수는 모두에게 한 번 보이고, 기록에 남지 않습니다.", tone: "dim" },
    { text: `받은 사람은 ${n.answerSeconds}초 안에 그 저금통의 흑(또는 백) 동전이 모두 몇 개인지` },
    { text: "답합니다. 묻는 색은 질문마다 흑, 백이 번갈아 나옵니다." },
    { text: "" },
    { text: `답이 틀렸다 싶으면 ${n.suspectSeconds}초 안에 의심합니다 (가장 빠른 한 명). 저금통을 엽니다.` },
    { text: `틀렸으면 의심한 사람 ${signed(n.suspectGain)}, 답한 사람 ${signed(-n.suspectedLoss)}. 맞았으면 의심한 사람 ${signed(-n.suspectMissLoss)}.`, tone: "mark" },
    { text: "열린 저금통은 빠지고, 점수를 잃은 사람이 새 저금통을 받아 이어 갑니다.", tone: "dim" },
    { text: "" },
    { text: `리셋: ${n.resetNeeds}명이 신청하면 저금통을 모두 새로 나눕니다. 신청하지 않은 사람은` },
    { text: `도전할 수 있습니다: 모든 저금통의 흑·백을 다 맞히면 ${signed(n.challengeGain)}, 틀리면 ${signed(-n.challengeLoss)}.` },
    { text: `누가 ${n.target}점이 되고 꼴찌가 한 명이면 끝. 1위는 피스 ${n.prize}개 (여럿이면 나눔).`, tone: "mark" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Piggy Bank: rules",
    brief: {
      goal: "Keep count of the coins in every bank, and catch a wrong answer.",
      play: "Put coins in, say what, pass it on; the receiver counts a colour.",
      end: "Over once someone has 5 points and one player alone is last.",
    },
    parts: [
      "Everyone has a piggy bank holding one black coin and one white coin, on their bottom shelf. There is one more bank than players; the spare one starts on the first player's top shelf. The order and the first player are drawn.",
      [
        "On your turn you put one to five coins, black and white together, into the bank on your bottom shelf, everyone is told the colours and the numbers, and you pass the bank to a player of your choice. The bank on your top shelf then comes down to the bottom.",
        "The receiver puts the bank on their top shelf and has 10 seconds to say how many black coins, or white coins, are in it altogether. The colour asked alternates with every question: black, white, black.",
        "Anyone else who thinks the answer wrong has 5 seconds to declare a suspicion. Only the first to declare counts. The bank is then opened and checked, and an opened bank leaves the game.",
        "If the suspicion is right, whoever declared it gains 1 point and whoever answered loses 1. If the answer was right, whoever declared the suspicion loses 1. The player who lost the point gets a bank with a new number and puts coins in next.",
        "If nobody declares a suspicion, the receiver puts coins into the bank on their own bottom shelf and passes it on.",
      ],
      "Anyone can request a reset at any time. Once everyone but one has, the reset is settled: every bank in play is taken away and new ones are handed out. Before that, whoever did not request it may declare a challenge: name the black and white coins of every bank in play, for 3 points if all are right and 2 points off otherwise.",
      "When someone reaches 5 points the players are ranked by points. If one player alone is last the game is over; if several are level in last place it goes on until one is. First place gets 3 Pieces, shared evenly between several.",
      "What is put in and what is answered are shown once, then and there. No record of them is kept: you have to remember. The show has no time limit on putting coins in; here it is 15 seconds, after which the room puts in one black coin and passes the bank to the next player.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-your-turn": "It is not your turn",
    "bad-coins": "Put in one to five coins",
    "bad-receiver": "Pass it to another player in the room",
    "not-suspecting": "No suspicion can be declared now",
    "own-answer": "You cannot suspect your own answer",
    "passed": "You have already passed",
    "no-reset": "A reset cannot be requested now",
    "reset-asked": "You have already requested a reset",
    "no-challenge": "No challenge can be declared now",
    "bad-banks": "Name the coins of every bank",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes three players or more",
    "too-many": "Six players at most",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    target: "Over: the points are reached",
    left: "Over: nobody left to play",
    abandoned: "Over: everyone has gone",
  },
  colour: { black: "black", white: "white" },
  bank: (id) => `#${id}`,
  points: (points) => `${points}`,
  signed,
  heading: (target) => `First to ${target}`,
  watching: "Watching",
  scene: {
    said: (who, bank, black, white, to) => `${who}: ${black} black, ${white} white into #${bank} → ${to}`,
    asked: (who, bank, colour) => `${who}: how many ${colour} coins in #${bank}?`,
    answer: (count) => (count === null ? "Answer: none (out of time)" : `Answer: ${count}`),
    next: (colour) => `Next question: ${colour}`,
    opened: (bank, black, white) => `#${bank} is opened: ${black} black, ${white} white`,
    held: (by, who, gain, loss) => `The suspicion is right! ${by} ${signed(gain)}, ${who} ${signed(-loss)}`,
    failed: (by, loss) => `The suspicion fails. ${by} ${signed(-loss)}`,
    resetSettled: "The reset is settled",
    challenger: (who) => `${who} challenges: name every bank`,
    challengeRight: (who, gain) => `The challenge succeeds! ${who} ${signed(gain)}`,
    challengeWrong: (who, loss) => `The challenge fails. ${who} ${signed(-loss)}`,
    named: "Named",
    held2: "Held",
    put: "Put in",
    to: (who) => `Pass to: ${who}`,
    noReceiver: byInput("Pass to: choose with ← →", "Pass to: tap a table"),
    yourAnswer: "Your answer",
  },
  reset: (have, needs) => `${keyed("R", "reset")} ${have}/${needs}`,
  resetArmed: "Press once more to request a reset (it cannot be undone)",
  say: {
    paused: "The game is paused",
    pickReceiver: "Choose who to pass it to first",
    noCoins: "Put in at least one coin",
    tooMany: (most) => `Put in ${most} coins at most`,
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    put: (bank, seconds) => `Your turn: put coins into #${bank} and pass it · ${seconds}s`,
    putOther: (who, seconds) => `${who} is putting coins in · ${seconds}s`,
    answer: (bank, colour, seconds) => `How many ${colour} coins in #${bank}? · ${seconds}s`,
    answerOther: (who, seconds) => `${who} is answering · ${seconds}s`,
    suspect: (seconds) => `Declare a suspicion if the answer is wrong · ${seconds}s`,
    suspectMine: (seconds) => `Waiting for a suspicion · ${seconds}s`,
    suspectPassed: (seconds) => `Passed · waiting for the others · ${seconds}s`,
    watchSuspect: (seconds) => `Time for a suspicion · ${seconds}s`,
    opened: (seconds) => `The bank is opened · ${seconds}s`,
    call: (seconds) => `Reset settled · challenge to name every bank? · ${seconds}s`,
    callOther: (seconds) => `Reset settled · waiting for a challenge · ${seconds}s`,
    challenge: (seconds) => `Name both colours of every bank, then submit · ${seconds}s`,
    challengeOther: (who, seconds) => `${who} is challenging · ${seconds}s`,
    challenged: (seconds) => `The challenge is settled · new banks next · ${seconds}s`,
  },
  coach: {
    put: (bank, seconds) => `Put coins into #${bank}, pass it: they count it · ${seconds}s`,
    putOther: (who, seconds) => `Add what ${who} puts in to your count of that bank · ${seconds}s`,
  },
  keys: {
    put: byInput("↑↓: count · Space: colour · ←→: to whom · Enter: pass", "Set the coins with +/-, tap a table, then Pass"),
    answer: byInput("↑↓ or digits: count · Enter: answer", "Set the count with +/-, then Answer"),
    suspect: byInput("Space: suspicion · Enter: pass (no suspicion)", "Declare a suspicion, or pass"),
    call: byInput("Space: challenge · Enter: pass (no challenge)", "Declare a challenge, or pass"),
    challenge: byInput("←→: move · ↑↓ or digits: count · Enter: submit", "Tap a box, set it with +/-, then Submit"),
  },
  hint: "H: rules · M: mute · T: chat",
  log: {
    dealt: (first) => `New banks, ${first} first`,
    put: (who, bank, to) => `${who} → ${to} · #${bank}`,
    autoPut: (who, bank, to) => `${who} → ${to} · #${bank} auto`,
    silent: (who) => `${who}: no answer`,
    trusted: "No suspicion",
    held: (by, who) => `Right: ${by} ▶ ${who}`,
    failed: (by, who) => `Fails: ${by} ▶ ${who}`,
    openedBank: (bank, black, white) => `#${bank}: ${black} black, ${white} white`,
    issued: (who, bank) => `${who}: new #${bank}`,
    resetAsked: (who) => `Reset: ${who}`,
    reset: "The reset is settled",
    challenge: (who) => `${who}: challenge`,
    challengeRight: (who, gain) => `Challenge: ${who} ${signed(gain)}`,
    challengeWrong: (who, loss) => `Challenge: ${who} ${signed(-loss)}`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who, points) => `${englishOrdinal(place)} ${who} ${points}`,
    mine: (points, pieces) => (pieces > 0 ? `Your points: ${points} · ${pieces} ${pieces === 1 ? "Piece" : "Pieces"}` : `Your points: ${points}`),
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  button: {
    pass: keyed("Enter", "pass"),
    answer: keyed("Enter", "answer"),
    suspect: keyed("Space", "suspect"),
    trust: keyed("Enter", "pass"),
    challenge: keyed("Space", "challenge"),
    decline: keyed("Enter", "pass"),
    submit: keyed("Enter", "submit"),
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
  },
  help: (n) => [
    { text: "Piggy Bank: rules", tone: "title" },
    { text: "Each bank starts with 1 black and 1 white coin. Keep count." },
    { text: "" },
    { text: `Your turn: put ${n.putMin} to ${n.putMax} coins in your bottom bank and pass it on.` },
    { text: "What goes in is shown to everyone once, and kept in no record.", tone: "dim" },
    { text: `The receiver has ${n.answerSeconds}s to say how many of one colour it holds.` },
    { text: "The colour asked alternates: black, white, black, and so on." },
    { text: "" },
    { text: `Wrong? Declare a suspicion within ${n.suspectSeconds}s (first only): it is opened.` },
    { text: `Wrong answer: suspecter ${signed(n.suspectGain)}, answerer ${signed(-n.suspectedLoss)}. Right: suspecter ${signed(-n.suspectMissLoss)}.`, tone: "mark" },
    { text: "The opened bank is out; whoever lost the point gets a new one.", tone: "dim" },
    { text: "" },
    { text: `Reset: when ${n.resetNeeds} request it, all banks are dealt anew. Before that` },
    { text: `the others may challenge: every bank right ${signed(n.challengeGain)}, any wrong ${signed(-n.challengeLoss)}.` },
    { text: `Over at ${n.target} with one player alone last. 1st: ${n.prize} Pieces (shared).`, tone: "mark" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 돼지 저금통 (Piggy Bank), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

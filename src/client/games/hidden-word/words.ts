/**
 * The words of 히든 워드 (Hidden Word), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the English captions of the show's release:
 * Hidden Word, word setter, clue, similarity score, first-, second- and
 * third-stage clues, Piece, envelope, round. The Korean ones are the wiki's
 * (출제자, 히든 워드, 힌트, 유사도, 힌트 제시, 승점, 피스):
 * design/games/hidden-word.md.
 *
 * The words played with are Korean in either language: a clue is a Korean
 * noun, as in the show.
 */
import type { CluesEnd, HiddenEnd } from "../../../shared/games/hidden-word/rules";
import { enTime, englishOrdinal, koTime } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  rounds: number;
  envelope: number;
  clues: number;
  clueSeconds: number;
  threshold: number;
  stages: number;
  answerSeconds: number;
  pieces: number;
}


/** A line of the bar with the step's clock after it. */
const timed = (line: string, clock: string): string => (clock === "" ? line : `${line} · ${clock}`);

const ko = {
  sheet: {
    title: "히든 워드: 규칙",
    brief: {
      goal: "내 히든 워드는 숨기고 남의 히든 워드는 맞히는 낱말 게임. 힌트마다 히든 워드와의 유사도가 공개됩니다.",
      play: "출제자가 힌트 낱말을 내면 유사도(%)가 모두에게 보입니다. 95% 이상인 힌트가 나오면 나머지가 히든 워드를 적습니다.",
      end: "맞히면 1점, 아무도 못 맞히면 출제자가 점수를 얻습니다. 2라운드(2배)까지의 승점 합이 가장 높으면 승리.",
    },
    parts: [
      "2명부터 6명까지 함께 합니다. 시작하면 각자 명사 5개가 든 봉투를 받고, 라운드마다 그중 하나를 히든 워드로 정합니다. 2라운드이고, 라운드마다 모두가 한 번씩 출제자가 됩니다. 출제 순서는 라운드마다 추첨합니다.",
      [
        "출제자는 자기 히든 워드와 관련된 힌트 낱말을 하나씩 냅니다. 힌트는 한글 명사이고, 게임의 낱말 목록에 있는 낱말이어야 합니다.",
        "힌트를 낼 때마다 히든 워드와 그 힌트의 유사도(%)가 모두에게 공개됩니다.",
        "7분 30초 안에 힌트를 10개까지 낼 수 있습니다. 유사도 95% 이상인 힌트가 나오면 힌트 제시는 바로 끝납니다.",
        "10개를 다 내거나 7분 30초가 지나도 95%가 없으면, 게임의 낱말 목록에서 히든 워드와 유사도가 가장 높은 낱말이 자동으로 공개되고 답 적기로 넘어갑니다.",
      ],
      [
        "출제자를 뺀 모두가 2분 30초 안에 히든 워드라고 생각하는 낱말을 적고, 답은 동시에 공개됩니다.",
        "피스 1개를 쓰면 답을 하나 더 적을 수 있습니다. 히든 워드 하나에 한 번만 쓸 수 있습니다.",
        "맞힌 사람은 모두 승점 1점을 얻고, 그 출제자의 차례가 끝납니다.",
        "아무도 못 맞히면 출제자가 승점을 얻고 힌트를 다시 냅니다. 힌트 제시는 3차까지이고, 1차 뒤에 1점, 2차 뒤에 2점, 3차 뒤에 3점이 쌓입니다.",
      ],
      "모두가 출제자를 하면 1라운드가 끝나고, 각자 남은 낱말 4개 중 하나를 2라운드의 히든 워드로 정합니다. 2라운드는 모든 승점이 2배입니다. 2라운드가 끝나면 승점 합으로 순위를 정하고, 동점은 같은 순위입니다.",
      "유사도는 이 사이트가 미리 계산해 둔 값입니다. 방송의 유사도와 같은 값이 아닙니다. 뜻이 가깝거나, 함께 떠오르거나, 한 낱말의 다른 뜻에 닿는 낱말일수록 높게 나옵니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-choosing": "지금은 히든 워드를 정하는 때가 아닙니다",
    "already-chosen": "이번 라운드의 히든 워드는 이미 정했습니다",
    "not-in-envelope": "내 봉투에 남은 낱말이 아닙니다",
    "not-clue-time": "지금은 힌트를 내는 때가 아닙니다",
    "not-setter": "힌트는 출제자만 낼 수 있습니다",
    "not-in-list": "낱말 목록에 없는 낱말입니다",
    "same-as-hidden": "히든 워드 자체는 낼 수 없습니다",
    "already-given": "이미 낸 힌트입니다",
    "not-answer-time": "지금은 답을 적는 때가 아닙니다",
    "setter-cannot-answer": "출제자는 답을 적지 않습니다",
    "already-answered": "이번에는 이미 답을 냈습니다",
    "no-pieces": "남은 피스가 없습니다",
    "piece-used": "이 히든 워드에는 이미 피스를 썼습니다",
    "bad-answer": "답은 서로 다른 낱말로 하나나 둘입니다",
    "bad-action": "한글 낱말만 적을 수 있습니다",
    "game-over": "이 판은 끝났습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "too-many": "여섯 명까지 할 수 있습니다",
    "too-few-words": "봉투에 넣을 낱말이 모자랍니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the bar and the log say it. */
  ended: {
    played: "2라운드 끝",
    left: "사람이 모자라 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<HiddenEnd, string>,
  /** The column's heading, with the clock beside it. */
  heading: (round: number, rounds: number, worth: number) => (worth > 1 ? `${round}/${rounds} 라운드 ×${worth}` : `${round}/${rounds} 라운드`),
  /** In the list, beside a player: their points and the Pieces they have left. */
  points: (total: number) => `${total}점`,
  pieces: (left: number) => `피스 ${left}`,
  /** A score, as it is drawn beside a clue. */
  percent: (score: number) => `${score}%`,
  /** Over the scene, right of the page's buttons, 160 pixels. */
  top: {
    choose: "히든 워드를 고르세요",
    chosen: (word: string) => `내 히든 워드: ${word}`,
    watching: "히든 워드를 정하는 중",
    setter: (word: string, stage: number) => `내 히든 워드: ${word} · ${stage}차`,
    guess: (who: string, stage: number) => `출제자 ${who} · ${stage}차`,
    found: (word: string) => `히든 워드: ${word}`,
    notFound: (stage: number) => `${stage}차: 아무도 못 맞힘`,
    results: "지나간 히든 워드",
  },
  /** In the scene. */
  scene: {
    envelope: "내 봉투",
    used: "지난 라운드",
    ready: (done: number, of: number) => `정한 사람 ${done}/${of}`,
    clues: (stage: number, given: number, of: number) => `${stage}차 힌트 ${given}/${of}`,
    earlier: "앞 차의 힌트",
    more: (count: number) => `외 ${count}개`,
    noClue: "아직 힌트가 없습니다",
    room: "자동",
    best: "최고",
    answers: "적은 답",
    noAnswer: "답 없음",
    draft: "내 답",
    draftEmpty: "아래 칸에 적으세요",
    sent: "제출한 답",
    waitingAnswers: (done: number, of: number) => `답을 낸 사람 ${done}/${of}`,
    each: (points: number) => `맞힌 사람 +${points}`,
    setterGot: (who: string, points: number) => `${who} +${points}`,
    turn: (round: number, who: string, word: string) => `${round}R ${who}: ${word}`,
    turnRight: (count: number) => `${count}명 맞힘`,
    turnNone: (points: number) => `출제자 +${points}`,
    turnPassed: "넘어감",
  },
  /** The label over the box a word is typed in, and its button. */
  box: {
    clue: "힌트로 낼 낱말 (한글 명사)",
    answer: "히든 워드라고 생각하는 낱말",
    answerSecond: "피스로 적는 둘째 답",
    doClue: "힌트 내기",
    doAnswer: "적기",
  },
  /** Said in the bar for a moment. */
  say: {
    yourTurn: "내가 출제자입니다 · 힌트를 내세요",
    answerNow: "힌트 제시가 끝났습니다 · 히든 워드를 적으세요",
    answerOpened: "유사도가 가장 높은 낱말이 공개됐습니다 · 히든 워드를 적으세요",
    reached: (percent: number) => `${percent}% 이상인 힌트가 나왔습니다`,
    count: "힌트를 다 냈습니다",
    time: "힌트 시간이 끝났습니다",
    countOpened: "힌트를 다 냈습니다 · 유사도가 가장 높은 낱말이 공개됐습니다",
    timeOpened: "힌트 시간이 끝났습니다 · 유사도가 가장 높은 낱말이 공개됐습니다",
    notHangul: "한글 낱말만 적을 수 있습니다",
    pickFirst: "먼저 봉투의 낱말을 고르세요",
    pieceOn: "피스를 씁니다 · 답을 하나 더 적을 수 있습니다",
    pieceOff: "피스를 쓰지 않습니다",
    writeFirst: "먼저 답을 적으세요",
    autoSent: "시간이 다 되어 적은 대로 제출했습니다",
  },
  /** Over the scene while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    choose: (clock: string) => timed("봉투에서 낱말을 골라 히든 워드로 정하세요", clock),
    chosen: (clock: string) => timed("정했습니다 · 다른 사람을 기다리는 중", clock),
    chooseOther: (clock: string) => timed("각자 히든 워드를 정하는 중", clock),
    clueMine: (left: number, percent: number, clock: string) => timed(`힌트를 내세요 · ${left}개 남음 · ${percent}% 이상이면 끝`, clock),
    clueOther: (who: string, clock: string) => timed(`${who}의 힌트를 기다리는 중`, clock),
    answerMine: (clock: string) => timed("히든 워드를 적고 제출하세요", clock),
    answered: (clock: string) => timed("제출했습니다 · 다른 사람을 기다리는 중", clock),
    answerSetter: (clock: string) => timed("다른 사람들이 답을 적는 중", clock),
    answerOther: (clock: string) => timed("답을 적는 중", clock),
    revealFound: (count: number, clock: string) => timed(`${count}명이 맞혔습니다`, clock),
    revealNone: (who: string, points: number, clock: string) => timed(`아무도 못 맞혔습니다 · ${who} +${points}`, clock),
  },
  /** Under the standing line: what the keys do. */
  keys: {
    idle: "H: 규칙 · M: 음소거 · T: 채팅",
    choose: "↑↓ 낱말 고르기 · Enter 정하기",
    box: "칸에 적고 Enter",
  },
  /** The buttons of the bar. */
  button: {
    choose: keyed("Enter", "이 낱말로"),
    send: keyed("Enter", "제출"),
    piece: (on: boolean, left: number) => (on ? "피스 안 쓰기" : `피스로 하나 더 (${left})`),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The log, a line of the column, 168 pixels; `who` is cut to fit. */
  log: {
    round: (round: number): string => `${round}라운드 · 히든 워드 정하기`,
    turn: (who: string, stage: number) => `${who} ${stage}차 힌트 제시`,
    clue: (word: string, score: number) => `힌트 ${word} ${score}%`,
    opened: (word: string, score: number) => `자동 공개 ${word} ${score}%`,
    cluesOver: { reached: "힌트 제시 끝", count: "힌트 10개 끝", time: "힌트 시간 끝" } as Record<CluesEnd, string>,
    answered: (who: string, piece: boolean) => (piece ? `${who}: 답 둘 (피스)` : `${who}: 답 제출`),
    found: (word: string, count: number) => `정답 ${word} · ${count}명`,
    notFound: (who: string, points: number) => `못 맞힘 · ${who} +${points}`,
    passed: (who: string) => `${who}: 차례 넘어감`,
  },
  /** The results: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "종료" : `${place}위`),
    place: (place: number, who: string, total: number) => `${place}위 ${who} ${total}점`,
    how: (pieces: number) => `승점 합 · 1위 피스 ${pieces}개`,
    hostNext: "같은 사람과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "히든 워드: 규칙", tone: "title" },
    { text: `봉투의 명사 ${n.envelope}개 중 하나를 라운드마다 히든 워드로 정합니다.` },
    { text: `출제자가 힌트를 내면 히든 워드와의 유사도(%)가 모두에게 보입니다.` },
    { text: `힌트는 ${koTime(n.clueSeconds)}에 ${n.clues}개까지. ${n.threshold}% 이상이 나오면 바로 끝.`, tone: "dim" },
    { text: "힌트는 낱말 목록에 있는 한글 명사만 낼 수 있습니다.", tone: "dim" },
    { text: "" },
    { text: `나머지는 ${koTime(n.answerSeconds)} 안에 히든 워드를 적고, 답은 함께 공개됩니다.` },
    { text: "피스 1개로 답 하나 더 (히든 워드 하나에 한 번).", tone: "dim" },
    { text: "" },
    { text: "맞힌 사람 모두 1점, 그 출제자의 차례는 끝." },
    { text: `아무도 못 맞히면 출제자가 1·2·3점을 쌓으며 ${n.stages}차까지 힌트를 냅니다.` },
    { text: `${n.rounds}라운드는 승점이 2배. 승점 합이 가장 높으면 1위.`, tone: "dim" },
    { text: "" },
    { text: "유사도는 미리 계산한 값이고 방송의 값과 다릅니다.", tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Hidden Word: rules",
    brief: {
      goal: "A word game: hide your own hidden word and guess the others'. Every clue comes with its similarity score.",
      play: "The word setter gives clue words, each shown with its score in percent. A clue of at least 95% ends the clues and the others write the hidden word.",
      end: "A correct answer is a point; with none, the setter scores. The highest total after two rounds (the second counts double) wins.",
    },
    parts: [
      "For 2 to 6 players. At the start everyone gets an envelope of five nouns and, each round, chooses one of them as their hidden word. There are two rounds, and in each everyone is the word setter once, in an order drawn anew for the round. The words are Korean, as in the show.",
      [
        "The word setter gives clue words related to their hidden word, one at a time. A clue is a Korean noun, and has to be in the game's list of words.",
        "With each clue, its similarity score with the hidden word is shown to everyone.",
        "The setter has 7 minutes 30 seconds and ten clues at most. A clue with a similarity score of at least 95% ends the clues at once.",
        "If ten clues or the 7 minutes 30 seconds pass without one, the word of the game's list with the highest similarity score to the hidden word is automatically revealed, and the answers follow.",
      ],
      [
        "Everyone but the setter has 2 minutes 30 seconds to write down what they think the hidden word is, and the answers are revealed together.",
        "A Piece buys one additional answer, once for each hidden word.",
        "Everyone with the correct answer scores a point, and that setter's turn is over.",
        "With no correct answers the setter scores and gives clues again: up to three stages, with 1 point after the first, 2 after the second and 3 after the third, each on top of the last.",
      ],
      "When everyone has been the setter, Round 1 is over and each player chooses one of their four remaining words for Round 2, in which every point counts double. After Round 2 the players are ranked by their totals; players level share a place.",
      "The similarity scores are worked out in advance by this site. They are not the show's scores. A word scores higher the closer it is in meaning, the more readily it comes to mind with the other, or when it meets another meaning of the same word.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-choosing": "Hidden words are not being chosen right now",
    "already-chosen": "You have chosen this round's hidden word",
    "not-in-envelope": "That is not a word left in your envelope",
    "not-clue-time": "Clues are not being given right now",
    "not-setter": "Only the word setter gives clues",
    "not-in-list": "That word is not in the list of words",
    "same-as-hidden": "The hidden word itself cannot be a clue",
    "already-given": "That clue has been given",
    "not-answer-time": "Answers are not being written right now",
    "setter-cannot-answer": "The word setter does not answer",
    "already-answered": "You have already answered",
    "no-pieces": "You have no Pieces left",
    "piece-used": "You have used a Piece on this hidden word",
    "bad-answer": "An answer is one word, or two different ones",
    "bad-action": "Only Korean words can be entered",
    "game-over": "This game is over",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "too-many": "Six players at most",
    "too-few-words": "Not enough words to fill the envelopes",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that just now. Try again in a moment",
  } as Record<string, string>,
  refusedOther: "That cannot be done right now",
  ended: {
    played: "Round 2 is over",
    left: "Too few players left",
    abandoned: "Nobody left to go on",
  } as Record<HiddenEnd, string>,
  heading: (round: number, rounds: number, worth: number) => (worth > 1 ? `Round ${round}/${rounds} ×${worth}` : `Round ${round}/${rounds}`),
  points: (total: number) => `${total} pt`,
  pieces: (left: number) => `P ${left}`,
  percent: (score: number) => `${score}%`,
  top: {
    choose: "Pick your hidden word",
    chosen: (word: string) => `My hidden word: ${word}`,
    watching: "Choosing hidden words",
    setter: (word: string, stage: number) => `My word: ${word} · stage ${stage}`,
    guess: (who: string, stage: number) => `Setter ${who} · stage ${stage}`,
    found: (word: string) => `Hidden word: ${word}`,
    notFound: (stage: number) => `Stage ${stage}: nobody got it`,
    results: "The hidden words",
  },
  scene: {
    envelope: "My envelope",
    used: "last round",
    ready: (done: number, of: number) => `Chosen ${done}/${of}`,
    clues: (stage: number, given: number, of: number) => `Stage ${stage} clues ${given}/${of}`,
    earlier: "Earlier stages",
    more: (count: number) => `and ${count} more`,
    noClue: "No clues yet",
    room: "auto",
    best: "top",
    answers: "Answers",
    noAnswer: "no answer",
    draft: "My answer",
    draftEmpty: "Type it in the box",
    sent: "Submitted",
    waitingAnswers: (done: number, of: number) => `Answered ${done}/${of}`,
    each: (points: number) => `Correct: +${points}`,
    setterGot: (who: string, points: number) => `${who} +${points}`,
    turn: (round: number, who: string, word: string) => `R${round} ${who}: ${word}`,
    turnRight: (count: number) => `${count} correct`,
    turnNone: (points: number) => `setter +${points}`,
    turnPassed: "passed",
  },
  box: {
    clue: "Clue word (a Korean noun)",
    answer: "What you think the hidden word is",
    answerSecond: "Second answer, for a Piece",
    doClue: "Give clue",
    doAnswer: "Enter",
  },
  say: {
    yourTurn: "You are the word setter · give a clue",
    answerNow: "The clues are over · write down the hidden word",
    answerOpened: "The highest-scoring word is revealed · write down the hidden word",
    reached: (percent: number) => `A clue with a similarity score of at least ${percent}%`,
    count: "All the clues have been given",
    time: "The time for clues is up",
    countOpened: "All the clues are given · the highest-scoring word is revealed",
    timeOpened: "The time for clues is up · the highest-scoring word is revealed",
    notHangul: "Only Korean words can be entered",
    pickFirst: "Pick a word of your envelope first",
    pieceOn: "Using a Piece · you may write a second answer",
    pieceOff: "Not using a Piece",
    writeFirst: "Write an answer first",
    autoSent: "Time is up: your answer was submitted",
  },
  waitingBack: (seconds: number | null) => (seconds === null ? "Waiting for a player to come back" : `Waiting for a player to come back · ${seconds} s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is standing still",
    sending: "Sending",
    choose: (clock: string) => timed("Pick a word of your envelope as your hidden word", clock),
    chosen: (clock: string) => timed("Chosen · waiting for the others", clock),
    chooseOther: (clock: string) => timed("The players are choosing their hidden words", clock),
    clueMine: (left: number, percent: number, clock: string) => timed(`Give a clue · ${left} left · ${percent}% or more ends them`, clock),
    clueOther: (who: string, clock: string) => timed(`Waiting for ${who}'s clue`, clock),
    answerMine: (clock: string) => timed("Write the hidden word and submit", clock),
    answered: (clock: string) => timed("Submitted · waiting for the others", clock),
    answerSetter: (clock: string) => timed("The others are writing their answers", clock),
    answerOther: (clock: string) => timed("Answers are being written", clock),
    revealFound: (count: number, clock: string) => timed(count === 1 ? "We have a correct answer" : `${count} correct answers`, clock),
    revealNone: (who: string, points: number, clock: string) => timed(`No correct answers · ${who} +${points}`, clock),
  },
  keys: {
    idle: "H: rules · M: mute · T: chat",
    choose: "↑↓ pick a word · Enter sets it",
    box: "Type in the box, then Enter",
  },
  button: {
    choose: keyed("Enter", "Set word"),
    send: keyed("Enter", "Submit"),
    piece: (on: boolean, left: number) => (on ? "No Piece" : `Use a Piece (${left})`),
    again: keyed("Enter", "Again"),
    lobby: keyed("Esc", "to room"),
  },
  log: {
    round: (round: number): string => `Round ${round} · choosing words`,
    turn: (who: string, stage: number) => `${who}: stage ${stage} clues`,
    clue: (word: string, score: number) => `Clue ${word} ${score}%`,
    opened: (word: string, score: number) => `Revealed ${word} ${score}%`,
    cluesOver: { reached: "Clues over", count: "Ten clues given", time: "Clue time up" } as Record<CluesEnd, string>,
    answered: (who: string, piece: boolean) => (piece ? `${who}: two (Piece)` : `${who}: answered`),
    found: (word: string, count: number) => `Answer ${word} · ${count}`,
    notFound: (who: string, points: number) => `None · ${who} +${points}`,
    passed: (who: string) => `${who}: turn passed`,
  },
  result: {
    verdict: (seated: boolean, place: number | null): string => (!seated || place === null ? "Over" : englishOrdinal(place)),
    place: (place: number, who: string, total: number) => `${englishOrdinal(place)} ${who} ${total} pt`,
    how: (pieces: number) => `By total points · ${pieces} Pieces to first`,
    hostNext: "Play again, or go back to the room",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  help: (n) => [
    { text: "Hidden Word: rules", tone: "title" },
    { text: `Each round you hide one of the ${n.envelope} nouns in your envelope.` },
    { text: "The setter gives clues; each is shown with its similarity score." },
    { text: `${n.clues} clues in ${enTime(n.clueSeconds)} at most. One of ${n.threshold}% or more ends them.`, tone: "dim" },
    { text: "Clues and answers are Korean nouns, as in the show.", tone: "dim" },
    { text: "" },
    { text: `The others have ${enTime(n.answerSeconds)} to write the hidden word.` },
    { text: "A Piece buys a second answer, once for each hidden word.", tone: "dim" },
    { text: "" },
    { text: "Every correct answer scores 1, and the setter's turn is over." },
    { text: `With none, the setter scores 1, 2, 3 over up to ${n.stages} stages.` },
    { text: `Round ${n.rounds} counts double. The highest total wins.`, tone: "dim" },
    { text: "" },
    { text: "The scores are worked out in advance; they are not the show's.", tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of the page's language (`lang.ts`). */
export const WORDS = words({ ko, en });

/** The game's rules as the site's pages show them, in each language (`site-sheets.ts`). */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

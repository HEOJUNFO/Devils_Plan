/**
 * The words of 기억 포커 (Memory Poker), in each language (`lang.ts`): its
 * rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import type { HandKind } from "../../../shared/games/memory-poker/cards";
import type { PokerEnd } from "../../../shared/games/memory-poker/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** How many cards the board has, are shared, and are chosen. */
  cards: number;
  shared: number;
  picks: number;
  rounds: number;
  memoriseSeconds: number;
  chooseSeconds: number;
}

const ko = {
  sheet: {
    title: "기억 포커: 규칙",
    parts: [
      "카드 16장이 20초 동안 펼쳐졌다가 뒤집힙니다. 어디에 무엇이 있었는지 기억해, 뒤집힌 카드 가운데 두 장을 고릅니다.",
      [
        "고른 두 장과 모두가 함께 쓰는 공유 카드 3장, 이 다섯 장으로 만든 족보가 높은 쪽이 이깁니다.",
        "공유 카드는 판이 뒤집힌 뒤에 나옵니다. 고르는 시간은 60초이고, 그 안에 고르지 않은 카드는 방이 무작위로 대신 고릅니다.",
        "라운드마다 둘씩 짝지어 겨룹니다 (인원이 홀수면 한 조는 셋). 상대와 같은 카드를 골라도 됩니다.",
        "족보는 높은 것부터 스트레이트 플러시, 포카드, 풀하우스, 플러시, 스트레이트, 트리플, 투페어, 원페어, 하이카드입니다. 같은 족보면 숫자가 높은 쪽이, 그것도 같으면 나머지 카드의 숫자가 높은 쪽이 이깁니다. 무늬는 비교하지 않습니다.",
      ],
      "다섯 라운드를 하고, 이긴 횟수가 많은 순서로 순위를 정합니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-choosing": "지금은 고를 수 없습니다",
    "locked": "이미 확정했습니다",
    "not-chosen": "두 장을 먼저 고르세요",
    "bad-action": "그렇게는 고를 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    rounds: "모든 라운드가 끝남",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<PokerEnd, string>,
  /** The kinds of hand, as the document names them and as poker does. */
  kind: {
    "high": "하이",
    "pair": "원페어",
    "two-pair": "투페어",
    "triple": "트리플",
    "straight": "스트레이트",
    "flush": "플러시",
    "full-house": "풀하우스",
    "four": "포카드",
    "straight-flush": "스트레이트 플러시",
  } as Record<HandKind, string>,
  /** A hand by the rank it is named by and its kind: "Q 트리플". */
  hand: (rank: string, kind: string) => `${rank} ${kind}`,
  /** Over the shared cards, beside the board. */
  shared: "공유 카드",
  /** The column's heading, with the clock beside it. */
  round: (round: number, rounds: number) => `라운드 ${round}/${rounds}`,
  /** Beside the board, 124 pixels: who this player is set against. */
  versus: (names: string) => `상대: ${names}`,
  watching: "관전 중",
  /** While the board lies open: short lines beside it, 124 pixels each. */
  learn: ["카드를 외우세요.", "뒤집힌 뒤에 공유", "카드가 나옵니다."],
  picks: (letters: string) => `내 선택: ${letters}`,
  noPick: "-",
  lockedIn: "확정했습니다",
  chosen: (have: number, of: number) => `고른 사람 ${have}/${of}`,
  /** Under the hands of a round, where the room chose a card for someone. */
  forced: "* 방이 대신 고름",
  /** How a round went for a player, in one letter. */
  mark: { win: "승", tie: "무", loss: "패" },
  /** In the list, beside a name: a final choice made, wins so far, and at the end everything. */
  state: {
    chosen: "고름",
    wins: (wins: number) => `${wins}승`,
    record: (wins: number, ties: number, losses: number) => `${wins}승 ${ties}무 ${losses}패`,
  },
  /** Said in the bar for a moment. */
  say: {
    paused: "판이 멈춰 있습니다",
    notYet: "판이 뒤집힌 뒤에 고릅니다",
  },
  /** Over the board while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels (364 while the button is beside it). */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    learn: (seconds: number) => `카드를 외우세요 · ${seconds}초 뒤에 뒤집힙니다`,
    choose: (picks: number, have: number, seconds: number) => `뒤집힌 카드에서 ${picks}장을 고르세요 (${have}/${picks}) · ${seconds}초`,
    ready: (seconds: number) => byInput(`Enter로 확정하세요 · ${seconds}초`, `확정을 눌러 정하세요 · ${seconds}초`),
    locked: (have: number, of: number, seconds: number) => `확정했습니다 · 기다리는 중 (${have}/${of}) · ${seconds}초`,
    watchLearn: (seconds: number) => `관전 중 · 카드를 외우는 시간 ${seconds}초`,
    watchChoose: (have: number, of: number, seconds: number) => `관전 중 · 고르는 중 (${have}/${of}) · ${seconds}초`,
    win: (hand: string) => `승리! ${hand}`,
    tie: (hand: string) => `무승부 · ${hand}`,
    loss: (hand: string) => `패배 · ${hand}`,
    shown: "이번 라운드 결과",
    next: (words: string, seconds: number) => `${words} · 다음 라운드까지 ${seconds}초`,
    last: (words: string, seconds: number) => `${words} · 최종 결과까지 ${seconds}초`,
  },
  /** Under the standing line while choosing, 364 pixels. */
  keys: byInput("클릭 또는 방향키+Space: 고르기/빼기 · Enter: 확정", "카드를 눌러 고르고, 다시 눌러 뺍니다"),
  hint: "H: 규칙 · M: 음소거 · T: 채팅",
  log: {
    dealt: (round: number) => `라운드 ${round}`,
    turned: "판을 뒤집었습니다",
    won: (winner: string, others: string) => `${winner} > ${others}`,
    tied: (names: string) => `무승부: ${names}`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string, wins: number) => `${place}위 ${who} ${wins}승`,
    mine: (wins: number, ties: number, losses: number) => `내 기록: ${wins}승 ${ties}무 ${losses}패`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons of the bar, 88 pixels wide inside. */
  button: { lock: keyed("Enter", "확정"), again: keyed("Enter", "새 판"), lobby: keyed("Esc", "대기실로") },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "기억 포커: 규칙", tone: "title" },
    { text: `카드 ${n.cards}장이 ${n.memoriseSeconds}초 동안 펼쳐졌다가 뒤집힙니다. 어디에 무엇이 있었는지` },
    { text: `기억해, 뒤집힌 카드 가운데 ${n.picks}장을 고릅니다.` },
    { text: "" },
    { text: `고른 ${n.picks}장과 공유 카드 ${n.shared}장으로 만든 족보가 높은 쪽이 이깁니다.` },
    { text: "공유 카드는 판이 뒤집힌 뒤에 나옵니다. 상대와 같은 카드를 골라도 됩니다.", tone: "dim" },
    { text: `고르는 시간은 ${n.chooseSeconds}초입니다. 고르지 않은 카드는 방이 무작위로 대신 고릅니다.`, tone: "dim" },
    { text: "" },
    { text: "족보 (높은 순): 스트레이트 플러시 · 포카드 · 풀하우스 · 플러시 ·" },
    { text: "스트레이트 · 트리플 · 투페어 · 원페어 · 하이카드. 무늬는 비교하지 않습니다." },
    { text: "" },
    { text: "라운드마다 둘씩 짝지어 겨룹니다 (인원이 홀수면 한 조는 셋)." },
    { text: `${n.rounds}라운드를 하고, 이긴 횟수가 많은 순서로 순위를 정합니다.` },
    { text: "두 사람의 족보가 완전히 같으면 무승부입니다.", tone: "dim" },
    { text: byInput("클릭 또는 방향키+Space: 고르기/빼기 · Enter: 확정 (확정하면 못 바꿈)", "카드를 눌러 고르고, 다시 눌러 뺍니다 · 확정하면 못 바꿉니다"), tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Memory Poker: rules",
    parts: [
      "Sixteen cards lie face up for 20 seconds, then are turned over. Remember what was where, and pick two of the face-down cards.",
      [
        "Your two cards and the three shared cards everyone uses make a hand of five. The higher hand wins.",
        "The shared cards come out after the board is turned over. You have 60 seconds to pick; a card you did not pick in time is picked for you at random.",
        "Each round players are paired off (with an odd number, one group is three). You may pick the same card as your opponent.",
        "Hands, highest first: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. Between two of a kind the higher rank wins, then the higher remaining cards. Suits are not compared.",
      ],
      "Five rounds are played, and players are ranked by how many they won.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-choosing": "You cannot pick now",
    "locked": "Your choice is already final",
    "not-chosen": "Pick two cards first",
    "bad-action": "That cannot be picked",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    rounds: "Over: all rounds played",
    left: "Over: nobody left to play",
    abandoned: "Over: everyone has gone",
  },
  kind: {
    "high": "High card",
    "pair": "One pair",
    "two-pair": "Two pair",
    "triple": "Three of a kind",
    "straight": "Straight",
    "flush": "Flush",
    "full-house": "Full house",
    "four": "Four of a kind",
    "straight-flush": "Straight flush",
  },
  hand: (rank, kind) => `${kind}, ${rank}`,
  shared: "Shared cards",
  round: (round, rounds) => `Round ${round}/${rounds}`,
  versus: (names) => `vs ${names}`,
  watching: "Watching",
  learn: ["Learn the cards.", "The shared cards", "come out once the", "board is turned."],
  picks: (letters) => `Picked: ${letters}`,
  noPick: "-",
  lockedIn: "Choice is final",
  chosen: (have, of) => `Chosen ${have}/${of}`,
  forced: "* picked for them",
  mark: { win: "W", tie: "T", loss: "L" },
  state: {
    chosen: "in",
    wins: (wins) => `${wins}W`,
    record: (wins, ties, losses) => `${wins}W ${ties}T ${losses}L`,
  },
  say: {
    paused: "The game is paused",
    notYet: "Pick once the board is turned over",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    learn: (seconds) => `Learn the cards · turned over in ${seconds}s`,
    choose: (picks, have, seconds) => `Pick ${picks} face-down cards (${have}/${picks}) · ${seconds}s`,
    ready: (seconds) => byInput(`Press Enter to make it final · ${seconds}s`, `Tap Final to settle it · ${seconds}s`),
    locked: (have, of, seconds) => `Final · waiting (${have}/${of}) · ${seconds}s`,
    watchLearn: (seconds) => `Watching · ${seconds}s to learn the cards`,
    watchChoose: (have, of, seconds) => `Watching · choosing (${have}/${of}) · ${seconds}s`,
    win: (hand) => `You win! ${hand}`,
    tie: (hand) => `A tie · ${hand}`,
    loss: (hand) => `You lose · ${hand}`,
    shown: "This round's result",
    next: (words, seconds) => `${words} · next round in ${seconds}s`,
    last: (words, seconds) => `${words} · final result in ${seconds}s`,
  },
  keys: byInput("Click, or arrows + Space: pick/unpick · Enter: final", "Tap a card to pick it, again to put it back"),
  hint: "H: rules · M: mute · T: chat",
  log: {
    dealt: (round) => `Round ${round}`,
    turned: "The board is turned over",
    won: (winner, others) => `${winner} > ${others}`,
    tied: (names) => `Tie: ${names}`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who, wins) => `${englishOrdinal(place)} ${who} ${wins}W`,
    mine: (wins, ties, losses) => `Your record: ${wins}W ${ties}T ${losses}L`,
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  button: { lock: keyed("Enter", "final"), again: keyed("Enter", "again"), lobby: keyed("Esc", "to room") },
  help: (n) => [
    { text: "Memory Poker: rules", tone: "title" },
    { text: `${n.cards} cards lie face up for ${n.memoriseSeconds} seconds, then are turned over.` },
    { text: `Remember what was where, and pick ${n.picks} of the face-down cards.` },
    { text: "" },
    { text: `Your ${n.picks} cards + the ${n.shared} shared cards make a hand. Higher hand wins.` },
    { text: "The shared cards come after the board is turned over.", tone: "dim" },
    { text: `${n.chooseSeconds}s to pick. A card not picked in time is picked at random.`, tone: "dim" },
    { text: "You may pick the same card as your opponent.", tone: "dim" },
    { text: "" },
    { text: "Hands, highest first: straight flush · four of a kind · full house ·" },
    { text: "flush · straight · three of a kind · two pair · one pair · high card." },
    { text: "Suits are not compared. Two equal hands are a tie.", tone: "dim" },
    { text: "Each round players are paired off (odd number: one group of 3)." },
    { text: `${n.rounds} rounds; players are ranked by rounds won.` },
    { text: byInput("Click, or arrows + Space: pick · Enter: final (it cannot be changed)", "Tap a card to pick it, again to put it back · Final cannot be undone"), tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 기억 포커 (Memory Poker), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

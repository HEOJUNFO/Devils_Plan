/**
 * The words of 잔디 깔기 (Lay the Grass), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import type { Deck, Effect, EffectKind } from "../../../shared/games/lay-the-grass/cards";
import type { MarkKind } from "../../../shared/games/lay-the-grass/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** `value` with its sign, as points are written. */
const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

const ko = {
  sheet: {
    title: "잔디 깔기: 규칙",
    parts: [
      "공원 위에 내 잔디 타일을 놓아 승점을 얻습니다. 타일은 일곱 종류이고, 타일에 적힌 번호가 곧 승점입니다.",
      [
        "먼저 승점이 낮은 사람부터 타일 하나를 모두가 보는 앞에서 고릅니다. 같은 타일을 골라도 되고, 한 번 고르면 바꿀 수 없습니다.",
        "그다음 번호가 작은 타일부터 공원에 놓습니다. 돌릴 수 있지만 뒤집을 수 없고, 공원 밖으로 나가거나 다른 타일과 겹칠 수 없습니다.",
        "놓으면 번호만큼 승점을 얻습니다. 놓을 자리가 없으면 0점입니다.",
      ],
      "번호가 클수록 점수는 크지만 늦게 놓습니다.",
      "사이사이에 둘 중 하나를 고르는 선택이 네 번 나옵니다 (선택 5~8). 모두 동시에 고르고, 다 고르면 누가 무엇을 골랐는지 공개됩니다. 한 번 고르면 바꿀 수 없습니다.",
      "선택 6~8의 카드는 판마다 새로 뽑고, 나올 때 공개됩니다. 선택 5에서 \"정보\"를 고르면 미리 봅니다. 방장은 대기실에서 방송의 카드로 바꿀 수 있습니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-your-turn": "지금은 내 차례가 아닙니다",
    "not-choosing": "지금은 선택하는 때가 아닙니다",
    "already-chosen": "이미 골랐습니다. 선택은 바꿀 수 없습니다",
    "not-picking": "지금은 타일을 고르는 때가 아닙니다",
    "not-laying": "지금은 타일을 놓는 때가 아닙니다",
    "not-marking": "지금은 공원에 그것을 놓는 때가 아닙니다",
    "bad-cell": "그 칸에는 놓을 수 없습니다",
    "bad-cut": "그렇게는 자를 수 없습니다",
    "no-such-tile": "그런 타일은 없습니다",
    "does-not-fit": "거기에는 놓을 수 없습니다",
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
    rounds: "마지막 공원까지 끝",
    abandoned: "이어갈 사람이 없어 끝",
  },
  /** The choices that come with the game, "선택 5" to "선택 8": their cards over the park, and the sheet of them (I). */
  choice: {
    name: (which: number) => `선택 ${which}`,
    /**
     * An option's name, by its kind: the document's for the kinds it has
     * (점수, 정보, 공격, 방어, 상생, 견제, 가로수, 맨홀), this project's for
     * the rest.
     */
    kinds: {
      score: "점수",
      info: "정보",
      attack: "공격",
      defend: "방어",
      insure: "보험",
      first: "선점",
      pair: "상생",
      check: "견제",
      harmony: "화합",
      neighbour: "이웃",
      tree: "가로수",
      manhole: "맨홀",
      rock: "바위",
      flower: "꽃밭",
    } as Record<EffectKind, string>,
    /** How large an option's name is written on its card, in pixels: 82 are free for it before what the option does. */
    optionSize: 24 as number,
    /** After the choice's name, on its line: 203 pixels. */
    once: "하나를 고릅니다. 바꿀 수 없습니다.",
    /** What an option does, with its card's own numbers: lines of 180 pixels, three at most. */
    says: (effect: Effect): string[] => {
      switch (effect.kind) {
        case "score":
          return [`승점 ${effect.points}점을 바로 얻습니다.`];
        case "info":
          return ["다음 선택 6, 7, 8의 내용을", "미리 봅니다."];
        case "attack":
          return [`타일을 놓으면 번호의 ${effect.times}배.`, `못 놓으면 ${effect.loss}점을 잃습니다.`];
        case "defend":
          return [`놓을 때 타일에서 ${effect.cells}칸까지`, "잘라 낼 수 있습니다.", "(번호 칸, 두 동강은 불가)"];
        case "insure":
          return ["타일을 못 놓아도", `승점 ${effect.points}점을 얻습니다.`];
        case "first":
          return ["번호와 상관없이 남보다 먼저", "놓습니다. 선점끼리는 번호가", "작은 순서입니다."];
        case "pair":
          return ["둘이 한 팀. 두 타일이 맞닿은", effect.perSide === 1 ? "변의 수만큼 추가 승점을" : `변 하나에 ${effect.perSide}점씩 추가 승점을`, "나눠 갖습니다."];
        case "check":
          return [`놓은 사람이 ${effect.atMost}명 이하이면`, `승점 ${effect.bonus}점을 더 얻습니다.`];
        case "harmony":
          return [`놓은 사람이 ${effect.atLeast}명 이상이면`, `승점 ${effect.bonus}점을 더 얻습니다.`];
        case "neighbour":
          return ["내 타일과 맞닿은 다른 타일", `하나마다 승점 ${effect.points}점을`, "더 얻습니다."];
        case "tree":
          return [`공원에 가로수 ${effect.count === 1 ? "하나" : `${effect.count}개`}를 놓습니다.`, "그 위에는 구멍 뚫린 칸만", "놓을 수 있습니다."];
        case "rock":
          return [`공원에 바위 ${effect.count === 1 ? "하나" : `${effect.count}개`}를 놓습니다.`, "그 위에는 어떤 칸도", "놓을 수 없습니다."];
        case "manhole":
          return [`${effect.values.map(signed).join(", ")} 맨홀을 놓습니다.`, "덮은 타일은 맨홀에 적힌", "만큼 승점을 얻거나 잃습니다."];
        case "flower":
          return [`${effect.values.map(signed).join(", ")} 꽃밭을 놓습니다.`, "덮은 타일은 꽃밭에 적힌", "만큼 승점을 더 얻습니다."];
      }
    },
    picked: (have: number, of: number) => `${have}/${of}명이 골랐습니다`,
    /** Under the cards, beside the button that shows the park: 190 pixels. */
    watching: "관전 중입니다",
    done: "골랐습니다. 모두 고르면 공개됩니다.",
    confirm: byInput("한 번 더 누르거나 Enter로 확정", "한 번 더 누르면 확정"),
    how: byInput("1 또는 2, 또는 카드를 누르세요", "카드를 누르세요"),
    /** The button that puts the cards aside to show the park, and the one that brings them back: 88 pixels inside. */
    seePark: keyed("V", "공원 보기"),
    seeCards: keyed("V", "선택 카드"),
    /** The sheet of the cards so far (I), and after its name which cards this game is played with. */
    sheet: "선택 카드",
    deck: { fresh: "이 판에 새로 뽑은 카드", show: "방송의 카드" } as Record<Deck, string>,
    sheetClose: byInput("I 또는 Esc: 닫기", "아무 곳이나 누르면 닫힙니다"),
    notYet: "아직 공개되지 않았습니다",
    ahead: "(미리보기)",
  },
  /** Over the park while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line over the tiles, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    nextPark: (round: number, seconds: number) => `공원 ${round} 끝 · 다음 공원까지 ${seconds}초`,
    sending: "보내는 중",
    choose: (which: number, seconds: number) => `선택 ${which}: 하나를 고르세요 · ${seconds}초`,
    chooseWait: (which: number, seconds: number) => `선택 ${which}: 모두 고르기를 기다리는 중 · ${seconds}초`,
    /** Picking a tile: before one is pointed at, and with `chosen` waiting to be confirmed. */
    pick: (chosen: number | null, seconds: number) =>
      `${chosen === null ? "타일을 고르세요 (한 번 고르면 못 바꿉니다)" : byInput(`${chosen}번으로 정하려면 Enter, 또는 한 번 더 누르기`, `${chosen}번으로 정하려면 한 번 더 누르세요`)} · ${seconds}초`,
    /** Putting something on the park: `value` is what a manhole or a flower bed is worth. */
    mark: (what: MarkKind, value: number, seconds: number) =>
      `${what === "tree" ? "가로수를" : what === "rock" ? "바위를" : what === "flower" ? `${signed(value)} 꽃밭을` : `${signed(value)} 맨홀을`} 놓을 칸을 누르세요 · ${seconds}초`,
    cut: (cells: number, most: number, seconds: number) =>
      byInput(`자를 칸을 누르세요 (${cells}/${most}칸) · X로 끝 · ${seconds}초`, `자를 칸을 누르세요 (${cells}/${most}칸) · 다 잘랐으면 자르기 끝 · ${seconds}초`),
    lay: (seconds: number) => `타일을 놓으세요 · ${seconds}초`,
    /** What someone else is doing; `watching` for a player who is not in the game. */
    other: (watching: boolean, who: string, doing: "pick" | "lay" | MarkKind, seconds: number) =>
      `${watching ? "관전 중 · " : ""}${who} ${doing === "pick" ? "고르는 중" : doing === "lay" ? "놓는 중" : `${doing === "manhole" ? "맨홀" : doing === "flower" ? "꽃밭" : doing === "tree" ? "가로수" : "바위"} 놓는 중`} · ${seconds}초`,
  },
  /** The moves, a line each in a column 168 pixels wide. */
  log: {
    park: (round: number) => `공원 ${round}`,
    /** Who took an option: by name, or with how many they are first where the names run past the line. */
    took: (option: string, names: string) => `${option}: ${names}`,
    tookMany: (option: string, players: number, names: string) => `${option} ${players}명: ${names}`,
    pick: (who: string, tile: number, forced: boolean) => `${who}: ${tile}번 선택${forced ? " (자동)" : ""}`,
    pair: (names: string) => `상생 팀: ${names}`,
    alone: (who: string) => `${who}: 상생 짝 없음`,
    manhole: (who: string, value: number, flower: boolean) => `${who}: ${signed(value)} ${flower ? "꽃밭" : "맨홀"} 놓음`,
    tree: (who: string, rock: boolean) => `${who}: ${rock ? "바위" : "가로수"} 놓음`,
    skip: (who: string, what: MarkKind) => `${who}: ${what === "manhole" ? "맨홀" : what === "flower" ? "꽃밭" : what === "tree" ? "가로수" : "바위"} 안 놓음`,
    lay: (who: string, tile: number, cut: number, forced: boolean) => `${who}: ${tile}번 놓음${cut > 0 ? ` (${cut}칸 자름)` : ""}${forced ? " (자동)" : ""}`,
    fail: (who: string, tile: number) => `${who}: ${tile}번 자리 없음`,
    score: (who: string, total: number) => `${who}: ${total > 0 ? `+${total}` : total}점`,
  },
  /** The column on the right. */
  panel: {
    park: (round: number, rounds: number) => `공원 ${round}/${rounds}`,
    game: "잔디 깔기",
    seconds: (seconds: number) => `${seconds}초`,
    tile: (tile: number) => `${tile}번`,
    /** After a player's tile, before their score: 34 pixels. */
    laid: "놓음",
    failed: "실패",
    chose: "고름",
  },
  /** On a tile's button, left of the marks of who picked it: 24 pixels a line. */
  tile: {
    points: (points: number) => `${points}점`,
    cells: (cells: number) => `${cells}칸`,
    noRoom: "불가",
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, won: boolean): string => (!seated ? "종료" : won ? "승리!" : "패배"),
    place: (place: number, who: string, score: number) => `${place}위 ${who} ${score}`,
    over: "판이 끝났습니다",
    /** How a player's points came about, part by part. */
    tile: (points: string) => `타일 ${points}`,
    attackFailed: (points: string) => `공격 실패 ${points}`,
    insured: (points: string) => `보험 ${points}`,
    notLaid: "타일 못 놓음",
    manholes: (points: string) => `맨홀 ${points}`,
    flowers: (points: string) => `꽃밭 ${points}`,
    pair: (points: string) => `상생 ${points}`,
    check: (points: string) => `견제 ${points}`,
    harmony: (points: string) => `화합 ${points}`,
    neighbours: (points: string) => `이웃 ${points}`,
    bonus: (points: string) => `점수 ${points}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons along the bar: the two under the results 88 pixels wide inside, the three for laying 84. */
  button: {
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
    cut: keyed("X", "자르기"),
    cutDone: keyed("X", "자르기 끝"),
    turn: keyed("R", "돌리기"),
    lay: keyed("Enter", "놓기"),
    /** Under a finger, over the park: opens the sheet of the cards, as the I key does. */
    cards: "선택 카드",
  },
  /** Beside the player's own tile, in the bar. */
  hand: {
    /** The tile and what it is worth, with the option of choice 6 where one was taken: 160 pixels. */
    mine: (tile: number, option: string | null) => `내 타일 ${tile}번 · ${tile}점${option === null ? "" : ` · ${option}`}`,
    cards: byInput("I: 지금까지 나온 선택 카드 보기", "나온 카드는 위의 선택 카드 버튼으로 봅니다"),
    mark: byInput("마우스·화살표로 칸을 고르고 눌러서 놓기", "칸을 누르고, 한 번 더 눌러서 놓기"),
    /** While others put things on the park: what those things do. */
    marks: (stands: boolean): string => (stands ? "가로수 위에는 구멍 뚫린 칸만, 바위 위에는 아무 칸도 못 놓습니다." : "맨홀이나 꽃밭을 덮은 타일은 거기 적힌 만큼 승점이 달라집니다."),
    /** While laying: 256 pixels, or 164 with the button for cutting beside it. */
    lay: byInput("마우스·화살표로 옮기고 눌러서 놓기", "공원을 눌러 옮기고, 놓기를 누르세요"),
    layCut: byInput("옮겨서 놓기 · X 자르기", "눌러 옮기고 놓기"),
    /**
     * While others lay, and once the viewer's own tile had nowhere to go:
     * `points` is what such a tile brings the viewer, signed. Nothing for
     * most; what 보험 gives, or what a 공격 that fails takes, for who holds one.
     */
    order: (points: string) => `번호가 작은 타일부터 놓습니다. 자리가 없으면 ${points}점.`,
    failed: (points: string) => `놓을 자리가 없어 이번 공원은 ${points}점입니다.`,
    scored: (points: number) => `타일을 놓아 ${points}점을 얻었습니다.`,
    worth: "놓은 타일의 번호만큼 승점을 얻습니다.",
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (pickSeconds: number, placeSeconds: number, deck: Deck): HelpLine[] => [
    { text: "잔디 깔기: 규칙", tone: "title" },
    { text: "공원 위에 내 잔디 타일을 놓아 승점을 얻습니다." },
    { text: "먼저 타일 일곱 종류 중 하나를 모두가 보는 앞에서 고릅니다. 승점이 낮은" },
    { text: "사람부터 고르고, 한 번 고르면 바꿀 수 없습니다. 같은 타일을 골라도 됩니다." },
    { text: "그다음 타일에 적힌 번호가 작은 사람부터 공원에 놓습니다. 타일은 돌릴 수" },
    { text: "있지만 뒤집을 수 없고, 공원 밖으로 나가거나 다른 타일과 겹칠 수 없습니다." },
    { text: "놓으면 타일의 번호만큼 승점을 얻고, 놓을 자리가 없으면 0점입니다." },
    { text: "" },
    { text: "사이사이에 둘 중 하나를 고르는 선택이 네 번 나옵니다 (선택 5~8).", tone: "mark" },
    { text: "모두 동시에 고르고, 다 고른 뒤에 누가 무엇을 골랐는지 공개됩니다.", tone: "dim" },
    { text: deck === "show" ? "이 판은 방송의 카드로 합니다. 카드는 선택이 나올 때 공개됩니다." : "선택 6~8의 카드는 이 판에 새로 뽑은 것이고, 나올 때 공개됩니다.", tone: "dim" },
    { text: byInput("선택 5에서 \"정보\"를 고르면 미리 봅니다. I 키로 나온 카드를 다시 봅니다.", "선택 5에서 \"정보\"를 고르면 미리 봅니다. 나온 카드는 선택 카드 버튼으로."), tone: "dim" },
    { text: "" },
    { text: `고르기 ${pickSeconds}초, 놓기 ${placeSeconds}초. 시간이 지나면 자동으로 넘어갑니다.`, tone: "dim" },
    { text: byInput("숫자: 고르기 · R: 돌리기 · X: 자르기(방어) · 화살표: 옮기기 · Enter: 정하기", "타일은 공원을 눌러 옮기고, 놓기 버튼으로 놓습니다. 한 번 놓으면 못 바꿉니다."), tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · I: 선택 카드 · V: 공원 보기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Lay the Grass: rules",
    parts: [
      "Lay your grass tile on the park to score points. There are seven kinds of tile, and the number on a tile is the points it scores.",
      [
        "First everyone picks one tile in front of all, the player with the fewest points first. Two players may pick the same tile, and a pick cannot be changed.",
        "Then the tiles are laid on the park, the smallest number first. A tile can be turned but not flipped, and cannot go off the park or over another tile.",
        "A tile laid scores its number. A tile with nowhere to go scores 0.",
      ],
      "The bigger the number, the more it scores and the later it is laid.",
      "Along the way a selection between two options comes up four times (Selections 5 to 8). Everyone picks at once, and when all have picked, who picked what is shown. A pick cannot be changed.",
      "The cards of Selections 6 to 8 are drawn afresh for each game and shown as each comes up; pick \"Info\" at Selection 5 to see them ahead. In the waiting room the host can switch to the show's cards.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-your-turn": "It is not your turn",
    "not-choosing": "This is not the time to pick",
    "already-chosen": "You have picked. A pick cannot be changed",
    "not-picking": "This is not the time to pick a tile",
    "not-laying": "This is not the time to lay a tile",
    "not-marking": "This is not the time to place that on the park",
    "bad-cell": "Nothing can be placed on that cell",
    "bad-cut": "The tile cannot be cut like that",
    "no-such-tile": "There is no such tile",
    "does-not-fit": "The tile cannot be laid there",
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
    rounds: "Over: last park done",
    abandoned: "Over: nobody left to play",
  },
  choice: {
    name: (which) => `Selection ${which}`,
    // no English source gives these: plain translations, and of this project's own six their names here
    kinds: {
      score: "Points",
      info: "Info",
      attack: "Attack",
      defend: "Defense",
      insure: "Insurance",
      first: "Head start",
      pair: "Win-win",
      check: "Check",
      harmony: "Harmony",
      neighbour: "Neighbors",
      tree: "Tree",
      manhole: "Manhole",
      rock: "Rock",
      flower: "Flower bed",
    },
    // "Defense" and "Manhole" in large letters would run over what the option does
    optionSize: 12,
    once: "Pick one. No changing it.",
    says: (effect) => {
      switch (effect.kind) {
        case "score":
          return [`Get ${effect.points} points at once.`];
        case "info":
          return ["See what Selections", "6, 7 and 8 will be."];
        case "attack":
          return [`A tile laid scores ${effect.times === 2 ? "double" : effect.times === 3 ? "triple" : `${effect.times} times`}.`, `Not laid, it costs you ${effect.loss}.`];
        case "defend":
          return [`Cut up to ${effect.cells} ${effect.cells === 1 ? "cell" : "cells"} off the`, "tile as you lay it (not its", "number, nor in two)."];
        case "insure":
          return ["Even if your tile is not", `laid, you get ${effect.points} ${effect.points === 1 ? "point" : "points"}.`];
        case "first":
          return ["Lay before the others,", "whatever your number", "(among these: by number)."];
        case "pair":
          return effect.perSide === 1 ? ["Two pair up and split a", "point for each side their", "tiles share."] : ["Two pair up and split", `${effect.perSide} points for each side`, "their tiles share."];
        case "check":
          return [`If ${effect.atMost} or fewer lay a tile,`, `you get ${effect.bonus} more points.`];
        case "harmony":
          return [`If ${effect.atLeast} or more lay a tile,`, `you get ${effect.bonus} more points.`];
        case "neighbour":
          return [`Get ${effect.points} ${effect.points === 1 ? "point" : "points"} for each`, "other tile that touches", "your own."];
        case "tree":
          return effect.count === 1 ? ["Put a tree on the park.", "Only a cell with a hole", "can lie over it."] : [`Put ${effect.count} trees on the park.`, "Only a cell with a hole", "can lie over one."];
        case "rock":
          return effect.count === 1 ? ["Put a rock on the park.", "No cell of a tile can", "lie over it."] : [`Put ${effect.count} rocks on the park.`, "No cell of a tile can", "lie over one."];
        case "manhole":
          return [`Put manholes: ${effect.values.map(signed).join(", ")}.`, "A tile over one gains or", "loses what it says."];
        case "flower":
          return [`Put a flower bed: ${effect.values.map(signed).join(", ")}.`, "A tile laid over it gains", "what it says."];
      }
    },
    picked: (have, of) => `${have}/${of} have picked`,
    watching: "You are watching",
    done: "Picked. Shown when all have.",
    confirm: byInput("Again, or Enter, to confirm", "Tap it again to confirm"),
    how: byInput("Press 1 or 2, or a card", "Tap a card"),
    seePark: keyed("V", "see park"),
    seeCards: keyed("V", "cards"),
    sheet: "Selection cards",
    deck: { fresh: "drawn for this game", show: "the show's cards" },
    sheetClose: byInput("I or Esc: close", "Tap anywhere to close"),
    notYet: "Not shown yet",
    ahead: "(preview)",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    nextPark: (round, seconds) => `Park ${round} is done · next park in ${seconds}s`,
    sending: "Sending",
    choose: (which, seconds) => `Selection ${which}: pick one · ${seconds}s`,
    chooseWait: (which, seconds) => `Selection ${which}: waiting for everyone to pick · ${seconds}s`,
    pick: (chosen, seconds) =>
      `${chosen === null ? "Pick a tile (a pick cannot be changed)" : byInput(`Enter, or press it again, to settle on tile ${chosen}`, `Tap it again to settle on tile ${chosen}`)} · ${seconds}s`,
    mark: (what, value, seconds) =>
      `Press the cell for the ${what === "tree" ? "tree" : what === "rock" ? "rock" : what === "flower" ? `${signed(value)} flower bed` : `${signed(value)} manhole`} · ${seconds}s`,
    cut: (cells, most, seconds) => byInput(`Press the cells to cut (${cells}/${most}) · X when done · ${seconds}s`, `Tap the cells to cut (${cells}/${most}) · then Done · ${seconds}s`),
    lay: (seconds) => `Lay your tile · ${seconds}s`,
    other: (watching, who, doing, seconds) =>
      `${watching ? "Watching · " : ""}${who} is ${doing === "pick" ? "picking" : doing === "lay" ? "laying" : `placing a ${doing === "manhole" ? "manhole" : doing === "flower" ? "flower bed" : doing === "tree" ? "tree" : "rock"}`} · ${seconds}s`,
  },
  log: {
    park: (round) => `Park ${round}`,
    took: (option, names) => `${option}: ${names}`,
    tookMany: (option, players, names) => `${option} (${players}): ${names}`,
    pick: (who, tile, forced) => `${who}: picks ${tile}${forced ? " (auto)" : ""}`,
    pair: (names) => `Win-win pair: ${names}`,
    alone: (who) => `${who}: no pair`,
    manhole: (who, value, flower) => `${who}: ${signed(value)} ${flower ? "flower bed" : "manhole"}`,
    tree: (who, rock) => `${who}: ${rock ? "rock" : "tree"} placed`,
    skip: (who, what) => `${who}: no ${what === "manhole" ? "manhole" : what === "flower" ? "flower bed" : what}`,
    lay: (who, tile, cut, forced) => `${who}: lays ${tile}${cut > 0 ? ` (cut ${cut})` : ""}${forced ? " (auto)" : ""}`,
    fail: (who, tile) => `${who}: no room for ${tile}`,
    score: (who, total) => `${who}: ${total > 0 ? `+${total}` : total} ${Math.abs(total) === 1 ? "point" : "points"}`,
  },
  panel: {
    park: (round, rounds) => `Park ${round}/${rounds}`,
    game: "Lay the Grass",
    seconds: (seconds) => `${seconds}s`,
    tile: (tile) => `#${tile}`,
    laid: "laid",
    failed: "fail",
    chose: "done",
  },
  tile: {
    points: (points) => `${points}pt`,
    cells: (cells) => `${cells}sq`,
    noRoom: "full",
  },
  result: {
    verdict: (seated, won) => (!seated ? "Over" : won ? "Won!" : "Lost"),
    place: (place, who, score) => `${englishOrdinal(place)} ${who} ${score}`,
    over: "The game is over",
    tile: (points) => `Tile ${points}`,
    attackFailed: (points) => `Attack failed ${points}`,
    insured: (points) => `Insurance ${points}`,
    notLaid: "Tile not laid",
    manholes: (points) => `Manholes ${points}`,
    flowers: (points) => `Flower beds ${points}`,
    pair: (points) => `Win-win ${points}`,
    check: (points) => `Check ${points}`,
    harmony: (points) => `Harmony ${points}`,
    neighbours: (points) => `Neighbors ${points}`,
    bonus: (points) => `Points ${points}`,
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  button: {
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
    cut: keyed("X", "cut"),
    cutDone: keyed("X", "done"),
    turn: keyed("R", "turn"),
    lay: keyed("Enter", "lay"),
    cards: "Cards",
  },
  hand: {
    mine: (tile, option) => `Tile ${tile} · ${tile} pts${option === null ? "" : ` · ${option}`}`,
    cards: byInput("I: see the selection cards so far", "The cards so far: the Cards button above"),
    mark: byInput("Pick a cell with the mouse or the arrows, and press to place", "Tap a cell, then tap it again to place"),
    marks: (stands) => (stands ? "Over a tree only a holed cell can lie; over a rock, none." : "A tile over a manhole or a flower bed gains or loses what it says."),
    lay: byInput("Move by mouse or arrows, then press", "Tap the park to move it, then Lay"),
    layCut: byInput("Move, lay · X cuts", "Tap to move, then Lay"),
    order: (points) => `The smallest number lays first. No room scores ${points}.`,
    failed: (points) => `No room for your tile: ${points} points this park.`,
    scored: (points) => `Your tile is laid: ${points} points.`,
    worth: "A tile laid scores its number.",
  },
  help: (pickSeconds, placeSeconds, deck) => [
    { text: "Lay the Grass: rules", tone: "title" },
    { text: "Lay your grass tile on the park to score points." },
    { text: "First everyone picks one of seven kinds of tile, in front of all:" },
    { text: "fewest points first. A pick cannot be changed; two may pick alike." },
    { text: "Then the tiles are laid, the smallest number first. A tile can be" },
    { text: "turned, not flipped, and cannot go off the park or over another." },
    { text: "A tile laid scores its number; one with nowhere to go scores 0." },
    { text: "" },
    { text: "Along the way, a selection between two options comes up 4 times.", tone: "mark" },
    { text: "Everyone picks at once; then who picked what is shown.", tone: "dim" },
    { text: deck === "show" ? "This game is played with the show's cards." : "The cards of Selections 6 to 8 were drawn for this game.", tone: "dim" },
    { text: byInput("Each shows as it comes up; \"Info\" at 5 shows them ahead. I: cards.", "Each shows as it comes up; \"Info\" at 5 shows them ahead."), tone: "dim" },
    { text: "" },
    { text: `${pickSeconds}s to pick, ${placeSeconds}s to lay. After that the game moves on by itself.`, tone: "dim" },
    { text: byInput("Digits: pick · R: turn · X: cut (Defense) · Arrows: move · Enter: set", "Tap the park to move your tile, then Lay. A tile laid stays."), tone: "dim" },
    { text: byInput("H or Esc: close · I: cards · V: see park · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 잔디 깔기 (Lay the Grass), in the language the page is read in. */
export const WORDS = words({ ko, en });

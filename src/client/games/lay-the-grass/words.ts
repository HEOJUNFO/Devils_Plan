/**
 * The words of 잔디 깔기 (Lay the Grass), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";

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
      "사이사이에 둘 중 하나를 고르는 선택이 네 번 나옵니다 (선택 5~8). 모두 동시에 고르고, 다 고르면 누가 무엇을 골랐는지 공개됩니다. 한 번 고르면 바꿀 수 없습니다. 선택의 내용은 나올 때 공개되고, 선택 5에서 \"정보\"를 고르면 미리 봅니다.",
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
    "not-marking": "지금은 맨홀이나 가로수를 놓는 때가 아닙니다",
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
    /** The two options of each choice, by the names the document gives them. */
    options: {
      5: ["점수", "정보"],
      6: ["공격", "방어"],
      7: ["상생", "견제"],
      8: ["가로수", "맨홀"],
    } as Record<5 | 6 | 7 | 8, [string, string]>,
    /** How large an option's name is written on its card, in pixels: 82 are free for it before what the option does. */
    optionSize: 24 as number,
    /** After the choice's name, on its line: 203 pixels. */
    once: "하나를 고릅니다. 바꿀 수 없습니다.",
    /** What an option does, with the game's own numbers: lines of 164 pixels, three at most. */
    score: (bonus: number) => [`승점 ${bonus}점을 바로 얻습니다.`],
    info: ["다음 선택 6, 7, 8의 내용을", "미리 봅니다."],
    attack: (loss: number) => ["타일을 놓으면 번호의 2배.", `못 놓으면 ${loss}점을 잃습니다.`],
    defend: (cells: number) => [`놓을 때 타일에서 ${cells}칸까지`, "잘라 낼 수 있습니다.", "(번호 칸, 두 동강은 불가)"],
    pair: ["둘이 한 팀. 두 타일이 맞닿은", "변의 수만큼 추가 승점을", "나눠 갖습니다."],
    check: (atMost: number, bonus: number) => [`놓은 사람이 ${atMost}명 이하이면`, `승점 ${bonus}점을 더 얻습니다.`],
    tree: ["공원에 가로수 하나를 놓습니다.", "그 위에는 구멍 뚫린 칸만", "놓을 수 있습니다."],
    manholes: ["+1과 -1 맨홀을 놓습니다.", "덮은 타일은 +1마다 1점,", "-1마다 1점을 잃습니다."],
    picked: (have: number, of: number) => `${have}/${of}명이 골랐습니다`,
    /** Under the cards, beside the button that shows the park: 190 pixels. */
    watching: "관전 중입니다",
    done: "골랐습니다. 모두 고르면 공개됩니다.",
    confirm: "한 번 더 누르거나 Enter로 확정",
    how: "1 또는 2, 또는 카드를 누르세요",
    /** The button that puts the cards aside to show the park, and the one that brings them back: 88 pixels inside. */
    seePark: "V 공원 보기",
    seeCards: "V 선택 카드",
    /** The sheet of the cards so far (I). */
    sheet: "선택 카드",
    sheetClose: "I 또는 Esc: 닫기",
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
      `${chosen === null ? "타일을 고르세요 (한 번 고르면 못 바꿉니다)" : `${chosen}번으로 정하려면 Enter, 또는 한 번 더 누르기`} · ${seconds}초`,
    mark: (what: "tree" | "plus" | "minus", seconds: number) =>
      `${what === "tree" ? "가로수를" : what === "plus" ? "+1 맨홀을" : "-1 맨홀을"} 놓을 칸을 누르세요 · ${seconds}초`,
    cut: (cells: number, most: number, seconds: number) => `자를 칸을 누르세요 (${cells}/${most}칸) · X로 끝 · ${seconds}초`,
    lay: (seconds: number) => `타일을 놓으세요 · ${seconds}초`,
    /** What someone else is doing; `watching` for a player who is not in the game. */
    other: (watching: boolean, who: string, doing: "pick" | "manholes" | "trees" | "lay", seconds: number) =>
      `${watching ? "관전 중 · " : ""}${who} ${doing === "pick" ? "고르는 중" : doing === "manholes" ? "맨홀 놓는 중" : doing === "trees" ? "가로수 놓는 중" : "놓는 중"} · ${seconds}초`,
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
    manhole: (who: string, plus: boolean) => `${who}: ${plus ? "+1" : "-1"} 맨홀 놓음`,
    tree: (who: string) => `${who}: 가로수 놓음`,
    skip: (who: string, tree: boolean) => `${who}: ${tree ? "가로수" : "맨홀"} 안 놓음`,
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
    notLaid: "타일 못 놓음",
    manholes: (points: string) => `맨홀 ${points}`,
    pair: (points: string) => `상생 ${points}`,
    check: (points: string) => `견제 ${points}`,
    bonus: (points: string) => `점수 ${points}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons along the bar: the two under the results 88 pixels wide inside, the three for laying 84. */
  button: {
    again: "Enter 새 판",
    lobby: "Esc 대기실로",
    cut: "X 자르기",
    cutDone: "X 자르기 끝",
    turn: "R 돌리기",
    lay: "Enter 놓기",
  },
  /** Beside the player's own tile, in the bar. */
  hand: {
    /** The tile and what it is worth, with the option of choice 6 where one was taken: 160 pixels. */
    mine: (tile: number, option: string | null) => `내 타일 ${tile}번 · ${tile}점${option === null ? "" : ` · ${option}`}`,
    cards: "I: 지금까지 나온 선택 카드 보기",
    mark: "마우스·화살표로 칸을 고르고 눌러서 놓기",
    marks: "맨홀을 덮으면 +1/-1점. 가로수 위에는 구멍 칸만.",
    /** While laying: 256 pixels, or 164 with the button for cutting beside it. */
    lay: "마우스·화살표로 옮기고 눌러서 놓기",
    layCut: "옮겨서 놓기 · X 자르기",
    order: "번호가 작은 타일부터 놓습니다. 자리가 없으면 0점.",
    failed: "놓을 자리가 없어 이번 공원은 0점입니다.",
    scored: (points: number) => `타일을 놓아 ${points}점을 얻었습니다.`,
    worth: "놓은 타일의 번호만큼 승점을 얻습니다.",
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (pickSeconds: number, placeSeconds: number): HelpLine[] => [
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
    { text: "선택의 내용은 나올 때 공개됩니다. I 키로 나온 카드를 다시 볼 수 있습니다.", tone: "dim" },
    { text: "" },
    { text: `고르기 ${pickSeconds}초, 놓기 ${placeSeconds}초. 시간이 지나면 자동으로 넘어갑니다.`, tone: "dim" },
    { text: "숫자: 고르기 · R: 돌리기 · X: 자르기(방어) · 화살표: 옮기기 · Enter: 정하기", tone: "dim" },
    { text: "H 또는 Esc: 닫기 · I: 선택 카드 · V: 공원 보기 · M: 음소거 · T: 채팅", tone: "title" },
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
      "Along the way a selection between two options comes up four times (Selections 5 to 8). Everyone picks at once, and when all have picked, who picked what is shown. A pick cannot be changed. What a selection is about is shown when it comes up; pick \"Info\" at Selection 5 to see ahead.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-your-turn": "It is not your turn",
    "not-choosing": "This is not the time to pick",
    "already-chosen": "You have picked. A pick cannot be changed",
    "not-picking": "This is not the time to pick a tile",
    "not-laying": "This is not the time to lay a tile",
    "not-marking": "This is not the time to place a manhole or a tree",
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
    // no English source gives these: plain translations
    options: {
      5: ["Points", "Info"],
      6: ["Attack", "Defense"],
      7: ["Win-win", "Check"],
      8: ["Tree", "Manhole"],
    },
    // "Defense" and "Manhole" in large letters would run over what the option does
    optionSize: 12,
    once: "Pick one. No changing it.",
    score: (bonus) => [`Get ${bonus} points at once.`],
    info: ["See what Selections", "6, 7 and 8 will be."],
    attack: (loss) => ["A tile laid scores double.", `Not laid, it costs you ${loss}.`],
    defend: (cells) => [`Cut up to ${cells} cells off the`, "tile as you lay it (not its", "number, nor in two)."],
    pair: ["Two pair up and split a", "point for each side their", "tiles share."],
    check: (atMost, bonus) => [`If ${atMost} or fewer lay a tile,`, `you get ${bonus} more points.`],
    tree: ["Put a tree on the park.", "Only a cell with a hole", "can lie over it."],
    manholes: ["Put a +1 and -1 manhole.", "A tile over +1 gains 1,", "over -1 loses 1."],
    picked: (have, of) => `${have}/${of} have picked`,
    watching: "You are watching",
    done: "Picked. Shown when all have.",
    confirm: "Again, or Enter, to confirm",
    how: "Press 1 or 2, or a card",
    seePark: "V see park",
    seeCards: "V cards",
    sheet: "Selection cards",
    sheetClose: "I or Esc: close",
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
    pick: (chosen, seconds) => `${chosen === null ? "Pick a tile (a pick cannot be changed)" : `Enter, or press it again, to settle on tile ${chosen}`} · ${seconds}s`,
    mark: (what, seconds) => `Press the cell for the ${what === "tree" ? "tree" : what === "plus" ? "+1 manhole" : "-1 manhole"} · ${seconds}s`,
    cut: (cells, most, seconds) => `Press the cells to cut (${cells}/${most}) · X when done · ${seconds}s`,
    lay: (seconds) => `Lay your tile · ${seconds}s`,
    other: (watching, who, doing, seconds) =>
      `${watching ? "Watching · " : ""}${who} is ${doing === "pick" ? "picking" : doing === "manholes" ? "placing a manhole" : doing === "trees" ? "placing a tree" : "laying"} · ${seconds}s`,
  },
  log: {
    park: (round) => `Park ${round}`,
    took: (option, names) => `${option}: ${names}`,
    tookMany: (option, players, names) => `${option} (${players}): ${names}`,
    pick: (who, tile, forced) => `${who}: picks ${tile}${forced ? " (auto)" : ""}`,
    pair: (names) => `Win-win pair: ${names}`,
    alone: (who) => `${who}: no pair`,
    manhole: (who, plus) => `${who}: ${plus ? "+1" : "-1"} manhole`,
    tree: (who) => `${who}: tree placed`,
    skip: (who, tree) => `${who}: no ${tree ? "tree" : "manhole"}`,
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
    notLaid: "Tile not laid",
    manholes: (points) => `Manholes ${points}`,
    pair: (points) => `Win-win ${points}`,
    check: (points) => `Check ${points}`,
    bonus: (points) => `Points ${points}`,
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  button: {
    again: "Enter again",
    lobby: "Esc to room",
    cut: "X cut",
    cutDone: "X done",
    turn: "R turn",
    lay: "Enter lay",
  },
  hand: {
    mine: (tile, option) => `Tile ${tile} · ${tile} pts${option === null ? "" : ` · ${option}`}`,
    cards: "I: see the selection cards so far",
    mark: "Pick a cell with the mouse or the arrows, and press to place",
    marks: "A tile over a manhole: +1 or -1. Over a tree: only a holed cell.",
    lay: "Move by mouse or arrows, then press",
    layCut: "Move, lay · X cuts",
    order: "The smallest number lays first. No room scores 0.",
    failed: "No room for your tile: 0 points this park.",
    scored: (points) => `Your tile is laid: ${points} points.`,
    worth: "A tile laid scores its number.",
  },
  help: (pickSeconds, placeSeconds) => [
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
    { text: "What a selection is about shows as it comes up. I: the cards again.", tone: "dim" },
    { text: "" },
    { text: `${pickSeconds}s to pick, ${placeSeconds}s to lay. After that the game moves on by itself.`, tone: "dim" },
    { text: "Digits: pick · R: turn · X: cut (Defense) · Arrows: move · Enter: set", tone: "dim" },
    { text: "H or Esc: close · I: cards · V: see park · M: mute · T: chat", tone: "title" },
  ],
};

/** The words of 잔디 깔기 (Lay the Grass), in the language the page is read in. */
export const WORDS = words({ ko, en });

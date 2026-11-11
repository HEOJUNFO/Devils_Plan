/**
 * The screen of 잔디 깔기: the park, the either-or choices as they come up,
 * the seven tiles to pick from, the manholes and trees put on the park, the
 * tile in hand over the place it would lie, and who does what in what order.
 *
 * Design: design/games/lay-the-grass.md. The room decides everything; this
 * screen shows what it sends and asks for a choice, a pick, a manhole, a tree
 * or a lay. Whether a tile fits, and whether cells may be cut off it, is
 * worked out here as well, with the same rules, so that a player sees it
 * before asking.
 */
import {
  CHOICES,
  TILES,
  canCut,
  coveredBy,
  fits,
  hasCell,
  hasWay,
  shapeOf,
  tileOf,
  turned,
  waysToLay,
  type ChoiceNo,
  type Cut,
  type GrassEvent,
  type Option,
  type Placement,
  type ScoreLine,
  type Tile,
} from "../../../shared/games/lay-the-grass/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C, shade } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 잔디 깔기. */
export type GrassMessage = Extract<ServerMessage, { type: "game"; game: "lay-the-grass" }>;

/** What the screen asks of whoever owns the connection. */
export interface GrassHandlers {
  /** The player chose, picked, marked the park or laid. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): void;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** A sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** The game has more players than the column lists one to a row, or no longer has. */
  crowded(crowded: boolean): void;
}

/** The game screen. */
export interface GrassScreen {
  update(message: GrassMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** Where the park is drawn: the part of the scene under the page's own buttons. */
const PARK_AREA = { x: 8, y: 24, w: 288, h: 190 };
/** The largest a cell of the park is drawn, in pixels. */
const MAX_CELL = 28;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 54;
/** With this many seconds or fewer of the player's own turn left, each is ticked aloud. */
const TICK_FROM = 5;
/**
 * Seconds the results are on show before Enter starts another game: the host
 * may have been pressing Enter to lay a tile at the moment the game ended.
 */
const RESULTS_HOLD = 1.5;
/**
 * One colour for each player's grass, by their place in the list of players:
 * as many as a game has players, the first six as they were when six was the
 * most. None is the green of a tree or the brown of the soil.
 */
const GRASS = [
  "#6fcf5a",
  "#3fd0b6",
  "#ffb43c",
  "#e8739a",
  "#7aa2ff",
  "#c58bff",
  "#f2e85c",
  "#ff7a4a",
  "#5ad1ff",
  "#d9d9e6",
  "#a8a03c",
  "#ff5fd2",
  "#5a64e0",
  "#d8b088",
  "#8a4ab8",
  "#c8504a",
] as const;
/** The marks of those who have picked a tile, on its button: how many to a row. */
const PICK_MARKS_ROW = 3;
/** Behind the entry of whoever's turn it is, in a crowded list. */
const TURN_ROW = "#3a2a12";
/** How much of a holed cell's width its hole takes. */
const HOLE_SHARE = 0.62;
/** The soil of a park cell nothing lies on. */
const SOIL = "#3a2a1c";
const SOIL_D = "#2a1e14";
/** A tree: its crown and its trunk. */
const LEAF = "#2f9a4c";
const LEAF_D = "#1d6a34";
const TRUNK = "#7a4a26";

/** The two options of each choice, by the names the document gives them. */
const OPTION_NAMES = WORDS.choice.options;

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The button of the tile `index` places along the bar. */
const tileRect = (index: number): Box => [6 + index * 67, 238, 65, 30];
const CUT_RECT: Box = [204, 240, 86, 26];
const TURN_RECT: Box = [296, 240, 86, 26];
const LAY_RECT: Box = [388, 240, 86, 26];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** The two options of a choice, one above the other over the park; and the button that puts them aside. */
const OPTION_RECTS: readonly [Box, Box] = [
  [8, 44, 288, 62],
  [8, 112, 288, 62],
];
const PEEK_RECT: Box = [206, 194, 90, 18];
/** How far that button takes a finger: nothing else is pressed near it. */
const PEEK_REACH: Reach = [6, 6, 8, 6];
/** How far the three buttons for laying take a finger: half the gap to the next, and up and down to the edges of the bar's row. */
const LAYING_REACH: Reach = [3, 3, 3, 4];
/**
 * Under a finger: the button that opens the sheet of the choices' cards, as
 * the I key does. Beside the page's own button over the game, in the strip
 * the scene keeps clear for the page; how wide it is is the language's to say.
 */
const CARDS_AT = { x: 56, y: 2, h: 20 } as const;
const CARDS_REACH: Reach = [3, 2, 6, 2];

/** `value` with its sign, as points are written. */
const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link GrassScreen.update}. */
export function createGrassScreen(canvas: HTMLCanvasElement, handlers: GrassHandlers): GrassScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: GrassMessage | null = null;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clocks are counted from here in real time: the screen's `time`
   * stops while the tab is hidden.
   */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
  let seen = 0;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  /** The sheet over the screen: the rules, or the cards of the choices the player may see. */
  let sheet: "none" | "help" | "cards" = "none";
  let note = "";
  let noteT = 0;
  /** The option of the choice being made that the player has pointed at and not yet confirmed: a choice cannot be taken back. */
  let pointed: Option | null = null;
  /** The cards of a choice put aside for a look at the park. */
  let peek = false;
  /** The choice the two above were last reset for. */
  let choiceFor = "";
  /** The tile the player has pointed at and not yet confirmed: a pick cannot be taken back. */
  let chosen: number | null = null;
  /** Where the player holds their tile over the park: the top left of its box, and how it is turned. */
  let hand: { row: number; col: number; turns: number } | null = null;
  /** The turn the hand was last put in its starting place for, so that it is done once a turn. */
  let handFor = "";
  /** 방어: the cells the player means to cut off the tile, in the tile's own box; and whether clicks cut rather than lay. */
  let cut: Cut[] = [];
  let cutting = false;
  /** The park cell pointed at for a manhole or a tree. */
  let cursor: { row: number; col: number } | null = null;
  /**
   * The park cell a finger last pressed for a manhole or a tree. A finger
   * covers the cell it presses, and what is put cannot be taken back: the
   * first press points at the cell, a second on the same one puts.
   */
  let fingered: { row: number; col: number } | null = null;
  /** The tile laid last lights up for a moment: by player. */
  const lit = new Map<number, number>();
  /** The last second of the player's own turn that was ticked aloud. */
  let ticked = -1;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed. */
  const keys: string[] = [];
  const clicks: Press[] = [];
  const mouse = { x: -1, y: -1, moved: false };
  let stopped = false;

  // ---- What the latest message means ---------------------------------------------------------------
  const nickOf = (player: number): string => latest?.players.find((each) => each.id === player)?.nick ?? "";
  /** The colour of `player`'s grass. */
  function grassOf(player: number): string {
    const index = latest?.players.findIndex((each) => each.id === player) ?? -1;
    return GRASS[(index < 0 ? 0 : index) % GRASS.length];
  }
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const me = (): number | null => latest?.view.you ?? null;
  const myTurn = (): boolean => latest !== null && me() !== null && latest.view.turn === me() && !latest.frozen;
  const picking = (): boolean => myTurn() && latest?.view.phase === "pick";
  const laying = (): boolean => myTurn() && latest?.view.phase === "place";
  const marking = (): boolean => myTurn() && (latest?.view.phase === "manholes" || latest?.view.phase === "trees");
  /** Whether the player has still to make the choice that is up. */
  const choosing = (): boolean =>
    latest !== null && me() !== null && !latest.frozen && latest.view.phase === "choose" && latest.view.choosing?.mine === null;
  /** The tile `player` has picked in this park, or `null`. */
  const tileOfPlayer = (player: number): number | null => latest?.view.picks.find((pick) => pick.player === player)?.tile ?? null;
  /** What `player` chose at choice `which`, once it has been shown to everyone. */
  const optionOf = (player: number | null, which: ChoiceNo): Option | null =>
    latest?.view.choices.find((each) => each.which === which && each.player === player)?.option ?? null;
  /** Whether the player may cut cells off their tile: they chose 방어. */
  const defending = (): boolean => optionOf(me(), 6) === 2;
  /** How the points of the last park came about, by player. */
  function scoreOf(player: number): ScoreLine | null {
    const event = [...(latest?.view.history ?? [])].reverse().find((each) => each.type === "score");
    return event?.type === "score" ? (event.lines.find((line) => line.player === player) ?? null) : null;
  }

  /** Where the park is drawn, and how large its cells are. */
  function parkBox(): { x: number; y: number; cell: number; rows: number; cols: number } | null {
    if (latest === null) return null;
    const rows = latest.view.park.rows.length;
    const cols = Math.max(1, ...latest.view.park.rows.map((row) => row.length));
    const cell = Math.max(4, Math.min(MAX_CELL, Math.floor(PARK_AREA.w / cols), Math.floor(PARK_AREA.h / Math.max(1, rows))));
    return {
      x: PARK_AREA.x + Math.floor((PARK_AREA.w - cols * cell) / 2),
      y: PARK_AREA.y + Math.floor((PARK_AREA.h - rows * cell) / 2),
      cell,
      rows,
      cols,
    };
  }
  /** The park cell under a point of the screen, or `null`. */
  function cellAt(p: { x: number; y: number }): { row: number; col: number } | null {
    const box = parkBox();
    if (latest === null || box === null) return null;
    const row = Math.floor((p.y - box.y) / box.cell);
    const col = Math.floor((p.x - box.x) / box.cell);
    return hasCell(latest.view.park, row, col) ? { row, col } : null;
  }

  function say(text: string): void {
    note = text;
    noteT = 2;
  }

  /** The words on the card of option `option` of choice `which`: what it does, with the game's own numbers. */
  function cardLines(which: ChoiceNo, option: Option): string[] {
    const rules = latest?.rules;
    const atMost = latest?.view.checkAtMost ?? 0;
    if (rules === undefined) return [];
    const said = WORDS.choice;
    if (which === 5) return option === 1 ? said.score(rules.scoreBonus) : said.info;
    if (which === 6) return option === 1 ? said.attack(rules.attackLoss) : said.defend(rules.cutMax);
    if (which === 7) return option === 1 ? said.pair : said.check(atMost, rules.checkBonus);
    return option === 1 ? said.tree : said.manholes;
  }

  /** Shows one thing that happened: a sound, and something to see where it happened. */
  function show(event: GrassEvent): void {
    if (event.type === "park") {
      chosen = null;
      hand = null;
      lit.clear();
      if (event.round > 1) sfx.turn();
    } else if (event.type === "choice") {
      sfx.turn();
    } else if (event.type === "pick" || event.type === "manhole" || event.type === "tree") {
      sfx.pick();
    } else if (event.type === "lay") {
      lit.set(event.player, 0.8);
      sfx.earn();
    } else if (event.type === "fail" || event.type === "skip") {
      sfx.deny();
    }
  }

  function update(message: GrassMessage): void {
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      chosen = null;
      hand = null;
      handFor = "";
      cut = [];
      cutting = false;
      cursor = null;
      lit.clear();
      speech.clear();
    }
    // whatever the room has to say, the park may not be as it was when a cell was pointed at
    fingered = null;
    const wasMine = myTurn() || choosing();
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // a new choice is looked at afresh: nothing pointed at, the cards up
    const choice = `${message.startedAt}:${message.view.round}:${message.view.choosing?.which ?? "-"}`;
    if (choice !== choiceFor) {
      choiceFor = choice;
      pointed = null;
      peek = false;
    }
    if (!wasMine && (myTurn() || choosing())) sfx.turn();
    if (!picking()) chosen = null;
    if (!laying()) cutting = false;
  }

  /** Puts the tile in the player's hand over the first place it fits, once at the start of their turn to lay. */
  function takeInHand(): void {
    if (latest === null || !laying()) return;
    const mine = me();
    const tile = mine === null ? null : tileOfPlayer(mine);
    if (mine === null || tile === null) return;
    const turn = `${latest.startedAt}:${latest.view.round}:${mine}`;
    if (handFor === turn && hand !== null) return;
    handFor = turn;
    cut = [];
    cutting = false;
    hand = waysToLay(latest.view.park, latest.view.placed, tile, { trees: latest.view.trees })[0] ?? { row: 0, col: 0, turns: 0 };
  }

  /** Turns the tile in hand a quarter clockwise, about the middle of its box. */
  function turnHand(): void {
    if (latest === null || hand === null) return;
    const mine = me();
    const tile = mine === null ? undefined : tileOf(tileOfPlayer(mine) ?? -1);
    if (tile === undefined) return;
    const before = turned(tile, hand.turns);
    const after = turned(tile, hand.turns + 1);
    hand = {
      row: hand.row + Math.floor(before.rows / 2) - Math.floor(after.rows / 2),
      col: hand.col + Math.floor(before.cols / 2) - Math.floor(after.cols / 2),
      turns: (hand.turns + 1) % 4,
    };
    sfx.move();
  }

  /** 방어: cuts the cell of the tile in hand that lies on park cell `at`, or puts it back if it was cut. */
  function toggleCut(at: { row: number; col: number }): void {
    if (latest === null || hand === null) return;
    const tile = tileOf(tileOfPlayer(me() ?? -1) ?? -1);
    if (tile === undefined) return;
    // a tile's cells keep their order when it is turned: the cell laid at `at` is the same one in the tile's own box
    const index = coveredBy(tile, hand.row, hand.col, hand.turns).findIndex((cell) => cell.row === at.row && cell.col === at.col);
    if (index < 0) return;
    const own = { row: tile.cells[index].row, col: tile.cells[index].col };
    const without = cut.filter((cell) => cell.row !== own.row || cell.col !== own.col);
    if (without.length < cut.length) {
      // putting one of two back must leave a cut that is allowed by itself: it always is
      cut = without;
      sfx.move();
    } else if (canCut(tile, [...cut, own], latest.rules.cutMax)) {
      cut = [...cut, own];
      sfx.move();
    } else {
      say(WORDS.refused["bad-cut"]);
      sfx.deny();
    }
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: Box, finger?: Reach): boolean => clicks.some((p) => hits(p, rect, finger));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = sheet;
    if (pressed("KeyH")) sheet = sheet === "help" ? "none" : "help";
    else if (pressed("KeyI") || (TOUCH && sheet === "none" && clicked(cardsRect(), CARDS_REACH))) sheet = sheet === "cards" ? "none" : "cards";
    else if (sheet !== "none" && (pressed("Escape", "Enter") || clicks.length > 0)) sheet = "none";
    // the page's own buttons lie over the frame: they give way while a sheet is up
    if ((sheet !== "none") !== (was !== "none")) handlers.covered(sheet !== "none");
    if (sheet !== "none" || was !== "none") return;

    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape", "Backspace") || clicked(LOBBY_RECT, LOBBY_REACH)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) handlers.again();
        else say(WORDS.refused["not-host"]);
      }
      return;
    }

    // From here on what was pressed is gone through in the order it was pressed: a slow frame can hold
    // several keys, and what cannot be taken back (a choice, a pick, a lay) is sent as it stood when Enter
    // came, never as it stands after the keys that followed.
    const isEnter = (code: string): boolean => code === "Enter" || code === "NumpadEnter";
    const digitOf = (code: string): number | null => {
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1];
      return digit === undefined ? null : Number(digit);
    };

    if (view.phase === "choose") {
      const can = (): boolean => choosing() && !pending && !peek;
      const point = (option: Option): void => {
        pointed = option;
        sfx.move();
      };
      const send = (): void => {
        if (pointed === null) return;
        pending = handlers.act({ type: "choose", option: pointed });
        if (!pending) say(WORDS.notSent);
      };
      for (const code of keys) {
        const digit = digitOf(code);
        if (code === "KeyV") peek = !peek;
        else if (!can()) continue;
        else if (digit === 1 || digit === 2) point(digit);
        // an option is pointed at first and confirmed second: a choice cannot be taken back
        else if (isEnter(code) && pointed !== null) send();
      }
      for (const click of clicks) {
        if (hits(click, PEEK_RECT, PEEK_REACH)) peek = !peek;
        else if (can()) {
          for (const option of [1, 2] as const) {
            if (!inRect(click, OPTION_RECTS[option - 1])) continue;
            if (pointed === option) send();
            else point(option);
          }
        }
      }
      return;
    }

    if (picking() && !pending) {
      const send = (): void => {
        if (chosen === null) return;
        pending = handlers.act({ type: "pick", tile: chosen });
        if (!pending) say(WORDS.notSent);
      };
      // a tile is pointed at first and confirmed second: a pick cannot be taken back
      for (const code of keys) {
        if (pending) break;
        const digit = digitOf(code);
        if (digit !== null && digit >= 1 && digit <= TILES.length) {
          chosen = TILES[digit - 1].number;
          sfx.move();
        } else if (isEnter(code)) send();
      }
      for (const click of clicks) {
        if (pending) break;
        const index = TILES.findIndex((_, at) => inRect(click, tileRect(at)));
        if (index < 0) continue;
        if (chosen === TILES[index].number) send();
        else {
          chosen = TILES[index].number;
          sfx.move();
        }
      }
      return;
    }

    if (marking() && !pending) {
      const box = parkBox();
      if (box === null) return;
      if (cursor === null || !hasCell(view.park, cursor.row, cursor.col)) {
        // the first cell of the park, from the top left
        for (let row = 0; row < box.rows && cursor === null; row++) {
          for (let col = 0; col < box.cols && cursor === null; col++) {
            if (hasCell(view.park, row, col)) cursor = { row, col };
          }
        }
      }
      if (cursor === null) return;
      const tree = view.phase === "trees";
      const put = (at: { row: number; col: number }): void => {
        const here = (each: { row: number; col: number }): boolean => each.row === at.row && each.col === at.col;
        if (view.manholes.some(here) || (tree && view.trees.some(here))) {
          say(WORDS.refused["bad-cell"]);
          sfx.deny();
          return;
        }
        pending = handlers.act({ type: tree ? "tree" : "manhole", row: at.row, col: at.col });
        if (!pending) say(WORDS.notSent);
      };
      let spot: { row: number; col: number } = (mouse.moved ? cellAt(mouse) : null) ?? cursor;
      for (const code of keys) {
        if (pending) break;
        const way = code === "ArrowLeft" ? [0, -1] : code === "ArrowRight" ? [0, 1] : code === "ArrowUp" ? [-1, 0] : code === "ArrowDown" ? [1, 0] : null;
        // the cursor goes on in that direction to the next cell the park has
        for (let far = 1; way !== null && far <= Math.max(box.rows, box.cols); far++) {
          const there: { row: number; col: number } = { row: spot.row + way[0] * far, col: spot.col + way[1] * far };
          if (hasCell(view.park, there.row, there.col)) {
            spot = there;
            break;
          }
        }
        if (isEnter(code) || code === "Space") put(spot);
      }
      cursor = spot;
      for (const click of clicks) {
        const at = cellAt(click);
        if (at === null || pending) continue;
        cursor = at;
        // a mouse points before it presses; a finger's first press is its pointing
        if (!click.touch || (fingered !== null && fingered.row === at.row && fingered.col === at.col)) put(at);
        else {
          fingered = at;
          sfx.move();
        }
      }
      return;
    }

    if (laying() && !pending) {
      takeInHand();
      const box = parkBox();
      const mine = me();
      const number = mine === null ? null : tileOfPlayer(mine);
      const tile = number === null ? undefined : tileOf(number);
      if (hand === null || box === null || tile === undefined || number === null) return;
      const inBox = (q: { x: number; y: number }): boolean =>
        q.x >= box.x && q.x < box.x + box.cols * box.cell && q.y >= box.y && q.y < box.y + box.rows * box.cell;
      /** The tile stays where some of it could still be seen. */
      const keepInSight = (): void => {
        if (hand === null) return;
        const shape = turned(tile, hand.turns);
        hand = {
          ...hand,
          row: Math.max(-shape.rows + 1, Math.min(box.rows - 1, hand.row)),
          col: Math.max(-shape.cols + 1, Math.min(box.cols - 1, hand.col)),
        };
      };
      const lay = (): void => {
        if (hand === null) return;
        if (fits(view.park, view.placed, number, hand.row, hand.col, hand.turns, { cut, trees: view.trees })) {
          pending = handlers.act({ type: "lay", row: hand.row, col: hand.col, turns: hand.turns, ...(cut.length > 0 ? { cut } : {}) });
          if (!pending) say(WORDS.notSent);
        } else {
          say(WORDS.refused["does-not-fit"]);
          sfx.deny();
        }
      };
      const toggleCutting = (): void => {
        if (!defending()) return;
        cutting = !cutting;
        sfx.move();
      };
      // the mouse carries the tile by the middle of its box, unless it is being cut: then it lies still to be clicked
      if (mouse.moved && inBox(mouse) && !cutting) {
        const shape = turned(tile, hand.turns);
        hand = {
          ...hand,
          row: Math.floor((mouse.y - box.y) / box.cell) - Math.floor(shape.rows / 2),
          col: Math.floor((mouse.x - box.x) / box.cell) - Math.floor(shape.cols / 2),
        };
        keepInSight();
      }
      for (const code of keys) {
        if (pending || hand === null) break;
        if (code === "KeyX") toggleCutting();
        else if (code === "KeyR") turnHand();
        else if (code === "ArrowLeft") hand = { ...hand, col: hand.col - 1 };
        else if (code === "ArrowRight") hand = { ...hand, col: hand.col + 1 };
        else if (code === "ArrowUp") hand = { ...hand, row: hand.row - 1 };
        else if (code === "ArrowDown") hand = { ...hand, row: hand.row + 1 };
        else if (isEnter(code) || code === "Space") lay();
        keepInSight();
      }
      for (const click of clicks) {
        if (pending) break;
        if (hits(click, CUT_RECT, LAYING_REACH)) toggleCutting();
        else if (hits(click, TURN_RECT, LAYING_REACH)) {
          turnHand();
          keepInSight();
        } else if (hits(click, LAY_RECT, LAYING_REACH)) lay();
        else if (inBox(click)) {
          // A click on the park lays the tile; while cutting, it cuts the cell clicked off, or puts it back.
          // A finger on the park only carries the tile there (see above): it lies under the finger, and
          // what is laid cannot be taken back, so a finger lays with the button.
          if (cutting) toggleCut({ row: Math.floor((click.y - box.y) / box.cell), col: Math.floor((click.x - box.x) / box.cell) });
          else if (!click.touch) lay();
        }
      }
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    for (const [player, t] of lit) {
      if (t - dt <= 0) lit.delete(player);
      else lit.set(player, t - dt);
    }
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // my own time is nearly up: a tick a second
      const mine = myTurn() || choosing() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > TICK_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
    mouse.moved = false;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  /**
   * The round hole of a holed cell, in a cell `size` pixels wide whose top
   * left is `x`, `y`: what lies under the tile shows through it. Drawn row
   * by row, so that it stays a crisp disc at any size.
   */
  function drawHole(x: number, y: number, size: number, colour: string): void {
    const across = Math.max(2, Math.round(size * HOLE_SHARE));
    const radius = across / 2;
    const left_ = x + Math.floor((size - across) / 2);
    const top = y + Math.floor((size - across) / 2);
    for (let i = 0; i < across; i++) {
      const dy = i + 0.5 - radius;
      const half = Math.round(Math.sqrt(radius * radius - dy * dy));
      if (half > 0) pen.px(left_ + radius - half, top + i, half * 2, 1, colour);
    }
  }

  /** A manhole in a cell: a round cover with what it is worth on it. */
  function drawManhole(x: number, y: number, size: number, value: 1 | -1): void {
    const colour = value > 0 ? C.teal : C.crim;
    drawHole(x, y, size, C.steelDD);
    drawHole(x + 1, y + 1, size - 2, shade(colour, 0.45));
    if (size >= 15) pen.txt(value > 0 ? "+1" : "-1", x + Math.round(size / 2), y + Math.round((size - 13) / 2), colour, "center");
  }

  /** A tree in a cell: a round crown on a short trunk. */
  function drawTree(x: number, y: number, size: number): void {
    const crown = Math.max(4, Math.round(size * 0.5));
    const cx = x + Math.floor(size / 2);
    pen.px(cx - 1, y + Math.round(size * 0.55), 2, Math.max(2, Math.round(size * 0.3)), TRUNK);
    const top = y + Math.max(1, Math.round(size * 0.12));
    for (let i = 0; i < crown; i++) {
      const dy = i + 0.5 - crown / 2;
      const half = Math.round(Math.sqrt((crown / 2) * (crown / 2) - dy * dy));
      if (half > 0) pen.px(cx - half, top + i, half * 2, 1, i < crown / 2 ? LEAF : LEAF_D);
    }
  }

  /** Draws the cells of a tile lying on the park, with a dark line where it ends. */
  function drawLaid(placement: Placement, box: { x: number; y: number; cell: number }, colour: string, bright: boolean): void {
    const tile = shapeOf(placement.tile, placement.cut ?? []);
    if (tile === undefined) return;
    const cells = coveredBy(tile, placement.row, placement.col, placement.turns);
    const own = new Set(cells.map((cell) => `${cell.row},${cell.col}`));
    for (const cell of cells) {
      const x = box.x + cell.col * box.cell;
      const y = box.y + cell.row * box.cell;
      pen.px(x, y, box.cell, box.cell, bright ? shade(colour, 1.25) : colour);
      // blades of grass, the same on every cell
      pen.px(x + 2, y + 2, 1, 2, shade(colour, 0.8));
      pen.px(x + box.cell - 4, y + box.cell - 5, 1, 2, shade(colour, 0.8));
      const edge = shade(colour, 0.45);
      if (!own.has(`${cell.row - 1},${cell.col}`)) pen.px(x, y, box.cell, 1, edge);
      if (!own.has(`${cell.row + 1},${cell.col}`)) pen.px(x, y + box.cell - 1, box.cell, 1, edge);
      if (!own.has(`${cell.row},${cell.col - 1}`)) pen.px(x, y, 1, box.cell, edge);
      if (!own.has(`${cell.row},${cell.col + 1}`)) pen.px(x + box.cell - 1, y, 1, box.cell, edge);
      if (cell.kind === "number" && box.cell >= 13) {
        pen.txt(`${placement.tile}`, x + Math.round(box.cell / 2), y + Math.round((box.cell - 13) / 2), C.ink, "center");
      }
      // a holed cell: the park shows through, with a rim of the tile's own shade
      if (cell.kind === "hole") {
        drawHole(x, y, box.cell, edge);
        drawHole(x + 1, y + 1, box.cell - 2, SOIL);
      }
    }
  }

  function drawPark(): void {
    const box = parkBox();
    if (latest === null || box === null) return;
    const view = latest.view;
    // the park's edge: a dark rim round every cell, so the shape reads against the night
    for (let row = 0; row < box.rows; row++) {
      for (let col = 0; col < box.cols; col++) {
        if (hasCell(view.park, row, col)) pen.px(box.x + col * box.cell - 2, box.y + row * box.cell - 2, box.cell + 4, box.cell + 4, C.ink);
      }
    }
    for (let row = 0; row < box.rows; row++) {
      for (let col = 0; col < box.cols; col++) {
        if (!hasCell(view.park, row, col)) continue;
        const x = box.x + col * box.cell;
        const y = box.y + row * box.cell;
        pen.px(x, y, box.cell, box.cell, SOIL_D);
        pen.px(x + 1, y + 1, box.cell - 2, box.cell - 2, SOIL);
      }
    }
    const covered = new Set<string>();
    for (const placement of view.placed) {
      const tile = shapeOf(placement.tile, placement.cut ?? []);
      if (tile !== undefined) for (const cell of coveredBy(tile, placement.row, placement.col, placement.turns)) covered.add(`${cell.row},${cell.col}`);
    }
    // a manhole nothing lies on yet shows as it is
    for (const manhole of view.manholes) {
      if (!covered.has(`${manhole.row},${manhole.col}`)) drawManhole(box.x + manhole.col * box.cell, box.y + manhole.row * box.cell, box.cell, manhole.value);
    }
    for (const placement of view.placed) drawLaid(placement, box, grassOf(placement.player), lit.has(placement.player));
    // a manhole under a tile: what it gave or took, in the corner of the cell
    for (const manhole of view.manholes) {
      if (!covered.has(`${manhole.row},${manhole.col}`)) continue;
      // a plus or a minus on a small plate: it keeps clear of the tile's number and of its hole
      const x = box.x + manhole.col * box.cell + 1;
      const y = box.y + manhole.row * box.cell + 1;
      const colour = manhole.value > 0 ? C.teal : C.crim;
      pen.px(x, y, 7, 7, C.ink);
      pen.px(x + 1, y + 3, 5, 1, colour);
      if (manhole.value > 0) pen.px(x + 3, y + 1, 1, 5, colour);
    }
    // a tree stands in the open, or in the hole of the cell laid over it
    for (const tree of view.trees) drawTree(box.x + tree.col * box.cell, box.y + tree.row * box.cell, box.cell);

    // the cell pointed at for a manhole or a tree
    if (marking() && cursor !== null) {
      const x = box.x + cursor.col * box.cell;
      const y = box.y + cursor.row * box.cell;
      const colour = Math.sin(time * 6) > 0 ? C.amber : C.amberD;
      pen.px(x, y, box.cell, 2, colour);
      pen.px(x, y + box.cell - 2, box.cell, 2, colour);
      pen.px(x, y, 2, box.cell, colour);
      pen.px(x + box.cell - 2, y, 2, box.cell, colour);
    }

    // the tile in the player's hand, over where it would lie
    const mine = me();
    const number = mine === null ? null : tileOfPlayer(mine);
    const whole = number === null ? undefined : tileOf(number);
    const tile = number === null ? undefined : shapeOf(number, cut);
    if (laying() && hand !== null && tile !== undefined && whole !== undefined && number !== null && mine !== null) {
      const ok = fits(view.park, view.placed, number, hand.row, hand.col, hand.turns, { cut, trees: view.trees });
      const colour = ok ? grassOf(mine) : C.crim;
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(time * 6);
      for (const cell of coveredBy(tile, hand.row, hand.col, hand.turns)) {
        pen.px(box.x + cell.col * box.cell + 1, box.y + cell.row * box.cell + 1, box.cell - 2, box.cell - 2, colour);
      }
      ctx.globalAlpha = 1;
      for (const cell of coveredBy(tile, hand.row, hand.col, hand.turns)) {
        const x = box.x + cell.col * box.cell;
        const y = box.y + cell.row * box.cell;
        if (cell.kind === "hole") drawHole(x + 1, y + 1, box.cell - 2, SOIL_D);
        if (cell.kind === "number" && box.cell >= 13) {
          pen.txt(`${number}`, x + Math.round(box.cell / 2), y + Math.round((box.cell - 13) / 2), C.ink, "center");
        }
        pen.px(x, y, box.cell, 1, colour);
        pen.px(x, y + box.cell - 1, box.cell, 1, colour);
        pen.px(x, y, 1, box.cell, colour);
        pen.px(x + box.cell - 1, y, 1, box.cell, colour);
      }
      // the cells cut off: where they were, so that one can be put back
      if (cut.length > 0) {
        const laidWhole = coveredBy(whole, hand.row, hand.col, hand.turns);
        whole.cells.forEach((own, index) => {
          if (!cut.some((gone) => gone.row === own.row && gone.col === own.col)) return;
          const x = box.x + laidWhole[index].col * box.cell;
          const y = box.y + laidWhole[index].row * box.cell;
          for (let dash = 2; dash < box.cell - 2; dash += 4) {
            pen.px(x + dash, y + 1, 2, 1, C.boneD);
            pen.px(x + dash, y + box.cell - 2, 2, 1, C.boneD);
            pen.px(x + 1, y + dash, 1, 2, C.boneD);
            pen.px(x + box.cell - 2, y + dash, 1, 2, C.boneD);
          }
        });
      }
    }
    // the trees again over the tile in hand: a tree is never hidden
    if (laying() && hand !== null) for (const tree of view.trees) drawTree(box.x + tree.col * box.cell, box.y + tree.row * box.cell, box.cell);
  }

  /** The two options of the choice that is up, over the park. */
  function drawChoice(): void {
    if (latest === null || latest.view.choosing === null) return;
    const up = latest.view.choosing;
    const mine = me();
    pen.px(4, 22, SCENE_W - 8, BAR_Y - 26, C.ink);
    pen.px(5, 23, SCENE_W - 10, BAR_Y - 28, C.bar);
    pen.txt(WORDS.choice.name(up.which), 12, 27, C.amber);
    pen.txt(WORDS.choice.once, 12 + pen.width(WORDS.choice.name(up.which)) + 8, 27, C.boneD);
    for (const option of [1, 2] as const) {
      const rect = OPTION_RECTS[option - 1];
      const [x, y, w, h] = rect;
      const taken = up.mine === option;
      const lit_ = taken || (up.mine === null && pointed === option);
      const live = choosing() && !pending;
      pen.px(x, y, w, h, lit_ ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, lit_ ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
      pen.txt(`${option}`, x + 7, y + 24, C.dim);
      // the option's name, as large as its language leaves room for, level with the middle of the card
      const size = WORDS.choice.optionSize;
      pen.txt(OPTION_NAMES[up.which][option - 1], x + 20, y + Math.round((h - size - 2) / 2), lit_ ? C.amber : up.mine === null ? C.bone : C.dim, "left", size);
      cardLines(up.which, option).forEach((line, at) => pen.txt(line, x + 104, y + 8 + at * 15, lit_ || up.mine === null ? C.bone : C.dim));
    }
    pen.txt(WORDS.choice.picked(up.chosen.length, latest.players.length), 12, 180, C.boneD);
    const words =
      mine === null
        ? WORDS.choice.watching
        : up.mine !== null
          ? WORDS.choice.done
          : pointed !== null
            ? WORDS.choice.confirm
            : WORDS.choice.how;
    pen.txt(words, 12, 196, up.mine !== null || mine === null ? C.boneD : C.amber);
    button(PEEK_RECT, WORDS.choice.seePark, "", false, true);
  }

  /** Under a finger: where the button that opens the cards' sheet is. */
  function cardsRect(): Box {
    return [CARDS_AT.x, CARDS_AT.y, pen.width(WORDS.button.cards) + 14, CARDS_AT.h];
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    // a night sky's worth of quiet behind the park
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    drawPark();
    // under a finger there is no I key: the sheet of the cards has a button
    if (TOUCH && latest.view.phase !== "ended") button(cardsRect(), WORDS.button.cards, "", false, true);
    if (latest.view.phase === "choose") {
      if (peek) button(PEEK_RECT, WORDS.choice.seeCards, "", true, true);
      else drawChoice();
    }
    if (latest.frozen) {
      // the game's own clocks stand still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      const words = WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000));
      const plate = Math.max(160, pen.width(words) + 16);
      const middle = PARK_AREA.y + Math.round(PARK_AREA.h / 2);
      pen.px(Math.round(SCENE_W / 2 - plate / 2), middle - 9, plate, 17, C.ink);
      pen.txt(words, Math.round(SCENE_W / 2), middle - 7, C.boneD, "center");
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (view.phase === "pause") {
      const seconds = Math.ceil((left(latest.clock.next) ?? 0) / 1000);
      return [WORDS.standing.nextPark(view.round, seconds), C.teal];
    }
    const seconds = Math.ceil((left(latest.clock.turn) ?? 0) / 1000);
    const hurry = seconds <= TICK_FROM ? C.crim : C.amber;
    const who = view.turn === null ? "" : pen.fit(nickOf(view.turn), NAME_WIDTH);
    if (pending) return [WORDS.standing.sending, C.boneD];
    if (view.phase === "choose") {
      const which = view.choosing?.which ?? 0;
      if (choosing()) return [WORDS.standing.choose(which, seconds), hurry];
      return [WORDS.standing.chooseWait(which, seconds), C.bone];
    }
    if (picking()) return [WORDS.standing.pick(chosen, seconds), hurry];
    if (marking()) {
      const mine = me();
      const down = view.manholes.filter((manhole) => manhole.by === mine).length;
      return [WORDS.standing.mark(view.phase === "trees" ? "tree" : down === 0 ? "plus" : "minus", seconds), hurry];
    }
    if (laying()) {
      if (cutting) return [WORDS.standing.cut(cut.length, latest.rules.cutMax, seconds), hurry];
      return [WORDS.standing.lay(seconds), hurry];
    }
    const doing = view.phase === "pick" ? "pick" : view.phase === "manholes" ? "manholes" : view.phase === "trees" ? "trees" : "lay";
    return [WORDS.standing.other(me() === null, who, doing, seconds), C.bone];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    const names = (players: number[]): string => players.map((player) => pen.fit(nickOf(player), 40)).join(", ");
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), NAME_WIDTH) : "";
      if (event.type === "park") lines.push([WORDS.log.park(event.round), C.boneD]);
      else if (event.type === "choice") {
        for (const option of [1, 2] as const) {
          const those = event.chosen.filter((each) => each.option === option).map((each) => each.player);
          if (those.length === 0) continue;
          const label = OPTION_NAMES[event.which][option - 1];
          const whole = WORDS.log.took(label, names(those));
          // too many to name in one line: how many they are comes first, so that the line still says it where it is cut
          lines.push([pen.width(whole) <= PANEL_WIDTH ? whole : WORDS.log.tookMany(label, those.length, names(those)), C.brass]);
        }
      } else if (event.type === "pick") lines.push([WORDS.log.pick(who, event.tile, event.forced === true), C.bone]);
      else if (event.type === "pair") lines.push([WORDS.log.pair(names(event.players)), C.teal]);
      else if (event.type === "alone") lines.push([WORDS.log.alone(who), C.boneD]);
      else if (event.type === "manhole") lines.push([WORDS.log.manhole(who, event.value > 0), C.bone]);
      else if (event.type === "tree") lines.push([WORDS.log.tree(who), C.bone]);
      else if (event.type === "skip") lines.push([WORDS.log.skip(who, event.what === "tree"), C.boneD]);
      else if (event.type === "lay") lines.push([WORDS.log.lay(who, event.tile, event.cut, event.forced === true), C.teal]);
      else if (event.type === "fail") lines.push([WORDS.log.fail(who, event.tile), C.crim]);
      else if (event.type === "score") {
        for (const line of event.lines) lines.push([WORDS.log.score(pen.fit(nickOf(line.player), NAME_WIDTH), line.total), line.total > 0 ? C.teal : line.total < 0 ? C.crim : C.boneD]);
      } else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  /** The players in the order that matters now: of picking, of laying, or of their points once the game is over. */
  function listOrder(): number[] {
    if (latest === null) return [];
    const view = latest.view;
    if (view.phase === "ended") return [...view.players].sort((a, b) => b.score - a.score).map((player) => player.id);
    if (view.layOrder.length > 0) return view.layOrder;
    if (view.pickOrder.length > 0) return view.pickOrder;
    return view.players.map((player) => player.id);
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(view.rounds > 1 ? WORDS.panel.park(view.round, view.rounds) : WORDS.panel.game, x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null && view.phase !== "ended" && view.phase !== "pause") {
      const seconds = Math.ceil(turn / 1000);
      pen.txt(WORDS.panel.seconds(seconds), W - 5, 3, seconds <= TICK_FROM ? C.crim : C.boneD, "right");
    }
    const order = listOrder();
    const layout = panelLayout(order.length);
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      const right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((each) => each.id === player);
      const score = view.players.find((each) => each.id === player)?.score ?? 0;
      const tile = tileOfPlayer(player);
      const gone = info !== undefined && (info.left || !info.connected);
      const onTurn = view.turn === player;
      const laid = view.placed.some((placement) => placement.player === player);
      const failed = view.failed.includes(player);
      const chose = view.phase === "choose" && view.choosing?.chosen.includes(player) === true;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const nameColour = gone ? C.dim : me() === player ? C.amber : C.bone;
      const tileColour = optionOf(player, 6) === 1 ? C.crim : C.boneD;
      // a pair: the partner's colour beside their own
      const pair = view.pairs.find((each) => each.includes(player));
      const partner = pair === undefined ? null : pair[0] === player ? pair[1] : pair[0];
      if (layout.crowded) {
        // half the width: the colour, the name, the tile with a mark for how it went, the points
        if (onTurn) pen.px(ex - 1, y, layout.entryWidth + 1, 12, TURN_ROW);
        pen.px(ex, y + 2, 5, 8, grassOf(player));
        if (partner !== null) pen.px(ex, y + 7, 5, 3, grassOf(partner));
        const points = `${score}`;
        pen.txt(points, right, y, C.brass, "right");
        // the points keep room for two figures, so that the tiles stand under each other
        let end = right - Math.max(13, pen.width(points)) - 3;
        if (laid || failed || chose) {
          drawMark(end - 5, y + 4, laid ? "done" : failed ? "failed" : "chosen");
          end -= 7;
        }
        if (tile !== null) {
          pen.txt(`${tile}`, end, y, tileColour, "right");
          end -= pen.width(`${tile}`) + 2;
        }
        const room = end - (ex + 7) - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
        const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
        pen.txt(name, ex + 7, y, nameColour);
        if (voice !== "out") drawVoiceMark(pen, ex + 7 + pen.width(name) + 2, y, voice, time);
        return;
      }
      // the place in the priority, which decides between equals; then the colour of their grass
      pen.txt(`${view.players.findIndex((each) => each.id === player) + 1}`, ex, y, C.dim);
      pen.px(ex + 9, y + 2, 5, 8, grassOf(player));
      if (partner !== null) pen.px(ex + 9, y + 7, 5, 3, grassOf(partner));
      if (onTurn) pen.txt("▶", ex + 15, y, C.amber);
      const name = pen.fit(info?.nick ?? "", NAME_WIDTH);
      pen.txt(name, ex + 27, y, nameColour);
      if (voice !== "out") drawVoiceMark(pen, ex + 27 + pen.width(name) + 2, y, voice, time);
      if (tile !== null) pen.txt(WORDS.panel.tile(tile), ex + 112, y, tileColour, "right");
      if (laid) pen.txt(WORDS.panel.laid, ex + 117, y, C.teal);
      else if (failed) pen.txt(WORDS.panel.failed, ex + 117, y, C.crim);
      else if (view.phase === "choose") pen.txt(chose ? WORDS.panel.chose : "…", ex + 117, y, C.boneD);
      pen.txt(`${score}`, right, y, C.brass, "right");
    });
    pen.px(x, layout.crowded ? underList(layout) : 86, PANEL_WIDTH, 1, C.steelDD);
    const lines = logLines();
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      // the bubble is kept inside the scene: asked for at its right edge, it ends there
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /**
   * A mark five pixels square, its top left at `x`, `y`: a tick for a tile
   * laid, a cross for one that found no room, a dot for a choice made. In a
   * crowded list they stand for the words there is no room for.
   */
  function drawMark(x: number, y: number, what: "done" | "failed" | "chosen"): void {
    if (what === "chosen") {
      pen.px(x + 1, y + 1, 3, 3, C.boneD);
      return;
    }
    for (let i = 0; i < 5; i++) {
      if (what === "failed") {
        pen.px(x + i, y + i, 1, 1, C.crim);
        pen.px(x + 4 - i, y + i, 1, 1, C.crim);
      } else {
        // a short stroke down, then a longer one up to the right
        pen.px(x + i, y + (i < 2 ? 2 + i : 4 - i), 1, 2, C.teal);
      }
    }
  }

  function button(rect: Box, label: string, sub: string, lit_: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit_ ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit_ ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (sub === "") pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit_ ? C.amber : live ? C.bone : C.dim, "center");
    else {
      pen.txt(label, x + 5, y + 1, lit_ ? C.amber : live ? C.bone : C.dim);
      pen.txt(sub, x + 5, y + 13, live || lit_ ? C.boneD : C.dim);
    }
  }

  /** A tile drawn small, each cell `size` pixels. */
  function drawTile(tile: Tile, x: number, y: number, size: number, colour: string): void {
    for (const cell of tile.cells) {
      pen.px(x + cell.col * size, y + cell.row * size, size - 1, size - 1, cell.kind === "number" ? shade(colour, 1.35) : colour);
      // a hole, as large as a tile this small has room for
      if (cell.kind === "hole") pen.px(x + cell.col * size + 1, y + cell.row * size + 1, size - 3, size - 3, C.ink);
    }
  }

  /** The seven tiles along the bar: what each earns, how large it is, and who has picked it. */
  function drawTiles(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = picking();
    TILES.forEach((tile, index) => {
      const rect = tileRect(index);
      const [x, y, w, h] = rect;
      const picked = chosen === tile.number;
      const room = hasWay(view.park, view.placed, tile.number);
      pen.px(x, y, w, h, picked ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, picked ? "#3a2a12" : mine && inRect(mouse, rect) ? C.btnH : C.btn);
      drawTile(tile, x + 3, y + Math.floor((h - tile.rows * 5) / 2), 5, room ? "#6fcf5a" : C.dim);
      pen.txt(WORDS.tile.points(tile.number), x + 27, y + 1, picked ? C.amber : mine ? C.bone : C.boneD);
      pen.txt(room ? WORDS.tile.cells(tile.cells.length) : WORDS.tile.noRoom, x + 27, y + 14, room ? C.boneD : C.crim);
      // who has picked it, a mark each: in rows down the right of the button, clear of its words
      view.picks
        .filter((pick) => pick.tile === tile.number)
        .forEach((pick, at) => {
          pen.px(x + w - 5 - (at % PICK_MARKS_ROW) * 4, y + 3 + Math.floor(at / PICK_MARKS_ROW) * 4, 3, 3, grassOf(pick.player));
        });
    });
  }

  /** How `line` came about, in words: each part that is not nought. */
  function breakdown(line: ScoreLine): string {
    const said = WORDS.result;
    const parts = [line.laid ? said.tile(signed(line.tile)) : line.tile < 0 ? said.attackFailed(signed(line.tile)) : said.notLaid];
    if (line.manholes !== 0) parts.push(said.manholes(signed(line.manholes)));
    if (line.pair !== 0) parts.push(said.pair(signed(line.pair)));
    if (line.check !== 0) parts.push(said.check(signed(line.check)));
    return parts.join(" · ");
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const best = Math.max(...view.players.map((player) => player.score));
    const won = mine !== null && view.players.find((player) => player.id === mine)?.score === best;
    pen.txt(WORDS.result.verdict(mine !== null, won), 10, 234, mine === null ? C.bone : won ? C.teal : C.crim, "left", 24);
    // equal points share a place
    const ranked = [...view.players].sort((a, b) => b.score - a.score);
    const places = ranked.map((player) => WORDS.result.place(ranked.findIndex((other) => other.score === player.score) + 1, pen.fit(nickOf(player.id), 48), player.score));
    pen.txt(pen.fit(places.join("  "), 280), 96, 226, C.bone);
    const line = mine === null ? null : scoreOf(mine);
    const five = optionOf(mine, 5) === 1 ? `${WORDS.result.bonus(signed(latest.rules.scoreBonus))} · ` : "";
    pen.txt(pen.fit(line === null ? WORDS.result.over : `${five}${breakdown(line)}`, 280), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? WORDS.result.hostNext : WORDS.result.waitHost, 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, WORDS.button.again, "", true, true);
    button(LOBBY_RECT, WORDS.button.lobby, "", false, true);
  }

  function drawBar(): void {
    if (latest === null) return;
    pen.px(0, BAR_Y, W, H - BAR_Y, C.bar);
    pen.px(0, BAR_Y, W, 1, C.steelDD);
    const view = latest.view;
    if (view.phase === "ended") {
      drawResults();
      return;
    }
    const [words, colour] = standing();
    pen.txt(pen.fit(words, W - 12), 6, 225, colour);
    if (view.phase === "pick") {
      drawTiles();
      return;
    }
    // from the first choice on: the player's own tile, and how to do what is asked of them
    const mine = me();
    const number = mine === null ? null : tileOfPlayer(mine);
    const tile = number === null ? undefined : shapeOf(number, laying() ? cut : (view.placed.find((placement) => placement.player === mine)?.cut ?? []));
    if (tile !== undefined && mine !== null) {
      drawTile(turned(tile, hand?.turns ?? 0), 8, 240, 5, grassOf(mine));
      const six = optionOf(mine, 6);
      pen.txt(WORDS.hand.mine(tile.number, six === null ? null : OPTION_NAMES[6][six - 1]), 40, 240, C.bone);
    }
    if (view.phase === "choose") {
      pen.txt(WORDS.hand.cards, 40, 253, C.boneD);
    } else if (marking()) {
      pen.txt(WORDS.hand.mark, 40, 253, C.boneD);
    } else if (view.phase === "manholes" || view.phase === "trees") {
      pen.txt(WORDS.hand.marks, 40, 253, C.boneD);
    } else if (laying()) {
      // with 방어 the button for cutting takes the room the longer hint would
      pen.txt(defending() ? WORDS.hand.layCut : WORDS.hand.lay, 40, 253, C.boneD);
      if (defending()) button(CUT_RECT, cutting ? WORDS.button.cutDone : WORDS.button.cut, "", cutting, true);
      button(TURN_RECT, WORDS.button.turn, "", false, true);
      const ok = hand !== null && number !== null && fits(view.park, view.placed, number, hand.row, hand.col, hand.turns, { cut, trees: view.trees });
      button(LAY_RECT, WORDS.button.lay, "", ok && Math.sin(time * 5) > 0, ok);
    } else if (view.phase === "place") {
      pen.txt(WORDS.hand.order, 40, 253, C.boneD);
    } else if (mine !== null && view.failed.includes(mine)) {
      pen.txt(WORDS.hand.failed, 40, 253, C.crim);
    } else if (mine !== null && tile !== undefined && view.placed.some((placement) => placement.player === mine)) {
      pen.txt(WORDS.hand.scored(tile.number), 40, 253, C.teal);
    } else {
      pen.txt(WORDS.hand.worth, 40, 253, C.boneD);
    }
  }

  /** The sheet of the choices the player may see: those put to everyone so far, and those to come for a player who chose 정보. */
  function drawCards(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    pen.txt(WORDS.choice.sheet, 22, 16, C.amber);
    pen.txt(WORDS.choice.sheetClose, W - 22, 16, C.boneD, "right");
    // the first option starts clear of the choice's name, which is as long as the language makes it
    const first = Math.max(92, 22 + pen.width(WORDS.choice.name(8)) + 8);
    let y = 34;
    for (const which of CHOICES) {
      const met = view.choosing?.which === which || view.choices.some((each) => each.which === which);
      const ahead = view.preview.includes(which);
      const mine = optionOf(me(), which);
      pen.txt(WORDS.choice.name(which), 22, y, met || ahead ? C.bone : C.dim);
      if (!met && !ahead) {
        pen.txt(WORDS.choice.notYet, first, y, C.dim);
        y += 20;
        continue;
      }
      if (ahead) pen.txt(WORDS.choice.ahead, 22, y + 14, C.teal);
      for (const option of [1, 2] as const) {
        const x = option === 1 ? first : 288;
        pen.txt(`${option} ${OPTION_NAMES[which][option - 1]}`, x, y, mine === option ? C.amber : C.brass);
        cardLines(which, option).forEach((line, at) => pen.txt(line, x, y + 14 + at * 13, mine === option ? C.bone : C.boneD));
      }
      y += 56;
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help(rules.pickSeconds, rules.placeSeconds);
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      const colour = line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : line.tone === "mark" ? C.teal : C.bone;
      if (line.text !== "") pen.txt(line.text, 22, 20 + i * 15, colour);
    });
  }

  function draw(): void {
    pen.clear(C.night);
    if (latest === null) return;
    if (sheet === "help") {
      drawHelp();
      return;
    }
    if (sheet === "cards") {
      drawCards();
      return;
    }
    if (laying()) takeInHand();
    drawScene();
    drawPanel();
    drawBar();
  }

  // ---- The screen, the loop and the listeners ---------------------------------------------------------
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not for the game, and neither is one pressed on a button
    // the player has gone to with the keyboard: that key is the button's
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    startAudio();
    // an arrow held down goes on moving the tile; nothing else repeats
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code === "Backspace" || event.code.startsWith("Arrow")) event.preventDefault();
  };
  const unwatch = watchPointer(canvas, W, H, {
    move(p): void {
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.moved = true;
    },
    down(p): void {
      startAudio();
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.moved = true;
      clicks.push(p);
    },
    // a finger that has lifted points at nothing: the tile stays where it was carried to
    gone(): void {
      mouse.x = -1;
      mouse.y = -1;
    },
  });
  addEventListener("keydown", onKeyDown);

  let last = performance.now() / 1000;
  let owed = 0;
  function frame(): void {
    if (stopped) return;
    const now = performance.now() / 1000;
    // a stalled tab never fast-forwards the screen
    owed += Math.min(now - last, 0.25);
    last = now;
    let stepped = false;
    while (owed >= STEP) {
      step();
      owed -= STEP;
      stepped = true;
    }
    // nothing on the screen moves between two steps: a display faster than the screen's clock is not drawn the same picture twice
    if (stepped) draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // the pixel font comes with the page: draw again once it is in
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    refused(reason: string): void {
      pending = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      pending = false;
      offline = true;
    },
    setHost(value: boolean): void {
      host = value;
    },
    say(slot: number, text: string): void {
      if (latest === null) return;
      // someone watching has no place to speak from: their line is in the chat alone
      const player = latest.players.find((each) => each.id === slot && !each.bot && !each.left);
      if (player === undefined) return;
      speech.set(slot, { lines: speechLines(pen, text), t: speechSeconds(text) });
    },
    press(code: string): void {
      keys.push(code);
    },
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      unwatch();
    },
  };
}

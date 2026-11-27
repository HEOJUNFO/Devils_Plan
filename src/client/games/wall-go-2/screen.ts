/**
 * The screen of 벽바둑Ⅱ: the board with its counters and walls, whose
 * territory each square is as the walls stand, and what each player holds.
 *
 * Design: design/games/wall-go-2.md. The room decides everything; this
 * screen shows what it sends and asks it to place a counter, to move one,
 * or to place a wall. Nothing in the game is hidden, so where a counter can
 * go is worked out here by the rules the room holds it to (`rules.ts`).
 * Everything can be done with the pointer; the keys are another way to the
 * same.
 */
import {
  DIRS,
  canMove,
  counterAt,
  freeSides,
  movesOf,
  stepFrom,
  wallIndex,
  type Cell,
  type Dir,
  type Kind,
  type Move,
  type WallAction,
  type WallEvent,
} from "../../../shared/games/wall-go-2/rules";
import { wallWaits } from "../../../shared/waits";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a match of 벽바둑Ⅱ. */
export type WallMessage = Extract<ServerMessage, { type: "game"; game: "wall-go-2" }>;
type View = WallMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface WallHandlers {
  /** The player placed a counter, moved one, or placed a wall. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next match. */
  again(): boolean;
  /** Someone who is not the host would play one more; whether the room has that word of them now (`GameHandlers`). */
  wantAgain(): boolean;
  /** Whether the room's 탈락전 has put this browser's player out (`GameHandlers`). */
  out(): boolean;
  /** The match is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** The game has more players than the column lists one to a row, or no longer has. */
  crowded(crowded: boolean): void;
}

/** The game screen. */
export interface WallScreen {
  update(message: WallMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  /** What this player came out of the match with, once it is over (`GameScreen.verdict`). */
  verdict(): string | null;
  /** Whether the match waits on this player by the room's last word (`GameScreen.waits`, `src/shared/waits.ts`). */
  waits(): boolean;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** The board: its top left, and how many pixels its squares share. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 110;
const BOARD_Y = 29;
const BOARD_SPAN = 189;
/** What stands to the left of the board: how the counters go, and what each player holds. */
const SIDE_X = 6;
const LEGEND_Y = 34;
const HOLD_Y = 70;
const HOLD_PITCH = 15;
/** The colours of the players of a match, by their order in it, bright for their counters and walls and dim for their territory. Each counter has its player's number on it: the colour is a second sign. */
const PLAYER_COLOURS = ["#3fd0b6", "#ffb43c", "#c58cf2"];
const PLAYER_DIM = ["#143a37", "#43300f", "#30244a"];
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another match: the host may have been pressing Enter for a wall. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** Seconds a wall just placed and a counter just moved are marked out. */
const FLASH = 1.6;

/** The buttons of the bar. */
const kindButton = (index: number): Box => [6 + index * 104, 238, 100, 28];
const BREAKER_RECT: Box = [386, 238, 90, 28];
const CONFIRM_RECT: Box = [282, 238, 100, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
const KINDS: readonly Kind[] = ["square", "round"];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** A disc `size` pixels across, as the runs of pixels of each of its rows; worked out once for each size. */
const discs = new Map<number, [row: number, from: number, width: number][]>();
function discOf(size: number): [row: number, from: number, width: number][] {
  const kept = discs.get(size);
  if (kept !== undefined) return kept;
  const runs: [number, number, number][] = [];
  for (let row = 0; row < size; row++) {
    const y = (row + 0.5) / size - 0.5;
    const half = Math.sqrt(Math.max(0, 0.25 - y * y));
    const from = Math.round((0.5 - half) * size);
    const to = Math.round((0.5 + half) * size);
    if (to > from) runs.push([row, from, to - from]);
  }
  discs.set(size, runs);
  return runs;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link WallScreen.update}. */
export function createWallScreen(canvas: HTMLCanvasElement, handlers: WallHandlers): WallScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: WallMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the match's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next match and the room has not answered yet. */
  let starting = false;
  /** The match as the room last sent it: what is shown again if a move drawn ahead of the room is refused. */
  let truth: WallMessage | null = null;
  /**
   * The player's own move on its way to the room, as the change it makes to what the room sent. It is drawn
   * at once, drawn again over whatever the room sends before its answer, and dropped when the answer comes
   * or the move is refused (as in the screen of 무거운 13).
   */
  let ahead: ((view: View) => View) | null = null;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The kind of counter to place next, where the player has both left. */
  let kind: Kind | null = null;
  /** The counter picked to move (or, with none that can move, to place a wall beside), by its place in the board's list. */
  let picked: number | null = null;
  /** The wall breaker is asked for: the squares shown are those behind a wall. */
  let armed = false;
  /** A move through a wall, shown before it is made: where to, and which of the ways there. */
  let breaking: { to: Cell; way: number } | null = null;
  /** The side pointed at with the keys for a wall, before it is placed. */
  let side: Dir | null = null;
  /** The square the keys point at; `null` until a key has moved it, and again after a press of the pointer. */
  let cursor: Cell | null = null;
  /** The wall placed last and the square moved to last, and `time` when: marked out for a moment. */
  let lastWall: { cell: Cell; side: Dir; at: number } | null = null;
  let lastMove: { cell: Cell; at: number } | null = null;
  /** `time` when the match on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed. */
  const keys: string[] = [];
  const clicks: Press[] = [];
  const mouse = { x: -1, y: -1 };
  let stopped = false;

  // ---- What the latest message means ---------------------------------------------------------------
  const nickOf = (player: number): string => latest?.players.find((each) => each.id === player)?.nick ?? "";
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const me = (): number | null => latest?.view.you ?? null;
  /** A player's number as their counters show it, from 1, and their colours. */
  const numberOf = (view: View, player: number): number => view.players.indexOf(player) + 1;
  const colourOf = (view: View, player: number): string => PLAYER_COLOURS[view.players.indexOf(player)] ?? C.bone;
  const dimOf = (view: View, player: number): string => PLAYER_DIM[view.players.indexOf(player)] ?? C.btn;
  /** Whether the turn is this screen's player's, and the match is going. */
  const myTurn = (): boolean => latest !== null && !latest.frozen && latest.view.you !== null && latest.view.turn === latest.view.you;
  /** Whether this player's turn is one on which none of their counters can move: only a wall is placed. */
  const stuck = (): boolean => myTurn() && latest!.view.phase === "move" && !canMove(latest!.view, latest!.view.you as number, latest!.rules.squareReach);
  /** Whether this player can still break a wall in this game. */
  const hasBreaker = (view: View): boolean => view.breaking && view.you !== null && !view.breakers.includes(view.you);
  /** The counter a wall is to be placed beside now, by its place in the list: the one just moved, or the one picked by a player who cannot move. */
  function walling(): number | null {
    if (latest === null || !myTurn()) return null;
    if (latest.view.phase === "wall") return latest.view.moved;
    return stuck() ? picked : null;
  }

  /** How many pixels a square of the board takes, its line included. */
  const pitchOf = (view: View): number => Math.floor(BOARD_SPAN / view.size);
  /** The inside of a square, without the lines round it. */
  function cellBox(view: View, cell: Cell): Box {
    const pitch = pitchOf(view);
    return [BOARD_X + cell.x * pitch + 1, BOARD_Y + cell.y * pitch + 1, pitch - 1, pitch - 1];
  }
  /** The square under (`x`, `y`) of the frame; `null` off the board. */
  function cellAt(view: View, x: number, y: number): Cell | null {
    const pitch = pitchOf(view);
    const cell = { x: Math.floor((x - BOARD_X) / pitch), y: Math.floor((y - BOARD_Y) / pitch) };
    return cell.x >= 0 && cell.y >= 0 && cell.x < view.size && cell.y < view.size ? cell : null;
  }

  /** The ways the counter picked can go: with the wall breaker asked for, those through a wall; else those through none. */
  function waysOf(view: View): Move[] {
    if (picked === null) return [];
    return movesOf(view, picked, latest?.rules.squareReach ?? 1).filter((move) => move.breaks === armed);
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Puts away whatever was picked and not sent. */
  function clearPicks(): void {
    picked = null;
    armed = false;
    breaking = null;
    side = null;
  }

  /** Shows one thing that happened: a sound, a mark on the board, a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: WallEvent): void {
    const mine = me();
    if (event.type === "stage") {
      if (event.stage > 1) sfx.turn();
    } else if (event.type === "placed") {
      lastMove = { cell: { x: event.x, y: event.y }, at: time };
      if (event.player !== mine) sfx.chip();
      else if (event.forced) say(WORDS.say.placedForYou);
    } else if (event.type === "moved") {
      lastMove = { cell: event.to, at: time };
      if (event.broke) {
        say(WORDS.say.breakerUsed(nickOf(event.player)));
        sfx.swap();
      } else if (event.player !== mine) sfx.move();
    } else if (event.type === "wall") {
      lastWall = { cell: { x: event.x, y: event.y }, side: event.side, at: time };
      if (event.player !== mine) sfx.pick();
      else if (event.forced) say(WORDS.say.wallForYou);
    } else if (event.type === "scored") sfx.chip();
    else if (event.type === "ended") {
      const own = latest?.view.places?.find((each) => each.player === mine);
      if (own !== undefined && own.place === 1) sfx.win();
      else sfx.turn();
    }
  }

  /** Sends the player's move and, if it went, draws it at once as `change` makes it (see `ahead`). */
  function sendAhead(action: WallAction, change: (view: View) => View): void {
    pending = handlers.act(action);
    if (!pending) return say(WORDS.notSent);
    if (latest === null) return;
    ahead = change;
    latest = { ...latest, view: change(latest.view) };
  }

  /** Takes back a move drawn ahead of the room: the match is shown as the room last sent it. */
  function takeBack(): void {
    ahead = null;
    if (truth !== null) latest = truth;
  }

  /** Asks the room for the next match, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: WallMessage): void {
    // the next match has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a match met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      clearPicks();
      kind = null;
      cursor = null;
      lastWall = null;
      lastMove = null;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // The room marks the match it sends in answer to this page's move. What it sends meanwhile leaves this
    // one on its way; a match that has gone on to another step or another turn waits for nothing.
    const moved = truth === null || truth.view.phase !== message.view.phase || truth.view.turn !== message.view.turn || truth.view.stage !== message.view.stage;
    const answered = message.answer === true || fresh || moved;
    const waited = myTurn();
    // what was picked and not sent does not carry over to another step
    if (!fresh && moved) clearPicks();
    truth = message;
    if (answered) ahead = null;
    // a move still on its way is drawn over what the room sends meanwhile, which does not have it yet
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    if (answered) pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    if (kind !== null && !latest.view.toPlace.includes(kind)) kind = null;
    // the match has come to wait on this player: their turn has begun
    if (!waited && myTurn() && !fresh) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Places a counter of the kind chosen on `cell`. */
  function placeOn(cell: Cell): void {
    if (latest === null) return;
    const view = latest.view;
    if (counterAt(view, cell) >= 0) return deny(WORDS.say.pickEmpty);
    const placed = kind ?? view.toPlace[0];
    if (placed === undefined) return;
    const mine = me() as number;
    sendAhead({ type: "place", kind: placed, x: cell.x, y: cell.y }, (now) =>
      now.phase !== "place" || now.turn !== mine || counterAt(now, cell) >= 0 ? now : { ...now, counters: [...now.counters, { player: mine, kind: placed, x: cell.x, y: cell.y }] },
    );
    if (pending) {
      kind = null;
      sfx.chip();
    }
  }

  /** Moves the counter picked along `move`, breaking the wall in its way where it has one. */
  function go(move: Move): void {
    if (latest === null || picked === null) return;
    const index = picked;
    const from = latest.view.counters[index];
    const mine = me() as number;
    sendAhead({ type: "move", from: { x: from.x, y: from.y }, path: move.path, breaker: move.breaks }, (now) => {
      const counter = now.counters[index];
      if (now.phase !== "move" || now.turn !== mine || counter === undefined || counter.x !== from.x || counter.y !== from.y) return now;
      const walls = [...now.walls];
      let at: Cell = { x: from.x, y: from.y };
      for (const dir of move.path) {
        const slot = wallIndex(now, at, dir);
        if (slot !== null) walls[slot] = 0;
        at = stepFrom(at, dir);
      }
      return {
        ...now,
        walls,
        counters: now.counters.map((each, nth) => (nth === index ? { ...each, x: move.to.x, y: move.to.y } : each)),
        phase: "wall",
        moved: index,
        breakers: move.breaks ? [...now.breakers, mine] : now.breakers,
      };
    });
    if (pending) {
      clearPicks();
      sfx.move();
    }
  }

  /** Places a wall on `on` of the counter a wall is due beside. */
  function build(on: Dir): void {
    const index = walling();
    if (latest === null || index === null) return;
    const view = latest.view;
    const counter = view.counters[index];
    if (!freeSides(view, counter).includes(on)) return deny(WORDS.say.wallThere);
    const mine = me() as number;
    const cell = { x: counter.x, y: counter.y };
    const action: WallAction = view.phase === "wall" ? { type: "wall", side: on } : { type: "wall", side: on, at: cell };
    sendAhead(action, (now) => {
      const slot = wallIndex(now, cell, on);
      if (slot === null || now.turn !== mine || now.walls[slot] !== 0) return now;
      const walls = [...now.walls];
      walls[slot] = mine + 1;
      return { ...now, walls };
    });
    if (pending) {
      clearPicks();
      sfx.pick();
    }
  }

  /** Turns the wall breaker on or off for the move being picked. */
  function arm(): void {
    if (latest === null || !myTurn() || latest.view.phase !== "move" || stuck()) return;
    const view = latest.view;
    if (!view.breaking) return deny(WORDS.say.noBreaker);
    if (!hasBreaker(view)) return deny(WORDS.say.breakerGone);
    armed = !armed;
    breaking = null;
    sfx.move();
  }

  /** The ways through a wall to the square being shown, and the one of them that is. */
  function breakingWays(view: View): Move[] {
    if (breaking === null) return [];
    const to = breaking.to;
    return waysOf(view).filter((move) => sameCell(move.to, to));
  }

  /** Makes the move through a wall that is shown. */
  function confirmBreak(): void {
    if (latest === null || breaking === null) return;
    const ways = breakingWays(latest.view);
    const move = ways[breaking.way % Math.max(1, ways.length)];
    if (move !== undefined) go(move);
  }

  /** A square of the board was pressed, or Enter with the keys pointing at it. */
  function pressCell(cell: Cell): void {
    if (latest === null || !myTurn() || pending) return;
    const view = latest.view;
    const mine = me() as number;
    if (view.phase === "place") return placeOn(cell);
    if (view.phase !== "move") return;
    const at = counterAt(view, cell);
    if (at >= 0 && view.counters[at].player === mine) {
      // one of the player's own counters: picked, or put back
      picked = picked === at ? null : at;
      breaking = null;
      side = null;
      sfx.move();
      return;
    }
    if (picked === null) return deny(WORDS.say.notYours);
    if (stuck()) return;
    const ways = waysOf(view).filter((move) => sameCell(move.to, cell));
    if (ways.length === 0) {
      const other = movesOf(view, picked, latest.rules.squareReach).some((move) => sameCell(move.to, cell));
      return deny(armed ? WORDS.refused["nothing-to-break"] : other ? WORDS.refused["wall-in-the-way"] : WORDS.say.cantGo);
    }
    if (!armed) return go(ways[0]);
    // through a wall: shown first; pressed again it is made, or with two ways there, the other is shown
    if (breaking !== null && sameCell(breaking.to, cell)) {
      if (ways.length === 1) return confirmBreak();
      breaking = { to: cell, way: (breaking.way + 1) % ways.length };
    } else breaking = { to: cell, way: 0 };
    sfx.move();
  }

  /** A press of the pointer on the board while a wall is due: the side of the counter it is nearest to. */
  function sideAt(view: View, index: number, p: { x: number; y: number }): Dir | null {
    const [x, y, w] = cellBox(view, view.counters[index]);
    const dx = p.x - (x + w / 2);
    const dy = p.y - (y + w / 2);
    const far = Math.max(Math.abs(dx), Math.abs(dy));
    if (far < 5 || far > pitchOf(view) * 1.5) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: Box, finger?: Reach): boolean => clicks.some((p) => hits(p, rect, finger));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    // (results that were under the sheet are up from now: their buttons wait as they do when a match ends in sight)
    if (was && !help && latest.view.phase === "ended") endedAt = time;
    if (help || was) return;

    const view = latest.view;
    if (view.phase === "ended") {
      // (the two buttons take no press in the first moment the results are up: `RESULTS_PRESS_HOLD`)
      const pressable = time - endedAt >= RESULTS_PRESS_HOLD;
      if (pressed("Escape") || (pressable && clicked(LOBBY_RECT, LOBBY_REACH))) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && pressable && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (!myTurn() || pending) return;

    // the keys
    for (const code of keys) {
      const arrow: Dir | null = code === "ArrowUp" ? "up" : code === "ArrowRight" ? "right" : code === "ArrowDown" ? "down" : code === "ArrowLeft" ? "left" : null;
      const due = walling();
      if (arrow !== null && due !== null) {
        // a wall is due: the arrows point at a side of the counter
        if (freeSides(view, view.counters[due]).includes(arrow)) {
          side = arrow;
          sfx.move();
        } else deny(WORDS.say.wallThere);
      } else if (arrow !== null) {
        if (cursor === null) {
          const own = view.counters.find((each) => each.player === view.you);
          cursor = own !== undefined ? { x: own.x, y: own.y } : { x: Math.floor(view.size / 2), y: Math.floor(view.size / 2) };
        } else {
          const next = stepFrom(cursor, arrow);
          if (next.x >= 0 && next.y >= 0 && next.x < view.size && next.y < view.size) cursor = next;
        }
      } else if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
        if (due !== null && side !== null) build(side);
        else if (breaking !== null) confirmBreak();
        else if (cursor !== null) pressCell(cursor);
      } else if (code === "Escape") clearPicks();
      else if (code === "KeyB") arm();
      else if (view.phase === "place" && (code === "Digit1" || code === "Numpad1" || code === "Digit2" || code === "Numpad2")) {
        const wanted = KINDS[code.endsWith("1") ? 0 : 1];
        if (view.toPlace.includes(wanted)) {
          kind = wanted;
          sfx.move();
        }
      }
      if (pending) return;
    }

    // the pointer
    for (const p of clicks) {
      if (pending) return;
      if (view.phase === "place") {
        KINDS.forEach((each, index) => {
          if (view.toPlace.length > 1 && hits(p, kindButton(index)) && kind !== each) {
            kind = each;
            sfx.move();
          }
        });
      }
      if (view.phase === "move" && view.breaking && !stuck()) {
        if (hits(p, BREAKER_RECT)) {
          arm();
          continue;
        }
        if (breaking !== null && hits(p, CONFIRM_RECT)) {
          confirmBreak();
          continue;
        }
      }
      if (p.y >= BAR_Y || p.x >= SCENE_W) continue;
      cursor = null;
      const cell = cellAt(view, p.x, p.y);
      const due = walling();
      if (due !== null) {
        // a wall is due: a press beside the counter places it; a player who cannot move may first pick another counter
        const own = cell === null ? -1 : counterAt(view, cell);
        if (view.phase === "move" && own >= 0 && own !== due && view.counters[own].player === view.you) pressCell(cell as Cell);
        else {
          const on = sideAt(view, due, p);
          if (on !== null) build(on);
        }
      } else if (cell !== null) pressCell(cell);
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null && truth !== null) {
      // what happened is told by the room's own word, not by a move drawn ahead of it
      const view = truth.view;
      const fresh = Math.min(view.events - seen, view.history.length);
      seen = view.events;
      for (const event of fresh > 0 ? view.history.slice(-fresh) : []) show(event);
      // my own time is nearly up: a tick a second
      const mine = myTurn() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > HURRY_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    const x = Math.round(BOARD_X + BOARD_SPAN / 2 - width / 2);
    pen.px(Math.max(2, x), y, Math.min(width, SCENE_W - 4), 17, C.ink);
    pen.txt(pen.fit(words, SCENE_W - 12), Math.max(2, x) + Math.round(Math.min(width, SCENE_W - 4) / 2), y + 2, colour, "center");
  }

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** A counter with its middle at (`cx`, `cy`): a block for a square one, a disc for a round one, `size` pixels across. */
  function drawCounter(counterKind: Kind, cx: number, cy: number, size: number, colour: string, edge: string): void {
    const half = Math.floor(size / 2);
    if (counterKind === "square") {
      pen.px(cx - half, cy - half, size, size, edge);
      pen.px(cx - half + 1, cy - half + 1, size - 2, size - 2, colour);
      return;
    }
    for (const [row, from, width] of discOf(size + 2)) pen.px(cx - half - 1 + from, cy - half - 1 + row, width, 1, edge);
    for (const [row, from, width] of discOf(size)) pen.px(cx - half + from, cy - half + row, width, 1, colour);
  }

  /** The wall on `on` of `cell`, as a bar over the line between two squares. */
  function wallBar(view: View, cell: Cell, on: Dir, colour: string, thick = 3): void {
    const pitch = pitchOf(view);
    const x = BOARD_X + cell.x * pitch;
    const y = BOARD_Y + cell.y * pitch;
    const back = Math.floor(thick / 2);
    if (on === "up") pen.px(x, y - back, pitch + 1, thick, colour);
    else if (on === "down") pen.px(x, y + pitch - back, pitch + 1, thick, colour);
    else if (on === "left") pen.px(x - back, y, thick, pitch + 1, colour);
    else pen.px(x + pitch - back, y, thick, pitch + 1, colour);
  }

  function drawBoard(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const pitch = pitchOf(view);
    const span = pitch * view.size;
    const turn = myTurn() && !pending;
    // the edge of the board is a wall from the start
    pen.px(BOARD_X - 2, BOARD_Y - 2, span + 5, span + 5, C.steel);
    pen.px(BOARD_X, BOARD_Y, span + 1, span + 1, C.steelDD);
    const over = turn && mouse.x >= 0 ? cellAt(view, mouse.x, mouse.y) : null;
    const due = walling();
    const ways = turn && view.phase === "move" && due === null ? waysOf(view) : [];
    for (let y = 0; y < view.size; y++) {
      for (let x = 0; x < view.size; x++) {
        const cell = { x, y };
        const [bx, by, bw] = cellBox(view, cell);
        const owner = view.owners[y * view.size + x];
        const lit = over !== null && sameCell(over, cell) && due === null;
        pen.px(bx, by, bw, bw, owner !== null ? dimOf(view, owner) : lit ? C.btnH : C.btn);
        if (owner !== null && lit) pen.px(bx, by, bw, 1, C.steel);
      }
    }
    // where the counter picked can go
    for (const move of ways) {
      const [bx, by, bw] = cellBox(view, move.to);
      const shown = breaking !== null && sameCell(breaking.to, move.to);
      const size = shown ? 8 : 6;
      pen.px(bx + Math.floor((bw - size) / 2), by + Math.floor((bw - size) / 2), size, size, move.breaks ? C.crim : C.bone);
    }
    // the walls, in the colour of whoever placed them
    for (let y = 0; y < view.size; y++) {
      for (let x = 0; x < view.size; x++) {
        for (const on of ["right", "down"] as const) {
          const slot = wallIndex(view, { x, y }, on);
          const held = slot === null ? 0 : view.walls[slot];
          if (held === 0) continue;
          const fresh = lastWall !== null && time - lastWall.at < FLASH && wallIndex(view, lastWall.cell, lastWall.side) === slot;
          wallBar(view, { x, y }, on, fresh && Math.floor(time * 6) % 2 === 0 ? C.bone : colourOf(view, held - 1));
        }
      }
    }
    // the wall a move being shown would break
    if (breaking !== null && picked !== null) {
      const waysThere = breakingWays(view);
      const move = waysThere[breaking.way % Math.max(1, waysThere.length)];
      let at: Cell = { x: view.counters[picked].x, y: view.counters[picked].y };
      for (const dir of move?.path ?? []) {
        const slot = wallIndex(view, at, dir);
        if (slot !== null && view.walls[slot] !== 0) wallBar(view, at, dir, Math.floor(time * 4) % 2 === 0 ? C.crim : C.crimD, 5);
        at = stepFrom(at, dir);
      }
    }
    // the sides a wall can be placed on
    if (due !== null && turn) {
      const counter = view.counters[due];
      const free = freeSides(view, counter);
      const hover = mouse.x >= 0 && mouse.y < BAR_Y && mouse.x < SCENE_W ? sideAt(view, due, mouse) : null;
      for (const on of DIRS) {
        if (!free.includes(on)) continue;
        const chosen = side === on || (side === null && hover === on);
        wallBar(view, counter, on, chosen ? C.bone : C.boneD, chosen ? 3 : 1);
      }
    }
    // the counters
    view.counters.forEach((counter, index) => {
      const [bx, by, bw] = cellBox(view, counter);
      const cx = bx + Math.floor(bw / 2);
      const cy = by + Math.floor(bw / 2);
      const size = Math.max(9, bw - 9);
      const chosen = index === picked || (view.phase === "wall" && index === view.moved);
      const moved = lastMove !== null && time - lastMove.at < FLASH && sameCell(lastMove.cell, counter);
      drawCounter(counter.kind, cx, cy, size, colourOf(view, counter.player), chosen || moved ? C.bone : C.ink);
      pen.txt(`${numberOf(view, counter.player)}`, cx + 1, cy - 6, C.ink, "center");
      // a counter of this player's that can be picked now has a mark at its corner
      if (turn && view.phase === "move" && counter.player === mine && picked === null) pen.px(bx + bw - 4, by + 1, 3, 3, C.bone);
    });
    // the square the keys point at
    if (cursor !== null && turn && due === null) {
      const [bx, by, bw] = cellBox(view, cursor);
      for (const [dx, dy] of [[0, 0], [bw - 5, 0], [0, bw - 1], [bw - 5, bw - 1]]) pen.px(bx + dx, by + dy, 5, 1, C.bone);
      for (const [dx, dy] of [[0, 0], [bw - 1, 0], [0, bw - 5], [bw - 1, bw - 5]]) pen.px(bx + dx, by + dy, 1, 5, C.bone);
    }
  }

  /** To the left of the board: how each kind of counter goes, and what each player of the game holds. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    KINDS.forEach((each, index) => {
      const y = LEGEND_Y + index * 15;
      drawCounter(each, SIDE_X + 5, y + 6, 9, C.boneD, C.ink);
      pen.txt(pen.fit(WORDS.legend[each], 86), SIDE_X + 14, y, C.boneD);
    });
    pen.txt(WORDS.legend.territory, SIDE_X, HOLD_Y, C.dim);
    view.scores.forEach((score, at) => {
      const y = HOLD_Y + 14 + at * HOLD_PITCH;
      pen.px(SIDE_X, y + 1, 11, 12, colourOf(view, score.player));
      pen.txt(`${numberOf(view, score.player)}`, SIDE_X + 6, y, C.ink, "center");
      pen.txt(WORDS.squares(score.total), SIDE_X + 16, y, score.player === me() ? C.amber : C.bone);
      // a wall breaker not yet used
      if (view.breaking && !view.breakers.includes(score.player)) pen.px(SIDE_X + 86, y + 4, 6, 6, C.crim);
    });
    if (view.breaking) {
      const y = HOLD_Y + 14 + view.scores.length * HOLD_PITCH + 6;
      pen.px(SIDE_X, y + 4, 6, 6, C.crim);
      pen.txt(pen.fit(WORDS.legend.breaker, 84), SIDE_X + 10, y, C.dim);
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawSide();
    drawBoard();
    if (latest.frozen && view.phase !== "ended") {
      // the match's own clock stands still; this one runs, and ends the match at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 100, C.boneD);
    } else if (view.phase === "between") {
      const first = view.results.at(-1)?.scores.find((score) => score.place === 1);
      if (first !== undefined) plate(WORDS.between(pen.fit(nickOf(first.player), NAME_WIDTH), first.total), 100, C.amber);
    }
  }

  /** The words for where the match stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    if (view.phase === "between") return [WORDS.standing.between(Math.ceil((ms ?? 0) / 1000)), C.bone];
    const who = pen.fit(nickOf(view.turn ?? -1), NAME_WIDTH);
    if (!myTurn()) {
      if (view.phase === "place") return [WORDS.standing.placeOther(who, clock), C.bone];
      return [view.phase === "wall" ? WORDS.standing.wallOther(who, clock) : WORDS.standing.moveOther(who, clock), C.bone];
    }
    if (pending) return [WORDS.standing.sending, C.boneD];
    if (view.phase === "place") return [WORDS.standing.place(WORDS.kind[kind ?? view.toPlace[0] ?? "square"], clock), C.amber];
    if (walling() !== null) return side !== null ? [WORDS.standing.wallReady(WORDS.side[side], clock), C.amber] : [view.phase === "wall" ? WORDS.standing.wall(clock) : WORDS.standing.stuck(clock), C.amber];
    if (stuck()) return [WORDS.standing.stuck(clock), C.amber];
    if (breaking !== null) return [WORDS.standing.breakerReady(clock, breakingWays(view).length), C.crim];
    if (armed) return [WORDS.standing.breaker(clock), C.crim];
    return [picked === null ? WORDS.standing.move(clock) : WORDS.standing.moveTo(clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.stage, view.stages, view.mode === "three"), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM && view.phase !== "between" ? C.crim : C.boneD, "right");
    // while the match is played the players stand in the order of their numbers; at its end, of their places
    const order = view.places !== null ? view.places.map((each) => each.player) : view.players;
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = view.places?.find((each) => each.player === player)?.place;
      const score = view.scores.find((each) => each.player === player);
      // whose turn it is
      if (view.turn === player) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      pen.px(ex, y + 1, 11, 12, colourOf(view, player));
      pen.txt(`${numberOf(view, player)}`, ex + 6, y, C.ink, "center");
      const nameX = ex + 15;
      const words = place !== undefined ? WORDS.result.verdict(true, place) : score !== undefined ? WORDS.squares(score.total) : WORDS.safe;
      pen.txt(words, right, y, place !== undefined ? C.brass : C.boneD, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, nameX, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    for (const event of view.history) {
      const who = "player" in event ? pen.fit(nickOf(event.player), LOG_NAME) : "";
      if (event.type === "stage") lines.push([WORDS.log.stage(event.stage, event.mode === "three"), C.amber]);
      else if (event.type === "placed") lines.push([WORDS.log.placed(who, WORDS.kind[event.kind]), C.boneD]);
      else if (event.type === "moved") lines.push(event.broke ? [WORDS.log.broke(who), C.crim] : [WORDS.log.moved(who, WORDS.kind[event.kind]), C.boneD]);
      else if (event.type === "wall") lines.push([event.forced ? WORDS.log.wallForced(who) : WORDS.log.wall(who), C.boneD]);
      else if (event.type === "passed") lines.push([WORDS.log.passed(who), C.dim]);
      else if (event.type === "scored") {
        for (const each of view.results.find((result) => result.stage === event.stage)?.scores ?? []) lines.push([WORDS.log.scored(pen.fit(nickOf(each.player), LOG_NAME), each.total), C.bone]);
      } else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** What this player came out of the match with, in the word the results lead with; `null` while it is being played, for someone who watched, and for a match cut short. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    const own = latest.view.places.find((each) => each.player === mine);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const places = view.places ?? [];
    const own = mine === null ? undefined : places.find((each) => each.player === mine);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own !== undefined && own.place === 1 ? C.teal : C.bone, "left", 24);
    let named = "";
    for (const each of places) {
      const one = WORDS.result.place(each.place, pen.fit(nickOf(each.player), 50));
      const longer = named === "" ? one : `${named} · ${one}`;
      if (pen.width(longer) > RESULT_WIDTH) break;
      named = longer;
    }
    pen.txt(named, 96, 226, C.bone);
    const how = view.ended === null ? "" : WORDS.ended[view.ended];
    const rounds = mine === null ? [] : view.results.flatMap((result) => result.scores.filter((score) => score.player === mine).map((score) => ({ stage: result.stage, squares: score.total })));
    pen.txt(pen.fit(own === undefined || rounds.length === 0 ? how : WORDS.result.mine(rounds), RESULT_WIDTH), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(pen.fit(note, RESULT_WIDTH), 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
    // (dim while they take no press yet: `RESULTS_PRESS_HOLD`)
    const pressable = time - endedAt >= RESULTS_PRESS_HOLD;
    if (host) button(AGAIN_RECT, WORDS.button.again, !starting && pressable, !starting && pressable);
    button(LOBBY_RECT, WORDS.button.lobby, false, pressable);
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
    // which keys open the rules and mute the sound; under a finger, where the menu that does is
    const idle = TOUCH ? PAGE.menu.hint : WORDS.keys.idle;
    if (me() === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    if (!myTurn()) {
      pen.txt(idle, 6, 240, C.dim);
      return;
    }
    const live = !pending;
    const keysLine = TOUCH ? PAGE.menu.hint : WORDS.keys.board;
    if (view.phase === "place" && view.toPlace.length > 1) {
      KINDS.forEach((each, index) => {
        const rect = kindButton(index);
        const lit = live && (kind ?? view.toPlace[0]) === each;
        button(rect, "", lit, live);
        drawCounter(each, rect[0] + 12, rect[1] + 14, 11, lit ? C.amber : C.boneD, C.ink);
        pen.txt(pen.fit(WORDS.button.kind(`${index + 1}`, WORDS.kind[each]), rect[2] - 26), rect[0] + 22, rect[1] + 7, lit ? C.amber : live ? C.bone : C.dim);
      });
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.place, W - 222), 216, 246, C.dim);
      return;
    }
    if (view.phase === "move" && view.breaking && !stuck()) {
      const can = hasBreaker(view) && live;
      button(BREAKER_RECT, armed ? WORDS.button.breakerOff : WORDS.button.breaker, armed, can);
      if (breaking !== null) button(CONFIRM_RECT, WORDS.button.confirm, true, live);
      if (breaking === null) pen.txt(pen.fit(keysLine, BREAKER_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    pen.txt(pen.fit(!TOUCH && walling() !== null ? WORDS.keys.wall : keysLine, W - 12), 6, 246, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help({
      squares: latest.view.size * latest.view.size,
      reach: latest.rules.squareReach,
      three: latest.rules.countersOfThree,
      two: latest.rules.countersOfTwo,
      turnSeconds: latest.view.turnSeconds,
    });
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(line.text, 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : C.bone);
    });
  }

  function draw(): void {
    pen.clear(C.night);
    if (latest === null) return;
    if (help) {
      drawHelp();
      return;
    }
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
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace") event.preventDefault();
  };
  const unwatch = watchPointer(canvas, W, H, {
    move(p): void {
      mouse.x = p.x;
      mouse.y = p.y;
    },
    down(p): void {
      startAudio();
      mouse.x = p.x;
      mouse.y = p.y;
      clicks.push(p);
    },
    // a pointer that has left the screen, or a finger that has lifted, is over none of its buttons
    gone(): void {
      mouse.x = -1;
      mouse.y = -1;
    },
  });
  addEventListener("keydown", onKeyDown);

  let last = performance.now() / 1000;
  let owed = 0;
  function loop(): void {
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
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // the pixel font comes with the page: draw again once it is in
  void pixelFont();

  return {
    update,
    verdict,
    // by the room's last word, not by a move of this page's still on its way; a match that stands still waits on no one
    waits: (): boolean => truth !== null && !truth.frozen && wallWaits(truth.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      takeBack();
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      pending = false;
      // whether the move reached the room is not known: the match the room sends on coming back will say
      takeBack();
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

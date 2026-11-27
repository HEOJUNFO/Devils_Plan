/**
 * The screen of 신의 시험: the player's own board of seven squares by seven,
 * the tiles not yet on it, and what each line adds up to.
 *
 * Design: design/games/divine-test.md. The room decides everything; this
 * screen shows what it sends and asks it to lay a tile or take one back.
 * Nobody else's board is sent, so nothing hidden is here to be drawn: of
 * the others the screen has how many tiles they have laid and how many of
 * their lines are right.
 *
 * A tile is laid on the screen as soon as it is asked for, by the same
 * function the room lays it by (`layOn` of `rules.ts`), and the board the
 * room sends is taken again once it has answered everything asked: a
 * player lays forty-eight tiles, and does not wait on the room for each.
 * Everything can be done with the pointer; the keys are another way to the
 * same.
 */
import { layOn, linesOf, magicOf, type DivineAction, type DivineEvent } from "../../../shared/games/divine-test/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { divineWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 신의 시험. */
export type DivineMessage = Extract<ServerMessage, { type: "game"; game: "divine-test" }>;

/** What the screen asks of whoever owns the connection. */
export interface DivineHandlers {
  /** The player laid a tile or took one back. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
  /** Someone who is not the host would play one more; whether the room has that word of them now (`GameHandlers`). */
  wantAgain(): boolean;
  /** Whether the room's 탈락전 has put this browser's player out (`GameHandlers`). */
  out(): boolean;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** The game has more players than the column lists one to a row, or no longer has. */
  crowded(crowded: boolean): void;
}

/** The game screen. */
export interface DivineScreen {
  update(message: DivineMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  /** What this player came out of the game with, once it is over (`GameScreen.verdict`). */
  verdict(): string | null;
  /** Whether the game waits on this player by the room's last word (`GameScreen.waits`, `src/shared/waits.ts`). */
  waits(): boolean;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** The board: its top left, and how many pixels it may be across and down. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 111;
const BOARD_Y = 32;
const BOARD_SPAN = 168;
/** The tiles not on the board, left of it: six to a row, each this wide and this high. */
const TRAY_X = 6;
const TRAY_Y = 36;
const TRAY_COLUMNS = 6;
const TILE_W = 17;
const TILE_H = 19;
/** Where the two lines under the tiles are: how many are laid, and how many lines are right. */
const SIDE_Y = 192;
/** A square of the board, its edge, and a tile on it. */
const SQUARE = "#2e3347";
const SQUARE_EDGE = "#20243a";
const TILE = "#d9d2bd";
const TILE_EDGE = "#8f8873";
const TILE_INK = "#1b1e2e";
/** The widest a name is drawn in the list of players, and the least of it a line of the log keeps, in pixels. */
const NAME_WIDTH = 76;
const LOG_NAME = 24;
/** With this many seconds or fewer left, the clock turns red, and a player still at their board hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a tile. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;

/** The buttons of the results. */
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** `ms` as minutes and seconds, a part of a second counted as a whole one. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link DivineScreen.update}. */
export function createDivineScreen(canvas: HTMLCanvasElement, handlers: DivineHandlers): DivineScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: DivineMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** The player's board as the screen has it: the room's, with what was asked since laid on it. */
  let cells: number[] = [];
  /** How many things asked the room has not answered yet. */
  let flying = 0;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The tile picked to be laid or moved; `null` while none is. */
  let held: number | null = null;
  /** The digits typed for a tile, not yet laid. */
  let typed = "";
  /** The square the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** How many lines of the board were right when it was last looked at: one more is heard. */
  let rightBefore = 0;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /**
   * What was pressed since the last step, in the order it was: a key's
   * code, `Num:` and the number a key types, or `Click:` and which of
   * `clicks` it is. A square pressed and a number typed right after it are
   * taken in that order, however many of them one step finds.
   */
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
  const size = (): number => latest?.rules.size ?? 7;
  const standingOf = (player: number | null) => latest?.view.standings.find((each) => each.player === player);
  /** Whether this player is still at their board: the game is played, and theirs has not passed. */
  const playing = (): boolean => latest !== null && !latest.frozen && latest.view.phase === "play" && latest.view.you !== null && standingOf(latest.view.you)?.done === null;
  const stays = (cell: number): boolean => latest?.rules.fixed.some((each) => each.cell === cell) ?? false;
  /** The lines of the board, and what the tiles on each add up to. */
  const lines = (): number[][] => linesOf(size());
  const sumOf = (line: readonly number[]): number => line.reduce((sum, cell) => sum + (cells[cell] ?? 0), 0);
  const fullLine = (line: readonly number[]): boolean => line.every((cell) => (cells[cell] ?? 0) !== 0);
  const rightNow = (): number => lines().filter((line) => fullLine(line) && sumOf(line) === magicOf(size())).length;

  // ---- Where things are -------------------------------------------------------------------------------
  const pitch = (): number => Math.floor(BOARD_SPAN / size());
  /** The top left of square `cell`, in pixels. */
  const cornerOf = (cell: number): [number, number] => [BOARD_X + (cell % size()) * pitch(), BOARD_Y + Math.floor(cell / size()) * pitch()];
  /** The square a press at (`x`, `y`) is on; `null` off the board. */
  function cellAt(x: number, y: number): number | null {
    const [cx, cy] = [Math.floor((x - BOARD_X) / pitch()), Math.floor((y - BOARD_Y) / pitch())];
    return cx < 0 || cx >= size() || cy < 0 || cy >= size() ? null : cy * size() + cx;
  }
  /** The tiles that are not fixed, in the order they lie beside the board. */
  const loose = (): number[] => Array.from({ length: size() * size() }, (_, n) => n + 1).filter((tile) => !(latest?.rules.fixed.some((each) => each.tile === tile) ?? false));
  /** The place of the `nth` loose tile beside the board. */
  const trayRect = (nth: number): Box => [TRAY_X + (nth % TRAY_COLUMNS) * TILE_W, TRAY_Y + Math.floor(nth / TRAY_COLUMNS) * TILE_H, TILE_W, TILE_H];
  /** Whether (`x`, `y`) is beside the board, where the tiles lie. */
  const inTray = (x: number, y: number): boolean => x >= TRAY_X && x < TRAY_X + TRAY_COLUMNS * TILE_W && y >= TRAY_Y && y < TRAY_Y + Math.ceil(loose().length / TRAY_COLUMNS) * TILE_H;

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. */
  function show(event: DivineEvent): void {
    const mine = me();
    if (event.type === "passed") {
      if (event.player === mine) sfx.win();
      else {
        say(WORDS.say.passedOther(pen.fit(nickOf(event.player), 120), event.place));
        sfx.alarm();
      }
    } else if (event.type === "left") {
      say(WORDS.say.leftOther(pen.fit(nickOf(event.player), 120)));
      sfx.back();
    } else if (event.type === "ended") {
      sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: DivineMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      keyed = false;
      cursor = 0;
      held = null;
      typed = "";
      flying = 0;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // the room marks the game it sends in answer to what this page asked
    if (message.answer === true) flying = Math.max(0, flying - 1);
    // a game that is over, or a board that has passed, takes nothing more: whatever was still on its way is not waited for
    if (message.view.phase === "ended" || message.view.standings.find((each) => each.player === message.view.you)?.done != null) flying = 0;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    // the room's board is the board, once it has answered everything asked of it
    if (flying === 0) {
      cells = [...message.view.cells];
      rightBefore = rightNow();
    }
    if (!playing()) {
      held = null;
      typed = "";
    }
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Asks the room for `action`, the board on the screen changed at once. Returns whether it was asked. */
  function ask(action: DivineAction): boolean {
    if (latest === null) return false;
    const result = layOn(cells, action, latest.rules);
    if (!result.ok) {
      deny(WORDS.refused[result.reason] ?? WORDS.refusedOther);
      return false;
    }
    if (!handlers.act(action)) {
      say(WORDS.notSent);
      return false;
    }
    cells = result.cells;
    flying += 1;
    // a line that has come right is heard
    const right = rightNow();
    if (right > rightBefore) sfx.stored();
    else if (action.type === "take") sfx.back();
    else sfx.pick();
    rightBefore = right;
    return true;
  }

  /** A press on square `cell`: lays the tile held there, or picks up the tile that is on it. */
  function pressCell(cell: number): void {
    if (stays(cell)) return deny(WORDS.refused["bad-cell"]);
    if (held !== null) {
      // (pressed on the square it is on: put down again)
      if (cells[cell] !== held) ask({ type: "put", tile: held, cell });
      held = null;
      return;
    }
    if (cells[cell] === 0) return;
    held = cells[cell];
    sfx.move();
  }

  /** A press beside the board, at (`x`, `y`): picks up the tile lying there, or takes the tile held off the board. */
  function pressTray(x: number, y: number): void {
    const tiles = loose();
    const nth = tiles.findIndex((_, index) => inRect({ x, y }, trayRect(index)));
    const tile = nth < 0 ? null : tiles[nth];
    if (tile !== null && !cells.includes(tile)) {
      held = held === tile ? null : tile;
      sfx.move();
      return;
    }
    // an empty place: the tile held goes back beside the board
    if (held !== null && cells.includes(held)) ask({ type: "take", cell: cells.indexOf(held) });
    held = null;
  }

  /** Lays the tile whose number was typed on the square the keys are at. */
  function layTyped(): void {
    const tile = Number(typed);
    typed = "";
    held = null;
    if (cells[cursor] !== tile) ask({ type: "put", tile, cell: cursor });
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
    // (results that were under the sheet are up from now: their buttons wait as they do when a game ends in sight)
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
    if (!playing()) return;

    const n = size();
    for (const code of keys) {
      const [x, y] = [cursor % n, Math.floor(cursor / n)];
      if (code === "ArrowLeft" && x > 0) cursor -= 1;
      else if (code === "ArrowRight" && x < n - 1) cursor += 1;
      else if (code === "ArrowUp" && y > 0) cursor -= n;
      else if (code === "ArrowDown" && y < n - 1) cursor += n;
      else if (code.startsWith("Num:")) {
        typed = `${typed}${code.slice(4)}`.replace(/^0+/, "");
        // a number that no further digit can make a tile of is laid at once
        if (typed !== "" && Number(typed) * 10 > n * n) layTyped();
      } else if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
        if (typed !== "") layTyped();
        else pressCell(cursor);
      } else if (code === "Backspace" || code === "Delete") {
        if (typed !== "") typed = typed.slice(0, -1);
        else if (cells[cursor] !== 0 && !stays(cursor)) {
          held = null;
          ask({ type: "take", cell: cursor });
        }
      } else if (code === "Escape") {
        typed = "";
        held = null;
      } else if (code.startsWith("Click:")) {
        const p = clicks[Number(code.slice(6))];
        if (p === undefined) continue;
        const cell = cellAt(p.x, p.y);
        typed = "";
        if (cell !== null) {
          cursor = cell;
          pressCell(cell);
        } else if (inTray(p.x, p.y)) pressTray(p.x, p.y);
        else held = null;
        keyed = false;
        continue;
      } else continue;
      keyed = true;
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
    if (latest !== null) {
      const view = latest.view;
      const fresh = Math.min(view.events - seen, view.history.length);
      seen = view.events;
      for (const event of fresh > 0 ? view.history.slice(-fresh) : []) show(event);
      // the time is nearly up: a tick a second
      const mine = playing() ? left(latest.clock.turn) : null;
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
    const width = Math.min(SCENE_W - 4, Math.max(120, pen.width(words) + 16));
    const x = Math.round(SCENE_W / 2 - width / 2);
    pen.px(x, y, width, 17, C.ink);
    pen.txt(pen.fit(words, width - 8), x + Math.round(width / 2), y + 2, colour, "center");
  }

  function button(rect: Box, label: string, lit: boolean, on: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : on && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : on ? C.bone : C.dim, "center");
  }

  /** The edge of the box at (`x`, `y`), `w` by `h`, a pixel thick. */
  function frame(x: number, y: number, w: number, h: number, colour: string): void {
    pen.px(x, y, w, 1, colour);
    pen.px(x, y + h - 1, w, 1, colour);
    pen.px(x, y, 1, h, colour);
    pen.px(x + w - 1, y, 1, h, colour);
  }

  /** A tile with its number, in the box at (`x`, `y`): one that stays where it is in brass, the one held in amber. */
  function tile(x: number, y: number, w: number, h: number, number: number, how: "plain" | "fixed" | "held"): void {
    pen.px(x, y, w, h, how === "held" ? C.amberD : how === "fixed" ? C.brassD : TILE_EDGE);
    pen.px(x + 1, y + 1, w - 2, h - 2, how === "held" ? C.amber : how === "fixed" ? C.brassH : TILE);
    pen.txt(`${number}`, x + Math.round(w / 2), y + Math.round((h - 13) / 2), TILE_INK, "center");
  }

  /** What a line adds up to, in the colour that says how it stands: right, over or wrong with every tile laid, or not there yet. */
  function sum(line: readonly number[], x: number, y: number, align: "left" | "center" | "right"): void {
    const total = sumOf(line);
    // (a line with no tile on it says nothing yet)
    if (total === 0) return;
    const magic = magicOf(size());
    const colour = fullLine(line) && total === magic ? C.teal : total > magic || fullLine(line) ? C.crim : C.dim;
    pen.txt(`${total}`, x, y, colour, align);
  }

  function drawBoard(): void {
    if (latest === null) return;
    const n = size();
    const p = pitch();
    const span = p * n;
    pen.px(BOARD_X - 1, BOARD_Y - 1, span + 1, span + 1, SQUARE_EDGE);
    for (let cell = 0; cell < n * n; cell++) {
      const [x, y] = cornerOf(cell);
      pen.px(x, y, p - 1, p - 1, SQUARE);
      const number = cells[cell] ?? 0;
      if (number !== 0) tile(x + 1, y + 1, p - 3, p - 3, number, stays(cell) ? "fixed" : held === number ? "held" : "plain");
    }
    // what each line adds up to: the rows to the right, the columns underneath, and each diagonal at the right-hand corner it runs to or from
    const all = lines();
    for (let y = 0; y < n; y++) sum(all[y], BOARD_X + span + 2, BOARD_Y + y * p + Math.round((p - 13) / 2), "left");
    for (let x = 0; x < n; x++) sum(all[n + x], BOARD_X + x * p + Math.round(p / 2), BOARD_Y + span + 1, "center");
    sum(all[n * 2], BOARD_X + span + 2, BOARD_Y + span + 1, "left");
    sum(all[n * 2 + 1], BOARD_X + span + 2, BOARD_Y - 14, "left");
    if (!playing()) return;
    const over = keyed ? cursor : mouse.x >= 0 ? cellAt(mouse.x, mouse.y) : null;
    if (over !== null) {
      const [x, y] = cornerOf(over);
      frame(x - 1, y - 1, p + 1, p + 1, held !== null || typed !== "" ? C.amber : C.bone);
    }
  }

  /** The tiles beside the board: those not on it, each in its own place, and the two lines under them. */
  function drawTray(): void {
    if (latest === null) return;
    const count = size() * size();
    loose().forEach((number, nth) => {
      const [x, y, w, h] = trayRect(nth);
      if (cells.includes(number)) {
        // on the board: its place beside it is empty
        pen.px(x + 6, y + 8, 3, 3, held === number ? C.amber : C.steelDD);
        return;
      }
      tile(x, y, w - 1, h - 1, number, held === number ? "held" : "plain");
      if (playing() && held !== number && inRect(mouse, [x, y, w, h])) frame(x, y, w - 1, h - 1, C.bone);
    });
    const placed = cells.filter((each) => each !== 0).length;
    pen.txt(pen.fit(WORDS.side.placed(placed, count), 88), TRAY_X, SIDE_Y, C.boneD);
    pen.txt(pen.fit(WORDS.side.lines(rightNow(), size() * 2 + 2), 88), TRAY_X, SIDE_Y + 14, rightNow() > 0 ? C.teal : C.boneD);
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawTray();
    drawBoard();
    if (latest.frozen && view.phase !== "ended") {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 96, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    const magic = magicOf(size());
    if (view.you === null) return [WORDS.standing.watching(magic, clock), C.bone];
    const mine = standingOf(view.you);
    if (mine?.done != null) return [WORDS.standing.passed(view.passed.indexOf(view.you) + 1, clock), C.teal];
    if (typed !== "") return [WORDS.standing.typed(typed, clock), C.amber];
    if (held !== null) return [WORDS.standing.held(held, clock), C.amber];
    if (cells.length > 0 && cells.every((each) => each !== 0)) return [WORDS.standing.full(size() * 2 + 2 - rightNow(), clock), C.crim];
    return [WORDS.standing.play(magic, clock), C.amber];
  }

  /** The players in the order they are listed: by their places once the game is played to its end; before that those who passed first, then by their numbers. */
  function listed(): number[] {
    if (latest === null) return [];
    const view = latest.view;
    if (view.places !== null) return view.places.map((each) => each.player);
    return [...view.passed, ...view.players.filter((player) => !view.passed.includes(player))];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading, x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    const players = listed();
    const layout = panelLayout(players.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    const count = size() * size();
    players.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const stands = standingOf(player);
      const status = stands === undefined ? "" : stands.done !== null ? WORDS.status.passed(clockOf(stands.done)) : stands.left ? WORDS.status.left : view.places !== null ? WORDS.status.failed : WORDS.status.at(stands.placed, count, stands.lines, size() * 2 + 2);
      // who is still at a board
      if (view.phase === "play" && stands !== undefined && stands.done === null && !stands.left) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      pen.txt(status, right, y, stands?.done != null ? C.teal : stands?.left === true || view.places !== null ? C.dim : C.boneD, "right");
      right -= pen.width(status) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - ex - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what happened
    const rows: [string, string][] = [];
    /** A line that names `player`, the name cut so that the rest of the line is there to be read. */
    const named = (player: number, line: (who: string) => string): string => line(pen.fit(nickOf(player), Math.max(LOG_NAME, PANEL_WIDTH - pen.width(line("")))));
    for (const event of view.history) {
      if (event.type === "passed") rows.push([named(event.player, (who) => WORDS.log.passed(who, event.place, clockOf(event.ms))), C.teal]);
      else if (event.type === "left") rows.push([named(event.player, (who) => WORDS.log.left(who)), C.boneD]);
      else rows.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, rows.length - layout.logRows);
    for (let i = from; i < rows.length; i++) pen.txt(pen.fit(rows[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, rows[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = players.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** What this player came out of the game with, in the word the results lead with: passed or failed; `null` while it is played, for someone who watched, and for a game cut short. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    return standingOf(mine)?.done != null ? WORDS.result.passed : WORDS.result.failed;
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const own = verdict();
    const mine = standingOf(me());
    pen.txt(own ?? WORDS.result.over, 10, 234, own === WORDS.result.passed ? C.teal : C.bone, "left", 24);
    const first = view.passed[0];
    const named = view.places === null ? WORDS.ended[view.ended ?? "abandoned"] : first === undefined ? WORDS.result.nobody : WORDS.result.first(pen.fit(nickOf(first), 120));
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const count = size() * size();
    const how = mine === undefined ? "" : mine.done !== null ? WORDS.result.place(view.passed.indexOf(mine.player) + 1, clockOf(mine.done)) : WORDS.result.notPassed(mine.placed, count, mine.lines, size() * 2 + 2);
    pen.txt(pen.fit(how, RESULT_WIDTH), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(pen.fit(note, RESULT_WIDTH), 96, 254, C.amber);
    else pen.txt(starting ? WORDS.result.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
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
    if (view.you === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    pen.txt(pen.fit(playing() && !TOUCH ? WORDS.keys.play : idle, W - 12), 6, 240, C.dim);
    if (playing() && !TOUCH) pen.txt(pen.fit(idle, W - 12), 6, 254, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help(latest.rules);
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(pen.fit(line.text, W - 44), 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : line.tone === "mark" ? C.teal : C.bone);
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
    // a number is taken by what the key types, wherever a keyboard has it; anything else by the key itself
    if (event.key.length === 1 && "0123456789".includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) keys.push(`Num:${event.key}`);
    else if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
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
      keys.push(`Click:${clicks.length - 1}`);
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
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && divineWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      // what was refused is not on the room's board: the screen takes the room's again once nothing else is on its way
      flying = Math.max(0, flying - 1);
      if (flying === 0 && latest !== null) cells = [...latest.view.cells];
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether what was sent reached the room is not known: the game the room sends on coming back will say
      flying = 0;
      if (latest !== null) cells = [...latest.view.cells];
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

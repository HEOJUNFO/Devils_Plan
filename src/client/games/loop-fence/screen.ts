/**
 * The screen of 울타리 치기: the puzzle everyone has, the player's own fence
 * on it, the buzzer, and how far the others are.
 *
 * Design: design/games/loop-fence.md. The room decides everything; this
 * screen shows what it sends and asks it to put a piece of fence or a cross
 * on a side, to take everything off, or to check the fence. Nobody else's
 * fence is sent, so nothing hidden is here to be drawn: of the others the
 * screen has how many lines they have drawn and how often they were wrong.
 * The puzzle's fence comes with the game that is over.
 *
 * A line is drawn on the screen as soon as it is asked for, by the same
 * function the room draws it by (`markOn` of `rules.ts`), and the board the
 * room sends is taken again once it has answered everything asked: a fence
 * is some forty lines, and its player does not wait on the room for each.
 * Everything can be done with the pointer; the keys are another way to the
 * same.
 */
import { across, countAround, endsOf, sidesOf, upright, type Puzzle } from "../../../shared/games/loop-fence/fence";
import { CROSS, FENCE, NONE, markOn, type FenceAction, type FenceEvent } from "../../../shared/games/loop-fence/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { fenceWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 울타리 치기. */
export type FenceMessage = Extract<ServerMessage, { type: "game"; game: "loop-fence" }>;

/** What the screen asks of whoever owns the connection. */
export interface FenceHandlers {
  /** The player drew, took something off or pressed the buzzer. Returns whether it could be sent. */
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
export interface FenceScreen {
  update(message: FenceMessage): void;
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
/** The board: the dot at its top left, and how many pixels it may be across and down. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 114;
const BOARD_Y = 34;
const BOARD_SPAN = 182;
/** How near a side a press has to be to be on it, in pixels: with a mouse, under a finger, and while a line is drawn on by dragging. */
const SIDE_REACH = 9;
const FINGER_REACH = 12;
const DRAG_REACH = 6;
/** Left of the board: where the two counts are, the two lines that say what a press does, and the two buttons. */
const SIDE_X = 6;
const SIDE_Y = 38;
const BUZZ_RECT: Box = [6, 150, 98, 30];
const CLEAR_RECT: Box = [6, 186, 98, 18];
/** Seconds a first press on "clear" waits for the second. */
const CLEAR_WAIT = 3;
/** The ground the board lies on, a dot, a piece of fence, and the mark where a press would draw. */
const FIELD = "#20243a";
const DOT = "#8f8873";
const LINE = "#e6dfc8";
const HOVER = "#3d4460";
/** The widest a name is drawn in the list of players, and the least of it a line of the log keeps, in pixels. */
const NAME_WIDTH = 76;
const LOG_NAME = 24;
/** With this many seconds or fewer left, the clock turns red, and a player still at their board hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for the buzzer. */
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

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link FenceScreen.update}. */
export function createFenceScreen(canvas: HTMLCanvasElement, handlers: FenceHandlers): FenceScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: FenceMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** The player's board as the screen has it: the room's, with what was asked since drawn on it. */
  let marks: number[] = [];
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
  /** What a press that is being dragged on puts on the sides it comes over; `null` while none is. */
  let paint: number | null = null;
  /** Whether the pointer is down, and the side it was last on. */
  let down = false;
  let dragged: number | null = null;
  /** The dot the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** `time` until which a second press on "clear" takes everything off. */
  let clearUntil = 0;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /**
   * What was pressed since the last step, in the order it was: a key's
   * code (`Shift+` before an arrow pressed with it), `Click:` and which of
   * `clicks` it is, or `Drag:` and the side a pointer held down came over.
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
  const puzzle = (): Puzzle => latest?.view.puzzle ?? { width: 1, height: 1, clues: [null] };
  const standingOf = (player: number | null) => latest?.view.standings.find((each) => each.player === player);
  /** Whether this player is still at their board: the game is played, and theirs has not passed. */
  const playing = (): boolean => latest !== null && !latest.frozen && latest.view.phase === "play" && latest.view.you !== null && standingOf(latest.view.you)?.done === null;
  /** How many whole seconds the buzzer is still locked; 0 when it can be pressed. */
  const locked = (): number => Math.ceil((left(latest?.clock.lock ?? 0) ?? 0) / 1000);
  const drawn = (): number => marks.filter((mark) => mark === FENCE).length;

  // ---- Where things are -------------------------------------------------------------------------------
  const pitch = (): number => Math.floor(BOARD_SPAN / Math.max(puzzle().width, puzzle().height));
  /** The dot `corner`, in pixels. */
  const dotAt = (corner: number): [number, number] => [BOARD_X + (corner % (puzzle().width + 1)) * pitch(), BOARD_Y + Math.floor(corner / (puzzle().width + 1)) * pitch()];
  /** The side a press at (`x`, `y`) is on, where it is within `reach` pixels of one and not as near another; `null` elsewhere. */
  function sideAt(x: number, y: number, reach: number): number | null {
    const on = puzzle();
    const p = pitch();
    const [gx, gy] = [(x - BOARD_X) / p, (y - BOARD_Y) / p];
    const [row, column] = [Math.round(gy), Math.round(gx)];
    const flat = row >= 0 && row <= on.height && gx >= 0 && gx < on.width ? Math.abs(gy - row) * p : Infinity;
    const tall = column >= 0 && column <= on.width && gy >= 0 && gy < on.height ? Math.abs(gx - column) * p : Infinity;
    if (Math.min(flat, tall) > reach || Math.abs(flat - tall) < 1.5) return null;
    return flat < tall ? across(on, Math.floor(gx), row) : upright(on, column, Math.floor(gy));
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. */
  function show(event: FenceEvent): void {
    const mine = me();
    if (event.type === "passed") {
      if (event.player === mine) sfx.win();
      else {
        say(WORDS.say.passedOther(pen.fit(nickOf(event.player), 120), event.place));
        sfx.alarm();
      }
    } else if (event.type === "wrong") {
      if (event.player === mine) {
        const fault = latest?.view.fault ?? null;
        deny(fault === null ? WORDS.refused.locked : WORDS.fault[fault]);
        noteT = 4;
      } else say(WORDS.say.wrongOther(pen.fit(nickOf(event.player), 120)));
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

  function update(message: FenceMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      keyed = false;
      cursor = 0;
      paint = null;
      clearUntil = 0;
      flying = 0;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // the room marks the game it sends in answer to what this page asked
    if (message.answer === true) flying = Math.max(0, flying - 1);
    // a game that is over, or a fence that has passed, takes nothing more: whatever was still on its way is not waited for
    if (message.view.phase === "ended" || message.view.standings.find((each) => each.player === message.view.you)?.done != null) flying = 0;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    // the room's board is the board, once it has answered everything asked of it
    if (flying === 0) marks = [...message.view.marks];
    if (!playing()) paint = null;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Asks the room for `action`, the board on the screen changed at once. Returns whether it was asked. */
  function ask(action: FenceAction): boolean {
    if (latest === null) return false;
    const result = action.type === "buzz" ? null : markOn(marks, action);
    if (result !== null && !result.ok) {
      deny(WORDS.refused[result.reason] ?? WORDS.refusedOther);
      return false;
    }
    if (!handlers.act(action)) {
      say(WORDS.notSent);
      return false;
    }
    if (result !== null) marks = result.marks;
    flying += 1;
    return true;
  }

  /** What a press makes of what is on a side: a line, then a cross, then nothing again. */
  const after = (mark: number): number => (mark === NONE ? FENCE : mark === FENCE ? CROSS : NONE);

  /** Puts `to` on `side`, with the sound of it. */
  function put(side: number, to: number): boolean {
    if (!ask({ type: "mark", side, to })) return false;
    if (to === FENCE) sfx.pick();
    else if (to === CROSS) sfx.move();
    else sfx.back();
    return true;
  }

  /** A press on `side`: the next of line, cross and nothing. A drag from here puts the same on the sides it comes over. */
  function pressSide(side: number): void {
    const to = after(marks[side] ?? NONE);
    paint = put(side, to) ? to : null;
  }

  /** The buzzer. One pressed with nothing drawn, or while it is locked, is not sent: the room would count it. */
  function buzz(): void {
    if (locked() > 0) return deny(WORDS.refused.locked);
    if (drawn() === 0) return deny(WORDS.refused.empty);
    ask({ type: "buzz" });
  }

  /** Takes everything off, at the second press. */
  function clear(): void {
    if (marks.every((mark) => mark === NONE)) return;
    if (time < clearUntil) {
      clearUntil = 0;
      if (ask({ type: "clear" })) sfx.back();
      return;
    }
    clearUntil = time + CLEAR_WAIT;
    say(WORDS.say.clearAgain);
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

    const on = puzzle();
    const across1 = on.width + 1;
    for (const code of keys) {
      if (code.startsWith("Click:")) {
        const p = clicks[Number(code.slice(6))];
        if (p === undefined) continue;
        keyed = false;
        paint = null;
        if (hits(p, BUZZ_RECT)) buzz();
        else if (hits(p, CLEAR_RECT)) clear();
        else {
          const side = sideAt(p.x, p.y, p.touch ? FINGER_REACH : SIDE_REACH);
          if (side !== null) pressSide(side);
        }
        continue;
      }
      if (code.startsWith("Drag:")) {
        const side = Number(code.slice(5));
        if (paint !== null && (marks[side] ?? NONE) !== paint) put(side, paint);
        continue;
      }
      const shift = code.startsWith("Shift+");
      const key = shift ? code.slice(6) : code;
      const [x, y] = [cursor % across1, Math.floor(cursor / across1)];
      if (key === "ArrowLeft" && x > 0) {
        if (shift) pressSide(across(on, x - 1, y));
        cursor -= 1;
      } else if (key === "ArrowRight" && x < on.width) {
        if (shift) pressSide(across(on, x, y));
        cursor += 1;
      } else if (key === "ArrowUp" && y > 0) {
        if (shift) pressSide(upright(on, x, y - 1));
        cursor -= across1;
      } else if (key === "ArrowDown" && y < on.height) {
        if (shift) pressSide(upright(on, x, y));
        cursor += across1;
      } else if (key === "Enter" || key === "NumpadEnter" || key === "Space") buzz();
      else if (key === "Backspace" || key === "Delete") clear();
      else if (!key.startsWith("Arrow")) continue;
      paint = null;
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

  /** The line or the cross on `side`, in `colour`; a line `thick` pixels thick. */
  function mark(side: number, what: number, colour: string, thick: number): void {
    const [a, b] = endsOf(puzzle(), side);
    const [ax, ay] = dotAt(a);
    const [bx, by] = dotAt(b);
    const half = Math.floor(thick / 2);
    if (what === FENCE) {
      if (ay === by) pen.px(ax, ay - half, bx - ax + 1, thick, colour);
      else pen.px(ax - half, ay, thick, by - ay + 1, colour);
      return;
    }
    const [mx, my] = [Math.round((ax + bx) / 2), Math.round((ay + by) / 2)];
    for (let i = -2; i <= 2; i++) {
      pen.px(mx + i, my + i, 1, 1, colour);
      pen.px(mx + i, my - i, 1, 1, colour);
    }
  }

  function drawBoard(): void {
    if (latest === null) return;
    const on = puzzle();
    const p = pitch();
    const view = latest.view;
    pen.px(BOARD_X, BOARD_Y, on.width * p + 1, on.height * p + 1, FIELD);
    // the numbers: one that is met in green, one with more lines round it than it says in red
    const fence = marks.map((each) => each === FENCE);
    on.clues.forEach((clue, cell) => {
      if (clue === null) return;
      const around = view.answer !== null ? clue : countAround(on, fence, cell);
      const [x, y] = [BOARD_X + (cell % on.width) * p, BOARD_Y + Math.floor(cell / on.width) * p];
      pen.txt(`${clue}`, x + Math.round(p / 2) + 1, y + Math.round((p - 13) / 2) + 1, view.answer !== null ? C.boneD : around === clue ? C.teal : around > clue ? C.crim : C.bone, "center");
    });
    // where a press would draw
    const over = playing() && !keyed && !TOUCH && mouse.x >= 0 ? sideAt(mouse.x, mouse.y, SIDE_REACH) : null;
    if (over !== null && (marks[over] ?? NONE) === NONE) mark(over, FENCE, HOVER, 3);
    for (let side = 0; side < sidesOf(on); side++) {
      const what = marks[side] ?? NONE;
      if (view.answer !== null) {
        // the game is over: the puzzle's fence, and under it what of this player's own is not part of it
        if (view.answer[side]) mark(side, FENCE, C.teal, 3);
        else if (what === FENCE) mark(side, FENCE, C.crim, 1);
      } else if (what === FENCE) mark(side, FENCE, LINE, 3);
      else if (what === CROSS) mark(side, CROSS, C.crim, 1);
    }
    for (let corner = 0; corner < (on.width + 1) * (on.height + 1); corner++) {
      const [x, y] = dotAt(corner);
      pen.px(x - 1, y - 1, 3, 3, DOT);
    }
    if (playing() && keyed) {
      const [x, y] = dotAt(cursor);
      frame(x - 4, y - 4, 9, 9, C.amber);
    }
  }

  /** Left of the board: how much is drawn, what a press does, and the two buttons; the word over the puzzle's fence once the game is over. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    if (view.answer !== null) {
      pen.txt(WORDS.side.answer, SIDE_X, SIDE_Y, C.teal);
      return;
    }
    if (view.you === null) return;
    const mine = standingOf(view.you);
    pen.txt(pen.fit(WORDS.side.lines(drawn()), 98), SIDE_X, SIDE_Y, C.boneD);
    if ((mine?.wrong ?? 0) > 0) pen.txt(pen.fit(WORDS.side.wrong(mine?.wrong ?? 0), 98), SIDE_X, SIDE_Y + 14, C.crim);
    if (!playing()) return;
    pen.txt(pen.fit(WORDS.side.each, 98), SIDE_X, SIDE_Y + 42, C.dim);
    pen.txt(pen.fit(WORDS.side.cycle, 98), SIDE_X, SIDE_Y + 56, C.dim);
    const wait = locked();
    button(BUZZ_RECT, wait > 0 ? WORDS.button.locked(wait) : WORDS.button.buzz, wait === 0 && drawn() > 0, wait === 0);
    button(CLEAR_RECT, time < clearUntil ? WORDS.button.clearAgain : WORDS.button.clear, false, marks.some((each) => each !== NONE));
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawSide();
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
    if (view.you === null) return [WORDS.standing.watching(clock), C.bone];
    const mine = standingOf(view.you);
    if (mine?.done != null) return [WORDS.standing.passed(view.passed.indexOf(view.you) + 1, clock), C.teal];
    if (locked() > 0) return [WORDS.standing.locked(locked(), clock), C.crim];
    return [WORDS.standing.play(clock), C.amber];
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
    players.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const stands = standingOf(player);
      const status = stands === undefined ? "" : stands.done !== null ? WORDS.status.passed(clockOf(stands.done)) : stands.left ? WORDS.status.left : view.places !== null ? WORDS.status.failed : WORDS.status.at(stands.lines, stands.wrong);
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
      else if (event.type === "wrong") rows.push([named(event.player, (who) => WORDS.log.wrong(who)), C.boneD]);
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
    const how = mine === undefined ? "" : mine.done !== null ? WORDS.result.place(view.passed.indexOf(mine.player) + 1, clockOf(mine.done)) : WORDS.result.notPassed(mine.lines, mine.wrong);
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
    // an arrow pressed with Shift draws as it goes
    if (event.code.startsWith("Arrow")) keys.push(event.shiftKey ? `Shift+${event.code}` : event.code);
    else if (!event.repeat) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace") event.preventDefault();
  };
  const unwatch = watchPointer(canvas, W, H, {
    move(p): void {
      mouse.x = p.x;
      mouse.y = p.y;
      if (!down) return;
      // held down and moved on: the sides it comes over are drawn like the first
      const side = sideAt(p.x, p.y, DRAG_REACH);
      if (side === null || side === dragged) return;
      dragged = side;
      keys.push(`Drag:${side}`);
    },
    down(p): void {
      startAudio();
      mouse.x = p.x;
      mouse.y = p.y;
      down = true;
      dragged = sideAt(p.x, p.y, p.touch ? FINGER_REACH : SIDE_REACH);
      clicks.push(p);
      keys.push(`Click:${clicks.length - 1}`);
    },
    up(): void {
      down = false;
    },
    // a pointer that has left the screen, or a finger that has lifted, is over none of its buttons
    gone(): void {
      mouse.x = -1;
      mouse.y = -1;
      down = false;
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
    waits: (): boolean => latest !== null && !latest.frozen && fenceWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      // what was refused is not on the room's board: the screen takes the room's again once nothing else is on its way
      flying = Math.max(0, flying - 1);
      if (flying === 0 && latest !== null) marks = [...latest.view.marks];
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether what was sent reached the room is not known: the game the room sends on coming back will say
      flying = 0;
      if (latest !== null) marks = [...latest.view.marks];
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

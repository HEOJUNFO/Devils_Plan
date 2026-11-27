/**
 * The screen of 포인트 오목: the board with its stones, the three spots of
 * the round, and the points a player bets on each of them.
 *
 * Design: design/games/point-gomoku.md. The room decides everything; this
 * screen shows what it sends and asks it to take spots or bets. The
 * opponent's points and bets are not sent until the game is over, so nothing
 * hidden is here to be drawn. While spots are marked the screen says whether
 * they are ones the rules allow, by the rules the room holds them to
 * (`rules.ts`). Everything can be done with the pointer; the keys are
 * another way to the same.
 *
 * A stone is told from the other twice, by its colour and by its rim: black
 * is dark with a light speck, white is light with a dark rim.
 */
import { EMPTY, STONES, checkBets, checkSpots, openSpots, type OmokEvent } from "../../../shared/games/point-gomoku/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { omokWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 포인트 오목. */
export type OmokMessage = Extract<ServerMessage, { type: "game"; game: "point-gomoku" }>;
type View = OmokMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface OmokHandlers {
  /** The player marked spots or bet. Returns whether it could be sent. */
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
export interface OmokScreen {
  update(message: OmokMessage): void;
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
/** The board: its top left and how many pixels across. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 110;
const BOARD_Y = 29;
const BOARD_SPAN = 189;
/** The least room between the board's edge and its outermost lines, for the half of a stone that lies over them. */
const BOARD_MARGIN = 4;
/** What stands to the left of the board: whose stones are whose, the round, and this player's points. */
const SIDE_X = 6;
const SIDE_W = 98;
const LEGEND_Y = 34;
const ROUND_Y = 68;
const POINTS_Y = 100;
const LAST_Y = 160;
/** The letters the round's spots are known by, in the order the bets are made in. */
const LETTERS = "ABCDEFGH";
/** The first of those letters as they are drawn on a spot of the board, five pixels by seven. */
const SMALL_LETTERS: readonly (readonly string[])[] = [
  [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
];
/** The board, its lines and the two stones. */
const WOOD = "#9a6a3c";
const WOOD_RIM = C.woodD;
const WOOD_LINE = "#4a2e1b";
const BLACK = "#14151f";
const BLACK_SPECK = "#5a6078";
const WHITE = C.bone;
const WHITE_RIM = "#3a2c1a";
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a bet. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** Seconds the stones just placed are marked out. */
const FLASH = 2.4;

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const ERASE_RECT: Box = [270, 238, 90, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** A spot's bet in the bar: a button that takes a point off, the points, a button that adds one. */
const BET_X = 6;
const BET_STEP = 86;
const betMinus = (index: number): Box => [BET_X + index * BET_STEP, 238, 22, 28];
const betValue = (index: number): Box => [BET_X + index * BET_STEP + 23, 238, 36, 28];
const betPlus = (index: number): Box => [BET_X + index * BET_STEP + 60, 238, 22, 28];
/** How much farther than its edge a bet's button takes a finger: up to the standing line, down to the frame's edge. */
const BET_REACH: Reach = [1, 2, 1, 4];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link OmokScreen.update}. */
export function createOmokScreen(canvas: HTMLCanvasElement, handlers: OmokHandlers): OmokScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: OmokMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The spots marked and not sent yet. */
  let marks: number[] = [];
  /** The intersection the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** The bets written and not sent yet, one for each spot, and which of them the keys change. */
  let draft: number[] = [];
  let focus = 0;
  /** `time` when the latest stones were placed, and where: they are marked out for a moment. */
  let placedAt = -10;
  let placed: number[] = [];
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed: a key's code, or `Num:` and the number it types. */
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
  /** Whether this player is marking the round's spots. */
  function selecting(): boolean {
    return latest !== null && !latest.frozen && latest.view.phase === "select" && latest.view.you !== null && latest.view.you === latest.view.selector;
  }
  /** Whether this player is betting: the spots are marked and their bets are not in. */
  function betting(): boolean {
    return latest !== null && !latest.frozen && latest.view.phase === "bet" && latest.view.mine !== null && latest.view.mine.bets === null;
  }
  /** The points this player has that are on no spot of the draft. */
  function unbet(): number {
    return (latest?.view.mine?.points ?? 0) - draft.reduce((sum, bet) => sum + bet, 0);
  }

  // ---- Where things are on the board ----------------------------------------------------------------
  /** How far apart the board's lines are, where its first line is, and how far a stone reaches from its middle. */
  function grid(): { size: number; pitch: number; x: number; y: number; r: number } {
    const size = latest?.rules.size ?? 15;
    const pitch = Math.floor((BOARD_SPAN - BOARD_MARGIN * 2) / (size - 1));
    const inset = Math.round((BOARD_SPAN - pitch * (size - 1)) / 2);
    return { size, pitch, x: BOARD_X + inset, y: BOARD_Y + inset, r: Math.floor((pitch - 1) / 2) };
  }
  /** The middle of intersection `spot`, in pixels. */
  function pointOf(spot: number): [number, number] {
    const g = grid();
    return [g.x + (spot % g.size) * g.pitch, g.y + Math.floor(spot / g.size) * g.pitch];
  }
  /** The intersection a press at (`x`, `y`) is nearest to; `null` off the board. */
  function spotAt(x: number, y: number): number | null {
    const g = grid();
    const [cx, cy] = [Math.round((x - g.x) / g.pitch), Math.round((y - g.y) / g.pitch)];
    if (cx < 0 || cx >= g.size || cy < 0 || cy >= g.size) return null;
    if (x < BOARD_X || x >= BOARD_X + BOARD_SPAN || y < BOARD_Y || y >= BOARD_Y + BOARD_SPAN) return null;
    return cy * g.size + cx;
  }
  /** The spots that could still be marked along with those marked so far: every one of a line of spots that has them all. */
  function candidates(): number[][] {
    if (latest === null) return [];
    return openSpots(latest.view.board, latest.rules).filter((line) => marks.every((mark) => line.includes(mark)));
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: OmokEvent): void {
    const mine = me();
    if (event.type === "selected") {
      if (event.forced) say(event.player === mine ? WORDS.say.markedForYou : WORDS.say.markedForThem);
      if (event.player !== mine || event.forced) sfx.pick();
    } else if (event.type === "bet") {
      if (event.forced && event.player === mine) say(WORDS.say.betForYou);
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "placed") {
      placedAt = time;
      placed = event.spots;
      if (mine !== null) say(WORDS.say.placed(event.owners.filter((owner) => owner === mine).length, event.owners.length));
      sfx.stored();
    } else if (event.type === "ended") {
      const own = latest?.view.places?.find((each) => each.player === mine);
      if (own !== undefined && own.place === 1 && latest?.view.winner === mine) sfx.win();
      else sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: OmokMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      placed = [];
      placedAt = -10;
      cursor = Math.floor((message.rules.size * message.rules.size) / 2);
      keyed = false;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.round !== message.view.round;
    const waited = selecting() || betting();
    // another step: what was written for the last is put away
    if (fresh || moved) {
      marks = [];
      draft = (message.view.spots ?? []).map(() => message.rules.minBet);
      focus = 0;
    }
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player: spots to mark, or bets to make
    if (!waited && (selecting() || betting()) && !fresh && moved) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Marks intersection `spot`, or takes its mark off. A line of spots the marks leave no choice of is marked whole. */
  function mark(spot: number): void {
    if (latest === null) return;
    const rules = latest.rules;
    if (marks.includes(spot)) {
      marks = marks.filter((each) => each !== spot);
      sfx.back();
      return;
    }
    if (latest.view.board[spot] !== EMPTY) return deny(WORDS.refused["spot-taken"]);
    if (marks.length >= rules.spots) return deny(WORDS.say.marksFull(rules.spots));
    const before = marks;
    marks = [...marks, spot];
    const lines = candidates();
    if (lines.length === 0) {
      marks = before;
      return deny(WORDS.refused["not-in-line"]);
    }
    // two ends marked, or the only room there is: the rest follows
    if (lines.length === 1 && marks.length > 1) marks = [...lines[0]];
    sfx.move();
  }

  /** Sends the spots marked, once they are as many as a round has. */
  function sendSpots(): void {
    if (latest === null || pending) return;
    if (marks.length < latest.rules.spots) return deny(WORDS.say.marksShort(latest.rules.spots - marks.length));
    const wrong = checkSpots(latest.view.board, marks, latest.rules);
    if (wrong !== null) return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
    pending = handlers.act({ type: "select", spots: [...marks].sort((a, b) => a - b) });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Puts `by` points more (or fewer) on spot `index` of the draft. */
  function raise(index: number, by: number): void {
    if (latest === null || draft[index] === undefined) return;
    focus = index;
    if (by > 0 && unbet() < by) return deny(WORDS.refused["bets-over"]);
    if (by < 0 && draft[index] + by < latest.rules.minBet) return deny(WORDS.refused["bet-too-low"]);
    draft[index] += by;
    sfx.move();
  }

  /** Sets the bet on the spot the keys are at to `points`, as far as the player's points go, and moves on to the next spot. */
  function write(points: number): void {
    if (latest === null || draft[focus] === undefined) return;
    const most = draft[focus] + unbet();
    if (points < latest.rules.minBet) return deny(WORDS.refused["bet-too-low"]);
    if (points > most) return deny(WORDS.refused["bets-over"]);
    draft[focus] = points;
    focus = (focus + 1) % draft.length;
    sfx.move();
  }

  function sendBets(): void {
    if (latest === null || pending || latest.view.mine === null) return;
    const wrong = checkBets(draft, latest.view.mine.points, latest.rules);
    if (wrong !== null) return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
    pending = handlers.act({ type: "bet", bets: [...draft] });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
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
    if (view.mine === null || latest.frozen || pending) return;

    if (selecting()) {
      const size = latest.rules.size;
      for (const code of keys) {
        const [x, y] = [cursor % size, Math.floor(cursor / size)];
        if (code === "ArrowLeft" && x > 0) cursor -= 1;
        else if (code === "ArrowRight" && x < size - 1) cursor += 1;
        else if (code === "ArrowUp" && y > 0) cursor -= size;
        else if (code === "ArrowDown" && y < size - 1) cursor += size;
        else if (code === "Space") mark(cursor);
        else if (code === "Enter" || code === "NumpadEnter") sendSpots();
        else if (code === "Escape" || code === "Backspace") marks = [];
        else continue;
        if (code.startsWith("Arrow") || code === "Space") keyed = true;
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) sendSpots();
        else if (hits(p, ERASE_RECT)) {
          if (marks.length > 0) sfx.back();
          marks = [];
        } else {
          const spot = spotAt(p.x, p.y);
          if (spot !== null) {
            keyed = false;
            mark(spot);
          }
        }
      }
      return;
    }
    if (!betting()) return;
    for (const code of keys) {
      if (code.startsWith("Num:")) write(Number(code.slice(4)));
      else if (code === "ArrowLeft") focus = (focus + draft.length - 1) % draft.length;
      else if (code === "ArrowRight" || code === "Tab") focus = (focus + 1) % draft.length;
      else if (code === "ArrowUp") raise(focus, 1);
      else if (code === "ArrowDown") raise(focus, -1);
      else if (code === "Enter" || code === "NumpadEnter") sendBets();
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (hits(p, MAIN_RECT)) sendBets();
      else
        draft.forEach((_, index) => {
          if (hits(p, betMinus(index), BET_REACH)) raise(index, -1);
          else if (hits(p, betPlus(index), BET_REACH)) raise(index, 1);
          else if (hits(p, betValue(index))) focus = index;
        });
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
      // my own time is nearly up: a tick a second
      const mine = selecting() || betting() ? left(latest.clock.turn) : null;
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

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** A stone of the player at place `who` of the order (0 black, 1 white), `r` pixels from its middle to its rim. */
  function stone(x: number, y: number, r: number, who: number): void {
    if (who === 0) {
      pen.ell(x, y, r, r, BLACK);
      pen.px(x - Math.max(1, r - 3), y - Math.max(1, r - 3), 2, 1, BLACK_SPECK);
    } else {
      pen.ell(x, y, r, r, WHITE_RIM);
      pen.ell(x, y, r - 1, r - 1, WHITE);
    }
  }

  /** The edge of a box `r` pixels round (`x`, `y`), a pixel thick. */
  function ring(x: number, y: number, r: number, colour: string): void {
    const side = r * 2 + 1;
    pen.px(x - r, y - r, side, 1, colour);
    pen.px(x - r, y + r, side, 1, colour);
    pen.px(x - r, y - r, 1, side, colour);
    pen.px(x + r, y - r, 1, side, colour);
  }

  function drawBoard(): void {
    if (latest === null) return;
    const view = latest.view;
    const g = grid();
    const span = g.pitch * (g.size - 1);
    pen.px(BOARD_X, BOARD_Y, BOARD_SPAN, BOARD_SPAN, WOOD_RIM);
    pen.px(BOARD_X + 1, BOARD_Y + 1, BOARD_SPAN - 2, BOARD_SPAN - 2, WOOD);
    for (let n = 0; n < g.size; n++) {
      pen.px(g.x, g.y + n * g.pitch, span + 1, 1, WOOD_LINE);
      pen.px(g.x + n * g.pitch, g.y, 1, span + 1, WOOD_LINE);
    }
    // the points a board is read by: its middle, and one near each corner
    if (g.size >= 13 && g.size % 2 === 1) {
      const far = g.size - 4;
      for (const [cx, cy] of [[3, 3], [far, 3], [(g.size - 1) / 2, (g.size - 1) / 2], [3, far], [far, far]]) pen.px(g.x + cx * g.pitch - 1, g.y + cy * g.pitch - 1, 3, 3, WOOD_LINE);
    }
    const flash = time - placedAt < FLASH;
    const won = new Set(view.lines.flat());
    [...view.board].forEach((cell, spot) => {
      const who = STONES.indexOf(cell);
      if (cell === EMPTY || who < 0) return;
      const [x, y] = pointOf(spot);
      stone(x, y, g.r, who);
      // the stones of the round just played: marked out for a moment, and by a speck until the next
      if (placed.includes(spot)) {
        if (flash && Math.floor(time * 5) % 2 === 0) ring(x, y, g.r, C.amber);
        else pen.px(x, y, 1, 1, who === 0 ? C.amber : C.crim);
      }
      if (won.has(spot) && Math.floor(time * 3) % 2 === 0) ring(x, y, g.r, C.teal);
    });
    // the round's spots, each under its letter
    (view.spots ?? []).forEach((spot, index) => {
      const [x, y] = pointOf(spot);
      const mine = betting() && index === focus;
      pen.px(x - g.r, y - g.r, g.r * 2 + 1, g.r * 2 + 1, mine ? C.amber : C.ink);
      // (the font's letters are higher than a spot of the board: these are drawn by the pixel)
      (SMALL_LETTERS[index] ?? []).forEach((row, dy) => {
        for (let dx = 0; dx < row.length; dx++) if (row[dx] === "#") pen.px(x - 2 + dx, y - 3 + dy, 1, 1, mine ? C.ink : C.amber);
      });
    });
    if (!selecting()) return;
    // what could still be marked along with the marks made, the marks themselves, and where the pointer or the keys are
    if (marks.length > 0 && marks.length < latest.rules.spots) {
      for (const spot of new Set(candidates().flat())) {
        if (marks.includes(spot)) continue;
        const [x, y] = pointOf(spot);
        pen.px(x - 1, y - 1, 3, 3, C.amberD);
      }
    }
    for (const spot of marks) {
      const [x, y] = pointOf(spot);
      pen.px(x - g.r + 1, y - g.r + 1, g.r * 2 - 1, g.r * 2 - 1, C.amberD);
      ring(x, y, g.r, C.amber);
    }
    const over = keyed ? cursor : mouse.x >= 0 ? spotAt(mouse.x, mouse.y) : null;
    if (over !== null && !pending) {
      const [x, y] = pointOf(over);
      ring(x, y, g.r, view.board[over] === EMPTY ? C.bone : C.crim);
    }
  }

  /** What stands to the left of the board. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    view.order.forEach((player, who) => {
      const y = LEGEND_Y + who * 14;
      stone(SIDE_X + 5, y + 6, 5, who);
      const selector = view.phase !== "ended" && view.selector === player;
      pen.txt(pen.fit(nickOf(player), SIDE_W - 16), SIDE_X + 14, y, mine === player ? C.amber : C.bone);
      if (selector) pen.px(SIDE_X - 3, y + 2, 2, 9, C.amber);
    });
    pen.px(SIDE_X, ROUND_Y - 4, SIDE_W, 1, C.steelDD);
    pen.txt(WORDS.side.round(view.round), SIDE_X, ROUND_Y, C.bone);
    if (view.phase !== "ended") pen.txt(pen.fit(WORDS.side.selector(pen.fit(nickOf(view.selector), 56)), SIDE_W), SIDE_X, ROUND_Y + 14, C.boneD);
    if (view.purses !== null) {
      // the game is over: what each had left
      pen.txt(WORDS.side.leftOver, SIDE_X, POINTS_Y, C.boneD);
      view.order.forEach((player, who) => {
        stone(SIDE_X + 5, POINTS_Y + 20 + who * 14, 5, who);
        pen.txt(`${view.purses?.find((each) => each.player === player)?.points ?? 0}`, SIDE_X + 14, POINTS_Y + 14 + who * 14, C.bone);
      });
    } else if (view.mine !== null) {
      pen.txt(WORDS.side.points, SIDE_X, POINTS_Y, C.boneD);
      pen.txt(`${view.mine.points}`, SIDE_X, POINTS_Y + 13, C.amber, "left", 24);
      const bets = view.mine.bets;
      if (bets !== null) pen.txt(pen.fit(bets.map((bet, index) => `${LETTERS[index]}${bet}`).join(" "), SIDE_W), SIDE_X, POINTS_Y + 42, C.teal);
    }
    // the round played last: whose stone went on each of its spots
    const last = view.log.at(-1);
    if (last === undefined) return;
    pen.txt(WORDS.side.last(last.round), SIDE_X, LAST_Y, C.boneD);
    last.owners.forEach((owner, index) => {
      const x = SIDE_X + index * 30;
      pen.txt(LETTERS[index] ?? "", x, LAST_Y + 14, C.bone);
      stone(x + 14, LAST_Y + 20, 5, view.order.indexOf(owner));
    });
    if (last.bets.length === 0) return;
    // and once the game is over, what each bet in it
    view.order.forEach((player, who) => {
      const bets = last.bets.find((each) => each.player === player)?.bets ?? [];
      stone(SIDE_X + 5, LAST_Y + 36 + who * 13, 4, who);
      pen.txt(pen.fit(bets.join(" · "), SIDE_W - 14), SIDE_X + 14, LAST_Y + 30 + who * 13, C.boneD);
    });
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
    if (pending) return [WORDS.standing.sending, C.boneD];
    if (view.phase === "select") {
      if (view.mine === null) return [WORDS.standing.selectOther(clock), C.bone];
      if (!selecting()) return [WORDS.standing.selectWait(clock), C.bone];
      const blank = latest.rules.spots - marks.length;
      return blank > 0 ? [WORDS.standing.select(latest.rules.spots, blank, clock), C.amber] : [WORDS.standing.selectReady(clock), C.teal];
    }
    if (view.mine === null) return [WORDS.standing.betOther(clock), C.bone];
    if (!betting()) return [WORDS.standing.betWait(clock), C.bone];
    return [WORDS.standing.bet(latest.rules.minBet, clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, view.phase), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order of their stones; at its end, of their places
    const order = view.places !== null ? view.places.map((each) => each.player) : view.order;
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const waited = view.phase === "select" ? view.selector === player : view.phase === "bet" && !view.ready.includes(player);
      // who the game waits for
      if (waited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const words =
        view.phase === "ended" ? (view.places === null ? "" : WORDS.result.outcome(view.winner === null ? "level" : view.winner === player ? "won" : "lost")) : view.phase === "select" ? (waited ? WORDS.status.selecting : "") : waited ? WORDS.status.betting : WORDS.status.done;
      pen.txt(words, right, y, view.phase === "ended" ? C.brass : waited ? C.boneD : C.teal, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      stone(ex + 4, y + 6, 4, view.order.indexOf(player));
      const room = right - ex - 12 - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex + 12, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + 12 + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    const short = (player: number): string => pen.fit(nickOf(player), LOG_NAME);
    const stoneOf = (player: number): string => WORDS.stone[view.order.indexOf(player) === 0 ? "black" : "white"];
    for (const event of view.history) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round, short(event.selector)), C.amber]);
      else if (event.type === "selected") lines.push([WORDS.log.selected(short(event.player), event.forced), C.boneD]);
      else if (event.type === "bet") lines.push([WORDS.log.bet(short(event.player), event.forced), C.boneD]);
      else if (event.type === "placed") lines.push([WORDS.log.placed(event.owners.map((owner, index) => `${LETTERS[index]} ${stoneOf(owner)}`).join(" · ")), C.bone]);
      else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** How the game came out for the player the screen is for: won, lost, or neither won; `null` while it is played, for someone who watched, and for a game cut short. */
  function outcome(): "won" | "lost" | "level" | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    return latest.view.winner === null ? "level" : latest.view.winner === mine ? "won" : "lost";
  }

  /** What this player came out of the game with, in the word the results lead with. */
  function verdict(): string | null {
    const own = outcome();
    return own === null ? null : WORDS.result.outcome(own);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const own = outcome();
    pen.txt(own === null ? WORDS.result.over : WORDS.result.outcome(own), 10, 234, own === "won" ? C.teal : C.bone, "left", 24);
    const named = view.winner === null ? (view.places === null ? "" : WORDS.result.nobody) : WORDS.result.winner(pen.fit(nickOf(view.winner), 120));
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(view.round, latest.rules.line) : WORDS.ended[view.ended];
    pen.txt(pen.fit(how, RESULT_WIDTH), 96, 240, C.boneD);
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
    if (view.mine === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    const live = !pending && !latest.frozen;
    if (selecting()) {
      button(MAIN_RECT, WORDS.button.confirm, live && marks.length === latest.rules.spots, live);
      button(ERASE_RECT, WORDS.button.clear, false, live && marks.length > 0);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.select, ERASE_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    if (betting()) {
      draft.forEach((bet, index) => {
        const value = betValue(index);
        button(betMinus(index), "-", false, live && bet > latest!.rules.minBet);
        button(betPlus(index), "+", false, live && unbet() > 0);
        pen.px(value[0], value[1], value[2], value[3], index === focus ? C.amber : C.steelDD);
        pen.px(value[0] + 1, value[1] + 1, value[2] - 2, value[3] - 2, C.btn);
        pen.txt(LETTERS[index] ?? "", value[0] + 4, value[1] + 7, C.amberD);
        pen.txt(`${bet}`, value[0] + value[2] - 5, value[1] + 7, C.bone, "right");
      });
      const over = unbet();
      const at = BET_X + draft.length * BET_STEP;
      pen.txt(pen.fit(WORDS.bar.unbet(over), MAIN_RECT[0] - at - 4), at, 239, over === 0 ? C.boneD : C.bone);
      pen.txt(pen.fit(WORDS.bar.carried(Math.floor(over / 2)), MAIN_RECT[0] - at - 4), at, 252, C.boneD);
      button(MAIN_RECT, WORDS.button.bet, live, live);
      return;
    }
    pen.txt(pen.fit(idle, MAIN_RECT[0] - 12), 6, 246, C.dim);
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
    waits: (): boolean => latest !== null && !latest.frozen && omokWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether what was sent reached the room is not known: the game the room sends on coming back will say
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

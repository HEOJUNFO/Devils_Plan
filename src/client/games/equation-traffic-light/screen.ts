/**
 * The screen of 수식 신호등: the answers of both players turn by turn, each
 * cell with its colour clue, the nine cells being written, and a keypad of
 * the numbers and symbols.
 *
 * Design: design/games/equation-traffic-light.md. The room decides
 * everything; this screen shows what it sends and asks it to take an
 * equation or an answer. The opponent's equation is not sent until the game
 * is over, so nothing hidden is here to be drawn. While an equation is
 * written the screen says whether it is one the rules allow, by the rules
 * the room holds it to (`rules.ts`). Everything can be done with the
 * pointer; the keys are another way to the same.
 *
 * A clue is shown twice, by colour and by shape: green a filled cell, yellow
 * an outlined one, red a dark one.
 */
import { SYMBOLS, checkEquation, shown, valueOf, type EqEvent, type EquationRefusal, type Row } from "../../../shared/games/equation-traffic-light/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { eqWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 수식 신호등. */
export type EqMessage = Extract<ServerMessage, { type: "game"; game: "equation-traffic-light" }>;
type View = EqMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface EqHandlers {
  /** The player created an equation or gave an answer. Returns whether it could be sent. */
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
export interface EqScreen {
  update(message: EqMessage): void;
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
/** The two boards of answers, under the page's own buttons, which lie over the top left of the scene; between them, the number of each turn. */
const BOARD_X = [8, 161];
const BOARD_CELL = 15;
const LABEL_Y = 30;
const ROWS_Y = 43;
const ROW_PITCH = 15;
/** How many turns are on the screen at a time: the latest, or earlier ones scrolled to. */
const ROWS_SHOWN = 7;
const TURN_X = 152;
/** The cells being written, what the screen says of them beside them, and the keypad under them. */
const ENTRY_X = 8;
const ENTRY_Y = 150;
const ENTRY_CELL = 22;
const CHECK_X = 212;
const PAD_X = 4;
const PAD_Y = 174;
const PAD_KEY: readonly [number, number] = [37, 24];
/** The keypad, a row of eight to a row: the numbers from 1, then the symbols. */
const PAD = "1234567890+-×÷^=";
/** A cell by its clue: the fill, the edge and the ink of green (filled), yellow (outlined) and red (dark). */
const CLUE: Record<string, readonly [fill: string, edge: string, ink: string]> = {
  g: ["#2fae78", "#8ff0c4", C.ink],
  y: [C.bar, C.amber, C.amber],
  r: ["#3a1820", "#3a1820", "#b98a90"],
};
/** The widest a name is drawn in the list of players, over a board and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const BOARD_NAME = 62;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for an answer. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const ERASE_RECT: Box = [270, 238, 90, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/**
 * The two buttons that scroll the boards, where there are more turns than
 * fit: beside the cells being written, where an equation's value is said
 * while it is created (there are no turns to scroll then).
 */
const UP_RECT: Box = [252, 151, 22, 20];
const DOWN_RECT: Box = [278, 151, 22, 20];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
const padBox = (index: number): Box => [PAD_X + (index % 8) * PAD_KEY[0], PAD_Y + Math.floor(index / 8) * PAD_KEY[1], PAD_KEY[0] - 2, PAD_KEY[1] - 2];

/** What a key of the keyboard writes: a number or symbol, by the letter the key types. */
const TYPED: Record<string, string> = { "*": "×", x: "×", X: "×", "×": "×", "/": "÷", "÷": "÷", "+": "+", "-": "-", "−": "-", "=": "=", "^": "^" };

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link EqScreen.update}. */
export function createEqScreen(canvas: HTMLCanvasElement, handlers: EqHandlers): EqScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: EqMessage | null = null;
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
  /** The cells written and not sent yet. */
  let draft = "";
  /** The player has sent their equation and is writing another. */
  let redo = false;
  /** How many turns back from the latest the boards are scrolled. */
  let scroll = 0;
  /** `time` when the latest turn's clues came: its row is marked out for a moment. */
  let shownAt = -10;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed: a key's code, or `Cell:` and what it writes. */
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
  /** The player whose answers the left board has: this player, or for someone watching the first of the two. */
  const leftPlayer = (view: View): number => view.you ?? view.players[0];
  const rightPlayer = (view: View): number => view.players.find((each) => each !== leftPlayer(view)) ?? view.players[0];
  /** Whether this player is writing: an equation that is not sent (or is being written again), or the turn's answer. */
  function writing(): boolean {
    if (latest === null || latest.frozen || latest.view.mine === null) return false;
    const view = latest.view;
    if (view.phase === "create") return redo || view.mine?.equation === null;
    return view.phase === "guess" && view.mine?.answer === null;
  }
  /** What the cells being written are, as an equation: `ok`, or why they are not one. */
  function checked(): EquationRefusal | "ok" {
    return latest === null ? "wrong-length" : (checkEquation(draft, latest.rules) ?? "ok");
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
  function show(event: EqEvent): void {
    const mine = me();
    if (event.type === "round") {
      if (event.round > 1) {
        say(WORDS.say.again);
        sfx.swap();
      }
    } else if (event.type === "created") {
      if (event.forced) say(event.player === mine ? WORDS.say.createdForYou : WORDS.say.createdForThem(pen.fit(nickOf(event.player), NAME_WIDTH)));
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "answered") {
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "clues") {
      shownAt = time;
      scroll = 0;
      if (mine !== null && event.missed.includes(mine)) say(WORDS.say.noClues);
      sfx.pick();
    } else if (event.type === "ended") {
      const own = latest?.view.places?.find((each) => each.player === mine);
      if (own !== undefined && own.place === 1) sfx.win();
      else sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: EqMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      scroll = 0;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.turn !== message.view.turn || latest.view.round !== message.view.round;
    // another step: what was written for the last is put away
    if (fresh || moved) {
      draft = "";
      redo = false;
    }
    const waited = writing();
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) {
      if (pending) {
        draft = "";
        redo = false;
      }
      pending = false;
    }
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player: an equation to create, or a turn to answer
    if (!waited && writing() && !fresh && moved) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Writes `cell` in the next empty cell. */
  function write(cell: string): void {
    if (latest === null || !SYMBOLS.includes(cell)) return;
    if ([...draft].length >= latest.rules.cells) return deny(WORDS.say.full);
    draft += cell;
    sfx.move();
  }

  function erase(): void {
    if (draft === "") return;
    draft = [...draft].slice(0, -1).join("");
    sfx.back();
  }

  /** Sends what is written: an equation where it is one the rules allow, or the turn's answer once every cell is filled. */
  function send(): void {
    if (latest === null || pending) return;
    const view = latest.view;
    if ([...draft].length < latest.rules.cells) return deny(WORDS.refused["wrong-length"]);
    if (view.phase === "create") {
      const wrong = checked();
      if (wrong !== "ok") return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
      pending = handlers.act({ type: "create", equation: draft });
    } else pending = handlers.act({ type: "answer", cells: draft });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** How many turns the boards can be scrolled back. */
  const scrollMost = (view: View): number => Math.max(0, view.rows.length + (view.phase === "guess" ? 1 : 0) - ROWS_SHOWN);

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
    // the boards scroll at any time, also once the game is over
    const most = scrollMost(view);
    if (pressed("ArrowUp") || clicked(UP_RECT, 6)) scroll = Math.min(most, scroll + 1);
    if (pressed("ArrowDown") || clicked(DOWN_RECT, 6)) scroll = Math.max(0, scroll - 1);
    scroll = Math.min(scroll, most);

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

    if (!writing()) {
      // an equation that is sent can be written again while the opponent's is not in
      if (view.phase === "create" && (pressed("Enter", "NumpadEnter") || clicked(MAIN_RECT))) {
        draft = view.mine.equation ?? "";
        redo = true;
        sfx.move();
      }
      return;
    }
    for (const code of keys) {
      if (code.startsWith("Cell:")) write(code.slice(5));
      else if (code === "Backspace" || code === "Delete") erase();
      else if (code === "Enter" || code === "NumpadEnter") send();
      else if (code === "Escape") draft = "";
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (hits(p, MAIN_RECT)) send();
      else if (hits(p, ERASE_RECT)) erase();
      else [...PAD].forEach((cell, index) => {
        if (hits(p, padBox(index))) write(cell);
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
      const mine = writing() ? left(latest.clock.turn) : null;
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

  /** One cell of an answer at (`x`, `y`), `size` wide: the number or symbol, on its clue (`g`, `y`, `r`; anything else for none yet). */
  function drawCell(x: number, y: number, size: number, height: number, cell: string, clue: string): void {
    const [fill, edge, ink] = CLUE[clue] ?? [C.btn, C.steelDD, C.bone];
    pen.px(x, y, size - 1, height - 1, edge);
    pen.px(x + 1, y + 1, size - 3, height - 3, fill);
    if (cell !== "") pen.txt(cell, x + Math.floor((size - 1) / 2) + 1, y + Math.round((height - 14) / 2), ink, "center");
  }

  /** One board: the answers of `player`, turn by turn, each cell on its clue. */
  function drawBoard(view: View, player: number, x: number, rows: readonly (Row | null)[]): void {
    const cells = latest?.rules.cells ?? 0;
    rows.forEach((row, at) => {
      const y = ROWS_Y + at * ROW_PITCH;
      if (row === null) {
        // the turn being played: whether this player's answer is in
        const done = view.ready.includes(player);
        for (let cell = 0; cell < cells; cell++) {
          pen.px(x + cell * BOARD_CELL, y, BOARD_CELL - 1, ROW_PITCH - 1, done ? C.steelD : C.steelDD);
          pen.px(x + cell * BOARD_CELL + 1, y + 1, BOARD_CELL - 3, ROW_PITCH - 3, done ? C.btnH : C.night);
        }
        return;
      }
      const answer = row.answers.find((each) => each.player === player);
      if (answer === undefined || answer.cells === null) {
        pen.txt(WORDS.board.noAnswer, x + Math.round((cells * BOARD_CELL) / 2), y + 1, C.dim, "center");
        return;
      }
      const written = [...answer.cells];
      const fresh = row.turn === view.rows.at(-1)?.turn && time - shownAt < 1.6 && Math.floor(time * 6) % 2 === 0;
      for (let cell = 0; cell < cells; cell++) drawCell(x + cell * BOARD_CELL, y, BOARD_CELL, ROW_PITCH, written[cell] ?? "", fresh ? "" : (answer.clues?.[cell] ?? ""));
    });
  }

  function drawBoards(): void {
    if (latest === null) return;
    const view = latest.view;
    const [a, b] = [leftPlayer(view), rightPlayer(view)];
    const secretOf = (player: number): string | undefined => view.secrets?.find((each) => each.player === player)?.equation;
    // over each board: whose answers they are, and the equation they are answers to once it may be shown
    const width = (latest.rules.cells * BOARD_CELL) | 0;
    const over = (player: number, other: number, mine: boolean): [string, string] => {
      const aimed = secretOf(other);
      if (aimed !== undefined) return [WORDS.board.answerWas(aimed), C.brass];
      if (view.you === null) return [WORDS.board.of(pen.fit(nickOf(player), BOARD_NAME)), C.boneD];
      if (mine) return [WORDS.board.mine, C.amber];
      const own = view.mine?.equation;
      return own === null || own === undefined ? [WORDS.board.theirs, C.boneD] : [WORDS.board.secret(own), C.boneD];
    };
    [a, b].forEach((player, side) => {
      const [words, colour] = over(player, side === 0 ? b : a, side === 0);
      pen.txt(pen.fit(words, width), BOARD_X[side] ?? 0, LABEL_Y, colour);
    });
    // the turns on the screen: the latest, with the turn being played under them, or earlier ones scrolled to
    const all: (Row | null)[] = [...view.rows, ...(view.phase === "guess" ? [null] : [])];
    const end = all.length - scroll;
    const rows = all.slice(Math.max(0, end - ROWS_SHOWN), end);
    rows.forEach((row, at) => {
      const turn = row === null ? view.turn : row.turn;
      pen.txt(`${turn}`, TURN_X, ROWS_Y + at * ROW_PITCH + 1, row === null ? C.amber : C.dim, "center");
    });
    drawBoard(view, a, BOARD_X[0] ?? 0, rows);
    drawBoard(view, b, BOARD_X[1] ?? 0, rows);
    // more turns than fit: the two buttons that go back through them, and forward again
    const most = scrollMost(view);
    if (most > 0) {
      button(UP_RECT, "▲", false, scroll < most);
      button(DOWN_RECT, "▼", false, scroll > 0);
    }
  }

  /** The cells being written, or what this player has sent, with what the screen makes of an equation beside them. */
  function drawEntry(): void {
    if (latest === null) return;
    const view = latest.view;
    if (view.mine === null || view.phase === "ended") return;
    const active = writing();
    const sent = view.phase === "create" ? view.mine.equation : view.mine.answer;
    const written = [...(active ? draft : (sent ?? ""))];
    const cells = latest.rules.cells;
    for (let cell = 0; cell < cells; cell++) {
      const x = ENTRY_X + cell * ENTRY_CELL;
      const next = active && cell === written.length;
      pen.px(x, ENTRY_Y, ENTRY_CELL - 2, ENTRY_CELL, next ? C.amber : active ? C.steel : C.steelDD);
      pen.px(x + 1, ENTRY_Y + 1, ENTRY_CELL - 4, ENTRY_CELL - 2, active ? C.btnH : C.btn);
      const value = written[cell];
      if (value !== undefined) pen.txt(value, x + Math.floor((ENTRY_CELL - 2) / 2) + 1, ENTRY_Y + 5, active ? C.bone : C.boneD, "center");
      else if (next && Math.floor(time * 2) % 2 === 0) pen.px(x + 4, ENTRY_Y + ENTRY_CELL - 5, ENTRY_CELL - 10, 1, C.amber);
    }
    // while an equation is written: the value of each side, and whether it is one the rules allow
    if (view.phase !== "create" || !active || written.length === 0) return;
    const value = (side: string): string => {
      const worked = side === "" ? null : valueOf(side, latest!.rules.maxDigits);
      return worked === null ? "?" : shown(worked);
    };
    const room = SCENE_W - CHECK_X - 4;
    pen.txt(pen.fit(draft.split("=").map(value).join(" = "), room), CHECK_X, ENTRY_Y - 1, C.boneD);
    const check = checked();
    if (WORDS.check[check] !== "") pen.txt(pen.fit(WORDS.check[check], room), CHECK_X, ENTRY_Y + 11, check === "ok" ? C.teal : C.crim);
  }

  function drawPad(): void {
    if (latest === null) return;
    const live = writing() && !pending;
    [...PAD].forEach((cell, index) => {
      const box = padBox(index);
      pen.px(box[0], box[1], box[2], box[3], live && inRect(mouse, box) ? C.bone : C.steelDD);
      pen.px(box[0] + 1, box[1] + 1, box[2] - 2, box[3] - 2, live ? C.btnH : C.btn);
      pen.txt(cell, box[0] + Math.round(box[2] / 2), box[1] + Math.round((box[3] - 14) / 2), live ? C.bone : C.dim, "center");
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawBoards();
    if (view.mine !== null && view.phase !== "ended") {
      drawEntry();
      drawPad();
    }
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
    const blank = latest.rules.cells - [...draft].length;
    if (view.phase === "create") {
      if (view.mine === null) return [WORDS.standing.createOther(clock), C.bone];
      if (!writing()) return [WORDS.standing.created(clock), C.bone];
      if (blank > 0) return [WORDS.standing.create(blank, clock), C.amber];
      const check = checked();
      return check === "ok" ? [WORDS.standing.createReady(clock), C.teal] : [WORDS.standing.createWrong(WORDS.refused[check] ?? WORDS.refusedOther, clock), C.crim];
    }
    if (view.mine === null) return [WORDS.standing.guessOther(clock), C.bone];
    if (!writing()) return [WORDS.standing.guessed(clock), C.bone];
    return [blank > 0 ? WORDS.standing.guess(blank, clock) : WORDS.standing.guessReady(clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, view.turn), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order of their numbers; at its end, of their places
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
      const done = view.ready.includes(player);
      // who the game waits for
      if (view.phase !== "ended" && !done) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const words = place !== undefined ? WORDS.result.verdict(true, place) : view.phase === "ended" ? "" : done ? WORDS.status.done : WORDS.status.writing;
      pen.txt(words, right, y, place !== undefined ? C.brass : done ? C.teal : C.boneD, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - ex - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    const short = (player: number): string => pen.fit(nickOf(player), LOG_NAME);
    for (const event of view.history) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round), C.amber]);
      else if (event.type === "created") lines.push([WORDS.log.created(short(event.player), event.forced), C.boneD]);
      else if (event.type === "answered") lines.push([WORDS.log.answered(short(event.player)), C.boneD]);
      else if (event.type === "clues") {
        lines.push([WORDS.log.clues(event.turn), C.bone]);
        for (const player of event.missed) lines.push([WORDS.log.missed(short(player)), C.dim]);
        for (const player of event.solved) lines.push([WORDS.log.solved(short(player)), C.teal]);
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

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, for someone who watched, and for a game cut short. */
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
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? null), 10, 234, own !== undefined && own.place === 1 ? C.teal : C.bone, "left", 24);
    const named = places.map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 80))).join(" · ");
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(view.turn) : WORDS.ended[view.ended];
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
    if (writing()) {
      const full = [...draft].length === latest.rules.cells && (view.phase !== "create" || checked() === "ok");
      button(MAIN_RECT, WORDS.button.send, live && full, live);
      button(ERASE_RECT, WORDS.button.erase, false, live && draft !== "");
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.write, ERASE_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    if (view.phase === "create") button(MAIN_RECT, WORDS.button.redo, false, live);
    pen.txt(pen.fit(idle, MAIN_RECT[0] - 12), 6, 246, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help(latest.rules);
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
    // a number or symbol is taken by the letter the key types, wherever a keyboard has it; anything else by the key itself
    const cell = event.key.length === 1 && "0123456789".includes(event.key) ? event.key : TYPED[event.key];
    if (cell !== undefined && !event.ctrlKey && !event.metaKey && !event.altKey) keys.push(`Cell:${cell}`);
    else if (!event.repeat || event.code.startsWith("Arrow") || event.code === "Backspace") keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace" || event.key === "/") event.preventDefault();
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
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    verdict,
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && eqWaits(latest.view),
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

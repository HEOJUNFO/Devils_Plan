/**
 * The screen of 돼지 저금통: every player's table with its two shelves and
 * the banks on them, what was just put in and asked, and the controls for
 * whatever the game waits on this player for.
 *
 * Design: design/games/piggy-bank.md. The room decides everything; this
 * screen shows what it sends and asks it to take a move. The room never
 * sends what a bank holds, nor a record of what was put in: what was said
 * is on the screen while its question is open and gone after, so there is
 * nothing here to look up. Played with the pointer or a finger, or with the
 * keys the bar names.
 */
import type { Colour, PiggyEvent, Shelf } from "../../../shared/games/piggy-bank/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { piggyWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, watchPointer, RESULTS_PRESS_HOLD } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 돼지 저금통. */
export type PiggyMessage = Extract<ServerMessage, { type: "game"; game: "piggy-bank" }>;

/** What the screen asks of whoever owns the connection. */
export interface PiggyHandlers {
  /** The player asked something of the game. Returns whether it could be sent. */
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
  /** Whether this is the player's first game of 돼지 저금통 (`GameHandlers.first`): the bar then says what the counting is for. */
  first: boolean;
}

/** The game screen. */
export interface PiggyScreen {
  update(message: PiggyMessage): void;
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
/** The tables: where the first row starts under the page's own buttons, how high one is, and the gap between two. */
const DESKS_Y = 24;
const DESK_H = 58;
const DESK_GAP = 4;
/** With more players than this the tables are in two rows of three. */
const ONE_ROW = 4;
/** A line of the scene under the tables, in pixels. */
const LINE = 15;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 110;
/** With this many seconds or fewer left of a time that is this player's, the clock turns red and each second is ticked aloud. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a move as the game ended. */
const RESULTS_HOLD = 1.5;
/** How many of the first places the results name in the bar. */
const PLACES_SHOWN = 3;
/** Seconds within which a second press of the reset button asks for the reset. */
const RESET_ARM = 3;
/** Seconds within which a second digit is the second figure of the same number. */
const TYPING = 1.2;
/** A challenge: where the boxes for what is named start, how far apart their two rows are, and where the rows of what the banks held start. */
const FIELDS_X = 72;
const FIELDS_Y = 66;
const FIELD_PITCH = 24;
const HELD_Y = 126;
/** A piggy bank and its shades, and the two coins. */
const PIG = "#e58fa3";
const PIG_D = "#b05f78";
const COIN_BLACK = "#23263a";
const COIN_WHITE = "#efe6cc";

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The one button of the bar, and the two where there is a choice. */
const ONE_RECT: Box = [372, 238, 104, 28];
const FIRST_RECT: Box = [372, 226, 104, 19];
const SECOND_RECT: Box = [372, 248, 104, 18];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** The reset button, at the top right of the scene. */
const RESET_RECT: Box = [SCENE_W - 88, 4, 84, 15];
/** How far beyond a small button a finger still presses it. */
const SMALL_REACH: Reach = 4;

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link PiggyScreen.update}. */
export function createPiggyScreen(canvas: HTMLCanvasElement, handlers: PiggyHandlers): PiggyScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: PiggyMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
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
  /** The step of the game the controls below are set for: a new step starts them afresh. */
  let step = "";
  /** What this player is about to put in, to whom, and which colour the keys change. */
  const coins: Record<Colour, number> = { black: 0, white: 0 };
  let receiver: number | null = null;
  let colour: Colour = "black";
  /** The answer being set, and `time` when a digit of it was last typed. */
  let count = 0;
  let typedAt = -10;
  /** What a challenger has named so far, by bank; the box the keys change, counted along the banks and then black before white. */
  let named = new Map<number, Record<Colour, number>>();
  let field = 0;
  /** `time` when the reset button was first pressed; a second press soon after asks for it. */
  let armedAt = -10;
  /** `time` when the game on show was first seen to be over. */
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
  const name = (player: number, width = 60): string => pen.fit(nickOf(player), width);
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const seconds = (): number => Math.ceil((left(latest?.clock.phase ?? null) ?? 0) / 1000);
  const me = (): number | null => latest?.view.you ?? null;
  const shelfOf = (player: number | null): Shelf | undefined => latest?.view.shelves.find((each) => each.player === player);
  const isGone = (player: number): boolean => latest?.view.gone.includes(player) ?? false;
  /** Whether the game is on and not standing still, so that a move could be taken. */
  const live = (): boolean => latest !== null && latest.view.phase !== "ended" && !latest.frozen && !pending;
  /** What the game waits on this player for, if anything. */
  function mine(): "put" | "answer" | "suspect" | "call" | "challenge" | null {
    if (latest === null || latest.frozen) return null;
    const view = latest.view;
    const you = view.you;
    if (you === null) return null;
    if (view.phase === "put") return view.turn === you ? "put" : null;
    if (view.phase === "answer") return view.question?.player === you ? "answer" : null;
    if (view.phase === "suspect") return view.question?.player !== you && !view.passed.includes(you) ? "suspect" : null;
    if (view.phase === "call") return shelfOf(you)?.reset === false && !view.passed.includes(you) ? "call" : null;
    if (view.phase === "challenge") return view.challenge?.player === you ? "challenge" : null;
    return null;
  }
  /** The others a bank could be passed to, in the order of the tables. */
  const receivers = (): number[] => (latest === null ? [] : latest.view.order.filter((player) => player !== me() && !isGone(player)));

  // ---- Where things are ------------------------------------------------------------------------------
  /** How many tables are in a row, and how wide one is. */
  function deskGrid(): { cols: number; w: number; rows: number } {
    const n = latest?.view.order.length ?? ONE_ROW;
    const cols = n <= ONE_ROW ? n : Math.ceil(n / 2);
    return { cols, w: Math.floor((SCENE_W - 8 - (cols - 1) * DESK_GAP) / cols), rows: Math.ceil(n / cols) };
  }
  /** The table of the player at `index` of the order. */
  function deskRect(index: number): Box {
    const { cols, w } = deskGrid();
    return [4 + (index % cols) * (w + DESK_GAP), DESKS_Y + Math.floor(index / cols) * (DESK_H + DESK_GAP), w, DESK_H];
  }
  /** The top of the lines under the tables. */
  const linesTop = (): number => DESKS_Y + deskGrid().rows * (DESK_H + DESK_GAP) + 4;
  /** The two small buttons round a number at `x`, `y`: less, and more. */
  const lessRect = (x: number, y: number): Box => [x, y - 3, 18, 18];
  const moreRect = (x: number, y: number): Box => [x + 44, y - 3, 18, 18];
  /** Where each colour's number is set while putting, and the answer's while answering. */
  const stepperAt = (which: Colour | "answer"): [number, number] => [which === "white" ? 210 : which === "black" ? 112 : 112, linesTop() + (which === "answer" ? 3 * LINE + 2 : 2)];
  /** The boxes of a challenge: one for each colour of each bank in play. */
  function fieldRect(at: number): Box {
    const banks = latest?.view.banks.length ?? 1;
    const w = Math.min(40, Math.floor((SCENE_W - FIELDS_X - 4) / banks));
    return [FIELDS_X + Math.floor(at / 2) * w, FIELDS_Y + (at % 2) * FIELD_PITCH, w - 4, 18];
  }
  const CHALLENGE_LESS: Box = [FIELDS_X + 24, HELD_Y, 48, 22];
  const CHALLENGE_MORE: Box = [FIELDS_X + 88, HELD_Y, 48, 22];

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound for it. What it was is in the scene and the column. */
  function show(event: PiggyEvent): void {
    const you = me();
    if (event.type === "dealt") sfx.turn();
    else if (event.type === "put") sfx.chip();
    else if (event.type === "answered") (event.silent ? sfx.back : sfx.pick)();
    else if (event.type === "trusted") sfx.move();
    else if (event.type === "suspected") {
      if (event.right && event.by === you) sfx.earn();
      else if (event.loser === you) sfx.deny();
      else sfx.look();
    } else if (event.type === "reset-asked") sfx.click();
    else if (event.type === "reset") sfx.swap();
    else if (event.type === "challenge") sfx.call();
    else if (event.type === "challenged") {
      if (event.player !== you) sfx.look();
      else if (event.right) sfx.earn();
      else sfx.deny();
    } else if (event.type === "ended" && you !== null) {
      const place = latest?.view.standings.find((each) => each.player === you)?.place;
      if (event.reason === "target") (place === 1 ? sfx.win : sfx.lose)();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  /** Sends a move, once: nothing more is taken until the room has answered. */
  function send(action: unknown): boolean {
    if (!live()) return false;
    pending = handlers.act(action);
    if (!pending) say(WORDS.notSent);
    return pending;
  }

  function update(message: PiggyMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      speech.clear();
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const now = `${message.startedAt}:${message.view.step}`;
    if (now !== step) {
      // the game waits for something new: the controls start afresh
      step = now;
      coins.black = 0;
      coins.white = 0;
      colour = "black";
      receiver = null;
      count = 0;
      typedAt = -10;
      named = new Map(message.view.banks.map((id) => [id, { black: 0, white: 0 }]));
      field = 0;
    }
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** One more or one fewer coin of `which` to put in, within what a turn may put. */
  function changeCoins(which: Colour, by: number): void {
    if (latest === null) return;
    const next = coins[which] + by;
    if (next < 0) return;
    if (coins.black + coins.white + by > latest.rules.putMax) {
      say(WORDS.say.tooMany(latest.rules.putMax));
      sfx.deny();
      return;
    }
    coins[which] = next;
    colour = which;
    sfx.move();
  }

  function pass(): void {
    if (latest === null) return;
    if (coins.black + coins.white < latest.rules.putMin) {
      say(WORDS.say.noCoins);
      sfx.deny();
      return;
    }
    if (receiver === null) {
      say(WORDS.say.pickReceiver);
      sfx.deny();
      return;
    }
    send({ type: "put", black: coins.black, white: coins.white, to: receiver });
  }

  /** A number changed by `by`, or by a digit typed: a second digit soon after the first is the number's second figure. */
  function changed(value: number, by: number, digit: number | null): number {
    const most = latest?.rules.countMost ?? 99;
    if (digit === null) return Math.max(0, Math.min(most, value + by));
    const joined = time - typedAt <= TYPING ? value * 10 + digit : digit;
    typedAt = time;
    return joined > most ? digit : joined;
  }

  /** The digit a key types, or `null`. */
  function digitOf(code: string): number | null {
    const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
    return match === null ? null : Number(match[1]);
  }

  function pressReset(): void {
    if (latest === null || me() === null) return;
    const view = latest.view;
    if (latest.frozen) return say(WORDS.say.paused);
    if (shelfOf(me())?.reset === true) return say(WORDS.refused["reset-asked"]);
    if (!["put", "answer", "suspect"].includes(view.phase)) return say(WORDS.refused["no-reset"]);
    if (time - armedAt > RESET_ARM) {
      // it cannot be taken back: the first press only says so
      armedAt = time;
      say(WORDS.resetArmed);
      sfx.move();
      return;
    }
    armedAt = -10;
    send({ type: "reset" });
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
    if (me() === null) return;
    if (pressed("KeyR") || clicked(RESET_RECT, SMALL_REACH)) pressReset();
    const what = mine();
    if (what === null || pending) return;
    const enter = pressed("Enter", "NumpadEnter");

    if (what === "put") {
      const others = receivers();
      for (const code of keys) {
        if (code === "ArrowUp") changeCoins(colour, 1);
        else if (code === "ArrowDown") changeCoins(colour, -1);
        else if (code === "Space") {
          colour = colour === "black" ? "white" : "black";
          sfx.move();
        } else if ((code === "ArrowLeft" || code === "ArrowRight") && others.length > 0) {
          const at = receiver === null ? -1 : others.indexOf(receiver);
          receiver = others[code === "ArrowRight" ? (at + 1) % others.length : (at <= 0 ? others.length : at) - 1];
          sfx.move();
        }
      }
      for (const which of ["black", "white"] as const) {
        const [x, y] = stepperAt(which);
        if (clicked(lessRect(x, y), SMALL_REACH)) changeCoins(which, -1);
        if (clicked(moreRect(x, y), SMALL_REACH)) changeCoins(which, 1);
      }
      view.order.forEach((player, index) => {
        if (others.includes(player) && clicks.some((p) => inRect(p, deskRect(index)))) {
          receiver = player;
          sfx.move();
        }
      });
      if (enter || clicked(ONE_RECT)) pass();
    } else if (what === "answer") {
      for (const code of keys) {
        const digit = digitOf(code);
        if (code === "ArrowUp") count = changed(count, 1, null);
        else if (code === "ArrowDown") count = changed(count, -1, null);
        else if (code === "Backspace") count = 0;
        else if (digit !== null) count = changed(count, 0, digit);
      }
      const [x, y] = stepperAt("answer");
      if (clicked(lessRect(x, y), SMALL_REACH)) count = changed(count, -1, null);
      if (clicked(moreRect(x, y), SMALL_REACH)) count = changed(count, 1, null);
      if (enter || clicked(ONE_RECT)) send({ type: "answer", count });
    } else if (what === "suspect" || what === "call") {
      if (pressed("Space") || clicked(FIRST_RECT)) send({ type: what === "suspect" ? "suspect" : "challenge" });
      else if (enter || clicked(SECOND_RECT)) send({ type: "pass" });
    } else {
      const fields = view.banks.length * 2;
      const set = (by: number, digit: number | null): void => {
        const bank = named.get(view.banks[Math.floor(field / 2)]);
        if (bank === undefined) return;
        const which: Colour = field % 2 === 0 ? "black" : "white";
        bank[which] = changed(bank[which], by, digit);
      };
      for (const code of keys) {
        const digit = digitOf(code);
        if (code === "ArrowRight") field = (field + 2) % fields;
        else if (code === "ArrowLeft") field = (field - 2 + fields) % fields;
        else if (code === "ArrowDown" && field % 2 === 0) field += 1;
        else if (code === "ArrowUp" && field % 2 === 1) field -= 1;
        else if (code === "ArrowUp") set(1, null);
        else if (code === "ArrowDown") set(-1, null);
        else if (code === "Equal" || code === "NumpadAdd") set(1, null);
        else if (code === "Minus" || code === "NumpadSubtract") set(-1, null);
        else if (digit !== null) set(0, digit);
        if (code.startsWith("Arrow")) typedAt = -10;
      }
      for (let at = 0; at < fields; at++) {
        if (clicks.some((p) => hits(p, fieldRect(at), 2))) {
          field = at;
          typedAt = -10;
        }
      }
      if (clicked(CHALLENGE_LESS)) set(-1, null);
      if (clicked(CHALLENGE_MORE)) set(1, null);
      if (enter || clicked(ONE_RECT)) send({ type: "name", banks: view.banks.map((id) => ({ id, ...(named.get(id) ?? { black: 0, white: 0 }) })) });
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function tick(): void {
    time += STEP;
    if (noteT > 0) noteT -= STEP;
    for (const [player, line] of speech) {
      line.t -= STEP;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // a time that is mine is nearly up: a tick a second
      const what = mine();
      const second = what === "put" || what === "answer" || what === "challenge" ? seconds() : null;
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
  /** A line round a box, `thick` pixels wide, inside its edge. */
  function frame(box: Box, colour: string, thick = 1): void {
    const [x, y, w, h] = box;
    pen.px(x, y, w, thick, colour);
    pen.px(x, y + h - thick, w, thick, colour);
    pen.px(x, y, thick, h, colour);
    pen.px(x + w - thick, y, thick, h, colour);
  }

  /** A coin, nine pixels across. */
  function drawCoin(x: number, y: number, which: Colour): void {
    pen.ell(x + 4, y + 4, 4, 4, which === "black" ? C.steel : C.boneD);
    pen.ell(x + 4, y + 4, 3, 3, which === "black" ? COIN_BLACK : COIN_WHITE);
  }

  /** A piggy bank, twenty pixels wide and fourteen high, with its number beside it. */
  function drawPig(x: number, y: number, id: number, lit: boolean): void {
    if (lit) pen.ell(x + 9, y + 7, 10, 7, C.amber);
    pen.px(x + 4, y, 3, 4, PIG_D);
    pen.px(x + 4, y + 11, 2, 3, PIG_D);
    pen.px(x + 12, y + 11, 2, 3, PIG_D);
    pen.ell(x + 9, y + 7, 8, 5, PIG);
    pen.px(x + 17, y + 5, 3, 4, PIG_D);
    pen.px(x + 13, y + 5, 1, 1, C.ink);
    pen.px(x + 7, y + 3, 5, 1, C.ink);
    pen.txt(WORDS.bank(id), x + 23, y + 1, lit ? C.amber : C.bone);
  }

  function button(rect: Box, label: string, lit: boolean, on: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : on && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : on ? C.bone : C.dim, "center");
  }

  /** A number between a button for less and a button for more. */
  function stepper(x: number, y: number, value: number, lit: boolean): void {
    button(lessRect(x, y), "-", false, true);
    button(moreRect(x, y), "+", false, true);
    pen.txt(`${value}`, x + 31, y, lit ? C.amber : C.bone, "center");
  }

  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  /** The tables, each with its player's name and points and the banks on its two shelves. */
  function drawDesks(): void {
    if (latest === null) return;
    const view = latest.view;
    const what = mine();
    view.order.forEach((player, index) => {
      const box = deskRect(index);
      const [x, y, w] = box;
      const shelf = shelfOf(player);
      if (shelf === undefined) return;
      const info = latest!.players.find((one) => one.id === player);
      const away = isGone(player) || info?.left === true || info?.connected === false;
      const waited = view.phase === "put" || view.phase === "answer" ? view.turn === player : view.phase === "challenge" && view.challenge?.player === player;
      const chosen = what === "put" && receiver === player;
      const offered = what === "put" && receivers().includes(player);
      pen.px(x, y, w, DESK_H, C.wallD);
      frame(box, chosen ? C.teal : waited ? C.amber : offered && inRect(mouse, box) ? C.steel : C.steelDD, chosen || waited ? 2 : 1);
      const points = WORDS.signed(shelf.score);
      pen.txt(points, x + w - 4, y + 2, shelf.score > 0 ? C.teal : shelf.score < 0 ? C.crim : C.boneD, "right");
      pen.txt(pen.fit(info?.nick ?? "", w - 10 - pen.width(points)), x + 4, y + 2, away ? C.dim : me() === player ? C.amber : C.bone);
      // the two shelves: a board each, and the bank standing on it
      // (the upper one is the top shelf: nothing but where it is says so)
      ([[shelf.top, 16], [shelf.bottom, 37]] as const).forEach(([id, dy]) => {
        pen.px(x + 3, y + dy + 16, w - 6, 2, C.woodD);
        if (id !== null) drawPig(x + Math.round((w - 24 - pen.width(WORDS.bank(id))) / 2), y + dy + 1, id, view.question?.bank === id);
      });
      // asked for a reset; said they declare nothing
      if (shelf.reset) pen.txt("R", x + 4, y + 17, C.crim);
      if ((view.phase === "suspect" || view.phase === "call") && view.passed.includes(player)) pen.txt("-", x + 4, y + 38, C.dim);
    });
  }

  /** Under the tables: what was said and asked, and what the game waits on this player for. */
  function drawLines(): void {
    if (latest === null) return;
    const view = latest.view;
    const what = mine();
    const top = linesTop();
    const x = 8;
    const room = SCENE_W - 16;
    if (what === "put") {
      pen.txt(WORDS.scene.put, x, top + 2, C.bone);
      for (const which of ["black", "white"] as const) {
        const [sx, sy] = stepperAt(which);
        drawCoin(sx - 13, sy + 2, which);
        stepper(sx, sy, coins[which], colour === which && !TOUCH);
      }
      pen.txt(pen.fit(receiver === null ? WORDS.scene.noReceiver : WORDS.scene.to(name(receiver, 120)), room), x, top + 2 + LINE + 8, receiver === null ? C.boneD : C.teal);
      pen.txt(WORDS.scene.next(WORDS.colour[view.ask]), x, top + 2 + 2 * LINE + 8, C.boneD);
      drawCoin(x + pen.width(WORDS.scene.next(WORDS.colour[view.ask])) + 5, top + 4 + 2 * LINE + 8, view.ask);
      return;
    }
    if (view.phase === "put") {
      pen.txt(WORDS.scene.next(WORDS.colour[view.ask]), x, top + 2, C.boneD);
      drawCoin(x + pen.width(WORDS.scene.next(WORDS.colour[view.ask])) + 5, top + 4, view.ask);
      return;
    }
    if (view.phase === "call") {
      pen.txt(WORDS.scene.resetSettled, x, top + 2, C.amber);
      return;
    }
    let y = top + 2;
    if (view.said !== null) {
      const said = view.said;
      pen.txt(pen.fit(WORDS.scene.said(name(said.player), said.bank, said.black, said.white, name(said.to)), room), x, y, C.amber);
      y += LINE;
    }
    if (view.question !== null) {
      const question = view.question;
      const asked = pen.fit(WORDS.scene.asked(name(question.player), question.bank, WORDS.colour[question.colour]), room - 12);
      pen.txt(asked, x, y, C.bone);
      drawCoin(x + pen.width(asked) + 4, y + 2, question.colour);
      y += LINE;
      if (view.phase !== "answer") {
        pen.txt(WORDS.scene.answer(question.count), x, y, question.answered ? C.bone : C.crim);
        y += LINE;
      } else if (what === "answer") {
        const [sx, sy] = stepperAt("answer");
        pen.txt(WORDS.scene.yourAnswer, x, sy, C.bone);
        stepper(sx, sy, count, true);
      }
    }
    if (view.opened !== null) {
      const opened = view.opened;
      pen.txt(pen.fit(WORDS.scene.opened(opened.bank, opened.black, opened.white), room), x, y, C.bone);
      y += LINE;
      const result = opened.right
        ? WORDS.scene.held(name(opened.by, 80), name(opened.player, 80), latest.rules.suspectGain, latest.rules.suspectedLoss)
        : WORDS.scene.failed(name(opened.by, 110), latest.rules.suspectMissLoss);
      pen.txt(pen.fit(result, room), x, y, opened.right ? C.teal : C.crim);
    }
  }

  /** A challenge: the banks in play, what the challenger names of each, and once it is settled what each held. */
  function drawChallenge(): void {
    if (latest === null || latest.view.challenge === null) return;
    const view = latest.view;
    const challenge = view.challenge!;
    const result = challenge.result;
    const own = mine() === "challenge";
    pen.txt(pen.fit(WORDS.scene.challenger(name(challenge.player, 100)), SCENE_W - 16), 8, 26, C.amber);
    for (const [row, which] of (["black", "white"] as const).entries()) {
      drawCoin(FIELDS_X - 14, FIELDS_Y + 4 + row * FIELD_PITCH, which);
      if (result !== null) drawCoin(FIELDS_X - 14, HELD_Y + 4 + row * FIELD_PITCH, which);
    }
    if (result !== null) {
      pen.txt(WORDS.scene.named, 8, FIELDS_Y + 14, C.dim);
      pen.txt(WORDS.scene.held2, 8, HELD_Y + 14, C.dim);
    }
    view.banks.forEach((id, at) => {
      const [x, , w] = fieldRect(at * 2);
      const middle = x + Math.round(w / 2);
      pen.txt(WORDS.bank(id), middle, FIELDS_Y - 18, C.boneD, "center");
      const shown = result?.banks.find((each) => each.id === id);
      for (const [row, which] of (["black", "white"] as const).entries()) {
        const box = fieldRect(at * 2 + row);
        const said = shown === undefined ? (named.get(id)?.[which] ?? 0) : which === "black" ? shown.saidBlack : shown.saidWhite;
        pen.px(box[0], box[1], box[2], box[3], C.btn);
        frame(box, own && field === at * 2 + row ? C.amber : C.steelDD);
        // while it is being named, only the challenger's own screen has the numbers
        if (result !== null || own) pen.txt(said === null ? "-" : `${said}`, middle, box[1] + 3, C.bone, "center");
        if (shown !== undefined) pen.txt(`${shown[which]}`, middle, HELD_Y + 3 + row * FIELD_PITCH, shown[which] === said ? C.teal : C.crim, "center");
      }
    });
    if (result !== null) {
      pen.txt(
        result.right ? WORDS.scene.challengeRight(name(challenge.player, 110), latest.rules.challengeGain) : WORDS.scene.challengeWrong(name(challenge.player, 110), latest.rules.challengeLoss),
        8,
        HELD_Y + 2 * FIELD_PITCH + 10,
        result.right ? C.teal : C.crim,
      );
    } else if (own && TOUCH) {
      button(CHALLENGE_LESS, "-", false, true);
      button(CHALLENGE_MORE, "+", false, true);
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    if (view.phase === "challenge" || view.phase === "challenged") drawChallenge();
    else {
      drawDesks();
      drawLines();
    }
    if (view.you !== null && view.phase !== "ended") {
      const asked = view.shelves.filter((each) => each.reset).length;
      const open = ["put", "answer", "suspect"].includes(view.phase) && shelfOf(view.you)?.reset === false;
      button(RESET_RECT, WORDS.reset(asked, view.resetNeeds), time - armedAt <= RESET_ARM, open);
    }
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 104, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const you = me();
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    if (pending) return [WORDS.standing.sending, C.boneD];
    const s = seconds();
    const what = mine();
    const who = name(view.phase === "challenge" ? (view.challenge?.player ?? view.turn) : view.turn, 90);
    switch (view.phase) {
      case "put": {
        const bank = shelfOf(you)?.bottom ?? 0;
        if (what === "put") return [handlers.first ? WORDS.coach.put(bank, s) : WORDS.standing.put(bank, s), C.amber];
        return [handlers.first && you !== null ? WORDS.coach.putOther(who, s) : WORDS.standing.putOther(who, s), C.bone];
      }
      case "answer":
        if (what === "answer" && view.question !== null) return [WORDS.standing.answer(view.question.bank, WORDS.colour[view.question.colour], s), C.amber];
        return [WORDS.standing.answerOther(who, s), C.bone];
      case "suspect":
        if (what === "suspect") return [WORDS.standing.suspect(s), C.amber];
        if (you === null) return [WORDS.standing.watchSuspect(s), C.bone];
        return [view.question?.player === you ? WORDS.standing.suspectMine(s) : WORDS.standing.suspectPassed(s), C.boneD];
      case "opened":
        return [WORDS.standing.opened(s), C.bone];
      case "call":
        return what === "call" ? [WORDS.standing.call(s), C.amber] : [WORDS.standing.callOther(s), C.bone];
      case "challenge":
        return what === "challenge" ? [WORDS.standing.challenge(s), C.amber] : [WORDS.standing.challengeOther(who, s), C.bone];
      default:
        return [WORDS.standing.challenged(s), C.bone];
    }
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    const rules = latest.rules;
    for (const event of latest.view.history.slice(0, seen)) {
      if (event.type === "dealt") lines.push([WORDS.log.dealt(name(event.first, 60)), C.boneD]);
      else if (event.type === "put") lines.push([event.auto ? WORDS.log.autoPut(name(event.player, 38), event.bank, name(event.to, 38)) : WORDS.log.put(name(event.player, 50), event.bank, name(event.to, 50)), C.bone]);
      else if (event.type === "answered") {
        if (event.silent) lines.push([WORDS.log.silent(name(event.player, 90)), C.crim]);
      } else if (event.type === "trusted") lines.push([WORDS.log.trusted, C.dim]);
      else if (event.type === "suspected") {
        lines.push([(event.right ? WORDS.log.held : WORDS.log.failed)(name(event.by, 44), name(event.player, 44)), event.right ? C.teal : C.crim]);
        lines.push([WORDS.log.openedBank(event.bank, event.black, event.white), C.boneD]);
      } else if (event.type === "issued") lines.push([WORDS.log.issued(name(event.player, 90), event.bank), C.dim]);
      else if (event.type === "reset-asked") lines.push([WORDS.log.resetAsked(name(event.player, 90)), C.boneD]);
      else if (event.type === "reset") lines.push([WORDS.log.reset, C.amber]);
      else if (event.type === "challenge") lines.push([WORDS.log.challenge(name(event.player, 90)), C.amber]);
      else if (event.type === "challenged") {
        lines.push(event.right ? [WORDS.log.challengeRight(name(event.player, 70), rules.challengeGain), C.teal] : [WORDS.log.challengeWrong(name(event.player, 70), rules.challengeLoss), C.crim]);
      } else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(latest.rules.target), x, 3, C.bone);
    const phase = left(latest.clock.phase);
    if (phase !== null) {
      const all = Math.ceil(phase / 1000);
      const what = mine();
      const hurry = all <= HURRY_FROM && (what === "put" || what === "answer" || what === "challenge");
      pen.txt(`${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`, W - 5, 3, hurry ? C.crim : C.boneD, "right");
    }
    const layout = panelLayout(view.standings.length);
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    view.standings.forEach((each, at) => {
      const player = each.player;
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      const right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      if (layout.crowded) pen.txt(`${each.place}`, ex + 12, y, C.brass, "right");
      else pen.txt(`${each.place}`, ex, y, C.brass);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const words = WORDS.points(each.score);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - pen.width(words) - 3 - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const shown = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(shown, nameX, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(shown) + 2, y, voice, time);
      pen.txt(words, right, y, each.score > 0 ? C.teal : each.score < 0 ? C.crim : C.boneD, "right");
    });
    pen.px(x, layout.crowded ? underList(layout) : 86, PANEL_WIDTH, 1, C.steelDD);
    const lines = logLines();
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = view.standings.findIndex((each) => each.player === player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** The pieces this player has of a game played to its end: first place's, shared out evenly. */
  function piecesOf(place: number): number {
    if (latest === null || place !== 1) return 0;
    const end = latest.view.history.at(-1);
    if (end?.type !== "ended" || end.reason !== "target") return 0;
    return Math.floor(latest.rules.prize / latest.view.standings.filter((each) => each.place === 1).length);
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const you = me();
    if (latest === null || latest.view.phase !== "ended" || you === null) return null;
    const own = latest.view.standings.find((each) => each.player === you);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const you = me();
    const own = you === null ? undefined : view.standings.find((each) => each.player === you);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own === undefined ? C.bone : own.place === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name; the list beside the scene has everyone
    const places = view.standings.slice(0, PLACES_SHOWN).map((each) => WORDS.result.place(each.place, name(each.player, 56), each.score));
    pen.txt(pen.fit(places.join(" · "), 280), 96, 226, C.bone);
    const end = view.history.at(-1);
    const how = end?.type === "ended" ? WORDS.ended[end.reason] : "";
    pen.txt(own === undefined ? how : WORDS.result.mine(own.score, piecesOf(own.place)), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
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
    const what = mine();
    const [words, colour] = standing();
    pen.txt(pen.fit(words, what === null ? W - 12 : ONE_RECT[0] - 14), 6, 225, colour);
    // which keys open the rules and mute the sound; under a finger, where the menu that does is
    const hint = TOUCH ? PAGE.menu.hint : WORDS.hint;
    if (what === null) {
      // someone watching is told what the game is, over the keys; a player knows, and has the keys there
      if (me() === null) pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(hint, 6, me() === null ? 254 : 240, C.dim);
      return;
    }
    pen.txt(pen.fit(WORDS.keys[what], ONE_RECT[0] - 14), 6, 240, C.boneD);
    pen.txt(hint, 6, 254, C.dim);
    const on = !pending;
    if (what === "put") button(ONE_RECT, WORDS.button.pass, on && receiver !== null && coins.black + coins.white >= latest.rules.putMin, on);
    else if (what === "answer") button(ONE_RECT, WORDS.button.answer, on, on);
    else if (what === "challenge") button(ONE_RECT, WORDS.button.submit, on, on);
    else {
      button(FIRST_RECT, what === "suspect" ? WORDS.button.suspect : WORDS.button.challenge, on, on);
      button(SECOND_RECT, what === "suspect" ? WORDS.button.trust : WORDS.button.decline, false, on);
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      putMin: rules.putMin,
      putMax: rules.putMax,
      answerSeconds: rules.answerSeconds,
      suspectSeconds: rules.suspectSeconds,
      suspectGain: rules.suspectGain,
      suspectedLoss: rules.suspectedLoss,
      suspectMissLoss: rules.suspectMissLoss,
      challengeGain: rules.challengeGain,
      challengeLoss: rules.challengeLoss,
      target: rules.target,
      prize: rules.prize,
      resetNeeds: latest.view.resetNeeds,
    });
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(line.text, 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : line.tone === "mark" ? C.teal : C.bone);
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
    // an arrow held down moves on; anything else held down is one press
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
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
    // a pointer that has left the screen, or a finger that has lifted, is over nothing
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
      tick();
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
    // by the room's last word; a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && piggyWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether the move reached the room is not known: the game the room sends on coming back will say
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

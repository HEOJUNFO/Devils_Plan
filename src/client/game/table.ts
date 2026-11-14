/**
 * The game screen: draws the table from what the room sends, and turns the
 * player's keys and clicks into moves.
 *
 * Design: design/game-brief.md. The room decides everything; this screen only
 * shows the view of the player's own seat and asks for moves. It keeps no
 * rules of its own beyond knowing which buttons the player can pay for.
 *
 * The room sends the whole view after every move. The moves the screen has
 * not shown yet are played one after another, each with its own short
 * animation, so several arriving at once still read in order.
 */
import { hits, type Box, type Press, type Reach } from "../../shared/frame";
import type { Action, RulesConfig, SeatEvent, SeatView } from "../../shared/game";
import { foresee } from "../../shared/game/ahead";
import type { ServerMessage } from "../../shared/protocol";
import type { VoiceMark } from "../../shared/voice";
import {
  BAR_Y,
  CX,
  CY,
  H,
  HATCH_RY,
  ICONS,
  ICON_COLOUR,
  LETTERS,
  Light,
  PANEL_X,
  Pen,
  RING_RX,
  RING_RY,
  SCENE_W,
  W,
  brackets,
  bubbleBox,
  drawChair,
  drawDevice,
  drawFigure,
  drawLamp,
  drawRoom,
  drawSpeech,
  drawTable,
  drawVoiceMark,
  hatchXY,
  pairAt,
  posAngle,
  seatLayout,
  speechLines,
  speechSeconds,
  tipXY,
  type HatchInfo,
  VOICE_MARK_W,
  type IconName,
  type SeatLayout,
} from "./draw";
import { CHAIR_DOWN, FIGURE_COUNT } from "./figures";
import { makeRoom, type LabelBox, type LabelRoom } from "./labels";
import { C } from "./palette";
import * as fxlib from "./pixelfx.js";
import { AGAIN_REACH, LOBBY_REACH, watchPointer, RESULTS_PRESS_HOLD } from "./pointer";
import { lessMotion } from "./motion";
import { isMuted, setMuted, sfx, startAudio } from "./sound";
import { WORDS } from "./words";

/** What the room sends about a game of Russian Roulette. */
export type GameMessage = Extract<ServerMessage, { type: "game"; game: "russian-roulette" }>;

/** What the screen asks of whoever owns the connection. */
export interface TableHandlers {
  /** The player made a move. Returns whether it could be sent. */
  act(action: Action): boolean;
  /** The host asked for the next game. */
  again(): boolean;
  /** Someone who is not the host would play one more; whether the room has that word of them now (`GameHandlers`). */
  wantAgain(): boolean;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** Whether the room's 탈락전 has put this player out (`GameHandlers.out`): they watch, and are told until when. */
  out(): boolean;
}

/** The game screen. */
export interface Table {
  /** The room sent the game again. */
  update(message: GameMessage): void;
  /** The room refused the player's last move or start. */
  refused(reason: string): void;
  /** The connection to the room went down: a move on its way when it did is not coming back as anything. */
  lost(): void;
  /** Whether this player is the host, who starts the next game. */
  setHost(host: boolean): void;
  /** The player in lobby slot `slot` said a line: it shows over their seat for a moment. */
  say(slot: number, text: string): void;
  /** A key was pressed for the player by something that is not a keyboard; `code` as the browser names a key. */
  press(code: string): void;
  /** What this player came out of the game with, once it is over (`GameScreen.verdict`). */
  verdict(): string | null;
  /** Whether the turn is this player's by the room's last word, and theirs to take. */
  waits(): boolean;
  /** Stops drawing and listening. */
  destroy(): void;
}

/** One step of the screen's clock, in seconds. Animations run on it, never on frames. */
const STEP = 1 / 60;
const TAU = Math.PI * 2;
/** Seconds the seats take to fill when a game starts. */
const DEAL_SECONDS = 1.2;
/** How long the results are up before Enter is taken for the next game or for one more: the key also confirms a move, and may still be down from the last one. As in the other games. */
const RESULTS_HOLD = 1.5;
/**
 * How long a move pressed too soon is kept. The room says whose turn it is before the move that led to it has been
 * shown (the longest is a little over a second, as is the seat draw), and the player is called at the room's word.
 */
const EARLY_HOLD = 1.5;
/**
 * How long the button lit by a move pressed too soon waits before a finger on it makes the move. Longer than
 * `AGAIN_HOLD`: a finger that pressed early presses again when nothing seemed to come of it, and that second
 * press must still only choose.
 */
const EARLY_AGAIN_HOLD = 1;
/**
 * How long the swap is up before it can be made. It comes up by itself, a second or so after the press that put
 * the credits in, with its "확인" where that press was: a second press of that one is not the swap.
 */
const SWAP_HOLD = 0.8;
/** Seconds each kind of move stays on show. */
const SHOW = { look: 0.7, rotate1: 0.8, rotate2: 1.05, tamper: 0.56, swap: 1.0, forfeit: 0.5, hidden: 0.56, pass: 0.4, out: 0.3 };
/** With more moves than this waiting, they are shown faster. */
const HURRY_AFTER = 3;
const HURRY = 0.4;
/** Seconds between shots of the final volley. */
const FIRE_GAP = 0.9;
/** With this many seconds or fewer left on a turn, the count turns red and the player's own is ticked aloud. */
const TICK_FROM = 10;
/** The widest a name is drawn beside a seat, and in the log, in pixels. */
const NAME_WIDTH = 66;
const LOG_NAME_WIDTH = 52;
/** The log on screen: where it starts, under the row the page keeps for its tabs, and its rows. */
const LOG_TOP = 106;
const LOG_ROWS = 8;
/** The height of a row of the log. */
const LOG_ROW_H = 14;

/** The lead's mark beside a name: a plate a pixel wider than its word on each side, and the gap before it. */
const LEAD_MARK_EDGE = 2;
const LEAD_MARK_GAP = 3;
/**
 * The room two names on the same lines leave each other (`labels.ts`): a gap
 * that the voice mark before a name fits in, the height of a name with the
 * line under it, and the picture's right edge.
 */
const LABEL_ROOM: LabelRoom = { gap: 4 + VOICE_MARK_W, lines: 26, edge: SCENE_W - 4 };
/** The gap before what follows a name on its own line. */
const AFTER_NAME_GAP = 5;

interface Selection {
  mode: "pick" | "confirm" | "amount" | "swap";
  /** Which of the five buttons this belongs to. */
  act: number;
  pair: number;
  amount: number;
}

interface Anim {
  event: SeatEvent;
  t: number;
  dur: number;
}

/** The player's own move, on the screen before the room has answered it. */
interface Ahead {
  action: Action;
  /** Where in the history the move is, once the room has taken it. */
  at: number;
  /** The whole move is drawn and the turn passed on; else only the credits it costs. */
  whole: boolean;
  /** When it was sent, by the browser's own clock in ms: the next seat's time is counted from here. */
  sentAt: number;
}

interface Fire {
  k: number;
  stage: "intro" | "aim" | "hold";
  t: number;
  dur: number;
  a: number;
  from: number;
  to: number;
  hits: number;
}

interface Pop {
  text: string;
  x: number;
  y: number;
  t: number;
  colour: string;
}

interface LogLine {
  text: string;
  colour: string;
  /** Came after this player's own last move. */
  fresh: boolean;
  /**
   * What the bar under the table says while this line is the newest, where
   * the line alone would not say it: the last line of a sentence that the
   * log's narrow column breaks in two is half a sentence.
   */
  said?: string;
}

interface Speech {
  seat: number;
  lines: string[];
  /** Seconds left on show. */
  t: number;
}

interface PlayingFx {
  fx: fxlib.FxInstance;
  frame: fxlib.FxFrame;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  x0: number;
  y0: number;
}

const mod = (value: number, n: number): number => ((value % n) + n) % n;
const ease = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};
const inRect = (p: { x: number; y: number }, r: readonly [number, number, number, number]): boolean =>
  p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

const buttonRect = (i: number): [number, number, number, number] => [4 + i * 95, 240, 92, 28];
const OK_RECT: [number, number, number, number] = [342, 223, 66, 15];
const NO_RECT: [number, number, number, number] = [412, 223, 64, 15];
/**
 * How far those two take a finger: up over the foot of the column, where
 * nothing is pressed, sideways to the frame's edge and half the gap between
 * them, and down to a pixel short of the moves under them.
 */
const OK_REACH: Reach = [6, 10, 2, 1];
const NO_REACH: Reach = [2, 10, 4, 1];
/**
 * While credits are counted out for the swap, the fifth button is three: one
 * fewer, the count itself, which puts them in, and one more. Without them
 * the count could be changed with the arrow keys alone.
 */
const FEWER_RECT: Box = [384, 240, 28, 28];
const COUNT_RECT: Box = [414, 240, 32, 28];
const MORE_RECT: Box = [448, 240, 28, 28];
/** How far the buttons of the bar take a finger: half the gap to the next, and down to the frame's edge. */
const MOVE_REACH: Reach = [1, 0, 1, 2];
/**
 * Seconds a move has to have been chosen before a finger pressing its button
 * again makes it: two quick presses are one press that bounced, and a move
 * cannot be taken back.
 */
const AGAIN_HOLD = 0.35;
/** The two buttons under the results: the next game (the host's) and the way back to the waiting room. */
const AGAIN_RECT: [number, number, number, number] = [386, 225, 90, 15];
const LOBBY_RECT: [number, number, number, number] = [386, 250, 90, 15];
/** The log's upper and lower halves: once the game is over a press on one reads the log back, on the other on again. */
const LOG_UPPER: [number, number, number, number] = [PANEL_X, LOG_TOP, 168, (LOG_ROWS * LOG_ROW_H) / 2];
const LOG_LOWER: [number, number, number, number] = [PANEL_X, LOG_TOP + (LOG_ROWS * LOG_ROW_H) / 2, 168, (LOG_ROWS * LOG_ROW_H) / 2];

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link Table.update}. */
export function createTable(canvas: HTMLCanvasElement, handlers: TableHandlers): Table {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);
  const light = new Light();

  /** The game the screen draws: what the room last sent, or that with the player's own move on it. */
  let latest: GameMessage | null = null;
  /** The game as the room last sent it. */
  let truth: GameMessage | null = null;
  /** The player's own move, drawn ahead of the room's answer; `null` when the screen shows what the room sent. */
  let ahead: Ahead | null = null;
  /** The move of the history whose first sound was made at the press, not to be made again when it is shown; -1 for none. */
  let soundedAt = -1;
  /** The last view from before the game ended: what the player knew going into the volley. */
  let before: SeatView | null = null;
  /** How many moves of the history have been shown. */
  let seen = 0;
  let anim: Anim | null = null;
  let sel: Selection | null = null;
  /** `time` when that move was chosen. */
  let selAt = 0;
  /** A move has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** Seconds since the screen was made; drives the lamp and the blinking. It stands still while the tab is hidden. */
  let time = 0;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clock is counted from here in real time: the screen's `time`
   * stops while the tab is hidden, and a clock counted by it would show more
   * time than there is when the player comes back.
   */
  let receivedAt = 0;
  let deal = 0;
  let fire: Fire | null = null;
  /** The volley of this game has been shown to its end. */
  let fired = false;
  /** When the results came up, on this screen's clock; `null` while they are not up. */
  let resultsAt: number | null = null;
  /** How many rows the log is read back by, once the game is over: 0 shows its newest rows. */
  let logBack = 0;
  let fallen: boolean[] = [];
  let revealed: (0 | 1 | null)[] = [];
  let pops: Pop[] = [];
  let speech: Speech[] = [];
  let shake = 0;
  let flick = 0;
  const lean: [number, number] = [0, 0];
  /** Whether the player could act at the last step; a change to yes is announced. */
  let couldAct = false;
  /** A move pressed when the turn was the player's by the room's word and the screen had not caught up, and when: taken up once it has. */
  let early: { act: number; at: number; moves: number } | null = null;
  /** The last second of the player's own turn that was ticked aloud. */
  let ticked = -1;
  const playing: PlayingFx[] = [];

  const keys = new Set<string>();
  const clicks: Press[] = [];
  const mouse = { x: -1, y: -1 };
  let stopped = false;

  // ---- What the latest message means --------------------------------------------------
  const seats = (): number => (latest === null ? 0 : latest.view.seats.length);
  /** The seat drawn nearest the camera: the player's own, or seat 0 for a spectator. */
  const bottom = (): number => latest?.view.seat ?? 0;
  const posOf = (seat: number): number => mod(seat - bottom(), seats());
  const layoutOf = (seat: number): SeatLayout => seatLayout(posOf(seat), seats());
  const angleOf = (seat: number): number => posAngle(posOf(seat), seats());
  const nickOf = (seat: number): string => latest?.players[seat]?.nick ?? "";
  const word = WORDS.round;

  /** The seat the muzzle points at as far as the screen has shown, and the turn still being played. */
  function shownMuzzle(): { seat: number; turning: number } {
    if (latest === null) return { seat: 0, turning: 0 };
    const history = latest.view.history;
    let unshown = 0;
    for (let i = seen; i < history.length; i++) {
      const event = history[i];
      if (event.type === "rotate") unshown += event.steps;
    }
    const seat = mod(latest.view.muzzle - unshown, seats());
    if (anim !== null && anim.event.type === "rotate") {
      const steps = anim.event.steps;
      return { seat: mod(seat + steps, seats()), turning: steps * (1 - ease(anim.t / anim.dur)) };
    }
    return { seat, turning: 0 };
  }

  /** The angle chamber A is drawn at right now. */
  function ringAngle(): number {
    const muzzle = shownMuzzle();
    return angleOf(muzzle.seat) - (muzzle.turning * TAU) / Math.max(1, seats());
  }

  /** The chamber facing the player's own seat as far as the screen has shown. */
  function myChamber(): number | null {
    const me = latest?.view.seat ?? null;
    return me === null ? null : mod(me - shownMuzzle().seat, seats());
  }

  /** The seat whose move the table is waiting for, once everything has been shown. */
  /** Whole seconds until the room makes the awaited move itself, or `null` while no clock runs. */
  function secondsLeft(): number | null {
    if (latest === null || latest.turnEndsIn === null || latest.view.phase === "ended") return null;
    // a turn passed on ahead of the room's answer is counted from the press
    const from = ahead !== null && ahead.whole ? ahead.sentAt : receivedAt;
    return Math.max(0, Math.ceil((latest.turnEndsIn - (performance.now() - from)) / 1000));
  }

  function awaited(): number | null {
    // a seat making the swap it has earned is still the seat to move, and only that seat is told it is making one
    return latest === null || latest.view.phase === "ended" ? null : latest.view.current;
  }

  /**
   * Whether it is the player's turn and they have no credits. There is nothing to press: the room passes for
   * them, a pause after the turn came, and the page is told neither when.
   */
  function passing(): boolean {
    return latest !== null && latest.view.phase === "turn" && latest.view.credits === 0 && awaited() === latest.view.seat;
  }

  /** Whether everything the room has sent is on screen and nothing is still playing. */
  function settled(): boolean {
    return latest !== null && anim === null && deal <= 0 && fire === null && seen >= latest.view.history.length;
  }

  function canAct(): boolean {
    const me = latest?.view.seat ?? null;
    return me !== null && !pending && settled() && awaited() === me;
  }

  /** What the player knows of chamber `j`, for drawing. */
  function hatchInfo(j: number): HatchInfo {
    if (latest === null) return [null, null];
    const view = latest.view;
    if (view.phase !== "ended") return [view.chambers[j] ?? null, view.source[j] ?? null, (view.doubt[j] ?? 0) > 0];
    // During the volley a chamber opens when it is fired; until then it shows what was known going in.
    if (fired || revealed[j] !== null) return [fired ? (view.chambers[j] ?? null) : revealed[j], "public"];
    return before === null ? [null, null] : [before.chambers[j] ?? null, before.source[j] ?? null, (before.doubt[j] ?? 0) > 0];
  }

  // ---- Effects --------------------------------------------------------------------------
  function addFx(effect: fxlib.FxModule, options: fxlib.FxOptions, box: [number, number, number, number]): void {
    // a burst is for the eye only: what happened is said by the words over it and by the sound
    if (lessMotion()) return;
    const [x0, y0, w, h] = box.map(Math.round) as [number, number, number, number];
    const buffer = document.createElement("canvas");
    buffer.width = w;
    buffer.height = h;
    const bufferCtx = buffer.getContext("2d");
    if (bufferCtx === null) return;
    playing.push({
      fx: fxlib.createFx(effect, options),
      frame: fxlib.createFrame(w, h, x0, y0),
      canvas: buffer,
      ctx: bufferCtx,
      image: new ImageData(w, h),
      x0,
      y0,
    });
  }

  function muzzleFx(a: number, seed: number): void {
    const [tx, ty] = tipXY(a);
    const height = 5;
    const flip = Math.cos(a) < 0;
    const angle = flip ? a + Math.PI : a;
    addFx(
      fxlib.muzzlePistol,
      { x: tx - height * Math.sin(angle), y: ty + height * Math.cos(angle), flip, angle, height, seed },
      [tx - 80, ty - 80, 160, 160],
    );
  }

  function drawFx(): void {
    for (const p of playing) {
      fxlib.clearFrame(p.frame);
      p.fx.draw(p.frame);
      fxlib.composite(p.frame, p.image.data, null);
      p.ctx.putImageData(p.image, 0, 0);
      ctx.drawImage(p.canvas, p.x0, p.y0);
    }
  }

  // ---- A new message ---------------------------------------------------------------------
  function resetFor(message: GameMessage): void {
    const n = message.view.seats.length;
    const history = message.view.history;
    anim = null;
    sel = null;
    fire = null;
    pops = [];
    speech = [];
    playing.length = 0;
    shake = 0;
    flick = 0;
    before = null;
    fallen = new Array<boolean>(n).fill(false);
    revealed = new Array<0 | 1 | null>(n).fill(null);
    fired = false;
    resultsAt = null;
    logBack = 0;
    couldAct = false;
    early = null;
    // A game met part-way is shown as it stands; only a game seen from its first moment gets the seat draw.
    seen = history.length;
    deal = history.length === 0 && message.view.phase !== "ended" ? DEAL_SECONDS : 0;
    if (message.view.phase === "ended" && message.view.result !== null) {
      fired = true;
      for (const seat of message.view.result.hitSeats) fallen[seat] = true;
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  /**
   * `message` with the player's `action` on it, as far as the page can tell what the room will make of it:
   * `null` when nothing of the move can be drawn before the room answers.
   */
  function withMove(message: GameMessage, action: Action): { message: GameMessage; whole: boolean } | null {
    const drawn = foresee(message.view, action, message.rules);
    if (drawn === null) return null;
    if (!drawn.whole) return { message: { ...message, view: drawn.view }, whole: false };
    // The next seat's time starts when the room takes the move. Until it says when that was, a seat with its
    // player at the table has the whole of it from the press; how long an absent one has is the room's to say.
    const next = message.players[drawn.view.current];
    const turnEndsIn = message.rules.turnSeconds > 0 && next !== undefined && next.connected ? message.rules.turnSeconds * 1000 : null;
    return { message: { ...message, view: drawn.view, turnEndsIn }, whole: true };
  }

  /** The move drawn ahead is taken off the screen: the room refused it, did something else first, or cannot be heard. */
  function takeBack(): void {
    if (ahead === null) return;
    // its place in the history is the room's again: whatever the room puts there is shown from its start
    if (ahead.whole && seen >= ahead.at) {
      seen = ahead.at;
      anim = null;
    }
    ahead = null;
    soundedAt = -1;
    latest = truth;
  }

  function update(message: GameMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const other = truth === null || truth.startedAt !== message.startedAt;
    if (other) {
      resetFor(message);
      ahead = null;
      soundedAt = -1;
    }
    // The room marks the game it sends in answer to this page's move. What it sends meanwhile, for another
    // player's move, leaves this one on its way; a game that has gone on to another phase waits for nothing.
    // The phase is the one the room sent last, not the one a move drawn ahead has put on the screen.
    let answered = message.answer === true || truth === null || other || truth.view.phase !== message.view.phase;
    truth = message;
    receivedAt = performance.now();
    offline = false;
    if (message.view.phase !== "ended") before = message.view;
    if (ahead !== null) {
      const told = message.view.history[ahead.at];
      if (told === undefined && !answered) {
        // The move is still on its way: it stays on what the room has sent meanwhile, if it still can.
        const drawn = withMove(message, ahead.action);
        if (drawn !== null && drawn.whole === ahead.whole) {
          latest = drawn.message;
          return;
        }
      }
      if (told !== undefined && told.seat === message.view.seat && told.type === ahead.action.type) {
        // The room has taken the move. What was drawn of it stays as shown; the rest is shown from here.
        ahead = null;
        answered = true;
      } else {
        // Something else stands where the move would: the clock ended the turn first.
        takeBack();
      }
    }
    latest = message;
    if (answered) pending = false;
  }

  // ---- Showing moves one at a time --------------------------------------------------------
  function beginEvent(event: SeatEvent): void {
    if (latest === null) return;
    const waiting = latest.view.history.length - seen;
    let dur = SHOW.look;
    // A private look, credits for the swap, a swap and a pass reach this screen only as the player's own:
    // of anyone else's the room sends a hidden action, which looks and sounds the same whichever it was.
    // the first sound of a move of the player's own was made at the press
    const heard = soundedAt === seen;
    soundedAt = -1;
    if (event.type === "public" || event.type === "private") {
      if (!heard) sfx.look();
      if (event.seen[0] === 1 || event.seen[1] === 1) sfx.live();
      else sfx.empty();
    } else if (event.type === "rotate") {
      dur = event.steps === 2 ? SHOW.rotate2 : SHOW.rotate1;
      sfx.ratchet(event.steps * 3);
    } else if (event.type === "tamper") {
      dur = SHOW.tamper;
      if (!heard) sfx.chip();
      if (event.earned) sfx.earn();
      else sfx.stored();
    } else if (event.type === "swap") {
      dur = SHOW.swap;
      sfx.swap();
    } else if (event.type === "hidden") {
      dur = SHOW.hidden;
      sfx.hidden();
    } else if (event.type === "pass") {
      dur = SHOW.pass;
      sfx.back();
    } else {
      // a turn the clock ended, or a swap it took away
      dur = SHOW.forfeit;
      sfx.back();
    }
    if (event.out) {
      dur += SHOW.out;
      sfx.out();
    }
    if (event.ended) sfx.alarm();
    anim = { event, t: 0, dur: waiting > HURRY_AFTER ? dur * HURRY : dur };
  }

  // ---- The final volley ---------------------------------------------------------------------
  function startVolley(): void {
    if (latest === null) return;
    const a = angleOf(latest.view.muzzle);
    fire = { k: -1, stage: "intro", t: 1.4, dur: 1.4, a, from: a, to: a, hits: 0 };
    sel = null;
  }

  function stepFire(dt: number): void {
    if (latest === null || fire === null) return;
    const result = latest.view.result;
    if (result === null) {
      fire = null;
      fired = true;
      return;
    }
    const n = seats();
    const live = latest.rules.bullets;
    fire.t -= dt;
    if (fire.stage === "aim") fire.a = fire.from + (fire.to - fire.from) * ease(1 - Math.max(0, fire.t) / fire.dur);
    if (fire.t > 0) return;
    if (fire.stage !== "aim") {
      fire.k++;
      if (fire.k >= n) {
        const lost = latest.view.seat !== null && result.hitSeats.includes(latest.view.seat);
        fire = null;
        fired = true;
        if (latest.view.seat !== null) {
          if (lost) sfx.lose();
          else {
            sfx.win();
            const mine = layoutOf(latest.view.seat);
            addFx(fxlib.confetti, { x: mine.x, y: mine.y + 16, seed: 11 }, [mine.x - 100, mine.y - 110, 200, 140]);
          }
        }
        return;
      }
      const shot = result.shots[fire.k];
      // with every round fired there is nothing left to fear: the rest go by fast
      const spent = fire.hits >= live;
      fire.stage = "aim";
      fire.from = fire.a;
      fire.to = angleOf(latest.view.muzzle) + (fire.k * TAU) / n;
      fire.dur = FIRE_GAP * (spent ? 0.25 : shot.seat === latest.view.seat ? 1.5 : 0.75);
      fire.t = fire.dur;
      sfx.ratchet(spent ? 1 : 3);
      return;
    }
    const shot = result.shots[fire.k];
    const at = layoutOf(shot.seat);
    // the word for the shot lands on the table in front of the seat, clear of every name
    const px0 = Math.round(at.x + (CX - at.x) * 0.42) + (posOf(shot.seat) === 0 ? 28 : 0);
    const py0 = Math.round(at.y + (CY - at.y) * 0.42) - 6;
    fire.a = fire.to;
    revealed[shot.chamber] = shot.hit ? 1 : 0;
    if (shot.hit) {
      fire.hits++;
      fallen[shot.seat] = true;
      // the room shakes and the lamp flickers, unless the player has asked for less motion
      shake = lessMotion() ? 0 : 5;
      flick = lessMotion() ? 0 : 0.5;
      sfx.bang();
      pops.push({ text: WORDS.bang, x: px0, y: py0, t: 1.1, colour: C.crim });
      muzzleFx(fire.a, 3 + fire.k);
      addFx(fxlib.poof, { x: at.x, y: at.y + 14, seed: 21 + fire.k }, [at.x - 56, at.y - 66, 112, 92]);
    } else {
      sfx.click();
      pops.push({ text: WORDS.click, x: px0, y: py0, t: 0.8, colour: C.teal });
    }
    fire.stage = "hold";
    fire.t = FIRE_GAP * (shot.hit ? 1.3 : fire.hits >= live ? 0.2 : 0.5);
  }

  // ---- The player's own move -----------------------------------------------------------------
  function costs(rules: RulesConfig): number[] {
    return [rules.costPublic, rules.costPrivate, rules.costRotate1, rules.costRotate2, 1];
  }

  /** The first pair near the player's own chamber that still holds something unseen. */
  function lookDefault(): number {
    const n = seats();
    const mine = myChamber() ?? 0;
    const view = latest?.view;
    for (const a of [mine - 1, mine, mine - 2, mine + 1, mine - 3, mine + 2]) {
      if (view && (view.chambers[mod(a, n)] === null || view.chambers[mod(a + 1, n)] === null)) return mod(a, n);
    }
    return mod(mine - 1, n);
  }

  /** The player's own chamber and its safer-looking neighbour. */
  function swapDefault(): number {
    const n = seats();
    const mine = myChamber() ?? 0;
    const view = latest?.view;
    const risk = (j: number): number => view?.chambers[mod(j, n)] ?? 0.5;
    return risk(mine + 1) < risk(mine - 1) ? mine : mod(mine - 1, n);
  }

  function say(text: string): void {
    note = text;
    noteT = 2;
  }

  function choose(i: number): void {
    if (latest === null || latest.view.credits === null) return;
    if (latest.view.credits < costs(latest.rules)[i]) {
      say(WORDS.refused["not-enough-credits"]);
      sfx.deny();
      return;
    }
    if (i <= 1) sel = { mode: "pick", act: i, pair: lookDefault(), amount: 1 };
    else if (i <= 3) sel = { mode: "confirm", act: i, pair: 0, amount: 1 };
    else sel = { mode: "amount", act: 4, pair: 0, amount: 1 };
    selAt = time;
    sfx.pick();
  }

  function send(action: Action): void {
    sel = null;
    // while the connection is down nothing goes, and the table is not left waiting on it
    pending = handlers.act(action);
    if (!pending) {
      say(WORDS.notSent);
      sfx.deny();
      return;
    }
    // The move is on the screen at the press, as far as this page can tell what the room will make of it:
    // a turn of the muzzle and the swap whole, as the next move of the history; of a look and of credits for
    // the swap, the credits gone and the first sound, and the rest when the room answers. (A pass is not the
    // page's to send: the room makes it for a player with no credits.)
    if (truth === null) return;
    const drawn = withMove(truth, action);
    if (drawn === null) return;
    ahead = { action, at: truth.view.history.length, whole: drawn.whole, sentAt: performance.now() };
    latest = drawn.message;
    if (drawn.whole) return;
    if (action.type === "public" || action.type === "private") sfx.look();
    else if (action.type === "tamper") sfx.chip();
    else return;
    soundedAt = ahead.at;
  }

  function confirm(): void {
    if (sel === null) return;
    if (sel.mode === "pick") send({ type: sel.act === 0 ? "public" : "private", pair: sel.pair });
    else if (sel.mode === "confirm") send({ type: "rotate", steps: sel.act === 2 ? 1 : 2 });
    else if (sel.mode === "amount") send({ type: "tamper", amount: sel.amount });
    else send({ type: "swap", pair: sel.pair });
  }

  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.has(code));
    const clicked = (rect: Box, finger?: Reach): boolean => clicks.some((p) => hits(p, rect, finger));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    if (help || was) return;
    if (fired && latest.view.phase === "ended") {
      resultsAt ??= time;
      // The log is read back once the game is over: a row with the up and down keys, a screenful with the page
      // keys or a press on its upper or lower half. It has more rows than it shows at a table that tells the
      // hidden moves at the end.
      const most = Math.max(0, logLines().length - LOG_ROWS);
      if (pressed("ArrowUp")) logBack += 1;
      if (pressed("ArrowDown")) logBack -= 1;
      if (pressed("PageUp") || clicked(LOG_UPPER)) logBack += LOG_ROWS - 1;
      if (pressed("PageDown") || clicked(LOG_LOWER)) logBack -= LOG_ROWS - 1;
      logBack = Math.max(0, Math.min(most, logBack));
      // (the two buttons take no press in the first moment the results are up: `RESULTS_PRESS_HOLD`)
      const pressable = time - resultsAt >= RESULTS_PRESS_HOLD;
      if (pressed("Escape", "Backspace") || (pressable && clicked(LOBBY_RECT, LOBBY_REACH))) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - resultsAt >= RESULTS_HOLD) || (host && pressable && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    // a turn the room passes asks nothing of the player: no call to move, and nothing to choose
    const able = canAct() && !passing();
    if (able && !couldAct) {
      sfx.turn();
      if (latest.view.phase === "swap") {
        sel = { mode: "swap", act: 4, pair: swapDefault(), amount: 1 };
        selAt = time;
        sfx.earn();
      }
    }
    couldAct = able;
    let picked: number | null = null;
    for (let i = 0; i < 5; i++) {
      if (pressed(`Digit${i + 1}`, `Numpad${i + 1}`) || clicked(buttonRect(i), MOVE_REACH)) picked = i;
    }
    if (!able) {
      sel = null;
      // The turn is mine by the room's word, and the move before it is still being shown: a move pressed now is not lost.
      // It is answered at the press (its button lights, with the sound of a choice), so that it is not pressed again.
      // (Only a move that can be chosen when the screen has caught up: not over a swap that is on its way up, and
      // one there are no credits for is told so now, not a second later.)
      if (picked !== null && waits() && !pending && !offline && truth !== null && truth.view.phase === "turn") {
        if ((truth.view.credits ?? 0) < costs(truth.rules)[picked]) {
          early = null;
          say(WORDS.refused["not-enough-credits"]);
          sfx.deny();
        } else {
          early = { act: picked, at: time, moves: truth.view.history.length };
          sfx.pick();
        }
      } else if (!waits()) early = null;
      return;
    }
    // (not over the swap, which has to be made first, nor over a move pressed since; and not on a later turn: this
    // clock stands still while the tab is hidden, so the press is also held to the moves the room had told of then)
    const kept = picked === null && sel === null && early !== null && time - early.at <= EARLY_HOLD && early.moves === truth?.view.history.length;
    if (kept && early !== null) picked = early.act;
    early = null;
    if (sel === null) {
      if (picked !== null) choose(picked);
      // under a finger the lit button makes the move when pressed again: not by the press that only repeats the early one
      if (kept && sel !== null) selAt = time + EARLY_AGAIN_HOLD - AGAIN_HOLD;
      return;
    }
    if (sel.mode !== "swap") {
      // the swap, once earned, has to be made; anything else can be put down
      if (picked !== null && picked !== sel.act) {
        choose(picked);
        return;
      }
      if (pressed("Escape", "Backspace") || clicked(NO_RECT, NO_REACH)) {
        sel = null;
        sfx.back();
        return;
      }
      // Under a finger the lit button is the nearest thing to press: pressed again, it makes the move.
      // (While credits are counted out it is three buttons, and the middle one does: see below.)
      const lit = buttonRect(sel.act);
      if (sel.mode !== "amount" && time - selAt >= AGAIN_HOLD && clicks.some((p) => p.touch && hits(p, lit, MOVE_REACH))) {
        confirm();
        return;
      }
    }
    const left = pressed("ArrowLeft", "KeyA");
    const right = pressed("ArrowRight", "KeyD");
    const n = seats();
    if (sel.mode === "pick" || sel.mode === "swap") {
      // the right key moves the pair to the right along the near side of the cylinder, where my chamber is
      if (left) {
        sel.pair = mod(sel.pair + 1, n);
        sfx.move();
      }
      if (right) {
        sel.pair = mod(sel.pair - 1, n);
        sfx.move();
      }
      for (const p of clicks) {
        const at = pairAt(p.x, p.y, n, ringAngle());
        if (at === null) continue;
        if (at === sel.pair) {
          // (the pair the swap comes up on is not made by a press already on its way: `SWAP_HOLD`)
          if (sel.mode === "swap" && time - selAt < SWAP_HOLD) continue;
          confirm();
          return;
        }
        sel.pair = at;
        sfx.move();
      }
    } else if (sel.mode === "amount") {
      const most = Math.min(latest.rules.tamperMaxPerTurn, latest.view.credits ?? 0);
      if ((left || clicked(FEWER_RECT, MOVE_REACH)) && sel.amount > 1) {
        sel.amount--;
        sfx.move();
      }
      if ((right || clicked(MORE_RECT, MOVE_REACH)) && sel.amount < most) {
        sel.amount++;
        sfx.move();
      }
      // the count itself puts them in; not the press that only just chose the move, landing twice
      if (time - selAt >= AGAIN_HOLD && clicked(COUNT_RECT, MOVE_REACH)) {
        confirm();
        return;
      }
    }
    if (sel.mode === "swap" && time - selAt < SWAP_HOLD) return;
    if (pressed("Enter", "NumpadEnter", "Space") || clicked(OK_RECT, OK_REACH)) confirm();
  }

  // ---- One step of the screen's clock ----------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    for (let i = playing.length - 1; i >= 0; i--) {
      playing[i].fx.update(dt);
      if (playing[i].fx.done()) playing.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 14);
    if (flick > 0) flick = Math.max(0, flick - dt);
    if (noteT > 0) noteT -= dt;
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].t -= dt;
      if (pops[i].t <= 0) pops.splice(i, 1);
    }
    for (let i = speech.length - 1; i >= 0; i--) {
      speech[i].t -= dt;
      if (speech[i].t <= 0) speech.splice(i, 1);
    }
    if (latest !== null) {
      if (deal > 0) {
        const n = seats();
        const shownBefore = Math.min(n, Math.floor((1 - deal / DEAL_SECONDS) * (n + 1)));
        deal -= dt;
        const shownNow = Math.min(n, Math.floor((1 - Math.max(0, deal) / DEAL_SECONDS) * (n + 1)));
        for (let i = shownBefore; i < shownNow; i++) sfx.seat(i);
      } else if (anim !== null) {
        anim.t += dt;
        if (anim.t >= anim.dur) {
          seen++;
          anim = null;
        }
      } else if (seen < latest.view.history.length) {
        beginEvent(latest.view.history[seen]);
      } else if (latest.view.phase === "ended" && !fired && fire === null) {
        startVolley();
      }
      if (fire !== null) stepFire(dt);

      // the lamp leans to whoever the table is watching
      let aim: number | null = null;
      if (fire !== null && fire.k >= 0 && fire.k < seats() && latest.view.result !== null) aim = latest.view.result.shots[fire.k].seat;
      else if (anim !== null) aim = anim.event.seat;
      else if (deal > 0) aim = bottom();
      else aim = awaited();
      const target = aim === null ? null : layoutOf(aim);
      const tx = target === null ? 0 : (target.x - CX) * 0.22;
      const ty = target === null ? 0 : (target.y - CY) * 0.22;
      lean[0] += (tx - lean[0]) * Math.min(1, dt * 5);
      lean[1] += (ty - lean[1]) * Math.min(1, dt * 5);

      // my own time is nearly up: a tick a second
      const left = settled() && awaited() === latest.view.seat ? secondsLeft() : null;
      if (left === null || left > TICK_FROM) ticked = -1;
      else if (left !== ticked) {
        ticked = left;
        if (left > 0) sfx.move();
      }
    }
    stepInput();
    keys.clear();
    clicks.length = 0;
  }

  // ---- Drawing ------------------------------------------------------------------------------------
  /** The log, made from the moves shown so far. */
  function logLines(): LogLine[] {
    if (latest === null) return [];
    const view = latest.view;
    const me = view.seat;
    const upTo = Math.min(view.history.length, seen + (anim !== null ? 1 : 0));
    const lines: LogLine[] = [];
    let lastMine = -1;
    for (let i = 0; i < upTo; i++) if (view.history[i].seat === me) lastMine = i;
    for (let i = 0; i < upTo; i++) {
      const event = view.history[i];
      const who = pen.fit(nickOf(event.seat), LOG_NAME_WIDTH);
      const fresh = i > lastMine;
      const add = (text: string, colour: string = C.bone) => lines.push({ text, colour, fresh });
      if (event.type === "public") {
        const said = WORDS.log.publicCheck(who, LETTERS[event.pair], LETTERS[mod(event.pair + 1, seats())], word(event.seen[0]), word(event.seen[1]));
        for (const line of said) add(line);
      } else if (event.type === "private") {
        const a = LETTERS[event.pair];
        const b = LETTERS[mod(event.pair + 1, seats())];
        add(WORDS.log.privateCheck(who, a, b));
        add(WORDS.log.onlyYou(a, b, word(event.seen[0]), word(event.seen[1])), C.amber);
      } else if (event.type === "rotate") {
        add(WORDS.log.turned(who, event.steps));
      } else if (event.type === "tamper") {
        // what the player's own credits came to: the swap, or one more step towards it
        add(WORDS.log.putIn(who, event.amount));
        if (event.earned) add(WORDS.log.earnedSwap, C.amber);
        else for (const line of WORDS.log.stored) lines.push({ text: line, colour: C.boneD, fresh, said: WORDS.log.stored.join(" ") });
      } else if (event.type === "swap") {
        add(WORDS.log.swapped(who, LETTERS[event.pair], LETTERS[mod(event.pair + 1, seats())]), C.amber);
      } else if (event.type === "swap-forfeit") {
        add(WORDS.log.lostSwap, C.boneD);
      } else if (event.type === "pass") {
        add(WORDS.log.passed(who), C.boneD);
      } else if (event.type === "timeout") {
        add(WORDS.log.timedOut(who), C.boneD);
      } else {
        add(WORDS.log.hidden(who));
      }
      // only the player's own running dry is told to them
      if (event.out) add(WORDS.log.outOfCredits(who), C.crim);
      if (event.ended) add(WORDS.log.fire, C.crim);
    }
    if (fire !== null || fired) {
      const result = view.result;
      const shots = result === null ? [] : fired ? result.shots : result.shots.slice(0, Math.max(0, fire === null ? 0 : fire.stage === "aim" ? fire.k : fire.k + 1));
      for (const shot of shots) {
        const who = pen.fit(nickOf(shot.seat), LOG_NAME_WIDTH);
        lines.push({ text: WORDS.log.shot(who, shot.hit), colour: shot.hit ? C.crim : C.teal, fresh: true });
      }
    }
    // At a table that tells them: what each hidden move of the others was, after the last shot. What this player
    // did they were told as they did it, and what everyone was told is above.
    if (fired && view.revealed !== undefined) {
      const told = view.revealed.filter((event) => event.seat !== me && ["private", "tamper", "swap", "swap-forfeit", "pass"].includes(event.type));
      const add = (text: string, colour: string = C.bone) => lines.push({ text, colour, fresh: false });
      if (told.length > 0) add(WORDS.log.revealed, C.amber);
      for (const event of told) {
        const who = pen.fit(nickOf(event.seat), LOG_NAME_WIDTH);
        if (event.type === "private") {
          const a = LETTERS[event.pair];
          const b = LETTERS[mod(event.pair + 1, seats())];
          add(WORDS.log.privateCheck(who, a, b));
          add(WORDS.log.found(a, b, word(event.seen[0]), word(event.seen[1])), C.boneD);
        } else if (event.type === "tamper") add(WORDS.log.putIn(who, event.amount));
        else if (event.type === "swap") add(WORDS.log.swapped(who, LETTERS[event.pair], LETTERS[mod(event.pair + 1, seats())]), C.amber);
        else if (event.type === "swap-forfeit") add(WORDS.log.lostSwapBy(who), C.boneD);
        else if (event.type === "pass") add(WORDS.log.passed(who), C.boneD);
      }
    }
    return lines;
  }

  /** What each seat last did since the player's own last move, for the icon beside its head. */
  function lastActs(): (IconName | null)[] {
    const acts = new Array<IconName | null>(seats()).fill(null);
    if (latest === null) return acts;
    const view = latest.view;
    // the move being shown has its mark from the start: of a hidden action it is all there is to see
    const upTo = Math.min(view.history.length, seen + (anim !== null ? 1 : 0));
    let from = 0;
    for (let i = 0; i < upTo; i++) if (view.history[i].seat === view.seat) from = i;
    for (let i = from; i < upTo; i++) {
      const event = view.history[i];
      if (event.type === "public" || event.type === "private" || event.type === "tamper" || event.type === "swap" || event.type === "hidden") acts[event.seat] = event.type;
      else if (event.type === "rotate") acts[event.seat] = event.steps === 2 ? "rotate2" : "rotate1";
      else acts[event.seat] = null;
    }
    return acts;
  }

  function dealShown(): number {
    const n = seats();
    return deal > 0 ? Math.min(n, Math.floor((1 - deal / DEAL_SECONDS) * (n + 1))) : n;
  }

  function drawSeat(seat: number): void {
    if (latest === null) return;
    const at = layoutOf(seat);
    if (seat >= dealShown()) {
      drawChair(pen, at.x, at.y, at.back);
      return;
    }
    if (fallen[seat]) {
      pen.rects(CHAIR_DOWN, at.x, at.y);
      return;
    }
    drawFigure(pen, latest.view.seats[seat].occupant % FIGURE_COUNT, at.x, at.y, at.back, at.side);
  }

  /** The mark of whoever leads the round: its word is as long as the language makes it. */
  const leadPlateWidth = (): number => pen.width(WORDS.seat.lead) + LEAD_MARK_EDGE;

  /** The name of `seat` as it is drawn, in no more than `room` pixels, with the plate of whoever leads the round after it. */
  function labelOf(seat: number, room: number): LabelBox & { name: string; lead: boolean } {
    const at = layoutOf(seat);
    const name = pen.fit(nickOf(seat), room);
    const lead = latest !== null && latest.view.phase !== "ended" && deal <= 0 && mod(latest.view.round, seats()) === seat;
    const width = pen.width(name) + (lead ? leadPlateWidth() + LEAD_MARK_GAP : 0);
    return { name, lead, width, x: at.label.align === "center" ? at.label.x - Math.round(width / 2) : at.label.x, y: at.label.y };
  }

  function drawLabels(): void {
    if (latest === null) return;
    const view = latest.view;
    const acts = lastActs();
    const waiting = settled() ? awaited() : null;
    const n = seats();
    const shown = Math.min(n, dealShown());
    const labels = Array.from({ length: shown }, (_, seat) => labelOf(seat, NAME_WIDTH));
    // The far middle seat's name runs right from beside the seat, onto the lines of the name over the next
    // seat round: that name moves over as far as the picture goes, and the far one is cut by what is still wanted.
    const far = labels.findIndex((_, seat) => layoutOf(seat).label.align === "left");
    for (let seat = 0; far !== -1 && seat < shown; seat++) {
      if (seat === far) continue;
      const { shift, cut } = makeRoom(labels[far], labels[seat], LABEL_ROOM);
      labels[seat].x += shift;
      if (cut > 0) labels[far] = labelOf(far, pen.width(labels[far].name) - cut);
    }
    for (let seat = 0; seat < shown; seat++) {
      const at = layoutOf(seat);
      const player = latest.players[seat];
      const info = view.seats[seat];
      const mine = seat === view.seat;
      const { name, lead, width, x: lx, y: ly } = labels[seat];
      const leadPlate = leadPlateWidth();
      pen.txt(name, lx, ly, fallen[seat] ? C.dim : waiting === seat || (mine && deal > 0) ? C.amber : C.bone);
      // in the room's voice chat: a mark before the name
      // a seat whose player has left the room is nobody's: whoever holds that slot now is someone else
      const voice = info.bot || player.left ? "out" : handlers.voice(info.occupant);
      if (voice !== "out") drawVoiceMark(pen, lx - VOICE_MARK_W, ly, voice, time);
      if (lead) {
        // leads this round
        pen.px(lx + width - leadPlate, ly, leadPlate, 13, C.amberD);
        pen.px(lx + width - leadPlate + 1, ly + 1, leadPlate - LEAD_MARK_EDGE, 11, C.ink);
        pen.txt(WORDS.seat.lead, lx + width - leadPlate + 1, ly + 1, C.amber);
      }
      // Under the name: what the table can tell of the seat. The seat nearest the camera has the bar under
      // it and no room for a second line, whoever sits there (my own seat, or seat 1 for someone watching):
      // there it goes after the name.
      const near = posOf(seat) === 0;
      const sx = near ? lx + width + AFTER_NAME_GAP : lx;
      const sy = near ? ly : ly + 13;
      const second = (text: string, colour: string) => pen.txt(text, sx, sy, colour);
      if (fallen[seat]) second(WORDS.seat.shot, C.crim);
      else if (deal > 0) {
        // nothing yet
      } else if (info.out === true) second(WORDS.seat.spent, C.crim);
      else if (player.left) second(WORDS.seat.left, C.dim);
      else if (!player.connected) second(WORDS.seat.offline, C.dim);
      else if (!mine) {
        // credits left, as far as the table can count them
        pen.px(sx, sy + 3, 5, 5, C.brassD);
        pen.px(sx + 1, sy + 4, 3, 3, C.brass);
        pen.txt(info.minCredits === info.maxCredits ? `${info.maxCredits}` : `${info.minCredits}~${info.maxCredits}`, sx + 8, sy, C.boneD);
      }
      // beside the head: the seat number at the draw, dots while the table waits for the seat, else its last move
      const bx = at.bubble.x;
      const by = at.bubble.y;
      const act = acts[seat];
      const left = waiting === seat ? secondsLeft() : null;
      if (deal > 0) {
        bubbleBox(pen, bx, by);
        pen.txt(`${seat + 1}`, bx, by - 6, C.amber, "center");
      } else if (fallen[seat]) {
        // nothing
      } else if (left !== null) {
        // a clock runs on this seat: the seconds until the room moves for it
        const text = `${left}`;
        const half = Math.max(7, Math.ceil(pen.width(text) / 2) + 3);
        pen.px(bx - half, by - 7, half * 2 + 1, 15, C.ink);
        pen.px(bx - half + 1, by - 6, half * 2 - 1, 13, C.btnH);
        pen.txt(text, bx + 1, by - 6, left <= TICK_FROM ? C.crim : C.amber, "center");
      } else if (waiting === seat && !mine) {
        bubbleBox(pen, bx, by);
        for (let i = 0; i < 3; i++) pen.px(bx - 4 + i * 4, by + (Math.floor(time * 6) % 3 === i ? -2 : 0), 2, 2, C.bone);
      } else if (act !== null) {
        bubbleBox(pen, bx, by);
        pen.bmp(ICONS[act], bx - 3, by - 3, ICON_COLOUR[act]);
      }
    }
  }

  /** Marks over the cylinder: my chamber, my pick, the move being shown. */
  function drawOverlays(ringA: number): void {
    if (latest === null) return;
    const view = latest.view;
    const n = seats();
    // what is marked out blinks; for a player who asked for less motion it is marked steadily
    const blink = lessMotion() || Math.floor(time * 5) % 2 === 0;
    const mine = myChamber();
    if (mine !== null && deal <= 0 && view.phase !== "ended") {
      // my own chamber, coloured by what I know of it
      const [x, y] = hatchXY(mine, n, ringA);
      const known = view.chambers[mine];
      if (known !== 1 || blink) brackets(pen, x, y, known === 1 ? C.crim : known === 0 ? C.teal : C.boneD);
    }
    if (sel !== null && (sel.mode === "pick" || sel.mode === "swap")) {
      const over = pairAt(mouse.x, mouse.y, n, ringA);
      if (over !== null && over !== sel.pair) {
        for (const j of [over, mod(over + 1, n)]) brackets(pen, ...hatchXY(j, n, ringA), C.boneD);
      }
      for (const j of [sel.pair, mod(sel.pair + 1, n)]) {
        const [x, y] = hatchXY(j, n, ringA);
        brackets(pen, x, y, blink ? C.amber : C.brassH);
        pen.px(x - 2, y - HATCH_RY - 6, 5, 2, C.amber);
      }
    }
    if (sel !== null && sel.mode === "confirm" && mine !== null) {
      // the chamber a turn would bring me
      const steps = sel.act === 2 ? 1 : 2;
      brackets(pen, ...hatchXY(mod(mine - steps, n), n, ringA), blink ? C.amber : C.brassH);
      for (let i = 1; i <= 5; i++) {
        const a = posAngle(0, n) - ((steps * TAU) / n) * (1 - i / 6);
        pen.px(CX + Math.cos(a) * (RING_RX + 12) - 1, CY + Math.sin(a) * (RING_RY + 9) - 1, 2, 2, C.amber);
      }
    }
    if (anim !== null) {
      const event = anim.event;
      if (event.type === "public" || event.type === "private") {
        // the two chambers being looked into
        for (const j of [event.pair, mod(event.pair + 1, n)]) brackets(pen, ...hatchXY(j, n, ringA), event.type === "public" ? C.bone : C.amber);
      } else if (event.type === "tamper" && anim.t < anim.dur * 0.8) {
        // a chip slides to the cylinder, face down
        const from = layoutOf(event.seat);
        const u = ease(anim.t / (anim.dur * 0.8));
        const x = Math.round(from.x + (CX - from.x) * u);
        const y = Math.round(from.y + (CY - from.y) * u);
        pen.px(x - 3, y - 3, 7, 7, C.ink);
        pen.px(x - 2, y - 2, 5, 5, C.brassD);
        pen.px(x - 1, y - 1, 3, 3, C.brass);
      } else if (event.type === "swap") {
        // two rounds change places, shut
        const [ax, ay] = hatchXY(event.pair, n, ringA);
        const [bx, by] = hatchXY(mod(event.pair + 1, n), n, ringA);
        const u = ease(anim.t / anim.dur);
        const lift = Math.sin(u * Math.PI) * 7;
        const paths: [number, number, number, number, number][] = [[ax, ay, bx, by, 1], [bx, by, ax, ay, -1]];
        for (const [x0, y0, x1, y1, up] of paths) {
          const x = Math.round(x0 + (x1 - x0) * u);
          const y = Math.round(y0 + (y1 - y0) * u - lift * up);
          pen.ell(x, y, 5, 4, C.ink);
          pen.ell(x, y, 4, 3, C.brass);
          pen.px(x - 1, y - 1, 2, 2, C.brassH);
        }
      }
    }
    for (const p of pops) {
      // on a dark plate, so it reads over the wood
      const y = p.y - Math.round((1 - Math.min(1, p.t)) * 6);
      const width = pen.width(p.text);
      pen.px(p.x - Math.round(width / 2) - 3, y - 1, width + 6, 15, C.ink);
      pen.txt(p.text, p.x, y, p.colour, "center");
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    const n = seats();
    const ringA = ringAngle();
    const sway = lessMotion() ? 0 : Math.sin(time * 1.3) * 3;
    const sx = shake > 0.3 ? Math.round(Math.sin(time * 97) * shake) : 0;
    const sy = shake > 0.3 ? Math.round(Math.cos(time * 83) * shake * 0.6) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SCENE_W, BAR_Y);
    ctx.clip();
    ctx.translate(sx, sy);
    drawRoom(pen);
    drawLamp(pen, sway);
    // far seats first, then the table, then the seats nearest the camera
    const order = Array.from({ length: n }, (_, seat) => seat).sort((a, b) => layoutOf(a).y - layoutOf(b).y);
    for (const seat of order) if (!layoutOf(seat).back) drawSeat(seat);
    drawTable(pen);
    // while a swap plays, the two chambers it touches stay shut until the rounds land
    const shut = anim !== null && anim.event.type === "swap" ? [anim.event.pair, mod(anim.event.pair + 1, n)] : [];
    drawDevice(pen, n, ringA, fire !== null ? fire.a : fired ? angleOf(mod(latest.view.muzzle - 1, n)) : ringA, hatchInfo, shut);
    for (const seat of order) if (layoutOf(seat).back) drawSeat(seat);
    const strength = 1 - (flick > 0 ? 0.3 * (0.5 + 0.5 * Math.sin(time * 70)) : 0);
    light.draw(pen, CX + sway + lean[0], CY - 4 + lean[1], strength);
    drawFx();
    drawOverlays(ringA);
    drawLabels();
    for (const line of speech) if (line.seat < n) drawSpeech(pen, layoutOf(line.seat), line.lines);
    ctx.restore();
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    const playing = deal <= 0 && view.phase !== "ended";
    const mine = myChamber();
    if (view.credits === null) {
      pen.txt(WORDS.panel.watching, x, 3, C.amber);
      pen.txt(WORDS.panel.noSeat, x, 26, C.boneD);
    } else {
      // My credits, which only I can see. What the table has gathered for the swap is on nobody's screen.
      pen.txt(WORDS.panel.credits, x, 3, C.boneD);
      pen.txt(`${view.credits}`, x + pen.width(WORDS.panel.credits) + 6, 3, C.amber);
      const pitch = 168 / rules.startCredits;
      const pipWidth = Math.max(1, Math.floor(pitch) - 2);
      for (let i = 0; i < rules.startCredits; i++) pen.px(x + Math.floor(i * pitch), 17, pipWidth, 5, i < view.credits ? C.brass : C.steelDD);
      if (mine !== null && playing) {
        const known = view.chambers[mine];
        // the chance of a round in a chamber I cannot be sure of, counted from those I can
        let live = rules.bullets;
        let unsure = 0;
        view.chambers.forEach((q, j) => {
          if (q === null || view.doubt[j] > 0) unsure++;
          else if (q === 1) live--;
        });
        const line = WORDS.panel.mine(LETTERS[mine], known, Math.round((100 * Math.max(0, live)) / Math.max(1, unsure)), view.doubt[mine] > 0);
        pen.txt(line, x, 26, known === 1 ? C.crim : known === 0 ? C.teal : C.bone);
      }
    }
    if (playing && view.doubt.some((count) => count > 0)) {
      // A chamber known only as it was: its mark, shut with the colours of what was seen in it, and for
      // the one in front of me how many hidden actions there have been since.
      pen.ell(x + 5, 46, 4, 3, C.steelDD);
      pen.ell(x + 5, 46, 3, 2, C.hatch);
      pen.px(x + 3, 45, 2, 2, C.crim);
      pen.px(x + 6, 45, 2, 2, C.teal);
      pen.txt(WORDS.panel.since(mine !== null && view.credits !== null && view.doubt[mine] > 0 ? view.doubt[mine] : null), x + 13, 40, C.boneD);
    }
    pen.px(x, 55, 168, 1, C.steelDD);
    pen.ell(x + 5, 64, 4, 3, C.bone);
    pen.ell(x + 5, 64, 3, 2, C.hatch);
    pen.txt(WORDS.panel.allKnow, x + 13, 58, C.boneD);
    pen.ell(x + 87, 64, 3, 2, C.hatch);
    pen.px(x + 86, 59, 3, 1, C.amber);
    pen.px(x + 86, 69, 3, 1, C.amber);
    pen.px(x + 81, 63, 1, 3, C.amber);
    pen.px(x + 93, 63, 1, 3, C.amber);
    pen.txt(WORDS.panel.onlyIKnow, x + 98, 58, C.boneD);
    pen.px(x, 73, 168, 1, C.steelDD);
    // nobody is told how many seats are out of credits: the round is all there is to count
    pen.txt(WORDS.panel.status(view.round + 1), x, 76, C.boneD);
    // what happened, newest at the bottom; a mark on what came since my last move
    const lines = logLines();
    const back = fired ? Math.min(logBack, Math.max(0, lines.length - LOG_ROWS)) : 0;
    const from = Math.max(0, lines.length - LOG_ROWS - back);
    const to = Math.min(lines.length, from + LOG_ROWS);
    for (let i = from; i < to; i++) {
      const y = LOG_TOP + (i - from) * LOG_ROW_H;
      const line = lines[i];
      if (line.fresh) pen.px(x - 3, y + 1, 1, 11, C.amber);
      pen.txt(line.text, x, y, line.fresh || line.colour !== C.bone ? line.colour : C.boneD);
    }
    // once the game is over: an arrow where there are rows above what is shown, and one where there are rows below
    if (fired && latest?.view.phase === "ended") {
      const arrow = (y: number, up: boolean): void => [1, 3, 5].forEach((w, row) => pen.px(x + 161 + (5 - w) / 2, y + (up ? row : 2 - row), w, 1, C.amber));
      if (from > 0) arrow(LOG_TOP + 4, true);
      if (to < lines.length) arrow(LOG_TOP + LOG_ROWS * LOG_ROW_H - 8, false);
    }
  }

  /** The words above the buttons, and their colour. */
  function prompt(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const rules = latest.rules;
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.prompt.offline, C.crim];
    if (deal > 0) return [WORDS.prompt.dealing, C.boneD];
    if (fire !== null) return [WORDS.prompt.firing, C.crim];
    if (anim !== null || !settled()) {
      const last = logLines().at(-1);
      return [last === undefined ? "" : (last.said ?? last.text), C.boneD];
    }
    const waiting = awaited();
    if (waiting === null) return ["", C.boneD];
    if (waiting !== view.seat) {
      const who = pen.fit(nickOf(waiting), NAME_WIDTH);
      const player = latest.players[waiting];
      if (latest.turnEndsIn !== null && !player.connected) {
        const left = secondsLeft() ?? 0;
        return [WORDS.prompt.away(who, left), C.boneD];
      }
      return [WORDS.prompt.turnOf(who), C.boneD];
    }
    if (pending) return [WORDS.prompt.sending, C.boneD];
    const mine = myChamber() ?? 0;
    if (sel === null) {
      if (passing()) return [WORDS.prompt.passing, C.amber];
      // what a hidden action may have changed since is as good as not known
      const known = view.doubt[mine] > 0 ? null : view.chambers[mine];
      const myMoves = view.history.filter((event) => event.seat === view.seat).length;
      if (myMoves < 2) {
        // the first turns teach by the next thing to do
        if (known === null) return [WORDS.prompt.firstCheck, C.amber];
        if (known === 1) return [WORDS.prompt.liveAhead, C.crim];
        return [WORDS.prompt.emptyAhead, C.teal];
      }
      return [WORDS.prompt.yourTurn, C.amber];
    }
    const n = seats();
    const pair = `${LETTERS[sel.pair]}·${LETTERS[mod(sel.pair + 1, n)]}`;
    if (sel.mode === "pick") return [WORDS.prompt.pick(sel.act === 0, pair), C.amber];
    if (sel.mode === "swap") return [WORDS.prompt.swap(pair), C.amber];
    if (sel.mode === "amount") return [WORDS.prompt.amount(sel.amount, rules.tamperNeed), C.amber];
    const steps = sel.act === 2 ? 1 : 2;
    const j = mod(mine - steps, n);
    const known = view.chambers[j];
    return [WORDS.prompt.turn(steps, LETTERS[j], known, view.doubt[j] > 0), known === 1 ? C.crim : C.amber];
  }

  /** A small button of the bar; `live` false where it takes no press yet, and is drawn dim. */
  function smallButton(rect: readonly [number, number, number, number], label: string, strong: boolean, live = true): void {
    pen.px(rect[0], rect[1], rect[2], rect[3], strong ? C.amberD : C.steelDD);
    pen.px(rect[0] + 1, rect[1] + 1, rect[2] - 2, rect[3] - 2, live && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, rect[0] + Math.round(rect[2] / 2), rect[1] + 2, strong ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** Whether the turn is this player's by the room's last word, and theirs to take: not one the room passes for them. */
  function waits(): boolean {
    const me = truth?.view.seat ?? null;
    if (truth === null || me === null || truth.view.phase === "ended" || truth.view.current !== me) return false;
    return !(truth.view.phase === "turn" && truth.view.credits === 0);
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const result = latest?.view.result ?? null;
    const me = latest?.view.seat ?? null;
    if (result === null || me === null) return null;
    return WORDS.result.verdict(true, result.hitSeats.includes(me));
  }

  function drawResults(): void {
    if (latest === null || latest.view.result === null) return;
    const result = latest.view.result;
    const me = latest.view.seat;
    const lost = me !== null && result.hitSeats.includes(me);
    pen.txt(WORDS.result.verdict(me !== null, lost), 10, 234, me === null ? C.bone : lost ? C.crim : C.teal, "left", 24);
    const live = result.chambers.map((round, j) => (round === 1 ? LETTERS[j] : "")).filter((letter) => letter !== "");
    pen.txt(WORDS.result.live(live.join("·")), 96, 226, C.bone);
    pen.txt(WORDS.result.fallen(result.hitSeats.map((seat) => pen.fit(nickOf(seat), LOG_NAME_WIDTH)).join(", ")), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(starting ? WORDS.prompt.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
    // (dim while they take no press yet: `RESULTS_PRESS_HOLD`)
    const pressable = resultsAt !== null && time - resultsAt >= RESULTS_PRESS_HOLD;
    if (host) smallButton(AGAIN_RECT, WORDS.button.again, !starting && pressable, pressable);
    smallButton(LOBBY_RECT, WORDS.button.lobby, false, pressable);
  }

  function drawBar(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    pen.px(0, BAR_Y, W, H - BAR_Y, C.bar);
    pen.px(0, BAR_Y, W, 1, C.steelDD);
    if (fired && view.phase === "ended") {
      drawResults();
      return;
    }
    const [words, colour] = prompt();
    pen.txt(words, 6, 225, colour);
    const live = canAct();
    if (live && sel !== null) {
      smallButton(OK_RECT, WORDS.button.confirm, true);
      if (sel.mode !== "swap") smallButton(NO_RECT, WORDS.button.cancel, false);
    }
    if (view.credits === null) {
      // someone watching has no credits to spend: where the actions would be, what the game is, and that they are watching it
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(WORDS.prompt.watching(handlers.out()), 6, 254, C.boneD);
      return;
    }
    const names = WORDS.action.names;
    const prices = costs(rules);
    for (let i = 0; i < 5; i++) {
      const rect = buttonRect(i);
      const [x, y, w, h] = rect;
      const can = live && view.credits >= prices[i] && !(sel !== null && sel.mode === "swap");
      // (a move pressed too soon lights its button while it is kept: `early`)
      const on = (live && sel !== null && sel.act === i) || (!live && early !== null && early.act === i && time - early.at <= EARLY_HOLD);
      if (on && sel !== null && sel.mode === "amount") {
        // counting credits out for the swap: one fewer, the count, one more
        const most = Math.min(rules.tamperMaxPerTurn, view.credits);
        const step = (box: Box, sign: string, able: boolean): void => {
          pen.px(box[0], box[1], box[2], box[3], C.steelDD);
          pen.px(box[0] + 1, box[1] + 1, box[2] - 2, box[3] - 2, able && inRect(mouse, box) ? C.btnH : C.btn);
          pen.txt(sign, box[0] + Math.round(box[2] / 2), box[1] + 7, able ? C.bone : C.dim, "center");
        };
        step(FEWER_RECT, "-", sel.amount > 1);
        pen.px(COUNT_RECT[0], COUNT_RECT[1], COUNT_RECT[2], COUNT_RECT[3], C.amberD);
        pen.px(COUNT_RECT[0] + 1, COUNT_RECT[1] + 1, COUNT_RECT[2] - 2, COUNT_RECT[3] - 2, "#3a2a12");
        pen.txt(WORDS.action.count(sel.amount), COUNT_RECT[0] + Math.round(COUNT_RECT[2] / 2), COUNT_RECT[1] + 7, C.amber, "center");
        step(MORE_RECT, "+", sel.amount < most);
        continue;
      }
      pen.px(x, y, w, h, on ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, on ? "#3a2a12" : can && inRect(mouse, rect) ? C.btnH : C.btn);
      pen.txt(`${i + 1} ${names[i]}`, x + 5, y + 2, on ? C.amber : can ? C.bone : C.dim);
      pen.txt(i < 4 ? WORDS.action.price(prices[i]) : WORDS.action.tamper(rules.tamperMaxPerTurn), x + 5, y + 14, can || on ? C.boneD : C.dim);
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const n = seats();
    const lines = WORDS.help(rules, n);
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(line.text, 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : C.bone);
    });
  }

  function draw(): void {
    if (latest === null) {
      pen.clear(C.night);
      return;
    }
    if (help) {
      drawHelp();
      return;
    }
    pen.clear(C.night);
    drawScene();
    drawPanel();
    drawBar();
  }

  // ---- The screen, the loop and the listeners -------------------------------------------------------
  // The page scales the canvas with the frame it sits in; here it is always its own 480 by 270.
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not a move, and neither is one pressed on a button
    // the player has gone to with the keyboard: that key is the button's
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    startAudio();
    if (!event.repeat) keys.add(event.code);
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
    verdict,
    waits,
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
      // whether the room took the move is not known: it says so when it can be heard again
      takeBack();
      offline = true;
    },
    setHost(value: boolean): void {
      host = value;
    },
    say(slot: number, text: string): void {
      if (latest === null) return;
      // someone watching has no seat to speak from: their line is in the chat alone
      const players = latest.players;
      const seat = latest.view.seats.findIndex((info, at) => !info.bot && info.occupant === slot && !players[at].left);
      if (seat < 0) return;
      speech = speech.filter((line) => line.seat !== seat);
      speech.push({ seat, lines: speechLines(pen, text), t: speechSeconds(text) });
    },
    press(code: string): void {
      keys.add(code);
    },
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      unwatch();
    },
  };
}

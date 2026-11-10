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
import type { Action, RulesConfig, SeatEvent, SeatView } from "../../shared/game";
import type { ServerMessage } from "../../shared/protocol";
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
  hatchXY,
  pairAt,
  posAngle,
  seatLayout,
  speechLines,
  speechSeconds,
  tipXY,
  type HatchInfo,
  type IconName,
  type SeatLayout,
} from "./draw";
import { CHAIR_DOWN, FIGURE_COUNT } from "./figures";
import { C } from "./palette";
import * as fxlib from "./pixelfx.js";
import { isMuted, setMuted, sfx, startAudio } from "./sound";

/** What the room sends about the game. */
export type GameMessage = Extract<ServerMessage, { type: "game" }>;

/** What the screen asks of whoever owns the connection. */
export interface TableHandlers {
  /** The player made a move. */
  act(action: Action): void;
  /** The host asked for the next game. */
  again(): void;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
}

/** The game screen. */
export interface Table {
  /** The room sent the game again. */
  update(message: GameMessage): void;
  /** The room refused the player's last move or start. */
  refused(reason: string): void;
  /** Whether this player is the host, who starts the next game. */
  setHost(host: boolean): void;
  /** The player in lobby slot `slot` said a line: it shows over their seat for a moment. */
  say(slot: number, text: string): void;
  /** Stops drawing and listening. */
  destroy(): void;
}

/** One step of the screen's clock, in seconds. Animations run on it, never on frames. */
const STEP = 1 / 60;
const TAU = Math.PI * 2;
/** Seconds the seats take to fill when a game starts. */
const DEAL_SECONDS = 1.2;
/** Seconds each kind of move stays on show. */
const SHOW = { look: 0.7, rotate1: 0.8, rotate2: 1.05, tamper: 0.56, swap: 1.0, forfeit: 0.5, out: 0.3 };
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

const WAIT_TEXT: Record<string, string> = {
  "not-your-turn": "지금은 내 차례가 아닙니다",
  "not-enough-credits": "크레딧이 모자랍니다",
  "out-of-credits": "크레딧을 다 써서 더는 행동할 수 없습니다",
  "swap-pending": "먼저 맞바꿀 두 칸을 골라야 합니다",
  "game-over": "이 판은 끝났습니다",
  "not-seated": "관전 중에는 행동할 수 없습니다",
  "no-game": "진행 중인 판이 없습니다",
  "not-host": "방장만 새 판을 시작할 수 있습니다",
  "bad-player-count": "지금 인원으로는 시작할 수 없습니다 (4~6명)",
  "already-playing": "이미 판이 진행 중입니다",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
};

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
/** The two buttons under the results: the next game (the host's) and the way back to the waiting room. */
const AGAIN_RECT: [number, number, number, number] = [386, 225, 90, 15];
const LOBBY_RECT: [number, number, number, number] = [386, 250, 90, 15];

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link Table.update}. */
export function createTable(canvas: HTMLCanvasElement, handlers: TableHandlers): Table {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);
  const light = new Light();

  let latest: GameMessage | null = null;
  /** The last view from before the game ended: what the player knew going into the volley. */
  let before: SeatView | null = null;
  /** How many moves of the history have been shown. */
  let seen = 0;
  let anim: Anim | null = null;
  let sel: Selection | null = null;
  /** A move has been sent and the room has not answered yet. */
  let pending = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** Seconds since the screen was made; drives the lamp, the blinking and the clock. */
  let time = 0;
  /** `time` when the latest message arrived. */
  let received = 0;
  let deal = 0;
  let fire: Fire | null = null;
  /** The volley of this game has been shown to its end. */
  let fired = false;
  let fallen: boolean[] = [];
  let revealed: (0 | 1 | null)[] = [];
  let pops: Pop[] = [];
  let speech: Speech[] = [];
  let shake = 0;
  let flick = 0;
  let beat = 0;
  const lean: [number, number] = [0, 0];
  /** Whether the player could act at the last step; a change to yes is announced. */
  let couldAct = false;
  /** The last second of the player's own turn that was ticked aloud. */
  let ticked = -1;
  const playing: PlayingFx[] = [];

  const keys = new Set<string>();
  const clicks: { x: number; y: number }[] = [];
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
  const word = (round: 0 | 1): string => (round === 1 ? "실탄" : "빔");

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
    return Math.max(0, Math.ceil((latest.turnEndsIn - (time - received) * 1000) / 1000));
  }

  function awaited(): number | null {
    if (latest === null || latest.view.phase === "ended") return null;
    const view = latest.view;
    return view.phase === "swap" && view.swapSeat !== null ? view.swapSeat : view.current;
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
    if (view.phase !== "ended") return [view.chambers[j] ?? null, view.source[j] ?? null];
    // During the volley a chamber opens when it is fired; until then it shows what was known going in.
    if (fired || revealed[j] !== null) return [fired ? (view.chambers[j] ?? null) : revealed[j], "public"];
    return before === null ? [null, null] : [before.chambers[j] ?? null, before.source[j] ?? null];
  }

  // ---- Effects --------------------------------------------------------------------------
  function addFx(effect: fxlib.FxModule, options: fxlib.FxOptions, box: [number, number, number, number]): void {
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
    couldAct = false;
    // A game met part-way is shown as it stands; only a game seen from its first moment gets the seat draw.
    seen = history.length;
    deal = history.length === 0 && message.view.phase !== "ended" ? DEAL_SECONDS : 0;
    if (message.view.phase === "ended" && message.view.result !== null) {
      fired = true;
      for (const seat of message.view.result.hitSeats) fallen[seat] = true;
    }
  }

  function update(message: GameMessage): void {
    if (latest === null || latest.startedAt !== message.startedAt) resetFor(message);
    latest = message;
    received = time;
    pending = false;
    if (message.view.phase !== "ended") before = message.view;
  }

  // ---- Showing moves one at a time --------------------------------------------------------
  function beginEvent(event: SeatEvent): void {
    if (latest === null) return;
    const mine = event.seat === latest.view.seat;
    const waiting = latest.view.history.length - seen;
    let dur = SHOW.look;
    if (event.type === "public") {
      sfx.look();
      if (event.seen[0] === 1 || event.seen[1] === 1) sfx.live();
      else sfx.empty();
    } else if (event.type === "private") {
      sfx.look();
      if (mine && event.seen !== null) {
        if (event.seen[0] === 1 || event.seen[1] === 1) sfx.live();
        else sfx.empty();
      }
    } else if (event.type === "rotate") {
      dur = event.steps === 2 ? SHOW.rotate2 : SHOW.rotate1;
      sfx.ratchet(event.steps * 3);
    } else if (event.type === "tamper") {
      dur = SHOW.tamper;
      sfx.chip();
      if (event.earned && mine) sfx.earn();
    } else if (event.type === "swap") {
      dur = SHOW.swap;
      sfx.swap();
    } else {
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
      shake = 5;
      flick = 0.5;
      sfx.bang();
      pops.push({ text: "탕!", x: px0, y: py0, t: 1.1, colour: C.crim });
      muzzleFx(fire.a, 3 + fire.k);
      addFx(fxlib.poof, { x: at.x, y: at.y + 14, seed: 21 + fire.k }, [at.x - 56, at.y - 66, 112, 92]);
    } else {
      sfx.click();
      pops.push({ text: "철컥", x: px0, y: py0, t: 0.8, colour: C.teal });
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
      say(WAIT_TEXT["not-enough-credits"]);
      sfx.deny();
      return;
    }
    if (i <= 1) sel = { mode: "pick", act: i, pair: lookDefault(), amount: 1 };
    else if (i <= 3) sel = { mode: "confirm", act: i, pair: 0, amount: 1 };
    else sel = { mode: "amount", act: 4, pair: 0, amount: 1 };
    sfx.pick();
  }

  function send(action: Action): void {
    pending = true;
    sel = null;
    handlers.act(action);
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
    const clicked = (rect: readonly [number, number, number, number]): boolean => clicks.some((p) => inRect(p, rect));
    if (pressed("KeyM")) setMuted(!isMuted());
    if (pressed("KeyH")) help = !help;
    if (help) {
      if (pressed("Escape", "Enter") || clicks.length > 0) help = false;
      return;
    }
    if (fired && latest.view.phase === "ended") {
      if (pressed("Escape", "Backspace") || clicked(LOBBY_RECT)) {
        handlers.lobby();
      } else if (pressed("Enter", "NumpadEnter", "KeyR") || (host && clicked(AGAIN_RECT))) {
        if (host) handlers.again();
        else say(WAIT_TEXT["not-host"]);
      }
      return;
    }
    const able = canAct();
    if (able && !couldAct) {
      sfx.turn();
      if (latest.view.phase === "swap") {
        sel = { mode: "swap", act: 4, pair: swapDefault(), amount: 1 };
        sfx.earn();
      }
    }
    couldAct = able;
    if (!able) {
      sel = null;
      return;
    }

    let picked: number | null = null;
    for (let i = 0; i < 5; i++) {
      if (pressed(`Digit${i + 1}`, `Numpad${i + 1}`) || clicked(buttonRect(i))) picked = i;
    }
    if (sel === null) {
      if (picked !== null) choose(picked);
      return;
    }
    if (sel.mode !== "swap") {
      // the swap, once earned, has to be made; anything else can be put down
      if (picked !== null && picked !== sel.act) {
        choose(picked);
        return;
      }
      if (pressed("Escape", "Backspace") || clicked(NO_RECT)) {
        sel = null;
        sfx.back();
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
          confirm();
          return;
        }
        sel.pair = at;
        sfx.move();
      }
    } else if (sel.mode === "amount") {
      const most = Math.min(latest.rules.tamperMaxPerTurn, latest.view.credits ?? 0);
      if (left && sel.amount > 1) {
        sel.amount--;
        sfx.move();
      }
      if (right && sel.amount < most) {
        sel.amount++;
        sfx.move();
      }
    }
    if (pressed("Enter", "NumpadEnter", "Space") || clicked(OK_RECT)) confirm();
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

      // one seat from the end: a pulse
      if (latest.view.phase !== "ended" && latest.view.outCount >= latest.rules.endWhenOut - 1) {
        beat -= dt;
        if (beat <= 0) {
          beat = 1.15;
          sfx.beat();
        }
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
    let out = 0;
    for (let i = 0; i < upTo; i++) {
      const event = view.history[i];
      const who = pen.fit(nickOf(event.seat), LOG_NAME_WIDTH);
      const fresh = i > lastMine;
      const add = (text: string, colour: string = C.bone) => lines.push({ text, colour, fresh });
      if (event.type === "public") {
        add(`${who} 공개 ${LETTERS[event.pair]}${word(event.seen[0])} ${LETTERS[mod(event.pair + 1, seats())]}${word(event.seen[1])}`);
      } else if (event.type === "private") {
        const a = LETTERS[event.pair];
        const b = LETTERS[mod(event.pair + 1, seats())];
        add(`${who} 비공개 ${a}·${b}`);
        if (event.seen !== null) add(`나만: ${a} ${word(event.seen[0])}, ${b} ${word(event.seen[1])}`, C.amber);
      } else if (event.type === "rotate") {
        add(`${who} 총구 ${event.steps}칸 회전`);
      } else if (event.type === "tamper") {
        if (event.forced) add(`${who} 시간 초과: 1개 제출`, C.boneD);
        else add(event.amount === null ? `${who} 조작함에 제출` : `${who} 조작함에 ${event.amount}개`);
        if (event.earned) add(`${who} 조작권 획득!`, C.amber);
      } else if (event.type === "swap") {
        add(`${who} 조작: ${LETTERS[event.pair]}·${LETTERS[mod(event.pair + 1, seats())]} 맞바꿈`, C.amber);
      } else {
        add(`${who} 조작권을 놓침`, C.boneD);
      }
      if (event.out) {
        out++;
        add(`${who} 크레딧 소진`, C.crim);
        if (out === latest.rules.endWhenOut - 1) add("한 명만 더 바닥나면 끝!", C.amber);
      }
      if (event.ended) add("격발!", C.crim);
    }
    if (fire !== null || fired) {
      const result = view.result;
      const shots = result === null ? [] : fired ? result.shots : result.shots.slice(0, Math.max(0, fire === null ? 0 : fire.stage === "aim" ? fire.k : fire.k + 1));
      for (const shot of shots) {
        const who = pen.fit(nickOf(shot.seat), LOG_NAME_WIDTH);
        lines.push({ text: shot.hit ? `탕! ${who} 탈락` : `철컥. ${who} 생존`, colour: shot.hit ? C.crim : C.teal, fresh: true });
      }
    }
    return lines;
  }

  /** What each seat last did since the player's own last move, for the icon beside its head. */
  function lastActs(): (IconName | null)[] {
    const acts = new Array<IconName | null>(seats()).fill(null);
    if (latest === null) return acts;
    const view = latest.view;
    const upTo = Math.min(view.history.length, seen);
    let from = 0;
    for (let i = 0; i < upTo; i++) if (view.history[i].seat === view.seat) from = i;
    for (let i = from; i < upTo; i++) {
      const event = view.history[i];
      if (event.type === "public" || event.type === "private" || event.type === "tamper" || event.type === "swap") acts[event.seat] = event.type;
      else if (event.type === "rotate") acts[event.seat] = event.steps === 2 ? "rotate2" : "rotate1";
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

  function drawLabels(): void {
    if (latest === null) return;
    const view = latest.view;
    const acts = lastActs();
    const waiting = settled() ? awaited() : null;
    const n = seats();
    for (let seat = 0; seat < n; seat++) {
      if (seat >= dealShown()) continue;
      const at = layoutOf(seat);
      const player = latest.players[seat];
      const info = view.seats[seat];
      const mine = seat === view.seat;
      const name = pen.fit(player.nick, NAME_WIDTH);
      const lead = view.phase !== "ended" && deal <= 0 && mod(view.round, n) === seat;
      const width = pen.width(name) + (lead ? 17 : 0);
      const lx = at.label.align === "center" ? at.label.x - Math.round(width / 2) : at.label.x;
      const ly = at.label.y;
      pen.txt(name, lx, ly, fallen[seat] ? C.dim : waiting === seat || (mine && deal > 0) ? C.amber : C.bone);
      if (lead) {
        // leads this round
        pen.px(lx + width - 14, ly, 14, 13, C.amberD);
        pen.px(lx + width - 13, ly + 1, 12, 11, C.ink);
        pen.txt("선", lx + width - 13, ly + 1, C.amber);
      }
      // under the name: what the table can tell of the seat. My own seat has no room for a second line.
      const second = (text: string, colour: string) => pen.txt(text, mine ? lx + width + 5 : lx, mine ? ly : ly + 13, colour);
      if (fallen[seat]) second("탈락", C.crim);
      else if (deal > 0) {
        // nothing yet
      } else if (info.out) second("소진", C.crim);
      else if (player.left) second("나감", C.dim);
      else if (!player.connected) second("끊김", C.dim);
      else if (!mine) {
        // credits left, as far as the table can count them
        pen.px(lx, ly + 16, 5, 5, C.brassD);
        pen.px(lx + 1, ly + 17, 3, 3, C.brass);
        pen.txt(info.minCredits === info.maxCredits ? `${info.maxCredits}` : `${info.minCredits}~${info.maxCredits}`, lx + 8, ly + 13, C.boneD);
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
    const blink = Math.floor(time * 5) % 2 === 0;
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
    const sway = Math.sin(time * 1.3) * 3;
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
    if (view.credits === null || view.pot === null) {
      pen.txt("관전 중", x, 3, C.amber);
      pen.txt("이 판에는 자리가 없습니다", x, 26, C.boneD);
    } else {
      // my credits, which only I can see, and my hidden deposit towards the swap
      pen.txt("크레딧", x, 3, C.boneD);
      pen.txt(`${view.credits}`, x + 42, 3, C.amber);
      const pitch = 168 / rules.startCredits;
      const pipWidth = Math.max(1, Math.floor(pitch) - 2);
      for (let i = 0; i < rules.startCredits; i++) pen.px(x + Math.floor(i * pitch), 17, pipWidth, 5, i < view.credits ? C.brass : C.steelDD);
      pen.txt("조작함", x, 26, C.boneD);
      for (let i = 0; i < rules.tamperNeed; i++) pen.px(x + 44 + i * 10, 30, 8, 5, i < view.pot ? C.crim : C.steelDD);
      pen.txt(`${view.pot}/${rules.tamperNeed}`, W - 5, 26, C.boneD, "right");
      const mine = myChamber();
      if (mine !== null && deal <= 0 && view.phase !== "ended") {
        const known = view.chambers[mine];
        let live = rules.bullets;
        let blank = 0;
        for (const q of view.chambers) {
          if (q === 1) live--;
          else if (q === null) blank++;
        }
        const letter = LETTERS[mine];
        const line =
          known === 1 ? `내 앞 약실 ${letter}: 실탄!` : known === 0 ? `내 앞 약실 ${letter}: 비었음` : `내 앞 약실 ${letter}: 모름 ${Math.round((100 * live) / Math.max(1, blank))}%`;
        pen.txt(line, x, 40, known === 1 ? C.crim : known === 0 ? C.teal : C.bone);
      }
    }
    pen.px(x, 55, 168, 1, C.steelDD);
    pen.ell(x + 5, 64, 4, 3, C.bone);
    pen.ell(x + 5, 64, 3, 2, C.hatch);
    pen.txt("모두 앎", x + 13, 58, C.boneD);
    pen.ell(x + 87, 64, 3, 2, C.hatch);
    pen.px(x + 86, 59, 3, 1, C.amber);
    pen.px(x + 86, 69, 3, 1, C.amber);
    pen.px(x + 81, 63, 1, 3, C.amber);
    pen.px(x + 93, 63, 1, 3, C.amber);
    pen.txt("나만 앎", x + 98, 58, C.boneD);
    pen.px(x, 73, 168, 1, C.steelDD);
    const close = view.phase !== "ended" && view.outCount >= rules.endWhenOut - 1;
    pen.txt(`${view.round + 1}라운드 · 소진 ${view.outCount}/${rules.endWhenOut} · H 규칙`, x, 76, close ? C.crim : C.boneD);
    // what happened, newest at the bottom; a mark on what came since my last move
    const lines = logLines();
    const from = Math.max(0, lines.length - LOG_ROWS);
    for (let i = from; i < lines.length; i++) {
      const y = LOG_TOP + (i - from) * 14;
      const line = lines[i];
      if (line.fresh) pen.px(x - 3, y + 1, 1, 11, C.amber);
      pen.txt(line.text, x, y, line.fresh || line.colour !== C.bone ? line.colour : C.boneD);
    }
  }

  /** The words above the buttons, and their colour. */
  function prompt(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const rules = latest.rules;
    if (noteT > 0) return [note, C.amber];
    if (deal > 0) return ["자리 추첨 중", C.boneD];
    if (fire !== null) return ["격발: 총구가 향한 자리부터 시계 방향으로 한 발씩", C.crim];
    if (anim !== null || !settled()) {
      const lines = logLines();
      return [lines.length > 0 ? lines[lines.length - 1].text : "", C.boneD];
    }
    const waiting = awaited();
    if (waiting === null) return ["", C.boneD];
    if (waiting !== view.seat) {
      const who = pen.fit(nickOf(waiting), NAME_WIDTH);
      const player = latest.players[waiting];
      if (latest.turnEndsIn !== null && !player.connected) {
        const left = Math.max(0, Math.ceil((latest.turnEndsIn - (time - received) * 1000) / 1000));
        return [`${who} 자리 비움: ${left}초 뒤 자동으로 1크레딧 제출`, C.boneD];
      }
      return [`${who} 차례`, C.boneD];
    }
    if (pending) return ["보내는 중", C.boneD];
    const mine = myChamber() ?? 0;
    if (sel === null) {
      const known = view.chambers[mine];
      if (view.outCount >= rules.endWhenOut - 1) return ["내 차례: 누구든 크레딧을 다 쓰면 그 자리에서 격발입니다", C.amber];
      const myMoves = view.history.filter((event) => event.seat === view.seat).length;
      if (myMoves < 2) {
        // the first turns teach by the next thing to do
        if (known === null) return ["내 차례: 1이나 2로 내 앞 약실부터 조사해 보세요", C.amber];
        if (known === 1) return ["내 앞이 실탄! 3이나 4로 총구를 돌려 옆자리로 넘기세요", C.crim];
        return ["내 앞은 비었습니다. 크레딧을 아끼며 다른 자리를 살피세요", C.teal];
      }
      return ["내 차례: 행동을 고르세요 (1~5)", C.amber];
    }
    const n = seats();
    const pair = `${LETTERS[sel.pair]}·${LETTERS[mod(sel.pair + 1, n)]}`;
    if (sel.mode === "pick") return [`${sel.act === 0 ? "공개 조사" : "비공개 조사"}: ${pair} 칸 · 좌우 키로 고르기`, C.amber];
    if (sel.mode === "swap") return [`조작권! 맞바꿀 두 칸 ${pair} · 좌우 키로 고르기`, C.amber];
    if (sel.mode === "amount") return [`조작함에 ${sel.amount}개 · 좌우 키로 개수 · 모은 ${view.pot ?? 0}/${rules.tamperNeed}`, C.amber];
    const steps = sel.act === 2 ? 1 : 2;
    const j = mod(mine - steps, n);
    const known = view.chambers[j];
    return [`${steps}칸 회전: ${LETTERS[j]} 약실(${known === 1 ? "실탄" : known === 0 ? "빔" : "모름"})이 내 앞으로`, known === 1 ? C.crim : C.amber];
  }

  function smallButton(rect: readonly [number, number, number, number], label: string, strong: boolean): void {
    pen.px(rect[0], rect[1], rect[2], rect[3], strong ? C.amberD : C.steelDD);
    pen.px(rect[0] + 1, rect[1] + 1, rect[2] - 2, rect[3] - 2, inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, rect[0] + Math.round(rect[2] / 2), rect[1] + 2, strong ? C.amber : C.bone, "center");
  }

  function drawResults(): void {
    if (latest === null || latest.view.result === null) return;
    const result = latest.view.result;
    const me = latest.view.seat;
    const lost = me !== null && result.hitSeats.includes(me);
    pen.txt(me === null ? "종료" : lost ? "탈락" : "생존!", 10, 234, me === null ? C.bone : lost ? C.crim : C.teal, "left", 24);
    const live = result.chambers.map((round, j) => (round === 1 ? LETTERS[j] : "")).filter((letter) => letter !== "");
    pen.txt(`실탄은 ${live.join("·")} 약실에 있었습니다`, 96, 226, C.bone);
    pen.txt(`쓰러진 자리: ${result.hitSeats.map((seat) => pen.fit(nickOf(seat), LOG_NAME_WIDTH)).join(", ")}`, 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? "같은 사람들과 한 판 더 하거나 대기실로" : "방장이 새 판을 시작하기를 기다리는 중", 96, 254, C.boneD);
    if (host) smallButton(AGAIN_RECT, "Enter 새 판", true);
    smallButton(LOBBY_RECT, "Esc 대기실로", false);
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
      smallButton(OK_RECT, "Enter 확정", true);
      if (sel.mode !== "swap") smallButton(NO_RECT, "Esc 취소", false);
    }
    if (view.credits === null) {
      pen.txt("관전 중입니다. 다음 판부터 함께할 수 있습니다.", 6, 248, C.boneD);
      return;
    }
    const names = ["공개 조사", "비공개 조사", "1칸 회전", "2칸 회전", "조작"];
    const prices = costs(rules);
    for (let i = 0; i < 5; i++) {
      const rect = buttonRect(i);
      const [x, y, w, h] = rect;
      const can = live && view.credits >= prices[i] && !(sel !== null && sel.mode === "swap");
      const on = live && sel !== null && sel.act === i;
      pen.px(x, y, w, h, on ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, on ? "#3a2a12" : can && inRect(mouse, rect) ? C.btnH : C.btn);
      pen.txt(`${i + 1} ${names[i]}`, x + 5, y + 2, on ? C.amber : can ? C.bone : C.dim);
      pen.txt(i < 4 ? `크레딧 ${prices[i]}` : `1~${rules.tamperMaxPerTurn}개씩 · ${view.pot ?? 0}/${rules.tamperNeed}`, x + 5, y + 14, can || on ? C.boneD : C.dim);
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const n = seats();
    const lines: [string, string][] = [
      ["러시안 룰렛: 규칙", C.amber],
      [`약실 ${n}칸 중 ${rules.bullets}칸에 실탄이 있습니다. 한 자리에 약실 한 칸이 마주`, C.bone],
      ["보고, 마지막 격발 때 내 앞 약실이 비어 있으면 생존입니다.", C.bone],
      ["", C.bone],
      [`내 차례에는 다섯 가지 중 하나를 합니다. 크레딧은 ${rules.startCredits}개로 시작합니다.`, C.bone],
      [`1 공개 조사 (${rules.costPublic}): 이웃한 두 칸이 찼는지 모두에게 공개`, C.boneD],
      [`2 비공개 조사 (${rules.costPrivate}): 이웃한 두 칸을 나만 확인`, C.boneD],
      [`3 1칸 회전 (${rules.costRotate1}) · 4 2칸 회전 (${rules.costRotate2}): 총구와 실린더가 시계 방향으로`, C.boneD],
      ["   돕니다. 모든 약실이 그만큼 옆자리로 넘어갑니다.", C.boneD],
      [`5 조작: 한 번에 1~${rules.tamperMaxPerTurn}개씩 몰래 모아 ${rules.tamperNeed}이 되면 이웃한 두 칸의 탄을 맞바꿈`, C.boneD],
      ["", C.bone],
      ["남은 크레딧은 본인만 압니다. 크레딧이 남아 있으면 쉴 수 없습니다.", C.bone],
      [`${rules.endWhenOut}명이 크레딧을 다 쓰면 끝. 총구가 향한 자리부터 시계 방향으로`, C.bone],
      ["한 발씩 격발하고, 실탄을 맞은 사람이 탈락합니다.", C.bone],
      [
        rules.turnSeconds > 0
          ? `이 방은 차례마다 ${rules.turnSeconds}초: 넘기면 자동으로 1크레딧 제출 (접속이 끊기면 더 빨리).`
          : "접속이 끊긴 사람의 차례는 잠시 뒤 자동으로 1크레딧 제출로 넘어갑니다.",
        C.boneD,
      ],
      ["H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", C.amber],
    ];
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach(([text, colour], i) => {
      if (text !== "") pen.txt(text, 22, 20 + i * 15, colour);
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

  function toScreen(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * W) / (rect.width || W), y: ((event.clientY - rect.top) * H) / (rect.height || H) };
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not a move
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    startAudio();
    if (!event.repeat) keys.add(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace") event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent): void => {
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
  };
  const onPointerDown = (event: PointerEvent): void => {
    startAudio();
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    clicks.push(p);
  };
  addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);

  let last = performance.now() / 1000;
  let owed = 0;
  function frame(): void {
    if (stopped) return;
    const now = performance.now() / 1000;
    // a stalled tab never fast-forwards the screen
    owed += Math.min(now - last, 0.25);
    last = now;
    while (owed >= STEP) {
      step();
      owed -= STEP;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // the pixel font comes with the page: draw again once it is in
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    refused(reason: string): void {
      pending = false;
      say(WAIT_TEXT[reason] ?? "그 행동은 지금 할 수 없습니다");
      sfx.deny();
    },
    setHost(value: boolean): void {
      host = value;
    },
    say(slot: number, text: string): void {
      if (latest === null) return;
      // someone watching has no seat to speak from: their line is in the chat alone
      const seat = latest.view.seats.findIndex((info) => !info.bot && info.occupant === slot);
      if (seat < 0) return;
      speech = speech.filter((line) => line.seat !== seat);
      speech.push({ seat, lines: speechLines(pen, text), t: speechSeconds(text) });
    },
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

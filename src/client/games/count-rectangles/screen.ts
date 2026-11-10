/**
 * The screen of 네모 세기: the board and its target, the players under it,
 * the buzzer and the answer, and, once a problem is closed, the rectangles
 * that were there to be counted.
 *
 * Design: design/games/count-rectangles.md. The room decides everything;
 * this screen shows what it sends and asks for a buzz or an answer.
 */
import type { Rect, RectEvent } from "../../../shared/games/count-rectangles/rules";
import { afterBuzz, typeAnswer } from "../../../shared/games/count-rectangles/typing";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import {
  BAR_Y,
  H,
  Light,
  PANEL_X,
  Pen,
  SCENE_W,
  VOICE_MARK_W,
  W,
  drawLamp,
  drawSpeech,
  drawVoiceMark,
  speechLines,
  speechSeconds,
} from "../../game/draw";
import { FIGURE_COUNT, figureRects } from "../../game/figures";
import { C } from "../../game/palette";
import * as fxlib from "../../game/pixelfx.js";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";

/** What the room sends about a game of 네모 세기. */
export type RectMessage = Extract<ServerMessage, { type: "game"; game: "count-rectangles" }>;

/** What the screen asks of whoever owns the connection. */
export interface RectHandlers {
  /** The player buzzed or answered. */
  act(action: unknown): void;
  /** The host asked for the next game. */
  again(): void;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
}

/** The game screen. */
export interface RectScreen {
  update(message: RectMessage): void;
  refused(reason: string): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/**
 * Where the board sits: the band of the scene it is centred in. The tallest
 * board ends above the players' heads with room between for what they say,
 * so nothing is ever drawn over a number someone is counting.
 */
const BOARD_TOP = 12;
const BOARD_BAND = 124;
/** The plate with the target number: left of the board, under the page's own way out of the game. */
const TARGET_RECT: [number, number, number, number] = [5, 42, 70, 46];
/** The line a player's answer, place or chat line starts at: between the board and the heads. */
const SAID_Y = 141;
/** The line of the players' shoulders, and of their names. */
const FIGURES_Y = 184;
const NAMES_Y = 202;
/** The widest a name is drawn under a figure and in the lists, in pixels. */
const NAME_WIDTH = 46;
const LIST_NAME_WIDTH = 52;
/** The log on screen: where it starts, under the row the page keeps for its tabs, and its rows. */
const LOG_TOP = 106;
const LOG_ROWS = 8;
/** Seconds each rectangle of a closed problem is lit before the next. */
const REVEAL_SECONDS = 0.7;
/** With this many seconds or fewer to answer, the player's own count is ticked aloud. */
const TICK_FROM = 3;

const REFUSED_TEXT: Record<string, string> = {
  "not-open": "지금은 버저를 누를 수 없습니다",
  "shut-out": "이 문제는 이미 틀렸습니다",
  "already-won": "이미 승리했습니다",
  "not-your-answer": "버저를 누른 사람만 답합니다",
  "game-over": "이 판은 끝났습니다",
  "not-playing": "관전 중에는 참여할 수 없습니다",
  "not-seated": "관전 중에는 참여할 수 없습니다",
  "no-game": "진행 중인 판이 없습니다",
  "not-host": "방장만 새 판을 시작할 수 있습니다",
  "bad-teams": "팀 인원이 맞지 않습니다",
  "too-few": "두 팀(또는 두 명) 이상이어야 합니다",
  "already-playing": "이미 판이 진행 중입니다",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
  "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
};

/** How a game ended, as the log says it. */
const ENDED_TEXT: Record<"half" | "problems" | "abandoned", string> = {
  half: "절반이 승리: 끝!",
  problems: "마지막 문제까지 끝",
  abandoned: "이어갈 사람이 없어 끝",
};

const inRect = (p: { x: number; y: number }, r: readonly [number, number, number, number]): boolean =>
  p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

const BUZZ_RECT: [number, number, number, number] = [4, 240, 150, 28];
const digitRect = (digit: number): [number, number, number, number] => [118 + digit * 26, 242, 24, 24];
const ERASE_RECT: [number, number, number, number] = [380, 242, 30, 24];
const SAY_RECT: [number, number, number, number] = [414, 242, 62, 24];
const AGAIN_RECT: [number, number, number, number] = [386, 225, 90, 15];
const LOBBY_RECT: [number, number, number, number] = [386, 250, 90, 15];

interface Bubble {
  text: string;
  colour: string;
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

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link RectScreen.update}. */
export function createRectScreen(canvas: HTMLCanvasElement, handlers: RectHandlers): RectScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);
  const light = new Light();

  let latest: RectMessage | null = null;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clocks are counted from here in real time: the screen's `time`
   * stops while the tab is hidden, and a clock counted by it would show more
   * time than there is when the player comes back.
   */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. It stands still while the tab is hidden. */
  let time = 0;
  /** How many events of the history have been shown. */
  let seen = 0;
  /** The digits typed for an answer. */
  let typed = "";
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /**
   * This player's buzz is on its way and the room has not yet said who
   * answers. Digits typed meanwhile are kept: on a slow line the wait is long
   * enough for a quick hand to lose the first one, in a game about speed.
   */
  let buzzed = false;
  /** Enter was pressed during that wait: the answer goes as soon as it is this player's to give. */
  let queued = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The board's edge lights up at a right or a wrong answer. */
  let flash: { colour: string; t: number } | null = null;
  /** `time` when the closed problem's rectangles began to be shown. */
  let revealFrom = 0;
  /** The last second of the player's own answer that was ticked aloud. */
  let ticked = -1;
  /** By player: a hop still to finish, in seconds. */
  const hops = new Map<number, number>();
  /** By player: what they said, over their head. */
  const said = new Map<number, Bubble>();
  /** By player: a chat line over their head. */
  const speech = new Map<number, { lines: string[]; t: number }>();
  const playing: PlayingFx[] = [];

  /** The keys pressed since the last step, in the order they were pressed: an answer is typed digit by digit. */
  const keys: string[] = [];
  const clicks: { x: number; y: number }[] = [];
  const mouse = { x: -1, y: -1 };
  let stopped = false;

  // ---- What the latest message means ---------------------------------------------------------------
  const nickOf = (player: number): string => latest?.players.find((each) => each.id === player)?.nick ?? "";
  /** The players in the order they stand: unit by unit. */
  const lineUp = (): number[] => (latest === null ? [] : latest.view.units.flatMap((unit) => unit.members));
  /** Where player `player` stands, in pixels from the left. */
  function standsAt(player: number): number {
    const line = lineUp();
    const at = Math.max(0, line.indexOf(player));
    return Math.round((SCENE_W * (at + 0.5)) / Math.max(1, line.length));
  }
  /** What a unit is called in a line of text. */
  function unitName(unit: number, width: number): string {
    const members = latest?.view.units[unit]?.members ?? [];
    return pen.fit(members.map(nickOf).join("·"), width);
  }
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const mine = (): { player: number; unit: number } | null => latest?.view.you ?? null;
  function canBuzz(): boolean {
    const me = mine();
    if (latest === null || me === null || latest.frozen || pending) return false;
    const view = latest.view;
    return view.phase === "problem" && view.units[me.unit].place === 0 && !view.wrong.includes(me.unit);
  }
  function answering(): boolean {
    const me = mine();
    return latest !== null && me !== null && latest.view.phase === "answer" && latest.view.floor?.player === me.player;
  }

  // ---- Effects ---------------------------------------------------------------------------------------
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

  function say(text: string): void {
    note = text;
    noteT = 2;
  }

  /** Shows one thing that happened: a sound, and something to see where it happened. */
  function show(event: RectEvent): void {
    if (event.type === "problem") {
      typed = "";
      said.clear();
      flash = null;
      if (event.round > 1) sfx.turn();
    } else if (event.type === "buzz") {
      hops.set(event.player, 0.35);
      said.set(event.player, { text: "!", colour: C.amber, t: 12 });
      sfx.pick();
    } else if (event.type === "right") {
      said.set(event.player, { text: `${event.said}`, colour: C.teal, t: 6 });
      flash = { colour: C.teal, t: 0.6 };
      sfx.earn();
      const x = standsAt(event.player);
      addFx(fxlib.confetti, { x, y: FIGURES_Y, seed: 11 + event.round }, [x - 100, FIGURES_Y - 110, 200, 140]);
    } else if (event.type === "wrong") {
      said.set(event.player, { text: `${event.said}`, colour: C.crim, t: 4 });
      flash = { colour: C.crim, t: 0.6 };
      sfx.deny();
    } else if (event.type === "silent") {
      said.set(event.player, { text: "…", colour: C.crim, t: 3 });
      flash = { colour: C.crim, t: 0.6 };
      sfx.deny();
    } else if (event.type === "time" || event.type === "all-wrong") {
      sfx.out();
    }
  }

  function update(message: RectMessage): void {
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      typed = "";
      buzzed = false;
      queued = false;
      hops.clear();
      said.clear();
      speech.clear();
      playing.length = 0;
      flash = null;
    }
    const wasClosed = latest !== null && latest.view.outcome !== null && !fresh;
    if (message.view.outcome !== null && !wasClosed) revealFrom = time;
    latest = message;
    receivedAt = performance.now();
    pending = false;
    if (buzzed) {
      const view = message.view;
      const me = mine();
      // Something else may reach the page before the room has dealt with the buzz: the wait goes on.
      const undecided = me !== null && view.phase === "problem" && view.floor === null && !view.wrong.includes(me.unit);
      if (undecided) {
        pending = true;
      } else {
        buzzed = false;
        if (!answering()) {
          // someone else was first
          typed = "";
        } else if (queued && typed !== "") {
          pending = true;
          handlers.act({ type: "answer", count: Number(typed) });
        }
        queued = false;
      }
    }
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: readonly [number, number, number, number]): boolean => clicks.some((p) => inRect(p, rect));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    if (help || was) return;
    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape", "Backspace") || clicked(LOBBY_RECT)) {
        handlers.lobby();
      } else if (pressed("Enter", "NumpadEnter", "KeyR") || (host && clicked(AGAIN_RECT))) {
        if (host) handlers.again();
        else say(REFUSED_TEXT["not-host"]);
      }
      return;
    }
    const toAnswer = answering();
    // A slow frame can hold several keys: they are taken in the order pressed (see `typing.ts`).
    let typing: readonly string[] = keys;
    if (!toAnswer && !buzzed) {
      // a press of the button is the buzz itself: every key that came with it belongs to the answer
      const rest = clicked(BUZZ_RECT) ? [...keys] : afterBuzz(keys);
      if (rest === null) return;
      if (!canBuzz()) {
        const me = mine();
        if (me !== null && view.phase === "problem" && !pending) {
          say(view.units[me.unit].place > 0 ? REFUSED_TEXT["already-won"] : REFUSED_TEXT["shut-out"]);
          sfx.deny();
        }
        return;
      }
      pending = true;
      buzzed = true;
      queued = false;
      typed = "";
      handlers.act({ type: "buzz" });
      // what was pressed after the buzz in the same step is the start of the answer
      typing = rest;
    }
    const most = `${latest.rules.maxSaid}`.length;
    // the pad is on screen only once the answer is this player's; its buttons count as the keys they stand for
    const pad: string[] = [];
    if (toAnswer) {
      for (let digit = 0; digit <= 9; digit++) if (clicked(digitRect(digit))) pad.push(`Digit${digit}`);
      if (clicked(ERASE_RECT)) pad.push("Backspace");
      if (clicked(SAY_RECT)) pad.push("Enter");
    }
    const result = typeAnswer(typed, [...typing, ...pad], most);
    if (result.typed.length > typed.length || (result.typed !== typed && result.typed.length === typed.length)) sfx.move();
    else if (result.typed.length < typed.length) sfx.back();
    typed = result.typed;
    if (result.said === null) return;
    if (!toAnswer) {
      // the buzz is still on its way: the answer goes as soon as it is this player's to give
      queued = true;
    } else if (!pending) {
      pending = true;
      handlers.act({ type: "answer", count: result.said });
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    for (let i = playing.length - 1; i >= 0; i--) {
      playing[i].fx.update(dt);
      if (playing[i].fx.done()) playing.splice(i, 1);
    }
    if (noteT > 0) noteT -= dt;
    if (flash !== null) {
      flash.t -= dt;
      if (flash.t <= 0) flash = null;
    }
    for (const [player, t] of hops) {
      if (t - dt <= 0) hops.delete(player);
      else hops.set(player, t - dt);
    }
    for (const [player, bubble] of said) {
      bubble.t -= dt;
      if (bubble.t <= 0) said.delete(player);
    }
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // my own time to answer is nearly up: a tick a second
      const mineLeft = answering() ? left(latest.clock.answer) : null;
      const second = mineLeft === null ? null : Math.ceil(mineLeft / 1000);
      if (second === null || second > TICK_FROM) ticked = -1;
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
  function boardBox(): { x: number; y: number; cell: number } | null {
    if (latest === null) return null;
    const board = latest.view.board;
    // the largest cell with which the board still clears the target plate beside it and the heads below
    const beside = TARGET_RECT[0] + TARGET_RECT[2] + 8;
    const cell = Math.min(34, Math.floor((SCENE_W - 2 * beside) / board.cols), Math.floor((BOARD_BAND - 4) / board.rows));
    return {
      x: Math.round((SCENE_W - board.cols * cell) / 2),
      y: BOARD_TOP + Math.floor((BOARD_BAND - board.rows * cell) / 2),
      cell,
    };
  }

  /** The rectangle of a closed problem that is lit now, and its number among them. */
  function lit(): { rect: Rect; at: number; of: number } | null {
    const solutions = latest?.view.solutions ?? null;
    if (solutions === null || solutions.length === 0) return null;
    const at = Math.floor((time - revealFrom) / REVEAL_SECONDS) % solutions.length;
    return { rect: solutions[at], at, of: solutions.length };
  }

  function drawBoard(): void {
    const box = boardBox();
    if (latest === null || box === null) return;
    const view = latest.view;
    const board = view.board;
    const { x, y, cell } = box;
    const w = board.cols * cell;
    const h = board.rows * cell;
    // the frame, lit for a moment by a right or a wrong answer
    pen.px(x - 5, y - 5, w + 10, h + 10, C.ink);
    pen.px(x - 4, y - 4, w + 8, h + 8, flash !== null && Math.sin(time * 40) > -0.3 ? flash.colour : C.woodD);
    pen.px(x - 2, y - 2, w + 4, h + 4, C.ink);
    const shown = lit();
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        const value = board.cells[row * board.cols + col];
        const cx = x + col * cell;
        const cy = y + row * cell;
        const inLit = shown !== null && row >= shown.rect.top && row <= shown.rect.bottom && col >= shown.rect.left && col <= shown.rect.right;
        pen.px(cx, cy, cell, cell, C.ink);
        pen.px(cx + 1, cy + 1, cell - 2, cell - 2, inLit ? "#3a2a12" : value === null ? C.wallD : C.steelDD);
        if (value !== null) {
          pen.px(cx + 1, cy + 1, cell - 2, 1, inLit ? C.amberD : C.steelD);
          pen.txt(`${value}`, cx + Math.round(cell / 2), cy + Math.round((cell - 24) / 2), value < 0 ? C.crim : C.bone, "center", 24);
        }
      }
    }
    if (shown !== null) {
      // the rectangle being shown, edged in the lamp's colour
      const rx = x + shown.rect.left * cell;
      const ry = y + shown.rect.top * cell;
      const rw = (shown.rect.right - shown.rect.left + 1) * cell;
      const rh = (shown.rect.bottom - shown.rect.top + 1) * cell;
      pen.px(rx, ry, rw, 2, C.amber);
      pen.px(rx, ry + rh - 2, rw, 2, C.amber);
      pen.px(rx, ry, 2, rh, C.amber);
      pen.px(rx + rw - 2, ry, 2, rh, C.amber);
    }
  }

  function drawTarget(): void {
    if (latest === null) return;
    const view = latest.view;
    const [x, y, w, h] = TARGET_RECT;
    pen.px(x - 1, y - 1, w + 2, h + 2, C.ink);
    pen.px(x, y, w, h, C.brassD);
    pen.px(x + 1, y + 1, w - 2, h - 2, C.wallD);
    pen.txt("타깃", x + Math.round(w / 2), y + 3, C.boneD, "center");
    pen.txt(`${view.board.target}`, x + Math.round(w / 2), y + 18, C.amber, "center", 24);
    // once the problem is closed: the answer, and which of its rectangles is lit
    if (view.answer !== null) pen.txt(`정답 ${view.answer}개`, x + Math.round(w / 2), y + h + 6, C.teal, "center");
    const shown = lit();
    if (shown !== null) pen.txt(`${shown.at + 1}/${shown.of}`, x + Math.round(w / 2), y + h + 20, C.amber, "center");
    // how long the problem has left, under the plate: it is gone by the time the answer takes that place
    const problem = left(latest.clock.problem);
    if (problem !== null) {
      const share = Math.max(0, Math.min(1, problem / (latest.rules.problemSeconds * 1000)));
      const colour = problem <= 15_000 ? C.crim : problem <= 60_000 ? C.amber : C.teal;
      pen.px(x - 1, y + h + 5, w + 2, 5, C.ink);
      pen.px(x, y + h + 6, Math.round(w * share), 3, colour);
    }
  }

  function drawPlayers(): void {
    if (latest === null) return;
    const view = latest.view;
    const me = mine();
    view.units.forEach((unit, index) => {
      const xs = unit.members.map(standsAt);
      const middle = Math.round((xs[0] + xs[xs.length - 1]) / 2);
      if (unit.members.length > 1) {
        // a team stands together, joined underneath
        pen.px(xs[0] - 14, NAMES_Y + 14, xs[xs.length - 1] - xs[0] + 28, 1, C.tealD);
      }
      // right answers so far, and how the unit stands in this problem
      for (let i = 0; i < latest!.rules.winsNeeded; i++) {
        pen.px(middle - latest!.rules.winsNeeded * 4 + i * 8, NAMES_Y + 16, 6, 3, i < unit.wins ? C.brass : C.steelDD);
      }
      unit.members.forEach((player, at) => {
        const x = xs[at];
        const info = latest!.players.find((each) => each.id === player);
        const hop = hops.get(player) ?? 0;
        const lift = hop > 0 ? Math.round(Math.sin((hop / 0.35) * Math.PI) * 5) : 0;
        pen.rects(figureRects(player % FIGURE_COUNT, false, 1), x, FIGURES_Y - lift);
        const name = pen.fit(info?.nick ?? "", NAME_WIDTH);
        const nx = x - Math.round(pen.width(name) / 2);
        const gone = info !== undefined && (info.left || !info.connected);
        pen.txt(name, nx, NAMES_Y, gone ? C.dim : me?.player === player ? C.amber : C.bone);
        const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
        if (voice !== "out") drawVoiceMark(pen, nx - VOICE_MARK_W, NAMES_Y, voice, time);
      });
      // what one of them has just said takes this place for as long as it is on show
      if (unit.members.some((player) => said.has(player))) return;
      if (unit.place > 0) {
        pen.px(middle - 12, SAID_Y + 1, 25, 13, C.amberD);
        pen.px(middle - 11, SAID_Y + 2, 23, 11, C.ink);
        pen.txt(`${unit.place}위`, middle + 1, SAID_Y + 2, C.amber, "center");
      } else if (view.wrong.includes(index) && view.outcome === null) {
        pen.txt("오답", middle + 1, SAID_Y + 2, C.crim, "center");
      }
    });
    // what was said, over the head of who said it
    for (const [player, bubble] of said) {
      const x = standsAt(player);
      const w = Math.max(15, pen.width(bubble.text) + 8);
      pen.px(x - Math.ceil(w / 2) - 1, SAID_Y - 1, w + 2, 17, C.ink);
      pen.px(x - Math.ceil(w / 2), SAID_Y, w, 15, C.bone);
      pen.txt(bubble.text, x, SAID_Y + 1, bubble.colour === C.amber ? C.ink : bubble.colour === C.teal ? C.tealD : C.crimD, "center");
    }
    // a chat line starts at the same height and runs down over its speaker, never up over the board
    for (const [player, line] of speech) {
      drawSpeech(pen, { label: { x: standsAt(player), y: SAID_Y, align: "center" } }, line.lines);
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.wall);
    for (let x = 9; x < SCENE_W; x += 19) pen.px(x, 0, 1, 166, C.wallD);
    pen.px(0, 166, SCENE_W, BAR_Y - 166, C.floor);
    pen.px(0, 166, SCENE_W, 1, C.ink);
    for (let y = 178; y < BAR_Y; y += 11) pen.px(0, y, SCENE_W, 1, C.floorD);
    drawLamp(pen, Math.sin(time * 1.3) * 2);
    drawBoard();
    light.draw(pen, SCENE_W / 2, BOARD_TOP + Math.round(BOARD_BAND / 2), 1);
    // the players stand outside the lamp's pool: drawn over the dark, so that they and their names can be read
    drawPlayers();
    drawTarget();
    for (const p of playing) {
      fxlib.clearFrame(p.frame);
      p.fx.draw(p.frame);
      fxlib.composite(p.frame, p.image.data, null);
      p.ctx.putImageData(p.image, 0, 0);
      ctx.drawImage(p.canvas, p.x0, p.y0);
    }
    if (latest.frozen) {
      // the game's own clocks stand still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      const words = stand === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${Math.ceil(stand / 1000)}초`;
      // as wide as the words at their longest, so the plate does not twitch as the seconds go
      const plate = Math.max(160, pen.width(words) + 16);
      const middle = BOARD_TOP + Math.round(BOARD_BAND / 2);
      pen.px(Math.round(SCENE_W / 2 - plate / 2), middle - 9, plate, 17, C.ink);
      pen.txt(words, Math.round(SCENE_W / 2), middle - 7, C.boneD, "center");
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const me = mine();
    if (noteT > 0) return [note, C.amber];
    if (view.phase === "answer" && view.floor !== null) {
      const seconds = Math.ceil((left(latest.clock.answer) ?? 0) / 1000);
      if (answering()) return [`답을 말하세요 · ${seconds}초`, seconds <= TICK_FROM ? C.crim : C.amber];
      return [`${pen.fit(nickOf(view.floor.player), LIST_NAME_WIDTH)} 답하는 중 · ${seconds}초`, C.bone];
    }
    if (view.phase === "pause") {
      const seconds = Math.ceil((left(latest.clock.next) ?? 0) / 1000);
      const how = view.outcome?.kind === "right" ? `${pen.fit(nickOf(view.outcome.player), LIST_NAME_WIDTH)} 정답!` : view.outcome?.kind === "time" ? "시간 종료" : "모두 오답";
      return [`${how} · 다음 문제까지 ${seconds}초`, view.outcome?.kind === "right" ? C.teal : C.boneD];
    }
    if (view.phase === "ended") return ["판이 끝났습니다", C.amber];
    if (me === null) return ["관전 중입니다. 다음 판부터 함께할 수 있습니다", C.boneD];
    if (view.units[me.unit].place > 0) return ["승리! 남은 문제를 구경합니다", C.amber];
    if (view.wrong.includes(me.unit)) return ["오답: 이 문제에서는 다시 답할 수 없습니다", C.crim];
    if (pending) return ["보내는 중", C.boneD];
    return ["다 세었으면 버저! (Space)", C.amber];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), LIST_NAME_WIDTH) : "";
      if (event.type === "problem") lines.push([`문제 ${event.round}`, C.boneD]);
      else if (event.type === "buzz") lines.push([`${who} 버저!`, C.bone]);
      else if (event.type === "right") lines.push([`${who}: ${event.said}개 정답!`, C.teal]);
      else if (event.type === "wrong") lines.push([`${who}: ${event.said}개 오답`, C.crim]);
      else if (event.type === "silent") lines.push([`${who}: 답하지 못함`, C.crim]);
      else if (event.type === "time") lines.push(["제한 시간 종료", C.boneD]);
      else if (event.type === "all-wrong") lines.push(["모두 오답", C.boneD]);
      else if (event.type === "won") lines.push([`${unitName(event.unit, 96)} 승리 (${event.place}위)`, C.amber]);
      else lines.push([ENDED_TEXT[event.reason], C.amber]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(`문제 ${view.round}`, x, 3, C.bone);
    const problem = left(latest.clock.problem);
    if (problem !== null) {
      const seconds = Math.ceil(problem / 1000);
      pen.txt(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, W - 5, 3, seconds <= 15 ? C.crim : C.boneD, "right");
    }
    pen.px(x, 16, 168, 1, C.steelDD);
    // the units: a team takes a whole row, players alone go two to a row
    let row = 0;
    let half = 0;
    view.units.forEach((unit, index) => {
      const team = unit.members.length > 1;
      if (team && half === 1) {
        row++;
        half = 0;
      }
      const ux = x + (team ? 0 : half * 86);
      const uy = 19 + row * 13;
      const name = unitName(index, team ? 104 : LIST_NAME_WIDTH);
      const colour = unit.place > 0 ? C.amber : view.wrong.includes(index) && view.outcome === null ? C.dim : mine()?.unit === index ? C.bone : C.boneD;
      pen.txt(name, ux, uy, colour);
      const px = ux + (team ? 108 : LIST_NAME_WIDTH + 4);
      if (unit.place > 0) pen.txt(`${unit.place}위`, px, uy, C.amber);
      else for (let i = 0; i < latest!.rules.winsNeeded; i++) pen.px(px + i * 8, uy + 4, 6, 5, i < unit.wins ? C.brass : C.steelDD);
      if (team) {
        row++;
        half = 0;
      } else if (half === 1) {
        row++;
        half = 0;
      } else {
        half = 1;
      }
    });
    pen.px(x, 60, 168, 1, C.steelDD);
    // what it takes to win and to end; how the game stands this moment is said in the bar, by the buzzer
    pen.txt(`${latest.rules.winsNeeded}번 맞히면 승리 · H 규칙`, x, 63, C.boneD);
    pen.txt(`${view.units.length}팀 중 ${view.winnersNeeded}팀이 이기면 끝`, x, 76, C.boneD);
    const lines = logLines();
    const from = Math.max(0, lines.length - LOG_ROWS);
    for (let i = from; i < lines.length; i++) pen.txt(lines[i][0], x, LOG_TOP + (i - from) * 14, lines[i][1]);
  }

  function button(rect: readonly [number, number, number, number], label: string, sub: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (sub === "") pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
    else {
      pen.txt(label, x + 5, y + 2, lit ? C.amber : live ? C.bone : C.dim);
      pen.txt(sub, x + 5, y + 14, live || lit ? C.boneD : C.dim);
    }
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const me = mine();
    const won = me !== null && view.units[me.unit].place > 0;
    pen.txt(me === null ? "종료" : won ? "승리!" : "패배", 10, 234, me === null ? C.bone : won ? C.teal : C.crim, "left", 24);
    const winners = view.units
      .map((unit, index) => ({ unit, index }))
      .filter((each) => each.unit.place > 0)
      .sort((a, b) => a.unit.place - b.unit.place)
      .map((each) => `${each.unit.place}위 ${unitName(each.index, 70)}`);
    pen.txt(pen.fit(winners.length > 0 ? winners.join("  ") : "승리한 팀이 없습니다", 280), 96, 226, C.bone);
    pen.txt(`문제 ${view.round}까지 했습니다`, 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? "같은 사람들과 한 판 더 하거나 대기실로" : "방장이 새 판을 시작하기를 기다리는 중", 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, "Enter 새 판", "", true, true);
    button(LOBBY_RECT, "Esc 대기실로", "", false, true);
  }

  function drawBar(): void {
    if (latest === null) return;
    pen.px(0, BAR_Y, W, H - BAR_Y, C.bar);
    pen.px(0, BAR_Y, W, 1, C.steelDD);
    if (latest.view.phase === "ended") {
      drawResults();
      return;
    }
    const [words, colour] = standing();
    pen.txt(words, 6, 225, colour);
    if (answering()) {
      // the answer so far, and a pad of digits for whoever has no keys
      pen.txt("답", 6, 246, C.boneD);
      pen.px(24, 241, 84, 26, C.amberD);
      pen.px(25, 242, 82, 24, C.ink);
      pen.txt(typed === "" ? "_" : typed, 66, 242, C.amber, "center", 24);
      for (let digit = 0; digit <= 9; digit++) button(digitRect(digit), `${digit}`, "", false, true);
      button(ERASE_RECT, "지움", "", false, typed !== "");
      button(SAY_RECT, "Enter", "", typed !== "", typed !== "");
      return;
    }
    const able = canBuzz();
    button(BUZZ_RECT, "버저", able ? "Space 또는 Enter" : "지금은 누를 수 없음", able && Math.sin(time * 5) > 0, able);
    pen.txt("네모: 칸에 맞춘 모든 직사각형 (한 칸짜리도).", 162, 241, C.boneD);
    pen.txt("숫자의 합이 타깃인 것만 셉니다. 틀리면 이 문제는 끝.", 162, 254, C.boneD);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines: [string, string][] = [
      ["네모 세기: 규칙", C.amber],
      ["판에는 숫자가 적힌 칸과 빈칸이 있습니다. 안의 숫자를 더하면 타깃 넘버가", C.bone],
      ["되는 네모가 모두 몇 개인지 셉니다.", C.bone],
      ["네모는 칸에 맞춘 모든 직사각형입니다: 한 칸짜리, 길쭉한 것, 판 전체까지.", C.boneD],
      ["숫자가 하나도 없는 네모는 세지 않습니다.", C.boneD],
      ["", C.bone],
      [`다 세었으면 버저를 누르고 ${rules.answerSeconds}초 안에 개수를 답합니다.`, C.bone],
      ["틀리면 (또는 답하지 못하면) 그 문제에서는 다시 답할 수 없습니다.", C.bone],
      [`${rules.teamSize}명이 팀을 맺었으면 팀 전체가 그렇습니다.`, C.boneD],
      ["", C.bone],
      [`${rules.winsNeeded}번 맞히면 승리하고 이후 문제에서 빠집니다.`, C.bone],
      ["전체 팀(혼자도 한 팀)의 절반이 승리하면 끝납니다.", C.bone],
      [`문제마다 제한 시간은 ${Math.round(rules.problemSeconds / 60)}분입니다.`, C.boneD],
      ["", C.bone],
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

  function toScreen(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * W) / (rect.width || W), y: ((event.clientY - rect.top) * H) / (rect.height || H) };
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not for the game
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    startAudio();
    if (!event.repeat) keys.push(event.code);
    if (event.code === "Space" || event.code === "Backspace") event.preventDefault();
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
      buzzed = false;
      queued = false;
      if (!answering()) typed = "";
      // the one refusal whose words hold a number of the rules
      const text = reason === "bad-count" && latest !== null ? `0부터 ${latest.rules.maxSaid}까지의 수로 답하세요` : REFUSED_TEXT[reason];
      say(text ?? "지금은 할 수 없습니다");
      sfx.deny();
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
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

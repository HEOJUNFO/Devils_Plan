/**
 * The screen of 네모 세기: the board and its target, the players under it,
 * the buzzer and the answer, and, once a problem is closed, the rectangles
 * that were there to be counted.
 *
 * Design: design/games/count-rectangles.md. The room decides everything;
 * this screen shows what it sends and asks for a buzz or an answer.
 */
import { LIT_SECONDS, litSeconds } from "../../../shared/games/count-rectangles/reveal";
import { GAP, type Card, type Option, type Rect, type RectEvent, type ScoreLine } from "../../../shared/games/count-rectangles/rules";
import { rectWaits } from "../../../shared/waits";
import { afterBuzz, typeAnswer } from "../../../shared/games/count-rectangles/typing";
import { hits, type Press, type Reach } from "../../../shared/frame";
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
  drawSpeech,
  drawVoiceMark,
  speechLines,
  speechSeconds,
} from "../../game/draw";
import { FIGURE_COUNT, figureRects } from "../../game/figures";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer } from "../../game/pointer";
import * as fxlib from "../../game/pixelfx.js";
import { lessMotion } from "../../game/motion";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { LIST_PITCH, LOG_PITCH, PANEL_WIDTH, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 네모 세기. */
export type RectMessage = Extract<ServerMessage, { type: "game"; game: "count-rectangles" }>;

/** What the screen asks of whoever owns the connection. */
export interface RectHandlers {
  /** The player buzzed or answered. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** The game has more teams than the column lists above its moves, or no longer has. */
  crowded(crowded: boolean): void;
}

/** The game screen. */
export interface RectScreen {
  update(message: RectMessage): void;
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
/**
 * Where the board sits: the band of the scene it is centred in. The tallest
 * board ends above the players' heads with room between for what they say,
 * so nothing is ever drawn over a number someone is counting.
 */
const BOARD_TOP = 12;
const BOARD_BAND = 124;
/** The plate with the target number: left of the board, under the page's own way out of the game. */
const TARGET_RECT: [number, number, number, number] = [5, 42, 70, 46];
/**
 * The part of the scene's width the board is drawn in: right of the buttons
 * the page lays over the top left of a game (the way out, and voice in a
 * room off the list), so that no cell of a board is ever under one.
 */
const BOARD_LEFT = 118;
const BOARD_WIDTH = 180;
/** The line a player's answer, place or chat line starts at: between the board and the heads. */
const SAID_Y = 141;
/** The line of the players' shoulders, and of their names. */
const FIGURES_Y = 184;
const NAMES_Y = 202;
/** The widest a name is drawn under a figure and in the lists, in pixels. */
const NAME_WIDTH = 46;
const LIST_NAME_WIDTH = 52;
/**
 * The most players whose names are written under their figures. With more,
 * the figures stand shoulder to shoulder and a name has no room: only the
 * player's own is written there, the rest are in the list and in what a
 * player says.
 */
const NAMED_MOST = 8;
/** The most rows of teams the column lists above its moves: a team takes a row, players alone go two to a row. */
const UNIT_ROWS = 3;
/** In a crowded game: the room kept under the list for the two lines that say what it takes to win. */
const TERMS_ROOM = 28;
/** With this many seconds or fewer to answer, the player's own count is ticked aloud. */
const TICK_FROM = 3;
/**
 * Seconds the results are on show before Enter starts another game: the host
 * may have been pressing Enter to buzz at the moment someone else's answer
 * ended this one.
 */
const RESULTS_HOLD = 1.5;
/** What the two options of each card are called. */
const OPTION_NAMES = WORDS.choice.options;

const inRect = (p: { x: number; y: number }, r: readonly [number, number, number, number]): boolean =>
  p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

const BUZZ_RECT: [number, number, number, number] = [4, 240, 150, 28];
const digitRect = (digit: number): [number, number, number, number] => [118 + digit * 26, 242, 24, 24];
const ERASE_RECT: [number, number, number, number] = [380, 242, 30, 24];
const SAY_RECT: [number, number, number, number] = [414, 242, 62, 24];
/** How far a button of the pad takes a finger: half the gap to the next, and up and down to the edges of the bar's row. */
const PAD_REACH: Reach = [1, 3, 1, 4];
const AGAIN_RECT: [number, number, number, number] = [386, 225, 90, 15];
const LOBBY_RECT: [number, number, number, number] = [386, 250, 90, 15];
/** The two options of the third choice, one above the other over the board. */
const OPTION_RECTS: readonly [[number, number, number, number], [number, number, number, number]] = [
  [8, 42, 288, 50],
  [8, 95, 288, 50],
];
/** `value` with its sign, as points are written. */
const signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

/**
 * Where each unit goes in the list: its row, and for a player alone which
 * half of the row. A team takes a whole row; players alone go two to a row.
 */
function unitPlaces(units: readonly { members: readonly number[] }[]): { row: number; half: number }[] {
  const places: { row: number; half: number }[] = [];
  let row = 0;
  let half = 0;
  for (const unit of units) {
    const team = unit.members.length > 1;
    if (team && half === 1) {
      row++;
      half = 0;
    }
    places.push({ row, half: team ? 0 : half });
    if (team || half === 1) {
      row++;
      half = 0;
    } else half = 1;
  }
  return places;
}

/** How many rows the list of `units` takes. */
function unitRows(units: readonly { members: readonly number[] }[]): number {
  const places = unitPlaces(units);
  return places.length === 0 ? 0 : places[places.length - 1].row + 1;
}

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
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The game as the room last sent it: what is shown again if a choice drawn ahead of the room is refused. */
  let truth: RectMessage | null = null;
  /**
   * The player's own choice on its way to the room, as the change it makes to what the room sent: the card is
   * theirs from the press, where it used to be only once the room answered. Drawn again over whatever the room
   * sends before its answer, dropped when the answer comes or the choice is refused. (A buzz is not drawn ahead:
   * who was first is the room's to say. Nor an answer: whether it is right is.)
   */
  let ahead: ((view: RectMessage["view"]) => RectMessage["view"]) | null = null;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  /**
   * This player's buzz is on its way and the room has not yet said who
   * answers. Digits typed meanwhile are kept: on a slow line the wait is long
   * enough for a quick hand to lose the first one, in a game about speed.
   */
  /** The option of the third choice pointed at and not yet confirmed. */
  let pointed: Option | null = null;
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
  /** Seconds each of them is lit: fewer when there are many, so that the last is shown before the next problem comes. */
  let revealEach = LIT_SECONDS;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
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
  const clicks: Press[] = [];
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
    // the added contest is put to those who took it, the race to the units that have not won
    const asked = view.duel !== null ? view.duel.players.includes(me.player) : view.units[me.unit].place === 0;
    return view.phase === "problem" && asked && !view.wrong.includes(me.unit);
  }
  /** Whether the third choice is this player's to make now. */
  function choosing(): boolean {
    const up = latest?.view.choosing ?? null;
    return up !== null && up.card !== null && up.mine === null && !latest!.frozen;
  }
  /** The points of `player`, once the game has counted them. */
  function scoreOf(player: number): ScoreLine | null {
    return latest?.view.scores?.find((line) => line.player === player) ?? null;
  }
  /** What the two options of `card` do, in a line or two each, with the numbers of the rules. */
  function cardLines(card: Card, option: Option): string[] {
    const rules = latest!.rules;
    const said = WORDS.choice;
    if (card === "winners") return option === 1 ? said.hog(rules.hogLeader, rules.hogMember) : said.devote(rules.devoteLeader, rules.devoteMember);
    if (card === "losers") return option === 1 ? said.sacrifice(rules.sacrificeLeader) : said.blame(rules.blameMember);
    return option === 1 ? said.dare(rules.duelPieces, rules.duelLoss) : said.safe(rules.safeLoss);
  }
  function answering(): boolean {
    const me = mine();
    return latest !== null && me !== null && latest.view.phase === "answer" && latest.view.floor?.player === me.player;
  }

  // ---- Effects ---------------------------------------------------------------------------------------
  function addFx(effect: fxlib.FxModule, options: fxlib.FxOptions, box: [number, number, number, number]): void {
    // a burst is for the eye only: the answer's colour and its sound say whether it was right
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
    } else if (event.type === "raced") {
      said.clear();
      pointed = null;
      sfx.turn();
    } else if (event.type === "choice" || event.type === "duel") {
      sfx.pick();
    } else if (event.type === "score") {
      sfx.earn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: RectMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
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
      pointed = null;
    }
    const wasClosed = latest !== null && latest.view.outcome !== null && !fresh;
    if (message.view.outcome !== null && !wasClosed) {
      revealFrom = time;
      revealEach = litSeconds(message.clock.next, message.view.solutions?.length ?? 0);
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // The room marks the game it sends in answer to this page's move. What it sends meanwhile, for another
    // player's move, leaves this one on its way; a game that has gone on to another phase waits for nothing.
    const answered = message.answer === true || latest === null || latest.startedAt !== message.startedAt || latest.view.phase !== message.view.phase;
    truth = message;
    if (answered) ahead = null;
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    if (answered) pending = false;
    offline = false;
    handlers.crowded(isCrowded(unitRows(message.view.units), UNIT_ROWS));
    if (buzzed) {
      const view = message.view;
      const me = mine();
      // Something else may reach the page before the room has dealt with the buzz: the wait goes on.
      const undecided = me !== null && view.phase === "problem" && view.floor === null && !view.wrong.includes(me.unit);
      if (undecided) {
        pending = true;
      } else {
        buzzed = false;
        // the buzz is decided, whichever message said so
        pending = false;
        if (!answering()) {
          // someone else was first
          typed = "";
        } else if (queued && typed !== "") {
          pending = handlers.act({ type: "answer", count: Number(typed) });
        }
        queued = false;
      }
    }
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: readonly [number, number, number, number], finger?: Reach): boolean => clicks.some((p) => hits(p, rect, finger));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    if (help || was) return;
    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape", "Backspace") || clicked(LOBBY_RECT, LOBBY_REACH)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        else say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (view.phase === "choose") {
      if (!choosing() || pending) return;
      const point = (option: Option): void => {
        pointed = option;
        sfx.move();
      };
      const send = (): void => {
        if (pointed === null || pending) return;
        const option = pointed;
        const player = mine()?.player ?? null;
        pending = handlers.act({ type: "choose", option });
        if (!pending) return say(WORDS.notSent);
        if (latest === null || player === null) return;
        ahead = (view) => (view.choosing === null || view.choosing.mine !== null ? view : { ...view, choosing: { ...view.choosing, mine: option, chosen: [...view.choosing.chosen.filter((each) => each !== player), player] } });
        latest = { ...latest, view: ahead(latest.view) };
      };
      // an option is pointed at first and confirmed second: a choice cannot be taken back. The keys
      // are taken in the order pressed, so that Enter confirms what was pointed at when it came.
      for (const code of keys) {
        if (code === "Digit1" || code === "Numpad1") point(1);
        else if (code === "Digit2" || code === "Numpad2") point(2);
        else if (code === "Enter" || code === "NumpadEnter") send();
      }
      for (const click of clicks) {
        for (const option of [1, 2] as const) {
          if (!inRect(click, OPTION_RECTS[option - 1])) continue;
          if (pointed === option) send();
          else point(option);
        }
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
          const outside = view.duel !== null && !view.duel.players.includes(me.player);
          say(outside ? WORDS.refused["not-in-duel"] : view.duel === null && view.units[me.unit].place > 0 ? WORDS.refused["already-won"] : WORDS.refused["shut-out"]);
          sfx.deny();
        }
        return;
      }
      queued = false;
      typed = "";
      if (!handlers.act({ type: "buzz" })) {
        // nothing went: the buzzer is not left waiting for an answer that cannot come
        say(WORDS.notSent);
        sfx.deny();
        return;
      }
      pending = true;
      buzzed = true;
      // what was pressed after the buzz in the same step is the start of the answer
      typing = rest;
    }
    // the answer has been said and is on its way: the figure on screen stays the one that was sent
    if (toAnswer && pending) return;
    const most = `${latest.rules.maxSaid}`.length;
    // the pad is on screen only once the answer is this player's; its buttons count as the keys they stand for
    const pad: string[] = [];
    if (toAnswer) {
      for (let digit = 0; digit <= 9; digit++) if (clicked(digitRect(digit), PAD_REACH)) pad.push(`Digit${digit}`);
      if (clicked(ERASE_RECT, PAD_REACH)) pad.push("Backspace");
      if (clicked(SAY_RECT, PAD_REACH)) pad.push("Enter");
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
      if (handlers.act({ type: "answer", count: result.said })) pending = true;
      else say(WORDS.notSent);
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
    // as large as its part of the scene allows, and as leaves the heads below their room
    const cell = Math.min(34, Math.floor(BOARD_WIDTH / board.cols), Math.floor((BOARD_BAND - 4) / board.rows));
    return {
      x: BOARD_LEFT + Math.floor((BOARD_WIDTH - board.cols * cell) / 2),
      y: BOARD_TOP + Math.floor((BOARD_BAND - board.rows * cell) / 2),
      cell,
    };
  }

  /** The rectangle of a closed problem that is lit now, and its number among them. */
  function lit(): { rect: Rect; at: number; of: number } | null {
    const solutions = latest?.view.solutions ?? null;
    if (solutions === null || solutions.length === 0) return null;
    const at = Math.floor((time - revealFrom) / revealEach) % solutions.length;
    return { rect: solutions[at], at, of: solutions.length };
  }

  function drawBoard(): void {
    const box = boardBox();
    if (latest === null || box === null) return;
    const view = latest.view;
    const board = view.board;
    const { x, y, cell } = box;
    /** The places where the board has a cell: a board need not be a rectangle. */
    const places: { row: number; col: number; cx: number; cy: number }[] = [];
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        if (board.cells[row * board.cols + col] !== GAP) places.push({ row, col, cx: x + col * cell, cy: y + row * cell });
      }
    }
    // the frame follows the board's outline, and is lit for a moment by a right or a wrong answer
    // (lit steadily for a player who asked for less motion: it flickers otherwise)
    const frame = flash !== null && (lessMotion() || Math.sin(time * 40) > -0.3) ? flash.colour : C.woodD;
    for (const place of places) pen.px(place.cx - 5, place.cy - 5, cell + 10, cell + 10, C.ink);
    for (const place of places) pen.px(place.cx - 4, place.cy - 4, cell + 8, cell + 8, frame);
    for (const place of places) pen.px(place.cx - 2, place.cy - 2, cell + 4, cell + 4, C.ink);
    const shown = lit();
    // large figures where a cell has room for them
    const size = cell >= 28 ? 24 : 12;
    for (const { row, col, cx, cy } of places) {
      const value = board.cells[row * board.cols + col];
      const inLit = shown !== null && row >= shown.rect.top && row <= shown.rect.bottom && col >= shown.rect.left && col <= shown.rect.right;
      pen.px(cx, cy, cell, cell, C.ink);
      pen.px(cx + 1, cy + 1, cell - 2, cell - 2, inLit ? "#3a2a12" : value === null ? C.wallD : C.steelDD);
      if (typeof value === "number") {
        pen.px(cx + 1, cy + 1, cell - 2, 1, inLit ? C.amberD : C.steelD);
        pen.txt(`${value}`, cx + Math.round(cell / 2), cy + Math.round((cell - size) / 2), value < 0 ? C.crim : C.bone, "center", size);
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
    pen.txt(WORDS.target, x + Math.round(w / 2), y + 3, C.boneD, "center");
    pen.txt(`${view.board.target}`, x + Math.round(w / 2), y + 18, C.amber, "center", 24);
    // once the problem is closed: the answer, and which of its rectangles is lit
    if (view.answer !== null) pen.txt(WORDS.answer(view.answer), x + Math.round(w / 2), y + h + 6, C.teal, "center");
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
    const count = lineUp().length;
    // each player's share of the row: a name is cut to it, and past a number of players is left out
    const share = Math.floor(SCENE_W / Math.max(1, count));
    const named = count <= NAMED_MOST;
    const nameRoom = Math.min(NAME_WIDTH, share - 3);
    const gap = Math.min(14, Math.floor(share / 2));
    view.units.forEach((unit, index) => {
      const xs = unit.members.map(standsAt);
      const middle = Math.round((xs[0] + xs[xs.length - 1]) / 2);
      if (unit.members.length > 1) {
        // a team stands together, joined underneath
        pen.px(xs[0] - gap, NAMES_Y + 14, xs[xs.length - 1] - xs[0] + gap * 2, 1, C.tealD);
      }
      // right answers so far, and how the unit stands in this problem
      for (let i = 0; i < latest!.rules.winsNeeded; i++) {
        pen.px(middle - latest!.rules.winsNeeded * 4 + i * 8, NAMES_Y + 16, 6, 3, i < unit.wins ? C.brass : C.steelDD);
      }
      unit.members.forEach((player, at) => {
        const x = xs[at];
        const info = latest!.players.find((each) => each.id === player);
        const hop = hops.get(player) ?? 0;
        const lift = hop > 0 && !lessMotion() ? Math.round(Math.sin((hop / 0.35) * Math.PI) * 5) : 0;
        pen.rects(figureRects(player % FIGURE_COUNT, false, 1), x, FIGURES_Y - lift);
        const gone = info !== undefined && (info.left || !info.connected);
        const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
        if (named || me?.player === player) {
          // in a crowd the player's own name is the only one: it may be wider than its share, and is kept inside the scene
          const name = pen.fit(info?.nick ?? "", named ? nameRoom : NAME_WIDTH);
          const width = pen.width(name);
          const nx = Math.max(1 + (voice !== "out" ? VOICE_MARK_W : 0), Math.min(SCENE_W - 1 - width, x - Math.round(width / 2)));
          pen.txt(name, nx, NAMES_Y, gone ? C.dim : me?.player === player ? C.amber : C.bone);
          if (voice !== "out") drawVoiceMark(pen, nx - VOICE_MARK_W, NAMES_Y, voice, time);
        } else if (voice !== "out") {
          // nameless, the mark of the voice chat stands under the figure by itself
          drawVoiceMark(pen, x - 3, NAMES_Y, voice, time);
        }
      });
      // what one of them has just said takes this place for as long as it is on show
      if (unit.members.some((player) => said.has(player))) return;
      if (view.duel !== null && view.phase !== "ended") {
        // the added contest: who is in it, over their heads
        if (view.duel.players.includes(unit.members[0]) && !view.wrong.includes(index)) pen.txt(named ? WORDS.mark.duel : "!", middle + 1, SAID_Y + 2, C.amber, "center");
        else if (view.duel.players.includes(unit.members[0])) pen.txt(named ? WORDS.mark.wrong : "×", middle + 1, SAID_Y + 2, C.crim, "center");
        return;
      }
      if (unit.place > 0) {
        // the place: with its word where there is room for it
        const words = named ? WORDS.mark.place(unit.place) : `${unit.place}`;
        const w = pen.width(words) + 5;
        pen.px(middle - Math.floor(w / 2), SAID_Y + 1, w, 13, C.amberD);
        pen.px(middle - Math.floor(w / 2) + 1, SAID_Y + 2, w - 2, 11, C.ink);
        pen.txt(words, middle + 1, SAID_Y + 2, C.amber, "center");
      } else if (view.wrong.includes(index) && view.outcome === null) {
        if (named) pen.txt(WORDS.mark.wrong, middle + 1, SAID_Y + 2, C.crim, "center");
        else {
          // a cross, where the word has no room
          for (let i = 0; i < 7; i++) {
            pen.px(middle - 3 + i, SAID_Y + 5 + i, 1, 1, C.crim);
            pen.px(middle + 3 - i, SAID_Y + 5 + i, 1, 1, C.crim);
          }
        }
      }
    });
    // what was said, over the head of who said it: in a crowd with the name of who it was
    for (const [player, bubble] of said) {
      const words = named ? bubble.text : `${pen.fit(nickOf(player), NAME_WIDTH)} ${bubble.text}`;
      const w = Math.max(15, pen.width(words) + 8);
      const half = Math.ceil(w / 2);
      const x = Math.max(half + 2, Math.min(SCENE_W - half - 2, standsAt(player)));
      pen.px(x - half - 1, SAID_Y - 1, w + 2, 17, C.ink);
      pen.px(x - half, SAID_Y, w, 15, C.bone);
      pen.txt(words, x, SAID_Y + 1, bubble.colour === C.amber ? C.ink : bubble.colour === C.teal ? C.tealD : C.crimD, "center");
      // a tail down to the speaker, who may not be right under a bubble kept inside the scene
      if (!named) pen.px(standsAt(player), SAID_Y + 16, 1, 5, C.bone);
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
    // while the third choice is up its cards have the wall to themselves: the last board is put away
    if (latest.view.phase !== "choose") drawBoard();
    light.draw(pen, BOARD_LEFT + Math.round(BOARD_WIDTH / 2), BOARD_TOP + Math.round(BOARD_BAND / 2), 1);
    // the players stand outside the lamp's pool: drawn over the dark, so that they and their names can be read
    drawPlayers();
    if (latest.view.phase === "choose") drawChoice();
    else drawTarget();
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
      const words = WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000));
      // as wide as the words at their longest, so the plate does not twitch as the seconds go
      const plate = Math.max(160, pen.width(words) + 16);
      const middle = BOARD_TOP + Math.round(BOARD_BAND / 2);
      const centre = Math.min(SCENE_W - 4 - Math.round(plate / 2), BOARD_LEFT + Math.round(BOARD_WIDTH / 2));
      pen.px(centre - Math.round(plate / 2), middle - 9, plate, 17, C.ink);
      pen.txt(words, centre, middle - 7, C.boneD, "center");
    }
  }

  /** The third choice, over the board: the card of the viewer's side, its two options, and how many have chosen. */
  function drawChoice(): void {
    if (latest === null || latest.view.choosing === null) return;
    const up = latest.view.choosing;
    const view = latest.view;
    const me = mine();
    pen.px(4, 22, SCENE_W - 8, 142, C.ink);
    pen.px(5, 23, SCENE_W - 10, 140, C.bar);
    pen.txt(WORDS.choice.name, 12, 26, C.amber);
    // what follows the choice's name on its line
    const after = 12 + pen.width(WORDS.choice.name) + 8;
    const total = view.units.reduce((sum, unit) => sum + unit.members.length, 0);
    const count = WORDS.choice.picked(up.chosen.length, total);
    if (up.card === null || me === null) {
      // someone watching has no card: only how the choosing stands
      pen.txt(WORDS.choice.everyone, after, 26, C.boneD);
      pen.txt(count, 12, 148, C.boneD);
      return;
    }
    pen.txt(WORDS.choice.cardFor[up.card], after, 26, C.boneD);
    for (const option of [1, 2] as const) {
      const rect = OPTION_RECTS[option - 1];
      const [x, y, w, h] = rect;
      const taken = up.mine === option;
      const lit = taken || (up.mine === null && pointed === option);
      const live = choosing() && !pending;
      pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
      pen.txt(`${option}`, x + 7, y + 18, C.dim);
      // the option's name, as large as its language leaves room for, level with the middle of the card
      const size = WORDS.choice.optionSize;
      pen.txt(OPTION_NAMES[up.card][option - 1], x + 20, y + Math.round((h - size - 2) / 2), lit ? C.amber : up.mine === null ? C.bone : C.dim, "left", size);
      const lines = cardLines(up.card, option);
      const top = y + Math.round((h - lines.length * 15) / 2) + 1;
      lines.forEach((line, at) => pen.txt(line, x + 100, top + at * 15, lit || up.mine === null ? C.bone : C.dim));
    }
    // a team's leader, whose share differs from the others': named under the cards
    const leader = view.units[me.unit].leader;
    const who = leader === null ? "" : WORDS.choice.leader(leader === me.player ? null : pen.fit(nickOf(leader), NAME_WIDTH));
    pen.txt(pen.fit(`${who}${count}`, SCENE_W - 24), 12, 148, C.boneD);
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const me = mine();
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "choose") {
      const seconds = Math.ceil((left(latest.clock.choose) ?? 0) / 1000);
      if (pending) return [WORDS.standing.sending, C.boneD];
      if (choosing()) return [WORDS.standing.choose(seconds), seconds <= TICK_FROM ? C.crim : C.amber];
      return [WORDS.standing.chooseWait(seconds), C.bone];
    }
    if (view.phase === "answer" && view.floor !== null) {
      const seconds = Math.ceil((left(latest.clock.answer) ?? 0) / 1000);
      // the answer said is on its way: no longer one to be typed
      if (answering() && pending) return [WORDS.standing.sending, C.boneD];
      if (answering()) return [WORDS.standing.answer(seconds), seconds <= TICK_FROM ? C.crim : C.amber];
      return [WORDS.standing.answering(pen.fit(nickOf(view.floor.player), LIST_NAME_WIDTH), seconds), C.bone];
    }
    if (view.phase === "pause") {
      const seconds = Math.ceil((left(latest.clock.next) ?? 0) / 1000);
      const how = view.outcome?.kind === "right" ? { right: pen.fit(nickOf(view.outcome.player), LIST_NAME_WIDTH) } : view.outcome?.kind === "time" ? "time" : "all-wrong";
      return [WORDS.standing.next(how, seconds), view.outcome?.kind === "right" ? C.teal : C.boneD];
    }
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (me === null) return [WORDS.standing.watching, C.boneD];
    if (view.duel !== null) {
      // the added contest: its players race, everyone else looks on
      const names = view.duel.players.map((player) => pen.fit(nickOf(player), LIST_NAME_WIDTH)).join(WORDS.standing.versus);
      if (!view.duel.players.includes(me.player)) return [pen.fit(WORDS.standing.duelWatch(names), W - 12), C.boneD];
      if (view.wrong.includes(me.unit)) return [WORDS.standing.wrong, C.crim];
      if (pending) return [WORDS.standing.sending, C.boneD];
      return [WORDS.standing.duel, C.amber];
    }
    if (view.units[me.unit].place > 0) return [WORDS.standing.won, C.amber];
    if (view.wrong.includes(me.unit)) return [WORDS.standing.wrong, C.crim];
    if (pending) return [WORDS.standing.sending, C.boneD];
    return [WORDS.standing.buzz, C.amber];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    // one side with nobody to race: "half have won" would say nothing, so those lines are shorter
    const unopposed = latest.view.units.length === 1;
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), LIST_NAME_WIDTH) : "";
      if (event.type === "problem") lines.push([event.duel === undefined ? WORDS.log.problem(event.round) : WORDS.log.duelProblem(event.duel), C.boneD]);
      else if (event.type === "buzz") lines.push([WORDS.log.buzz(who), C.bone]);
      else if (event.type === "right") lines.push([WORDS.log.right(who, event.said), C.teal]);
      else if (event.type === "wrong") lines.push([WORDS.log.wrong(who, event.said), C.crim]);
      else if (event.type === "silent") lines.push([WORDS.log.silent(who), C.crim]);
      else if (event.type === "time") lines.push([WORDS.log.time, C.boneD]);
      else if (event.type === "all-wrong") lines.push([WORDS.log.allWrong, C.boneD]);
      else if (event.type === "won") lines.push([WORDS.log.won(unitName(event.unit, 96), event.place), C.amber]);
      else if (event.type === "raced") lines.push([WORDS.log.raced(event.reason, unopposed), C.amber]);
      else if (event.type === "choice") {
        // each team's decision, then who took which of the two alone
        for (const decided of event.decisions) {
          const unit = latest.view.units[decided.unit];
          const card: Card = unit !== undefined && unit.place > 0 ? "winners" : "losers";
          // the team's name is cut to what its decision leaves of the line
          const option = OPTION_NAMES[card][decided.option - 1];
          const room = Math.min(110, PANEL_WIDTH - pen.width(WORDS.log.decided("", option)));
          lines.push([WORDS.log.decided(unitName(decided.unit, room), option), C.brass]);
        }
        const solo = event.chosen.filter((chosen) => latest!.view.units.some((unit) => unit.members.length === 1 && unit.members[0] === chosen.player));
        for (const option of [1, 2] as const) {
          const those = solo.filter((chosen) => chosen.option === option).map((chosen) => pen.fit(nickOf(chosen.player), 40));
          if (those.length > 0) lines.push([pen.fit(WORDS.log.alone(OPTION_NAMES.alone[option - 1], those), PANEL_WIDTH), C.brass]);
        }
      } else if (event.type === "duel") lines.push([pen.fit(WORDS.log.duel(event.players.map((player) => pen.fit(nickOf(player), 44)).join(WORDS.standing.versus)), PANEL_WIDTH), C.amber]);
      else if (event.type === "duel-over") {
        const won = event.winner === null ? WORDS.log.duelNobody : WORDS.log.duelWon(pen.fit(nickOf(event.winner), 44), latest.rules.duelPieces);
        lines.push([pen.fit(won, PANEL_WIDTH), event.winner === null ? C.boneD : C.teal]);
      } else if (event.type === "score") lines.push([WORDS.log.scored, C.boneD]);
      else lines.push([unopposed && event.reason === "half" ? WORDS.endedUnopposed : WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(view.phase === "choose" ? WORDS.choice.name : view.duel !== null ? WORDS.panel.duel(view.duel.round) : WORDS.panel.problem(view.round), x, 3, C.bone);
    const choose = view.phase === "choose" ? left(latest.clock.choose) : null;
    if (choose !== null) pen.txt(WORDS.panel.seconds(Math.ceil(choose / 1000)), W - 5, 3, choose <= TICK_FROM * 1000 ? C.crim : C.boneD, "right");
    const problem = left(latest.clock.problem);
    if (problem !== null) {
      const seconds = Math.ceil(problem / 1000);
      pen.txt(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, W - 5, 3, seconds <= 15 ? C.crim : C.boneD, "right");
    }
    // the units: a team takes a whole row, players alone go two to a row
    const places = unitPlaces(view.units);
    const rows = unitRows(view.units);
    const layout = panelLayout(rows, { room: UNIT_ROWS, listRows: rows, below: TERMS_ROOM });
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    view.units.forEach((unit, index) => {
      const team = unit.members.length > 1;
      const ux = x + places[index].half * 86;
      const uy = layout.listTop + places[index].row * LIST_PITCH;
      const name = unitName(index, team ? 104 : LIST_NAME_WIDTH);
      const colour = unit.place > 0 ? C.amber : view.wrong.includes(index) && view.outcome === null ? C.dim : mine()?.unit === index ? C.bone : C.boneD;
      pen.txt(name, ux, uy, colour);
      const px = ux + (team ? 108 : LIST_NAME_WIDTH + 4);
      const points = unit.members.map((player) => scoreOf(player));
      if (points.every((line) => line !== null)) {
        // the game is over: each player's points, a team's in the order of its names
        const words = points.map((line) => signed(line!.total)).join(" ");
        pen.txt(words, team ? x + PANEL_WIDTH - 1 : ux + 81, uy, unit.place > 0 ? C.amber : C.boneD, "right");
      } else if (view.phase === "choose" && view.choosing !== null) {
        // the choice: a mark for each player who has chosen
        unit.members.forEach((player, at) => pen.px(px + at * 8, uy + 4, 6, 5, view.choosing!.chosen.includes(player) ? C.brass : C.steelDD));
      } else if (unit.place > 0) pen.txt(WORDS.panel.place(unit.place), px, uy, C.amber);
      else for (let i = 0; i < latest!.rules.winsNeeded; i++) pen.px(px + i * 8, uy + 4, 6, 5, i < unit.wins ? C.brass : C.steelDD);
    });
    // under the list: where it ends in a crowded game, where the longest ends otherwise
    const under = layout.crowded ? underList(layout) : 60;
    pen.px(x, under, PANEL_WIDTH, 1, C.steelDD);
    // what it takes to win and to end; how the game stands this moment is said in the bar, by the buzzer
    pen.txt(WORDS.panel.toWin(latest.rules.winsNeeded), x, under + 3, C.boneD);
    // one side alone has nobody to race: its own win ends the game
    pen.txt(WORDS.panel.toEnd(view.units.length, view.winnersNeeded), x, under + 16, C.boneD);
    const lines = logLines();
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(lines[i][0], x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
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

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const me = mine();
    if (latest === null || latest.view.phase !== "ended" || me === null) return null;
    return WORDS.result.verdict(true, latest.view.units[me.unit].place > 0);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const me = mine();
    const won = me !== null && view.units[me.unit].place > 0;
    pen.txt(WORDS.result.verdict(me !== null, won), 10, 234, me === null ? C.bone : won ? C.teal : C.crim, "left", 24);
    const winners = view.units
      .map((unit, index) => ({ unit, index }))
      .filter((each) => each.unit.place > 0)
      .sort((a, b) => a.unit.place - b.unit.place)
      .map((each) => WORDS.result.place(each.unit.place, unitName(each.index, 70)));
    pen.txt(pen.fit(winners.length > 0 ? winners.join("  ") : WORDS.result.nobody, 280), 96, 226, C.bone);
    const line = me === null ? null : scoreOf(me.player);
    if (line === null) pen.txt(WORDS.result.upTo(view.round), 96, 240, C.boneD);
    else {
      // how the viewer's points came about: a team's by what it decided, a player's own by the race and their choice
      const unit = me === null ? undefined : view.units[me.unit];
      const decided = me === null ? undefined : view.decisions.find((each) => each.unit === me.unit);
      const parts = [WORDS.result.points(signed(line.total))];
      if (unit !== undefined && unit.members.length > 1 && decided !== undefined) {
        const card: Card = unit.place > 0 ? "winners" : "losers";
        parts.push(WORDS.result.team(OPTION_NAMES[card][decided.option - 1], unit.leader === me?.player));
      } else parts.push(WORDS.result.race(signed(line.race)));
      if (line.choice !== 0) {
        const safe = line.choice === -latest.rules.safeLoss && line.pieces === 0 && view.duel?.players.includes(line.player) !== true;
        parts.push(safe ? WORDS.result.safe(signed(line.choice)) : WORDS.result.duel(signed(line.choice)));
      }
      if (line.pieces > 0) parts.push(WORDS.result.duelWon(line.pieces));
      pen.txt(pen.fit(parts.join(" · "), 280), 96, 240, line.total > 0 ? C.teal : line.total < 0 ? C.crim : C.boneD);
    }
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext(latest.players.length === 1) : WORDS.result.waitHost, 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, WORDS.button.again, "", !starting, !starting);
    button(LOBBY_RECT, WORDS.button.lobby, "", false, true);
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
    if (latest.view.phase === "choose") {
      const up = latest.view.choosing;
      const how =
        up === null || up.card === null
          ? WORDS.choice.watching
          : up.mine !== null
            ? WORDS.choice.done
            : pointed !== null
              ? WORDS.choice.confirm
              : WORDS.choice.how;
      pen.txt(how, 6, 241, up !== null && up.card !== null && up.mine === null ? C.bone : C.boneD);
      pen.txt(WORDS.choice.rules, 6, 254, C.boneD);
      return;
    }
    if (answering()) {
      // the answer so far, and a pad of digits for whoever has no keys
      pen.txt(WORDS.typed, 6, 246, C.boneD);
      pen.px(24, 241, 84, 26, C.amberD);
      pen.px(25, 242, 82, 24, C.ink);
      pen.txt(typed === "" ? "_" : typed, 66, 242, C.amber, "center", 24);
      for (let digit = 0; digit <= 9; digit++) button(digitRect(digit), `${digit}`, "", false, !pending);
      button(ERASE_RECT, WORDS.button.erase, "", false, typed !== "" && !pending);
      // said and on its way, the button stays lit and takes no second press
      button(SAY_RECT, WORDS.button.say, "", typed !== "", typed !== "" && !pending);
      return;
    }
    const able = canBuzz();
    // this player's own buzz is on its way: the button stays pressed and says so, it does not say it is shut
    const going = buzzed && pending;
    button(BUZZ_RECT, WORDS.button.buzzer, going ? WORDS.standing.sending : able ? WORDS.button.buzzerKeys : WORDS.button.buzzerShut, going || (able && Math.sin(time * 5) > 0), able);
    pen.txt(WORDS.brief[0], 162, 241, C.boneD);
    pen.txt(WORDS.brief[1], 162, 254, C.boneD);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help(rules);
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
    if (!event.repeat) keys.push(event.code);
    if (event.code === "Space" || event.code === "Backspace") event.preventDefault();
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
    // by the room's last word; a game that stands still waits on no one
    waits: (): boolean => truth !== null && !truth.frozen && rectWaits(truth.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      if (ahead !== null && truth !== null) latest = truth;
      ahead = null;
      buzzed = false;
      queued = false;
      if (!answering()) typed = "";
      // the one refusal whose words hold a number of the rules
      const text = reason === "bad-count" && latest !== null ? WORDS.badCount(latest.rules.maxSaid) : WORDS.refused[reason];
      say(text ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // A buzz or an answer that was on its way when the connection went is not coming back as anything:
      // the buzzer is free again. If the room did take the buzz, the game sent on rejoining says so.
      pending = false;
      if (ahead !== null && truth !== null) latest = truth;
      ahead = null;
      buzzed = false;
      queued = false;
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

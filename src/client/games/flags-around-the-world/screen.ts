/**
 * The screen of 만국기: a round's flags going by one at a time, then the 25
 * laid out to circle five of, then which five they were.
 *
 * Design: design/games/flags-around-the-world.md. The room decides
 * everything; this screen shows what it sends and asks it to take the flags
 * a player circled. The room sends a round's ten flags at once and this
 * screen shows them one after another by the round's clock; the 25 come
 * when the minute begins, and which five were shown when it is over, so
 * neither is here to be drawn before. Everything can be done with the
 * pointer; the keys are another way to the same.
 *
 * The flags are cut from one sheet (`flags.ts`). A circle is drawn as a ring
 * round the flag, and what was right is said twice, by colour and by a mark.
 */
import { FLAG_CELL, FLAG_SHEET, flagSpot } from "../../../shared/games/flags-around-the-world/flags";
import { showMs, type FlagsEvent } from "../../../shared/games/flags-around-the-world/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { flagsWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 만국기. */
export type FlagsMessage = Extract<ServerMessage, { type: "game"; game: "flags-around-the-world" }>;
type View = FlagsMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface FlagsHandlers {
  /** The player submitted the flags they circled. Returns whether it could be sent. */
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
export interface FlagsScreen {
  update(message: FlagsMessage): void;
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
const [CELL_W, CELL_H] = FLAG_CELL;
/** The flags laid out, under the page's own buttons, which lie over the top left of the scene: five to a row. */
const GRID_COLUMNS = 5;
const GRID_X = 14;
const GRID_Y = 34;
const GRID_PITCH: readonly [number, number] = [58, 37];
/** The flag being shown: four times the size it has on the sheet, in the middle of the scene. */
const BIG = 4;
const BIG_X = Math.round(SCENE_W / 2 - (CELL_W * BIG) / 2);
const BIG_Y = 54;
/** The line over the scene, right of the page's buttons. */
const TOP_Y = 16;
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 80;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** With this many ms left of the minute, what is circled and not submitted is sent: time enough for it to reach the room. */
const SEND_BEFORE_MS = 1500;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter to submit. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** The colours of a flag's edge: one that was shown, and one circled. */
const RIGHT = "#2fae78";

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const CLEAR_RECT: Box = [270, 238, 90, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
/** Where the flag at `index` of those laid out is. */
const cellBox = (index: number): Box => [GRID_X + (index % GRID_COLUMNS) * GRID_PITCH[0], GRID_Y + Math.floor(index / GRID_COLUMNS) * GRID_PITCH[1], CELL_W, CELL_H];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link FlagsScreen.update}. */
export function createFlagsScreen(canvas: HTMLCanvasElement, handlers: FlagsHandlers): FlagsScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  /** The sheet of flags; drawn from once it has come. */
  const sheet = new Image();
  let sheetReady = false;
  sheet.addEventListener("load", () => {
    sheetReady = true;
  });
  sheet.src = FLAG_SHEET;

  let latest: FlagsMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** Which flag of the round was last heard going by. */
  let heard = -1;
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
  /** The flags circled and not submitted yet, in the order they were circled. */
  let circled: string[] = [];
  /** Which of the flags laid out the keys are at. */
  let cursor = 0;
  /** Whether the keys have moved over the flags in this round: the place they are at is marked from then. */
  let keyed = false;
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
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const me = (): number | null => latest?.view.you ?? null;
  /** Whether this player is circling flags: they are laid out, the round is theirs, and nothing is submitted. */
  function choosing(): boolean {
    if (latest === null || latest.frozen) return false;
    const view = latest.view;
    return view.phase === "choose" && view.mine !== null && view.mine.picks === null && view.choices !== null;
  }
  /**
   * Which of the round's flags is on show now, by the round's clock: `ready`
   * seconds before the first, or the flag at `index` on the `pass`th time
   * over (from 0). `null` at any other time.
   */
  function showing(): { ready: number } | { index: number; pass: number } | null {
    if (latest === null || latest.view.phase !== "show") return null;
    const ms = left(latest.clock.turn);
    if (ms === null) return null;
    const rules = latest.rules;
    const elapsed = showMs(rules) - ms;
    const lead = rules.readySeconds * 1000;
    if (elapsed < lead) return { ready: Math.ceil((lead - elapsed) / 1000) };
    const step = Math.min(rules.shown * rules.passes - 1, Math.floor((elapsed - lead) / (rules.showSeconds * 1000)));
    return { index: step % rules.shown, pass: Math.floor(step / rules.shown) };
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
  function show(event: FlagsEvent): void {
    const mine = me();
    if (event.type === "round") {
      if (event.round > 1) sfx.swap();
    } else if (event.type === "picked") {
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "scored") {
      sfx.pick();
    } else if (event.type === "tied") {
      say(mine !== null && event.players.includes(mine) ? WORDS.say.tied : WORDS.say.tiedWatch);
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

  function update(message: FlagsMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.round !== message.view.round;
    // another step: what was circled for the last is put away
    if (fresh || moved) {
      circled = [];
      cursor = 0;
      keyed = false;
      heard = -1;
    }
    const waited = choosing();
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // the flags have been laid out for this player
    if (!waited && choosing() && !fresh && moved) {
      say(WORDS.say.laid);
      sfx.turn();
    }
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Circles the flag at `index` of those laid out, or takes its circle off. */
  function toggle(index: number): void {
    if (latest === null) return;
    const flag = latest.view.choices?.[index];
    if (flag === undefined) return;
    if (circled.includes(flag)) {
      circled = circled.filter((each) => each !== flag);
      sfx.back();
      return;
    }
    if (circled.length >= latest.rules.answers) return deny(WORDS.say.full(latest.rules.answers));
    circled = [...circled, flag];
    sfx.move();
  }

  /** Submits what is circled. */
  function send(): void {
    if (latest === null || pending) return;
    pending = handlers.act({ type: "pick", flags: circled });
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
    if (!choosing() || pending) return;
    const count = view.choices?.length ?? 0;
    const rows = Math.ceil(count / GRID_COLUMNS);
    for (const code of keys) {
      const column = cursor % GRID_COLUMNS;
      const row = Math.floor(cursor / GRID_COLUMNS);
      if (code === "ArrowLeft") cursor = row * GRID_COLUMNS + ((column + GRID_COLUMNS - 1) % GRID_COLUMNS);
      else if (code === "ArrowRight") cursor = row * GRID_COLUMNS + ((column + 1) % GRID_COLUMNS);
      else if (code === "ArrowUp") cursor = ((row + rows - 1) % rows) * GRID_COLUMNS + column;
      else if (code === "ArrowDown") cursor = ((row + 1) % rows) * GRID_COLUMNS + column;
      else if (code === "Space") {
        keyed = true;
        toggle(cursor);
      } else if (code === "Enter" || code === "NumpadEnter") send();
      else if (code === "Escape") circled = [];
      if (code.startsWith("Arrow")) {
        keyed = true;
        cursor = Math.min(count - 1, cursor);
      }
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (hits(p, MAIN_RECT)) send();
      else if (hits(p, CLEAR_RECT)) circled = [];
      else {
        for (let index = 0; index < count; index++) {
          if (hits(p, cellBox(index), 2)) toggle(index);
        }
      }
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
      // each flag is heard as it comes
      const at = showing();
      const key = at === null || "ready" in at ? -1 : at.pass * latest.rules.shown + at.index;
      if (key !== heard) {
        heard = key;
        if (key >= 0) sfx.move();
      }
      // my own time is nearly up: a tick a second, and what is circled is submitted before it is
      const mine = choosing() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > HURRY_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
      if (mine !== null && mine <= SEND_BEFORE_MS && !pending && circled.length > 0) {
        send();
        if (pending) say(WORDS.say.autoSent);
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

  /** A ring round the box at (`x`, `y`), `gap` pixels off it and `thick` wide. */
  function ring(x: number, y: number, w: number, h: number, gap: number, thick: number, colour: string): void {
    const [left, top, width, height] = [x - gap - thick, y - gap - thick, w + 2 * (gap + thick), h + 2 * (gap + thick)];
    pen.px(left, top, width, thick, colour);
    pen.px(left, top + height - thick, width, thick, colour);
    pen.px(left, top, thick, height, colour);
    pen.px(left + width - thick, top, thick, height, colour);
  }

  /** On a flag that was circled, at its corner: a ring where it was one of the five, a cross where it was not. */
  function mark(x: number, y: number, right: boolean): void {
    pen.px(x, y, 11, 11, right ? RIGHT : C.crim);
    if (right) {
      pen.px(x + 3, y + 2, 5, 1, C.ink);
      pen.px(x + 3, y + 8, 5, 1, C.ink);
      pen.px(x + 2, y + 3, 1, 5, C.ink);
      pen.px(x + 8, y + 3, 1, 5, C.ink);
      return;
    }
    for (let i = 0; i < 7; i++) {
      pen.px(x + 2 + i, y + 2 + i, 1, 1, C.ink);
      pen.px(x + 8 - i, y + 2 + i, 1, 1, C.ink);
    }
  }

  /** The flag `id` at (`x`, `y`), `scale` times its size on the sheet; its letters in a box while the sheet has not come. */
  function drawFlag(id: string, x: number, y: number, scale: number): void {
    const spot = flagSpot(id);
    const [w, h] = [CELL_W * scale, CELL_H * scale];
    if (sheetReady && spot !== null) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet, spot[0], spot[1], CELL_W, CELL_H, x, y, w, h);
      return;
    }
    pen.px(x, y, w, h, C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, C.btn);
    pen.txt(id.toUpperCase(), x + Math.round(w / 2), y + Math.round(h / 2) - 7, C.boneD, "center");
  }

  /** A round's flags going by: the one on show, large, and which of how many it is. */
  function drawShow(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    const [w, h] = [CELL_W * BIG, CELL_H * BIG];
    pen.px(BIG_X - 3, BIG_Y - 3, w + 6, h + 6, C.steelDD);
    pen.px(BIG_X - 2, BIG_Y - 2, w + 4, h + 4, C.ink);
    const at = showing();
    const top = (words: string, colour: string): void => pen.txt(pen.fit(words, SCENE_W - 140), SCENE_W - 6, TOP_Y, colour, "right");
    if (view.phase === "wait") {
      const ms = left(latest.clock.turn);
      top(WORDS.show.wait(rules.choices, ms === null ? 0 : Math.ceil(ms / 1000)), C.amber);
    } else if (at === null) return;
    else if ("ready" in at) top(WORDS.show.ready(rules.shown, at.ready), C.amber);
    else {
      const flag = view.shown?.[at.index];
      if (flag !== undefined) drawFlag(flag, BIG_X, BIG_Y, BIG);
      top(WORDS.show.pass(at.pass + 1, rules.passes, at.index + 1, rules.shown), C.bone);
      // one mark a flag under the picture: those that have gone by this time over, and the one on show
      const pitch = Math.floor(w / rules.shown);
      for (let i = 0; i < rules.shown; i++) pen.px(BIG_X + i * pitch + 2, BIG_Y + h + 8, pitch - 4, 4, i === at.index ? C.amber : i < at.index ? C.steel : C.steelDD);
    }
    // a further round is watched by those who are not level at the top
    if (view.you !== null && view.mine === null && view.tiebreak > 0) pen.txt(WORDS.show.watching, Math.round(SCENE_W / 2), BIG_Y + h + 18, C.boneD, "center");
  }

  /** The flags laid out: circled while they are chosen from; once the round is scored, those that were shown marked out and each circle right or wrong. */
  function drawGrid(): void {
    if (latest === null) return;
    const view = latest.view;
    const choices = view.choices ?? [];
    const scored = view.answers !== null;
    const mine = me();
    const own = view.results?.find((each) => each.player === mine);
    const chosen = scored ? (own?.picks ?? []) : (view.mine?.picks ?? circled);
    const live = choosing() && !pending;
    choices.forEach((flag, index) => {
      const [x, y] = cellBox(index);
      drawFlag(flag, x, y, 1);
      const right = scored && (view.answers ?? []).includes(flag);
      const picked = chosen.includes(flag);
      if (scored) {
        // what was not shown falls back; what was shown has a green edge, and a circle is marked right or wrong
        if (!right) {
          ctx.fillStyle = "rgba(12, 14, 24, 0.62)";
          ctx.fillRect(x, y, CELL_W, CELL_H);
        } else ring(x, y, CELL_W, CELL_H, 0, 2, RIGHT);
        if (picked) {
          mark(x - 2, y - 2, right);
        }
        return;
      }
      if (picked) ring(x, y, CELL_W, CELL_H, 0, 2, C.amber);
      else if (live && inRect(mouse, [x, y, CELL_W, CELL_H])) ring(x, y, CELL_W, CELL_H, 0, 1, C.bone);
      if (live && keyed && index === cursor && Math.floor(time * 3) % 2 === 0) ring(x, y, CELL_W, CELL_H, 2, 1, C.bone);
    });
    // over the flags, at the right: how many are circled, or what the round brought
    const top = (words: string, colour: string): void => pen.txt(pen.fit(words, SCENE_W - 140), SCENE_W - 6, TOP_Y, colour, "right");
    if (scored) top(own !== undefined ? WORDS.scored(own.points) : WORDS.answersShown, own !== undefined ? C.teal : C.boneD);
    else if (view.mine !== null) top(WORDS.count(chosen.length, latest.rules.answers), chosen.length === latest.rules.answers ? C.teal : C.amber);
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    if (view.phase === "show" || view.phase === "wait") drawShow();
    else drawGrid();
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
    if (pending) return [WORDS.standing.sending, C.boneD];
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    if (view.phase === "show") return [WORDS.standing.show, C.bone];
    if (view.phase === "wait") return [WORDS.standing.wait, C.bone];
    if (view.phase === "reveal") return [WORDS.standing.reveal(clock), C.bone];
    if (view.mine === null) return [WORDS.standing.chooseOther(clock), C.bone];
    if (view.mine.picks !== null) return [WORDS.standing.chosen(clock), C.bone];
    const more = latest.rules.answers - circled.length;
    return more > 0 ? [WORDS.standing.choose(more, clock), C.amber] : [WORDS.standing.chooseReady(clock), C.teal];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, latest.rules.rounds, view.tiebreak), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null && view.phase !== "show") pen.txt(clockOf(turn), W - 5, 3, view.phase === "choose" && Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand by their points, the most first; at its end, by their places
    const totalOf = (player: number): number => view.totals.find((each) => each.player === player)?.total ?? 0;
    const order = view.places !== null ? view.places.map((each) => each.player) : [...view.players].sort((a, b) => totalOf(b) - totalOf(a) || a - b);
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = view.places?.find((each) => each.player === player)?.place;
      const result = view.phase === "reveal" && view.tiebreak === 0 ? view.results?.find((each) => each.player === player) : undefined;
      const done = view.ready.includes(player);
      // who the game waits for
      if (view.phase === "choose" && view.playing.includes(player) && !done && !(info?.left ?? false)) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const points = result !== undefined && !layout.crowded ? WORDS.gained(totalOf(player), result.points) : WORDS.points(totalOf(player));
      const words = place !== undefined && !layout.crowded ? `${WORDS.result.verdict(true, place)} ${points}` : points;
      pen.txt(words, right, y, place === 1 ? C.brass : view.phase === "choose" && done ? C.teal : C.boneD, "right");
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
      if (event.type === "round") lines.push([WORDS.log.round(event.round, event.tiebreak), C.amber]);
      else if (event.type === "picked") lines.push([WORDS.log.picked(short(event.player)), C.boneD]);
      else if (event.type === "scored") for (const each of event.points) lines.push([WORDS.log.scored(short(each.player), each.points), C.bone]);
      else if (event.type === "tied") lines.push([WORDS.log.tied, C.teal]);
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
    const totalOf = (player: number): number => view.totals.find((each) => each.player === player)?.total ?? 0;
    const named = places.map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 60), totalOf(each.player))).join(" · ");
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(latest.rules.rounds, view.tiebreak > 0 ? view.round - latest.rules.rounds : 0) : WORDS.ended[view.ended];
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
    if (view.you === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    if (choosing()) {
      const live = !pending;
      button(MAIN_RECT, WORDS.button.send, live && circled.length === latest.rules.answers, live);
      button(CLEAR_RECT, WORDS.button.clear, false, live && circled.length > 0);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.choose, CLEAR_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    pen.txt(pen.fit(idle, W - 12), 6, 246, C.dim);
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
    waits: (): boolean => latest !== null && !latest.frozen && flagsWaits(latest.view),
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

/**
 * The screen of 그라데이션: the rounds of the match as a table of the cups
 * that were submitted, this player's own seven cups, and the number cubes
 * to put in them.
 *
 * Design: design/games/gradation.md. The room decides everything; this
 * screen shows what it sends and asks it to take cubes for the cups or a cup
 * to submit. Of anyone else's cups the room sends the shade of one once it
 * is submitted and its number once it is shown, so nothing hidden is here to
 * be drawn. Cubes go into the cups from the lowest, as the rules have them
 * lie, so a player picks which seven and not where. Everything can be done
 * with the pointer; the keys are another way to the same.
 */
import { checkArrangement, shadeOf, type GradEvent } from "../../../shared/games/gradation/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { gradWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 그라데이션. */
export type GradMessage = Extract<ServerMessage, { type: "game"; game: "gradation" }>;
type View = GradMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface GradHandlers {
  /** The player distributed their cubes or submitted a cup. Returns whether it could be sent. */
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
export interface GradScreen {
  update(message: GradMessage): void;
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
/** The table of the match's rounds: a name, then a cell a round. It stands under the page's own buttons, which lie over the top left of the scene. */
const TABLE_X = 6;
const CELL_X = 72;
const CELL_W = 32;
const HEAD_Y = 31;
const ROW_Y = [46, 69];
/** The line over the middle of the scene that says what just happened. */
const PLATE_Y = 93;
/** This player's own cups, and the number cubes under them. */
const CUPS_X = 14;
const CUPS_Y = 130;
const CUP_PITCH = 40;
const CUP_W = 36;
const CUP_H = 36;
const TRAY_X = 14;
const TRAY_Y = 187;
const TRAY_PITCH = 28;
const TRAY_W = 24;
const TRAY_H = 26;
/** A cup by its shade, from the black of the ends to the white of the middle: what it is filled with, and what is written on it. */
const SHADE_FILL = ["#14151c", "#4c4f5c", "#9da0ac", "#f1eee4"];
const SHADE_INK = [C.bone, C.bone, C.ink, C.ink];
/** The widest a name is drawn in the list of players, beside the table and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const ROW_NAME = 48;
const LEFT_NAME = 64;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a cup. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const CLEAR_RECT: Box = [270, 238, 90, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
const cupBox = (index: number): Box => [CUPS_X + index * CUP_PITCH, CUPS_Y, CUP_W, CUP_H];
const trayBox = (digit: number): Box => [TRAY_X + digit * TRAY_PITCH, TRAY_Y, TRAY_W, TRAY_H];
const sumOf = (values: readonly number[]): number => values.reduce((sum, each) => sum + each, 0);

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link GradScreen.update}. */
export function createGradScreen(canvas: HTMLCanvasElement, handlers: GradHandlers): GradScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: GradMessage | null = null;
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
  /** The cubes picked for the cups and not sent yet, from the lowest. */
  let draft: number[] = [];
  /** The player has sent their cubes and is picking others. */
  let redo = false;
  /** The cup picked to submit, before it is; by its place from the left. */
  let selected: number | null = null;
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
  /** Whether this player is one of the match's two, and the game is going. */
  const inMatch = (): boolean => latest !== null && !latest.frozen && latest.view.mine !== null && latest.view.phase !== "ended";
  /** Whether this player is picking cubes: the cubes are being distributed and theirs are not sent, or they are picking others. */
  function editing(): boolean {
    if (!inMatch() || latest === null || latest.view.phase !== "arrange") return false;
    return redo || !latest.view.ready.includes(latest.view.you as number);
  }
  /** Whether a cup of this player's is waited for. */
  const myTurn = (): boolean => inMatch() && latest!.view.phase === "submit" && latest!.view.turn === latest!.view.you;
  /** How many cups there are of each shade, and how many of them `player` has not submitted yet. */
  function shadesLeft(view: View, player: number): number[] {
    const count = Array.from({ length: Math.ceil(view.rounds / 2) }, () => 0);
    for (let index = 0; index < view.rounds; index++) count[shadeOf(index, view.rounds)] += 1;
    for (const line of view.lines) for (const play of line.plays) if (play.player === player) count[play.shade] -= 1;
    for (const each of view.table) if (each.player === player) count[each.shade] -= 1;
    return count;
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
  function show(event: GradEvent): void {
    const mine = me();
    if (event.type === "match") {
      if (event.match > 1) sfx.turn();
    } else if (event.type === "arranged") {
      if (event.player === mine && event.forced) say(WORDS.say.arrangedForYou);
      else if (event.player !== mine) sfx.chip();
    } else if (event.type === "submitted") {
      if (event.player === mine && event.forced) say(WORDS.say.cupForYou);
      else if (event.player !== mine) sfx.chip();
    } else if (event.type === "revealed") {
      if (event.winner !== null && event.winner === mine) sfx.earn();
      else sfx.pick();
    } else if (event.type === "won") {
      if (latest?.view.phase !== "ended") sfx.swap();
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

  function update(message: GradMessage): void {
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
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.turn !== message.view.turn || latest.view.match !== message.view.match || latest.view.round !== message.view.round;
    // another match: the cubes picked for the last are put away
    if (fresh || latest?.view.match !== message.view.match) {
      draft = [];
      redo = false;
    }
    if (message.view.phase !== "arrange") redo = false;
    if (fresh || moved) selected = null;
    const waited = myTurn();
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) {
      if (pending && message.view.phase === "arrange") redo = false;
      pending = false;
    }
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player's cup
    if (!waited && myTurn() && !fresh) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Puts a cube of `digit` among those picked, where one is left and a cup is empty. */
  function add(digit: number): void {
    if (latest === null) return;
    if (draft.length >= latest.rules.cups) return deny(WORDS.say.cupsFull);
    if (digit > latest.rules.highest) return;
    if (draft.filter((each) => each === digit).length >= latest.rules.copies) return deny(WORDS.say.cubesGone);
    draft = [...draft, digit].sort((a, b) => a - b);
    sfx.chip();
  }

  /** Takes the cube out of the cup at `index`. */
  function takeOut(index: number): void {
    if (index < 0 || index >= draft.length) return;
    draft = draft.filter((_, at) => at !== index);
    sfx.back();
  }

  /** Sends the cubes picked, where they are what the rules allow. */
  function done(): void {
    if (latest === null || pending) return;
    const rules = latest.rules;
    if (draft.length < rules.cups) return deny(WORDS.say.notFull(rules.cups - draft.length));
    const wrong = checkArrangement(draft, rules);
    if (wrong === "over-sum") return deny(WORDS.say.overSum(sumOf(draft), rules.maxSum));
    if (wrong !== null) return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
    pending = handlers.act({ type: "arrange", values: draft });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Picks the cup at `index` to submit; picked already, submits it. */
  function pick(index: number): void {
    if (latest === null || latest.view.mine === null) return;
    if (index < 0 || index >= latest.view.rounds) return;
    if (latest.view.mine.used[index]) return deny(WORDS.say.cupUsed);
    if (selected === index) return submit();
    selected = index;
    sfx.move();
  }

  /** Submits the cup picked. */
  function submit(): void {
    if (latest === null || selected === null || pending) return;
    pending = handlers.act({ type: "submit", cup: selected });
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
    if (!inMatch() || pending) return;

    if (view.phase === "arrange") {
      if (!editing()) {
        // the cubes are sent: they can be picked again while the opponent is not done
        if (pressed("Enter", "NumpadEnter") || clicked(MAIN_RECT)) {
          draft = [...(view.mine?.values ?? [])];
          redo = true;
          sfx.move();
        }
        return;
      }
      for (const code of keys) {
        const digit = /^(Digit|Numpad)(\d)$/.exec(code);
        if (digit !== null) add(Number(digit[2]));
        else if (code === "Backspace" || code === "Delete") takeOut(draft.length - 1);
        else if (code === "KeyC") {
          draft = [];
          sfx.back();
        } else if (code === "Enter" || code === "NumpadEnter") done();
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) done();
        else if (hits(p, CLEAR_RECT)) {
          draft = [];
          sfx.back();
        } else {
          for (let digit = 0; digit <= latest.rules.highest; digit++) if (hits(p, trayBox(digit))) add(digit);
          for (let index = 0; index < view.rounds; index++) if (hits(p, cupBox(index))) takeOut(index);
        }
      }
      return;
    }
    if (!myTurn() || view.mine === null) return;
    const used = view.mine.used;
    for (const code of keys) {
      const digit = /^(Digit|Numpad)(\d)$/.exec(code);
      if (digit !== null && Number(digit[2]) >= 1 && Number(digit[2]) <= view.rounds) {
        const index = Number(digit[2]) - 1;
        if (used[index]) deny(WORDS.say.cupUsed);
        else {
          selected = index;
          sfx.move();
        }
      } else if (code === "ArrowLeft" || code === "ArrowRight") {
        // to the next cup not submitted, round the row
        const by = code === "ArrowLeft" ? -1 : 1;
        let at = selected ?? (by > 0 ? -1 : view.rounds);
        for (let tries = 0; tries < view.rounds; tries++) {
          at = (at + by + view.rounds) % view.rounds;
          if (!used[at]) break;
        }
        selected = at;
        sfx.move();
      } else if (code === "Enter" || code === "NumpadEnter" || code === "Space") submit();
      else if (code === "Escape") selected = null;
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (selected !== null && hits(p, MAIN_RECT)) submit();
      else for (let index = 0; index < view.rounds; index++) if (hits(p, cupBox(index))) pick(index);
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
      const mine = myTurn() || editing() ? left(latest.clock.turn) : null;
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

  /**
   * A cup of `shade` in `box`, with `text` on it. The shade is shown twice:
   * by how light the cup is, and by as many marks along its foot as the cup
   * is steps from black. `spent`: a cup that has been submitted, drawn as its
   * outline.
   */
  function drawCup(box: Box, shade: number, text: string, options: { edge?: string; spent?: boolean; size?: number } = {}): void {
    const [x, y, w, h] = box;
    const edge = options.edge ?? (options.spent ? C.steelDD : C.steel);
    pen.px(x, y, w, h, edge);
    pen.px(x + 1, y + 1, w - 2, h - 2, options.spent ? C.night : (SHADE_FILL[shade] ?? SHADE_FILL[0]));
    const ink = options.spent ? C.dim : (SHADE_INK[shade] ?? C.bone);
    // the rim
    if (!options.spent) pen.px(x + 1, y + 1, w - 2, 1, shade === 0 ? C.steelD : C.steelH);
    for (let mark = 0; mark < shade; mark++) pen.px(x + 3 + mark * 4, y + h - 4, 2, 2, ink);
    const size = options.size ?? 12;
    if (text !== "") pen.txt(text, x + Math.round(w / 2) + (size > 12 ? 1 : 0), y + Math.round((h - size - 1) / 2) - (size > 12 ? 1 : 0), ink, "center", size);
  }

  /** The rounds of the match: a row for each of its two, a cell for each round. */
  function drawTable(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    for (let round = 1; round <= view.rounds; round++) {
      const now = round === view.round && (view.phase === "submit" || view.phase === "reveal");
      pen.txt(`${round}`, CELL_X + (round - 1) * CELL_W + CELL_W / 2, HEAD_Y, now ? C.amber : C.dim, "center");
    }
    pen.txt(WORDS.scene.round, CELL_X - 8, HEAD_Y, C.dim, "right");
    view.duel.forEach((player, row) => {
      const y = ROW_Y[row];
      if (y === undefined) return;
      const points = view.score.find((each) => each.player === player)?.points ?? 0;
      pen.px(TABLE_X, y - 2, SCENE_W - TABLE_X * 2, 21, row === 0 ? C.wallD : C.bar);
      pen.txt(pen.fit(nickOf(player), ROW_NAME), TABLE_X + 2, y + 2, player === mine ? C.amber : C.bone);
      pen.txt(`${points}`, CELL_X - 6, y + 2, C.brass, "right");
      for (let round = 1; round <= view.rounds; round++) {
        const box: Box = [CELL_X + (round - 1) * CELL_W + 4, y, CELL_W - 8, 17];
        const line = view.lines.find((each) => each.round === round);
        const play = line?.plays.find((each) => each.player === player);
        const waiting = round === view.round && view.phase === "submit" ? view.table.find((each) => each.player === player) : undefined;
        if (play !== undefined) {
          drawCup(box, play.shade, `${play.value}`, line?.winner === player ? { edge: C.amber } : {});
          // the round's first player
          if (line?.first === player) pen.px(box[0] - 3, y + 1, 2, 2, C.brass);
        } else if (waiting !== undefined) drawCup(box, waiting.shade, "?", { edge: Math.floor(time * 3) % 2 === 0 ? C.bone : C.steel });
        else {
          pen.px(box[0], y + 16, box[2], 1, C.steelDD);
          // whose cup the round waits for
          if (round === view.round && view.turn === player) pen.px(box[0] + Math.round(box[2] / 2) - 1, y + 7, 3, 3, Math.floor(time * 3) % 2 === 0 ? C.amber : C.amberD);
        }
      }
    });
  }

  /** The cups `player` has not submitted, by shade: what everyone can work out from the cups that were. */
  function drawLeft(player: number, y: number): void {
    if (latest === null) return;
    const view = latest.view;
    pen.txt(pen.fit(WORDS.scene.left(pen.fit(nickOf(player), LEFT_NAME)), 150), CUPS_X, y, C.boneD);
    shadesLeft(view, player).forEach((count, shade) => {
      const x = 170 + shade * 32;
      drawCup([x, y, 14, 12], shade, "", { spent: count <= 0 });
      pen.txt(`${Math.max(0, count)}`, x + 17, y, count > 0 ? C.bone : C.dim);
    });
  }

  /** This player's own cups, and under them the number cubes or what the opponent has left. */
  function drawMine(): void {
    if (latest === null) return;
    const view = latest.view;
    const hand = view.mine;
    if (hand === null) return;
    const picking = editing();
    const values = picking ? draft : (hand.values ?? []);
    const sum = sumOf(values);
    const live = !pending && !latest.frozen;
    pen.txt(WORDS.scene.mine, CUPS_X, CUPS_Y - 14, C.boneD);
    if (view.phase === "arrange") pen.txt(WORDS.scene.sum(sum, latest.rules.maxSum), CUPS_X + view.rounds * CUP_PITCH - 4, CUPS_Y - 14, sum > latest.rules.maxSum ? C.crim : C.bone, "right");
    for (let index = 0; index < view.rounds; index++) {
      const box = cupBox(index);
      const value = values[index];
      const spent = hand.used[index] === true;
      const over = live && inRect(mouse, box) && ((picking && value !== undefined) || (myTurn() && !spent));
      const edge = selected === index ? C.amber : over ? C.bone : undefined;
      drawCup(box, shadeOf(index, view.rounds), value === undefined ? "" : `${value}`, { ...(edge === undefined ? {} : { edge }), spent, size: 24 });
      if (selected === index) pen.px(box[0], box[1] + box[3] + 2, box[2], 2, C.amber);
      else if (view.phase === "submit" && !TOUCH) pen.txt(`${index + 1}`, box[0] + Math.round(box[2] / 2), box[1] + box[3] + 2, spent ? C.steelDD : C.dim, "center");
    }
    if (picking) {
      pen.txt(WORDS.scene.tray, TRAY_X, TRAY_Y - 15, C.boneD);
      for (let digit = 0; digit <= latest.rules.highest; digit++) {
        const box = trayBox(digit);
        const have = latest.rules.copies - draft.filter((each) => each === digit).length;
        const can = live && have > 0 && draft.length < view.rounds;
        pen.px(box[0], box[1], box[2], box[3], can && inRect(mouse, box) ? C.bone : C.steelDD);
        pen.px(box[0] + 1, box[1] + 1, box[2] - 2, box[3] - 2, can ? C.btnH : C.btn);
        pen.txt(`${digit}`, box[0] + Math.round(box[2] / 2), box[1] + 3, can ? C.bone : C.dim, "center");
        // how many cubes of the number are left
        for (let cube = 0; cube < have; cube++) pen.px(box[0] + Math.round(box[2] / 2) - have * 3 + 1 + cube * 6, box[1] + box[3] - 6, 4, 3, C.brass);
      }
      return;
    }
    const other = view.duel.find((each) => each !== view.you);
    if (other !== undefined && view.phase !== "arrange") drawLeft(other, TRAY_Y + 6);
  }

  /** For someone who is not in the match: what both of its players have left, and the matches so far. */
  function drawWatching(): void {
    if (latest === null) return;
    const view = latest.view;
    const waits = view.you !== null && view.waiting.includes(view.you);
    // (once the game is over there is nothing to wait for, and nothing left unseen that matters)
    if (view.phase !== "ended") pen.txt(pen.fit(!waits ? WORDS.scene.watching : view.match >= latest.rules.maxMatches ? WORDS.scene.waitLast : WORDS.scene.waitNext, SCENE_W - 20), CUPS_X, CUPS_Y - 14, waits ? C.amber : C.boneD);
    if (view.phase !== "arrange") view.duel.forEach((player, row) => drawLeft(player, CUPS_Y + 2 + row * 16));
    const shown = view.matches.slice(-3);
    if (shown.length === 0) return;
    pen.txt(WORDS.scene.matches, CUPS_X, CUPS_Y + 40, C.dim);
    shown.forEach((line, row) => {
      const [a, b] = line.players;
      const words = WORDS.scene.match(line.match, pen.fit(nickOf(a), 70), pen.fit(nickOf(b), 70), line.score[0] ?? 0, line.score[1] ?? 0);
      pen.txt(pen.fit(words, SCENE_W - 28), CUPS_X, CUPS_Y + 54 + row * 14, C.boneD);
    });
  }

  /** What just happened, for the line over the middle of the scene; `null` for nothing. */
  function happening(): [string, string] | null {
    if (latest === null) return null;
    const view = latest.view;
    const short = (player: number): string => pen.fit(nickOf(player), NAME_WIDTH);
    if (latest.frozen && view.phase !== "ended") {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      return [WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), C.boneD];
    }
    if (view.phase === "arrange") return [WORDS.scene.arranging, C.boneD];
    if (view.phase === "submit") {
      const shown = view.table[0];
      return shown === undefined ? null : [WORDS.scene.shown(short(shown.player), WORDS.shade[shown.shade] ?? ""), C.bone];
    }
    if (view.phase === "reveal") {
      const line = view.lines.at(-1);
      if (line === undefined) return null;
      const values = line.plays.map((play) => play.value);
      if (line.winner === null) return [WORDS.scene.revealTie(values[0] ?? 0), C.bone];
      return [WORDS.scene.revealWin(short(line.winner), Math.max(...values), Math.min(...values)), line.winner === me() ? C.teal : C.amber];
    }
    const last = view.matches.at(-1);
    if (last === undefined) return null;
    if (last.winner === null) return [WORDS.scene.matchTied(last.score[0] ?? 0, last.match >= latest.rules.maxMatches), C.amber];
    const at = last.players.indexOf(last.winner);
    return [WORDS.scene.matchWon(short(last.winner), last.score[at] ?? 0, last.score[1 - at] ?? 0), last.winner === me() ? C.teal : C.amber];
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawTable();
    if (latest.view.mine !== null && latest.view.phase !== "ended") drawMine();
    else drawWatching();
    const said = happening();
    if (said !== null) plate(said[0], PLATE_Y, said[1]);
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
    if (view.phase === "arrange") {
      if (view.mine === null) return [WORDS.standing.arrangeOther(clock), C.bone];
      if (!editing()) return [WORDS.standing.arranged(clock), C.bone];
      const sum = sumOf(draft);
      if (sum > latest.rules.maxSum) return [WORDS.standing.arrangeOver(sum, latest.rules.maxSum, clock), C.crim];
      return [draft.length < view.rounds ? WORDS.standing.arrange(view.rounds - draft.length, clock) : WORDS.standing.arrangeFull(clock), C.amber];
    }
    if (view.phase === "submit") {
      if (!myTurn()) return [WORDS.standing.submitOther(pen.fit(nickOf(view.turn ?? -1), NAME_WIDTH), clock), C.bone];
      if (selected !== null) return [WORDS.standing.submitReady(selected + 1, clock), C.amber];
      const shown = view.table[0];
      return [shown === undefined ? WORDS.standing.submit(clock) : WORDS.standing.submitSecond(WORDS.shade[shown.shade] ?? "", clock), C.amber];
    }
    if (view.phase === "reveal") return [WORDS.standing.reveal, C.bone];
    return [WORDS.standing.between(Math.ceil((ms ?? 0) / 1000), view.matches.at(-1)?.winner === null), C.bone];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.match, view.round, view.rounds), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM && (view.phase === "arrange" || view.phase === "submit") ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order they were drawn; at its end, of their places
    const order = view.places !== null ? view.places.map((each) => each.player) : view.order;
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = view.places?.find((each) => each.player === player)?.place;
      const score = view.score.find((each) => each.player === player);
      // who the game waits for
      const awaited = view.turn === player || (view.phase === "arrange" && view.duel.includes(player) && !view.ready.includes(player));
      if (awaited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const won = view.row !== null && view.row.player === player ? ` · ${WORDS.row(view.row.wins)}` : "";
      const words = place !== undefined ? WORDS.result.verdict(true, place) : `${score !== undefined ? WORDS.points(score.points) : WORDS.waiting}${won}`;
      pen.txt(words, right, y, place !== undefined || won !== "" ? C.brass : C.boneD, "right");
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
    for (const event of view.history) {
      const who = "player" in event ? pen.fit(nickOf(event.player), LOG_NAME) : "";
      if (event.type === "match") lines.push([WORDS.log.match(event.match, event.rematch, event.match >= latest.rules.maxMatches), C.amber]);
      else if (event.type === "arranged") lines.push([WORDS.log.arranged(who, event.forced), C.boneD]);
      else if (event.type === "submitted") lines.push([WORDS.log.submitted(who, WORDS.shade[event.shade] ?? ""), C.boneD]);
      else if (event.type === "revealed") lines.push([WORDS.log.revealed(event.round, event.winner === null ? null : pen.fit(nickOf(event.winner), LOG_NAME)), C.bone]);
      else if (event.type === "won") lines.push([WORDS.log.won(pen.fit(nickOf(event.winner), LOG_NAME), event.row), C.brass]);
      else if (event.type === "tied") lines.push([WORDS.log.tied(event.match >= latest.rules.maxMatches), C.brass]);
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
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own !== undefined && own.place === 1 ? C.teal : C.bone, "left", 24);
    let named = "";
    for (const each of places) {
      const one = WORDS.result.place(each.place, pen.fit(nickOf(each.player), 50));
      const longer = named === "" ? one : `${named} · ${one}`;
      if (pen.width(longer) > RESULT_WIDTH) break;
      named = longer;
    }
    pen.txt(named, 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(view.match) : view.ended === "limit" ? WORDS.result.limit(view.match) : WORDS.ended[view.ended];
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
    if (view.phase === "arrange") {
      if (editing()) {
        const full = draft.length === view.rounds && sumOf(draft) <= latest.rules.maxSum;
        button(MAIN_RECT, WORDS.button.done, live && full, live);
        button(CLEAR_RECT, WORDS.button.clear, false, live && draft.length > 0);
        pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.arrange, CLEAR_RECT[0] - 12), 6, 246, C.dim);
      } else {
        button(MAIN_RECT, WORDS.button.redo, false, live);
        pen.txt(pen.fit(idle, MAIN_RECT[0] - 12), 6, 246, C.dim);
      }
      return;
    }
    if (myTurn()) {
      button(MAIN_RECT, WORDS.button.submit, live && selected !== null, live && selected !== null);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.submit, MAIN_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    pen.txt(idle, 6, 240, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help({ ...latest.rules, turnSeconds: latest.view.turnSeconds });
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
    waits: (): boolean => latest !== null && !latest.frozen && gradWaits(latest.view),
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

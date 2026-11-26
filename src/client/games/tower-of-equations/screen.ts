/**
 * The screen of 수식의 탑: the towers of number blocks on their positions,
 * the round's target number and target height, the buzzer and the number of
 * moves a player declares, and the blocks a challenger takes and puts down.
 *
 * Design: design/games/tower-of-equations.md. The room decides everything;
 * this screen shows what it sends and asks it to take a press of the buzzer,
 * a number of moves or a move. Nothing of the game is hidden from a player
 * but the room's own way to solve a problem, which is not sent. No block can
 * be tried out here before the challenge: a move made is a move sent.
 * Everything can be done with the pointer; the keys are another way to the
 * same.
 *
 * A block is told from another twice: by its colour, and by the sign written
 * on it with its number.
 */
import { fewest, mayDeclare, readBlock, type TowerEvent } from "../../../shared/games/tower-of-equations/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { towerWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 수식의 탑. */
export type TowerMessage = Extract<ServerMessage, { type: "game"; game: "tower-of-equations" }>;
type View = TowerMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface TowerHandlers {
  /** The player pressed the buzzer, declared or moved. Returns whether it could be sent. */
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
export interface TowerScreen {
  update(message: TowerMessage): void;
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
/** The positions: where the first stands, how far apart they are, how wide a block is, and where the towers stand on their plates. They are to the right of the page's own buttons, which lie over the top left of the scene. */
const TOWERS_X = 110;
const TOWER_STEP = 48;
const BLOCK_W = 44;
const PLATE_Y = 205;
const PLATE_H = 12;
/** How far apart the blocks of a tower are from one's top to the next's: closer where a tower is high, so that all sixteen fit on one position. */
const PITCH_MOST = 13;
const PITCH_LEAST = 11;
const TOWERS_ROOM = 176;
/** How far blocks taken up are drawn over where they stood. */
const LIFT = 4;
/** What stands to the left of the towers: the problem, the numbers of moves declared, and the moves made. */
const SIDE_X = 6;
const SIDE_W = 98;
const TARGET_Y = 34;
const HEIGHT_Y = 76;
const BIDS_Y = 122;
/** A block by its sign: the fill, a darker edge under it, and the ink of what is written on it. */
const BLOCK: Record<string, readonly [fill: string, edge: string, ink: string]> = {
  "": ["#7a55c8", "#4a3285", C.bone],
  "+": ["#c8414e", "#84242f", C.bone],
  "-": ["#2f9e6e", "#1c6646", C.bone],
  "×": ["#e0b23a", "#96711c", C.ink],
};
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 76;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a number of moves. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** Seconds blocks just moved are marked out. */
const FLASH = 1.4;
/** Seconds a first press of "forfeit" waits for the second. */
const SURE = 3;

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const SIDE_RECT: Box = [270, 238, 90, 28];
const FORFEIT_RECT: Box = [6, 244, 70, 22];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** The number of moves a player is about to declare: a button that takes one off, the number, a button that adds one. */
const LESS_RECT: Box = [6, 238, 26, 28];
const COUNT_RECT: Box = [33, 238, 44, 28];
const MORE_RECT: Box = [78, 238, 26, 28];
/** How much farther than its edge one of those two buttons takes a finger. */
const COUNT_REACH: Reach = [2, 2, 2, 4];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link TowerScreen.update}. */
export function createTowerScreen(canvas: HTMLCanvasElement, handlers: TowerHandlers): TowerScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: TowerMessage | null = null;
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
  /** The number of moves this player is about to declare. */
  let count = 3;
  /** The blocks the challenger has taken up: from which position, and how many from its top; `null` while none are. */
  let held: { from: number; count: number } | null = null;
  /** Whether blocks are flipped over as they are put down. */
  let flip = false;
  /** The position the keys are at, how many blocks from its top they reach, and whether the keys have been used: only then is it drawn. */
  let cursor = 0;
  let reach = 1;
  let keyed = false;
  /** `time` until which a second press of "forfeit" forfeits. */
  let sureUntil = -1;
  /** `time` when blocks were last moved, to which position and how many: they are marked out for a moment. */
  let movedAt = -10;
  let movedTo = 0;
  let movedCount = 0;
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
  const live = (): boolean => latest !== null && !latest.frozen && latest.view.you !== null;
  /** Whether this player may press the buzzer. */
  const mayBuzz = (): boolean => live() && latest!.view.phase === "think" && !latest!.view.out.includes(latest!.view.you as number);
  /** Whether this player pressed the buzzer and is to declare. */
  const saying = (): boolean => live() && latest!.view.phase === "say" && latest!.view.buzzer === latest!.view.you;
  /** Whether this player may declare fewer moves. */
  const mayAdd = (): boolean => live() && mayDeclare(latest!.view).includes(latest!.view.you as number);
  /** Whether this player is the challenger, moving blocks. */
  const moving = (): boolean => live() && latest!.view.phase === "move" && latest!.view.challenger === latest!.view.you;
  /** The most moves this player can declare now: fewer than the fewest declared, or the most the rules take. */
  function most(): number {
    if (latest === null) return 1;
    const least = fewest(latest.view);
    return least === null ? latest.rules.maxMoves : Math.max(1, least.moves - 1);
  }

  // ---- Where things are -----------------------------------------------------------------------------
  /** How far apart the blocks are drawn, by the highest tower. */
  function pitch(view: View): number {
    const highest = Math.max(1, ...view.towers.map((tower) => tower.length));
    return Math.max(PITCH_LEAST, Math.min(PITCH_MOST, Math.floor(TOWERS_ROOM / highest)));
  }
  const towerX = (position: number): number => TOWERS_X + position * TOWER_STEP;
  /** The top of the block `level` blocks up from a tower's plate. */
  const blockY = (view: View, level: number): number => PLATE_Y - (level + 1) * pitch(view);
  /** The position a press at `x` is over; `null` beside them. */
  function positionAt(x: number, y: number): number | null {
    if (latest === null || y < 26 || y >= PLATE_Y + PLATE_H + 3) return null;
    const position = Math.floor((x - TOWERS_X) / TOWER_STEP);
    return position >= 0 && position < latest.view.towers.length && x >= TOWERS_X ? position : null;
  }
  /** The block of the tower at `position` a press at `y` is on, counted from the plate; `null` over or under the tower. */
  function levelAt(view: View, position: number, y: number): number | null {
    const level = Math.floor((PLATE_Y - 1 - y) / pitch(view));
    return y < PLATE_Y && level >= 0 && level < view.towers[position].length ? level : null;
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
  function show(event: TowerEvent): void {
    const mine = me();
    if (event.type === "round") sfx.turn();
    else if (event.type === "buzz") {
      if (event.player !== mine) sfx.call();
    } else if (event.type === "silent") {
      if (event.player === mine) say(WORDS.say.silentYou);
      sfx.back();
    } else if (event.type === "declared") {
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "pass") {
      if (event.player !== mine) sfx.back();
    } else if (event.type === "moved") {
      movedAt = time;
      movedTo = event.move.to;
      movedCount = event.move.count;
      if (event.player !== mine) sfx.stored();
    } else if (event.type === "result") {
      if (event.result.player === null) sfx.back();
      else if (event.result.success) sfx.earn();
      else sfx.deny();
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

  function update(message: TowerMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      movedAt = -10;
      keyed = false;
      count = 3;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.round !== message.view.round || latest.view.made !== message.view.made;
    const waited = saying() || moving();
    // another step: blocks taken up for the last are put down
    if (fresh || moved) {
      held = null;
      flip = false;
      sureUntil = -1;
    }
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    count = Math.max(1, Math.min(count, most()));
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player: a number to declare, or blocks to move
    if (!waited && (saying() || moving()) && !fresh && moved) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Makes the number of moves to declare `to`, as far as it may go. */
  function setCount(to: number): void {
    if (to < 1) return deny(WORDS.say.least);
    const top = most();
    if (to > top) return deny(latest !== null && fewest(latest.view) !== null ? WORDS.say.notFewer(top + 1) : WORDS.say.most(top));
    count = to;
    sfx.move();
  }

  function send(action: unknown): void {
    if (pending) return;
    pending = handlers.act(action);
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Takes up the block `level` blocks up from the plate of `position`, and every block on it. */
  function take(position: number, level: number): void {
    if (latest === null) return;
    held = { from: position, count: latest.view.towers[position].length - level };
    cursor = position;
    sfx.move();
  }

  /** Puts the blocks taken up down on `position`: a move, which is sent. */
  function put(position: number): void {
    if (held === null) return;
    if (position === held.from && !flip) return deny(WORDS.say.sameSpot);
    send({ type: "move", from: held.from, count: held.count, to: position, flip });
  }

  /** A press on the towers while this player moves blocks: on a block to take it up, on a position to put down what is taken up. */
  function pressTowers(position: number, level: number | null): void {
    if (latest === null) return;
    if (held === null) {
      if (level === null) return latest.view.towers[position].length === 0 ? deny(WORDS.say.emptyTower) : take(position, latest.view.towers[position].length - 1);
      return take(position, level);
    }
    // on the tower the blocks were taken from: more or fewer of them, unless they are to be flipped over where they stand
    if (position === held.from && !flip) {
      if (level === null) {
        held = null;
        sfx.back();
      } else take(position, level);
      return;
    }
    put(position);
  }

  function forfeit(): void {
    if (time < sureUntil) return send({ type: "forfeit" });
    sureUntil = time + SURE;
    say(WORDS.say.forfeitSure);
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
    if (view.you === null || latest.frozen || pending) return;

    if (moving()) {
      const positions = view.towers.length;
      for (const code of keys) {
        const high = view.towers[cursor]?.length ?? 0;
        if (code === "ArrowLeft") cursor = (cursor + positions - 1) % positions;
        else if (code === "ArrowRight") cursor = (cursor + 1) % positions;
        else if (code.startsWith("Num:") && Number(code.slice(4)) >= 1 && Number(code.slice(4)) <= positions) cursor = Number(code.slice(4)) - 1;
        else if (code === "ArrowUp") reach = Math.min(Math.max(1, high), reach + 1);
        else if (code === "ArrowDown") reach = Math.max(1, reach - 1);
        else if (code === "KeyF") {
          flip = !flip;
          sfx.swap();
        } else if (code === "Escape" || code === "Backspace") {
          if (held !== null) sfx.back();
          held = null;
        } else if (code === "Space" || code === "Enter" || code === "NumpadEnter") {
          if (held !== null) put(cursor);
          else if (high === 0) deny(WORDS.say.emptyTower);
          else take(cursor, high - Math.min(high, reach));
        } else continue;
        keyed = true;
        if (held === null) reach = Math.max(1, Math.min(reach, Math.max(1, view.towers[cursor]?.length ?? 1)));
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) {
          flip = !flip;
          sfx.swap();
        } else if (hits(p, SIDE_RECT)) {
          if (held !== null) sfx.back();
          held = null;
        } else if (hits(p, FORFEIT_RECT, 3)) forfeit();
        else {
          const position = positionAt(p.x, p.y);
          if (position !== null) {
            keyed = false;
            pressTowers(position, levelAt(view, position, p.y));
          }
        }
      }
      return;
    }

    // the number of moves, which can be set before the buzzer is pressed
    const counting = mayBuzz() || saying() || mayAdd();
    if (!counting) return;
    for (const code of keys) {
      if (code.startsWith("Num:")) setCount(Number(code.slice(4)) === 0 ? 10 : Number(code.slice(4)));
      else if (code === "ArrowUp" || code === "ArrowRight") setCount(count + 1);
      else if (code === "ArrowDown" || code === "ArrowLeft") setCount(count - 1);
      else if (code === "Space" && mayBuzz()) send({ type: "buzz" });
      else if ((code === "Enter" || code === "NumpadEnter") && mayBuzz()) send({ type: "buzz" });
      else if ((code === "Enter" || code === "NumpadEnter") && (saying() || mayAdd())) send({ type: "declare", moves: count });
      else if (code === "KeyP" && mayAdd()) send({ type: "pass" });
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (hits(p, LESS_RECT, COUNT_REACH)) setCount(count - 1);
      else if (hits(p, MORE_RECT, COUNT_REACH)) setCount(count + 1);
      else if (hits(p, MAIN_RECT)) send(mayBuzz() ? { type: "buzz" } : { type: "declare", moves: count });
      else if (hits(p, SIDE_RECT) && mayAdd()) send({ type: "pass" });
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
      const mine = saying() || moving() ? left(latest.clock.turn) : null;
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
  /** A plate of words over the towers, clear of what stands to their left. */
  function plate(words: string, y: number, colour: string): void {
    const room = SCENE_W - TOWERS_X - 4;
    const width = Math.min(room, Math.max(100, pen.width(words) + 16));
    const x = Math.round(TOWERS_X + room / 2 - width / 2);
    pen.px(x, y, width, 17, C.ink);
    pen.txt(pen.fit(words, width - 8), x + Math.round(width / 2), y + 2, colour, "center");
  }

  function button(rect: Box, label: string, lit: boolean, alive: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : alive && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : alive ? C.bone : C.dim, "center");
  }

  /** The edge of a box, a pixel thick. */
  function frame(x: number, y: number, w: number, h: number, colour: string): void {
    pen.px(x, y, w, 1, colour);
    pen.px(x, y + h - 1, w, 1, colour);
    pen.px(x, y, 1, h, colour);
    pen.px(x + w - 1, y, 1, h, colour);
  }

  /** One block with its top left at (`x`, `y`), `high` pixels high with the darker edge under it. What is written on it is eleven pixels high, from the line it is drawn at less one. */
  function drawBlock(block: string, x: number, y: number, high: number): void {
    const read = readBlock(block);
    const [fill, edge, ink] = BLOCK[read?.sign ?? ""] ?? BLOCK[""];
    pen.px(x, y, BLOCK_W, high, edge);
    pen.px(x, y, BLOCK_W, high - 1, fill);
    pen.txt(block, x + BLOCK_W / 2, y + 1, ink, "center");
  }

  function drawTowers(): void {
    if (latest === null) return;
    const view = latest.view;
    const step = pitch(view);
    const high = step;
    const mine = moving();
    const flash = time - movedAt < FLASH && Math.floor(time * 6) % 2 === 0;
    // what the pointer or the keys are on, while blocks can be taken: the block and those on it
    let over: { position: number; level: number } | null = null;
    if (mine && held === null && !pending) {
      if (keyed) {
        const tall = view.towers[cursor]?.length ?? 0;
        if (tall > 0) over = { position: cursor, level: tall - Math.min(tall, reach) };
      } else if (mouse.x >= 0) {
        const position = positionAt(mouse.x, mouse.y);
        const level = position === null ? null : levelAt(view, position, mouse.y);
        if (position !== null && level !== null) over = { position, level };
      }
    }
    const target = mine && held !== null && !pending ? (keyed ? cursor : mouse.x >= 0 ? positionAt(mouse.x, mouse.y) : null) : null;
    view.towers.forEach((tower, position) => {
      const x = towerX(position) + 1;
      // the plate a tower stands on, with the number the keys know the position by
      const lit = target === position && (position !== held?.from || flip);
      pen.px(x - 1, PLATE_Y, BLOCK_W + 2, PLATE_H, lit ? C.amber : C.steelD);
      pen.px(x, PLATE_Y + 1, BLOCK_W, PLATE_H - 2, lit ? "#3a2a12" : C.steelDD);
      pen.txt(`${position + 1}`, x + BLOCK_W / 2, PLATE_Y + 1, lit ? C.amber : C.boneD, "center");
      const lifted = held !== null && held.from === position ? held.count : 0;
      const standing = tower.slice(0, tower.length - lifted);
      standing.forEach((block, level) => drawBlock(block, x, blockY(view, level), high));
      // the blocks just moved, marked out for a moment
      if (flash && movedTo === position && lifted === 0) {
        const from = Math.max(0, tower.length - movedCount);
        frame(x - 1, blockY(view, tower.length - 1) - 1, BLOCK_W + 2, (tower.length - from) * step + 1, C.bone);
      }
      if (over !== null && over.position === position) frame(x - 1, blockY(view, tower.length - 1) - 1, BLOCK_W + 2, (tower.length - over.level) * step + 1, C.bone);
      if (lifted === 0) return;
      // the blocks taken up: over where they stood, in the order they will lie in once put down
      const taken = tower.slice(tower.length - lifted);
      const shown = flip ? [...taken].reverse() : taken;
      shown.forEach((block, at) => drawBlock(block, x, blockY(view, standing.length + at) - LIFT, high));
      frame(x - 1, blockY(view, tower.length - 1) - LIFT - 1, BLOCK_W + 2, lifted * step + 1, C.amber);
    });
  }

  /** What stands to the left of the towers. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.txt(WORDS.side.target, SIDE_X, TARGET_Y, C.boneD);
    pen.txt(`${view.target}`, SIDE_X, TARGET_Y + 13, C.amber, "left", 24);
    pen.txt(WORDS.side.height, SIDE_X, HEIGHT_Y, C.boneD);
    pen.txt(WORDS.side.floors(view.height), SIDE_X, HEIGHT_Y + 13, C.amber, "left", 24);
    pen.px(SIDE_X, BIDS_Y - 4, SIDE_W, 1, C.steelDD);
    // the numbers of moves declared, the fewest last
    view.bids.slice(-4).forEach((bid, at) => {
      const y = BIDS_Y + at * 13;
      const least = fewest(view)?.player === bid.player;
      const tag = view.bids[0]?.player === bid.player ? WORDS.side.first : WORDS.side.more;
      const words = WORDS.status.bid(bid.moves);
      pen.txt(words, SIDE_X + SIDE_W, y, least ? C.amber : C.dim, "right");
      pen.txt(pen.fit(`${tag} ${nickOf(bid.player)}`, SIDE_W - pen.width(words) - 4), SIDE_X, y, least ? C.bone : C.dim);
    });
    const least = fewest(view);
    if (view.phase === "move" && least !== null) pen.txt(WORDS.side.made(view.made, least.moves), SIDE_X, BIDS_Y + 56, C.teal);
    if (view.result !== null && view.result.known !== null) pen.txt(pen.fit(WORDS.side.known(view.result.known), SIDE_W), SIDE_X, BIDS_Y + 70, C.boneD);
  }

  /** How the round came out, in words; `null` where it has not yet. */
  function outcome(view: View): [string, string] | null {
    const result = view.result;
    if (result === null) return null;
    if (result.player === null) return [WORDS.outcome.nobody, C.boneD];
    const who = pen.fit(nickOf(result.player), 90);
    return result.success ? [WORDS.outcome.success(who, result.points), C.teal] : [WORDS.outcome.failure(who, result.points, WORDS.failed[result.reason ?? "wrong"]), C.crim];
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawSide();
    drawTowers();
    const result = view.result;
    if (result !== null && (view.phase === "result" || view.phase === "ended")) {
      if (result.player === null) plate(WORDS.outcome.nobody, 30, C.boneD);
      else plate(WORDS.outcome.short(result.success, result.points), 30, result.success ? C.teal : C.crim);
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
    const least = fewest(view);
    if (view.phase === "think") {
      if (view.you === null) return [WORDS.standing.thinkOther(clock), C.bone];
      return mayBuzz() ? [WORDS.standing.think(clock), C.amber] : [WORDS.standing.thinkOut(clock), C.boneD];
    }
    if (view.phase === "say") return saying() ? [WORDS.standing.say(clock), C.amber] : [WORDS.standing.sayOther(pen.fit(nickOf(view.buzzer ?? -1), 120), clock), C.bone];
    if (view.phase === "more") return mayAdd() ? [WORDS.standing.more(clock), C.amber] : [view.you === null ? WORDS.standing.moreOther(clock) : WORDS.standing.moreWait(clock), C.bone];
    if (view.phase === "move") {
      if (!moving()) return [WORDS.standing.moveOther(pen.fit(nickOf(view.challenger ?? -1), 120), view.made, least?.moves ?? 0, clock), C.bone];
      return held === null ? [WORDS.standing.move(view.made, least?.moves ?? 0, clock), C.amber] : [WORDS.standing.moveHeld(held.count, flip, clock), C.teal];
    }
    return outcome(view) ?? [WORDS.standing.result(clock), C.boneD];
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
      const waited = (view.phase === "say" && view.buzzer === player) || (view.phase === "move" && view.challenger === player);
      // who the game waits for
      if (waited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const points = WORDS.points(view.scores.find((each) => each.player === player)?.points ?? 0);
      pen.txt(points, right, y, C.brass, "right");
      right -= pen.width(points) + 5;
      const bid = view.bids.find((each) => each.player === player);
      const status =
        view.phase === "ended" || view.phase === "result" || view.phase === "think"
          ? view.out.includes(player) && view.phase === "think"
            ? WORDS.status.out
            : ""
          : view.buzzer === player
            ? WORDS.status.saying
            : view.challenger === player
              ? WORDS.status.moving
              : bid !== undefined
                ? WORDS.status.bid(bid.moves)
                : view.out.includes(player)
                  ? WORDS.status.out
                  : view.passed.includes(player)
                    ? WORDS.status.passed
                    : "";
      if (status !== "") {
        pen.txt(status, right, y, waited ? C.amber : bid !== undefined ? C.teal : C.dim, "right");
        right -= pen.width(status) + 4;
      }
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
      if (event.type === "round") lines.push([WORDS.log.round(event.round, event.target, event.height), C.amber]);
      else if (event.type === "buzz") lines.push([WORDS.log.buzz(short(event.player)), C.bone]);
      else if (event.type === "silent") lines.push([WORDS.log.silent(short(event.player)), C.dim]);
      else if (event.type === "declared") lines.push([WORDS.log.declared(short(event.player), event.moves, event.first), C.bone]);
      else if (event.type === "pass") lines.push([WORDS.log.pass(short(event.player)), C.dim]);
      else if (event.type === "moved") lines.push([WORDS.log.moved(event.made, event.move.count, event.move.from + 1, event.move.to + 1, event.move.flip), C.boneD]);
      else if (event.type === "result") {
        const result = event.result;
        if (result.player === null) lines.push([WORDS.log.nobody, C.dim]);
        else if (result.success) lines.push([WORDS.log.success(short(result.player), result.points), C.teal]);
        else lines.push([WORDS.log.failure(short(result.player), result.points, WORDS.failedShort[result.reason ?? "wrong"]), C.crim]);
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
    const pointsOf = (player: number): number => view.scores.find((each) => each.player === player)?.points ?? 0;
    const named = places.map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 56), pointsOf(each.player))).join(" · ");
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(view.round) : WORDS.ended[view.ended];
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
    const alive = !pending && !latest.frozen;
    if (moving()) {
      button(FORFEIT_RECT, WORDS.button.forfeit, time < sureUntil, alive);
      pen.txt(pen.fit(TOUCH ? "" : WORDS.keys.move, SIDE_RECT[0] - FORFEIT_RECT[0] - FORFEIT_RECT[2] - 12), FORFEIT_RECT[0] + FORFEIT_RECT[2] + 6, 248, C.dim);
      button(SIDE_RECT, WORDS.button.drop, false, alive && held !== null);
      button(MAIN_RECT, WORDS.button.flip(flip), flip, alive);
      return;
    }
    const buzz = mayBuzz();
    const first = saying();
    const add = mayAdd();
    if (buzz || first || add) {
      button(LESS_RECT, "-", false, alive && count > 1);
      button(MORE_RECT, "+", false, alive && count < most());
      pen.px(COUNT_RECT[0], COUNT_RECT[1], COUNT_RECT[2], COUNT_RECT[3], first || add ? C.amber : C.steelDD);
      pen.px(COUNT_RECT[0] + 1, COUNT_RECT[1] + 1, COUNT_RECT[2] - 2, COUNT_RECT[3] - 2, C.btn);
      pen.txt(WORDS.status.bid(count), COUNT_RECT[0] + COUNT_RECT[2] / 2, COUNT_RECT[1] + 7, C.bone, "center");
      pen.txt(pen.fit(TOUCH ? "" : WORDS.keys.count, SIDE_RECT[0] - MORE_RECT[0] - MORE_RECT[2] - 12), MORE_RECT[0] + MORE_RECT[2] + 6, 246, C.dim);
      if (add) button(SIDE_RECT, WORDS.button.pass, false, alive);
      button(MAIN_RECT, buzz ? WORDS.button.buzz : first ? WORDS.button.declare(count) : WORDS.button.fewer(count), alive, alive);
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
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    verdict,
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && towerWaits(latest.view),
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

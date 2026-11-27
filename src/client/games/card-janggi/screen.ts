/**
 * The screen of 카드 장기: the board with its pieces, each player's movement
 * cards, and the squares the card face up takes a piece to.
 *
 * Design: design/games/card-janggi.md. The room decides everything; this
 * screen shows what it sends and asks it to take an order of cards, a move
 * or a resignation. The order the opponent's cards lie in is not sent, so
 * nothing hidden is here to be drawn: of their cards the screen has those
 * used, the one face up, and how many lie face down. Where a piece can go is
 * found here by the rules the room holds a move to (`rules.ts`). Everything
 * can be done with the pointer; the keys are another way to the same.
 *
 * A piece is told from the other side's twice, by its colour and by its
 * shape: the left's are round, the right's square. A great piece is larger
 * and has a crown. A card is drawn as the show draws one: the piece in the
 * middle of five squares by five, and the squares it can go to lit.
 */
import { EMPTY, PIECES, movesOf, sideOf, type JanggiEvent } from "../../../shared/games/card-janggi/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { janggiWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C, shade } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 카드 장기. */
export type JanggiMessage = Extract<ServerMessage, { type: "game"; game: "card-janggi" }>;

/** What the screen asks of whoever owns the connection. */
export interface JanggiHandlers {
  /** The player laid cards, moved or resigned. Returns whether it could be sent. */
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
export interface JanggiScreen {
  update(message: JanggiMessage): void;
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
/** The board: its top left, and how many pixels the widest and the highest it may be. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 118;
const BOARD_Y = 36;
const BOARD_W = 180;
const BOARD_H = 152;
/** What stands to the left of the board: the two players and their wins, the round, and both players' cards. */
const SIDE_X = 6;
const SIDE_W = 100;
const LEGEND_Y = 34;
const ROUND_Y = 68;
const THEIRS_Y = 96;
const MINE_Y = 134;
const DOES_Y = 172;
/** A card as it is drawn small: a square of this many pixels, one beside another this far apart. */
const CARD = 19;
const CARD_PITCH = 20;
/** The two sides' colours: the left's and the right's, a piece's own and its rim's. */
const SIDE_FILL = ["#e2504a", "#4a8fe8"] as const;
const SIDE_RIM = ["#7a2020", "#1f3f7a"] as const;
/** A square of the board, its edge, a square a great piece began on, and the two squares of the move made last. */
const TILE = "#3b4158";
const TILE_EDGE = "#2a2f44";
const TILE_HOME = "#4a4a3e";
const TILE_MOVED = "#565c7c";
/** The widest a name is drawn in the list of players, and the least of it a line of the log keeps, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 24;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for their cards. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** Seconds a resignation waits for its second press. */
const SURE = 3;

/** The buttons: a card to lay, in the bar; the two under the cards laid so far, left of the board; and the one that resigns. */
const cardRect = (index: number): Box => [6 + index * 94, 238, 92, 28];
const MAIN_RECT: Box = [6, 172, 100, 24];
const CLEAR_RECT: Box = [6, 198, 100, 20];
const RESIGN_RECT: Box = [376, 238, 100, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link JanggiScreen.update}. */
export function createJanggiScreen(canvas: HTMLCanvasElement, handlers: JanggiHandlers): JanggiScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: JanggiMessage | null = null;
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
  /** The cards picked so far, in the order they will be used, and not sent yet. */
  let order: string[] = [];
  /** The square of the piece picked to be moved; `null` while none is. */
  let picked: number | null = null;
  /** The square the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** Whether a resignation waits for its second press, and for how many seconds more. */
  let sureT = 0;
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
  const handOf = (player: number | null) => latest?.view.hands.find((hand) => hand.player === player);
  /** Whether this player is laying their cards: at a round's beginning, or again during it. */
  function arranging(): boolean {
    if (!live()) return false;
    const view = latest!.view;
    if (view.phase === "arrange") return handOf(view.you)?.ready === false;
    return view.phase === "rearrange" && view.arranger === view.you;
  }
  /** Whether this player is to choose the move waited for: their own, or their opponent's when the opponent's time ran out. */
  const moving = (): boolean => live() && (latest!.view.phase === "move" || latest!.view.phase === "proxy") && latest!.view.mover === latest!.view.you;
  const cardNames = (): string[] => Object.keys(latest?.rules.cards ?? {});
  const pointsOf = (player: number): number => latest?.view.wins.find((each) => each.player === player)?.wins ?? 0;
  /** The card that moves a piece now: the one face up of the player whose move it is. */
  const cardNow = (): string | null => handOf(latest?.view.turn ?? null)?.current ?? null;
  /** The moves there are now, of the pieces of the player whose move it is. */
  function movesNow(): { from: number; to: number }[] {
    if (latest === null || latest.view.turn === null) return [];
    const card = cardNow();
    return card === null ? [] : movesOf(latest.view.board, latest.view.sides.indexOf(latest.view.turn), card, latest.rules);
  }

  // ---- Where things are on the board ----------------------------------------------------------------
  /** How many pixels a square is across and where the board's first square is. */
  function grid(): { width: number; height: number; pitch: number; x: number; y: number } {
    const { width, height } = latest?.view.board ?? { width: 6, height: 5 };
    const pitch = Math.floor(Math.min(BOARD_W / width, BOARD_H / height));
    return { width, height, pitch, x: BOARD_X + Math.floor((BOARD_W - pitch * width) / 2), y: BOARD_Y + Math.floor((BOARD_H - pitch * height) / 2) };
  }
  /** The middle of square `cell`, in pixels. */
  function pointOf(cell: number): [number, number] {
    const g = grid();
    const half = Math.floor(g.pitch / 2);
    return [g.x + (cell % g.width) * g.pitch + half, g.y + Math.floor(cell / g.width) * g.pitch + half];
  }
  /** The square a press at (`x`, `y`) is on; `null` off the board. */
  function cellAt(x: number, y: number): number | null {
    const g = grid();
    const [cx, cy] = [Math.floor((x - g.x) / g.pitch), Math.floor((y - g.y) / g.pitch)];
    return cx < 0 || cx >= g.width || cy < 0 || cy >= g.height ? null : cy * g.width + cx;
  }
  /** A square as the log names it: a letter across, a number down from the top. */
  const squareName = (cell: number): string => `${"abcdefghijkl"[cell % grid().width] ?? "?"}${Math.floor(cell / grid().width) + 1}`;

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: JanggiEvent): void {
    const mine = me();
    if (event.type === "arranged") {
      if (event.forced && event.player === mine) say(WORDS.say.arrangedForYou);
      if (event.player !== mine || event.forced) sfx.pick();
    } else if (event.type === "moved") {
      if (event.captured !== null && mine !== null) say(event.by === mine || (event.by === null && event.player === mine) ? WORDS.say.captured : WORDS.say.lost);
      if (event.captured !== null) sfx.chip();
      else if (event.by !== mine) sfx.stored();
    } else if (event.type === "late") {
      if (mine !== null) say(event.player === mine ? WORDS.say.lateYou : WORDS.say.lateThem);
      sfx.alarm();
    } else if (event.type === "stuck") {
      const card = WORDS.cardNamed[event.card] ?? event.card;
      if (mine !== null) say(event.player === mine ? WORDS.say.stuckYou(card) : WORDS.say.stuckThem(card));
      sfx.back();
    } else if (event.type === "round-over") {
      // the bar says who has the round: a word about the move that ended it gives way
      noteT = 0;
      if (event.winner === mine && mine !== null) sfx.earn();
      else sfx.back();
    } else if (event.type === "ended") {
      if (latest?.view.places !== null && latest?.view.winner === mine && mine !== null) sfx.win();
      else sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: JanggiMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      keyed = false;
      cursor = 0;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.round !== message.view.round || latest.view.turn !== message.view.turn || latest.view.moves !== message.view.moves;
    const waited = arranging() || moving();
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    // another step: what was picked for the last is put away
    if (fresh || moved) {
      picked = null;
      sureT = 0;
      noteT = 0;
      if (!arranging()) order = [];
    }
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player
    if (!waited && (arranging() || moving()) && !fresh && moved) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** How many cards this player is laying. */
  const dueNow = (): number => handOf(me())?.due ?? 0;

  /** Picks `card` as the next to be used, or takes it out of the order where it is in it. */
  function pick(card: string): void {
    if (order.includes(card)) {
      order = order.filter((each) => each !== card);
      sfx.back();
      return;
    }
    if (order.length >= dueNow()) return deny(WORDS.refused["bad-order"]);
    order = [...order, card];
    sfx.move();
  }

  function sendOrder(): void {
    if (latest === null || pending) return;
    if (order.length < dueNow()) return deny(WORDS.say.pickMore(dueNow() - order.length));
    pending = handlers.act({ type: "arrange", order: [...order] });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** A press on `cell` while a move is this player's to choose: picks a piece that can move, or moves the piece picked there. */
  function pressBoard(cell: number): void {
    if (latest === null || pending) return;
    const moves = movesNow();
    if (picked !== null && moves.some((move) => move.from === picked && move.to === cell)) {
      pending = handlers.act({ type: "move", from: picked, to: cell });
      if (!pending) return say(WORDS.notSent);
      picked = null;
      sfx.pick();
      return;
    }
    if (picked === cell) {
      picked = null;
      sfx.back();
      return;
    }
    const side = latest.view.turn === null ? -1 : latest.view.sides.indexOf(latest.view.turn);
    if (sideOf(latest.view.board.cells[cell]) === side && side >= 0) {
      if (!moves.some((move) => move.from === cell)) return deny(WORDS.refused["cannot-reach"]);
      picked = cell;
      sfx.move();
      return;
    }
    if (picked !== null) return deny(WORDS.refused["cannot-reach"]);
    deny(WORDS.refused["not-your-piece"]);
  }

  /** Resigns the round at the second press. */
  function resign(): void {
    if (latest === null || pending) return;
    if (sureT <= 0) {
      sureT = SURE;
      say(WORDS.say.resignAgain);
      sfx.move();
      return;
    }
    sureT = 0;
    pending = handlers.act({ type: "resign" });
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
    if (view.you === null || latest.frozen || pending) return;

    if (arranging()) {
      const cards = cardNames();
      for (const code of keys) {
        if (code.startsWith("Num:") && cards[Number(code.slice(4)) - 1] !== undefined) pick(cards[Number(code.slice(4)) - 1]);
        else if (code === "Enter" || code === "NumpadEnter") sendOrder();
        else if (code === "Backspace") order = order.slice(0, -1);
        else if (code === "Escape") order = [];
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        const at = cards.findIndex((_, index) => hits(p, cardRect(index)));
        if (at >= 0) pick(cards[at]);
        else if (hits(p, MAIN_RECT)) sendOrder();
        else if (hits(p, CLEAR_RECT)) {
          if (order.length > 0) sfx.back();
          order = [];
        }
      }
      return;
    }

    if (!moving()) return;
    const { width, height } = grid();
    for (const code of keys) {
      const [x, y] = [cursor % width, Math.floor(cursor / width)];
      if (code === "ArrowLeft" && x > 0) cursor -= 1;
      else if (code === "ArrowRight" && x < width - 1) cursor += 1;
      else if (code === "ArrowUp" && y > 0) cursor -= width;
      else if (code === "ArrowDown" && y < height - 1) cursor += width;
      else if (code === "Space" || code === "Enter" || code === "NumpadEnter") pressBoard(cursor);
      else if (code === "Escape" || code === "Backspace") picked = null;
      // a round is resigned in one's own turn, not while moving for the other
      else if (code === "KeyX" && view.phase === "move") resign();
      else continue;
      if (code.startsWith("Arrow") || code === "Space") keyed = true;
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      const cell = cellAt(p.x, p.y);
      if (view.phase === "move" && hits(p, RESIGN_RECT)) resign();
      else if (cell !== null) {
        keyed = false;
        pressBoard(cell);
      }
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    if (sureT > 0) sureT -= dt;
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
      const mine = arranging() || moving() ? left(latest.clock.turn) : null;
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

  function button(rect: Box, label: string, lit: boolean, on: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : on && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : on ? C.bone : C.dim, "center");
  }

  /** A piece of `side`, great or small, its middle at (`x`, `y`): the left's round, the right's square. */
  function piece(x: number, y: number, side: number, great: boolean, scale = 1): void {
    const r = Math.round((great ? 11 : 7) * scale);
    const [fill, rim] = [SIDE_FILL[side] ?? C.steel, SIDE_RIM[side] ?? C.steelDD];
    if (side === 0) {
      pen.ell(x, y, r, r, rim);
      pen.ell(x, y, r - 1, r - 1, fill);
    } else {
      pen.px(x - r, y - r, r * 2 + 1, r * 2 + 1, rim);
      pen.px(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1, fill);
    }
    if (!great || r < 6) return;
    // a crown: a band and three points
    pen.px(x - 4, y, 9, 3, C.brassH);
    for (const dx of [-4, 0, 4]) pen.px(x + dx, y - 3, 1, 3, C.brassH);
    pen.px(x - 4, y + 2, 9, 1, C.brassD);
  }

  /** The edge of a box `r` pixels round (`x`, `y`), a pixel thick. */
  function ring(x: number, y: number, r: number, colour: string): void {
    const side = r * 2 + 1;
    pen.px(x - r, y - r, side, 1, colour);
    pen.px(x - r, y + r, side, 1, colour);
    pen.px(x - r, y - r, 1, side, colour);
    pen.px(x + r, y - r, 1, side, colour);
  }

  /**
   * A card, small: the piece in the middle of five squares by five and the
   * squares it can go to lit, as `how` says: face up, the one in use, used,
   * or face down (then no squares are drawn, and `card` may be anything).
   */
  function drawCard(x: number, y: number, card: string, how: "open" | "now" | "used" | "down"): void {
    pen.px(x, y, CARD, CARD, how === "now" ? C.amber : C.steelDD);
    pen.px(x + 1, y + 1, CARD - 2, CARD - 2, how === "down" ? C.steelD : how === "used" ? C.ink : C.btnH);
    if (how === "down") {
      pen.px(x + 6, y + 6, 7, 7, C.steelDD);
      pen.px(x + 8, y + 8, 3, 3, C.steel);
      return;
    }
    const lit = how === "used" ? C.steelD : C.bone;
    for (const [dx, dy] of latest?.rules.cards[card] ?? []) {
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) pen.px(x + 8 + dx * 3, y + 8 + dy * 3, 3, 3, lit);
    }
    pen.px(x + 8, y + 8, 3, 3, how === "used" ? C.dim : C.amber);
  }

  function drawBoard(): void {
    if (latest === null) return;
    const view = latest.view;
    const g = grid();
    const cells = view.board.cells;
    const half = Math.floor(g.pitch / 2);
    [...cells].forEach((_, at) => {
      const [x, y] = [g.x + (at % g.width) * g.pitch, g.y + Math.floor(at / g.width) * g.pitch];
      const home = view.homes.indexOf(at);
      pen.px(x, y, g.pitch, g.pitch, TILE_EDGE);
      // (the two squares of the move made last are lighter)
      const moved = view.last !== null && (view.last.from === at || view.last.to === at);
      pen.px(x + 1, y + 1, g.pitch - 1, g.pitch - 1, moved ? TILE_MOVED : home >= 0 ? TILE_HOME : TILE);
      // the square a great piece began on: marked in its side's colour at the corners
      if (home >= 0) {
        for (const [cx, cy] of [[2, 2], [g.pitch - 5, 2], [2, g.pitch - 5], [g.pitch - 5, g.pitch - 5]]) pen.px(x + cx, y + cy, 3, 3, shade(SIDE_FILL[home], 0.8));
      }
    });
    // the squares, by the names the log gives them
    for (let cx = 0; cx < g.width; cx++) pen.txt("abcdefghijkl"[cx] ?? "", g.x + cx * g.pitch + half, g.y + g.height * g.pitch, C.dim, "center");
    for (let cy = 0; cy < g.height; cy++) pen.txt(`${cy + 1}`, g.x - 3, g.y + cy * g.pitch + half - 6, C.dim, "right");
    [...cells].forEach((cell, at) => {
      const side = sideOf(cell);
      if (cell === EMPTY || side < 0) return;
      const [x, y] = pointOf(at);
      piece(x, y, side, cell === PIECES[side].great);
    });
    if (!moving()) return;
    const moves = movesNow();
    // the pieces that can move; or, with one picked, where it can go
    if (picked === null) {
      for (const from of new Set(moves.map((move) => move.from))) {
        const [x, y] = pointOf(from);
        if (Math.floor(time * 3) % 2 === 0) ring(x, y, half - 2, C.amberD);
      }
    } else {
      const [px, py] = pointOf(picked);
      ring(px, py, half - 2, C.amber);
      for (const move of moves) {
        if (move.from !== picked) continue;
        const [x, y] = pointOf(move.to);
        if (cells[move.to] === EMPTY) pen.px(x - 2, y - 2, 5, 5, C.amber);
        else ring(x, y, half - 2, C.crim);
      }
    }
    const over = keyed ? cursor : mouse.x >= 0 ? cellAt(mouse.x, mouse.y) : null;
    if (over !== null && !pending) {
      const [x, y] = pointOf(over);
      ring(x, y, half - 1, C.bone);
    }
  }

  /** One player's cards in a row, as this screen may show them: all of them to their own player, to anyone else those turned over. */
  function drawHand(player: number, y: number, label: string): void {
    if (latest === null) return;
    const hand = handOf(player);
    if (hand === undefined) return;
    pen.txt(pen.fit(label, SIDE_W), SIDE_X, y, C.boneD);
    const mine = player === me() ? latest.view.mine : null;
    const row = y + 14;
    if (player === me() && arranging()) {
      // being laid: the cards picked so far, and the places still to fill
      for (let at = 0; at < hand.due; at++) {
        if (order[at] !== undefined) drawCard(SIDE_X + at * CARD_PITCH, row, order[at], "open");
        else ring(SIDE_X + at * CARD_PITCH + 9, row + 9, 9, C.steelDD);
      }
      return;
    }
    if (!hand.ready) return;
    if (mine !== null && mine.length > 0 && latest.view.phase !== "arrange") {
      mine.forEach((card, at) => drawCard(SIDE_X + at * CARD_PITCH, row, card, at < hand.used.length ? "used" : at === hand.used.length ? "now" : "open"));
      // (those after the one in use lie face down to the other player: a mark under each)
      for (let at = hand.used.length + 1; at < mine.length; at++) pen.px(SIDE_X + at * CARD_PITCH + 7, row + CARD + 1, 5, 1, C.steelD);
      return;
    }
    if (mine !== null && mine.length > 0) {
      mine.forEach((card, at) => drawCard(SIDE_X + at * CARD_PITCH, row, card, "open"));
      return;
    }
    const shown = [...hand.used.map((card) => [card, "used"] as const), ...(hand.current === null ? [] : [[hand.current, "now"] as const])];
    shown.forEach(([card, how], at) => drawCard(SIDE_X + at * CARD_PITCH, row, card, how));
    for (let at = 0; at < hand.hidden; at++) drawCard(SIDE_X + (shown.length + at) * CARD_PITCH, row, "", "down");
  }

  /** What stands to the left of the board. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    const mine = me();
    view.sides.forEach((player, side) => {
      const y = LEGEND_Y + side * 14;
      const waited = view.phase === "arrange" ? handOf(player)?.ready === false : view.phase === "rearrange" ? view.arranger === player : view.mover === player;
      if (waited) pen.px(SIDE_X - 3, y + 2, 2, 9, C.amber);
      piece(SIDE_X + 5, y + 6, side, false, 0.6);
      // a win a square, as many squares as take the game
      const wins = pointsOf(player);
      for (let n = 0; n < rules.goal; n++) pen.px(SIDE_X + SIDE_W - (rules.goal - n) * 8, y + 3, 6, 6, n < wins ? C.teal : C.steelDD);
      pen.txt(pen.fit(nickOf(player), SIDE_W - rules.goal * 8 - 18), SIDE_X + 13, y, mine === player ? C.amber : C.bone);
    });
    pen.px(SIDE_X, ROUND_Y - 4, SIDE_W, 1, C.steelDD);
    const round = WORDS.side.round(view.round, rules.rounds);
    pen.txt(pen.fit(round, SIDE_W), SIDE_X, ROUND_Y, C.bone);
    if (view.moves > 0) pen.txt(pen.fit(WORDS.side.moves(view.moves), SIDE_W - pen.width(round) - 4), SIDE_X + SIDE_W, ROUND_Y, C.boneD, "right");
    // the cards: the other player's above, this player's below; for someone watching, the left's and the right's
    const below = mine ?? view.sides[0];
    const above = view.players.find((each) => each !== below) ?? below;
    drawHand(above, THEIRS_Y, mine === null ? WORDS.side.of(pen.fit(nickOf(above), 50)) : WORDS.side.theirs);
    drawHand(below, MINE_Y, mine === null ? WORDS.side.of(pen.fit(nickOf(below), 50)) : WORDS.side.mine);
    // while this player lays their cards: the buttons that take the order, and that begin it again
    if (arranging()) {
      const on = !pending;
      button(MAIN_RECT, WORDS.button.confirm, on && order.length === dueNow(), on);
      button(CLEAR_RECT, WORDS.button.clear, false, on && order.length > 0);
    }
    // what the card that moves a piece now does
    const card = cardNow();
    if (card !== null && (view.phase === "move" || view.phase === "proxy")) {
      pen.txt(pen.fit(WORDS.cardNamed[card] ?? card, SIDE_W), SIDE_X, DOES_Y, C.amber);
      pen.txt(pen.fit(WORDS.cardDoes[card] ?? "", SIDE_W), SIDE_X, DOES_Y + 14, C.boneD);
    }
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
    const who = (player: number | null): string => pen.fit(nickOf(player ?? -1), 90);
    const all = cardNames().length;
    const card = cardNow();
    const named = card === null ? "" : (WORDS.cardNamed[card] ?? card);
    if (view.phase === "arrange") {
      if (view.you === null) return [WORDS.standing.arrangeOther(clock), C.bone];
      if (!arranging()) return [WORDS.standing.arrangeWait(clock), C.bone];
      const blank = dueNow() - order.length;
      return blank > 0 ? [WORDS.standing.arrange(dueNow(), all, blank, clock), C.amber] : [WORDS.standing.arrangeReady(clock), C.teal];
    }
    if (view.phase === "rearrange") {
      if (view.you === null) return [WORDS.standing.rearrangeOther(who(view.arranger), clock), C.bone];
      if (!arranging()) return [WORDS.standing.rearrangeWait(clock), C.bone];
      const blank = dueNow() - order.length;
      return blank > 0 ? [WORDS.standing.rearrange(all, blank, clock), C.amber] : [WORDS.standing.arrangeReady(clock), C.teal];
    }
    if (view.phase === "move") {
      if (view.you === null) return [WORDS.standing.moveOther(who(view.turn), named, clock), C.bone];
      if (!moving()) return [WORDS.standing.moveWait(named, clock), C.bone];
      return [picked === null ? WORDS.standing.move(named, clock) : WORDS.standing.moveTo(named, clock), C.amber];
    }
    if (view.phase === "proxy") {
      if (view.you === null) return [WORDS.standing.proxyOther(who(view.turn), clock), C.bone];
      return moving() ? [WORDS.standing.proxy(named, clock), C.amber] : [WORDS.standing.proxyWait(clock), C.crim];
    }
    // a round's outcome on show: who has it, and how
    const shown = view.log.at(-1);
    return shown === undefined ? [WORDS.standing.show("", clock), C.boneD] : [WORDS.standing.show(WORDS.round[shown.how](who(shown.winner)), clock), C.amber];
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
    // while the game is played the players stand by their sides, the left's first; at its end, by their places
    const listed = view.places !== null ? view.places.map((each) => each.player) : view.sides;
    const layout = panelLayout(listed.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    listed.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const hand = handOf(player);
      const waited = view.phase === "arrange" ? hand?.ready === false : view.phase === "rearrange" ? view.arranger === player : view.mover === player;
      // who the game waits for
      if (waited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const words =
        view.phase === "ended"
          ? view.places === null
            ? ""
            : WORDS.result.outcome(view.winner === null ? "level" : view.winner === player ? "won" : "lost")
          : view.phase === "arrange"
            ? waited
              ? WORDS.status.arranging
              : WORDS.status.ready
            : view.phase === "rearrange"
              ? waited
                ? WORDS.status.arranging
                : ""
              : view.phase === "proxy"
                ? waited
                  ? WORDS.status.proxy
                  : view.turn === player
                    ? WORDS.status.late
                    : ""
                : waited
                  ? WORDS.status.moving
                  : "";
      pen.txt(words, right, y, view.phase === "ended" ? C.brass : view.phase === "proxy" && view.turn === player ? C.crim : waited ? C.boneD : C.teal, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      piece(ex + 4, y + 6, view.sides.indexOf(player), false, 0.6);
      const room = right - ex - 12 - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex + 12, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + 12 + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    /** A line that names `player`, the name cut so that the rest of the line is there to be read. */
    const named = (player: number | null, line: (who: string) => string): string => line(pen.fit(nickOf(player ?? -1), Math.max(LOG_NAME, PANEL_WIDTH - pen.width(line("")))));
    const card = (id: string): string => WORDS.card[id] ?? id;
    for (const event of view.history) {
      if (event.type === "round") lines.push([named(event.first, (who) => WORDS.log.round(event.round, who)), C.amber]);
      else if (event.type === "arranged") lines.push([named(event.player, (who) => WORDS.log.arranged(who, event.forced)), C.boneD]);
      else if (event.type === "moved") {
        const how = event.by === event.player ? "own" : event.by === null ? "room" : "proxy";
        lines.push([named(event.player, (who) => WORDS.log.moved(who, card(event.card), squareName(event.from), squareName(event.to), event.captured !== null, how)), event.captured !== null ? C.crim : C.bone]);
      } else if (event.type === "stuck") lines.push([named(event.player, (who) => WORDS.log.stuck(who, card(event.card))), C.boneD]);
      else if (event.type === "late") lines.push([named(event.player, (who) => WORDS.log.late(who)), C.crim]);
      else if (event.type === "round-over") lines.push([named(event.winner, (who) => WORDS.log.over[event.how](who)), C.teal]);
      else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = listed.indexOf(player);
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
    // the points of the player the screen is for first, or the winner's for someone watching
    const lead = view.you ?? view.winner ?? view.players[0];
    const other = view.players.find((each) => each !== lead) ?? lead;
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(pointsOf(lead), pointsOf(other), view.round) : WORDS.ended[view.ended];
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
    const on = !pending && !latest.frozen;
    if (arranging()) {
      cardNames().forEach((card, index) => {
        const rect = cardRect(index);
        const at = order.indexOf(card);
        button(rect, "", at >= 0, on);
        drawCard(rect[0] + 2, rect[1] + 4, card, at >= 0 ? "now" : "open");
        pen.txt(pen.fit(WORDS.card[card] ?? card, rect[2] - 24), rect[0] + 23, rect[1] + 2, at >= 0 ? C.amber : on ? C.bone : C.dim);
        // the place it has in the order, or the key that picks it
        pen.txt(at >= 0 ? WORDS.side.nth(at + 1) : TOUCH ? "" : `${index + 1}`, rect[0] + 23, rect[1] + 14, at >= 0 ? C.teal : C.dim);
      });
      return;
    }
    if (moving()) {
      if (view.phase === "move") button(RESIGN_RECT, sureT > 0 ? WORDS.button.resignSure : WORDS.button.resign, sureT > 0, on);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : `${WORDS.keys.move} · ${WORDS.keys.idle}`, RESIGN_RECT[0] - 12), 6, 246, C.dim);
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
    waits: (): boolean => latest !== null && !latest.frozen && janggiWaits(latest.view),
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

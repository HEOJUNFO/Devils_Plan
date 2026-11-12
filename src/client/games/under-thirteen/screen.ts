/**
 * The screen of 무거운 13: the three stands and the rocks on them, what
 * everyone put in this round and in which order the rocks go on, and the
 * player's own cards and chips.
 *
 * Design: design/games/under-thirteen.md. The room decides everything; this
 * screen shows what it sends and asks it to take a card and a chip, a rock
 * placed, or a pass. What others hold is never sent, and what they put in
 * comes when the room shows it. Everything can be done with the pointer;
 * the keys are a shorter way to the same.
 */
import { STANDS, sumOf, type Chip, type Stand, type UnderAction, type UnderEvent } from "../../../shared/games/under-thirteen/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH, keyed } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 무거운 13. */
export type UnderMessage = Extract<ServerMessage, { type: "game"; game: "under-thirteen" }>;

/** What the screen asks of whoever owns the connection. */
export interface UnderHandlers {
  /** The player put something in, had a rock placed, or passed. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
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
export interface UnderScreen {
  update(message: UnderMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** A stand: how wide, how far apart their left edges are, and where the first begins. */
const STAND_W = 90;
const STAND_STEP = 98;
const STAND_X = 9;
/** Where a stand's sum is written, where its rocks rest, and how big a rock is drawn. */
const SUM_Y = 27;
const FLOOR_Y = 141;
const ROCK_W = 20;
const ROCK_H = 13;
const ROCKS_IN_ROW = 4;
const ROCK_GAP = 2;
/** How many rows of rocks a stand has room for; of more rocks than that, the latest are drawn. */
const ROCK_ROWS = 6;
/** The players' tiles of the round, under the stands: where they begin and how tall one is. */
const TILES_Y = 165;
const TILE_H = 27;
/** The most tiles in one row. */
const TILES_IN_ROW = 8;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 62;
/** With this many seconds or fewer left, the clock turns red. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a rock. */
const RESULTS_HOLD = 1.5;
/** A player's tile of the round narrower than this, in pixels, says a pass and a penalty the short way. */
const NARROW_TILE = 56;
/** How many of the first places the results name in the bar. */
const PLACES_SHOWN = 3;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** The stands' colours, and the rocks'. */
const STAND_COLOURS: Record<Stand, string> = { red: "#e23b4a", green: "#3fbf5f", blue: "#3b82f6" };
const ROCK = "#7c8296";
const ROCK_TOP = "#aab0c2";

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The buttons of the bar. */
const cardRect = (index: number): Box => [6 + index * 27, 240, 25, 26];
const CHIP_KINDS: readonly Chip[] = ["red", "green", "blue", "rainbow"];
const chipRect = (index: number): Box => [200 + index * 44, 240, 42, 26];
const SUBMIT_RECT: Box = [386, 238, 90, 28];
const PLACE_RECT: Box = [290, 238, 90, 28];
const PASS_RECT: Box = [386, 238, 90, 28];
const standButton = (index: number): Box => [176 + index * 68, 238, 64, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** A whole stand, as a place to click. */
const standRect = (index: number): Box => [STAND_X + index * STAND_STEP, SUM_Y, STAND_W, FLOOR_Y + 21 - SUM_Y];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link UnderScreen.update}. */
export function createUnderScreen(canvas: HTMLCanvasElement, handlers: UnderHandlers): UnderScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: UnderMessage | null = null;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clocks are counted from here in real time: the screen's `time`
   * stops while the tab is hidden.
   */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown, counted from the game's start. */
  let seen = 0;
  /** How many events the history had dropped off its front when the latest message came: it keeps two rounds. */
  let dropped = 0;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The game as the room last sent it: what is shown again if a move drawn ahead of the room is refused. */
  let truth: UnderMessage | null = null;
  /**
   * The player's own move on its way to the room, as the change it makes to what the room sent. It is drawn
   * at once: the room is a moment away, and a rock that goes on its stand only when the room answers reads as
   * a press not taken. It is drawn again over whatever the room sends before its answer, and dropped when the
   * answer comes (the room's game then has the move in it) or the move is refused.
   */
  let ahead: ((view: UnderMessage["view"]) => UnderMessage["view"]) | null = null;
  /** The kind of happening already shown and sounded for the move drawn ahead: the room's word of it is not shown a second time. */
  let shownAhead: UnderEvent["type"] | null = null;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The card and the chip picked to put in, before they are. */
  let card: number | null = null;
  let chip: Chip | null = null;
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
  const chipOf = (player: number): Chip | null => latest?.view.chips?.find((each) => each.player === player)?.chip ?? null;
  const cardOf = (player: number): number | null => latest?.view.cards?.find((each) => each.player === player)?.card ?? null;
  /** Whether the player at this screen is to put in a card and a chip now. */
  function submitting(): boolean {
    const mine = me();
    return latest !== null && mine !== null && latest.view.phase === "submit" && !latest.frozen && !latest.view.submitted.includes(mine);
  }
  /** Whether it is this player's rock that is to be placed now. */
  const myTurn = (): boolean => latest !== null && me() !== null && latest.view.turn === me() && !latest.frozen;
  /** Whether this player, whose rock it is, has anything to answer: the room places a rock nobody is asked about. */
  const asked = (): boolean => myTurn() && latest?.view.asked !== "nothing";
  /** Whether this player, whose rock it is, may pass: not the last in the order, and nobody twice. */
  const mayPass = (): boolean => myTurn() && latest?.view.asked === "place-or-pass";

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound, and a word when it was a penalty of the player's own. */
  function show(event: UnderEvent): void {
    const mine = me();
    // the player's own move was shown as it was made; one the room made for them was not
    if (shownAhead !== null && event.type === shownAhead && "player" in event && event.player === mine && !("forced" in event && event.forced)) {
      shownAhead = null;
      return;
    }
    if (event.type === "round") {
      if (event.round > 1) sfx.turn();
    } else if (event.type === "chips" || event.type === "cards") sfx.swap();
    else if (event.type === "passed") sfx.back();
    else if (event.type === "placed") {
      if (event.cleared === 0) sfx.move();
      else if (event.player === mine) {
        say(WORDS.say.penalty(event.cleared));
        sfx.lose();
      } else sfx.deny();
    }
  }

  /** Sends the player's move and, if it went, draws it at once as `change` makes it (see `ahead`). */
  function sendAhead(action: UnderAction, change: (view: UnderMessage["view"]) => UnderMessage["view"], shown: UnderEvent["type"] | null = null): void {
    pending = handlers.act(action);
    if (!pending) return say(WORDS.notSent);
    if (latest === null) return;
    ahead = change;
    shownAhead = shown;
    latest = { ...latest, view: change(latest.view) };
  }

  /** Takes back a move drawn ahead of the room: the game is shown as the room last sent it. */
  function takeBack(): void {
    ahead = null;
    shownAhead = null;
    if (truth !== null) latest = truth;
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: UnderMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    // The history holds this round and the one before, and begins with a round's opening. How many
    // events have dropped off its front since the last message is where that opening stood then.
    const opening = message.view.history[0];
    const wasAt = latest === null || opening === undefined || opening.type !== "round" ? -1 : latest.view.history.findIndex((event) => event.type === "round" && event.round === opening.round);
    if (fresh || wasAt < 0) {
      // A game met part-way, or one this page was away from for longer than the history reaches, is
      // shown as it stands; only what happens from here on is played out.
      dropped = 0;
      seen = message.view.history.length;
    } else dropped += wasAt;
    if (fresh) {
      speech.clear();
      card = null;
      chip = null;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // what was picked and not put in does not carry over to another round
    if (latest !== null && latest.view.round !== message.view.round) {
      card = null;
      chip = null;
    }
    // The room marks the game it sends in answer to this page's move. What it sends meanwhile, for another
    // player's move, leaves this one on its way; a game that has gone on to another phase waits for nothing.
    const answered = message.answer === true || latest === null || latest.startedAt !== message.startedAt || latest.view.phase !== message.view.phase;
    truth = message;
    if (answered) ahead = null;
    // a move still on its way is drawn over what the room sends meanwhile, which does not have it yet
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    if (answered) pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function putIn(): void {
    if (latest === null || !submitting() || pending) return;
    if (card === null || chip === null) {
      say(WORDS.say.pickBoth);
      sfx.deny();
      return;
    }
    const mine = me();
    const put = { card, chip };
    // The card and the chip are out of the hand from the press, and the player is among those who have put
    // theirs in. What the others put in, and the chips shown once all have, come from the room.
    sendAhead({ type: "submit", ...put }, (view) => {
      if (mine === null || view.hand === null || view.submitted.includes(mine)) return view;
      const at = view.hand.chips.indexOf(put.chip);
      return {
        ...view,
        hand: { cards: view.hand.cards.filter((each) => each !== put.card), chips: view.hand.chips.filter((_, index) => index !== at) },
        mine: put,
        submitted: [...view.submitted, mine],
      };
    });
  }

  function placeOn(stand: Stand | null): void {
    if (latest === null || !asked() || pending) return;
    const mine = chipOf(me() as number);
    if (mine === "rainbow" && stand === null) {
      say(WORDS.refused["choose-stand"]);
      return;
    }
    const player = me() as number;
    const weight = cardOf(player);
    const on: Stand | null = mine === "rainbow" ? stand : mine;
    const action: UnderAction = mine === "rainbow" && stand !== null ? { type: "place", stand } : { type: "place" };
    if (weight === null || on === null) {
      // nothing to draw the rock from: it is sent and the room shows it
      pending = handlers.act(action);
      if (!pending) say(WORDS.notSent);
      return;
    }
    // The rock is on its stand from the press, as the room's own rule puts it there: a stand brought to the
    // limit keeps this rock alone. Whose rock is next, and the points, come with the room's answer.
    const sum = sumOf([...latest.view.stands[on], weight]);
    const cleared = sum >= latest.view.limit ? latest.view.stands[on].length : 0;
    sendAhead(
      action,
      (view) => {
        if (!view.queue.includes(player)) return view;
        const rocks = [...view.stands[on], weight];
        const over = sumOf(rocks) >= view.limit;
        return {
          ...view,
          stands: { ...view.stands, [on]: over ? [weight] : rocks },
          queue: view.queue.filter((each) => each !== player),
          passed: view.passed.filter((each) => each !== player),
          placements: [...view.placements, { player, stand: on, weight, sum: sumOf(rocks), cleared: over ? rocks.length - 1 : 0, passed: view.passed.includes(player), forced: false }],
          turn: null,
          asked: null,
        };
      },
      "placed",
    );
    if (!pending) return;
    if (cleared === 0) sfx.move();
    else {
      say(WORDS.say.penalty(cleared));
      sfx.lose();
    }
  }

  function passNow(): void {
    if (latest === null || !asked() || pending) return;
    if (!mayPass()) {
      say(WORDS.refused["cannot-pass"]);
      sfx.deny();
      return;
    }
    const player = me() as number;
    // passed from the press: the rock goes to the end of the order, and the turn is someone else's
    sendAhead(
      { type: "pass" },
      (view) => (!view.queue.includes(player) || view.passed.includes(player) ? view : { ...view, queue: view.queue.filter((each) => each !== player), passed: [...view.passed, player], turn: null, asked: null }),
      "passed",
    );
    if (pending) sfx.back();
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
    if (help || was) return;

    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape") || clicked(LOBBY_RECT, LOBBY_REACH)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        else say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (me() === null || view.hand === null) return;

    if (submitting()) {
      const hand = view.hand;
      const kinds = CHIP_KINDS.filter((kind) => hand.chips.includes(kind));
      for (const code of keys) {
        const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
        if (digit !== null && hand.cards.includes(Number(digit[1]))) {
          card = Number(digit[1]);
          sfx.move();
        } else if ((code === "ArrowLeft" || code === "ArrowRight") && kinds.length > 0) {
          const at = chip === null ? -1 : kinds.indexOf(chip);
          chip = kinds[(at + (code === "ArrowRight" ? 1 : kinds.length - 1) + (at < 0 && code === "ArrowLeft" ? 1 : 0)) % kinds.length];
          sfx.move();
        }
      }
      latest.rules.cards.forEach((value, index) => {
        if (clicked(cardRect(index)) && hand.cards.includes(value)) {
          card = value;
          sfx.move();
        }
      });
      CHIP_KINDS.forEach((kind, index) => {
        if (clicked(chipRect(index)) && hand.chips.includes(kind)) {
          chip = kind;
          sfx.move();
        }
      });
      if (pressed("Enter", "NumpadEnter") || clicked(SUBMIT_RECT)) putIn();
      return;
    }
    // a rock nobody is asked about is the room's to place: nothing is pressed for it
    if (!asked()) return;
    if (chipOf(me() as number) === "rainbow") {
      STANDS.forEach((stand, index) => {
        if (pressed(`Digit${index + 1}`, `Numpad${index + 1}`) || clicked(standButton(index)) || clicked(standRect(index))) placeOn(stand);
      });
    } else if (pressed("Enter", "NumpadEnter") || clicked(PLACE_RECT)) placeOn(null);
    if (pressed("KeyP") || clicked(PASS_RECT)) passNow();
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
      const history = latest.view.history;
      while (seen < dropped + history.length) {
        const event = history[seen - dropped];
        seen += 1;
        if (event !== undefined) show(event);
      }
      // the room has answered and its word of the move has been passed over, or was never in it
      if (ahead === null) shownAhead = null;
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

  /** A chip: a square of its colour, the rainbow one in three stripes. */
  function drawChip(x: number, y: number, size: number, kind: Chip): void {
    pen.px(x - 1, y - 1, size + 2, size + 2, C.ink);
    if (kind !== "rainbow") {
      pen.px(x, y, size, size, STAND_COLOURS[kind]);
      return;
    }
    const stripe = Math.floor(size / 3);
    STANDS.forEach((stand, index) => pen.px(x, y + index * stripe, size, index === 2 ? size - 2 * stripe : stripe, STAND_COLOURS[stand]));
  }

  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  function drawStands(): void {
    if (latest === null) return;
    const view = latest.view;
    const turn = view.turn;
    // the stand the rock now to be placed is bound for, where its chip says so
    const bound = turn === null ? null : chipOf(turn);
    const choosing = asked() && bound === "rainbow";
    STANDS.forEach((stand, index) => {
      const x = STAND_X + index * STAND_STEP;
      const rocks = view.stands[stand];
      const sum = sumOf(rocks);
      const room = view.limit - sum;
      const colour = STAND_COLOURS[stand];
      if (bound === stand || (choosing && inRect(mouse, standRect(index)))) frame([x - 2, SUM_Y - 3, STAND_W + 4, FLOOR_Y + 25 - SUM_Y], bound === stand ? C.amberD : C.steel);
      // the sum, large: what the next rock is weighed against
      pen.txt(`${sum}`, x + Math.round(STAND_W / 2), SUM_Y, room <= 2 ? C.crim : room <= 6 ? C.amber : C.bone, "center", 24);
      const shown = rocks.slice(Math.max(0, rocks.length - ROCK_ROWS * ROCKS_IN_ROW));
      shown.forEach((weight, at) => {
        const rx = x + 2 + (at % ROCKS_IN_ROW) * (ROCK_W + ROCK_GAP);
        const ry = FLOOR_Y - ROCK_H - Math.floor(at / ROCKS_IN_ROW) * (ROCK_H + 1);
        pen.px(rx, ry, ROCK_W, ROCK_H, C.ink);
        pen.px(rx + 1, ry + 1, ROCK_W - 2, ROCK_H - 2, ROCK);
        pen.px(rx + 1, ry + 1, ROCK_W - 2, 1, ROCK_TOP);
        pen.txt(`${weight}`, rx + Math.round(ROCK_W / 2), ry + 1, C.ink, "center");
      });
      pen.px(x, FLOOR_Y + 1, STAND_W, 5, colour);
      pen.txt(WORDS.stand[stand], x + Math.round(STAND_W / 2), FLOOR_Y + 8, colour, "center");
    });
  }

  /** Under the stands: every player's tile of the round, in the order the rocks go on once that is known. */
  function drawTiles(): void {
    if (latest === null) return;
    const view = latest.view;
    const order = view.order.length > 0 ? view.order : view.players;
    const rows = order.length > TILES_IN_ROW ? 2 : 1;
    const inRow = Math.ceil(order.length / rows);
    const width = Math.min(72, Math.floor((SCENE_W - 8) / inRow));
    const top = rows === 1 ? TILES_Y + 13 : TILES_Y;
    order.forEach((player, at) => {
      const x = 4 + (at % inRow) * width;
      const y = top + Math.floor(at / inRow) * (TILE_H + 2);
      const placed = view.placements.find((each) => each.player === player);
      const turn = view.turn === player;
      pen.px(x, y, width - 2, TILE_H, turn ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, width - 4, TILE_H - 2, placed !== undefined ? C.ink : C.btn);
      pen.txt(pen.fit(nickOf(player), width - 6), x + 3, y + 1, me() === player ? C.amber : placed !== undefined ? C.dim : C.bone);
      const theirs = chipOf(player);
      const number = cardOf(player);
      // in a crowded round the tiles are narrow: the chip is smaller, the number closer to it, and what is said beside them is said shorter
      const narrow = width < NARROW_TILE;
      const chipSize = narrow ? 7 : 9;
      const chipX = x + (narrow ? 3 : 4);
      const chipY = y + (narrow ? 16 : 15);
      const numberX = chipX + chipSize + (narrow ? 2 : 4);
      const edge = x + width - (narrow ? 4 : 5);
      if (theirs !== null) drawChip(chipX, chipY, chipSize, theirs);
      else if (view.submitted.includes(player)) pen.px(chipX, chipY, chipSize, chipSize, C.steelD);
      if (number !== null) pen.txt(`${number}`, numberX, y + 13, placed !== undefined ? C.dim : C.bone);
      // a penalty with its sign, a pass by its word: or the shorter way of saying each, where that is all there is room for
      const ways = placed !== undefined ? (placed.cleared > 0 ? [`-${placed.cleared}`, `${placed.cleared}`] : []) : view.passed.includes(player) ? [WORDS.tile.passed, WORDS.tile.passedShort] : [];
      const room = edge - (numberX + 7);
      const state = ways.find((way) => pen.width(way) - 1 <= room) ?? ways.at(-1);
      if (state !== undefined) pen.txt(state, edge, y + 13, placed !== undefined ? C.crim : C.boneD, "right");
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    drawStands();
    drawTiles();
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 80, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const mine = me();
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const ms = left(latest.clock.phase) ?? 0;
    const seconds = Math.ceil(ms / 1000);
    if (view.phase === "submit") {
      const have = view.submitted.length;
      const of = latest.players.length;
      if (mine === null) return [WORDS.standing.watchSubmit(have, of, clockOf(ms)), C.bone];
      if (view.submitted.includes(mine)) return [WORDS.standing.submitted(have, of, clockOf(ms)), C.teal];
      if (pending) return [WORDS.standing.sending, C.boneD];
      return card !== null && chip !== null ? [WORDS.standing.ready(clockOf(ms)), C.amber] : [WORDS.standing.submit(clockOf(ms)), C.amber];
    }
    if (view.phase === "chips") return [WORDS.standing.chips, C.bone];
    if (view.phase === "pause") return [view.round >= view.rounds ? WORDS.standing.lastOver(seconds) : WORDS.standing.roundOver(view.round, seconds), C.bone];
    const turn = view.turn;
    // the player's own rock or pass, drawn ahead of the room: whose rock is next the room has yet to say
    if (turn === null) return [pending ? WORDS.standing.sending : "", C.boneD];
    if (turn !== mine) return [WORDS.standing.theirTurn(pen.fit(nickOf(turn), 80), seconds), C.bone];
    if (pending) return [WORDS.standing.sending, C.boneD];
    const theirs = chipOf(turn);
    const weight = cardOf(turn) ?? 0;
    if (theirs === "rainbow" || theirs === null) return [WORDS.standing.myRainbow(weight, seconds), C.amber];
    // the last in the order, or a rock passed earlier: it goes on with nothing asked
    if (!asked()) return [WORDS.standing.mineGoing(WORDS.stand[theirs], weight), C.bone];
    return [WORDS.standing.myTurn(WORDS.stand[theirs], weight, seconds), C.amber];
  }

  /** The log, made from what has been shown so far of the two rounds the room sends. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    const mine = me();
    const who = (player: number): string => pen.fit(nickOf(player), 44);
    for (const event of latest.view.history.slice(0, Math.max(0, seen - dropped))) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round, who(event.first)), C.boneD]);
      else if (event.type === "dealt") lines.push([WORDS.log.dealt, C.amber]);
      else if (event.type === "chips") lines.push([WORDS.log.chips, C.dim]);
      else if (event.type === "cards") lines.push([WORDS.log.cards, C.dim]);
      else if (event.type === "passed") lines.push([WORDS.log.passed(who(event.player)), C.boneD]);
      else if (event.type === "ended") lines.push([WORDS.ended[event.reason], C.amber]);
      else if (event.cleared > 0) lines.push([WORDS.log.cleared(who(event.player), WORDS.stand[event.stand], event.weight, event.cleared), event.player === mine ? C.crim : C.amber]);
      else lines.push([WORDS.log.placed(who(event.player), WORDS.stand[event.stand], event.weight, event.sum), event.player === mine ? C.bone : C.boneD]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.round(view.round, view.rounds), x, 3, C.bone);
    const phase = left(latest.clock.phase);
    if (phase !== null) pen.txt(clockOf(phase), W - 5, 3, Math.ceil(phase / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // the players as they stand; before anyone has a penalty point nobody has a place yet
    const ranked = view.standings.some((each) => each.points > 0);
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
      const place = ranked ? `${each.place}` : "-";
      // a place of two figures needs more room than one
      if (layout.crowded) pen.txt(place, ex + 12, y, ranked ? C.brass : C.dim, "right");
      else pen.txt(place, ex, y, ranked ? C.brass : C.dim);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const words = WORDS.points(each.points, layout.crowded);
      const first = view.first === player ? WORDS.firstMark(layout.crowded) : "";
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - pen.width(words) - 3 - (first === "" ? 0 : pen.width(first) + 3) - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, nameX, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      let after = nameX + pen.width(name) + 2;
      if (first !== "") {
        pen.txt(first, after, y, C.brass);
        after += pen.width(first) + 2;
      }
      if (voice !== "out") drawVoiceMark(pen, after, y, voice, time);
      pen.txt(words, right, y, each.points > 0 ? C.crim : C.boneD, "right");
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

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** The player's cards and chips, as buttons, and the one that puts them in. */
  function drawHand(): void {
    if (latest === null || latest.view.hand === null) return;
    const hand = latest.view.hand;
    const live = submitting() && !pending;
    latest.rules.cards.forEach((value, index) => {
      const held = hand.cards.includes(value);
      button(cardRect(index), `${value}`, live && card === value, live && held);
    });
    CHIP_KINDS.forEach((kind, index) => {
      const rect = chipRect(index);
      const count = hand.chips.filter((each) => each === kind).length;
      const lit = live && chip === kind;
      button(rect, "", lit, live && count > 0);
      if (count > 0) drawChip(rect[0] + 6, rect[1] + 8, 10, kind);
      pen.txt(`×${count}`, rect[0] + rect[2] - 5, rect[1] + 6, count === 0 ? C.dim : lit ? C.amber : C.bone, "right");
    });
    if (submitting()) button(SUBMIT_RECT, WORDS.button.submit, live && card !== null && chip !== null, live);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const own = mine === null ? undefined : view.standings.find((each) => each.player === mine);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own === undefined ? C.bone : own.place === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name, as many of them as fit whole; the list beside the stands has everyone
    let places = "";
    for (const each of view.standings.slice(0, PLACES_SHOWN)) {
      const one = WORDS.result.place(each.place, pen.fit(nickOf(each.player), 56), each.points);
      const longer = places === "" ? one : `${places} · ${one}`;
      if (pen.width(longer) > RESULT_WIDTH) break;
      places = longer;
    }
    pen.txt(places, 96, 226, C.bone);
    const end = view.history.at(-1);
    const how = end?.type === "ended" ? WORDS.ended[end.reason] : "";
    pen.txt(own === undefined ? how : WORDS.result.mine(own.points), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : WORDS.result.waitHost, 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, WORDS.button.again, !starting, !starting);
    button(LOBBY_RECT, WORDS.button.lobby, false, true);
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
    if (me() === null) {
      pen.txt(idle, 6, 240, C.dim);
      return;
    }
    if (view.phase === "submit") {
      drawHand();
      return;
    }
    if (!asked()) {
      pen.txt(idle, 6, 240, C.dim);
      return;
    }
    const live = !pending;
    if (chipOf(me() as number) === "rainbow") {
      STANDS.forEach((stand, index) => {
        const rect = standButton(index);
        // after the key that chooses it, where there are keys
        button(rect, keyed(`${index + 1}`, WORDS.stand[stand]), false, live);
        pen.px(rect[0] + 2, rect[1] + rect[3] - 4, rect[2] - 4, 2, STAND_COLOURS[stand]);
      });
    } else button(PLACE_RECT, WORDS.button.place, live, live);
    button(PASS_RECT, WORDS.button.pass, false, live && mayPass());
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      limit: rules.limit,
      low: Math.min(...rules.cards),
      high: Math.max(...rules.cards),
      chipsOfEach: rules.chipsOfEach,
      perSet: latest.view.perSet,
      rounds: latest.view.rounds,
      submitSeconds: rules.submitSeconds,
      turnSeconds: rules.turnSeconds,
    });
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
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
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
      // whether the move reached the room is not known: the game the room sends on coming back will say
      takeBack();
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

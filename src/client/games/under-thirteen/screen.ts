/**
 * The screen of 무거운 13: the three stands and the rocks on them, what
 * everyone put in this round and in which order the rocks go on, and the
 * player's own cards and chips.
 *
 * Design: design/games/under-thirteen.md. The room decides everything; this
 * screen shows what it sends and asks it to take a spot to stand at, a card
 * and a chip, a rock placed, or a pass. What others hold is never sent, and what they put in
 * comes when the room shows it. Everything can be done with the pointer;
 * the keys are a shorter way to the same.
 */
import { STANDS, sumOf, type Chip, type Stand, type UnderAction, type UnderEvent } from "../../../shared/games/under-thirteen/rules";
import { underWaits } from "../../../shared/waits";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
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
  /** Whether this is the player's first game of 무거운 13 (`GameHandlers.first`): the bar then says what the rock in hand would come to. */
  first: boolean;
}

/** The game screen. */
export interface UnderScreen {
  update(message: UnderMessage): void;
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
/**
 * The ring of spots everyone stands at, drawn while they are taken: where its
 * middle is, how far a spot's middle is above and below it, how tall a spot
 * is drawn, and how far inside the spots the line of the ring runs. The ring
 * begins 23 pixels down: the page's own buttons lie over the top left of the
 * scene (the way out and the voice chat, or the menu under a finger), and a
 * spot under them could not be pressed.
 */
const RING_Y = 121;
const RING_RY = 90;
const SPOT_H = 17;
const RING_INSET = 10;
/** How far past its edge a spot takes a finger. Spots that close take the lower number where two reach the same place: a spot is pointed at before it is taken. */
const SPOT_REACH: Reach = 3;
/** How many degrees apart the dots of the ring's line are. */
const RING_DOT_DEGREES = 6;
/** The stands' colours, and the rocks'. */
const STAND_COLOURS: Record<Stand, string> = { red: "#e23b4a", green: "#3fbf5f", blue: "#3b82f6" };
/** How wide the chip shown before a stand's name is. */
const STAND_CHIP = 7;
const ROCK = "#7c8296";
const ROCK_TOP = "#aab0c2";

/** How wide a spot is drawn, by how many there are: the more, the narrower, so that sixteen stand round the ring without touching. */
const spotWidth = (count: number): number => (count > 12 ? 46 : count > 8 ? 56 : 64);

/** Where spot `at` of `count` is drawn: the first at the top of the ring, the rest clockwise from it. */
function spotRect(at: number, count: number): Box {
  const width = spotWidth(count);
  const reachX = SCENE_W / 2 - width / 2 - 3;
  const angle = -Math.PI / 2 + (2 * Math.PI * at) / count;
  const x = Math.round(SCENE_W / 2 + reachX * Math.cos(angle));
  const y = Math.round(RING_Y + RING_RY * Math.sin(angle));
  return [x - width / 2, y - Math.floor(SPOT_H / 2), width, SPOT_H];
}

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
  /** The spot pointed at to stand at, before it is taken. */
  let spot: number | null = null;
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
  /** Whether the player at this screen has a spot to take now. */
  function choosing(): boolean {
    const mine = me();
    return latest !== null && mine !== null && latest.view.phase === "spots" && !latest.frozen && !latest.view.spots.includes(mine);
  }
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
      spot = null;
      card = null;
      chip = null;
      if (latest !== null) sfx.turn();
    } else if (truth !== null && truth.view.phase === "spots") {
      // Spots are told as they stand, not as things that happened: what changed is read off the room's last word.
      const before = truth.view.spots;
      const mine = message.view.you;
      if (message.view.phase === "spots") {
        // someone else has taken a spot: the player's own was sounded as they took it
        if (message.view.spots.some((who, at) => who !== null && who !== mine && before[at] === null)) sfx.move();
        // the spot pointed at has gone to someone else
        if (spot !== null && message.view.spots[spot] !== null && message.view.spots[spot] !== mine) spot = null;
      } else {
        if (message.view.phase === "submit") sfx.turn();
        const at = mine === null ? -1 : message.view.players.indexOf(mine);
        // the room stood this player: they had no spot, and none they asked for is the one they have
        if (mine !== null && at >= 0 && message.view.phase === "submit" && !before.includes(mine) && !(pending && spot === at)) say(WORDS.say.stoodForYou(at + 1));
        spot = null;
      }
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
    const wasAsked = asked();
    truth = message;
    if (answered) ahead = null;
    // a move still on its way is drawn over what the room sends meanwhile, which does not have it yet
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    if (answered) pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // the rock to be placed has become this player's, and they are asked about it: the clock on their answer has begun
    if (!wasAsked && asked()) sfx.turn();
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

  function takeSpot(): void {
    if (latest === null || !choosing() || pending) return;
    if (spot === null) {
      say(WORDS.say.pickSpot);
      sfx.deny();
      return;
    }
    const mine = me() as number;
    const at = spot;
    // The player stands there from the press. Whether someone else was a moment sooner is the room's to say:
    // where its next word has them at this spot, that is what is shown.
    sendAhead({ type: "take", spot: at }, (view) => (view.spots[at] !== null || view.spots.includes(mine) ? view : { ...view, spots: view.spots.map((who, n) => (n === at ? mine : who)) }));
    if (pending) sfx.move();
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
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (view.phase === "spots") {
      if (!choosing() || pending) return;
      const free = view.spots.flatMap((who, at) => (who === null ? [at] : []));
      for (const code of keys) {
        const forward = code === "ArrowRight" || code === "ArrowDown";
        if ((forward || code === "ArrowLeft" || code === "ArrowUp") && free.length > 0) {
          // round the ring, over the spots that are free: clockwise with → and ↓
          const at = spot === null ? -1 : free.indexOf(spot);
          spot = at < 0 ? free[forward ? 0 : free.length - 1] : free[(at + (forward ? 1 : free.length - 1)) % free.length];
          sfx.move();
        }
      }
      let taking = pressed("Enter", "NumpadEnter") || clicked(SUBMIT_RECT);
      // a free spot is pointed at by a press, and taken by a second press on it
      const pressedSpot = free.find((at) => clicked(spotRect(at, view.spots.length), SPOT_REACH));
      if (pressedSpot !== undefined) {
        if (spot === pressedSpot) taking = true;
        else {
          spot = pressedSpot;
          sfx.move();
        }
      }
      if (taking) takeSpot();
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

  /**
   * A chip: a square of its colour, the rainbow one in three stripes. A
   * chip of one colour also has its stand's tally on it, dark and upright:
   * one stroke for the first stand, two for the second, three for the third.
   * Red and green are one colour to about one man in twelve, and the chips
   * in a hand are told apart by nothing else; the stand shows the same chip
   * beside its name, so the tally need not be learned.
   */
  function drawChip(x: number, y: number, size: number, kind: Chip): void {
    pen.px(x - 1, y - 1, size + 2, size + 2, C.ink);
    if (kind !== "rainbow") {
      pen.px(x, y, size, size, STAND_COLOURS[kind]);
      // strokes two wide on a chip of even width, where one of one could not stand in the middle
      const wide = size % 2 === 0 ? 2 : 1;
      const middle = (size - wide) / 2;
      const strokes = STANDS.indexOf(kind) + 1;
      // from one stroke's left edge to the next's: a gap of one between them, or of two where two wide strokes have the room
      const apart = wide === 1 ? 2 : strokes === 2 ? 4 : 3;
      const inset = size <= 7 ? 1 : 2;
      for (let nth = 0; nth < strokes; nth++) pen.px(x + middle + (nth - (strokes - 1) / 2) * apart, y + inset, wide, size - 2 * inset, C.ink);
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
      // its name, and before it the chip that is bound for it: the tally on the chip is the stand's
      const name = WORDS.stand[stand];
      const nameX = x + Math.round(STAND_W / 2) + Math.round((STAND_CHIP + 3) / 2);
      pen.txt(name, nameX, FLOOR_Y + 8, colour, "center");
      drawChip(nameX - Math.ceil(pen.width(name) / 2) - STAND_CHIP - 3, FLOOR_Y + 11, STAND_CHIP, stand);
    });
  }

  /**
   * The ring of spots, while they are taken: each spot with its number, or
   * with the name of whoever stands there, the first at the top and the rest
   * clockwise; a dotted line inside them with an arrowhead on each side that
   * says which way that is; and in the middle what the spots are for.
   */
  function drawSpots(): void {
    if (latest === null) return;
    const view = latest.view;
    const count = view.spots.length;
    const mine = me();
    const live = choosing() && !pending;
    const midX = Math.round(SCENE_W / 2);
    const lineX = SCENE_W / 2 - spotWidth(count) - 3 - RING_INSET;
    const lineY = RING_RY - Math.floor(SPOT_H / 2) - RING_INSET;
    for (let degrees = 0; degrees < 360; degrees += RING_DOT_DEGREES) {
      const angle = (degrees * Math.PI) / 180;
      pen.px(Math.round(SCENE_W / 2 + lineX * Math.cos(angle)), Math.round(RING_Y + lineY * Math.sin(angle)), 1, 1, C.steelD);
    }
    // clockwise: to the right along the top, down the right side, to the left along the bottom, up the left side
    const heads: readonly [x: number, y: number, dx: number, dy: number][] = [
      [midX, RING_Y - lineY, 1, 0],
      [midX + Math.round(lineX), RING_Y, 0, 1],
      [midX, RING_Y + lineY, -1, 0],
      [midX - Math.round(lineX), RING_Y, 0, -1],
    ];
    for (const [x, y, dx, dy] of heads) {
      // an arrowhead of three steps: its point leads, each step behind it is two pixels wider across
      for (let back = 0; back < 3; back++) {
        const px = x + dx * (2 - back);
        const py = y + dy * (2 - back);
        if (dx !== 0) pen.px(px, py - back, 1, 2 * back + 1, C.steel);
        else pen.px(px - back, py, 2 * back + 1, 1, C.steel);
      }
    }
    const words = WORDS.spots;
    // asked of whoever has a spot to take; to anyone else the ring is named
    pen.txt(choosing() ? words.title : words.heading, midX, RING_Y - 41, C.amber, "center");
    words.lines.forEach((line, n) => pen.txt(line, midX, RING_Y - 22 + n * 15, C.bone, "center"));
    pen.txt(words.kept, midX, RING_Y + 11, C.boneD, "center");
    pen.txt(words.first(pen.fit(nickOf(view.first), 70)), midX, RING_Y + 30, C.brass, "center");
    view.spots.forEach((who, at) => {
      const rect = spotRect(at, count);
      const [x, y, w, h] = rect;
      const pointed = live && spot === at;
      const free = who === null;
      const first = who !== null && who === view.first;
      const edge = pointed ? C.amberD : first ? C.brass : free && live && inRect(mouse, rect) ? C.steel : C.steelDD;
      pen.px(x, y, w, h, edge);
      pen.px(x + 1, y + 1, w - 2, h - 2, pointed ? "#3a2a12" : free ? (live ? C.btn : C.ink) : C.steelDD);
      if (who === null) pen.txt(`${at + 1}`, x + Math.round(w / 2), y + 2, pointed ? C.amber : live ? C.bone : C.dim, "center");
      else pen.txt(pen.fit(nickOf(who), w - 6), x + Math.round(w / 2), y + 2, who === mine ? C.amber : C.bone, "center");
    });
  }

  /**
   * Under the stands: every player's tile of the round, in the order the
   * rocks go on once that is known, and until then as they stand, clockwise
   * from the holder of the first-player marker: the order between equal cards.
   */
  function drawTiles(): void {
    if (latest === null) return;
    const view = latest.view;
    const from = Math.max(0, view.players.indexOf(view.first));
    const order = view.order.length > 0 ? view.order : [...view.players.slice(from), ...view.players.slice(0, from)];
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
    if (latest.view.phase === "spots") drawSpots();
    else {
      drawStands();
      drawTiles();
    }
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 80, C.boneD);
    }
  }

  /**
   * What a rock of `weight` put on `stand` now would come to: the stand's sum
   * with it, and the penalty for it (the rocks cleared, where the sum reaches
   * the limit). Worked out from what everyone sees on the stands and the
   * player's own card: said to a player in their first game, who has the
   * numbers in front of them and not yet the habit of adding them.
   */
  function wouldBe(stand: Stand, weight: number): { total: number; points: number } {
    const rocks = latest?.view.stands[stand] ?? [];
    const total = sumOf([...rocks, weight]);
    return { total, points: latest !== null && total >= latest.view.limit ? rocks.length : 0 };
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
    if (view.phase === "spots") {
      const have = view.spots.filter((who) => who !== null).length;
      const of = view.spots.length;
      if (mine === null) return [WORDS.standing.watchSpots(have, of, clockOf(ms)), C.bone];
      // the player's own spot on its way to the room is drawn as taken: the room has yet to say so
      if (pending) return [WORDS.standing.sending, C.boneD];
      if (view.spots.includes(mine)) return [WORDS.standing.spotTaken(have, of, clockOf(ms)), C.teal];
      return spot !== null ? [WORDS.standing.spotReady(spot + 1, clockOf(ms)), C.amber] : [WORDS.standing.spots(clockOf(ms)), C.amber];
    }
    if (view.phase === "submit") {
      const have = view.submitted.length;
      const of = latest.players.length;
      if (mine === null) return [WORDS.standing.watchSubmit(have, of, clockOf(ms)), C.bone];
      if (view.submitted.includes(mine)) return [WORDS.standing.submitted(have, of, clockOf(ms)), C.teal];
      if (pending) return [WORDS.standing.sending, C.boneD];
      if (handlers.first) {
        // a first game: what the two pieces are for, and with both picked, what they would come to as the stands are now
        if (card === null || chip === null) return [WORDS.coach.submit(view.limit, clockOf(ms)), C.amber];
        if (chip === "rainbow") return [WORDS.coach.readyRainbow(clockOf(ms)), C.amber];
        const { total, points } = wouldBe(chip, card);
        return [WORDS.coach.ready(WORDS.stand[chip], total, points, clockOf(ms)), points > 0 ? C.crim : C.amber];
      }
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
    pen.txt(view.phase === "spots" ? WORDS.spots.heading : WORDS.round(view.round, view.rounds), x, 3, C.bone);
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

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.phase !== "ended" || mine === null) return null;
    const own = latest.view.standings.find((each) => each.player === mine);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
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
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
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
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    if (view.phase === "spots") {
      if (!choosing()) {
        pen.txt(idle, 6, 240, C.dim);
        return;
      }
      pen.txt(WORDS.keys.spots, 6, 240, C.dim);
      const live = !pending;
      button(SUBMIT_RECT, WORDS.button.take, live && spot !== null, live);
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
    if (handlers.first) {
      // a first game: beside the buttons, what a press of them does to the stand
      const own = chipOf(me() as number);
      if (own === "rainbow" || own === null) pen.txt(pen.fit(WORDS.coach.rainbow(view.limit), standButton(0)[0] - 12), 6, 240, C.bone);
      else {
        const { total, points } = wouldBe(own, cardOf(me() as number) ?? 0);
        pen.txt(pen.fit(WORDS.coach.place(WORDS.stand[own], total, points, view.limit), PLACE_RECT[0] - 12), 6, 240, points > 0 ? C.crim : C.bone);
      }
    }
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
    verdict,
    // by the room's last word, not by a move of this page's still on its way; a game that stands still waits on no one
    waits: (): boolean => truth !== null && !truth.frozen && underWaits(truth.view),
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

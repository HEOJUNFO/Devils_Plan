/**
 * The screen of 보석 암시장: every player's card face down at their seat,
 * the buyers' slots and the trash under them, and the controls for whatever
 * the game waits on this player for.
 *
 * Design: design/games/gem-black-market.md. The room decides everything;
 * this screen shows what it sends and asks it to take a move. The room sends
 * no card but this player's own while they may look at it, the one they
 * paid to check, and all of them when a round is revealed: where the others
 * went is for the player to keep track of, from the exchanges the column
 * lists. Played with the pointer or a finger, or with the keys the bar
 * names.
 */
import type { Card, GemEvent, Kind, Target } from "../../../shared/games/gem-black-market/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { gemWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer, RESULTS_PRESS_HOLD } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 보석 암시장. */
export type GemMessage = Extract<ServerMessage, { type: "game"; game: "gem-black-market" }>;

/** What the screen asks of whoever owns the connection. */
export interface GemHandlers {
  /** The player asked something of the game. Returns whether it could be sent. */
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
  /** Whether this is the player's first game of 보석 암시장 (`GameHandlers.first`): the bar then says what to watch for. */
  first: boolean;
}

/** The game screen. */
export interface GemScreen {
  update(message: GemMessage): void;
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
/** The seats: where the first row starts under the page's own buttons, and how high one is with its name over its card. */
const SEATS_Y = 24;
const SEAT_H = 46;
/** With more players than this the seats are in two rows. */
const ONE_ROW = 5;
/** A card, in pixels. */
const CARD_W = 22;
const CARD_H = 28;
/** The buyers' slots and the trash: how far apart their cards are. */
const MARKET_PITCH = 60;
/** A line of the scene under the table, in pixels. */
const LINE = 15;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 110;
/** With this many seconds or fewer left of a time that is this player's, the clock turns red and each second is ticked aloud. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a move as the game ended. */
const RESULTS_HOLD = 1.5;
/** How many of the first places the results name in the bar. */
const PLACES_SHOWN = 3;
/** The final count: where its rows start, and how far apart they are. */
const FINALS_Y = 42;
const FINALS_PITCH = 15;
/** The colour of each kind of card, and the back of one. */
const KIND_COLOUR: Record<Kind, string> = { diamond: "#8fe3f2", gold: "#ffcf4a", silver: "#c9cfdc", copper: "#d98a4e", bomb: "#e23b4a" };
const CARD_FACE = "#1a1e33";
const CARD_BACK = "#3b2a55";
const CARD_BACK_D = "#291c3d";

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
const same = (a: Target | null, b: Target | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The one button of the bar, and the two where there is a choice. */
const ONE_RECT: Box = [372, 238, 104, 28];
const FIRST_RECT: Box = [372, 226, 104, 19];
const SECOND_RECT: Box = [372, 248, 104, 18];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** How far beyond a small button a finger still presses it. */
const SMALL_REACH: Reach = 4;

/** What the game waits on this player for. */
type Mine = "bid" | "look" | "exchange" | "seen" | "reveal";

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link GemScreen.update}. */
export function createGemScreen(canvas: HTMLCanvasElement, handlers: GemHandlers): GemScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: GemMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
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
  /** The step of the game the controls below are set for: a new step starts them afresh. */
  let step = "";
  /** The pieces this player is about to bid. */
  let bid = 0;
  /** The card this player is about to exchange with, or to check. */
  let target: Target | null = null;
  /** Whether the player is choosing a card to check for a piece, in place of one to exchange with. */
  let peeking = false;
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
  const name = (player: number, width = 60): string => pen.fit(nickOf(player), width);
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const seconds = (): number => Math.ceil((left(latest?.clock.phase ?? null) ?? 0) / 1000);
  const me = (): number | null => latest?.view.you ?? null;
  const isGone = (player: number): boolean => latest?.view.gone.includes(player) ?? false;
  const own = () => latest?.view.standings.find((each) => each.player === me());
  /** Whether the game is on and not standing still, so that a move could be taken. */
  const live = (): boolean => latest !== null && latest.view.phase !== "ended" && !latest.frozen && !pending;
  /** What the game waits on this player for, if anything. */
  function mine(): Mine | null {
    if (latest === null || latest.frozen) return null;
    const view = latest.view;
    const you = view.you;
    if (you === null) return null;
    if (view.phase === "auction") return view.auction !== null && view.auction.bidders.includes(you) && view.auction.mine === null ? "bid" : null;
    if (view.phase === "look" || view.phase === "reveal") return view.ready.includes(you) ? null : view.phase;
    if (view.phase === "exchange" || view.phase === "seen") return view.turn === you ? view.phase : null;
    return null;
  }
  /** Whether this player could pay to check a card now. */
  function canPeek(): boolean {
    if (latest === null) return false;
    const what = mine();
    const mineNow = own();
    return (what === "look" || what === "exchange") && mineNow !== undefined && mineNow.peeks < latest.rules.peeks && mineNow.pieces >= latest.rules.peekCost;
  }
  /** The places of the table: every buyers' slot, then the trash. */
  const places = (): Target[] => [...Array.from({ length: latest?.rules.buyers ?? 0 }, (_, slot): Target => ({ to: "buyer", slot })), { to: "trash" }];
  /** What this player could choose now, in the order the arrows go through it: the others' cards, then the table's. */
  function choices(): Target[] {
    if (latest === null) return [];
    if (peeking) return places();
    const view = latest.view;
    const others: Target[] = view.order.filter((player) => player !== view.you && !isGone(player)).map((player) => ({ to: "player", player }));
    return view.bomb ? others : [...others, ...places()];
  }
  /** A place by its name. */
  const whereOf = (at: Target): string => (at.to === "player" ? WORDS.scene.ofPlayer(name(at.player, 110)) : at.to === "trash" ? WORDS.trash : WORDS.buyer(at.slot));
  /** The card at a place, where this player may see it: once a round is revealed, their own, or one they paid to check. */
  function cardAt(at: Target): Card | null {
    if (latest === null) return null;
    const view = latest.view;
    if (view.shown !== null && view.phase === "reveal") {
      if (at.to === "player") return view.shown.lines.find((line) => line.player === at.player)?.card ?? null;
      return at.to === "trash" ? view.shown.trash : (view.shown.buyers[at.slot] ?? null);
    }
    if (at.to === "player") return at.player === view.you ? view.mine : null;
    return view.peeked.find((each) => same(each.at, at))?.card ?? null;
  }

  // ---- Where things are ------------------------------------------------------------------------------
  /** How many seats are in a row, and how wide one is. */
  function seatGrid(): { cols: number; w: number; rows: number } {
    const n = Math.max(1, latest?.view.order.length ?? ONE_ROW);
    const cols = n <= ONE_ROW ? n : Math.ceil(n / 2);
    return { cols, w: Math.floor((SCENE_W - 8) / cols), rows: Math.ceil(n / cols) };
  }
  /** The seat of the player at `index` of the order. */
  function seatRect(index: number): Box {
    const { cols, w } = seatGrid();
    return [4 + (index % cols) * w, SEATS_Y + Math.floor(index / cols) * (SEAT_H + 2), w, SEAT_H];
  }
  /** The top of the buyers' slots and the trash. */
  const marketTop = (): number => SEATS_Y + seatGrid().rows * (SEAT_H + 2) + 6;
  /** The top of the lines under the table. */
  const linesTop = (): number => marketTop() + CARD_H + LINE + 3;
  /** Where the card of a place is drawn. */
  function cardRect(at: Target): Box {
    if (at.to === "player") {
      const [x, y, w] = seatRect(Math.max(0, latest?.view.order.indexOf(at.player) ?? 0));
      return [x + Math.round((w - CARD_W) / 2), y + 15, CARD_W, CARD_H];
    }
    const count = (latest?.rules.buyers ?? 3) + 1;
    const x0 = Math.round((SCENE_W - ((count - 1) * MARKET_PITCH + CARD_W)) / 2);
    return [x0 + (at.to === "trash" ? count - 1 : at.slot) * MARKET_PITCH, marketTop(), CARD_W, CARD_H];
  }
  /** Where a press chooses a place: a player's whole seat, and a card of the table with its name under it. */
  function pressRect(at: Target): Box {
    if (at.to === "player") return seatRect(Math.max(0, latest?.view.order.indexOf(at.player) ?? 0));
    const [x, y] = cardRect(at);
    return [x - 18, y - 2, CARD_W + 36, CARD_H + LINE + 2];
  }
  /** The two small buttons round the bid, and where its number is. */
  const bidAt = (): [number, number] => [112, linesTop() + 2];
  const lessRect = (x: number, y: number): Box => [x, y - 3, 18, 18];
  const moreRect = (x: number, y: number): Box => [x + 44, y - 3, 18, 18];

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound for it. What it was is in the scene and the column. */
  function show(event: GemEvent): void {
    const you = me();
    if (event.type === "auction") sfx.call();
    else if (event.type === "dealt") sfx.turn();
    else if (event.type === "peek") sfx.look();
    else if (event.type === "exchange") sfx.swap();
    else if (event.type === "shown") {
      const line = event.lines.find((each) => each.player === you);
      const gain = line === undefined ? 0 : line.points + line.taken;
      if (gain > 0) sfx.earn();
      else if (gain < 0) sfx.deny();
      else sfx.look();
    } else if (event.type === "ended" && you !== null && event.reason === "rounds") (own()?.place === 1 ? sfx.win : sfx.lose)();
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  /** Sends a move, once: nothing more is taken until the room has answered. */
  function send(action: unknown): boolean {
    if (!live()) return false;
    pending = handlers.act(action);
    if (!pending) say(WORDS.notSent);
    return pending;
  }

  function update(message: GemMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      speech.clear();
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const now = `${message.startedAt}:${message.view.step}`;
    if (now !== step) {
      // the game waits for something new: the controls start afresh
      step = now;
      bid = 0;
      target = null;
      peeking = false;
    }
    // (a card has been checked: the choice goes back to what to exchange with)
    if (peeking && message.view.peeked.length > 0) {
      peeking = false;
      target = null;
    }
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function changeBid(by: number): void {
    const most = own()?.pieces ?? 0;
    const next = Math.max(0, Math.min(most, bid + by));
    if (next === bid) return;
    bid = next;
    sfx.move();
  }

  /** The digit a key types, or `null`. */
  function digitOf(code: string): number | null {
    const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
    return match === null ? null : Number(match[1]);
  }

  /** Goes into choosing a card to check, or back out of it. */
  function togglePeek(): void {
    if (latest === null) return;
    if (peeking) {
      peeking = false;
      target = null;
      sfx.back();
      return;
    }
    if (!canPeek()) {
      const mineNow = own();
      say(mineNow !== undefined && mineNow.peeks >= latest.rules.peeks ? WORDS.refused["peek-used"] : mineNow !== undefined && mineNow.pieces < latest.rules.peekCost ? WORDS.refused["no-pieces"] : WORDS.refused["no-peek"]);
      sfx.deny();
      return;
    }
    peeking = true;
    target = null;
    sfx.move();
  }

  /** The arrows and a press choose among what could be chosen now. */
  function choose(): void {
    const all = choices();
    if (all.length === 0) return;
    for (const code of keys) {
      if (code !== "ArrowLeft" && code !== "ArrowRight" && code !== "ArrowUp" && code !== "ArrowDown") continue;
      const at = all.findIndex((each) => same(each, target));
      const forward = code === "ArrowRight" || code === "ArrowDown";
      target = all[forward ? (at + 1) % all.length : (at <= 0 ? all.length : at) - 1];
      sfx.move();
    }
    for (const each of all) {
      if (clicks.some((p) => inRect(p, pressRect(each)))) {
        target = each;
        sfx.move();
      }
    }
    // a press on a card of the table while a bomb is held says why it is not chosen
    if (!peeking && latest?.view.bomb === true && places().some((each) => clicks.some((p) => inRect(p, pressRect(each))))) {
      say(WORDS.say.bombOnly);
      sfx.deny();
    }
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
    const what = mine();
    if (what === null || pending) return;
    const enter = pressed("Enter", "NumpadEnter");

    if (what === "bid") {
      for (const code of keys) {
        const digit = digitOf(code);
        if (code === "ArrowUp" || code === "ArrowRight") changeBid(1);
        else if (code === "ArrowDown" || code === "ArrowLeft") changeBid(-1);
        else if (digit !== null) changeBid(digit - bid);
      }
      const [x, y] = bidAt();
      if (clicked(lessRect(x, y), SMALL_REACH)) changeBid(-1);
      if (clicked(moreRect(x, y), SMALL_REACH)) changeBid(1);
      if (enter || clicked(ONE_RECT)) send({ type: "bid", pieces: bid });
      return;
    }
    if (what === "seen" || what === "reveal") {
      if (enter || pressed("Space") || clicked(ONE_RECT)) send({ type: "ready" });
      return;
    }
    // looking at one's card after the deal, or one's turn to exchange: a card may be checked for a piece first
    if (peeking) {
      choose();
      if (pressed("Escape", "KeyP") || clicked(SECOND_RECT)) togglePeek();
      else if (enter || clicked(FIRST_RECT)) {
        if (target === null) {
          say(WORDS.say.pickPeek);
          sfx.deny();
        } else send({ type: "peek", at: target });
      }
      return;
    }
    if (pressed("KeyP") || (canPeek() && clicked(SECOND_RECT))) {
      togglePeek();
      return;
    }
    if (what === "look") {
      if (enter || clicked(canPeek() ? FIRST_RECT : ONE_RECT)) send({ type: "ready" });
      return;
    }
    choose();
    if (enter || clicked(canPeek() ? FIRST_RECT : ONE_RECT)) {
      if (target === null) {
        say(WORDS.say.pickTarget);
        sfx.deny();
      } else send({ type: "exchange", with: target });
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function tick(): void {
    time += STEP;
    if (noteT > 0) noteT -= STEP;
    for (const [player, line] of speech) {
      line.t -= STEP;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // a time that is mine is nearly up: a tick a second
      const what = mine();
      const second = what === "bid" || what === "exchange" ? seconds() : null;
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
  /** A line round a box, `thick` pixels wide, inside its edge. */
  function frame(box: Box, colour: string, thick = 1): void {
    const [x, y, w, h] = box;
    pen.px(x, y, w, thick, colour);
    pen.px(x, y + h - thick, w, thick, colour);
    pen.px(x, y, thick, h, colour);
    pen.px(x + w - thick, y, thick, h, colour);
  }

  /** A card: its face where `card` is known, its back where it is not. */
  function drawCard(box: Box, card: Card | null): void {
    const [x, y, w, h] = box;
    if (card === null) {
      pen.px(x, y, w, h, CARD_BACK_D);
      pen.px(x + 1, y + 1, w - 2, h - 2, CARD_BACK);
      for (let dy = 4; dy < h - 4; dy += 4) pen.px(x + 4, y + dy, w - 8, 1, CARD_BACK_D);
      return;
    }
    const colour = KIND_COLOUR[card.kind];
    pen.px(x, y, w, h, colour);
    pen.px(x + 1, y + 1, w - 2, h - 2, CARD_FACE);
    // the kind by its letter as well as its colour, and the number under it
    pen.txt(WORDS.mark[card.kind], x + Math.round(w / 2), y + 1, colour, "center");
    pen.txt(`${card.value}`, x + Math.round(w / 2), y + 14, C.bone, "center");
  }

  function button(rect: Box, label: string, lit: boolean, on: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : on && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : on ? C.bone : C.dim, "center");
  }

  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  /** The two places of the exchange made last in this round, for a line round each. */
  function lastExchange(): Target[] {
    if (latest === null) return [];
    const view = latest.view;
    const last = view.history.slice(0, seen).at(-1);
    if (last?.type !== "exchange" || last.round !== view.round || (view.phase !== "exchange" && view.phase !== "seen")) return [];
    return [{ to: "player", player: last.player }, last.with];
  }

  /** A card with the line round it that says what it is to this player now. */
  function drawPlace(at: Target, moved: Target[]): void {
    const box = cardRect(at);
    drawCard(box, cardAt(at));
    const round: Box = [box[0] - 2, box[1] - 2, box[2] + 4, box[3] + 4];
    const offered = choices().some((each) => same(each, at)) && (mine() === "exchange" || peeking);
    if (same(target, at)) frame(round, C.teal, 2);
    else if (latest?.view.peeked.some((each) => same(each.at, at))) frame(round, C.amber);
    else if (moved.some((each) => same(each, at))) frame(round, C.steelH);
    else if (offered && inRect(mouse, pressRect(at))) frame(round, C.steel);
  }

  /** The seats, each with its player's name over their card. */
  function drawSeats(moved: Target[]): void {
    if (latest === null) return;
    const view = latest.view;
    const revealed = view.phase === "reveal" ? view.shown : null;
    view.order.forEach((player, index) => {
      const [x, y, w] = seatRect(index);
      const info = latest!.players.find((one) => one.id === player);
      const away = isGone(player) || info?.left === true || info?.connected === false;
      const waited = view.turn === player || (view.phase === "auction" && view.auction !== null && view.auction.bidders.includes(player) && !view.auction.made.includes(player));
      pen.txt(pen.fit(info?.nick ?? "", w - 4), x + Math.round(w / 2), y + 1, away ? C.dim : waited ? C.amber : me() === player ? C.teal : C.bone, "center");
      const at: Target = { to: "player", player };
      const card = cardRect(at);
      // before the first deal there is no card to draw
      if (view.phase !== "auction") drawPlace(at, moved);
      if (view.first === player) pen.txt(WORDS.first, card[0] - 3, card[1] + 1, C.brass, "right");
      // has bid, or is done looking
      const done = view.phase === "auction" ? view.auction?.made.includes(player) === true : (view.phase === "look" || view.phase === "reveal") && view.ready.includes(player);
      // (in the auction there is no card yet: the mark is under the name)
      if (done) pen.px(view.phase === "auction" ? x + Math.round(w / 2) - 2 : card[0] - 9, view.phase === "auction" ? y + 18 : card[1] + 19, 4, 4, C.teal);
      const line = revealed?.lines.find((each) => each.player === player);
      if (line !== undefined) {
        const gain = line.points + line.taken;
        pen.txt(WORDS.signed(gain), card[0] + CARD_W + 3, card[1] + 8, gain > 0 ? C.teal : gain < 0 ? C.crim : C.dim);
      }
    });
  }

  /** The buyers' slots and the trash, each card with its name under it. */
  function drawMarket(moved: Target[]): void {
    if (latest === null || latest.view.phase === "auction") return;
    for (const at of places()) {
      drawPlace(at, moved);
      const [x, y] = cardRect(at);
      pen.txt(whereOf(at), x + Math.round(CARD_W / 2), y + CARD_H + 2, at.to === "trash" ? C.dim : C.boneD, "center");
    }
  }

  /** Under the table: this player's own card, whose secret buddy they are, and what they are choosing. */
  function drawLines(): void {
    if (latest === null) return;
    const view = latest.view;
    const you = view.you;
    if (you === null) return;
    const what = mine();
    const top = linesTop();
    const x = 8;
    const room = SCENE_W - 16;
    const buddy = view.buddyOf === null ? "" : WORDS.scene.buddy(name(view.buddyOf, 120));
    if (view.phase === "auction") {
      const [sx, sy] = bidAt();
      if (what === "bid") {
        pen.txt(WORDS.scene.bid, x, sy, C.bone);
        button(lessRect(sx, sy), "-", false, true);
        button(moreRect(sx, sy), "+", false, true);
        pen.txt(`${bid}`, sx + 31, sy, C.amber, "center");
      } else if (view.auction?.mine !== null && view.auction?.mine !== undefined) pen.txt(WORDS.scene.bidMade(view.auction.mine), x, sy, C.boneD);
      if (view.auction?.again === true) pen.txt(pen.fit(WORDS.scene.bidAgain, room), x, sy + LINE + 6, C.amber);
      pen.txt(pen.fit(buddy, room), x, sy + 2 * LINE + 6, C.teal);
      return;
    }
    if (view.phase === "reveal" && view.shown !== null) {
      const line = view.shown.lines.find((each) => each.player === you);
      let y = top;
      if (line !== undefined) {
        const extra = [line.taken > 0 ? WORDS.scene.taken(line.taken) : "", line.pieces > 0 ? WORDS.scene.diamond(line.pieces) : ""].filter((each) => each !== "");
        pen.txt(pen.fit([WORDS.scene.mine(WORDS.card(line.card), line.points), ...extra].join(" · "), room), x, y, line.points + line.taken > 0 ? C.teal : line.points + line.taken < 0 ? C.crim : C.bone);
        y += LINE;
      }
      if (view.shown.next !== null) pen.txt(pen.fit(WORDS.scene.next(name(view.shown.next, 120)), room), x, y, C.boneD);
      pen.txt(pen.fit(buddy, room), x, y + LINE, C.teal);
      return;
    }
    pen.txt(pen.fit(view.mine === null ? WORDS.scene.myCardHidden : WORDS.scene.myCard(WORDS.card(view.mine)), room), x, top, view.mine === null ? C.dim : view.mine.kind === "bomb" ? C.crim : C.bone);
    pen.txt(pen.fit(buddy, room), x, top + LINE, C.teal);
    const checked = view.peeked[0];
    if (peeking) pen.txt(pen.fit(target === null ? WORDS.scene.noPeek : WORDS.scene.peekAt(whereOf(target)), room), x, top + 2 * LINE, C.amber);
    else if (what === "exchange") pen.txt(pen.fit(target === null ? WORDS.scene.noTarget : WORDS.scene.target(whereOf(target)), room), x, top + 2 * LINE, target === null ? C.boneD : C.teal);
    else if (checked !== undefined) pen.txt(pen.fit(WORDS.scene.peeked(whereOf(checked.at), WORDS.card(checked.card)), room), x, top + 2 * LINE, C.amber);
  }

  /** The final count: each player's points, their secret buddy and that player's points, and what the two come to. */
  function drawFinals(): void {
    if (latest === null || latest.view.finals === null) return;
    pen.txt(pen.fit(WORDS.scene.finals, SCENE_W - 16), 8, SEATS_Y, C.amber);
    latest.view.finals.forEach((line, at) => {
      const y = FINALS_Y + at * FINALS_PITCH;
      const colour = line.player === me() ? C.amber : C.bone;
      pen.txt(`${line.place}`, 8, y, C.brass);
      pen.txt(name(line.player, 70), 22, y, colour);
      pen.txt(`${line.own}`, 118, y, colour, "right");
      pen.txt("×", 122, y, C.dim);
      pen.txt(pen.fit(WORDS.scene.buddyOf(name(line.buddy, 64)), 100), 134, y, C.boneD);
      pen.txt(`${line.buddyPoints}`, 252, y, C.boneD, "right");
      pen.txt("=", 257, y, C.dim);
      pen.txt(`${line.final}`, 298, y, line.final > 0 ? C.teal : line.final < 0 ? C.crim : C.boneD, "right");
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    if (view.phase === "ended" && view.finals !== null) drawFinals();
    else {
      const moved = lastExchange();
      drawSeats(moved);
      drawMarket(moved);
      drawLines();
    }
    // this player's pieces, right of the page's own buttons
    const mineNow = own();
    if (mineNow !== undefined && view.phase !== "ended") pen.txt(WORDS.pieces(mineNow.pieces), SCENE_W - 6, 6, C.brass, "right");
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 104, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const you = me();
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    if (pending) return [WORDS.standing.sending, C.boneD];
    const s = seconds();
    const what = mine();
    const who = view.turn === null ? "" : name(view.turn, 90);
    switch (view.phase) {
      case "auction":
        if (what === "bid") return [view.auction?.again === true ? WORDS.standing.bidAgain(s) : WORDS.standing.bid(s), C.amber];
        return [you !== null && view.auction?.mine !== null ? WORDS.standing.bidWait(s) : WORDS.standing.bidWatch(s), C.bone];
      case "look":
        if (peeking) return [WORDS.standing.peek, C.amber];
        return what === "look" ? [WORDS.standing.look(s), C.amber] : [WORDS.standing.lookWait(s), C.bone];
      case "exchange":
        if (peeking) return [WORDS.standing.peek, C.amber];
        if (what === "exchange") return view.bomb ? [WORDS.standing.exchangeBomb(s), C.crim] : [WORDS.standing.exchange(s), C.amber];
        if (handlers.first && you !== null) return [WORDS.coach.exchangeOther(who, s), C.bone];
        return [WORDS.standing.exchangeOther(who, view.turnAt + 1, view.sequence.length, s), C.bone];
      case "seen":
        return what === "seen" && view.mine !== null ? [WORDS.standing.seen(WORDS.card(view.mine), s), C.amber] : [WORDS.standing.seenOther(who), C.bone];
      default:
        return [view.round >= view.rounds ? WORDS.standing.revealLast(s) : WORDS.standing.reveal(view.round, s), C.bone];
    }
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const you = me();
    const lines: [string, string][] = [];
    const where = (at: Target): string => (at.to === "player" ? name(at.player, 60) : at.to === "trash" ? WORDS.trash : WORDS.buyer(at.slot));
    for (const event of latest.view.history.slice(0, seen)) {
      if (event.type === "auction") lines.push([(event.drawn ? WORDS.log.auctionDrawn : WORDS.log.auction)(name(event.first, 70), event.paid), C.amber]);
      else if (event.type === "dealt") lines.push([WORDS.log.dealt(event.round, name(event.first, 80)), C.boneD]);
      else if (event.type === "peek") lines.push([WORDS.log.peek(name(event.player, 56), where(event.at)), C.dim]);
      else if (event.type === "exchange") lines.push([(event.auto ? WORDS.log.autoExchange : WORDS.log.exchange)(name(event.player, event.auto ? 50 : 64), where(event.with)), event.player === you || (event.with.to === "player" && event.with.player === you) ? C.amber : C.bone]);
      else if (event.type === "shown") {
        lines.push([WORDS.log.shown(event.round, event.buyers.map((card) => WORDS.short(card)).join(" ")), C.teal]);
        const line = event.lines.find((each) => each.player === you);
        if (line !== undefined) lines.push([WORDS.log.shownMine(line.points + line.taken), C.boneD]);
      } else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(view.phase === "ended" ? WORDS.headingOver : view.phase === "auction" ? WORDS.headingAuction : WORDS.heading(view.round, view.rounds), x, 3, C.bone);
    const phase = left(latest.clock.phase);
    if (phase !== null) {
      const all = Math.ceil(phase / 1000);
      const what = mine();
      const hurry = all <= HURRY_FROM && (what === "bid" || what === "exchange");
      pen.txt(`${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`, W - 5, 3, hurry ? C.crim : C.boneD, "right");
    }
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
      if (layout.crowded) pen.txt(`${each.place}`, ex + 12, y, C.brass, "right");
      else pen.txt(`${each.place}`, ex, y, C.brass);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const words = WORDS.points(each.points);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - pen.width(words) - 3 - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const shown = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(shown, nameX, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(shown) + 2, y, voice, time);
      pen.txt(words, right, y, each.points > 0 ? C.teal : each.points < 0 ? C.crim : C.boneD, "right");
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

  /** The pieces a game played to its end pays this player: the reward for their final points, and what they have more than they started with. */
  function piecesWon(): number {
    if (latest === null) return 0;
    const line = latest.view.finals?.find((each) => each.player === me());
    const mineNow = own();
    if (line === undefined || mineNow === undefined) return 0;
    return line.reward + Math.max(0, mineNow.pieces - latest.rules.startPieces);
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    if (latest === null || latest.view.phase !== "ended" || me() === null) return null;
    const mineNow = own();
    return mineNow === undefined ? null : WORDS.result.verdict(true, mineNow.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mineNow = own();
    pen.txt(WORDS.result.verdict(mineNow !== undefined, mineNow?.place ?? 0), 10, 234, mineNow === undefined ? C.bone : mineNow.place === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name; the list beside the scene has everyone
    const first = view.standings.slice(0, PLACES_SHOWN).map((each) => WORDS.result.place(each.place, name(each.player, 56), each.points));
    pen.txt(pen.fit(first.join(" · "), 280), 96, 226, C.bone);
    const end = view.history.at(-1);
    const how = end?.type === "ended" ? WORDS.ended[end.reason] : "";
    pen.txt(mineNow === undefined || view.finals === null ? how : WORDS.result.mine(mineNow.points, piecesWon()), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
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
    const what = mine();
    const [words, colour] = standing();
    pen.txt(pen.fit(words, what === null ? W - 12 : ONE_RECT[0] - 14), 6, 225, colour);
    // which keys open the rules and mute the sound; under a finger, where the menu that does is
    const hint = TOUCH ? PAGE.menu.hint : WORDS.hint;
    if (what === null) {
      // someone watching is told what the game is, over the keys; a player knows, and has the keys there
      if (me() === null) pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(hint, 6, me() === null ? 254 : 240, C.dim);
      return;
    }
    pen.txt(pen.fit(WORDS.keys[peeking ? "peek" : what], ONE_RECT[0] - 14), 6, 240, C.boneD);
    pen.txt(hint, 6, 254, C.dim);
    const on = !pending;
    if (what === "bid") button(ONE_RECT, WORDS.button.bid, on, on);
    else if (what === "seen" || what === "reveal") button(ONE_RECT, WORDS.button.go, on, on);
    else if (peeking) {
      button(FIRST_RECT, WORDS.button.check, on && target !== null, on);
      button(SECOND_RECT, WORDS.button.cancel, false, on);
    } else {
      const label = what === "look" ? WORDS.button.ready : WORDS.button.exchange;
      const lit = on && (what === "look" || target !== null);
      if (canPeek()) {
        button(FIRST_RECT, label, lit, on);
        button(SECOND_RECT, WORDS.button.peek, false, on);
      } else button(ONE_RECT, label, lit, on);
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      deck: WORDS.deck(latest.cards),
      buyers: rules.buyers,
      rounds: rules.rounds,
      bombTaken: rules.bombTaken,
      peekCost: rules.peekCost,
      diamondPieces: rules.diamondPieces,
      rewardFrom: rules.rewardFrom,
      rewardMoreFrom: rules.rewardMoreFrom,
      turnSeconds: rules.turnSeconds,
    });
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
    // an arrow held down moves on; anything else held down is one press
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
    // a pointer that has left the screen, or a finger that has lifted, is over nothing
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
      tick();
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
    // by the room's last word; a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && gemWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether the move reached the room is not known: the game the room sends on coming back will say
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

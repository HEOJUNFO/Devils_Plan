/**
 * The screen of HIT, STAY: the round's limit and pot, a row of cards for
 * every player, and the buttons of whatever is asked of this player: a card
 * to reveal, a bet, a hit or a stay.
 *
 * Design: design/games/hit-stay.md. The room decides everything; this screen
 * shows what it sends and asks it to take what the player does. Nobody else's
 * face-down cards are sent before a showdown, so nothing hidden is here to be
 * drawn. Everything can be done with the pointer; the keys are another way
 * to the same.
 *
 * A player's own face-down cards are drawn dark, the cards everyone sees
 * light: which is which does not rest on a colour alone.
 */
import type { HitEvent, Outcome, SeenHand } from "../../../shared/games/hit-stay/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { hitWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS, outcomeWords } from "./words";

/** What the room sends about a game of HIT, STAY. */
export type HitMessage = Extract<ServerMessage, { type: "game"; game: "hit-stay" }>;
type View = HitMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface HitHandlers {
  /** The player revealed a card, bet, called, folded, hit or stayed. Returns whether it could be sent. */
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
export interface HitScreen {
  update(message: HitMessage): void;
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
/** Over the table, under the page's own buttons: the limit in large numbers, and two lines beside it. */
const TOP_Y = 28;
const TOP_LINES_X = 84;
/** The players' rows: a name and chips, then the cards. */
const ROWS_Y = 58;
/** How far apart the rows are: five fit over the buttons, and fewer are given more room. */
const rowPitch = (players: number): number => Math.min(38, Math.floor(130 / Math.max(1, players)));
const NAME_X = 10;
const NAME_RIGHT = 72;
const CARDS_X = 76;
const CARD: readonly [number, number] = [15, 22];
const CARD_PITCH = 16;
/** The gap between the cards dealt and the additional cards. */
const CARD_GAP = 4;
/** Where a row's cards and the words after them must end. */
const ROW_RIGHT = 300;
/** The buttons of this player's turn, over the bar. */
const ACT_Y = 190;
const ACT_H = 28;
const FOLD_RECT: Box = [2, ACT_Y, 46, ACT_H];
const CALL_RECT: Box = [50, ACT_Y, 62, ACT_H];
const LESS_RECT: Box = [116, ACT_Y, 16, ACT_H];
const AMOUNT_RECT: Box = [134, ACT_Y, 24, ACT_H];
const MORE_RECT: Box = [160, ACT_Y, 16, ACT_H];
const MOST_RECT: Box = [178, ACT_Y, 20, ACT_H];
const BET_RECT: Box = [202, ACT_Y, 100, ACT_H];
const HIT_RECT: Box = [56, ACT_Y, 92, ACT_H];
const STAY_RECT: Box = [156, ACT_Y, 92, ACT_H];
/** The widest a name is drawn in a row, in the list of players and in a line of the log, in pixels. */
const ROW_NAME = 56;
const NAME_WIDTH = 86;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a bet. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;

/** The buttons of the results. */
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link HitScreen.update}. */
export function createHitScreen(canvas: HTMLCanvasElement, handlers: HitHandlers): HitScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: HitMessage | null = null;
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
  /** What the player would bet or raise to, in the round of betting going on. */
  let amount = 1;
  /** The turn the amount was last set for: a new turn starts from the least. */
  let amountFor = "";
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

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
  const handOf = (view: View, player: number): SeenHand | undefined => view.hands.find((hand) => hand.player === player);
  /** The players in the order of their seats, this player's own row first. */
  function seats(view: View): number[] {
    const from = view.you === null ? 0 : Math.max(0, view.players.indexOf(view.you));
    return [...view.players.slice(from), ...view.players.slice(0, from)];
  }
  /** The outcome of the round on the table, while it is on show. */
  const shownOutcome = (view: View): Outcome | null => ((view.phase === "show" || view.phase === "ended") && view.outcome !== null && view.outcome.round === view.round ? view.outcome : null);
  /** What this player is asked for now: a card to reveal, a bet, a hit or a stay; `null` for nothing. */
  function asked(): "reveal" | "bet" | "hit" | null {
    if (latest === null || latest.frozen || latest.view.mine === null) return null;
    const view = latest.view;
    if (view.phase === "reveal") return view.mine?.revealed === null ? "reveal" : null;
    if ((view.phase === "bet" || view.phase === "hit") && view.turn === view.you) return view.phase;
    return null;
  }
  /** My own total, of every card I hold. */
  function myTotal(view: View): number {
    const own = view.you === null ? undefined : handOf(view, view.you);
    return (view.mine?.cards ?? []).reduce((sum, card) => sum + card, 0) + (own?.extra ?? []).reduce((sum, card) => sum + card, 0);
  }
  /** The least and the most this player may bet or raise to now; the least is over the most where nothing can be raised. */
  const range = (view: View): [least: number, most: number] => [Math.max(1, view.high + 1), view.most];

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: HitEvent): void {
    const mine = me();
    if (event.type === "round") {
      if (event.round > 1) sfx.swap();
    } else if (event.type === "revealed") {
      if (mine !== null && event.forced.includes(mine)) say(WORDS.say.revealedForYou);
      sfx.pick();
    } else if (event.type === "bet" || event.type === "call") {
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "fold") {
      if (event.player === mine && event.forced) say(WORDS.say.foldedForYou);
      if (event.player !== mine || event.forced) sfx.back();
    } else if (event.type === "hit") {
      if (event.player !== mine) sfx.pick();
    } else if (event.type === "stay") {
      if (event.player === mine && event.forced) say(WORDS.say.stayedForYou);
      if (event.player !== mine || event.forced) sfx.move();
    } else if (event.type === "won") {
      if (mine !== null && event.winners.includes(mine)) sfx.win();
      else sfx.turn();
    } else if (event.type === "out") {
      // (not where it ends the game: the results say it)
      if (event.player === mine && latest?.view.phase !== "ended") say(WORDS.say.out);
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: HitMessage): void {
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
    const waited = asked() !== null;
    const moved = latest === null || latest.view.events !== message.view.events || latest.view.phase !== message.view.phase;
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // a new turn to bet starts from the least that can be bet
    const view = message.view;
    const turn = `${message.startedAt}.${view.round}.${view.betting}.${view.phase}.${view.turn}.${view.high}`;
    if (turn !== amountFor) {
      amountFor = turn;
      amount = range(view)[0];
    }
    // the game has come to wait on this player
    if (!waited && asked() !== null && !fresh) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function send(action: unknown): void {
    if (pending) return;
    pending = handlers.act(action);
    if (!pending) say(WORDS.notSent);
  }

  /** Where this player's own three cards are drawn, by their place in the hand. */
  function myCardBox(view: View, card: number): Box {
    const row = Math.max(0, seats(view).indexOf(view.you ?? -1));
    return [CARDS_X + card * CARD_PITCH, ROWS_Y + row * rowPitch(view.players.length) + 1, CARD[0], CARD[1]];
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
    const what = asked();
    if (what === null || pending) return;

    if (what === "reveal") {
      const cards = view.mine?.cards.length ?? 0;
      for (let card = 0; card < cards; card++) {
        if (pressed(`Digit${card + 1}`, `Numpad${card + 1}`) || clicked(myCardBox(view, card), 3)) {
          send({ type: "reveal", card });
          if (pending) sfx.pick();
          return;
        }
      }
      return;
    }
    if (what === "hit") {
      if (pressed("KeyD") || clicked(HIT_RECT)) {
        send({ type: "hit" });
        if (pending) sfx.pick();
      } else if (pressed("KeyS") || clicked(STAY_RECT)) {
        send({ type: "stay" });
        if (pending) sfx.move();
      }
      return;
    }
    // a bet
    const [least, most] = range(view);
    const own = view.you === null ? undefined : handOf(view, view.you);
    const toCall = view.high - (own?.bet ?? 0);
    const set = (to: number): void => {
      const next = Math.min(most, Math.max(least, to));
      if (least > most) return deny(WORDS.say.cannotRaise);
      if (next !== amount) sfx.move();
      amount = next;
    };
    for (const code of keys) {
      if (code === "ArrowRight") set(amount + 1);
      else if (code === "ArrowLeft") set(amount - 1);
      else if (code === "ArrowUp") set(most);
      else if (code === "ArrowDown") set(least);
    }
    if (clicked(MORE_RECT)) set(amount + 1);
    if (clicked(LESS_RECT)) set(amount - 1);
    if (clicked(MOST_RECT)) set(most);
    if (pressed("KeyF") || clicked(FOLD_RECT)) {
      send({ type: "fold" });
      if (pending) sfx.back();
    } else if (pressed("KeyC") || clicked(CALL_RECT)) {
      if (toCall <= 0) return deny(WORDS.refused["nothing-to-call"]);
      send({ type: "call" });
      if (pending) sfx.chip();
    } else if (pressed("Enter", "NumpadEnter") || clicked(BET_RECT)) {
      if (least > most) return deny(WORDS.say.cannotRaise);
      send({ type: "bet", to: amount });
      if (pending) sfx.chip();
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
      const mine = asked() !== null ? left(latest.clock.turn) : null;
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
   * One card at (`x`, `y`). `face`: its number, or `null` for a card face
   * down. `how`: `open` a card everyone sees, `own` one of this player's own
   * that nobody else does, `dim` the cards of someone who folded.
   */
  function drawCard(x: number, y: number, face: number | null, how: "open" | "own" | "dim", marked = false): void {
    const [w, h] = CARD;
    if (face === null) {
      pen.px(x, y, w, h, how === "dim" ? C.steelDD : C.steelD);
      pen.px(x + 1, y + 1, w - 2, h - 2, how === "dim" ? C.night : C.btn);
      if (how !== "dim") for (let line = 3; line < h - 3; line += 3) pen.px(x + 3, y + line, w - 6, 1, C.steelDD);
      return;
    }
    const own = how === "own";
    pen.px(x, y, w, h, marked ? C.amber : own ? C.steel : how === "dim" ? C.steelDD : C.bone);
    pen.px(x + 1, y + 1, w - 2, h - 2, own ? C.btnH : how === "dim" ? C.steelD : C.bone);
    const ink = own ? (face < 0 ? "#ff9aa8" : C.bone) : face < 0 ? C.crim : C.ink;
    pen.txt(`${face}`, x + Math.floor(w / 2) + 1, y + 4, how === "dim" ? C.boneD : ink, "center");
  }

  /** The cards of one row, and where they end. */
  function drawCards(view: View, player: number, y: number, outcome: Outcome | null): number {
    const hand = handOf(view, player);
    if (hand === undefined) return CARDS_X;
    const mine = player === view.you ? view.mine : null;
    const shown = outcome?.hands.find((each) => each.player === player);
    const dealt = mine?.cards.length ?? (shown === undefined ? hand.hidden + (hand.revealed === null ? 0 : 1) : shown.cards.length - hand.extra.length);
    // many additional cards are laid closer, so that the row ends inside the table
    const room = ROW_RIGHT - 34 - CARDS_X - dealt * CARD_PITCH - CARD_GAP;
    const pitch = hand.extra.length === 0 ? CARD_PITCH : Math.min(CARD_PITCH, Math.max(6, Math.floor((room - CARD[0]) / Math.max(1, hand.extra.length - 1))));
    const how = hand.folded ? "dim" : "open";
    for (let card = 0; card < dealt; card++) {
      const x = CARDS_X + card * CARD_PITCH;
      if (shown !== undefined) drawCard(x, y, shown.cards[card] ?? null, "open");
      else if (mine !== null && mine !== undefined) {
        const open = view.phase !== "reveal" && mine.revealed === card;
        const pick = asked() === "reveal" && inRect(mouse, [x, y, CARD[0], CARD[1]]);
        drawCard(x, y, mine.cards[card] ?? null, hand.folded ? "dim" : open ? "open" : "own", pick || (view.phase === "reveal" && mine.revealed === card));
      } else drawCard(x, y, card === 0 && hand.revealed !== null ? hand.revealed : null, how);
    }
    let x = CARDS_X + dealt * CARD_PITCH + CARD_GAP;
    hand.extra.forEach((card, at) => {
      drawCard(x, y, card, how);
      x += at === hand.extra.length - 1 ? CARD[0] + 1 : pitch;
    });
    return hand.extra.length === 0 ? x - CARD_GAP : x;
  }

  function drawRows(): void {
    if (latest === null) return;
    const view = latest.view;
    const outcome = shownOutcome(view);
    const awaited = view.phase === "reveal" ? view.hands.filter((hand) => !hand.chosen).map((hand) => hand.player) : view.turn === null ? [] : [view.turn];
    seats(view).forEach((player, row) => {
      const y = ROWS_Y + row * rowPitch(view.players.length);
      const hand = handOf(view, player);
      const out = view.out.some((each) => each.player === player);
      const info = latest!.players.find((each) => each.id === player);
      const gone = out || hand === undefined || hand.folded || (info !== undefined && (info.left || !info.connected));
      if (awaited.includes(player) && view.phase !== "ended") pen.px(4, y + 1, 2, CARD[1], C.amber);
      // the first player: a square before the name
      const first = view.first === player && hand !== undefined;
      if (first) pen.px(NAME_X, y + 4, 5, 5, C.brass);
      pen.txt(pen.fit(info?.nick ?? "", ROW_NAME - (first ? 8 : 0)), NAME_X + (first ? 8 : 0), y - 2, gone ? C.dim : player === view.you ? C.amber : C.bone);
      // their chips, and what they are in the round
      const chips = view.chips.find((each) => each.player === player)?.chips ?? 0;
      pen.px(NAME_X, y + 16, 5, 5, out ? C.steelD : C.amberD);
      pen.px(NAME_X + 1, y + 15, 3, 7, out ? C.steelD : C.amberD);
      pen.txt(`${chips}`, NAME_X + 8, y + 11, out ? C.dim : C.bone);
      const status: [string, string] = out ? [WORDS.row.out, C.crim] : hand === undefined ? ["", C.dim] : hand.folded ? [WORDS.row.folded, C.dim] : [WORDS.row.stake(hand.stake), C.boneD];
      pen.txt(status[0], NAME_RIGHT, y + 11, status[1], "right");
      // the cards, and after them what is to be said of them
      const end = drawCards(view, player, y + 1, outcome);
      if (hand === undefined) return;
      const shown = outcome?.hands.find((each) => each.player === player);
      const share = outcome?.shares.find((each) => each.player === player);
      if (share !== undefined) pen.txt(WORDS.row.share(share.chips), ROW_RIGHT, y + 5, C.teal, "right");
      if (shown !== undefined) {
        pen.txt(WORDS.row.total(shown.total), end + 4, y + 5, shown.total > view.limit ? C.crim : share !== undefined ? C.teal : C.bone);
      } else if (outcome === null) {
        const words: [string, string][] = [];
        if (player === view.you && view.mine !== null && !hand.folded) words.push([WORDS.row.total(myTotal(view)), myTotal(view) > view.limit ? C.crim : C.bone]);
        if (view.phase === "reveal" && !hand.chosen && player !== view.you) words.push([WORDS.row.choosing, C.dim]);
        if (view.phase === "hit" && hand.stayed) words.push([WORDS.row.stayed, C.teal]);
        let x = end + 4;
        for (const [text, colour] of words) {
          pen.txt(pen.fit(text, Math.max(0, ROW_RIGHT - x)), x, y + 5, colour);
          x += pen.width(text) + 6;
        }
      }
    });
  }

  function drawTop(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.txt(WORDS.top.limit, 6, TOP_Y + 6, C.boneD);
    pen.txt(`${view.limit}`, 10 + pen.width(WORDS.top.limit), TOP_Y - 2, C.amber, "left", 24);
    pen.txt(pen.fit(WORDS.top.round(view.round, view.basic), SCENE_W - TOP_LINES_X - 4), TOP_LINES_X, TOP_Y, C.bone);
    const outcome = shownOutcome(view);
    const second = outcome === null ? WORDS.top.pot(view.pot, view.left) : outcomeWords(WORDS, outcome, pen.fit(nickOf(outcome.shares[0]?.player ?? -1), 70));
    pen.txt(pen.fit(second, SCENE_W - TOP_LINES_X - 4), TOP_LINES_X, TOP_Y + 12, outcome === null ? C.boneD : C.teal);
  }

  /** The buttons of what this player is asked for. */
  function drawActions(): void {
    if (latest === null) return;
    const view = latest.view;
    const what = asked();
    if (what === null || what === "reveal") return;
    const live = !pending;
    if (what === "hit") {
      button(HIT_RECT, WORDS.button.hit, live, live);
      button(STAY_RECT, WORDS.button.stay, false, live);
      return;
    }
    const [least, most] = range(view);
    const own = view.you === null ? undefined : handOf(view, view.you);
    const toCall = view.high - (own?.bet ?? 0);
    const can = least <= most;
    button(FOLD_RECT, WORDS.button.fold, false, live);
    button(CALL_RECT, toCall > 0 ? WORDS.button.call(toCall) : WORDS.button.callNone, live && toCall > 0, live && toCall > 0);
    button(LESS_RECT, "-", false, live && can && amount > least);
    pen.px(AMOUNT_RECT[0], AMOUNT_RECT[1], AMOUNT_RECT[2], AMOUNT_RECT[3], C.steelDD);
    pen.px(AMOUNT_RECT[0] + 1, AMOUNT_RECT[1] + 1, AMOUNT_RECT[2] - 2, AMOUNT_RECT[3] - 2, C.night);
    pen.txt(can ? `${amount}` : "-", AMOUNT_RECT[0] + Math.round(AMOUNT_RECT[2] / 2), AMOUNT_RECT[1] + 7, can ? C.amber : C.dim, "center");
    button(MORE_RECT, "+", false, live && can && amount < most);
    button(MOST_RECT, "▲", false, live && can && amount < most);
    const label = !can ? "" : amount === most ? WORDS.button.allIn(amount) : view.high > 0 ? WORDS.button.raise(amount) : WORDS.button.bet(amount);
    button(BET_RECT, label, live && can && toCall <= 0, live && can);
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawTop();
    drawRows();
    if (view.phase !== "ended") drawActions();
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
    const mine = me();
    const what = asked();
    const who = (player: number | null): string => pen.fit(nickOf(player ?? -1), NAME_WIDTH);
    if (view.phase === "show") return [WORDS.standing.show(clock), C.boneD];
    if (view.phase === "reveal") {
      if (what === "reveal") return [WORDS.standing.reveal(clock), C.amber];
      return [view.mine === null ? WORDS.standing.revealOther(clock) : WORDS.standing.revealed(clock), C.bone];
    }
    if (view.phase === "bet") {
      if (what !== "bet") return [mine !== null && view.mine === null && view.out.some((each) => each.player === mine) ? WORDS.standing.outOf : WORDS.standing.betOther(view.betting, who(view.turn), clock), C.bone];
      const own = mine === null ? undefined : handOf(view, mine);
      const toCall = view.high - (own?.bet ?? 0);
      if (toCall <= 0) return [WORDS.standing.betOpen(view.betting, view.most, clock), C.amber];
      return [view.most > view.high ? WORDS.standing.betCall(view.betting, toCall, view.most, clock) : WORDS.standing.betCallOnly(view.betting, toCall, clock), C.amber];
    }
    if (what === "hit") return [WORDS.standing.hit(myTotal(view), view.limit, clock), C.amber];
    return [mine !== null && view.mine === null && view.out.some((each) => each.player === mine) ? WORDS.standing.outOf : WORDS.standing.hitOther(who(view.turn), clock), C.bone];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, view.limit), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order of their seats; at its end, of their places
    const order = view.places !== null ? view.places.map((each) => each.player) : view.players;
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    const awaited = view.phase === "reveal" ? view.hands.filter((hand) => !hand.chosen).map((hand) => hand.player) : view.turn === null ? [] : [view.turn];
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const out = view.out.some((each) => each.player === player);
      const gone = out || (info !== undefined && (info.left || !info.connected));
      const place = view.places?.find((each) => each.player === player)?.place;
      // who the game waits for
      if (view.phase !== "ended" && awaited.includes(player)) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const chips = view.chips.find((each) => each.player === player)?.chips ?? 0;
      const words = place !== undefined ? WORDS.result.verdict(true, place) : out ? WORDS.row.out : `${chips}`;
      pen.txt(words, right, y, place !== undefined ? C.brass : out ? C.dim : C.bone, "right");
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
      if (event.type === "round") lines.push([WORDS.log.round(event.round, event.limit, event.basic), C.amber]);
      else if (event.type === "revealed") lines.push([WORDS.log.revealed, C.boneD]);
      else if (event.type === "bet") lines.push([(event.allIn ? WORDS.log.allIn : event.raise ? WORDS.log.raise : WORDS.log.bet)(short(event.player), event.to), C.bone]);
      else if (event.type === "call") lines.push([(event.allIn ? WORDS.log.callAllIn : WORDS.log.call)(short(event.player)), C.boneD]);
      else if (event.type === "fold") lines.push([WORDS.log.fold(short(event.player), event.forced), C.dim]);
      else if (event.type === "hit") lines.push([WORDS.log.hit(short(event.player), event.card), C.boneD]);
      else if (event.type === "stay") lines.push([WORDS.log.stay(short(event.player), event.forced), C.boneD]);
      else if (event.type === "won") lines.push([event.winners.length === 1 ? WORDS.log.won(short(event.winners[0]), event.pot) : WORDS.log.tied(event.pot), C.teal]);
      else if (event.type === "out") lines.push([WORDS.log.out(short(event.player)), C.crim]);
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
    // (the first three: everyone's place is in the list beside the table)
    const named = places.slice(0, 3).map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 56))).join(" · ");
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
    const what = asked();
    const keysNow = TOUCH ? PAGE.menu.hint : what === "bet" ? WORDS.keys.bet : what === "hit" ? WORDS.keys.hit : idle;
    pen.txt(pen.fit(keysNow, W - 12), 6, 246, C.dim);
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
    // (an arrow held down goes on changing the amount; every other key counts once)
    if (!event.repeat || event.code === "ArrowLeft" || event.code === "ArrowRight") keys.push(event.code);
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
    waits: (): boolean => latest !== null && !latest.frozen && hitWaits(latest.view),
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

/**
 * The screen of 큐브 세기: the solid to count, the number being entered, and
 * who has the answer already.
 *
 * Design: design/games/count-cubes.md. The room decides everything; this
 * screen shows what it sends and asks it to take an answer. The number is
 * entered with the keyboard or with the buttons along the bar, which are
 * there for a screen that has no keys. The solid can be turned and looked at
 * from any side, by dragging its picture or with the arrow keys: that is
 * this screen's own doing, and nothing the room is told.
 */
import type { CubesEvent, Solid } from "../../../shared/games/count-cubes/rules";
import { FIRST_VIEW, SHADE, dragged, shadesOf, turned, type View } from "../../../shared/games/count-cubes/view";
import { typeAnswer } from "../../../shared/games/count-rectangles/typing";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 큐브 세기. */
export type CubesMessage = Extract<ServerMessage, { type: "game"; game: "count-cubes" }>;

/** What the screen asks of whoever owns the connection. */
export interface CubesHandlers {
  /** The player gave an answer. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): void;
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
export interface CubesScreen {
  update(message: CubesMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** Where the solid is drawn: the part of the scene under the page's own buttons. */
const PICTURE = { x: 8, y: 24, w: 288, h: 190 };
/** Degrees the solid turns, and tilts, for one press of an arrow key: a key held down goes on at the keyboard's own pace. */
const TURN_STEP = 5;
const TILT_STEP = 3;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 62;
/** With this many seconds or fewer of the problem left, the clock turns red. */
const HURRY_FROM = 10;
/**
 * Seconds the results are on show before Enter starts another game: the host
 * may have been pressing Enter to give an answer at the moment the game ended.
 */
const RESULTS_HOLD = 1.5;
/** How many of those with the answer the results name in the bar. */
const PLACES_SHOWN = 3;
/**
 * A cube's faces by the way they look, and the line between cubes. The four
 * sides go light, dark, light, dark round the solid, so that the two that
 * show together are never alike; at the first view they are the left and the
 * right of pixel art's cube.
 */
const SHADE_COLOURS: Record<number, string> = {
  [SHADE.line]: "#161a2b",
  [SHADE.top]: "#c3c9dc",
  [SHADE.south]: "#7c8296",
  [SHADE.east]: "#4b5066",
  [SHADE.north]: "#8a90a6",
  [SHADE.west]: "#5b6178",
};
/** The same as the four bytes of a pixel, by shade; nothing for where nothing stands. */
const SHADE_BYTES: (readonly number[] | undefined)[] = [];
for (const [shade, colour] of Object.entries(SHADE_COLOURS)) {
  const value = Number.parseInt(colour.slice(1), 16);
  SHADE_BYTES[Number(shade)] = [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The picture of the solid, as a place to take hold of it. */
const PICTURE_RECT: Box = [PICTURE.x, PICTURE.y, PICTURE.w, PICTURE.h];
/** The number being entered. */
const TYPED_RECT: Box = [6, 238, 80, 30];
/** The buttons along the bar, in order, and the key each stands for. */
const PAD: readonly { label: string; code: string }[] = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => ({ label: digit, code: `Digit${digit}` })),
  { label: WORDS.pad.erase, code: "Backspace" },
  { label: WORDS.pad.enter, code: "Enter" },
];
const padRect = (index: number): Box => [92 + index * 32, 238, 30, 30];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

/** `ms` as seconds with one decimal: how long an answer took. */
const seconds1 = WORDS.took;

/**
 * Draws `solid` on `picture` as it looks from `view` (`view.ts`): every cube
 * face that shows in the shade of the way it looks, with a dark line where
 * it ends, so that the cubes can be told apart and counted. Where nothing
 * stands the picture is left clear.
 */
function paintSolid(picture: HTMLCanvasElement, solid: Solid, view: View): void {
  const context = picture.getContext("2d");
  if (context === null) return;
  const shades = shadesOf(solid, view, picture.width, picture.height);
  const image = context.createImageData(picture.width, picture.height);
  for (let at = 0; at < shades.length; at++) {
    const bytes = SHADE_BYTES[shades[at]];
    if (bytes !== undefined) image.data.set(bytes, at * 4);
  }
  context.putImageData(image, 0, 0);
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link CubesScreen.update}. */
export function createCubesScreen(canvas: HTMLCanvasElement, handlers: CubesHandlers): CubesScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: CubesMessage | null = null;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clocks are counted from here in real time: the screen's `time`
   * stops while the tab is hidden.
   */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
  let seen = 0;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The digits entered so far. */
  let typed = "";
  /** From where the solid is looked at: the player turns it by dragging its picture, or with the arrow keys. */
  let angle: View = FIRST_VIEW;
  /** The picture of the solid, and the game and the view it was last drawn for. */
  const pictureCanvas = document.createElement("canvas");
  pictureCanvas.width = PICTURE.w;
  pictureCanvas.height = PICTURE.h;
  let painted: { of: number; angle: View } | null = null;
  /** The pointer that is turning the solid, and where it last was. */
  let drag: { id: number; x: number; y: number } | null = null;
  /** The arrow keys pressed since the last step: each press, and each time a key held down says itself again. */
  const arrows: string[] = [];
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed. */
  const keys: string[] = [];
  const clicks: { x: number; y: number }[] = [];
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
  /** The place `player` took, from 1, or `null` while they are without the answer. */
  function placeOf(player: number): number | null {
    const at = latest?.view.ranked.findIndex((entry) => entry.player === player) ?? -1;
    return at < 0 ? null : at + 1;
  }
  /** How long `player` is still shut out, in ms; 0 when they are not. */
  function lockOf(player: number): number {
    return left(latest?.clock.locks.find((lock) => lock.player === player)?.left ?? null) ?? 0;
  }
  /** Whether the player at this screen could give an answer now. */
  function canAnswer(): boolean {
    const mine = me();
    return latest !== null && mine !== null && latest.view.phase === "open" && !latest.frozen && placeOf(mine) === null && lockOf(mine) <= 0;
  }
  const maxDigits = (): number => `${latest?.rules.maxSaid ?? 999}`.length;
  /** Whether the buttons that enter a number are on the screen. */
  const padShown = (): boolean => latest !== null && latest.view.phase === "open" && me() !== null && !help;

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound, and a word when it was the player's own. */
  function show(event: CubesEvent): void {
    const mine = me();
    if (event.type === "right") {
      if (event.player === mine) {
        say(WORDS.say.right(event.place));
        sfx.win();
      } else sfx.pick();
    } else if (event.type === "wrong") {
      if (event.player === mine) {
        say(WORDS.say.wrong(latest?.rules.lockSeconds ?? 0));
        sfx.deny();
      } else sfx.back();
    } else if (mine !== null && placeOf(mine) === null) {
      sfx.lose();
    }
  }

  function update(message: CubesMessage): void {
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      typed = "";
      speech.clear();
      // another solid is first looked at from its own low corner
      angle = FIRST_VIEW;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: Box): boolean => clicks.some((p) => inRect(p, rect));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    if (help || was) return;

    // Turning the solid is looking, not playing: it is there for someone watching and after the game too.
    // An arrow turns it the way a drag in that direction does.
    for (const code of arrows) {
      if (code === "ArrowLeft") angle = turned(angle, TURN_STEP, 0);
      else if (code === "ArrowRight") angle = turned(angle, -TURN_STEP, 0);
      else if (code === "ArrowDown") angle = turned(angle, 0, TILT_STEP);
      else if (code === "ArrowUp") angle = turned(angle, 0, -TILT_STEP);
    }
    if (pressed("KeyV")) angle = FIRST_VIEW;

    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape") || clicked(LOBBY_RECT)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT))) {
        if (host) handlers.again();
        else say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (me() === null) return;

    // a button of the bar is already among the keys, in the place it was pressed (see the pointer listener)
    if (keys.length === 0) return;
    const before = typed;
    const result = typeAnswer(typed, keys, maxDigits());
    typed = result.typed;
    if (typed !== before) sfx.move();
    if (result.said === null) return;
    const mine = me();
    if (pending) return;
    if (mine !== null && placeOf(mine) !== null) {
      say(WORDS.refused["already-right"]);
    } else if (latest.frozen) {
      say(WORDS.say.paused);
    } else if (!canAnswer()) {
      say(WORDS.say.lockedFor(Math.ceil(lockOf(mine ?? -1) / 1000)));
      sfx.deny();
    } else {
      pending = handlers.act({ type: "answer", said: result.said });
      if (pending) typed = "";
      else say(WORDS.notSent);
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
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
    }
    stepInput();
    keys.length = 0;
    arrows.length = 0;
    clicks.length = 0;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    if (painted === null || painted.of !== latest.startedAt || painted.angle !== angle) {
      paintSolid(pictureCanvas, latest.view.solid, angle);
      painted = { of: latest.startedAt, angle };
    }
    // How the solid is turned, in the corner; the picture goes over it, so that where a solid reaches the corner it is the solid that shows.
    pen.txt(angle === FIRST_VIEW ? WORDS.turn.hint : WORDS.turn.back, SCENE_W - 6, BAR_Y - 15, C.dim, "right");
    ctx.drawImage(pictureCanvas, PICTURE.x, PICTURE.y);
    if (latest.frozen) {
      // the game's own clocks stand still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      const words = WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000));
      plate(words, PICTURE.y + Math.round(PICTURE.h / 2) - 9, C.boneD);
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
    const have = WORDS.solved(view.ranked.length, view.needed);
    if (mine === null) return [WORDS.standing.watching(have), C.bone];
    const place = placeOf(mine);
    if (place !== null) return [WORDS.standing.right(place, have), C.teal];
    if (pending) return [WORDS.standing.sending, C.boneD];
    const lock = lockOf(mine);
    if (lock > 0) return [WORDS.standing.wrong(Math.ceil(lock / 1000)), C.crim];
    return [WORDS.standing.ask, C.amber];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), NAME_WIDTH) : "";
      if (event.type === "right") lines.push([WORDS.log.right(who, event.place, seconds1(event.took)), C.teal]);
      else if (event.type === "wrong") lines.push([WORDS.log.wrong(who), C.crim]);
      else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  /** The players: those with the answer first, in their order, then the rest as they are numbered. */
  function listOrder(): number[] {
    if (latest === null) return [];
    const ranked = latest.view.ranked.map((entry) => entry.player);
    return [...ranked, ...latest.players.map((player) => player.id).filter((id) => !ranked.includes(id))];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.solved(view.ranked.length, view.needed), x, 3, C.bone);
    const problem = left(latest.clock.problem);
    if (problem !== null) {
      const all = Math.ceil(problem / 1000);
      const words = `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
      pen.txt(words, W - 5, 3, all <= HURRY_FROM ? C.crim : C.boneD, "right");
    }
    const order = listOrder();
    const layout = panelLayout(order.length);
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      const right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((each) => each.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = placeOf(player);
      // a place of two figures needs more room than one
      if (layout.crowded) pen.txt(place === null ? "-" : `${place}`, ex + 12, y, place === null ? C.dim : C.brass, "right");
      else pen.txt(place === null ? "-" : `${place}`, ex, y, place === null ? C.dim : C.brass);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const [ways, colour] = stateOf(player, layout.crowded);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      // the name comes first: of the ways to say the rest, the first that leaves the name whole, or else the shortest
      const whole = Math.min(NAME_WIDTH, pen.width(info?.nick ?? ""));
      const roomBeside = (said: string): number => right - nameX - (said === "" ? 0 : pen.width(said) + 3) - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const words = ways.find((said) => roomBeside(said) >= whole) ?? ways[ways.length - 1];
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, roomBeside(words)));
      pen.txt(name, nameX, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(name) + 2, y, voice, time);
      if (words !== "") pen.txt(words, right, y, colour, "right");
    });
    pen.px(x, layout.crowded ? underList(layout) : 86, PANEL_WIDTH, 1, C.steelDD);
    const lines = logLines();
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /**
   * What the list says of `player` beside their name, and its colour: how
   * long they took, how long they are locked, how often they were wrong.
   * Several ways of saying it, the longest first; `short` is for a crowded
   * list, where an entry has half the width and the name needs most of it.
   */
  function stateOf(player: number, short: boolean): [string[], string] {
    if (latest === null) return [[""], C.dim];
    const view = latest.view;
    const took = view.ranked.find((entry) => entry.player === player)?.took;
    const lock = lockOf(player);
    const wrong = view.wrong.find((entry) => entry.player === player)?.count ?? 0;
    if (took !== undefined) return [WORDS.state.took(took, short), C.teal];
    if (lock > 0 && view.phase === "open") return [WORDS.state.locked(Math.ceil(lock / 1000), short), C.crim];
    if (view.phase === "ended") return [WORDS.state.unanswered(short), C.dim];
    if (wrong > 0) return [WORDS.state.wrong(wrong, short), C.boneD];
    return [WORDS.state.counting(short), C.dim];
  }

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** The number being entered, and the buttons that enter it. */
  function drawEntry(): void {
    if (latest === null) return;
    const live = canAnswer() && !pending;
    const [x, y, w, h] = TYPED_RECT;
    pen.px(x, y, w, h, live ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, C.ink);
    if (typed !== "") pen.txt(typed, x + w - 8, y + 3, live ? C.bone : C.dim, "right", 24);
    // a mark where the next digit goes, while an answer can be given
    else if (live && Math.sin(time * 6) > 0) pen.px(x + w - 12, y + 6, 2, 18, C.amber);
    PAD.forEach((key, index) => button(padRect(index), key.label, key.code === "Enter" && live && typed !== "", live));
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const place = mine === null ? null : placeOf(mine);
    const words = WORDS.result.verdict(mine !== null, place);
    pen.txt(words, 10, 234, mine === null ? C.bone : place === null ? C.crim : C.teal, "left", 24);
    // the first three by name; the list beside the picture has everyone, with their times
    const places = view.ranked.slice(0, PLACES_SHOWN).map((entry, at) => WORDS.result.place(at + 1, pen.fit(nickOf(entry.player), 56)));
    pen.txt(pen.fit(places.length > 0 ? places.join(" · ") : WORDS.result.nobody, 280), 96, 226, C.bone);
    pen.txt(WORDS.result.answer(`${view.answer ?? "?"}`), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? WORDS.result.hostNext(latest.players.length === 1) : WORDS.result.waitHost, 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, WORDS.button.again, true, true);
    button(LOBBY_RECT, WORDS.button.lobby, false, true);
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
    pen.txt(pen.fit(words, W - 12), 6, 225, colour);
    if (me() !== null) drawEntry();
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help(rules.lockSeconds, Math.round(rules.problemSeconds / 60), latest.players.length === 1);
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

  function toScreen(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * W) / (rect.width || W), y: ((event.clientY - rect.top) * H) / (rect.height || H) };
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not for the game, and neither is one pressed on a button
    // the player has gone to with the keyboard: that key is the button's
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    startAudio();
    // a digit held down is one digit
    if (!event.repeat) keys.push(event.code);
    // an arrow held down goes on turning the solid, and does not scroll the page
    if (event.code.startsWith("Arrow")) arrows.push(event.code);
    if (event.code === "Space" || event.code === "Backspace" || event.code.startsWith("Arrow")) event.preventDefault();
  };
  /** Whether a drag that begins at `p` turns the solid: on its picture, and not under the rules sheet. */
  const onPicture = (p: { x: number; y: number }): boolean => !help && latest !== null && inRect(p, PICTURE_RECT);
  /** The pointer shows that the picture can be taken hold of. */
  const showGrip = (p: { x: number; y: number }): void => {
    canvas.style.cursor = drag !== null ? "grabbing" : onPicture(p) ? "grab" : "";
  };
  const onPointerMove = (event: PointerEvent): void => {
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    if (drag !== null && event.pointerId === drag.id) {
      angle = dragged(angle, p.x - drag.x, p.y - drag.y);
      drag.x = p.x;
      drag.y = p.y;
    }
    showGrip(p);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.id) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    showGrip(toScreen(event));
  };
  const onPointerDown = (event: PointerEvent): void => {
    startAudio();
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    clicks.push(p);
    if (drag === null && onPicture(p)) {
      drag = { id: event.pointerId, x: p.x, y: p.y };
      // the drag goes on when the pointer leaves the frame
      canvas.setPointerCapture(event.pointerId);
      showGrip(p);
    }
    // A button of the bar stands for a key and takes its place among the keys as they came: a digit
    // clicked and Enter typed straight after it can reach one slow frame together, and must not be
    // read as Enter and then the digit (the answer would go without its last digit).
    const key = padShown() ? PAD.find((_, index) => inRect(p, padRect(index))) : undefined;
    if (key !== undefined) keys.push(key.code);
  };
  addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

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
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
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
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      // the canvas goes on to the next screen with the pointer it had
      canvas.style.cursor = "";
    },
  };
}

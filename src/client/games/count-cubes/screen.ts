/**
 * The screen of 큐브 세기: the solid to count, the number being entered, and
 * who has the answer already.
 *
 * Design: design/games/count-cubes.md. The room decides everything; this
 * screen shows what it sends and asks it to take an answer. The number is
 * entered with the keyboard or with the buttons along the bar, which are
 * there for a screen that has no keys.
 */
import { heightAt, type CubesEvent, type Solid } from "../../../shared/games/count-cubes/rules";
import { typeAnswer } from "../../../shared/games/count-rectangles/typing";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";

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
/** Half the width of a cube's top, in pixels: the largest and the smallest it is drawn. Even, so that its edges fall on whole pixels. */
const MAX_CUBE = 16;
const MIN_CUBE = 6;
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
/** Said when something could not be sent because the connection is down. */
const NOT_SENT_TEXT = "연결이 끊겨 보내지 못했습니다. 다시 해 주세요";
/** The three faces of a cube that show, and the line between cubes. */
const TOP = "#c3c9dc";
const LEFT = "#7c8296";
const RIGHT = "#4b5066";
const EDGE = "#161a2b";

const REFUSED_TEXT: Record<string, string> = {
  "locked": "아직 답할 수 없습니다",
  "already-right": "이미 맞혔습니다",
  "bad-action": "그 숫자는 답으로 낼 수 없습니다",
  "game-over": "이 판은 끝났습니다",
  "not-playing": "관전 중에는 참여할 수 없습니다",
  "not-seated": "관전 중에는 참여할 수 없습니다",
  "no-game": "진행 중인 판이 없습니다",
  "not-host": "방장만 새 판을 시작할 수 있습니다",
  "too-few": "두 명 이상이어야 합니다",
  "already-playing": "이미 판이 진행 중입니다",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
  "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
};

/** How a game ended, as the log says it. */
const ENDED_TEXT: Record<"ranked" | "time" | "abandoned", string> = {
  ranked: "순위가 정해져 끝",
  time: "제한 시간이 지나 끝",
  abandoned: "이어갈 사람이 없어 끝",
};

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The number being entered. */
const TYPED_RECT: Box = [6, 238, 80, 30];
/** The buttons along the bar, in order, and the key each stands for. */
const PAD: readonly { label: string; code: string }[] = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => ({ label: digit, code: `Digit${digit}` })),
  { label: "지움", code: "Backspace" },
  { label: "입력", code: "Enter" },
];
const padRect = (index: number): Box => [92 + index * 32, 238, 30, 30];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

/** `ms` as seconds with one decimal: how long an answer took. */
const seconds1 = (ms: number): string => `${(ms / 1000).toFixed(1)}초`;

/**
 * Draws `solid` on a picture of its own, looked at from the corner where its
 * rows and columns end. Every cube face that shows is drawn by itself, with
 * a dark line where it meets the next, so that the cubes can be told apart
 * and counted; a face behind another cube is left out, and nothing overlaps.
 */
function pictureOf(solid: Solid): HTMLCanvasElement {
  const picture = document.createElement("canvas");
  picture.width = PICTURE.w;
  picture.height = PICTURE.h;
  const context = picture.getContext("2d");
  if (context === null) return picture;
  context.imageSmoothingEnabled = false;
  const pen = new Pen(context);
  const { rows, cols } = solid;
  const top = Math.max(...solid.heights);
  // the largest cube at which the whole solid is in the picture
  let a = MAX_CUBE;
  while (a > MIN_CUBE && ((rows + cols) * a > PICTURE.w || ((rows + cols) * a) / 2 + top * a > PICTURE.h)) a -= 2;
  const half = a / 2;
  // the middle of the back corner's column, and the top row of its square of floor
  const ox = Math.floor((PICTURE.w - (rows + cols) * a) / 2) + rows * a;
  const oy = Math.floor((PICTURE.h - ((rows + cols) * half + top * a)) / 2) + top * a;

  /** The top of a cube: a lozenge `2a` wide and `a` high whose first row is `cy`. Its two near edges are lined. */
  function topFace(cx: number, cy: number): void {
    for (let i = 0; i < a; i++) {
      const w = i < half ? 4 * i + 2 : 4 * (a - 1 - i) + 2;
      const x = cx - w / 2;
      pen.px(x, cy + i, w, 1, TOP);
      if (i >= half) {
        pen.px(x, cy + i, 2, 1, EDGE);
        pen.px(x + w - 2, cy + i, 2, 1, EDGE);
      }
    }
  }
  /** The face to the left under the top whose first row is `cy`: it steps down a pixel every two. */
  function leftFace(cx: number, cy: number): void {
    for (let s = 0; s < half; s++) {
      const x = cx - a + 1 + 2 * s;
      const w = s === half - 1 ? 1 : 2;
      const y = cy + half + s + 1;
      pen.px(x, y, w, a, LEFT);
      pen.px(x, y + a - 1, w, 1, EDGE);
      if (s === 0) pen.px(x, y, 1, a, EDGE);
    }
  }
  /** The face to the right: the left one in a mirror. */
  function rightFace(cx: number, cy: number): void {
    for (let s = 0; s < half; s++) {
      const w = s === half - 1 ? 1 : 2;
      const x = s === half - 1 ? cx : cx + a - 3 - 2 * s;
      const y = cy + half + s + 1;
      pen.px(x, y, w, a, RIGHT);
      pen.px(x, y + a - 1, w, 1, EDGE);
      if (s === 0) pen.px(x + 1, y, 1, a, EDGE);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const height = heightAt(solid, row, col);
      if (height === 0) continue;
      const cx = ox + (col - row) * a;
      const floor = oy + (col + row) * half;
      // the sides show above whatever stands in front of them
      for (let k = heightAt(solid, row + 1, col); k < height; k++) leftFace(cx, floor - (k + 1) * a);
      for (let k = heightAt(solid, row, col + 1); k < height; k++) rightFace(cx, floor - (k + 1) * a);
      topFace(cx, floor - height * a);
    }
  }
  return picture;
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
  /** The solid as drawn, and the game it was drawn for. */
  let picture: { of: number; canvas: HTMLCanvasElement } | null = null;
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
        say(`정답! ${event.place}위`);
        sfx.win();
      } else sfx.pick();
    } else if (event.type === "wrong") {
      if (event.player === mine) {
        say(`오답! ${latest?.rules.lockSeconds ?? 0}초 동안 답할 수 없습니다`);
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
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    if (picture === null || picture.of !== message.startedAt) picture = { of: message.startedAt, canvas: pictureOf(message.view.solid) };
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

    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape") || clicked(LOBBY_RECT)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT))) {
        if (host) handlers.again();
        else say(REFUSED_TEXT["not-host"]);
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
      say(REFUSED_TEXT["already-right"]);
    } else if (latest.frozen) {
      say("판이 멈춰 있습니다");
    } else if (!canAnswer()) {
      say(`${Math.ceil(lockOf(mine ?? -1) / 1000)}초 뒤에 다시 답할 수 있습니다`);
      sfx.deny();
    } else {
      pending = handlers.act({ type: "answer", said: result.said });
      if (pending) typed = "";
      else say(NOT_SENT_TEXT);
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
    if (picture !== null) ctx.drawImage(picture.canvas, PICTURE.x, PICTURE.y);
    if (latest.frozen) {
      // the game's own clocks stand still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      const words = stand === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${Math.ceil(stand / 1000)}초`;
      plate(words, PICTURE.y + Math.round(PICTURE.h / 2) - 9, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const mine = me();
    if (noteT > 0) return [note, C.amber];
    if (offline) return ["연결이 끊겼습니다. 다시 연결하는 중", C.crim];
    if (view.phase === "ended") return ["판이 끝났습니다", C.amber];
    if (latest.frozen) return ["판이 멈춰 있습니다", C.boneD];
    const have = `정답 ${view.ranked.length}/${view.needed}명`;
    if (mine === null) return [`관전 중 · ${have}`, C.bone];
    const place = placeOf(mine);
    if (place !== null) return [`정답! ${place}위 · 다른 사람들을 기다리는 중 (${have})`, C.teal];
    if (pending) return ["보내는 중", C.boneD];
    const lock = lockOf(mine);
    if (lock > 0) return [`오답 · ${Math.ceil(lock / 1000)}초 뒤에 다시 답할 수 있습니다`, C.crim];
    return ["큐브는 모두 몇 개? 숫자를 넣고 Enter (또는 아래 버튼)", C.amber];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), NAME_WIDTH) : "";
      if (event.type === "right") lines.push([`${who}: 정답 (${event.place}위, ${seconds1(event.took)})`, C.teal]);
      else if (event.type === "wrong") lines.push([`${who}: 오답`, C.crim]);
      else lines.push([ENDED_TEXT[event.reason], C.amber]);
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
    pen.txt(`정답 ${view.ranked.length}/${view.needed}명`, x, 3, C.bone);
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
    if (took !== undefined) {
      const whole = Math.floor(took / 1000);
      return [short ? [`${whole}초`, `${whole}`] : [seconds1(took)], C.teal];
    }
    if (lock > 0 && view.phase === "open") {
      const still = Math.ceil(lock / 1000);
      return [short ? [`잠김 ${still}`, `${still}초`, `${still}`] : [`잠김 ${still}초`], C.crim];
    }
    if (view.phase === "ended") return [short ? ["-"] : ["미정답"], C.dim];
    if (wrong > 0) return [short ? [`오답 ${wrong}`, `×${wrong}`] : [`오답 ${wrong}번`], C.boneD];
    return [short ? [""] : ["세는 중"], C.dim];
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
    const words = mine === null ? "종료" : place === null ? "미정답" : `${place}위`;
    pen.txt(words, 10, 234, mine === null ? C.bone : place === null ? C.crim : C.teal, "left", 24);
    // the first three by name; the list beside the picture has everyone, with their times
    const places = view.ranked.slice(0, PLACES_SHOWN).map((entry, at) => `${at + 1}위 ${pen.fit(nickOf(entry.player), 56)}`);
    pen.txt(pen.fit(places.length > 0 ? places.join(" · ") : "아무도 맞히지 못했습니다", 280), 96, 226, C.bone);
    pen.txt(`큐브는 모두 ${view.answer ?? "?"}개였습니다`, 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? "같은 사람들과 한 판 더 하거나 대기실로" : "방장이 새 판을 시작하기를 기다리는 중", 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, "Enter 새 판", true, true);
    button(LOBBY_RECT, "Esc 대기실로", false, true);
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
    const lines: [string, string][] = [
      ["큐브 세기: 규칙", C.amber],
      ["그림의 입체가 큐브 몇 개로 되어 있는지 세어, 그 수를 각자 입력합니다.", C.bone],
      ["", C.bone],
      ["입체는 속이 꽉 차 있습니다. 보이는 큐브 밑에 깔린 큐브도 셉니다.", C.bone],
      ["뒤쪽이 앞쪽보다 낮은 곳은 없어서, 다른 큐브 뒤에 숨은 기둥은 없습니다.", C.boneD],
      ["", C.bone],
      ["답이 맞으면 맞힌 순서대로 순위가 정해집니다. 누가 맞히고 틀렸는지는", C.bone],
      ["모두에게 알려지지만, 입력한 숫자는 알려지지 않습니다.", C.bone],
      [`틀리면 ${rules.lockSeconds}초 동안 답할 수 없습니다.`, C.bone],
      ["한 명만 남기고 모두 맞히면 끝납니다.", C.bone],
      [`제한 시간은 ${Math.round(rules.problemSeconds / 60)}분입니다. 시간이 지나면 그때까지 맞힌 사람만 순위에 듭니다.`, C.boneD],
      ["", C.bone],
      ["숫자 키: 입력 · Backspace: 지움 · Enter: 답하기 (아래 버튼도 같음)", C.boneD],
      ["H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", C.amber],
    ];
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach(([text, colour], i) => {
      if (text !== "") pen.txt(text, 22, 20 + i * 15, colour);
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
    if (event.code === "Space" || event.code === "Backspace") event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent): void => {
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
  };
  const onPointerDown = (event: PointerEvent): void => {
    startAudio();
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    clicks.push(p);
    // A button of the bar stands for a key and takes its place among the keys as they came: a digit
    // clicked and Enter typed straight after it can reach one slow frame together, and must not be
    // read as Enter and then the digit (the answer would go without its last digit).
    const key = padShown() ? PAD.find((_, index) => inRect(p, padRect(index))) : undefined;
    if (key !== undefined) keys.push(key.code);
  };
  addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);

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
      say(REFUSED_TEXT[reason] ?? "지금은 할 수 없습니다");
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
    },
  };
}

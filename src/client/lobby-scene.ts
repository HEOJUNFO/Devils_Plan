/**
 * The lobby's picture: the back room with its table, drawn as the game draws
 * it. Before a room is joined the chairs are empty; in a room each player sits
 * in the figure of their slot, so everyone sees who is there before the game
 * starts.
 */
import type { LobbyView } from "../shared/lobby";
import type { VoiceMark } from "../shared/voice";
import {
  BAR_Y,
  CX,
  CY,
  Light,
  Pen,
  SCENE_W,
  drawChair,
  drawDevice,
  drawFigure,
  drawLamp,
  drawRoom,
  drawSpeech,
  drawTable,
  drawVoiceMark,
  seatLayout,
  speechLines,
  speechSeconds,
  VOICE_MARK_W,
} from "./game/draw";
import { FIGURE_COUNT } from "./game/figures";
import { C } from "./game/palette";

/** The lobby's picture. */
export interface LobbyScene {
  /** Who is in the room, or `null` before one is joined. */
  show(view: LobbyView | null): void;
  /** Starts or stops drawing; a hidden picture costs nothing. */
  setRunning(running: boolean): void;
  /** The player in `slot` said a line: it shows over their seat for a moment. */
  say(slot: number, text: string): void;
}

/** The widest a name is drawn beside a seat, in pixels. */
const NAME_WIDTH = 66;
/** What each team's tag is written in. */
const TEAM_COLOURS = [C.teal, C.crim];

/**
 * Draws the lobby's picture on `canvas`, which must be the size of the game's
 * scene. `voice` says how the player in a slot stands in the room's voice
 * chat. `look.device` puts Russian Roulette's cylinder on the table; a game
 * without it has a bare table.
 */
export function createLobbyScene(
  canvas: HTMLCanvasElement,
  voice: (slot: number) => VoiceMark,
  look: { device: boolean },
): LobbyScene {
  canvas.width = SCENE_W;
  canvas.height = BAR_Y;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  ctx.imageSmoothingEnabled = false;
  const pen = new Pen(ctx);
  const light = new Light();
  let lobby: LobbyView | null = null;
  let running = false;
  let started = performance.now() / 1000;
  /** By slot: the line over that seat, and when it goes, in the picture's own seconds. */
  const speech = new Map<number, { lines: string[]; until: number }>();

  function draw(): void {
    const time = performance.now() / 1000 - started;
    const sway = Math.sin(time * 1.3) * 3;
    const seats = lobby?.maxPlayers ?? FIGURE_COUNT;
    const me = lobby?.you ?? 0;
    const bySlot = new Map((lobby?.players ?? []).map((player) => [player.slot, player]));
    const places = Array.from({ length: seats }, (_, slot) => ({ slot, at: seatLayout((((slot - me) % seats) + seats) % seats, seats) }));

    drawRoom(pen);
    drawLamp(pen, sway);
    const seat = (place: (typeof places)[number]): void => {
      const player = bySlot.get(place.slot);
      if (player) drawFigure(pen, place.slot % FIGURE_COUNT, place.at.x, place.at.y, place.at.back, place.at.side);
      else drawChair(pen, place.at.x, place.at.y, place.at.back);
    };
    for (const place of places) if (!place.at.back) seat(place);
    drawTable(pen);
    if (look.device) drawDevice(pen, seats, time * 0.25, time * 0.25, () => [null, null]);
    for (const place of places) if (place.at.back) seat(place);
    light.draw(pen, CX + sway, CY - 4, 1);

    if (lobby === null) return;
    const host = lobby.host;
    for (const place of places) {
      const player = bySlot.get(place.slot);
      if (!player) continue;
      const name = pen.fit(player.nick, NAME_WIDTH);
      const lead = place.slot === host;
      const width = pen.width(name) + (lead ? 29 : 0);
      const x = place.at.label.align === "center" ? place.at.label.x - Math.round(width / 2) : place.at.label.x;
      const y = place.at.label.y;
      pen.txt(name, x, y, !player.connected ? C.dim : place.slot === me ? C.amber : C.bone);
      const mark = voice(place.slot);
      if (mark !== "out") drawVoiceMark(pen, x - VOICE_MARK_W, y, mark, time);
      if (lead) {
        // the host starts the game
        pen.px(x + width - 26, y, 26, 13, C.amberD);
        pen.px(x + width - 25, y + 1, 24, 11, C.ink);
        pen.txt("방장", x + width - 25, y + 1, C.amber);
      }
      if (!player.connected) pen.txt("끊김", place.slot === me ? x + width + 5 : x, place.slot === me ? y : y + 13, C.dim);
      else if (player.team > 0) {
        // the team chosen for the next game, each team in its own colour
        const tag = `팀 ${player.team}`;
        const tx = place.slot === me ? x + width + 5 : x;
        const ty = place.slot === me ? y : y + 13;
        pen.txt(tag, tx, ty, TEAM_COLOURS[(player.team - 1) % TEAM_COLOURS.length]);
      }
    }
    for (const place of places) {
      const line = speech.get(place.slot);
      if (line === undefined) continue;
      if (line.until <= time || !bySlot.has(place.slot)) speech.delete(place.slot);
      else drawSpeech(pen, place.at, line.lines);
    }
  }

  function frame(): void {
    if (!running) return;
    draw();
    requestAnimationFrame(frame);
  }

  // the pixel font comes with the page: the names are drawn again once it is in
  void document.fonts?.load("12px Galmuri11");

  return {
    show(view: LobbyView | null): void {
      lobby = view;
    },
    setRunning(value: boolean): void {
      if (value === running) return;
      running = value;
      if (running) {
        started = performance.now() / 1000;
        speech.clear();
        requestAnimationFrame(frame);
      }
    },
    say(slot: number, text: string): void {
      if (!running) return;
      const now = performance.now() / 1000 - started;
      speech.set(slot, { lines: speechLines(pen, text), until: now + speechSeconds(text) });
    },
  };
}

/**
 * The lobby's picture: the back room with its table, drawn as the game draws
 * it. Before a room is joined the chairs are empty; in a room each player sits
 * in the figure of their slot, so everyone sees who is there before the game
 * starts. A room with more players than a table seats is drawn as rows of
 * chairs instead, one for each place the room has.
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
  type SeatLayout,
} from "./game/draw";
import { FIGURE_COUNT } from "./game/figures";
import { C } from "./game/palette";
import { WORDS } from "./words";

/** The lobby's picture. */
export interface LobbyScene {
  /** Who is in the room, or `null` before one is joined. */
  show(view: LobbyView | null): void;
  /** Starts or stops drawing; a hidden picture costs nothing. */
  setRunning(running: boolean): void;
  /** The player in `slot` said a line: it shows over their seat for a moment. */
  say(slot: number, text: string): void;
  /** Whose figure or name is at `x`, `y` of the picture, in its own pixels: their slot, or `null` where nobody is. */
  slotAt(x: number, y: number): number | null;
}

/** The widest a name is drawn beside a seat, in pixels. */
const NAME_WIDTH = 66;
/** What each team's tag is written in. */
const TEAM_COLOURS = [C.teal, C.crim, "#7aa2ff", "#c58bff", "#6fcf5a"];
/** The chairs a table has when nobody needs more, and the most it seats. */
const TABLE_SEATS = 6;
const TABLE_MOST = 8;
/**
 * The rows of chairs: how many to a row, how far apart, where the first chair
 * of a row stands (a little left of the middle of its share, which leaves the
 * last chair room for the tag to its right), where the first row starts, and
 * the tallest a row is drawn.
 */
const HALL_COLS = 4;
const HALL_PITCH = 76;
const HALL_LEFT = 36;
const HALL_TOP = 27;
const HALL_ROW_MOST = 56;
/** The widest a name and its marks are together under a chair, in pixels. */
const HALL_NAME_ROOM = 74;
/** The host's mark: a plate a pixel wider than its word on each side, and the gap before it. */
const HOST_MARK_EDGE = 2;
const HOST_MARK_GAP = 3;
/** The mark of a player who is ready, a tick: how wide it is with the gap before it. */
const READY_MARK_W = 10;
/** A figure as a press finds it: how far to each side of its middle, and how far over and under its shoulders. */
const FIGURE_REACH = { side: 14, over: 22, under: 14 };
/** How far the lamp's light reaches over the rows of chairs, against 1 over a table: nobody sits in the dark. */
const HALL_LIGHT = 1.6;
/** In a row of chairs: how far under the top of its row a figure's shoulders are, and its name. */
const HALL_FIGURE = 21;
const HALL_NAME = 36;

/**
 * The seconds between two drawings of the picture: thirty a second, less a
 * moment so that a frame come a little early is not passed over.
 */
const DRAW_EVERY = 1 / 30 - 0.002;

/** A place in the picture: whose it is, where, and whether it is one of a row of chairs. */
interface Place {
  slot: number;
  at: SeatLayout;
  row: boolean;
}

/**
 * Where place `slot` of `seats` is in the rows of chairs: left to right, the
 * first row at the back. The name goes under the chair.
 */
function hallLayout(slot: number, seats: number): SeatLayout {
  const rows = Math.ceil(seats / HALL_COLS);
  const height = Math.min(HALL_ROW_MOST, Math.floor((BAR_Y - HALL_TOP) / rows));
  const x = HALL_LEFT + (slot % HALL_COLS) * HALL_PITCH;
  const top = HALL_TOP + Math.floor(slot / HALL_COLS) * height;
  const label = { x, y: top + HALL_NAME, align: "center" as const };
  return { x, y: top + HALL_FIGURE, back: false, side: x < CX ? -1 : 1, label, bubble: { x, y: top + HALL_NAME } };
}

/**
 * How many places the picture shows for a room of `capacity` whose highest
 * slot in use is `highest` (-1 for nobody), and whether as rows of chairs:
 * a table of six, or of up to eight when that many are needed, and past that
 * every place the room has.
 */
function placesFor(capacity: number, highest: number): { seats: number; rows: boolean } {
  const needed = Math.max(TABLE_SEATS, highest + 1);
  if (needed > TABLE_MOST) return { seats: Math.max(capacity, needed), rows: true };
  return { seats: Math.min(Math.max(capacity, highest + 1), needed), rows: false };
}

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
  /** Where each player was last drawn, figure and name: what a press is looked up in. */
  let drawn: { slot: number; name: boolean; x: number; y: number; w: number; h: number }[] = [];

  function draw(): void {
    const time = performance.now() / 1000 - started;
    const sway = Math.sin(time * 1.3) * 3;
    const me = lobby?.you ?? 0;
    const bySlot = new Map((lobby?.players ?? []).map((player) => [player.slot, player]));
    // how wide the host's mark is, with the gap before it: its word is as long as the language makes it
    const HOST_MARK_W = pen.width(WORDS.scene.host) + HOST_MARK_EDGE + HOST_MARK_GAP;
    const { seats, rows } = placesFor(lobby?.maxPlayers ?? TABLE_SEATS, Math.max(-1, ...bySlot.keys()));
    // at a table the viewer sits nearest; in the rows everyone keeps the chair of their slot
    const places: Place[] = Array.from({ length: seats }, (_, slot) => ({
      slot,
      at: rows ? hallLayout(slot, seats) : seatLayout((((slot - me) % seats) + seats) % seats, seats),
      row: rows,
    }));

    drawRoom(pen);
    drawLamp(pen, sway);
    const seat = (place: Place): void => {
      const player = bySlot.get(place.slot);
      if (player) drawFigure(pen, place.slot % FIGURE_COUNT, place.at.x, place.at.y, place.at.back, place.at.side);
      else drawChair(pen, place.at.x, place.at.y, place.at.back);
    };
    for (const place of places) if (!place.at.back) seat(place);
    if (!rows) {
      drawTable(pen);
      if (look.device) drawDevice(pen, seats, time * 0.25, time * 0.25, () => [null, null]);
    }
    for (const place of places) if (place.at.back) seat(place);
    light.draw(pen, CX + sway, CY - 4, rows ? HALL_LIGHT : 1);

    drawn = [];
    if (lobby === null) return;
    const host = lobby.host;
    for (const place of places) {
      const player = bySlot.get(place.slot);
      if (!player) continue;
      const lead = place.slot === host;
      // after the name: the host's mark, or the tick of someone ready (the host is never that: the host starts)
      const after = lead ? HOST_MARK_W : player.ready ? READY_MARK_W : 0;
      const y = place.at.label.y;
      drawn.push({
        slot: place.slot,
        name: false,
        x: place.at.x - FIGURE_REACH.side,
        y: place.at.y - FIGURE_REACH.over,
        w: FIGURE_REACH.side * 2,
        h: FIGURE_REACH.over + FIGURE_REACH.under,
      });
      if (place.row) {
        // under the chair: the name with its marks, cut to the chair's share of the row; the team goes beside the figure
        const mark = voice(place.slot);
        const marks = after + (mark !== "out" ? VOICE_MARK_W : 0);
        const name = pen.fit(player.nick, Math.min(NAME_WIDTH, HALL_NAME_ROOM - marks));
        const width = pen.width(name) + after;
        const x = place.at.label.x - Math.round((width - (mark !== "out" ? VOICE_MARK_W : 0)) / 2);
        pen.txt(name, x, y, !player.connected ? C.dim : place.slot === me ? C.amber : C.bone);
        if (mark !== "out") drawVoiceMark(pen, x - VOICE_MARK_W, y, mark, time);
        if (lead) drawHostMark(x + width - (HOST_MARK_W - HOST_MARK_GAP), y);
        else if (player.ready) drawReadyMark(x + width - (READY_MARK_W - HOST_MARK_GAP), y);
        drawn.push({ slot: place.slot, name: true, x, y, w: width, h: 13 });
        const beside = place.at.y - 6;
        if (!player.connected) pen.txt(WORDS.scene.offline, place.at.x + 15, beside, C.dim);
        else if (player.team > 0) drawTeamTag(place.at.x + 15, beside, player.team, player.leads);
        continue;
      }
      const name = pen.fit(player.nick, NAME_WIDTH);
      const width = pen.width(name) + after;
      const x = place.at.label.align === "center" ? place.at.label.x - Math.round(width / 2) : place.at.label.x;
      pen.txt(name, x, y, !player.connected ? C.dim : place.slot === me ? C.amber : C.bone);
      const mark = voice(place.slot);
      if (mark !== "out") drawVoiceMark(pen, x - VOICE_MARK_W, y, mark, time);
      if (lead) drawHostMark(x + width - (HOST_MARK_W - HOST_MARK_GAP), y);
      else if (player.ready) drawReadyMark(x + width - (READY_MARK_W - HOST_MARK_GAP), y);
      drawn.push({ slot: place.slot, name: true, x, y, w: width, h: 13 });
      if (!player.connected) pen.txt(WORDS.scene.offline, place.slot === me ? x + width + 5 : x, place.slot === me ? y : y + 13, C.dim);
      else if (player.team > 0) {
        // the team chosen for the next game, each team in its own colour
        const tx = place.slot === me ? x + width + 5 : x;
        const ty = place.slot === me ? y : y + 13;
        drawTeamTag(tx, ty, player.team, player.leads);
      }
    }
    for (const place of places) {
      const line = speech.get(place.slot);
      if (line === undefined) continue;
      if (line.until <= time || !bySlot.has(place.slot)) speech.delete(place.slot);
      else drawSpeech(pen, place.at, line.lines);
    }
  }

  /**
   * The team a player has chosen, at `x`, `y`: written in the team's colour,
   * and for its leader (whoever took the team first) on a plate of that
   * colour, so that the team can see whose share of its points will differ.
   */
  function drawTeamTag(x: number, y: number, team: number, leads: boolean): void {
    const tag = WORDS.scene.team(team);
    const colour = TEAM_COLOURS[(team - 1) % TEAM_COLOURS.length];
    if (!leads) {
      pen.txt(tag, x, y, colour);
      return;
    }
    pen.px(x - 2, y, pen.width(tag) + 3, 13, colour);
    pen.txt(tag, x, y, C.ink);
  }

  /** The mark of the host, who starts the game: its top left at `x`, `y`. */
  function drawHostMark(x: number, y: number): void {
    const word = pen.width(WORDS.scene.host);
    pen.px(x, y, word + HOST_MARK_EDGE, 13, C.amberD);
    pen.px(x + 1, y + 1, word, 11, C.ink);
    pen.txt(WORDS.scene.host, x + 1, y + 1, C.amber);
  }

  /** The mark of a player who is ready for the next game, a tick: its top left at `x`, `y` of the name's line. */
  function drawReadyMark(x: number, y: number): void {
    // two strokes, each two pixels tall: down to the right, then up
    const strokes = [
      [0, 6],
      [1, 7],
      [2, 8],
      [3, 7],
      [4, 6],
      [5, 5],
      [6, 4],
    ];
    for (const [dx, dy] of strokes) pen.px(x + dx, y + dy, 1, 2, C.teal);
  }

  /** The frame asked of the browser and not yet come, or 0. */
  let asked = 0;
  /** When the picture was last drawn, in the page's seconds. */
  let drawnAt = 0;

  function frame(): void {
    asked = 0;
    if (!running) return;
    // the lamp sways a few pixels a second and the rest stands still: drawn more often, the picture is the same one again
    const now = performance.now() / 1000;
    if (now - drawnAt >= DRAW_EVERY) {
      drawnAt = now;
      draw();
    }
    asked = requestAnimationFrame(frame);
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
      // a frame asked for before it was stopped is called off: stopped and started within one frame, the picture would be drawn by two loops
      if (asked !== 0) cancelAnimationFrame(asked);
      asked = 0;
      if (running) {
        started = performance.now() / 1000;
        drawnAt = 0;
        speech.clear();
        asked = requestAnimationFrame(frame);
      }
    },
    say(slot: number, text: string): void {
      if (!running) return;
      const now = performance.now() / 1000 - started;
      speech.set(slot, { lines: speechLines(pen, text), until: now + speechSeconds(text) });
    },
    slotAt(x: number, y: number): number | null {
      // the name is looked up before the figure: two figures stand closer than their names do
      const at = (each: (typeof drawn)[number]): boolean => x >= each.x && x < each.x + each.w && y >= each.y && y < each.y + each.h;
      return (drawn.find((each) => each.name && at(each)) ?? drawn.find((each) => !each.name && at(each)))?.slot ?? null;
    },
  };
}

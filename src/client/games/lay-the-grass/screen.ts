/**
 * The screen of 잔디 깔기: the park, the seven tiles to pick from, the tile
 * in hand over the place it would lie, and who picks and lays in what order.
 *
 * Design: design/games/lay-the-grass.md. The room decides everything; this
 * screen shows what it sends and asks for a pick or a lay. Whether a tile
 * fits is worked out here as well, with the same rules, so that a player
 * sees it before asking.
 */
import {
  TILES,
  coveredBy,
  fits,
  hasCell,
  tileOf,
  turned,
  waysToLay,
  type GrassEvent,
  type Placement,
  type Tile,
} from "../../../shared/games/lay-the-grass/rules";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C, shade } from "../../game/palette";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";

/** What the room sends about a game of 잔디 깔기. */
export type GrassMessage = Extract<ServerMessage, { type: "game"; game: "lay-the-grass" }>;

/** What the screen asks of whoever owns the connection. */
export interface GrassHandlers {
  /** The player picked a tile or laid theirs. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): void;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
}

/** The game screen. */
export interface GrassScreen {
  update(message: GrassMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** Where the park is drawn: the part of the scene under the page's own buttons. */
const PARK_AREA = { x: 8, y: 24, w: 288, h: 190 };
/** The largest a cell of the park is drawn, in pixels. */
const MAX_CELL = 28;
/** The log on screen: where it starts, under the row the page keeps for its tabs, and its rows. */
const LOG_TOP = 106;
const LOG_ROWS = 8;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 54;
/** With this many seconds or fewer of the player's own turn left, each is ticked aloud. */
const TICK_FROM = 5;
/**
 * Seconds the results are on show before Enter starts another game: the host
 * may have been pressing Enter to lay a tile at the moment the game ended.
 */
const RESULTS_HOLD = 1.5;
/** Said when something could not be sent because the connection is down. */
const NOT_SENT_TEXT = "연결이 끊겨 보내지 못했습니다. 다시 해 주세요";
/** One colour for each player's grass, by their place in the list of players. */
const GRASS = ["#6fcf5a", "#3fd0b6", "#ffb43c", "#e8739a", "#7aa2ff", "#c58bff"] as const;
/** How much of a holed cell's width its hole takes. */
const HOLE_SHARE = 0.62;
/** The soil of a park cell nothing lies on. */
const SOIL = "#3a2a1c";
const SOIL_D = "#2a1e14";

const REFUSED_TEXT: Record<string, string> = {
  "not-your-turn": "지금은 내 차례가 아닙니다",
  "not-picking": "지금은 타일을 고르는 때가 아닙니다",
  "not-laying": "지금은 타일을 놓는 때가 아닙니다",
  "no-such-tile": "그런 타일은 없습니다",
  "does-not-fit": "거기에는 놓을 수 없습니다",
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
const ENDED_TEXT: Record<"rounds" | "abandoned", string> = {
  rounds: "마지막 공원까지 끝",
  abandoned: "이어갈 사람이 없어 끝",
};

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The button of the tile `index` places along the bar. */
const tileRect = (index: number): Box => [6 + index * 67, 238, 65, 30];
const TURN_RECT: Box = [296, 240, 86, 26];
const LAY_RECT: Box = [388, 240, 86, 26];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link GrassScreen.update}. */
export function createGrassScreen(canvas: HTMLCanvasElement, handlers: GrassHandlers): GrassScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: GrassMessage | null = null;
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
  /** The tile the player has pointed at and not yet confirmed: a pick cannot be taken back. */
  let chosen: number | null = null;
  /** Where the player holds their tile over the park: the top left of its box, and how it is turned. */
  let hand: { row: number; col: number; turns: number } | null = null;
  /** The turn the hand was last put in its starting place for, so that it is done once a turn. */
  let handFor = "";
  /** The tile laid last lights up for a moment: by player. */
  const lit = new Map<number, number>();
  /** The last second of the player's own turn that was ticked aloud. */
  let ticked = -1;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed. */
  const keys: string[] = [];
  const clicks: { x: number; y: number }[] = [];
  const mouse = { x: -1, y: -1, moved: false };
  let stopped = false;

  // ---- What the latest message means ---------------------------------------------------------------
  const nickOf = (player: number): string => latest?.players.find((each) => each.id === player)?.nick ?? "";
  /** The colour of `player`'s grass. */
  function grassOf(player: number): string {
    const index = latest?.players.findIndex((each) => each.id === player) ?? -1;
    return GRASS[(index < 0 ? 0 : index) % GRASS.length];
  }
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const me = (): number | null => latest?.view.you ?? null;
  const myTurn = (): boolean => latest !== null && me() !== null && latest.view.turn === me() && !latest.frozen;
  const picking = (): boolean => myTurn() && latest?.view.phase === "pick";
  const laying = (): boolean => myTurn() && latest?.view.phase === "place";
  /** The tile `player` has picked in this park, or `null`. */
  const tileOfPlayer = (player: number): number | null => latest?.view.picks.find((pick) => pick.player === player)?.tile ?? null;

  /** Where the park is drawn, and how large its cells are. */
  function parkBox(): { x: number; y: number; cell: number; rows: number; cols: number } | null {
    if (latest === null) return null;
    const rows = latest.view.park.rows.length;
    const cols = Math.max(1, ...latest.view.park.rows.map((row) => row.length));
    const cell = Math.max(4, Math.min(MAX_CELL, Math.floor(PARK_AREA.w / cols), Math.floor(PARK_AREA.h / Math.max(1, rows))));
    return {
      x: PARK_AREA.x + Math.floor((PARK_AREA.w - cols * cell) / 2),
      y: PARK_AREA.y + Math.floor((PARK_AREA.h - rows * cell) / 2),
      cell,
      rows,
      cols,
    };
  }

  function say(text: string): void {
    note = text;
    noteT = 2;
  }

  /** Shows one thing that happened: a sound, and something to see where it happened. */
  function show(event: GrassEvent): void {
    if (event.type === "park") {
      chosen = null;
      hand = null;
      lit.clear();
      if (event.round > 1) sfx.turn();
    } else if (event.type === "pick") {
      sfx.pick();
    } else if (event.type === "lay") {
      lit.set(event.player, 0.8);
      sfx.earn();
    } else if (event.type === "fail") {
      sfx.deny();
    }
  }

  function update(message: GrassMessage): void {
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      chosen = null;
      hand = null;
      handFor = "";
      lit.clear();
      speech.clear();
    }
    const wasMine = myTurn();
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    latest = message;
    receivedAt = performance.now();
    pending = false;
    offline = false;
    if (!wasMine && myTurn()) sfx.turn();
    if (!picking()) chosen = null;
  }

  /** Puts the tile in the player's hand over the first place it fits, once at the start of their turn to lay. */
  function takeInHand(): void {
    if (latest === null || !laying()) return;
    const mine = me();
    const tile = mine === null ? null : tileOfPlayer(mine);
    if (mine === null || tile === null) return;
    const turn = `${latest.startedAt}:${latest.view.round}:${mine}`;
    if (handFor === turn && hand !== null) return;
    handFor = turn;
    hand = waysToLay(latest.view.park, latest.view.placed, tile)[0] ?? { row: 0, col: 0, turns: 0 };
  }

  /** Turns the tile in hand a quarter clockwise, about the middle of its box. */
  function turnHand(): void {
    if (latest === null || hand === null) return;
    const mine = me();
    const tile = mine === null ? undefined : tileOf(tileOfPlayer(mine) ?? -1);
    if (tile === undefined) return;
    const before = turned(tile, hand.turns);
    const after = turned(tile, hand.turns + 1);
    hand = {
      row: hand.row + Math.floor(before.rows / 2) - Math.floor(after.rows / 2),
      col: hand.col + Math.floor(before.cols / 2) - Math.floor(after.cols / 2),
      turns: (hand.turns + 1) % 4,
    };
    sfx.move();
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
      if (pressed("Escape", "Backspace") || clicked(LOBBY_RECT)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT))) {
        if (host) handlers.again();
        else say(REFUSED_TEXT["not-host"]);
      }
      return;
    }

    if (picking() && !pending) {
      // a tile is pointed at first and confirmed second: a pick cannot be taken back
      let confirm = pressed("Enter", "NumpadEnter");
      TILES.forEach((tile, index) => {
        const key = pressed(`Digit${index + 1}`, `Numpad${index + 1}`);
        const click = clicked(tileRect(index));
        if (!key && !click) return;
        if (click && chosen === tile.number) confirm = true;
        else {
          chosen = tile.number;
          sfx.move();
        }
      });
      if (confirm && chosen !== null) {
        pending = handlers.act({ type: "pick", tile: chosen });
        if (!pending) say(NOT_SENT_TEXT);
      }
      return;
    }

    if (laying() && !pending) {
      takeInHand();
      const box = parkBox();
      const mine = me();
      const number = mine === null ? null : tileOfPlayer(mine);
      const tile = number === null ? undefined : tileOf(number);
      if (hand === null || box === null || tile === undefined || number === null) return;
      if (pressed("KeyR") || clicked(TURN_RECT)) turnHand();
      const shape = turned(tile, hand.turns);
      // the mouse carries the tile by the middle of its box
      const over = mouse.x >= box.x && mouse.x < box.x + box.cols * box.cell && mouse.y >= box.y && mouse.y < box.y + box.rows * box.cell;
      if (mouse.moved && over) {
        hand = {
          ...hand,
          row: Math.floor((mouse.y - box.y) / box.cell) - Math.floor(shape.rows / 2),
          col: Math.floor((mouse.x - box.x) / box.cell) - Math.floor(shape.cols / 2),
        };
      }
      for (const code of keys) {
        if (code === "ArrowLeft") hand = { ...hand, col: hand.col - 1 };
        else if (code === "ArrowRight") hand = { ...hand, col: hand.col + 1 };
        else if (code === "ArrowUp") hand = { ...hand, row: hand.row - 1 };
        else if (code === "ArrowDown") hand = { ...hand, row: hand.row + 1 };
      }
      // the tile stays where some of it could still be seen
      hand = {
        ...hand,
        row: Math.max(-shape.rows + 1, Math.min(box.rows - 1, hand.row)),
        col: Math.max(-shape.cols + 1, Math.min(box.cols - 1, hand.col)),
      };
      const onPark = clicks.some((p) => p.x >= box.x && p.x < box.x + box.cols * box.cell && p.y >= box.y && p.y < box.y + box.rows * box.cell);
      if (pressed("Enter", "NumpadEnter", "Space") || clicked(LAY_RECT) || onPark) {
        if (fits(view.park, view.placed, number, hand.row, hand.col, hand.turns)) {
          pending = handlers.act({ type: "lay", row: hand.row, col: hand.col, turns: hand.turns });
          if (!pending) say(NOT_SENT_TEXT);
        } else {
          say(REFUSED_TEXT["does-not-fit"]);
          sfx.deny();
        }
      }
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    for (const [player, t] of lit) {
      if (t - dt <= 0) lit.delete(player);
      else lit.set(player, t - dt);
    }
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // my own turn is nearly up: a tick a second
      const mine = myTurn() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > TICK_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
    mouse.moved = false;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  /**
   * The round hole of a holed cell, in a cell `size` pixels wide whose top
   * left is `x`, `y`: what lies under the tile shows through it. Drawn row
   * by row, so that it stays a crisp disc at any size.
   */
  function drawHole(x: number, y: number, size: number, colour: string): void {
    const across = Math.max(2, Math.round(size * HOLE_SHARE));
    const radius = across / 2;
    const left = x + Math.floor((size - across) / 2);
    const top = y + Math.floor((size - across) / 2);
    for (let i = 0; i < across; i++) {
      const dy = i + 0.5 - radius;
      const half = Math.round(Math.sqrt(radius * radius - dy * dy));
      if (half > 0) pen.px(left + radius - half, top + i, half * 2, 1, colour);
    }
  }

  /** Draws the cells of a tile lying on the park, with a dark line where it ends. */
  function drawLaid(placement: Placement, box: { x: number; y: number; cell: number }, colour: string, bright: boolean): void {
    const tile = tileOf(placement.tile);
    if (tile === undefined) return;
    const cells = coveredBy(tile, placement.row, placement.col, placement.turns);
    const own = new Set(cells.map((cell) => `${cell.row},${cell.col}`));
    for (const cell of cells) {
      const x = box.x + cell.col * box.cell;
      const y = box.y + cell.row * box.cell;
      pen.px(x, y, box.cell, box.cell, bright ? shade(colour, 1.25) : colour);
      // blades of grass, the same on every cell
      pen.px(x + 2, y + 2, 1, 2, shade(colour, 0.8));
      pen.px(x + box.cell - 4, y + box.cell - 5, 1, 2, shade(colour, 0.8));
      const edge = shade(colour, 0.45);
      if (!own.has(`${cell.row - 1},${cell.col}`)) pen.px(x, y, box.cell, 1, edge);
      if (!own.has(`${cell.row + 1},${cell.col}`)) pen.px(x, y + box.cell - 1, box.cell, 1, edge);
      if (!own.has(`${cell.row},${cell.col - 1}`)) pen.px(x, y, 1, box.cell, edge);
      if (!own.has(`${cell.row},${cell.col + 1}`)) pen.px(x + box.cell - 1, y, 1, box.cell, edge);
      if (cell.kind === "number" && box.cell >= 13) {
        pen.txt(`${placement.tile}`, x + Math.round(box.cell / 2), y + Math.round((box.cell - 13) / 2), C.ink, "center");
      }
      // a holed cell: the park shows through, with a rim of the tile's own shade
      if (cell.kind === "hole") {
        drawHole(x, y, box.cell, edge);
        drawHole(x + 1, y + 1, box.cell - 2, SOIL);
      }
    }
  }

  function drawPark(): void {
    const box = parkBox();
    if (latest === null || box === null) return;
    const view = latest.view;
    // the park's edge: a dark rim round every cell, so the shape reads against the night
    for (let row = 0; row < box.rows; row++) {
      for (let col = 0; col < box.cols; col++) {
        if (hasCell(view.park, row, col)) pen.px(box.x + col * box.cell - 2, box.y + row * box.cell - 2, box.cell + 4, box.cell + 4, C.ink);
      }
    }
    for (let row = 0; row < box.rows; row++) {
      for (let col = 0; col < box.cols; col++) {
        if (!hasCell(view.park, row, col)) continue;
        const x = box.x + col * box.cell;
        const y = box.y + row * box.cell;
        pen.px(x, y, box.cell, box.cell, SOIL_D);
        pen.px(x + 1, y + 1, box.cell - 2, box.cell - 2, SOIL);
      }
    }
    for (const placement of view.placed) drawLaid(placement, box, grassOf(placement.player), lit.has(placement.player));

    // the tile in the player's hand, over where it would lie
    const mine = me();
    const number = mine === null ? null : tileOfPlayer(mine);
    const tile = number === null ? undefined : tileOf(number);
    if (laying() && hand !== null && tile !== undefined && number !== null && mine !== null) {
      const ok = fits(view.park, view.placed, number, hand.row, hand.col, hand.turns);
      const colour = ok ? grassOf(mine) : C.crim;
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(time * 6);
      for (const cell of coveredBy(tile, hand.row, hand.col, hand.turns)) {
        pen.px(box.x + cell.col * box.cell + 1, box.y + cell.row * box.cell + 1, box.cell - 2, box.cell - 2, colour);
      }
      ctx.globalAlpha = 1;
      for (const cell of coveredBy(tile, hand.row, hand.col, hand.turns)) {
        const x = box.x + cell.col * box.cell;
        const y = box.y + cell.row * box.cell;
        if (cell.kind === "hole") drawHole(x + 1, y + 1, box.cell - 2, SOIL_D);
        if (cell.kind === "number" && box.cell >= 13) {
          pen.txt(`${number}`, x + Math.round(box.cell / 2), y + Math.round((box.cell - 13) / 2), C.ink, "center");
        }
        pen.px(x, y, box.cell, 1, colour);
        pen.px(x, y + box.cell - 1, box.cell, 1, colour);
        pen.px(x, y, 1, box.cell, colour);
        pen.px(x + box.cell - 1, y, 1, box.cell, colour);
      }
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    // a night sky's worth of quiet behind the park
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    drawPark();
    if (latest.frozen) {
      // the game's own clocks stand still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      const words = stand === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${Math.ceil(stand / 1000)}초`;
      const plate = Math.max(160, pen.width(words) + 16);
      const middle = PARK_AREA.y + Math.round(PARK_AREA.h / 2);
      pen.px(Math.round(SCENE_W / 2 - plate / 2), middle - 9, plate, 17, C.ink);
      pen.txt(words, Math.round(SCENE_W / 2), middle - 7, C.boneD, "center");
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    if (noteT > 0) return [note, C.amber];
    if (offline) return ["연결이 끊겼습니다. 다시 연결하는 중", C.crim];
    if (view.phase === "ended") return ["판이 끝났습니다", C.amber];
    if (view.phase === "pause") {
      const seconds = Math.ceil((left(latest.clock.next) ?? 0) / 1000);
      return [`공원 ${view.round} 끝 · 다음 공원까지 ${seconds}초`, C.teal];
    }
    const seconds = Math.ceil((left(latest.clock.turn) ?? 0) / 1000);
    const who = view.turn === null ? "" : pen.fit(nickOf(view.turn), NAME_WIDTH);
    if (pending) return ["보내는 중", C.boneD];
    if (picking()) {
      const words = chosen === null ? "타일을 고르세요 (한 번 고르면 못 바꿉니다)" : `${chosen}번으로 정하려면 Enter, 또는 한 번 더 누르기`;
      return [`${words} · ${seconds}초`, seconds <= TICK_FROM ? C.crim : C.amber];
    }
    if (laying()) return [`타일을 놓으세요 · ${seconds}초`, seconds <= TICK_FROM ? C.crim : C.amber];
    const doing = view.phase === "pick" ? "고르는 중" : "놓는 중";
    return [`${me() === null ? "관전 중 · " : ""}${who} ${doing} · ${seconds}초`, C.bone];
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    for (const event of latest.view.history.slice(0, seen)) {
      const who = "player" in event ? pen.fit(nickOf(event.player), NAME_WIDTH) : "";
      if (event.type === "park") lines.push([`공원 ${event.round}`, C.boneD]);
      else if (event.type === "pick") lines.push([`${who}: ${event.tile}번 선택${event.forced ? " (자동)" : ""}`, C.bone]);
      else if (event.type === "lay") lines.push([`${who}: ${event.tile}번 놓음 +${event.tile}${event.forced ? " (자동)" : ""}`, C.teal]);
      else if (event.type === "fail") lines.push([`${who}: ${event.tile}번 자리 없음`, C.crim]);
      else lines.push([ENDED_TEXT[event.reason], C.amber]);
    }
    return lines;
  }

  /** The players in the order that matters now: of picking, of laying, or of their points once the game is over. */
  function listOrder(): number[] {
    if (latest === null) return [];
    const view = latest.view;
    if (view.phase === "ended") return [...view.players].sort((a, b) => b.score - a.score).map((player) => player.id);
    if (view.layOrder.length > 0) return view.layOrder;
    return view.pickOrder;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(`공원 ${view.round}/${view.rounds}`, x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null && view.turn !== null) {
      const seconds = Math.ceil(turn / 1000);
      pen.txt(`${seconds}초`, W - 5, 3, seconds <= TICK_FROM ? C.crim : C.boneD, "right");
    }
    pen.px(x, 16, 168, 1, C.steelDD);
    const order = listOrder();
    const pitch = order.length > 4 ? 11 : 13;
    order.forEach((player, at) => {
      const y = 19 + at * pitch;
      const info = latest!.players.find((each) => each.id === player);
      const score = view.players.find((each) => each.id === player)?.score ?? 0;
      const tile = tileOfPlayer(player);
      const gone = info !== undefined && (info.left || !info.connected);
      const onTurn = view.turn === player;
      // the place in the priority, which decides between equals; then the colour of their grass
      pen.txt(`${view.players.findIndex((each) => each.id === player) + 1}`, x, y, C.dim);
      pen.px(x + 9, y + 2, 5, 8, grassOf(player));
      if (onTurn) pen.txt("▶", x + 15, y, C.amber);
      const name = pen.fit(info?.nick ?? "", NAME_WIDTH);
      pen.txt(name, x + 27, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      if (voice !== "out") drawVoiceMark(pen, x + 27 + pen.width(name) + 2, y, voice, time);
      if (tile !== null) pen.txt(`${tile}번`, x + 112, y, C.boneD, "right");
      const laid = view.placed.some((placement) => placement.player === player);
      if (laid) pen.txt("놓음", x + 117, y, C.teal);
      else if (view.failed.includes(player)) pen.txt("실패", x + 117, y, C.crim);
      pen.txt(`${score}`, W - 5, y, C.brass, "right");
    });
    pen.px(x, 86, 168, 1, C.steelDD);
    const lines = logLines();
    const from = Math.max(0, lines.length - LOG_ROWS);
    for (let i = from; i < lines.length; i++) pen.txt(lines[i][0], x, LOG_TOP + (i - from) * 14, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      // the bubble is kept inside the scene: asked for at its right edge, it ends there
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: 19 + at * pitch, align: "left" } }, line.lines);
    }
  }

  function button(rect: Box, label: string, sub: string, lit_: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit_ ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit_ ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (sub === "") pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit_ ? C.amber : live ? C.bone : C.dim, "center");
    else {
      pen.txt(label, x + 5, y + 1, lit_ ? C.amber : live ? C.bone : C.dim);
      pen.txt(sub, x + 5, y + 13, live || lit_ ? C.boneD : C.dim);
    }
  }

  /** A tile drawn small, each cell `size` pixels. */
  function drawTile(tile: Tile, x: number, y: number, size: number, colour: string): void {
    for (const cell of tile.cells) {
      pen.px(x + cell.col * size, y + cell.row * size, size - 1, size - 1, cell.kind === "number" ? shade(colour, 1.35) : colour);
      // a hole, as large as a tile this small has room for
      if (cell.kind === "hole") pen.px(x + cell.col * size + 1, y + cell.row * size + 1, size - 3, size - 3, C.ink);
    }
  }

  /** The seven tiles along the bar: what each earns, how large it is, and who has picked it. */
  function drawTiles(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = picking();
    TILES.forEach((tile, index) => {
      const rect = tileRect(index);
      const [x, y, w, h] = rect;
      const picked = chosen === tile.number;
      const room = waysToLay(view.park, view.placed, tile.number).length > 0;
      pen.px(x, y, w, h, picked ? C.amberD : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, picked ? "#3a2a12" : mine && inRect(mouse, rect) ? C.btnH : C.btn);
      drawTile(tile, x + 3, y + Math.floor((h - tile.rows * 5) / 2), 5, room ? "#6fcf5a" : C.dim);
      pen.txt(`${tile.number}점`, x + 27, y + 1, picked ? C.amber : mine ? C.bone : C.boneD);
      pen.txt(room ? `${tile.cells.length}칸` : "불가", x + 27, y + 14, room ? C.boneD : C.crim);
      // who has picked it, a mark each
      view.picks
        .filter((pick) => pick.tile === tile.number)
        .forEach((pick, at) => pen.px(x + w - 6 - at * 5, y + 3, 4, 4, grassOf(pick.player)));
    });
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const best = Math.max(...view.players.map((player) => player.score));
    const won = mine !== null && view.players.find((player) => player.id === mine)?.score === best && best > 0;
    pen.txt(mine === null ? "종료" : won ? "승리!" : "패배", 10, 234, mine === null ? C.bone : won ? C.teal : C.crim, "left", 24);
    // equal points share a place
    const ranked = [...view.players].sort((a, b) => b.score - a.score);
    const places = ranked.map((player) => `${ranked.findIndex((other) => other.score === player.score) + 1}위 ${pen.fit(nickOf(player.id), 48)} ${player.score}`);
    pen.txt(pen.fit(places.join("  "), 280), 96, 226, C.bone);
    pen.txt(`공원 ${view.round}곳을 깔았습니다`, 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(host ? "같은 사람들과 한 판 더 하거나 대기실로" : "방장이 새 판을 시작하기를 기다리는 중", 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, "Enter 새 판", "", true, true);
    button(LOBBY_RECT, "Esc 대기실로", "", false, true);
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
    if (view.phase === "pick") {
      drawTiles();
      return;
    }
    // laying, or the finished park on show: the player's own tile, and how to lay it
    const mine = me();
    const number = mine === null ? null : tileOfPlayer(mine);
    const tile = number === null ? undefined : tileOf(number);
    if (tile !== undefined && mine !== null) {
      drawTile(turned(tile, hand?.turns ?? 0), 8, 240, 5, grassOf(mine));
      pen.txt(`내 타일 ${tile.number}번 · ${tile.number}점`, 40, 240, C.bone);
    }
    if (laying()) {
      pen.txt("마우스·화살표로 옮기고 눌러서 놓기", 40, 253, C.boneD);
      button(TURN_RECT, "R 돌리기", "", false, true);
      const ok = hand !== null && number !== null && fits(view.park, view.placed, number, hand.row, hand.col, hand.turns);
      button(LAY_RECT, "Enter 놓기", "", ok && Math.sin(time * 5) > 0, ok);
    } else if (view.phase === "place") {
      pen.txt("번호가 작은 타일부터 놓습니다. 자리가 없으면 0점.", 40, 253, C.boneD);
    } else if (mine !== null && view.failed.includes(mine)) {
      pen.txt("놓을 자리가 없어 이번 공원은 0점입니다.", 40, 253, C.crim);
    } else if (mine !== null && tile !== undefined && view.placed.some((placement) => placement.player === mine)) {
      pen.txt(`타일을 놓아 ${tile.number}점을 얻었습니다.`, 40, 253, C.teal);
    } else {
      pen.txt("놓은 타일의 번호만큼 승점을 얻습니다.", 40, 253, C.boneD);
    }
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines: [string, string][] = [
      ["잔디 깔기: 규칙", C.amber],
      ["공원 위에 내 잔디 타일을 놓아 승점을 얻습니다.", C.bone],
      ["먼저 타일 일곱 종류 중 하나를 모두가 보는 앞에서 고릅니다. 승점이 낮은", C.bone],
      ["사람부터 고르고, 한 번 고르면 바꿀 수 없습니다. 같은 타일을 골라도 됩니다.", C.bone],
      ["", C.bone],
      ["그다음 타일에 적힌 번호가 작은 사람부터 공원에 놓습니다.", C.bone],
      ["타일은 돌릴 수 있지만 뒤집을 수 없고, 공원 밖으로 나가거나", C.boneD],
      ["다른 타일과 겹치게 놓을 수 없습니다.", C.boneD],
      ["", C.bone],
      ["놓으면 타일의 번호만큼 승점을 얻고, 놓을 자리가 없으면 0점입니다.", C.bone],
      [`공원 ${rules.rounds}곳을 이어서 깔고 승점을 합칩니다. 승점이나 번호가 같으면 이름 앞`, C.boneD],
      ["숫자가 작은 사람이 먼저이고, 이 순서는 공원마다 한 칸씩 돌아갑니다.", C.boneD],
      [`고르기 ${rules.pickSeconds}초, 놓기 ${rules.placeSeconds}초. 시간이 지나면 자동으로 넘어갑니다.`, C.boneD],
      ["", C.bone],
      ["1~7: 타일 · R: 돌리기 · 화살표: 옮기기 · Enter: 정하기", C.boneD],
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
    if (laying()) takeInHand();
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
    // an arrow held down goes on moving the tile; nothing else repeats
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code === "Backspace" || event.code.startsWith("Arrow")) event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent): void => {
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.moved = true;
  };
  const onPointerDown = (event: PointerEvent): void => {
    startAudio();
    const p = toScreen(event);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.moved = true;
    clicks.push(p);
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

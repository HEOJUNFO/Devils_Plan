/**
 * What the page needs of a game to show it: its screen while a game is on,
 * and the picture of the room while one is waited for. One entry for each
 * game in `games.json`; the page knows nothing else of how a game looks.
 */
import type { GameId } from "../../shared/games";
import type { LobbyView } from "../../shared/lobby";
import type { ServerMessage } from "../../shared/protocol";
import type { VoiceMark } from "../../shared/voice";
import { createTable } from "../game/table";
import { WORDS as ROULETTE_WORDS } from "../game/words";
import { createLobbyScene } from "../lobby-scene";
import type { RulesSheet } from "../sheet";
import { createCubesScreen } from "./count-cubes/screen";
import { WORDS as CUBES_WORDS } from "./count-cubes/words";
import { createRectScreen } from "./count-rectangles/screen";
import { WORDS as RECT_WORDS } from "./count-rectangles/words";
import { createGrassScreen } from "./lay-the-grass/screen";
import { WORDS as GRASS_WORDS } from "./lay-the-grass/words";
import { createPokerScreen } from "./memory-poker/screen";
import { WORDS as POKER_WORDS } from "./memory-poker/words";
import { createMarketScreen } from "./mystery-stock-market/screen";
import { WORDS as MARKET_WORDS } from "./mystery-stock-market/words";
import { createUnderScreen } from "./under-thirteen/screen";
import { WORDS as UNDER_WORDS } from "./under-thirteen/words";

/** What a room sends about the game being played in it, whichever game that is. */
export type GameMessage = Extract<ServerMessage, { type: "game" }>;

/** What a game's screen asks of whoever owns the connection. */
export interface GameHandlers {
  /**
   * The player asked something of the game: a move, a buzz, an answer.
   * Returns whether it went: while the connection is down nothing is sent,
   * and nothing is kept to send later.
   */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
  /**
   * The game is over and a player who is not the host pressed the key the
   * host starts the next game with: they would play one more, which is the
   * room's "ready" (`src/shared/again.ts`). Returns whether the room has
   * that word of them now; `false` where they cannot say it (sitting out of
   * 탈락전, or no connection).
   */
  wantAgain(): boolean;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /**
   * The screen has put a sheet over everything (its rules), or taken it
   * away: the page's own controls over the frame get out of its way.
   */
  covered(covered: boolean): void;
  /**
   * The game has more players than its column lists one to a row, or no
   * longer has: the page's tabs then sit at the top of the column, out of the
   * list's way (see `panel.ts`).
   */
  crowded(crowded: boolean): void;
  /**
   * Whether this browser's player has yet to finish a game of this kind with
   * other people (their record has none, `record.ts`). A screen that has
   * something to tell such a player tells it: what the move in hand comes to,
   * in the game's own terms. Read once, when the screen is made, so that
   * nothing changes under a game being played.
   */
  first: boolean;
  /**
   * Whether the room's 탈락전 has put this browser's player out: they watch
   * the room's games until someone has won it. A screen that tells someone
   * watching when they can play does not then say "from the next game". Asked
   * each time, since the game that leaves one player in takes everyone back.
   */
  out(): boolean;
}

/** A game's screen, covering the frame while a game is on. */
export interface GameScreen {
  /** The room sent the game again. A message about another game is not for this screen and is passed over. */
  update(message: GameMessage): void;
  /** The room refused what the player last asked. */
  refused(reason: string): void;
  /** The connection to the room went down: nothing the player asked for is still on its way. */
  lost(): void;
  /** Whether this player is the host, who starts the next game. */
  setHost(host: boolean): void;
  /** The player in lobby slot `slot` said a line. */
  say(slot: number, text: string): void;
  /**
   * A key was pressed for the player by something that is not a keyboard: the
   * page's menu, under a finger, opens the rules as `KeyH` does. `code` is a
   * key's code as the browser names it.
   */
  press(code: string): void;
  /**
   * What this player came out of the game with, in the word its results lead
   * with ("2위", "생존!"), for the page to say where the result is passed on;
   * `null` while the game is being played, and for someone who watched it.
   */
  verdict(): string | null;
  /**
   * A canvas of its own that the screen keeps under the frame's, where it has
   * one on show now: how much of the frame it covers from the top left, in
   * the frame's pixels. The page lays it under the frame's canvas in the
   * picture of a result (`picture.ts`). Absent for a screen that is all on
   * the frame's canvas.
   */
  under?(): { canvas: HTMLCanvasElement; width: number; height: number } | null;
  /**
   * Whether the game now waits on this player: a turn that is theirs to
   * take, or a choice put to everyone that they have not made, with a clock
   * after which the room moves for them (`src/shared/waits.ts`). Read off
   * what the room last sent, not off what the screen has got to showing, so
   * it is true in a tab that is not being drawn. A game everyone plays at
   * once from beginning to end has no such moment and leaves this out.
   */
  waits?(): boolean;
  /** Stops drawing and listening. */
  destroy(): void;
}

/** The picture of a room while a game is waited for. */
export interface WaitingScene {
  /** Who is in the room, or `null` before one is joined. */
  show(view: LobbyView | null): void;
  /** Starts or stops drawing; a hidden picture costs nothing. */
  setRunning(running: boolean): void;
  /** The player in `slot` said a line. */
  say(slot: number, text: string): void;
  /** Whose figure or name is at `x`, `y` of the picture, in its own pixels: their slot, or `null` where nobody is. */
  slotAt(x: number, y: number): number | null;
  /** Where the figure of the player in `slot` is in the picture, in its own pixels; `null` for nobody, and before the picture was drawn. */
  placeOf(slot: number): { x: number; y: number } | null;
}

/** A game as the page shows it. */
export interface GameClient {
  screen(canvas: HTMLCanvasElement, handlers: GameHandlers): GameScreen;
  scene(canvas: HTMLCanvasElement, voice: (slot: number) => VoiceMark): WaitingScene;
  /** Its rules as the page shows them before a game, in the language the page is read in. */
  sheet: RulesSheet;
}

/** Every game's screen and waiting-room picture, by the game's id. */
export const CLIENTS: Record<GameId, GameClient> = {
  "russian-roulette": {
    screen(canvas, handlers) {
      const table = createTable(canvas, handlers);
      return {
        ...table,
        update(message) {
          if (message.game === "russian-roulette") table.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: true }),
    sheet: ROULETTE_WORDS.sheet,
  },
  "count-rectangles": {
    screen(canvas, handlers) {
      const screen = createRectScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "count-rectangles") screen.update(message);
        },
      };
    },
    // the same back room, its table bare: there is no device in this game
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: RECT_WORDS.sheet,
  },
  "lay-the-grass": {
    screen(canvas, handlers) {
      const screen = createGrassScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "lay-the-grass") screen.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: GRASS_WORDS.sheet,
  },
  "count-cubes": {
    screen(canvas, handlers) {
      const screen = createCubesScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "count-cubes") screen.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: CUBES_WORDS.sheet,
  },
  "memory-poker": {
    screen(canvas, handlers) {
      const screen = createPokerScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "memory-poker") screen.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: POKER_WORDS.sheet,
  },
  "under-thirteen": {
    screen(canvas, handlers) {
      const screen = createUnderScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "under-thirteen") screen.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: UNDER_WORDS.sheet,
  },
  "mystery-stock-market": {
    screen(canvas, handlers) {
      const screen = createMarketScreen(canvas, handlers);
      return {
        ...screen,
        update(message) {
          if (message.game === "mystery-stock-market") screen.update(message);
        },
      };
    },
    scene: (canvas, voice) => createLobbyScene(canvas, voice, { device: false }),
    sheet: MARKET_WORDS.sheet,
  },
};

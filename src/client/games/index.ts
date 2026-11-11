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
  again(): void;
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
};

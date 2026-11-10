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
import { createLobbyScene } from "../lobby-scene";
import { createRectScreen } from "./count-rectangles/screen";

/** What a room sends about the game being played in it, whichever game that is. */
export type GameMessage = Extract<ServerMessage, { type: "game" }>;

/** What a game's screen asks of whoever owns the connection. */
export interface GameHandlers {
  /** The player asked something of the game: a move, a buzz, an answer. */
  act(action: unknown): void;
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
}

/** A game's screen, covering the frame while a game is on. */
export interface GameScreen {
  /** The room sent the game again. A message about another game is not for this screen and is passed over. */
  update(message: GameMessage): void;
  /** The room refused what the player last asked. */
  refused(reason: string): void;
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
  },
};

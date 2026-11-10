/**
 * Worker entry point. Routes `/parties/game-room/<room code>` to that room's
 * Durable Object and `/parties/room-directory/main` to the list of rooms;
 * everything else is the static browser client, served by the assets layer
 * before this code runs.
 */
import { routePartykitRequest } from "partyserver";

export { RoomDirectory } from "./directory";
export { GameRoom } from "./room";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env, {
      // Browsers reach a party by WebSocket and nothing else. Plain requests
      // are how the parties talk to each other inside the Worker (a room
      // reporting to the directory), so none is let in from outside.
      onBeforeRequest: () => new Response("Not Found", { status: 404 }),
    });
    return response ?? new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

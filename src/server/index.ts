/**
 * Worker entry point. Routes `/parties/game-room/<room code>` to that room's
 * Durable Object; everything else is the static browser client, served by the
 * assets layer before this code runs.
 */
import { routePartykitRequest } from "partyserver";

export { GameRoom } from "./room";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env);
    return response ?? new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

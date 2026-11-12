/**
 * Worker entry point. Routes `/parties/game-room/<room code>` to that room's
 * Durable Object and `/parties/room-directory/main` to the list of rooms;
 * everything else is the static browser client, served by the assets layer
 * before this code runs.
 */
import { routePartykitRequest } from "partyserver";
import { isValidRoomCode, type RoomConfig } from "../shared/lobby";
import { DIRECTORY_NAME } from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { ADDRESS_HEADER, withinLimit } from "./address";

export { RoomDirectory } from "./directory";
export { GameRoom } from "./room";

const rooms: RoomConfig = roomConfig;
const notFound = (): Response => new Response("Not Found", { status: 404 });
const tooMany = (): Response => new Response("Too Many Requests", { status: 429 });

/**
 * Whether one more connection is taken from the address `connecting` comes
 * from: so many in a while and no more (`CONNECT_LIMITER`, `wrangler.jsonc`).
 * Every connection wakes a room or the directory, and a script that opens
 * them without end would use up what the whole game has for a day.
 */
function mayConnect(connecting: Request, env: Env): Promise<boolean> {
  return withinLimit(env.CONNECT_LIMITER, connecting.headers.get(ADDRESS_HEADER), "CONNECT_LIMITER");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env, {
      // Browsers reach a party by WebSocket and nothing else. Plain requests
      // are how the parties talk to each other inside the Worker (a room
      // reporting to the directory), so none is let in from outside.
      onBeforeRequest: notFound,
      onBeforeConnect: async (connecting, party) => {
        // Counted before anything else: asking after names that cannot be a room counts as well.
        if (!(await mayConnect(connecting, env))) return tooMany();
        // A Durable Object comes into being, and keeps what it stores, the
        // first time its name is used: only names that can be a room, and the
        // one directory there is, get that far.
        const known =
          party.className === "GameRoom"
            ? isValidRoomCode(party.name, rooms)
            : party.className === "RoomDirectory" && party.name === DIRECTORY_NAME;
        if (!known) return notFound();
        // A page keeps one connection id through all its reconnects, so two
        // of its sockets can be open at once under the same id. The room is
        // given an id of the server's own making for each socket instead.
        const url = new URL(connecting.url);
        url.searchParams.set("_pk", crypto.randomUUID());
        return new Request(url, connecting);
      },
    });
    return response ?? notFound();
  },
} satisfies ExportedHandler<Env>;

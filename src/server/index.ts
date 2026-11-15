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
import { missingLang, missingPage } from "../shared/site/missing";
import { ADDRESS_HEADER, fromOwnPage, withinLimit } from "./address";

export { RoomDirectory } from "./directory";
export { GameRoom } from "./room";

const rooms: RoomConfig = roomConfig;
/** Where every party is reached: nothing under it is a page. */
const PARTIES_PREFIX = "/parties/";
const notFound = (): Response => new Response("Not Found", { status: 404 });
const tooMany = (): Response => new Response("Too Many Requests", { status: 429 });
const notOurs = (): Response => new Response("Forbidden", { status: 403 });

/**
 * The answer for an address that is neither a file of the site nor a party:
 * still 404, and for a person's browser a page in their language with the
 * ways back in (`missingPage`). Anything that does not ask for a page (a
 * script, a file, a request under `/parties/`) gets the two words it always
 * got.
 */
function missing(request: Request): Response {
  const url = new URL(request.url);
  const asksForPage = (request.method === "GET" || request.method === "HEAD") && (request.headers.get("Accept") ?? "").includes("text/html");
  if (!asksForPage || url.pathname.startsWith(PARTIES_PREFIX)) return notFound();
  return new Response(missingPage(missingLang(url.pathname, request.headers.get("Accept-Language"))), {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // the answer differs by who asks and is of no use kept
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      // what `public/_headers` gives every file of the site, which this answer is not
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

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
        // A page of another site may not connect from its visitors' browsers (`fromOwnPage`).
        if (!fromOwnPage(connecting.headers.get("Origin"), connecting.url)) return notOurs();
        // Counted before anything else that is asked: asking after names that cannot be a room counts as well.
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
    return response ?? missing(request);
  },
} satisfies ExportedHandler<Env>;

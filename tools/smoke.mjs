// Smoke check: is a running server fit to play on?
//
// Drives a server over its real HTTP and WebSocket addresses, as browsers
// would: the page loads, the list of rooms answers, four players make and
// join a room, talk, play a whole game to its end and leave. It observes and
// reports; it changes nothing but the room it makes, which it leaves.
//
// Usage: npm run dev (in another terminal), then
//   npm run smoke                      # http://localhost:5273
//   npm run smoke -- http://localhost:8787
// Needs Node 22 or later (it uses the built-in WebSocket).

const base = (process.argv[2] ?? "http://localhost:5273").replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");
const GAME = "russian-roulette";
const PLAYERS = 4;
const STEP_TIMEOUT_MS = 8000;
const MOVE_LIMIT = 600;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}

/** A socket that keeps what it is sent and lets a step wait for a message. */
class Client {
  constructor(url) {
    this.messages = [];
    this.texts = [];
    this.waiters = [];
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error(`could not connect to ${url}`)), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const text = String(event.data);
      let message = null;
      try {
        message = JSON.parse(text);
      } catch {
        this.texts.push(text);
      }
      if (message !== null) this.messages.push(message);
      for (const waiter of this.waiters.splice(0)) waiter();
    });
  }

  send(message) {
    this.ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  /** The latest message that satisfies `match`, waiting for one if none has come. */
  async until(what, match, from = 0) {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    for (;;) {
      for (let i = this.messages.length - 1; i >= from; i--) if (match(this.messages[i])) return this.messages[i];
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  last(type) {
    for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i].type === type) return this.messages[i];
    return null;
  }

  close() {
    this.ws.close();
  }
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function main() {
  // 1. the page
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check("the page loads", page.status === 200 && html.includes('id="frame"'), `status ${page.status}`);

  // 2. nothing but a WebSocket gets to a party from outside
  const outside = await fetch(`${base}/parties/room-directory/main`, { method: "POST", body: "{}" });
  check("a plain request to the list of rooms is refused", outside.status === 404, `status ${outside.status}`);

  // 3. the list of rooms
  const viewer = new Client(`${wsBase}/parties/room-directory/main`);
  await viewer.opened;
  const first = await viewer.until("the list of rooms", (m) => m.type === "rooms");
  check("the list of rooms answers", Array.isArray(first.rooms), `${first.rooms.length} room(s) listed`);

  // 4. a room on the list, four players
  const code = roomCode();
  const players = [];
  for (let n = 0; n < PLAYERS; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `smoke${n}`, create: n === 0, game: GAME, listed: true });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[0].until("everyone in the room", (m) => m.type === "lobby" && m.players.length === PLAYERS);
  check("four players are in the room", lobby.players.every((p) => p.connected), lobby.players.map((p) => p.nick).join(" "));
  const listed = await viewer.until("the room on the list", (m) => m.type === "rooms" && m.rooms.some((r) => r.code === code && r.players === PLAYERS));
  const row = listed.rooms.find((r) => r.code === code);
  check("the list shows the room with its host and head count", row.host === "smoke0" && row.game === GAME && !row.playing, JSON.stringify(row));

  // 5. chat reaches everyone, and only cleaned
  players[1].send({ type: "chat", text: "  smoke\ncheck  " });
  const heard = await Promise.all(players.map((p) => p.until("the chat line", (m) => m.type === "chat")));
  check("a chat line reaches everyone, cleaned", heard.every((m) => m.text === "smoke check" && m.from === 1 && m.nick === "smoke1"));

  // 6. voice is not offered where strangers come in
  players[2].send({ type: "voice", on: true, muted: false });
  const refused = await players[2].until("the refusal of voice", (m) => m.type === "refused");
  check("voice is refused in a room on the list", refused.reason === "voice-not-here", refused.reason);

  // 7. pings are answered
  players[3].send("ping");
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (!players[3].texts.includes("pong") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  check("a ping is answered", players[3].texts.includes("pong"));

  // 8. only the host starts
  players[1].send({ type: "start", bots: false });
  const notHost = await players[1].until("the refusal to start", (m) => m.type === "refused" && m.reason !== "voice-not-here");
  check("someone who is not the host cannot start", notHost.reason === "not-host", notHost.reason);
  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the game to start", (m) => m.type === "game")));
  const seats = games.map((g) => g.view.seat).sort();
  check("the game starts with a seat each", seats.join() === [...Array(PLAYERS).keys()].join(), `seats ${seats.join(" ")}`);
  await viewer.until("the list to say a game is on", (m) => m.type === "rooms" && m.rooms.some((r) => r.code === code && r.playing));
  check("the list says a game is being played", true);

  // 9. nobody is sent what is not theirs to see
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is ever sent to anyone", !sentAll.includes("smoke-check-token"));
  const secrets = games.every((g) => g.view.seats.every((s) => !("credits" in s) && !("pot" in s)));
  check("other seats' credits and deposits are not in a player's view", secrets);

  // 10. a whole game: everyone deposits one credit a turn, and swaps when the deposit earns it
  let moves = 0;
  for (; moves < MOVE_LIMIT; moves++) {
    const views = players.map((p) => p.last("game"));
    if (views.every((g) => g.view.phase === "ended")) break;
    const turn = views.findIndex((g) => g.view.phase !== "ended" && (g.view.phase === "swap" ? g.view.swapSeat : g.view.current) === g.view.seat);
    if (turn < 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    const before = views[turn].view.history.length;
    const seen = players[turn].messages.length;
    players[turn].send({ type: "action", action: views[turn].view.phase === "swap" ? { type: "swap", pair: 0 } : { type: "tamper", amount: 1 } });
    const answer = await players[turn].until(
      "the move to be made",
      (m) => (m.type === "game" && (m.view.history.length > before || m.view.phase === "ended")) || m.type === "refused",
      seen,
    );
    if (answer.type === "refused") throw new Error(`a legal move was refused: ${answer.reason}`);
    // let the others catch up before reading who is next
    await Promise.all(players.map((p) => p.until("the move to reach everyone", (m) => m.type === "game" && (m.view.history.length > before || m.view.phase === "ended"))));
  }
  const ends = players.map((p) => p.last("game"));
  check("the game plays to its end", ends.every((g) => g.view.phase === "ended"), `${moves} moves`);
  const result = ends[0].view.result;
  const same = ends.every((g) => JSON.stringify(g.view.result) === JSON.stringify(result));
  check("everyone is shown the same ending", same && result !== null);
  if (result !== null) {
    const live = result.chambers.filter((round) => round === 1).length;
    check("as many seats are hit as there were live rounds", result.hitSeats.length === live && live === ends[0].rules.bullets, `${live} round(s), hit ${result.hitSeats.join(" ")}`);
  }

  // 11. everyone leaves; the room goes off the list
  for (const p of players) p.send({ type: "leave" });
  await viewer.until("the room to leave the list", (m) => m.type === "rooms" && !m.rooms.some((r) => r.code === code));
  check("the room leaves the list when everyone has left", true);
  for (const p of players) p.close();
  viewer.close();
}

try {
  await main();
} catch (error) {
  check("the check ran to its end", false, error instanceof Error ? error.message : String(error));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed against ${base}`);
process.exit(failed === 0 ? 0 : 1);

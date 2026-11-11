// Smoke check: is a running server fit to play on?
//
// Drives a server over its real HTTP and WebSocket addresses, as browsers
// would: the page loads, the list of rooms answers, four players make and
// join a room, talk, play a whole game to its end and leave; then two more
// make a room of the second game, team up and part, and play it to its end,
// through the choice that follows its race and the contest that choice adds;
// then two make a room of the third game and lay its first park.
// It observes and reports; it changes nothing but the rooms it makes, which
// it leaves. The second game shows each answer for a few seconds, so the
// whole check takes about ten seconds longer than the moves do.
//
// Usage: npm run dev (in another terminal), then
//   npm run smoke                      # http://localhost:5273
//   npm run smoke -- http://localhost:8787
// Needs Node 22 or later (it uses the built-in WebSocket).

import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:5273").replace(/\/$/, "");
const wsBase = base.replace(/^http/, "ws");
const GAME = "russian-roulette";
const PLAYERS = 4;
const SECOND_GAME = "count-rectangles";
const THIRD_GAME = "lay-the-grass";
/** The third game's tiles as its rules have them: the check lays them as a player would, by looking at the park. */
const TILES = JSON.parse(readFileSync(new URL("../src/shared/games/lay-the-grass/tiles.json", import.meta.url), "utf8"));
const STEP_TIMEOUT_MS = 8000;
/** Long enough for the second game's pause between problems, which the server's own config sets. */
const PAUSE_TIMEOUT_MS = 30000;
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
  async until(what, match, from = 0, timeoutMs = STEP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
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

/**
 * How many rectangles on `board` add up to its target: what a player of the
 * second game has to count. Worked out here from what the server shows, as a
 * player would, and not from anything the server knows.
 */
function countRectangles(board) {
  let found = 0;
  for (let top = 0; top < board.rows; top++) {
    for (let bottom = top; bottom < board.rows; bottom++) {
      for (let left = 0; left < board.cols; left++) {
        for (let right = left; right < board.cols; right++) {
          let sum = 0;
          let whole = true;
          for (let row = top; row <= bottom; row++) {
            for (let col = left; col <= right; col++) {
              const cell = board.cells[row * board.cols + col];
              // a place with no cell: no rectangle lies across it
              if (cell === "gap") whole = false;
              // a cell with no number adds nothing
              else if (cell !== null) sum += cell;
            }
          }
          if (whole && sum === board.target) found++;
        }
      }
    }
  }
  return found;
}

/** The second game, in a room of its own: two players, off the list. */
async function secondGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `rect${n}`, create: n === 0, game: SECOND_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the second game", lobby.game === SECOND_GAME, lobby.game);

  // a team of one is not a team: its player starts alone, and holds up nobody
  players[1].send({ type: "team", team: 1 });
  const teamed = await players[0].until("the team to be told", (m) => m.type === "lobby" && m.players[1]?.team === 1);
  check("a player's choice of team is told to the room", teamed.players.map((p) => p.team).join() === "0,1");

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the second game to start", (m) => m.type === "game" || m.type === "refused")));
  check(
    "the second game starts, a team that is not full playing each alone",
    games.every((g, n) => g.type === "game" && g.game === SECOND_GAME && g.view.you?.player === n && g.view.units.length === 2),
    games.map((g) => (g.type === "refused" ? g.reason : "started")).join(" "),
  );

  // player 1 is right twice: half the units have won, and the game is over
  let right = 0;
  for (let round = 1; round <= 2; round++) {
    const open = await players[1].until(`problem ${round}`, (m) => m.type === "game" && m.view.round === round && m.view.phase === "problem", 0, PAUSE_TIMEOUT_MS);
    const count = countRectangles(open.view.board);
    players[1].send({ type: "action", action: { type: "buzz" } });
    await players[0].until("the buzz", (m) => m.type === "game" && m.view.round === round && m.view.floor?.player === 1);
    players[1].send({ type: "action", action: { type: "answer", count } });
    const closed = await players[0].until("the answer", (m) => m.type === "game" && m.view.round === round && m.view.outcome !== null);
    if (closed.view.outcome.kind === "right" && closed.view.answer === count) right++;
  }
  check("an answer counted from the board is right, both times", right === 2, `${right} of 2`);
  const hidden = players
    .flatMap((p) => p.messages)
    .filter((m) => m.type === "game" && m.view.outcome === null)
    .every((m) => m.view.answer === null && m.view.solutions === null);
  check("the answer is not sent while a problem is open", hidden);
  // the race is over: the third choice is put to both, each on the card of a player alone
  const raced = await Promise.all(players.map((p) => p.until("the third choice", (m) => m.type === "game" && m.view.phase === "choose")));
  check(
    "the race ends when half have won twice, and the third choice is put to everyone",
    raced.every((g) => g.view.units[1].place === 1 && g.view.units[0].place === 0 && g.view.choosing?.card === "alone"),
  );
  // the loser takes the added contest, the winner the small loss
  players[0].send({ type: "action", action: { type: "choose", option: 1 } });
  const waiting = await players[1].until("the first choice to be in", (m) => m.type === "game" && m.view.choosing?.chosen.length === 1);
  check("a choice is kept from the other player until both have chosen", waiting.view.choices.length === 0 && waiting.view.choosing.mine === null);
  players[1].send({ type: "action", action: { type: "choose", option: 2 } });
  const contest = await players[0].until("the added contest", (m) => m.type === "game" && m.view.duel !== null && m.view.phase === "problem");
  check("the added contest is put to whoever took it", contest.view.duel.players.join() === "0" && contest.view.answer === null);
  players[0].send({ type: "action", action: { type: "buzz" } });
  await players[1].until("the buzz of the added contest", (m) => m.type === "game" && m.view.duel !== null && m.view.floor?.player === 0);
  players[0].send({ type: "action", action: { type: "answer", count: countRectangles(contest.view.board) } });
  const ends = await Promise.all(players.map((p) => p.until("the second game to end", (m) => m.type === "game" && m.view.phase === "ended")));
  check(
    "the second game ends with the added contest won, and everyone's points counted",
    ends.every((g) => g.view.duel?.winner === 0 && g.view.scores?.map((line) => `${line.total}/${line.pieces}`).join() === "-3/3,6/0"),
    ends[0].view.scores?.map((line) => `${line.total}/${line.pieces}`).join(),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the second game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The cells of tile `number`, as [row, col] in its own box, after `turns` quarter turns clockwise. */
function tileCells(number, turns) {
  const drawing = TILES[String(number)];
  let rows = drawing.length;
  let cells = [];
  drawing.forEach((line, row) => [...line].forEach((mark, col) => mark !== "." && cells.push([row, col])));
  for (let turn = 0; turn < turns; turn++) {
    const height = rows;
    rows = Math.max(...cells.map(([, col]) => col)) + 1;
    cells = cells.map(([row, col]) => [col, height - 1 - row]);
  }
  return cells;
}

/** The first place tile `number` fits on the park as `view` shows it, or `null`: worked out from what a player sees. */
function firstWay(view, number) {
  const taken = new Set();
  for (const placement of view.placed) {
    for (const [row, col] of tileCells(placement.tile, placement.turns)) taken.add(`${placement.row + row},${placement.col + col}`);
  }
  const free = (row, col) => view.park.rows[row]?.[col] === "#" && !taken.has(`${row},${col}`);
  for (let turns = 0; turns < 4; turns++) {
    const cells = tileCells(number, turns);
    for (let row = 0; row < view.park.rows.length; row++) {
      for (let col = 0; col < view.park.rows[0].length; col++) {
        if (cells.every(([r, c]) => free(row + r, col + c))) return { row, col, turns };
      }
    }
  }
  return null;
}

/** The third game, in a room of its own: two players, off the list, one park laid with its four choices. */
async function thirdGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `grass${n}`, create: n === 0, game: THIRD_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the third game", lobby.game === THIRD_GAME, lobby.game);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the third game to start", (m) => m.type === "game" || m.type === "refused")));
  const cells = games[0].type === "game" ? games[0].view.park.rows.join("").split("#").length - 1 : 0;
  check("the third game starts on a park for two", games.every((g) => g.type === "game" && g.game === THIRD_GAME) && cells === 16, `${cells} cells`);
  check("it starts with choice 5 put to both", games[0].view.phase === "choose" && games[0].view.choosing?.which === 5, games[0].view.phase);

  /** Both choose `option` of choice `which`; resolves with what player 0 sees once the choice is settled. */
  const bothChoose = async (which, option) => {
    await players[0].until(`choice ${which} to come up`, (m) => m.type === "game" && m.view.choosing?.which === which);
    // what one has chosen is not sent to the other while the choice is open
    players[0].send({ type: "action", action: { type: "choose", option } });
    const open = await players[1].until(`player 1 to see that player 0 chose at ${which}`, (m) => m.type === "game" && m.view.choosing?.which === which && m.view.choosing.chosen.includes(0));
    const leak = JSON.stringify(open.view).includes('"option"');
    players[1].send({ type: "action", action: { type: "choose", option } });
    const settled = await players[0].until(`choice ${which} to be settled`, (m) => m.type === "game" && m.view.choices.filter((c) => c.which === which).length === 2);
    return { settled, leak };
  };

  const five = await bothChoose(5, 2);
  check("a choice is kept from the other player until both have made it", !five.leak);
  check("the picking follows choice 5", five.settled.view.phase === "pick", five.settled.view.phase);

  // a pick out of turn is refused; then each picks tile 7 in turn
  const first = five.settled.view.turn;
  players[1 - first].send({ type: "action", action: { type: "pick", tile: 7 } });
  const early = await players[1 - first].until("the refusal of a pick out of turn", (m) => m.type === "refused");
  check("a pick out of turn is refused", early.reason === "not-your-turn", early.reason);
  for (let picked = 0; picked < 2; picked++) {
    const game = await players[0].until("the next pick", (m) => m.type === "game" && m.view.picks.length === picked && m.view.phase === "pick");
    players[game.view.turn].send({ type: "action", action: { type: "pick", tile: 7 } });
  }

  // 공격 (a tile either lies whole or fails: nothing is cut), 견제, 맨홀
  await bothChoose(6, 1);
  await bothChoose(7, 2);
  const eight = await bothChoose(8, 2);
  check("the manholes follow choice 8", eight.settled.view.phase === "manholes", eight.settled.view.phase);

  // each puts a +1 and a -1 on the park, on cells of their own
  const parkCells = [];
  eight.settled.view.park.rows.forEach((line, row) => [...line].forEach((mark, col) => mark === "#" && parkCells.push({ row, col })));
  for (let down = 0; down < 4; down++) {
    const game = await players[0].until("the next manhole", (m) => m.type === "game" && m.view.manholes.length === down);
    if (game.view.phase !== "manholes") break;
    players[game.view.turn].send({ type: "action", action: { type: "manhole", ...parkCells[down] } });
  }

  // a tile laid off the park is refused; then each lays theirs in the first place it fits
  const laying = await players[0].until("the laying to begin", (m) => m.type === "game" && (m.view.phase === "place" || m.view.phase === "ended"));
  check("four manholes are on the park, two up and two down", laying.view.manholes.length === 4 && laying.view.manholes.reduce((sum, each) => sum + each.value, 0) === 0, `${laying.view.manholes.length}`);
  if (laying.view.phase === "place") {
    const from = players[laying.view.turn].messages.length;
    players[laying.view.turn].send({ type: "action", action: { type: "lay", row: 50, col: 50, turns: 0 } });
    const off = await players[laying.view.turn].until("the refusal of a tile off the park", (m) => m.type === "refused", from);
    check("a tile laid off the park is refused", off.reason === "does-not-fit", off.reason);
  }
  for (let step = 0; step < 4; step++) {
    const game = players[0].last("game");
    if (game.view.phase !== "place") break;
    const way = firstWay(game.view, 7);
    if (way === null) throw new Error("the room gave the turn to a player whose tile fits nowhere");
    const done = game.view.placed.length + game.view.failed.length;
    players[game.view.turn].send({ type: "action", action: { type: "lay", ...way } });
    await players[0].until("the tile to be laid", (m) => m.type === "game" && m.view.placed.length + m.view.failed.length > done);
  }
  const closed = players[0].last("game");
  const score = closed.view.history.find((event) => event.type === "score");
  const lines = score?.lines ?? [];
  const points = closed.view.players.reduce((sum, player) => sum + player.score, 0);
  check(
    "the park is closed with a tile laid counted double and one not laid at a loss, and every line adds up",
    closed.view.phase === "ended" &&
      lines.length === 2 &&
      lines.every((line) => line.tile === (line.laid ? 14 : -4) && line.total === line.tile + line.manholes + line.pair + line.check) &&
      points === lines.reduce((sum, line) => sum + line.total, 0),
    `${closed.view.phase}, ${closed.view.placed.length} laid, ${closed.view.failed.length} failed, ${points} points`,
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the third game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
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

  // 12. the second game
  await secondGame();

  // 13. the third game
  await thirdGame();
}

try {
  await main();
} catch (error) {
  check("the check ran to its end", false, error instanceof Error ? error.message : String(error));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed against ${base}`);
process.exit(failed === 0 ? 0 : 1);

// Smoke check: is a running server fit to play on?
//
// Drives a server over its real HTTP and WebSocket addresses, as browsers
// would: the page loads, the list of rooms answers, four players make and
// join a room, talk, play a whole game to its end and leave; then two more
// make a room of the second game, team up and part, and play it to its end,
// through the choice that follows its race and the contest that choice adds;
// then two make a room of the third game and lay its first park; then two
// make a room of the fourth game, one of them wrong before the other is right;
// then two make a room of the fifth game and play its first round; then two
// make a room of the sixth game and play its first round, one of them passing;
// then two make a room of the seventh game and play its 24 rounds to the end,
// one of them using a secret and spending a piece.
// It observes and reports; it changes nothing but the rooms it makes, which
// it leaves. The second game shows each answer for a few seconds, the fifth
// lays its board open for half a minute before anything can be chosen, and
// the sixth shows the chips for a few seconds before the cards and places the
// rocks nobody is asked about a moment apart, so the whole check takes about
// fifty seconds longer than the moves do.
//
// Usage: npm run dev (in another terminal), then
//   npm run smoke                      # http://localhost:5273
//   npm run smoke -- http://localhost:8787
//   npm run smoke -- --only=under-thirteen   # one game's part, by its id
// The part of the first game is also the one that loads the page and reads
// the list of rooms. Needs Node 22 or later (it uses the built-in WebSocket).

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:5273").replace(/\/$/, "");
/** `--only=<game id>`: that game's part alone, for a check of the part that was changed. */
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ?? null;
const wsBase = base.replace(/^http/, "ws");
const GAME = "russian-roulette";
const PLAYERS = 4;
const SECOND_GAME = "count-rectangles";
const THIRD_GAME = "lay-the-grass";
const FOURTH_GAME = "count-cubes";
const FIFTH_GAME = "memory-poker";
const SIXTH_GAME = "under-thirteen";
const SEVENTH_GAME = "mystery-stock-market";
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

/** The fourth game, in a room of its own: two players, off the list. One right answer ends it, as all but one have it then. */
async function fourthGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `cube${n}`, create: n === 0, game: FOURTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the fourth game", lobby.game === FOURTH_GAME, lobby.game);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the fourth game to start", (m) => m.type === "game" || m.type === "refused")));
  const same = JSON.stringify(games[0].view?.solid) === JSON.stringify(games[1].view?.solid);
  check(
    "the fourth game starts with the same solid for both, and one right answer to end it",
    games.every((g, n) => g.type === "game" && g.game === FOURTH_GAME && g.view.you === n && g.view.needed === 1) && same,
    games.map((g) => (g.type === "refused" ? g.reason : "started")).join(" "),
  );
  // the cubes are counted from the solid as a player sees it: every column's height, added up
  const count = games[0].view.solid.heights.reduce((sum, height) => sum + height, 0);

  // a wrong answer shuts its player out for a while, and nobody is told what was said
  players[0].send({ type: "action", action: { type: "answer", said: count + 1 } });
  const wrong = await players[1].until("the wrong answer", (m) => m.type === "game" && m.view.wrong.length === 1);
  // looked for by name: the number itself could turn up by chance in a clock or a time
  const told = [...wrong.view.wrong, ...wrong.view.history].flatMap((entry) => Object.keys(entry));
  check("a wrong answer is told to the room without the number said", wrong.view.wrong[0].player === 0 && !told.includes("said"), told.join(" "));
  players[0].send({ type: "action", action: { type: "answer", said: count } });
  const locked = await players[0].until("the refusal", (m) => m.type === "refused");
  check("a player who was wrong cannot answer again at once", locked.reason === "locked", locked.reason);

  players[1].send({ type: "action", action: { type: "answer", said: count } });
  const ends = await Promise.all(players.map((p) => p.until("the fourth game to end", (m) => m.type === "game" && m.view.phase === "ended")));
  check(
    "the fourth game ends when all but one have the answer, and gives the answer out",
    ends.every((g) => g.view.ranked.length === 1 && g.view.ranked[0].player === 1 && g.view.answer === count),
    `answer ${ends[0].view.answer}, counted ${count}`,
  );
  const hidden = players
    .flatMap((p) => p.messages)
    .filter((m) => m.type === "game" && m.view.phase !== "ended")
    .every((m) => m.view.answer === null);
  check("the answer is not sent while the problem is open", hidden);
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the fourth game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The fifth game, in a room of its own: two players, off the list. Its first round is played; the game goes on for four more, which the check does not wait for. */
async function fifthGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `card${n}`, create: n === 0, game: FIFTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the fifth game", lobby.game === FIFTH_GAME, lobby.game);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the fifth game to start", (m) => m.type === "game" || m.type === "refused")));
  const board = games[0].view?.board ?? [];
  const cells = (games[0].rules?.rows ?? 0) * (games[0].rules?.cols ?? 0);
  check(
    "the fifth game starts with the same open board for both, and the shared cards kept back",
    games.every((g, n) => g.type === "game" && g.game === FIFTH_GAME && g.view.you === n && g.view.phase === "memorise" && g.view.shared === null) &&
      board.length === cells &&
      cells > 0 &&
      new Set(board).size === cells &&
      JSON.stringify(games[1].view?.board) === JSON.stringify(board),
    `${board.length} cards`,
  );

  // nothing can be chosen while the board lies open
  players[0].send({ type: "action", action: { type: "pick", cells: [0, 1] } });
  const early = await players[0].until("the refusal", (m) => m.type === "refused");
  check("a card cannot be picked while the board lies open", early.reason === "not-choosing", early.reason);

  // the board is turned over by the room's own clock: its time to be learned, and a little more
  const turnMs = (games[0].rules.memoriseSeconds + 10) * 1000;
  const turned = await Promise.all(players.map((p) => p.until("the board to be turned over", (m) => m.type === "game" && m.view.phase === "choose", 0, turnMs)));
  check(
    "the board is turned over and its cards are no longer sent; the shared cards are out, none of them a card of the board",
    turned.every((g) => g.view.board === null && Array.isArray(g.view.shared) && g.view.shared.length === g.rules.shared && !g.view.shared.some((card) => board.includes(card))),
    `shared ${JSON.stringify(turned[0].view.shared)}`,
  );

  // each picks two cells; what one picked is theirs alone until the round is shown
  players[0].send({ type: "action", action: { type: "pick", cells: [0, 5] } });
  const mine = await players[0].until("the pick to be taken", (m) => m.type === "game" && m.view.mine.cells.length === 2);
  players[0].send({ type: "action", action: { type: "lock" } });
  const waiting = await players[1].until("the first final choice", (m) => m.type === "game" && m.view.locked.length === 1);
  check(
    "a pick is kept from the other player, who is told only that it is final",
    mine.view.mine.cells.join() === "0,5" && waiting.view.mine.cells.length === 0 && waiting.view.shown === null && waiting.view.locked.join() === "0",
  );
  players[1].send({ type: "action", action: { type: "pick", cells: [5, 10] } });
  players[1].send({ type: "action", action: { type: "lock" } });
  const shown = await Promise.all(players.map((p) => p.until("the round to be shown", (m) => m.type === "game" && m.view.phase === "reveal")));
  const hands = shown[0].view.shown?.hands ?? [];
  const outcome = shown[0].view.shown?.outcomes?.[0];
  check(
    "the round is shown as soon as both have chosen: the board again, each player's cells and hand, and who won",
    shown.every((g) => JSON.stringify(g.view.board) === JSON.stringify(board)) &&
      hands.map((hand) => hand.cells.join()).join(" ") === "0,5 5,10" &&
      hands.every((hand) => hand.forced === 0 && typeof hand.hand.kind === "string") &&
      outcome !== undefined &&
      outcome.players.join() === "0,1" &&
      (outcome.winner === null ? outcome.best.length === 2 : outcome.best.join() === `${outcome.winner}`),
    hands.map((hand) => `${hand.hand.kind} ${hand.hand.ranks[0]}`).join(" against "),
  );
  const hidden = players
    .flatMap((p) => p.messages)
    .filter((m) => m.type === "game" && m.view.phase === "choose")
    .every((m) => m.view.board === null);
  check("the board is not sent while it is turned over", hidden);
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the fifth game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The sixth game, in a room of its own: two players, off the list. Its first round is played, with a pass in it; the game goes on for thirteen more, which the check does not wait for. */
async function sixthGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `rock${n}`, create: n === 0, game: SIXTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the sixth game", lobby.game === SIXTH_GAME, lobby.game);

  /** What `player` is refused when they ask for `action`. */
  const refusalOf = async (player, action) => {
    const seen = players[player].messages.length;
    players[player].send({ type: "action", action });
    return (await players[player].until("the refusal", (m) => m.type === "refused", seen)).reason;
  };

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the sixth game to start", (m) => m.type === "game" || m.type === "refused")));
  const cards = games[0].rules?.cards ?? [];
  check(
    "the sixth game starts with empty stands and a whole set of cards and chips each, nothing put in",
    cards.length > 0 &&
      games.every(
        (g, n) =>
          g.type === "game" &&
          g.game === SIXTH_GAME &&
          g.view.you === n &&
          g.view.phase === "submit" &&
          g.view.round === 1 &&
          Object.values(g.view.stands).every((rocks) => rocks.length === 0) &&
          g.view.hand.cards.join() === cards.join() &&
          g.view.hand.chips.length === cards.length &&
          g.view.submitted.length === 0 &&
          g.view.chips === null &&
          g.view.cards === null,
      ),
    `${cards.length} cards and chips, ${games[0].view?.rounds} rounds`,
  );
  const early = await refusalOf(0, { type: "place" });
  check("a rock cannot be placed while the cards are being put in", early === "not-placing", early);

  // one puts in a card and a chip: the other is told that they have, and not what
  players[0].send({ type: "action", action: { type: "submit", card: 5, chip: "red" } });
  const mine = await players[0].until("the card to be taken", (m) => m.type === "game" && m.view.mine !== null);
  const waiting = await players[1].until("the first card to be in", (m) => m.type === "game" && m.view.submitted.length === 1);
  check(
    "what one player puts in is kept from the other, who is told only that it is in",
    mine.view.mine.card === 5 && mine.view.mine.chip === "red" && waiting.view.mine === null && waiting.view.chips === null && waiting.view.cards === null && waiting.view.submitted.join() === "0",
  );
  const twice = await refusalOf(0, { type: "submit", card: 4, chip: "green" });
  check("what is put in cannot be changed", twice === "already-submitted", twice);

  // the other puts theirs in: the chips are shown at once, the cards by the room's own clock
  players[1].send({ type: "action", action: { type: "submit", card: 3, chip: "red" } });
  const chips = await Promise.all(players.map((p) => p.until("the chips to be shown", (m) => m.type === "game" && m.view.phase === "chips")));
  check(
    "the chips are shown as soon as both are in, and the cards not yet",
    chips.every((g) => g.view.chips.map((each) => `${each.player}:${each.chip}`).join() === "0:red,1:red" && g.view.cards === null),
  );
  const placing = await Promise.all(players.map((p) => p.until("the cards to be shown", (m) => m.type === "game" && m.view.phase === "place", 0, PAUSE_TIMEOUT_MS)));
  check(
    "the cards are shown, and the higher card is to be placed first",
    placing.every((g) => g.view.cards.map((each) => `${each.player}:${each.card}`).join() === "0:5,1:3" && g.view.order.join() === "0,1" && g.view.turn === 0),
    `order ${placing[0].view.order.join(" ")}`,
  );
  const outOfTurn = await refusalOf(1, { type: "place" });
  check("a rock is not placed out of turn", outOfTurn === "not-your-turn", outOfTurn);

  // the first passes. The other is the last in the order: asked nothing, with no pass to be had, their rock is
  // placed by the room, and then the rock that was passed, with nothing more asked of anyone
  check("whoever is not the last in the order is asked to place or pass", placing[0].view.asked === "place-or-pass", placing[0].view.asked);
  players[0].send({ type: "action", action: { type: "pass" } });
  const passed = await players[1].until("the pass", (m) => m.type === "game" && m.view.passed.length === 1 && m.view.turn === 1);
  const again = await refusalOf(1, { type: "pass" });
  check("the last in the order is asked nothing and cannot pass", passed.view.asked === "nothing" && again === "cannot-pass", `${passed.view.asked}, ${again}`);
  const over = await Promise.all(players.map((p) => p.until("the round to be over", (m) => m.type === "game" && m.view.placements.length === 2, 0, PAUSE_TIMEOUT_MS)));
  check(
    "the room places both rocks itself, the one passed after the other, each on the stand of its chip, and the round is over",
    over.every(
      (g) =>
        g.view.phase === "pause" &&
        g.view.stands.red.join() === "3,5" &&
        g.view.stands.green.length === 0 &&
        g.view.stands.blue.length === 0 &&
        g.view.placements.map((rock) => `${rock.player}:${rock.stand}:${rock.weight}:${rock.sum}:${rock.cleared}:${rock.passed}:${rock.forced}`).join() ===
          "1:red:3:3:0:false:false,0:red:5:8:0:true:false" &&
        g.view.standings.every((each) => each.points === 0),
    ),
    `red ${over[0].view.stands.red.join("+")}`,
  );
  const hidden = players[1].messages.filter((m) => m.type === "game" && m.view.phase === "submit").every((m) => m.view.chips === null && m.view.cards === null && !JSON.stringify(m.view).includes('"card":5'));
  check("no card or chip is sent to the other player before it is shown", hidden);
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the sixth game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The seventh game, in a room of its own: two players, off the list, all of its rounds. */
async function seventhGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `trader${n}`, create: n === 0, game: SEVENTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room is made for the seventh game", lobby.game === SEVENTH_GAME, lobby.game);

  /** What `player` is refused when they ask for `action`. */
  const refusalOf = async (player, action) => {
    const seen = players[player].messages.length;
    players[player].send({ type: "action", action });
    return (await players[player].until("the refusal", (m) => m.type === "refused", seen)).reason;
  };
  /** A stock as `game` shows it. */
  const shown = (game, stock) => game.view.stocks.find((each) => each.id === stock);
  /**
   * The game as `player` has it once everything the room has sent them is in:
   * the room answers what is no move at all after all that came before it.
   */
  const settled = async (player) => {
    await refusalOf(player, { type: "nothing" });
    return players[player].last("game");
  };
  /** Both say they are done with `round`: what each then sees, of the next round or of the end. */
  const bothDone = async (round) => {
    for (const p of players) p.send({ type: "action", action: { type: "done", round } });
    return Promise.all(players.map((p) => p.until(`round ${round} to be over`, (m) => m.type === "game" && (m.view.round === round + 1 || m.view.phase === "ended"))));
  };

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the seventh game to start", (m) => m.type === "game" || m.type === "refused")));
  const rules = games[0].rules ?? {};
  check(
    "the seventh game starts with the same money for both, every stock at one price, and one emblem",
    games.every(
      (g, n) =>
        g.type === "game" &&
        g.game === SEVENTH_GAME &&
        g.view.you === n &&
        g.view.phase === "trading" &&
        g.view.round === 1 &&
        g.view.stocks.length === 7 &&
        g.view.stocks.every((stock) => stock.price === rules.startPrice && stock.parts === 0) &&
        g.view.mine.cash === rules.startCash &&
        g.view.mine.secret === true &&
        g.view.emblem.join() === games[0].view.emblem.join() &&
        g.view.emblem.length === rules.rounds + 1,
    ),
    `${games[0].view?.stocks?.length} stocks at ${rules.startPrice}, ${rules.startCash} each, ${rules.rounds} rounds`,
  );

  // one buys: the money goes at the round's price, and the other's monitor does not change
  players[0].send({ type: "action", action: { type: "buy", stock: "steel", shares: 3, round: 1 } });
  const bought = await players[0].until("the order to be taken", (m) => m.type === "game" && m.view.mine.shares.steel === 3);
  const other = await settled(1);
  check(
    "an order is taken at the round's price, and nobody else is shown it while the round is played",
    bought.view.mine.cash === rules.startCash - 3 * rules.startPrice && shown(bought, "steel").bought === 0 && shown(other, "steel").bought === 0 && shown(other, "steel").held === 0,
    `cash ${bought.view.mine.cash}`,
  );
  const poor = await refusalOf(0, { type: "buy", stock: "alt", shares: 11, round: 1 });
  const late = await refusalOf(0, { type: "buy", stock: "alt", shares: 1, round: 2 });
  check("an order for more than the money buys, or for a round not being played, is refused", poor === "no-cash" && late === "round-over", `${poor}, ${late}`);

  // the other gives a piece for a part of a rule, uses their secret, and buys the stock they hid
  players[1].send({ type: "action", action: { type: "peek", stock: "latter", round: 1 } });
  const peeked = await players[1].until("the piece to be taken", (m) => m.type === "game" && shown(m, "latter").parts === 1);
  players[1].send({ type: "action", action: { type: "secret", stock: "coyo", round: 1 } });
  players[1].send({ type: "action", action: { type: "buy", stock: "coyo", shares: 1, round: 1 } });
  await players[1].until("the secret and the order to be taken", (m) => m.type === "game" && m.view.mine.secret === false && m.view.mine.shares.coyo === 1);
  const unseen = await settled(0);
  check(
    "a piece opens the next part of a rule to the player who gave it, and to nobody else",
    peeked.view.mine.pieces === games[1].view.mine.pieces - 1 && shown(unseen, "latter").parts === 0,
    `pieces ${peeked.view.mine.pieces}`,
  );

  const second = await bothDone(1);
  check(
    "the round ends when both are done: the prices move and the monitor shows what was bought",
    second.every((g) => g.view.round === 2 && shown(g, "steel").price < rules.startPrice && shown(g, "steel").bought === 3 && shown(g, "steel").held === 3),
    `방어제철 ${shown(second[0], "steel").price}`,
  );
  check(
    "the stock a secret was used on is off both monitors, and everyone's assets with it",
    second.every((g) => g.view.veiled === true && shown(g, "coyo").price === null && shown(g, "coyo").bought === null && g.view.standings.every((each) => each.assets === null)),
  );
  check(
    "whoever holds the hidden stock sees neither their money nor their assets, and the other sees their own",
    second[1].view.mine.cash === null && second[1].view.mine.assets === null && typeof second[0].view.mine.cash === "number",
  );
  await bothDone(2);
  const fourth = await bothDone(3);
  check(
    "two rounds on the stock is back on the monitor, with those rounds left out of its chart",
    fourth.every((g) => g.view.veiled === false && typeof shown(g, "coyo").price === "number" && shown(g, "coyo").chart[1] === null && shown(g, "coyo").chart[2] === null && shown(g, "coyo").chart[3] !== null),
    `코요테크 ${shown(fourth[0], "coyo").price}`,
  );

  // the rest of the rounds, both done with each at once
  let last = fourth;
  for (let round = 4; last[0].view.phase !== "ended" && round <= rules.rounds; round++) last = await bothDone(round);
  const end = last[0].view.history.at(-1);
  check(
    "the game is over after its last round, with every rule open and everyone's assets shown",
    last.every(
      (g) =>
        g.view.phase === "ended" &&
        g.view.round === rules.rounds &&
        g.view.stocks.every((stock) => stock.parts === rules.revealRounds.length && stock.chart.length === rules.rounds + 1 && stock.chart.every((price) => price !== null)) &&
        g.view.standings.every((each) => typeof each.assets === "number"),
    ) &&
      end.type === "ended" &&
      end.reason === "rounds",
    last[0].view.standings.map((each) => `${each.rank}: ${each.assets}`).join(", "),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("the numbers of the price rules and the path of 알트엔터 are never sent", !sentAll.includes('"path"') && !sentAll.includes('"perShare"') && !sentAll.includes('"upPercent"'));
  check("no token is sent in the seventh game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The page, the list of rooms, and the first game: a room on the list, four players, a whole game. */
async function firstGame() {
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

/** The parts of the check, each by the game it plays, in the order they run. */
const PARTS = [
  [GAME, firstGame],
  [SECOND_GAME, secondGame],
  [THIRD_GAME, thirdGame],
  [FOURTH_GAME, fourthGame],
  [FIFTH_GAME, fifthGame],
  [SIXTH_GAME, sixthGame],
  [SEVENTH_GAME, seventhGame],
];

async function main() {
  const parts = only === null ? PARTS : PARTS.filter(([game]) => game === only);
  if (parts.length === 0) throw new Error(`--only names no game: ${only} (${PARTS.map(([game]) => game).join(", ")})`);
  for (const [, part] of parts) await part();
}

try {
  await main();
} catch (error) {
  check("the check ran to its end", false, error instanceof Error ? error.message : String(error));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed against ${base}${only === null ? "" : ` (only ${only})`}`);
process.exit(failed === 0 ? 0 : 1);

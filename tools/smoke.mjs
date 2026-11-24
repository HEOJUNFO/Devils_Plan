// Smoke check: is a running server fit to play on?
//
// Drives a server over its real HTTP and WebSocket addresses, as browsers
// would: the page loads, the list of rooms answers, four players make and
// join a room, talk, play a whole game to its end (one of them out of credits
// early, so that the room passes for them) and leave; then two more
// make a room of the second game, team up and part, and play it to its end,
// through the choice that follows its race and the contest that choice adds;
// then two make a room of the third game and lay its first park on the show's
// cards, and two more a room of it on cards drawn for the game; then two
// make a room of the fourth game, one of them wrong before the other is right;
// then two make a room of the fifth game and play its first round; then two
// make a room of the sixth game and play its first round, one of them passing,
// and three more a room of it, who each take a spot to stand at and then put
// in the same card; then two make a room of the seventh game and play its 24
// rounds to the end, one of them using a secret and spending a piece; then
// three make a room of the eighth game and play two turns of it, one closed
// with no suspicion and one with a wrong answer caught; then four make a room
// of the ninth game, bid for who is first and play its first round, one of
// them checking a card for a piece; then three make a
// room of 경매 빙고 and play its first round, and two a room of 벽바둑Ⅱ, who
// place their counters and play a turn; then two make a room of 그라데이션,
// distribute their cubes and play its first round, and two a room of
// 수식 신호등, who create their equations and play it to a win.
// It observes and reports; it changes nothing but the rooms it makes, which
// it leaves. The second game shows each answer for a few seconds, the fifth
// lays its board open for half a minute before anything can be chosen, and
// the sixth shows the chips for a few seconds before the cards and places the
// rocks nobody is asked about a moment apart, and the first waits a few
// seconds before it passes for a player with no credits, so the whole check
// takes about a minute longer than the moves do.
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
const EIGHTH_GAME = "piggy-bank";
const NINTH_GAME = "gem-black-market";
const BINGO_GAME = "auction-bingo";
const WALL_GAME = "wall-go-2";
const GRAD_GAME = "gradation";
const EQ_GAME = "equation-traffic-light";
/** The third game's tiles as its rules have them: the check lays them as a player would, by looking at the park. */
const TILES = JSON.parse(readFileSync(new URL("../src/shared/games/lay-the-grass/tiles.json", import.meta.url), "utf8"));
/** For each of the third game's choices 6 to 8, the kinds of option a card drawn for it may have, as its config has them. */
const CARD_SLOTS = JSON.parse(readFileSync(new URL("../src/shared/games/lay-the-grass/config.json", import.meta.url), "utf8")).cards.slots;
/** The kinds of drawn option that `message` says anything of: none, for a player who may not see the cards to come. */
const cardKindsIn = (message) => {
  const text = JSON.stringify(message);
  return Object.values(CARD_SLOTS).flat().filter((kind) => text.includes(`"${kind}"`));
};
/** How long the first game's room waits before it passes for a player with no credits, as its own config has it. */
const PASS_SECONDS = JSON.parse(readFileSync(new URL("../src/shared/game/host-config.json", import.meta.url), "utf8")).passSeconds;
const STEP_TIMEOUT_MS = 8000;
/** What the way to the server and back may add to, or take from, a time the check measures. */
const LAG_MS = 2000;
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
  // both take the added contest (whoever is alone in taking it has won it unplayed)
  players[0].send({ type: "action", action: { type: "choose", option: 1 } });
  const waiting = await players[1].until("the first choice to be in", (m) => m.type === "game" && m.view.choosing?.chosen.length === 1);
  check("a choice is kept from the other player until both have chosen", waiting.view.choices.length === 0 && waiting.view.choosing.mine === null);
  players[1].send({ type: "action", action: { type: "choose", option: 1 } });
  const contest = await players[0].until("the added contest", (m) => m.type === "game" && m.view.duel !== null && m.view.phase === "problem");
  check("the added contest is put to whoever took it", contest.view.duel.players.join() === "0,1" && contest.view.answer === null);
  players[0].send({ type: "action", action: { type: "buzz" } });
  await players[1].until("the buzz of the added contest", (m) => m.type === "game" && m.view.duel !== null && m.view.floor?.player === 0);
  players[0].send({ type: "action", action: { type: "answer", count: countRectangles(contest.view.board) } });
  const ends = await Promise.all(players.map((p) => p.until("the second game to end", (m) => m.type === "game" && m.view.phase === "ended")));
  check(
    "the second game ends with the added contest won, and everyone's points counted",
    ends.every((g) => g.view.duel?.winner === 0 && g.view.scores?.map((line) => `${line.total}/${line.pieces}`).join() === "-3/3,4/0"),
    ends[0].view.scores?.map((line) => `${line.total}/${line.pieces}`).join(),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the second game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The cells of tile `number`, as [row, col, whether it has a hole] in its own box, after `turns` quarter turns clockwise. */
function tileCells(number, turns) {
  const drawing = TILES[String(number)];
  let rows = drawing.length;
  let cells = [];
  drawing.forEach((line, row) => [...line].forEach((mark, col) => mark !== "." && cells.push([row, col, mark === "O"])));
  for (let turn = 0; turn < turns; turn++) {
    const height = rows;
    rows = Math.max(...cells.map(([, col]) => col)) + 1;
    cells = cells.map(([row, col, hole]) => [col, height - 1 - row, hole]);
  }
  return cells;
}

/**
 * The first place tile `number` fits whole on the park as `view` shows it, or
 * `null`: worked out from what a player sees. A tree may be covered by a
 * holed cell only, a rock by none.
 */
function firstWay(view, number) {
  const taken = new Set();
  for (const placement of view.placed) {
    for (const [row, col] of tileCells(placement.tile, placement.turns)) taken.add(`${placement.row + row},${placement.col + col}`);
  }
  const standing = new Map(view.trees.map((tree) => [`${tree.row},${tree.col}`, tree.rock === true]));
  const free = (row, col, hole) => {
    if (view.park.rows[row]?.[col] !== "#" || taken.has(`${row},${col}`)) return false;
    const rock = standing.get(`${row},${col}`);
    return rock === undefined || (!rock && hole);
  };
  for (let turns = 0; turns < 4; turns++) {
    const cells = tileCells(number, turns);
    for (let row = 0; row < view.park.rows.length; row++) {
      for (let col = 0; col < view.park.rows[0].length; col++) {
        if (cells.every(([r, c, hole]) => free(row + r, col + c, hole))) return { row, col, turns };
      }
    }
  }
  return null;
}

/** The third game, in a room of its own: two players, off the list, one park laid with the four choices of the show's cards. */
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

  // the host asks for the show's cards, which the rest of this part is about; the room draws its own otherwise
  players[0].send({ type: "variant", variant: "show" });
  const asked = await players[1].until("the room to take the show's cards", (m) => (m.type === "lobby" && m.variant === "show") || m.type === "error");
  check("the host's word for the show's cards is passed on to everyone in the room", asked.type === "lobby", asked.type);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the third game to start", (m) => m.type === "game" || m.type === "refused")));
  const cells = games[0].type === "game" ? games[0].view.park.rows.join("").split("#").length - 1 : 0;
  check("the third game starts on a park for two", games.every((g) => g.type === "game" && g.game === THIRD_GAME) && cells === 16, `${cells} cells`);
  check("it starts with choice 5 put to both, on the show's cards", games[0].view.phase === "choose" && games[0].view.choosing?.which === 5 && games[0].view.deck === "show", `${games[0].view.phase}, ${games[0].view.deck}`);

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
      lines.every((line) => line.tile === (line.laid ? 14 : -4) && line.total === line.tile + line.manholes + line.flowers + line.pair + line.check + line.harmony + line.neighbours) &&
      points === lines.reduce((sum, line) => sum + line.total, 0),
    `${closed.view.phase}, ${closed.view.placed.length} laid, ${closed.view.failed.length} failed, ${points} points`,
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the third game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/**
 * The third game again, in a room left as it is made: two players, off the
 * list, one park on cards drawn for the game. The cards of choices 6 to 8 are
 * sent to nobody before their choice comes up but to the player who chose 정보.
 */
async function thirdGameDrawn() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 2; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `drawn${n}`, create: n === 0, game: THIRD_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[1].until("both in the room", (m) => m.type === "lobby" && m.players.length === 2);
  check("a room of the third game draws its cards for each game unless the host asks otherwise", lobby.variant === "fresh", String(lobby.variant));

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the third game to start on drawn cards", (m) => m.type === "game" || m.type === "refused")));
  check(
    "it starts with the first card alone: nothing of the cards to come is sent",
    games.every((g) => g.type === "game" && g.view.deck === "fresh" && g.view.cards.map((card) => card.which).join() === "5" && cardKindsIn(g).length === 0),
    games.map((g) => (g.type === "game" ? `${g.view.deck} ${g.view.cards.map((card) => card.which).join()} ${cardKindsIn(g).join("+") || "none told"}` : g.type)).join(", "),
  );

  // player 0 takes 정보, player 1 the points
  players[0].send({ type: "action", action: { type: "choose", option: 2 } });
  players[1].send({ type: "action", action: { type: "choose", option: 1 } });
  const settled = await Promise.all(players.map((p) => p.until("choice 5 to be settled", (m) => m.type === "game" && m.view.choices.filter((c) => c.which === 5).length === 2)));
  const drawn = settled[0].view.cards.filter((card) => card.which !== 5);
  check(
    "the player who chose 정보 is sent the cards to come, and the other nothing of them",
    settled[0].view.preview.join() === "6,7,8" &&
      drawn.map((card) => card.which).join() === "6,7,8" &&
      settled[1].view.preview.length === 0 &&
      settled[1].view.cards.map((card) => card.which).join() === "5" &&
      players[1].messages.every((m) => cardKindsIn(m).length === 0),
    `informed ${settled[0].view.cards.map((card) => card.which).join()}, the other ${settled[1].view.cards.map((card) => card.which).join()}`,
  );
  check(
    "each card drawn has two different options, both of its own choice",
    drawn.length === 3 && drawn.every((card) => card.options.length === 2 && card.options[0].kind !== card.options[1].kind && card.options.every((effect) => CARD_SLOTS[card.which].includes(effect.kind))),
    drawn.map((card) => `${card.which} ${card.options.map((effect) => effect.kind).join("/")}`).join(", "),
  );

  /** What of `view` moves when anybody has done anything. */
  const progressOf = (view) =>
    [view.phase, view.turn, view.choosing?.which, view.choosing?.chosen.length, view.choices.length, view.picks.length, view.manholes.length, view.trees.length, view.placed.length, view.failed.length].join();
  /** The park's cells nothing has been put on that would keep `more` off them. */
  const cellsFreeOf = (view, standing) => {
    const cells = [];
    view.park.rows.forEach((line, row) => [...line].forEach((mark, col) => mark === "#" && cells.push({ row, col })));
    const on = (list, cell) => list.some((each) => each.row === cell.row && each.col === cell.col);
    return cells.filter((cell) => !on(view.manholes, cell) && !(standing && on(view.trees, cell)));
  };
  // The rest of the park, whatever the cards turn out to be. Each takes a side of every card, player 0 its first and
  // player 1 its second, but neither takes 방어: this check lays tiles whole, and a tile that fits only when cut
  // would be given a turn it has no move for.
  for (let step = 0; step < MOVE_LIMIT; step++) {
    const view = players[0].last("game").view;
    if (view.phase === "ended" || view.phase === "pause") break;
    const from = players[0].messages.length;
    const before = progressOf(view);
    if (view.phase === "choose") {
      const which = view.choosing.which;
      const n = [0, 1].find((each) => !view.choosing.chosen.includes(each));
      const seen = await players[n].until(`choice ${which} to come up for player ${n}`, (m) => m.type === "game" && m.view.choosing?.which === which);
      const card = seen.view.cards.find((each) => each.which === which);
      const wanted = n === 0 ? 1 : 2;
      players[n].send({ type: "action", action: { type: "choose", option: card.options[wanted - 1].kind === "defend" ? 3 - wanted : wanted } });
    } else if (view.phase === "pick") {
      players[view.turn].send({ type: "action", action: { type: "pick", tile: 7 } });
    } else if (view.phase === "manholes") {
      players[view.turn].send({ type: "action", action: { type: "manhole", ...cellsFreeOf(view, false)[0] } });
    } else if (view.phase === "trees") {
      // from the far end of the park, so that the tiles laid from its near end have room
      players[view.turn].send({ type: "action", action: { type: "tree", ...cellsFreeOf(view, true).at(-1) } });
    } else {
      const way = firstWay(view, 7);
      if (way === null) throw new Error("the room gave the turn to a player whose tile fits nowhere");
      players[view.turn].send({ type: "action", action: { type: "lay", ...way } });
    }
    await players[0].until("the third game to move on", (m) => (m.type === "game" && progressOf(m.view) !== before) || m.type === "refused", from);
  }
  const ends = await Promise.all(players.map((p) => p.until("the park of drawn cards to be closed", (m) => m.type === "game" && m.view.phase === "ended")));
  const closed = ends[0];
  const refused = players.flatMap((p) => p.messages).filter((m) => m.type === "refused");
  check("nothing this check asked for on the drawn cards was refused", refused.length === 0, refused.map((m) => m.reason).join(" "));
  const lines = closed.view.history.find((event) => event.type === "score")?.lines ?? [];
  // 점수, which player 1 took at choice 5, is given at the choice and is in no line of the park
  const given = closed.view.cards.find((card) => card.which === 5)?.options[0].points ?? 0;
  const points = closed.view.players.reduce((sum, player) => sum + player.score, 0);
  check(
    "the park is closed on the drawn cards, and every line adds up",
    lines.length === 2 &&
      lines.every((line) => line.total === line.tile + line.manholes + line.flowers + line.pair + line.check + line.harmony + line.neighbours) &&
      points === given + lines.reduce((sum, line) => sum + line.total, 0),
    `${closed.view.placed.length} laid, ${closed.view.failed.length} failed, ${points} points`,
  );
  check("by the end both have been shown every card", ends.every((g) => g.view.cards.map((card) => card.which).join() === "5,6,7,8"), ends.map((g) => g.view.cards.map((card) => card.which).join()).join(" | "));
  /** What player `n` took at choice 8: what they were to put on the park. */
  const heldAtEight = (n) => {
    const option = closed.view.choices.find((chosen) => chosen.which === 8 && chosen.player === n)?.option;
    return closed.view.cards.find((card) => card.which === 8)?.options[option - 1];
  };
  const put = [0, 1].map((n) => {
    const effect = heldAtEight(n);
    const cells = closed.view.manholes.filter((each) => each.by === n);
    const stands = closed.view.trees.filter((each) => each.by === n);
    const asCard =
      effect?.kind === "manhole" || effect?.kind === "flower"
        ? stands.length === 0 && cells.map((each) => each.value).join() === effect.values.join() && cells.every((each) => (each.flower === true) === (effect.kind === "flower"))
        : cells.length === 0 && stands.length === effect?.count && stands.every((each) => (each.rock === true) === (effect.kind === "rock"));
    return { asCard, said: `${effect?.kind}: ${cells.length} in the ground, ${stands.length} standing` };
  });
  check("each put on the park what the card of choice 8 had them put", put.every((each) => each.asCard), put.map((each) => each.said).join(", "));
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in a room of drawn cards either", !sentAll.includes("smoke-check-token"));

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

  // the sum above is what anyone can read off the wire at once: the room takes no answer that soon
  players[1].send({ type: "action", action: { type: "answer", said: count } });
  const soon = await players[1].until("the refusal of an answer in the first moment", (m) => m.type === "refused");
  check("an answer sooner than a person could count is not taken", soon.reason === "too-soon", soon.reason);
  await new Promise((resolve) => setTimeout(resolve, (games[0].clock.answersIn ?? 0) + 200));

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

/**
 * The sixth game with three in the room, off the list. Before round 1 each takes a spot of the ring, and it is the
 * spots, not the order they came in, that tell equal cards apart. The check leaves when the first cards are shown.
 */
async function sixthGameSpots() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 3; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `spot${n}`, create: n === 0, game: SIXTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  await players[2].until("all three in the room", (m) => m.type === "lobby" && m.players.length === 3);

  /** What `player` is refused when they ask for `action`. */
  const refusalOf = async (player, action) => {
    const seen = players[player].messages.length;
    players[player].send({ type: "action", action });
    return (await players[player].until("the refusal", (m) => m.type === "refused", seen)).reason;
  };

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the sixth game to start for three", (m) => m.type === "game" || m.type === "refused")));
  check(
    "with three in the room the sixth game starts with spots to take, all of them free",
    games.every(
      (g, n) =>
        g.type === "game" &&
        g.view.you === n &&
        g.view.phase === "spots" &&
        g.view.round === 1 &&
        g.view.spots.length === 3 &&
        g.view.spots.every((who) => who === null) &&
        g.view.players.join() === "0,1,2",
    ),
    games.map((g) => (g.type === "game" ? `${g.view.phase} ${JSON.stringify(g.view.spots)}` : g.type)).join(", "),
  );
  const early = await refusalOf(0, { type: "submit", card: 4, chip: "red" });
  check("no card is put in while spots are being taken", early === "not-submitting", early);

  // the last to come in takes the first spot: everyone is shown it
  players[2].send({ type: "action", action: { type: "take", spot: 0 } });
  const shown = await Promise.all(players.map((p) => p.until("the first spot to be taken", (m) => m.type === "game" && m.view.spots[0] === 2)));
  check("a spot taken is shown to everyone", shown.every((g) => g.view.phase === "spots" && g.view.spots.join() === "2,,"), JSON.stringify(shown[0].view.spots));
  const taken = await refusalOf(0, { type: "take", spot: 0 });
  const held = await refusalOf(2, { type: "take", spot: 1 });
  const off = await refusalOf(1, { type: "take", spot: 3 });
  check("a spot is given once, is kept, and is one of the ring", taken === "spot-taken" && held === "spot-held" && off === "bad-action", `${taken}, ${held}, ${off}`);

  // the other two stand so that clockwise runs against the order they came in: 2, 1, 0
  const standing = [2, 1, 0];
  players[1].send({ type: "action", action: { type: "take", spot: 1 } });
  players[0].send({ type: "action", action: { type: "take", spot: 2 } });
  const round = await Promise.all(players.map((p) => p.until("round 1 to open", (m) => m.type === "game" && m.view.phase === "submit")));
  const first = games[0].view.first;
  check(
    "round 1 opens when the last spot is taken, with the players in the order they stand and the first player it started with",
    round.every((g) => g.view.round === 1 && g.view.players.join() === standing.join() && g.view.spots.length === 0 && g.view.first === first && g.view.submitted.length === 0),
    `standing ${round[0].view.players.join(" ")}, first ${round[0].view.first}`,
  );

  // all three put in the same card and the same chip: only where they stand tells them apart
  for (const p of players) p.send({ type: "action", action: { type: "submit", card: 4, chip: "red" } });
  const placing = await Promise.all(players.map((p) => p.until("the equal cards to be shown", (m) => m.type === "game" && m.view.phase === "place", 0, PAUSE_TIMEOUT_MS)));
  const clockwise = standing.map((_, n) => standing[(standing.indexOf(first) + n) % standing.length]);
  check(
    "between equal cards the order is clockwise by the spots, from the first player",
    placing.every((g) => g.view.order.join() === clockwise.join() && g.view.turn === first),
    `first ${first}, order ${placing[0].view.order.join(" ")}`,
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent while spots are taken either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The seventh game, in a room of its own: two players, off the list, all of its rounds. */
async function seventhGame() {
  /** Two players in a new room of the seventh game, and the lobby as the second sees it with both in. */
  const enter = async () => {
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
    return { players, lobby };
  };

  // a room starts with rules drawn for each game: nobody is sent them, only what is open of each
  const own = await enter();
  check("a room of the seventh game starts with rules drawn for each game", own.lobby.variant === "fresh", own.lobby.variant);
  own.players[0].send({ type: "start", bots: false });
  const drawn = await Promise.all(own.players.map((p) => p.until("a game with rules of its own to start", (m) => m.type === "game" || m.type === "refused")));
  const pieces = drawn.flatMap((g) => (g.view?.stocks ?? []).flatMap((stock) => [...(stock.card?.ko ?? []), ...(stock.card?.en ?? [])]));
  const covered = pieces.filter((piece) => !piece.open);
  check(
    "such a game sends each rule as the words open so far and the shape of the rest, in both languages",
    drawn.every((g) => g.type === "game" && g.view.rulebook === "fresh" && g.view.stocks.every((stock) => stock.card.ko.length > 0 && stock.card.en.length > 0)) &&
      pieces.some((piece) => piece.open && typeof piece.key === "string") &&
      covered.length > pieces.length / 2 &&
      covered.every((piece) => Object.keys(piece).every((key) => ["open", "next", "words", "glue"].includes(key))),
    `${pieces.length - covered.length} of ${pieces.length} pieces open`,
  );
  const ownSent = own.players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("the rules it drew are never sent", !ownSent.includes('"kind"') && !ownSent.includes('"draw"'));
  for (const p of own.players) p.send({ type: "leave" });
  for (const p of own.players) p.close();

  // the rest is played by the show's rules, which the host asks for: its prices are known
  const { players, lobby } = await enter();
  check("a room is made for the seventh game", lobby.game === SEVENTH_GAME, lobby.game);
  players[0].send({ type: "variant", variant: "show" });
  const asked = await Promise.all(players.map((p) => p.until("the show's rules to be chosen", (m) => (m.type === "lobby" && m.variant === "show") || m.type === "refused")));
  check("the host can ask for the show's rules, and everyone in the room is told", asked.every((m) => m.type === "lobby" && m.variant === "show"), asked.map((m) => m.variant ?? m.reason).join(", "));

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
        g.view.rulebook === "show" &&
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
  const leaked = ['"path"', '"perShare"', '"upPercent"', '"kind"'].filter((word) => sentAll.includes(word));
  check("the price rules and the path of 알트엔터 are never sent", leaked.length === 0, leaked.join(" "));
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
  const secrets = games.every(
    (g) => !("pot" in g.view) && !("outCount" in g.view) && g.view.seats.every((s, seat) => !("credits" in s) && (seat === g.view.seat || s.out === null)),
  );
  check("other seats' credits, who is out of them and the credits gathered for the swap are not in a player's view", secrets);

  // 10. a whole game: everyone puts one credit a turn towards the swap, and whoever's credit earns it makes
  // it. The first to move, after that first credit, spends as fast as a turn allows, so that the game goes on
  // with one seat out of credits: the room passes for that seat itself, a pause after its turn came. The check
  // waits for the first such pass; after it everyone spends fast, and the seat with nothing left passes by
  // hand, which the room still takes.
  let moves = 0;
  let hidden = null;
  let spender = null;
  let roomPass = null;
  for (; moves < MOVE_LIMIT; moves++) {
    const views = players.map((p) => p.last("game"));
    if (views.every((g) => g.view.phase === "ended")) break;
    const turn = views.findIndex((g) => g.view.phase !== "ended" && g.view.current === g.view.seat);
    if (turn < 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    if (spender === null) spender = turn;
    const mine = views[turn].view;
    const rules = views[turn].rules;
    // each player is told the game in their own words: what one has been told so far says nothing of another
    const told = views.map((g) => g.view.history.length);
    const seen = players[turn].messages.length;
    if (roomPass === null && mine.phase !== "swap" && mine.credits === 0) {
      // nothing is sent: this pass is the room's to make
      const since = Date.now();
      const longest = PASS_SECONDS.most * 1000 + LAG_MS;
      const passed = await Promise.all(
        players.map((p, n) => p.until("the room to pass for the seat with no credits", (m) => m.type === "game" && m.view.history.length > told[n], 0, longest + STEP_TIMEOUT_MS)),
      );
      const waited = Date.now() - since;
      const mover = passed[turn].view.history.at(-1)?.type;
      const rest = passed.filter((_, n) => n !== turn).map((g) => g.view.history.at(-1)?.type);
      roomPass = {
        ok: mover === "pass" && rest.every((type) => type === "hidden") && waited >= PASS_SECONDS.least * 1000 - LAG_MS && waited <= longest,
        detail: `after ${(waited / 1000).toFixed(1)}s, mover ${mover}, others ${rest.join(" ")}`,
      };
      continue;
    }
    const fast = roomPass !== null || (turn === spender && mine.history.some((event) => event.seat === mine.seat));
    const action =
      mine.phase === "swap"
        ? { type: "swap", pair: 0 }
        : mine.credits === 0
          ? { type: "pass" }
          : !fast
            ? { type: "tamper", amount: 1 }
            : mine.credits >= rules.costRotate2
              ? { type: "rotate", steps: 2 }
              : { type: "tamper", amount: Math.min(rules.tamperMaxPerTurn, mine.credits) };
    players[turn].send({ type: "action", action });
    const answer = await players[turn].until(
      "the move to be made",
      (m) => (m.type === "game" && (m.view.history.length > told[turn] || m.view.phase === "ended")) || m.type === "refused",
      seen,
    );
    if (answer.type === "refused") throw new Error(`a legal move was refused: ${answer.reason}`);
    // credits that earn the swap show on no other screen until the swap is made: the others have nothing to catch up with
    if (answer.view.phase === "swap") continue;
    // let the others catch up before reading who is next
    const caught = await Promise.all(
      players.map((p, n) => p.until("the move to reach everyone", (m) => m.type === "game" && (m.view.history.length > told[n] || m.view.phase === "ended"))),
    );
    if (hidden === null) {
      // the first move of the game: one credit towards the swap
      const mover = caught[turn].view.history.at(-1)?.type;
      const rest = caught.filter((_, n) => n !== turn).map((g) => g.view.history.at(-1)?.type);
      hidden = { ok: mover === "tamper" && rest.every((type) => type === "hidden"), detail: `mover ${mover}, others ${rest.join(" ")}` };
    }
  }
  check("credits put towards the swap reach the other players as a hidden action and nothing more", hidden !== null && hidden.ok, hidden?.detail ?? "no move was made");
  check(
    "the room passes for a player with no credits, a pause after their turn came, and the others hear of a hidden action",
    roomPass !== null && roomPass.ok,
    roomPass?.detail ?? "no seat was out of credits on its turn before the game ended",
  );
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

/** The eighth game, in a room of its own: three players, off the list. Two turns are played, the second answered wrong and caught; the game goes on, which the check does not wait for. */
async function eighthGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 3; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `saver${n}`, create: n === 0, game: EIGHTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[2].until("all three in the room", (m) => m.type === "lobby" && m.players.length === 3);
  check("a room is made for the eighth game", lobby.game === EIGHTH_GAME, lobby.game);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the eighth game to start", (m) => m.type === "game" || m.type === "refused")));
  const view = games[0].view;
  check(
    "the eighth game starts with a bank for each player and one more on the first player's top shelf",
    games.every((g, n) => g.type === "game" && g.game === EIGHTH_GAME && g.view.you === n && g.view.phase === "put") &&
      view.banks.join() === "1,2,3,4" &&
      view.shelves.filter((shelf) => shelf.top !== null).map((shelf) => shelf.player).join() === `${view.turn}` &&
      view.ask === "black",
    `first: player ${view?.turn}`,
  );
  const first = view.turn;
  const second = view.order.find((player) => player !== first);
  const third = view.order.find((player) => player !== first && player !== second);
  const bankOf = (game, player) => game.view.shelves.find((shelf) => shelf.player === player).bottom;

  // a turn nobody doubts: two black and one white go into the first player's bank, and whoever is passed it says three
  players[second].send({ type: "action", action: { type: "put", black: 1, white: 0, to: first } });
  const early = await players[second].until("the refusal", (m) => m.type === "refused");
  check("coins cannot be put in out of turn", early.reason === "not-your-turn", early.reason);
  const firstBank = bankOf(games[0], first);
  players[first].send({ type: "action", action: { type: "put", black: 2, white: 1, to: second } });
  const asked = await Promise.all(players.map((p) => p.until("the question", (m) => m.type === "game" && m.view.phase === "answer")));
  check(
    "what was put in is said to everyone, and whoever was passed the bank is asked for its black coins",
    asked.every((g) => g.view.said.black === 2 && g.view.said.white === 1 && g.view.question.player === second && g.view.question.bank === firstBank && g.view.question.colour === "black"),
  );
  players[second].send({ type: "action", action: { type: "answer", count: 3 } });
  await players[first].until("the answer", (m) => m.type === "game" && m.view.phase === "suspect");
  players[first].send({ type: "action", action: { type: "pass" } });
  players[third].send({ type: "action", action: { type: "pass" } });
  const closed = await Promise.all(players.map((p) => p.until("the question to be closed", (m) => m.type === "game" && m.view.phase === "put" && m.view.questions === 1)));
  check(
    "with no suspicion declared the question is closed at once, and whoever answered puts next; nothing says any more what was put in",
    closed.every((g) => g.view.turn === second && g.view.said === null && g.view.question === null && g.view.ask === "white"),
  );

  // a wrong answer, caught: the bank is opened, and only then is what it holds sent
  const secondBank = bankOf(closed[0], second);
  players[second].send({ type: "action", action: { type: "put", black: 0, white: 4, to: third } });
  await players[third].until("the second question", (m) => m.type === "game" && m.view.phase === "answer" && m.view.questions === 2);
  players[third].send({ type: "action", action: { type: "answer", count: 9 } });
  await players[first].until("the second answer", (m) => m.type === "game" && m.view.phase === "suspect" && m.view.questions === 2);
  players[first].send({ type: "action", action: { type: "suspect" } });
  const opened = await Promise.all(players.map((p) => p.until("the bank to be opened", (m) => m.type === "game" && m.view.phase === "opened")));
  const scores = opened[0].view.shelves.map((shelf) => shelf.score);
  check(
    "a suspicion opens the bank: five white coins and not nine, a point to whoever declared it and one off whoever answered",
    opened.every((g) => g.view.opened.bank === secondBank && g.view.opened.white === 5 && g.view.opened.black === 1 && g.view.opened.right && g.view.opened.loser === third && !g.view.banks.includes(secondBank)) &&
      scores[first] === 1 &&
      scores[third] === -1 &&
      scores[second] === 0,
    `scores ${scores.join("/")}`,
  );
  const sent = players.flatMap((p) => p.messages).filter((m) => m.type === "game");
  const told = sent.filter((m) => m.view.opened === null && m.view.said === null).every((m) => !/"black":|"white":/.test(JSON.stringify(m)));
  check("what a bank holds is in no message but that of an opened bank, and what is put in only while its question is open", told, `${sent.length} messages`);
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the eighth game either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The ninth game, in a room of its own: four players, off the list. The first player is bid for and the first round played to its count; the game goes on, which the check does not wait for. */
async function ninthGame() {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < 4; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `dealer${n}`, create: n === 0, game: NINTH_GAME, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[3].until("all four in the room", (m) => m.type === "lobby" && m.players.length === 4);
  check("a room is made for the ninth game", lobby.game === NINTH_GAME, lobby.game);

  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("the ninth game to start", (m) => m.type === "game" || m.type === "refused")));
  check(
    "the ninth game starts with an auction for who is first, and tells each player whose secret buddy they are and nobody a card",
    games.every((g, n) => g.type === "game" && g.game === NINTH_GAME && g.view.you === n && g.view.phase === "auction" && g.view.mine === null && g.view.buddyOf !== null && g.view.buddyOf !== n) &&
      new Set(games.map((g) => g.view.buddyOf)).size === 4 &&
      games[0].cards.length === 8,
    `phase ${games[0].view?.phase}`,
  );

  // player 2 bids two pieces and nobody else any: player 2 is first, and pays
  players[1].send({ type: "action", action: { type: "exchange", with: { to: "trash" } } });
  const early = await players[1].until("the refusal", (m) => m.type === "refused");
  check("no card is exchanged before there are cards", early.reason === "not-your-turn", early.reason);
  for (const n of [0, 1, 3]) players[n].send({ type: "action", action: { type: "bid", pieces: 0 } });
  players[2].send({ type: "action", action: { type: "bid", pieces: 2 } });
  const dealt = await Promise.all(players.map((p) => p.until("the cards to be dealt", (m) => m.type === "game" && m.view.phase === "look")));
  const order = dealt[0].view.order;
  check(
    "whoever bid the most is first and pays their bid; everyone is dealt a card and sees their own alone",
    dealt.every((g) => g.view.first === 2 && g.view.mine !== null && g.view.sequence.length === 8 && g.view.sequence[0] === 2 && g.view.sequence[7] === 2) &&
      dealt[0].view.standings.map((each) => `${each.player}:${each.pieces}`).sort().join() === "0:3,1:3,2:1,3:3",
    `first ${dealt[0].view.first}`,
  );
  // someone who is not first pays a piece to check the trash, and is the only one shown it
  const checker = order.find((player) => player !== 2);
  players[checker].send({ type: "action", action: { type: "peek", at: { to: "trash" } } });
  const checked = await Promise.all(players.map((p) => p.until("the card to be checked", (m) => m.type === "game" && m.view.history.some((event) => event.type === "peek"))));
  check(
    "a piece checks one card of the table, for whoever paid and nobody else",
    checked.every((g, n) => g.view.peeked.length === (n === checker ? 1 : 0)) && checked[checker].view.peeked[0].at.to === "trash" && checked[0].view.standings.find((each) => each.player === checker).pieces === 2,
  );
  for (const p of players) p.send({ type: "action", action: { type: "ready" } });

  // the round: everyone exchanges twice, a bomb with the next player and any other card with the first buyers' slot
  const held = new Map(dealt.map((g, n) => [n, g.view.mine]));
  let seenOthers = true;
  for (let at = 0; at < 8; at++) {
    const turn = dealt[0].view.sequence[at];
    const mine = await players[turn].until(`turn ${at + 1}`, (m) => m.type === "game" && m.view.phase === "exchange" && m.view.turnAt === at);
    const others = await Promise.all(players.filter((_, n) => n !== turn).map((p) => p.until(`turn ${at + 1} for the others`, (m) => m.type === "game" && m.view.phase === "exchange" && m.view.turnAt === at)));
    seenOthers &&= mine.view.mine !== null && others.every((g) => g.view.mine === null);
    const next = order[(order.indexOf(turn) + 1) % order.length];
    const target = mine.view.bomb ? { to: "player", player: next } : { to: "buyer", slot: 0 };
    if (at === 0 && !mine.view.bomb) {
      players[turn].send({ type: "action", action: { type: "exchange", with: { to: "player", player: turn } } });
      const own = await players[turn].until("the refusal of one's own card", (m) => m.type === "refused");
      check("a card is not exchanged with itself", own.reason === "bad-target", own.reason);
    }
    players[turn].send({ type: "action", action: { type: "exchange", with: target } });
    const got = await players[turn].until(`the card of turn ${at + 1}`, (m) => m.type === "game" && m.view.phase === "seen" && m.view.turnAt === at);
    held.set(turn, got.view.mine);
    players[turn].send({ type: "action", action: { type: "ready" } });
  }
  check("on a turn only whoever's turn it is is shown their card", seenOthers);
  const shown = await Promise.all(players.map((p) => p.until("the round to be counted", (m) => m.type === "game" && m.view.phase === "reveal")));
  const count = shown[0].view.shown;
  const worth = (card) => (card.kind === "bomb" ? card.value : card.value * count.buyers.filter((each) => each.kind === card.kind).length);
  check(
    "the round is counted: every card is shown, a gem scores its number for each gem of its kind the buyers hold, a bomb costs its number",
    shown.every((g) => g.view.shown.round === 1 && g.view.shown.lines.length === 4) &&
      count.buyers.length === 3 &&
      count.lines.every((line) => line.points === worth(line.card) && line.total === line.points + line.taken) &&
      shown[2].view.shown.lines.find((line) => line.player === 2).card.kind === held.get(2).kind,
    count.lines.map((line) => `${line.card.kind[0]}${line.card.value}:${line.points}`).join(" "),
  );
  const sent = players.flatMap((p, n) => p.messages.filter((m) => m.type === "game").map((m) => [n, m]));
  const quiet = sent
    .filter(([, m]) => m.view.shown === null)
    .every(([, m]) => (JSON.stringify(m.view).match(/"kind"/g) ?? []).length === (m.view.mine === null ? 0 : 1) + m.view.peeked.length);
  check("until a round is counted a message names no card but the player's own on their turn and the one they paid to check", quiet, `${sent.length} messages`);
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in the ninth game either, and nobody is told a secret buddy but whose they are", !sentAll.includes("smoke-check-token") && !sentAll.includes('"buddy":'));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** Makes a room of `game` off the list and brings `count` players into it, the first making it. */
async function roomOf(game, count, nick) {
  const code = roomCode();
  const players = [];
  for (let n = 0; n < count; n++) {
    const client = new Client(`${wsBase}/parties/game-room/${code}`);
    await client.opened;
    client.send({ type: "join", token: `smoke-check-token-${code}-${n}`, nick: `${nick}${n}`, create: n === 0, game, listed: false });
    await client.until(`player ${n} to be let in`, (m) => m.type === "lobby" || m.type === "error");
    players.push(client);
  }
  const lobby = await players[count - 1].until("everyone in the room", (m) => m.type === "lobby" && m.players.length === count);
  check(`a room is made for ${game}`, lobby.game === game, lobby.game);
  return players;
}

/** 경매 빙고, in a room of its own: three players, off the list. Its first round is played: tickets, bids, and what everyone is told of them. */
async function bingoGame() {
  const players = await roomOf(BINGO_GAME, 3, "bidder");
  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("경매 빙고 to start", (m) => m.type === "game" || m.type === "refused")));
  check(
    "경매 빙고 starts with a card of nine squares, ten coins worth 30 won and three pieces each",
    games.every((g, n) => g.type === "game" && g.game === BINGO_GAME && g.view.you === n && g.view.phase === "choose" && g.view.round === 1 && g.view.board.length === 9) &&
      games.every((g) => g.view.purse.coins.length === 10 && g.view.purse.coins.reduce((sum, coin) => sum + coin, 0) === 30 && g.view.purse.pieces === 3),
  );

  players[1].send({ type: "action", action: { type: "bid", coins: [1] } });
  const early = await players[1].until("the refusal", (m) => m.type === "refused");
  check("a bid cannot be made before the tickets are in", early.reason === "not-bidding", early.reason);

  // two tickets on the triangle and one on the star
  players[0].send({ type: "action", action: { type: "choose", shape: "triangle" } });
  const one = await players[1].until("the first ticket", (m) => m.type === "game" && m.view.chosen.length === 1);
  check("a ticket that is in is told to the others as in, and not where it went", one.view.chosen.join() === "0" && one.view.choices === null && !JSON.stringify(one.view).includes("triangle\",\"player"));
  players[1].send({ type: "action", action: { type: "choose", shape: "triangle" } });
  players[2].send({ type: "action", action: { type: "choose", shape: "star" } });
  const bidding = await Promise.all(players.map((p) => p.until("the bids to open", (m) => m.type === "game" && m.view.phase === "bid")));
  check(
    "with every ticket in, everyone sees who chose what",
    bidding.every((g) => g.view.choices.map((each) => `${each.player}${each.shape}`).sort().join() === "0triangle,1triangle,2star"),
  );

  // 1 won and 2 won on the triangle, 1 won on the star: the triangle goes for 2 won, which is the highest and kept secret
  players[0].send({ type: "action", action: { type: "bid", coins: [1] } });
  players[1].send({ type: "action", action: { type: "bid", coins: [2] } });
  const waiting = await players[2].until("two bids", (m) => m.type === "game" && m.view.bidders.length === 2);
  check("who has bid is told, and not how much", waiting.view.bidders.slice().sort().join() === "0,1" && waiting.view.bid === null && waiting.view.mine.length === 0);
  players[2].send({ type: "action", action: { type: "bid", coins: [1] } });
  const shown = await Promise.all(players.map((p) => p.until("the round's result", (m) => m.type === "game" && m.view.phase === "result")));
  const lots = shown[0].view.past[0]?.lots ?? [];
  const lot = (shape) => lots.find((each) => each.shape === shape);
  check(
    "the winning bids are told, the highest of them kept secret, and nobody is told who won",
    shown.every((g) => JSON.stringify(g.view.past) === JSON.stringify(shown[0].view.past) && g.view.final === null) &&
      lot("triangle").votes === 2 && lot("triangle").secret && lot("triangle").price === null &&
      lot("star").votes === 1 && !lot("star").secret && lot("star").price === 1 &&
      lot("circle").votes === 0 && lot("circle").price === null,
    JSON.stringify(lots),
  );
  check(
    "each player's own bid is in their own log and their coins are gone",
    shown.every((g, n) => g.view.mine.length === 1 && g.view.mine[0].amount === (n === 1 ? 2 : 1) && g.view.purse.coins.length === 9),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in 경매 빙고 either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** 벽바둑Ⅱ, in a room of its own: two players, off the list. They place their square counters and the first plays a turn. */
async function wallGame() {
  const players = await roomOf(WALL_GAME, 2, "waller");
  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("벽바둑Ⅱ to start", (m) => m.type === "game" || m.type === "refused")));
  const view = games[0].view;
  const [first, second] = view.order;
  check(
    "벽바둑Ⅱ for two starts on 49 squares with each player's two round counters set, and the square ones to place first, second, second, first",
    games.every((g, n) => g.type === "game" && g.game === WALL_GAME && g.view.you === n && g.view.phase === "place" && g.view.mode === "duel") &&
      view.size === 7 &&
      view.counters.length === 4 &&
      view.counters.every((counter) => counter.kind === "round") &&
      view.placing.join() === [first, second, second, first].join() &&
      !view.breaking,
    `first: player ${first}`,
  );

  players[second].send({ type: "action", action: { type: "place", kind: "square", x: 0, y: 0 } });
  const early = await players[second].until("the refusal", (m) => m.type === "refused");
  check("a counter cannot be placed out of turn", early.reason === "not-your-turn", early.reason);

  const squares = [
    [first, 0, 0],
    [second, 6, 6],
    [second, 6, 0],
    [first, 0, 6],
  ];
  for (const [nth, [player, x, y]] of squares.entries()) {
    players[player].send({ type: "action", action: { type: "place", kind: "square", x, y } });
    await players[player].until(`counter ${nth + 1} to be placed`, (m) => m.type === "game" && m.view.counters.length === 5 + nth);
  }
  const placed = await Promise.all(players.map((p) => p.until("the first move to be waited for", (m) => m.type === "game" && m.view.phase === "move")));
  check("with every counter down the first player moves first", placed.every((g) => g.view.turn === first && g.view.counters.length === 8 && g.view.placing.length === 0));

  // the first player's square counter goes two squares along the top edge
  players[first].send({ type: "action", action: { type: "move", from: { x: 0, y: 0 }, path: ["right", "down"], breaker: false } });
  const bent = await players[first].until("the refusal", (m) => m.type === "refused");
  check("a square counter does not turn a corner", bent.reason === "bad-move", bent.reason);
  players[first].send({ type: "action", action: { type: "move", from: { x: 0, y: 0 }, path: ["right", "right"], breaker: false } });
  const moved = await Promise.all(players.map((p) => p.until("the move", (m) => m.type === "game" && m.view.phase === "wall")));
  check(
    "a move is followed by the same player's wall",
    moved.every((g) => g.view.turn === first && g.view.counters[g.view.moved].x === 2 && g.view.counters[g.view.moved].y === 0),
  );
  players[first].send({ type: "action", action: { type: "wall", side: "up" } });
  const edge = await players[first].until("the refusal", (m) => m.type === "refused" && m.reason !== "bad-move");
  check("a wall cannot be placed on the edge of the board", edge.reason === "wall-there", edge.reason);
  players[first].send({ type: "action", action: { type: "wall", side: "down" } });
  const walled = await Promise.all(players.map((p) => p.until("the wall", (m) => m.type === "game" && m.view.phase === "move" && m.view.turn === second)));
  check(
    "the wall stands under the counter in its player's colour, and the turn passes",
    walled.every((g) => g.view.walls[(0 * 7 + 2) * 2 + 1] === first + 1 && g.view.walls.filter((each) => each !== 0).length === 1 && g.view.history.at(-1).type === "wall"),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in 벽바둑Ⅱ either", !sentAll.includes("smoke-check-token"));

  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** 그라데이션, in a room of its own: two players, off the list. They distribute their cubes and play the first round. */
async function gradGame() {
  const players = await roomOf(GRAD_GAME, 2, "grader");
  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("그라데이션 to start", (m) => m.type === "game" || m.type === "refused")));
  const view = games[0].view;
  const [first, second] = view.duel;
  check(
    "그라데이션 for two starts with seven empty cups each and five minutes to distribute the cubes, nobody waiting",
    games.every((g, n) => g.type === "game" && g.game === GRAD_GAME && g.view.you === n && g.view.phase === "arrange" && g.view.mine.values === null && g.view.mine.used.length === 7) &&
      view.rounds === 7 &&
      view.waiting.length === 0 &&
      games[0].clock.turn > 290_000 &&
      games[0].rules.maxSum === 30,
    `first: player ${first}`,
  );

  players[first].send({ type: "action", action: { type: "arrange", values: [0, 0, 2, 6, 7, 7, 9] } });
  const over = await players[first].until("the refusal", (m) => m.type === "refused");
  check("cubes that add up to more than 30 are refused", over.reason === "over-sum", over.reason);
  players[first].send({ type: "action", action: { type: "arrange", values: [0, 1, 0, 6, 7, 7, 9] } });
  const unordered = await players[first].until("the second refusal", (m) => m.type === "refused" && m.reason !== "over-sum");
  check("a number lower than the one to its left is refused", unordered.reason === "not-ascending", unordered.reason);

  const cups = [0, 0, 1, 6, 7, 7, 9];
  players[first].send({ type: "action", action: { type: "arrange", values: cups } });
  const one = await Promise.all(players.map((p) => p.until("the first to be done", (m) => m.type === "game" && m.view.ready.length === 1)));
  check(
    "a player's cubes are sent to that player alone",
    one[first].view.mine.values.join() === cups.join() && one[second].view.mine.values === null && !JSON.stringify(one[second]).includes(JSON.stringify(cups)),
  );
  players[second].send({ type: "action", action: { type: "arrange", values: [0, 1, 2, 2, 8, 8, 9] } });
  const begun = await Promise.all(players.map((p) => p.until("the first round", (m) => m.type === "game" && m.view.phase === "submit")));
  check("with both done the first round begins with the first player", begun.every((g) => g.view.round === 1 && g.view.turn === first && g.view.first === first));

  players[second].send({ type: "action", action: { type: "submit", cup: 0 } });
  const early = await players[second].until("the refusal", (m) => m.type === "refused");
  check("a cup cannot be submitted out of turn", early.reason === "not-your-turn", early.reason);
  players[first].send({ type: "action", action: { type: "submit", cup: 5 } });
  const shown = await Promise.all(players.map((p) => p.until("the first cup", (m) => m.type === "game" && m.view.table.length === 1)));
  check(
    "of the first player's cup the opponent is sent the shade and nothing more",
    shown.every((g) => g.view.table[0].player === first && g.view.table[0].shade === 1 && Object.keys(g.view.table[0]).length === 2 && g.view.lines.length === 0 && g.view.turn === second),
  );
  players[second].send({ type: "action", action: { type: "submit", cup: 6 } });
  const revealed = await Promise.all(players.map((p) => p.until("the numbers", (m) => m.type === "game" && m.view.phase === "reveal")));
  check(
    "both numbers are shown once both cups are in, and the higher scores a point",
    revealed.every((g) => g.view.lines.length === 1 && g.view.lines[0].winner === second && g.view.lines[0].plays.map((play) => play.value).join() === "7,9" && g.view.score.find((each) => each.player === second).points === 1),
  );
  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** 수식 신호등, in a room of its own: two players, off the list. They create their equations and play two turns, the second of which one of them wins. */
async function eqGame() {
  const players = await roomOf(EQ_GAME, 2, "equator");
  players[0].send({ type: "start", bots: false });
  const games = await Promise.all(players.map((p) => p.until("수식 신호등 to start", (m) => m.type === "game" || m.type === "refused")));
  check(
    "수식 신호등 starts with five minutes to create a nine-cell equation, nobody's in",
    games.every((g, n) => g.type === "game" && g.game === EQ_GAME && g.view.you === n && g.view.phase === "create" && g.view.mine.equation === null && g.view.ready.length === 0) &&
      games[0].clock.turn > 290_000 &&
      games[0].rules.cells === 9,
  );

  const [mine, theirs] = ["91×9^0=91", "2^5+15=47"];
  players[0].send({ type: "action", action: { type: "create", equation: "2^5+15=48" } });
  const untrue = await players[0].until("the refusal", (m) => m.type === "refused");
  check("an equation that is not true is refused", untrue.reason === "not-true", untrue.reason);
  players[0].send({ type: "action", action: { type: "create", equation: "12+-3=009" } });
  const together = await players[0].until("the second refusal", (m) => m.type === "refused" && m.reason !== "not-true");
  check("two symbols next to each other are refused", together.reason === "symbols-together", together.reason);

  players[0].send({ type: "action", action: { type: "create", equation: mine } });
  const one = await Promise.all(players.map((p) => p.until("the first equation", (m) => m.type === "game" && m.view.ready.length === 1)));
  check("an equation is sent to its creator alone", one[0].view.mine.equation === mine && one[1].view.mine.equation === null && !JSON.stringify(one[1]).includes(mine));
  players[1].send({ type: "action", action: { type: "create", equation: theirs } });
  const begun = await Promise.all(players.map((p) => p.until("the first turn", (m) => m.type === "game" && m.view.phase === "guess")));
  check("with both equations in, the first turn begins with five minutes for an answer", begun.every((g) => g.view.turn === 1 && g.clock.turn > 290_000 && g.view.rows.length === 0));

  players[0].send({ type: "action", action: { type: "answer", cells: "0×+-÷12^3" } });
  const waiting = await Promise.all(players.map((p) => p.until("the first answer", (m) => m.type === "game" && m.view.phase === "guess" && m.view.ready.length === 1)));
  check("an answer is kept from the opponent until both are in", waiting[1].view.rows.length === 0 && !JSON.stringify(waiting[1]).includes("0×+-÷12^3") && waiting[0].view.mine.answer === "0×+-÷12^3");
  players[1].send({ type: "action", action: { type: "answer", cells: "34=5×6+78" } });
  const shown = await Promise.all(players.map((p) => p.until("the clues", (m) => m.type === "game" && m.view.rows.length === 1)));
  check(
    "both answers are shown with their colour clues, an answer need not be an equation, and the second turn begins",
    shown.every((g) => g.view.turn === 2 && g.view.rows[0].answers.map((each) => `${each.cells} ${each.clues}`).join() === "0×+-÷12^3 rryrryyyr,34=5×6+78 rryryrrrr") && !JSON.stringify(shown[0]).includes(theirs),
  );

  players[0].send({ type: "action", action: { type: "answer", cells: theirs } });
  players[1].send({ type: "action", action: { type: "answer", cells: "91×9^1=91" } });
  const ended = await Promise.all(players.map((p) => p.until("the end", (m) => m.type === "game" && m.view.phase === "ended")));
  check(
    "whoever answers with the opponent's equation wins, and both equations are then shown",
    ended.every((g) => g.view.winner === 0 && g.view.ended === "played" && g.view.secrets.map((each) => each.equation).join() === `${mine},${theirs}` && g.view.places[0].player === 0),
  );
  const sentAll = players.flatMap((p) => p.messages).map((m) => JSON.stringify(m)).join("\n");
  check("no token is sent in 수식 신호등 either", !sentAll.includes("smoke-check-token"));
  for (const p of players) p.send({ type: "leave" });
  for (const p of players) p.close();
}

/** The parts of the check, each by the game it plays, in the order they run. */
const PARTS = [
  [GAME, firstGame],
  [SECOND_GAME, secondGame],
  [THIRD_GAME, thirdGame],
  [THIRD_GAME, thirdGameDrawn],
  [FOURTH_GAME, fourthGame],
  [FIFTH_GAME, fifthGame],
  [SIXTH_GAME, sixthGame],
  [SIXTH_GAME, sixthGameSpots],
  [SEVENTH_GAME, seventhGame],
  [EIGHTH_GAME, eighthGame],
  [NINTH_GAME, ninthGame],
  [BINGO_GAME, bingoGame],
  [WALL_GAME, wallGame],
  [GRAD_GAME, gradGame],
  [EQ_GAME, eqGame],
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

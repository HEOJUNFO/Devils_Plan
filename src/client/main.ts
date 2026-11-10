/**
 * The browser client: the lobby (the rooms anyone can join, of every game),
 * making a room, the room before a game, and the game. Everything sits in one
 * frame the size of the game's screen, scaled up as one piece: the lobby and
 * the waiting room are markup, and the game is a canvas (`game/table`) that
 * covers the frame while a game is on.
 *
 * To act as several players in one browser, open each tab with a different
 * `?profile=<name>`; each profile keeps its own token and nickname.
 */
import { PartySocket } from "partysocket";
import type { RoomListing } from "../shared/directory";
import { DEFAULT_GAME, GAMES, GAME_IDS, isGameId, type GameId } from "../shared/games";
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeNick,
  type LobbyView,
  type RoomConfig,
} from "../shared/lobby";
import {
  DIRECTORY_NAME,
  DIRECTORY_PARTY,
  PARTY_NAME,
  parseDirectoryMessage,
  parseServerMessage,
  type ClientMessage,
  type RejectReason,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import { createTable, type Table } from "./game/table";
import { createLobbyScene } from "./lobby-scene";

const config: RoomConfig = roomConfig;

/** The frame's size in its own pixels: the game's screen. */
const FRAME_W = 480;
const FRAME_H = 270;

/**
 * `?bots=1` asks the room to fill empty seats with bots. Only a room run for
 * development grants it; the deployed one refuses.
 */
const wantBots = new URLSearchParams(location.search).get("bots") === "1";

/** How many fresh codes to try when a newly made code is already in use. */
const CREATE_ATTEMPTS = 3;

/** The way out of a game: what the button says, and what it says while it waits for the second press. */
const LEAVE_TEXT = "나가기";
const LEAVE_CONFIRM_TEXT = "한 번 더 누르면 나감";
const LEAVE_CONFIRM_MS = 3000;

/** The words under the lobby. A room puts its game's own there. */
const LOBBY_BAR = ["열린 방에 들어가거나, 방을 만들어 사람들을 모으세요.", "친구끼리만 하려면 비공개 방을 만들고 초대 링크를 보내세요."];

const REJECT_TEXT: Record<RejectReason, string> = {
  "full": "방이 가득 찼습니다.",
  "bad-nick": "닉네임을 입력해 주세요.",
  "bad-token": "브라우저 저장 정보가 손상됐습니다. 새로고침해 주세요.",
  "bad-room": "방 코드 형식이 올바르지 않습니다.",
  "not-found": "그런 방이 없습니다.",
  "code-taken": "방을 만들지 못했습니다. 다시 시도해 주세요.",
  "join-timeout": "연결이 너무 오래 걸렸습니다. 다시 시도해 주세요.",
};

/** Why something asked of the room was refused, for the waiting room. Refused moves are explained on the game screen. */
const REFUSED_TEXT: Record<string, string> = {
  "not-host": "방장만 할 수 있습니다.",
  "bad-player-count": "지금 인원으로는 시작할 수 없습니다.",
  "already-playing": "이미 판이 진행 중입니다.",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다.",
};

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const frame = el<HTMLElement>("frame");
const roomsPanel = el<HTMLElement>("rooms");
const roomList = el<HTMLOListElement>("room-list");
const roomsCount = el<HTMLElement>("rooms-count");
const roomsNote = el<HTMLElement>("rooms-note");
const entry = el<HTMLElement>("entry");
const newRoom = el<HTMLElement>("new-room");
const gameChoices = el<HTMLElement>("game-choices");
const gameSummary = el<HTMLElement>("game-summary");
const listedYes = el<HTMLButtonElement>("listed-yes");
const listedNo = el<HTMLButtonElement>("listed-no");
const listedHint = el<HTMLElement>("listed-hint");
const room = el<HTMLElement>("room");
const roomGame = el<HTMLElement>("room-game");
const bar1 = el<HTMLElement>("bar-1");
const bar2 = el<HTMLElement>("bar-2");
const rules = el<HTMLElement>("rules");
const rulesOpen = el<HTMLButtonElement>("rules-open");
const nickInput = el<HTMLInputElement>("nick");
const codeInput = el<HTMLInputElement>("code");
const notice = el<HTMLElement>("notice");
const roomCode = el<HTMLElement>("room-code");
const status = el<HTMLElement>("status");
const players = el<HTMLOListElement>("players");
const count = el<HTMLElement>("count");
const startButton = el<HTMLButtonElement>("start");
const startHint = el<HTMLElement>("start-hint");
const copyButton = el<HTMLButtonElement>("copy");
const listingButton = el<HTMLButtonElement>("listing");
const sceneCanvas = el<HTMLCanvasElement>("scene");
const tableCanvas = el<HTMLCanvasElement>("table");
const leaveGameButton = el<HTMLButtonElement>("leave-game");

/** What the page is called while no room is open. */
const SITE_TITLE = document.title;

const scene = createLobbyScene(sceneCanvas);

const profile = new URLSearchParams(location.search).get("profile") ?? "";
const storageKey = (name: string) => `empty-chamber.${name}${profile ? `.${profile}` : ""}`;

function loadToken(): string {
  const key = storageKey("token");
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, token);
  }
  return token;
}

/**
 * Fits the frame to the window, as large as it goes while one pixel of the
 * game stays a whole number of the screen's own pixels: every pixel square and
 * sharp, on a screen of any density. A window too small even for one to one
 * gets the frame shrunk to fit, soft but whole.
 */
function fitFrame(): void {
  const density = devicePixelRatio || 1;
  const fit = Math.min(innerWidth / FRAME_W, innerHeight / FRAME_H);
  const whole = Math.floor(fit * density) / density;
  const scale = whole > 0 ? whole : fit;
  // the corner sits on a whole screen pixel too, or everything blurs by half a pixel
  const snap = (value: number): number => Math.round(value * density) / density;
  frame.style.setProperty("--scale", String(scale));
  frame.style.setProperty("--left", `${snap((innerWidth - FRAME_W * scale) / 2)}px`);
  frame.style.setProperty("--top", `${snap((innerHeight - FRAME_H * scale) / 2)}px`);
}
addEventListener("resize", fitFrame);
fitFrame();

/** The connection to the room this page is in or is entering. */
let socket: PartySocket | null = null;
/** The connection to the list of rooms, while the lobby is on show. */
let listSocket: PartySocket | null = null;
/** The room this page is in, while it is in one. */
let currentCode = "";
/** The room as last sent, while this page is in one. */
let currentView: LobbyView | null = null;
/** The game screen, while a game is on in the room this page is in. */
let table: Table | null = null;
/** Whether this player may start a game: the connected player in the lowest slot. */
let isHost = false;
/** When the game on show started; a room's games are told apart by it. */
let shownGame: number | null = null;
/** The finished game whose results the player has put away, by when it started. */
let dismissedGame: number | null = null;
/** Set while the way out of a game waits for its second press. */
let leaveArmed: ReturnType<typeof setTimeout> | null = null;

/** What a new room will be: the last choices made in this browser. */
const storedGame = localStorage.getItem(storageKey("game"));
let chosenGame: GameId = isGameId(storedGame) ? storedGame : DEFAULT_GAME;
let chosenListed = localStorage.getItem(storageKey("listed")) !== "0";

/** Puts the way out of a game back to its first press. */
function disarmLeave(): void {
  if (leaveArmed !== null) clearTimeout(leaveArmed);
  leaveArmed = null;
  leaveGameButton.textContent = LEAVE_TEXT;
}

function send(message: ClientMessage): void {
  socket?.send(JSON.stringify(message));
}

/** The words under the scene, and whether the rules can be opened from there. */
function setBar(first: string, second: string, withRules: boolean): void {
  bar1.textContent = first;
  bar2.textContent = second;
  rulesOpen.hidden = !withRules;
}

/** The picture of the room runs only while it can be seen: in a room, with no game over it. */
function syncScene(): void {
  const seen = currentCode !== "" && table === null;
  sceneCanvas.hidden = currentCode === "";
  scene.setRunning(seen);
}

/** Shows the game screen over the frame, making it on first use. */
function showTable(): Table {
  if (table === null) {
    table = createTable(tableCanvas, {
      act: (action) => send({ type: "action", action }),
      again: () => send({ type: "start", bots: wantBots }),
      lobby: () => {
        // the results are put away; the waiting room is under them
        dismissedGame = shownGame;
        hideTable();
      },
    });
    table.setHost(isHost);
  }
  tableCanvas.hidden = false;
  leaveGameButton.hidden = false;
  rules.hidden = true;
  syncScene();
  return table;
}

/** Puts the game screen away and stops it. */
function hideTable(): void {
  table?.destroy();
  table = null;
  tableCanvas.hidden = true;
  leaveGameButton.hidden = true;
  disarmLeave();
  syncScene();
}

// ---- The lobby: the rooms anyone can join -------------------------------------------------------

/** What a row says about how the room stands. */
function standing(listing: RoomListing, game: GameId): string {
  if (listing.players >= listing.maxPlayers) return "가득 참";
  if (listing.playing) return "게임 중 · 들어가면 관전";
  const short = GAMES[game].minPlayers - listing.players;
  return short > 0 ? `대기 중 · ${short}명 더 오면 시작` : "대기 중 · 곧 시작";
}

/** Draws the list of rooms; `null` while it is not known (connecting, or the connection dropped). */
function renderRooms(listings: RoomListing[] | null): void {
  // a newer server may list a game this page has not heard of: it cannot be played here
  const known = (listings ?? []).filter((listing) => isGameId(listing.game));
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.code : undefined;
  const rows = known.map((listing) => {
    const game = listing.game;
    const full = listing.players >= listing.maxPlayers;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "room-row";
    button.dataset.code = listing.code;
    button.disabled = full;
    const part = (name: string, text: string): HTMLSpanElement => {
      const span = document.createElement("span");
      span.className = name;
      span.textContent = text;
      return span;
    };
    button.append(
      part("room-host", `${listing.host}의 방`),
      part("room-count", `${listing.players}/${listing.maxPlayers}`),
      part("room-game", GAMES[game].title),
      part(listing.playing || full ? "room-state busy" : "room-state", standing(listing, game)),
    );
    button.addEventListener("click", () => joinRoom(listing.code));
    const item = document.createElement("li");
    item.append(button);
    return item;
  });
  roomList.replaceChildren(...rows);
  // the list is redrawn whole: the row the keyboard was on stays the one it is on
  if (focused !== undefined) roomList.querySelector<HTMLElement>(`[data-code="${focused}"]`)?.focus();
  roomsCount.textContent = listings === null ? "" : `${known.length}개`;
  roomsNote.textContent =
    listings === null
      ? "방 목록을 불러오는 중입니다."
      : known.length === 0
        ? "열린 방이 없습니다. 공개 방을 만들면 여기에 올라와 누구나 들어올 수 있습니다."
        : "";
}

/** Starts listening to the list of rooms, if not already. */
function watchRooms(): void {
  if (listSocket !== null) return;
  renderRooms(null);
  const current = new PartySocket({ host: location.host, party: DIRECTORY_PARTY, room: DIRECTORY_NAME });
  listSocket = current;
  current.addEventListener("message", (event) => {
    const message = parseDirectoryMessage(event.data);
    if (message !== null && listSocket === current) renderRooms(message.rooms);
  });
  current.addEventListener("close", () => {
    // PartySocket reconnects by itself; until then the list on show may be out of date
    if (listSocket === current) renderRooms(null);
  });
}

function unwatchRooms(): void {
  listSocket?.close();
  listSocket = null;
}

/** The lobby: the rooms anyone can join, a nickname, and a room to make or enter by code. */
function showLobby(message = ""): void {
  hideTable();
  currentCode = "";
  currentView = null;
  room.hidden = true;
  newRoom.hidden = true;
  entry.hidden = false;
  roomsPanel.hidden = false;
  rules.hidden = true;
  notice.textContent = message;
  scene.show(null);
  syncScene();
  setBar(LOBBY_BAR[0], LOBBY_BAR[1], false);
  document.title = SITE_TITLE;
  watchRooms();
}

// ---- Making a room ------------------------------------------------------------------------------------

/** Draws the choices for a new room as they now stand. */
function renderNewRoom(): void {
  const choices = GAME_IDS.map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice wide";
    button.textContent = GAMES[id].title;
    button.setAttribute("aria-pressed", String(id === chosenGame));
    button.addEventListener("click", () => {
      chosenGame = id;
      renderNewRoom();
    });
    return button;
  });
  gameChoices.replaceChildren(...choices);
  const game = GAMES[chosenGame];
  gameSummary.textContent = `${game.minPlayers}~${game.maxPlayers}명. ${game.summary}`;
  listedYes.setAttribute("aria-pressed", String(chosenListed));
  listedNo.setAttribute("aria-pressed", String(!chosenListed));
  listedHint.textContent = chosenListed ? "로비의 방 목록에 보여 누구나 들어옵니다." : "초대 링크나 방 코드를 아는 사람만 들어옵니다.";
  setBar(game.summary, `${game.minPlayers}명부터 ${game.maxPlayers}명까지 함께 합니다.`, true);
}

/** The form for a new room: which game, and who may come in. */
function showNewRoom(): void {
  if (readNick() === null) return;
  notice.textContent = "";
  entry.hidden = true;
  newRoom.hidden = false;
  renderNewRoom();
  el<HTMLButtonElement>("create-go").focus();
}

function closeNewRoom(): void {
  newRoom.hidden = true;
  entry.hidden = false;
  rules.hidden = true;
  setBar(LOBBY_BAR[0], LOBBY_BAR[1], false);
}

// ---- A room, before a game ---------------------------------------------------------------------------

/** The room before a game: who is here, the code to share, and the start. */
function renderRoom(code: string, view: LobbyView): void {
  currentCode = code;
  currentView = view;
  unwatchRooms();
  roomsPanel.hidden = true;
  entry.hidden = true;
  newRoom.hidden = true;
  room.hidden = false;
  roomCode.textContent = code;
  scene.show(view);
  syncScene();

  // The picture shows who is here; this list says the same in words for a screen reader.
  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const rows: HTMLLIElement[] = [];
  for (let slot = 0; slot < view.maxPlayers; slot++) {
    const player = bySlot.get(slot);
    const row = document.createElement("li");
    row.textContent = player
      ? `${slot + 1}번 ${player.nick}${slot === view.you ? " (나)" : ""}: ${player.connected ? "접속" : "끊김"}`
      : `${slot + 1}번 빈 자리`;
    rows.push(row);
  }
  players.replaceChildren(...rows);

  const connected = view.players.filter((p) => p.connected);
  isHost = connected.length > 0 && Math.min(...connected.map((p) => p.slot)) === view.you;
  table?.setHost(isHost);
  count.textContent = `${connected.length}명 접속 · 최대 ${view.maxPlayers}명`;

  // A room made by a newer server may be for a game this page has not heard of.
  const game = isGameId(view.game) ? GAMES[view.game] : null;
  roomGame.textContent = `${game?.title ?? "새 게임"} · ${view.listed ? "공개 방" : "비공개 방"}`;
  document.title = `${game?.title ?? SITE_TITLE} · ${code}`;
  listingButton.hidden = !isHost;
  listingButton.textContent = view.listed ? "비공개로" : "공개로";
  if (game === null) {
    startButton.disabled = true;
    startHint.textContent = "새로고침하면 이 게임을 할 수 있습니다.";
    setBar("", "", false);
    return;
  }
  const enough = wantBots || (connected.length >= game.minPlayers && connected.length <= game.maxPlayers);
  startButton.disabled = !isHost || !enough;
  startHint.textContent = !enough
    ? `${game.minPlayers}명부터 시작할 수 있습니다.`
    : isHost
      ? `${wantBots ? "빈 자리는 봇이 채웁니다 (개발용). " : ""}준비되면 시작하세요.`
      : "방장이 시작하기를 기다리는 중입니다.";
  setBar(game.summary, `${game.minPlayers}명부터 ${game.maxPlayers}명까지 함께 합니다.`, true);
}

function disconnect(): void {
  socket?.close();
  socket = null;
}

/**
 * Opens a connection to `code`. `attemptsLeft` is how many more fresh codes
 * may be tried if this is a create and the code turns out to be in use.
 */
function connect(code: string, create: boolean, nick: string, attemptsLeft = 0): void {
  disconnect();
  // The token goes in the first message, never in the address, so it stays
  // out of server logs and browser history.
  let join: Extract<ClientMessage, { type: "join" }> = {
    type: "join",
    token: loadToken(),
    nick,
    create,
    game: chosenGame,
    listed: chosenListed,
  };

  const current = new PartySocket({ host: location.host, party: PARTY_NAME, room: code });
  socket = current;

  current.addEventListener("open", () => {
    // Fires again on every reconnect; the server expects `join` each time.
    current.send(JSON.stringify(join));
    status.textContent = "연결됨";
  });
  current.addEventListener("close", () => {
    // PartySocket reconnects by itself unless we closed it.
    if (socket === current) status.textContent = "연결이 끊겼습니다. 다시 연결하는 중";
  });
  current.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (message === null || socket !== current) return;
    if (message.type === "lobby") {
      // The room is made: from here on a reconnect only comes back to it. A
      // second "make" would be refused as a stranger's once the room has let
      // this player's slot go.
      join = { ...join, create: false };
      history.replaceState(null, "", `${location.pathname}${location.search}#${code}`);
      renderRoom(code, message);
      return;
    }
    if (message.type === "game") {
      // A game that is over is shown to its end only to those who watched it
      // end: someone arriving after it, or who has put its results away, is
      // in the waiting room.
      const over = message.view.phase === "ended";
      if (over && (table === null || dismissedGame === message.startedAt)) return;
      shownGame = message.startedAt;
      showTable().update(message);
      return;
    }
    if (message.type === "refused") {
      // Something asked of the room was not accepted; the connection is fine.
      if (table !== null) table.refused(message.reason);
      else startHint.textContent = REFUSED_TEXT[message.reason] ?? "지금은 할 수 없습니다.";
      return;
    }
    disconnect();
    if (message.reason === "code-taken" && create && attemptsLeft > 0) {
      connect(generateRoomCode(Math.random, config), true, nick, attemptsLeft - 1);
      return;
    }
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    showLobby(REJECT_TEXT[message.reason]);
  });
}

function readNick(): string | null {
  const nick = normalizeNick(nickInput.value, config);
  if (nick === null) {
    notice.textContent = REJECT_TEXT["bad-nick"];
    nickInput.focus();
    return null;
  }
  localStorage.setItem(storageKey("nick"), nick);
  return nick;
}

function createRoom(): void {
  const nick = readNick();
  if (nick === null) return;
  localStorage.setItem(storageKey("game"), chosenGame);
  localStorage.setItem(storageKey("listed"), chosenListed ? "1" : "0");
  connect(generateRoomCode(Math.random, config), true, nick, CREATE_ATTEMPTS - 1);
}

/** Enters the room `code`, from the list or from an address. */
function joinRoom(code: string): void {
  const nick = readNick();
  if (nick === null) return;
  notice.textContent = "";
  connect(code, false, nick);
}

function joinFromInput(): void {
  const code = codeInput.value.trim().toUpperCase();
  if (readNick() === null) return;
  if (!isValidRoomCode(code, config)) {
    notice.textContent = REJECT_TEXT["bad-room"];
    codeInput.focus();
    return;
  }
  joinRoom(code);
}

function leaveRoom(): void {
  send({ type: "leave" });
  disconnect();
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  codeInput.value = "";
  showLobby();
}

el<HTMLButtonElement>("create").addEventListener("click", showNewRoom);
el<HTMLButtonElement>("create-go").addEventListener("click", createRoom);
el<HTMLButtonElement>("create-cancel").addEventListener("click", closeNewRoom);
listedYes.addEventListener("click", () => {
  chosenListed = true;
  renderNewRoom();
});
listedNo.addEventListener("click", () => {
  chosenListed = false;
  renderNewRoom();
});
el<HTMLButtonElement>("join").addEventListener("click", joinFromInput);
nickInput.addEventListener("keydown", (event) => {
  // Enter in the nickname box does what the box below it is ready for.
  if (event.key !== "Enter" || event.isComposing) return;
  if (codeInput.value.trim() !== "") joinFromInput();
  else showNewRoom();
});
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) joinFromInput();
});
el<HTMLButtonElement>("leave").addEventListener("click", leaveRoom);
startButton.addEventListener("click", () => send({ type: "start", bots: wantBots }));
listingButton.addEventListener("click", () => {
  if (currentView !== null) send({ type: "listing", listed: !currentView.listed });
});

// Leaving a game hands the seat to the room, so it takes a second press: the
// button sits where a stray click lands.
leaveGameButton.addEventListener("click", () => {
  if (leaveArmed !== null) {
    disarmLeave();
    leaveRoom();
    return;
  }
  leaveGameButton.textContent = LEAVE_CONFIRM_TEXT;
  leaveArmed = setTimeout(disarmLeave, LEAVE_CONFIRM_MS);
});

copyButton.addEventListener("click", () => {
  const link = `${location.origin}${location.pathname}#${currentCode}`;
  const done = (text: string): void => {
    copyButton.textContent = text;
    setTimeout(() => {
      copyButton.textContent = "초대 링크 복사";
    }, 1500);
  };
  navigator.clipboard.writeText(link).then(
    () => done("복사했습니다"),
    () => done(`코드 ${currentCode}를 알려 주세요`),
  );
});

// The rules sheet of the game chosen or being waited for. During a game the table has its own (H).
rulesOpen.addEventListener("click", () => {
  rules.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rules.hidden = true;
});
addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!rules.hidden) rules.hidden = true;
  else if (!newRoom.hidden) closeNewRoom();
});

/**
 * Goes to the room the address names after `#`, if it names one this page is
 * not in: with the saved nickname straight in, without one to the lobby with
 * the code filled in. An address that names no room is put back to say where
 * this page is.
 */
function followAddress(): void {
  const linked = location.hash.slice(1).toUpperCase();
  if (linked === currentCode) return;
  if (!isValidRoomCode(linked, config)) {
    history.replaceState(null, "", `${location.pathname}${location.search}${currentCode ? `#${currentCode}` : ""}`);
    return;
  }
  if (socket !== null) {
    // an invitation opened from inside another room: that room is left
    send({ type: "leave" });
    disconnect();
    showLobby();
  }
  codeInput.value = linked;
  const nick = normalizeNick(nickInput.value, config);
  if (nick !== null) connect(linked, false, nick);
  else nickInput.focus();
}
// An invitation opened in a tab that already shows this page changes only the
// part after `#`, which loads nothing.
addEventListener("hashchange", followAddress);

// Restore the last nickname, and rejoin the room named in the address if any.
nickInput.maxLength = config.nickMaxLength;
codeInput.maxLength = config.roomCodeLength;
nickInput.value = localStorage.getItem(storageKey("nick")) ?? "";
showLobby();
followAddress();
if (socket === null) nickInput.focus();

/**
 * The browser client: make a room, join one by code, see who is connected,
 * and play. The lobby is this page's own markup; the game is drawn on a
 * canvas by `game/table`, which takes over the window while a game is on.
 *
 * To act as several players in one browser, open each tab with a different
 * `?profile=<name>`; each profile keeps its own token and nickname.
 */
import { PartySocket } from "partysocket";
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeNick,
  type LobbyView,
  type RoomConfig,
} from "../shared/lobby";
import {
  PARTY_NAME,
  parseServerMessage,
  type ClientMessage,
  type RejectReason,
} from "../shared/protocol";
import roomConfig from "../shared/room-config.json";
import tableSizes from "../shared/game/table-sizes.json";
import { createTable, type Table } from "./game/table";

const config: RoomConfig = roomConfig;

/** The fewest and the most players a game can be started with. */
const MIN_PLAYERS = Math.min(...Object.keys(tableSizes).map(Number));
const MAX_PLAYERS = Math.max(...Object.keys(tableSizes).map(Number));

/**
 * `?bots=1` asks the room to fill empty seats with bots. Only a room run for
 * development grants it; the deployed one refuses.
 */
const wantBots = new URLSearchParams(location.search).get("bots") === "1";

/** How many fresh codes to try when a newly made code is already in use. */
const CREATE_ATTEMPTS = 3;

const REJECT_TEXT: Record<RejectReason, string> = {
  "full": "방이 가득 찼습니다.",
  "bad-nick": "닉네임을 입력해 주세요.",
  "bad-token": "브라우저 저장 정보가 손상됐습니다. 새로고침해 주세요.",
  "bad-room": "방 코드 형식이 올바르지 않습니다.",
  "not-found": "그런 방이 없습니다.",
  "code-taken": "방을 만들지 못했습니다. 다시 시도해 주세요.",
  "join-timeout": "연결이 너무 오래 걸렸습니다. 다시 시도해 주세요.",
};

/** Why a start was refused, for the lobby. Refused moves are explained on the game screen. */
const REFUSED_TEXT: Record<string, string> = {
  "not-host": "방장만 시작할 수 있습니다.",
  "bad-player-count": `${MIN_PLAYERS}~${MAX_PLAYERS}명일 때 시작할 수 있습니다.`,
  "already-playing": "이미 판이 진행 중입니다.",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다.",
};

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const entry = el<HTMLElement>("entry");
const room = el<HTMLElement>("room");
const nickInput = el<HTMLInputElement>("nick");
const codeInput = el<HTMLInputElement>("code");
const notice = el<HTMLElement>("notice");
const roomCode = el<HTMLElement>("room-code");
const status = el<HTMLElement>("status");
const players = el<HTMLOListElement>("players");
const startButton = el<HTMLButtonElement>("start");
const startHint = el<HTMLElement>("start-hint");
const tableCanvas = el<HTMLCanvasElement>("table");
const leaveGameButton = el<HTMLButtonElement>("leave-game");

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

let socket: PartySocket | null = null;
/** The game screen, while a game is on in the room this page is in. */
let table: Table | null = null;
/** Whether this player may start a game: the connected player in the lowest slot. */
let isHost = false;

function send(message: ClientMessage): void {
  socket?.send(JSON.stringify(message));
}

/** Shows the game screen, making it on first use. */
function showTable(): Table {
  if (table === null) {
    table = createTable(tableCanvas, {
      act: (action) => send({ type: "action", action }),
      again: () => send({ type: "start", bots: wantBots }),
    });
    table.setHost(isHost);
  }
  document.body.classList.add("playing");
  tableCanvas.hidden = false;
  leaveGameButton.hidden = false;
  return table;
}

/** Puts the game screen away and stops it. */
function hideTable(): void {
  table?.destroy();
  table = null;
  document.body.classList.remove("playing");
  tableCanvas.hidden = true;
  leaveGameButton.hidden = true;
}

function showEntry(message = ""): void {
  hideTable();
  room.hidden = true;
  entry.hidden = false;
  notice.textContent = message;
}

function renderLobby(code: string, view: LobbyView): void {
  entry.hidden = true;
  room.hidden = false;
  roomCode.textContent = code;

  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const rows: HTMLLIElement[] = [];
  for (let slot = 0; slot < view.maxPlayers; slot++) {
    const player = bySlot.get(slot);
    const row = document.createElement("li");
    const number = document.createElement("span");
    const name = document.createElement("span");
    const state = document.createElement("span");
    number.textContent = String(slot + 1);
    if (player) {
      name.textContent = slot === view.you ? `${player.nick} (나)` : player.nick;
      state.textContent = player.connected ? "접속" : "끊김";
      state.className = `state ${player.connected ? "on" : "off"}`;
      if (slot === view.you) row.className = "me";
    } else {
      name.textContent = "빈 자리";
      row.className = "empty";
    }
    row.append(number, name, state);
    rows.push(row);
  }
  players.replaceChildren(...rows);

  const connected = view.players.filter((p) => p.connected);
  isHost = connected.length > 0 && Math.min(...connected.map((p) => p.slot)) === view.you;
  table?.setHost(isHost);
  const enough = wantBots || (connected.length >= MIN_PLAYERS && connected.length <= MAX_PLAYERS);
  startButton.disabled = !isHost || !enough;
  startHint.textContent = !enough
    ? `${MIN_PLAYERS}명부터 시작할 수 있습니다 (지금 ${connected.length}명)`
    : isHost
      ? `${wantBots ? "빈 자리는 봇이 채웁니다 (개발용). " : ""}준비되면 시작하세요.`
      : "방장이 시작하기를 기다리는 중입니다.";
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
  const join: ClientMessage = { type: "join", token: loadToken(), nick, create };

  const current = new PartySocket({ host: location.host, party: PARTY_NAME, room: code });
  socket = current;

  current.addEventListener("open", () => {
    // Fires again on every reconnect; the server expects `join` each time.
    current.send(JSON.stringify(join));
    status.textContent = "연결됨";
  });
  current.addEventListener("close", () => {
    // PartySocket reconnects by itself unless we closed it.
    if (socket === current) status.textContent = "연결이 끊겼습니다. 다시 연결하는 중…";
  });
  current.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (message === null || socket !== current) return;
    if (message.type === "lobby") {
      history.replaceState(null, "", `${location.pathname}${location.search}#${code}`);
      renderLobby(code, message);
      return;
    }
    if (message.type === "game") {
      showTable().update(message);
      return;
    }
    if (message.type === "refused") {
      // A move or a start was not accepted; the connection is fine.
      if (table !== null) table.refused(message.reason);
      else startHint.textContent = REFUSED_TEXT[message.reason] ?? "지금은 시작할 수 없습니다.";
      return;
    }
    disconnect();
    if (message.reason === "code-taken" && create && attemptsLeft > 0) {
      connect(generateRoomCode(Math.random, config), true, nick, attemptsLeft - 1);
      return;
    }
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    showEntry(REJECT_TEXT[message.reason]);
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

el<HTMLButtonElement>("create").addEventListener("click", () => {
  const nick = readNick();
  if (nick === null) return;
  notice.textContent = "";
  connect(generateRoomCode(Math.random, config), true, nick, CREATE_ATTEMPTS - 1);
});

function joinFromInput(): void {
  const nick = readNick();
  if (nick === null) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!isValidRoomCode(code, config)) {
    notice.textContent = REJECT_TEXT["bad-room"];
    codeInput.focus();
    return;
  }
  notice.textContent = "";
  connect(code, false, nick);
}

el<HTMLButtonElement>("join").addEventListener("click", joinFromInput);
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinFromInput();
});

function leaveRoom(): void {
  send({ type: "leave" });
  disconnect();
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showEntry();
}

el<HTMLButtonElement>("leave").addEventListener("click", leaveRoom);
leaveGameButton.addEventListener("click", leaveRoom);
startButton.addEventListener("click", () => send({ type: "start", bots: wantBots }));

// Restore the last nickname, and rejoin the room named in the address if any.
nickInput.maxLength = config.nickMaxLength;
codeInput.maxLength = config.roomCodeLength;
nickInput.value = localStorage.getItem(storageKey("nick")) ?? "";
const linked = location.hash.slice(1).toUpperCase();
if (isValidRoomCode(linked, config)) {
  codeInput.value = linked;
  const savedNick = normalizeNick(nickInput.value, config);
  if (savedNick !== null) connect(linked, false, savedNick);
}

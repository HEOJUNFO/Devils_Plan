/**
 * Lobby page: make a room, join one by code, and watch who is connected.
 *
 * This is the functional client for checking the room server. The game's own
 * screen replaces it later.
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

const config: RoomConfig = roomConfig;

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

function showEntry(message = ""): void {
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

el<HTMLButtonElement>("leave").addEventListener("click", () => {
  const leave: ClientMessage = { type: "leave" };
  socket?.send(JSON.stringify(leave));
  disconnect();
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showEntry();
});

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

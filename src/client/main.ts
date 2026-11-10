/**
 * The browser client: make a room, join one by code, see who is there, and
 * play. Everything sits in one frame the size of the game's screen, scaled up
 * as one piece: the lobby is markup beside a drawn scene, and the game is a
 * canvas (`game/table`) that covers the frame while a game is on.
 *
 * To act as several players in one browser, open each tab with a different
 * `?profile=<name>`; each profile keeps its own token and nickname.
 */
import { PartySocket } from "partysocket";
import tableSizes from "../shared/game/table-sizes.json";
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
import { createTable, type Table } from "./game/table";
import { createLobbyScene } from "./lobby-scene";

const config: RoomConfig = roomConfig;

/** The frame's size in its own pixels: the game's screen. */
const FRAME_W = 480;
const FRAME_H = 270;

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

/** The way out of a game: what the button says, and what it says while it waits for the second press. */
const LEAVE_TEXT = "나가기";
const LEAVE_CONFIRM_TEXT = "한 번 더 누르면 나감";
const LEAVE_CONFIRM_MS = 3000;

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

const frame = el<HTMLElement>("frame");
const entry = el<HTMLElement>("entry");
const room = el<HTMLElement>("room");
const bar = el<HTMLElement>("bar");
const rules = el<HTMLElement>("rules");
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
const tableCanvas = el<HTMLCanvasElement>("table");
const leaveGameButton = el<HTMLButtonElement>("leave-game");

const scene = createLobbyScene(el<HTMLCanvasElement>("scene"));

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

let socket: PartySocket | null = null;
/** The room this page is in, while it is in one. */
let currentCode = "";
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

/** Puts the way out of a game back to its first press. */
function disarmLeave(): void {
  if (leaveArmed !== null) clearTimeout(leaveArmed);
  leaveArmed = null;
  leaveGameButton.textContent = LEAVE_TEXT;
}

function send(message: ClientMessage): void {
  socket?.send(JSON.stringify(message));
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
  scene.setRunning(false);
  return table;
}

/** Puts the game screen away and stops it. */
function hideTable(): void {
  table?.destroy();
  table = null;
  tableCanvas.hidden = true;
  leaveGameButton.hidden = true;
  disarmLeave();
  scene.setRunning(true);
}

/** The screen before a room: a nickname, and a room to make or join. */
function showEntry(message = ""): void {
  hideTable();
  currentCode = "";
  room.hidden = true;
  entry.hidden = false;
  notice.textContent = message;
  scene.show(null);
}

/** The room before a game: who is here, the code to share, and the start. */
function renderLobby(code: string, view: LobbyView): void {
  currentCode = code;
  entry.hidden = true;
  room.hidden = false;
  roomCode.textContent = code;
  scene.show(view);

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
  const enough = wantBots || (connected.length >= MIN_PLAYERS && connected.length <= MAX_PLAYERS);
  startButton.disabled = !isHost || !enough;
  startHint.textContent = !enough
    ? `${MIN_PLAYERS}명부터 시작할 수 있습니다.`
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
    if (socket === current) status.textContent = "연결이 끊겼습니다. 다시 연결하는 중";
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

function createRoom(): void {
  const nick = readNick();
  if (nick === null) return;
  notice.textContent = "";
  connect(generateRoomCode(Math.random, config), true, nick, CREATE_ATTEMPTS - 1);
}

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

function leaveRoom(): void {
  send({ type: "leave" });
  disconnect();
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showEntry();
}

el<HTMLButtonElement>("create").addEventListener("click", createRoom);
el<HTMLButtonElement>("join").addEventListener("click", joinFromInput);
nickInput.addEventListener("keydown", (event) => {
  // Enter in the nickname box does what the box below it is ready for.
  if (event.key !== "Enter" || event.isComposing) return;
  if (codeInput.value.trim() !== "") joinFromInput();
  else createRoom();
});
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) joinFromInput();
});
el<HTMLButtonElement>("leave").addEventListener("click", leaveRoom);

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
startButton.addEventListener("click", () => send({ type: "start", bots: wantBots }));

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

// The rules sheet, from the lobby. During a game the table has its own (H).
el<HTMLButtonElement>("rules-open").addEventListener("click", () => {
  rules.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rules.hidden = true;
});
addEventListener("keydown", (event) => {
  if (event.key === "Escape") rules.hidden = true;
});

/**
 * Goes to the room the address names after `#`, if it names one this page is
 * not in: with the saved nickname straight in, without one to the entry
 * screen with the code filled in. An address that names no room is put back
 * to say where this page is.
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
    showEntry();
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
bar.hidden = false;
showEntry();
followAddress();
if (socket === null) nickInput.focus();

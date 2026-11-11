/**
 * The browser client: the lobby (the rooms anyone can join, of every game),
 * making a room, the room before a game, and the game. Everything sits in one
 * frame the size of the game's screen, scaled up as one piece: the lobby and
 * the waiting room are markup, and the game is a canvas that covers the frame
 * while a game is on. Which game's screen that is comes from `games/index`.
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
  teamsIn,
  type LobbyView,
  type RoomConfig,
} from "../shared/lobby";
import {
  CLOSE_LEFT,
  CLOSE_REJECTED,
  DIRECTORY_NAME,
  DIRECTORY_PARTY,
  PARTY_NAME,
  PING,
  parseDirectoryMessage,
  parseServerMessage,
  type ClientMessage,
  type RejectReason,
} from "../shared/protocol";
import chatConfig from "../shared/chat-config.json";
import roomConfig from "../shared/room-config.json";
import voiceConfig from "../shared/voice-config.json";
import { createChat } from "./chat";
import { CLIENTS, type GameScreen, type WaitingScene } from "./games";
import { drawLobbyArt } from "./lobby-art";
import { createVoice } from "./voice";

const config: RoomConfig = roomConfig;

/** The frame's size in its own pixels: the game's screen. */
const FRAME_W = 480;
const FRAME_H = 270;

/**
 * `?bots=1` asks the room to fill empty seats with bots. Only a room run for
 * development grants it; the deployed one refuses.
 */
const wantBots = new URLSearchParams(location.search).get("bots") === "1";

/**
 * `?fakemic=1`, on a development host only, puts a tone in place of the
 * microphone, so two tabs of one browser can be seen to connect in voice
 * without the browser asking for a microphone.
 */
const fakeMic =
  new URLSearchParams(location.search).get("fakemic") === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

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
  "bad-teams": "팀 인원이 맞지 않아 시작할 수 없습니다.",
  "too-few": "두 팀(혼자도 한 팀) 이상이 모여야 시작할 수 있습니다.",
  "already-playing": "이미 판이 진행 중입니다.",
  "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다.",
  "bad-setting": "그 설정은 이 방에서 쓸 수 없습니다.",
  "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요.",
};

/** How the length of a turn is said: on the button in the waiting room and when making a room. */
function clockText(seconds: number): string {
  return seconds > 0 ? `차례 ${seconds}초` : "차례 무제한";
}

/** Said in the chat to a player whose lines come too fast for the room to pass on. */
const CHAT_TOO_FAST_TEXT = "너무 빨리 보내고 있습니다. 잠시 뒤에 다시 보내세요.";

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
const startButton = el<HTMLButtonElement>("start");
const copyButton = el<HTMLButtonElement>("copy");
const clockButton = el<HTMLButtonElement>("clock");
const teamButton = el<HTMLButtonElement>("team");
const chatBox = el<HTMLElement>("chat");
const chatInput = el<HTMLInputElement>("chat-input");
const voiceBox = el<HTMLElement>("voice");
const voiceMic = el<HTMLButtonElement>("voice-mic");
const voiceToggle = el<HTMLButtonElement>("voice-toggle");
const voiceNote = el<HTMLElement>("voice-note");
const tabs = el<HTMLElement>("tabs");
const tabLog = el<HTMLButtonElement>("tab-log");
const tabChat = el<HTMLButtonElement>("tab-chat");
const listingButton = el<HTMLButtonElement>("listing");
const sceneCanvas = el<HTMLCanvasElement>("scene");
const tableCanvas = el<HTMLCanvasElement>("table");
const leaveGameButton = el<HTMLButtonElement>("leave-game");

/** What the page is called while no room is open. */
const SITE_TITLE = document.title;

drawLobbyArt(el<HTMLCanvasElement>("lobby-art"));

const profile = new URLSearchParams(location.search).get("profile") ?? "";
const storageKey = (name: string) => `game-plan.${name}${profile ? `.${profile}` : ""}`;

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
let table: GameScreen | null = null;
/** Which game that screen is of. */
let tableGame: GameId | null = null;
/** The picture of the room this page is in, and which game it is the picture for. */
let scene: WaitingScene | null = null;
let sceneGame: GameId | null = null;
/** Whether this player may start a game: the connected player in the lowest slot. */
let isHost = false;
/** When the game on show started; a room's games are told apart by it. */
let shownGame: number | null = null;
/** The finished game whose results the player has put away, by when it started. */
let dismissedGame: number | null = null;
/** Set while the way out of a game waits for its second press. */
let leaveArmed: ReturnType<typeof setTimeout> | null = null;
/** Whether the connection to the room is up; the waiting room says so when it is not. */
let online = false;
/** What the waiting room says under the scene about starting, or about what was just refused. */
let hint = "";
/** When the room last sent this page anything, in ms since the epoch. */
let heardAt = Date.now();
/** Whether the game on show is still being played. */
let gameOn = false;
/** During a game: whether the right-hand column shows the chat rather than the moves. */
let chatOpen = false;
/** Lines others said during a game while the chat was not on show. */
let unread = 0;

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

/**
 * Sends the room a message, and says whether it went. While the connection
 * is down nothing is kept to send later: what would arrive on the new
 * connection ahead of `join` would not be read, and a move or a line that
 * turned up a minute late would not be what the player meant any more.
 */
function send(message: ClientMessage): boolean {
  if (socket === null || !online) return false;
  socket.send(JSON.stringify(message));
  return true;
}

/** The room's voice chat, as this page takes part in it. */
const voice = createVoice({
  config: voiceConfig,
  send,
  changed: () => renderVoice(),
  fakeMic,
});

// For development, with the tone in place of the microphone: lets a test read how the voice chat stands.
if (fakeMic) (window as unknown as { voiceForTests: typeof voice }).voiceForTests = voice;


/** Draws the voice controls as things stand: where the screen has room for them, and what they offer. */
function renderVoice(): void {
  const view = currentView;
  const inGame = table !== null;
  const offered = view?.voice === true;
  // during a game there is no room to say that a room has no voice: the controls are just not there
  voiceBox.hidden = currentCode === "" || view === null || (inGame && !offered);
  voiceBox.classList.toggle("in-game", inGame);
  voiceNote.hidden = offered;
  voiceNote.textContent = "음성 채팅은 비공개 방에서만";
  voiceToggle.hidden = !offered;
  voiceToggle.textContent = voice.on ? "음성 나가기" : inGame ? "음성 켜기" : "음성 채팅 켜기";
  voiceMic.hidden = !offered || !voice.on;
  voiceMic.disabled = !voice.hasMic;
  voiceMic.textContent = !voice.hasMic ? "마이크 없음" : voice.muted ? "마이크 끔" : "마이크 켬";
  voiceMic.setAttribute("aria-pressed", String(voice.on && !voice.muted));
}

const chat = createChat(
  { log: el<HTMLOListElement>("chat-log"), form: el<HTMLFormElement>("chat-form"), input: chatInput },
  {
    maxLength: chatConfig.maxLength,
    storagePrefix: storageKey("chat"),
    send: (text) => send({ type: "chat", text }),
    notSent: "연결이 끊겨 보내지 못했습니다. 다시 연결되면 보내 주세요.",
  },
);

/**
 * Puts the chat where the screen has room for it: in the waiting room's
 * column, or during a game in place of the moves when its tab is chosen.
 */
function syncChat(): void {
  const inGame = table !== null;
  tabs.hidden = !inGame;
  chatBox.hidden = currentCode === "" || (inGame && !chatOpen);
  chatBox.classList.toggle("in-game", inGame);
  tabLog.setAttribute("aria-pressed", String(!chatOpen));
  tabChat.setAttribute("aria-pressed", String(chatOpen));
  tabChat.classList.toggle("unread", unread > 0);
  tabChat.textContent = unread > 0 ? `채팅 ${unread}` : "채팅";
  // an hour in a tab, the chat comes back at its last line
  if (!chatBox.hidden) chat.toEnd();
}

/** During a game: shows the chat or the moves in the right-hand column. */
function openChat(open: boolean): void {
  chatOpen = open;
  if (open) unread = 0;
  syncChat();
  if (open) chat.focus();
  else chatInput.blur();
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
  scene?.setRunning(seen);
}

/** Shows the room `view` in the picture of its game, making that picture when the game is another. */
function showScene(view: LobbyView | null): void {
  const game = view !== null && isGameId(view.game) ? view.game : null;
  if (game !== sceneGame) {
    scene?.setRunning(false);
    scene = game === null ? null : CLIENTS[game].scene(sceneCanvas, (slot) => voice.mark(slot));
    sceneGame = game;
  }
  scene?.show(view);
}

/** Shows the screen of `game` over the frame, making it on first use. */
function showTable(game: GameId): GameScreen {
  if (table !== null && tableGame !== game) {
    table.destroy();
    table = null;
    frame.classList.remove("covered");
  }
  if (table === null) {
    tableGame = game;
    table = CLIENTS[game].screen(tableCanvas, {
      act: (action) => send({ type: "action", action }),
      again: () => send({ type: "start", bots: wantBots }),
      lobby: () => {
        // the results are put away; the waiting room is under them
        dismissedGame = shownGame;
        hideTable();
      },
      voice: (slot) => voice.mark(slot),
      covered: (covered) => frame.classList.toggle("covered", covered),
    });
    table.setHost(isHost);
  }
  if (tableCanvas.hidden) {
    // The waiting room lies under the game: none of it takes a key meant for the game. A button
    // pressed with the mouse keeps the focus, and Enter on the game screen would press it again.
    room.inert = true;
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  }
  tableCanvas.hidden = false;
  leaveGameButton.hidden = false;
  rules.hidden = true;
  syncScene();
  syncChat();
  renderVoice();
  return table;
}

/** Puts the game screen away and stops it. */
function hideTable(): void {
  table?.destroy();
  table = null;
  tableGame = null;
  frame.classList.remove("covered");
  room.inert = false;
  tableCanvas.hidden = true;
  leaveGameButton.hidden = true;
  disarmLeave();
  chatOpen = false;
  unread = 0;
  syncScene();
  syncChat();
  renderVoice();
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
  voice.leave();
  currentCode = "";
  currentView = null;
  hideTable();
  chat.close();
  room.hidden = true;
  newRoom.hidden = true;
  entry.hidden = false;
  roomsPanel.hidden = false;
  rules.hidden = true;
  notice.textContent = message;
  showScene(null);
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
    button.className = "choice";
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
  listedYes.setAttribute("aria-pressed", String(chosenListed));
  listedNo.setAttribute("aria-pressed", String(!chosenListed));
  // The length of a turn a room starts with goes with who can come in; the host can change it in the
  // room. A game without turns has none to speak of.
  const who = chosenListed ? "목록에 보여 누구나 들어옵니다." : "링크나 코드를 아는 사람만 들어옵니다.";
  const clock = chosenListed ? `${clockText(config.listedTurnSeconds)}로 시작.` : `${clockText(0)}으로 시작.`;
  listedHint.textContent = game.turns ? `${who} ${clock}` : who;
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

/** What the waiting room says under its picture: the game, and whether it can start. */
function renderRoomBar(): void {
  const view = currentView;
  if (view === null) return;
  const game = isGameId(view.game) ? GAMES[view.game] : null;
  setBar(game?.summary ?? "", hint, game !== null);
}

/** The line over the room's code: the game, who can come in and how many are here, or that the connection is down. */
function renderStatus(): void {
  const view = currentView;
  if (view === null) return;
  const here = view.players.filter((p) => p.connected).length;
  const game = isGameId(view.game) ? GAMES[view.game].title : "새 게임";
  roomGame.textContent = online
    ? `${game} · ${view.listed ? "공개" : "비공개"} · ${here}/${view.maxPlayers}`
    : "연결이 끊겼습니다. 다시 연결하는 중";
  // said aloud to a screen reader when it changes
  status.textContent = online ? `${here}명 접속, 최대 ${view.maxPlayers}명` : "연결이 끊겼습니다. 다시 연결하는 중";
}

/** Says in the chat who has come into the room and who has gone since it was last sent. */
function noteComings(before: LobbyView, after: LobbyView): void {
  const was = new Map(before.players.map((p) => [p.slot, p.nick]));
  const is = new Map(after.players.map((p) => [p.slot, p.nick]));
  for (const [slot, nick] of is) if (!was.has(slot)) chat.note(`${nick} 님이 들어왔습니다`);
  for (const [slot, nick] of was) if (!is.has(slot)) chat.note(`${nick} 님이 나갔습니다`);
}

/** The room before a game: who is here, the code to share, the chat, and the start. */
function renderRoom(code: string, view: LobbyView): void {
  if (currentCode !== code) chat.open(code);
  else if (currentView !== null) noteComings(currentView, view);
  currentCode = code;
  currentView = view;
  unwatchRooms();
  roomsPanel.hidden = true;
  entry.hidden = true;
  newRoom.hidden = true;
  room.hidden = false;
  roomCode.textContent = code;
  showScene(view);
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
  isHost = view.host === view.you;
  table?.setHost(isHost);
  renderStatus();
  syncChat();

  // The room is on the list now, where strangers come in: nobody stays connected directly to anybody.
  if (!view.voice) voice.leave();
  renderVoice();

  // A room made by a newer server may be for a game this page has not heard of.
  const game = isGameId(view.game) ? GAMES[view.game] : null;
  document.title = `${game?.title ?? SITE_TITLE} · ${code}`;
  listingButton.hidden = !isHost;
  listingButton.textContent = view.listed ? "비공개로" : "공개로";
  clockButton.textContent = clockText(view.turnSeconds);
  clockButton.disabled = !isHost;
  clockButton.title = isHost ? "누르면 차례 제한 시간을 바꿉니다" : "차례 제한 시간은 방장이 정합니다";
  if (game === null) {
    startButton.disabled = true;
    hint = "새로고침하면 이 게임을 할 수 있습니다.";
    renderRoomBar();
    return;
  }
  // The same place holds what this game has to set before it starts: the length of a turn, or a team to choose.
  const teams = game.teamSize > 0;
  clockButton.hidden = !game.turns;
  teamButton.hidden = !teams;
  const myTeam = view.players.find((p) => p.slot === view.you)?.team ?? 0;
  teamButton.textContent = myTeam === 0 ? "혼자 하기" : `팀 ${myTeam}`;
  teamButton.title = `누르면 바뀝니다: 혼자, 또는 ${game.teamSize}명이 한 팀`;

  // who would play: everyone connected, a team counting once
  const sizes = new Map<number, number>();
  for (const p of connected) if (p.team > 0) sizes.set(p.team, (sizes.get(p.team) ?? 0) + 1);
  // a team that is not exactly full is no team: its players start alone (and hold up nobody)
  const broken = [...sizes].find(([, size]) => size !== game.teamSize);
  const full = [...sizes].filter(([, size]) => size === game.teamSize);
  const units = connected.length - full.reduce((sum, [, size]) => sum + size, 0) + full.length;
  const enough = teams
    ? (wantBots || units >= 2) && connected.length <= game.maxPlayers
    : wantBots || (connected.length >= game.minPlayers && connected.length <= game.maxPlayers);
  startButton.disabled = !isHost || !enough;
  hint = !enough
    ? teams
      ? "두 팀(혼자도 한 팀) 이상이 모이면 방장이 시작할 수 있습니다."
      : `${game.minPlayers}명이 모이면 방장이 시작할 수 있습니다. 지금 ${connected.length}명.`
    : broken !== undefined
      ? `팀 ${broken[0]}은 ${broken[1]}명이라 팀이 되지 않습니다 (정확히 ${game.teamSize}명). 이대로 시작하면 각자 혼자 합니다.`
      : isHost
        ? `${wantBots ? "빈 자리는 봇이 채웁니다 (개발용). " : ""}준비되면 시작하세요.`
        : "방장이 시작하기를 기다리는 중입니다.";
  renderRoomBar();
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
    pings: true,
  };

  const current = new PartySocket({
    host: location.host,
    party: PARTY_NAME,
    room: code,
    // nothing is kept to send when the connection comes back: see `send`
    maxEnqueuedMessages: 0,
    // a connection the room ended on purpose (this player left, or was refused) is not opened again
    shouldReconnectOnClose: (event) => event.code !== CLOSE_LEFT && event.code !== CLOSE_REJECTED,
  });
  socket = current;

  current.addEventListener("open", () => {
    // Fires again on every reconnect; the server expects `join` each time.
    current.send(JSON.stringify(join));
    // a connection that came back is a new one to the room: say again that this page is in voice
    voice.announce();
    online = true;
    renderStatus();
  });
  current.addEventListener("close", (event) => {
    // PartySocket reconnects by itself unless we closed it.
    if (socket !== current) return;
    online = false;
    // whatever the game screen had asked for and not heard back about is not coming
    table?.lost();
    if (event.code === CLOSE_LEFT) {
      // The room let this player go without this page asking: they left in
      // another window, or were away so long that their place was given up.
      disconnect();
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      showLobby("방에서 나왔습니다. 다른 창에서 나갔거나 자리를 오래 비웠습니다.");
      return;
    }
    renderStatus();
  });
  current.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (message === null || socket !== current) return;
    heardAt = Date.now();
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
      // a room made by a newer server may be playing a game this page has not heard of
      if (!isGameId(message.game)) return;
      const over = message.view.phase === "ended";
      gameOn = !over;
      if (over && (table === null || dismissedGame === message.startedAt)) return;
      shownGame = message.startedAt;
      showTable(message.game).update(message);
      return;
    }
    if (message.type === "refused") {
      // Something asked of the room was not accepted; the connection is fine.
      if (message.reason === "chat-too-fast") {
        chat.note(CHAT_TOO_FAST_TEXT);
      } else if (message.reason === "voice-not-here") {
        // the room went on the list between the button being shown and pressed
        voice.leave();
        chat.note("이 방에서는 음성 채팅을 쓸 수 없습니다.");
      } else if (table !== null) {
        table.refused(message.reason);
      } else {
        hint = REFUSED_TEXT[message.reason] ?? "지금은 할 수 없습니다.";
        renderRoomBar();
      }
      return;
    }
    if (message.type === "voice") {
      if (currentView !== null) voice.members(message.members, currentView.you);
      return;
    }
    if (message.type === "rtc") {
      voice.signal(message.from, message.signal);
      return;
    }
    if (message.type === "chat") {
      const mine = currentView !== null && message.from === currentView.you;
      chat.said(message.nick, message.text, mine);
      if (!mine) {
        // over the speaker's seat too, so a line is seen without the chat on show
        if (table !== null) table.say(message.from, message.text);
        else scene?.say(message.from, message.text);
        if (table !== null && !chatOpen) {
          unread++;
          syncChat();
        }
      }
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
  voice.leave();
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
  // the same press must not also press the button the form puts the cursor on
  event.preventDefault();
  if (codeInput.value.trim() !== "") joinFromInput();
  else showNewRoom();
});
codeInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  joinFromInput();
});
el<HTMLButtonElement>("leave").addEventListener("click", leaveRoom);
startButton.addEventListener("click", () => send({ type: "start", bots: wantBots }));
listingButton.addEventListener("click", () => {
  if (currentView !== null) send({ type: "listing", listed: !currentView.listed });
});
teamButton.addEventListener("click", () => {
  // each press moves on: alone, then each team the game has room for, and round again
  const view = currentView;
  if (view === null || !isGameId(view.game)) return;
  const mine = view.players.find((p) => p.slot === view.you)?.team ?? 0;
  send({ type: "team", team: (mine + 1) % (teamsIn(view.game, config) + 1) });
});
clockButton.addEventListener("click", () => {
  // each press moves to the next length the room offers, round to the first
  if (currentView === null) return;
  const choices = config.turnSecondsChoices;
  const at = choices.indexOf(currentView.turnSeconds);
  send({ type: "clock", seconds: choices[(at + 1) % choices.length] });
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
      copyButton.textContent = "링크 복사";
    }, 1500);
  };
  navigator.clipboard.writeText(link).then(
    () => done("복사됨"),
    () => {
      // no clipboard here (an old browser, or a page not served securely): the code is on screen to read out
      done("복사 실패");
      hint = `링크를 복사하지 못했습니다. 방 코드 ${currentCode}를 알려 주세요.`;
      renderRoomBar();
    },
  );
});

// The voice chat: in and out, and the microphone on and off.
voiceToggle.addEventListener("click", () => {
  if (voice.on) {
    voice.leave();
    return;
  }
  void voice.join().then(() => {
    if (!voice.on) return;
    chat.note(
      voice.hasMic
        ? "음성 채팅에 들어왔습니다. 음성은 방 사람들의 기기와 직접 주고받습니다."
        : "마이크를 쓸 수 없어 듣기만 합니다. 브라우저의 마이크 권한을 확인해 주세요.",
    );
  });
});
voiceMic.addEventListener("click", () => voice.setMuted(!voice.muted));

// During a game: the tabs over the right-hand column, and T for the chat.
tabLog.addEventListener("click", () => openChat(false));
tabChat.addEventListener("click", () => openChat(true));
// A button pressed with the mouse keeps the focus, and the next Enter or Space meant for the game
// would press it again. The ones that lie over the game give the focus back; reached and pressed
// from the keyboard (no mouse: `detail` is 0) they keep it, and the key is theirs.
for (const button of [leaveGameButton, voiceToggle, voiceMic, tabLog, tabChat]) {
  button.addEventListener("click", (event) => {
    if (event.detail > 0 && !tableCanvas.hidden) button.blur();
  });
}
chatInput.addEventListener("keydown", (event) => {
  // Esc gives the keys back to the game
  if (event.key !== "Escape" || event.isComposing) return;
  event.stopPropagation();
  if (table !== null) openChat(false);
  else chatInput.blur();
});
addEventListener("keydown", (event) => {
  if (event.code !== "KeyT" || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (currentCode === "") return;
  // the key that opens the box is not typed into it
  event.preventDefault();
  if (table !== null) openChat(true);
  else chat.focus();
});

// The rules sheet of the game chosen or being waited for. During a game the table has its own (H).
rulesOpen.addEventListener("click", () => {
  // the sheet of the game being waited for, or of the one chosen for a new room
  const game = currentView !== null && isGameId(currentView.game) ? currentView.game : chosenGame;
  for (const sheet of rules.querySelectorAll<HTMLElement>("[data-game]")) sheet.hidden = sheet.dataset.game !== game;
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
    voice.leave();
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

// Tells the room this page is still there. The room is not woken by it: the
// platform answers, and keeps the time, which is how the room later tells a
// connection that has gone silent from one that is only quiet.
setInterval(() => {
  if (socket !== null && online) socket.send(PING);
}, config.pingSeconds * 1000);

// A table waiting on a player whose page went without a word (a laptop
// closed, a network gone) wakes nobody, so the room would never notice. A
// page that has heard nothing for a while during a game asks the room to
// look. The room answers everyone, so one page asking is enough: the pages
// wait a little longer the higher their slot, and the first to ask resets
// the rest.
const POKE_CHECK_MS = 5000;
const POKE_STAGGER_MS = 3000;
setInterval(() => {
  if (socket === null || !online || table === null || !gameOn) return;
  const wait = config.pokeSeconds * 1000 + (currentView?.you ?? 0) * POKE_STAGGER_MS;
  if (Date.now() - heardAt < wait) return;
  heardAt = Date.now();
  send({ type: "poke" });
}, POKE_CHECK_MS);

// A page the browser has moved away from may be kept, frozen, in case the
// player comes back to it: its connections would stay open and the room would
// go on showing someone who is not there. They are closed when the page is
// put away and opened again if it is brought back.
addEventListener("pagehide", () => {
  voice.leave();
  socket?.close();
  listSocket?.close();
});
addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  socket?.reconnect();
  listSocket?.reconnect();
});

// Restore the last nickname, and rejoin the room named in the address if any.
nickInput.maxLength = config.nickMaxLength;
codeInput.maxLength = config.roomCodeLength;
nickInput.value = localStorage.getItem(storageKey("nick")) ?? "";
showLobby();
followAddress();
if (socket === null) nickInput.focus();

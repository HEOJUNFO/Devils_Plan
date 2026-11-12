/**
 * The browser client: the lobby (the rooms anyone can join, of every game),
 * making a room, the room before a game, and the game. Everything sits in one
 * frame the size of the game's screen, scaled up as one piece: the lobby and
 * the waiting room are markup, and the game is a canvas that covers the frame
 * while a game is on. Which game's screen that is comes from `games/index`.
 *
 * To act as several players in one browser, open each tab with a different
 * `?profile=<name>`; each profile keeps its own token and nickname.
 *
 * The page is read in Korean or in English (`lang.ts`). No sentence is
 * written here or in the markup: the page's own are in `words.ts`.
 */
import { PartySocket } from "partysocket";
import { roomsShown, type RoomListing } from "../shared/directory";
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
  PONG,
  parseDirectoryMessage,
  parseServerMessage,
  type ClientMessage,
  type DirectoryMessage,
  type DirectoryRequest,
  type RejectReason,
} from "../shared/protocol";
import { liftFor, placeFrame } from "../shared/frame";
import { doubted, heard, look, opened, sent, type Liveness } from "../shared/liveness";
import { keepRoom, keptRoom } from "../shared/resume";
import chatConfig from "../shared/chat-config.json";
import roomConfig from "../shared/room-config.json";
import voiceConfig from "../shared/voice-config.json";
import { createChat } from "./chat";
import { isMuted, setMuted, startAudio } from "./game/sound";
import { CLIENTS, type GameScreen, type WaitingScene } from "./games";
import { OTHER_LANGS, lang, switchLang } from "./lang";
import { drawLobbyArt } from "./lobby-art";
import { storageKey } from "./storage";
import { TOUCH } from "./touch";
import { createVoice } from "./voice";
import { WORDS } from "./words";

const config: RoomConfig = roomConfig;

/** How far above the on-screen keyboard a box being typed in is kept, in CSS pixels. */
const KEYBOARD_MARGIN = 8;

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

/** How long the way out of a game waits for its second press. */
const LEAVE_CONFIRM_MS = 3000;

/** Why the room would not let this page in, in words. */
const REJECT_TEXT: Record<RejectReason, string> = WORDS.reject;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const frame = el<HTMLElement>("frame");
const roomsPanel = el<HTMLElement>("rooms");
const roomList = el<HTMLOListElement>("room-list");
const roomsCount = el<HTMLElement>("rooms-count");
const roomsPick = el<HTMLButtonElement>("rooms-pick");
const roomsGames = el<HTMLElement>("rooms-games");
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
const variantButton = el<HTMLButtonElement>("variant");
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
const menuOpen = el<HTMLButtonElement>("menu-open");
const gameMenu = el<HTMLElement>("game-menu");
const menuList = el<HTMLElement>("menu-list");
const menuRules = el<HTMLButtonElement>("menu-rules");
const menuSound = el<HTMLButtonElement>("menu-sound");
const menuFull = el<HTMLButtonElement>("menu-full");
const menuClose = el<HTMLButtonElement>("menu-close");
const turnFull = el<HTMLButtonElement>("turn-full");
const rulesSheet = el<HTMLElement>("rules-sheet");
const langButton = el<HTMLButtonElement>("lang");

/** What the page is called while no room is open. */
const SITE_TITLE = WORDS.site.title;

/** The words that stay as they are while the page is open, put where the markup leaves room for them. */
function writeWords(): void {
  document.title = SITE_TITLE;
  document.querySelector('meta[name="description"]')?.setAttribute("content", WORDS.site.description);
  const said: [id: string, text: string][] = [
    ["rooms-title", WORDS.rooms.title],
    ["entry-title", WORDS.site.title],
    ["entry-sub", WORDS.entry.sub],
    ["nick-label", WORDS.entry.nick],
    ["create", WORDS.entry.create],
    ["by-code", WORDS.entry.byCode],
    ["join", WORDS.entry.join],
    ["new-room-title", WORDS.newRoom.title],
    ["game-label", WORDS.newRoom.game],
    ["listed-label", WORDS.newRoom.who],
    ["listed-yes", WORDS.newRoom.listed],
    ["listed-no", WORDS.newRoom.unlisted],
    ["create-cancel", WORDS.newRoom.cancel],
    ["create-go", WORDS.newRoom.go],
    ["copy", WORDS.room.copy],
    ["start", WORDS.room.start],
    ["leave", WORDS.room.leave],
    ["rules-open", WORDS.bar.rules],
    ["rules-close", WORDS.bar.close],
    ["leave-game", WORDS.game.leave],
    ["tab-chat", WORDS.game.chat(0)],
    ["chat-send", WORDS.chat.send],
    ["turn-words", WORDS.site.turnDevice],
    ["turn-full", WORDS.site.turnFull],
    ["menu-open", WORDS.menu.open],
    ["menu-rules", WORDS.menu.rules],
    ["menu-close", WORDS.menu.close],
  ];
  for (const [id, text] of said) el(id).textContent = text;
  // said to a screen reader of what has no words on show
  const labelled: [id: string, text: string][] = [
    ["code", WORDS.entry.code],
    ["voice", WORDS.voice.label],
    ["tabs", WORDS.game.tabs],
    ["chat", WORDS.chat.label],
    ["chat-input", WORDS.chat.say],
    ["table", WORDS.game.screen],
    ["game-menu", WORDS.menu.label],
  ];
  for (const [id, text] of labelled) el(id).setAttribute("aria-label", text);
  chatInput.placeholder = WORDS.chat.say;
  // One other language, on one button, named as its own readers name it. More would take a list.
  const [other] = OTHER_LANGS;
  if (other !== undefined) {
    langButton.textContent = other.name;
    langButton.lang = other.lang;
    langButton.addEventListener("click", () => switchLang(other.lang));
  }
}
writeWords();

drawLobbyArt(el<HTMLCanvasElement>("lobby-art"));

function loadToken(): string {
  const key = storageKey("token");
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, token);
  }
  return token;
}

// What the style sheet lays out for a finger: larger buttons, and one menu over a game (style.css).
document.documentElement.classList.toggle("touch", TOUCH);

/** The window the frame was last fitted to, in CSS pixels. */
let fitted = { width: 0, height: 0 };

/**
 * Fits the frame to the window (`shared/frame.ts` says how large): with a
 * mouse as large as it goes on whole pixels of the screen, under a finger as
 * large as the screen allows.
 */
function fitFrame(): void {
  // Where a phone's browser shrinks the window for its keyboard, the frame is not shrunk to the strip
  // that is left while a box is typed in: it keeps its size and is lifted (`liftFrame`).
  const typing = TOUCH && document.activeElement instanceof HTMLInputElement && innerWidth === fitted.width;
  const height = typing ? Math.max(innerHeight, fitted.height) : innerHeight;
  fitted = { width: innerWidth, height };
  const placed = placeFrame({ width: innerWidth, height, density: devicePixelRatio || 1, coarse: TOUCH });
  frame.style.setProperty("--scale", String(placed.scale));
  frame.style.setProperty("--left", `${placed.left}px`);
  frame.style.setProperty("--top", `${placed.top}px`);
}
addEventListener("resize", fitFrame);
fitFrame();

/** How far the frame is lifted now, in CSS pixels. */
let lifted = 0;

/**
 * Under a finger: keeps the box being typed in clear of the on-screen
 * keyboard. A browser that moves the page for its keyboard has the box in
 * sight already, and nothing is lifted; one that only lays the keyboard over
 * the page would leave the chat's box under it.
 */
function liftFrame(): void {
  const seen = window.visualViewport;
  const box = document.activeElement;
  let lift = 0;
  if (TOUCH && seen != null && box instanceof HTMLInputElement && frame.contains(box)) {
    // where the box ends with the frame where it belongs
    const bottom = box.getBoundingClientRect().bottom + lifted;
    lift = liftFor(bottom, seen.offsetTop, seen.height, KEYBOARD_MARGIN);
  }
  if (lift === lifted) return;
  lifted = lift;
  frame.style.setProperty("--lift", `${lift}px`);
}
if (TOUCH) {
  window.visualViewport?.addEventListener("resize", liftFrame);
  window.visualViewport?.addEventListener("scroll", liftFrame);
  addEventListener("focusin", liftFrame);
  addEventListener("focusout", () => {
    liftFrame();
    // a browser that moved the page for its keyboard does not always move it back
    if (!(document.activeElement instanceof HTMLInputElement)) scrollTo(0, 0);
  });
}

/** The connection to the room this page is in or is entering. */
let socket: PartySocket | null = null;
/** The connection to the list of rooms, while the lobby is on show. */
let listSocket: PartySocket | null = null;
/** The room this page has asked to enter and has not heard back from; `null` when there is none. */
let entering: string | null = null;
/**
 * A connection opened ahead to the room whose row the pointer or the keyboard
 * is on, so that a press finds it open (`warmUp`). Nothing is sent on it: to
 * the room it is nobody until `connect` takes it and joins.
 */
let warm: { code: string; socket: PartySocket } | null = null;
/** The wait before a connection is opened ahead, while one is running. */
let warming: ReturnType<typeof setTimeout> | null = null;
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
/**
 * The room's last word on its waiting room and on the game on the screen, as it was sent: what this
 * page puts away when it is left, for the page loaded in its place to show at once (`resume.ts`).
 */
let lastLobby: string | null = null;
let lastGame: string | null = null;
/** Since when what is shown of the room may not be how the room stands; `null` while the room's word is the latest. */
let staleSince: number | null = null;
/** Whether the room on show is the one put back from what was kept, with the room itself not heard from yet. */
let returning = false;
/** Whether the game on show is the one put back from what was kept, with the room's word on its game not heard yet. */
let keptTable = false;
/** What the waiting room says under the scene about starting, or about what was just refused. */
let hint = "";
/** When the room last sent this page anything, in ms since the epoch. */
let heardAt = Date.now();
/** What this page knows of whether its connection to the room still lives (`liveness.ts`). */
let live: Liveness = opened(Date.now());
/** Whether the game on show is still being played. */
let gameOn = false;
/** During a game: whether the right-hand column shows the chat rather than the moves. */
let chatOpen = false;
/** During a game of many players: the tabs sit at the top of the column, and the first shows the players with the moves. */
let crowded = false;
/** Lines others said during a game while the chat was not on show. */
let unread = 0;
/** The screen's promise not to go dark, while one is held (`keepAwake`). */
let awake: WakeLockSentinel | null = null;
/** Whether that promise has been asked for and not yet given. */
let waking = false;

/** What a new room will be: the last choices made in this browser. */
const storedGame = localStorage.getItem(storageKey("game"));
let chosenGame: GameId = isGameId(storedGame) ? storedGame : DEFAULT_GAME;
let chosenListed = localStorage.getItem(storageKey("listed")) !== "0";

/** Puts the way out of a game back to its first press. */
function disarmLeave(): void {
  if (leaveArmed !== null) clearTimeout(leaveArmed);
  leaveArmed = null;
  leaveGameButton.textContent = WORDS.game.leave;
  frame.classList.remove("leaving");
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
  // a living connection is heard from soon after anything goes out on it
  live = sent(live, Date.now());
  return true;
}

/**
 * How a connection that closed is opened again: within a second, not the
 * three the library waits, and not every page of a room in the same instant.
 */
function reconnecting(): { minReconnectionDelay: number; reconnectionDelayGrowFactor: number; maxReconnectionDelay: number } {
  return {
    minReconnectionDelay: config.reconnect.firstMs + Math.random() * config.reconnect.jitterMs,
    reconnectionDelayGrowFactor: config.reconnect.grow,
    maxReconnectionDelay: config.reconnect.mostMs,
  };
}

/** The room did not answer when asked: the connection is shown as lost at once, and opened anew. */
function revive(): void {
  if (socket === null) return;
  online = false;
  // whatever the game screen had asked for and not heard back about is not coming
  table?.lost();
  renderStatus();
  socket.reconnect();
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
  // Under a finger the controls of a game are in its menu, where they have the room to be pressed;
  // in the waiting room, and with a mouse, they sit on the frame itself.
  const home = TOUCH && inGame ? menuList : frame;
  if (voiceBox.parentElement !== home) {
    if (home === menuList) menuList.insertBefore(voiceBox, menuFull);
    else frame.insertBefore(voiceBox, tabs);
  }
  // during a game there is no room to say that a room has no voice: the controls are just not there
  voiceBox.hidden = currentCode === "" || view === null || (inGame && !offered);
  voiceBox.classList.toggle("in-game", inGame);
  voiceNote.hidden = offered;
  voiceNote.textContent = WORDS.voice.unlistedOnly;
  voiceToggle.hidden = !offered;
  voiceToggle.textContent = voice.on ? WORDS.voice.leave : inGame ? WORDS.voice.joinInGame : WORDS.voice.join;
  voiceMic.hidden = !offered || !voice.on;
  voiceMic.disabled = !voice.hasMic;
  voiceMic.textContent = !voice.hasMic ? WORDS.voice.noMic : voice.muted ? WORDS.voice.micOff : WORDS.voice.micOn;
  voiceMic.setAttribute("aria-pressed", String(voice.on && !voice.muted));
}

const chat = createChat(
  { log: el<HTMLOListElement>("chat-log"), form: el<HTMLFormElement>("chat-form"), input: chatInput },
  {
    maxLength: chatConfig.maxLength,
    storagePrefix: storageKey("chat"),
    send: (text) => send({ type: "chat", text }),
    wordsOf(note) {
      if (note.kind === "came") return WORDS.room.came(note.nick);
      if (note.kind === "went") return WORDS.room.went(note.nick);
      if (note.kind === "not-sent") return WORDS.chat.notSent;
      if (note.kind === "too-fast") return WORDS.chat.tooFast;
      if (note.kind === "voice-joined") return WORDS.voice.joined;
      if (note.kind === "voice-listen-only") return WORDS.voice.listenOnly;
      return WORDS.voice.notHere;
    },
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
  frame.classList.toggle("crowd", inGame && crowded);
  tabLog.textContent = crowded ? WORDS.game.standings : WORDS.game.log;
  tabLog.setAttribute("aria-pressed", String(!chatOpen));
  tabChat.setAttribute("aria-pressed", String(chatOpen));
  tabChat.classList.toggle("unread", unread > 0);
  tabChat.textContent = WORDS.game.chat(unread);
  // an hour in a tab, the chat comes back at its last line
  if (!chatBox.hidden) chat.toEnd();
}

/** During a game: shows the chat or the moves in the right-hand column. */
function openChat(open: boolean): void {
  chatOpen = open;
  if (open) unread = 0;
  syncChat();
  // Under a finger the chat is opened to be read as often as to be written in, and a box that takes
  // the focus brings the keyboard up over half the screen: there the box is pressed to type in it.
  if (open && !TOUCH) chat.focus();
  else if (!open) chatInput.blur();
}

/**
 * Under a finger, during a game: opens or closes the menu over it, with its
 * buttons saying how things stand.
 */
function openMenu(open: boolean): void {
  const show = open && TOUCH && table !== null;
  gameMenu.hidden = !show;
  menuOpen.setAttribute("aria-expanded", String(show));
  if (!show) {
    disarmLeave();
    return;
  }
  menuSound.textContent = isMuted() ? WORDS.menu.soundOff : WORDS.menu.soundOn;
  menuSound.setAttribute("aria-pressed", String(!isMuted()));
  // a phone's browser that cannot fill the screen (Safari on an iPhone) has no button for it
  menuFull.hidden = !document.fullscreenEnabled;
  menuFull.textContent = document.fullscreenElement === null ? WORDS.menu.full : WORDS.menu.fullExit;
}

/**
 * Fills the screen with the page and, where the browser can, turns it
 * sideways and holds it there: a phone with its rotation locked shows the
 * frame as it is meant to be seen. What a browser cannot do it leaves undone.
 */
function fillScreen(): void {
  const turn = (): void => {
    // not every browser has it, and none grants it outside full screen
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    void orientation.lock?.("landscape").catch(() => undefined);
  };
  if (document.fullscreenElement !== null) {
    turn();
    return;
  }
  void document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(turn, () => undefined);
}

/**
 * Under a finger: keeps the screen lit while a game is being played. A phone
 * goes dark after half a minute without a press, and a player waiting for
 * their turn presses nothing; a dark phone drops its connection. The browser
 * takes the promise back whenever the page is hidden, so it is asked for
 * again each time things change.
 */
function keepAwake(): void {
  const wanted = TOUCH && table !== null && gameOn && document.visibilityState === "visible";
  if (!wanted) {
    void awake?.release().catch(() => undefined);
    awake = null;
    return;
  }
  if (awake !== null || waking || !("wakeLock" in navigator)) return;
  waking = true;
  navigator.wakeLock.request("screen").then(
    (sentinel) => {
      waking = false;
      awake = sentinel;
      sentinel.addEventListener("release", () => {
        if (awake === sentinel) awake = null;
      });
      // things may have changed while it was asked for
      keepAwake();
    },
    () => {
      // a battery saver, or a browser that keeps the promise to itself: the screen dims as it would have
      waking = false;
    },
  );
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
    crowded = false;
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
      crowded: (value) => {
        if (crowded === value) return;
        crowded = value;
        syncChat();
      },
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
  menuOpen.hidden = !TOUCH;
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
  crowded = false;
  frame.classList.remove("covered");
  room.inert = false;
  tableCanvas.hidden = true;
  leaveGameButton.hidden = true;
  menuOpen.hidden = true;
  openMenu(false);
  disarmLeave();
  chatOpen = false;
  unread = 0;
  keepAwake();
  syncScene();
  syncChat();
  renderVoice();
}

// ---- The lobby: the rooms anyone can join -------------------------------------------------------

/** What a row says about how the room stands. */
function standing(listing: RoomListing, game: GameId): string {
  if (listing.players >= listing.maxPlayers) return WORDS.rooms.full;
  if (listing.playing) return WORDS.rooms.playing;
  const short = GAMES[game].minPlayers - listing.players;
  return short > 0 ? WORDS.rooms.waitingFor(short) : WORDS.rooms.waiting;
}

/** The game whose rooms the lobby lists, `null` for every game: what the player last picked while the page has been open. */
let listedGame: GameId | null = null;
/** The list of rooms as the directory last sent it; `null` while it is not known (connecting, or the connection dropped). */
let roomsSent: DirectoryMessage | null = null;

/**
 * The games to pick from over the list, every game first, each with how many
 * rooms it has. Made once; `renderRooms` keeps the counts and which is picked.
 */
const gamePicks = [null, ...GAME_IDS].map((game) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice game-pick";
  const name = document.createElement("span");
  name.textContent = game === null ? WORDS.rooms.everyGame : GAMES[game].title[lang];
  const count = document.createElement("span");
  button.append(name, count);
  button.addEventListener("click", () => pickGame(game));
  roomsGames.append(button);
  return { game, button, count };
});
roomsGames.setAttribute("aria-label", WORDS.rooms.pick);

/** Shows the games to pick from where the list is, or the list again. */
function showGamePicks(open: boolean): void {
  roomsGames.hidden = !open;
  roomsPanel.classList.toggle("picking", open);
  roomsPick.setAttribute("aria-expanded", String(open));
}

/** Lists the rooms of `game` only, or of every game (`null`). */
function pickGame(game: GameId | null): void {
  showGamePicks(false);
  roomsPick.focus();
  if (game === listedGame) return;
  listedGame = game;
  askForGame();
  // the rows of that game already sent are shown at once; the directory's answer has the rest
  renderRooms();
  roomList.scrollTop = 0;
}

/**
 * Tells the directory whose rooms this page lists. Only over a connection
 * that is open: one that is not yet asks when it opens (`watchRooms`).
 */
function askForGame(): void {
  if (listSocket === null || listSocket.readyState !== WebSocket.OPEN) return;
  const request: DirectoryRequest = { type: "show", game: listedGame };
  listSocket.send(JSON.stringify(request));
}

/** Draws the list of rooms as last sent, for the game picked. */
function renderRooms(): void {
  // what is shown is worked out from what was sent: a newer server may list a game this page has not heard of, which cannot be played here
  const shown = roomsSent === null ? null : roomsShown(roomsSent.rooms, roomsSent.counts, listedGame);
  const known = shown?.rooms ?? [];
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.code : undefined;
  const rows = known.map((listing) => {
    const game = listing.game;
    const full = listing.players >= listing.maxPlayers;
    const button = document.createElement("button");
    button.type = "button";
    // the row pressed says at once that the press was taken: the room's answer is a second away on a slow line
    const going = listing.code === entering;
    button.className = going ? "room-row entering" : "room-row";
    button.dataset.code = listing.code;
    button.disabled = full;
    if (going) button.setAttribute("aria-busy", "true");
    const part = (name: string, text: string): HTMLSpanElement => {
      const span = document.createElement("span");
      span.className = name;
      span.textContent = text;
      return span;
    };
    button.append(
      part("room-host", WORDS.rooms.of(listing.host)),
      part("room-count", `${listing.players}/${listing.maxPlayers}`),
      part("room-game", GAMES[game].title[lang]),
      part(!going && (listing.playing || full) ? "room-state busy" : "room-state", going ? WORDS.rooms.entering : standing(listing, game)),
    );
    button.addEventListener("click", () => joinRoom(listing.code));
    const item = document.createElement("li");
    item.append(button);
    return item;
  });
  // There are rooms the list has no room for: said under the last row. With no row yet, they are on their way (below).
  if (shown !== null && shown.more > 0 && known.length > 0) {
    const more = document.createElement("li");
    more.className = "rooms-more";
    more.textContent = listedGame === null ? WORDS.rooms.moreOfAll(shown.more) : WORDS.rooms.moreOfGame(shown.more);
    rows.push(more);
  }
  roomList.replaceChildren(...rows);
  // the list is redrawn whole: the row the keyboard was on stays the one it is on
  if (focused !== undefined) roomList.querySelector<HTMLElement>(`[data-code="${focused}"]`)?.focus();
  roomsCount.textContent = shown === null ? "" : WORDS.rooms.total(shown.total);
  // A game was picked none of whose rooms were among those sent, though it has some: the directory's answer is on its way.
  roomsNote.textContent =
    shown === null || (known.length === 0 && shown.total > 0)
      ? WORDS.rooms.loading
      : known.length > 0
        ? ""
        : listedGame === null
          ? WORDS.rooms.none
          : WORDS.rooms.noneOf(GAMES[listedGame].title[lang]);
  roomsPick.textContent = `${listedGame === null ? WORDS.rooms.everyGame : GAMES[listedGame].title[lang]} ▾`;
  for (const pick of gamePicks) {
    const rooms = shown === null ? null : pick.game === null ? GAME_IDS.reduce((sum, id) => sum + shown.counts[id], 0) : shown.counts[pick.game];
    pick.button.setAttribute("aria-pressed", String(pick.game === listedGame));
    pick.count.textContent = rooms === null ? "" : WORDS.rooms.count(rooms);
    pick.count.className = rooms === 0 ? "game-count none" : "game-count";
  }
}

/** Starts listening to the list of rooms, if not already. */
function watchRooms(): void {
  if (listSocket !== null) return;
  roomsSent = null;
  renderRooms();
  const current = new PartySocket({ host: location.host, party: DIRECTORY_PARTY, room: DIRECTORY_NAME, ...reconnecting() });
  listSocket = current;
  current.addEventListener("open", () => {
    // every connection starts with the rooms of every game, a reconnection too: the game picked is asked for again
    if (listSocket === current && listedGame !== null) askForGame();
  });
  current.addEventListener("message", (event) => {
    const message = parseDirectoryMessage(event.data);
    if (message === null || listSocket !== current) return;
    roomsSent = message;
    renderRooms();
  });
  current.addEventListener("close", () => {
    // PartySocket reconnects by itself; until then the list on show may be out of date
    if (listSocket !== current) return;
    roomsSent = null;
    renderRooms();
  });
}

function unwatchRooms(): void {
  listSocket?.close();
  listSocket = null;
  coolDown();
}

/** Notes which room this page is on its way into, `null` for none: what the form says meanwhile is not said as something gone wrong. */
function setEntering(code: string | null): void {
  entering = code;
  notice.classList.toggle("going", code !== null);
}

/** A connection to the room `code`, with nothing said on it yet. */
function openRoom(code: string): PartySocket {
  return new PartySocket({
    host: location.host,
    party: PARTY_NAME,
    room: code,
    // nothing is kept to send when the connection comes back: see `send`
    maxEnqueuedMessages: 0,
    // a connection the room ended on purpose (this player left, or was refused) is not opened again
    shouldReconnectOnClose: (event) => event.code !== CLOSE_LEFT && event.code !== CLOSE_REJECTED,
    ...reconnecting(),
  });
}

/** Lets go of the connection opened ahead, and of the wait for one. */
function coolDown(): void {
  if (warming !== null) clearTimeout(warming);
  warming = null;
  warm?.socket.close();
  warm = null;
}

/**
 * Opens a connection to the room `code` ahead of the press, once the pointer
 * or the keyboard has stayed on its row a moment. Opening one takes several
 * trips to the server and back, which far from it is most of the wait between
 * the press and the room.
 */
function warmUp(code: string): void {
  if (warm?.code === code || entering === code) return;
  coolDown();
  warming = setTimeout(() => {
    warming = null;
    const current = openRoom(code);
    warm = { code, socket: current };
    // The room ends a connection that says nothing for long, and a line can drop: this one is then let go,
    // not opened again, and the press opens its own.
    current.addEventListener("close", () => {
      if (warm?.socket === current) coolDown();
    });
  }, config.warmUpMs);
}

/** The code of the room whose row `target` is in, if that room can be entered. */
function rowCode(target: EventTarget | null): string | null {
  const row = target instanceof Element ? target.closest<HTMLButtonElement>(".room-row") : null;
  return row === null || row.disabled ? null : (row.dataset.code ?? null);
}

// A finger is on a row only for the press itself, which is no time to open anything in: a mouse and the keyboard are there first.
roomList.addEventListener("pointerover", (event) => {
  if (event.pointerType !== "mouse") return;
  const code = rowCode(event.target);
  if (code === null) coolDown();
  else warmUp(code);
});
roomList.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") coolDown();
});
roomList.addEventListener("focusin", (event) => {
  const code = rowCode(event.target);
  if (code !== null) warmUp(code);
});

/** The lobby: the rooms anyone can join, a nickname, and a room to make or enter by code. */
function showLobby(message = ""): void {
  voice.leave();
  setEntering(null);
  lastLobby = null;
  lastGame = null;
  staleSince = null;
  returning = false;
  keptTable = false;
  currentCode = "";
  currentView = null;
  hideTable();
  chat.close();
  room.hidden = true;
  newRoom.hidden = true;
  entry.hidden = false;
  roomsPanel.hidden = false;
  showGamePicks(false);
  rules.hidden = true;
  notice.textContent = message;
  showScene(null);
  syncScene();
  setBar(WORDS.bar.lobby[0], WORDS.bar.lobby[1], false);
  langButton.hidden = false;
  document.title = SITE_TITLE;
  watchRooms();
  // a row that was on its way in is a row like the others again
  renderRooms();
}

// ---- Making a room ------------------------------------------------------------------------------------

/** Draws the choices for a new room as they now stand. */
function renderNewRoom(): void {
  const choices = GAME_IDS.map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.textContent = GAMES[id].title[lang];
    button.setAttribute("aria-pressed", String(id === chosenGame));
    button.addEventListener("click", () => {
      chosenGame = id;
      renderNewRoom();
    });
    return button;
  });
  gameChoices.replaceChildren(...choices);
  // a name too long for half a row has a row of its own (the form is on show when this is drawn, so it can be measured)
  for (const button of choices) button.classList.toggle("whole", button.scrollWidth > button.clientWidth);
  // with more games than the list has rows it scrolls: the game chosen is in sight when the form is drawn
  choices[GAME_IDS.indexOf(chosenGame)]?.scrollIntoView({ block: "nearest" });
  const game = GAMES[chosenGame];
  listedYes.setAttribute("aria-pressed", String(chosenListed));
  listedNo.setAttribute("aria-pressed", String(!chosenListed));
  // The length of a turn a room starts with goes with who can come in; the host can change it in the
  // room. A game without turns has none to speak of.
  const who = chosenListed ? WORDS.newRoom.listedHint : WORDS.newRoom.unlistedHint;
  const clock = WORDS.newRoom.startsAt(chosenListed ? config.listedTurnSeconds : 0);
  listedHint.textContent = game.turns ? `${who} ${clock}` : who;
  setBar(game.summary[lang], WORDS.newRoom.howMany(game.minPlayers, game.maxPlayers), true);
}

/** The form for a new room: which game, and who may come in. */
function showNewRoom(): void {
  if (readNick() === null) return;
  notice.textContent = "";
  entry.hidden = true;
  newRoom.hidden = false;
  langButton.hidden = true;
  renderNewRoom();
  el<HTMLButtonElement>("create-go").focus();
}

function closeNewRoom(): void {
  newRoom.hidden = true;
  entry.hidden = false;
  rules.hidden = true;
  setBar(WORDS.bar.lobby[0], WORDS.bar.lobby[1], false);
  langButton.hidden = false;
}

// ---- A room, before a game ---------------------------------------------------------------------------

/** What the waiting room says under its picture: the game, and whether it can start. */
function renderRoomBar(): void {
  const view = currentView;
  if (view === null) return;
  const game = isGameId(view.game) ? GAMES[view.game] : null;
  setBar(game?.summary[lang] ?? "", hint, game !== null);
}

/** The line over the room's code: the game, who can come in and how many are here, or that the connection is down. */
function renderStatus(): void {
  const view = currentView;
  if (view === null) return;
  const here = view.players.filter((p) => p.connected).length;
  const game = isGameId(view.game) ? GAMES[view.game].title[lang] : WORDS.room.newGame;
  const write = (lines: string[]): void => {
    roomGame.replaceChildren(
      ...lines.map((line) => {
        const span = document.createElement("span");
        span.textContent = line;
        return span;
      }),
    );
    // with the name on a line of its own, what lies under the heading moves down a line (style.css)
    frame.classList.toggle("tall-heading", lines.length > 1);
  };
  // One line where it fits, as in Korean it mostly does; two where a game's name is as wide as the column,
  // as in English it mostly is. (The room is on show when this is written, so the line can be measured.)
  // a room put back from what was kept says so until the room itself has spoken: who is here may have changed
  const away = returning ? WORDS.room.returning : online ? null : WORDS.room.offline;
  write(away === null ? WORDS.room.status(game, view.listed, here, view.maxPlayers) : [away]);
  if (away === null && roomGame.childElementCount === 1 && roomGame.scrollWidth > roomGame.clientWidth) write(WORDS.room.statusTall(game, view.listed, here, view.maxPlayers));
  // said aloud to a screen reader when it changes
  status.textContent = away ?? WORDS.room.statusSpoken(here, view.maxPlayers);
}

/** Says in the chat who has come into the room and who has gone since it was last sent. */
function noteComings(before: LobbyView, after: LobbyView): void {
  const was = new Map(before.players.map((p) => [p.slot, p.nick]));
  const is = new Map(after.players.map((p) => [p.slot, p.nick]));
  for (const [slot, nick] of is) if (!was.has(slot)) chat.note({ kind: "came", nick });
  for (const [slot, nick] of was) if (!is.has(slot)) chat.note({ kind: "went", nick });
}

/** The room before a game: who is here, the code to share, the chat, and the start. */
function renderRoom(code: string, view: LobbyView): void {
  if (currentCode !== code) chat.open(code);
  else if (currentView !== null) noteComings(currentView, view);
  currentCode = code;
  currentView = view;
  setEntering(null);
  unwatchRooms();
  roomsPanel.hidden = true;
  entry.hidden = true;
  newRoom.hidden = true;
  room.hidden = false;
  langButton.hidden = true;
  roomCode.textContent = code;
  // A code of wide letters (W, M) and the button beside it are wider than the column: the letters then stand
  // closer (style.css). The room is on show by now, so the row can be measured.
  const codeRow = roomCode.closest<HTMLElement>(".code-row");
  if (codeRow !== null) {
    codeRow.classList.remove("tight");
    codeRow.classList.toggle("tight", codeRow.scrollWidth > codeRow.clientWidth);
  }
  showScene(view);
  syncScene();

  // The picture shows who is here; this list says the same in words for a screen reader.
  const bySlot = new Map(view.players.map((p) => [p.slot, p]));
  const rows: HTMLLIElement[] = [];
  for (let slot = 0; slot < view.maxPlayers; slot++) {
    const player = bySlot.get(slot);
    const row = document.createElement("li");
    row.textContent = player ? WORDS.room.seat(slot + 1, player.nick, slot === view.you, player.connected) : WORDS.room.emptySeat(slot + 1);
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
  document.title = `${game?.title[lang] ?? SITE_TITLE} · ${code}`;
  listingButton.hidden = !isHost;
  listingButton.textContent = view.listed ? WORDS.room.toUnlisted : WORDS.room.toListed;
  clockButton.textContent = WORDS.room.clock(view.turnSeconds);
  clockButton.disabled = !isHost;
  clockButton.title = isHost ? WORDS.room.clockHost : WORDS.room.clockGuest;
  // which way the game is played here, where it has more than one: the host's to choose
  const variant = game?.variants.find((each) => each.id === view.variant);
  variantButton.hidden = variant === undefined;
  variantButton.textContent = variant?.title[lang] ?? "";
  variantButton.disabled = !isHost;
  variantButton.title = isHost ? WORDS.room.variantHost : WORDS.room.variantGuest;
  if (game === null) {
    startButton.disabled = true;
    hint = WORDS.room.reloadForGame;
    renderRoomBar();
    return;
  }
  // The same place holds what this game has to set before it starts: the length of a turn, or a team to choose.
  const teams = game.teamSize > 0;
  clockButton.hidden = !game.turns;
  teamButton.hidden = !teams;
  const mine = view.players.find((p) => p.slot === view.you);
  const myTeam = mine?.team ?? 0;
  // a team's leader is whoever took it first: their share of the team's points differs from the others'
  teamButton.textContent = myTeam === 0 ? WORDS.room.solo : WORDS.room.team(myTeam, mine?.leads === true);
  teamButton.title = WORDS.room.teamHelp(game.teamSize);

  const sizes = new Map<number, number>();
  for (const p of connected) if (p.team > 0) sizes.set(p.team, (sizes.get(p.team) ?? 0) + 1);
  // a team that is not exactly full is no team: its players start alone (and hold up nobody)
  const broken = [...sizes].find(([, size]) => size !== game.teamSize);
  // A game starts with as many as it takes at least: one, in a game that can be played alone. Teams
  // change nothing in that: one team, or one player, is enough where one player is.
  const enough = wantBots || (connected.length >= game.minPlayers && connected.length <= game.maxPlayers);
  startButton.disabled = !isHost || !enough;
  const alone = connected.length === 1 && game.minPlayers === 1;
  hint = !enough
    ? WORDS.room.needPlayers(game.minPlayers, connected.length)
    : broken !== undefined
      ? WORDS.room.brokenTeam(broken[0], broken[1], game.teamSize)
      : isHost
        ? WORDS.room.hostReady(wantBots, alone)
        : WORDS.room.waitHost;
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
  // a connection opened ahead to this very room is the one used; one to any other room is let go
  const ahead = !create && warm?.code === code ? warm.socket : null;
  if (ahead !== null) warm = null;
  coolDown();
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

  const current = ahead ?? openRoom(code);
  socket = current;

  const greet = (): void => {
    // Fires again on every reconnect; the server expects `join` each time.
    current.send(JSON.stringify(join));
    // a connection that came back is a new one to the room: say again that this page is in voice
    voice.announce();
    online = true;
    live = opened(Date.now());
    renderStatus();
  };
  current.addEventListener("open", greet);
  // one opened ahead may be open already: its `open` has been and gone
  if (current.readyState === WebSocket.OPEN) greet();
  current.addEventListener("close", (event) => {
    // PartySocket reconnects by itself unless we closed it.
    if (socket !== current) return;
    online = false;
    staleSince ??= Date.now();
    // whatever the game screen had asked for and not heard back about is not coming
    table?.lost();
    if (event.code === CLOSE_LEFT) {
      // The room let this player go without this page asking: they left in
      // another window, or were away so long that their place was given up.
      disconnect();
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      showLobby(WORDS.room.left);
      return;
    }
    renderStatus();
  });
  current.addEventListener("message", (event) => {
    if (socket !== current) return;
    // anything at all from the room says the connection lives, the answer to a ping included
    live = heard(live);
    if (event.data === PONG) return;
    const message = parseServerMessage(event.data);
    if (message === null) return;
    heardAt = Date.now();
    // the room is there and has nothing new: that it was heard from is all there is to it
    if (message.type === "alive") return;
    if (message.type === "lobby") {
      // The room is made: from here on a reconnect only comes back to it. A
      // second "make" would be refused as a stranger's once the room has let
      // this player's slot go.
      join = { ...join, create: false };
      history.replaceState(null, "", `${location.pathname}${location.search}#${code}`);
      if (typeof event.data === "string") lastLobby = event.data;
      staleSince = null;
      returning = false;
      renderRoom(code, message);
      if (keptTable) {
        // The room's word on its game comes right behind this one. A game put back from what was kept
        // that the room then says nothing of is one it no longer has: it is not left on the screen.
        setTimeout(() => {
          if (socket !== current || !keptTable) return;
          keptTable = false;
          gameOn = false;
          hideTable();
        }, config.deadAfterSeconds * 1000);
      }
      return;
    }
    if (message.type === "game") {
      // A game that is over is shown to its end only to those who watched it
      // end: someone arriving after it, or who has put its results away, is
      // in the waiting room.
      // a room made by a newer server may be playing a game this page has not heard of
      if (!isGameId(message.game)) return;
      keptTable = false;
      const over = message.view.phase === "ended";
      gameOn = !over;
      if (over && (table === null || dismissedGame === message.startedAt)) {
        keepAwake();
        return;
      }
      shownGame = message.startedAt;
      if (typeof event.data === "string") lastGame = event.data;
      showTable(message.game).update(message);
      keepAwake();
      return;
    }
    if (message.type === "refused") {
      // Something asked of the room was not accepted; the connection is fine.
      if (message.reason === "chat-too-fast") {
        chat.note({ kind: "too-fast" });
      } else if (message.reason === "voice-not-here") {
        // the room went on the list between the button being shown and pressed
        voice.leave();
        chat.note({ kind: "voice-not-here" });
      } else if (table !== null) {
        table.refused(message.reason);
      } else {
        hint = WORDS.refused[message.reason] ?? WORDS.refusedOther;
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
  setEntering(null);
  localStorage.setItem(storageKey("game"), chosenGame);
  localStorage.setItem(storageKey("listed"), chosenListed ? "1" : "0");
  connect(generateRoomCode(Math.random, config), true, nick, CREATE_ATTEMPTS - 1);
}

/** Enters the room `code`, from the list or from an address. */
function joinRoom(code: string): void {
  // pressed again on the way in: the first press stands, and the connection it opened is not thrown away for a new one
  if (entering === code && socket !== null) return;
  const nick = readNick();
  if (nick === null) return;
  connect(code, false, nick);
  setEntering(code);
  notice.textContent = WORDS.entry.entering;
  renderRooms();
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
// The games to pick from open and close at the same button; opened, the keyboard is on the game picked.
roomsPick.addEventListener("click", () => {
  const open = roomsGames.hidden !== false;
  showGamePicks(open);
  if (open) gamePicks.find((pick) => pick.game === listedGame)?.button.focus();
});
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

variantButton.addEventListener("click", () => {
  // each press moves to the next way the game can be played, round to the first
  const view = currentView;
  if (view === null || !isGameId(view.game)) return;
  const variants = GAMES[view.game].variants;
  if (variants.length === 0) return;
  const at = variants.findIndex((each) => each.id === view.variant);
  send({ type: "variant", variant: variants[(at + 1) % variants.length].id });
});

// Leaving a game hands the seat to the room, so it takes a second press: the
// button sits where a stray click lands.
leaveGameButton.addEventListener("click", () => {
  if (leaveArmed !== null) {
    disarmLeave();
    leaveRoom();
    return;
  }
  leaveGameButton.textContent = WORDS.game.leaveConfirm;
  // the longer words reach over where the voice controls sit beside the button: they give way meanwhile
  frame.classList.add("leaving");
  leaveArmed = setTimeout(disarmLeave, LEAVE_CONFIRM_MS);
});

copyButton.addEventListener("click", () => {
  const link = `${location.origin}${location.pathname}#${currentCode}`;
  const done = (text: string): void => {
    copyButton.textContent = text;
    setTimeout(() => {
      copyButton.textContent = WORDS.room.copy;
    }, 1500);
  };
  navigator.clipboard.writeText(link).then(
    () => done(WORDS.room.copied),
    () => {
      // no clipboard here (an old browser, or a page not served securely): the code is on screen to read out
      done(WORDS.room.copyFailed);
      hint = WORDS.room.copyFailedHint(currentCode);
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
    chat.note({ kind: voice.hasMic ? "voice-joined" : "voice-listen-only" });
  });
});
voiceMic.addEventListener("click", () => voice.setMuted(!voice.muted));

// Under a finger, during a game: the menu. The way out goes into it for good, and the voice controls
// while a game is on (`renderVoice`): over the game itself they are too small to be pressed.
if (TOUCH) menuList.insertBefore(leaveGameButton, menuClose);
menuOpen.addEventListener("click", () => openMenu(true));
menuClose.addEventListener("click", () => openMenu(false));
// a press beside the buttons puts the menu away, as one beside any sheet does
gameMenu.addEventListener("click", (event) => {
  if (event.target === gameMenu) openMenu(false);
});
menuRules.addEventListener("click", () => {
  openMenu(false);
  // the game's own sheet, as its H key opens it
  table?.press("KeyH");
});
menuSound.addEventListener("click", () => {
  setMuted(!isMuted());
  openMenu(true);
});
menuFull.addEventListener("click", () => {
  if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
  else fillScreen();
  openMenu(false);
});
// Upright, where the browser can fill the screen and turn the page: one press does what turning the phone would.
turnFull.hidden = !(TOUCH && document.fullscreenEnabled);
turnFull.addEventListener("click", fillScreen);

// Sound may only start at a press the browser counts as the player's own, and under a finger that is
// the finger lifting, not landing: a game's screen asks at the press, which a phone does not count.
// Asked from the waiting room on, so that the first sounds of a game are heard by whoever started it.
for (const type of ["pointerup", "touchend", "click"] as const) {
  addEventListener(type, () => {
    if (currentCode !== "") startAudio();
  });
}

// Under a finger a long press brings up the browser's own menu (copy, share, save the picture) over
// the game. A text box keeps it: that is where pasting is.
if (TOUCH) {
  frame.addEventListener("contextmenu", (event) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  });
}

// During a game: the tabs over the right-hand column, and T for the chat.
tabLog.addEventListener("click", () => openChat(false));
tabChat.addEventListener("click", () => openChat(true));
// A button pressed with the mouse keeps the focus, and the next Enter or Space meant for the game
// would press it again. The ones that lie over the game give the focus back; reached and pressed
// from the keyboard (no mouse: `detail` is 0) they keep it, and the key is theirs.
for (const button of [leaveGameButton, voiceToggle, voiceMic, tabLog, tabChat, menuOpen, menuRules, menuSound, menuFull, menuClose]) {
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
  const sheet = CLIENTS[game].sheet;
  const title = document.createElement("h2");
  title.textContent = sheet.title;
  const parts = sheet.parts.map((part) => {
    if (typeof part === "string") {
      const paragraph = document.createElement("p");
      paragraph.textContent = part;
      return paragraph;
    }
    const list = document.createElement("ul");
    for (const point of part) list.appendChild(document.createElement("li")).textContent = point;
    return list;
  });
  rulesSheet.replaceChildren(title, ...parts);
  rulesSheet.scrollTop = 0;
  rules.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rules.hidden = true;
});
addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!gameMenu.hidden) openMenu(false);
  else if (!rules.hidden) rules.hidden = true;
  else if (!newRoom.hidden) closeNewRoom();
  else if (!roomsGames.hidden) {
    showGamePicks(false);
    roomsPick.focus();
  }
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
// connection that has gone silent from one that is only quiet. The answer
// tells the page the same of the room: a network that drops closes nothing,
// and without it every press would go nowhere until the system gave up.
const LOOK_MS = 1000;
setInterval(() => {
  if (socket === null || !online) return;
  const looked = look(live, Date.now(), config);
  live = looked.state;
  if (looked.ping) socket.send(PING);
  if (looked.dead) revive();
}, LOOK_MS);

// Back at the front, or back on a network: a connection that is down is
// opened now instead of when its next try comes round, and one that looks up
// is asked whether it is.
function wake(): void {
  if (document.visibilityState !== "visible") return;
  if (socket !== null) {
    if (online) live = doubted(live, Date.now(), config);
    else if (socket.readyState === WebSocket.CLOSED) socket.reconnect();
  }
  if (listSocket !== null && listSocket.readyState === WebSocket.CLOSED) listSocket.reconnect();
}
addEventListener("online", wake);
document.addEventListener("visibilitychange", wake);
// the browser takes the screen's promise back when the page is hidden: asked for again when it is back
document.addEventListener("visibilitychange", keepAwake);
// leaving full screen by the browser's own way (a swipe, the back button) is told to the menu when it is next opened
document.addEventListener("fullscreenchange", () => {
  if (!gameMenu.hidden) openMenu(true);
});

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

/**
 * Keeps what the room last said, for the page that is loaded in this one's
 * place (a reload, or a tab the browser dropped and brings back) to show
 * while it is on its way back in: see {@link comeBack}. In the lobby there is
 * nothing to keep, and what was kept before is thrown away.
 */
function putAway(): void {
  // what this page shows is itself what was kept, the room not heard from yet: that is left as it is, with its age
  if (returning) return;
  try {
    if (currentCode === "" || lastLobby === null) sessionStorage.removeItem(storageKey("room"));
    else sessionStorage.setItem(storageKey("room"), keepRoom(currentCode, lastLobby, table !== null ? lastGame : null, staleSince ?? Date.now()));
  } catch {
    // a full or closed store only means a reload starts in the lobby and goes on to the room from there
  }
}
// a phone drops a tab that is not in front without telling it: what it would keep is kept when it is hidden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") putAway();
});

/**
 * Loaded again in the room the address names: puts the room back on the
 * screen as this tab last saw it, the game that was on show with it, and asks
 * the room to come back in. Until the room answers, which far from it is more
 * than a second, the waiting room says it is on its way back; then the room's
 * own word replaces what was kept. Says whether it did: with nothing kept of
 * that room (an invitation, a tab that was never in it, a place given up by
 * now) the page starts in the lobby as before.
 */
function comeBack(): boolean {
  const code = location.hash.slice(1).toUpperCase();
  const nick = normalizeNick(nickInput.value, config);
  if (nick === null || !isValidRoomCode(code, config)) return false;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(storageKey("room"));
  } catch {
    // a closed store: nothing was kept
  }
  // a room gives up the place of a player away for `awaySlotSeconds`: what is older than that is not this player's room
  const kept = keptRoom(stored, code, Date.now(), config.awaySlotSeconds);
  if (kept === null) return false;
  try {
    returning = true;
    staleSince = kept.at;
    renderRoom(code, kept.lobby);
    if (kept.game !== null && isGameId(kept.game.game)) {
      gameOn = kept.game.view.phase !== "ended";
      shownGame = kept.game.startedAt;
      keptTable = true;
      showTable(kept.game.game).update(kept.game);
      keepAwake();
    }
  } catch {
    // what a page of another version kept may not be what this one draws: the lobby, and on to the room from there
    return false;
  }
  codeInput.value = code;
  connect(code, false, nick);
  return true;
}

// A page the browser has moved away from may be kept, frozen, in case the
// player comes back to it: its connections would stay open and the room would
// go on showing someone who is not there. They are closed when the page is
// put away and opened again if it is brought back.
addEventListener("pagehide", () => {
  putAway();
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
// Loaded again in a room, the room is on the screen at once; anywhere else, the lobby.
if (!comeBack()) showLobby();
followAddress();
// Ready to be typed in at once where there are keys. Under a finger a box that takes the focus by
// itself brings the keyboard up over the list of rooms before anything has been read.
if (socket === null && !TOUCH) nickInput.focus();

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
import { backTrail, FIRST, isKnown } from "../shared/back";
import { BUILD, outOfDate } from "../shared/build";
import { newlyOpen, quickPicks, roomsShown, type RoomListing, type Watching } from "../shared/directory";
import { louder, titleFor, type Call } from "../shared/calling";
import { gradeOf, shownMs, withSample, type LatencyConfig } from "../shared/latency";
import type { StoredWord } from "../shared/feedback";
import { DEFAULT_GAME, GAMES, GAME_IDS, isGameId, type GameId } from "../shared/games";
import { playedAny, TOP_KIND } from "../shared/record";
import {
  gameHolds,
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
  parseFeedbackAnswer,
  parseInboxAnswer,
  parseNumbersAnswer,
  parseComingNote,
  parseWantingNote,
  parseServerMessage,
  parseWatchingNote,
  type ClientMessage,
  type DirectoryMessage,
  type DirectoryRequest,
  type RejectReason,
} from "../shared/protocol";
import { liftFor, placeFrame } from "../shared/frame";
import { INVITED_GAME_KEY, invitePath } from "../shared/site/paths";
import { doubted, givenUp, heard, look, opened, sent, type Liveness } from "../shared/liveness";
import { keepRoom, keptRoom } from "../shared/resume";
import { hearersOf, namesOf, teammatesOf, toggled, type ChatTo, type Hearer } from "../shared/aside";
import { QUICK_WORDS } from "../shared/chat";
import { suggestNick, type NickWords } from "../shared/nick";
import nickWordsJson from "../shared/nick-config.json";
import chatConfig from "../shared/chat-config.json";
import directoryConfig from "../shared/directory-config.json";
import meetConfig from "../shared/meet-config.json";
import numbersConfig from "../shared/numbers-config.json";
import { readDay, type DayNumbers } from "../shared/numbers";
import { wantRow, type WantRow, type Wanting } from "../shared/want";
import { meetNear, type Meet, type MeetConfig } from "../shared/meet";
import { comingTo, isWho, meetPress, newWho, type Coming } from "../shared/going";
import { afterRefusedMake } from "../shared/reopen";
import { calendarOf, type CalendarEvent } from "../shared/calendar";
import { firstDay, linkedOf, mayPlan, parseLinked, standing as appointmentStands, stepped, type AppointmentConfig } from "../shared/appointment";
import appointmentConfigJson from "../shared/appointment-config.json";
import { ORIGIN, SITE_NAME } from "../shared/site/words";
import { gameReader } from "../shared/parts";
import roomConfig from "../shared/room-config.json";
import voiceConfig from "../shared/voice-config.json";
import { createChat } from "./chat";
import { C } from "./game/palette";
import { buzz, isMuted, sfx, soundLevel, startAudio, stepSound } from "./game/sound";
import { CLIENTS, type GameScreen, type WaitingScene } from "./games";
import { OTHER_LANGS, lang, switchLang } from "./lang";
import { drawLobbyArt } from "./lobby-art";
import { knows, learn } from "./known";
import { pictureOf } from "./picture";
import { clearRecord, myRecord, noteFinish } from "./record";
import { storageKey } from "./storage";
import { TOUCH } from "./touch";
import { createVoice } from "./voice";
import { WORDS } from "./words";

const config: RoomConfig = roomConfig;
const nickWords: NickWords = nickWordsJson;

/** How far above the on-screen keyboard a box being typed in is kept, in CSS pixels. */
const KEYBOARD_MARGIN = 8;

/**
 * `?bots=1` asks the room to fill empty seats with bots. Only a room run for
 * development grants it; the deployed one refuses.
 */
const wantBots = new URLSearchParams(location.search).get("bots") === "1";
/** `?inbox` opens the lobby with the sheet on which whoever makes the game reads what players wrote about it, with a key. */
const wantInbox = new URLSearchParams(location.search).has("inbox");
/** `?numbers` opens it with the same sheet and the same key, to read the site's numbers by the day instead (`src/shared/numbers.ts`). */
const wantNumbers = new URLSearchParams(location.search).has("numbers");

/**
 * `?fakemic=1`, on a development host only, puts a tone in place of the
 * microphone, so two tabs of one browser can be seen to connect in voice
 * without the browser asking for a microphone.
 */
const fakeMic =
  new URLSearchParams(location.search).get("fakemic") === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

/** How many fresh codes to try when a newly made code is already in use. */
const CREATE_ATTEMPTS = 3;

/** How long a word about the game waits for the directory's answer before it is taken as not sent, in ms. */
const FEEDBACK_WAIT_MS = 10_000;

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
const readyButton = el<HTMLButtonElement>("ready");
const pingMark = el<HTMLElement>("ping");
const menuPing = el<HTMLElement>("menu-ping");
const soundButton = el<HTMLButtonElement>("sound");
const swapButton = el<HTMLButtonElement>("swap");
const swapSheet = el<HTMLElement>("swap-sheet");
const swapKnockout = el<HTMLButtonElement>("swap-knockout");
const quickSheet = el<HTMLElement>("quick-sheet");
const quickWords = el<HTMLElement>("quick-words");
const chatToButton = el<HTMLButtonElement>("chat-to");
const toSheet = el<HTMLElement>("to-sheet");
const toPeople = el<HTMLElement>("to-people");
const toHelp = el<HTMLElement>("to-help");
const whoSheet = el<HTMLElement>("who-sheet");
const whoName = el<HTMLElement>("who-name");
const whoHelp = el<HTMLElement>("who-help");
const whoHide = el<HTMLButtonElement>("who-hide");
const whoFlag = el<HTMLButtonElement>("who-flag");
const chatSend = el<HTMLButtonElement>("chat-send");
const joinButton = el<HTMLButtonElement>("join");
const createButton = el<HTMLButtonElement>("create");
const entrySub = el<HTMLElement>("entry-sub");
const swapChoices = el<HTMLElement>("swap-choices");
const swapNote = el<HTMLElement>("swap-note");
const seatMenu = el<HTMLElement>("seat-menu");
const seatName = el<HTMLElement>("seat-name");
const seatHost = el<HTMLButtonElement>("seat-host");
const seatKick = el<HTMLButtonElement>("seat-kick");
const copyButton = el<HTMLButtonElement>("copy");
const clockButton = el<HTMLButtonElement>("clock");
const variantButton = el<HTMLButtonElement>("variant");
const teamButton = el<HTMLButtonElement>("team");
const optionsOpen = el<HTMLButtonElement>("options-open");
const optionsSheet = el<HTMLElement>("options-sheet");
const optionsList = el<HTMLElement>("options-list");
const whenOpen = el<HTMLButtonElement>("when-open");
const whenSheet = el<HTMLElement>("when-sheet");
const whenDays = el<HTMLElement>("when-days");
const whenClock = el<HTMLElement>("when-clock");
const whenSays = el<HTMLElement>("when-says");
const whenCalendar = el<HTMLButtonElement>("when-calendar");
const whenCopy = el<HTMLButtonElement>("when-copy");
const appointmentConfig: AppointmentConfig = appointmentConfigJson;
/**
 * What the link that opened this page said of when the room's people meet
 * (`src/shared/appointment.ts`): the room's code, the moment, and the game
 * the link was for where it said. `null` where the link said no time, or one
 * that no longer stands.
 */
let appointment: { code: string; at: number; game: GameId | null } | null = null;
const chatBox = el<HTMLElement>("chat");
const chatInput = el<HTMLInputElement>("chat-input");
const voiceBox = el<HTMLElement>("voice");
const voiceMic = el<HTMLButtonElement>("voice-mic");
const voiceToggle = el<HTMLButtonElement>("voice-toggle");
const voiceSheet = el<HTMLElement>("voice-sheet");
const voiceAskOn = el<HTMLButtonElement>("voice-ask-on");
const voiceAskOff = el<HTMLButtonElement>("voice-ask-off");
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
const turnInvited = el<HTMLElement>("turn-invited");
const rulesSheet = el<HTMLElement>("rules-sheet");
const langButton = el<HTMLButtonElement>("lang");
const quickButton = el<HTMLButtonElement>("quick");
const tabShare = el<HTMLButtonElement>("tab-share");
const about = el<HTMLElement>("about");
const feedbackButton = el<HTMLButtonElement>("feedback");
const feedbackSheet = el<HTMLElement>("feedback-sheet");
const inboxSheet = el<HTMLElement>("inbox-sheet");
const inboxKey = el<HTMLInputElement>("inbox-key");
const inboxOpen = el<HTMLButtonElement>("inbox-open");
const inboxNote = el<HTMLElement>("inbox-note");
const inboxList = el<HTMLOListElement>("inbox-list");
const feedbackText = el<HTMLTextAreaElement>("feedback-text");
const feedbackNote = el<HTMLElement>("feedback-note");
const feedbackSend = el<HTMLButtonElement>("feedback-send");
const recordOpen = el<HTMLButtonElement>("record-open");
const recordSheet = el<HTMLElement>("record-sheet");
const recordList = el<HTMLUListElement>("record-list");
const tallyOpen = el<HTMLButtonElement>("tally-open");
const tallySheet = el<HTMLElement>("tally-sheet");
const tallyList = el<HTMLUListElement>("tally-list");
const recordClear = el<HTMLButtonElement>("record-clear");

/** What the page is called while no room is open. */
const SITE_TITLE = WORDS.site.tab;

/** The page's own title: the site, or the game and code of the room it is in. */
let ownTitle = SITE_TITLE;
/** What the title calls the player back for while the tab is behind others, or `null` (`calling.ts`). */
let calling: Call | null = null;
/** Whether the game on the table was waiting on this player when the room last spoke: a turn is called once, when it comes. */
let waited = false;

/** Writes the page's title: its own, or with what calls the player back at its head. */
function writeTitle(): void {
  document.title = titleFor(calling === null ? null : WORDS.call[calling], ownTitle);
}

/** Gives the page the title `title` for its own. */
function setTitle(title: string): void {
  ownTitle = title;
  writeTitle();
}

/**
 * Something happened that is this player's to see. With the tab in front it
 * is on the screen and nothing more is done. Behind others, the title says
 * so until the tab is looked at again, and a sound is made (if sound has
 * started and is not muted): the turn clock runs whether or not its player
 * is looking, and someone who has waited for a room to fill has usually
 * gone to another tab by the time it does.
 */
function call(what: Call): void {
  if (document.visibilityState === "visible") return;
  const before = calling;
  calling = louder(calling, what);
  writeTitle();
  // Sounded when the title has something new to say, and for every turn and every asking of the host, which
  // each have a clock running. Not for each line of a chat that goes on while the tab is away.
  if (calling !== before || what === "turn" || what === "host") sfx.call();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || calling === null) return;
  calling = null;
  writeTitle();
});

/** The words that stay as they are while the page is open, put where the markup leaves room for them. */
function writeWords(): void {
  setTitle(SITE_TITLE);
  document.querySelector('meta[name="description"]')?.setAttribute("content", WORDS.site.description);
  const said: [id: string, text: string][] = [
    ["rooms-title", WORDS.rooms.title],
    ["entry-title", WORDS.site.title],
    ["entry-sub", WORDS.entry.sub],
    ["nick-label", WORDS.entry.nick],
    ["create", WORDS.entry.create],
    ["quick", WORDS.entry.quick],
    ["tab-share", WORDS.game.share],
    ["version", WORDS.site.version(BUILD)],
    ["feedback", WORDS.site.feedback],
    ["feedback-title", WORDS.feedback.title],
    ["feedback-hint", WORDS.feedback.hint],
    ["feedback-close", WORDS.feedback.close],
    ["feedback-send", WORDS.feedback.send],
    ["record-open", WORDS.record.open],
    ["record-title", WORDS.record.title],
    ["record-hint", WORDS.record.hint],
    ["record-close", WORDS.record.close],
    ["voice-ask-title", WORDS.voice.ask.title],
    ["voice-ask-line", WORDS.voice.ask.line],
    ["voice-ask-hint", WORDS.voice.ask.hint],
    ["voice-ask-on", WORDS.voice.ask.on],
    ["voice-ask-off", WORDS.voice.ask.off],
    ["tally-open", WORDS.tally.open],
    ["tally-title", WORDS.tally.title],
    ["tally-hint", WORDS.tally.hint],
    ["tally-close", WORDS.tally.close],
    ["inbox-title", wantNumbers ? WORDS.numbers.title : WORDS.inbox.title],
    ["inbox-open", WORDS.inbox.open],
    ["inbox-close", WORDS.inbox.close],
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
    ["when-open", WORDS.when.open],
    ["when-title", WORDS.when.title],
    ["when-help", WORDS.when.help],
    ["when-close", WORDS.when.close],
    ["when-calendar", WORDS.when.calendar],
    ["when-copy", WORDS.when.copy],
    ["start", WORDS.room.start],
    ["ready", WORDS.room.ready],
    ["swap", WORDS.room.swap],
    ["swap-title", WORDS.swap.title],
    ["swap-hint", WORDS.swap.hint],
    ["swap-close", WORDS.swap.close],
    ["swap-knockout-help", WORDS.room.knockoutHelp],
    ["seat-host", WORDS.room.seatMenu.host],
    ["seat-kick", WORDS.room.seatMenu.kick],
    ["seat-close", WORDS.room.seatMenu.close],
    ["leave", WORDS.room.leave],
    ["rules-open", WORDS.bar.rules],
    ["rules-close", WORDS.bar.close],
    ["leave-game", WORDS.game.leave],
    ["tab-chat", WORDS.game.chat(0)],
    ["quick-title", WORDS.chat.quickTitle],
    ["quick-help", WORDS.chat.quickHelp],
    ["quick-close", WORDS.chat.quickClose],
    ["to-title", WORDS.chat.toTitle],
    ["to-help", WORDS.chat.toHelp],
    ["to-close", WORDS.chat.toClose],
    ["who-close", WORDS.chat.who.close],
    ["options-open", WORDS.room.options],
    ["options-title", WORDS.room.optionsTitle],
    ["options-close", WORDS.room.optionsClose],
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
  inboxKey.placeholder = WORDS.inbox.key;
  inboxKey.setAttribute("aria-label", WORDS.inbox.key);
  quickButton.title = WORDS.entry.quickHint;
  tabShare.title = WORDS.game.shareHint;
  tabShare.setAttribute("aria-label", WORDS.game.shareHint);
  feedbackText.setAttribute("aria-label", WORDS.feedback.box);
  feedbackText.maxLength = directoryConfig.feedback.maxLength;
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

/** Whether `target` is a box that is typed in: a line of one, or the larger one a word about the game is written in. */
function isBox(target: unknown): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

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
  const typing = TOUCH && isBox(document.activeElement) && innerWidth === fitted.width;
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
  if (TOUCH && seen != null && isBox(box) && frame.contains(box)) {
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
    if (!isBox(document.activeElement)) scrollTo(0, 0);
  });
}

/** The connection to the room this page is in or is entering. */
let socket: PartySocket | null = null;
/** The connection to the list of rooms, while the lobby is on show. */
let listSocket: PartySocket | null = null;
/** Since when the connection to the room has been down, in ms; `null` while it is up or there is none. */
let roomDown: number | null = null;
/** The same of the connection to the list of rooms. */
let listDown: number | null = null;
/** The room this page has asked to enter and has not heard back from; `null` when there is none. */
let entering: string | null = null;
/**
 * A connection opened ahead to the room whose row the pointer or the keyboard
 * is on, or to the room about to be made while its form is on show, so that
 * a press finds it open (`warmUp`). Nothing is sent on it: to the room it is
 * nobody until `connect` takes it and joins.
 */
let warm: { code: string; socket: PartySocket; since: number } | null = null;
/**
 * The room last opened ahead with nothing pointing at one (`warmRest`), `null` for none: the list is drawn
 * again often, and asks for a room once when it becomes the likeliest, not at every drawing.
 */
let restCode: string | null = null;
/**
 * The code the next room will be made under, picked when the form for a new
 * room opens and not at the press that makes it: the connection to it can
 * then be opened while the player is choosing a game. `null` with no form open.
 */
let nextCode: string | null = null;
/** The wait before a connection is opened ahead, while one is running. */
let warming: ReturnType<typeof setTimeout> | null = null;
/**
 * What this page has asked the room to change in the waiting room and the
 * room has not shown yet. The buttons say these at once and the next press
 * goes on from them: the room's answer is a moment away, and a button that
 * stays as it was until then reads as a press not taken.
 */
let asked: { listed?: boolean; turnSeconds?: number; variant?: string; team?: number; ready?: boolean } = {};
/** When this player last pressed or typed anything on the page: how the page knows, asked by the room, that its host is there. */
let lastInputAt = Date.now();
/** Whether the room has asked if the host is there and the page could not say so by itself: the next press answers. */
let hostAsked = false;
/** The slot of the player the host's menu is open for, or `null` with the menu shut; and whether sending them out has had its first press. */
let seatShown: number | null = null;
let kickArmed = false;
/** The slot whose row in the list of who is here the menu was opened from with the keyboard, or `null`: where the keys go back to when it shuts. */
let seatFromRow: number | null = null;
/** The slots of players the room said the host sent out, until the room is next sent without them. */
const sentOut = new Set<number>();
/** Whether the room has just said who won its 탈락전: the lobby after it, with everyone in again, needs no line of its own. */
let wonJust = false;
/** Whether the host has pressed start and the game is not on the screen yet. */
let startAsked = false;
/** Whether a room is being made: asked for, and not there yet. */
let creating = false;
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
/** When the ping not yet answered went, by the page's own clock, or `null` with none on its way. */
let pingSentAt: number | null = null;
/** The latest times the room took to answer a ping, there and back, in ms (`latency.ts`). */
let pingTimes: number[] = [];
/** Whether the game on show is still being played. */
let gameOn = false;
/** The slot of the one player the chat's next line is said to, or `null` when it is said to everyone. */
let chatTo: ChatTo = { kind: "all" };
/** Whether a press of the button that forgets the player's record does so: the press before it only asked. */
let clearArmed = false;
/** The other players whose lines this player covered on their own screen, in the room the page is in: each by slot and name (`personKey`). Kept for the tab, by room. */
let hiddenPeople = new Set<string>();
/** Those this player pointed out from this room, the same way: the room takes one of each, so the button says it was done. */
const flaggedPeople = new Set<string>();
/** The player the sheet of what can be done about another is open for, and the element the keys go back to when it shuts; `null` with it shut. */
let whoShown: { slot: number; nick: string; from: HTMLElement } | null = null;
/** Whether pointing them out has had its first press. */
let flagArmed = false;
/** Whether the site keeps what players tell whoever runs it, as the list of rooms last said: where it does not, nobody is offered to point anyone out. Kept for the tab, so a reload in a room still knows. */
let takesWords = sessionStorage.getItem(storageKey("takes-words")) === "1";
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

/** The rooms a quick join has yet to try, best first, while one is on its way in; `null` when none is. */
let quickRest: string[] | null = null;
/** The build the server last said it is, where that is another than this page's and the page is to be loaded again for it. */
let newerBuild: string | null = null;

/** The wait for the directory's answer to a word about the game, while one has been sent and not answered. */
let feedbackWait: ReturnType<typeof setTimeout> | null = null;
/** The wait for the directory's answer to a request for the inbox, while one is on its way. */
let inboxWait: ReturnType<typeof setTimeout> | null = null;
/** Whether the inbox asked for with `?inbox` has been put on show: once, when the lobby first is. */
let inboxShown = false;

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
  pingSentAt = null;
  renderPing();
  // whatever the game screen had asked for and not heard back about is not coming
  table?.lost();
  chat.lost();
  unask();
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
  // the question before voice is first turned on has nothing left to ask once it is on, or is not to be had here
  if (!offered || voice.on) showVoiceAsk(false);
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
  { log: el<HTMLOListElement>("chat-log"), form: el<HTMLFormElement>("chat-form"), input: chatInput, button: chatSend },
  {
    maxLength: chatConfig.maxLength,
    storagePrefix: storageKey("chat"),
    labels: { send: WORDS.chat.send, quick: WORDS.chat.quickOpen },
    quickAsked: () => showQuick(quickSheet.hidden === true),
    send: (text) => {
      const people = toPeopleNow();
      if (people === null) return send({ type: "chat", text });
      // a line meant for some is never said to everyone because they have gone
      return people.length > 0 && send({ type: "chat", text, to: people.map((person) => person.slot) });
    },
    to: () => toNames(),
    sendQuick: (word) => send({ type: "quick", word }),
    quickOf: (word) => WORDS.chat.quick[word],
    me: () => currentView?.players.find((p) => p.slot === currentView?.you)?.nick ?? "",
    wordsOf(note) {
      if (note.kind === "came") return WORDS.room.came(note.nick);
      if (note.kind === "went") return WORDS.room.went(note.nick);
      if (note.kind === "kicked") return WORDS.room.sentOut(note.nick);
      if (note.kind === "first-time") return WORDS.room.firstTime;
      if (note.kind === "pieces") return WORDS.room.wonPieces(note.nick, note.won, note.all);
      if (note.kind === "out") return WORDS.room.knockedOut(note.nick);
      if (note.kind === "champion") return WORDS.room.champion(note.nick);
      if (note.kind === "top") return WORDS.room.tops(note.nick);
      if (note.kind === "knockout-on") return WORDS.room.knockoutTurnedOn;
      if (note.kind === "knockout-off") return WORDS.room.knockoutTurnedOff;
      if (note.kind === "knockout-again") return WORDS.room.knockoutAgain;
      if (note.kind === "to-gone") return WORDS.chat.toGone;
      if (note.kind === "to-left") return WORDS.chat.toLeft;
      if (note.kind === "when") return WORDS.when.note(whenOf(note.at));
      if (note.kind === "when-made") return WORDS.when.made(whenOf(note.at));
      if (note.kind === "host") return WORDS.room.becameHost(note.nick);
      if (note.kind === "game") return WORDS.room.gameChanged(isGameId(note.game) ? GAMES[note.game].title[lang] : WORDS.room.newGame);
      if (note.kind === "not-sent") return WORDS.chat.notSent;
      if (note.kind === "too-fast") return WORDS.chat.tooFast;
      if (note.kind === "hid") return WORDS.chat.who.hid(note.nick);
      if (note.kind === "shown") return WORDS.chat.who.shown(note.nick);
      if (note.kind === "flagged") return WORDS.chat.who.flaggedNote(note.nick);
      if (note.kind === "voice-joined") return WORDS.voice.joined;
      if (note.kind === "voice-listen-only") return WORDS.voice.listenOnly;
      return WORDS.voice.notHere;
    },
    hidden: (from, who) => hiddenPeople.has(personKey(from, who)),
    hiddenLine: WORDS.chat.who.hiddenLine,
    nameLabel: (who) => WORDS.chat.who.label(who),
    picked: (from, who, at) => showWho({ slot: from, nick: who, from: at }),
    wholeLine: TOUCH,
  },
);

/** How a player is named among those whose lines are covered: by their slot and the name they go by, so that whoever next takes the slot is not covered with them. */
function personKey(slot: number, nick: string): string {
  return `${slot}:${nick}`;
}

/** Reads whose lines this tab covered in the room `code`. */
function openHidden(code: string): void {
  hiddenPeople = new Set();
  flaggedPeople.clear();
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(`${storageKey("hidden")}.${code}`) ?? "[]");
    if (Array.isArray(stored)) hiddenPeople = new Set(stored.filter((key): key is string => typeof key === "string"));
  } catch {
    hiddenPeople = new Set();
  }
}

/** Covers what the player says on this screen, or uncovers it: their lines in the chat, their words over their seat, and their voice. */
function setHidden(slot: number, nick: string, hidden: boolean): void {
  const key = personKey(slot, nick);
  if (hidden) hiddenPeople.add(key);
  else hiddenPeople.delete(key);
  if (currentCode !== "") {
    try {
      sessionStorage.setItem(`${storageKey("hidden")}.${currentCode}`, JSON.stringify([...hiddenPeople]));
    } catch {
      // a full or closed store only means a reload uncovers them
    }
  }
  voice.quiet(slot, hidden);
  chat.redraw();
  chat.note({ kind: hidden ? "hid" : "shown", nick });
}

/**
 * Shows what this player can do about another, whose name they pressed in
 * the chat, or with `null` puts it away. The keys go to its first button,
 * and back to the name they came from if it is still there.
 */
function showWho(person: { slot: number; nick: string; from: HTMLElement } | null): void {
  flagArmed = false;
  if (person === null || currentView === null || person.slot === currentView.you) {
    const was = whoShown;
    whoShown = null;
    if (whoSheet.hidden) return;
    const within = whoSheet.contains(document.activeElement);
    whoSheet.hidden = true;
    if (!within) return;
    if (was !== null && was.from.isConnected) was.from.focus({ preventScroll: true });
    else if (table !== null && !chatOpen) (document.activeElement as HTMLElement | null)?.blur();
    else if (!TOUCH) chat.focus();
    return;
  }
  // one sheet over the chat at a time
  showQuick(false);
  showTo(false);
  whoShown = person;
  whoName.textContent = person.nick;
  syncWho();
  whoSheet.hidden = false;
  whoHide.focus({ preventScroll: true });
}

/** The sheet's words as things now stand: whether their lines are covered, and whether they have been pointed out. */
function syncWho(): void {
  if (whoShown === null) return;
  const key = personKey(whoShown.slot, whoShown.nick);
  // someone who has gone can still be covered and uncovered (their lines are still here), and no longer pointed out: the room would not know them
  const here = currentView?.players.some((p) => p.slot === whoShown?.slot && p.nick === whoShown.nick) === true;
  const flagged = flaggedPeople.has(key);
  whoHelp.textContent = takesWords && here ? `${WORDS.chat.who.help} ${WORDS.chat.who.helpFlag}` : WORDS.chat.who.help;
  whoHide.textContent = hiddenPeople.has(key) ? WORDS.chat.who.unhide : WORDS.chat.who.hide;
  whoFlag.hidden = !takesWords || !here;
  whoFlag.disabled = flagged;
  whoFlag.textContent = flagged ? WORDS.chat.who.flagged : flagArmed ? WORDS.chat.who.flagConfirm : WORDS.chat.who.flag;
}

whoHide.addEventListener("click", () => {
  const person = whoShown;
  if (person === null) return;
  showWho(null);
  setHidden(person.slot, person.nick, !hiddenPeople.has(personKey(person.slot, person.nick)));
});
whoFlag.addEventListener("click", () => {
  const person = whoShown;
  if (person === null) return;
  // twice, as sending someone out is: nobody is pointed out by a slip
  if (!flagArmed) {
    flagArmed = true;
    return syncWho();
  }
  const sent = send({ type: "flag", slot: person.slot, lines: chat.linesOf(person.slot, person.nick, chatConfig.flag.lines) });
  if (sent) flaggedPeople.add(personKey(person.slot, person.nick));
  showWho(null);
  chat.note(sent ? { kind: "flagged", nick: person.nick } : { kind: "not-sent" });
});
el<HTMLButtonElement>("who-close").addEventListener("click", () => showWho(null));

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
  syncShare();
  // an hour in a tab, the chat comes back at its last line
  if (!chatBox.hidden) chat.toEnd();
}

/** Beside the tabs: the result of a game that is over, to pass on, for whoever played it. Not there while one is played, nor for someone who watched. */
function syncShare(): void {
  tabShare.hidden = table === null || gameOn || table.verdict() === null;
}

/** During a game: shows the chat or the moves in the right-hand column. */
function openChat(open: boolean): void {
  chatOpen = open;
  if (open) unread = 0;
  // the words said with one press belong to the chat: they do not stay up over the moves
  else showQuick(false);
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
  renderPing();
  menuOpen.setAttribute("aria-expanded", String(show));
  if (!show) {
    disarmLeave();
    return;
  }
  renderSound();
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

/** In the lobby's bar: the other language, where to send a word about the game, and which build the page is. */
function showLobbyLinks(shown: boolean): void {
  langButton.hidden = !shown;
  about.hidden = !shown;
  // the sheet for a word about the game belongs to the lobby, and goes with it; so does the inbox
  if (!shown) showFeedback(false);
  if (!shown) showRecord(false);
  if (!shown) showInbox(false);
  else if ((wantInbox || wantNumbers) && !inboxShown) {
    inboxShown = true;
    showInbox(true);
  }
}

/** The game whose rules the bar's button opens: the one being waited for, or the one chosen for a new room. */
function rulesGame(): GameId {
  return currentView !== null && isGameId(currentView.game) ? currentView.game : chosenGame;
}

/** Lights the button for the rules while they are those of a game this player has not played here, nor read the rules of. */
function lightRules(): void {
  rulesOpen.classList.toggle("primary", !knows(rulesGame()));
}

/**
 * Says in the room's chat where the rules are, to a player who has not
 * played the room's game in this browser: a room is where there is time to
 * read them.
 */
function tipRules(game: string): void {
  if (isGameId(game) && !knows(game)) chat.note({ kind: "first-time" });
}

/** The words under the scene, and whether the rules can be opened from there. */
function setBar(first: string, second: string, withRules: boolean): void {
  lobbyBarShown = false;
  bar1.textContent = first;
  bar2.textContent = second;
  rulesOpen.hidden = !withRules;
  lightRules();
}

/**
 * The lobby's line under the frame. While others are looking at the list
 * too, it says how many: two people each waiting for a room to appear do not
 * know of each other otherwise, and neither makes one. With nobody else it
 * says nothing: what to do is said once, over the form.
 */
function lobbyBar(): void {
  const others = watching === null ? 0 : watching.count - 1;
  setBar(others >= 1 && watching !== null ? WORDS.bar.others(others, watching.more) : "", "", false);
  lobbyBarShown = true;
}

/** The picture of the room runs only while it can be seen: in a room, with no game over it. */
function syncScene(): void {
  const seen = currentCode !== "" && table === null;
  // the link for an invitation that says when is the waiting room's, on its bar
  whenOpen.hidden = !seen;
  if (!seen) showWhen(false);
  sceneCanvas.hidden = currentCode === "";
  scene?.setRunning(seen);
  renderSound();
}

/**
 * Says how loud the sound is on the two buttons that change it: the one over
 * the room's picture, there while the picture is, and the one in a game's
 * menu. A key in a game mutes it too (M), so both are written anew whenever
 * they come into view.
 */
function renderSound(): void {
  const level = soundLevel();
  soundButton.hidden = !(currentCode !== "" && table === null);
  for (const button of [soundButton, menuSound]) {
    button.textContent = WORDS.menu.sound[level] ?? WORDS.menu.sound[0];
    button.title = WORDS.menu.soundHelp;
    button.setAttribute("aria-pressed", String(!isMuted()));
  }
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
  showOptions(false);
  // the room's tally is the waiting room's: a game that starts is not played under it
  showTally(false);
  // the game asked for is here: the button under it is the start button again
  if (startAsked) unask();
  showSeatMenu(null);
  showSwap(false);
  if (table !== null && tableGame !== game) {
    table.destroy();
    table = null;
    crowded = false;
    frame.classList.remove("covered");
  }
  if (table === null) {
    tableGame = game;
    // a game has come over the room: what was open over the room is put away
    showQuick(false);
    // the game covers the room's picture, and the time in its corner with it
    pingMark.hidden = true;
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
      first: (myRecord().games[game]?.played ?? 0) === 0,
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
  // put away while the game is still there to take the keys back
  showQuick(false);
  table?.destroy();
  table = null;
  waited = false;
  renderPing();
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
  // no game is on the screen any more: a page behind the server's build may load itself again now
  loadNewer();
}

/**
 * The server said which build it is. A page of another build loads itself
 * again as soon as nothing is lost by it (`loadNewer`): a deploy cut it off,
 * and it came back to rooms run by newer code than its own.
 */
function heardBuild(servers: unknown): void {
  let reloadedFrom: string | null = null;
  try {
    reloadedFrom = sessionStorage.getItem(storageKey("reloaded-from"));
  } catch {
    // a closed store: the page was not loaded again, as far as it knows
  }
  newerBuild = outOfDate(BUILD, servers, reloadedFrom) ? String(servers) : null;
  loadNewer();
}

/**
 * Loads the page again for a newer build, unless that would take something
 * from the player: a game on the screen, its results, the voice chat, a room
 * on its way, or words typed and not sent. A page in a room comes back to
 * it, as after any reload (`comeBack`). Asked again whenever one of those
 * may have ended.
 */
function loadNewer(): void {
  if (newerBuild === null) return;
  if (table !== null || voice.on || creating || entering !== null || startAsked) return;
  // in the lobby: a code typed in, or a nickname other than the one kept, which a reload would put back
  const typedInLobby = currentCode === "" && (codeInput.value.trim() !== "" || nickInput.value !== (localStorage.getItem(storageKey("nick")) ?? suggestedNick));
  if (chatInput.value !== "" || typedInLobby || !newRoom.hidden || feedbackText.value !== "" || feedbackWait !== null) return;
  // whoever is reading the inbox is not sent back to its key
  if (!inboxSheet.hidden) return;
  try {
    // noted first: a page that comes back the same is not loaded a second time (`outOfDate`)
    sessionStorage.setItem(storageKey("reloaded-from"), BUILD);
  } catch {
    // with nowhere to note it the page could load itself without end: it stays as it is
    return;
  }
  newerBuild = null;
  location.reload();
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
/** How many are looking at the list of rooms, this page among them, as the directory last said; `null` before it has, and while the list is not connected. */
let watching: Watching | null = null;
/** Whether the bar under the frame is the lobby's own (`lobbyBar`), and not a game's or a room's. */
let lobbyBarShown = false;

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
  // a hand is for the game being looked at: looking at another takes it down
  if (myWant !== null && myWant !== game) sayWant(null);
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

/** The row over the rooms that says when people are asked to gather. */
const meetButton = el<HTMLButtonElement>("meet");
/** On the lobby's last line, for someone who said they will come: puts the meeting in their calendar. */
const calendarButton = el<HTMLButtonElement>("calendar");
calendarButton.textContent = WORDS.meet.calendar;
/** How often that row is written again while the lobby is on show, in ms: it counts the minutes down. */
const MEET_EVERY_MS = 20_000;

/** How many the directory last said are coming to a meeting (`src/shared/going.ts`); `null` before it has, and while the list is not connected. */
let coming: Coming | null = null;

/** Reads what this browser keeps under `name`, or `null` where it keeps nothing or may not be asked. */
function kept(name: string): string | null {
  try {
    return localStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

/** Keeps `value` in this browser under `name`, or with `null` keeps it no longer. Where the browser keeps nothing, the page goes on without. */
function keep(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), value);
  } catch {
    // a browser that keeps nothing: the word is still given, and forgotten with the page
  }
}

/** The start of the meeting this browser said it will come to, or `null`: kept in the browser, since it is said hours before. */
let myGoing: number | null = ((): number | null => {
  const start = Number(kept("going") ?? "");
  return Number.isSafeInteger(start) && start > 0 ? start : null;
})();

/** The number this browser is known by where it says it will come, made the first time it does and kept. */
function goingWho(): string {
  const had = kept("going-who");
  if (isWho(had)) return had;
  const who = newWho((bytes) => crypto.getRandomValues(bytes));
  keep("going-who", who);
  return who;
}

/**
 * Tells the directory that this browser will come to the meeting that starts
 * at `meet`, or with `on` false takes that back, and keeps which it is. Over
 * a connection that is not open nothing is sent: it is said when one opens
 * (`watchRooms`).
 */
function sayGoing(meet: number, on: boolean): void {
  myGoing = on ? meet : null;
  keep("going", on ? String(meet) : null);
  if (listSocket === null || listSocket.readyState !== WebSocket.OPEN) return;
  const request: DirectoryRequest = { type: "going", meet, who: goingWho(), on };
  listSocket.send(JSON.stringify(request));
}

/**
 * Says over the rooms, in one line, when the next gathering is and for which
 * game, in the reader's own time, or that one is on. Nothing where none is
 * set. The day is not named: how long until then says it. Once anyone has
 * said they will come, how many have is said where the wait was (the hour
 * is still on the left), and the line is lit for a reader who is one of
 * them.
 */
function renderMeet(): void {
  const now = Date.now();
  const meet = meetNear(now, meetConfig);
  meetButton.hidden = meet === null;
  syncCalendar();
  if (meet === null) return;
  const timeOf = (at: number): string => new Date(at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const minutes = Math.max(1, Math.ceil((meet.start - now) / 60_000));
  const [title, when] = [...meetButton.children];
  const game = GAMES[meet.game].title[lang];
  // while it is on, what matters is the rooms there are now: who said they would come is not said
  const said = meet.on ? null : comingTo(meet, coming, myGoing);
  title.textContent = meet.on ? WORDS.meet.now(game) : WORDS.meet.title(timeOf(meet.start), game);
  when.textContent = meet.on
    ? WORDS.meet.until(timeOf(meet.end))
    : said !== null
      ? WORDS.meet.coming(said.count, said.more, said.mine)
      : WORDS.meet.inTime(Math.floor(minutes / 60), minutes % 60);
  meetButton.classList.toggle("on", meet.on);
  meetButton.classList.toggle("up", said?.mine === true);
  // a press before the hour says "I'll come", or takes it back: said to a screen reader as a button that is pressed or not
  if (meet.on) meetButton.removeAttribute("aria-pressed");
  else meetButton.setAttribute("aria-pressed", String(said?.mine === true));
  meetButton.dataset.game = meet.game;
}

/** The row under it: a hand raised for a game, and how many are up (`src/shared/want.ts`). */
const wantButton = el<HTMLButtonElement>("want");
/** How many hands the directory last said are up for each game. */
let wanting: Wanting = {};
/** The game this player's hand is up for; `null` while it is down. One hand, and it is this connection's: the directory forgets it when the lobby is left. */
let myWant: GameId | null = null;
/** What the row last said, to tell when it comes to say there are enough: that is what a tab behind others is called back for. */
let wantKind: WantRow["kind"] | null = null;

/** What the row says and does now. */
function wantNow(): WantRow {
  const rooms = roomsSent?.rooms ?? [];
  return wantRow(listedGame, myWant, wanting, (game) => quickPicks(rooms.filter((room) => room.game === game))[0] ?? null);
}

/** Tells the directory this player's hand is up for `game`, or down, over the connection the lobby has to it. */
function sayWant(game: GameId | null): void {
  myWant = game;
  if (listSocket === null || listSocket.readyState !== WebSocket.OPEN) return;
  const request: DirectoryRequest = { type: "want", game };
  listSocket.send(JSON.stringify(request));
}

/** Writes the row of hands: what it says goes by what is listed, whose hand is up, and how many are. */
function renderWant(): void {
  const row = wantNow();
  const nameOf = (game: GameId): string => GAMES[game].title[lang];
  const [said, count] = ((): [string, string] => {
    switch (row.kind) {
      case "pick":
        return ["", ""];
      case "others":
        return [WORDS.want.others(nameOf(row.game)), WORDS.want.othersCount(row.count)];
      case "offer":
        return [WORDS.want.offer(nameOf(row.game)), WORDS.want.offerCount(row.count)];
      case "raised":
        return [WORDS.want.raised(row.need - row.count), WORDS.want.raisedCount(row.count, row.need)];
      case "gathered":
        return [WORDS.want.gathered(row.count), ""];
      case "open":
        return [WORDS.want.open, ""];
    }
  })();
  const [left, right] = [...wantButton.children];
  left.textContent = said;
  right.textContent = count;
  // With every game listed and no hand up anywhere the line has nothing to say, and says nothing: the lobby
  // already has the meeting and the list to read. It is there once a game is picked, or a hand is up for one.
  wantButton.hidden = row.kind === "pick";
  wantButton.classList.toggle("up", myWant !== null);
  wantButton.classList.toggle("on", row.kind === "gathered" || row.kind === "open");
  // enough hands are up now, and were not: whoever raised theirs has likely gone to another tab to wait
  if (row.kind === "gathered" && wantKind !== "gathered") call("gathered");
  wantKind = row.kind;
}

wantButton.addEventListener("click", () => {
  const row = wantNow();
  if (row.kind === "pick") return;
  if (row.kind === "others") return pickGame(row.game);
  if (row.kind === "offer") sayWant(row.game);
  else if (row.kind === "raised") sayWant(null);
  else if (row.kind === "open") return joinRoom(row.code);
  else {
    // enough are here: this player opens the room the others are waiting for, a public one of that game
    chosenGame = row.game;
    chosenListed = true;
    return createRoom();
  }
  renderWant();
});

/** How long before a meeting a calendar reminds whoever put it there, in minutes, where the meetings' settings do not say. */
const REMIND_MINUTES = 10;

// Gives the meeting this player said they will come to as a file a calendar takes (`src/shared/calendar.ts`): the
// browser saves it or hands it to the calendar, and the calendar does the reminding.
calendarButton.addEventListener("click", () => {
  const offer = calendarOffer(Date.now());
  if (offer === null) return;
  if (offer.kind === "appointment") return saveAppointment(offer.code, offer.at, offer.game);
  const meet = offer.meet;
  saveCalendar({
    uid: `meet-${meet.start}@${new URL(ORIGIN).host}`,
    stamp: Date.now(),
    start: meet.start,
    end: meet.end,
    summary: WORDS.meet.event(GAMES[meet.game].title[lang], SITE_NAME),
    url: `${ORIGIN}/`,
    remindMinutes: (meetConfig as MeetConfig).remindMinutes ?? REMIND_MINUTES,
  });
});

/** Hands `event` to the browser as a file a calendar takes: it saves it or gives it to the calendar. */
function saveCalendar(event: CalendarEvent): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([calendarOf(event)], { type: "text/calendar;charset=utf-8" }));
  link.download = `${SITE_NAME}-meet.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  // the browser has the file by the time this runs: the address made for it is given back
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

/**
 * What the calendar link on the lobby's last line is for, if anything: the
 * time a link to a room said its people meet, while that is still to come
 * and the link has not been let go of (the room it led to may have closed:
 * it is then opened again under the same code, `reopenCode`); else the
 * lobby's meeting, for someone who said they will come.
 */
function calendarOffer(now: number): { kind: "appointment"; code: string; at: number; game: GameId | null } | { kind: "meet"; meet: Meet } | null {
  if (appointment !== null && (appointment.code === invitedCode || appointment.code === reopenCode) && mayPlan(appointment.at, now) && appointmentStands(appointment.at, now, appointmentConfig) !== null) {
    return { kind: "appointment", ...appointment };
  }
  const meet = meetNear(now, meetConfig);
  return meet !== null && !meet.on && myGoing === meet.start ? { kind: "meet", meet } : null;
}

/** Shows the calendar link while there is something to put in a calendar. */
function syncCalendar(): void {
  calendarButton.hidden = calendarOffer(Date.now()) === null;
}

// A press opens the meeting: it lists the rooms of the game people gather for (where they are, or where one is to
// be made) and, before the hour, says that this player will come. The next press closes it: every game's rooms
// again, and the word taken back (`meetPress`).
meetButton.addEventListener("click", () => {
  const meet = meetNear(Date.now(), meetConfig);
  if (meet === null) return;
  const press = meetPress(meet, listedGame, myGoing);
  if (press.going !== null) sayGoing(meet.start, press.going);
  pickGame(press.list);
  // picking a game leaves the keyboard on the games to pick from: the press was on this line, and the next one is too
  meetButton.focus({ preventScroll: true });
  renderMeet();
});
setInterval(() => {
  if (listSocket !== null) renderMeet();
}, MEET_EVERY_MS);

/** Draws the list of rooms as last sent, for the game picked. */
function renderRooms(): void {
  renderMeet();
  renderWant();
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
  // said that no room was waiting, and now one is: the form no longer says so
  if (notice.textContent === WORDS.entry.noneWaiting && quickPicks(known).length > 0) notice.textContent = "";
  // Under a finger nothing says which row is about to be pressed: the likeliest room is opened ahead, once for each
  // room that comes to be the likeliest. (A mouse says it by being over a row, and is left alone here.)
  if (TOUCH && likelyRoom() !== restCode) warmRest();
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
  listDown = null;
  current.addEventListener("open", () => {
    if (listSocket === current) listDown = null;
    // every connection starts with the rooms of every game, a reconnection too: the game picked is asked for again
    if (listSocket === current && listedGame !== null) askForGame();
    // and so is a hand that was up: a new connection has none
    if (listSocket === current && myWant !== null) sayWant(myWant);
    // a word given for the next meeting is said again, in case it was given while no connection was open: the directory counts it once
    const near = meetNear(Date.now(), meetConfig);
    if (listSocket === current && near !== null && myGoing === near.start) sayGoing(near.start, true);
  });
  current.addEventListener("message", (event) => {
    if (listSocket !== current) return;
    const answer = parseFeedbackAnswer(event.data);
    if (answer !== null) return feedbackAnswered(answer.sent);
    const inbox = parseInboxAnswer(event.data);
    if (inbox !== null) return inboxAnswered(inbox.words);
    const counted = parseNumbersAnswer(event.data);
    if (counted !== null) return numbersAnswered(counted.days);
    const hands = parseWantingNote(event.data);
    if (hands !== null) {
      wanting = hands.games;
      renderWant();
      return;
    }
    const guests = parseComingNote(event.data);
    if (guests !== null) {
      coming = guests;
      renderMeet();
      return;
    }
    const note = parseWatchingNote(event.data);
    if (note !== null) {
      watching = note;
      if (lobbyBarShown) lobbyBar();
      return;
    }
    const message = parseDirectoryMessage(event.data);
    if (message === null) return;
    // A room that was not on the list before and can be joined is what someone left waiting in the lobby is
    // waiting for: a tab behind others says so in its title. Not a room on a list of another game than the
    // one before: after a reconnection the rooms of every game come first and those of the game picked
    // after, with rooms the first had no place for.
    if (newlyOpen(roomsSent, message).length > 0) call("room");
    roomsSent = message;
    renderRooms();
    // a word about the game is offered only where the server keeps them for someone to read
    feedbackButton.hidden = message.feedback !== true;
    takesWords = message.feedback === true;
    try {
      sessionStorage.setItem(storageKey("takes-words"), takesWords ? "1" : "0");
    } catch {
      // a full or closed store only means a reload in a room offers no pointing out
    }
    heardBuild(message.build);
  });
  current.addEventListener("close", () => {
    // PartySocket reconnects by itself; until then the list on show may be out of date
    if (listSocket !== current) return;
    listDown ??= Date.now();
    roomsSent = null;
    watching = null;
    wanting = {};
    coming = null;
    if (lobbyBarShown) lobbyBar();
    renderRooms();
    // a word sent on the connection that dropped is not going to be answered
    if (feedbackWait !== null) feedbackAnswered(false);
  });
}

// ---- The player's own record --------------------------------------------------------------------

/** Offers the record in the lobby once there is a game in it: someone who has played nothing is not shown an empty sheet. */
function syncRecord(): void {
  recordOpen.hidden = !playedAny(myRecord());
}

/** Opens the sheet with the player's own record on it, as it is kept now, or puts it away. */
function showRecord(open: boolean): void {
  // the keys go back to the button that opened the sheet, where it is still there
  const within = recordSheet.contains(document.activeElement);
  recordSheet.hidden = !open;
  clearArmed = false;
  recordClear.textContent = WORDS.record.clear;
  if (!open) {
    if (within && !recordOpen.hidden && !about.hidden) recordOpen.focus({ preventScroll: true });
    return;
  }
  // one sheet over the lobby at a time: this one and the one for a word about the game lie in the same place
  showFeedback(false);
  const { games } = myRecord();
  recordList.replaceChildren(
    ...GAME_IDS.flatMap((game) => {
      const tally = games[game];
      if (tally === undefined) return [];
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = GAMES[game].title[lang];
      const count = document.createElement("span");
      count.textContent = WORDS.record.row(tally.played, tally.top, WORDS.record.kinds[TOP_KIND[game]]);
      row.append(name, count);
      return [row];
    }),
  );
  el<HTMLButtonElement>("record-close").focus({ preventScroll: true });
}

recordOpen.addEventListener("click", () => showRecord(true));

// ---- What the room has counted ---------------------------------------------------------------------

/**
 * Offers the room's tally in the waiting room once the room has counted a game for someone in it, and keeps an
 * open sheet as the room last sent it. A room from before the tally counts nothing, and is offered none.
 */
function syncTally(): void {
  const view = currentView;
  tallyOpen.hidden = view === null || !view.players.some((p) => (p.games ?? 0) > 0);
  if (tallyOpen.hidden) showTally(false);
  else if (!tallySheet.hidden) fillTally();
}

/** Writes the lines of the room's tally: a player to a line, whoever was at the top most often first, then whoever played most, then by seat. */
function fillTally(): void {
  const view = currentView;
  if (view === null) return;
  const rows = [...view.players].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.games ?? 0) - (a.games ?? 0) || a.slot - b.slot);
  tallyList.replaceChildren(
    ...rows.map((player) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = `${player.nick}${player.slot === view.you ? WORDS.tally.me : ""}`;
      const count = document.createElement("span");
      count.textContent = WORDS.tally.row(player.games ?? 0, player.wins ?? 0, player.pieces ?? 0);
      row.append(name, count);
      return row;
    }),
  );
}

/** Opens the sheet with what the room has counted for each player on it, or puts it away. */
function showTally(open: boolean): void {
  // the keys go back to the button that opened the sheet, where it is still there
  const within = tallySheet.contains(document.activeElement);
  tallySheet.hidden = !open;
  if (!open) {
    if (within && !tallyOpen.hidden) tallyOpen.focus({ preventScroll: true });
    return;
  }
  fillTally();
  el<HTMLButtonElement>("tally-close").focus({ preventScroll: true });
}

tallyOpen.addEventListener("click", () => showTally(true));
el<HTMLButtonElement>("tally-close").addEventListener("click", () => showTally(false));
el<HTMLButtonElement>("record-close").addEventListener("click", () => showRecord(false));
recordClear.addEventListener("click", () => {
  // forgetting cannot be taken back: the first press asks, the second does it
  if (!clearArmed) {
    clearArmed = true;
    recordClear.textContent = WORDS.record.clearSure;
    return;
  }
  clearRecord();
  syncRecord();
  showRecord(false);
});
syncRecord();

// ---- A word about the game ----------------------------------------------------------------------

/** Opens the sheet a word about the game is written on, or puts it away; what was written and not sent is kept while the page is open. */
function showFeedback(open: boolean): void {
  feedbackSheet.hidden = !open;
  if (!open) return;
  // one sheet over the lobby at a time
  showRecord(false);
  feedbackNote.textContent = "";
  feedbackNote.classList.remove("failed");
  // Under a finger a box that takes the focus by itself brings the keyboard up over the sheet before it has been read.
  if (!TOUCH) feedbackText.focus();
}

/** Says on the sheet how the sending stands: on its way, gone, or not. */
function sayFeedback(text: string, failed: boolean, sending = false): void {
  feedbackNote.textContent = text;
  feedbackNote.classList.toggle("failed", failed);
  feedbackSend.disabled = sending;
  feedbackSend.textContent = sending ? WORDS.feedback.sending : WORDS.feedback.send;
  feedbackSend.setAttribute("aria-busy", String(sending));
}

/**
 * Sends what was written to the directory, over the connection the lobby
 * has to it, with the language and the build of this page and nothing of the
 * player. The directory answers whether it went on (`feedbackAnswered`); no
 * answer in a while is taken as a no.
 */
function sendFeedback(): void {
  if (feedbackWait !== null) return;
  if (feedbackText.value.trim() === "") {
    sayFeedback(WORDS.feedback.empty, true);
    feedbackText.focus();
    return;
  }
  if (listSocket === null || listSocket.readyState !== WebSocket.OPEN) return sayFeedback(WORDS.feedback.failed, true);
  const request: DirectoryRequest = { type: "feedback", text: feedbackText.value, lang, build: BUILD };
  listSocket.send(JSON.stringify(request));
  sayFeedback("", false, true);
  feedbackWait = setTimeout(() => feedbackAnswered(false), FEEDBACK_WAIT_MS);
}

/** The directory said whether the word about the game went on, or said nothing for too long. What was sent is cleared; what was not stays to be sent again. */
function feedbackAnswered(sent: boolean): void {
  if (feedbackWait === null) return;
  clearTimeout(feedbackWait);
  feedbackWait = null;
  if (sent) feedbackText.value = "";
  sayFeedback(sent ? WORDS.feedback.sent : WORDS.feedback.failed, !sent);
}

// ---- The inbox: what players wrote, for whoever makes the game -----------------------------------

/** Opens the sheet the inbox is read on, or puts it away with what it showed. */
function showInbox(open: boolean): void {
  inboxSheet.hidden = !open;
  if (open) {
    if (!TOUCH) inboxKey.focus();
    return;
  }
  inboxList.replaceChildren();
  inboxNote.textContent = "";
  inboxKey.value = "";
}

/** Says on the sheet how the asking stands. */
function sayInbox(text: string, failed: boolean, asking = false): void {
  inboxNote.textContent = text;
  inboxNote.classList.toggle("failed", failed);
  inboxOpen.disabled = asking;
  inboxOpen.textContent = asking ? WORDS.inbox.opening : WORDS.inbox.open;
}

/**
 * Asks the directory for the words kept, with the key typed, over the
 * connection the lobby has to it; with `drop`, to throw that one away first.
 * The key goes in the message and is kept nowhere but the box it was typed in.
 */
function askInbox(drop?: number): void {
  if (inboxWait !== null || inboxKey.value === "") return;
  if (listSocket === null || listSocket.readyState !== WebSocket.OPEN) return sayInbox(WORDS.inbox.offline, true);
  const request: DirectoryRequest = wantNumbers
    ? { type: "numbers", key: inboxKey.value }
    : drop === undefined
      ? { type: "inbox", key: inboxKey.value }
      : { type: "inbox", key: inboxKey.value, drop };
  listSocket.send(JSON.stringify(request));
  sayInbox("", false, true);
  inboxWait = setTimeout(() => {
    inboxWait = null;
    sayInbox(WORDS.inbox.offline, true);
  }, FEEDBACK_WAIT_MS);
}

/** The directory answered: the words kept, the latest first, or that the inbox did not open. */
function inboxAnswered(words: StoredWord[] | null): void {
  if (inboxWait !== null) clearTimeout(inboxWait);
  inboxWait = null;
  if (inboxSheet.hidden) return;
  if (words === null) {
    inboxList.replaceChildren();
    return sayInbox(WORDS.inbox.refused, true);
  }
  sayInbox(words.length === 0 ? WORDS.inbox.none : WORDS.inbox.count(words.length), false);
  inboxList.replaceChildren(
    ...words.map((word) => {
      const row = document.createElement("li");
      const head = document.createElement("p");
      head.className = "dim";
      const when = new Date(word.at).toLocaleString(lang === "ko" ? "ko-KR" : "en-US");
      // a player pointed out in a room is kept among the words: over it who and in which game, under it the lines said to be theirs
      head.textContent =
        word.flag === undefined ? WORDS.inbox.head(when, word.lang, word.build) : WORDS.inbox.flagHead(when, word.flag.nick, isGameId(word.flag.game) ? GAMES[word.flag.game].title[lang] : word.flag.game);
      // what a stranger wrote is shown as text and nothing else
      const text = document.createElement("p");
      text.className = "word";
      text.textContent = word.text;
      const drop = document.createElement("button");
      drop.type = "button";
      drop.textContent = WORDS.inbox.drop;
      let armed = false;
      drop.addEventListener("click", () => {
        // twice, as the way out of a game is: nothing is thrown away by a slip
        if (armed) return askInbox(word.id);
        armed = true;
        drop.textContent = WORDS.inbox.dropConfirm;
      });
      head.append(drop);
      row.append(head, text);
      return row;
    }),
  );
}

/**
 * The directory answered with the site's numbers: a day to a row, the latest
 * first, each said in sentences; or that they were not given. A day is the
 * day where the numbers are counted (`numbers-config.json`), not the
 * reader's.
 */
function numbersAnswered(days: DayNumbers[] | null): void {
  if (inboxWait !== null) clearTimeout(inboxWait);
  inboxWait = null;
  if (inboxSheet.hidden) return;
  if (days === null) {
    inboxList.replaceChildren();
    return sayInbox(WORDS.inbox.refused, true);
  }
  const offset = numbersConfig.utcOffsetMinutes;
  const zone = `UTC${offset < 0 ? "-" : "+"}${Math.floor(Math.abs(offset) / 60)}${offset % 60 === 0 ? "" : `:${String(Math.abs(offset) % 60).padStart(2, "0")}`}`;
  sayInbox(days.length === 0 ? WORDS.numbers.none : WORDS.numbers.count(days.length, zone), false);
  inboxList.replaceChildren(
    ...days.map(readDay).map((day) => {
      const row = document.createElement("li");
      const head = document.createElement("p");
      head.className = "dim";
      head.textContent = WORDS.numbers.day(day.date, WORDS.numbers.weekdays[day.weekday]);
      const text = document.createElement("p");
      text.className = "word";
      text.textContent = [
        WORDS.numbers.lobby(day.visits, day.people, day.peak),
        `${WORDS.numbers.rooms(day.made, day.listed)} · ${WORDS.numbers.games(day.started, day.ended)}`,
        WORDS.numbers.left(day.alone, day.unplayed),
        ...day.games.map((each) => WORDS.numbers.game(GAMES[each.game].title[lang], each.wanted, each.started, each.ended, each.players, each.minutes)),
        ...(day.hours.length === 0 ? [] : [WORDS.numbers.hours(day.hours.map((each) => WORDS.numbers.hour(each.hour, each.visits)).join(" · "))]),
      ].join("\n");
      row.append(head, text);
      return row;
    }),
  );
}

el<HTMLFormElement>("inbox-form").addEventListener("submit", (event) => {
  event.preventDefault();
  askInbox();
});
el<HTMLButtonElement>("inbox-close").addEventListener("click", () => showInbox(false));

feedbackButton.addEventListener("click", () => showFeedback(true));
el<HTMLButtonElement>("feedback-close").addEventListener("click", () => showFeedback(false));
feedbackSend.addEventListener("click", sendFeedback);

function unwatchRooms(): void {
  listSocket?.close();
  listSocket = null;
  // the hand was that connection's
  myWant = null;
  wanting = {};
  wantKind = null;
  watching = null;
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
function warmUp(code: string, wait = config.warmUpMs): void {
  if ((warm?.code === code && isFresh(warm)) || entering === code) return;
  coolDown();
  warming = setTimeout(() => {
    warming = null;
    const current = openRoom(code);
    warm = { code, socket: current, since: Date.now() };
    // The room ends a connection that says nothing for long, and a line can drop: this one is then let go,
    // not opened again, and the press opens its own.
    current.addEventListener("close", () => {
      if (warm?.socket === current) coolDown();
    });
  }, wait);
}

/**
 * Whether a connection opened ahead is still one to join on. One that has
 * said nothing for long may have been dropped along the way without either
 * end hearing of it (a phone that changed networks), and a join sent into it
 * would be waited on for seconds before the page gave it up: past
 * `warmFreshSeconds` a new one is opened instead.
 */
function isFresh(ahead: { since: number }): boolean {
  return Date.now() - ahead.since <= config.warmFreshSeconds * 1000;
}

/**
 * The room the next press most likely goes into, with the pointer on no row:
 * the room about to be made, while its form is on show; else the room whose
 * code is in the box, typed there or brought by an invitation; else, under a
 * finger, which is on a row only for the press itself, the room a quick join
 * would pick, or the first that can be entered at all. `null` for none, and
 * while this page is in a room or on its way into one.
 */
function likelyRoom(): string | null {
  if (!newRoom.hidden) return nextCode;
  if (socket !== null) return null;
  const typed = codeInput.value.trim().toUpperCase();
  if (isValidRoomCode(typed, config)) return typed;
  if (!TOUCH) return null;
  const rooms = roomsSent === null ? [] : roomsShown(roomsSent.rooms, roomsSent.counts, listedGame).rooms;
  return quickPicks(rooms)[0] ?? rooms.find((room) => room.players < room.maxPlayers)?.code ?? null;
}

/** With the pointer on no row: the likeliest room (`likelyRoom`) is the one kept open ahead, and with none there is none. */
function warmRest(): void {
  restCode = likelyRoom();
  if (restCode === null) coolDown();
  else warmUp(restCode);
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
  if (code === null) warmRest();
  else warmUp(code);
});
roomList.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") warmRest();
});
roomList.addEventListener("focusin", (event) => {
  const code = rowCode(event.target);
  if (code !== null) warmUp(code);
});
// A finger that comes down in the lobby is about to press something: the row under it, or else the likeliest room,
// is opened at once, and opened again if the connection ahead has grown old meanwhile.
frame.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType === "mouse" || (socket !== null && newRoom.hidden)) return;
    const code = rowCode(event.target) ?? likelyRoom();
    if (code !== null) warmUp(code, 0);
  },
  true,
);

/** The lobby: the rooms anyone can join, a nickname, and a room to make or enter by code. */
function showLobby(message = ""): void {
  voice.leave();
  setEntering(null);
  setCreating(false);
  asked = {};
  startAsked = false;
  quickRest = null;
  lastLobby = null;
  lastGame = null;
  staleSince = null;
  returning = false;
  keptTable = false;
  currentCode = "";
  currentView = null;
  syncTally();
  hostAsked = false;
  showSeatMenu(null);
  swapSheet.hidden = true;
  quickSheet.hidden = true;
  pingSentAt = null;
  pingTimes = [];
  hideTable();
  chat.close();
  showWho(null);
  room.hidden = true;
  newRoom.hidden = true;
  entry.hidden = false;
  roomsPanel.hidden = false;
  showGamePicks(false);
  rules.hidden = true;
  notice.textContent = message;
  showScene(null);
  syncScene();
  lobbyBar();
  showLobbyLinks(true);
  // out of the room, nothing in it calls any more
  calling = null;
  setTitle(SITE_TITLE);
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
  // Making a room opens a new connection, which is several trips to the server and back and, far from it, most of
  // the wait after the press. It is opened now, to a code picked now; the press then only has to say "make it".
  // a link whose room has closed is opened again under its own code
  nextCode = reopenCode ?? generateRoomCode(Math.random, config);
  warmRest();
  showLobbyLinks(false);
  renderNewRoom();
  el<HTMLButtonElement>("create-go").focus();
}

function closeNewRoom(): void {
  // a room on its way is not waited for: the form is put away, and so is the asking
  if (creating) disconnect();
  setCreating(false);
  // the room that was going to be made is not: the connection opened to it is let go, for the likeliest room if there is one
  nextCode = null;
  newRoom.hidden = true;
  warmRest();
  entry.hidden = false;
  rules.hidden = true;
  lobbyBar();
  showLobbyLinks(true);
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
  const listed = asked.listed ?? view.listed;
  // (a room playing 탈락전 says so here, where everyone in it reads it: the button for it is the host's alone)
  const knockout = view.knockout === true;
  write(away === null ? WORDS.room.status(game, listed, here, view.maxPlayers, knockout) : [away]);
  if (away === null && roomGame.childElementCount === 1 && roomGame.scrollWidth > roomGame.clientWidth) write(WORDS.room.statusTall(game, listed, here, view.maxPlayers, knockout));
  // said aloud to a screen reader when it changes
  status.textContent = away ?? WORDS.room.statusSpoken(here, view.maxPlayers);
}

/** Says in the chat who has come into the room and who has gone since it was last sent. */
function noteComings(before: LobbyView, after: LobbyView): void {
  const was = new Map(before.players.map((p) => [p.slot, p.nick]));
  const is = new Map(after.players.map((p) => [p.slot, p.nick]));
  for (const [slot, nick] of is) {
    if (was.has(slot)) continue;
    chat.note({ kind: "came", nick });
    call("came");
  }
  // someone the host sent out is said to have been sent out, not to have gone
  for (const [slot, nick] of was) if (!is.has(slot)) chat.note({ kind: sentOut.has(slot) ? "kicked" : "went", nick });
  sentOut.clear();
  if (after.game !== before.game) {
    chat.note({ kind: "game", game: after.game });
    tipRules(after.game);
  }
  // 탈락전: turned on or off by the host; or everyone is in again with no winner said, because too few were left
  if (after.knockout === true && before.knockout !== true) chat.note({ kind: "knockout-on" });
  else if (before.knockout === true && after.knockout !== true) chat.note({ kind: "knockout-off" });
  else if (after.knockout === true && before.players.some((p) => p.out) && !after.players.some((p) => p.out) && !wonJust) chat.note({ kind: "knockout-again" });
  wonJust = false;
  // what a game just over paid: said of each player whose pieces in the room have grown (a room from before the ledger tells of none)
  const had = new Map(before.players.map((p) => [p.slot, p.pieces ?? 0]));
  for (const p of after.players) {
    const won = (p.pieces ?? 0) - (had.get(p.slot) ?? p.pieces ?? 0);
    if (won > 0) chat.note({ kind: "pieces", nick: p.nick, won, all: p.pieces });
  }
  // who did best in a game just over: said once, when the marks beside the names change to them
  // (a room from before the marks tells of none; marks that only went, with a player or a level game, are not said)
  const tops = after.players.filter((p) => p.top === true);
  const topBefore = new Set(before.players.filter((p) => p.top === true).map((p) => p.slot));
  if (tops.some((p) => !topBefore.has(p.slot) && was.has(p.slot))) chat.note({ kind: "top", nick: tops.map((p) => p.nick).join(", ") });
  // The room has another host with both of them here before and after: it was passed on, by the host or by the
  // room for a host who did not answer. Not said when a host's connection drops and comes back: the room goes
  // to the next player and returns by itself, and a line for each way would fill the chat of a room on a bad line.
  const here = (view: LobbyView, slot: number | null): boolean => view.players.some((p) => p.slot === slot && p.connected);
  if (after.host !== before.host && here(after, before.host) && here(before, after.host)) {
    const host = after.host === null ? undefined : is.get(after.host);
    if (host !== undefined) chat.note({ kind: "host", nick: host });
  }
}

/** Pings the room, and notes when: the answer says how long the way there and back is. */
function pingRoom(): void {
  if (socket === null || !online) return;
  socket.send(PING);
  pingSentAt = performance.now();
}

/**
 * Says how long the room takes to answer: in a corner of the room's picture
 * while it is on show, and in a game's menu. Nothing before the first answer,
 * and nothing while the connection is down, which is said elsewhere.
 */
function renderPing(): void {
  const ms = online ? shownMs(pingTimes) : null;
  const latency: LatencyConfig = roomConfig.latency;
  for (const [mark, seen] of [
    [pingMark, currentCode !== "" && table === null],
    [menuPing, !gameMenu.hidden],
  ] as const) {
    mark.hidden = ms === null || !seen;
    if (ms === null) continue;
    const grade = gradeOf(ms, latency);
    mark.textContent = WORDS.room.ping(ms);
    mark.title = WORDS.room.pingGrade[grade];
    mark.classList.toggle("fair", grade === "fair");
    mark.classList.toggle("poor", grade === "poor");
  }
}

/**
 * Shows the words that are said with one press, or puts them away. The keys
 * go to the first of them, and back where they were: to the chat's button in
 * a room, to the game during one.
 */
function showQuick(shown: boolean): void {
  // one sheet over the chat at a time
  showTo(false);
  if (shown) showWho(null);
  if (!shown || currentCode === "") {
    if (quickSheet.hidden) return;
    const within = quickSheet.contains(document.activeElement);
    quickSheet.hidden = true;
    if (!within) return;
    if (table !== null || chatBox.hidden) (document.activeElement as HTMLElement | null)?.blur();
    else chatSend.focus({ preventScroll: true });
    return;
  }
  quickSheet.hidden = false;
  quickWords.querySelector("button")?.focus({ preventScroll: true });
}

/** Whom the chat's next line is said to, of those in the room as it stands; `null` when it is said to everyone. */
function toPeopleNow(): Hearer[] | null {
  return currentView === null ? null : hearersOf(chatTo, currentView.players, currentView.you);
}

/** Their names as the chat puts them after the speaker's; `null` when the line is said to everyone. */
function toNames(): string | null {
  const people = toPeopleNow();
  return people === null || people.length === 0 ? null : namesOf(people.map((person) => person.nick));
}

/**
 * Says on the button beside the chat's box whom the next line is said to,
 * and in the box itself while that is not everyone. Players spoken to who
 * are no longer in the room are no longer spoken to; once none of them is
 * left (or the team is no more) the next line is for everyone, and the chat
 * says so.
 */
function renderTo(): void {
  let people = toPeopleNow();
  if (people !== null && people.length === 0) {
    chatTo = { kind: "all" };
    people = null;
    if (currentView !== null) chat.note({ kind: "to-left" });
  }
  // whoever has gone is forgotten, so that nobody who takes their seat later is spoken to in their place
  if (people !== null && chatTo.kind === "some") chatTo = { kind: "some", people };
  const names = people === null ? null : namesOf(people.map((person) => person.nick));
  const who = names === null ? null : chatTo.kind === "team" ? WORDS.chat.toMyTeam : names;
  chatToButton.textContent =
    people === null ? WORDS.chat.toAll : chatTo.kind === "team" ? WORDS.chat.toTeam : people.length === 1 ? (people[0]?.nick ?? "") : WORDS.chat.toSome(people.length);
  chatToButton.classList.toggle("one", people !== null);
  chatToButton.setAttribute("aria-label", WORDS.chat.toLabel(who));
  chatToButton.title = WORDS.chat.toLabel(chatTo.kind === "team" && names !== null ? `${WORDS.chat.toMyTeam} (${names})` : who);
  chatInput.placeholder = who === null ? WORDS.chat.say : chatTo.kind === "team" ? WORDS.chat.toTeamHint : WORDS.chat.toHint(who);
}

/**
 * Shows the people the chat's next line can be said to, or puts them away:
 * everyone first, then the reader's team where they have one with someone
 * else in it, then each player. A press of everyone or of the team is the
 * whole answer and puts the sheet away; a press of a player adds them to
 * those spoken to or takes them out, and the sheet stays for the next. The
 * keys go to the first of them, and back to the box.
 */
function showTo(shown: boolean): void {
  if (!shown || currentView === null) {
    if (toSheet.hidden) return;
    const within = toSheet.contains(document.activeElement);
    toSheet.hidden = true;
    if (!within) return;
    if (table !== null && !chatOpen) (document.activeElement as HTMLElement | null)?.blur();
    else if (!TOUCH) chat.focus();
    return;
  }
  showQuick(false);
  showWho(null);
  const view = currentView;
  /** Each button with whether it is pressed as things stand, so that a press of one shows on the others. */
  const marks: (() => void)[] = [];
  const pick = (label: string, pressed: () => boolean, press: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    marks.push(() => {
      button.setAttribute("aria-pressed", String(pressed()));
      button.classList.toggle("primary", pressed());
    });
    button.addEventListener("click", press);
    return button;
  };
  const whole = (to: ChatTo): (() => void) => () => {
    chatTo = to;
    renderTo();
    showTo(false);
  };
  // a player whose connection is gone would not read it, and the room would leave them out
  const others = view.players.filter((p) => p.slot !== view.you && p.connected);
  // two people of one name are told apart by their seats
  const twice = (nick: string): boolean => view.players.filter((p) => p.nick === nick).length > 1;
  const spoken = (slot: number): boolean => toPeopleNow()?.some((person) => person.slot === slot) === true;
  toPeople.replaceChildren(
    pick(WORDS.chat.toEveryone, () => chatTo.kind === "all", whole({ kind: "all" })),
    ...(teammatesOf(view.players, view.you).length > 0 ? [pick(WORDS.chat.toMyTeam, () => chatTo.kind === "team", whole({ kind: "team" }))] : []),
    ...others.map((p) =>
      pick(
        twice(p.nick) ? `${p.nick} (${p.slot + 1})` : p.nick,
        () => spoken(p.slot),
        () => {
          chatTo = toggled(toPeopleNow() ?? [], p);
          renderTo();
          for (const mark of marks) mark();
        },
      ),
    ),
  );
  for (const mark of marks) mark();
  // bots hold no seat a line can be sent to, so a room of one person and bots has nobody to pick
  toHelp.textContent = others.length === 0 ? WORDS.chat.toAlone : WORDS.chat.toHelp;
  toSheet.hidden = false;
  toPeople.querySelector("button")?.focus({ preventScroll: true });
}

/** Shows what the game is played by in this room, where that has a sheet of its own, or puts it away. */
function showOptions(shown: boolean): void {
  if (!shown || currentView === null || table !== null) {
    if (optionsSheet.hidden) return;
    const within = optionsSheet.contains(document.activeElement);
    optionsSheet.hidden = true;
    if (within) optionsOpen.focus({ preventScroll: true });
    return;
  }
  // one sheet at a time
  showQuick(false);
  showSwap(false);
  optionsSheet.hidden = false;
  (optionsList.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? el<HTMLButtonElement>("options-close")).focus({ preventScroll: true });
}

optionsOpen.addEventListener("click", () => showOptions(optionsSheet.hidden === true));

/** A moment in the reader's words and on their clock: "11/15(토) 21:00". */
function whenOf(at: number): string {
  const date = new Date(at);
  return WORDS.when.at(
    date.toLocaleDateString(lang, { weekday: "short" }),
    date.getMonth() + 1,
    date.toLocaleDateString(lang, { month: "short" }),
    date.getDate(),
    date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  );
}

/** The link to the room `code`, through the page that says which game it is for where that is known; with `at`, one that says when (`linkedOf`). */
function roomLink(code: string, game: GameId | null, at: number | null): string {
  return `${location.origin}${game === null ? "/" : invitePath(lang, game)}#${linkedOf(code, at)}`;
}

/** Gives the appointment at `at` in the room `code` to the reader's calendar: its address is the link itself, which at that hour opens the room. */
function saveAppointment(code: string, at: number, game: GameId | null): void {
  saveCalendar({
    uid: `room-${code}-${at}@${new URL(ORIGIN).host}`,
    stamp: Date.now(),
    start: at,
    end: at + appointmentConfig.lengthMinutes * 60_000,
    summary: game === null ? WORDS.when.event(SITE_NAME) : WORDS.meet.event(GAMES[game].title[lang], SITE_NAME),
    url: roomLink(code, game, at),
    remindMinutes: appointmentConfig.remindMinutes,
  });
}

/** Which of the days offered is picked on the sheet (0: today), and the time of day, in minutes after midnight. */
let whenDay = 0;
let whenMinutes = appointmentConfig.defaultMinutes;

/** The moment picked on the sheet: that time of day, `whenDay` days on from today, on the reader's clock. */
function whenPicked(): number {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + whenDay, 0, whenMinutes).getTime();
}

/** Writes the sheet as what is picked now stands: the day lit, the time of day, the moment in words, and nothing to copy for a time that has passed. */
function renderWhen(): void {
  const at = whenPicked();
  const open = mayPlan(at, Date.now());
  [...whenDays.children].forEach((button, day) => {
    button.setAttribute("aria-pressed", String(day === whenDay));
    button.classList.toggle("primary", day === whenDay);
  });
  whenClock.textContent = `${String(Math.floor(whenMinutes / 60)).padStart(2, "0")}:${String(whenMinutes % 60).padStart(2, "0")}`;
  whenSays.textContent = open ? whenOf(at) : WORDS.when.past;
  whenCalendar.disabled = !open;
  whenCopy.disabled = !open;
}

/**
 * Shows the sheet for an invitation that says when, or puts it away. It
 * opens on the time the link that brought this player said, where it said
 * one for this room that still stands; else on the time first offered.
 */
function showWhen(shown: boolean): void {
  if (!shown || currentView === null || table !== null) {
    if (whenSheet.hidden) return;
    const within = whenSheet.contains(document.activeElement);
    whenSheet.hidden = true;
    if (within && !whenOpen.hidden) whenOpen.focus({ preventScroll: true });
    return;
  }
  // one sheet at a time
  showQuick(false);
  showTo(false);
  showOptions(false);
  showSwap(false);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const said = appointment !== null && appointment.code === currentCode && mayPlan(appointment.at, now.getTime()) ? new Date(appointment.at) : null;
  // the day the link said, counted from today on the calendar (not in hours: a day the clocks change has 23 or 25)
  const saidDay = said === null ? null : Math.round((new Date(said.getFullYear(), said.getMonth(), said.getDate()).getTime() - midnight) / 86_400_000);
  if (said !== null && saidDay !== null && saidDay < appointmentConfig.days) {
    whenDay = saidDay;
    whenMinutes = said.getHours() * 60 + said.getMinutes();
  } else {
    whenDay = firstDay(now.getHours() * 60 + now.getMinutes(), appointmentConfig);
    whenMinutes = appointmentConfig.defaultMinutes;
  }
  whenDays.replaceChildren(
    ...Array.from({ length: appointmentConfig.days }, (_none, day) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = day === 0 ? WORDS.when.today : WORDS.when.day(date.toLocaleDateString(lang, { weekday: "short" }), date.getDate());
      button.addEventListener("click", () => {
        whenDay = day;
        renderWhen();
      });
      return button;
    }),
  );
  renderWhen();
  whenSheet.hidden = false;
  whenCopy.focus({ preventScroll: true });
}

whenOpen.addEventListener("click", () => showWhen(whenSheet.hidden === true));
el<HTMLButtonElement>("when-close").addEventListener("click", () => showWhen(false));
for (const [id, by, label] of [
  ["when-earlier", -1, WORDS.when.earlier(appointmentConfig.stepMinutes)],
  ["when-later", 1, WORDS.when.later(appointmentConfig.stepMinutes)],
] as const) {
  const button = el<HTMLButtonElement>(id);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", () => {
    whenMinutes = stepped(whenMinutes, by, appointmentConfig);
    renderWhen();
  });
}
whenCalendar.addEventListener("click", () => {
  const at = whenPicked();
  if (currentCode === "" || !mayPlan(at, Date.now())) return renderWhen();
  saveAppointment(currentCode, at, currentView !== null && isGameId(currentView.game) ? currentView.game : null);
});
// The room's link with the time picked after its code: passed on as the room's own link is, with a line that says when
// (a card drawn for the link shows the game and no time, so what is pasted says it too).
whenCopy.addEventListener("click", () => {
  const at = whenPicked();
  if (currentCode === "" || !mayPlan(at, Date.now())) return renderWhen();
  const game = currentView !== null && isGameId(currentView.game) ? currentView.game : null;
  const link = roomLink(currentCode, game, at);
  const line = WORDS.when.invite(game === null ? "" : GAMES[game].title[lang], whenOf(at));
  passOn(
    whenCopy,
    WORDS.when.copy,
    line,
    link,
    `${line}\n${link}`,
    () => {
      hint = WORDS.room.copyFailedHint(currentCode);
      renderRoomBar();
    },
    () => chat.note({ kind: "when-made", at }),
  );
});
el<HTMLButtonElement>("options-close").addEventListener("click", () => showOptions(false));

chatToButton.addEventListener("click", () => showTo(toSheet.hidden === true));
el<HTMLButtonElement>("to-close").addEventListener("click", () => showTo(false));

for (const word of QUICK_WORDS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = WORDS.chat.quick[word];
  button.addEventListener("click", () => {
    chat.sayQuick(word);
    showQuick(false);
  });
  quickWords.append(button);
}
el<HTMLButtonElement>("quick-close").addEventListener("click", () => showQuick(false));

/**
 * Shows the host's choice of another game for the room, or puts it away.
 * A game with no place for a slot someone holds cannot be chosen: the room
 * would refuse it.
 */
function showSwap(shown: boolean): void {
  const view = currentView;
  if (!shown || view === null || !isHost || table !== null) {
    swapSheet.hidden = true;
    return;
  }
  showOptions(false);
  const slots = view.players.map((p) => p.slot);
  const choices = GAME_IDS.map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.textContent = GAMES[id].title[lang];
    button.setAttribute("aria-pressed", String(id === view.game));
    button.disabled = id !== view.game && !gameHolds(slots, id, config);
    button.addEventListener("click", () => {
      if (id !== view.game) send({ type: "pick", game: id });
      showSwap(false);
      swapButton.focus({ preventScroll: true });
    });
    return button;
  });
  swapChoices.replaceChildren(...choices);
  swapNote.textContent = choices.some((button) => button.disabled) ? WORDS.swap.tooMany : "";
  swapNote.hidden = swapNote.textContent === "";
  const knockout = view.knockout === true;
  swapKnockout.textContent = knockout ? WORDS.room.knockoutOn : WORDS.room.knockoutOff;
  swapKnockout.setAttribute("aria-pressed", String(knockout));
  swapKnockout.classList.toggle("primary", knockout);
  const opening = swapSheet.hidden;
  swapSheet.hidden = false;
  if (opening) (choices[GAME_IDS.indexOf(view.game as GameId)] ?? choices[0])?.focus({ preventScroll: true });
}

/**
 * Shows what the host can do with the player in `slot`, beside where their
 * figure was pressed (`x`, `y` in the frame's own pixels), or with `null`
 * puts the menu away.
 */
function showSeatMenu(slot: number | null, x = 0, y = 0): void {
  const player = slot === null ? undefined : currentView?.players.find((p) => p.slot === slot);
  seatShown = player === undefined ? null : player.slot;
  kickArmed = false;
  // the keys are in the menu while it is open: taken out of it before it goes
  const keysInside = seatMenu.contains(document.activeElement);
  seatMenu.hidden = player === undefined;
  if (player === undefined) {
    // opened from the list with the keyboard: the keys go back to the row they came from, if it is still there
    if (keysInside && seatFromRow !== null) players.querySelector<HTMLButtonElement>(`button[data-slot="${seatFromRow}"]`)?.focus({ preventScroll: true });
    seatFromRow = null;
    return;
  }
  seatName.textContent = player.nick;
  seatMenu.style.left = "0px";
  seatMenu.style.top = "0px";
  // as wide from the start as its longest words make it: the second press of sending out lands where the first did
  seatMenu.style.minWidth = "";
  seatKick.textContent = WORDS.room.seatMenu.kickConfirm;
  seatMenu.style.minWidth = `${seatMenu.offsetWidth}px`;
  syncSeatMenu();
  // beside the press, and all of it inside the picture
  seatMenu.style.left = `${Math.max(2, Math.min(x + 6, sceneCanvas.offsetWidth - seatMenu.offsetWidth - 2))}px`;
  seatMenu.style.top = `${Math.max(2, Math.min(y - 8, sceneCanvas.offsetHeight - seatMenu.offsetHeight - 2))}px`;
  seatHost.focus({ preventScroll: true });
}

/** The menu's buttons as the room now stands: the room is not passed to someone who is away, and nobody is sent out of nothing. */
function syncSeatMenu(): void {
  const player = seatShown === null ? undefined : currentView?.players.find((p) => p.slot === seatShown);
  if (player === undefined || !isHost || table !== null) {
    if (seatShown !== null) showSeatMenu(null);
    return;
  }
  seatHost.disabled = !player.connected;
  seatKick.textContent = kickArmed ? WORDS.room.seatMenu.kickConfirm : WORDS.room.seatMenu.kick;
}

/** The room asked whether its host is there: answered at once if anything was pressed lately, else by the next press. */
function hostChecked(): void {
  if (Date.now() - lastInputAt <= config.hostIdleSeconds * 1000) {
    send({ type: "here" });
    return;
  }
  hostAsked = true;
  call("host");
  if (currentView !== null && currentCode !== "") renderRoom(currentCode, currentView);
  // the room waits this long and no longer: after it the question is no longer open
  setTimeout(() => {
    if (!hostAsked) return;
    hostAsked = false;
    if (currentView !== null && currentCode !== "") renderRoom(currentCode, currentView);
  }, config.hostAnswerSeconds * 1000);
}

/** Something was pressed or typed: the player is there, which answers the room if it has asked. */
function noteInput(): void {
  lastInputAt = Date.now();
  if (!hostAsked) return;
  hostAsked = false;
  send({ type: "here" });
  if (currentView !== null && currentCode !== "") renderRoom(currentCode, currentView);
}

/** The room before a game: who is here, the code to share, the chat, and the start. */
function renderRoom(code: string, view: LobbyView): void {
  if (currentCode !== code) {
    // another room: whoever was spoken to aside was in the one before
    chatTo = { kind: "all" };
    openHidden(code);
    chat.open(code);
    // once for a room: a page loaded again has the line among those it kept
    if (!chat.noted("first-time")) tipRules(view.game);
    // the invitation is taken up: the notice a phone held upright shows says no more of it
    turnInvited.hidden = true;
    // the link that led here said when the room's people meet: said once, where it stays to be read
    if (appointment !== null && appointment.code === code && appointmentStands(appointment.at, Date.now(), appointmentConfig) !== null && !chat.noted("when")) {
      chat.note({ kind: "when", at: appointment.at });
    }
  } else if (currentView !== null) noteComings(currentView, view);
  currentCode = code;
  currentView = view;
  syncTally();
  // who the chat's next line is said to, as the room now stands
  renderTo();
  // whose voice is not played here: those whose lines are covered, and nobody who has since taken the seat of one of them
  for (let slot = 0; slot < view.maxPlayers; slot++) {
    const player = view.players.find((p) => p.slot === slot);
    voice.quiet(slot, player !== undefined && hiddenPeople.has(personKey(slot, player.nick)));
  }
  syncWho();
  setEntering(null);
  // the room asked for is here
  if (creating) setCreating(false);
  unwatchRooms();
  roomsPanel.hidden = true;
  entry.hidden = true;
  newRoom.hidden = true;
  room.hidden = false;
  showLobbyLinks(false);
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
  // For the host each other player is a button there: what a press on a figure opens, a keyboard opens from here.
  // The list comes into sight while the keys are in it (style.css).
  const hosting = view.host === view.you;
  const keysAt = document.activeElement instanceof HTMLElement && players.contains(document.activeElement) ? document.activeElement.dataset.slot : undefined;
  for (let slot = 0; slot < view.maxPlayers; slot++) {
    const player = bySlot.get(slot);
    const row = document.createElement("li");
    const words = player
      ? WORDS.room.seat(slot + 1, player.nick, slot === view.you, player.connected, player.ready, player.pieces ?? 0, player.out === true, player.top === true)
      : WORDS.room.emptySeat(slot + 1);
    if (player !== undefined && hosting && slot !== view.you) {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = words;
      pick.dataset.slot = String(slot);
      pick.setAttribute("aria-haspopup", "dialog");
      pick.addEventListener("click", () => {
        const at = scene?.placeOf(slot) ?? { x: sceneCanvas.width / 2, y: sceneCanvas.height / 2 };
        seatFromRow = slot;
        showSeatMenu(slot, at.x, at.y);
      });
      row.append(pick);
    } else {
      row.textContent = words;
      row.classList.toggle("empty", player === undefined);
    }
    rows.push(row);
  }
  players.replaceChildren(...rows);
  players.setAttribute("aria-label", hosting ? WORDS.room.seatsHelp : "");
  // the keys stay on the row they were on when the room is sent again
  // (a row that has gone, its player sent out or away, leaves them on the next there is, or on the start)
  if (keysAt !== undefined) {
    const row = players.querySelector<HTMLButtonElement>(`button[data-slot="${keysAt}"]`) ?? players.querySelector<HTMLButtonElement>("button");
    (row ?? startButton).focus({ preventScroll: true });
  }

  const connected = view.players.filter((p) => p.connected);
  isHost = view.host === view.you;
  table?.setHost(isHost);
  if (!isHost) hostAsked = false;
  syncSeatMenu();
  // the choice of another game is the host's, and is drawn again for who is here now
  swapButton.hidden = !isHost;
  swapButton.title = WORDS.room.swapHelp;
  if (!swapSheet.hidden) showSwap(true);
  // The host starts; everyone else says when they are ready, on the button that stands where the host's start does.
  const me = view.players.find((p) => p.slot === view.you);
  if (isHost || asked.ready === (me?.ready ?? false)) delete asked.ready;
  const amReady = asked.ready ?? me?.ready ?? false;
  startButton.hidden = !isHost;
  readyButton.hidden = isHost;
  readyButton.textContent = amReady ? WORDS.room.unready : WORDS.room.ready;
  readyButton.setAttribute("aria-pressed", String(amReady));
  renderStatus();
  syncChat();

  // The room is on the list now, where strangers come in: nobody stays connected directly to anybody.
  if (!view.voice) voice.leave();
  renderVoice();

  // A room made by a newer server may be for a game this page has not heard of.
  const game = isGameId(view.game) ? GAMES[view.game] : null;
  setTitle(`${game?.title[lang] ?? SITE_TITLE} · ${code}`);
  listingButton.hidden = !isHost;
  // what was asked for and is now so needs no saying ahead of the room any more
  if (asked.listed === view.listed) delete asked.listed;
  if (asked.turnSeconds === view.turnSeconds) delete asked.turnSeconds;
  if (asked.variant === view.variant) delete asked.variant;
  if (asked.team === (view.players.find((p) => p.slot === view.you)?.team ?? 0)) delete asked.team;
  listingButton.textContent = (asked.listed ?? view.listed) ? WORDS.room.toUnlisted : WORDS.room.toListed;
  clockButton.textContent = WORDS.room.clock(asked.turnSeconds ?? view.turnSeconds);
  clockButton.disabled = !isHost;
  clockButton.title = isHost ? WORDS.room.clockHost : WORDS.room.clockGuest;
  // which way the game is played here, where it has more than one: the host's to choose
  const variant = game?.variants.find((each) => each.id === (asked.variant ?? view.variant));
  variantButton.hidden = variant === undefined;
  variantButton.textContent = variant?.title[lang] ?? "";
  variantButton.disabled = !isHost;
  variantButton.title = isHost ? WORDS.room.variantHost : WORDS.room.variantGuest;
  if (game === null) {
    startButton.disabled = true;
    readyButton.disabled = true;
    hint = WORDS.room.reloadForGame;
    renderRoomBar();
    return;
  }
  // The same place holds what this game has to set before it starts: the length of a turn, or a team to choose.
  const teams = game.teamSize > 0;
  clockButton.hidden = !game.turns;
  // A game with both a clock and a choice of ways has a button more than the row beside the start holds: the two
  // go into a sheet of their own, opened from where they were. Everyone can open it; only the host's presses count.
  const crowded = game.turns && variant !== undefined;
  const home = crowded ? optionsList : teamButton.parentElement;
  if (home !== null && clockButton.parentElement !== home) {
    if (crowded) home.append(clockButton, variantButton);
    else for (const button of [clockButton, variantButton]) home.insertBefore(button, optionsOpen);
  }
  optionsOpen.hidden = !crowded;
  el("options-help").textContent = isHost ? WORDS.room.optionsHost : WORDS.room.optionsGuest;
  if (!crowded) showOptions(false);
  teamButton.hidden = !teams;
  const mine = view.players.find((p) => p.slot === view.you);
  const myTeam = asked.team ?? mine?.team ?? 0;
  // a team's leader is whoever took it first: their share of the team's points differs from the others'
  // (of a team just asked for, the room has yet to say who leads)
  teamButton.textContent = myTeam === 0 ? WORDS.room.solo : WORDS.room.team(myTeam, asked.team === undefined && mine?.leads === true);
  teamButton.title = WORDS.room.teamHelp(game.teamSize);

  const sizes = new Map<number, number>();
  for (const p of connected) if (p.team > 0) sizes.set(p.team, (sizes.get(p.team) ?? 0) + 1);
  // a team that is not exactly full is no team: its players start alone (and hold up nobody)
  const broken = [...sizes].find(([, size]) => size !== game.teamSize);
  // A game starts with as many as it takes at least: one, in a game that can be played alone. Teams
  // change nothing in that: one team, or one player, is enough where one player is.
  // in a room playing 탈락전 the game is for those still in
  const playing = view.knockout === true ? connected.filter((p) => !p.out) : connected;
  const enough = wantBots || (playing.length >= game.minPlayers && playing.length <= game.maxPlayers);
  startButton.disabled = !isHost || !enough || startAsked;
  startButton.textContent = startAsked ? WORDS.room.starting : WORDS.room.start;
  startButton.setAttribute("aria-busy", String(startAsked));
  // whoever sits out of the room's 탈락전 has nothing to be ready for (the room does not count them either)
  const sittingOut = view.knockout === true && mine?.out === true;
  readyButton.disabled = sittingOut;
  const alone = connected.length === 1 && game.minPlayers === 1;
  // everyone but the host who is to play has said they are ready: the room now waits on its host alone
  const others = playing.filter((p) => p.slot !== view.host);
  const allReady = others.length > 0 && others.every((p) => (p.slot === view.you ? amReady : p.ready));
  // 탈락전 has put out so many that those left are too few for this game: it goes on with another game
  const short = playing.length < connected.length && playing.length < game.minPlayers;
  hint = hostAsked
    ? WORDS.room.hostAsked
    : !enough
      ? short
        ? WORDS.room.knockoutShort(game.minPlayers, playing.length)
        : WORDS.room.needPlayers(game.minPlayers, playing.length)
      : sittingOut && !isHost
        ? WORDS.room.knockoutWatching
      : broken !== undefined
        ? WORDS.room.brokenTeam(broken[0], broken[1], game.teamSize)
        : isHost
          ? allReady
            ? WORDS.room.hostAllReady
            : view.players.length > 1 && !wantBots
              ? WORDS.room.hostOthers
              : WORDS.room.hostReady(wantBots, alone)
          : allReady
            ? WORDS.room.allReady
            : amReady
              ? WORDS.room.waitHost
              : WORDS.room.pressReady;
  renderRoomBar();
}

function disconnect(): void {
  socket?.close();
  socket = null;
  roomDown = null;
}

/**
 * Opens a connection to `code`. `attemptsLeft` is how many more fresh codes
 * may be tried if this is a create and the code turns out to be in use.
 */
function connect(code: string, create: boolean, nick: string, attemptsLeft = 0): void {
  // whether this is a link's room being opened again under its code; going anywhere else lets that offer go
  const reopening = create && code === reopenCode;
  if (!reopening) reopenCode = null;
  // a connection opened ahead to this very room is the one used; one to any other room is let go
  const ahead = warm !== null && warm.code === code && isFresh(warm) ? warm.socket : null;
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
    parts: true,
  };

  const current = ahead ?? openRoom(code);
  socket = current;
  roomDown = null;
  // the room sends this connection the game whole once, and after that what has changed in it
  const read = gameReader();

  const greet = (): void => {
    // Fires again on every reconnect; the server expects `join` each time.
    current.send(JSON.stringify(join));
    // a connection that came back is a new one to the room: say again that this page is in voice
    voice.announce();
    online = true;
    roomDown = null;
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
    roomDown ??= Date.now();
    // a ping on its way is not coming back, and the next connection is measured anew
    pingSentAt = null;
    pingTimes = [];
    renderPing();
    staleSince ??= Date.now();
    // whatever the game screen had asked for and not heard back about is not coming
    table?.lost();
    chat.lost();
    unask();
    if (event.code === CLOSE_LEFT) {
      // The room let this player go without this page asking: they left in
      // another window, or were away so long that their place was given up.
      disconnect();
      writeAddress("");
      showLobby(WORDS.room.left);
      return;
    }
    renderStatus();
  });
  current.addEventListener("message", (event) => {
    if (socket !== current) return;
    // anything at all from the room says the connection lives, the answer to a ping included
    live = heard(live);
    if (event.data === PONG) {
      // A tab behind others is handed its messages late: what it would measure is its own wait, not the line's.
      if (pingSentAt !== null && document.visibilityState === "visible") {
        pingTimes = withSample(pingTimes, performance.now() - pingSentAt, roomConfig.latency);
        renderPing();
      }
      pingSentAt = null;
      return;
    }
    const message = parseServerMessage(event.data, read);
    if (message === null) return;
    heardAt = Date.now();
    // the room is there and has nothing new: that it was heard from is all there is to it
    if (message.type === "alive") return;
    if (message.type === "lobby") {
      // The room is made: from here on a reconnect only comes back to it. A
      // second "make" would be refused as a stranger's once the room has let
      // this player's slot go.
      join = { ...join, create: false };
      // a link's room that was to be opened again is open, by this player or by another before them
      reopenCode = null;
      reopenJoined = null;
      if (typeof event.data === "string") lastLobby = event.data;
      staleSince = null;
      returning = false;
      quickRest = null;
      renderRoom(code, message);
      // The room has a place of its own in the browser's history, above the lobby's, where the player pressed
      // their way in (`src/shared/back.ts`); the address of the place the page is at then names the room.
      back.sync();
      writeAddress(code);
      // the first time is measured as soon as the room is there, not a whole wait for a ping later
      if (pingTimes.length === 0 && pingSentAt === null) pingRoom();
      renderPing();
      heardBuild(message.build);
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
      // a game has begun that was not on a moment ago
      if (!over && !gameOn) call("started");
      gameOn = !over;
      // a game played to its end goes into the player's own record, once
      if (over && noteFinish(message)) syncRecord();
      if (over && (table === null || dismissedGame === message.startedAt)) {
        keepAwake();
        return;
      }
      shownGame = message.startedAt;
      if (typeof event.data === "string") lastGame = event.data;
      const shown = showTable(message.game);
      shown.update(message);
      // someone who has played a game to its end knows it
      if (over && shown.verdict() !== null) learn(message.game);
      // a turn that has just become this player's
      const waits = shown.waits?.() === true;
      if (waits && !waited) {
        call("turn");
        // a phone in the hand is felt as well as heard: its sound is often off
        buzz();
      }
      waited = waits;
      // whether the game is over, and with it whether there is a result to pass on
      syncShare();
      keepAwake();
      return;
    }
    if (message.type === "refused") {
      // Something asked of the room was not accepted; the connection is fine.
      if (message.reason === "chat-too-fast") {
        chat.note({ kind: "too-fast" });
      } else if (message.reason === "chat-nobody") {
        // those spoken to went before the line reached the room: the line is back in the box, and is for everyone now
        chatTo = { kind: "all" };
        chat.note({ kind: "to-gone" });
        renderTo();
      } else if (message.reason === "voice-not-here") {
        // the room went on the list between the button being shown and pressed
        voice.leave();
        chat.note({ kind: "voice-not-here" });
      } else if (table !== null) {
        table.refused(message.reason);
      } else {
        // what the buttons were saying ahead of the room is taken back
        unask();
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
    if (message.type === "host-check") {
      hostChecked();
      return;
    }
    if (message.type === "sent-out") {
      sentOut.add(message.slot);
      return;
    }
    if (message.type === "knocked") {
      // said of the room as it stands: the lobby that shows it comes after
      const nickOf = (slot: number): string | undefined => currentView?.players.find((p) => p.slot === slot)?.nick;
      for (const slot of message.out) {
        const nick = nickOf(slot);
        if (nick !== undefined) chat.note({ kind: "out", nick });
      }
      const champion = message.champion === null ? undefined : nickOf(message.champion);
      if (champion !== undefined) chat.note({ kind: "champion", nick: champion });
      wonJust = message.champion !== null;
      return;
    }
    if (message.type === "chat" || message.type === "quick") {
      const mine = currentView !== null && message.from === currentView.you;
      // one said with a press is put in this page's language here: the room said only which
      const text = message.type === "chat" ? message.text : WORDS.chat.quick[message.word];
      if (message.type === "chat") {
        // said aside: everyone it went to, as the room names them
        const to = message.toNick === undefined ? undefined : namesOf([message.toNick, ...(message.toMore ?? []).map((person) => person.nick)]);
        chat.said(message.nick, text, mine, to, message.from);
      }
      else chat.saidQuick(message.nick, message.word, mine, message.from);
      // someone whose lines this player covered calls nobody back to the tab and says nothing over their seat
      if (!mine && !hiddenPeople.has(personKey(message.from, message.nick))) {
        call("said");
        // over the speaker's seat too, so a line is seen without the chat on show
        if (table !== null) table.say(message.from, text);
        else scene?.say(message.from, text);
        if (table !== null && !chatOpen) {
          unread++;
          syncChat();
        }
      }
      return;
    }
    disconnect();
    const then = create ? afterRefusedMake(message.reason, reopening, attemptsLeft) : "tell";
    if (then === "another-code") {
      connect(generateRoomCode(Math.random, config), true, nick, attemptsLeft - 1);
      return;
    }
    if (then === "join") {
      // Someone else opened the link's room first: theirs is where the link leads now, and this player goes in.
      // Not under another code, which would be a room the link does not lead to.
      reopenCode = null;
      reopenJoined = code;
      setCreating(false);
      connect(code, false, nick);
      return;
    }
    // A quick join found the room full or gone by the time it got there: the next one waiting is tried.
    const next = message.reason === "full" || message.reason === "not-found" ? quickRest?.shift() : undefined;
    if (next !== undefined) {
      connect(next, false, nick);
      setEntering(next);
      renderRooms();
      return;
    }
    quickRest = null;
    writeAddress("");
    if (message.reason === "not-found" && code === invitedCode) {
      invitationGone();
      return;
    }
    if (message.reason === "not-found" && code === reopenJoined) {
      // The room could not be opened again and there is none to go into either (the limit on rooms made, most
      // likely): said as a room that could not be made, which is what was asked for.
      reopenJoined = null;
      showLobby(REJECT_TEXT["code-taken"]);
      return;
    }
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
  // under the code the form picked when it opened, which a connection may be open to already
  const code = nextCode ?? generateRoomCode(Math.random, config);
  nextCode = null;
  connect(code, true, nick, CREATE_ATTEMPTS - 1);
  setCreating(true);
}

/** Notes that a room is being made, or no longer: its button says so and takes no second press, which would start the making over. */
function setCreating(on: boolean): void {
  creating = on;
  const button = el<HTMLButtonElement>("create-go");
  button.textContent = on ? WORDS.newRoom.making : WORDS.newRoom.go;
  button.disabled = on;
  button.setAttribute("aria-busy", String(on));
}

/**
 * Asks the room for a change to the waiting room, and shows it at once.
 * Nothing is shown that could not be sent.
 */
function askRoom(message: ClientMessage, change: typeof asked): void {
  if (currentView === null || !send(message)) return;
  asked = { ...asked, ...change };
  renderRoom(currentCode, currentView);
}

/** Forgets what was asked of the room and not shown: it was refused, or the line dropped. The waiting room says again what the room last said. */
function unask(): void {
  const any = startAsked || Object.keys(asked).length > 0;
  asked = {};
  startAsked = false;
  if (any && currentView !== null && currentCode !== "") renderRoom(currentCode, currentView);
}

/** Enters the room `code`, from the list or from an address. */
function joinRoom(code: string): void {
  // pressed again on the way in: the first press stands, and the connection it opened is not thrown away for a new one
  if (entering === code && socket !== null) return;
  const nick = readNick();
  if (nick === null) return;
  // a room asked for by name is the only one tried
  quickRest = null;
  connect(code, false, nick);
  setEntering(code);
  notice.textContent = WORDS.entry.entering;
  renderRooms();
}

/**
 * Enters an open room that is waiting for players, the best to join first
 * (`quickPicks`): of the game picked over the list, or of every game. One
 * that has filled up or gone by the time this page gets there gives way to
 * the next (`connect`).
 */
function quickJoin(): void {
  if (entering !== null && socket !== null) return;
  if (readNick() === null) return;
  const shown = roomsSent === null ? null : roomsShown(roomsSent.rooms, roomsSent.counts, listedGame);
  const [first, ...rest] = quickPicks(shown?.rooms ?? []);
  if (first === undefined) {
    notice.textContent = WORDS.entry.noneWaiting;
    return;
  }
  joinRoom(first);
  quickRest = rest;
}

/** The code a link brought, for as long as the box for a room's code holds it: an invitation not yet taken up. */
let invitedCode = "";
/**
 * The code of a link whose room has closed, for as long as the lobby offers to open the room again under it
 * (`src/shared/reopen.ts`): the next room made here is made under this code, so the link leads to it. Let go once
 * the player goes anywhere else.
 */
let reopenCode: string | null = null;
/** The code of a room this page went into after it could not open it again, until the room has answered: whether there was one to go into. */
let reopenJoined: string | null = null;
/** The name the page put in the box for a nickname because the player had none kept (`suggestNick`); empty where it put none. While the box still holds it, nobody has chosen it. */
let suggestedNick = "";

/**
 * The game the link was for, where the page it came through said
 * (`invitePage` of `src/shared/site/pages.ts`). Read once and taken out of
 * the tab's storage: it is about the link that opened this page, not the
 * next one. Nothing where the link is an old one, or the storage is closed.
 */
function readInvitedGame(): GameId | null {
  try {
    const game = sessionStorage.getItem(INVITED_GAME_KEY);
    sessionStorage.removeItem(INVITED_GAME_KEY);
    return isGameId(game) ? game : null;
  } catch {
    return null;
  }
}
let invitedGame: GameId | null = readInvitedGame();

/**
 * The room a link led to is no more (its people left, and a room with
 * nobody in it is cleared away). "No such room" would end the visit of
 * someone who came for a game and has never seen the lobby: they are told
 * the room has closed and what there is instead. The dead code is taken out
 * of the box, so the lit button is the one that makes a room; where the link
 * said which game it was for, the rooms listed are that game's and a new
 * room starts as one of it. The room made is made under the link's own code
 * (`reopenCode`), so the link the others have leads to it; and as a room for
 * whoever has the link, not one on the list, unless its maker says otherwise.
 */
function invitationGone(): void {
  const game = invitedGame;
  reopenCode = invitedCode === "" ? null : invitedCode;
  chosenListed = false;
  invitedCode = "";
  invitedGame = null;
  codeInput.value = "";
  syncEntry();
  if (game !== null) chosenGame = game;
  showLobby(WORDS.entry.invitedGone);
  if (game !== null) pickGame(game);
}

/**
 * What the form says, and which of its buttons is the lit one, by what the
 * box for a room's code holds. Someone who opened a link to a room finds the
 * code in the box and nothing else changed: the form now says that they were
 * invited and what to do, and lights the button that goes there, where it
 * lit the one that makes a room of their own.
 */
function syncEntry(): void {
  const code = codeInput.value.trim().toUpperCase();
  const toRoom = isValidRoomCode(code, config);
  joinButton.classList.toggle("primary", toRoom);
  createButton.classList.toggle("primary", !toRoom);
  const named = suggestedNick !== "" && nickInput.value === suggestedNick;
  // a link that said when its people meet: the form says the time, while it stands
  const when = appointment !== null && appointment.code === code && appointmentStands(appointment.at, Date.now(), appointmentConfig) !== null ? whenOf(appointment.at) : null;
  // someone whose name is kept has nothing to put in: the link waited for them only because its time is still off
  const kept = !named && normalizeNick(nickInput.value, config) !== null;
  entrySub.textContent =
    toRoom && code === invitedCode ? (named ? WORDS.entry.invitedNamed(code, when) : when !== null && kept ? WORDS.entry.invitedEarly(when) : WORDS.entry.invited(code, when)) : WORDS.entry.sub;
  syncCalendar();
  syncTurn();
}

/**
 * Says on the notice a phone held upright shows, over the words that ask for
 * the turn, what the link that brought the reader is to: the game where the
 * link said, else the room's code, and under it when its people meet where
 * it says that. The notice covers the whole page, so without this someone
 * who tapped a friend's link sees no sign that it led anywhere. Said while
 * the invitation is not yet taken up: in a room there is nothing to add.
 */
function syncTurn(): void {
  const code = codeInput.value.trim().toUpperCase();
  const invited = currentCode === "" && invitedCode !== "" && code === invitedCode;
  turnInvited.hidden = !invited;
  if (!invited) return;
  const said = WORDS.site.turnInvited(invitedGame === null ? null : GAMES[invitedGame].title[lang], code);
  const stands = appointment !== null && appointment.code === code && appointmentStands(appointment.at, Date.now(), appointmentConfig) !== null;
  turnInvited.textContent = stands && appointment !== null ? `${said}\n${WORDS.site.turnWhen(whenOf(appointment.at))}` : said;
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
  showOptions(false);
  voice.leave();
  send({ type: "leave" });
  disconnect();
  writeAddress("");
  codeInput.value = "";
  syncEntry();
  showLobby();
}

createButton.addEventListener("click", showNewRoom);
quickButton.addEventListener("click", quickJoin);
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
joinButton.addEventListener("click", joinFromInput);
codeInput.addEventListener("input", () => {
  syncEntry();
  // a whole code in the box is a room about to be gone into
  warmRest();
});
// what the form says of the name in the box holds only while the box holds the name the page offered
nickInput.addEventListener("input", syncEntry);
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
startButton.addEventListener("click", () => {
  // pressed once: a second start would reach the room with the game on, and be refused on the game's own screen
  if (startAsked || currentView === null || !send({ type: "start", bots: wantBots })) return;
  startAsked = true;
  renderRoom(currentCode, currentView);
});
readyButton.addEventListener("click", () => {
  const view = currentView;
  if (view === null) return;
  const ready = !(asked.ready ?? view.players.find((p) => p.slot === view.you)?.ready ?? false);
  askRoom({ type: "ready", ready }, { ready });
});
// The host presses a player's figure, or their name, for what can be done with them.
sceneCanvas.addEventListener("click", (event) => {
  const view = currentView;
  if (!isHost || view === null || scene === null || table !== null) return;
  const box = sceneCanvas.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  // the frame is drawn larger or smaller than its own pixels: the press is put back into them
  const x = ((event.clientX - box.left) / box.width) * sceneCanvas.width;
  const y = ((event.clientY - box.top) / box.height) * sceneCanvas.height;
  const slot = scene.slotAt(x, y);
  showSeatMenu(slot === view.you ? null : slot, x, y);
});
seatHost.addEventListener("click", () => {
  if (seatShown !== null) send({ type: "host", to: seatShown });
  showSeatMenu(null);
});
seatKick.addEventListener("click", () => {
  // twice, as the way out of a game is: nobody is sent out by a slip
  if (!kickArmed) {
    kickArmed = true;
    syncSeatMenu();
    return;
  }
  if (seatShown !== null) send({ type: "kick", slot: seatShown });
  showSeatMenu(null);
});
el<HTMLButtonElement>("seat-close").addEventListener("click", () => showSeatMenu(null));
swapButton.addEventListener("click", () => showSwap(swapSheet.hidden === true));
el<HTMLButtonElement>("swap-close").addEventListener("click", () => showSwap(false));
// the room answers with the lobby, and the sheet, drawn again with it, says what it is now
swapKnockout.addEventListener("click", () => send({ type: "knockout", on: currentView?.knockout !== true }));
window.addEventListener("pointerdown", noteInput, true);
window.addEventListener("keydown", noteInput, true);
listingButton.addEventListener("click", () => {
  if (currentView === null) return;
  const listed = !(asked.listed ?? currentView.listed);
  askRoom({ type: "listing", listed }, { listed });
});
teamButton.addEventListener("click", () => {
  // each press moves on: alone, then each team the game has room for, and round again
  const view = currentView;
  if (view === null || !isGameId(view.game)) return;
  const mine = asked.team ?? view.players.find((p) => p.slot === view.you)?.team ?? 0;
  const team = (mine + 1) % (teamsIn(view.game, config) + 1);
  askRoom({ type: "team", team }, { team });
});
clockButton.addEventListener("click", () => {
  // each press moves to the next length the room offers, round to the first
  if (currentView === null) return;
  const choices = config.turnSecondsChoices;
  const at = choices.indexOf(asked.turnSeconds ?? currentView.turnSeconds);
  const seconds = choices[(at + 1) % choices.length];
  askRoom({ type: "clock", seconds }, { turnSeconds: seconds });
});

variantButton.addEventListener("click", () => {
  // each press moves to the next way the game can be played, round to the first
  const view = currentView;
  if (view === null || !isGameId(view.game)) return;
  const variants = GAMES[view.game].variants;
  if (variants.length === 0) return;
  const at = variants.findIndex((each) => each.id === (asked.variant ?? view.variant));
  const variant = variants[(at + 1) % variants.length].id;
  askRoom({ type: "variant", variant }, { variant });
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

/**
 * Passes `text` on with the address `url`: under a finger by the phone's own
 * sheet, where it has one, which goes straight to a messenger; else by
 * copying `pasted`, for the player to paste. `button` says for a moment how
 * it went, and `failed` is called when nothing could be copied.
 */
function passOn(
  button: HTMLButtonElement,
  label: string,
  text: string,
  url: string,
  pasted: string,
  failed: () => void = () => undefined,
  went: () => void = () => undefined,
): void {
  const done = (said: string): void => {
    button.textContent = said;
    setTimeout(() => {
      button.textContent = label;
    }, 1500);
  };
  const copy = (): void => {
    // no clipboard here (an old browser, or a page not served securely) is a failure like any other
    const copying = navigator.clipboard === undefined ? Promise.reject(new Error("no clipboard")) : navigator.clipboard.writeText(pasted);
    copying.then(
      () => {
        done(WORDS.room.copied);
        went();
      },
      () => {
        done(WORDS.room.copyFailed);
        failed();
      },
    );
  };
  if (!TOUCH || typeof navigator.share !== "function") return copy();
  navigator.share(text === "" ? { url } : { text, url }).then(went, (error: unknown) => {
    // the sheet put away by the player is no failure; a browser that would not open it copies instead
    if (!(error instanceof DOMException && error.name === "AbortError")) copy();
  });
}

copyButton.addEventListener("click", () => {
  const invited = currentView !== null && isGameId(currentView.game) ? currentView.game : null;
  // Through the page that tells whatever draws a card for a link (a messenger) which game this is, in the
  // language of the one inviting; it goes on to the room at once. The code follows the `#` and is sent to nobody.
  const link = `${location.origin}${invited === null ? location.pathname : invitePath(lang, invited)}#${currentCode}`;
  const game = invited === null ? "" : GAMES[invited].title[lang];
  // copied, it is the link alone, as an address is pasted; the sheet sends a line with it
  passOn(copyButton, WORDS.room.copy, game === "" ? "" : WORDS.share.invite(game), link, link, () => {
    // the code is on screen to read out
    hint = WORDS.room.copyFailedHint(currentCode);
    renderRoomBar();
  });
});

/** The picture of a result: three of its pixels to one of the frame's, and under the frame a strip a line of the bar tall. */
const PICTURE = { scale: 3, stripHeight: 16, name: "brain-survival.png" };

/**
 * Passes the picture of a result on with its line `text` and the address
 * `url`: under a finger by the phone's own sheet, where that takes a file;
 * else onto the clipboard beside `pasted`, so that what is pasted into a
 * messenger is the picture and what is pasted into a box of words is the
 * line. Where the picture cannot go either way, `plain` passes the line on
 * alone.
 */
function passPicture(button: HTMLButtonElement, label: string, picture: Blob, text: string, url: string, pasted: string, plain: () => void): void {
  if (TOUCH && typeof navigator.share === "function") {
    const file = new File([picture], PICTURE.name, { type: "image/png" });
    if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) return plain();
    navigator.share({ files: [file], text, url }).catch((error: unknown) => {
      // the sheet put away by the player is no failure
      if (!(error instanceof DOMException && error.name === "AbortError")) plain();
    });
    return;
  }
  if (navigator.clipboard === undefined || typeof navigator.clipboard.write !== "function" || typeof ClipboardItem === "undefined") return plain();
  navigator.clipboard.write([new ClipboardItem({ "image/png": picture, "text/plain": new Blob([pasted], { type: "text/plain" }) })]).then(() => {
    button.textContent = WORDS.share.pictureCopied;
    setTimeout(() => {
      button.textContent = label;
    }, 1500);
  }, plain);
}

// The result of the game that is over, as a picture of its screen and in a line, with where the game is played:
// never the room's code, which is not for everyone and is on no game's screen.
tabShare.addEventListener("click", () => {
  const verdict = table?.verdict() ?? null;
  if (table === null || verdict === null || tableGame === null) return;
  const said = `${WORDS.share.result(GAMES[tableGame].title[lang], verdict)} · ${WORDS.share.come}`;
  const address = `${location.origin}/`;
  const plain = (): void => passOn(tabShare, WORDS.game.share, said, address, `${said}\n${address}`);
  // made in the press itself: a browser hands a file on only in the press that asked for it
  const under = table.under?.() ?? null;
  const picture = pictureOf(
    [...(under === null ? [] : [{ ...under, smooth: true }]), { canvas: tableCanvas, width: tableCanvas.width, height: tableCanvas.height, smooth: false }],
    {
      width: tableCanvas.width,
      height: tableCanvas.height,
      scale: PICTURE.scale,
      ground: C.night,
      strip: { height: PICTURE.stripHeight, ground: C.bar, ink: C.boneD, text: location.host },
    },
  );
  if (picture === null) return plain();
  passPicture(tabShare, WORDS.game.share, picture, said, address, `${said}\n${address}`, plain);
});

/** Where it is kept that this browser's player has been told what voice chat lets the others in it learn. */
const VOICE_TOLD_KEY = storageKey("voice-told");

/** Whether this browser's player has turned voice chat on after being told. A browser that keeps nothing is told each time. */
function voiceTold(): boolean {
  try {
    return localStorage.getItem(VOICE_TOLD_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Opens what is said before voice chat is first turned on in this browser,
 * or puts it away. Voice goes from one player's device straight to another's,
 * so those in it together can learn each other's network address: that is
 * the player's to know before it happens, not after.
 */
function showVoiceAsk(open: boolean): void {
  if (voiceSheet.hidden === !open) return;
  const within = voiceSheet.contains(document.activeElement);
  voiceSheet.hidden = !open;
  if (open) {
    // the keys land on the answer that changes nothing: a key held down on the button that opened this turns nothing on
    voiceAskOff.focus({ preventScroll: true });
  } else if (within) {
    if (voiceToggle.hidden || voiceBox.hidden) (document.activeElement as HTMLElement | null)?.blur();
    else voiceToggle.focus({ preventScroll: true });
  }
}

/** Comes into the room's voice chat, and says in the room's log how. Called from a press: the browser asks for the microphone only then. */
function joinVoice(): void {
  void voice.join().then(() => {
    if (!voice.on) return;
    chat.note({ kind: voice.hasMic ? "voice-joined" : "voice-listen-only" });
  });
}

// The voice chat: in and out, and the microphone on and off.
voiceToggle.addEventListener("click", () => {
  if (voice.on) {
    voice.leave();
    return;
  }
  if (!voiceTold()) {
    showVoiceAsk(true);
    return;
  }
  joinVoice();
});
voiceAskOff.addEventListener("click", () => showVoiceAsk(false));
voiceAskOn.addEventListener("click", () => {
  try {
    localStorage.setItem(VOICE_TOLD_KEY, "1");
  } catch {
    // a full or closed store only means it is said again next time
  }
  showVoiceAsk(false);
  joinVoice();
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
  if (tableGame !== null) learn(tableGame);
});
// One press, one level louder, and after the loudest, silence: the sound of the press says how loud it now is.
for (const button of [menuSound, soundButton]) {
  button.addEventListener("click", () => {
    startAudio();
    stepSound();
    renderSound();
  });
}
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
    if (!isBox(event.target)) event.preventDefault();
  });
}

// During a game: the tabs over the right-hand column, and T for the chat.
tabLog.addEventListener("click", () => openChat(false));
tabChat.addEventListener("click", () => openChat(true));
// A button pressed with the mouse keeps the focus, and the next Enter or Space meant for the game
// would press it again. The ones that lie over the game give the focus back; reached and pressed
// from the keyboard (no mouse: `detail` is 0) they keep it, and the key is theirs.
// The chat's own button is one of them: after a line is sent with the mouse it would stay under the
// keys with the box empty, where a press of it asks for the words said with one press.
for (const button of [leaveGameButton, voiceToggle, voiceMic, tabLog, tabChat, tabShare, chatSend, chatToButton, menuOpen, menuRules, menuSound, menuFull, menuClose]) {
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
  const game = rulesGame();
  // someone who has opened a game's rules is not pointed to them again
  learn(game);
  lightRules();
  const sheet = CLIENTS[game].sheet;
  const title = document.createElement("h2");
  title.textContent = sheet.title;
  // the rules in three lines first, each under what it answers; the sheet itself follows
  const brief = document.createElement("dl");
  brief.className = "brief";
  for (const line of ["goal", "play", "end"] as const) {
    brief.appendChild(document.createElement("dt")).textContent = WORDS.brief[line];
    brief.appendChild(document.createElement("dd")).textContent = sheet.brief[line];
  }
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
  rulesSheet.replaceChildren(title, brief, ...parts);
  rulesSheet.scrollTop = 0;
  rules.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rules.hidden = true;
});
// H during a game opens the game's own rules (each game's screen takes the key): whoever pressed it has seen where they are.
addEventListener("keydown", (event) => {
  if (event.code === "KeyH" && table !== null && tableGame !== null && !isBox(event.target)) learn(tableGame);
});
/** The sheets that are laid over a screen one at a time, the one closed first named first, each with the way to close it. */
const SHEETS: readonly (readonly [HTMLElement, () => void])[] = [
  [voiceSheet, () => showVoiceAsk(false)],
  [seatMenu, () => showSeatMenu(null)],
  [swapSheet, () => showSwap(false)],
  [quickSheet, () => showQuick(false)],
  [toSheet, () => showTo(false)],
  [whoSheet, () => showWho(null)],
  [optionsSheet, () => showOptions(false)],
  [whenSheet, () => showWhen(false)],
  [feedbackSheet, () => showFeedback(false)],
  [recordSheet, () => showRecord(false)],
  [tallySheet, () => showTally(false)],
  [inboxSheet, () => showInbox(false)],
  [
    rules,
    () => {
      rules.hidden = true;
    },
  ],
  [newRoom, closeNewRoom],
  [
    roomsGames,
    () => {
      showGamePicks(false);
      roomsPick.focus();
    },
  ],
];

/** Closes the topmost sheet that is open, and says whether there was one. */
function closeTop(): boolean {
  const top = SHEETS.find(([sheet]) => !sheet.hidden);
  top?.[1]();
  return top !== undefined;
}

addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!gameMenu.hidden) openMenu(false);
  else closeTop();
});

/** The page's own address: the room it is in after `#`, nothing after it in the lobby. */
function addressOf(code: string): string {
  return `${location.pathname}${location.search}${code === "" ? "" : `#${code}`}`;
}

/**
 * Writes the address of `code`'s room (of the lobby for "") on the place in
 * the browser's history the page is at, keeping what is kept with that place:
 * it is how the page knows its own places (`src/shared/back.ts`).
 */
function writeAddress(code: string): void {
  history.replaceState(history.state, "", addressOf(code));
}

/** Whether anything has been pressed or typed on the page since the browser last moved it through its history. */
let touchedSinceMoved = false;

/**
 * The browser's back button, and a phone's back gesture, inside the page
 * (`src/shared/back.ts`): a step to the screen before, and out of the site
 * only from the lobby with nothing open.
 *
 * A room is one step from the lobby and a game one more; each sheet that is
 * open is one more again. A step back closes the topmost sheet; with none
 * open it leaves a waiting room for the lobby, and in a game it asks first,
 * as the game's own way out does: the first press says "once more to leave"
 * (under a finger in the menu, where that button is), the next one leaves.
 */
const back = backTrail(
  {
    state: () => history.state as unknown,
    hold: (held) => history.pushState(held, "", addressOf(currentCode)),
    go: (by) => history.go(by),
    settle: () => writeAddress(currentCode),
    mark: () => history.replaceState(FIRST, "", location.href),
    touched: () => touchedSinceMoved,
  },
  {
    depth: () => (currentCode === "" ? 0 : table === null ? 1 : 2) + SHEETS.filter(([sheet]) => !sheet.hidden).length,
    step: () => {
      if (closeTop() || currentCode === "") return;
      if (table === null) return leaveRoom();
      if (leaveArmed !== null) {
        disarmLeave();
        leaveRoom();
        return;
      }
      // the game's own way out, pressed once: it says a second press leaves. Under a finger it is in the menu.
      if (TOUCH) openMenu(true);
      leaveGameButton.click();
    },
  },
);
addEventListener("popstate", () => {
  touchedSinceMoved = false;
  back.arrived();
});
// What was pressed opens or closes something only after this has heard of the press: a place is added for it at once.
for (const pressed of ["pointerup", "keydown"]) {
  addEventListener(
    pressed,
    () => {
      touchedSinceMoved = true;
      back.sync();
    },
    true,
  );
}
// Every screen and sheet is shown and put away by its `hidden`: whatever changes one may have changed how deep the page is.
new MutationObserver(() => back.sync()).observe(frame, { attributes: true, attributeFilter: ["hidden"], subtree: true });

/**
 * Goes to the room the address names after `#`, if it names one this page is
 * not in: with the saved nickname straight in, without one to the lobby with
 * the code filled in. An address that names no room is put back to say where
 * this page is.
 */
function followAddress(): void {
  // The address was changed under the page: the place the browser added for it is one the page knows from here on
  // (`src/shared/back.ts`). A browser that says so before this is heard has had it marked already.
  if (!isKnown(history.state)) history.replaceState(FIRST, "", location.href);
  // the room's code, and after it the time its people meet, where the link says one (`src/shared/appointment.ts`)
  const { code: linked, at } = parseLinked(location.hash.slice(1));
  if (linked === currentCode) return;
  if (!isValidRoomCode(linked, config)) {
    writeAddress(currentCode);
    return;
  }
  const stands = at === null ? null : appointmentStands(at, Date.now(), appointmentConfig);
  appointment = at === null || stands === null ? null : { code: linked, at, game: invitedGame };
  if (socket !== null) {
    // an invitation opened from inside another room: that room is left
    voice.leave();
    send({ type: "leave" });
    disconnect();
    showLobby();
  }
  codeInput.value = linked;
  invitedCode = linked;
  syncEntry();
  // whoever was invited is a nickname and a press away from the room: the connection is opened meanwhile
  warmRest();
  const nick = normalizeNick(nickInput.value, config);
  // A name the page offered takes nobody into a room by itself: it is seen first, and one press goes in with it.
  // Nor does a link whose time is still some way off: the time is what it was opened for, and is read first
  // (with the calendar link under it); the lit button goes in now all the same.
  if (nick !== null && nickInput.value !== suggestedNick && stands !== "ahead") connect(linked, false, nick);
  else if (nick !== null && nickInput.value !== suggestedNick) joinButton.focus({ preventScroll: true });
  else if (nick === null) nickInput.focus();
  else if (!TOUCH) {
    nickInput.focus();
    nickInput.select();
  }
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
  if (looked.ping) pingRoom();
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

// A connection that stays down is asked for again every few seconds, without
// end. On a page nobody is looking at that goes on for as long as the tab is
// left open, and every try that gets as far as the server is counted against
// what the game has for a day: such a page stops after a while (`givenUp`).
// `wake` opens the connection again the moment the page is looked at.
const GIVE_UP_CHECK_MS = 5000;
setInterval(() => {
  const now = Date.now();
  const hidden = document.visibilityState === "hidden";
  if (socket !== null && socket.shouldReconnect && givenUp(roomDown, now, hidden, config)) socket.close();
  if (listSocket !== null && listSocket.shouldReconnect && givenUp(listDown, now, hidden, config)) listSocket.close();
}, GIVE_UP_CHECK_MS);
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
  const { code } = parseLinked(location.hash.slice(1));
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
      syncShare();
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
// Someone with no name kept finds one in the box, to go in with as it is or to type their own over.
if (nickInput.value === "") {
  suggestedNick = suggestNick(lang, nickWords, Math.random, config.nickMaxLength);
  nickInput.value = suggestedNick;
}
// Loaded again in a room, the room is on the screen at once; anywhere else, the lobby.
if (!comeBack()) showLobby();
followAddress();
// Loaded again, the browser has kept the places this page held before: those there are too many of are stepped off.
back.start();
// Ready to be typed in at once where there are keys. Under a finger a box that takes the focus by
// itself brings the keyboard up over the list of rooms before anything has been read.
if (socket === null && !TOUCH) {
  nickInput.focus();
  // an offered name is typed over, not added to
  if (suggestedNick !== "" && nickInput.value === suggestedNick) nickInput.select();
}

/**
 * The page's own words, in each language (`lang.ts`): the lobby, making a
 * room, the room before a game, the chat and the voice controls. A game's
 * words are beside its screen.
 *
 * Buttons are a fixed number of pixels wide and the bar under the frame holds
 * three lines: a sentence changed here is looked at on the page it is on.
 */
import { GAME_IDS } from "../shared/games";
import type { RejectReason } from "../shared/protocol";
import { SITE_WORDS } from "../shared/site/words";
import { words } from "./lang";

const ko = {
  site: {
    title: "게임 로비",
    // the tab's title in the lobby and what a search result says of the page: written with the pages a search engine reads
    tab: SITE_WORDS.ko.app.title,
    description: SITE_WORDS.ko.app.description(GAME_IDS.length),
    turnDevice: "화면을 가로로 돌려 주세요",
    /** On the button that turns the page itself, where the browser can. */
    turnFull: "가로 전체 화면으로 보기",
    /** In the lobby's bar: which build the page is, to name when something is reported. */
    version: (build: string) => `버전 ${build}`,
    /** On the button that opens the sheet for a word about the game. */
    feedback: "의견 보내기",
  },
  /** A word about the game, for whoever makes it: the sheet it is written on. */
  feedback: {
    title: "의견 보내기",
    hint: "버그, 불편한 점, 바라는 점을 적어 주세요. 닉네임이나 연락처는 함께 가지 않으니, 답을 받으려면 연락처를 적어 주세요.",
    box: "보낼 내용",
    send: "보내기",
    sending: "보내는 중…",
    close: "닫기",
    empty: "내용을 적어 주세요.",
    sent: "보냈습니다. 고맙습니다.",
    failed: "지금은 보내지 못했습니다. 잠시 뒤에 다시 보내 주세요.",
  },
  /** What players have written about the game, for whoever makes it: opened with `?inbox` and the key. */
  inbox: {
    title: "의견함",
    key: "열쇠",
    open: "열기",
    opening: "여는 중…",
    close: "닫기",
    refused: "열지 못했습니다. 열쇠를 확인하고, 여러 번 틀렸다면 10분 뒤에 다시 해 주세요.",
    offline: "서버에 연결되지 않았습니다. 잠시 뒤에 다시 해 주세요.",
    none: "아직 온 의견이 없습니다.",
    count: (count: number) => `의견 ${count}건, 새것부터`,
    /** Over each: when it was written, and the language and build of the page it was written on. */
    head: (when: string, lang: string, build: string) => `${when} · ${lang} · ${build}`,
    drop: "지우기",
    dropConfirm: "한 번 더 누르면 지움",
  },
  entry: {
    sub: "방을 고르거나 만드세요",
    nick: "닉네임",
    create: "방 만들기",
    /** Beside it: straight into an open room that is waiting for players. */
    quick: "빠른 입장",
    quickHint: "사람을 기다리는 공개 방으로 바로 들어갑니다",
    /** Under the form, when no open room is waiting for players. */
    noneWaiting: "기다리는 방이 없습니다. 방을 만들어 보세요.",
    byCode: "방 코드로 입장",
    code: "방 코드",
    join: "입장",
    /** Under the form, from the press that asks for a room until the room answers. */
    entering: "방에 들어가는 중입니다.",
  },
  rooms: {
    title: "열린 방",
    count: (rooms: number) => `${rooms}개`,
    /** Beside the heading, which says what is counted: in English the number alone, so the widest name of a game fits on the button beside it. */
    total: (rooms: number) => `${rooms}개`,
    loading: "방 목록을 불러오는 중입니다.",
    none: "열린 방이 없습니다. 공개 방을 만들면 여기에 올라와 누구나 들어올 수 있습니다.",
    of: (host: string) => `${host}의 방`,
    full: "가득 참",
    playing: "게임 중 · 들어가면 관전",
    waitingFor: (more: number) => `대기 중 · ${more}명 더 오면 시작`,
    waiting: "대기 중 · 곧 시작",
    /** On the row that was pressed, in place of how the room stands, until the room answers. */
    entering: "들어가는 중…",
    /** On the button that picks whose rooms are listed, and first among the games it offers. */
    everyGame: "모든 게임",
    /** What the games to pick from are, said to a screen reader. */
    pick: "게임별로 보기",
    noneOf: (game: string) => `${game}의 열린 방이 없습니다. 공개 방을 만들면 여기에 올라옵니다.`,
    /** Under the last row, when there are more rooms than the list holds: of every game, and of the game picked. */
    moreOfAll: (rooms: number) => `${rooms}개 더 있습니다. 위에서 게임을 골라 좁혀 보세요.`,
    moreOfGame: (rooms: number) => `${rooms}개 더 있습니다. 들어가기 좋은 방부터 보여 줍니다.`,
  },
  newRoom: {
    title: "새 방",
    game: "게임",
    who: "누가 들어올 수 있나요",
    listed: "공개",
    unlisted: "비공개",
    cancel: "취소",
    go: "만들기",
    /** On the same button, from the press until the room is there. */
    making: "만드는 중…",
    listedHint: "목록에 보여 누구나 들어옵니다.",
    unlistedHint: "링크나 코드를 아는 사람만 들어옵니다.",
    /** How long a turn is when the room is made; `seconds` 0 is no limit. */
    startsAt: (seconds: number) => (seconds > 0 ? `차례 ${seconds}초로 시작.` : "차례 무제한으로 시작."),
    howMany: (min: number, max: number) => (min === 1 ? `혼자서도 할 수 있고, ${max}명까지 함께 합니다.` : `${min}명부터 ${max}명까지 함께 합니다.`),
  },
  room: {
    start: "게임 시작",
    /** On the same button, from the host's press until the game is on the screen. */
    starting: "시작하는 중…",
    leave: "나가기",
    copy: "링크 복사",
    copied: "복사됨",
    copyFailed: "복사 실패",
    copyFailedHint: (code: string) => `링크를 복사하지 못했습니다. 방 코드 ${code}를 알려 주세요.`,
    toUnlisted: "비공개로",
    toListed: "공개로",
    /** How the length of a turn is said on its button; `seconds` 0 is no limit. */
    clock: (seconds: number) => (seconds > 0 ? `차례 ${seconds}초` : "차례 무제한"),
    clockHost: "누르면 차례 제한 시간을 바꿉니다",
    clockGuest: "차례 제한 시간은 방장이 정합니다",
    variantHost: "누르면 이 방에서 하는 방식을 바꿉니다",
    variantGuest: "어떤 방식으로 할지는 방장이 정합니다",
    solo: "혼자 하기",
    team: (team: number, leads: boolean) => (leads ? `팀 ${team} 대표` : `팀 ${team}`),
    teamHelp: (size: number) => `누르면 바뀝니다: 혼자, 또는 ${size}명이 한 팀. 팀을 먼저 고른 사람이 대표입니다`,
    /** The lines over the room's code: the game, who can come in and how many are here. */
    status: (game: string, listed: boolean, here: number, max: number) => [`${game} · ${listed ? "공개" : "비공개"} · ${here}/${max}`],
    /** The same on two lines, for a game whose name leaves no room beside it. */
    statusTall: (game: string, listed: boolean, here: number, max: number) => [game, `${listed ? "공개" : "비공개"} · ${here}/${max}`],
    statusSpoken: (here: number, max: number) => `${here}명 접속, 최대 ${max}명`,
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    /** Over the room's code when the page was loaded again and the room has not answered yet. */
    returning: "방으로 돌아오는 중",
    newGame: "새 게임",
    /** On the host's button that opens the choice of another game for the room: short, beside two others. */
    swap: "게임",
    swapHelp: "누르면 이 방에서 할 게임을 바꿉니다",
    /** In the chat, when the host has made the room one for another game. */
    gameChanged: (game: string) => `이제 이 방의 게임은 ${game}입니다`,
    /** On the button of everyone but the host: said once, taken back with the same button. */
    ready: "준비",
    unready: "준비 취소",
    seat: (seat: number, nick: string, me: boolean, connected: boolean, ready: boolean) =>
      `${seat}번 ${nick}${me ? " (나)" : ""}: ${connected ? (ready ? "준비" : "접속") : "끊김"}`,
    emptySeat: (seat: number) => `${seat}번 빈 자리`,
    came: (nick: string) => `${nick} 님이 들어왔습니다`,
    went: (nick: string) => `${nick} 님이 나갔습니다`,
    becameHost: (nick: string) => `${nick} 님이 방장이 됐습니다`,
    needPlayers: (min: number, here: number) => `${min}명이 모이면 방장이 시작할 수 있습니다. 지금 ${here}명.`,
    brokenTeam: (team: number, size: number, teamSize: number) =>
      `팀 ${team}은 ${size}명이라 팀이 아닙니다 (${teamSize}명이어야 함). 시작하면 각자 혼자 합니다.`,
    hostReady: (bots: boolean, alone: boolean) => `${bots ? "빈 자리는 봇이 채웁니다 (개발용). " : ""}${alone ? "혼자서도 할 수 있습니다. " : ""}준비되면 시작하세요.`,
    /** To the host with others in the room: what a press on one of them does. */
    hostOthers: "준비되면 시작하세요. 인물을 누르면 방장을 넘기거나 내보냅니다.",
    hostAllReady: "모두 준비했습니다. 게임을 시작하세요.",
    /** To the host, when the room has asked whether they are there and nothing was pressed lately. */
    hostAsked: "자리에 계신가요? 아무 곳이나 누르면 방장으로 남습니다.",
    pressReady: "준비되면 준비를 눌러 주세요.",
    waitHost: "방장이 시작하기를 기다리는 중입니다.",
    allReady: "모두 준비했습니다. 방장이 자리에 없으면 방장이 넘어갑니다.",
    /** What the host can do with another player, on the menu a press on their figure opens. */
    seatMenu: {
      host: "방장 넘기기",
      kick: "내보내기",
      kickConfirm: "한 번 더 누르면 내보냄",
      close: "닫기",
    },
    reloadForGame: "새로고침하면 이 게임을 할 수 있습니다.",
    left: "방에서 나왔습니다. 다른 창에서 나갔거나 자리를 오래 비웠습니다.",
  },
  /** At the head of the tab's title while the tab is behind others: what there is to come back for. Short: a title is cut. */
  call: {
    said: "새 채팅",
    came: "누가 들어옴",
    started: "게임 시작",
    host: "방장 확인",
    turn: "내 차례",
  },
  /** The host's choice of another game for the room. */
  swap: {
    title: "게임 바꾸기",
    hint: "바꾸면 준비 표시와 팀 선택은 처음으로 돌아갑니다.",
    tooMany: "지금 인원이 다 들어가지 않는 게임은 고를 수 없습니다.",
    close: "닫기",
  },
  /** In the picture of the room: the marks beside a figure. */
  scene: {
    host: "방장",
    offline: "끊김",
    team: (team: number) => `팀 ${team}`,
  },
  bar: {
    lobby: ["열린 방에 들어가거나, 방을 만들어 사람들을 모으세요.", "친구끼리만 하려면 비공개 방을 만들고 초대 링크를 보내세요."],
    rules: "규칙 보기",
    close: "닫기",
  },
  game: {
    leave: "나가기",
    leaveConfirm: "한 번 더 누르면 나감",
    tabs: "오른쪽 칸에 보일 것",
    log: "기록",
    standings: "현황",
    chat: (unread: number) => (unread > 0 ? `채팅 ${unread}` : "채팅"),
    /** Beside them once a game is over, for whoever played it: passes its result on. */
    share: "공유",
    shareHint: "내 결과를 복사해 알리기",
    /** Said to a screen reader of the game's screen, which is a picture. */
    screen: "게임 화면",
  },
  /**
   * What is passed on outside the game, by the phone's own sheet or by copying: an invitation to a
   * room, and the result of a game. A game is named by its own name and nothing else is said of
   * where it is from.
   */
  share: {
    /** With the link to a room. */
    invite: (game: string) => `${game} 같이 해요`,
    /** `verdict` is the word the game's results lead with: "2위", "생존!". */
    result: (game: string, verdict: string) => `${game}에서 ${verdict}`,
    /** After the result, before the address of the game. */
    come: "같이 한 판 해요",
  },
  /** Under a finger, during a game: the button over the game, and what it opens. */
  menu: {
    open: "메뉴",
    /** In a game's bar, where it tells a player with keys which of them open the rules and mute the sound. */
    hint: "규칙 · 소리 · 나가기: 왼쪽 위 메뉴",
    label: "게임 메뉴",
    rules: "규칙 보기",
    soundOn: "소리 켬",
    soundOff: "소리 끔",
    full: "전체 화면",
    fullExit: "전체 화면 끝내기",
    close: "닫기",
  },
  voice: {
    label: "음성 채팅",
    unlistedOnly: "음성 채팅은 비공개 방에서만",
    leave: "음성 나가기",
    join: "음성 채팅 켜기",
    joinInGame: "음성 켜기",
    noMic: "마이크 없음",
    micOff: "마이크 끔",
    micOn: "마이크 켬",
    joined: "음성 채팅에 들어왔습니다. 음성은 방 사람들의 기기와 직접 주고받습니다.",
    listenOnly: "마이크를 쓸 수 없어 듣기만 합니다. 브라우저의 마이크 권한을 확인해 주세요.",
    notHere: "이 방에서는 음성 채팅을 쓸 수 없습니다.",
  },
  chat: {
    label: "채팅",
    say: "할 말",
    send: "전송",
    notSent: "연결이 끊겨 보내지 못했습니다. 다시 연결되면 보내 주세요.",
    tooFast: "너무 빨리 보내고 있습니다. 잠시 뒤에 다시 보내세요.",
  },
  /** Why the room would not let this page in. */
  reject: {
    "full": "방이 가득 찼습니다.",
    "bad-nick": "닉네임을 입력해 주세요.",
    "bad-token": "브라우저 저장 정보가 손상됐습니다. 새로고침해 주세요.",
    "bad-room": "방 코드 형식이 올바르지 않습니다.",
    "not-found": "그런 방이 없습니다.",
    "code-taken": "방을 만들지 못했습니다. 다시 시도해 주세요.",
    "join-timeout": "연결이 너무 오래 걸렸습니다. 다시 시도해 주세요.",
    "kicked": "방장이 이 방에서 내보냈습니다.",
  } satisfies Record<RejectReason, string>,
  /** Why something asked of the room was refused, for the waiting room. Refused moves are explained on the game screen. */
  refused: {
    "not-host": "방장만 할 수 있습니다.",
    "bad-player-count": "지금 인원으로는 시작할 수 없습니다.",
    "bad-teams": "팀 인원이 맞지 않아 시작할 수 없습니다.",
    "too-few": "인원이 모자라 시작할 수 없습니다.",
    "already-playing": "이미 판이 진행 중입니다.",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다.",
    "bad-setting": "그 설정은 이 방에서 쓸 수 없습니다.",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요.",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다.",
};

const en: typeof ko = {
  site: {
    title: "Game Lobby",
    tab: SITE_WORDS.en.app.title,
    description: SITE_WORDS.en.app.description(GAME_IDS.length),
    turnDevice: "Turn your screen sideways",
    turnFull: "Go full screen, sideways",
    version: (build) => `Version ${build}`,
    feedback: "Send feedback",
  },
  feedback: {
    title: "Send feedback",
    hint: "A bug, something awkward, something you wish for. Your nickname and contact do not go with it: for an answer, say where to reach you.",
    box: "What to send",
    send: "Send",
    sending: "Sending…",
    close: "Close",
    empty: "Write something first.",
    sent: "Sent. Thank you.",
    failed: "It could not be sent now. Try again in a while.",
  },
  inbox: {
    title: "Inbox",
    key: "Key",
    open: "Open",
    opening: "Opening…",
    close: "Close",
    refused: "It did not open. Check the key; after several wrong ones, try again in 10 minutes.",
    offline: "Not connected to the server. Try again in a while.",
    none: "Nothing has been written yet.",
    count: (count) => `${count} written, newest first`,
    head: (when, lang, build) => `${when} · ${lang} · ${build}`,
    drop: "Delete",
    dropConfirm: "Press again to delete",
  },
  entry: {
    sub: "Pick a room or make one",
    nick: "Nickname",
    // half a row now: the form it opens is headed the same
    create: "New room",
    quick: "Quick join",
    quickHint: "Straight into an open room that is waiting for players",
    noneWaiting: "No room is waiting. Make one.",
    byCode: "Enter by room code",
    code: "Room code",
    join: "Join",
    entering: "Entering the room.",
  },
  rooms: {
    title: "Open rooms",
    count: (rooms) => (rooms === 1 ? "1 room" : `${rooms} rooms`),
    total: (rooms) => String(rooms),
    loading: "Loading the rooms.",
    none: "No open rooms. Make a public room and it is listed here for anyone to join.",
    of: (host) => `${host}'s room`,
    full: "Full",
    playing: "Playing · join to watch",
    waitingFor: (more) => `Waiting · needs ${more} more`,
    waiting: "Waiting · starts soon",
    entering: "Entering…",
    everyGame: "Every game",
    pick: "Rooms by game",
    noneOf: (game) => `No open rooms of ${game}. Make a public one and it is listed here.`,
    moreOfAll: (rooms) => `${rooms} more. Pick a game above.`,
    moreOfGame: (rooms) => `${rooms} more. The best to join are shown first.`,
  },
  newRoom: {
    title: "New room",
    game: "Game",
    who: "Who can come in?",
    listed: "Public",
    unlisted: "Private",
    cancel: "Cancel",
    go: "Make",
    making: "Making…",
    listedHint: "Listed: anyone can come in.",
    unlistedHint: "By link or code only.",
    // two lines of the column at most: five games leave the form no more
    startsAt: (seconds) => (seconds > 0 ? `Starts at ${seconds}s a turn.` : "No turn limit."),
    howMany: (min, max) => (min === 1 ? `Can be played alone, or by up to ${max} together.` : `For ${min} to ${max} players.`),
  },
  room: {
    // "Start game" would crowd the button beside it out of the row
    start: "Start",
    starting: "Starting…",
    leave: "Leave",
    // beside a code of wide letters the button has room for one short word
    copy: "Invite",
    copied: "Copied",
    copyFailed: "Failed",
    copyFailedHint: (code) => `The link could not be copied. Tell people the room code: ${code}.`,
    toUnlisted: "Go private",
    toListed: "Go public",
    clock: (seconds) => (seconds > 0 ? `Turn ${seconds}s` : "No turn limit"),
    clockHost: "Press to change how long a turn may take",
    clockGuest: "The host sets how long a turn may take",
    variantHost: "Press to change how the game is played in this room",
    variantGuest: "The host sets how the game is played",
    solo: "Solo",
    team: (team, leads) => (leads ? `Team ${team} lead` : `Team ${team}`),
    teamHelp: (size) => `Press to change: alone, or a team of ${size}. Whoever picks a team first leads it`,
    // a game's name in English is as wide as the column: the rest goes on a line of its own
    status: (game, listed, here, max) => [game, `${listed ? "Public" : "Private"} · ${here}/${max}`],
    statusTall: (game, listed, here, max) => [game, `${listed ? "Public" : "Private"} · ${here}/${max}`],
    statusSpoken: (here, max) => `${here} connected, ${max} at most`,
    offline: "Connection lost. Reconnecting",
    returning: "Returning to the room",
    newGame: "New game",
    swap: "Game",
    swapHelp: "Press to change the game this room plays",
    gameChanged: (game) => `This room now plays ${game}`,
    ready: "Ready",
    unready: "Not ready",
    seat: (seat, nick, me, connected, ready) => `Seat ${seat}, ${nick}${me ? " (you)" : ""}: ${connected ? (ready ? "ready" : "connected") : "disconnected"}`,
    emptySeat: (seat) => `Seat ${seat}, empty`,
    came: (nick) => `${nick} came in`,
    went: (nick) => `${nick} left`,
    becameHost: (nick) => `${nick} is the host now`,
    needPlayers: (min, here) => `The host can start once ${min} are here. ${here} now.`,
    brokenTeam: (team, size, teamSize) => `Team ${team} has ${size}, not ${teamSize}, so it is no team: its players start alone.`,
    hostReady: (bots, alone) => `${bots ? "Bots fill the empty seats (development). " : ""}${alone ? "You can play alone. " : ""}Start when ready.`,
    hostOthers: "Start when ready. Press a player to pass host or remove.",
    hostAllReady: "Everyone is ready. Start the game.",
    hostAsked: "Still there? Press anywhere to stay the host.",
    pressReady: "Press Ready when you are.",
    waitHost: "Waiting for the host to start.",
    allReady: "Everyone is ready. If the host is away, the host passes on.",
    seatMenu: {
      host: "Make host",
      kick: "Remove",
      kickConfirm: "Press again to remove",
      close: "Close",
    },
    reloadForGame: "Reload the page to play this game.",
    left: "You are out of the room: you left in another window, or were away too long.",
  },
  call: {
    said: "New chat",
    came: "Someone came",
    started: "Game started",
    host: "Still there?",
    turn: "Your turn",
  },
  swap: {
    title: "Change the game",
    hint: "Changing it takes back ready marks and teams.",
    tooMany: "A game that cannot hold everyone here cannot be picked.",
    close: "Close",
  },
  scene: {
    host: "Host",
    offline: "Offline",
    team: (team) => `Team ${team}`,
  },
  bar: {
    lobby: ["Join an open room, or make one and gather people.", "For friends only: make a private room and send the invite link."],
    rules: "Rules",
    close: "Close",
  },
  game: {
    leave: "Leave",
    leaveConfirm: "Press again to leave",
    tabs: "What the right-hand column shows",
    log: "Log",
    standings: "Players",
    chat: (unread) => (unread > 0 ? `Chat ${unread}` : "Chat"),
    share: "Share",
    shareHint: "Copy my result to pass on",
    screen: "Game screen",
  },
  share: {
    invite: (game) => `Play ${game} with me`,
    result: (game, verdict) => `${game}: ${verdict}`,
    come: "Come play a round",
  },
  menu: {
    open: "Menu",
    hint: "Rules, sound, leave: Menu, top left",
    label: "Game menu",
    rules: "Rules",
    soundOn: "Sound on",
    soundOff: "Sound off",
    full: "Full screen",
    fullExit: "Exit full screen",
    close: "Close",
  },
  voice: {
    label: "Voice chat",
    unlistedOnly: "Voice: private rooms",
    leave: "Leave voice",
    join: "Turn on voice chat",
    joinInGame: "Voice on",
    noMic: "No mic",
    micOff: "Mic off",
    micOn: "Mic on",
    joined: "You are in the voice chat. Voice goes straight between the devices of the people in the room.",
    listenOnly: "No microphone could be used, so you only listen. Check the browser's microphone permission.",
    notHere: "This room has no voice chat.",
  },
  chat: {
    label: "Chat",
    say: "Say something",
    send: "Send",
    notSent: "Not sent: the connection is down. Send it again once it is back.",
    tooFast: "You are sending too fast. Try again in a moment.",
  },
  reject: {
    "full": "The room is full.",
    "bad-nick": "Enter a nickname.",
    "bad-token": "What this browser saved is damaged. Reload the page.",
    "bad-room": "That is not a room code.",
    "not-found": "There is no such room.",
    "code-taken": "The room could not be made. Try again.",
    "join-timeout": "Connecting took too long. Try again.",
    "kicked": "The host removed you from this room.",
  },
  refused: {
    "not-host": "Only the host can do that.",
    "bad-player-count": "The game cannot start with this many players.",
    "bad-teams": "The game cannot start: the teams are the wrong size.",
    "too-few": "The game cannot start: not enough players.",
    "already-playing": "A game is already on.",
    "bots-not-allowed": "This server does not allow bots.",
    "bad-setting": "This room cannot use that setting.",
    "too-fast": "That was too fast. Try again in a moment.",
  },
  refusedOther: "That cannot be done now.",
};

/** The page's own words, in the language it is read in. */
export const WORDS = words({ ko, en });

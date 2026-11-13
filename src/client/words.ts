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
  /** The player's own record, kept in this browser: the games played to the end, and how many of them at the top. */
  record: {
    open: "내 기록",
    title: "내 기록",
    hint: "이 브라우저에만 남습니다. 둘 이상이 끝까지 한 판만 세고, 혼자 한 판은 세지 않습니다.",
    /** One game's line: how many were played, and how many at the top, by what that game calls its top. */
    row: (played: number, top: number, kind: string) => `${played}판 · ${kind} ${top}번`,
    kinds: { alive: "생존", won: "승리", first: "1위" },
    clear: "기록 지우기",
    clearSure: "정말 지우기",
    close: "닫기",
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
    /** Over a player pointed out in a room, in place of `head`: when, the name they went by, the game. Under it, the lines said to be theirs. */
    flagHead: (when: string, nick: string, game: string) => `${when} · 신고 · ${nick} · ${game}`,
    drop: "지우기",
    dropConfirm: "한 번 더 누르면 지움",
  },
  /** The site's numbers by the day, for whoever runs it: on the inbox's sheet, where the lobby is opened with `?numbers`. */
  numbers: {
    title: "숫자",
    none: "아직 센 것이 없습니다.",
    /** Over the days: how many there are, and where a day and its hours are counted (`zone`: "UTC+9"). */
    count: (days: number, zone: string) => `${days}일치, 최근 날부터 · 날짜와 시각은 ${zone}`,
    weekdays: ["월", "화", "수", "목", "금", "토", "일"],
    day: (date: string, weekday: string) => `${date} (${weekday})`,
    lobby: (visits: number, people: number, peak: number) => `로비 방문 ${visits}회 · ${people}명(주소 기준) · 한때 최대 ${peak}명`,
    rooms: (made: number, listed: number) => `만든 방 ${made}개 (공개 ${listed}개)`,
    games: (started: number, ended: number) => `시작한 판 ${started} · 끝난 판 ${ended}`,
    /** Rooms that stood empty with no game ever started: nobody else came, or people came and nothing was started. */
    left: (alone: number, unplayed: number) => `혼자 기다리다 비운 방 ${alone} · 모였는데 시작 못 한 방 ${unplayed}`,
    /** A game's line: hands raised for it in the lobby, games started and ended, and a game's players and minutes on average. */
    game: (name: string, wanted: number, started: number, ended: number, players: number | null, minutes: number | null) =>
      `${name}: 손 든 횟수 ${wanted} · 시작 ${started} · 끝 ${ended}${players === null ? "" : ` · 평균 ${players}명`}${minutes === null ? "" : ` · 평균 ${minutes}분`}`,
    hours: (list: string) => `시간대별 방문: ${list}`,
    hour: (hour: number, visits: number) => `${hour}시 ${visits}`,
  },
  entry: {
    sub: "방을 고르거나 만드세요",
    /** In its place for someone who opened a link to a room and has not gone in yet: two lines. */
    invited: (code: string) => `초대받은 방 ${code}\n닉네임을 넣고 입장하세요`,
    /** Under the form, when the room a link led to is no more. It does not name the game: the list beside it is by then that game's, and says so. Two lines, as the others here are. */
    invitedGone: "초대받은 방은 닫혔습니다. 방을 고르거나 만드세요.",
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
    /** With no room on the list: one line, as everything over the rooms is. What a public room is, is said where one is made. */
    none: "열린 방이 없습니다. 방을 만들어 보세요.",
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
    noneOf: (game: string) => `${game}의 열린 방이 없습니다.`,
    /** Under the last row, when there are more rooms than the list holds: of every game, and of the game picked. */
    moreOfAll: (rooms: number) => `${rooms}개 더 있습니다. 위에서 게임을 골라 좁혀 보세요.`,
    moreOfGame: (rooms: number) => `${rooms}개 더 있습니다. 들어가기 좋은 방부터 보여 줍니다.`,
  },
  /**
   * Over the rooms: the hour at which people are asked to gather for a game, in the reader's own time. One line,
   * the hour and the game on the left and how long until then on the right, which says the day as well.
   */
  meet: {
    title: (time: string, game: string) => `${time} ${game} 모임`,
    /** While it is on, with when it ends. */
    now: (game: string) => `지금 ${game} 모임`,
    until: (time: string) => `${time}까지`,
    inTime: (hours: number, minutes: number) => (hours > 0 ? `${hours}시간 ${minutes}분 뒤` : `${minutes}분 뒤`),
    /**
     * In place of the wait, once anyone has said they will come (`src/shared/going.ts`): how many, "or more" past
     * the most that is counted, and for a reader who is one of them (`mine`) their own word first.
     */
    coming: (count: number, more: boolean, mine: boolean) => (mine ? `갈게요 · ${count}명${more ? " 이상" : ""}` : `${count}명${more ? " 이상" : ""} 온대요`),
    /** On the lobby's last line, for someone who said they will come: gives the meeting as a file their calendar takes. */
    calendar: "달력에 넣기",
    /** What the meeting is called in that calendar: the game, and the site's name. */
    event: (game: string, site: string) => `${game} 모임 (${site})`,
  },
  /**
   * Under the meeting: a hand raised for a game (`src/shared/want.ts`). One line, what it says on the left and a
   * number on the right; `game` is a game's name, the longest of which has to fit beside the number. With every
   * game listed and no hand up anywhere there is no line.
   */
  want: {
    /** Hands are up for a game: a press shows it. */
    others: (game: string) => `${game} 하려는 사람`,
    othersCount: (count: number) => `${count}명`,
    /** One game's rooms are listed: a press raises a hand for it. */
    offer: (game: string) => `${game} 하고 싶어요`,
    offerCount: (count: number) => (count > 0 ? `${count}명 기다림` : "손 들기"),
    /** The player's hand is up and more are needed: a press lowers it. */
    raised: (more: number) => `손 들었음 · ${more}명 더 오면 방 열기`,
    raisedCount: (count: number, need: number) => `${count}/${need}명`,
    /** There are enough: a press opens a public room of the game. */
    gathered: (count: number) => `${count}명 모임 · 눌러서 공개 방 열기`,
    /** A room of the game is waiting for players: a press goes in. */
    open: "방이 열렸습니다 · 눌러서 들어가기",
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
    /** Beside the start, where a game has more to set than fits there: opens the sheet that holds it. */
    options: "설정",
    optionsTitle: "이 방의 게임 설정",
    optionsHost: "누르면 바뀝니다. 다음 판부터 그렇게 합니다.",
    optionsGuest: "방장이 정합니다. 다음 판은 이렇게 합니다.",
    optionsClose: "닫기",
    solo: "혼자 하기",
    team: (team: number, leads: boolean) => (leads ? `팀 ${team} 대표` : `팀 ${team}`),
    teamHelp: (size: number) => `누르면 바뀝니다: 혼자, 또는 ${size}명이 한 팀. 팀을 먼저 고른 사람이 대표입니다`,
    /** The lines over the room's code: the game, who can come in and how many are here. */
    status: (game: string, listed: boolean, here: number, max: number, knockout: boolean) => [`${game} · ${listed ? "공개" : "비공개"} · ${here}/${max}${knockout ? " · 탈락전" : ""}`],
    /** The same on two lines, for a game whose name leaves no room beside it. */
    statusTall: (game: string, listed: boolean, here: number, max: number, knockout: boolean) => [game, `${listed ? "공개" : "비공개"} · ${here}/${max}${knockout ? " · 탈락전" : ""}`],
    statusSpoken: (here: number, max: number) => `${here}명 접속, 최대 ${max}명`,
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    /** Over the room's code when the page was loaded again and the room has not answered yet. */
    returning: "방으로 돌아오는 중",
    newGame: "새 게임",
    /** How long the room takes to answer this page, there and back: in a corner of the room's picture, and in a game's menu. */
    ping: (ms: number) => `연결 ${ms}ms`,
    pingGrade: { good: "연결 좋음", fair: "연결 보통", poor: "연결 느림" },
    /** On the host's button that opens the choice of another game for the room: short, beside two others. */
    swap: "게임",
    swapHelp: "누르면 이 방에서 할 게임을 바꿉니다",
    /** In the chat, when the host has made the room one for another game. */
    gameChanged: (game: string) => `이제 이 방의 게임은 ${game}입니다`,
    /** On the button of everyone but the host: said once, taken back with the same button. */
    ready: "준비",
    unready: "준비 취소",
    seat: (seat: number, nick: string, me: boolean, connected: boolean, ready: boolean, pieces: number, out: boolean) =>
      `${seat}번 ${nick}${me ? " (나)" : ""}: ${connected ? (ready ? "준비" : "접속") : "끊김"}${pieces > 0 ? `, 피스 ${pieces}개` : ""}${out ? ", 탈락" : ""}`,
    /**
     * 탈락전, the room's own way of playing game after game: the host's button for it in the sheet of games and
     * what it does, and the lines in the chat when it is turned on or off, puts someone out, has its winner, or
     * starts over because too few were left.
     */
    knockoutOff: "탈락전: 끔",
    knockoutOn: "탈락전: 켬",
    knockoutHelp: "켜면 판마다 꼴찌는 다음 판부터 구경, 한 명이 남으면 우승. 방송이 아닌 이 방의 규칙.",
    knockoutTurnedOn: "방장이 탈락전을 켰습니다: 판마다 꼴찌는 다음 판부터 구경합니다",
    knockoutTurnedOff: "방장이 탈락전을 껐습니다: 모두 참가합니다",
    knockedOut: (nick: string) => `${nick} 탈락: 다음 판부터 구경합니다`,
    champion: (nick: string) => `${nick} 우승! 모두 다시 참가합니다`,
    knockoutAgain: "남은 사람이 모자라 탈락전을 처음부터 다시 합니다",
    knockoutShort: (min: number, here: number) => `이 게임은 ${min}명부터인데 ${here}명 남았습니다. 방장이 게임을 바꾸세요.`,
    knockoutWatching: "탈락해 구경 중입니다. 우승자가 나오면 모두 다시 참가합니다.",
    /** In the chat when a game played in the room paid someone pieces: how many, and how many they have in this room now. */
    wonPieces: (nick: string, won: number, all: number) => `${nick} 피스 +${won} (이 방에서 ${all}개)`,
    emptySeat: (seat: number) => `${seat}번 빈 자리`,
    came: (nick: string) => `${nick} 님이 들어왔습니다`,
    went: (nick: string) => `${nick} 님이 나갔습니다`,
    sentOut: (nick: string) => `방장이 ${nick} 님을 내보냈습니다`,
    /** In the chat of a room for a game this player has not played here; "규칙 보기" is the button's own name (`bar.rules`). */
    firstTime: "이 게임이 처음이면 시작 전에 아래 「규칙 보기」를 눌러 보세요.",
    /** Over the list of who is here, which a keyboard reaches: the host picks a player from it. */
    seatsHelp: "사람을 고르면 방장을 넘기거나 내보낼 수 있습니다",
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
    /** In the lobby: a room opened that can be joined. */
    room: "새 방",
    /** In the lobby: enough hands are up for the game this player raised theirs for. */
    gathered: "모였습니다",
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
    /** Beside a figure sitting the room's games out: put out by a game of 탈락전. */
    out: "탈락",
    team: (team: number) => `팀 ${team}`,
  },
  bar: {
    /** The lobby's one line, while others are in the lobby too: how many besides the reader, and "or more" past the most that is counted. With nobody else there is no line: the form says what to do. */
    others: (count: number, more: boolean) => `지금 로비에 다른 사람 ${count}명${more ? " 이상" : ""}. 공개 방을 만들어 보세요.`,
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
    /** How loud the sound is, by its level (`sound-config.json`): silence first, then each louder one. The button that says it turns it to the next. */
    sound: ["소리 끔", "소리 작게", "소리 보통", "소리 크게"],
    soundHelp: "누르면 소리 크기가 바뀝니다",
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
    /** On the box's button while the box is empty: it opens the words that take one press. */
    quickOpen: "한마디",
    quickTitle: "한 번 눌러 말하기",
    /** Under the title: why these and not typing. */
    quickHelp: "읽는 사람의 언어로 보입니다.",
    quickClose: "닫기",
    /** The words that take one press (`QUICK_WORDS`), as they are read in the chat and over the speaker. */
    quick: {
      hello: "안녕하세요",
      nice: "좋아요!",
      thanks: "고마워요",
      sorry: "미안해요",
      wait: "잠깐만요",
      go: "시작해요",
      oops: "아이고",
      gg: "수고했어요",
    },
    notSent: "연결이 끊겨 보내지 못했습니다. 다시 연결되면 보내 주세요.",
    tooFast: "너무 빨리 보내고 있습니다. 잠시 뒤에 다시 보내세요.",
    /** Who the next line is said to: on the button beside the box, and over the sheet that button opens. */
    toAll: "모두",
    toLabel: (nick: string | null) => (nick === null ? "말할 상대: 모두. 눌러서 한 사람을 고릅니다" : `말할 상대: ${nick}. 눌러서 바꿉니다`),
    toTitle: "밀담: 누구에게 말할까요?",
    toHelp: "한 사람을 고르면 그 사람에게만 보입니다.",
    toAlone: "방에 다른 사람이 있으면 여기서 고를 수 있습니다.",
    toEveryone: "모두에게",
    toClose: "닫기",
    /** In the box while one player is spoken to. */
    toHint: (nick: string) => `${nick}에게만`,
    toGone: "그 사람이 지금 방에 없어 보내지 못했습니다. 이제 모두에게 말합니다.",
    toLeft: "밀담 상대가 나갔습니다. 이제 모두에게 말합니다.",
    /** What a player can do about another, on the sheet a press of that player's name in the chat opens. */
    who: {
      /** On a name in the chat: what a press of it is for. */
      label: (nick: string) => `${nick}: 눌러서 말을 숨기거나 신고합니다`,
      help: "숨기면 이 사람의 말이 내 화면에서만 가려집니다.",
      /** Under it where the site takes reports. */
      helpFlag: "신고는 이 사람의 이름과 최근에 한 말을 운영자에게 보냅니다.",
      hide: "말 숨기기",
      unhide: "숨김 풀기",
      flag: "신고",
      flagConfirm: "한 번 더 누르면 신고",
      flagged: "신고함",
      close: "닫기",
      /** In the chat, in place of a line of someone whose lines are covered. */
      hiddenLine: "(숨긴 말)",
      hid: (nick: string) => `${nick} 님의 말을 숨겼습니다. 이름을 누르면 다시 볼 수 있습니다.`,
      shown: (nick: string) => `${nick} 님의 말을 다시 봅니다.`,
      flaggedNote: (nick: string) => `${nick} 님을 운영자에게 신고했습니다.`,
    },
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
  record: {
    open: "My record",
    title: "My record",
    hint: "Kept in this browser only. A game counts when two or more played it to the end.",
    row: (played, top, kind) => `${played} played · ${kind} ${top}`,
    kinds: { alive: "Alive", won: "Won", first: "1st" },
    clear: "Clear record",
    clearSure: "Really clear",
    close: "Close",
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
    flagHead: (when, nick, game) => `${when} · Report · ${nick} · ${game}`,
    drop: "Delete",
    dropConfirm: "Press again to delete",
  },
  numbers: {
    title: "Numbers",
    none: "Nothing has been counted yet.",
    count: (days, zone) => `${days} ${days === 1 ? "day" : "days"}, latest first · days and hours are ${zone}`,
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    day: (date, weekday) => `${date} (${weekday})`,
    lobby: (visits, people, peak) => `Lobby: ${visits} ${visits === 1 ? "visit" : "visits"} · ${people} by address · ${peak} at once at most`,
    rooms: (made, listed) => `Rooms made: ${made} (${listed} public)`,
    games: (started, ended) => `Games started: ${started} · finished: ${ended}`,
    left: (alone, unplayed) => `Rooms left after waiting alone: ${alone} · gathered, never started: ${unplayed}`,
    game: (name, wanted, started, ended, players, minutes) =>
      `${name}: ${wanted} hands raised · ${started} started · ${ended} finished${players === null ? "" : ` · ${players} to a game`}${minutes === null ? "" : ` · ${minutes} min a game`}`,
    hours: (list) => `Visits by hour: ${list}`,
    hour: (hour, visits) => `${hour}h ${visits}`,
  },
  entry: {
    sub: "Pick a room or make one",
    invited: (code) => `Invited to room ${code}\nAdd a nickname and join`,
    invitedGone: "That room is closed. Join or make another.",
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
    none: "No open rooms. Make one.",
    of: (host) => `${host}'s room`,
    full: "Full",
    playing: "Playing · join to watch",
    waitingFor: (more) => `Waiting · needs ${more} more`,
    waiting: "Waiting · starts soon",
    entering: "Entering…",
    everyGame: "Every game",
    pick: "Rooms by game",
    noneOf: (game) => `No open rooms of ${game}.`,
    moreOfAll: (rooms) => `${rooms} more. Pick a game above.`,
    moreOfGame: (rooms) => `${rooms} more. The best to join are shown first.`,
  },
  meet: {
    // the widest name of a game and the longest wait have one line of the list's width between them: 284 px
    title: (time, game) => `${game} at ${time}`,
    now: (game) => `${game} on now`,
    until: (time) => `until ${time}`,
    inTime: (hours, minutes) => (hours > 0 ? `in ${hours}h ${minutes}m` : `in ${minutes} min`),
    coming: (count, more, mine) => (mine ? `I'm in · ${count}${more ? "+" : ""}` : `${count}${more ? "+" : ""} coming`),
    calendar: "Add to calendar",
    event: (game, site) => `${game} meet-up (${site})`,
  },
  want: {
    others: (game) => `Hands up for ${game}`,
    othersCount: (count) => `${count}`,
    offer: (game) => `Hand up for ${game}?`,
    offerCount: (count) => (count > 0 ? `${count} waiting` : "Raise"),
    raised: (more) => `Hand up · ${more} more to open a room`,
    raisedCount: (count, need) => `${count}/${need}`,
    gathered: (count) => `${count} here · press to open a public room`,
    open: "A room is open · press to join",
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
    options: "Options",
    optionsTitle: "This room's game options",
    optionsHost: "Press one to change it, for the next game.",
    optionsGuest: "The host sets these. The next game is played so.",
    optionsClose: "Close",
    solo: "Solo",
    team: (team, leads) => (leads ? `Team ${team} lead` : `Team ${team}`),
    teamHelp: (size) => `Press to change: alone, or a team of ${size}. Whoever picks a team first leads it`,
    // a game's name in English is as wide as the column: the rest goes on a line of its own
    status: (game, listed, here, max, knockout) => [game, `${listed ? "Public" : "Private"} · ${here}/${max}${knockout ? " · Knockout" : ""}`],
    statusTall: (game, listed, here, max, knockout) => [game, `${listed ? "Public" : "Private"} · ${here}/${max}${knockout ? " · Knockout" : ""}`],
    statusSpoken: (here, max) => `${here} connected, ${max} at most`,
    offline: "Connection lost. Reconnecting",
    returning: "Returning to the room",
    newGame: "New game",
    ping: (ms) => `Ping ${ms} ms`,
    pingGrade: { good: "Good connection", fair: "Fair connection", poor: "Slow connection" },
    swap: "Game",
    swapHelp: "Press to change the game this room plays",
    gameChanged: (game) => `This room now plays ${game}`,
    ready: "Ready",
    unready: "Not ready",
    seat: (seat, nick, me, connected, ready, pieces, out) =>
      `Seat ${seat}, ${nick}${me ? " (you)" : ""}: ${connected ? (ready ? "ready" : "connected") : "disconnected"}${pieces > 0 ? `, ${pieces} ${pieces === 1 ? "Piece" : "Pieces"}` : ""}${out ? ", out" : ""}`,
    knockoutOff: "Knockout: off",
    knockoutOn: "Knockout: on",
    knockoutHelp: "Last place sits out; the last one in wins. A room rule, not the show's.",
    knockoutTurnedOn: "The host turned Knockout on: last place in a game watches the next ones",
    knockoutTurnedOff: "The host turned Knockout off: everyone plays",
    knockedOut: (nick) => `${nick} is out: watching from the next game`,
    champion: (nick) => `${nick} wins! Everyone is back in`,
    knockoutAgain: "Too few are left: Knockout starts over",
    knockoutShort: (min, here) => `${here} left in, but this game takes ${min}. The host can change it.`,
    knockoutWatching: "You are out, watching until someone wins.",
    wonPieces: (nick, won, all) => `${nick}: +${won} ${won === 1 ? "Piece" : "Pieces"} (${all} in this room)`,
    emptySeat: (seat) => `Seat ${seat}, empty`,
    came: (nick) => `${nick} came in`,
    went: (nick) => `${nick} left`,
    sentOut: (nick) => `The host removed ${nick}`,
    firstTime: "New to this game? Press Rules below before it starts.",
    seatsHelp: "Pick a player to pass the host on or remove them",
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
    room: "New room",
    gathered: "Enough players",
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
    out: "Out",
    team: (team) => `Team ${team}`,
  },
  bar: {
    others: (count, more) =>
      `${more ? `${count}+ others are` : count === 1 ? "1 other is" : `${count} others are`} here now. A public room lets them join.`,
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
    sound: ["Sound off", "Sound low", "Sound mid", "Sound high"],
    soundHelp: "Press to change how loud the sound is",
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
    say: "Message",
    send: "Send",
    quickOpen: "Quick",
    quickTitle: "Say it with one press",
    quickHelp: "Each reader sees it in their own language.",
    quickClose: "Close",
    quick: {
      hello: "Hello",
      nice: "Nice!",
      thanks: "Thanks",
      sorry: "Sorry",
      wait: "Hold on",
      go: "Let's start",
      oops: "Oops",
      gg: "Good game",
    },
    notSent: "Not sent: the connection is down. Send it again once it is back.",
    tooFast: "You are sending too fast. Try again in a moment.",
    toAll: "All",
    toLabel: (nick) => (nick === null ? "Talking to: everyone. Press to pick one person" : `Talking to: ${nick}. Press to change`),
    toTitle: "Whisper: who to?",
    toHelp: "Pick one person and only they see it.",
    toAlone: "When someone else is in the room you can pick them here.",
    toEveryone: "Everyone",
    toClose: "Close",
    toHint: (nick) => `To ${nick} only`,
    toGone: "They are not here now: not sent. You are talking to everyone again.",
    toLeft: "The person you were whispering to left. You are talking to everyone again.",
    who: {
      label: (nick) => `${nick}: press to hide what they say or report them`,
      help: "Hiding covers what they say on your screen only.",
      helpFlag: "A report sends their name and their latest lines to whoever runs the site.",
      hide: "Hide their lines",
      unhide: "Show their lines",
      flag: "Report",
      flagConfirm: "Press again to report",
      flagged: "Reported",
      close: "Close",
      hiddenLine: "(hidden line)",
      hid: (nick) => `You hid what ${nick} says. Press their name to see it again.`,
      shown: (nick) => `You see what ${nick} says again.`,
      flaggedNote: (nick) => `You reported ${nick} to whoever runs the site.`,
    },
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

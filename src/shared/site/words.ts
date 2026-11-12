/**
 * The words of the pages a search engine reads, in each language: the page
 * about the games (`/ko/`, `/en/`), a page of rules for each game, and what
 * the game's own page (`/`) says of itself in its head.
 *
 * These pages are documents, not screens of the game: they are written when
 * the client is built (`pages.ts`, `vite.config.ts`) and read without the
 * script. A game's name and summary come from `games.json` and its rules from
 * the sheet in its `words.ts`, so nothing about a game is written twice.
 *
 * These pages name the show the games are from, so that a search for the show
 * finds them (the user, 2026-11-12: "데블스플랜을 검색했을때 나왔으면좋겠어
 * 우리사이트가"). It is named in sentences, with a line under every page that
 * the site is not the broadcaster's; its logo, cast and set are not used
 * (CLAUDE.md, Project Rules).
 *
 * A title is what a search result shows first: what is searched for leads it,
 * and it stays under the width a result has (about 60 Latin letters, about 30
 * Hangul syllables). `tests/unit/site/site.test.ts` holds them to that.
 */
import type { Lang } from "../lang";

/** The name the site goes by: the project's (CLAUDE.md, Project Rules). */
export const SITE_NAME = "brain-survival";

/** Where the site is: every address a search engine is given starts here. */
export const ORIGIN = "https://play.brain-survival.workers.dev";

/** The site's address as it is said in a sentence: without the scheme. */
const HOST = ORIGIN.replace("https://", "");

/**
 * What shows a search engine's console whose site this is: a code it gives the
 * owner, which it then looks for in the head of `/`. It has to stay there for
 * the site to stay the owner's in that console.
 */
export const OWNER_CODES: Record<string, string> = {
  // Google Search Console, the property https://play.brain-survival.workers.dev/ (2026-11-12)
  "google-site-verification": "A4D90_3K7yDn9kPfwZ0tzKkjr3vZOLbisC7sF6md03w",
  // Naver Search Advisor, the site https://play.brain-survival.workers.dev (2026-11-12)
  "naver-site-verification": "6db87d7979b5f15363e64e91227ba2f218459556",
};

/** Each language's name for itself, on the link to a page in it. */
export const LANG_NAMES: Record<Lang, string> = { ko: "한국어", en: "English" };

const ko = {
  /** The show the games are from: as it is searched for, and with the season the games are of. */
  show: { name: "데블스 플랜", season: "《데블스 플랜: 데드 어게인》" },
  /** The game's own page, `/`: the tab's title in the lobby, and what a search result says of it. */
  app: {
    title: `${SITE_NAME}: 데블스 플랜 게임을 친구와 온라인으로`,
    description: (games: number) =>
      `《데블스 플랜: 데드 어게인》의 게임 ${games}종을 친구들과 방을 만들어 실시간으로 합니다. 설치와 가입 없이, 열린 방에 들어가거나 방을 만들어 사람들을 모으세요.`,
    /** Shown in place of the game where the script cannot run, before the link to the page about the games. */
    noScript: "이 게임은 자바스크립트를 켜야 열립니다.",
  },
  /** What every page has around its own words. */
  frame: {
    /** The link to the page about the games, and the first step of the trail on a game's page. */
    home: "게임 목록",
    play: "로비 열기",
    /** What the trail above a game's name is, said to a screen reader. */
    trail: "현재 위치",
    footer: "설치 없이 브라우저에서 여럿이 실시간으로 하는 두뇌 게임 모음",
    /** Under every page: what is the show's and what is not, and whose the site is. */
    notTheShow: "방송에서 가져온 것은 게임의 규칙과 게임 이름뿐입니다. 방송사·제작사와 관계없는 개인 프로젝트입니다.",
    /** What the picture a shared link shows is of. */
    picture: (games: number) => `${SITE_NAME}: 친구와 실시간으로 하는 온라인 두뇌 게임 ${games}종`,
  },
  home: {
    title: (games: number) => `데블스 플랜 게임 ${games}종 온라인으로 하기 | ${SITE_NAME}`,
    description: (games: number) =>
      `《데블스 플랜: 데드 어게인》에 나온 게임 ${games}종을 친구와 브라우저에서 실시간으로 합니다. 무료이고 설치와 가입이 없습니다. 게임별 규칙과 하는 법.`,
    heading: (games: number) => `데블스 플랜 게임 ${games}종, 친구와 온라인으로`,
    lead: (games: number) =>
      `${SITE_NAME}은 《데블스 플랜: 데드 어게인》(시즌 3)에 나온 게임 ${games}종을 방송의 규칙으로, 설치 없이 브라우저에서 여럿이 실시간으로 하는 두뇌 게임 모음입니다. 방을 만들어 친구에게 링크를 보내거나, 로비에 열려 있는 방에 들어가면 됩니다. 무료이고 가입이 없습니다.`,
    games: "게임",
    rules: "규칙 보기",
    how: "하는 법",
    steps: [
      "로비에서 닉네임을 정합니다.",
      "방을 만들고 게임을 고릅니다. 공개 방은 목록에 보여 누구나 들어오고, 비공개 방은 링크나 코드를 아는 사람만 들어옵니다.",
      "대기실에서 초대 링크를 복사해 보냅니다. 방 코드를 불러 줘도 됩니다.",
      "인원이 모이면 방장이 게임을 시작합니다. 방에서는 채팅과 음성 대화를 쓸 수 있습니다.",
    ],
    questions: "자주 묻는 질문",
    /**
     * The question the pages are found by, asked as it is typed into a search (the show's name without its space),
     * and an answer that is whole when it is quoted alone: which site, which games, at which address.
     */
    online: (games: number, names: string): readonly [string, string] => [
      "데블스플랜 게임을 온라인으로 할 수 있나요?",
      `네. ${SITE_NAME}(${HOST})에서 데블스 플랜 시즌 3 《데블스 플랜: 데드 어게인》의 게임 ${games}종(${names})을 방송의 규칙대로 친구들과 실시간으로 할 수 있습니다. 브라우저에서 바로 열리고, 무료이며 설치와 가입이 없습니다.`,
    ],
    free: ["무료인가요?", "네. 무료이고 가입이나 설치가 없습니다. 닉네임만 정하면 됩니다."],
    howMany: "몇 명이 하나요?",
    howManyAnswer: (each: string) => `게임마다 다릅니다: ${each}.`,
    alone: (names: string) => `혼자서도 시작할 수 있는 게임: ${names}.`,
    phone: ["휴대폰에서도 되나요?", "네. 휴대폰에서는 화면을 가로로 돌려 손가락으로 하고, 컴퓨터에서는 마우스와 키보드로 합니다."],
  },
  game: {
    title: (name: string) => `${name} 규칙: 데블스 플랜 게임 온라인으로 하기`,
    description: (name: string, summary: string, players: string) =>
      `데블스 플랜의 ${name} 규칙. ${summary} 설치 없이 브라우저에서 ${players}이 실시간으로 합니다.`,
    heading: (name: string) => `${name} 규칙`,
    lead: (name: string, summary: string, players: string, alone: boolean) =>
      `《데블스 플랜: 데드 어게인》(시즌 3)에 나온 게임 ${name}. ${summary} ${players}이 한 방에서 실시간으로 합니다${alone ? " (혼자서도 시작할 수 있습니다)" : ""}.`,
    players: "인원",
    team: "팀",
    teamOf: (size: number) => `${size}명이 한 팀을 맺을 수 있습니다`,
    variants: "방장이 고르는 방식",
    rules: "규칙",
    start: "시작하기",
    startHow: "로비에서 방을 만들 때 게임 목록에서 고르면 됩니다. 초대 링크를 보내고, 인원이 모이면 방장이 시작합니다.",
    others: "다른 게임",
  },
  /** How many play, as it is said in a sentence and in a list. */
  count: (min: number, max: number) => `${min}~${max}명`,
};

const en: typeof ko = {
  // the season's English name was not found in what the project has read: it is said by its number
  show: { name: "The Devil's Plan", season: "The Devil's Plan (season 3)" },
  app: {
    title: `${SITE_NAME}: The Devil's Plan Games Online with Friends`,
    description: (games: number) =>
      `${games} games from The Devil's Plan (season 3) to play live with friends in a room of your own. No install, no sign-up: join an open room or make one.`,
    noScript: "This game needs JavaScript to open.",
  },
  frame: {
    home: "All games",
    play: "Open the lobby",
    trail: "You are here",
    footer: "Brain games played live in the browser with other people, with nothing to install",
    notTheShow: "Only the games' rules and names are taken from the show. This is one person's project, not connected to the broadcaster or the producers.",
    picture: (games: number) => `${SITE_NAME}: ${games} online brain games to play live with friends`,
  },
  home: {
    title: (games: number) => `Play ${games} Games from The Devil's Plan Online | ${SITE_NAME}`,
    description: (games: number) =>
      `${games} games from The Devil's Plan (season 3) to play live with friends in the browser. Free, no install, no sign-up. Rules for every game.`,
    heading: (games: number) => `${games} games from The Devil's Plan, online with friends`,
    lead: (games: number) =>
      `${SITE_NAME} is a set of ${games} games from The Devil's Plan (season 3), played by the show's rules, live in the browser with other people and with nothing to install. Make a room and send friends the link, or join a room that is open in the lobby. It is free and there is no sign-up.`,
    games: "Games",
    rules: "Read the rules",
    how: "How to play",
    steps: [
      "Pick a nickname in the lobby.",
      "Make a room and choose a game. A public room is listed for anyone to join; a private room is for those who have the link or the code.",
      "Copy the invite link in the waiting room and send it, or read out the room code.",
      "When enough players are in, the host starts the game. A room has text chat and voice chat.",
    ],
    questions: "Questions",
    online: (games: number, names: string): readonly [string, string] => [
      "Can you play the games from The Devil's Plan online?",
      `Yes. On ${SITE_NAME} (${HOST}) you can play ${games} games from The Devil's Plan season 3 (${names}) by the show's rules, live with friends. It opens in the browser and is free, with no install and no sign-up.`,
    ],
    free: ["Is it free?", "Yes. It is free, with no sign-up and nothing to install: a nickname is all you need."],
    howMany: "How many players does it take?",
    howManyAnswer: (each: string) => `It depends on the game: ${each}.`,
    alone: (names: string) => `Games one player can start alone: ${names}.`,
    phone: ["Does it work on a phone?", "Yes. On a phone, turn the screen sideways and play with a finger; on a computer, with a mouse and a keyboard."],
  },
  game: {
    title: (name: string) => `${name} Rules: The Devil's Plan Game, Online`,
    description: (name: string, summary: string, players: string) =>
      `${name} from The Devil's Plan: ${summary} Free online for ${players}.`,
    heading: (name: string) => `${name} Rules`,
    lead: (name: string, summary: string, players: string, alone: boolean) =>
      `${name} is a game from The Devil's Plan (season 3). ${summary} Played live in one room by ${players}${alone ? " (one player can start it alone)" : ""}.`,
    players: "Players",
    team: "Teams",
    teamOf: (size: number) => `${size} players can form a team`,
    variants: "Host's options",
    rules: "Rules",
    start: "Start a game",
    startHow: "Make a room in the lobby and pick the game from the list. Send the invite link, and the host starts when enough players are in.",
    others: "Other games",
  },
  count: (min: number, max: number) => `${min}–${max} players`,
};

/** The words of these pages, in every language: a page is written in each. */
export const SITE_WORDS: Record<Lang, typeof ko> = { ko, en };

/** The shape of one language's words. */
export type SiteWords = typeof ko;

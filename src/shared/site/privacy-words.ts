/**
 * The words of the notice of what is kept of a visitor (`/ko/privacy/`,
 * `/en/privacy/`; drawn by `pages.ts`), Korean and English side by side.
 *
 * They are in a file of their own, not in `words.ts` with the other pages'
 * words: the game's own script takes its title from `words.ts`, and would
 * carry this page's paragraphs with it.
 *
 * Every sentence here says what the code does, and was written from the code
 * (2026-11-13). A change to what is kept, where, for how long or who sees it
 * changes the sentence with it, in both languages. The numbers the settings
 * hold are handed in (`PrivacyFacts`), so a changed setting is a changed
 * sentence; what no setting holds is checked by `tests/unit/site`.
 *
 * It is a plain account for a visitor, not a lawyer's document: nobody has
 * read it against any law.
 */
import type { Lang } from "../lang";
import { SITE_NAME } from "./words";

/** The numbers the notice takes from the settings. */
export interface PrivacyFacts {
  /** Hours a room with nobody connected is kept (`emptyRoomTtlMinutes`, `room-config.json`). */
  roomHours: number;
  /** Chat lines of a reported player kept with a report (`flag.lines`, `chat-config.json`). */
  flagLines: number;
  /** How many words to the maker and reports are kept, the latest (`feedback.keep`, `directory-config.json`). */
  wordsKept: number;
  /** Minutes the note of a room made is kept: the longest of `makeLimits` (`directory-config.json`). */
  madeMinutes: number;
}

/** When the notice was last changed to follow the code. */
const CHANGED = "2026-11-14";

const ko = {
  /** The link under every page, and the page's own heading. */
  name: "개인정보 안내",
  title: `개인정보 안내: 무엇을 두고 누가 보는지 | ${SITE_NAME}`,
  description: `가입도 쿠키도 없는 ${SITE_NAME}이 브라우저와 서버에 무엇을 얼마 동안 두는지, 접속 주소와 음성 채팅과 의견은 어떻게 다루는지 적었습니다.`,
  lead: `${SITE_NAME}은 한 사람이 만드는 개인 프로젝트입니다. 가입이 없어서 받는 것이 적지만, 없지는 않습니다. 무엇을 어디에 얼마 동안 두고 누가 볼 수 있는지 그대로 적습니다.`,
  parts: (facts: PrivacyFacts) => ({
    none: {
      heading: "받지 않는 것",
      lines: [
        "가입, 이메일, 비밀번호가 없습니다. 닉네임만 정하면 됩니다.",
        "쿠키를 쓰지 않습니다. 광고와 방문 분석 도구가 없고, 다른 회사의 스크립트나 글꼴을 불러오지 않습니다.",
      ],
    },
    browser: {
      heading: "이 브라우저에 두는 것",
      lines: [
        "닉네임, 고른 언어, 소리 크기, 마지막에 고른 게임, 방 코드를 가릴지, 어떤 안내를 이미 봤는지를 이 브라우저의 저장소에 둡니다.",
        "게임별로 몇 판을 끝까지 했고 몇 번 1등을 했는지도 이 브라우저에만 둡니다. 서버로 보내지 않습니다.",
        "이 브라우저를 알아보는 임의의 값을 하나 만들어 둡니다. 연결이 끊겼다 돌아왔을 때 같은 자리에 앉히는 데 쓰고, 들어가는 방에 보냅니다.",
        "방의 최근 채팅과 마지막 모습은 새로 고침에 대비해 그 탭이 열려 있는 동안만 둡니다.",
        "브라우저 설정에서 이 사이트의 데이터를 지우면 모두 사라집니다.",
      ],
    },
    room: {
      heading: "방에 들어가면",
      lines: [
        "방은 닉네임, 위의 임의의 값, 자리, 게임의 진행을 서버에 가지고 있습니다. 방장이 방에 약속 시간을 알리면 그 시간도 방과 함께 가지고 있고, 방에 들어온 사람 모두에게 보입니다. 다음에 하고 싶은 게임을 고르면 그것도 자리와 함께 가지고 있습니다.",
        `마지막 사람이 나가기를 누르면 방에 있던 것은 바로 지워집니다. 모두 연결이 끊긴 채 남은 방은 ${facts.roomHours}시간 뒤에 지워집니다.`,
        "같은 방 사람들은 닉네임, 접속해 있는지, 채팅, 그 방에서 몇 판을 하고 몇 번 이겼는지를 봅니다.",
        "대기실에서 규칙을 펴 둔 동안에는 방의 다른 사람들에게 규칙을 읽는 사람이 몇 명인지가 전해집니다. 누구인지는 전하지 않고, 저장하지 않습니다.",
        "대기실에서 다음에 하고 싶은 게임을 고르면 방 사람들에게 게임마다 고른 사람 수가 전해집니다. 누구인지는 전하지 않습니다. 고른 것은 거두거나 방장이 게임을 바꿀 때까지 방에 남고, 방이 지워질 때 함께 지워집니다.",
        `채팅은 서버에 저장하지 않고 방 사람들에게 전하기만 합니다. 다만 누가 신고하면 신고된 사람의 닉네임과 그 사람의 채팅 최대 ${facts.flagLines}줄이 만든 사람에게 남습니다.`,
        "공개 방은 방 코드, 게임, 방장의 닉네임, 인원이 로비 목록에 올라 누구나 봅니다. 비공개 방은 목록에 오르지 않습니다.",
      ],
    },
    address: {
      heading: "접속 주소(IP)",
      lines: [
        "접속 주소는 한 곳에서 연결이나 방 만들기를 지나치게 많이 하는지 세는 데 씁니다.",
        "방문자 수를 세려고, 주소를 한쪽으로만 바꾼 값(해시)을 그날 치로 두었다가 날이 바뀐 뒤 다음 방문 때 지웁니다. 주소 그대로는 적어 두지 않습니다. 다만 이 값은 주소를 감추는 암호가 아니라서, 마음먹으면 원래 주소를 맞혀 볼 수 있습니다.",
        `방을 만들면 같은 값이 만든 시각과 함께 남고, ${facts.madeMinutes}분이 지난 것은 다음에 누가 방을 만들 때 지웁니다.`,
        "로비에서 모임에 가겠다고 누르면 같은 값과 이 브라우저의 또 다른 임의의 값이 그 모임과 함께 남고, 지난 모임의 것은 다음 모임에 누가 누를 때 지웁니다.",
        "그 밖에 남기는 것은 숫자뿐입니다. 날짜별 방문 수, 만든 방 수, 게임별 판 수 같은 것입니다.",
        "사이트가 적는 서버 로그에는 방이 만들어졌다, 게임이 시작됐다 같은 일만 적습니다. 접속 주소, 방 코드, 닉네임, 채팅은 적지 않습니다.",
      ],
    },
    voice: {
      heading: "음성 채팅",
      lines: [
        "음성 채팅은 비공개 방에서만 켤 수 있습니다. 처음 켤 때 아래의 것을 먼저 알려 주고, 켜면 마이크 권한을 묻습니다. 거절하면 듣기만 합니다.",
        "소리는 서버를 거치지 않고 참가자들의 브라우저 사이를 바로 오갑니다. 서버는 소리를 받지도 저장하지도 않습니다.",
        "그래서 함께 음성을 켠 사람들은 서로의 접속 주소를 알 수 있습니다. 모르는 사람과는 켜지 않는 편이 좋습니다.",
        "연결을 맺을 때 브라우저가 Cloudflare와 Google의 서버에 물어 자기 주소를 확인합니다(STUN). 이때 두 회사의 서버가 접속 주소를 봅니다.",
      ],
    },
    words: {
      heading: "의견 보내기",
      lines: [
        "로비의 「의견 보내기」로 보낸 글은 글, 보낸 시각, 화면의 언어, 사이트 버전만 저장합니다. 닉네임이나 접속 주소는 붙지 않습니다.",
        `신고와 합쳐 최근 ${facts.wordsKept}건까지 두고, 만든 사람만 읽습니다. 답을 받으려고 연락처를 적었다면 그것도 글에 그대로 남습니다.`,
      ],
    },
    host: {
      heading: "서버가 있는 곳",
      lines: ["사이트는 Cloudflare의 서버에서 돌아갑니다. 어느 사이트나 그렇듯 Cloudflare는 요청을 처리하면서 접속 주소 같은 연결 정보를 다룹니다."],
    },
    ask: {
      heading: "묻거나 지우고 싶을 때",
      lines: [
        "지워 달라거나 물을 것이 있으면 로비의 「의견 보내기」로 알려 주세요. 답을 받을 곳을 함께 적어 주세요.",
        `이 안내는 사이트가 바뀌면 함께 고칩니다. 마지막으로 고친 날: ${CHANGED}.`,
      ],
    },
  }),
};

const en: typeof ko = {
  name: "Privacy",
  title: `Privacy: What Is Kept and Who Sees It | ${SITE_NAME}`,
  description: `${SITE_NAME} has no accounts and no cookies. What it keeps in your browser and on the server, for how long, and how addresses and voice chat are handled.`,
  lead: `${SITE_NAME} is one person's project. With no accounts there is little to keep, but not nothing. This page says plainly what is kept, where, for how long, and who can see it.`,
  parts: (facts: PrivacyFacts) => ({
    none: {
      heading: "What is not asked for",
      lines: [
        "There is no sign-up, no email and no password. A nickname is all you choose.",
        "No cookies are used. There are no ads and no visitor analytics, and no scripts or fonts are loaded from other companies.",
      ],
    },
    browser: {
      heading: "What is kept in this browser",
      lines: [
        "Your nickname, language, volume, the game you last picked, whether room codes are hidden and which notices you have already seen are kept in this browser's storage.",
        "How many games of each kind you have played to the end, and in how many you came first, are kept in this browser only. They are not sent to the server.",
        "A random value that tells this browser apart is made and kept. It puts you back in your seat when a connection drops and returns, and it is sent to the rooms you enter.",
        "A room's recent chat and how it last looked are kept only while that tab is open, in case the page is loaded again.",
        "Clearing this site's data in your browser's settings removes all of it.",
      ],
    },
    room: {
      heading: "When you enter a room",
      lines: [
        "The room holds your nickname, the random value above, your seat and the game's progress on the server. If the host tells the room a meeting time, the room holds that too, and everyone who enters the room sees it. If you pick the game you want next, the room holds that with your seat.",
        `When the last player presses leave, what the room held is deleted at once. A room left with everyone disconnected is deleted after ${facts.roomHours} hours.`,
        "People in the same room see your nickname, whether you are connected, your chat, and how many games you have played and won in that room.",
        "While you have the rules open in a waiting room, the others in the room are told how many people are reading them, not who. It is not stored.",
        "If you pick the game you want next in a waiting room, the people in the room are told how many picked each game, not who. Your pick stays in the room until you take it back or the host changes the game, and is deleted with the room.",
        `Chat is passed to the people in the room and not stored on the server. If someone reports a player, though, that player's nickname and up to ${facts.flagLines} of their chat lines are kept for the maker of the site to read.`,
        "A public room shows its code, its game, its host's nickname and how many are in it on the lobby's list, to anyone. A private room is not on the list.",
      ],
    },
    address: {
      heading: "Your network address (IP)",
      lines: [
        "Your address is used to count whether one place is opening connections or making rooms far too often.",
        "To count visitors, a one-way digest (a hash) of the address is kept for the day and deleted at the first visit after the day changes. The address itself is not written down. The digest is not encryption, though: someone determined could work out which address it came from.",
        `When you make a room, the same digest is kept with the time, and those older than ${facts.madeMinutes} minutes are deleted the next time anyone makes a room.`,
        "If you say in the lobby that you will come to a meet-up, the same digest and a second random value of this browser are kept with that meet-up, and those of past meet-ups are deleted the next time anyone answers one.",
        "Everything else that is kept is a number: visits by day, rooms made, games played of each kind.",
        "The server log the site writes says only that things happened, such as a room being made or a game starting. It holds no address, room code, nickname or chat.",
      ],
    },
    voice: {
      heading: "Voice chat",
      lines: [
        "Voice chat can be turned on only in a private room. The first time, you are told what follows before it is on; then the microphone is asked for, and if you refuse you only listen.",
        "Sound goes straight between the players' browsers, not through the server. The server neither receives nor stores it.",
        "Because of that, people in voice chat together can learn each other's network addresses. It is better not to turn it on with strangers.",
        "To connect, your browser asks servers of Cloudflare and Google what its own address is (STUN). Those two companies' servers see your address then.",
      ],
    },
    words: {
      heading: "Feedback",
      lines: [
        "What you send with “Send feedback” in the lobby is stored as the text, the time, the page's language and the site's version. No nickname or address is attached.",
        `Together with reports, the latest ${facts.wordsKept} are kept, and only the maker of the site reads them. Contact details you write to get an answer stay in the text as written.`,
      ],
    },
    host: {
      heading: "Where the server is",
      lines: ["The site runs on Cloudflare's servers. As with any site, Cloudflare handles connection details such as your address while serving requests."],
    },
    ask: {
      heading: "To ask, or to have something deleted",
      lines: [
        "Send it with “Send feedback” in the lobby, and say where an answer can reach you.",
        `This page is changed when the site changes. Last changed: ${CHANGED}.`,
      ],
    },
  }),
};

/** The notice's words, in every language. */
export const PRIVACY_WORDS: Record<Lang, typeof ko> = { ko, en };

/** The parts of the notice, in the order they are read. */
export const PRIVACY_PARTS = ["none", "browser", "room", "address", "voice", "words", "host", "ask"] as const satisfies readonly (keyof ReturnType<(typeof ko)["parts"]>)[];

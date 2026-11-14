/**
 * What changed on the site, as a player would say it (`/ko/news/`,
 * `/en/news/`; drawn by `pages.ts`), Korean and English side by side.
 *
 * It is a page for players, not the list of commits: a line is here when
 * someone playing would notice the change, and it says what they can now do,
 * in the words the screens use. The lobby's line with the build's number
 * leads here.
 *
 * A change a player would notice adds a line under its day, newest day
 * first, in both languages. A game is called by the name `games.json` gives
 * it, so a name is not written twice.
 *
 * In a file of its own for the reason the notice of what is kept has one
 * (`privacy-words.ts`): the game's script takes its title from `words.ts` and
 * would carry these lines with it.
 */
import { GAMES, type GameId } from "../games";
import type { Lang } from "../lang";
import { SITE_NAME } from "./words";

/** One change, as each language says it. */
type Line = Record<Lang, string>;

/** A day's changes. */
export interface NewsDay {
  /** The day they reached the site, as `2026-11-14`. */
  date: string;
  lines: Line[];
}

/** A game's name in each language. */
const name = (game: GameId): Line => GAMES[game].title;

const GRASS = name("lay-the-grass");
const ROULETTE = name("russian-roulette");
const CUBES = name("count-cubes");
const POKER = name("memory-poker");
const MARKET = name("mystery-stock-market");

/** The days, newest first. */
export const NEWS: NewsDay[] = [
  {
    date: "2026-11-14",
    lines: [
      {
        ko: "대기실에서 「QR」을 누르면 초대 링크가 QR 코드로 보입니다. 옆에 있는 사람이 폰 카메라로 찍어 들어옵니다.",
        en: "Press \"QR\" in the waiting room and the invite link is shown as a QR code, for someone beside you to point a phone at.",
      },
      {
        ko: "「방 전적」을 그림으로 공유할 수 있고, 거기서 바로 다음 약속을 잡을 수 있습니다.",
        en: "The room tally can be shared as a picture, and leads straight on to setting the next time to meet.",
      },
      {
        ko: "「내 기록」이 일곱 게임의 도장판이 되었습니다: 해 본 게임과 아직 안 해 본 게임이 한눈에 보입니다.",
        en: "\"My record\" is now a board of all seven games: which you have played and which you have not, at a glance.",
      },
      {
        ko: `${MARKET.ko}: 방장이 「끝나면 보유 공개」를 고르면, 게임이 끝난 뒤 누가 어느 종목을 언제 얼마나 들고 있었는지 모두가 봅니다.`,
        en: `${MARKET.en}: when the host chooses "holdings told", once the game is over everyone sees who held how much of each stock, round by round.`,
      },
      {
        ko: "방에 있던 탭이 닫혀도 3분 안에 사이트를 다시 열면 로비가 하던 방으로 돌아가는 길을 보여 줍니다.",
        en: "When a tab in a room is closed, opening the site again within 3 minutes shows the way back to that room in the lobby.",
      },
      {
        ko: "방 목록이 게임 중인 방마다 게임이 몇 분째인지 말합니다.",
        en: "The list of rooms says how many minutes each room's game has been going.",
      },
      {
        ko: "모임 시간에 로비의 모임 줄을 누르면 모두 같은 방으로 들어갑니다.",
        en: "While a meeting is on, pressing its line in the lobby takes everyone into the same room.",
      },
      {
        ko: `${GRASS.ko}: 방장이 공원 3곳을 이어서 까는 방식을 고를 수 있습니다.`,
        en: `${GRASS.en}: the host can choose a game of three parks, one after another.`,
      },
      {
        ko: "게임의 규칙 페이지와 공유한 결과의 링크가 그 게임의 방 목록으로 열립니다.",
        en: "A game's page of rules and the link of a shared result open the lobby on that game's rooms.",
      },
      {
        ko: "방장이 아닌 사람도 다음에 하고 싶은 게임을 말할 수 있고, 방장은 다시 모일 시간을 방에 알릴 수 있습니다.",
        en: "A player who is not the host can say which game they would like next, and the host can tell the room when to meet again.",
      },
    ],
  },
  {
    date: "2026-11-13",
    lines: [
      {
        ko: "방이 사람마다 몇 판을 했고 몇 번 이겼는지 세고, 지난 판 1위의 이름 옆에 왕관을 답니다.",
        en: "A room counts each player's games and wins, and puts a crown beside whoever did best in its last game.",
      },
      {
        ko: "방장이 탈락전을 켤 수 있습니다: 판마다 꼴찌는 다음 판부터 구경합니다.",
        en: "The host can turn on Knockout: last place in each game watches from the next one on.",
      },
      {
        ko: "채팅을 한 사람에게만, 몇 사람에게만, 또는 자기 팀에게만 할 수 있습니다.",
        en: "A chat line can be said to one player, to a few, or to your own team.",
      },
      {
        ko: "초대 링크를 보내면 어떤 게임인지 그림과 함께 보이고, 링크에 만날 날짜와 시간을 담을 수 있습니다.",
        en: "An invite link shows which game it is for, with a picture, and can carry the day and time to meet.",
      },
      {
        ko: "닫힌 방의 링크를 누르면 같은 코드로 방이 다시 열립니다.",
        en: "A link to a room that has closed opens the room again under the same code.",
      },
      {
        ko: "로비가 사람들이 모이는 시간을 알려 주고, 「갈게요」를 눌러 두면 달력에 넣을 수 있습니다.",
        en: "The lobby says when people meet; say \"I'm in\" and you can put the meeting in your calendar.",
      },
      {
        ko: "사이트를 폰의 홈 화면에 두면 전체 화면으로 열립니다.",
        en: "Put the site on a phone's home screen and it opens over the whole screen.",
      },
      {
        ko: "게임 결과를 화면 그림으로 공유할 수 있고, 결과 화면에서 방장이 아닌 사람도 「한 판 더」를 말할 수 있습니다.",
        en: "A game's result can be shared as a picture of its screen, and on the results a player who is not the host can ask for \"Again\".",
      },
      {
        ko: `방장이 정할 수 있는 것이 늘었습니다: ${ROULETTE.ko}의 숨은 행동을 끝난 뒤 공개할지, ${CUBES.ko}의 문제를 얼마 동안 보여 줄지, ${POKER.ko}를 몇 라운드 할지.`,
        en: `The host decides more: whether ${ROULETTE.en}'s hidden moves are told when the game is over, how long a problem of ${CUBES.en} is shown, and how many rounds ${POKER.en} is.`,
      },
      {
        ko: "처음 하는 게임에서는 화면 위의 줄이 무엇을 보고 두는지 알려 주고, 규칙은 목표·할 일·끝 세 줄로 시작합니다.",
        en: "In a first game the bar says what to look at, and every game's rules open with three lines: the goal, what you do, and the end.",
      },
      {
        ko: "공개 방에서는 다른 사람의 채팅을 가리거나 신고할 수 있습니다.",
        en: "In a public room you can hide another player's chat lines or report them.",
      },
      {
        ko: "개인정보 안내가 생겼습니다: 사이트가 무엇을 얼마 동안 두는지 적었습니다.",
        en: "There is now a privacy notice: what the site keeps, and for how long.",
      },
    ],
  },
  {
    date: "2026-11-12",
    lines: [
      {
        ko: "폰에서 모든 게임을 손가락으로 할 수 있습니다.",
        en: "Every game can be played on a phone with a finger.",
      },
      {
        ko: "방장이 사람들을 그대로 둔 채 방의 게임을 바꿀 수 있습니다.",
        en: "The host can turn a room to another game without anyone leaving it.",
      },
      {
        ko: "빠른 입장, 준비 표시, 한 번 눌러 말하는 여덟 마디가 생겼습니다. 마디는 읽는 사람의 언어로 보입니다.",
        en: "Quick join, ready marks, and eight things to say with one press, which each player reads in their own language.",
      },
      {
        ko: `${GRASS.ko}의 선택 6~8 카드가 판마다 새로 뽑힙니다. 방송의 카드로 하려면 방장이 고릅니다.`,
        en: `${GRASS.en} draws the cards of Selections 6 to 8 anew for each game; the host can ask for the show's cards.`,
      },
      {
        ko: "로비에서 게임에 대한 의견을 보낼 수 있습니다.",
        en: "You can send a word about the game from the lobby.",
      },
    ],
  },
  {
    date: "2026-11-11",
    lines: [
      {
        ko: "일곱 게임으로 문을 열었습니다. 한국어와 영어로 읽을 수 있습니다.",
        en: "The site opened with seven games, in Korean and English.",
      },
    ],
  },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ko = {
  /** The link under every page, and the page's own heading. */
  name: "소식",
  title: `소식: 최근에 바뀐 것 | ${SITE_NAME}`,
  description: `${SITE_NAME}에서 최근에 바뀐 것을 날짜별로 적었습니다. 새로 생긴 방식, 로비와 방에서 달라진 점을 플레이하는 사람의 말로 읽습니다.`,
  lead: "최근에 바뀐 것을 날짜별로 적습니다. 플레이하면서 알아볼 만한 것만 적습니다.",
  /** A day as its heading says it. */
  day: (year: number, month: number, day: number) => `${year}년 ${month}월 ${day}일`,
};

const en: typeof ko = {
  name: "News",
  title: `News: what changed lately | ${SITE_NAME}`,
  description: `What changed lately on ${SITE_NAME}, by day: new ways to play, and what is different in the lobby and the rooms, in a player's words.`,
  lead: "What changed lately, by day. Only what you would notice while playing.",
  day: (year, month, day) => `${MONTHS[month - 1] ?? ""} ${day}, ${year}`,
};

/** The page's own words, by language. */
export const NEWS_WORDS: Record<Lang, typeof ko> = { ko, en };

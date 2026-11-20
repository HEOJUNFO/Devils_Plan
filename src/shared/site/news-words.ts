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
const RECT = name("count-rectangles");
const HEAVY = name("under-thirteen");
const PIGGY = name("piggy-bank");

/** The days, newest first. */
export const NEWS: NewsDay[] = [
  {
    date: "2026-11-20",
    lines: [
      {
        ko: `새 게임 ${PIGGY.ko}: 방송 3일차의 감옥 매치입니다. 3명에서 6명이 합니다. 저금통에 동전을 넣고 말한 뒤 건네면 받은 사람이 그 안의 흑 또는 백 동전 수를 답하고, 틀린 것 같으면 의심합니다. 넣은 개수와 답은 그때만 보이고 기록에 남지 않습니다. 리셋과 도전, 5점에서 끝나는 것까지 방송의 규칙 그대로입니다.`,
        en: `A new game, ${PIGGY.en}: the prison match of the show's third day, for 3 to 6 players. Put coins into a piggy bank, say what went in and pass it on; the receiver says how many black or white coins it now holds, and anyone who thinks that wrong declares a suspicion. What goes in and what is answered are shown then and there and kept in no record. The reset, the challenge and the end at 5 points are the show's own rules.`,
      },
      {
        ko: `${RECT.ko}: 팀의 대표는 이제 그 팀에서 가장 많이 맞힌 사람입니다 (같으면 먼저 맞힌 사람, 아무도 못 맞혔으면 팀을 먼저 고른 사람). 대기실에서는 대표를 따로 적지 않습니다. 선택 3에서 도전을 고른 사람이 한 명뿐이면 추가 대결 없이 바로 승리합니다. 둘 다 방송에서 그렇게 했다고 뒤늦게 알려진 것입니다.`,
        en: `${RECT.en}: a team's leader is now whoever of it answered right the most (if level, whoever was right first; if nobody was, whoever picked the team first). The waiting room no longer names a leader. In Selection 3, a player who is alone in choosing Challenge wins with no playoff. Both are how the show did it, as has come to be known since.`,
      },
    ],
  },
  {
    date: "2026-11-16",
    lines: [
      {
        ko: `${MARKET.ko}: 판마다 새 규칙으로 하는 판에서, 거래소 로고는 이제 어느 주식의 앞날이 아닙니다. 로고는 처음부터 보이고, 한 회사의 규칙이 "어느 수량을 로고를 따라 움직이면 오른다"가 됩니다. 어느 회사의 어느 수량인지는 가려진 낱말에 있습니다. 방송에서 본 규칙과 닮은 다른 규칙들도 반대로 뒤집혀 있을 수 있습니다 (더 적게 사야 오르는 주식, 보유가 아니라 거래량을 보는 주식). 방송의 규칙으로 하는 판은 그대로입니다.`,
        en: `${MARKET.en}: in a game that draws its own rules, the exchange's logo is no longer one stock's prices to come. The logo is in sight from the start, and one company's rule is now "move this count the way the logo goes and the price rises". Which company's count, and which count, is under the covered words. Other rules that look like the show's may run the other way too (a stock that rises when fewer are bought, one that goes by a traded volume and not by holdings). A game played by the show's own rules is as it was.`,
      },
      {
        ko: `${MARKET.ko}: 판마다 새 규칙으로 하는 판에서는 일곱 규칙의 문장 틀이 1라운드부터 모두에게 보입니다. 가려지는 것은 그 판에서 뽑은 것뿐입니다: 5라운드에 오르는 값, 10라운드에 내리는 값, 15라운드에 어느 수량·어느 방향인지, 20라운드에 어느 회사인지가 열립니다. 방송을 봤거나 여러 판 해 봐서 문장을 외운 사람과 처음 온 사람이 같은 것을 보고 시작합니다. 피스는 그 규칙에 가려진 다음 낱말을 엽니다.`,
        en: `${MARKET.en}: in a game that draws its own rules, the frame of all seven rules is open to everyone from round 1. Only what the game drew is covered: the gain opens at round 5, the loss at round 10, which count and which way at round 15, and which company at round 20. Someone who knows the sentences from the show, or from games played here, and someone new now start from the same board. A piece opens the next covered words of its rule.`,
      },
    ],
  },
  {
    date: "2026-11-15",
    lines: [
      {
        ko: "없는 주소: 잘린 링크나 잘못 친 주소로 들어오면 영어 두 단어만 보였습니다. 이제 한국어와 영어 안내, 그리고 로비와 게임 목록으로 가는 링크가 있는 페이지가 보입니다.",
        en: "A missing address: a link cut short or an address typed wrong used to show two words of English and nothing else. It now shows a page in Korean and English with links to the lobby and to the list of games.",
      },
      {
        ko: `${CUBES.ko}: 정답을 맞히면 색종이가 날립니다. ${MARKET.ko}: 1위로 끝나면 색종이가 날립니다. ${HEAVY.ko}: 받침대가 비워질 때 그 자리에서 연기가 피어오릅니다.`,
        en: `${CUBES.en}: a right answer throws confetti. ${MARKET.en}: finishing first throws confetti. ${HEAVY.en}: a stand that is cleared goes up in a puff of smoke.`,
      },
      {
        ko: "로비: 방 목록의 한 줄을 누르고 있는 동안에는 목록이 다시 그려지지 않습니다. 누르는 순간 줄이 바뀌어 다른 방에 들어가거나 누름이 사라지는 일이 없습니다. 빠른 입장은 가려던 방이 찼을 때, 그 순간의 목록에서 다음 방을 고릅니다.",
        en: "Lobby: the list of rooms is not redrawn while one of its rows is being pressed, so a press no longer lands on another room or goes missing when the rows change under it. When the room a quick join was headed for has filled, it picks the next from the list as it is at that moment.",
      },
      {
        ko: "폰에서: 대기실의 안내 줄이 길어 아래의 「약속 잡기」 줄과 겹쳐 보이던 것을 고쳤습니다. 혼자 기다리는 방장의 안내와 팀 안내가 한 줄에 들어갑니다.",
        en: "On a phone: a long hint in the waiting room ran into the row of links under it. Fixed: the hint for a host waiting alone and the hints about teams now fit on one line.",
      },
      {
        ko: "다른 탭을 보고 있을 때: 내 차례와 방장을 찾는 호출은 세 음으로, 채팅·입장·게임 시작 같은 알림은 두 음으로 부릅니다. 소리만 듣고도 서둘러야 하는지 알 수 있습니다.",
        en: "While you are on another tab: your turn and the room's call for its host now ring three notes, and chat, someone coming in or a game starting ring two, so the sound alone says whether to hurry.",
      },
      {
        ko: `${GRASS.ko}·${RECT.ko}: 판이 끝나면 이겼는지 졌는지 소리로도 알려 줍니다. ${POKER.ko}: 대결을 이기면 색종이가 날립니다.`,
        en: `${GRASS.en} and ${RECT.en}: the end of a game now sounds a win or a loss. ${POKER.en}: winning a showdown throws confetti.`,
      },
      {
        ko: `${HEAVY.ko}·${POKER.ko}: 내가 아직 내지 않았거나 고르지 않았는데 시간이 5초 남으면, 1초마다 소리가 납니다.`,
        en: `${HEAVY.en} and ${POKER.en}: with 5 seconds left and your move not made, each second now ticks aloud.`,
      },
      {
        ko: "대기실: 화면을 보고 있을 때도 누가 들어오면 짧은 소리가 납니다.",
        en: "Waiting room: a short sound now marks someone coming in while you have the page in front of you, too.",
      },
      {
        ko: `${RECT.ko}: 방의 모두가 한 팀이면 겨룰 상대가 없다는 것을 시작 전에 알려 줍니다.`,
        en: `${RECT.en}: when everyone in the room is on one team, the waiting room now says there is no other side before you start.`,
      },
      {
        ko: "로비의 모임 줄: 모임까지 한 시간 넘게 남았을 때는 분을 빼고 「12시간 뒤」처럼 시간만 보여 줍니다.",
        en: "The meet-up line in the lobby: with an hour or more to go it now shows hours only, as in \"in 12h\".",
      },
      {
        ko: "키보드로 쓸 때: 연결이 끊긴 사람의 방장 메뉴를 열면 키가 메뉴로 들어가지 않던 것, 「만들기」를 누른 뒤 방이 만들어지는 동안 키가 갈 곳을 잃던 것을 고쳤습니다.",
        en: "With a keyboard: the host's menu for a player whose connection had dropped opened without taking the keys, and after pressing \"Make\" the keys were lost while the room was being made. Both fixed.",
      },
      {
        ko: "방장 메뉴: 메뉴를 연 사이 그 사람이 나가고 다른 사람이 같은 자리에 앉으면, 「내보내기」나 「방장 넘기기」가 새로 온 사람에게 적용될 수 있던 것을 고쳤습니다. 이제 메뉴에 이름이 보이던 그 사람에게만 적용됩니다.",
        en: "Host menu: if the player it was opened for left and someone else took the same seat, \"Remove\" or \"Make host\" could land on the newcomer. It now applies only to the player whose name the menu showed.",
      },
      {
        ko: "뒤로 가기: 로비의 게임 고르기 창을 열어 둔 채 방에 들어가면 뒤로 가기를 한 번 눌러도 아무 일도 일어나지 않던 것을 고쳤습니다. 게임 중에 뒤로 가기가 연달아 두 번 들어와도 이제 바로 나가지 않고, 「한 번 더 누르면 나감」에서 멈춥니다.",
        en: "Back button: after entering a room with the lobby's game picker left open, the first press of Back did nothing. Fixed. In a game, a Back heard twice in a moment no longer leaves at once: it stops at \"Press again to leave\".",
      },
      {
        ko: "손 들기: 인원이 모였을 때 두 사람이 거의 동시에 「눌러서 공개 방 열기」를 누르면 각자 방이 하나씩 생겨 혼자 앉게 되던 것을 고쳤습니다. 이제 먼저 누른 한 사람만 방을 열고, 다른 사람에게는 「다른 분이 방을 여는 중입니다」라고 알린 뒤 열린 방으로 안내합니다.",
        en: "Hands up: when enough players had gathered and two pressed \"press to open a public room\" at almost the same moment, each got a room of their own and sat in it alone. Now only the first to press opens the room; the other is told \"Another player is opening the room\" and is then shown the room to join.",
      },
      {
        ko: "방 전적: 다른 사람이 모두 나간 뒤 혼자 끝낸 판을 한 판으로 세던 것을 고쳤습니다. 안내에 적힌 대로, 둘 이상이 끝까지 한 판만 셉니다(「내 기록」과 같습니다). 같은 브라우저의 탭 두 개로 한 방에 있을 때 한 탭에 「내 기록」 버튼이 나타나지 않던 것도 고쳤습니다.",
        en: "Room tally: a game you finished alone after everyone else had left was counted as a game. As the hint says, only games two or more played to the end are counted (the same as My record). Also fixed: with two tabs of one browser in a room, the My record button did not appear in one of them.",
      },
      {
        ko: "하던 방으로 돌아가는 길: 연결이 먼저 끊긴 뒤에 탭을 닫으면, 방이 자리를 이미 내놓은 뒤에도 돌아가는 길을 보여 주던 것을 고쳤습니다. 이제 방이 자리를 지켜 주는 동안만 보여 줍니다. 닫힌 방의 링크로 방을 다시 열다가 「방을 만들지 못했습니다」가 나온 뒤 다시 만들면, 이제 그 링크의 방으로 열립니다. 그렇게 연 방이 비공개여도 다음에 만드는 방은 전에 고른 공개·비공개 그대로입니다.",
        en: "The way back to your room: if the connection had dropped before the tab was closed, the way back was still offered after the room had given your place up. It is now offered only while the room holds the place. When reopening a closed room from its link fails with \"The room could not be made\" and you try again, the room now opens under that link. A room reopened that way is private, and the next room you make still starts from the Public or Private choice you made before.",
      },
      {
        ko: "빠른 입장: 방 목록이 아직 오기 전에 누르면 「기다리는 방이 없습니다」라고 하고 그 누름이 사라지던 것을 고쳤습니다. 이제 목록이 오면 바로 들어갑니다. 방장이 내보낸 방은 빠른 입장이 건너뜁니다. 모임 줄은 모임이 시작하거나 끝나는 순간에 바로 다시 그려지고, 달력 파일의 글자 처리 하나를 바로잡았습니다.",
        en: "Quick join: pressed before the list of rooms had arrived, it said that no room was waiting and the press was lost. It now enters as soon as the list comes. A room whose host sent you out is passed over. The meet-up line is redrawn the moment a meet-up starts or ends, and one mark in the calendar file is now written as the format asks.",
      },
      {
        ko: "몇 사람에게만 한 말은, 그 사람이 나가고 다른 사람이 같은 자리를 막 넘겨받은 순간에도 새로 온 사람에게 가지 않습니다. 큐브 세기에서 연결이 끊긴 사이 이미 오답이 된 답이 입력칸에 다시 남던 것, 앞사람이 신고를 다 쓴 자리에 들어온 사람이 신고할 수 없던 것도 고쳤습니다.",
        en: "A line said to some people no longer reaches a newcomer who was given the seat of someone it was meant for a moment before. Also fixed: in Count the Cubes, an answer already judged wrong while the connection was down came back into the box; and a player given the seat of someone who had used up their reports could not report anyone.",
      },
      {
        ko: "음성 채팅: 마이크 허용 창이 떠 있는 동안 방을 나간 뒤 허용을 누르면 마이크가 로비에서 켜진 채 남던 것을 고쳤습니다. 이제 그 마이크는 바로 닫힙니다. 연결이 끊겼다 돌아오면 음성이 조용히 끊기던 것도 고쳤습니다. 방에서 내보내지면 열려 있던 창(초대 QR, 설정 등)도 함께 닫힙니다.",
        en: "Voice chat: if you left a room while the browser was still asking for the microphone and then allowed it, the microphone stayed open in the lobby. It is now closed at once. Voice also no longer goes silent after a connection is lost and comes back. A sheet left open (the invitation QR, the settings) now closes when you are sent out of a room.",
      },
      {
        ko: "러시안 룰렛: 규칙 창을 열어 둔 사이 차례 시간이 지나가면, 지난 차례에 고른 수나 놓친 맞바꿈이 화면에 그대로 남던 것을 고쳤습니다. 아무도 남지 않아 방이 끝까지 둔 판은 이제 순위·왕관·탈락전에 세지 않습니다.",
        en: "Russian Roulette: when the turn clock ran out while the rules sheet was open, the move chosen for the turn that had gone, or a swap that was lost, stayed on the screen. Fixed. A game the room played out because nobody stayed no longer counts for places, the crown or the knockout.",
      },
      {
        ko: "기억 포커: 인원이 홀수(5명 이상)일 때 한 사람이 매 라운드 셋이 겨루는 조에 들어가던 것을 고쳤습니다. 이제 남는 한 명은 셋 조에 덜 들어갔던 짝에 들어갑니다. 러시안 룰렛 규칙 안내에는 4명·5명 탁자의 실탄 수와, 맞바꿀 칸을 고르다 시간을 넘기면 어떻게 되는지를 적었습니다.",
        en: "Memory Poker: with an odd number of players (5 or more), one player was in the group of three every round. The player left over now joins the pair that has been in a group of three least. The Russian Roulette rules now say how many live rounds a table of 4 or 5 has, and what happens when the time runs out while you pick the chambers to swap.",
      },
      {
        ko: "보이지 않는 글자를 섞어 남의 닉네임과 똑같아 보이게 만든 이름에도 번호가 붙습니다. 번호를 받은 사람이 방에 다시 들어와도 그 번호가 그대로입니다. 오류 기록에서는 문장 안의 웹 주소와 인용된 글을 지웁니다.",
        en: "A nickname made to look like someone else's with characters that show nothing now gets a number too, and a player who was given a number keeps it when they come back to the room. Web addresses and quoted text are now removed from the sentence of an error report.",
      },
      {
        ko: "문구를 바로잡았습니다: 숫자나 방 코드 뒤에 잘못 붙던 조사, 같은 것을 두 이름으로 부르던 곳, 두 가지로 읽히던 규칙 문장. 개인정보 안내에는 모임에 가겠다고 누르면 이 브라우저에 두는 값을 적었습니다.",
        en: "Wording was corrected: particles that came out wrong after a number or a room code (Korean), one thing called by two names, rule sentences that could be read two ways. The privacy notice now lists what this browser keeps when you say you will come to a meet-up.",
      },
      {
        ko: "키보드로 쓰기 편해졌습니다. 의견·규칙·새 방 창을 닫으면 열었던 버튼으로 돌아가고, 창이 열려 있는 동안 Tab이 그 안에서만 돕니다. 고른 게임과 공개·비공개에는 색 말고도 아래에 줄이 생겼습니다.",
        en: "Easier with a keyboard: closing the feedback, rules or new-room sheet returns to the button that opened it, and Tab stays inside a sheet while it is open. The game and the Public or Private choice you picked now have a bar under them as well as a colour.",
      },
    ],
  },
  {
    date: "2026-11-14",
    lines: [
      {
        ko: `${CUBES.ko}: 답을 보낸 순간 연결이 끊기면, 보낸 숫자가 입력 칸에 다시 놓입니다. 다시 연결된 뒤 Enter 한 번이면 됩니다.`,
        en: `${CUBES.en}: if the connection drops as an answer is sent, the number is put back in the box, and one press of Enter sends it again once the connection is back.`,
      },
      {
        ko: `${POKER.ko}: 연결이 끊기기 직전에 뒤집은 카드가 방에 닿지 않았으면, 다시 연결됐을 때 고른 것으로 보이지 않습니다. 전에는 화면에만 고른 것으로 남아, 시간이 다 되면 다른 카드로 겨루게 될 수 있었습니다.`,
        en: `${POKER.en}: a card turned just before the connection dropped is no longer shown as picked on coming back if it never reached the room. Before, it stayed picked on the screen alone, and the round could be played with another card when time ran out.`,
      },
      {
        ko: `${ROULETTE.ko}: 연결이 끊긴 사이에 맞바꾸기를 확정해도 고르던 화면이 그대로 남습니다. 다시 연결되면 한 번 더 누르면 됩니다. 전에는 맞바꾸기가 사라져 판이 멈출 수 있었습니다.`,
        en: `${ROULETTE.en}: a swap confirmed while the connection is down stays on the screen, to be confirmed again once it is back. Before, the swap could vanish and leave the table waiting.`,
      },
      {
        ko: "방에 같은 닉네임이 이미 있으면 뒤에 번호가 붙습니다(「철수 2」). 채팅에서 누가 한 말인지 헷갈리지 않습니다.",
        en: "If a nickname is already in the room, yours gets a number after it (\"Ann 2\"), so a line of chat is never mistaken for someone else's.",
      },
      {
        ko: `빨강과 초록을 가려 보기 어려워도 알아보도록 표시를 더했습니다. ${ROULETTE.ko}: 전에 실탄을 본 약실은 글자 아래에 줄이 있습니다. ${GRASS.ko}: 놓을 수 없는 자리는 칸마다 ×가 그려지고, 공격을 고른 사람의 타일 번호에 밑줄이 있습니다. ${RECT.ko}: 답 옆에 ○나 ×가 붙습니다.`,
        en: `Marks were added for players who cannot tell red from green. ${ROULETTE.en}: a chamber that held a round when it was last seen has a bar under its letter. ${GRASS.en}: a place where the tile does not fit is crossed out cell by cell, and the tile number of a player who took Attack is underlined. ${RECT.en}: an answer is followed by ○ or ×.`,
      },
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
        en: "While a meet-up is on, pressing its line in the lobby takes everyone into the same room.",
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
        en: "The lobby says when people meet; say \"I'm in\" and you can put the meet-up in your calendar.",
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
        ko: "처음 하는 게임에서는 화면 위의 줄이 무엇을 보고 두는지 알려 주고, 규칙은 목표·하는 일·끝 세 줄로 시작합니다.",
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

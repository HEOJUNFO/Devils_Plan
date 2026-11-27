/**
 * What changed on the site, as a player would say it (`/ko/news/`,
 * `/en/news/`; drawn by `pages.ts`), Korean and English side by side.
 *
 * It is a page for players, not the list of commits: a line is here when
 * someone playing would notice the change, and it says what they can now do,
 * in the words the screens use. The lobby's link to the patch notes leads
 * here.
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
const GEM = name("gem-black-market");
const BINGO = name("auction-bingo");
const WALL = name("wall-go-2");
const GRAD = name("gradation");
const EQ = name("equation-traffic-light");
const HIT = name("hit-stay");
const FLAGS = name("flags-around-the-world");
const HIDDEN = name("hidden-word");
const TOWER = name("tower-of-equations");
const OMOK = name("point-gomoku");
const LINK = name("color-link");
const JANGGI = name("card-janggi");
const DIVINE = name("divine-test");

/** The days, newest first. */
export const NEWS: NewsDay[] = [
  {
    date: "2026-11-27",
    lines: [
      {
        ko: `새 게임 ${DIVINE.ko}: 유배지의 49 마방진입니다. 두 명에서 여섯 명이 각자 자기 판에서, 1부터 49까지의 타일을 7×7 판에 놓아 가로·세로·대각선의 합을 모두 175로 만듭니다. 1은 맨 윗줄 가운데에 놓여 있습니다. 올바르게 다 놓는 순간 통과하고, 먼저 통과한 순서대로 순위가 정해집니다. 방송의 1시간 대신 모두에게 같은 30분이 주어집니다.`,
        en: `New game, ${DIVINE.en}: the magic square of 49 from the place of exile. Two to six players, each on a board of their own, place the tiles 1 to 49 on a board of 7 by 7 so that every row, column and diagonal adds up to 175. The 1 is on the middle of the top row. You pass the moment your board is right, and players are ranked in the order they pass. In place of the show's hour, everyone has the same 30 minutes.`,
      },
      {
        ko: `새 게임 ${JANGGI.ko}: 결승의 첫 번째 게임으로, 두 사람이 합니다. 가로 6칸, 세로 5칸 판에 큰 말 하나와 작은 말 셋을 두고, 행마 카드 다섯 장(쥐·말·원숭이·코끼리·기린)을 쓸 순서대로 엎어 놓습니다. 차례마다 앞면인 카드대로 내 말 하나를 옮기고 다음 카드를 공개합니다. 다 쓰면 곧바로 다시 배치합니다. 내 큰 말이 상대 큰 말의 시작 칸에 가거나 상대의 큰 말을 잡으면 그 라운드를 이기고, 3라운드 가운데 2승이면 이깁니다. 판과 카드의 행마는 방송 화면에서 읽었습니다.`,
        en: `New game, ${JANGGI.en}: the first game of the final, for two players. On a board of 6 squares by 5 you each have one great piece and three small ones, and you arrange five movement cards (rat, horse, monkey, elephant, giraffe) face down in the order you will use them. Each turn you move one of your pieces by your face-up card, and your next card is turned over. When you run out, you rearrange them at once. Move your great piece onto the starting square of your opponent's great piece, or capture their great piece, to win the round; two rounds of three win the game. The board and the cards' movements were read from the broadcast.`,
      },
      {
        ko: `새 게임 ${LINK.ko}: 결승의 두 번째 게임으로, 두 사람이 합니다. 색마다 두 개씩 있는 말을 번갈아 판에 놓되, 같은 색의 두 말이 6칸 이상의 길로 이어질 수 있어야 하고 길끼리 겹치면 안 됩니다. 더는 이을 수 없다고 보면 말을 놓는 대신 연결 불가를 선언합니다. 마지막에 말을 놓은 사람이 모든 짝을 이어 보이면 1점, 못 하면 선언한 사람이 1점. 3점을 먼저 얻으면 이깁니다. 1·2라운드의 판은 방송의 판입니다.`,
        en: `New game, ${LINK.en}: the second game of the final, for two players. Take turns placing pieces, two of each color, so that the two of a color can be linked by a path of at least 6 spaces, with no paths overlapping. When you think the board can no longer be linked, declare impossibility instead of placing. The player who placed last gets a point for proving every connection; otherwise the declarer gets it. First to 3 points wins. The boards of Rounds 1 and 2 are the show's.`,
      },
      {
        ko: `${HIDDEN.ko}: 봉투에 들어가는 낱말이 417개에서 2,933개로 늘었습니다. 여러 판을 해도 같은 히든 워드를 다시 만나는 일이 드뭅니다.`,
        en: `${HIDDEN.en}: the envelopes are now filled from 2,933 words, up from 417. You will seldom meet the same hidden word again, however many games you play.`,
      },
      {
        ko: `${HIDDEN.ko}: 힌트 10개를 다 내거나 힌트 시간이 끝나도 유사도 95% 이상인 힌트가 없으면, 낱말 목록에서 히든 워드와 유사도가 가장 높은 낱말이 자동으로 공개됩니다. 전에는 그때까지 낸 힌트 가운데 가장 높은 것에 표시만 했습니다.`,
        en: `${HIDDEN.en}: when ten clues are given or the time for clues runs out with no clue of at least 95%, the word of the game's list with the highest similarity score to the hidden word is now automatically revealed. Before, the highest of the clues given was only marked.`,
      },
      {
        ko: `${HIDDEN.ko}: 오래 열어 둔 페이지에서 히든 워드를 고르는 화면에 오류가 나던 문제를 고쳤습니다.`,
        en: `${HIDDEN.en}: fixed an error on the screen where you pick your hidden word, on a page that had been left open since before an update.`,
      },
    ],
  },
  {
    date: "2026-11-26",
    lines: [
      {
        ko: `새 게임 ${OMOK.ko}: 두 사람이 19줄 판에서 합니다. 라운드마다 선택 플레이어가 연속된 세 점을 고르고, 둘 다 10포인트를 받아 세 점에 몰래 나눠 겁니다. 점마다 더 많이 건 사람의 돌이 놓이고, 남긴 포인트의 절반이 다음 라운드로 넘어갑니다. 먼저 오목을 만들면 이깁니다.`,
        en: `New game, ${OMOK.en}: two players on a board of 19 lines. Each round the selector marks three spots in a row, and both get 10 points to bet on them in secret. The higher bet on a spot places its stone, and half the points you keep carry over to the next round. Five in a row wins.`,
      },
      {
        ko: `새 게임 ${TOWER.ko}: 2~6명이 합니다. 네 자리에 쌓인 숫자 블록을 몇 번 옮기면 타깃 넘버가 되는 탑을 만들 수 있는지 머리로 세어, 먼저 버저를 누르고 이동 횟수를 선언합니다. 가장 적게 부른 사람이 실제로 옮겨 성공하면 점수를 얻고 실패하면 잃습니다. 7점이면 끝. 방을 만들 때 방송의 처음 배치로도 시작할 수 있습니다.`,
        en: `New game, ${TOWER.en}: for 2 to 6 players. Count in your head how many moves of the number blocks on four positions build a tower equal to the target number, then press the buzzer first and declare your moves. Whoever declares the fewest makes them: points for success, points lost for failure. First to 7. A room can also begin with the show's own towers.`,
      },
      {
        ko: "게임을 하는 중에 사이트가 새 버전으로 바뀌면 게임 화면이 멈출 수 있던 문제를 고쳤습니다. 이제 다음 판이 시작될 때나 화면에 문제가 생겼을 때 페이지가 스스로 새 버전으로 다시 열리고, 있던 방과 게임으로 돌아옵니다.",
        en: "Fixed: a game's screen could freeze when the site was updated while you were playing. The page now loads the new version by itself as the next game begins, or when its screen goes wrong, and comes back to your room and your game.",
      },
      {
        ko: `${HIDDEN.ko}: 히든 워드를 고르는 화면에서 「유사도 재 보기」가 빠졌습니다. 봉투에서 낱말을 고르면 바로 넘어가고, 고르는 시간은 30초입니다.`,
        en: `${HIDDEN.en}: the screen where you pick your hidden word no longer has the similarity checks. Pick a word of your envelope and the game goes on; you have 30 seconds to pick.`,
      },
      {
        ko: "모든 게임의 제한 시간이 절반으로 줄었습니다. 차례 시간은 방장이 무제한·30초·60초 가운데 고르고, 게임마다 정해진 시간(답하기, 고르기, 한 라운드)도 반입니다. 외우는 시간과 결과를 보여 주는 시간은 그대로입니다.",
        en: "Every game's time limits are half what they were. The host picks a turn of no limit, 30 or 60 seconds, and each game's own clocks (to answer, to choose, a round) are half as long. The time to memorise and the time results stay up are as before.",
      },
      {
        ko: "휴대폰을 세로로 들어도 할 수 있습니다. 「화면을 가로로 돌려 주세요」 안내가 화면을 덮지 않고, 화면 폭에 맞춘 게임이 그대로 나옵니다. 가로로 돌리면 더 크게 보입니다.",
        en: "A phone held upright now plays too. The notice that asked you to turn the screen no longer covers it: the game is shown as wide as the screen, and larger when the phone is turned sideways.",
      },
      {
        ko: "로비 아래의 「버전」 글자가 「패치노트」로 바뀌었습니다. 누르면 전처럼 이 페이지가 열리고, 읽지 않은 줄이 있으면 옆에 NEW가 붙습니다.",
        en: "The version at the bottom of the lobby now reads \"Patch notes\". It still opens this page, with NEW beside it while there are lines you have not read.",
      },
    ],
  },
  {
    date: "2026-11-25",
    lines: [
      {
        ko: `${HIDDEN.ko}: 두 명이서도 할 수 있습니다 (출제자 한 명, 맞히는 사람 한 명). 봉투에는 두 글자 이상의 낱말만 들어갑니다.`,
        en: `${HIDDEN.en}: two can now play (one word setter, one to guess). An envelope now holds only words of two syllables or more.`,
      },
      {
        ko: "연승이 로비의 방 목록에도 보입니다. 공개 방에 연승 중인 사람이 있으면 그 방의 줄에 몇 연승인지 나오고, 방장이 아닌 사람의 연승이면 닉네임도 함께 나옵니다. 여럿이면 가장 긴 연승입니다.",
        en: "Streaks now show on the lobby's list of rooms too. A public room where someone is on a streak says how many in a row on its line, with that player's nickname where the streak is not the host's own; of several, the longest.",
      },
      {
        ko: "로비 아래의 버전 옆에 NEW가 붙으면 이 페이지에 아직 읽지 않은 줄이 있다는 뜻입니다. 버전을 눌러 이 페이지로 오면 사라지고, 새 줄이 생기면 다시 붙습니다.",
        en: "When NEW appears beside the version at the bottom of the lobby, this page has lines you have not read. It goes away once you follow the version here, and comes back with the next new line.",
      },
      {
        ko: `새 게임 ${HIDDEN.ko}: 시즌의 다섯 번째 메인 매치입니다. 2~6명이 함께 합니다. 각자 명사 다섯 개가 든 봉투에서 하나를 히든 워드로 숨기고, 출제자가 낸 힌트마다 히든 워드와의 유사도가 모두에게 보입니다. 95% 이상인 힌트가 나오면 나머지가 히든 워드를 적어 함께 엽니다. 맞히면 1점, 아무도 못 맞히면 출제자가 점수를 얻고 3차까지 힌트를 더 냅니다. 2라운드는 점수가 2배입니다. 유사도는 방송의 값이 아니라 이 사이트가 한국어 낱말 1만 1천여 개에 미리 매겨 둔 값이고, 힌트는 그 목록의 낱말로 냅니다.`,
        en: `A new game, ${HIDDEN.en}: the season's fifth main match, for 2 to 6 players. Everyone hides one of the five nouns in their envelope as their hidden word; each clue the word setter gives is shown to all with its similarity score. A clue of at least 95% ends the clues and the others write the hidden word, revealed together. A correct answer is a point; with none, the setter scores and gives clues again, up to three stages. Round 2 counts double. The scores are not the show's: this site worked them out in advance for some 11,000 Korean words, and a clue has to be one of them. The words are Korean, as in the show.`,
      },
      {
        ko: `새 게임 ${FLAGS.ko}: 5일차의 유배지 매치입니다. 2~16명이 함께 합니다. 국기 10개가 1초씩, 같은 순서로 세 번 지나가고, 5초 뒤 나오는 25개 가운데 방금 본 5개를 1분 안에 찾습니다. 맞힌 하나에 1점이고 3라운드의 점수 합으로 겨룹니다. 1위가 여럿이면 그 사람들끼리 연장 라운드를 합니다. 국기는 유엔 회원국 193개국의 것입니다.`,
        en: `A new game, ${FLAGS.en}: the exile match of the season's fifth day, for 2 to 16 players. Ten national flags are shown for a second each, three times in the same order; five seconds later 25 flags appear, and you have a minute to find the five you saw. One point for each correct flag, over three rounds; players tied for first play tiebreaker rounds. The flags are those of the 193 UN member states.`,
      },
      {
        ko: `${EQ.ko}: 수식에 등호를 둘 이상 쓸 수 있습니다 (2+2=4=2^2). 등호로 나뉜 값이 모두 같아야 성립합니다.`,
        en: `${EQ.en}: an equation may now have more than one equals symbol (2+2=4=2^2), as long as every side comes to the same value.`,
      },
      {
        ko: `새 게임 ${HIT.ko}(힛, 스테이): 시즌의 여섯 번째 메인 매치입니다. 2~5명이 카드의 합을 주사위가 정한 한계 숫자에 가깝게 맞추며 칩을 겁니다. 카드를 더 받으면 힛, 멈추면 스테이이고, 칩이 떨어지면 빠집니다.`,
        en: `A new game, ${HIT.en}: the season's sixth main match. Two to five players bet chips on a card total close to the limit a die sets. Hit for another card or stay; a player with no chips is out, and the last one remaining wins.`,
      },
      {
        ko: `새 게임 ${EQ.ko}: 결승전의 마지막 게임입니다. 두 사람이 아홉 칸 수식을 몰래 만들고, 턴마다 함께 답안을 내어 칸마다 빨강·노랑·초록 힌트를 받습니다. 상대의 수식을 먼저 맞히면 이깁니다.`,
        en: `A new game, ${EQ.en}: the last game of the final. Two players each create a hidden nine-cell equation, then submit an answer every turn and get a red, yellow or green clue on each cell. Guess your opponent's equation first to win.`,
      },
      {
        ko: `새 게임 ${GRAD.ko}: 시즌의 여섯 번째 감옥 매치입니다. 2~3명이 숫자 큐브를 통 일곱 개에 숨겨 담고, 색만 보이는 통을 한 개씩 내어 큰 수로 겨룹니다. 대결은 6번까지이고, 그때까지 2연승이 없으면 대결을 많이 이긴 순서로 순위를 정합니다.`,
        en: `A new game, ${GRAD.en}: the season's sixth prison match. Two or three players hide number cubes in seven cups and submit them one at a time, showing only a cup's shade; the higher number wins the round. A game has six matches at most: with no two wins in a row by then, players are placed by matches won.`,
      },
      {
        ko: "게임 목록은 이제 새로 나온 게임이 맨 위입니다. 로비의 게임별 보기, 새 방, 게임 바꾸기, 내 기록이 모두 같은 순서입니다.",
        en: "Lists of games now have the newest game at the top: the lobby's rooms by game, a new room, Change the game and My record are all in that order.",
      },
      {
        ko: "연승을 셉니다. 한 방에서 두 판 이상 잇달아 1위를 하면 채팅과 방 전적에 몇 연승인지 나오고, 내 기록에는 게임마다 지금의 연승과 가장 길었던 연승이 남습니다.",
        en: "Streaks are counted. Two or more games in a row at the top of a room show in its chat and its tally, and your own record keeps, for each game, the streak you are on and the longest you have had.",
      },
      {
        ko: `${RECT.ko}: 패배한 팀의 희생·질책은 이제 팀의 대표 혼자 정합니다 (승리한 팀의 독식·헌신은 전처럼 다수결).`,
        en: `${RECT.en}: a losing team's Sacrifice or Punish is now its leader's alone to pick (a winning team still decides Monopolize or Sacrifice by majority).`,
      },
      {
        ko: `${GEM.ko}: 최종 승점이 같으면 곱하기 전의 내 승점이 높은 사람이, 그것도 같으면 마지막 라운드에서 돌아오는 차례가 빠른 사람이 위 순위가 됩니다.`,
        en: `${GEM.en}: players level on final points are now ranked by their own points before the multiplying, and then by who exchanged earlier on the way back in the last round.`,
      },
    ],
  },
  {
    date: "2026-11-24",
    lines: [
      {
        ko: "한 사람이 채팅을 줄줄이 보내 방의 대화를 덮지 못합니다. 한 사람이 1분에 보낼 수 있는 말은 20줄까지입니다.",
        en: "One player can no longer bury a room's chat under their own lines: each player can send up to 20 lines a minute.",
      },
    ],
  },
  {
    date: "2026-11-20",
    lines: [
      {
        ko: `모임의 게임이 요일마다 하나에서 모든 게임이 하루씩 돌아가는 것으로 바뀝니다. 11월 27일까지는 예정대로이고, 28일부터 ${PIGGY.ko}, ${GEM.ko}, ${BINGO.ko}, ${WALL.ko}이 차례로 들어온 뒤 열한 게임이 계속 돕니다.`,
        en: `The meetings now go round every game, a day each, instead of one game for each day of the week. Through 27 November they are as planned; from the 28th come ${PIGGY.en}, ${GEM.en}, ${BINGO.en} and ${WALL.en}, and then all eleven games keep going round.`,
      },
      {
        ko: `새 게임 ${BINGO.ko}: 방송 4일차의 메인 매치입니다. 3명에서 16명이 합니다. 모두 같은 빙고판을 갖고, 라운드마다 도형 하나를 고른 뒤 그 도형에 코인을 몰래 겁니다. 가장 많이 건 사람이 그 도형을 고른 사람 수만큼 얻지만, 누가 낙찰받았는지는 본인도 모르고 가장 높은 낙찰가는 가려집니다. 7라운드 뒤 빙고 수로 순위를 가립니다. 선택과 입찰 시간은 방장이 고릅니다 (45초씩, 2분·3분, 방송의 15분·20분).`,
        en: `A new game, ${BINGO.en}: the main match of the show's fourth day, for 3 to 16 players. Everyone has the same bingo card; each round you pick a shape and then bid coins on it in secret. The highest bidder wins as many of the shape as players picked it, but nobody is told who won, not even the winner, and the highest winning bid is hidden. After 7 rounds the most bingos wins. The host picks the time to choose and to bid (45 s each, 2 and 3 min, or the show's 15 and 20 min).`,
      },
      {
        ko: `새 게임 ${WALL.ko}: 방송 4일차의 감옥 매치입니다. 2명이나 3명이 합니다. 차례마다 내 말 하나를 움직이고 그 옆에 벽을 세워, 벽으로 갈린 뒤 내 말이 든 영역이 가장 넓으면 이깁니다. 3명이면 방송처럼 3인전(각자 벽 부수기 한 번) 뒤에 1위를 뺀 두 사람이 1:1을 하고, 2명이면 1:1 한 판을 합니다. 1:1에서 원형 말이 처음 서는 자리는 방송에서 확인하지 못해, 모서리에서 한 칸 안쪽의 네 칸으로 정했습니다.`,
        en: `A new game, ${WALL.en}: the prison match of the show's fourth day, for 2 or 3 players. Each turn you move one of your counters and place a wall beside it; once walls part everyone, the largest territory around your counters wins. Three players play as the show does, a round of three (one wall breaker each) and then a one on one between the two who were not first; two players play one game one on one. Where the round counters start in the one on one could not be found in the show, so they start one square in from each corner.`,
      },
      {
        ko: `새 게임 ${GEM.ko}: 방송 3일차의 메인 매치입니다. 4명에서 9명이 합니다. 뒷면으로 받은 카드 한 장을 라운드마다 두 번, 다른 사람이나 구매자 칸, 휴지통의 카드와 꼭 바꿔야 합니다. 구매자 칸과 같은 종류의 보석을 쥐고 있으면 승점, 폭탄을 쥐고 있으면 감점이고, 3라운드 뒤 내 승점에 마니또의 승점을 곱합니다. 내 카드는 내 차례에만 볼 수 있습니다. 경매, 폭탄, 피스로 하는 확인까지 방송의 규칙 그대로입니다.`,
        en: `A new game, ${GEM.en}: the main match of the show's third day, for 4 to 9 players. You hold one card face down and twice a round must exchange it with another player's card, a card in the buyers' slots or the trash. A gem of a kind the buyers hold scores, a bomb costs you, and after 3 rounds your points are multiplied by your secret buddy's. You may look at your own card only on your turn. The auction, the bombs and the check for a Piece are the show's own rules.`,
      },
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

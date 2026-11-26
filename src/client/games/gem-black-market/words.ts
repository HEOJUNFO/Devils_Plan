/**
 * The words of 보석 암시장 (Gem Black Market), in each language (`lang.ts`):
 * its rules as the page shows them before a game, and everything its screen
 * says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on. The
 * English terms are those of the show's English release (its closed
 * captions): buyers' slot ("buyer 1"), the trash, bomb, diamond, gold,
 * silver and copper, secret buddy, first player, exchange, check, Piece.
 */
import type { Card, GemEnd, Kind } from "../../../shared/games/gem-black-market/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";
import { byInput, keyed } from "../../touch";

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  /** The cards of a round, as {@link WORDS.deck} writes them. */
  deck: string;
  buyers: number;
  rounds: number;
  bombTaken: number;
  peekCost: number;
  diamondPieces: number;
  rewardFrom: number;
  rewardMoreFrom: number;
  turnSeconds: number;
}

/** A number of points with its sign: "+1", "-2", "0". */
const signed = (points: number): string => (points > 0 ? `+${points}` : `${points}`);

/** The numbers of each kind of card, in the order the kinds are given: "5·6", by kind. */
function byKind(cards: readonly Card[], kinds: readonly Kind[], name: (kind: Kind) => string): string {
  return kinds
    .map((kind) => [kind, cards.filter((card) => card.kind === kind).map((card) => card.value)] as const)
    .filter(([, values]) => values.length > 0)
    .map(([kind, values]) => `${name(kind)} ${values.join("·")}`)
    .join(", ");
}

const KINDS: readonly Kind[] = ["diamond", "gold", "silver", "copper", "bomb"];

const ko = {
  sheet: {
    title: "보석 암시장: 규칙",
    brief: {
      goal: "카드를 바꿔 구매자 칸과 같은 종류의 보석을 쥐면 승점을 얻습니다.",
      play: "차례마다 내 카드를 다른 사람, 구매자 칸, 휴지통의 카드와 꼭 바꿉니다.",
      end: "3라운드 뒤 내 승점에 마니또의 승점을 곱해 순위를 가립니다.",
    },
    parts: [
      "4명에서 9명이 합니다. 추첨으로 기본 순서를 정하고, 모두 피스 3개로 시작합니다. 선 플레이어는 피스 경매로 정합니다: 낼 피스를 몰래 정해 가장 많이 낸 사람이 선 플레이어가 되고, 나머지는 낸 피스를 돌려받습니다. 가장 많이 낸 사람이 여럿이면 그 사람들만 다시 경매합니다.",
      "카드는 숫자가 적힌 보석 카드 11장(다이아몬드 5·6, 금 4·5, 은 2·3·4, 동 1·1·2·2)과 폭탄 카드 2장(-6, -4)입니다. 선 플레이어부터 순서대로 한 장씩 뒷면으로 받고, 남은 카드 가운데 3장은 구매자 칸에, 1장은 휴지통에 놓입니다. 9명보다 적으면 한 명에 한 장씩 낮은 카드부터 뺍니다.",
      [
        "카드를 받으면 모두 자기 카드를 확인합니다. 그 뒤로는 자기 차례에만 자기 카드를 볼 수 있습니다.",
        "라운드마다 카드 교환을 두 번 합니다. 첫 번째 교환은 선 플레이어부터 순서대로, 두 번째 교환은 거꾸로 합니다. 선 플레이어는 가장 처음과 가장 마지막에 교환합니다.",
        "교환은 누구나 반드시 해야 합니다. 다른 사람의 카드, 구매자 칸의 카드, 휴지통의 카드 가운데 1장과 바꿉니다. 내 카드가 폭탄이면 다른 사람의 카드와만 바꿀 수 있습니다.",
        "내가 가진 폭탄을 다른 사람이 교환해 가져가면 그 즉시 3점을 얻습니다. 내가 내 차례에 폭탄을 넘긴 것으로는 점수를 얻지 못합니다.",
        "한 판에 한 번, 피스 1개를 써서 구매자 칸이나 휴지통의 카드 1장을 확인할 수 있습니다.",
      ],
      "두 번의 교환이 끝나면 모든 카드를 공개합니다. 구매자 칸에 있는 보석과 같은 종류의 보석을 가진 사람은 자기 카드의 숫자만큼 승점을 얻고, 구매자 칸에 그 종류가 여러 장이면 장수만큼 곱합니다. 다이아몬드로 승점을 얻으면 피스 1개를 받습니다. 폭탄을 가진 사람은 카드의 숫자만큼 승점을 잃습니다.",
      "다음 라운드의 선 플레이어는 -6 폭탄을 가진 사람입니다. -6이 구매자 칸이나 휴지통에 있으면 -4 폭탄을 가진 사람이고, 폭탄을 가진 사람이 없으면 선 플레이어는 그대로입니다. 3라운드가 끝나면 게임이 끝납니다.",
      "모두에게 마니또가 있습니다. 나는 내가 누구의 마니또인지만 알고, 내 마니또가 누구인지는 모른 채 시작합니다. 게임이 끝나면 3라운드 동안 쌓은 내 승점에 내 마니또의 승점을 곱한 것이 최종 승점이고, 최종 승점이 높은 순서로 순위를 정합니다. 최종 승점이 같으면 곱하기 전의 내 승점이 높은 사람이 위이고, 그것도 같으면 마지막 라운드에서 돌아오는 차례(두 번째 교환)가 빠른 사람이 위입니다. 최종 승점이 1점 이상이면 피스 1개, 10점 이상이면 피스 2개를 받습니다.",
      "방송에서는 교환에 3분을 주지만 여기서는 30초이고, 시간이 지나면 방이 대신 교환합니다(폭탄은 다음 순서의 사람과, 그 밖의 카드는 휴지통과). 방송은 9명이 했습니다: 4명에서 8명일 때 빼는 카드와 시작 피스 3개는 이 사이트가 정한 것입니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "not-bidding": "지금은 입찰할 수 없습니다",
    "bid-made": "이미 입찰했습니다",
    "too-many-pieces": "가진 피스보다 많이 낼 수 없습니다",
    "not-your-turn": "지금은 내 차례가 아닙니다",
    "bad-target": "그 카드와는 바꿀 수 없습니다",
    "bomb-to-player": "폭탄은 다른 사람의 카드와만 바꿀 수 있습니다",
    "no-peek": "지금은 카드를 확인할 수 없습니다",
    "peek-used": "카드 확인은 한 판에 한 번입니다",
    "no-pieces": "피스가 없습니다",
    "not-waiting": "지금은 기다리는 것이 없습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "네 명 이상이어야 합니다",
    "too-many": "아홉 명까지 할 수 있습니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
    "not-kept": "서버가 지금 받지 못했습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    rounds: "3라운드 끝 · 최종 승점",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<GemEnd, string>,
  /** A kind of card: in a sentence, and the one letter on the card itself (11 pixels). */
  kind: { diamond: "다이아몬드", gold: "금", silver: "은", copper: "동", bomb: "폭탄" } as Record<Kind, string>,
  mark: { diamond: "다", gold: "금", silver: "은", copper: "동", bomb: "폭" } as Record<Kind, string>,
  /** A card in a sentence. */
  card: (card: Card): string => `${ko.kind[card.kind]} ${card.value}`,
  /** A card in a line of the log. */
  short: (card: Card): string => `${ko.mark[card.kind]}${card.value}`,
  /** The cards of a round, by kind. */
  deck: (cards: readonly Card[]): string => byKind(cards, KINDS, (kind) => ko.kind[kind]),
  /** A place on the table a card is exchanged with: under its card (58 pixels), and in a sentence. */
  buyer: (slot: number) => `구매자 ${slot + 1}`,
  trash: "휴지통",
  /** A player's points beside their name. */
  points: (points: number) => `${points}점`,
  signed,
  /** The head of the column: which round of how many. */
  heading: (round: number, rounds: number) => `${round}라운드 / ${rounds}`,
  headingAuction: "선 플레이어 경매",
  headingOver: "최종 승점",
  /** On the first player's seat (12 pixels). */
  first: "선",
  /** At the top of the scene: this player's pieces (right of the page's own buttons). */
  pieces: (pieces: number) => `피스 ${pieces}개`,
  /** In the scene, 288 pixels a line. */
  scene: {
    myCard: (card: string) => `내 카드: ${card}`,
    myCardHidden: "내 카드는 내 차례에만 볼 수 있습니다",
    buddy: (who: string) => `나는 ${who}의 마니또입니다`,
    bid: "낼 피스",
    bidMade: (pieces: number) => `입찰: 피스 ${pieces}개`,
    bidAgain: "동점입니다. 동점인 사람들만 다시 입찰합니다",
    target: (what: string) => `바꿀 카드: ${what}`,
    noTarget: byInput("바꿀 카드: ←→로 고르기", "바꿀 카드: 눌러서 고르기"),
    noPeek: byInput("확인할 카드: ←→로 고르기", "확인할 카드: 눌러서 고르기"),
    ofPlayer: (who: string) => `${who}의 카드`,
    peekAt: (what: string) => `확인할 카드: ${what}`,
    peeked: (where: string, card: string) => `확인한 카드: ${where}은(는) ${card}`,
    mine: (card: string, points: number) => `내 ${card}: ${signed(points)}점`,
    taken: (points: number) => `남이 가져간 내 폭탄 ${signed(points)}점`,
    diamond: (pieces: number) => `피스 ${signed(pieces)}`,
    next: (who: string) => `다음 라운드 선 플레이어: ${who}`,
    /** The final count: its head, and the signs between its numbers. */
    finals: "최종 승점 = 내 승점 × 마니또의 승점",
    buddyOf: (who: string) => `마니또 ${who}`,
  },
  /** Said in the bar for a moment. */
  say: {
    paused: "판이 멈춰 있습니다",
    pickTarget: "바꿀 카드를 먼저 고르세요",
    pickPeek: "확인할 카드를 먼저 고르세요",
    bombOnly: "폭탄은 다른 사람의 카드와만 바꿀 수 있습니다",
  },
  /** Over the scene while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels (358 while a button is beside it). */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    bid: (seconds: number) => `선 플레이어 경매: 낼 피스를 정하세요 · ${seconds}초`,
    bidAgain: (seconds: number) => `동점! 다시 낼 피스를 정하세요 · ${seconds}초`,
    bidWait: (seconds: number) => `다른 사람의 입찰을 기다리는 중 · ${seconds}초`,
    bidWatch: (seconds: number) => `선 플레이어 경매 중 · ${seconds}초`,
    look: (seconds: number) => `내 카드를 확인하세요 · ${seconds}초`,
    lookWait: (seconds: number) => `모두 카드를 확인하는 중 · ${seconds}초`,
    exchange: (seconds: number) => `내 차례: 바꿀 카드를 고르세요 · ${seconds}초`,
    exchangeBomb: (seconds: number) => `폭탄입니다! 다른 사람의 카드와 바꾸세요 · ${seconds}초`,
    exchangeOther: (who: string, at: number, of: number, seconds: number) => `${who}의 차례 (${at}/${of}) · ${seconds}초`,
    peek: "확인할 카드를 고르세요: 구매자 칸 또는 휴지통",
    seen: (card: string, seconds: number) => `받은 카드: ${card} · ${seconds}초`,
    seenOther: (who: string) => `${who}이(가) 받은 카드를 보는 중`,
    reveal: (round: number, seconds: number) => `${round}라운드 결과 · ${seconds}초 뒤 다음 라운드`,
    revealLast: (seconds: number) => `마지막 라운드 결과 · ${seconds}초 뒤 최종 승점`,
  },
  /** To a player in their first game of it, in place of `standing.exchangeOther`: what to watch for. */
  coach: {
    exchangeOther: (who: string, seconds: number) => `${who}의 차례: 카드가 어디로 가는지 기억하세요 · ${seconds}초`,
  },
  /** Under the standing line, 358 pixels. */
  keys: {
    bid: byInput("↑↓: 피스 · Enter: 입찰 (가장 많이 낸 사람만 냅니다)", "+/-로 피스를 정하고 입찰 (가장 많이 낸 사람만 냅니다)"),
    look: byInput("Enter: 준비 완료 · P: 구매자 칸·휴지통 1장 확인", "준비 완료, 또는 구매자 칸·휴지통 1장 확인"),
    exchange: byInput("←→: 고르기 · Enter: 교환 · P: 카드 확인", "바꿀 카드를 누르고 교환"),
    peek: byInput("←→: 고르기 · Enter: 확인 · Esc: 취소", "확인할 카드를 누르고 확인"),
    seen: byInput("Enter: 계속", "계속을 누르세요"),
    reveal: byInput("Enter: 계속 (모두 누르면 바로 넘어감)", "모두 누르면 바로 넘어갑니다"),
  },
  hint: "H: 규칙 · M: 음소거 · T: 채팅",
  /** The moves, a line of the column each: 168 pixels. */
  log: {
    auction: (who: string, paid: number) => `선 ${who} · 피스 ${paid}개`,
    auctionDrawn: (who: string, paid: number) => `선 ${who} · 피스 ${paid}개 (추첨)`,
    dealt: (round: number, first: string) => `${round}라운드 · 선 ${first}`,
    peek: (who: string, where: string) => `${who}: ${where} 확인`,
    exchange: (who: string, where: string) => `${who} ↔ ${where}`,
    autoExchange: (who: string, where: string) => `${who} ↔ ${where} 자동`,
    shown: (round: number, buyers: string) => `${round}R 구매자: ${buyers}`,
    shownMine: (points: number) => `내 승점 ${signed(points)}`,
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, place: number): string => (seated ? `${place}위` : "종료"),
    place: (place: number, who: string, points: number) => `${place}위 ${who} ${points}점`,
    mine: (points: number, pieces: number) => (pieces > 0 ? `내 최종 승점: ${points}점 · 피스 ${pieces}개` : `내 최종 승점: ${points}점`),
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장을 기다리는 중 · 「한 판 더」로 알리기",
    waitHostOut: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The buttons of the bar, 102 pixels wide inside. */
  button: {
    bid: keyed("Enter", "입찰"),
    ready: keyed("Enter", "준비 완료"),
    exchange: keyed("Enter", "교환"),
    peek: keyed("P", "카드 확인"),
    check: keyed("Enter", "확인"),
    cancel: keyed("Esc", "취소"),
    go: keyed("Enter", "계속"),
    again: keyed("Enter", "새 판"),
    lobby: keyed("Esc", "대기실로"),
  },
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => [
    { text: "보석 암시장: 규칙", tone: "title" },
    { text: `카드: ${n.deck}`, tone: "dim" },
    { text: `한 장씩 뒷면으로 받고, ${n.buyers}장은 구매자 칸에, 1장은 휴지통에 놓입니다.` },
    { text: "받은 직후에만 내 카드를 보고, 그 뒤로는 내 차례에만 볼 수 있습니다." },
    { text: "" },
    { text: "라운드마다 교환을 두 번: 선 플레이어부터 순서대로, 그다음은 거꾸로." },
    { text: "내 카드를 다른 사람, 구매자 칸, 휴지통의 카드 1장과 반드시 바꿉니다." },
    { text: `폭탄은 다른 사람과만 바꿉니다. 내 폭탄을 남이 가져가면 ${signed(n.bombTaken)}점.`, tone: "mark" },
    { text: `한 판에 한 번, 피스 ${n.peekCost}개로 구매자 칸·휴지통의 1장을 확인합니다.`, tone: "dim" },
    { text: "" },
    { text: "공개: 구매자 칸과 같은 종류의 보석이면 내 숫자 × 그 종류의 장수만큼 승점." },
    { text: `다이아몬드로 득점하면 피스 ${n.diamondPieces}개. 폭탄을 쥐고 있으면 그 숫자만큼 잃습니다.` },
    { text: "다음 선 플레이어: -6을 쥔 사람, 없으면 -4를 쥔 사람, 없으면 그대로.", tone: "dim" },
    { text: `${n.rounds}라운드 뒤 최종 승점 = 내 승점 × 내 마니또의 승점 (누군지는 모릅니다).`, tone: "mark" },
    { text: `최종 ${n.rewardFrom}점 이상 피스 1개, ${n.rewardMoreFrom}점 이상 피스 2개. 교환은 ${n.turnSeconds}초 안에.`, tone: "dim" },
    { text: byInput("H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", "아무 곳이나 누르면 닫힙니다"), tone: "title" },
  ],
};

const en: typeof ko = {
  sheet: {
    title: "Gem Black Market: rules",
    brief: {
      goal: "Swap cards to hold a gem of a kind the buyers hold, and score.",
      play: "On your turn, exchange your card: a player's, a buyer's or the trash.",
      end: "After 3 rounds your points are multiplied by your secret buddy's.",
    },
    parts: [
      "For 4 to 9 players. A base order is drawn, and everyone starts with 3 Pieces. The first player is settled by an auction of Pieces: everyone bids in secret, whoever bids the most is the first player, and the others get their Pieces back. If several bid the most, only they bid again.",
      "The cards are 11 gem cards with a number (diamond 5 and 6, gold 4 and 5, silver 2, 3 and 4, copper 1, 1, 2 and 2) and 2 bomb cards (-6 and -4). Starting with the first player, everyone is dealt one card face down; of the cards left, 3 go to the buyers' slots and 1 to the trash. With fewer than 9 players one card is left out for each player fewer, lowest first.",
      [
        "After the deal everyone checks their own card. From then on you may look at your card only on your own turn.",
        "Each round has two rounds of exchanges: the first in order from the first player, the second in reverse. The first player exchanges first of all and last of all.",
        "Everyone must exchange. You exchange your card with another player's card, a card in a buyers' slot, or the card in the trash. If your card is a bomb, you can only exchange it with another player's card.",
        "If another player takes your bomb in an exchange, you get 3 points at once. Passing your own bomb on, on your own turn, gets you nothing.",
        "Once a game you may spend 1 Piece to check one card in the buyers' slots or the trash.",
      ],
      "After both rounds of exchanges every card is revealed. A player holding a gem of the same kind as a gem in the buyers' slots scores the number on their card, multiplied by how many gems of that kind the buyers' slots hold. Scoring with a diamond gets you 1 Piece. A player holding a bomb loses the number on it.",
      "The first player of the next round is whoever holds the -6 bomb. If the -6 is in a buyers' slot or the trash, it is whoever holds the -4; if nobody holds a bomb, the first player stays the same. The game ends after 3 rounds.",
      "Everyone has a secret buddy. You know whose secret buddy you are, and start without knowing who yours is. When the game ends, your final points are your points over the 3 rounds multiplied by your secret buddy's, and the ranking goes by final points. Of players level on final points, whoever has more points of their own before the multiplying is higher, and of those level in that too, whoever exchanged earlier on the way back (their second exchange) in the last round. Final points of 1 or more get you 1 Piece, of 10 or more 2 Pieces.",
      "The show gives 3 minutes for an exchange; here it is 30 seconds, and after that the room exchanges for you (a bomb with the next player in order, any other card with the trash). The show played with 9: the cards left out for 4 to 8 players and the 3 starting Pieces are this site's own.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "not-bidding": "You cannot bid now",
    "bid-made": "You have bid already",
    "too-many-pieces": "You cannot bid more Pieces than you have",
    "not-your-turn": "It is not your turn",
    "bad-target": "You cannot exchange with that card",
    "bomb-to-player": "A bomb can only be exchanged with another player's card",
    "no-peek": "You cannot check a card now",
    "peek-used": "You may check a card once a game",
    "no-pieces": "You have no Pieces",
    "not-waiting": "Nothing is waiting for you",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-playing": "You are watching, not playing",
    "not-seated": "You are watching, not playing",
    "no-game": "No game is being played",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes four players or more",
    "too-many": "No more than nine can play",
    "already-playing": "A game is already being played",
    "bots-not-allowed": "This server has no bots",
    "too-fast": "Too fast. Try again in a moment",
    "not-kept": "The server could not take that now. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    rounds: "3 rounds: final points",
    left: "Over: nobody left to play",
    abandoned: "Over: everyone has gone",
  },
  kind: { diamond: "diamond", gold: "gold", silver: "silver", copper: "copper", bomb: "bomb" },
  mark: { diamond: "D", gold: "G", silver: "S", copper: "C", bomb: "B" },
  card: (card) => `${en.kind[card.kind]} ${card.value}`,
  short: (card) => `${en.mark[card.kind]}${card.value}`,
  deck: (cards) => byKind(cards, KINDS, (kind) => (kind === "bomb" ? "bombs" : en.kind[kind])),
  buyer: (slot) => `Buyer ${slot + 1}`,
  trash: "Trash",
  points: (points) => `${points}`,
  signed,
  heading: (round, rounds) => `Round ${round} of ${rounds}`,
  headingAuction: "First-player auction",
  headingOver: "Final points",
  first: "1st",
  pieces: (pieces) => (pieces === 1 ? "1 Piece" : `${pieces} Pieces`),
  scene: {
    myCard: (card) => `Your card: ${card}`,
    myCardHidden: "You can look at your card only on your turn",
    buddy: (who) => `You are ${who}'s secret buddy`,
    bid: "Your bid",
    bidMade: (pieces) => `Your bid: ${pieces === 1 ? "1 Piece" : `${pieces} Pieces`}`,
    bidAgain: "A tie. Only those tied bid again",
    target: (what) => `Exchange with: ${what}`,
    noTarget: byInput("Exchange with: choose with ←→", "Exchange with: tap a card"),
    noPeek: byInput("Check: choose with ←→", "Check: tap a card"),
    ofPlayer: (who) => `${who}'s card`,
    peekAt: (what) => `Check: ${what}`,
    peeked: (where, card) => `Checked: ${where} is ${card}`,
    mine: (card, points) => `Your ${card}: ${signed(points)}`,
    taken: (points) => `bomb taken from you: ${signed(points)}`,
    diamond: (pieces) => `${signed(pieces)} Piece`,
    next: (who) => `First player next round: ${who}`,
    finals: "Final = your points × your secret buddy's",
    buddyOf: (who) => `buddy ${who}`,
  },
  say: {
    paused: "The game is paused",
    pickTarget: "Choose a card to exchange with first",
    pickPeek: "Choose a card to check first",
    bombOnly: "A bomb can only be exchanged with another player's card",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    bid: (seconds) => `First-player auction: set your bid · ${seconds}s`,
    bidAgain: (seconds) => `A tie! Set your bid again · ${seconds}s`,
    bidWait: (seconds) => `Waiting for the other bids · ${seconds}s`,
    bidWatch: (seconds) => `The first-player auction · ${seconds}s`,
    look: (seconds) => `Check your card · ${seconds}s`,
    lookWait: (seconds) => `Everyone is checking their card · ${seconds}s`,
    exchange: (seconds) => `Your turn: choose a card to exchange with · ${seconds}s`,
    exchangeBomb: (seconds) => `A bomb! Exchange it with a player's card · ${seconds}s`,
    exchangeOther: (who, at, of, seconds) => `${who}'s turn (${at}/${of}) · ${seconds}s`,
    peek: "Choose a card to check: a buyers' slot or the trash",
    seen: (card, seconds) => `You got: ${card} · ${seconds}s`,
    seenOther: (who) => `${who} is looking at the card they got`,
    reveal: (round, seconds) => `Round ${round} revealed · next round in ${seconds}s`,
    revealLast: (seconds) => `Last round revealed · final points in ${seconds}s`,
  },
  coach: {
    exchangeOther: (who, seconds) => `${who}'s turn: keep track of where each card goes · ${seconds}s`,
  },
  keys: {
    bid: byInput("↑↓: Pieces · Enter: bid (only the highest bidder pays)", "Set your bid with +/- (only the highest bidder pays)"),
    look: byInput("Enter: ready · P: check a buyers' slot or the trash", "Ready, or check a buyers' slot or the trash"),
    exchange: byInput("←→: choose · Enter: exchange · P: check a card", "Tap a card, then exchange"),
    peek: byInput("←→: choose · Enter: check · Esc: cancel", "Tap a card, then check"),
    seen: byInput("Enter: go on", "Tap go on"),
    reveal: byInput("Enter: go on (at once when everyone has)", "It goes on at once when everyone has tapped"),
  },
  hint: "H: rules · M: mute · T: chat",
  log: {
    auction: (who, paid) => `1st: ${who} · ${paid} P`,
    auctionDrawn: (who, paid) => `1st: ${who} · ${paid} P (lot)`,
    dealt: (round, first) => `Round ${round} · 1st ${first}`,
    peek: (who, where) => `${who}: check ${where}`,
    exchange: (who, where) => `${who} ↔ ${where}`,
    autoExchange: (who, where) => `${who} ↔ ${where} auto`,
    shown: (round, buyers) => `R${round} buyers: ${buyers}`,
    shownMine: (points) => `You: ${signed(points)}`,
  },
  result: {
    verdict: (seated, place) => (seated ? englishOrdinal(place) : "Over"),
    place: (place, who, points) => `${englishOrdinal(place)} ${who} ${points}`,
    mine: (points, pieces) => (pieces > 0 ? `Your final points: ${points} · ${pieces === 1 ? "1 Piece" : `${pieces} Pieces`}` : `Your final points: ${points}`),
    hostNext: "Play again with the same people or go back",
    waitHost: "Waiting for the host · \"Again\" to ask",
    waitHostOut: "Waiting for the host to start a new game",
  },
  button: {
    bid: keyed("Enter", "bid"),
    ready: keyed("Enter", "ready"),
    exchange: keyed("Enter", "exchange"),
    peek: keyed("P", "check a card"),
    check: keyed("Enter", "check"),
    cancel: keyed("Esc", "cancel"),
    go: keyed("Enter", "go on"),
    again: keyed("Enter", "again"),
    lobby: keyed("Esc", "to room"),
  },
  help: (n) => [
    { text: "Gem Black Market: rules", tone: "title" },
    { text: n.deck, tone: "dim" },
    { text: `Each gets 1 card face down; ${n.buyers} go to buyers' slots, 1 to trash.` },
    { text: "Check your card after the deal; later only on your own turn." },
    { text: "" },
    { text: "Each round: exchanges in order from the 1st player, then back." },
    { text: "You must swap with a player's card, a buyer's or the trash." },
    { text: `A bomb goes to a player only. Your bomb taken by another: ${signed(n.bombTaken)}.`, tone: "mark" },
    { text: `Once a game, ${n.peekCost} Piece checks a card of the buyers or the trash.`, tone: "dim" },
    { text: "" },
    { text: "Reveal: a gem scores its number × the buyers' gems of its kind." },
    { text: `A diamond that scores: ${n.diamondPieces} Piece. A bomb held costs its number.` },
    { text: "Next 1st player: who holds the -6, else the -4, else no change.", tone: "dim" },
    { text: `After ${n.rounds} rounds: final = your points × your secret buddy's.`, tone: "mark" },
    { text: `Final ${n.rewardFrom}+: 1 Piece; ${n.rewardMoreFrom}+: 2 Pieces. An exchange has ${n.turnSeconds}s.`, tone: "dim" },
    { text: byInput("H or Esc: close · M: mute · T: chat", "Tap anywhere to close"), tone: "title" },
  ],
};

/** The words of 보석 암시장 (Gem Black Market), in the language the page is read in. */
export const WORDS = words({ ko, en });

/** The rules sheet in every language, for the pages a search engine reads (`site-sheets.ts`): a page of the game shows one, `WORDS.sheet`. */
export const SHEETS = { ko: ko.sheet, en: en.sheet };

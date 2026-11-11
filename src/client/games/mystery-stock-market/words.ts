/**
 * The words of 미스터리 거래소 (Mystery Stock Market), in each language
 * (`lang.ts`): its rules as the page shows them before a game, everything its
 * screen says, and the seven price rules as the rule board shows them, word
 * by word as they are opened.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import type { PriceRules, StockId } from "../../../shared/games/mystery-stock-market/prices";
import type { MarketEnd } from "../../../shared/games/mystery-stock-market/rules";
import { englishOrdinal } from "../../../shared/lang";
import { words } from "../../lang";
import type { HelpLine, RulesSheet } from "../../sheet";

/**
 * A piece of a price rule as the rule board has it: one word or a few that
 * are opened together. `stage` is when: 0 from the start, then one more at
 * each of the rounds the rules are opened in. `glue` sets it against the
 * piece before it with no space between.
 */
export interface RulePiece {
  text: string;
  stage: number;
  glue?: boolean;
}

/** The numbers of the room's rules the sheet over the screen is written with. */
export interface HelpNumbers {
  stocks: number;
  rounds: number;
  roundMinutes: number;
  startCash: number;
  startPrice: number;
  floorPrice: number;
  revealRounds: number[];
  secretRounds: number;
  pieceCash: number;
  pieceRounds: number;
}

/** `n` with its thousands apart: 1,234,567. */
const grouped = (n: number): string => n.toLocaleString("en-US");
/** The rounds the rules are opened in but the last, and the last: "5·10·15" and "20". */
const opened = (rounds: number[], between: string): [string, string] => [rounds.slice(0, -1).join(between), `${rounds[rounds.length - 1] ?? ""}`];

const piece = (text: string, stage: number, glue = false): RulePiece => (glue ? { text, stage, glue } : { text, stage });

const ko = {
  sheet: {
    title: "미스터리 거래소: 규칙",
    parts: [
      "일곱 회사의 주식을 24라운드 동안 사고팝니다. 모두 가상 현금 100,000원으로 시작하고, 24라운드가 끝났을 때 자산(현금과 주식)이 가장 많은 사람이 1위입니다.",
      [
        "모든 주식은 10,000원에서 시작하고 100원 아래로는 내려가지 않습니다. 라운드는 5분이고, 그동안 그 라운드의 가격으로 원하는 만큼 사고팔 수 있습니다.",
        "주가는 라운드가 끝날 때 회사마다 다른 규칙으로 움직입니다. 규칙은 처음에 일부만 보입니다. 5·10·15라운드가 시작될 때 가려진 낱말이 더 열리고, 20라운드에 모두 열립니다.",
        "라운드가 시작되면 바뀐 주가, 지난 라운드에 사고판 수량, 모두가 가진 수량의 합(총 보유), 모든 사람의 자산과 순위가 공개됩니다.",
        "시크릿: 게임 중 한 번, 한 종목에 쓸 수 있습니다. 쓴 다음 두 라운드 동안 그 종목의 주가와 수량이 모두에게 가려지고, 그동안 모든 사람의 자산도 가려집니다 (순위는 보입니다). 그 종목을 가졌거나 거래한 사람은 자기 현금과 자산도 볼 수 없습니다. 누가 썼는지는 알려지지 않습니다.",
        "피스: 모두 3개씩 가지고 시작합니다. 20라운드까지, 1개로 한 종목의 다음에 열릴 규칙 낱말을 혼자 미리 보거나 현금 10,000원으로 바꿀 수 있습니다.",
        "모두가 라운드를 마치면 5분을 기다리지 않고 다음 라운드로 넘어갑니다. 라운드를 마친 사람은 그 라운드에 더 거래할 수 없습니다.",
      ],
      "최종 자산이 150만 원 이상이면 피스 1개, 300만 원 이상이면 2개, 600만 원 이상이면 3개, 1,000만 원 이상이면 상금의 징표를 받은 것으로 표시됩니다. 자산이 같으면 게임 도중 자산이 가장 낮았던 쪽이 아래입니다.",
    ],
  } as RulesSheet,
  notSent: "연결이 끊겨 보내지 못했습니다. 다시 해 주세요",
  /** Why the room refused what was asked, for the bar. */
  refused: {
    "round-over": "그 라운드는 이미 끝났습니다",
    "round-done": "이번 라운드는 이미 마쳤습니다",
    "no-cash": "현금이 모자랍니다",
    "no-shares": "가진 주식이 모자랍니다",
    "secret-used": "시크릿은 이미 썼습니다",
    "no-pieces": "피스가 없습니다",
    "pieces-closed": "피스는 이제 쓸 수 없습니다",
    "nothing-hidden": "그 규칙에는 더 가려진 곳이 없습니다",
    "bad-action": "그렇게는 할 수 없습니다",
    "game-over": "이 판은 끝났습니다",
    "not-playing": "관전 중에는 참여할 수 없습니다",
    "not-seated": "관전 중에는 참여할 수 없습니다",
    "no-game": "진행 중인 판이 없습니다",
    "not-host": "방장만 새 판을 시작할 수 있습니다",
    "too-few": "두 명 이상이어야 합니다",
    "already-playing": "이미 판이 진행 중입니다",
    "bots-not-allowed": "이 서버에서는 봇을 쓸 수 없습니다",
    "too-fast": "너무 빨리 눌렀습니다. 잠시 뒤에 다시 해 주세요",
  } as Record<string, string>,
  refusedOther: "지금은 할 수 없습니다",
  /** How a game ended, as the log says it: a line of the column, 168 pixels. */
  ended: {
    rounds: "모든 라운드가 끝남",
    left: "겨룰 사람이 없어 끝",
    abandoned: "이어갈 사람이 없어 끝",
  } as Record<MarketEnd, string>,
  /** The companies: in full, and as the table has room for (58 pixels). */
  name: { finance: "맛소금융", build: "무조건설", steel: "방어제철", alt: "알트엔터", open: "열림보안", coyo: "코요테크", latter: "후자전자" } as Record<StockId, string>,
  short: { finance: "맛소금융", build: "무조건설", steel: "방어제철", alt: "알트엔터", open: "열림보안", coyo: "코요테크", latter: "후자전자" } as Record<StockId, string>,
  /** The heads of the table's columns: each ends where its numbers end. */
  column: { price: "주가", bought: "매수", sold: "매도", held: "총 보유", mine: "내 보유" },
  /**
   * Where the table's columns are, in pixels: where the companies' names end,
   * and where the numbers of each column end. They are set out for the widths
   * of this language's names and heads, and so are words of a kind.
   */
  columnAt: { name: 55, price: 117, bought: 157, sold: 197, held: 246, mine: 296 },
  /** A number too long for its place in the table, shortened: 12,345 as 1.2만. */
  figure: (n: number): string => (n < 100000 ? `${Math.floor(n / 1000) / 10}만` : n < 100000000 ? `${grouped(Math.floor(n / 10000))}만` : `${grouped(Math.floor(n / 10000000) / 10)}억`),
  /**
   * The colours of a price that rose and of one that fell. They are words of
   * a kind: a Korean market shows a rise in red and a fall in blue, as the
   * show's monitor does; an English one shows a rise in green and a fall in red.
   */
  colour: { up: "#e23b4a", down: "#4f8df6" },
  /** In place of a number a secret keeps back: on the monitor, and in a narrow cell. */
  veiled: "???",
  veiledShort: "?",
  /** Under the emblem among the charts. */
  emblem: "거래소 로고",
  /** An amount of money; and the same for the list of a crowded game, in 36 pixels at most: 4.7만, 477만, 0.5억. */
  won: (amount: number): string => `${grouped(amount)}원`,
  wonShort: (amount: number): string =>
    amount < 10000
      ? `${amount}`
      : amount < 100000
        ? `${Math.floor(amount / 1000) / 10}만`
        : amount < 10000000
          ? `${Math.floor(amount / 10000)}만`
          : amount < 1000000000
            ? `${Math.floor(amount / 10000000) / 10}억`
            : `${grouped(Math.floor(amount / 100000000))}억`,
  shares: (count: number): string => `${grouped(count)}주`,
  /** The column's heading, with the clock beside it. */
  round: (round: number, rounds: number) => `라운드 ${round}/${rounds}`,
  /** Beside a company's name over its rule: what the player holds of it. */
  position: (shares: string) => `내 보유 ${shares}`,
  /** The first line of the bar: what the player has. */
  wallet: (cash: string, assets: string, pieces: number, secret: boolean) => `현금 ${cash} · 자산 ${assets} · 피스 ${pieces} · 시크릿 ${secret ? 1 : 0}`,
  /** Said in the bar for a moment. */
  say: {
    bought: (name: string, shares: string) => `${name} ${shares} 매수`,
    sold: (name: string, shares: string) => `${name} ${shares} 매도`,
    secret: (name: string) => `${name}에 시크릿을 썼습니다. 다음 라운드부터 가려집니다`,
    peeked: (name: string) => `${name}의 다음 규칙 낱말이 열렸습니다 (나만 봄)`,
    cashed: (amount: string) => `피스 1개를 ${amount}으로 바꿨습니다`,
    paused: "판이 멈춰 있습니다",
    noShares: "수량을 1 이상으로 넣으세요",
    noMax: "가려져 있어 계산할 수 없습니다",
    opened: "규칙이 더 공개됐습니다",
  },
  /** Over the table while the game stands still; `seconds` until it is given up, where that is known. */
  waitingBack: (seconds: number | null) => (seconds === null ? "돌아오길 기다리는 중" : `돌아오길 기다리는 중 · ${seconds}초`),
  /** The line at the top of the bar, 468 pixels. */
  standing: {
    offline: "연결이 끊겼습니다. 다시 연결하는 중",
    over: "판이 끝났습니다",
    paused: "판이 멈춰 있습니다",
    sending: "보내는 중",
    watching: (done: number, of: number) => `관전 중 · 라운드를 마친 사람 ${done}/${of}`,
    done: (done: number, of: number) => `라운드를 마쳤습니다 · 다른 사람을 기다리는 중 (${done}/${of})`,
    askSecret: (name: string, rounds: number) => `${name}에 시크릿을 씁니다 (한 번뿐) · 다음 ${rounds}라운드 동안 가려집니다`,
    askPiece: (name: string, amount: string) => `피스 1개를 씁니다 · 1: ${name}의 다음 규칙 낱말 · 2: 현금 ${amount}`,
    askDone: "이번 라운드를 마칩니다 · 마치면 이 라운드에는 더 거래할 수 없습니다",
  },
  /** The buttons of the bar. */
  button: {
    max: "A 최대",
    all: "Z 전량",
    buy: "B 매수",
    sell: "S 매도",
    secret: "X 시크릿",
    piece: "P 피스",
    done: "Enter 마침",
    charts: "C 차트",
    table: "C 시세",
    use: "Enter 사용",
    finish: "Enter 마침",
    peek: "1 규칙",
    cash: "2 현금",
    cancel: "Esc 취소",
    again: "Enter 새 판",
    lobby: "Esc 대기실로",
  },
  log: {
    round: (round: number) => `라운드 ${round}`,
    opened: (stage: number, of: number) => `규칙 추가 공개 (${stage}/${of})`,
    hidden: (name: string, from: number, until: number) => (from === until ? `시크릿: ${name} ${from}R` : `시크릿: ${name} ${from}~${until}R`),
  },
  /** The results, in the bar: the verdict in large letters 86 pixels wide at most, the lines beside it 280. */
  result: {
    verdict: (seated: boolean, rank: number): string => (seated ? `${rank}위` : "종료"),
    place: (rank: number, who: string, assets: string) => `${rank}위 ${who} ${assets}`,
    mine: (assets: string) => `내 자산: ${assets}`,
    /** What the show gives for assets like these: so many pieces, and its prize token. `won` is put before them. */
    award: (pieces: number): string => `피스 ${pieces}개`,
    prize: "상금의 징표",
    won: (what: string) => `획득: ${what}`,
    hostNext: "같은 사람들과 한 판 더 하거나 대기실로",
    waitHost: "방장이 새 판을 시작하기를 기다리는 중",
  },
  /** The seven price rules, word by word, with the room's own numbers. */
  card: (n: PriceRules): Record<StockId, RulePiece[]> => ({
    finance: [
      piece(`${n.finance.count}개 이상의`, 4),
      piece("주식이", 1),
      piece("상승할", 3),
      piece("경우", 1),
      piece(`다음 라운드 +${n.finance.upPercent}%,`, 2),
      piece(`${n.finance.count}개 이상의`, 4),
      piece("주식이", 1),
      piece("하락할", 3),
      piece("경우", 2),
      piece("다음", 0),
      piece("라운드", 2),
      piece(`-${n.finance.downPercent}%`, 3),
    ],
    build: [piece("방어제철의", 4), piece("가격이", 0), piece("올랐으면", 2), piece(`+${n.build.upPercent}%,`, 2), piece("그렇지 않으면", 1), piece(`-${n.build.downPercent}%`, 3)],
    steel: [
      piece("방어제철의", 4),
      piece("보유 총량이", 1),
      piece("증가한 만큼", 3),
      piece("1주당", 2),
      piece(`-${n.steel.perShare}원,`, 0),
      piece("감소한 만큼", 3),
      piece("1주당", 2),
      piece(`+${n.steel.perShare}원`, 0),
    ],
    alt: [piece("알트엔터의", 1), piece("주가 변동 그래프는", 2), piece("미스터리 거래소 로고", 4), piece("와 일치", 3, true), piece("한다", 0, true)],
    open: [
      piece("후자전자에", 3),
      piece("시크릿이 걸려", 4),
      piece("있으면", 0),
      piece(`+${n.open.upPercent}%`, 1),
      piece(", 그렇지", 0, true),
      piece("않으면", 1),
      piece(`-${n.open.down}원`, 2),
    ],
    coyo: [
      piece("코요테크의", 1),
      piece("매수량이", 3),
      piece("후자전자의", 4),
      piece("매수량", 0),
      piece("보다", 3, true),
      piece("많을 경우", 0),
      piece(`+${n.coyo.up}원,`, 2),
      piece("그렇지 않으면", 1),
      piece(`-${n.coyo.down}원`, 2),
    ],
    latter: [
      piece("후자전자의", 3),
      piece("보유 총량이", 2),
      piece(`${n.latter.from}주`, 4),
      piece("이상", 1),
      piece(`${n.latter.to}주`, 4),
      piece("이하이면", 1),
      piece(`+${n.latter.up}원,`, 0),
      piece("그렇지 않으면", 1),
      piece(`-${n.latter.down}원`, 2),
    ],
  }),
  /** The rules over the screen (H), by the room's own numbers. */
  help: (n: HelpNumbers): HelpLine[] => {
    const [early, last] = opened(n.revealRounds, "·");
    return [
      { text: "미스터리 거래소: 규칙", tone: "title" },
      { text: `주식 ${n.stocks}종목을 ${n.rounds}라운드 동안 사고팔아 자산이 가장 많으면 1위.` },
      { text: `${grouped(n.startCash)}원으로 시작. 주식은 ${grouped(n.startPrice)}원에서 시작, 최저 ${grouped(n.floorPrice)}원.` },
      { text: "주가는 라운드가 끝날 때 종목마다 제 규칙으로 움직입니다." },
      { text: `규칙은 ${early}라운드에 더 열리고 ${last}라운드에 다 열립니다.`, tone: "dim" },
      { text: "파란 칸이 다음에 열릴 낱말입니다.", tone: "dim" },
      { text: "" },
      { text: `시크릿 (한 번): 한 종목을 다음 ${n.secretRounds}라운드 동안 모니터에서 가립니다.` },
      { text: "그동안 모두의 자산도 가려지고, 그 종목을 가졌거나 거래했으면", tone: "dim" },
      { text: "내 현금과 자산도 보이지 않습니다.", tone: "dim" },
      { text: `피스 (${n.pieceRounds}라운드까지): 한 종목의 다음 낱말 미리 보기, 또는 ${grouped(n.pieceCash)}원.` },
      { text: `모두 라운드를 마치면 ${n.roundMinutes}분을 기다리지 않고 넘어갑니다.` },
      { text: "" },
      { text: "↑↓: 종목 · 숫자: 수량 · ←→: 한 주씩 · A: 최대 · Z: 전량 · B: 매수 · S: 매도", tone: "dim" },
      { text: "X: 시크릿 · P: 피스 · C: 차트 · Enter: 라운드 마침", tone: "dim" },
      { text: "H 또는 Esc: 닫기 · M: 음소거 · T: 채팅", tone: "title" },
    ];
  },
};

const en: typeof ko = {
  sheet: {
    title: "Mystery Stock Market: rules",
    parts: [
      "Trade the stocks of seven companies over 24 rounds. Everyone starts with 100,000 won of virtual cash, and whoever has the most assets (cash and shares) after round 24 wins.",
      [
        "Every stock opens at 10,000 won and never goes under 100 won. A round lasts 5 minutes, and in it you may buy and sell as much as you like at the round's price.",
        "Prices move when a round ends, each company's by a rule of its own. Only part of each rule is shown at first. More of its words open at the start of rounds 5, 10 and 15, and all of them at round 20.",
        "At the start of a round the monitor shows the new prices, what was bought and sold in the round before, the total holdings of all players, and everyone's assets and rank.",
        "Secret: once in the game you may use it on one stock. For the two rounds after, that stock's price and volumes are hidden from everyone, and so are everyone's assets (ranks stay). Whoever holds or trades that stock cannot see their own cash and assets either. Nobody is told who used it.",
        "Pieces: everyone starts with 3. Until round 20, one Piece shows you alone the next word to open in one stock's rule, or turns into 10,000 won.",
        "When everyone is done with a round it ends without waiting for the 5 minutes. Once you are done you cannot trade again in that round.",
      ],
      "Final assets of 1.5 million won or more are marked as winning 1 Piece, 3 million 2, 6 million 3, and 10 million the prize token. Between equal assets, whoever's assets were ever the lowest during the game ranks lower.",
    ],
  } as RulesSheet,
  notSent: "Not sent: the connection is down. Try again",
  refused: {
    "round-over": "That round is already over",
    "round-done": "You are done with this round",
    "no-cash": "Not enough cash",
    "no-shares": "You do not hold that many shares",
    "secret-used": "You have used your secret",
    "no-pieces": "You have no Piece left",
    "pieces-closed": "Pieces can no longer be used",
    "nothing-hidden": "Nothing of that rule is hidden any more",
    "bad-action": "That cannot be done",
    "game-over": "This game is over",
    "not-playing": "You cannot take part while watching",
    "not-seated": "You cannot take part while watching",
    "no-game": "No game is on",
    "not-host": "Only the host can start a new game",
    "too-few": "It takes two players or more",
    "already-playing": "A game is already on",
    "bots-not-allowed": "This server does not allow bots",
    "too-fast": "That was too fast. Try again in a moment",
  },
  refusedOther: "That cannot be done now",
  ended: {
    rounds: "Over: all rounds played",
    left: "Over: nobody left to play",
    abandoned: "Over: everyone has gone",
  },
  // the names of the show's English release, as its closed captions have them; in the table, the first word of each
  name: {
    finance: "Seasoned Financial",
    build: "Airtight Construction",
    steel: "Defense Steel",
    alt: "Alt Entertainment",
    open: "Open Security",
    coyo: "CoyoTech",
    latter: "Latter Electronics",
  },
  short: { finance: "Seasoned", build: "Airtight", steel: "Defense", alt: "Alt Ent", open: "Open", coyo: "CoyoTech", latter: "Latter" },
  column: { price: "Price", bought: "Bought", sold: "Sold", held: "Held", mine: "Mine" },
  columnAt: { name: 70, price: 127, bought: 181, sold: 220, held: 259, mine: 298 },
  figure: (n) => (n < 1000000 ? `${Math.floor(n / 1000)}K` : n < 100000000 ? `${Math.floor(n / 100000) / 10}M` : `${grouped(Math.floor(n / 1000000))}M`),
  colour: { up: "#3fd0b6", down: "#e23b4a" },
  veiled: "???",
  veiledShort: "?",
  emblem: "The logo",
  won: (amount) => `${grouped(amount)} won`,
  wonShort: (amount) =>
    amount < 1000
      ? `${amount}`
      : amount < 10000
        ? `${Math.floor(amount / 100) / 10}K`
        : amount < 1000000
          ? `${Math.floor(amount / 1000)}K`
          : amount < 100000000
            ? `${(Math.floor(amount / 100000) / 10).toFixed(1)}M`
            : amount < 1000000000
              ? `${Math.floor(amount / 1000000)}M`
              : `${(Math.floor(amount / 100000000) / 10).toFixed(1)}B`,
  shares: (count) => (count === 1 ? "1 share" : `${grouped(count)} shares`),
  round: (round, rounds) => `Round ${round}/${rounds}`,
  position: (shares) => `You hold ${shares}`,
  wallet: (cash, assets, pieces, secret) => `Cash ${cash} · Assets ${assets} · Pieces ${pieces} · Secret ${secret ? 1 : 0}`,
  say: {
    bought: (name, shares) => `Bought ${shares} of ${name}`,
    sold: (name, shares) => `Sold ${shares} of ${name}`,
    secret: (name) => `Secret used on ${name}: hidden from next round`,
    peeked: (name) => `The next word of ${name}'s rule is open to you alone`,
    cashed: (amount) => `One Piece turned into ${amount}`,
    paused: "The game is paused",
    noShares: "Enter 1 share or more",
    noMax: "It is hidden: that cannot be worked out",
    opened: "More of the rules is open",
  },
  waitingBack: (seconds) => (seconds === null ? "Waiting for them to come back" : `Waiting for them to come back · ${seconds}s`),
  standing: {
    offline: "Connection lost. Reconnecting",
    over: "The game is over",
    paused: "The game is paused",
    sending: "Sending",
    watching: (done, of) => `Watching · done with the round: ${done}/${of}`,
    done: (done, of) => `You are done with the round · waiting for the others (${done}/${of})`,
    askSecret: (name, rounds) => `Use your one secret on ${name}: hidden for the next ${rounds} rounds`,
    askPiece: (name, amount) => `Spend a Piece · 1: next word of ${name}'s rule · 2: ${amount}`,
    askDone: "Be done with this round: you cannot trade in it again",
  },
  button: {
    max: "A max",
    all: "Z all",
    buy: "B buy",
    sell: "S sell",
    secret: "X secret",
    piece: "P Piece",
    done: "Enter done",
    charts: "C charts",
    table: "C table",
    use: "Enter use",
    finish: "Enter done",
    peek: "1 rule",
    cash: "2 cash",
    cancel: "Esc cancel",
    again: "Enter again",
    lobby: "Esc to room",
  },
  log: {
    round: (round) => `Round ${round}`,
    opened: (stage, of) => `More rules open (${stage}/${of})`,
    hidden: (name, from, until) => (from === until ? `Secret: ${name} R${from}` : `Secret: ${name} R${from}-${until}`),
  },
  result: {
    verdict: (seated, rank) => (seated ? englishOrdinal(rank) : "Over"),
    place: (rank, who, assets) => `${englishOrdinal(rank)} ${who} ${assets}`,
    mine: (assets) => `Your assets: ${assets}`,
    award: (pieces) => (pieces === 1 ? "1 Piece" : `${pieces} Pieces`),
    prize: "prize token",
    won: (what) => `Won: ${what}`,
    hostNext: "Play again with these players or go back",
    waitHost: "Waiting for the host to start a new game",
  },
  // (gap) The sentences are translated here: the show's English release never shows the rule board whole.
  card: (n) => ({
    finance: [
      piece("If", 1),
      piece(`${n.finance.count} or more`, 4),
      piece("stocks", 1),
      piece("rise,", 3),
      piece(`+${n.finance.upPercent}% next round;`, 2),
      piece("if", 2),
      piece(`${n.finance.count} or more`, 4),
      piece("stocks", 1),
      piece("fall,", 3),
      piece(`-${n.finance.downPercent}%`, 3),
      piece("next", 0),
      piece("round.", 2),
    ],
    build: [piece("If", 2), piece("Defense Steel's", 4), piece("price", 0), piece("rose,", 2), piece(`+${n.build.upPercent}%;`, 2), piece("otherwise", 1), piece(`-${n.build.downPercent}%.`, 3)],
    steel: [
      piece("Defense Steel's", 4),
      piece("total holdings:", 1),
      piece("for each share", 2),
      piece("more,", 3),
      piece(`-${n.steel.perShare} won;`, 0),
      piece("for each share", 2),
      piece("fewer,", 3),
      piece(`+${n.steel.perShare} won.`, 0),
    ],
    alt: [piece("Alt Entertainment's", 1), piece("price chart", 2), piece("is", 0), piece("the same as", 3), piece("the Mystery Stock Market logo.", 4)],
    open: [
      piece("If", 0),
      piece("a secret is on", 4),
      piece("Latter Electronics,", 3),
      piece(`+${n.open.upPercent}%;`, 1),
      piece("if", 0),
      piece("not,", 1),
      piece(`-${n.open.down} won.`, 2),
    ],
    coyo: [
      piece("If", 0),
      piece("CoyoTech's", 1),
      piece("bought volume", 3),
      piece("is higher", 0),
      piece("than", 3),
      piece("Latter Electronics'", 4),
      piece("bought volume,", 0),
      piece(`+${n.coyo.up} won;`, 2),
      piece("otherwise", 1),
      piece(`-${n.coyo.down} won.`, 2),
    ],
    latter: [
      piece("If", 1),
      piece("Latter Electronics'", 3),
      piece("total holdings", 2),
      piece("are", 1),
      piece(`${n.latter.from} shares`, 4),
      piece("or more", 1),
      piece("and", 1),
      piece(`${n.latter.to} shares`, 4),
      piece("or fewer,", 1),
      piece(`+${n.latter.up} won;`, 0),
      piece("otherwise", 1),
      piece(`-${n.latter.down} won.`, 2),
    ],
  }),
  help: (n) => {
    const [early, last] = opened(n.revealRounds, ", ");
    return [
      { text: "Mystery Stock Market: rules", tone: "title" },
      { text: `Trade ${n.stocks} stocks over ${n.rounds} rounds. The most assets wins.` },
      { text: `You start with ${grouped(n.startCash)} won. Stocks open at ${grouped(n.startPrice)}; floor ${grouped(n.floorPrice)}.` },
      { text: "Prices move when a round ends, each stock by its own rule." },
      { text: `More of each rule opens at rounds ${early}; all of it at ${last}.`, tone: "dim" },
      { text: "A blue block is the word that opens next.", tone: "dim" },
      { text: "" },
      { text: `Secret (once): takes a stock off the monitor for ${n.secretRounds} rounds.` },
      { text: "Assets are hidden meanwhile; if you hold or trade that stock,", tone: "dim" },
      { text: "so are your own cash and assets.", tone: "dim" },
      { text: `Piece (until round ${n.pieceRounds}): a stock's next word early, or ${grouped(n.pieceCash)} won.` },
      { text: `When everyone is done, the round ends before its ${n.roundMinutes} minutes.` },
      { text: "" },
      { text: "↑↓ stock · digits shares · ←→ ±1 · A max · Z all · B buy · S sell", tone: "dim" },
      { text: "X secret · P Piece · C charts · Enter done with the round", tone: "dim" },
      { text: "H or Esc: close · M: mute · T: chat", tone: "title" },
    ];
  },
};

/** The words of 미스터리 거래소 (Mystery Stock Market), in the language the page is read in. */
export const WORDS = words({ ko, en });

/**
 * What the wiki and the show say of 히든 워드 (design/games/hidden-word.md):
 * the numbers of its rules, and the one game the show played, turn by turn.
 * The tests hold the game's rules to these.
 *
 * The show's similarity scores are not the game's: the replay gives the
 * rules a list of its own, with the scores below. Where the captions have
 * no number, 96 stands for "at least 95%" and 50 for anything under it; the
 * progress of a turn depends on nothing else.
 */
import type { Lexicon } from "../../../src/shared/games/hidden-word/lexicon";

/** Two rounds; the second counts double. */
export const ROUNDS = 2;
export const MULTIPLIERS = [1, 2];
/** Five nouns in an envelope. */
export const ENVELOPE = 5;
/** Fifteen minutes and ten clues at most; a clue of at least 95% ends the giving of clues. */
export const CLUE_SECONDS = 15 * 60;
export const CLUES = 10;
export const THRESHOLD = 95;
/** Five minutes to write an answer. */
export const ANSWER_SECONDS = 5 * 60;
/** Three stages of clues at most: 1, 2 and 3 points to the setter. */
export const STAGES = 3;
/** First place is paid four pieces. */
export const FIRST_PIECES = 4;

/** The show's six, by their place in the first round's order of setters: 서출구, 장동민, 정원영, 존박, 재재, 현경렬. */
export const SHOW_PLAYERS = [0, 1, 2, 3, 4, 5];

/**
 * Their envelopes. The first and the fifth are the wiki's; of the others
 * only the two words that were set are known, and the rest are stand-ins
 * (the Korean of 손님, 사고, 회사, 영화관, 이별, 머리, 나침반 and 수도 is
 * itself read back from English captions).
 */
export const SHOW_ENVELOPES = [
  ["우비", "화가", "공항", "수영", "대기"],
  ["손님", "머리", "가위", "바늘", "연필"],
  ["사고", "이별", "거울", "사탕", "모래"],
  ["회사", "수도", "나비", "기차", "안경"],
  ["우유", "요리사", "서점", "대화", "전복"],
  ["영화관", "나침반", "구름", "시계", "감자"],
];

/** One stage of a turn: the clues given, each with its score, who was right, and who spent a Piece. */
export interface ShowStage {
  clues: [string, number][];
  right: number[];
  pieces: number[];
}

/** One setter's turn. */
export interface ShowTurn {
  setter: number;
  word: string;
  stages: ShowStage[];
}

/** The first round, in its order of setters (E11 00:40:41 to 01:05:43). */
export const SHOW_ROUND_1: ShowTurn[] = [
  {
    setter: 0,
    word: "대기",
    stages: [
      { clues: [["열", 95]], right: [], pieces: [] },
      {
        clues: [
          ["조급함", 50],
          ["방식", 50],
          ["층", 91],
          ["자", 50],
          ["순서", 96],
        ],
        right: [1, 3],
        pieces: [],
      },
    ],
  },
  {
    setter: 1,
    word: "손님",
    stages: [
      { clues: [["주인", 96]], right: [], pieces: [] },
      {
        clues: [
          ["식당", 50],
          ["임자", 65.5],
          ["주인장", 50],
          ["준비", 50],
          ["선물", 50],
          ["가게", 50],
          ["인사", 50],
          ["구매자", 50],
          ["고객", 99.8],
        ],
        right: [0, 2, 3, 4, 5],
        pieces: [],
      },
    ],
  },
  {
    setter: 2,
    word: "사고",
    stages: [
      {
        clues: [
          ["자동차", 91.5],
          ["차량", 96],
        ],
        right: [],
        pieces: [],
      },
      {
        clues: [
          ["인공지능", 50],
          ["지능", 92],
          ["전기차", 52],
          ["뇌", 96],
        ],
        right: [1],
        pieces: [],
      },
    ],
  },
  {
    setter: 3,
    word: "회사",
    stages: [
      {
        clues: [
          ["사", 50],
          ["일", 96],
        ],
        right: [1, 5],
        pieces: [],
      },
    ],
  },
  {
    setter: 4,
    word: "서점",
    stages: [
      { clues: [["소설", 96]], right: [], pieces: [] },
      {
        clues: [
          ["수필", 80],
          ["문학", 50],
          ["독서", 50],
          ["책", 96],
        ],
        right: [1, 3, 5],
        pieces: [],
      },
    ],
  },
  {
    setter: 5,
    word: "영화관",
    stages: [
      {
        clues: [
          ["데이트", 50],
          ["약속", 50],
          ["표", 96],
        ],
        right: [1, 3, 4],
        // (two spent a Piece here; only one is named in the captions)
        pieces: [1],
      },
    ],
  },
];

/** The second round's order, drawn anew: 정원영, 장동민, 재재, 서출구, 현경렬, 존박 (E11 01:05:50). */
export const SHOW_ORDER_2 = [2, 1, 4, 0, 5, 3];

/** The second round (to E11 01:24:23). */
export const SHOW_ROUND_2: ShowTurn[] = [
  {
    setter: 2,
    word: "이별",
    stages: [
      {
        clues: [
          ["여행", 50],
          ["미용", 50],
          ["지구", 8.5],
          ["눈물", 50],
          ["상처", 50],
          ["죽음", 50],
          ["영원", 50],
          ["노래", 50],
          ["슬픔", 96],
        ],
        right: [0, 1, 3, 4, 5],
        pieces: [4],
      },
    ],
  },
  { setter: 1, word: "머리", stages: [{ clues: [["미용실", 96]], right: [5], pieces: [4] }] },
  {
    setter: 4,
    word: "대화",
    stages: [
      {
        clues: [
          ["말", 50],
          ["이야기", 99],
        ],
        right: [0, 1, 3, 5],
        pieces: [1, 3],
      },
    ],
  },
  {
    setter: 0,
    word: "우비",
    stages: [
      {
        clues: [
          ["소설", 5],
          ["우산", 96],
        ],
        right: [1],
        pieces: [1, 4, 5],
      },
    ],
  },
  { setter: 5, word: "나침반", stages: [{ clues: [["북", 96]], right: [1], pieces: [1, 4] }] },
  {
    setter: 3,
    word: "수도",
    stages: [
      { clues: [["도시", 96]], right: [], pieces: [4] },
      {
        clues: [
          ["건설", 91.5],
          ["경영", 50],
          ["서울", 96],
        ],
        right: [0, 1, 2, 4, 5],
        pieces: [],
      },
    ],
  },
];

/** Each player's points in the two rounds (the design's check against the wiki's table of results: 16, 11, 10, 8, 7, 4). */
export const SHOW_POINTS = [
  [2, 6],
  [6, 10],
  [2, 2],
  [4, 6],
  [3, 4],
  [3, 8],
];

/** The show's places: 장동민, 현경렬, 존박, 서출구, 재재, 정원영. */
export const SHOW_PLACES = [4, 1, 6, 3, 5, 2];

/**
 * A list of words for a test: `scores` by "reference word" (one space
 * between), anything else in the list scoring `otherwise`. Its words are
 * those of `envelope`, of `scores` and of `more`.
 */
export function scripted(envelope: string[], scores: Record<string, number> = {}, more: string[] = [], otherwise = 50): Lexicon {
  const words = [...new Set([...envelope, ...Object.keys(scores).flatMap((key) => key.split(" ")), ...more])];
  const score = (reference: string, word: string): number | null => {
    if (!words.includes(reference) || !words.includes(word)) return null;
    return reference === word ? 100 : (scores[`${reference} ${word}`] ?? otherwise);
  };
  return {
    has: (word) => words.includes(word),
    score,
    nearest: (reference, count, except = []) =>
      !words.includes(reference)
        ? []
        : words
            .filter((word) => word !== reference && !except.includes(word))
            .map((word, at) => ({ word, at, score: score(reference, word) ?? 0 }))
            .sort((a, b) => b.score - a.score || a.at - b.at)
            .slice(0, count)
            .map((each) => each.word),
    envelope,
  };
}

/** The list the show's game is replayed with: its envelopes, and every clue at the score it had. */
export function showLexicon(): Lexicon {
  const scores: Record<string, number> = {};
  for (const turn of [...SHOW_ROUND_1, ...SHOW_ROUND_2]) for (const stage of turn.stages) for (const [clue, score] of stage.clues) scores[`${turn.word} ${clue}`] = score;
  return scripted(SHOW_ENVELOPES.flat(), scores, ["오답", "딴말"], 20);
}

/**
 * Numbers for a game's `chance` that make its draws come out as wanted: the
 * list's words go into the envelopes in the list's own order, the first
 * round's setters are in the order of their numbers, and the second
 * round's in `second`.
 */
export function chanceFor(pool: number, players: number, second: number[]): number[] {
  const KEEP = 0xffffffff; // the last place of each step: nothing is swapped
  const chance = Array.from({ length: pool - 1 + (players - 1) }, () => KEEP);
  // what a shuffle from the back has to draw for the players to end in `second`
  const out = Array.from({ length: players }, (_, at) => at);
  for (let i = players - 1; i > 0; i--) {
    const j = out.indexOf(second[i]);
    [out[i], out[j]] = [out[j], out[i]];
    chance.push(Math.floor(((j + 0.5) / (i + 1)) * 4294967296));
  }
  return chance;
}

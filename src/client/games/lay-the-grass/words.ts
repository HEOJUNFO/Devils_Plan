/**
 * The words of 잔디 깔기 (Lay the Grass), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { words } from "../../lang";
import type { RulesSheet } from "../../sheet";

const ko = {
  sheet: {
    title: "잔디 깔기: 규칙",
    parts: [
      "공원 위에 내 잔디 타일을 놓아 승점을 얻습니다. 타일은 일곱 종류이고, 타일에 적힌 번호가 곧 승점입니다.",
      [
        "먼저 승점이 낮은 사람부터 타일 하나를 모두가 보는 앞에서 고릅니다. 같은 타일을 골라도 되고, 한 번 고르면 바꿀 수 없습니다.",
        "그다음 번호가 작은 타일부터 공원에 놓습니다. 돌릴 수 있지만 뒤집을 수 없고, 공원 밖으로 나가거나 다른 타일과 겹칠 수 없습니다.",
        "놓으면 번호만큼 승점을 얻습니다. 놓을 자리가 없으면 0점입니다.",
      ],
      "번호가 클수록 점수는 크지만 늦게 놓습니다.",
      "사이사이에 둘 중 하나를 고르는 선택이 네 번 나옵니다 (선택 5~8). 모두 동시에 고르고, 다 고르면 누가 무엇을 골랐는지 공개됩니다. 한 번 고르면 바꿀 수 없습니다. 선택의 내용은 나올 때 공개되고, 선택 5에서 \"정보\"를 고르면 미리 봅니다.",
    ],
  } as RulesSheet,
};

const en: typeof ko = {
  sheet: {
    title: "Lay the Grass: rules",
    parts: [
      "Lay your grass tile on the park to score points. There are seven kinds of tile, and the number on a tile is the points it scores.",
      [
        "First everyone picks one tile in front of all, the player with the fewest points first. Two players may pick the same tile, and a pick cannot be changed.",
        "Then the tiles are laid on the park, the smallest number first. A tile can be turned but not flipped, and cannot go off the park or over another tile.",
        "A tile laid scores its number. A tile with nowhere to go scores 0.",
      ],
      "The bigger the number, the more it scores and the later it is laid.",
      "Along the way a selection between two options comes up four times (Selections 5 to 8). Everyone picks at once, and when all have picked, who picked what is shown. A pick cannot be changed. What a selection is about is shown when it comes up; pick \"Info\" at Selection 5 to see ahead.",
    ],
  } as RulesSheet,
};

/** The words of 잔디 깔기 (Lay the Grass), in the language the page is read in. */
export const WORDS = words({ ko, en });

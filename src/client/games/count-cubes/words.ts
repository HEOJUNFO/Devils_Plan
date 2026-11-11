/**
 * The words of 큐브 세기 (Count the Cubes), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { words } from "../../lang";
import type { RulesSheet } from "../../sheet";

const ko = {
  sheet: {
    title: "큐브 세기: 규칙",
    parts: [
      "큐브를 쌓아 만든 입체가 나옵니다. 큐브가 모두 몇 개인지 세어, 그 수를 각자 입력합니다.",
      [
        "입체는 속이 꽉 차 있습니다. 보이는 큐브 밑에 깔린 큐브도 셉니다. 뒤쪽이 앞쪽보다 낮은 곳은 없어서, 다른 큐브 뒤에 숨은 기둥은 없습니다.",
        "맞힌 순서대로 순위가 정해집니다. 누가 맞히고 틀렸는지는 모두에게 알려지지만, 입력한 숫자는 알려지지 않습니다.",
        "틀리면 20초 동안 답할 수 없습니다.",
        "한 명만 남기고 모두 맞히면 끝납니다.",
      ],
      "제한 시간은 5분입니다. 시간이 지나면 그때까지 맞힌 사람만 순위에 듭니다.",
    ],
  } as RulesSheet,
};

const en: typeof ko = {
  sheet: {
    title: "Count the Cubes: rules",
    parts: [
      "A solid built of stacked cubes comes up. Count how many cubes there are in all, and enter the number, each player for themselves.",
      [
        "The solid has no hollows. The cubes under the ones you see count too. Nowhere is the back lower than the front, so no column hides behind other cubes.",
        "Players are ranked in the order they get it right. Everyone is told who was right and who was wrong, but not the numbers entered.",
        "A wrong answer locks you out for 20 seconds.",
        "The game ends when all but one have got it right.",
      ],
      "The time limit is 5 minutes. When it runs out, only those who were right by then are ranked.",
    ],
  } as RulesSheet,
};

/** The words of 큐브 세기 (Count the Cubes), in the language the page is read in. */
export const WORDS = words({ ko, en });

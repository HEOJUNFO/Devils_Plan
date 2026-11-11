/**
 * The words of 네모 세기 (Count the Rectangles), in each language (`lang.ts`): its rules as the
 * page shows them before a game, and everything its screen says.
 *
 * The screen is 480 by 270 pixels and its lines are placed by the pixel: a
 * sentence changed here is looked at on the screen it is drawn on.
 */
import { words } from "../../lang";
import type { RulesSheet } from "../../sheet";

const ko = {
  sheet: {
    title: "네모 세기: 규칙",
    parts: [
      "숫자가 적힌 칸과 빈칸으로 된 판, 그리고 타깃 넘버가 나옵니다. 안의 숫자를 더하면 타깃이 되는 네모가 모두 몇 개인지 셉니다.",
      [
        "네모는 판 위의 칸으로 된 모든 직사각형입니다: 한 칸짜리부터. 판이 네모반듯하지 않을 수 있고, 칸이 없는 자리는 걸칠 수 없습니다.",
        "빈칸은 0으로 칩니다. 타깃이 0이면 빈칸만으로 된 네모도 셉니다.",
        "다 세었으면 버저를 누르고 10초 안에 개수를 답합니다. 버저는 한 번에 한 사람만 누를 수 있습니다.",
        "틀리거나 답하지 못하면 그 문제에서는 다시 답할 수 없습니다. 팀이면 팀 전체가 그렇습니다.",
        "두 번 맞히면 승리하고 이후 문제에서 빠집니다. 전체 팀의 절반이 승리하면 끝납니다.",
      ],
      "시작 전에 세 사람은 팀을 맺을 수 있습니다 (세 명이 아닌 팀은 각자 혼자 합니다). 팀을 가장 먼저 고른 사람이 그 팀의 대표입니다. 혼자 하는 사람도 한 팀으로 셉니다. 문제마다 제한 시간은 5분입니다.",
      "끝나면 선택 3으로 승점을 나눕니다. 모두 동시에 고르고, 한 번 고르면 바꿀 수 없습니다.",
      [
        "승리 팀 (팀의 다수결): 독식은 대표 5점·두 팀원 1점씩, 헌신은 대표 1점·두 팀원 3점씩.",
        "패배 팀 (팀의 다수결): 희생은 대표만 3점 차감, 질책은 두 팀원만 2점씩 차감.",
        "개인: 승리 7점, 패배 3점 차감. 안전은 1점 더 차감, 도전은 추가 대결 (도전한 사람끼리 먼저 맞히면 승리: 피스 3개, 지면 3점 차감).",
      ],
    ],
  } as RulesSheet,
};

const en: typeof ko = {
  sheet: {
    title: "Count the Rectangles: rules",
    parts: [
      "A board of numbered cells and blank cells comes up, with a target number. Count how many rectangles there are whose numbers add up to the target.",
      [
        "A rectangle is any rectangle made of cells of the board, from a single cell up. The board itself may not be a neat rectangle, and a rectangle cannot lie over a place with no cell.",
        "A blank cell counts as 0. When the target is 0, rectangles of blank cells alone count too.",
        "When you have counted, press the buzzer and give the number within 10 seconds. Only one player holds the buzzer at a time.",
        "Answer wrong, or not at all, and you cannot answer that problem again. In a team, that goes for the whole team.",
        "Two right answers win, and a winner sits out the problems after. The game ends when half of all the teams have won.",
      ],
      "Before the start, three players can form a team (a team of any other size plays as players alone). Whoever picks a team first is its leader. A player alone counts as a team too. Each problem has a limit of 5 minutes.",
      "At the end, Selection 3 shares out the points. Everyone picks at once, and a pick cannot be changed.",
      [
        "Winning team (by its majority): Monopolize gives the leader 5 and the two others 1 each; Sacrifice gives the leader 1 and the two others 3 each.",
        "Losing team (by its majority): Sacrifice takes 3 from the leader alone; Punish takes 2 from each of the two others.",
        "Alone: 7 for a win, 3 off for a loss. Safety takes 1 more off; Challenge is an added contest (those who chose it race to answer first: the winner gets 3 Pieces, the losers lose 3 points).",
      ],
    ],
  } as RulesSheet,
};

/** The words of 네모 세기 (Count the Rectangles), in the language the page is read in. */
export const WORDS = words({ ko, en });

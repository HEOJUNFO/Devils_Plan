---
paths:
  - "src/client/**"
  - "src/shared/games.json"
  - "src/shared/lang.ts"
  - "index.html"
---

# Korean and English

**Every sentence a player reads is there in both languages.** A new game, or a
new sentence, comes with both.

This is a project rule the user set on 2026-11-11, in their words:
"우리프프로젝트 영어지원 하게업데이트하고 프로젝트룰에추가핮".

## How it is built

*The assistant's choices, not the user's words.*

- A screen's sentences are in a `words.ts` beside it, Korean and English side
  by side, taken through `words()` of `src/client/lang.ts`. None is written in
  the markup or in a screen's code.
- The type check holds the two to one shape, so a sentence missing in one
  language does not compile.
- A game's name and summary are in `src/shared/games.json`, by language.
- The room sends reasons and events, never sentences, so players of one room
  each read it in their own.
- The page opens in the language its address asks for (`?lang=en`), else the
  one last chosen in that browser, else the browser's, else English. The lobby
  has the button that changes it, which loads the page again.

## How the English is written

*Assistant's reading, not the user's words.*

- Korean is still the language a sentence is written in first, and the English
  follows it.
- A game has the name the show's English release gives it where one can be
  found ("Count the Rectangles", "Count the Cubes", "Lay the Grass"), and its
  terms likewise ("Piece", "Selection", "Monopolize"). Where none can be found
  the assistant translates plainly and says so in its report.
- What players type (nicknames, chat) is shown as typed.
- The screen is a fixed 480 by 270 pixels, so an English sentence is looked at
  on the screen it is on, not only type-checked.
- Bots keep their Korean names ("봇 1"): they are a test aid
  (`.claude/rules/bots.md`).

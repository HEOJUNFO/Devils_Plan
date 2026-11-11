---
paths:
  - "src/shared/games.json"
  - "src/**/words.ts"
  - "wrangler.jsonc"
  - "package.json"
---

# Game Names: the Show's, Never One Made Up Here

**Players see each game by the name it has in the show.** "러시안 룰렛", not a
name made up here. No game is given a name of the assistant's own.

This is a project rule the user set on 2026-11-11, in their words:
"게임이름자체는 데블스플랜이랑 동일하게하자 그래두 규칙에추가해". The first
builds were titled "빈 약실 / Empty Chamber", which the user replaced.

## It holds for every game

Also where the name is one the show made up for that game ("무거운 13",
"미스터리 거래소"). The user said so on 2026-11-11, when the sixth game had been
built under a name made up here ("13 미만"): "이름은 무거운13으로해 룰에
게임이름은 방송이름따라하기로했짜나".

An earlier version of this rule carried a limit the assistant had set for
itself, a plain name in place of a name the show coined. The user had not
asked for it, and it is withdrawn.

## In English

*Assistant's reading, not the user's words:* in English a game has the name
the show's English release gives it where one can be found ("Count the
Rectangles", "Count the Cubes", "Lay the Grass"). Where none can be found the
assistant translates plainly and says so in its report. Terms and sentences:
`.claude/rules/languages.md`.

## What the rule does not reach

- It is about the game's name. The rest of what was agreed stays: the rules
  are used exactly as documented, and the show's own title, logo, cast, set
  and screen layout are not used.
- Game ids (`russian-roulette`, `lay-the-grass`, `under-thirteen`) are not
  shown to players and stay as they are.
- The Worker's name is shown, as the address. The user chose `game-plan` for
  it on 2026-11-11 ("game-plan으로하자"), in place of `empty-chamber`, the name
  of the first build. `wrangler.jsonc`, `package.json` and the browser's
  storage keys carry it. The folder `prototypes/empty-chamber/` keeps its
  name.

---
paths:
  - "src/**/bots.ts"
  - "src/**/bot-config.json"
  - "src/**/bot*"
  - "src/**/bots/**"
  - "src/ai/**"
  - "tests/**/bot*"
  - "prototypes/**"
---

# Bots and Single-Player: Test Aid Only

**Multiplayer is the product. Real users are only ever offered games against
other people.** Bots and single-player exist for tests and for filling seats
while developing, and are built no further than that.

This is a project rule the user set on 2026-11-11, in their words:
"싱글플레이는 기본만 개발해 테스트에 필요한 정도만 실제 유저들한테는
멀티플레이만 제공할거야", and then "봇은 테스트용 기본형까지만 개발하는 거
이 프로젝트 규칙에 추가해서 다음에 또 같은 실수 안 하게 해".

## A game started alone is not a bot game

Since 2026-11-11 one player may start a game that one person can play: 큐브
세기 and 네모 세기 (the user: "혼자하기가능한것들 혼자하기활성화해줘 지금
게임시작버튼이비활성화되는경우있는듯 혼자하기가능한게임인데"). 잔디 깔기 and
러시안 룰렛 have no way to be played alone (the user:
"잔디깔기는혼자하기기능없어야할듯 이걸어케혼자해
러시안룰렛이랑같이혼자하기버튼이아예없으면될듯"). Such a game is the same
game with one person in it: no bot takes a seat, and nothing below changes.
Do not answer "this game cannot be started alone" by filling seats with bots
for real users.

## What a bot is allowed to be

- One basic bot per game: it makes moves the rules accept and can play a game
  to its end. That is the whole requirement.
- It decides from the view of its own seat only, as a person would have to
  (this keeps it usable as a test of what the server hides).
- A couple of tunable values at most, in the game's bot config file.

## What not to build

- Skill levels (normal, expert, …) or difficulty settings
- Reading opponents, bluffing, inference from other players' moves, look-ahead,
  or any "plays like a person" behaviour
- Bot personalities, names with character, bot dialogue or thinking animations
- Large tuning tables for bot behaviour
- Single-player screens, a bot-level picker, single-player tutorials or polish
- Offering bot-filled games to real users (bots in a live room are for
  development and tests only)

## When bots look like they need work

"The bots are dull", "the bots are too weak", "a game against bots drags" are
**not defects** in this project. Do not fix them. Note it in the report if it
matters, and spend the time on multiplayer: the room, the protocol, the rules,
the client.

The only reasons to touch bot code are: a bot makes a move the rules refuse, a
bot cannot finish a game, or a test needs a seat filled.

## The mistake this rule exists to stop

On 2026-11-11 a session built an "expert" bot level with opponent reading and
more than thirty tuning values, first in `prototypes/empty-chamber/` and then
again in the server module, before the user stopped it. That time belonged to
multiplayer.

`prototypes/empty-chamber/` (the first build, one person against five bots) is
kept as a way to check the rules. It is not developed further.

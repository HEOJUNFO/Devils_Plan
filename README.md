<h1 align="center">brain-survival</h1>

<p align="center">
  《데블스 플랜: 데드 어게인》(시즌 3)의 게임을 규칙 그대로,<br />
  웹에서 여럿이 실시간으로 하는 픽셀 아트 게임 모음입니다.
</p>

<p align="center">
  <a href="https://play.brain-survival.workers.dev"><b>지금 플레이하기</b></a>
  ·
  <a href="#게임">게임</a>
  ·
  <a href="#로컬에서-실행">로컬에서 실행</a>
  ·
  <a href="#구조">구조</a>
</p>

---

설치 없이 브라우저에서 엽니다. 로비에서 열린 방을 골라 들어가거나, 방을
만들거나, 친구가 준 방 코드를 넣으면 됩니다. 사람끼리 하는 게임만 제공합니다.
컴퓨터에서는 마우스와 키보드로, 휴대폰에서는 가로로 돌려 손가락으로 합니다.

방송에서 가져온 것은 **게임의 규칙과 게임 이름**뿐입니다. 방송의 제목 로고,
출연자, 세트, 화면 구성은 쓰지 않습니다. 방송사·제작사와 관계없는 개인
프로젝트입니다.

## 게임

| 게임 | 인원 | 한 줄 설명 |
|---|---|---|
| **러시안 룰렛** | 4~6명 | 실탄이 든 약실을 캐내고 총구를 돌려, 마지막 격발에서 살아남으세요. |
| **네모 세기** | 1~16명 (3인 팀 가능) | 숫자를 더해 타깃이 되는 네모를 먼저 세어 버저를 누르세요. 두 번 맞히면 승리. |
| **잔디 깔기** | 2~16명 | 공원에 잔디 타일을 놓으면 번호만큼 승점. 큰 번호일수록 늦게 놓습니다. |
| **큐브 세기** | 1~16명 | 쌓인 큐브가 몇 개인지 먼저 세어 답하세요. 틀리면 20초 동안 잠깁니다. |
| **기억 포커** | 2~16명 | 카드 16장을 외워 두 장을 고르세요. 공유 카드와 만든 족보가 높으면 승리. |
| **무거운 13** | 2~16명 | 바위 카드와 색깔 칩을 몰래 내세요. 내 바위로 받침대가 13 이상이 되면 벌점. |
| **미스터리 거래소** | 2~16명 | 주식의 숨은 규칙을 알아내 사고파세요. 24라운드 뒤 자산이 가장 많으면 1위. |

큐브 세기, 네모 세기, 잔디 깔기, 기억 포커는 시즌 첫 메인 매치 "양자택일"
안의 미니게임 네 개로, 하나씩 따로 만들었습니다. 미니게임에 딸린 양자택일의
선택은 그 게임 안에 들어 있습니다: 네모 세기에는 선택 2(팀·개인)와 판이
끝난 뒤의 선택 3(독식·헌신, 희생·질책, 도전·안전과 추가 대결), 잔디 깔기에는
선택 5~8(점수·정보, 공격·방어, 상생·견제, 가로수·맨홀). 기억 포커는
방송에서 최하위 두 사람이 윗순위에 도전하는 일대일 연승 게임이었는데, 방에는
그런 순위가 없어 모두가 라운드마다 둘씩 짝지어 겨룹니다.

무거운 13은 시즌의 첫 감옥 매치입니다. 세 명 이상이면 시작할 때 각자 설 자리를
고르고, 숫자가 같을 때의 순서는 그 자리의 시계 방향입니다. 규칙과 진행 절차는 방송 그대로입니다:
방송에서 일곱 명이 한 14라운드를 자막에서 다시 짜서 이 프로젝트의 규칙으로
돌리면 순서, 벌점, 최종 점수가 모두 같게 나옵니다 (다시 짠 판의 일부는
추론이고, 설계 기록에 적어 두었습니다).

미스터리 거래소는 시즌의 두 번째 메인 매치입니다. 일곱 회사의 이름, 시크릿과
피스, 24라운드는 방송 그대로입니다. **주가 규칙은 판마다 새로 뽑습니다.**
방송의 일곱 규칙은 방송을 본 사람이나 여기서 한 판 해 본 사람에게는 처음부터
알려져 있어서, 규칙을 알아내는 게임이 되지 않기 때문입니다. 방송의 규칙 일곱
가지 종류에 같은 틀의 세 가지를 더한 열 가지 가운데 일곱을 뽑고, 어느 회사가
어떤 규칙인지와 숫자를 판마다 다르게 줍니다 (더한 세 가지와 숫자의 범위는 이
프로젝트가 채운 것입니다). 방장은 대기실에서 "방송의 규칙"으로 바꿀 수 있고,
그러면 일곱 규칙의 문장과 숫자가 방송 그대로입니다. 방송 화면에 찍힌 주가
27개를 방송의 규칙으로 다시 돌리면 원 단위까지 같게 나옵니다 (돌릴 때 넣은
기록의 일부는 추론이고, 설계 기록에 적어 두었습니다). 방송에서 알트엔터의
주가는 그 방송의 로고 모양을 따라갔는데, 여기서는 판마다 새로 그린 거래소
로고를 따라갑니다. 모두가 라운드를 마치면 5분을 기다리지 않고 다음 라운드로
넘어갑니다.

큐브 세기의 입체는 마우스로 끌어서 (또는 방향키로) 돌려 볼 수 있습니다.

큐브 세기와 네모 세기는 방에 혼자 있어도 시작할 수 있습니다 (세어서 맞히는
게임이라 상대 없이도 풀 수 있습니다. 봇은 들어오지 않습니다). 잔디 깔기,
기억 포커, 무거운 13, 미스터리 거래소, 러시안 룰렛은 사람이 모여야 시작합니다.

| 러시안 룰렛 | 네모 세기 |
|---|---|
| ![러시안 룰렛 테이블](production/qa/evidence/roulette-2026-11-12-ko-2-my-turn-hidden-and-doubt.png) | ![네모 세기 정답 화면](production/qa/evidence/rectangles-2026-11-11-right-answer-blank-cell.png) |

| 잔디 깔기 | 큐브 세기 |
|---|---|
| ![잔디 깔기 공원 판](production/qa/evidence/grass-2026-11-11-tiles-with-holes-lay.png) | ![큐브 세기 문제 화면](production/qa/evidence/cubes-2026-11-11-turn-first-view.png) |

| 기억 포커 | 무거운 13 |
|---|---|
| ![기억 포커 결과 화면](production/qa/evidence/poker-2026-11-11-reveal.png) | ![무거운 13 카드와 칩을 고르는 화면](production/qa/evidence/under-2026-11-11-submit.png) |

| 미스터리 거래소 |
|---|
| <img src="production/qa/evidence/market-2026-11-11-table-ko.png" alt="미스터리 거래소 시세와 규칙 화면" width="440" /> |

규칙은 방송에서 공개된 그대로이고, 공개된 규칙이 말하지 않는 부분은
방송 화면으로 확인하거나 임시로 채웠습니다. 무엇을 그대로 가져왔고 무엇을
채웠는지는 게임마다 적어 두었습니다.

- 러시안 룰렛: [`design/game-brief.md`](design/game-brief.md) (방송은 6인, 4·5인 탁자는 이 프로젝트가 줄인 것)
- 네모 세기: [`design/games/count-rectangles.md`](design/games/count-rectangles.md) (팀의 "대표"가 누구인지와 "추가 대결"의 방식은 공개된 규칙에 없어 채운 것)
- 잔디 깔기: [`design/games/lay-the-grass.md`](design/games/lay-the-grass.md)
- 큐브 세기: [`design/games/count-cubes.md`](design/games/count-cubes.md) (문제의 그림은 공개된 규칙에 없어 이 프로젝트가 채운 것)
- 기억 포커: [`design/games/memory-poker.md`](design/games/memory-poker.md) (외우기 20초, 고르기 60초, 족보는 방송 그대로; 모두가 둘씩 겨루는 방식과 5라운드는 방을 위해 채운 것)
- 무거운 13: [`design/games/under-thirteen.md`](design/games/under-thirteen.md) (카드와 칩, 설 자리를 각자 고르는 것, 놓는 순서, 패스, 13 이상이면 벌점, 14라운드는 방송 그대로; 자리를 고르는 30초, 차례의 20초, 첫 선 플레이어를 무작위로 정하는 것은 방을 위해 채운 것)
- 미스터리 거래소: [`design/games/mystery-stock-market.md`](design/games/mystery-stock-market.md) (일곱 주식, 시크릿, 피스, 규칙이 공개되는 라운드는 방송 그대로이고, 방송의 일곱 규칙은 방장이 고르면 그대로 나옴; 판마다 새로 뽑는 규칙과 그 가운데 방송에 없는 세 가지, 판마다 새로 그리는 로고, 피스를 3개씩 주는 것, 모두 마치면 라운드를 넘기는 것은 방을 위해 채운 것)

## 방에서 되는 것

- **방 목록 로비**: 열린 방을 보고 들어가기, 방 만들기, 5자리 코드로 들어가기
- **공개 방과 비공개 방**: 공개 방은 목록에 보이고, 비공개 방은 코드로만 들어옵니다
- **한 방에 최대 16명** (러시안 룰렛 방은 6명: 방의 정원은 그 방의 게임이 받는 인원입니다), 게임이 진행 중일 때 들어온 사람은 그 판을 관전
- **채팅**: 대기실과 게임 중 모두. 서버는 전달만 하고 저장하지 않습니다
- **음성 채팅**: 비공개 방에서만 (브라우저끼리 직접 연결하는 WebRTC). 사람이 많은 방을 위해 말하지 않는 동안은 소리를 보내지 않도록 요청합니다
- **재접속**: 새로고침하거나 연결이 끊겨도 같은 자리로 돌아옵니다. 아무 말 없이 죽은 연결(와이파이에서 데이터로 넘어간 휴대폰 같은)은 무언가 누른 뒤 8초쯤이면 알아채고 새로 잇습니다
- **자리 비움 처리**: 끊긴 사람의 차례는 30초 뒤 자동으로 넘어가고, 3분 동안 돌아오지 않으면 자리를 반납합니다. 게임하던 사람이 모두 끊긴 채 다른 사람이 방에서 기다리면 그 판은 3분 뒤 정리됩니다
- **차례 제한 시간**: 차례가 있는 게임(러시안 룰렛)은 방에서 없음, 60초, 120초 중에 고릅니다 (공개 방은 60초로 시작)
- **휴대폰**: 가로 화면에서 일곱 게임을 모두 손가락으로 할 수 있습니다. 화면과 버튼을 휴대폰에 맞게 키우고, 게임 중에는 왼쪽 위 "메뉴"에 규칙, 소리, 음성, 전체 화면, 나가기를 모았습니다. 게임하는 동안은 화면이 꺼지지 않게 하고, 세로로 들면 가로로 돌려 달라고 안내합니다. 크롬의 휴대폰 흉내로 확인한 것이고, 실제 휴대폰(사파리, 화면 키보드)에서는 아직 확인하지 못했습니다

## 기술 구성

| 부분 | 쓰는 것 |
|---|---|
| 서버 | Cloudflare Workers + Durable Objects, [PartyServer](https://github.com/cloudflare/partykit/tree/main/packages/partyserver) |
| 클라이언트 | TypeScript, Canvas (480×270 픽셀 화면을 마우스에서는 정수 배율로, 손가락으로 누르는 기기에서는 화면에 꽉 차게), [pixelfx](https://github.com/patch-gg/pixelfx) |
| 빌드 | Vite + Cloudflare Vite 플러그인 |
| 테스트 | Vitest (Workers 런타임에서 돌리는 통합 테스트 포함) |

방 하나가 Durable Object 하나(`GameRoom`)이고, 방 목록은 따로 하나
(`RoomDirectory`)가 맡습니다. 게임 규칙은 서버가 판정하고, 각 사람에게는 그
사람이 볼 수 있는 것만 보냅니다. Cloudflare 무료 요금제 안에서 돌아가도록
만들었습니다.

## 로컬에서 실행

Node.js 22 이상이 필요합니다.

```bash
git clone https://github.com/HEOJUNFO/Devils_Plan.git
cd Devils_Plan
npm install
npm run dev -- --port 5273
```

브라우저에서 `http://localhost:5273` 을 엽니다.

혼자서 확인하려면 탭마다 다른 사람으로 들어가거나 빈자리를 봇으로 채웁니다.

- **탭마다 다른 사람**: 주소에 `?profile=이름` 을 붙이면 탭마다 닉네임과 자리가 따로 저장됩니다
- **봇으로 채우기**: 저장소 루트에 `.dev.vars` 파일을 만들어 `ALLOW_BOTS=true` 를 적고, 주소에 `?bots=1` 을 붙입니다
- **마이크 없이 음성 확인**: `?fakemic=1` (localhost에서만 동작, 마이크 대신 신호음)

봇은 개발과 테스트용입니다. 규칙에 맞는 수를 두어 한 판을 끝낼 수 있는
정도이고, 배포된 서버에서는 꺼져 있습니다.

### 명령어

| 명령어 | 하는 일 |
|---|---|
| `npm run dev` | 클라이언트와 서버(Workers 런타임)를 함께 띄웁니다 |
| `npm run typecheck` | 서버, 클라이언트, 테스트의 타입 검사 |
| `npm test` | 전체 테스트. 일부만 돌리려면 `npx vitest run tests/unit/lobby` 처럼 경로를 줍니다 |
| `npm run smoke` | 떠 있는 서버에 실제 소켓으로 접속해 일곱 게임을 진행해 봅니다 (기본 주소 `http://localhost:5273`). 한 게임만 보려면 `npm run smoke -- --only=under-thirteen` 처럼 게임 id를 줍니다 |
| `npm run build` | 배포용 빌드 |
| `npm run deploy` | 빌드한 뒤 `wrangler deploy` (평소에는 쓰지 않습니다. 아래 배포 참고) |

## 구조

```
src/
  server/                 # Worker: 방(GameRoom), 방 목록(RoomDirectory), 타이머
  shared/                 # 서버와 클라이언트가 같이 쓰는 순수 로직
    games.json            #   게임 목록: 이름, 설명, 인원
    hosts.ts              #   게임 id → 그 게임을 진행하는 호스트
    game/                 #   러시안 룰렛 규칙, 기본 봇
    games/<게임 id>/       #   네모 세기, 잔디 깔기, 큐브 세기, 기억 포커, 무거운 13, 미스터리 거래소의 규칙과 설정
    protocol.ts           #   소켓 메시지
    frame.ts              #   게임 화면을 기기 화면에 놓는 크기와 자리, 손가락이 버튼 둘레까지 닿는 범위
    *-config.json         #   방, 채팅, 음성, 방 목록의 설정값
  client/                 # 브라우저: 로비, 대기실, 채팅, 음성
    touch.ts              #   손가락으로 하는 기기인지, 그때 키 이름 대신 보여 줄 문구
    game/                 #   러시안 룰렛 화면, 공통 그리기
    games/<게임 id>/       #   게임별 화면
tests/
  unit/                   # 규칙과 순수 로직
  integration/            # 방을 실제 Workers 런타임에 띄워서 확인
tools/smoke.mjs           # npm run smoke
tools/subset-font.py      # 처음 받는 작은 글꼴 파일을 만듭니다 (문장에 새 글자가 생기면 다시 실행, --check 로 확인)
design/                   # 게임별 설계 기록 (규칙의 출처, 채운 부분)
assets/                   # 글꼴과 출처 기록 (provenance.yaml)
vendor/pixelfx/           # 픽셀 이펙트 라이브러리 사본
prototypes/empty-chamber/ # 러시안 룰렛의 첫 빌드 (더 손대지 않음)
production/qa/evidence/   # 화면을 바꿀 때마다 남긴 스크린샷
.claude/                  # Claude Code용 에이전트, 스킬, 훅, 규칙
```

숫자로 된 값(인원, 시간, 크레딧, 타일 모양)은 코드가 아니라 JSON 설정
파일에 있습니다.

### 게임을 하나 더 넣으려면

1. `src/shared/games.json` 에 id, 이름, 설명, 인원을 추가
2. `src/shared/games/<id>/` 에 규칙(`rules.ts`)과 호스트(`host.ts`)를 만들고 `src/shared/hosts.ts` 에 등록
3. `src/client/games/<id>/screen.ts` 에 화면을, `words.ts` 에 그 화면의 문구(한국어와 영어)와 규칙 시트를 만들고 `src/client/games/index.ts` 에 등록. 키로 하는 일은 누를 곳도 함께 두고, 키 이름이 들어가는 문구는 손가락용 문구를 같이 적습니다 (`src/client/touch.ts` 의 `byInput`, `keyed`)
4. `tests/unit/<id>/`, `tests/integration/` 에 테스트, `design/games/<id>.md` 에 규칙의 출처

방(`src/server/room.ts`)은 게임 안을 들여다보지 않고 호스트에 맡기므로, 방
코드는 고치지 않아도 됩니다.

## 배포

`main` 에 푸시하면 Cloudflare Workers Builds가 타입 검사, 테스트, 빌드를 거쳐
배포합니다. GitHub Actions(`.github/workflows/deploy.yml`)는 푸시와 PR마다
같은 검사만 하고 배포는 하지 않습니다. 그래서 GitHub에는 Cloudflare 인증
정보가 없습니다.

## 프로젝트 규칙

전체는 [`CLAUDE.md`](CLAUDE.md)의 Project Rules에 있습니다.

- **멀티플레이가 제품이고 봇은 테스트 도구입니다.** 봇은 게임마다 기본형 하나만 둡니다
- **게임 이름은 방송에서 부르는 이름을 씁니다.** 규칙도 문서 그대로 씁니다
- **로비는 방 목록입니다.** 닉네임과 코드만 있는 화면은 로비가 아닙니다
- **고친 부분만 검사합니다.** 전체 테스트는 푸시할 때 CI가 돌립니다

## 만든 방법

[Claude Code](https://code.claude.com/docs)와
[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
템플릿으로 개발합니다. `.claude/` 폴더, `project.yaml`, `studio-tests/`,
`docs/` 의 작업 흐름 문서는 그 템플릿의 것입니다. 템플릿 사용법은 템플릿
저장소의 README와 [`docs/WORKFLOW-GUIDE.md`](docs/WORKFLOW-GUIDE.md)를 보세요.

## 출처와 라이선스

- 코드: MIT. [LICENSE](LICENSE) 참고 (템플릿의 저작권 표시 포함)
- 글꼴: [Galmuri11](https://github.com/quiple/galmuri), SIL Open Font License 1.1 ([`assets/fonts/Galmuri11-LICENSE.txt`](assets/fonts/Galmuri11-LICENSE.txt)). 페이지가 처음 받는 것은 자주 쓰는 글자 2,921자만 추린 사본(`assets/fonts/Galmuri11-common.woff2`, 54 KB)이고, 거기 없는 글자가 화면에 나올 때만 전체 글꼴(505 KB)을 받습니다
- 픽셀 이펙트: [pixelfx](https://github.com/patch-gg/pixelfx), MIT ([`vendor/pixelfx/LICENSE`](vendor/pixelfx/LICENSE))

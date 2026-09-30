# ADR 010: 웹 구조와 이름 — app은 라우트만, 화면 코드는 features, 파일은 kebab-case

**상태:** Accepted

## 결정

웹 앱(루트 Next.js)의 폴더·파일·주소·패키지 이름은 널리 쓰는 관례를 따른다.

- **`app/`에는 라우트만 둔다.** `page.tsx`·`layout.tsx`·`route.ts`만 두고, 화면별 코드는 `features/<화면>/`, 여러 화면이 같이 쓰는 코드는 `components/`·`lib/`에 둔다. 화면끼리는 서로 가져다 쓰지 않는다.
- **공유 3D 엔진은 `lib/three/`에 둔다.** 셰이더·3인칭 조작·그림자·후처리·캐릭터 애니메이션·다른 캐릭터 그리기·기기 준비는 플레이 씬·내 주변·에셋 미리보기가 같이 쓴다.
- **파일·폴더 이름은 kebab-case**(`paper-map.tsx`, `third-person.ts`)이고, 컴포넌트·타입 이름은 PascalCase(`PaperMap`)다. NestJS 앱(`apps/api`·`apps/realtime`)도 kebab-case다.
- **공용 UI 부품은 `components/ui/`에 둔다**(버튼·카드·토스트·로더). 레이아웃 부품은 `components/layout/`, 지도는 `components/map/`, 위치 안내는 `components/location/`에 둔다.
- **주소는 사용자가 읽는 짧은 영어 단어다.** `/play`(플레이 씬), `/nearby`(내 주변), `/asset-viewer`(에셋 미리보기), `/map`(지도 월드, 예정).
- **웹 패키지 이름은 `@owcj/web`이다.** 다른 앱과 같은 `@owcj/` 범위를 쓴다.

## 배경

- 둘 이상의 화면이 쓰는 코드를 한 화면의 라우트 폴더에 두면, 다른 화면이 그 폴더를 가져다 쓰게 되고 폴더 이름만 보고는 공유 코드인지 알 수 없다.
- 폴더 이름은 안에 든 것이 하는 일을 말해야 한다 — 지도는 `map`, 위치 안내는 `location`, 레이아웃 부품은 `layout`.
- 씬 이름을 장면 내용으로 지으면 에셋이 바뀔 때(로드맵 P2-7 자체 에셋 교체) 이름이 맞지 않는다.
- 파일 이름 규칙은 저장소 전체에서 하나여야 한다.

## 근거

| 관례 | 출처 | 적용 |
|---|---|---|
| `app`은 라우팅용으로 두고 프로젝트 파일은 밖에 두거나 기능별로 나눌 수 있다. 정한 방식을 일관되게 쓴다 | Next.js 프로젝트 구조 문서 | `app/`은 라우트만, 나머지는 `features/`·`components/`·`lib/` |
| 코드 대부분을 `features/`에 두고, 기능끼리는 가져다 쓰지 않으며, 흐름은 공유 → 기능 → 앱 한 방향이다 | bulletproof-react | 화면 코드는 `features/`, 공유 엔진은 `lib/three/` |
| 기본 별칭 `components`·`components/ui`·`lib`·`lib/utils`, 파일 이름 kebab-case(`button.tsx`) | shadcn/ui | `components/ui/` 부품, kebab-case 파일 |
| 사람이 읽을 수 있는 단어, 소문자, 낱말 사이는 하이픈 | Google 검색 센터 URL 구조 | `/play`·`/nearby`·`/asset-viewer`·`/map` |
| 내부 패키지는 조직 범위 접두어로 이름 짓는다(`@acme/…`) | Turborepo 저장소 구조 | `@owcj/web` |

- **플레이(`/play`)**: 제목 화면에서 "플레이"로 들어가는, 게임 사이트에서 흔한 짜임이다(chess.com/play). 씬 내용에 묶이지 않아 에셋을 바꿔도 이름이 그대로다.
- **내 주변(`/nearby`)**: 위치 기반 앱이 "내 주변"을 부르는 흔한 말이고, 실시간 근접 중계(`/proximity`)와 뜻이 맞는다.
- **에셋 미리보기(`/asset-viewer`)**: 무엇을 보는 페이지인지 주소에 드러나고, Next.js·Vercel의 Preview(초안 모드·미리보기 배포)와 헷갈리지 않는다.
- **지도 월드(`/map`)**: 지도 위를 걷는 월드라는 점이 이름에 드러난다. 포켓몬 GO·스냅 맵처럼 지도 중심 화면에 흔히 쓰는 이름이다.

## 구조

| 폴더 | 내용 |
|---|---|
| `app/` | `page.tsx`(`/`), `play/page.tsx`, `nearby/page.tsx`, `asset-viewer/page.tsx`, `api/health/route.ts`, `layout.tsx` |
| `features/play/` | `play-scene.tsx`(`PlayScene`)·`audio.ts`·`sea.ts`·`birds.ts` |
| `features/nearby/` | `nearby-scene.tsx`(`NearbyScene`)·`ground-stream.ts`·`ground.ts`·`ground-source.ts`·`ground.worker.ts` |
| `features/asset-viewer/` | `asset-viewer.tsx`(`AssetViewer`) |
| `components/` | `ui/`(button·card·toast·loader)·`layout/`(page-transition)·`map/`(paper-map·paper-map-style)·`location/`(gps-steps)·`hud/`·`avatar/` |
| `lib/three/` | bin-loader·ramp-shader·third-person·touch-circles·noise·shadows·postprocess·kid-animation·remote-players·setup·character·fog |
| `lib/geo/`·`lib/realtime/` | gps·gps-messages·local-frame·vector-tiles / relay |

## 주의

- 표준 모노레포 구성(`apps/web`·`packages/shared`)은 로드맵의 별도 단계다.
- 대소문자만 다른 이름으로 바꿀 때(`Foo.tsx` → `foo.tsx`)는 윈도우처럼 대소문자를 가리지 않는 파일 시스템에서 git이 바로 알아보지 못한다. 임시 이름을 한 번 거쳐 `git mv`로 한다.

## 관련

- [ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다](./009-interest-management-naming.md)
- [프로젝트 구조](../architecture/project-structure.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [shadcn/ui — components.json](https://ui.shadcn.com/docs/components-json)
- [Google 검색 센터 — URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Turborepo — Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

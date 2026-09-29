# ADR 010: 웹 구조와 이름 — app은 라우트만, 화면 코드는 features, 파일은 kebab-case

**상태:** Accepted

## 결정

웹 앱(루트 Next.js)의 폴더·파일·주소·패키지 이름을 널리 쓰는 관례에 맞춘다.

- **`app/`에는 라우트만 둔다.** `page.tsx`·`layout.tsx`·`route.ts`만 두고, 화면별 코드는 `features/<화면>/`, 여러 화면이 같이 쓰는 코드는 `components/`·`lib/`에 둔다. 화면끼리는 서로 가져다 쓰지 않는다.
- **공유 3D 엔진은 `lib/three/`에 둔다.** 셰이더·3인칭 조작·그림자·후처리·아이 애니메이션·다른 아이 그리기·기기 준비는 플레이 씬·내 주변·에셋 미리보기가 같이 쓴다.
- **파일·폴더 이름은 kebab-case**(`paper-map.tsx`, `third-person.ts`), 컴포넌트·타입 이름은 PascalCase(`PaperMap`)다. NestJS 앱(`apps/api`·`apps/realtime`)은 이미 kebab-case다.
- **공용 UI 부품은 `components/ui/`에 둔다**(버튼·카드·토스트·로더). 레이아웃 부품은 `components/layout/`, 지도는 `components/map/`, 위치 안내는 `components/location/`에 둔다.
- **주소는 사용자가 읽는 짧은 영어 단어로 짓는다.** `/village`는 `/play`, `/neighborhood`는 `/nearby`, `/preview`는 `/asset-viewer`, 예정인 `/dashboard`는 `/map`이 된다. 옛 주소는 `next.config.ts`의 `redirects`로 새 주소에 영구 이동(308)한다.
- **제품 용어도 바꾼다.** 마을 씬은 플레이 씬(Play Scene), 대시보드 월드는 지도 월드(Map World)가 된다. 내 주변·에셋 미리보기는 그대로다.
- **웹 패키지 이름은 `@owcj/web`이다**(전 `project`). 다른 앱과 같은 `@owcj/` 범위를 쓴다.

## 배경

- **공유 엔진이 한 화면의 라우트 폴더 안에 있었다.** `app/village/`에 든 13개 파일 중 9개(셰이더·조작·그림자·후처리·애니메이션·원격 아이·기기 준비·노이즈·터치 원)를 내 주변과 에셋 미리보기가 `../village/…`·`@/app/village/…`로 가져다 썼다. 폴더 이름만 보면 마을 전용 코드처럼 보였다.
- **`components/world/`는 이름이 하는 일을 말하지 않았다.** 안에는 펼침 지도와 위치 안내가 있었다. `components/transition/`에는 로더와 페이지 전환이 함께 있었다.
- **마을 씬은 마을이 아니었다.** 이 씬은 Summer Afternoon 웹사이트의 섬을 옮긴 것이고, 에셋은 로드맵 P2-7에서 자체 에셋으로 바뀐다. 내용(마을·섬)으로 지은 이름은 에셋이 바뀌면 맞지 않는다.
- **`dashboard`는 보통 로그인한 뒤 보는 관리·통계 첫 화면을 뜻한다.** 실지형 지도 위를 걷는 월드와는 결이 다르다.
- **파일 이름 규칙이 섞여 있었다.** 컴포넌트는 PascalCase(`PaperMap.tsx`), 모듈은 camelCase(`thirdPerson.ts`), 서버는 kebab-case(`access-token.ts`)였다. 웹 패키지 이름은 `project`였다.

## 근거

| 관례 | 출처 | 적용 |
|---|---|---|
| `app`은 라우팅용으로 두고 프로젝트 파일은 밖에 두거나 기능별로 나눌 수 있다. 정한 방식을 일관되게 쓴다 | Next.js 프로젝트 구조 문서 | `app/`은 라우트만, 나머지는 `features/`·`components/`·`lib/` |
| 코드 대부분을 `features/`에 두고, 기능끼리는 가져다 쓰지 않으며, 흐름은 공유 → 기능 → 앱 한 방향이다 | bulletproof-react | 화면 코드는 `features/`, 공유 엔진은 `lib/three/` |
| 기본 별칭 `components`·`components/ui`·`lib`·`lib/utils`, 파일 이름 kebab-case(`button.tsx`) | shadcn/ui | `components/ui/` 부품, kebab-case 파일 |
| 사람이 읽을 수 있는 단어, 소문자, 낱말 사이는 하이픈 | Google 검색 센터 URL 구조 | `/play`·`/nearby`·`/asset-viewer`·`/map` |
| 내부 패키지는 조직 범위 접두어로 이름 짓는다(`@acme/…`) | Turborepo 저장소 구조 | `@owcj/web` |

- **플레이(`/play`)**: 제목 화면에서 "플레이"로 들어가는, 게임 사이트에서 가장 흔한 짜임이다(chess.com/play). 씬 내용에 묶이지 않아 에셋을 바꿔도 이름이 그대로다.
- **내 주변(`/nearby`)**: 위치 기반 앱이 "내 주변"을 부르는 흔한 말이다. 실시간 근접 중계(`/proximity`)와도 뜻이 맞는다.
- **에셋 미리보기(`/asset-viewer`)**: `preview`만으로는 무엇을 미리 보는지 드러나지 않고, Next.js·Vercel의 Preview(초안 모드·미리보기 배포)와 헷갈린다.
- **지도 월드(`/map`)**: 지도 위를 걷는 월드라는 점이 이름에 드러난다. 포켓몬 GO·스냅 맵처럼 지도 중심 화면에 흔히 쓰는 이름이다.

## 적용

| 전 | 후 |
|---|---|
| `app/village/`(page·scene·audio·sea·birds + 공유 모듈 9개) | `app/play/page.tsx` + `features/play/`(play-scene·audio·sea·birds) + `lib/three/`(ramp-shader·third-person·touch-circles·noise·shadows·postprocess·kid-animation·remote-players·setup) |
| `app/neighborhood/` | `app/nearby/page.tsx` + `features/nearby/`(nearby-scene·ground-stream·ground·ground-source·ground.worker) |
| `app/preview/` | `app/asset-viewer/page.tsx` + `features/asset-viewer/asset-viewer.tsx` |
| `components/world/`·`components/transition/` | `components/map/`(paper-map·paper-map-style)·`components/location/`(gps-steps)·`components/layout/`(page-transition)·`components/ui/loader.tsx` |
| PascalCase·camelCase 파일 | kebab-case 파일 (`lib/three/bin-loader.ts`, `lib/geo/gps-messages.ts` 등) |
| 컴포넌트 `SummerAfternoonPage`·`NeighborhoodScene`·`PreviewScene` | `PlayScene`·`NearbyScene`·`AssetViewer` |
| 플레이 씬 로딩 문구 "마을을 불러오고 있어요" | "게임을 불러오고 있어요" (전환 로더와 같은 문구) |

## 주의

- 저장소를 표준 모노레포 구성(`apps/web`·`packages/shared`)으로 옮기는 일은 따로 한다. 이번에는 웹 패키지 이름만 `@owcj/web`으로 맞췄다.
- `supabase/` 폴더(마이그레이션·쓰지 않는 Edge Function·CLI 설정)는 이번에 건드리지 않았다. Supabase 흔적(빌드 인자 `NEXT_PUBLIC_SUPABASE_*` 포함)을 정리할 때 함께 다룬다.
- 선택 페이지의 플레이 버튼 아이콘은 예전 마을 버튼의 집 그림 그대로다.
- 대소문자만 다른 파일 이름 변경(`Button.tsx` → `button.tsx`)은 윈도우처럼 대소문자를 가리지 않는 파일 시스템에서 git이 바로 알아보지 못한다. 이런 변경은 임시 이름을 한 번 거쳐 `git mv`로 한다.

## 관련

- [ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다](./009-interest-management-naming.md)
- [프로젝트 구조](../architecture/project-structure.md)
- [프론트엔드 컨벤션](../frontend/conventions.md)
- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [shadcn/ui — components.json](https://ui.shadcn.com/docs/components-json)
- [Google 검색 센터 — URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Turborepo — Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

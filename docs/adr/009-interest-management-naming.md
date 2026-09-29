# ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다

**상태:** Accepted

## 결정

실시간 서버(`apps/realtime`)의 네임스페이스·폴더·게이트웨이를 화면 이름 대신 **받는 사람을 고르는 방식(관심 영역 관리, Interest Management)** 으로 부른다. `/scene`은 `/room`, `/neighborhood`는 `/proximity`, `/world`는 `/sector`가 된다. 공유 계약과 웹의 연결 모듈도 같은 이름을 따른다. 화면 이름(마을 씬·내 주변·대시보드 월드)은 웹 경로와 문서에 두고, 어느 화면이 어느 중계를 쓰는지는 공유 계약(`shared/relay/contract.ts`의 `RELAYS`)과 게이트웨이 주석에 적는다.

## 배경

세 게이트웨이는 위치·상태를 실어 나르는 일이 같고, 누구의 상태를 누구에게 보낼지 고르는 방식만 다르다. 그런데 이름은 그 게이트웨이를 쓰는 화면을 따라 붙어 있었다.

- **`world`는 뜻이 겹쳤다.** PRD의 월드 구성은 세 화면을 모두 월드라 부르고, 익명 계약의 `SCENE_WORLDS`는 마을 씬과 내 주변을 world라 불렀다. 그런데 `/world` 네임스페이스는 대시보드 월드 하나만 가리켰다. MMO 서버 구성에서 world는 보통 게임 세계 전체나 그것을 관리하는 최상위 서버를 뜻하고, 공간을 나눈 조각은 zone·cell 같은 이름을 쓴다. 한 방식에 붙이기에는 층위가 맞지 않는다.
- **`scene`도 두 가지를 가리켰다.** 마을 씬의 네임스페이스(`/scene`)이면서, 내 주변 게이트웨이까지 담은 폴더(`src/scene/`)의 이름이었다.
- **이름이 하는 일을 말하지 않았다.** `world.gateway`만 봐서는 500m 격자로 나눠 방송한다는 것을 알 수 없다.

## 근거

업계는 이 일을 관심 영역 관리(Interest Management, Area of Interest)라 부르고, 구성 요소를 고르는 방식으로 이름 짓는다.

| 받는 사람을 고르는 방식 | 쓰는 화면 | 업계 이름 | 새 이름 |
|---|---|---|---|
| 정원 20명 방에 같이 든 사람 | 마을 씬 | Mirror Match, Colyseus·Photon Room | `/room` |
| 반경 200m 안 가까운 19명 | 내 주변 | Mirror Distance(옛 이름 Network Proximity Checker), Unreal NetCullDistance | `/proximity` |
| 500m 격자 칸과 경계 옆 칸 | 대시보드 월드(예정) | Mirror Spatial Hashing, Unreal GridSpatialization2D, WorkAdventure Zone | `/sector` |

- **새 단어를 들이지 않는다.** 방(Room)과 섹터(Sector)는 용어 사전에 이미 있는 말이다. `grid`도 방식 이름으로 흔하지만, 방 이름(`sector-{gx}-{gy}`)과 음성 룸(`voice-{sectorId}`)이 이미 섹터를 쓴다.
- **기능 이름으로는 나누지 않는다.** Supabase Realtime처럼 기능(Broadcast·Presence)으로 나누는 방식도 있지만, 셋은 실어 나르는 데이터가 같고 받는 사람만 다르다. 채팅 같은 기능은 네임스페이스 안의 이벤트로 둔다.
- **화면과 묶이지 않는다.** 새 화면이 생겨도 방식이 같으면 같은 네임스페이스를 쓴다. 화면 이름으로 붙이면 화면마다 게이트웨이가 늘거나, 방식과 이름이 어긋난다.
- **공통 코드는 `relay`다.** 방·근접이 함께 쓰는 상태 보관·검증은 Colyseus의 Relay Room처럼 흔히 쓰는 relay라 부른다.
- **폴더는 NestJS 기능 모듈 관례를 따른다.** 방식마다 폴더 하나에 게이트웨이와 모듈(`name/name.gateway.ts`·`name/name.module.ts`)을 둔다.

## 적용

- **네임스페이스**: `/room`(마을 씬)·`/proximity`(내 주변)·`/sector`(대시보드 월드, 예정). 이벤트 이름과 페이로드는 그대로다.
- **실시간 서버**: `src/room/`(`RoomGateway`·`RoomModule`), `src/proximity/`(`ProximityGateway`·`ProximityModule`), `src/sector/`(`SectorGateway`·`SectorModule`, 격자 배럴 `grid.ts`), 방·근접 공통 `src/relay/relay.ts`.
- **공유 계약**: `shared/relay/contract.ts`(전 `shared/scene/contract.ts`) — `RELAYS`(`room`·`proximity`), `RelayName`, `Relay*` 타입. `shared/sector/contract.ts`·`shared/sector/grid.ts`(전 `shared/world/contract.ts`·`sector.ts`).
- **웹**: `lib/realtime/relay.ts`의 `connectRelay(handlers, 'room' | 'proximity')`(전 `lib/realtime/scene.ts`의 `connectScene`).
- **바꾸는 범위**: 화면 이름(scene·world·neighborhood·island)이 든 식별자만 바꾼다. 원래 중립적인 이름(`PeerPosition`·`ChatMessage`·`ServerToClientEvents` 등)과 씬 렌더링 코드(`app/village/scene.tsx`, `createSceneAudio` 등)는 그대로 둔다.

## 주의

- 네임스페이스는 프로토콜이다. 옛 이름(`/scene`·`/neighborhood`)으로 붙는 이전 빌드의 웹은 새 서버에서 `Invalid namespace`로 거절돼 혼자 돈다. 웹과 실시간 서버를 함께 배포한다.
- 웹 경로 `/neighborhood`(내 주변 페이지)는 그대로다. 문서에서 `/neighborhood`는 페이지, `/proximity`는 소켓이다.

## 관련

- [ADR 008: 실시간 서버 분리](./008-realtime-server-split.md)
- [용어 사전 — 관심 영역 관리](../product/terminology.md)
- [Mirror — Interest Management](https://mirror-networking.gitbook.io/docs/manual/interest-management)
- [Unreal Engine — Replication Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/replication-graph-in-unreal-engine)
- [Photon Fusion — Interest Management](https://doc.photonengine.com/fusion/current/manual/advanced/interest-management)
- [Colyseus — Relay Room](https://docs.colyseus.io/room/built-in/relay)
- [WorkAdventure — PositionNotifier](https://github.com/workadventure/workadventure/blob/develop/back/src/Model/PositionNotifier.ts)
- [Socket.IO — Namespaces](https://socket.io/docs/v4/namespaces/)
- [NestJS — Modules](https://docs.nestjs.com/modules)

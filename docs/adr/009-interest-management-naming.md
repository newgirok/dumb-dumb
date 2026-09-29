# ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다

**상태:** Accepted

## 결정

실시간 서버(`apps/realtime`)의 네임스페이스·폴더·게이트웨이는 화면 이름이 아니라 **받는 사람을 고르는 방식(관심 영역 관리, Interest Management)** 으로 부른다 — `/room`·`/proximity`·`/sector`. 공유 계약(`shared/relay/`·`shared/sector/`)과 웹의 연결 모듈(`lib/realtime/relay.ts`)도 같은 이름을 쓴다. 화면 이름(플레이 씬·내 주변·지도 월드)은 웹 경로와 문서에 두고, 어느 화면이 어느 중계를 쓰는지는 공유 계약(`shared/relay/contract.ts`의 `RELAYS`)과 게이트웨이 주석에 적는다.

## 배경

- 세 게이트웨이는 위치·상태를 실어 나르는 일이 같고, 누구의 상태를 누구에게 보낼지 고르는 방식만 다르다 — 정원 20명 방, 반경 200m 가까운 19명, 500m 격자 칸.
- 화면 이름으로 부르면 이름이 하는 일을 말하지 않고, 화면이 늘거나 바뀔 때마다 이름과 방식이 어긋난다.
- `world`는 MMO 서버 구성에서 보통 게임 세계 전체나 그것을 관리하는 최상위 서버를 뜻하고, 공간을 나눈 조각은 zone·cell 같은 이름을 쓴다. 한 방식에 붙이기에는 층위가 맞지 않는다.

## 근거

업계는 이 일을 관심 영역 관리(Interest Management, Area of Interest)라 부르고, 구성 요소를 고르는 방식으로 이름 짓는다.

| 받는 사람을 고르는 방식 | 쓰는 화면 | 업계 이름 | 이름 |
|---|---|---|---|
| 정원 20명 방에 같이 든 사람 | 플레이 씬 | Mirror Match, Colyseus·Photon Room | `/room` |
| 반경 200m 안 가까운 19명 | 내 주변 | Mirror Distance, Unreal NetCullDistance | `/proximity` |
| 500m 격자 칸과 경계 옆 칸 | 지도 월드(예정) | Mirror Spatial Hashing, Unreal GridSpatialization2D, WorkAdventure Zone | `/sector` |

- **용어 사전의 말을 쓴다.** 방(Room)과 섹터(Sector)는 용어 사전에 있는 말이다. `grid`도 방식 이름으로 흔하지만, 방 이름(`sector-{gx}-{gy}`)과 음성 룸(`voice-{sectorId}`)이 섹터를 쓴다.
- **기능 이름으로는 나누지 않는다.** Supabase Realtime처럼 기능(Broadcast·Presence)으로 나누는 방식도 있지만, 셋은 실어 나르는 데이터가 같고 받는 사람만 다르다. 채팅 같은 기능은 네임스페이스 안의 이벤트로 둔다.
- **화면과 묶이지 않는다.** 새 화면이 생겨도 방식이 같으면 같은 네임스페이스를 쓴다.
- **공통 코드는 `relay`다.** 방·근접이 함께 쓰는 상태 보관·검증은 Colyseus의 Relay Room처럼 흔히 쓰는 relay라 부른다.
- **폴더는 NestJS 기능 모듈 관례를 따른다.** 방식마다 폴더 하나에 게이트웨이와 모듈(`name/name.gateway.ts`·`name/name.module.ts`)을 둔다.

## 적용

- **네임스페이스**: `/room`(플레이 씬)·`/proximity`(내 주변)·`/sector`(지도 월드, 예정).
- **실시간 서버**: `src/room/`(`RoomGateway`·`RoomModule`), `src/proximity/`(`ProximityGateway`·`ProximityModule`), `src/sector/`(`SectorGateway`·`SectorModule`, 격자 배럴 `grid.ts`), 방·근접 공통 `src/relay/relay.ts`.
- **공유 계약**: `shared/relay/contract.ts` — `RELAYS`(`room`·`proximity`), `RelayName`, `Relay*` 타입. `shared/sector/contract.ts`·`shared/sector/grid.ts`.
- **웹**: `lib/realtime/relay.ts`의 `connectRelay(handlers, 'room' | 'proximity')`.
- **식별자**: 화면 이름을 넣지 않는다. 방식과 상관없는 이름(`PeerPosition`·`ChatMessage`·`ServerToClientEvents` 등)은 그대로 쓴다.

## 주의

- 네임스페이스는 프로토콜이라 웹과 실시간 서버를 함께 배포한다. 서버에 없는 네임스페이스로 붙으면 `Invalid namespace`로 거절돼 씬이 혼자 돈다.
- 문서에서 `/nearby`는 페이지, `/proximity`는 소켓이다.

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

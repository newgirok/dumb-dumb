# 파이프라인 흐름

핵심 데이터 흐름 4가지를 정의합니다. 마을 씬(`/village`)은 로그인 없는 익명 소켓으로 같은 방 아이들의 씬 로컬
상태만, 내 동네 시험판(`/neighborhood`)은 같은 방식으로 반경 200m 사람들의 실제 좌표 상태를 주고받는다(1번 흐름).
대시보드 월드(`/dashboard`)의 이동·음성 흐름과 상점(`/store`)의 결제 흐름은 서버 쪽이 API 서버에 있고, 화면은
다시 만든다(예정).

---

## 1. 캐릭터 이동 파이프라인

### 마을 씬 (씬 로컬 좌표)

```
유저 입력 (PC: WASD·방향키·마우스 가상 조이스틱 / 모바일: 터치 가상 조이스틱)
  │
  ▼ [3인칭 컨트롤러 — app/village/thirdPerson.ts]
  ├── 입력만큼 가속·매 프레임 감쇠(관성)하고, 캡슐로 충돌 메시(collider.bin, BVH)와 부딪친다
  ├── 벽은 따라 미끄러지고 낮은 턱만 넘으며, 난간에서는 떨어진다
  └── 3인칭 카메라가 캐릭터 뒤로 따라온다
  │
  ▼ [35ms마다 상태 전송 — lib/realtime/scene.ts]
  ├── 위치 [x,y,z]·방향 [phi,theta](소수 둘째 자리)·모션(0 기본·1 공중·2 심심함)·색 시드 중 바뀐 필드만
  ├── 5분 동안 바뀐 게 없으면 스스로 끊고 다시 움직이면 붙는다. 탭을 숨기면 끊고 보이면 붙는다
  └── socket.io `/scene` `state` 이벤트 (토큰 없음)
  │
  ▼ [씬 게이트웨이 — apps/api/src/scene/scene.gateway.ts]
  ├── 방 배정: 전에 있던 방 → 먼저 연 방 순으로 20명까지, 다 차면 새 방 (전체 1,000명)
  ├── 들어오면 `welcome`(내 id·방)과 방 전원의 현재 상태를 먼저 보낸다
  ├── 필드별 검증 — 틀린 필드만 버린다. 이동은 초당 10m 거리 예산(최대 2m) 안에서만, 순간이동은 5초에 한 번
  ├── 초당 60건을 넘게 보내거나 330초 동안 조용하면 끊는다
  ├── 35ms마다 방별로 바뀐 필드를 `states` 한 묶음으로 방송 (2명 이상인 방만)
  └── 나가면 `leave` (상태는 프로세스 메모리에만 있고 DB에 저장하지 않는다)
  │
  ▼ [같은 방 클라이언트 — app/village/remotes.ts]
  ├── 네 필드가 다 모이면 아이를 세우고 0.35초에 걸쳐 키운다(나가면 0.25초에 걸쳐 줄여 없앤다)
  ├── 받은 위치를 목표점이, 목표점을 몸이 프레임당 0.4 비율로 따라간다. 10m 넘게 뛰면 곧장 옮긴다
  └── 움직인 거리로 속도를 다시 만들어 로컬 아이와 같은 규칙으로 idle·run·air·bored를 섞는다
      (100m 밖이거나 화면 밖이면 포즈 갱신을 건너뛴다)
```

내 동네 시험판(`/neighborhood`)도 같은 흐름이다. 다른 점은 셋이다.

```
  ▼ [35ms마다 상태 전송 — lib/realtime/scene.ts connectScene(…, 'neighborhood')]
  └── 위치는 실제 좌표 [경도, 위도, 높이](소수 7·7·2자리) — 사람마다 씬 원점이 달라 로컬 m로는 맞출 수 없다
  │
  ▼ [내 동네 게이트웨이 — apps/api/src/scene/neighborhood.gateway.ts]
  ├── 방이 없다. 35ms 틱마다 사람마다 반경 200m 안에서 가까운 19명을 고른다(250m 격자 3×3칸에서 후보)
  ├── 보이던 사람은 230m까지 남고 순위도 30m 앞당겨 받는다
  └── 새로 보이면 전체 상태, 계속 보이면 바뀐 필드만, 멀어지거나 밀리거나 끊기면 `leave`
  │
  ▼ [내 동네 클라이언트 — app/neighborhood/scene.tsx → app/village/remotes.ts]
  └── 받은 경위도를 내 원점 기준 로컬 m로 바꿔 넘긴다(방향은 로컬 축이 모두 같아 그대로)
```

이동 물리는 브라우저 안에서만 돌고, 서버는 받은 좌표를 검증해 중계할 뿐 충돌·물리를 계산하지 않는다. 서버에
닿지 못하면 소켓이 뒤에서 재시도하는 동안 씬은 혼자인 채로 돈다. 소켓 주소가 localhost인데 페이지가
localhost가 아닌 곳에서 열렸으면(소켓 주소 없이 빌드한 배포본) 방문자 PC로 붙지 않도록 아예 접속하지 않는다.
화면 5시의 GIS 미니맵은 이와 별개로 유저의 실제 GPS 위치를 실지형 지도 위에 표시한다.

### 대시보드 월드 (위경도, 화면은 예정)

```
유저 입력
  ├── PC: WASD·방향키 → 좌표 이동 (남북 3m/s, 동서 약 2.4m/s)
  └── 모바일: 실제 GPS 갱신 (watchPosition)
  │
  ▼ [도로 스냅]
  ├── 새 좌표 주변(±25px)의 Mapbox `road` 선분 중 최근접점 탐색
  └── 15m 이내면 그 점으로 보정, 아니면 원좌표 유지
  │
  ▼ [화면 반영]
  ├── 캐릭터 메시를 새 위경도로 이동 (Three.js 커스텀 레이어)
  ├── 지도 중심을 캐릭터로 맞춤 (pitch·bearing 고정 카메라)
  ├── 섹터가 바뀌면 음성 룸 전환 (4번 흐름)
  └── 50m 이동마다 반경 450m 밖 피어 오브젝트 dispose()
  │
  ▼ [200ms마다 위치 전송 — 클라이언트]
  ├── 직전 틱 좌표 대비 시속 30km 초과 → 전송 드롭
  ├── 마지막으로 보낸 좌표에서 0.3m 미만 이동 → 전송 생략
  └── socket.io `move` 이벤트로 위경도 전송
  │
  ▼ [월드 게이트웨이 — apps/api/src/world/world.gateway.ts, 서버 권위]
  ├── 시속 30km 초과 좌표 드롭 (서버 재검증)
  ├── 500m 섹터 판정 + 경계 50m 이내 인접 섹터 방 입장·퇴장
  ├── 200ms마다 섹터별 위치 묶음을 `positions` 이벤트로 방송 (2명 이상인 섹터만)
  └── 30초 동안 move가 없으면 메모리의 위치 상태를 지움 (소켓은 유지)
      (위치·채팅은 DB에 저장하지 않는 휘발성 브로드캐스트)
  │
  ▼ [주변 유저 클라이언트]
  └── 수신 위치를 목표로 두고 매 프레임 보간해 상대 캐릭터 이동
```

월드 게이트웨이는 API 서버에 있고, 입력·도로 스냅·전송·보간은 대시보드 월드 화면과 함께 만든다. 서버가 섹터
판정·속도 검증·묶음 브로드캐스트를 모두 수행하는 중간 집계 주체다. 브라우저는 `NEXT_PUBLIC_WS_URL`로 월드
게이트웨이에 직접 접속하며, 접속 시 액세스 토큰을 `handshake.auth`로 넘긴다. 섹터 계산과 서버 속도 검증
(haversine 거리)은 `shared/world/sector.ts`를 쓰고, 이벤트 계약은 `shared/world/contract.ts`를 쓴다.

---

## 2. 결제 트랜잭션 파이프라인

```
유저 [구매] 버튼 클릭 (상점 화면 /store — 예정)
  │
  ▼ [주문서 발행 — NestJS POST /billing/orders]
  ├── 상점 화면은 BFF 라우트 /api/billing/orders를 거쳐 부른다 (예정)
  └── 고유 주문 UUID로 orders에 status='PENDING' 삽입 (금액은 서버 상품표 기준)
  │
  ▼ [PG 승인 웹훅 — POST /billing/webhook]
  │  PG 결제창 연동은 상점 화면과 함께 만든다. 승인은 이 웹훅으로만 반영된다
  ├── raw body 기준 HMAC-SHA256 서명 검증 (x-pg-signature, PG_WEBHOOK_SECRET)
  ├── 주문 행 FOR UPDATE 잠금 → 이미 PAID면 무시, 금액이 다르면 거절
  ├── 승인번호 UNIQUE(orders_pg_approval_uniq)로 같은 승인번호 재사용 차단
  └── status → 'PAID', pg_approval_number·completed_at 기록
  │
  ▼ [발급 워커 — fulfillment.worker, AVATAR_WORKER_INTERVAL_MS(기본 2000ms)마다]
  ├── PAID · fulfilled_at 없음 · fulfill_attempts < 8 주문을 FOR UPDATE SKIP LOCKED로 집는다
  │     (잠금은 이 조회 트랜잭션 동안만 유지된다)
  ├── 아바타 상품: 수량만큼 외형 추첨 → characters INSERT (시리얼 OW-00000001 형식)
  │     · appearance_hash UNIQUE 충돌 → 다시 추첨하고 fulfill_attempts +1
  │     · (order_id, order_seq) UNIQUE(characters_order_item_uniq)로 같은 순번 중복 발급 차단
  ├── 라이선스 상품: user_licenses.visibility_radius_m = GREATEST(현재값, 구매 반경)
  └── 성공 시 fulfilled_at 기록. 그 밖의 오류는 다음 주기에 다시 시도한다
  │
  ▼ [상점 화면 — 예정]
  └── 페이지를 열 때와 주문 직후 GET /me/characters, GET /me/license를 다시 조회해 표시
```

멱등성은 애플리케이션 로직이 아니라 DB 제약으로 보장하므로, 중복 웹훅이나 워커 재시도가 있어도
동일 주문은 한 번만 발급된다. 워커의 행 잠금은 주문을 집는 조회가 끝나면 풀리므로, 여러 인스턴스가 같은 주문을
다시 집더라도 중복은 UNIQUE 제약과 라이선스 `GREATEST` 갱신으로 흡수된다. 외형 충돌로 `fulfill_attempts`가 8에 닿은 주문은 워커 대상에서 빠지며,
운영자가 확인한다. 서버 전용 작업이므로 admin 컨텍스트로 RLS를 우회한다.

---

## 3. 광고 노출 파이프라인 (Phase 5 예정)

```
유저 캐릭터 이동 (50m마다 트리거 또는 실시간)
  │
  ▼ [PostGIS 공간 쿼리 — NestJS]
  ├── ST_DWithin: 유저 위경도 반경 내 활성 스폰서 랜드마크 조회
  │     (DB 함수 nearby_sponsor_buildings, 기본 반경 500m)
  └── 결과: {id, texture_url, lng, lat, distance_m}[]
  │
  ▼ [클라이언트 렌더링]
  ├── 전방 350~400m 지점 랜드마크 에셋 비동기 프리로드
  ├── 가시거리 경계 도달 전 에셋 + 텍스처 메모리 적재 완료
  ├── Three.js TextureLoader → 랜드마크 메시 UV에 브랜드 로고 1:1 매핑
  └── 5시 GIS 미니맵에 스폰서 마커 표시
  │
  ▼ [유효 노출 판정]
  ├── 뷰포트 내 바운딩 박스 완전 진입 여부 확인
  ├── 1초 이상 유지 시에만 서버로 '노출 +1' 신호 전송
  └── ad_impressions 테이블 INSERT
  │
  ▼ [무료 유저 호기심 유도]
  ├── 가시거리 경계(35m 지점) 스폰서 랜드마크 실루엣 표시
  └── Glow/Emission 효과로 가시거리 너머 브랜드 칼라 번짐 연출
```

마이그레이션에는 `sponsor_buildings`/`ad_impressions` 테이블, `geom` GiST 인덱스, pg_cron 광고 기간 자동
활성/비활성 스케줄(`activate-ads`), 반경 조회 함수 `nearby_sponsor_buildings`가 있다(저장소의 Supabase Edge Function `supabase/functions/spatial-query`만
호출한다). 앱에서 이 함수를 호출하는 API,
클라이언트 에셋 매핑·미니맵 마커·유효 노출 카운팅, 광고주 어드민 포탈은 Phase 5에서 구현한다.

---

## 4. 음성 세션 체결 파이프라인 (대시보드 월드, 화면은 예정)

```
대시보드 월드 진입 또는 섹터 이동
  │
  ▼ [섹터 룸 결정]
  └── 현재 위경도의 섹터 ID로 룸 이름 `voice-{sectorId}` 결정 (바뀔 때만 다음 단계)
  │
  ▼ [룸 토큰 요청 — NestJS POST /voice/token]
  ├── 화면은 BFF 라우트 /api/voice/token을 거쳐 부른다 (예정). 액세스 토큰 필수
  ├── 룸 이름이 섹터 룸 형식(`voice-sector-{x}-{y}`)인지 검증
  └── livekit-server-sdk로 참가 JWT 발급 (identity = 액세스 토큰의 유저 ID, 1시간)
  │
  ▼ [LiveKit Cloud 룸 조인]
  ├── 이전 섹터 룸을 끊고 새 룸에 조인 (브라우저 → LiveKit Cloud 직접)
  ├── 자동 구독 끔 — 구독 대상은 클라이언트가 직접 고른다
  └── SFU 연결을 LiveKit Cloud가 자동 체결 (NAT/방화벽 TURN 포함)
  │
  ▼ [구독·공간 음성 — 위치를 전송하는 틱마다 (내가 0.3m 이상 움직였을 때)]
  ├── 피어 거리·방위를 위경도로 계산해 가까운 순 정렬
  ├── 40m 이내 가까운 8명만 오디오 트랙 구독, 나머지 구독 해제 (Top-8 Capping)
  ├── 3D 패닝: 상대 방위 → Web Audio PannerNode(HRTF) 위치 갱신
  └── 거리 감쇠: 30m까지 최대 볼륨, 30~40m 선형 감쇠, 40m 밖 무음
```

룸 토큰 발급(`apps/api/src/voice/voice.controller.ts`)은 API 서버에 있고, 룸 조인·구독·공간 음성·마이크
옵트인(거부하면 수신 전용)·오디오 컨텍스트 재개는 대시보드 월드 화면과 함께 만든다. 룸 토큰 발급 외의 미디어
트래픽은 브라우저와 LiveKit Cloud 사이에서 직접 오간다.

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [데이터 모델](./data-model.md)
- [ADR 003 — LiveKit](../adr/003-livekit-cloud-sfu.md)
- [ADR 005 — PostGIS](../adr/005-postgis-gist-index.md)

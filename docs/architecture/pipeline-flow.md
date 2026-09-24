# 파이프라인 흐름

핵심 데이터 흐름 4가지를 정의합니다. 위치 동기화·음성 흐름은 대시보드 월드(`/dashboard`)에만 있고,
루트 3D 씬(`/`)은 서버와 통신하지 않는다.

---

## 1. 캐릭터 이동 파이프라인

### 대시보드 월드 (위경도)

```
유저 입력
  ├── PC: WASD·방향키 → 좌표 이동 (남북 3m/s, 동서 약 2.4m/s)
  └── 모바일: 실제 GPS 갱신 (watchPosition)
  │
  ▼ [도로 스냅 — lib/map/snap.ts]
  ├── 새 좌표 주변(±25px)의 Mapbox `road` 선분 중 최근접점 탐색
  └── 15m 이내면 그 점으로 보정, 아니면 원좌표 유지
  │
  ▼ [화면 반영]
  ├── 캐릭터 메시를 새 위경도로 이동 (Three.js 커스텀 레이어)
  ├── 지도 중심을 캐릭터로 맞춤 (pitch·bearing 고정 카메라, followPlayer)
  ├── 섹터가 바뀌면 음성 룸 전환 (4번 흐름)
  └── 50m 이동마다 반경 450m 밖 피어 오브젝트 dispose()
  │
  ▼ [200ms마다 위치 전송 — 클라이언트]
  ├── 직전 틱 좌표 대비 시속 30km 초과 → 전송 드롭
  ├── 마지막으로 보낸 좌표에서 0.3m 미만 이동 → 전송 생략
  └── socket.io `move` 이벤트로 위경도 전송
  │
  ▼ [월드 게이트웨이 — 서버 권위]
  ├── 시속 30km 초과 좌표 드롭 (서버 재검증)
  ├── 500m 섹터 판정 + 경계 50m 이내 인접 섹터 방 입장·퇴장
  ├── 200ms마다 섹터별 위치 묶음을 `positions` 이벤트로 방송 (2명 이상인 섹터만)
  └── 30초 동안 move가 없으면 메모리의 위치 상태를 지움 (소켓은 유지)
      (위치·채팅은 DB에 저장하지 않는 휘발성 브로드캐스트)
  │
  ▼ [주변 유저 클라이언트]
  └── 수신 위치를 목표로 두고 매 프레임 보간해 상대 캐릭터 이동
```

서버가 섹터 판정·속도 검증·묶음 브로드캐스트를 모두 수행하는 중간 집계 주체다. 브라우저는
`NEXT_PUBLIC_WS_URL`로 월드 게이트웨이에 직접 접속하며, 접속 시 액세스 토큰을 `handshake.auth`로 넘긴다.
섹터 계산은 `shared/world/sector.ts`를 프론트·백엔드가 함께 쓴다. 서버의 속도 검증은 같은 파일의 haversine 거리를 쓰고,
클라이언트의 거리·속도 사전 검증은 cheap-ruler(위도 37.5° 고정)로 따로 계산한다.

### 루트 3D 씬 (씬 로컬 좌표)

```
유저 입력 (PC: WASD·방향키·마우스 가상 조이스틱 / 모바일: 터치 가상 조이스틱)
  │
  ▼ [3인칭 컨트롤러 — app/summer-afternoon/thirdPerson.ts]
  ├── 충돌 메시(collider.bin) 레이캐스트로 지면 높이를 따라 이동
  ├── 벽과 0.6m보다 높은 단차에서 차단 (점프 중에는 단차에 올라설 수 있음)
  └── 3인칭 카메라가 캐릭터 뒤로 따라온다
```

루트 3D 씬의 이동은 브라우저 안에서만 처리되며 서버로 좌표를 보내지 않는다. 화면 5시의 GIS 미니맵은 이와
별개로 유저의 실제 GPS 위치를 실지형 지도 위에 표시한다.

---

## 2. 결제 트랜잭션 파이프라인

```
유저 [구매] 버튼 클릭 (상점 /store)
  │
  ▼ [주문서 발행 — POST /api/billing/orders]
  ├── app/api/billing/orders 프록시 → NestJS billing 모듈
  └── 고유 주문 UUID로 orders에 status='PENDING' 삽입 (금액은 서버 상품표 기준)
  │
  ▼ [PG 승인 웹훅 — POST /billing/webhook]
  │  PG 결제창 연동은 Phase 4 남은 작업이다. 승인은 이 웹훅으로만 반영된다
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
  ▼ [상점]
  └── 페이지를 열 때와 주문 직후 /api/me/characters, /api/me/license를 다시 조회해 표시
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

## 4. 음성 세션 체결 파이프라인

```
대시보드 월드 진입 또는 섹터 이동
  │
  ▼ [섹터 룸 결정]
  └── 현재 위경도의 섹터 ID로 룸 이름 `voice-{sectorId}` 결정 (바뀔 때만 다음 단계)
  │
  ▼ [룸 토큰 요청]
  ├── app/api/voice/token 프록시 → NestJS voice 모듈 (액세스 토큰 필수)
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

룸 토큰 발급 외의 미디어 트래픽은 브라우저와 LiveKit Cloud 사이에서 직접 오간다. 마이크 송출(`enableMic`)과
오디오 컨텍스트 재개(`resumeAudio`)는 `VoiceManager`에 있으나 호출하는 UI가 없어, 대시보드 월드 음성은 룸
접속과 수신 구독까지 동작한다.

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [데이터 모델](./data-model.md)
- [ADR 003 — LiveKit](../adr/003-livekit-cloud-sfu.md)
- [ADR 005 — PostGIS](../adr/005-postgis-gist-index.md)

# 파이프라인 흐름

핵심 데이터 흐름 4가지를 정의합니다.

---

## 1. 캐릭터 이동 파이프라인

```
유저 입력 (PC: WASD / 모바일: 가상 조이스틱)
  │
  ▼ [클라이언트 1차 속도 필터]
  ├── 직전 씬 좌표와 속도 비교
  ├── 시속 30km 초과 → 드롭 (핵/텔레포트 방어, 서버 미전송)
  └── 정상 → 다음 단계
  │
  ▼ [씬 이동 보정]
  ├── 씬에 구워진 오솔길 에셋 위를 따라 이동
  └── 집·창고·바위 등 정적 지오메트리 충돌 차단
  │
  ▼ [3인칭 추적 카메라]
  ├── 캐릭터 뒤를 부드럽게 따라가는 추적 카메라
  └── Three.js 캐릭터 Walk 애니메이션 재생
  │
  ▼ [socket.io 월드 게이트웨이로 씬 좌표 전송]
  ├── 서버가 섹터 판정 + 속도 재검증 (서버 권위)
  ├── 서버가 섹터 단위로 위치를 묶어 5Hz로 브로드캐스트
  └── 주변 유저 클라이언트가 수신 → 상대 캐릭터 위치 갱신
      (위치·채팅은 DB에 저장하지 않는 휘발성 브로드캐스트)
  │
  ▼ [50m 이동마다 비동기 Prune]
  ├── 반경 450m 외곽 Three.js 씬 오브젝트 dispose()
  └── 씬 에셋 자원 Unload
```

서버가 섹터 판정·속도 검증·묶음 브로드캐스트를 모두 수행하는 중간 집계 주체이며, 모든 좌표는 씬 로컬
좌표 기준이다. 브라우저는 `NEXT_PUBLIC_WS_URL`로 월드 게이트웨이에 직접 접속한다. 화면 5시의 GIS
미니맵은 이와 별개로 유저의 실제 GPS 위치를 실지형 지도 위에 표시한다.

---

## 2. 결제 트랜잭션 파이프라인

```
유저 [아바타/라이선스 구매] 버튼 클릭 (상점 화면)
  │
  ▼ [주문 생성 — 멱등성 키]
  ├── app/api/billing/orders 프록시 → NestJS billing 모듈
  ├── 고유 주문 UUID 생성, orders 테이블에 status='PENDING' 삽입
  └── 해당 UUID를 PG사(토스페이먼츠 / 카카오페이) API에 전달
  │
  ▼ [PG사 결제창 호출]
  │  유저가 결제 완료 또는 취소
  │
  ▼ [PG 웹훅 수신 — NestJS billing 모듈]
  ├── raw body 보존으로 웹훅 서명 검증 (PG_WEBHOOK_SECRET)
  ├── DB 제약으로 멱등성 보장:
  │     · orders_pg_approval_uniq  (동일 승인번호 중복 차단)
  │     · characters_order_item_uniq (묶음 순번 중복 발급 차단)
  └── status → 'PAID' 업데이트
  │
  ▼ [발급 워커 — fulfillment.worker]
  ├── PAID 주문을 폴링 (AVATAR_WORKER_INTERVAL_MS)
  ├── appearance_hash 중복 체크 후 characters INSERT (order_id/order_seq)
  ├── 라이선스 상품이면 user_licenses.visibility_radius_m 업그레이드
  ├── fulfill_attempts 증가, 성공 시 fulfilled_at 기록
  └── 클라이언트 폴링 (GET /api/me/characters, /api/me/license) → 발급 완료 연출
  │
  ▼ [발급 실패 시]
  ├── fulfill_attempts 누적, orders.status → 'FAILED' + fail_reason 기록
  └── 재시도/CS 대응 근거로 보존
```

멱등성은 애플리케이션 로직이 아니라 DB 제약으로 보장하므로, 중복 웹훅이나 워커 재시도가 있어도
동일 주문은 한 번만 발급된다. 서버 전용 작업이므로 admin 컨텍스트로 RLS를 우회한다.

---

## 3. 광고 노출 파이프라인 (Phase 5 예정)

```
유저 캐릭터 이동 (50m마다 트리거 또는 실시간)
  │
  ▼ [PostGIS 공간 쿼리 — NestJS]
  ├── ST_DWithin: 반경 내 활성 스폰서 랜드마크 조회
  ├── 미니맵/좌표 레이어를 받치는 PostGIS 공간 인덱스 조회
  └── 결과: {building_id, texture_url, dist_m}[]
  │
  ▼ [클라이언트 렌더링]
  ├── 전방 350~400m 지점 랜드마크 에셋 비동기 프리로드
  ├── 씬 뷰 디스턴스 경계 도달 전 GLB + 텍스처 메모리 적재 완료
  ├── Three.js TextureLoader → 랜드마크 GLB UV에 브랜드 로고 1:1 매핑 (씬 배치)
  └── 5시 GIS 미니맵에 스폰서 마커 표시
  │
  ▼ [유효 노출 판정]
  ├── 씬 뷰포트 내 바운딩 박스 완전 진입 여부 확인
  ├── 1초 이상 유지 시에만 서버로 '노출 +1' 신호 전송
  └── ad_impressions 테이블 INSERT
  │
  ▼ [무료 유저 호기심 유도]
  ├── 씬 뷰 디스턴스 경계(35m 지점) 스폰서 랜드마크 실루엣 표시
  └── Glow/Emission 효과로 거리 안개 너머 브랜드 칼라 번짐 연출
```

`sponsor_buildings`/`ad_impressions` 테이블과 GiST 인덱스는 준비되어 있으며, PostGIS 공간 쿼리·브랜드
텍스처 씬 매핑·미니맵 마커·유효 노출 카운팅·pg_cron 스케줄러 연동·광고주 어드민 포탈은 Phase 5에서
구현한다.

---

## 4. 음성 세션 체결 파이프라인

```
유저 A 이동 → 유저 B가 30m 이내 진입 (근접 감지)
  │
  ▼ [룸 토큰 요청]
  ├── 각 클라이언트가 app/api/voice/token 프록시 → NestJS voice 모듈 호출
  └── voice 모듈이 livekit-server-sdk로 룸 접속 JWT 발급
  │
  ▼ [LiveKit Cloud 룸 조인]
  ├── 동일 룸 ID로 A, B 모두 조인 (브라우저 → LiveKit Cloud 직접)
  ├── SFU 연결을 LiveKit Cloud가 자동 체결 (NAT/방화벽 TURN 포함)
  └── 화면 상단 "근접 음성 구역 진입" 토스트 1.5초 노출
  │
  ▼ [공간 음성 적용]
  ├── 거리 기반 볼륨 감쇠: 가까울수록 크게, 씬 거리 경계 근처일수록 소멸
  ├── 3D 패닝: 상대 캐릭터 위치 → Web Audio PannerNode 실시간 갱신
  └── 거리순 Top-8 구독 Capping (클라이언트 CPU 방어)
  │
  ▼ [세션 파기 — 40m 이탈 시]
  ├── Room.disconnect() 즉시 호출
  ├── 오디오 컨텍스트 null 처리 (메모리 누수 차단)
  └── 구독 슬롯 반환 → 더 가까운 신규 유저로 교체
```

30m 진입 시 조인, 40m 이탈 시 파기하며, 룸 토큰 발급 외의 미디어 트래픽은 브라우저와 LiveKit Cloud
사이에서 직접 오간다.

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [데이터 모델](./data-model.md)
- [ADR 003 — LiveKit](../adr/003-livekit-cloud-sfu.md)
- [ADR 005 — PostGIS](../adr/005-postgis-gist-index.md)

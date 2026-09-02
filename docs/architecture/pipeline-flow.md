# 파이프라인 흐름

핵심 데이터 흐름 4가지를 정의합니다.

---

## 1. 캐릭터 이동 파이프라인

```
유저 입력 (WASD / 조이스틱 / GPS)
  │
  ▼ [클라이언트 1차 필터]
  ├── 직전 좌표와 속도 비교
  ├── 시속 30km 초과 → 드롭 (핵/텔레포트 방어, 백엔드 미전송)
  └── 정상 → 다음 단계
  │
  ▼ [오솔길 스냅 (Snap-to-Trail)]
  ├── ST_ClosestPoint: 반경 15m 내 가장 가까운 오솔길 중심선으로 자석 정렬
  └── 지형지물 폴리곤 내부면 충돌 차단
  │
  ▼ [카메라 추적]
  ├── map.panTo() — 캐릭터 중심으로 카메라 부드럽게 슬라이딩
  └── Three.js 캐릭터 Walk 애니메이션 재생
  │
  ▼ [Supabase Realtime 브로드캐스트]
  ├── 현재 섹터 채널에 {user_id, lng, lat, bearing} 발행
  └── 주변 유저 클라이언트가 수신 → 상대 캐릭터 위치 갱신
  │
  ▼ [50m 이동마다 비동기 Prune]
  ├── 반경 450m 외곽 Three.js 오브젝트 dispose()
  ├── Mapbox 타일 자원 Unload
  └── 백엔드 샘플링 검증 (10회 중 1회 좌표 재검증)
```

---

## 2. 결제 트랜잭션 파이프라인

```
유저 [아바타 구매] 버튼 클릭
  │
  ▼ [주문 UUID 생성 — 멱등성 키]
  ├── 백엔드 Edge Function: 고유 주문 UUID 생성
  ├── orders 테이블에 status='PENDING' 레코드 삽입
  └── 해당 UUID를 PG사 API에 전달
  │
  ▼ [PG사 결제창 호출 (카카오페이 / 토스페이먼츠)]
  │  유저가 결제 완료 또는 취소
  │
  ▼ [PG 웹훅 수신 — Edge Function]
  ├── 동일 주문 UUID가 이미 PAID인지 확인 (중복 웹훅 방어)
  ├── status → 'PAID' 업데이트
  └── 캐릭터 생성 이벤트를 비동기 큐에 투입
  │
  ▼ [캐릭터 발급 — 비동기]
  ├── appearance_hash 중복 체크 (SELECT FOR UPDATE 락)
  ├── 중복 시 재조합, 통과 시 characters 테이블 INSERT
  ├── Supabase Storage에 GLB 에셋 업로드
  └── 클라이언트 폴링 → 발급 완료 연출
  │
  ▼ [발급 실패 시 자동 롤백]
  ├── orders.status → 'FAILED'
  ├── PG사 취소 API 자동 호출 → 원화 환불
  └── CS 로그 테이블에 원자적 적재 [user_id, order_id, error]
```

---

## 3. 광고 노출 파이프라인

```
유저 캐릭터 이동 (50m마다 트리거 또는 실시간)
  │
  ▼ [PostGIS 공간 쿼리 — Edge Function]
  ├── ST_DWithin: 반경 내 활성 스폰서 랜드마크 조회
  └── 결과: {building_id, texture_url, dist_m}[]
  │
  ▼ [클라이언트 렌더링]
  ├── 전방 350~400m 지점 랜드마크 에셋 비동기 프리로드
  ├── 가시거리 경계선 도달 전 GLB + 텍스처 메모리 적재 완료
  └── Three.js TextureLoader → 랜드마크 GLB UV에 브랜드 로고 1:1 매핑
  │
  ▼ [유효 노출 판정]
  ├── 쿼터뷰 뷰포트 내 바운딩 박스 완전 진입 여부 확인
  ├── 1초 이상 유지 시에만 백엔드로 '노출 +1' 신호 전송
  └── ad_impressions 테이블 INSERT
  │
  ▼ [무료 유저 호기심 유도]
  ├── 가시거리 경계(35m 지점) 스폰서 랜드마크 실루엣 표시
  └── Glow/Emission 효과로 안개 너머 브랜드 칼라 번짐 연출
```

---

## 4. 음성 세션 체결 파이프라인

```
유저 A 이동 → PostGIS ST_DWithin 감지 → 유저 B가 30m 이내 진입
  │
  ▼ [근접 신호 → Supabase Realtime 채널 포워딩]
  ├── A, B 양측 클라이언트에 {peer_user_id} 근접 신호 전달
  └── 각 클라이언트가 LiveKit 룸 토큰 요청 Edge Function 호출
  │
  ▼ [LiveKit Cloud 룸 조인]
  ├── 동일 룸 ID로 A, B 모두 조인
  ├── SFU 연결 LiveKit Cloud가 자동 체결 (NAT/방화벽 TURN 포함)
  └── 화면 상단 "근접 음성 구역 진입" 토스트 1.5초 노출
  │
  ▼ [공간 음성 적용]
  ├── 거리 기반 볼륨 감쇠: 가까울수록 크게, 안개 경계선 근처일수록 소멸
  └── 3D 패닝: 상대 캐릭터 위치 → PannerNode 실시간 갱신
  │
  ▼ [세션 파기 — 40m 이탈 시]
  ├── Room.disconnect() 즉시 호출
  ├── 오디오 컨텍스트 null 처리 (메모리 누수 차단)
  └── 구독 슬롯 반환 → 더 가까운 신규 유저로 교체
```

---

## 관련 문서

- [아키텍처 개요](./overview.md)
- [데이터 모델](./data-model.md)
- [ADR 003 — LiveKit](../adr/003-livekit-cloud-sfu.md)
- [ADR 005 — PostGIS](../adr/005-postgis-gist-index.md)

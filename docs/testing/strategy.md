# 테스트 전략

---

## Phase별 완료 기준

각 Phase는 아래 검증 기준을 통과해야 완료로 처리한다.

| Phase | 완료 기준 | 검증 방법 |
|---|---|---|
| Phase 1 | 로그인→인게임 화면 전환 완성, HUD 렌더링 정상 | 모바일·PC 수동 확인 + `npm run type-check` 오류 없음 |
| Phase 2 | Realtime 위치 동기화 지연 500ms 이하 | 브라우저 2탭 Realtime 채널 e2e 측정 |
| Phase 3 | `ST_DWithin` 반경 쿼리 10ms 이하 | pgbench 단일 쿼리 벤치마크 |
| Phase 4 | LiveKit 룸 조인 2초 이내 | 2탭 수동 테스트 + 콘솔 타임스탬프 |
| Phase 5 | 가시거리 라이선스 발급 5초 이내 | 토스페이먼츠 테스트 환경 E2E |
| Phase 6 | pg_cron 광고 스케줄러 익일 실행 | Supabase 대시보드 pg_cron 로그 |
| Phase 7 | 동접 200명 p99 1초 이하, 에러율 0.1% 이하 | k6 부하 테스트 |

---

## 단위 테스트 대상

### `lib/` — 클라이언트 로직

| 파일 | 테스트 케이스 |
|---|---|
| `lib/geo/validator.ts` | 시속 30km 초과 좌표 드롭 / 정상 좌표 통과 |
| `lib/geo/sector.ts` | 섹터 경계 판별 / Pre-Join 임계값 50m 진입 감지 |
| `lib/payment/idempotency.ts` | 동일 UUID 재제출 시 중복 방어 |
| `lib/map/snap.ts` | 15m 이내 오솔길 스냅 / 15m 초과 미정렬 |
| `lib/three/prune.ts` | 반경 450m 외곽 오브젝트 `dispose()` 호출 여부 |
| `lib/auth/session.ts` | 만료 토큰 파싱 거부 / 갱신 성공 |

### `supabase/functions/` — Edge Functions

| 함수 | 테스트 케이스 |
|---|---|
| `payment-webhook` | 동일 `orderId` 재수신 → 200 `idempotent: true` 반환 |
| `payment-webhook` | `INSERT` 실패 → PG사 자동 취소 호출 + `cs_logs` 기록 |
| `spatial-query` | 반경 내 랜드마크만 반환 / 반경 외 랜드마크 제외 |
| `livekit-token` | 만료 토큰으로 재발급 요청 거부 |
| `impression-log` | 노출 시간 1초 미만 기록 차단 |

---

## 통합 테스트 시나리오

### 시나리오 1 — 로그인 플로우 (Phase 1)

1. 로그인 화면 접속 (`/login`)
2. 소셜 OAuth 버튼 클릭 → Supabase Auth 리다이렉트
3. 인증 완료 후 `/world` 자동 이동 확인
4. **합격 기준**: 인증 세션 수립 후 인게임 화면 정상 렌더링

### 시나리오 2 — 이동 + Realtime 동기화 (Phase 2)

1. 브라우저 탭 2개 열기 (유저 A, 유저 B)
2. 유저 A WASD 10m 이동
3. 유저 B 화면에서 유저 A 위치 갱신 확인
4. **합격 기준**: 갱신 지연 500ms 이하

### 시나리오 3 — 결제 파이프라인 E2E (Phase 5)

1. 테스트 환경에서 아바타 2,200원 구매
2. 토스페이먼츠 테스트 카드 결제 승인
3. `orders.status = 'PAID'` 전환 확인
4. `characters` 신규 레코드 생성 확인
5. 동일 `orderId` 웹훅 재전송 → 200 `idempotent: true` 응답 확인

### 시나리오 4 — 음성 자동 연결·파기 (Phase 4)

1. 유저 A, B가 35m 거리에서 시작
2. 유저 A가 접근 → 30m 진입 시 LiveKit 룸 조인 확인
3. 유저 A가 후퇴 → 40m 이탈 시 자동 `disconnect` 확인

### 시나리오 5 — Fog of War + 라이선스 확장 (Phase 5)

1. 무료 유저 기본 가시거리 20~30m 확인
2. 35m 지점 스폰서 랜드마크 실루엣 노출 확인
3. 라이선스 구매 후 가시거리 100m 즉시 확장 (0.1초 이내) 확인
4. JWT Payload `visibility_radius_m` 업데이트 확인

---

## Phase 7 부하 테스트

### 도구: k6

```javascript
// k6 시나리오 뼈대 — 동접 200명
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 200,
  duration: '5m',
};

export default function () {
  const res = http.get(`${__ENV.APP_URL}/api/health`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### 합격 기준

| 항목 | 기준 |
|---|---|
| p99 응답 시간 | 1초 이하 |
| 에러율 | 0.1% 이하 |
| Supabase Realtime 동시 연결 | 500 이하 (Pro 한도) |
| Mapbox 타일 요청 | 20만 건/월 이하 |
| LiveKit 동시 음성 세션 | 무료 티어 한도 이내 |

### 사전 체크리스트

- [ ] `sponsor_buildings` GiST 인덱스 존재 확인 (`\d sponsor_buildings`)
- [ ] `channel.unsubscribe()` 로직 전체 경로 점검
- [ ] Three.js Prune (반경 450m, 50m 트리거) 동작 확인
- [ ] LiveKit Top-8 Capping 동작 확인
- [ ] 결제 웹훅 멱등성 중복 방어 확인

---

## 관련 문서

- [로드맵 — Phase별 목표](../roadmap.md)
- [백엔드 컨벤션 — 멱등성 보장](../backend/conventions.md)
- [아키텍처 개요 — 핵심 아키텍처 상수](../architecture/overview.md)
- [ADR 003 — LiveKit Capping](../adr/003-livekit-cloud-sfu.md)

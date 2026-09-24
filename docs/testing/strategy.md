# 테스트 전략

---

## Phase별 완료 기준

각 Phase는 아래 검증 기준을 통과해야 완료로 처리한다.

| Phase | 완료 기준 | 검증 방법 | 상태 |
|---|---|---|---|
| Phase 1 | 로그인→대시보드 화면 전환 완성, HUD 렌더링 정상 | 모바일·PC 수동 확인 + `npm run type-check` 오류 없음 | 완료 |
| Phase 2 | socket.io 섹터 위치 동기화 지연 500ms 이하, 속도 초과 패킷 서버 드롭 | 브라우저 2탭 소켓 e2e 측정 | 완료 |
| Phase 3 | LiveKit 룸 조인 2초 이내, 40m 이탈 시 즉시 disconnect | 2탭 수동 테스트 + 콘솔 타임스탬프 | 완료 |
| Phase 4 | 결제 완료 후 아바타 발급 5초 이내, 실패 시 3초 이내 취소 | 토스페이먼츠 테스트 환경 E2E | 완료 |
| Phase 5 | `ST_DWithin` 반경 쿼리 10ms 이하, pg_cron 광고 스케줄러 익일 실행, 광고주 테넌시 격리 | pgbench 벤치마크 + pg_cron 로그 + RLS 접근 테스트 | 예정 |
| Phase 6 | 동접 200명 p99 1초 이하, 에러율 0.1% 이하 | k6 부하 테스트 | 예정 |

---

## 단위 테스트 대상

### `lib/` — 클라이언트 로직

| 파일 | 테스트 케이스 |
|---|---|
| `lib/geo/validator.ts` | 씬 좌표 이동 속도 초과 드롭 / 정상 좌표 통과 |
| `lib/geo/sector.ts` | 섹터 경계 판별 / Pre-Join 임계값 50m 진입 감지 |
| `lib/map/snap.ts` | 반경 15m 이내 길 선분의 최근접점으로 보정 / 15m 밖이거나 길 피처가 없으면 원좌표 유지 / 길이 아닌 선형 피처 무시 |
| `lib/three/prune.ts` | 반경 450m 외곽 오브젝트 `dispose()` 호출 여부 |
| `lib/auth/session.ts` | 만료 토큰 파싱 거부 / 리프레시 성공 |
| `lib/voice/spatial-audio.ts` | 거리 기반 볼륨 감쇠 / 3D 패닝 파라미터 산출 |

### `apps/api/src/` — NestJS API 서버

| 대상 | 테스트 케이스 |
|---|---|
| `auth.service` | 이메일+비밀번호 검증 / bcrypt 해싱 / `token_version` 폐기 / OAuth 코드 교환 |
| `billing`(controller/service) | 웹훅 서명 검증 / 주문 생성 |
| `billing/fulfillment` | 동일 승인번호 재수신 → DB 제약(`orders_pg_approval_uniq`)으로 1회만 발급 / INSERT 실패 → PG사 자동 취소 |
| `world.gateway` | 섹터 판정 / 시속 30km 초과 패킷 서버 드롭 / 섹터 단위 묶음 브로드캐스트 |
| `voice`(controller) | 룸 토큰 발급 / 만료 토큰 재발급 요청 거부 |
| `avatars`(공간 쿼리) | 미니맵 반경 내 랜드마크만 반환 / 반경 외 제외 / 1초 미만 노출 기록 차단 |

---

## 통합 테스트 시나리오

### 시나리오 1 — 로그인 플로우 (Phase 1)

1. 로그인 화면 접속 (`/login`)
2. 이메일+비밀번호 로그인 또는 카카오/구글 OAuth 버튼 클릭
3. 인증 완료 후 `/dashboard` 자동 이동 확인
4. **합격 기준**: 인증 세션 수립 후 인게임 대시보드 정상 렌더링

### 시나리오 2 — 이동 + 실시간 동기화 (Phase 2)

1. 브라우저 탭 2개 열기 (유저 A, 유저 B)
2. 유저 A WASD 10m 이동
3. 유저 B 화면에서 유저 A 위치 갱신 확인
4. **합격 기준**: 갱신 지연 500ms 이하, 속도 초과 패킷 서버 드롭

### 시나리오 3 — 음성 자동 연결·파기 (Phase 3)

1. 유저 A, B가 35m 거리에서 시작
2. 유저 A가 접근 → 30m 진입 시 LiveKit 룸 조인 확인
3. 유저 A가 후퇴 → 40m 이탈 시 자동 `disconnect` 확인

### 시나리오 4 — 결제 파이프라인 E2E (Phase 4)

1. 테스트 환경에서 아바타 2,200원 구매
2. 토스페이먼츠 테스트 카드 결제 승인
3. `orders.status = 'PAID'` 전환 확인
4. `characters` 신규 레코드 생성 확인
5. 동일 승인번호 웹훅 재전송 → DB 제약으로 중복 발급 없음 확인

### 시나리오 5 — 씬 뷰 디스턴스 안개 + 라이선스 확장 (Phase 4)

1. 무료 유저 기본 씬 뷰 디스턴스 20~30m 확인
2. 35m 지점 스폰서 랜드마크 실루엣 노출 확인
3. 라이선스 구매 후 씬 뷰 디스턴스 100m 즉시 확장 (0.1초 이내) 확인
4. JWT Payload `visibility_radius_m` 업데이트 확인

### 시나리오 6 — B2B 광고 + 테넌시 격리 (Phase 5)

1. 광고주 A가 포탈에서 랜드마크 좌표 등록 + 결제
2. 익일 pg_cron 스케줄러 실행 후 텍스처 자동 교체 확인
3. 광고주 B 계정으로 광고주 A의 구좌 접근 시도 → RLS 차단 확인
4. 1초 이상 완전 진입 노출만 `ad_impressions` 기록 확인

---

## Phase 6 부하 테스트

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
| socket.io 동시 연결 | 서버 용량 내 (섹터 묶음 브로드캐스트 부하 기준) |
| Mapbox 타일 요청 | 20만 건/월 이하 |
| LiveKit 동시 음성 세션 | 무료 티어 한도 이내 |

### 사전 체크리스트

- [ ] `sponsor_buildings` GiST 인덱스 존재 확인 (`\d sponsor_buildings`)
- [ ] 섹터 이탈 시 구 섹터 룸 leave 로직 전체 경로 점검
- [ ] Three.js Prune (반경 450m, 50m 트리거) 동작 확인
- [ ] LiveKit Top-8 Capping 동작 확인
- [ ] 결제 웹훅 DB 제약 멱등성 중복 방어 확인

---

## 관련 문서

- [로드맵 — Phase별 목표](../roadmap.md)
- [백엔드 컨벤션 — 멱등성 보장](../backend/conventions.md)
- [아키텍처 개요 — 핵심 아키텍처 상수](../architecture/overview.md)
- [ADR 003 — LiveKit Capping](../adr/003-livekit-cloud-sfu.md)

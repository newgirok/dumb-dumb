# 테스트 전략

---

## Phase별 완료 기준

각 Phase는 아래 검증 기준을 통과해야 완료로 처리한다.

| Phase | 완료 기준 | 검증 방법 | 상태 |
|---|---|---|---|
| Phase 1 | 이메일+비밀번호·OAuth 로그인 후 `/dashboard` 진입 | 모바일·PC 수동 확인 + `npm run type-check` 오류 없음 | 완료 |
| Phase 2 | 루트 3D 씬 로딩·인트로 정상, 대시보드 월드 socket.io 섹터 위치 동기화 지연 500ms 이하, 속도 초과 패킷 서버 드롭 | 브라우저 수동 확인 + 2탭 소켓 e2e 측정 | 완료 |
| Phase 3 | 마이크 옵트인 후 같은 섹터 두 기기가 30m 이내에서 음성 송수신, 40m 이탈 시 오디오 구독 해제 | 2기기 수동 테스트 + 콘솔 타임스탬프 | 진행 중 |
| Phase 4 | 결제 승인 후 아바타 발급 5초 이내, 동일 외형 중복 발급 차단, 지급 최종 실패 시 3초 이내 PG사 자동 취소 | 서명한 승인 웹훅 E2E → PG 결제창 연동 후 토스페이먼츠 테스트 환경 E2E | 진행 중 |
| Phase 5 | `ST_DWithin` 반경 쿼리 10ms 이하, pg_cron 광고 스케줄러 익일 실행, 광고주 테넌시 격리, 라이선스 지급 후 씬 뷰 디스턴스 확장, 섹터 채팅 말풍선 표시 | pgbench 벤치마크 + pg_cron 로그 + RLS 접근 테스트 + 2탭 수동 확인 | 예정 |
| Phase 6 | 동접 200명 p99 1초 이하, 에러율 0.1% 이하 | k6 부하 테스트 | 예정 |

---

## 단위 테스트 대상

저장소에는 아직 테스트 러너가 설정되어 있지 않다. 아래는 테스트 러너를 붙일 때 우선 작성할 대상이다.

### 클라이언트 로직 — `shared/`·`lib/`·`app/summer-afternoon/`

| 파일 | 테스트 케이스 |
|---|---|
| `shared/world/sector.ts` | 위도별 경도 폭으로 섹터 ID 산출 / 경계 50m 이내면 인접 섹터 포함(`requiredSectors`) / haversine 거리 / 30km/h 초과·시간 역행 이동 거부(`isPlausibleMove`) |
| `lib/geo/validator.ts` | 위경도 이동 속도 30km/h 초과 드롭 / 정상 이동 통과 / 시간 역행(dt ≤ 0) 드롭 |
| `lib/map/snap.ts` | 반경 15m 이내 길 선분의 최근접점으로 보정 / 15m 밖이거나 길 피처가 없으면 원좌표 유지 / 길이 아닌 선형 피처 무시 |
| `lib/three/prune.ts` | 50m 미만 이동 시 미실행 / 50m 이동마다 반경 450m 밖 피어 오브젝트 `dispose()`·씬 제거 / 위치 정보(`userData.lng/lat`) 없는 오브젝트 유지 |
| `lib/auth/session.ts` | 동시 `refresh()` 호출이 요청 1건으로 합쳐짐 / 리프레시 성공 시 액세스 토큰 메모리 보관·실패 시 `null` / `currentUser()`가 payload(`sub`·`email`·`role`) 파싱, 토큰 없거나 깨지면 `null` |
| `lib/voice/livekit.ts` | 40m 이내 거리순 상위 8명만 오디오 구독 / 40m 밖·9번째 이후 구독 해제 |
| `lib/voice/spatial-audio.ts` | 30m 이내 풀볼륨 / 30~40m 선형 감쇠 / 40m 이상 묵음 / 방위각 → PannerNode 좌표(x = sin, z = −cos) 산출 |
| `app/summer-afternoon/thirdPerson.ts` | 벽·0.6m 초과 단차 앞 이동 차단 / 점프 중 단차 등반 / 카메라 앙각 9.866° 유지(인트로 줌 포함) / 벽 충돌 시 카메라 반경 축소(최소 1m) |

### `apps/api/src/` — NestJS API 서버

| 대상 | 테스트 케이스 |
|---|---|
| `auth.service` | 이메일+비밀번호 검증 / bcrypt 해싱 / 리프레시 토큰 `ver`가 `token_version`과 다르면 폐기 / OAuth 코드 교환(`OauthService.exchangeCode`) |
| `billing`(controller/service) | 웹훅 HMAC 서명 검증(`x-pg-signature`, 길이 불일치 거부) / 주문 금액 서버 결정 / 동일 승인번호 재수신 시 상태 미변경(`orders_pg_approval_uniq`) |
| `billing/fulfillment` | 동시 조회 시 `FOR UPDATE SKIP LOCKED`로 같은 주문을 겹쳐 집지 않음 / 잠금이 풀린 뒤 다시 집힌 주문도 UNIQUE·`GREATEST`로 중복 발급 없음 / 아바타 상품은 수량만큼 발급·라이선스 상품은 가시거리 `GREATEST` 갱신 / 지급 실패 건 다음 폴링에서 재처리 |
| `avatars` | 외형 충돌(23505) 시 재추첨(최대 8회) / `(order_id, order_seq)` 중복 발급은 거부하고 `null` 반환 / 시리얼 `OW-` + 8자리 |
| `world.gateway` | 액세스 토큰 없는·무효 연결 끊기 / 시속 30km 초과 패킷 서버 드롭 / 섹터 변경 시 룸 join·leave / 200ms 섹터 단위 묶음 브로드캐스트(2명 이상) / 30초 무갱신 위치 상태 정리(소켓 유지) / 채팅 200자 제한 |
| `voice`(controller) | 룸 이름 형식(`voice-sector-{x}-{y}`) 검증 / 액세스 토큰 없는 요청 거부(전역 가드) / identity가 유저 id인 토큰 발급 |

---

## 통합 테스트 시나리오

### 시나리오 1 — 로그인 플로우 (Phase 1)

1. 로그인 화면 접속 (`/login`)
2. 이메일+비밀번호 로그인 또는 카카오/구글 OAuth 버튼 클릭
3. 인증 완료 후 `/dashboard` 자동 이동 확인 (OAuth 실패 시 `/login?error=`)
4. **합격 기준**: 인증 세션 수립 후 대시보드 월드 정상 렌더링

### 시나리오 2 — 루트 3D 씬 (Phase 2)

1. 로그인 없이 루트(`/`) 접속
2. 로딩 화면 → 인트로 전환(4초)·카메라 돌리(6초) 동시 시작, 시작 직후부터 조작 가능 확인
3. WASD·방향키·마우스 가상 조이스틱으로 이동, 스페이스로 점프
4. 인트로 리빌 뒤 5시 미니맵에 GPS 위치 표시 확인
5. **합격 기준**: API·소켓 연결 없이 씬·조작·미니맵 정상 동작

### 시나리오 3 — 대시보드 월드 이동 + 실시간 동기화 (Phase 2)

1. 브라우저 탭 2개에서 각각 로그인 후 `/dashboard` 진입 (유저 A, 유저 B)
2. 유저 A WASD 10m 이동
3. 유저 B 화면에서 유저 A 위치 갱신 확인
4. **합격 기준**: 갱신 지연 500ms 이하, 속도 초과 패킷 서버 드롭

### 시나리오 4 — 음성 거리 기반 구독 (Phase 3)

1. 유저 A, B가 같은 섹터에서 35m 거리로 시작하고 마이크 옵트인
2. 유저 A가 접근 → 30m 이내에서 서로의 음성이 풀볼륨으로 들리는지 확인
3. 유저 A가 후퇴 → 40m 이탈 시 오디오 구독 해제(묵음) 확인

### 시나리오 5 — 결제 파이프라인 E2E (Phase 4)

1. 상점에서 아바타(2,200원) 주문 → `orders.status = 'PENDING'` 주문서 발행
2. 서명한 승인 웹훅(`POST /billing/webhook`, `x-pg-signature`) 전송 (PG 결제창 연동 후에는 토스페이먼츠 테스트 카드 결제 승인)
3. `orders.status = 'PAID'` 전환 확인
4. 워커가 `characters` 신규 레코드 발급 확인 (5초 이내)
5. 동일 승인번호 웹훅 재전송 → DB 제약으로 중복 발급 없음 확인

### 시나리오 6 — 가시거리 라이선스 (Phase 4)

1. 가입 직후 `GET /api/me/license` 25m 확인
2. 가시거리 300m 라이선스 지급 후 300m로 갱신 확인
3. 이어서 100m 라이선스를 지급해도 300m 유지 확인 (`GREATEST`)
4. 상점 가시거리 표시가 현재 반경과 일치하는지 확인

### 시나리오 7 — 씬 뷰 디스턴스 + 스폰서 실루엣 (Phase 5, 예정)

1. 무료 유저 기본 씬 뷰 디스턴스 확인
2. 35m 지점 스폰서 랜드마크 실루엣 노출 확인
3. 라이선스 지급 후 씬 뷰 디스턴스 100m 즉시 확장 (0.1초 이내) 확인

### 시나리오 8 — B2B 광고 + 테넌시 격리 (Phase 5, 예정)

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
| Mapbox 타일 요청 | 20만 건/월 이하 (미니맵 + 대시보드 월드) |
| LiveKit 동시 음성 세션 | 무료 티어 한도 이내 |

### 사전 체크리스트

- [ ] `sponsor_buildings` GiST 인덱스 존재 확인 (`\d sponsor_buildings`)
- [ ] 섹터 이탈 시 이전 섹터 룸 leave 로직 전체 경로 점검
- [ ] Three.js Prune (반경 450m, 50m 트리거) 동작 확인
- [ ] LiveKit Top-8 Capping 동작 확인
- [ ] 결제 웹훅 DB 제약 멱등성 중복 방어 확인

---

## 관련 문서

- [로드맵 — Phase별 목표](../roadmap.md)
- [백엔드 컨벤션 — 멱등성 보장](../backend/conventions.md)
- [아키텍처 개요 — 핵심 아키텍처 상수](../architecture/overview.md)
- [ADR 003 — LiveKit Capping](../adr/003-livekit-cloud-sfu.md)

# 개발 로드맵

> 기반 문서: docs/prd.md, docs/architecture/overview.md  
> 원칙: 각 Phase의 완료 기준을 충족해야 다음 Phase로 진행한다.

---

## 진행 현황

- [x] **Phase 0** — 프로젝트 초기화 및 인프라 셋업
- [x] **Phase 1** — UI/UX 기반 구축
- [ ] **Phase 2** — 단일 섹터 이동 + 실시간 위치 동기화
- [ ] **Phase 3** — 멀티 섹터 + PostGIS 영구 저장
- [ ] **Phase 4** — LiveKit Cloud 공간 음성
- [ ] **Phase 5** — B2B 스폰서십 광고 + Fog of War 연동
- [ ] **Phase 6** — 인앱 결제 + 가시거리 라이선스
- [ ] **Phase 7** — 상용화 및 프로덕션 안정화

---

## Phase 0 — 프로젝트 초기화 및 인프라 셋업

> 코드 작성 전 로컬 개발 환경과 클라우드 인프라를 완전히 갖춘다.

- **P0-1.** Next.js 프로젝트 초기화 `[Infra]`
  - `package.json` — Next.js 15, Mapbox GL JS v3, Three.js, Supabase JS SDK, LiveKit 의존성 정의
  - `next.config.ts` — Mapbox GL JS webpack alias 처리
  - `.env.example` — 전체 환경변수 템플릿
  - 검증
    - `npm install` 성공
    - `npm run type-check` 오류 없음

- **P0-2.** Supabase 로컬 개발 환경 구성 `[DB]`
  - `supabase/config.toml` — Supabase CLI 로컬 설정
  - 마이그레이션 SQL 4개 작성
    - `0001_init.sql` — PostGIS, pg_cron, pgcrypto 확장 활성화
    - `0002_characters.sql` — `characters`, `orders`, `user_licenses` 테이블 + 신규 유저 트리거
    - `0003_sponsor.sql` — `sponsor_buildings` + GiST 공간 인덱스 + pg_cron 스케줄러
    - `0004_impressions.sql` — `ad_impressions` 테이블
  - 검증
    - `supabase start` 성공
    - `supabase db push` 마이그레이션 4개 적용 완료

- **P0-3.** 클라우드 인프라 연결 `[Infra]`
  - Supabase Cloud 프로젝트 생성 (ap-northeast-2, Seoul)
  - Vercel 프로젝트 생성 + GitHub 연결 + 클라이언트 환경변수 등록
  - LiveKit Cloud 프로젝트 생성 (ap-northeast-1)
  - `supabase link --project-ref <id>` + Supabase Secrets 등록
  - 검증
    - `npm run dev` 정상 기동
    - Vercel Preview 배포 성공

**완료 기준**
- [x] 로컬 `supabase start` → `supabase db push` 마이그레이션 4개 적용 완료
- [x] `npm run dev` 정상 기동
- [x] Vercel Preview 배포 성공

---

## Phase 1 — UI/UX 기반 구축

> 인게임 진입 전 인증 플로우와 HUD를 완성하고, 이후 모든 Phase에서 재사용할 공통 컴포넌트 시스템을 확립한다.

- **P1-1.** 인증 플로우 `[FE]`
  - `(auth)` 라우트 — 이메일 OTP + 소셜 OAuth (카카오·구글) 로그인 (Spot 스타일 58/42 스플릿 레이아웃)
  - `middleware.ts` — 미인증 시 `/login` 리다이렉트
  - 검증
    - 이메일 OTP 및 OAuth 로그인 후 `/world` 리다이렉트 성공

- **P1-2.** HUD 컴포넌트 `[FE]`
  - `components/hud/` — PC 방향키 UI, 모바일 조이스틱, 채팅 입력창
  - PC(WASD) / 모바일(조이스틱) 입력 모드 반응형 전환
  - 검증
    - 모바일·PC 각각 HUD 정상 렌더링

- **P1-3.** 공통 컴포넌트 시스템 `[FE]`
  - `components/ui/` — 버튼, 카드, 토스트, 로딩 스피너
  - `components/avatar/` — 아바타 선택·미리보기 카드 (Phase 6 결제 플로우 연결 예정)
  - 로딩·에러·빈 상태 처리 패턴 확립
  - 검증
    - `npm run type-check` 오류 없음

**완료 기준**
- [x] 로그인 → `/world` 인게임 화면 전환 완성
- [x] 모바일·PC HUD 정상 렌더링
- [x] `npm run type-check` 오류 없음

---

## Phase 2 — 단일 섹터 이동 + 실시간 위치 동기화

> 브라우저에서 캐릭터를 Mapbox 지도 위에 올리고, 두 유저가 서로의 위치를 실시간으로 보는 것.

- **P2-1.** Mapbox + Three.js WebGL 컨텍스트 공유 `[Map][3D]`
  - Next.js CSR 모드에서 Mapbox GL JS v3 초기화
  - Three.js 레이어 공유 컨텍스트 마운트 ([ADR 001](./adr/001-webgl-context-sharing.md))
  - 검증
    - 지도 타일 정상 렌더링, 단일 `<canvas>` 확인

- **P2-2.** 로우폴리 캐릭터 렌더링 `[3D]`
  - Three.js 기본 로우폴리 GLB 캐릭터 렌더링
  - 쿼터뷰 카메라 고정 (Pitch 45°, Bearing 45°) + Camera Hijack 잠금 ([ADR 007](./adr/007-quarter-view-camera-lock.md))
  - 1단계 기본 가시거리 안개 (반경 20m CSS Vignette)
  - 검증
    - 캐릭터 렌더링 확인, 카메라 드래그·줌 차단 확인

- **P2-3.** WASD 이동 + 도로 스냅 `[FE]`
  - 키보드 WASD 이동 구현
  - 도로 스냅(Snap-to-Road) 기본 구현 (15m 이내 도보 도로 자석 정렬)
  - 검증
    - 캐릭터 이동 및 도로 스냅 동작 확인

- **P2-4.** Supabase Realtime 위치 동기화 `[BE]`
  - Supabase Realtime 채널을 통한 위치 좌표 브로드캐스트 (DB 저장 없음)
  - 검증
    - 두 브라우저 창에서 상대 위치 지연 500ms 이하 동기화

**완료 기준**
- [ ] 두 브라우저 창에서 각자 캐릭터를 이동할 때 상대 위치가 지연 500ms 이하로 동기화

---

## Phase 3 — 멀티 섹터 + PostGIS 영구 저장

> 이동 반경을 도시 전체로 확장하고 공간 데이터를 DB에 영구 저장.

- **P3-1.** PostGIS 공간 쿼리 `[DB]`
  - `ST_DWithin`을 이용한 반경 내 스폰서 건물 감지 쿼리
  - GiST 인덱스 기반 성능 튜닝 ([ADR 005](./adr/005-postgis-gist-index.md))
  - 검증
    - 동일 맵 내 10개 스폰서 빌딩 감지 쿼리가 10ms 이하

- **P3-2.** 멀티 섹터 Pre-Join `[BE]`
  - 섹터 경계 Pre-Join 로직 (경계선 50m 전방 진입 시 다음 섹터 Realtime 채널 사전 구독)
  - 검증
    - 섹터 전환 시 끊김 없는 연속 구독 확인

- **P3-3.** 이동 검증 및 메모리 관리 `[FE]`
  - 가짜 이동 반경 락 (무료 유저 기준점 1km 이내 제한)
  - 클라이언트 GPS 속도 검증 (시속 30km 초과 패킷 드롭)
  - Three.js 반경 450m 바깥 오브젝트 Prune (50m 이동마다 비동기 GC)
  - 검증
    - 속도 초과 패킷 드롭 확인
    - 450m 외곽 오브젝트 정리 후 메모리 누수 없음

**완료 기준**
- [ ] 동일 맵 내 10개 스폰서 빌딩 감지 쿼리가 10ms 이하

---

## Phase 4 — LiveKit Cloud 공간 음성

> 근접한 두 유저가 말할 때 상대방 위치에서 소리가 들리는 공간 음성.

- **P4-1.** LiveKit 룸 토큰 발급 Edge Function `[BE]`
  - LiveKit Cloud SDK 통합 ([ADR 003](./adr/003-livekit-cloud-sfu.md))
  - 룸 토큰 발급 Edge Function
  - 검증
    - 토큰 발급 API 호출 성공

- **P4-2.** 거리 기반 음성 자동 연결 `[FE][BE]`
  - 반경 30m 진입 시 룸 자동 조인, 40m 이탈 시 즉시 disconnect
  - 거리 기반 볼륨 감쇠 파라미터 설정
  - 3D 오디오 패닝 (Web Audio API PannerNode)
  - Top-8 구독 Capping + 거리 순 Eviction 큐
  - 마이크 권한 옵트인 처리 (거부 시 수신만 활성화)
  - 검증
    - 두 기기에서 30m 이내 접근 시 음성 연결 2초 이내
    - 40m 이탈 시 즉시 연결 해제

**완료 기준**
- [ ] 두 기기에서 30m 이내 접근 시 음성 연결 2초 이내
- [ ] 40m 이탈 시 즉시 연결 해제

---

## Phase 5 — B2B 스폰서십 광고 + Fog of War 연동

> 광고주가 셀프 서비스로 특정 건물에 브랜드 텍스처를 매핑하고 노출 통계를 확인.

- **P5-1.** 광고주 어드민 포탈 `[FE][BE]`
  - 광고주 어드민 웹 포탈 (지도 위 건물 좌표 선택 + 이미지 업로드 + 원화 결제)
  - 검증
    - 어드민 포탈 정상 접근 및 건물 좌표 등록 성공

- **P5-2.** 브랜드 텍스처 매핑 `[3D]`
  - Three.js TextureLoader로 GLB 건물 간판 UV에 브랜드 로고 실시간 매핑
  - 유효 노출 카운팅 (1초 이상 뷰포트 내 완전 진입 시만 DB 기록)
  - 무료 유저 시야 경계(35m)에 스폰서 건물 실루엣 + Glow 효과
  - 검증
    - 브랜드 텍스처 지도 위 정상 렌더링 확인

- **P5-3.** pg_cron 광고 자동화 `[DB]`
  - pg_cron 자동 스케줄러 (매일 0시 광고 기간 자동 활성/비활성)
  - 이벤트 시즌 테마 전환 (Three.js `geometry/material/texture dispose()` 파이프라인)
  - 검증
    - 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 건물 텍스처 자동 교체

**완료 기준**
- [ ] 광고주 등록 완료 후 익일 새벽 스케줄러 실행 시 건물 텍스처 자동 교체

---

## Phase 6 — 인앱 결제 + 가시거리 라이선스

> 원화 결제로 유니크 아바타를 발급하고 가시거리 안개를 영구 확장.

- **P6-1.** PG 결제 웹훅 연동 `[BE]`
  - 토스페이먼츠 / 카카오페이 PG 웹훅 연동 Edge Function ([ADR 004](./adr/004-direct-krw-payment.md))
  - 멱등성 키(주문 UUID) 기반 중복 결제 방어
  - 결제 실패 시 PG사 자동 환불 롤백 + CS 로그 적재
  - 검증
    - 결제 완료 후 캐릭터 발급까지 5초 이내
    - 실패 시 3초 이내 자동 환불

- **P6-2.** 아바타 발급 파이프라인 `[BE]`
  - `characters` 테이블 `appearance_hash` 충돌 방지
  - 생성형 AI 외형 조합 비동기 큐 처리 ("주문 제작 중" 로딩 연출)
  - 검증
    - 동일 `appearance_hash` 중복 발급 차단 확인

- **P6-3.** 가시거리 라이선스 UI `[FE]`
  - JWT Payload에 가시거리 등급 인코딩 (Stateless 검증)
  - `components/store/` — 결제 모달, 상품 카드 UI
  - 가시거리 안개 CSS 반경 실시간 확장 연출 (0.1초 Transition)
  - 검증
    - 결제 완료 후 안개 반경 즉시 확장 확인

**완료 기준**
- [ ] 결제 완료 후 캐릭터 발급까지 5초 이내
- [ ] 실패 시 3초 이내 자동 환불

---

## Phase 7 — 상용화 및 프로덕션 안정화

> 실제 서비스 런칭을 위한 보안 강화, 부하 테스트, 비용 관리 자동화.

- **P7-1.** 보안 강화 `[Infra]`
  - Mapbox 토큰 도메인 락 + 모바일 Bundle ID 제한 적용
  - Mapbox·Supabase·LiveKit 3단계 과금 알림 설정
  - 안전 경고 팝업 법적 면책 검토
  - 검증
    - 허용 도메인 외 Mapbox 토큰 차단 확인

- **P7-2.** 부하 테스트 `[Infra]`
  - 동접 200명 기준 부하 테스트 (Realtime 브로드캐스트 + PostGIS 공간 쿼리)
  - 심야 시간대 (23:00~05:00) 실제 이동 모드 자동 잠금
  - Supabase Pro 플랜 기준 비용 시뮬레이션 (동접 500명 초과 시 대응 플랜)
  - 검증
    - 동접 200명 기준 위치 업데이트 p99 레이턴시 1초 이하
    - 월 비용 5만 원 이하 유지

**완료 기준**
- [ ] 동접 200명 기준 위치 업데이트 p99 레이턴시 1초 이하
- [ ] 월 비용 5만 원 이하 유지

---

## Phase 의존 관계

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
```

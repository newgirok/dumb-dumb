# ADR 002: Supabase 통합 백엔드 허브 채택

**상태:** Superseded by ADR 008

> 2026-09-11 — B2C 규모에서 Realtime 비용이 먼저 한계에 닿는다는 계산이 나오면서
> 자체 인프라로 전환했다. 사유는 ADR 008 참조.

## 결정

별도의 클라우드 서비스(별도 Redis, Kafka, 자체 WebSocket 서버, Auth 서버)를 개별로 연결·관리하는 대신, **Supabase Pro 플랜 단일 플랫폼**에 DB·인증·실시간 소켓·스토리지·Edge Functions를 통합하여 운영한다.

## 배경

1인 개발자가 여러 클라우드 서비스를 개별로 붙잡고 관리하면 다음과 같은 문제가 발생한다.

- **청구서 분산**: AWS RDS + ElastiCache + ECS + S3 + Cognito 조합이면 각 서비스 비용이 예측 불가
- **운영 공수**: 서비스별 IAM 권한, 네트워크 VPC, 업그레이드 주기를 모두 별도 관리
- **Local 재현 어려움**: 각 서비스 에뮬레이터를 개별로 설치·기동해야 함

## 근거

| 항목 | 개별 클라우드 조합 | Supabase 통합 |
|---|---|---|
| 월 고정비 | 예측 불가 ($50~$200+) | $25 고정 (Pro) |
| 운영 서비스 수 | 5~7개 | 1개 |
| 로컬 개발 | 에뮬레이터 5~7개 | `supabase start` 1개 명령 |
| PostGIS 공간 DB | 별도 설치 필요 | 기본 내장 |
| Realtime | 별도 Socket 서버 필요 | 기본 내장 |

Supabase Pro는 PostgreSQL + PostGIS + Auth + Realtime + Storage + Edge Functions를 단일 플랫폼으로 제공하며, 로컬 개발 환경도 `supabase start` 한 명령으로 동일 스택을 Docker 컨테이너로 기동할 수 있다.

## 적용 규칙

- Supabase Realtime: 위치 좌표 및 채팅 메시지 브로드캐스트 전담
- Supabase Edge Functions: 결제 웹훅, 공간 쿼리 위임 등 요청 단위 서버리스 로직
- Supabase Storage: `.glb` 캐릭터 에셋 저장, RLS 정책으로 무단 도용 차단
- Supabase Auth: 소셜 OAuth 2.0, JWT Access/Refresh Token 관리

## 주의

- Supabase Realtime 동시 연결 수 한도(Pro: 최대 500 concurrent)를 감안하여 Phase 6 동접 테스트 시 한도 초과 여부 검증 필요
- 초과 시 Realtime 구독 해제 조건(섹터 이탈, 450m 외곽 Prune)을 철저히 적용하여 연결 수 관리

## 관련

- [아키텍처 개요 — 기술 스택](../architecture/overview.md)
- [로컬 환경 세팅](../onboarding/local-setup.md)

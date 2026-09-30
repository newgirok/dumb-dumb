# Architecture Decision Records

주요 기술 결정과 그 근거를 기록합니다. 결정을 되돌리거나 변경할 때 이 문서를 먼저 참고하세요.

| ADR | 제목 | 상태 |
|---|---|---|
| [ADR 001](./001-webgl-context-sharing.md) | WebGL 컨텍스트 구성 — 플레이 씬·펼침 지도 분리, 맵 공유 | Accepted |
| [ADR 002](./002-self-hosted-backend.md) | 자체 백엔드 (NestJS + 공유 Postgres) | Accepted |
| [ADR 003](./003-direct-krw-payment.md) | 원화 직행 결제 — 가상 화폐 없는 구조 | Accepted |
| [ADR 004](./004-postgis-gist-index.md) | PostGIS + GiST 인덱스 공간 연산 | Accepted |
| [ADR 005](./005-fog-of-war-business-model.md) | 가시거리 안개를 BM과 연동하는 설계 | Accepted |
| [ADR 006](./006-quarter-view-camera-lock.md) | 카메라 잠금 — 3인칭 추적 · 맵 쿼터뷰 | Accepted |
| [ADR 007](./007-realtime-server-split.md) | 실시간 서버 분리 — socket.io 게이트웨이는 API 서버와 따로 둔다 | Accepted |
| [ADR 008](./008-interest-management-naming.md) | 실시간 이름 — 받는 사람을 고르는 방식(방·근접·섹터)으로 부른다 | Accepted |
| [ADR 009](./009-web-structure-and-naming.md) | 웹 구조와 이름 — app은 라우트만, 화면 코드는 features, 파일은 kebab-case | Accepted |
| [ADR 010](./010-db-migrations.md) | DB 마이그레이션 — apps/api/migrations에 두고 번호 순서대로 적용한다 | Accepted |

# ADR 003: LiveKit Cloud 매니지드 SFU 선택

**상태:** Accepted

## 결정

공간 음성(Spatial Voice)을 위해 자체 TURN 서버나 WebRTC Mesh P2P를 구축하는 대신, **LiveKit Cloud 매니지드 SFU**를 채택한다.

## 배경

유저가 근접했을 때 음성이 자동으로 연결되어야 하는 요구사항에서 두 가지 접근이 가능하다.

1. **WebRTC P2P Mesh**: 유저 간 직접 연결. n명이 모이면 n×(n-1)/2개의 Peer Connection이 필요해 클라이언트 CPU가 폭증하고, 방화벽·NAT 환경에서 연결 실패율이 30% 이상.
2. **SFU(Selective Forwarding Unit)**: 중앙 미디어 서버를 통해 모든 스트림을 중계. 클라이언트는 서버와만 연결하면 되어 n명 환경에서도 연결 수 O(n).

## 근거

| 항목 | 자체 WebRTC/TURN | LiveKit Cloud |
|---|---|---|
| NAT/방화벽 연결 성공률 | ~70% | 99.9% (SaaS 보장) |
| n명 확장 시 클라이언트 CPU | O(n²) | O(n) |
| 공간 음성(Spatial Audio) API | 직접 구현 필요 | SDK 내장 |
| 인프라 유지 관리 | 1인 개발자가 직접 | LiveKit Cloud 위임 |
| 비용 (초기) | EC2 TURN 서버 상시 과금 | 무료 티어 안에서 소진 |

LiveKit Cloud는 매월 일정량의 무료 분(分)을 제공하며, MVP 단계에서는 추가 과금 없이 운영 가능하다. 초과 시에도 사용한 분만큼만 종량 과금.

## 적용 규칙

- 씬 좌표 기준 30m 이내 진입 감지 → NestJS `voice` 모듈이 `livekit-server-sdk`로 룸 토큰 발급 → 클라이언트 룸 조인
- 40m 이탈 시 `Room.disconnect()` 즉시 호출 + 오디오 컨텍스트 `null` 처리
- 동시 구독 Top-8 Capping: 씬 좌표 거리순 정렬 후 상위 8명만 `setSubscribed(true)`
- 구독 교체 하이스테리시스: 8~10순위 사이 플래핑 방지 버퍼 적용
- 세션 최대 길이: 60분 후 자동 재연결 유도 (유휴 연결 분 소모 방지)

## LiveKit Cloud 과금 방어

- 대시보드 사용량 알림 3단계 설정 (50% / 80% / 100% 임계치)
- 음성 모드 옵트인 방식: 유저가 명시적으로 활성화할 때만 룸 조인

## 관련

- [아키텍처 개요 — LiveKit 인프라](../architecture/overview.md)
- [파이프라인 흐름 — 음성 세션 체결](../architecture/pipeline-flow.md)
- [모니터링 — LiveKit 과금 알림](../operations/monitoring.md)

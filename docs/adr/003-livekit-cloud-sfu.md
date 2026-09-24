# ADR 003: LiveKit Cloud 매니지드 SFU 선택

**상태:** Accepted

## 결정

공간 음성(Spatial Voice)을 위해 자체 TURN 서버나 WebRTC Mesh P2P를 구축하지 않고, **LiveKit Cloud 매니지드 SFU**를 채택한다. 음성은 대시보드 월드(`/dashboard`) 전용이며, 루트 3D 씬에는 음성이 없다.

## 배경

유저가 근접했을 때 음성이 자동으로 연결되어야 하는 요구사항에서 두 가지 접근이 가능하다.

1. **WebRTC P2P Mesh**: 유저 간 직접 연결. n명이 모이면 n×(n-1)/2개의 Peer Connection이 필요해 클라이언트 CPU가 폭증하고, 방화벽·NAT 환경에서 연결 실패율이 30% 이상.
2. **SFU(Selective Forwarding Unit)**: 중앙 미디어 서버를 통해 모든 스트림을 중계. 클라이언트는 서버와만 연결하면 되어 n명 환경에서도 연결 수 O(n).

## 근거

| 항목 | 자체 WebRTC/TURN | LiveKit Cloud |
|---|---|---|
| NAT/방화벽 연결 성공률 | ~70% | 99.9% (SaaS 보장) |
| n명 확장 시 클라이언트 CPU | O(n²) | O(n) |
| 구독 제어 | 피어 연결 단위로 직접 관리 | 트랙 단위 `setSubscribed`로 제어 |
| 인프라 유지 관리 | 1인 개발자가 직접 | LiveKit Cloud 위임 |
| 비용 (초기) | EC2 TURN 서버 상시 과금 | 무료 티어 안에서 소진 |

LiveKit Cloud는 매월 일정량의 무료 분(分)을 제공하며, MVP 단계에서는 추가 과금 없이 운영 가능하다. 초과 시에도 사용한 분만큼만 종량 과금.

## 적용 규칙

- **룸 = 섹터**: 500m 섹터마다 룸 하나(`voice-{sectorId}`, 형식 `voice-sector-{gx}-{gy}`). 대시보드 월드에서 캐릭터가 섹터를 옮기면 이전 룸을 나가고 새 섹터 룸에 접속한다(`lib/voice/livekit.ts` `VoiceManager`)
- **토큰 발급**: 클라이언트가 액세스 토큰으로 `POST /api/voice/token`을 호출하면 NestJS `voice` 모듈이 룸 이름 형식을 검증하고, `livekit-server-sdk`로 identity = 사용자 ID, 유효 1시간 토큰을 발급한다(`roomJoin`·`canPublish`·`canSubscribe`). identity는 클라이언트가 보내지 않는다
- **Top-8 구독**: `autoSubscribe: false`로 접속하고, 위치를 실제로 전송한 틱(200ms 주기 중 0.3m 이상 이동하고 속도 검증을 통과한 틱)마다 피어를 위경도 거리순으로 정렬해 40m 이내의 가장 가까운 8명만 `setSubscribed(true)`한다. 나머지는 구독을 끊는다. 제자리에 서 있는 동안에는 구독을 갱신하지 않는다
- **공간 음성**: Web Audio `PannerNode`(HRTF)에 피어 방위를 반영하고, 볼륨은 30m까지 최대, 40m에서 0이 되도록 선형 감쇠한다(`lib/voice/spatial-audio.ts`)
- **마이크**: 송출은 `enableMic()`로 켜는 옵트인이며, 권한을 거부하면 수신 전용으로 남는다. 마이크 켜기와 오디오 재개(`resumeAudio`)를 호출하는 UI는 아직 없다

## LiveKit Cloud 과금 방어

- 대시보드 사용량 알림 3단계 설정 (50% / 80% / 100% 임계치)
- 동시 구독을 가까운 8명으로 제한해 구독 분 소모를 묶는다

## 관련

- [아키텍처 개요 — 외부 서비스 의존성](../architecture/overview.md)
- [파이프라인 흐름 — 음성 세션 체결](../architecture/pipeline-flow.md)
- [모니터링 — LiveKit 과금 알림](../operations/monitoring.md)

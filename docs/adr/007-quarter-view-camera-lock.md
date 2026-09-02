# ADR 007: 쿼터뷰 카메라 매트릭스 강제 잠금

**상태:** Accepted

## 결정

카메라 Pitch(45~50°)와 Bearing(45°)을 코드 레벨에서 물리적으로 고정하고, 유저의 드래그·핀치·휠 스크롤에 의한 뷰 변경을 전면 차단한다.

## 배경

네비게이션 앱 방식(지도가 유저를 향해 회전)은 다음 두 가지 문제를 유발한다.

1. **멀미(Motion Sickness)**: 지도가 유저 이동 방향에 따라 뱅글뱅글 돌면 전정기관 자극으로 멀미 발생
2. **지도 데이터 낭비**: 유저가 임의로 줌아웃하거나 외곽을 탐색하면 Mapbox 타일 요청이 폭증하여 무료 티어 20만 건/월 소진

## 근거

| 항목 | 자유 뷰 | 카메라 잠금 |
|---|---|---|
| 멀미 리스크 | 있음 (회전 뷰) | 없음 (고정 45° 대각선) |
| Mapbox API 소모 | 유저가 마음대로 타일 요청 | 캐릭터 주변만 로드 |
| 캐릭터 소유감 | 낮음 (지도가 주체) | 높음 (나(캐릭터)가 주체) |
| UX 예측 가능성 | 낮음 | 높음 (항상 같은 시야) |

## 구현 — Camera Hijack

```typescript
map.on('move', () => {
  // 매 프레임마다 강제 리셋
  if (map.getPitch() !== 45 || map.getBearing() !== 45) {
    map.jumpTo({ pitch: 45, bearing: 45 });
  }
});

// 유저 입력 이벤트 전면 비활성화
map.dragPan.disable();
map.scrollZoom.disable();
map.touchZoomRotate.disable();
map.dragRotate.disable();
map.doubleClickZoom.disable();
```

## 모바일 자이로 센서 하네스

모바일 실제 이동 모드에서 나침반 센서가 흔들려 화면이 팽이처럼 도는 현상을 방어한다.

```typescript
let lastBearing = 45;

deviceOrientationHandler = (e: DeviceOrientationEvent) => {
  const newBearing = e.alpha ?? 45;
  const delta = Math.abs(newBearing - lastBearing);

  if (delta < 15) return; // 15° 이하 변위는 무시 (Deadzone)

  // 변화량이 클 경우 0.2초 Lerp 적용
  const lerped = lastBearing + (newBearing - lastBearing) * 0.1;
  map.easeTo({ bearing: lerped, duration: 200 });
  lastBearing = lerped;
};
```

## 줌 레벨 고정

유저가 휠을 돌려 줌아웃해도 캐릭터 주변 숲길 수준의 줌(16~17)을 유지한다.

```typescript
map.setMinZoom(16);
map.setMaxZoom(17);
```

## 관련

- [ADR 001 — WebGL 컨텍스트 공유](./001-webgl-context-sharing.md)
- [비즈니스 규칙 — 이동 제한 규칙](../product/business-rules.md)

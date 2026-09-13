# ADR 007: 3인칭 추적 카메라 + 미니맵 뷰 잠금

**상태:** Accepted

## 결정

메인 3D 씬은 캐릭터를 뒤에서 따라가는 **3인칭 추적 카메라(고정 Pitch·오프셋)**로 운용하고, 유저의 드래그·핀치·휠 스크롤에 의한 임의 뷰 변경을 차단한다. 5시 GIS 미니맵은 **유저 위치를 항상 중앙에 두는 추적 고정 뷰**로 두고, Mapbox의 드래그·줌·회전 조작을 전면 잠근다.

## 배경

카메라를 유저가 자유롭게 돌릴 수 있게 하면 다음 두 가지 문제가 발생한다.

1. **멀미(Motion Sickness)**: 이동 방향에 따라 뷰가 뱅글뱅글 돌면 전정기관 자극으로 멀미 발생
2. **일관성 붕괴**: 유저마다 제각각인 시야 각도는 UX 예측 가능성을 떨어뜨리고, 미니맵에서는 임의 줌아웃·팬으로 인해 Mapbox 타일 요청이 폭증(무료 티어 소진)한다

## 근거

| 항목 | 자유 뷰 | 카메라 잠금 |
|---|---|---|
| 멀미 리스크 | 있음 (회전 뷰) | 없음 (고정 각도 추적) |
| 미니맵 타일 소모 | 유저가 마음대로 타일 요청 | 유저 주변만 로드 |
| 캐릭터 소유감 | 낮음 (뷰가 주체) | 높음 (나(캐릭터)가 주체) |
| UX 예측 가능성 | 낮음 | 높음 (항상 같은 시야) |

## 구현 — 메인 씬 3인칭 추적 카메라

캐릭터 뒤 고정 오프셋에 카메라를 두고, 매 프레임 캐릭터 위치를 부드럽게 따라간다. Pitch는 고정하고 유저 입력에 의한 궤도 회전은 받지 않는다.

```typescript
const CAM_OFFSET = new THREE.Vector3(0, 6, 8); // 뒤·위 고정 오프셋

function updateCamera(character: THREE.Object3D) {
  const target = character.position.clone().add(CAM_OFFSET);
  camera.position.lerp(target, 0.1); // 0.1 Lerp로 추적
  camera.lookAt(character.position);
}
```

## 구현 — 미니맵 뷰 잠금

미니맵은 유저 위치를 중앙에 고정하고, 조작 핸들러를 모두 비활성화한다.

```typescript
// 유저 입력 이벤트 전면 비활성화 (미니맵 전용)
minimap.dragPan.disable();
minimap.scrollZoom.disable();
minimap.touchZoomRotate.disable();
minimap.dragRotate.disable();
minimap.doubleClickZoom.disable();

// 유저 GPS 위치를 항상 중앙에 유지
watchPosition(({ lon, lat }) => {
  minimap.setCenter([lon, lat]);
});
```

## 미니맵 줌 레벨 고정

유저가 임의로 줌아웃하지 못하도록 미니맵 줌을 근방 수준(16~17)으로 고정한다.

```typescript
minimap.setMinZoom(16);
minimap.setMaxZoom(17);
```

## 관련

- [ADR 001 — 메인 3D 씬과 GIS 미니맵의 WebGL 컨텍스트 분리](./001-webgl-context-sharing.md)
- [비즈니스 규칙 — 이동 제한 규칙](../product/business-rules.md)

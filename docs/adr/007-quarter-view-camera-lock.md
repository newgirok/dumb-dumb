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

카메라는 캐릭터의 **시선 목표점**(발 위 1.2m, 진행 방향 0.5m 앞)을 중심으로 한 구면 위에 선다. 반경 5.9m·앙각 9.866°로 고정되어, 캐릭터 뒤 약 5.3m·발끝 위 약 2.2m에서 항상 같은 각도로 내려다본다. 구현은 `app/summer-afternoon/thirdPerson.ts`에 있다.

| 요소 | 규칙 |
|---|---|
| 방위(요우) | 이동 방향을 따라 캐릭터 뒤로 자동 복귀한다(1.8/s, 최대 0.8rad/s, 정지 중 0.05배). 캐릭터가 카메라 쪽으로 걸어오면 돌지 않는다. 유저가 카메라를 직접 돌리는 입력은 받지 않는다 |
| 추적 | 목표 위치로 `lerp`(5/s)해 부드럽게 따라간다 |
| 벽 충돌 | 시선 목표점 → 카메라 광선이 collider에 막히면 반경을 줄인다(여유 0.4m, 최소 1m) |
| 인트로 | 반경 +12m에서 6초 easeInOutCubic으로 0까지 줄인다. 같은 광선 위를 움직이므로 인트로 내내 Pitch가 변하지 않으며, 인트로 동안은 추적 `lerp` 없이 돌리 위치에 바로 선다 |
| 대기 흔들림 | 카메라 위치는 고정하고 `lookAt` 이후 회전만 얹는다(요우·피치 0.08rad, 롤 0.02rad × 사인 노이즈, 속도 0.2). 인트로 시작 4초 뒤부터 4초에 걸쳐 켜진다 |
| 커서 패럴랙스 | 커서 위치에 비례해 요우 ±0.16rad·피치 ±0.06rad만큼 궤도를 기울인다. 위로 젖히는 쪽은 0.02rad까지만 허용해 지형 너머 바다가 전경에 드러나지 않게 한다. 대기 흔들림과 같은 시점에 켜진다 |

```typescript
const CAMERA_RADIUS = 5.9                                // 시선 목표점 기준 반경
const CAMERA_ELEVATION = THREE.MathUtils.degToRad(9.866) // 고정 앙각 = 내려다보는 Pitch

// 시선 목표점 — 발 위 1.2m, 진행 방향 0.5m 앞
lookAt.set(pos.x - toCam.x * 0.5, pos.y + 1.2, pos.z - toCam.z * 0.5)
dir.setFromSpherical(new THREE.Spherical(1, Math.PI / 2 - CAMERA_ELEVATION, camYaw))

// 벽 충돌로 줄인 반경에 인트로 줌을 더해 같은 광선 위에 세운다
const radius = cameraRadius(lookAt, dir, CAMERA_RADIUS) + introZoom
camera.position.lerp(desired.copy(lookAt).addScaledVector(dir, radius), Math.min(1, 5 * dt))

camera.lookAt(lookAt)
camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, swayYaw) // 대기 흔들림은 순수 회전
camera.rotateX(swayPitch)
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

# ADR 006: 카메라 잠금 — 3인칭 추적 · 맵 쿼터뷰

**상태:** Accepted

## 결정

유저가 카메라를 임의로 돌릴 수 없게 잠근다.

- **플레이 씬**: 캐릭터를 뒤에서 따라가는 **3인칭 추적 카메라(화면 비율로 정해지는 고정 구도)**로 운용한다. 드래그·핀치·휠 스크롤로 카메라를 조작하는 입력은 받지 않는다. 내 주변(베타)도 같은 컨트롤러라 카메라가 같다.
- **맵**(예정): Mapbox 카메라를 **pitch 45°·bearing 45° 쿼터뷰로 고정**하고 이동할 때마다 지도 중심을 캐릭터로 맞춘다. 유저 입력은 줌(14~20)만 받는다(휠·더블클릭 줌은 커서 기준이라 다음 이동 전까지 중심이 어긋날 수 있다).

## 배경

카메라를 유저가 자유롭게 돌릴 수 있게 하면 다음 두 가지 문제가 발생한다.

1. **멀미(Motion Sickness)**: 이동 방향에 따라 뷰가 뱅글뱅글 돌면 전정기관 자극으로 멀미 발생
2. **일관성 붕괴**: 유저마다 제각각인 시야 각도는 UX 예측 가능성을 떨어뜨리고, 맵에서는 임의 줌아웃·팬으로 인해 Mapbox 타일 요청이 폭증(무료 티어 소진)한다

## 근거

| 항목 | 자유 뷰 | 카메라 잠금 |
|---|---|---|
| 멀미 리스크 | 있음 (회전 뷰) | 없음 (고정 각도 추적) |
| 지도 타일 소모 | 유저가 마음대로 타일 요청 | 유저 주변만 로드 (맵 줌 14~20) |
| 캐릭터 소유감 | 낮음 (뷰가 주체) | 높음 (나(캐릭터)가 주체) |
| UX 예측 가능성 | 낮음 | 높음 (항상 같은 시야) |

## 구현 — 플레이 씬 3인칭 추적 카메라

카메라는 캐릭터의 **시선 목표점**(발 위 1.1m, 캐릭터 정면 0.5m)을 중심으로 한 구면 위에 선다. 화면 비율 16:9 이상에서는 원본 구도 — 세로 화각 45°, 반경 5.836m·앙각 9.866°(원본 `relativeCameraPosition (0, 1, -5.75)`) — 를 그대로 써서 캐릭터 뒤 약 5.25m·발끝 위 약 2.1m에서 항상 같은 각도로 내려다보고, 그보다 세로로 긴 화면은 반응형 구도(`framingFor`)를 따른다. 추적 수식·상수는 원본 `followCamera`를 그대로 따르며, 원본 상수가 60fps 한 프레임 기준이라 모든 `lerp` 비율은 실제 프레임 길이로 환산한다(`1 - (1 - k)^(dt×60)`). 구현은 `lib/three/third-person.ts`에 있고, 플레이 씬·내 주변이 같은 컨트롤러를 쓴다.

| 요소 | 규칙 |
|---|---|
| 반응형 구도 | `framingFor(aspect)` — 16:9 이상은 원본 구도 그대로다. 16:9에서 9:19.5로 좁아질수록(smoothstep) 화각을 넓히고(세로 45°→66°) 물러나 높이 올라가며(반경 ×1→×1.3, 앙각 +0°→+8°), 시선을 살짝 들어(0°→5°) 캐릭터를 화면 아래쪽에 둔다. 가장 긴 세로 화면에서 하늘·앞길·발밑이 대략 3분의 1씩 보인다 |
| 구도 따라가기 | 창 크기·회전으로 비율이 달라지면 화각·극각·시선각은 프레임당 0.05 비율로, 반경은 아래 줌 스무딩으로 따라간다. 컨트롤러가 `camera.aspect`를 보고 스스로 맞추므로 씬은 aspect만 갱신한다 |
| 방위(요우) | 2단 스무딩 — 목표 방위가 캐릭터 등 뒤로 프레임당 0.03 비율로 돌고(이동 입력이 없으면 0.025배), 실제 방위가 목표를 프레임당 0.075 비율로 따라간다. 캐릭터가 카메라 쪽으로 걸어오면 돌지 않는다. 좌우 키를 계속 누르면 캐릭터가 반경 약 2.5m 원을 그리며 카메라가 약 1.6rad/s로 돈다. 유저가 카메라를 직접 돌리는 입력은 받지 않는다 |
| 추적 | 시선 목표점이 캐릭터를 프레임당 0.15(휴대폰 0.175) 비율로 늦게 따라가고 카메라는 그 점에 붙어 선다(달리는 중에는 캐릭터 뒤 약 5.7m) |
| 클리핑 | near 1m·far 175m(원본). 카메라 1.5~2m 안의 면(캐릭터 제외)은 셰이더가 가로줄 디더로 솎아낸다 |
| 벽 충돌 | 시선 목표점 → 카메라 광선이 collider에 막히면 목표 반경을 맞은 거리의 90%로 줄이고(최소 캡슐 반경 × 1.25, 최대 구도 반경), 실제 반경은 프레임당 0.05 비율로 따라간다 |
| 인트로 | 구도 반경 +12m에서 6초 동안 원본 `inOut3`(cubic-bezier(0.6, 0, 0, 1))으로 0까지 줄인다. 같은 광선 위를 움직이므로 인트로 내내 Pitch가 변하지 않는다 |
| 대기 흔들림 | 카메라 위치는 두고 시선 방향만 돌린다(요우·피치 0.08rad, 롤 0.02rad × 사인 노이즈, 속도 0.2). 인트로 시작 4초 뒤부터 4초에 걸쳐(power2.inOut) 켜진다 |
| 커서 패럴랙스 | 커서 위치(±1) × π/2에 요우 -0.075·피치 -0.05를 곱한 만큼(최대 요우 ±0.118rad·피치 ±0.079rad) 시선 목표점을 중심으로 궤도를 돈다. 프레임당 0.035 비율로 따라가며, 대기 흔들림과 같은 시점에 켜진다. 터치는 첫 손가락 위치를 따르고 손을 떼면 절반 속도로 가운데로 돌아오며, 휴대폰은 위아래 패럴랙스가 없다 |
| 마우스 조이스틱 고정점 | 원본 고정점(가로 가운데, 화면 위에서 72.5%)을 구도가 달라진 만큼 캐릭터 발끝을 따라 옮긴다(16:9에서는 원본 값). 최대 세기 거리(원본 200px)는 짧은 변 × 0.23(90~200px)이다 |

```typescript
const CAMERA_DISTANCE = Math.hypot(1, 5.75)      // 시선 목표점 기준 반경 5.836m (16:9 이상)
const CAMERA_PHI = Math.acos(1 / CAMERA_DISTANCE) // 극각 80.134° = 앙각 9.866°
// 60fps 기준 프레임당 비율 k를 실제 프레임 길이(ratio = dt × 60)로 환산
const lerpCoef = (k: number, ratio: number) => 1 - Math.pow(1 - k, ratio)

// 반응형 구도 — 16:9 이상(k = 0)은 원본 구도, 9:19.5(k = 1)까지 매끄럽게 잇는다
function framingFor(aspect: number) {
  const k = 1 - THREE.MathUtils.smoothstep(aspect, 9 / 19.5, 16 / 9)
  const fov = THREE.MathUtils.lerp(45, 66, k)                        // 세로 화각
  const distance = CAMERA_DISTANCE * THREE.MathUtils.lerp(1, 1.3, k) // 반경
  const phi = CAMERA_PHI - THREE.MathUtils.degToRad(8) * k           // 앙각 +8°
  const tilt = THREE.MathUtils.degToRad(5) * k                       // 시선 들기
  // 마우스 조이스틱 고정점(원본 72.5%)은 구도가 달라진 만큼 발끝을 따라 옮긴다
  const mouseCenterY = 0.725 + feetScreenY(fov, distance, phi, tilt) - BASE_FEET_Y
  return { fov, distance, phi, tilt, mouseCenterY }
}

// 비율이 달라지면 그 비율의 구도를 잡고, 화각·극각·시선각이 프레임당 0.05 비율로 따라간다
if (camera.aspect !== framedAspect) framing = framingFor((framedAspect = camera.aspect))
camera.fov += (framing.fov - camera.fov) * lerpCoef(0.05, ratio)
camPhi += (framing.phi - camPhi) * lerpCoef(0.05, ratio)
camTilt += (framing.tilt - camTilt) * lerpCoef(0.05, ratio)

// 목표 방위 → 실제 방위 2단 스무딩. 캐릭터가 카메라 쪽으로 걸어오면(정반대) 배수 0
const mul = moving ? THREE.MathUtils.clamp(Math.cos(charThetaTarget - camTheta) + 1, 0, 1) : 0.025
camThetaTarget += shortestAngle(charTheta - camThetaTarget) * lerpCoef(0.03 * mul, ratio)
camTheta += (camThetaTarget - camTheta) * lerpCoef(0.075, ratio)

// 벽 충돌·인트로 줌은 반경만 바꾼다(목표 반경은 구도 반경 framing.distance 기준) — 같은 광선 위라 Pitch 불변
radius += (radiusTarget - radius) * lerpCoef(0.05, ratio)
lookTarget.lerp(panTarget, lerpCoef(0.15, ratio))
camera.position.setFromSphericalCoords(radius, camPhi + parPhi, camTheta + parTheta).add(lookTarget)
camera.lookAt(swayedLookPoint) // 대기 흔들림·시선 들기(camTilt)는 시선 방향만 돌린다
```

## 규격 — 맵 쿼터뷰 카메라 (예정)

맵은 Mapbox 지도 카메라를 그대로 씬 카메라로 쓴다(Three.js는 같은 카메라의 MVP 행렬로 그린다 — [ADR 001](./001-webgl-context-sharing.md)).

| 요소 | 규칙 |
|---|---|
| 시작 뷰 | 줌 17·pitch 45°·bearing 45° 쿼터뷰(Standard 스타일) |
| 잠금 | 드래그 팬·회전·기울기 입력과 Mapbox 키보드 조작을 끈다. WASD·방향키는 캐릭터 이동에만 쓰인다 |
| 줌 | 스크롤·박스·더블클릭·핀치 줌만 허용하고(핀치 회전은 끈다), 범위는 14~20이다. 무제한 줌아웃은 Mapbox 무료 타일 티어를 소진한다 |
| 추적 | 캐릭터가 움직일 때마다 지도 중심을 캐릭터 위치로 옮긴다 |

## 관련

- [ADR 001 — WebGL 컨텍스트 구성](./001-webgl-context-sharing.md)
- [비즈니스 규칙 — 이동 규칙](../product/business-rules.md)

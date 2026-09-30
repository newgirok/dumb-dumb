# ADR 001: WebGL 컨텍스트 구성 — 플레이 씬·펼침 지도 분리, 맵 공유

**상태:** Accepted

## 결정

3D 화면은 렌더링 구조가 두 가지다.

- **플레이 씬**(`/play`, `features/play/`)은 씬이 직접 만드는 **Three.js `<canvas>` 하나(단일 WebGL 컨텍스트)**에 베이크드 로우폴리 씬을 그린다. 우상단 지도 버튼이나 M 키로 펼치는 펼침 지도(`components/map/paper-map.tsx`)는 이와 **분리된 독립 Mapbox GL `<canvas>`**로 운용한다. 지도는 씬이 시작될 때 한 번 만들어 두고, 접혀 있는 동안은 숨겨 둔다. 두 컨텍스트는 GPU 자원을 공유하지 않고 각자 그린다.
- **내 주변(베타)**(`/nearby`, `features/nearby/`)도 같은 구조다. 자체 Three.js 캔버스에 바닥 구역을 그리고, 펼침 지도는 분리된 Mapbox 캔버스다. 바닥 마스크는 워커의 OffscreenCanvas에서 그려 픽셀만 넘겨받으므로 길 그리기도 씬 렌더 루프 밖에서 돈다.
- **맵**(`/map`, 예정)은 Mapbox 실지형 지도가 월드의 바닥이다. Three.js는 Mapbox **커스텀 레이어**로 올라가 Mapbox 캔버스의 WebGL 컨텍스트를 **공유**하며, 지도와 같은 카메라로 캐릭터를 그린다.

## 배경

플레이 씬과 펼침 지도는 렌더링 요구가 근본적으로 다르다.

- **플레이 씬**: 매 프레임 캐릭터·애니메이션·그림자·후처리를 그려야 하는 성능 최우선 영역이다. 화면 대부분을 차지하며 사용자의 조작 초점이 여기 있다.
- **펼침 지도**: 유저의 실제 GPS 위치(내 주변은 캐릭터 자리)를 게임 화풍 종이 지도 위에 보여 주는 보조 화면이다. 펼쳤을 때만 보이고, 지도를 다시 그리는 빈도를 낮게 유지한다 — 지도 카메라는 '나'에게 맞출 때(펼칠 때, 플레이 씬에서 펼쳐 둔 채 첫 위치가 올 때)와 유저가 끌거나 확대/축소할 때만 움직이고, '나'·정확도 원 같은 표시는 DOM 마커라 지도를 다시 그리지 않고 CSS로 움직인다. 내 주변처럼 캐릭터를 매 프레임 따라갈 때도 마커만 옮긴다.

이 둘을 하나의 WebGL 컨텍스트에 합치면, 지도의 벡터 타일 파이프라인이 씬의 렌더 루프에 끼어들어 프레임 예산을 잠식한다. 지도의 타일 로딩 스톨이 곧 씬의 프레임 드랍으로 이어진다.

맵은 지도 자체가 월드다. 캐릭터가 실제 도로·건물 위에 정확히 서야 하므로, 지도와 3D 오브젝트를 같은 카메라로 한 프레임 안에서 그려야 한다.

## 근거

### 플레이 씬 — 펼침 지도와 컨텍스트 분리

| 항목 | 단일 컨텍스트 혼합 | 컨텍스트 분리 |
|---|---|---|
| 씬 프레임 예산 | 지도 파이프라인이 잠식 | 씬 전용, 독립 확보 |
| 지도 타일 스톨 영향 | 씬 프레임 드랍으로 전파 | 씬에 영향 없음 |
| 모바일 60fps 달성 | 어려움 | 씬에서 달성 가능 |
| 렌더 루프 결합도 | 강결합 | 완전 독립 |
| 구현·디버깅 난이도 | 높음 (상호 상태 오염) | 낮음 (경계 명확) |

플레이 씬은 씬 로컬 미터 좌표계(Y-up)에서 동작하고, 펼침 지도는 위경도(EPSG:4326) 좌표계에서 동작한다. 좌표계와 렌더 루프가 분리되어 있어 각 엔진을 각자의 최적 상태로 독립 튜닝할 수 있다.

### 맵 — Mapbox와 컨텍스트 공유

| 항목 | 별도 Three.js 캔버스 | Mapbox 커스텀 레이어 공유 |
|---|---|---|
| 지도·오브젝트 정합 | 매 프레임 지도 카메라를 따로 복제해야 함 | Mapbox가 넘기는 MVP 행렬을 그대로 사용 |
| 캔버스·컨텍스트 | 2개를 겹쳐 합성 | 1개, 한 프레임 안에서 순서대로 그림 |
| 깊이 처리 | 두 캔버스 사이 깊이 공유 불가 | 커스텀 레이어가 매 프레임 `clearDepth()`로 깊이 버퍼를 비운 뒤 그려 캐릭터가 건물에 가리지 않음 |

오브젝트는 Mercator 좌표(0~1)에 직접 두지 않고, 시작 위치를 원점으로 한 미터 좌표에 둔다. 원점 이동·미터 스케일·축 변환(Y-up → Mercator)은 카메라 `projectionMatrix`에 합성해, 정점이 float32 정밀도 안에서 다뤄지게 한다.

## 구현 요점

```typescript
// 플레이 씬 — 씬 전용 Three.js 캔버스 + 후처리 (features/play/play-scene.tsx)
const renderer = new THREE.WebGLRenderer({ antialias: false, depth: false }) // 계단은 SMAA로 편다
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)) // × 적응형 배수(0.7~1)
mount.appendChild(renderer.domElement)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera)) // 이어서 최종 패스(LUT·인트로) · SMAAPass · OutputPass

const loop = (now: number) => {
  // 씬·카메라 갱신 …
  composer.render()
  raf = requestAnimationFrame(loop)
}

// 펼침 지도 — 독립 Mapbox GL 캔버스 (components/map/paper-map.tsx)
// 씬이 시작되면 한 번 만들고, 접혀 있는 동안은 숨겨 둔다(visibility: hidden)
const map = new mapboxgl.Map({
  container,
  style: PAPER_STYLE, // Streets v8 + 지형 음영을 게임 화풍으로 칠한 스타일 (paper-map-style.ts)
  zoom: 16,
  minZoom: 11,
  maxZoom: 18.5,
  projection: 'mercator',
  // 끌기·확대/축소는 받고, 돌리기·기울이기는 막는다 — 종이 지도는 북쪽이 위
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  trackResize: false, // 크기는 ResizeObserver로 직접 잰다(펼치는 중에는 조상의 CSS 변환 때문에 틀리게 잰다)
  localFontFamily: 'Stylish', // 모든 라벨을 Stylish 폰트로 그린다
})
map.touchZoomRotate.disableRotation() // 핀치 회전
map.keyboard.disableRotation() // Shift+방향키 회전·기울이기(방향키 이동·± 확대는 남는다)

// '나'·정확도 원은 DOM 마커 — 지도를 다시 그리지 않고 CSS로 움직인다
new mapboxgl.Marker({ element: meEl }).setLngLat([lng, lat]).addTo(map)
```

펼치고 접는 동안 날개 안쪽 면에는 Mapbox `render` 이벤트 안에서 지도 캔버스의 그 부분을 `drawImage`로 옮겨 그린다. 렌더 직후라 드로잉 버퍼가 살아 있으므로 지도 컨텍스트에 `preserveDrawingBuffer`를 켜지 않는다.

맵은 Three.js를 아래 구조의 커스텀 레이어로 올린다.

```typescript
// 맵 — Mapbox 커스텀 레이어가 WebGL 컨텍스트를 공유
const customLayer: mapboxgl.CustomLayerInterface = {
  id: 'three-scene',
  type: 'custom',
  renderingMode: '3d',

  onAdd(m, gl) {
    renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
    renderer.autoClear = false
  },

  render(_gl, matrix) {
    // Mapbox MVP · (원점 이동 · 미터 스케일 · 축 변환)
    camera.projectionMatrix.fromArray(matrix).multiply(sceneOrigin.worldMatrix)
    renderer.resetState()
    renderer.clearDepth() // 색은 남기고 깊이만 비워 캐릭터가 건물에 가리지 않게 한다
    renderer.render(scene, camera)
    map.triggerRepaint()
  },
}

map.on('load', () => map.addLayer({ ...customLayer, slot: 'top' }))
```

## 결과

- 플레이 씬·내 주변의 프레임 예산이 펼침 지도의 타일 로딩·다시 그리기와 독립된다
- 플레이 씬과 펼침 지도를 각자의 좌표계·렌더 루프에서 독립 튜닝한다
- 지도 토큰(`NEXT_PUBLIC_MAPBOX_TOKEN`)이 없거나 지도를 만들 수 없으면(WebGL 미지원 등) 씬은 그대로 돌고, 지도 자리에는 "지도를 그릴 수 없어요" 쪽지만 뜬다
- 맵은 캐릭터를 지도와 같은 카메라 행렬로 그리고, 새 위치를 15m 이내 도로에 스냅한다
- 맵은 캔버스 하나로 지도와 3D를 함께 그리며, 캐릭터는 깊이 초기화 덕분에 건물 위에 항상 보인다

## 관련

- [아키텍처 개요 — 시스템 다이어그램](../architecture/overview.md)
- [ADR 007 — 카메라 잠금](./007-quarter-view-camera-lock.md)

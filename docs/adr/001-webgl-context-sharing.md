# ADR 001: WebGL 컨텍스트 구성 — 루트 씬·미니맵 분리, 대시보드 월드 공유

**상태:** Accepted

## 결정

두 월드는 렌더링 구조가 다르다.

- **루트 3D 씬**(`/`, `app/summer-afternoon/`)은 씬이 직접 만드는 **Three.js `<canvas>` 하나(단일 WebGL 컨텍스트)**에 베이크드 로우폴리 씬을 그린다. 화면 5시(우하단)의 나침반형 GIS 미니맵(`components/world/MiniMap.tsx`)은 이와 **분리된 독립 Mapbox GL `<canvas>`**로 운용한다. 두 컨텍스트는 GPU 자원을 공유하지 않고 각자 그린다.
- **대시보드 월드**(`/dashboard`, `components/world/WorldCanvas.tsx`)는 Mapbox 실지형 지도가 월드의 바닥이다. Three.js는 Mapbox **커스텀 레이어**로 올라가 Mapbox 캔버스의 WebGL 컨텍스트를 **공유**하며, 지도와 같은 카메라로 캐릭터를 그린다.

## 배경

루트 3D 씬과 미니맵은 렌더링 요구가 근본적으로 다르다.

- **루트 3D 씬**: 매 프레임 캐릭터·애니메이션·그림자·후처리를 그려야 하는 성능 최우선 영역이다. 화면 대부분을 차지하며 사용자의 조작 초점이 여기 있다.
- **GIS 미니맵**: 유저의 실제 GPS 위치를 실지형 지도 위에 보여 주는 보조 위젯이다. 갱신 빈도가 낮고 화면 점유율이 작다.

이 둘을 하나의 WebGL 컨텍스트에 합치면, 미니맵의 벡터 타일 파이프라인이 씬의 렌더 루프에 끼어들어 프레임 예산을 잠식한다. 미니맵의 타일 로딩 스톨이 곧 씬의 프레임 드랍으로 이어진다.

대시보드 월드는 지도 자체가 월드다. 캐릭터가 실제 도로·건물 위에 정확히 서야 하므로, 지도와 3D 오브젝트를 같은 카메라로 한 프레임 안에서 그려야 한다.

## 근거

### 루트 3D 씬 — 미니맵과 컨텍스트 분리

| 항목 | 단일 컨텍스트 혼합 | 컨텍스트 분리 |
|---|---|---|
| 씬 프레임 예산 | 미니맵 파이프라인이 잠식 | 씬 전용, 독립 확보 |
| 미니맵 타일 스톨 영향 | 씬 프레임 드랍으로 전파 | 씬에 영향 없음 |
| 모바일 60fps 달성 | 어려움 | 씬에서 달성 가능 |
| 렌더 루프 결합도 | 강결합 | 완전 독립 |
| 구현·디버깅 난이도 | 높음 (상호 상태 오염) | 낮음 (경계 명확) |

루트 3D 씬은 씬 로컬 미터 좌표계(Y-up)에서 동작하고, 미니맵은 위경도(EPSG:4326) 좌표계에서 동작한다. 좌표계와 렌더 루프가 분리되어 있어 각 엔진을 각자의 최적 상태로 독립 튜닝할 수 있다.

### 대시보드 월드 — Mapbox와 컨텍스트 공유

| 항목 | 별도 Three.js 캔버스 | Mapbox 커스텀 레이어 공유 |
|---|---|---|
| 지도·오브젝트 정합 | 매 프레임 지도 카메라를 따로 복제해야 함 | Mapbox가 넘기는 MVP 행렬을 그대로 사용 |
| 캔버스·컨텍스트 | 2개를 겹쳐 합성 | 1개, 한 프레임 안에서 순서대로 그림 |
| 깊이 처리 | 두 캔버스 사이 깊이 공유 불가 | 커스텀 레이어가 매 프레임 `clearDepth()`로 깊이 버퍼를 비운 뒤 그려 캐릭터가 건물에 가리지 않음 |

오브젝트는 Mercator 좌표(0~1)에 직접 두지 않고, 시작 위치를 원점으로 한 미터 좌표에 둔다. 원점 이동·미터 스케일·축 변환(Y-up → Mercator)은 카메라 `projectionMatrix`에 합성해, 정점이 float32 정밀도 안에서 다뤄지게 한다.

## 구현 요점

```typescript
// 루트 3D 씬 — 씬 전용 Three.js 캔버스 + 후처리 (app/summer-afternoon/scene.tsx)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
mount.appendChild(renderer.domElement)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera)) // 이어서 LUTPass · OutputPass · 인트로 전환 패스

const loop = (now: number) => {
  // 씬·카메라 갱신 …
  composer.render()
  raf = requestAnimationFrame(loop)
}

// 5시 GIS 미니맵 — 독립 Mapbox GL 캔버스 (components/world/MiniMap.tsx)
const minimap = new mapboxgl.Map({
  container,
  style: 'mapbox://styles/mapbox/standard',
  zoom: 16,
  interactive: false, // 보조 위젯, 조작 대상 아님
})
```

```typescript
// 대시보드 월드 — Mapbox 커스텀 레이어가 WebGL 컨텍스트를 공유 (lib/map/context.ts)
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

- 루트 3D 씬의 프레임 예산이 미니맵 타일 로딩과 독립된다
- 루트 3D 씬과 미니맵을 각자의 좌표계·렌더 루프에서 독립 튜닝한다
- 대시보드 월드의 캐릭터는 지도와 같은 카메라 행렬로 그려지고, 15m 이내에 도로가 있으면 도로 위로 스냅된다
- 대시보드 월드는 캔버스 하나로 지도와 3D를 함께 그리며, 캐릭터는 깊이 초기화 덕분에 건물 위에 항상 보인다

## 관련

- [아키텍처 개요 — 시스템 다이어그램](../architecture/overview.md)
- [ADR 007 — 카메라 잠금](./007-quarter-view-camera-lock.md)

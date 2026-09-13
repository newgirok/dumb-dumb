# ADR 001: 메인 3D 씬과 GIS 미니맵의 WebGL 컨텍스트 분리

**상태:** Accepted

## 결정

메인 월드는 **단 하나의 Three.js `<canvas>`(단일 WebGL 컨텍스트)** 위에서 베이크드 로우폴리 숲 씬을 렌더링한다. 화면 5시(우하단)의 나침반형 GIS 미니맵은 이와 **완전히 분리된 독립 경량 Mapbox GL `<canvas>`**로 운용한다. 두 컨텍스트는 서로 GPU 자원을 공유하지 않고 각자 독립적으로 그린다.

## 배경

메인 월드(3D 씬)와 보조 미니맵(실지형 지도)은 렌더링 요구가 근본적으로 다르다.

- **메인 씬**: 매 프레임 캐릭터·애니메이션·거리 안개를 60fps로 그려야 하는 성능 최우선 영역이다. 화면 대부분을 차지하며 사용자의 조작 초점이 여기 있다.
- **GIS 미니맵**: 유저의 실제 GPS 위치를 실지형 지도 위에 점으로 찍어 주는 보조 위젯이다. 갱신 빈도가 낮고 화면 점유율이 작다.

이 둘을 하나의 WebGL 컨텍스트에 억지로 합치면, 미니맵의 벡터 타일 파이프라인이 메인 씬의 렌더 루프에 끼어들어 프레임 예산을 잠식한다. 미니맵의 타일 로딩 스톨이 곧 씬의 프레임 드랍으로 이어진다.

## 근거

| 항목 | 단일 컨텍스트 혼합 | 컨텍스트 분리 |
|---|---|---|
| 메인 씬 프레임 예산 | 미니맵 파이프라인이 잠식 | 씬 전용, 독립 확보 |
| 미니맵 타일 스톨 영향 | 씬 프레임 드랍으로 전파 | 씬에 영향 없음 |
| 모바일 60fps 달성 | 어려움 | 씬에서 달성 가능 |
| 렌더 루프 결합도 | 강결합 | 완전 독립 |
| 구현·디버깅 난이도 | 높음 (상호 상태 오염) | 낮음 (경계 명확) |

메인 씬은 씬 로컬 좌표계에서 동작하고, 미니맵은 위경도(EPSG:4326) 좌표계에서 동작한다. 좌표계와 렌더 루프를 분리하면 각 엔진을 각자의 최적 상태로 독립 튜닝할 수 있다.

## 구현 요점

```typescript
// 메인 월드 — 단일 Three.js WebGL 컨텍스트 (베이크드 씬)
const renderer = new THREE.WebGLRenderer({ canvas: worldCanvas, antialias: true });
const scene = new THREE.Scene();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// 5시 GIS 미니맵 — 독립 경량 Mapbox GL 컨텍스트
const minimap = new mapboxgl.Map({
  container: 'minimap',
  center: [lon, lat],
  interactive: false, // 보조 위젯, 조작 대상 아님
});
```

## 결과

- 메인 씬은 미니맵과 무관하게 안정적 60fps를 확보
- 미니맵의 타일 로딩 지연이 씬 프레임에 전파되지 않음
- 두 엔진을 각자의 좌표계·렌더 루프에서 독립 튜닝

## 관련

- [아키텍처 개요 — 렌더링 파이프라인](../architecture/overview.md)
- [ADR 007 — 카메라 잠금](./007-quarter-view-camera-lock.md)

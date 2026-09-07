import mapboxgl from 'mapbox-gl'

// ADR 007(쿼터뷰 카메라 고정) — pitch/bearing 회전은 방향 혼동·멀미를 유발해
// 다시 고정. 줌만 유저가 조작 가능하게 열어둠(회전은 dragRotate/두 손가락
// 트위스트 모두 비활성화). 무제한 줌아웃은 ADR이 우려한 Mapbox 무료 타일
// 티어 소진으로 이어지므로 줌 범위는 14~20으로 제한.
export function setupCamera(map: mapboxgl.Map) {
  map.dragPan.disable()
  map.keyboard.disable()
  map.dragRotate.disable()

  map.scrollZoom.enable()
  map.boxZoom.enable()
  map.doubleClickZoom.enable()
  map.touchZoomRotate.enable()
  map.touchZoomRotate.disableRotation()
  map.touchPitch.disable()

  map.setMinZoom(14)
  map.setMaxZoom(20)
}

export function followPlayer(map: mapboxgl.Map, lng: number, lat: number) {
  map.setCenter([lng, lat])
}

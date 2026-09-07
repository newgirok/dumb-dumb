import mapboxgl from 'mapbox-gl'

// ADR 007(쿼터뷰 카메라 고정)을 실험적으로 완화 — 캐릭터 이동은 여전히 키보드/
// 팔로우캠이 담당하므로 dragPan·keyboard는 그대로 막고, 줌·시점 회전만 유저가
// 직접 조작 가능하게 풂. 무제한 줌아웃은 ADR이 우려한 Mapbox 무료 타일 티어
// 소진으로 이어지므로 줌 범위는 14~20으로 제한.
export function setupCamera(map: mapboxgl.Map) {
  map.dragPan.disable()
  map.keyboard.disable()

  map.scrollZoom.enable()
  map.boxZoom.enable()
  map.dragRotate.enable()
  map.doubleClickZoom.enable()
  map.touchZoomRotate.enable()
  map.touchPitch.enable()

  map.setMinZoom(14)
  map.setMaxZoom(20)
}

export function followPlayer(map: mapboxgl.Map, lng: number, lat: number) {
  map.setCenter([lng, lat])
}

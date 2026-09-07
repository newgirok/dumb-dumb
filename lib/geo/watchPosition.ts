/** 브라우저 GPS를 실시간으로 추적 — 위치가 갱신될 때마다 onUpdate 호출, 구독 해제 함수를 반환 */
export function watchPosition(
  onUpdate: (lng: number, lat: number) => void,
  onError?: () => void,
): () => void {
  if (!('geolocation' in navigator)) {
    onError?.()
    return () => {}
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate(pos.coords.longitude, pos.coords.latitude),
    () => onError?.(),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
  )

  return () => navigator.geolocation.clearWatch(id)
}

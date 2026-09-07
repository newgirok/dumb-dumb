/** 브라우저 GPS로 현재 위치 조회 — 미지원/거부/타임아웃 시 fallback 좌표 반환 */
export function getCurrentPosition(fallback: [number, number]): Promise<[number, number]> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(fallback)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      () => resolve(fallback),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

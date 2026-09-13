'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { watchPosition } from '@/lib/geo/watchPosition'

// GPS를 아직 못 받았을 때 보여줄 기본 중심 (서울시청)
const FALLBACK_CENTER: [number, number] = [126.9779, 37.5665]

// 접힌 크기 / 펼친 크기(px). 클릭하면 이 사이를 부드럽게 오간다.
const SIZE_COLLAPSED = 152
const SIZE_EXPANDED = 340

/**
 * 화면 5시(우하단)에 나침반처럼 붙는 GIS 미니맵.
 *
 * 메인 3D 씬과 분리된 독립 Mapbox GL 캔버스다. 유저의 실제 GPS 위치를 실지형
 * 지도(지명·도로 라벨 포함) 위에 표시하며, 드래그·줌은 잠겨 있고 카메라는
 * 유저를 추적한다. 클릭하면 부드럽게 커지고, 다시 누르면 원래 크기로 돌아온다.
 */
export default function MiniMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return // 토큰이 없으면 미니맵을 띄우지 않는다

    mapboxgl.accessToken = token

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/standard',
        center: FALLBACK_CENTER,
        zoom: 16,
        // 미니맵은 조작 불가 — 유저 위치만 추적하는 나침반
        interactive: false,
        attributionControl: false,
      })
    } catch {
      return // WebGL 미지원 등 — 미니맵만 조용히 비활성
    }
    mapRef.current = map

    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    map.on('load', () => {
      // 메인 씬과 톤을 맞추되, 지명·도로·POI 라벨(문구)은 모두 표시한다
      map.setConfigProperty('basemap', 'lightPreset', 'night')
      map.setConfigProperty('basemap', 'showPlaceLabels', true)
      map.setConfigProperty('basemap', 'showRoadLabels', true)
      map.setConfigProperty('basemap', 'showTransitLabels', true)
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', true)
    })

    // 실제 GPS 위치를 추적해 미니맵 중심을 유저에 고정 — 첫 좌표는 즉시,
    // 이후 갱신은 부드럽게 따라간다
    let hasFix = false
    const unwatch = watchPosition((lng, lat) => {
      if (!hasFix) {
        map.jumpTo({ center: [lng, lat] })
        hasFix = true
      } else {
        map.easeTo({ center: [lng, lat], duration: 600 })
      }
    })

    return () => {
      unwatch()
      map.remove()
      mapRef.current = null
    }
  }, [])

  const size = expanded ? SIZE_EXPANDED : SIZE_COLLAPSED

  return (
    <div
      className="absolute bottom-5 right-5 z-20 cursor-pointer transition-[width,height] duration-500 ease-out"
      style={{ width: size, height: size }}
      onClick={() => setExpanded((v) => !v)}
      // 크기 전환이 끝나면 Mapbox 캔버스를 새 크기에 맞춰 다시 그린다
      onTransitionEnd={() => mapRef.current?.resize()}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full border-[3px] border-[#f9efdc] shadow-[2px_2px_0_0_#716c66]">
        <div ref={containerRef} className="h-full w-full" />
        {/* 나침반 N 표시 (북쪽 고정) */}
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-bold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
          N
        </div>
        {/* 유저 위치 — 지도가 유저를 중앙에 두므로 정중앙 점으로 표시 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#8875ad] shadow" />
      </div>
    </div>
  )
}

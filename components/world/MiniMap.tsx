'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { watchPosition } from '@/lib/geo/watchPosition'

// GPS를 아직 못 받았을 때 보여줄 기본 중심 (서울시청)
const FALLBACK_CENTER: [number, number] = [126.9779, 37.5665]

// 접힌 크기 / 펼친 크기(px). 클릭하면 이 사이를 부드럽게 오간다.
const SIZE_COLLAPSED = 152
const SIZE_EXPANDED = 340

// track 모드 — 지도를 사방으로 이만큼(px) 넓게 그려 두고, 이 안의 이동과 이 각도 안의 회전은
// 그린 캔버스를 CSS로 옮기고 돌리기만 한다(그 사이 라벨은 이 각도 안에서 기운다)
const TRACK_MARGIN = 48
const TRACK_MAX_TURN = 20

/** 씬이 매 프레임 채워 주는 캐릭터 위치와 화면 방향(북쪽 기준 시계방향 도) */
export interface MiniMapTrack {
  lng: number
  lat: number
  bearing: number
}

/**
 * 화면 5시(우하단)에 나침반처럼 붙는 GIS 미니맵.
 *
 * 메인 3D 씬과 분리된 독립 Mapbox GL 캔버스다. 유저의 실제 GPS 위치를 실지형
 * 지도(지명·도로 라벨 포함) 위에 표시하며, 드래그·줌은 잠겨 있고 카메라는
 * 유저를 추적한다. 클릭하면 부드럽게 커지고, 다시 누르면 원래 크기로 돌아온다.
 *
 * track을 주면 GPS 대신 씬 캐릭터를 따라간다 — 화면이 보는 쪽이 위로 오게 돌고,
 * N 표시가 테두리를 따라 북쪽을 가리킨다(내 동네 시험판).
 */
export default function MiniMap({ track }: { track?: RefObject<MiniMapTrack | null> } = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const northRef = useRef<HTMLDivElement>(null)
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

    // 확대/축소 애니메이션 동안 컨테이너 크기가 매 프레임 바뀐다. 전환이
    // 끝난 뒤에만 resize하면 애니메이션 내내 캔버스가 늘어나 보이므로,
    // 크기 변화를 실시간으로 따라가며 캔버스를 다시 그린다.
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)

    map.on('load', () => {
      // 메인 씬과 톤을 맞추되, 지명·도로·POI 라벨(문구)은 모두 표시한다
      map.setConfigProperty('basemap', 'lightPreset', 'night')
      map.setConfigProperty('basemap', 'showPlaceLabels', true)
      map.setConfigProperty('basemap', 'showRoadLabels', true)
      map.setConfigProperty('basemap', 'showTransitLabels', true)
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', true)
    })

    let unwatch = () => {}
    let raf = 0
    if (track) {
      // 씬 캐릭터를 따라간다. 이 지도(Standard 스타일)는 한 번 다시 그리는 데 10~30ms가 들어,
      // 매 프레임 옮기면 걸을 때 프레임이 튄다. 그래서 여백 안에서는 캔버스를 CSS로만 옮기고
      // 돌리다가, 여백을 벗어나거나 많이 돌면 그 자리·방향으로 다시 그린다. 변환은 컨테이너가
      // 아니라 캔버스에 건다 — Mapbox는 컨테이너와 그 위 요소의 변환을 읽어 크기를 재기 때문이다.
      const canvas = map.getCanvas()
      let drawnBearing = NaN
      let redrawing = false
      /** 그려 둔 지도에서 캐릭터가 한가운데로부터 벗어난 거리(px)와 그린 뒤로 돈 각도 */
      const offset = (t: MiniMapTrack) => {
        const at = map.project([t.lng, t.lat])
        return {
          dx: at.x - container.clientWidth / 2,
          dy: at.y - container.clientHeight / 2,
          turn: ((((t.bearing - drawnBearing) % 360) + 540) % 360) - 180,
        }
      }
      const shift = ({ dx, dy, turn }: ReturnType<typeof offset>) => {
        canvas.style.transform = `rotate(${-turn}deg) translate(${-dx}px, ${-dy}px)`
      }
      // 새 그림이 캔버스에 올라온 그 프레임에 CSS도 맞춘다(한 프레임 튀지 않게). 여기서는 다시 그리지 않는다
      map.on('render', () => {
        if (!redrawing) return
        redrawing = false
        const t = track.current
        if (t) shift(offset(t))
      })
      let lastBearing = NaN
      const follow = () => {
        const t = track.current
        if (t && !redrawing) {
          const o = offset(t)
          if (Math.abs(o.dx) <= TRACK_MARGIN && Math.abs(o.dy) <= TRACK_MARGIN && Math.abs(o.turn) <= TRACK_MAX_TURN) {
            shift(o)
          } else {
            map.jumpTo({ center: [t.lng, t.lat], bearing: t.bearing })
            drawnBearing = t.bearing
            redrawing = true
          }
        }
        const north = northRef.current
        if (t && north && !(Math.abs(t.bearing - lastBearing) < 0.1)) {
          // 테두리를 따라 돌되 글자는 똑바로 선다
          north.style.transform = `rotate(${-t.bearing}deg)`
          const letter = north.firstElementChild as HTMLElement | null
          if (letter) letter.style.transform = `rotate(${t.bearing}deg)`
          lastBearing = t.bearing
        }
        raf = requestAnimationFrame(follow)
      }
      raf = requestAnimationFrame(follow)
    } else {
      // 실제 GPS 위치를 추적해 미니맵 중심을 유저에 고정 — 첫 좌표는 즉시,
      // 이후 갱신은 부드럽게 따라간다
      let hasFix = false
      unwatch = watchPosition((lng, lat) => {
        if (!hasFix) {
          map.jumpTo({ center: [lng, lat] })
          hasFix = true
        } else {
          map.easeTo({ center: [lng, lat], duration: 600 })
        }
      })
    }

    return () => {
      cancelAnimationFrame(raf)
      unwatch()
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [track])

  const size = expanded ? SIZE_EXPANDED : SIZE_COLLAPSED

  return (
    <div
      className="absolute bottom-5 right-5 z-20 cursor-pointer transition-[width,height] duration-500 ease-out"
      style={{ width: size, height: size }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full border-[3px] border-[#f9efdc] shadow-[2px_2px_0_0_#716c66]">
        {track ? (
          // 원 밖으로 여백만큼 넓게 그린다 — Mapbox가 컨테이너를 position: relative로 덮어쓰므로 감싸서 넓힌다
          <div className="absolute" style={{ inset: -TRACK_MARGIN }}>
            <div ref={containerRef} className="h-full w-full" />
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
        {/* 나침반 N 표시 — 북쪽이 위(기본), track이면 지도와 함께 돌아 북쪽을 가리킨다 */}
        <div ref={northRef} className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-bold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
            N
          </div>
        </div>
        {/* 유저 위치 — 지도가 유저를 중앙에 두므로 정중앙 점으로 표시 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#8875ad] shadow" />
      </div>
    </div>
  )
}

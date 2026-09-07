'use client'

import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import CheapRuler from 'cheap-ruler'
import { initWorldMap, type WorldContext } from '@/lib/map/context'
import { setupCamera, followPlayer } from '@/lib/map/camera'
import { getCurrentPosition } from '@/lib/geo/currentPosition'
import { watchPosition } from '@/lib/geo/watchPosition'
import { snapToRoad } from '@/lib/map/snap'
import { createCharacterMesh } from '@/lib/three/character'
import { PruneManager } from '@/lib/three/prune'
import { createPositionChannel, broadcastPosition } from '@/lib/realtime/position'
import { createChatChannel, sendChat } from '@/lib/realtime/chat'
import { isValidMove, type StampedPos } from '@/lib/geo/validator'
import { requiredSectors, currentSectorId } from '@/lib/geo/sector'
import { VoiceManager, type PeerAudioInfo } from '@/lib/voice/livekit'
import { createClient } from '@/lib/supabase/client'
import { useTransitionReady } from '@/components/transition/PageTransition'
import type { RealtimeChannel } from '@supabase/supabase-js'
import * as THREE from 'three'

const ORIGIN: [number, number] = [126.9784, 37.5666]
// 도보 속도(3 m/s)를 위도 1도≈111,320m 기준 degrees/sec로 환산 — 기존
// MOVE_SPEED(0.00003)는 "프레임당" 값인데 매 requestAnimationFrame(≈60fps)마다
// 그대로 더해져서 실제로는 초속 200m(시속 720km)로 움직이던 버그였음.
// dt(경과 초)를 곱해 프레임레이트와 무관하게 항상 같은 실제 속도로 걷도록 함
const WALK_SPEED_DEG_PER_SEC = 3 / 111320
const BROADCAST_INTERVAL = 100
const VOICE_SECTOR_PREFIX = 'voice-'
// ADR 007 — 쿼터뷰 카메라는 pitch/bearing을 고정해 멀미·타일 낭비를 막음.
// 회전하는 체이스캠은 방향 혼동만 키워서 원래의 고정 대각선 시점으로 되돌림
const FIXED_BEARING = 45

interface Props {
  onRegisterMoveHandler: (fn: (dx: number, dy: number) => void) => void
  onRegisterChatHandler: (fn: (msg: string) => void) => void
}

const ruler = new CheapRuler(37.5, 'meters')

function distanceM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  return ruler.distance([lng1, lat1], [lng2, lat2])
}

// cheap-ruler는 도(degree) 단위 방위각을 반환 — livekit.ts의 PeerAudioInfo.bearing은 라디안 기준이라 변환
function bearingRad(fromLng: number, fromLat: number, toLng: number, toLat: number): number {
  return (ruler.bearing([fromLng, fromLat], [toLng, toLat]) * Math.PI) / 180
}

// 모바일(터치 기반)은 실제 GPS 이동, 웹(마우스/키보드)은 가짜 이동(키보드)으로 고정 — PRD 기준
function isMobileDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

export function WorldCanvas({ onRegisterMoveHandler, onRegisterChatHandler }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<WorldContext | null>(null)
  const playerMeshRef = useRef<THREE.Group | null>(null)
  const posRef = useRef<[number, number]>([...ORIGIN])
  const inputRef = useRef({ dx: 0, dy: 0 })
  const lastStampRef = useRef<StampedPos>({ lng: ORIGIN[0], lat: ORIGIN[1], ts: 0 })
  const otherMeshes = useRef<Map<string, THREE.Object3D>>(new Map())
  const posChannels = useRef<Map<string, RealtimeChannel>>(new Map())
  const chatChannelRef = useRef<RealtimeChannel | null>(null)
  const pruneRef = useRef<PruneManager | null>(null)
  const voiceRef = useRef<VoiceManager | null>(null)
  const voiceSectorRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef<number | null>(null)
  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // 사이드바의 "내 위치로" 버튼이 커스텀 이벤트로 재조회를 요청하면 이 ref를 통해 호출
  const movePlayerToRef = useRef<((lng: number, lat: number) => void) | null>(null)

  const [unsupported, setUnsupported] = useState(false)
  const [gpsError, setGpsError] = useState(false)
  // GPS 조회 + Mapbox 스타일 로드 + Three.js 초기화가 끝날 때까지는 페이지
  // 전환 스피너가 계속 떠 있도록 알림 — 라우트 커밋만 보고 스피너를 끄면
  // 지도가 아직 안 뜬 검은 화면이 스피너 없이 노출되는 문제가 있었음
  const [mapReady, setMapReady] = useState(false)
  useTransitionReady(mapReady)

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false
    let stopWatchingGps: (() => void) | null = null
    const mobile = isMobileDevice()

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) userIdRef.current = user.id
    })

    voiceRef.current = new VoiceManager()
    const container = containerRef.current

    getCurrentPosition(ORIGIN).then(([lng, lat]) => {
      if (destroyed) return
      posRef.current = [lng, lat]
      lastStampRef.current = { lng, lat, ts: 0 }

      initWorldMap(container, posRef.current).then((ctx) => {
        if (destroyed) return
        ctxRef.current = ctx
        setupCamera(ctx.map)
        setMapReady(true)

        const mesh = createCharacterMesh(0x4f8ef7)
        playerMeshRef.current = mesh
        ctx.addAt(mesh, posRef.current[0], posRef.current[1])

        pruneRef.current = new PruneManager(posRef.current[0], posRef.current[1])

        // 섹터 채널 동적 관리
        const subscribeSector = (id: string) => {
          if (posChannels.current.has(id)) return
          const ch = createPositionChannel(id, (pos) => {
            if (destroyed || pos.userId === userIdRef.current) return
            let other = otherMeshes.current.get(pos.userId) as THREE.Group | undefined
            if (!other) {
              other = createCharacterMesh(0xf74f4f)
              ctx.addAt(other, pos.lng, pos.lat)
              otherMeshes.current.set(pos.userId, other)
            } else {
              ctx.moveTo(other, pos.lng, pos.lat)
            }
            other.userData = { lng: pos.lng, lat: pos.lat }
          })
          posChannels.current.set(id, ch)
        }

        const unsubscribeSector = (id: string) => {
          posChannels.current.get(id)?.unsubscribe()
          posChannels.current.delete(id)
        }

        const syncSectors = (lng: number, lat: number) => {
          const needed = new Set(requiredSectors(lng, lat))
          for (const id of needed) subscribeSector(id)
          for (const id of posChannels.current.keys()) {
            if (!needed.has(id)) unsubscribeSector(id)
          }
        }

        // 음성 룸 섹터 동기화
        const syncVoice = async (lng: number, lat: number) => {
          const sectorId = currentSectorId(lng, lat)
          const roomName = `${VOICE_SECTOR_PREFIX}${sectorId}`
          if (voiceSectorRef.current === roomName) return
          voiceSectorRef.current = roomName
          const userId = userIdRef.current
          if (!userId || !voiceRef.current) return
          await voiceRef.current.connect(roomName, userId)
        }

        syncSectors(posRef.current[0], posRef.current[1])
        syncVoice(posRef.current[0], posRef.current[1])

        chatChannelRef.current = createChatChannel('chat-global', () => {
          // Phase 5에서 말풍선 연결 예정
        })

        broadcastTimer.current = setInterval(async () => {
          const [lng, lat] = posRef.current
          const userId = userIdRef.current
          if (!userId) return

          const now = Date.now()
          const stamp: StampedPos = { lng, lat, ts: now }
          if (!isValidMove(lastStampRef.current, stamp)) return
          lastStampRef.current = stamp

          for (const ch of posChannels.current.values()) {
            await broadcastPosition(ch, { userId, lng, lat, bearing: FIXED_BEARING })
          }

          // 공간 음성: 피어 거리/방위 계산 → Top-8 업데이트
          if (voiceRef.current?.connected) {
            const peers = new Map<string, PeerAudioInfo>()
            for (const [uid, obj] of otherMeshes.current) {
              const { lng: pLng, lat: pLat } = obj.userData as { lng?: number; lat?: number }
              if (pLng == null || pLat == null) continue
              peers.set(uid, {
                distM: distanceM(lng, lat, pLng, pLat),
                bearing: bearingRad(lng, lat, pLng, pLat),
              })
            }
            voiceRef.current.updatePeers(peers)
          }
        }, BROADCAST_INTERVAL)

        onRegisterMoveHandler((dx, dy) => { inputRef.current = { dx, dy } })
        onRegisterChatHandler(async (msg) => {
          const userId = userIdRef.current
          if (!chatChannelRef.current || !userId) return
          await sendChat(chatChannelRef.current, { userId, text: msg })
        })

        // 키보드(웹, 가짜 이동)와 GPS(모바일, 실제 이동) 양쪽이 공유하는
        // "새 위치 적용" 로직 — 도로 스냅, 섹터/음성 동기화, 프루닝까지 동일하게 처리.
        // 카메라 bearing은 ADR 007에 따라 항상 고정값이라 별도 계산 없음
        const movePlayerTo = (targetLng: number, targetLat: number) => {
          const [sLng, sLat] = snapToRoad(ctx.map, targetLng, targetLat)

          posRef.current = [sLng, sLat]
          ctx.moveTo(playerMeshRef.current!, sLng, sLat)

          followPlayer(ctx.map, sLng, sLat)
          syncSectors(sLng, sLat)
          syncVoice(sLng, sLat)
          pruneRef.current?.tick(ctx.scene, sLng, sLat, otherMeshes.current)
        }
        movePlayerToRef.current = movePlayerTo

        if (mobile) {
          stopWatchingGps = watchPosition(
            (lng, lat) => movePlayerTo(lng, lat),
            () => setGpsError(true),
          )
        } else {
          const loop = (now: number) => {
            if (destroyed) return
            const dt = lastFrameRef.current == null ? 0 : (now - lastFrameRef.current) / 1000
            lastFrameRef.current = now

            const { dx, dy } = inputRef.current
            if ((dx !== 0 || dy !== 0) && dt > 0) {
              const [lng, lat] = posRef.current
              const dist = WALK_SPEED_DEG_PER_SEC * dt
              movePlayerTo(lng + dx * dist, lat + (-dy) * dist)
            }
            rafRef.current = requestAnimationFrame(loop)
          }
          rafRef.current = requestAnimationFrame(loop)
        }
      }).catch(() => {
        if (!destroyed) {
          setUnsupported(true)
          setMapReady(true)
        }
      })
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'w' || e.key === 'ArrowUp')    inputRef.current.dy = -1
      if (e.key === 's' || e.key === 'ArrowDown')  inputRef.current.dy = 1
      if (e.key === 'a' || e.key === 'ArrowLeft')  inputRef.current.dx = -1
      if (e.key === 'd' || e.key === 'ArrowRight') inputRef.current.dx = 1
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (['w', 's', 'ArrowUp', 'ArrowDown'].includes(e.key)) inputRef.current.dy = 0
      if (['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(e.key)) inputRef.current.dx = 0
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // 사이드바 "내 위치로" 버튼 — 현재 GPS를 다시 조회해서 그 위치로 점프
    const onRecenterRequest = () => {
      getCurrentPosition(posRef.current).then(([lng, lat]) => {
        movePlayerToRef.current?.(lng, lat)
      })
    }
    window.addEventListener('recenter-request', onRecenterRequest)

    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('recenter-request', onRecenterRequest)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (broadcastTimer.current) clearInterval(broadcastTimer.current)
      stopWatchingGps?.()
      for (const ch of posChannels.current.values()) ch.unsubscribe()
      chatChannelRef.current?.unsubscribe()
      voiceRef.current?.disconnect()
      ctxRef.current?.map.remove()
      movePlayerToRef.current = null
    }
  }, [onRegisterMoveHandler, onRegisterChatHandler])

  if (unsupported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black text-white text-sm px-6 text-center">
        이 브라우저는 3D 월드를 지원하지 않습니다. 최신 Chrome, Edge, Safari로 다시 시도해주세요.
      </div>
    )
  }

  return (
    <>
      {/* mapbox-gl.css가 .mapboxgl-map에 position:relative를 강제하는데, CSS 주입
          순서에 따라 Tailwind의 absolute 유틸리티보다 나중에 적용되면 컨테이너
          높이가 0으로 붕괴됨 — 실제 위치잡기는 이 바깥 래퍼가 담당하고,
          mapboxgl.Map의 container로 넘기는 안쪽 div는 위치 클래스를 갖지 않음 */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="w-full h-full" />
      </div>
      {gpsError && (
        <div className="absolute top-5 left-5 py-1.5 px-3 rounded-lg bg-[rgba(247,79,79,0.8)] text-white text-xs">
          GPS 위치를 가져올 수 없습니다 — 위치 권한을 확인해주세요
        </div>
      )}
    </>
  )
}

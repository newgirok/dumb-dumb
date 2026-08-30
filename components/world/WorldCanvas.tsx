'use client'

import { useEffect, useRef } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { initWorldMap, type WorldContext } from '@/lib/map/context'
import { lockCamera, followPlayer } from '@/lib/map/camera'
import { snapToRoad } from '@/lib/map/snap'
import { createCharacterMesh } from '@/lib/three/character'
import { initFog, setFogRadius } from '@/lib/three/fog'
import { PruneManager } from '@/lib/three/prune'
import { createPositionChannel, broadcastPosition } from '@/lib/realtime/position'
import { createChatChannel, sendChat } from '@/lib/realtime/chat'
import { isValidMove, type StampedPos } from '@/lib/geo/validator'
import { requiredSectors } from '@/lib/geo/sector'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import * as THREE from 'three'

const ORIGIN: [number, number] = [126.9784, 37.5666] // 광화문
const MOVE_SPEED = 0.00003        // degrees per frame at 60fps ≈ 3 m/s
const BROADCAST_INTERVAL = 100   // ms

interface Props {
  onRegisterMoveHandler: (fn: (dx: number, dy: number) => void) => void
  onRegisterChatHandler: (fn: (msg: string) => void) => void
}

export function WorldCanvas({ onRegisterMoveHandler, onRegisterChatHandler }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fogRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<WorldContext | null>(null)
  const playerMeshRef = useRef<THREE.Group | null>(null)
  const posRef = useRef<[number, number]>([...ORIGIN])
  const inputRef = useRef({ dx: 0, dy: 0 })
  const lastStampRef = useRef<StampedPos>({ lng: ORIGIN[0], lat: ORIGIN[1], ts: 0 })
  const otherMeshes = useRef<Map<string, THREE.Object3D>>(new Map())
  const posChannels = useRef<Map<string, RealtimeChannel>>(new Map())
  const chatChannelRef = useRef<RealtimeChannel | null>(null)
  const pruneRef = useRef<PruneManager | null>(null)
  const userIdRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!containerRef.current || !fogRef.current) return
    let destroyed = false
    const fogEl = fogRef.current

    initFog(fogEl)
    setFogRadius(fogEl, 20)

    // 유저 ID 미리 fetch
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) userIdRef.current = user.id
    })

    initWorldMap(containerRef.current, ORIGIN).then((ctx) => {
      if (destroyed) return
      ctxRef.current = ctx
      lockCamera(ctx.map)

      // 플레이어 캐릭터
      const mesh = createCharacterMesh(0x4f8ef7)
      playerMeshRef.current = mesh
      ctx.addAt(mesh, posRef.current[0], posRef.current[1])

      // Prune 매니저
      pruneRef.current = new PruneManager(ORIGIN[0], ORIGIN[1])

      // 섹터 채널 구독 (동적 관리)
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
          // Prune을 위해 실제 좌표 보관
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

      // 초기 섹터 구독
      syncSectors(ORIGIN[0], ORIGIN[1])

      // 채팅 채널 (단일 - 추후 섹터 기반으로 확장)
      chatChannelRef.current = createChatChannel('chat-global', (_msg) => {
        // Phase 5에서 말풍선 billboard 연결 예정
      })

      // 브로드캐스트 타이머
      broadcastTimer.current = setInterval(async () => {
        const [lng, lat] = posRef.current
        const userId = userIdRef.current
        if (!userId) return

        const now = Date.now()
        const stamp: StampedPos = { lng, lat, ts: now }
        if (!isValidMove(lastStampRef.current, stamp)) return

        lastStampRef.current = stamp

        for (const ch of posChannels.current.values()) {
          await broadcastPosition(ch, { userId, lng, lat, bearing: 45 })
        }
      }, BROADCAST_INTERVAL)

      // HUD 콜백 등록
      onRegisterMoveHandler((dx, dy) => { inputRef.current = { dx, dy } })

      onRegisterChatHandler(async (msg) => {
        const userId = userIdRef.current
        if (!chatChannelRef.current || !userId) return
        await sendChat(chatChannelRef.current, { userId, text: msg })
      })

      // 게임 루프
      const loop = () => {
        if (destroyed) return
        const { dx, dy } = inputRef.current

        if ((dx !== 0 || dy !== 0) && ctx) {
          const [lng, lat] = posRef.current
          const newLng = lng + dx * MOVE_SPEED
          const newLat = lat + (-dy) * MOVE_SPEED
          const [sLng, sLat] = snapToRoad(ctx.map, newLng, newLat)

          posRef.current = [sLng, sLat]
          ctx.moveTo(playerMeshRef.current!, sLng, sLat)
          followPlayer(ctx.map, sLng, sLat)

          // 섹터 동적 동기화
          syncSectors(sLng, sLat)

          // Prune
          pruneRef.current?.tick(ctx.scene, sLng, sLat, otherMeshes.current)
        }

        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    })

    // 키보드 입력
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

    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (broadcastTimer.current) clearInterval(broadcastTimer.current)
      for (const ch of posChannels.current.values()) ch.unsubscribe()
      chatChannelRef.current?.unsubscribe()
      ctxRef.current?.map.remove()
    }
  }, [onRegisterMoveHandler, onRegisterChatHandler])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div
        ref={fogRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent var(--fog-radius, 12%), rgba(0,0,0,0.96) 70%)',
        }}
      />
    </>
  )
}

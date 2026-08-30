'use client'

import { useEffect, useRef } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { initWorldMap, type WorldContext } from '@/lib/map/context'
import { lockCamera, followPlayer } from '@/lib/map/camera'
import { snapToRoad } from '@/lib/map/snap'
import { createCharacterMesh } from '@/lib/three/character'
import { initFog, setFogRadius } from '@/lib/three/fog'
import { createPositionChannel, broadcastPosition } from '@/lib/realtime/position'
import { createChatChannel, sendChat } from '@/lib/realtime/chat'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import * as THREE from 'three'

const ORIGIN: [number, number] = [126.9784, 37.5666] // 광화문
const SECTOR = 'sector-0'
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
  const otherMeshes = useRef<Map<string, THREE.Group>>(new Map())
  const posChannelRef = useRef<RealtimeChannel | null>(null)
  const chatChannelRef = useRef<RealtimeChannel | null>(null)
  const rafRef = useRef<number | null>(null)
  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!containerRef.current || !fogRef.current) return

    let destroyed = false
    const fogEl = fogRef.current

    initFog(fogEl)
    setFogRadius(fogEl, 20) // Phase 2 기본 가시거리 20m

    initWorldMap(containerRef.current, ORIGIN).then((ctx) => {
      if (destroyed) return
      ctxRef.current = ctx

      lockCamera(ctx.map)

      // 플레이어 캐릭터
      const mesh = createCharacterMesh(0x4f8ef7)
      playerMeshRef.current = mesh
      ctx.addAt(mesh, posRef.current[0], posRef.current[1])

      // Realtime 위치 채널
      posChannelRef.current = createPositionChannel(SECTOR, (pos) => {
        if (destroyed) return
        const { userId, lng, lat } = pos
        let other = otherMeshes.current.get(userId)
        if (!other) {
          other = createCharacterMesh(0xf74f4f)
          ctx.addAt(other, lng, lat)
          otherMeshes.current.set(userId, other)
        } else {
          ctx.moveTo(other, lng, lat)
        }
      })

      // 채팅 채널
      chatChannelRef.current = createChatChannel(SECTOR, (_msg) => {
        // Phase 2: 채팅 말풍선은 Phase 3에서 billboard 연결
      })

      // 브로드캐스트 타이머
      broadcastTimer.current = setInterval(async () => {
        if (!posChannelRef.current) return
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await broadcastPosition(posChannelRef.current, {
          userId: user.id,
          lng: posRef.current[0],
          lat: posRef.current[1],
          bearing: 45,
        })
      }, BROADCAST_INTERVAL)

      // HUD 콜백 등록
      onRegisterMoveHandler((dx, dy) => {
        inputRef.current = { dx, dy }
      })

      onRegisterChatHandler(async (msg) => {
        if (!chatChannelRef.current) return
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await sendChat(chatChannelRef.current, { userId: user.id, text: msg })
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
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    })

    // 키보드 입력
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'w' || e.key === 'ArrowUp') inputRef.current.dy = -1
      if (e.key === 's' || e.key === 'ArrowDown') inputRef.current.dy = 1
      if (e.key === 'a' || e.key === 'ArrowLeft') inputRef.current.dx = -1
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
      posChannelRef.current?.unsubscribe()
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

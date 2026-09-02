'use client'

import { useEffect, useRef, useState } from 'react'
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
import { requiredSectors, currentSectorId } from '@/lib/geo/sector'
import { VoiceManager, type PeerAudioInfo } from '@/lib/voice/livekit'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import * as THREE from 'three'

const ORIGIN: [number, number] = [126.9784, 37.5666]
const MOVE_SPEED = 0.00003
const BROADCAST_INTERVAL = 100
const VOICE_SECTOR_PREFIX = 'voice-'

interface Props {
  onRegisterMoveHandler: (fn: (dx: number, dy: number) => void) => void
  onRegisterChatHandler: (fn: (msg: string) => void) => void
}

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingRad(fromLng: number, fromLat: number, toLng: number, toLat: number): number {
  const dLng = ((toLng - fromLng) * Math.PI) / 180
  const fLat = (fromLat * Math.PI) / 180
  const tLat = (toLat * Math.PI) / 180
  return Math.atan2(
    Math.sin(dLng) * Math.cos(tLat),
    Math.cos(fLat) * Math.sin(tLat) - Math.sin(fLat) * Math.cos(tLat) * Math.cos(dLng),
  )
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
  const voiceRef = useRef<VoiceManager | null>(null)
  const voiceSectorRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const broadcastTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const [micState, setMicState] = useState<'idle' | 'on' | 'denied'>('idle')

  const handleMicClick = () => {
    voiceRef.current?.resumeAudio()
    voiceRef.current?.enableMic().then((ok) => setMicState(ok ? 'on' : 'denied'))
  }

  useEffect(() => {
    if (!containerRef.current || !fogRef.current) return
    let destroyed = false
    const fogEl = fogRef.current

    initFog(fogEl)
    setFogRadius(fogEl, 20)

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) userIdRef.current = user.id
    })

    voiceRef.current = new VoiceManager()

    initWorldMap(containerRef.current, ORIGIN).then((ctx) => {
      if (destroyed) return
      ctxRef.current = ctx
      lockCamera(ctx.map)

      const mesh = createCharacterMesh(0x4f8ef7)
      playerMeshRef.current = mesh
      ctx.addAt(mesh, posRef.current[0], posRef.current[1])

      pruneRef.current = new PruneManager(ORIGIN[0], ORIGIN[1])

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

      syncSectors(ORIGIN[0], ORIGIN[1])
      syncVoice(ORIGIN[0], ORIGIN[1])

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
          await broadcastPosition(ch, { userId, lng, lat, bearing: 45 })
        }

        // 공간 음성: 피어 거리/방위 계산 → Top-8 업데이트
        if (voiceRef.current?.connected) {
          const peers = new Map<string, PeerAudioInfo>()
          for (const [uid, obj] of otherMeshes.current) {
            const { lng: pLng, lat: pLat } = obj.userData as { lng?: number; lat?: number }
            if (pLng == null || pLat == null) continue
            peers.set(uid, {
              distM: haversineM(lng, lat, pLng, pLat),
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
          syncSectors(sLng, sLat)
          syncVoice(sLng, sLat)
          pruneRef.current?.tick(ctx.scene, sLng, sLat, otherMeshes.current)
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
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

    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (broadcastTimer.current) clearInterval(broadcastTimer.current)
      for (const ch of posChannels.current.values()) ch.unsubscribe()
      chatChannelRef.current?.unsubscribe()
      voiceRef.current?.disconnect()
      ctxRef.current?.map.remove()
    }
  }, [onRegisterMoveHandler, onRegisterChatHandler])

  const micLabel = micState === 'on' ? '🎙 ON' : micState === 'denied' ? '🔇' : '🎙'
  // 리터럴 클래스 맵 — `bg-[${x}]` 문자열 보간은 Tailwind가 빌드 시점에 못 잡아서
  // 프로덕션에서 클래스가 통째로 사라지므로 절대 금지
  const MIC_BG: Record<typeof micState, string> = {
    idle: 'bg-black/50',
    on: 'bg-[rgba(79,142,247,0.8)]',
    denied: 'bg-black/50',
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={fogRef} className="absolute inset-0 pointer-events-none fog-vignette" />
      {/* 마이크 옵트인 버튼 */}
      <button
        onClick={handleMicClick}
        disabled={micState === 'on'}
        className={`absolute top-5 right-5 py-2 px-3.5 rounded-lg border border-white/20 text-white text-sm backdrop-blur-[4px] ${MIC_BG[micState]} ${micState === 'on' ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {micLabel}
      </button>
    </>
  )
}

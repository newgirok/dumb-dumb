'use client'

import { useEffect, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import CheapRuler from 'cheap-ruler'
import { initWorldMap, type WorldContext } from '@/lib/map/context'
import { setupCamera, followPlayer } from '@/lib/map/camera'
import { getCurrentPosition } from '@/lib/geo/currentPosition'
import { watchPosition } from '@/lib/geo/watchPosition'
import { snapToRoad } from '@/lib/map/snap'
import { createCharacterMesh, loadCharacter, type Character } from '@/lib/three/character'
import { disposeBinLoader } from '@/lib/three/binLoader'
import { PruneManager } from '@/lib/three/prune'
import { connectWorld, type WorldConnection, type PeerPosition } from '@/lib/realtime/world'
import { isValidMove, type StampedPos } from '@/lib/geo/validator'
import { currentSectorId } from '@/lib/geo/sector'
import { VoiceManager, type PeerAudioInfo } from '@/lib/voice/livekit'
import { currentUser, ensureSession } from '@/lib/auth/session'
import { useTransitionReady } from '@/components/transition/PageTransition'
import * as THREE from 'three'

const ORIGIN: [number, number] = [126.9784, 37.5666]
// 도보 속도(3 m/s)를 위도 1도≈111,320m 기준 degrees/sec로 환산 — 기존
// MOVE_SPEED(0.00003)는 "프레임당" 값인데 매 requestAnimationFrame(≈60fps)마다
// 그대로 더해져서 실제로는 초속 200m(시속 720km)로 움직이던 버그였음.
// dt(경과 초)를 곱해 프레임레이트와 무관하게 항상 같은 실제 속도로 걷도록 함
const WALK_SPEED_DEG_PER_SEC = 3 / 111320
// 위치 전송 주기. 도보 3m/s 기준 5Hz면 60cm마다 갱신이라, 수신 측 보간과
// 합치면 10Hz와 체감 차이가 없으면서 메시지 수는 절반이다
const BROADCAST_INTERVAL = 200
// 마지막으로 보낸 위치에서 이만큼 안 움직였으면 전송을 생략한다.
// 가만히 서 있는 동안 초당 5건씩 나가던 걸 0건으로 만든다
const MIN_BROADCAST_MOVE_M = 0.3
// 피어 위치를 목표로 따라잡는 속도(1/초). 전송 주기보다 빨라야 끊기지 않는다
const PEER_LERP = 9
// 목표와 이만큼 떨어져 있으면 걷는 중으로 보고 run 애니메이션을 재생
const PEER_MOVING_M = 0.15
// 마지막 이동 후 이 시간(ms) 안이면 걷는 중으로 보고 run 애니메이션을 재생.
// 키보드 입력과 GPS 갱신을 같은 방식으로 다루려고 입력이 아닌 "실제로 위치가
// 갱신됐는지"를 기준으로 삼음
const MOVING_GRACE_MS = 250
const VOICE_SECTOR_PREFIX = 'voice-'

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
  const playerCharRef = useRef<Character | null>(null)
  const otherMeshes = useRef<Map<string, THREE.Object3D>>(new Map())
  // otherMeshes와 같은 키를 쓰는 병행 맵 — prune은 Object3D만 알기 때문에
  // 애니메이션 갱신·정리에 필요한 Character를 따로 들고 있는다
  const otherChars = useRef<Map<string, Character>>(new Map())
  // 수신한 위치는 목표로만 두고, 렌더 루프에서 부드럽게 따라간다.
  // 바로 moveTo하면 전송 주기마다 뚝뚝 끊겨 보인다
  const peerTargets = useRef<Map<string, { lng: number; lat: number }>>(new Map())
  const lastMoveAtRef = useRef(0)
  const lastSentRef = useRef<[number, number] | null>(null)
  const worldRef = useRef<WorldConnection | null>(null)
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

    // 새로고침 직후엔 액세스 토큰이 메모리에 없다. 리프레시로 복구한 뒤
    // 그 토큰으로 월드 소켓에 붙는다
    void ensureSession().then(() => {
      userIdRef.current = currentUser()?.id ?? null
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

        // ref-assets 로드는 비동기라 캐릭터가 붙기 전에도 지도·이동은 동작해야
        // 함. 로드에 실패하면 최소한 위치는 보이도록 절차적 메시로 폴백
        loadCharacter(0x4f8ef7)
          .catch((err) => {
            console.error('캐릭터 에셋 로드 실패 — 폴백 메시 사용', err)
            return null
          })
          .then((char) => {
            if (destroyed) {
              char?.dispose()
              return
            }
            playerCharRef.current = char
            playerMeshRef.current = char ? char.group : createCharacterMesh(0x4f8ef7)
            ctx.addAt(playerMeshRef.current, posRef.current[0], posRef.current[1])
          })

        pruneRef.current = new PruneManager(posRef.current[0], posRef.current[1])

        // 캐릭터 로드가 진행 중인 유저 id
        const pendingPeers = new Set<string>()

        // 캐릭터 로드가 진행 중인 유저 id
        const pendingPeersLoading = new Set<string>()

        /** 서버가 섹터 단위로 묶어 내려주는 위치 묶음을 반영한다 */
        const applyPositions = (positions: PeerPosition[]) => {
          if (destroyed) return
          for (const pos of positions) {
            if (pos.userId === userIdRef.current) continue

            const known = otherMeshes.current.get(pos.userId)
            if (known) {
              peerTargets.current.set(pos.userId, { lng: pos.lng, lat: pos.lat })
              continue
            }
            // 경계 섹터에서는 같은 유저가 한 틱에 두 번 올 수 있다.
            // 로딩 중인 유저는 건너뛰어야 캐릭터가 중복 생성되지 않는다
            if (pendingPeersLoading.has(pos.userId)) continue
            pendingPeersLoading.add(pos.userId)

            void loadCharacter(0xf74f4f).then((char) => {
              pendingPeersLoading.delete(pos.userId)
              if (destroyed) {
                char.dispose()
                return
              }
              ctx.addAt(char.group, pos.lng, pos.lat)
              char.group.userData = { lng: pos.lng, lat: pos.lat }
              otherMeshes.current.set(pos.userId, char.group)
              otherChars.current.set(pos.userId, char)
              peerTargets.current.set(pos.userId, { lng: pos.lng, lat: pos.lat })
            })
          }
        }

        worldRef.current = connectWorld({
          onPositions: applyPositions,
          onChat: () => {
            // Phase 5에서 말풍선 연결 예정
          },
        })

        // 음성 룸 섹터 동기화
        const syncVoice = async (lng: number, lat: number) => {
          const sectorId = currentSectorId(lng, lat)
          const roomName = `${VOICE_SECTOR_PREFIX}${sectorId}`
          if (voiceSectorRef.current === roomName) return
          voiceSectorRef.current = roomName
          const userId = userIdRef.current
          if (!userId || !voiceRef.current) return
          await voiceRef.current.connect(roomName)
        }

        syncVoice(posRef.current[0], posRef.current[1])

        broadcastTimer.current = setInterval(async () => {
          const [lng, lat] = posRef.current
          const userId = userIdRef.current
          if (!userId) return

          const now = Date.now()
          const stamp: StampedPos = { lng, lat, ts: now }
          if (!isValidMove(lastStampRef.current, stamp)) return
          lastStampRef.current = stamp

          // 가만히 서 있으면 보낼 게 없다. 수신 측은 마지막 위치를 계속
          // 유지하므로 생략해도 화면이 달라지지 않는다
          const sent = lastSentRef.current
          if (sent && distanceM(sent[0], sent[1], lng, lat) < MIN_BROADCAST_MOVE_M) return
          lastSentRef.current = [lng, lat]

          // 섹터 판정과 속도 검증은 서버가 한다. 여기서는 좌표만 올린다
          worldRef.current?.move(lng, lat)

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
        onRegisterChatHandler((msg) => {
          worldRef.current?.chat(msg)
        })

        // 키보드(웹, 가짜 이동)와 GPS(모바일, 실제 이동) 양쪽이 공유하는
        // "새 위치 적용" 로직 — 도로 스냅, 섹터/음성 동기화, 프루닝까지 동일하게 처리.
        // 카메라 bearing은 ADR 007에 따라 항상 고정값이라 별도 계산 없음
        const movePlayerTo = (targetLng: number, targetLat: number) => {
          const [sLng, sLat] = snapToRoad(ctx.map, targetLng, targetLat)

          posRef.current = [sLng, sLat]
          lastMoveAtRef.current = performance.now()
          // 캐릭터 에셋 로드가 끝나기 전에도 GPS 갱신은 들어올 수 있음
          if (playerMeshRef.current) ctx.moveTo(playerMeshRef.current, sLng, sLat)

          followPlayer(ctx.map, sLng, sLat)
          syncVoice(sLng, sLat)
          pruneRef.current?.tick(ctx.scene, sLng, sLat, otherMeshes.current)
        }
        movePlayerToRef.current = movePlayerTo

        if (mobile) {
          stopWatchingGps = watchPosition(
            (lng, lat) => movePlayerTo(lng, lat),
            () => setGpsError(true),
          )
        }

        // 애니메이션 믹서는 모바일(GPS 이동)에서도 매 프레임 돌아야 하므로
        // 키보드 이동을 쓰지 않는 경우에도 루프 자체는 항상 돌린다
        const loop = (now: number) => {
          if (destroyed) return
          const dt = lastFrameRef.current == null ? 0 : (now - lastFrameRef.current) / 1000
          lastFrameRef.current = now

          if (!mobile) {
            const { dx, dy } = inputRef.current
            if ((dx !== 0 || dy !== 0) && dt > 0) {
              const [lng, lat] = posRef.current
              const dist = WALK_SPEED_DEG_PER_SEC * dt
              movePlayerTo(lng + dx * dist, lat + (-dy) * dist)
            }
          }

          playerCharRef.current?.setMoving(now - lastMoveAtRef.current < MOVING_GRACE_MS)
          playerCharRef.current?.update(dt)

          // 피어를 수신 위치로 부드럽게 이동시킨다. 전송 주기(200ms)보다 빠르게
          // 따라잡아야 다음 패킷이 올 때쯤 목표에 닿아 끊김이 안 보인다
          const lerp = Math.min(1, PEER_LERP * dt)
          for (const [id, obj] of otherMeshes.current) {
            const target = peerTargets.current.get(id)
            if (!target) continue
            const cur = obj.userData as { lng?: number; lat?: number }
            if (cur.lng == null || cur.lat == null) continue
            const lng = cur.lng + (target.lng - cur.lng) * lerp
            const lat = cur.lat + (target.lat - cur.lat) * lerp
            obj.userData = { lng, lat }
            ctx.moveTo(obj, lng, lat)
            otherChars.current.get(id)?.setMoving(
              distanceM(lng, lat, target.lng, target.lat) > PEER_MOVING_M,
            )
          }

          for (const [id, char] of otherChars.current) {
            // prune이 otherMeshes에서 지운 유저는 Character도 함께 정리
            if (!otherMeshes.current.has(id)) {
              char.dispose()
              otherChars.current.delete(id)
              peerTargets.current.delete(id)
              continue
            }
            char.update(dt)
          }

          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
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
      worldRef.current?.disconnect()
      worldRef.current = null
      voiceRef.current?.disconnect()
      playerCharRef.current?.dispose()
      for (const char of otherChars.current.values()) char.dispose()
      otherChars.current.clear()
      disposeBinLoader()
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

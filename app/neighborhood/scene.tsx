'use client'

// 내 동네 시험판 — 내 위치 주변의 실제 길(OpenStreetMap)을 여름 마을 화풍으로 깔고,
// 1m = 1m로 걸으며 미니맵과 맞춰 본다. 걷는 만큼 앞쪽 구역을 이어 깐다(끝이 없다).
// 같은 동네(반경 200m)에 들른 사람이 실제 자리에 보인다. 건물·소품은 아직 없다.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import MiniMap, { type MiniMapTrack } from '@/components/world/MiniMap'
import { getCurrentPosition } from '@/lib/geo/currentPosition'
import { watchPosition } from '@/lib/geo/watchPosition'
import { createLocalFrame, type LocalFrame } from '@/lib/geo/localFrame'
import { createSkin, createSkinAnimation, loadBinGeometry } from '@/lib/three/binLoader'
import { createRampMaterial, createSharedUniforms, createSkyMaterial, loadKtx2Lut } from '../summer-afternoon/rampShader'
import { createThirdPerson, type ThirdPerson } from '../summer-afternoon/thirdPerson'
import { createSunLight } from '../summer-afternoon/shadows'
import { createFinalPass } from '../summer-afternoon/postprocess'
import { blendKidAnimation, createKidAnimation, type KidAnimation } from '../summer-afternoon/kidAnimation'
import { createRemotes, type Remotes } from '../summer-afternoon/remotes'
import { baseDevicePixelRatio, configure, isMobileDevice } from '../summer-afternoon/setup'
import { connectScene, type SceneConnection } from '@/lib/realtime/scene'
import { createGroundStream, type GroundStream } from './stream'

/** 위치를 못 받으면 서울시청에서 시작한다(미니맵 기본 중심과 같다) */
const FALLBACK: [number, number] = [126.9779, 37.5665]
/** 첫 위치를 기다리는 시간 — PC는 와이파이로 위치를 잡는 데 8초를 넘기곤 한다 */
const FIRST_FIX_TIMEOUT_MS = 15_000
/** 원점은 0.001° 격자에 맞춘다 — 정확한 내 위치를 원점으로 두지 않고, 같은 동네면 같은 바닥이 나온다 */
const ORIGIN_GRID = 0.001
/** 휴대폰 GPS 따라가기 — 이 안이면 서고, 여기서 이만큼 더 멀어지면 최고 속도로 걷는다 */
const GPS_STOP_M = 1.5
const GPS_FULL_M = 4
/** GPS가 한 번에 이보다 멀리 튀면(지하철·차) 걸어가지 않고 곧장 옮긴다 */
const GPS_TELEPORT_M = 150
/** 캐릭터가 서는 바닥 — 평평하니 충돌은 끝없이 넓은 평면 하나로 충분하다 */
const COLLIDER_SIZE = 200_000

type Phase = 'locating' | 'loading' | 'playing' | 'error'

function motionOf(controller: ThirdPerson) {
  return controller.airborne ? 1 : controller.bored ? 2 : 0
}

export default function NeighborhoodScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<MiniMapTrack | null>(null)
  const [phase, setPhase] = useState<Phase>('locating')
  const [fallback, setFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const mobile = isMobileDevice()
    const shared = createSharedUniforms()
    const scene = new THREE.Scene()
    const sun = createSunLight(scene, shared)
    scene.add(new THREE.HemisphereLight('#33434f', '#737575', 0.7))
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 175)

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: false,
    })
    renderer.setPixelRatio(baseDevicePixelRatio(mobile))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // 여름 마을과 같은 후처리 — LUT만 쓰고 인트로 가림막은 없다
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace }),
    )
    composer.addPass(new RenderPass(scene, camera))
    const finalPass = createFinalPass()
    finalPass.uniforms.uIntro.value = 0
    composer.addPass(finalPass)
    composer.addPass(new SMAAPass(1, 1))
    composer.addPass(new OutputPass())

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h)
      composer.setSize(w, h)
      finalPass.uniforms.uResolution.value.set(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let destroyed = false
    let raf = 0
    let frame: LocalFrame | null = null
    let controller: ThirdPerson | null = null
    let kid: THREE.SkinnedMesh | null = null
    let kidAnimation: KidAnimation | null = null
    let mixer: THREE.AnimationMixer | null = null
    let sky: THREE.Mesh | null = null
    let stream: GroundStream | null = null
    let remotes: Remotes | null = null
    let connection: SceneConnection | null = null
    let gpsTarget: { x: number; z: number } | null = null
    let unwatch = () => {}
    const disposables: { dispose(): void }[] = []
    const abort = new AbortController()
    const track: MiniMapTrack = { lng: 0, lat: 0, bearing: 0 }

    // 휴대폰은 실제 GPS 위치로 걸어간다 — 가까우면 서고, 멀수록 빨라진다
    const steer = () => {
      if (!gpsTarget || !kid) return null
      const dx = gpsTarget.x - kid.position.x
      const dz = gpsTarget.z - kid.position.z
      const distance = Math.hypot(dx, dz)
      if (distance < GPS_STOP_M) return null
      const k = Math.min(1, (distance - GPS_STOP_M) / GPS_FULL_M) / distance
      return { x: dx * k, z: dz * k }
    }

    ;(async () => {
      const fix = await getCurrentPosition(FALLBACK, FIRST_FIX_TIMEOUT_MS)
      if (destroyed) return
      // 실패하면 넘겨준 배열 그대로 돌아온다
      setFallback(fix === FALLBACK)
      const local = createLocalFrame(
        Math.round(fix[0] / ORIGIN_GRID) * ORIGIN_GRID,
        Math.round(fix[1] / ORIGIN_GRID) * ORIGIN_GRID,
      )
      const start = local.toLocal(fix[0], fix[1])
      setPhase('loading')

      const loader = new THREE.TextureLoader().setPath('/ref-assets/images/')
      const ktx2 = new KTX2Loader().setTranscoderPath('/ref-assets/libs/basis/').detectSupport(renderer)
      disposables.push(ktx2)
      const bins = Promise.all(
        ['skydome', 'kid', 'kid-bones', 'kid-idle', 'kid-run', 'kid-air', 'kid-bored'].map((name) => loadBinGeometry(name)),
      )
      const [rampTex, noisesTex, detailsTex, skyTex, cloudsTex, flowTex, lut] = await Promise.all([
        loader.loadAsync('ramps.png'),
        loader.loadAsync('terrain-noises-highq.png'),
        loader.loadAsync('terrain-details-highq.png'),
        loader.loadAsync('sky-srgb-highq.png'),
        loader.loadAsync('clouds_top-highq.png'),
        ktx2.loadAsync('/ref-assets/images/skyflow-highq.ktx2').catch(() => null),
        loadKtx2Lut('/ref-assets/images/lut.CUBE_1.LUT.ktx2'),
      ])
      const [skyGeo, kidGeo, kidBones, kidIdle, kidRun, kidAir, kidBored] = await bins
      if (destroyed) return

      // 여름 마을과 같은 텍스처 옵션
      configure(rampTex, { srgb: true, colordata: true })
      configure(noisesTex, { repeat: true })
      configure(detailsTex, { repeat: true })
      configure(skyTex, { srgb: true, repeat: true })
      configure(cloudsTex, { repeat: true })
      if (flowTex) configure(flowTex, { raw: true, repeat: true })
      shared.tCloudsTop.value = cloudsTex
      finalPass.uniforms.tLUT.value = lut
      finalPass.uniforms.uLUTSize.value = lut.image.width
      finalPass.uniforms.uUseLUT.value = 1

      const skyMaterial = createSkyMaterial(skyTex, flowTex, shared)
      disposables.push(skyMaterial)
      sky = new THREE.Mesh(skyGeo, skyMaterial)
      sky.scale.setScalar(2)
      sky.renderOrder = -1000
      sky.frustumCulled = false
      scene.add(sky)

      // 바닥 — 선 자리 둘레 구역부터 깔고, 걸으면 앞쪽을 이어 깐다
      stream = createGroundStream({
        scene,
        frame: local,
        textures: { ramp: rampTex, noises: noisesTex, details: detailsTex },
        shared,
        signal: abort.signal,
      })
      disposables.push(stream)
      await stream.prime(start.x, start.z)
      if (destroyed) return
      const colliderGeometry = new THREE.PlaneGeometry(COLLIDER_SIZE, COLLIDER_SIZE).rotateX(-Math.PI / 2)
      disposables.push(colliderGeometry)

      const seed = Math.random() * 4
      const kidMaterial = createRampMaterial(rampTex, shared, {
        isCharacter: true,
        seed,
        shadowSide: THREE.FrontSide,
      })
      disposables.push(kidMaterial)
      kid = createSkin(kidGeo, kidBones, kidMaterial)
      kid.castShadow = true
      kid.receiveShadow = true
      kid.frustumCulled = false
      scene.add(kid)
      mixer = new THREE.AnimationMixer(kid)
      const kidClips = {
        idle: createSkinAnimation('idle', kidIdle),
        run: createSkinAnimation('run', kidRun),
        air: createSkinAnimation('air', kidAir),
        bored: createSkinAnimation('bored', kidBored),
      }
      kidAnimation = createKidAnimation(mixer, kidClips)
      mixer.setTime(Math.random() * 100)

      // 내 실제 위치에 세우고, 처음엔 북쪽을 바라본다(카메라는 남쪽 뒤)
      kid.rotation.y = Math.PI
      controller = createThirdPerson({
        camera,
        character: kid,
        collider: new THREE.Mesh(colliderGeometry),
        domElement: renderer.domElement,
        start: new THREE.Vector3(start.x, 0, start.z),
        mobile,
        steer,
      })
      controller.update(0)
      controller.startIntro()
      const me = kid
      const walker = controller
      // 휴대폰은 늘 GPS를 따라 걷는다. PC는 처음 위치를 못 받았을 때만 기다렸다가,
      // 첫 진짜 위치로 한 번 옮기고 그 뒤로는 키보드로 걷는다(GPS 첫 수신이 늦는 경우)
      if (mobile || fix === FALLBACK) {
        unwatch = watchPosition((lng, lat) => {
          const target = local.toLocal(lng, lat)
          setFallback(false)
          if (!mobile) {
            walker.snap(target.x, target.z)
            unwatch()
            unwatch = () => {}
            return
          }
          gpsTarget = target
          // 지하철·차로 멀리 옮겨 갔으면 걸어가지 않고 그 자리로 옮긴다(앞쪽 구역은 다음 프레임부터 깔린다)
          if (Math.hypot(target.x - me.position.x, target.z - me.position.z) > GPS_TELEPORT_M) {
            walker.snap(target.x, target.z)
          }
        })
      }
      // 같은 동네 사람들 — 원점이 저마다 달라 실제 좌표(경위도)로 주고받고, 받은 위치는
      // 내 원점 기준으로 바꿔 세운다. 서버에 닿지 못하면 혼자인 채로 돈다
      const peers = createRemotes({
        scene,
        geometry: kidGeo,
        bones: kidBones,
        clips: kidClips,
        createMaterial: (s) =>
          createRampMaterial(rampTex, shared, { isCharacter: true, seed: s, shadowSide: THREE.FrontSide }),
      })
      remotes = peers
      connection = connectScene(
        {
          read: () => {
            const at = local.toLngLat(me.position.x, me.position.z)
            return {
              p: [at.lng, at.lat, me.position.y],
              // 원본 spherical — 극각은 늘 수평, 방위는 캐릭터 등 뒤(로컬 축은 모두 동쪽 +x·북쪽 −z)
              r: [Math.PI / 2, (me.rotation.y - Math.PI) % (Math.PI * 2)],
              a: motionOf(walker),
              s: seed,
            }
          },
          onReset: () => peers.clear(),
          onUpdate: ({ p, ...rest }) => {
            if (!p) return peers.apply(rest)
            const at = local.toLocal(p[0], p[1])
            peers.apply({ ...rest, p: [at.x, p[2], at.z] })
          },
          onLeave: (id) => peers.remove(id),
        },
        'neighborhood',
      )

      frame = local
      trackRef.current = track
      setPhase('playing')
    })().catch((err) => {
      if (destroyed) return
      setError(String(err))
      setPhase('error')
    })

    const forward = new THREE.Vector3()
    const startTime = performance.now()
    let last = startTime
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const ratio = Math.min(5, dt * 60)
      shared.time.value = (now - startTime) / 1000
      if (controller && kid && kidAnimation && mixer && frame) {
        controller.update(dt)
        blendKidAnimation(kidAnimation, controller.velocityHorizontal, motionOf(controller), ratio)
        shared.charPos.value.copy(kid.position)
        shared.charSpeed.value = controller.velocityHorizontal
        sun.follow(camera.position, controller.target)
        mixer.update(dt)

        // 미니맵 — 캐릭터 자리, 화면이 보는 쪽이 위(북쪽 기준 시계방향 도)
        camera.getWorldDirection(forward)
        const at = frame.toLngLat(kid.position.x, kid.position.z)
        track.lng = at.lng
        track.lat = at.lat
        track.bearing = (Math.atan2(forward.x, -forward.z) * 180) / Math.PI

        stream?.update(kid.position.x, kid.position.z)
        remotes?.update(ratio, camera, kid.position)
      }
      sky?.position.copy(camera.position)
      composer.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      destroyed = true
      abort.abort()
      cancelAnimationFrame(raf)
      ro.disconnect()
      unwatch()
      connection?.dispose()
      remotes?.dispose()
      controller?.dispose()
      mixer?.stopAllAction()
      trackRef.current = null
      disposables.forEach((d) => d.dispose())
      composer.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [attempt])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#FFFDF8] select-none">
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      <div className="absolute left-4 top-4 flex items-center gap-3 text-sm text-[#716c66]">
        <span className="rounded-full bg-[#f9efdc]/90 px-3 py-1 font-bold shadow-[2px_2px_0_0_#716c66]">
          어슬렁 · 내 동네 <span className="font-normal">시험판</span>
        </span>
        <Link href="/" className="rounded-full bg-[#f9efdc]/90 px-3 py-1 shadow-[2px_2px_0_0_#716c66]">
          여름 마을로
        </Link>
      </div>

      {fallback && phase === 'playing' && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#716c66]/85 px-4 py-1.5 text-sm text-[#f9efdc]">
          위치를 받지 못해 서울시청에서 시작했어요
        </div>
      )}

      {phase !== 'playing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#FFFDF8] text-[#8d8981]">
          {phase === 'error' ? (
            <>
              <p className="text-lg">동네 길을 불러오지 못했어요</p>
              <p className="max-w-md text-center text-xs text-[#b5a997]">{error}</p>
              <button
                type="button"
                className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
                onClick={() => {
                  setError(null)
                  setPhase('locating')
                  setAttempt((a) => a + 1)
                }}
              >
                다시 시도
              </button>
            </>
          ) : (
            <p className="text-lg">{phase === 'locating' ? '내 위치를 찾는 중…' : '동네 길을 까는 중…'}</p>
          )}
        </div>
      )}

      <p className="absolute bottom-2 left-3 text-[11px] text-[#716c66]/80">
        지도 데이터{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
          © OpenStreetMap
        </a>{' '}
        ·{' '}
        <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer" className="underline">
          OpenMapTiles
        </a>{' '}
        ·{' '}
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer" className="underline">
          OpenFreeMap
        </a>
      </p>

      {phase === 'playing' && <MiniMap track={trackRef} />}
    </div>
  )
}

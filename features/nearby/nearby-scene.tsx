'use client'

// 내 주변(베타) — 내 위치 주변의 실제 길(OpenStreetMap)을 플레이 씬 화풍으로 깔고,
// 1m = 1m로 걸으며 펼침 지도(M)와 맞춰 본다. 걷는 만큼 앞쪽 구역을 이어 깐다(끝이 없다).
// 같은 동네(반경 200m)에 들른 사람이 실제 자리에 보인다. 건물·소품은 아직 없다.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import PaperMap, { GpsBadge, MapIcon, useMapHotkey, type MapTrack } from '@/components/map/paper-map'
import Loader, { waitSpinTurn } from '@/components/ui/loader'
import GpsSteps from '@/components/location/gps-steps'
import { createGpsTracker, isWalkableFix, useGpsSnapshot, waitForStartFix, type GpsTracker } from '@/lib/geo/gps'
import { detectGpsEnv, startWaitNote, walkNote, type GpsEnv } from '@/lib/geo/gps-messages'
import { createLocalFrame, type LocalFrame } from '@/lib/geo/local-frame'
import { createSkin, createSkinAnimation, loadBinGeometry } from '@/lib/three/bin-loader'
import { createRampMaterial, createSharedUniforms, createSkyMaterial, loadKtx2Lut } from '@/lib/three/ramp-shader'
import { createThirdPerson, type ThirdPerson } from '@/lib/three/third-person'
import { createSunLight } from '@/lib/three/shadows'
import { createFinalPass } from '@/lib/three/postprocess'
import { blendKidAnimation, createKidAnimation, type KidAnimation } from '@/lib/three/kid-animation'
import { createRemotes, type Remotes } from '@/lib/three/remote-players'
import { baseDevicePixelRatio, configure, isMobileDevice } from '@/lib/three/setup'
import { connectRelay, type RelayConnection } from '@/lib/realtime/relay'
import { createGroundStream, type GroundStream } from './ground-stream'

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

export default function NearbyScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<MapTrack | null>(null)
  const [phase, setPhase] = useState<Phase>('locating')
  const [attempt, setAttempt] = useState(0)
  const [gps, setGps] = useState<GpsTracker | null>(null)
  const gpsView = useGpsSnapshot(gps)
  // 펼침 지도(M) — 지도가 화면에 있는 동안은 키보드·마우스 조작을 끈다(휴대폰 GPS 걷기는 계속된다).
  // 접을 때는 다 접혀 배경(dim)까지 걷힌 뒤에 켠다
  const [mapOpen, setMapOpen] = useState(false)
  const mapShownRef = useRef(false)
  const controllerRef = useRef<ThirdPerson | null>(null)
  const [env, setEnv] = useState<GpsEnv | null>(null)
  const [mobile, setMobile] = useState(false)
  // 지도 데이터 출처 — 길이 깔린 동안만 보이고, OSM 표기 지침대로 5초 뒤 구석의 (i)로 접힌다(누르면 다시 편다)
  const [creditOpen, setCreditOpen] = useState(true)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    // 로더가 뜬 때 — 준비가 일찍 끝나도 스피너가 한 바퀴는 돈 뒤에 걷는다
    const loaderSince = performance.now()

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

    // 플레이 씬과 같은 후처리 — LUT만 쓰고 인트로 가림막은 없다
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
    let connection: RelayConnection | null = null
    let gpsTarget: { x: number; z: number } | null = null
    let unwatch = () => {}
    const disposables: { dispose(): void }[] = []
    const abort = new AbortController()
    const track: MapTrack = { lng: 0, lat: 0, bearing: 0 }
    // 개발 모드(StrictMode)는 이펙트를 두 번 돌린다 — 추적기는 이펙트 안에서 만들고 버린다.
    // 휴대폰은 걷는 동안 위치가 계속 와야 하므로 한참 안 오면 '멈춤'으로 알린다(PC는 위치가 거의 안 바뀐다)
    const gps = createGpsTracker({ watchStale: mobile })
    setGps(gps)

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

    // 위치를 받을 때까지 대기 화면에서 기다린다 — 가짜 자리(기본 좌표)로 넘어가지 않는다
    const wait = waitForStartFix(gps)

    ;(async () => {
      const fix = await wait.promise
      if (destroyed) return
      const local = createLocalFrame(Math.round(fix.lng / ORIGIN_GRID) * ORIGIN_GRID, Math.round(fix.lat / ORIGIN_GRID) * ORIGIN_GRID)
      const start = local.toLocal(fix.lng, fix.lat)
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

      // 플레이 씬과 같은 텍스처 옵션
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
      controllerRef.current = controller
      controller.setEnabled(!mapShownRef.current)
      const me = kid
      const walker = controller
      // 휴대폰은 늘 GPS를 따라 걷고, PC는 시작한 자리에서 키보드로 걷는다(흐린 위치로 시작했어도 나중에 옮기지 않는다).
      // ±50m 밖 위치(건물 사이·와이파이·IP 추정)로는 걷지도 옮기지도 않는다
      unwatch = gps.subscribe(({ fix: next }) => {
        if (!mobile || !next || !isWalkableFix(next)) return
        const target = local.toLocal(next.lng, next.lat)
        gpsTarget = target
        // 지하철·차로 멀리 옮겨 갔으면 걸어가지 않고 그 자리로 옮긴다(앞쪽 구역은 다음 프레임부터 깔린다)
        if (Math.hypot(target.x - me.position.x, target.z - me.position.z) > GPS_TELEPORT_M) {
          walker.snap(target.x, target.z)
        }
      })
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
      connection = connectRelay(
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
        'proximity',
      )

      frame = local
      trackRef.current = track
      await waitSpinTurn(loaderSince)
      if (destroyed) return
      setPhase('playing')
    })().catch((err) => {
      if (destroyed) return
      console.error(err)
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

        // 펼침 지도의 '나' — 캐릭터 자리와 화면이 보는 쪽(북쪽 기준 시계방향 도)
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
      wait.cancel()
      gps.dispose()
      connection?.dispose()
      remotes?.dispose()
      controller?.dispose()
      controllerRef.current = null
      mixer?.stopAllAction()
      trackRef.current = null
      disposables.forEach((d) => d.dispose())
      composer.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [attempt])

  // 펼치면 곧바로 조작을 끄고, 접으면 다 접혀 배경까지 걷힌 뒤(onClosed)에 켠다
  useEffect(() => {
    if (!mapOpen) return
    mapShownRef.current = true
    controllerRef.current?.setEnabled(false)
  }, [mapOpen])
  const onMapClosed = () => {
    mapShownRef.current = false
    controllerRef.current?.setEnabled(true)
  }

  useMapHotkey(phase === 'playing', setMapOpen)

  useEffect(() => {
    if (phase !== 'playing') return
    setCreditOpen(true)
    const timer = window.setTimeout(() => setCreditOpen(false), 5000)
    return () => window.clearTimeout(timer)
  }, [phase])

  // 기기 정보는 브라우저에서만 안다 — 서버 렌더와 첫 화면을 맞추려고 마운트 뒤에 읽는다
  useEffect(() => {
    setEnv(detectGpsEnv())
    setMobile(isMobileDevice())
  }, [])

  const waiting = phase === 'locating' && gpsView && env ? startWaitNote(gpsView, env) : null
  const notice = phase === 'playing' && gpsView ? walkNote(gpsView, { mobile }) : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#FFFDF8] select-none">
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

      {notice && !mapOpen && (
        // 좁은 화면에서는 버튼이 글 아래 줄로 내려간다 — 오른쪽 위 지도 버튼과 겹치지 않게 비켜 둔다
        <div className="absolute left-4 right-16 top-4 z-10 mx-auto flex w-fit max-w-[36rem] flex-wrap items-center justify-end gap-x-3 gap-y-1.5 rounded-[18px] bg-[#716c66]/90 py-2 pl-4 pr-2 text-[13px] text-[#f9efdc] sm:right-4 sm:max-w-[46rem] sm:text-sm">
          <span className="min-w-[12rem] flex-1 [word-break:keep-all]">{notice}</span>
          <button
            type="button"
            className="shrink-0 rounded-full bg-[#f9efdc] px-3 py-0.5 text-[13px] text-[#5d5a57]"
            onClick={() => setMapOpen(true)}
          >
            지도 보기
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <nav className="absolute right-5 top-5 z-20 origin-top-right [@media(pointer:coarse)]:scale-[1.2] [@media(min-width:2400px)_and_(min-height:1300px)]:scale-[1.3]">
          <button
            type="button"
            aria-label="지도 펼치기 (M)"
            title="지도 펼치기 (M)"
            className="relative block h-8 w-8 rotate-[10deg] rounded-[5px] bg-[#f9efdc] shadow-[2px_2px_0_0_#716c66] transition-[scale,translate,box-shadow] duration-150 ease-[cubic-bezier(0.33,1,0.68,1)] [-webkit-tap-highlight-color:transparent] hover:scale-110 focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#5d5a57] active:translate-x-0.5 active:translate-y-0.5 active:scale-110 active:shadow-none"
            onClick={() => setMapOpen((open) => !open)}
          >
            <MapIcon className="absolute left-1.5 top-[7px] -rotate-[10deg]" />
            <GpsBadge snapshot={gpsView} />
          </button>
        </nav>
      )}

      {/* 로더 — 위치를 받을 때까지 기다리고(받을 수 없는 상태면 스피너 없이 안내와 버튼만), 받은 뒤 길을 깐다 */}
      {phase === 'error' && (
        <Loader spinning={false} message="내 주변 길을 불러오지 못했어요" hint="잠시 후 다시 시도해 주세요">
          <button
            type="button"
            className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
            onClick={() => {
              setPhase('locating')
              setAttempt((a) => a + 1)
            }}
          >
            다시 시도
          </button>
        </Loader>
      )}
      {phase === 'locating' && (
        <Loader
          spinning={waiting?.tone !== 'off'}
          message={waiting?.title ?? '위치를 찾고 있어요…'}
          hint={waiting?.hint}
          detail={waiting?.steps && <GpsSteps steps={waiting.steps} />}
        >
          {waiting?.action && (
            <button
              type="button"
              className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
              onClick={() => (waiting.action === 'reload' ? window.location.reload() : gps?.retry())}
            >
              {waiting.action === 'reload' ? '새로고침' : '다시 시도'}
            </button>
          )}
        </Loader>
      )}
      {phase === 'loading' && <Loader message="내 주변 길을 깔고 있어요. 잠시만 기다려 주세요." />}

      {phase === 'playing' && (
        <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[11px] text-[#716c66]/80">
          <button
            type="button"
            aria-label="지도 데이터 출처"
            aria-expanded={creditOpen}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f9efdc]/90 font-serif text-[11px] font-bold italic text-[#716c66] shadow-[1px_1px_0_0_#716c66] pointer-coarse:h-7 pointer-coarse:w-7"
            onClick={() => setCreditOpen((open) => !open)}
          >
            i
          </button>
          {creditOpen && (
            <span>
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
            </span>
          )}
        </div>
      )}

      {phase === 'playing' && gps && (
        <PaperMap open={mapOpen} onClose={() => setMapOpen(false)} onClosed={onMapClosed} gps={gps} track={trackRef} title="지도" />
      )}
    </div>
  )
}

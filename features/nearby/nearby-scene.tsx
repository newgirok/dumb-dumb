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
import Loader, { LOADER_EXIT_MS, useLoadingSteps, waitSpinTurn } from '@/components/ui/loader'
import GpsSteps from '@/components/location/gps-steps'
import {
  createGpsTracker,
  isWalkableFix,
  queryGpsPermission,
  useGpsSnapshot,
  waitForStartFix,
  type GpsSnapshot,
  type GpsTracker,
  type StartWait,
} from '@/lib/geo/gps'
import { detectGpsEnv, motionAskNote, startWaitNote, walkNote, type GpsEnv } from '@/lib/geo/gps-messages'
import { createStepTracker, queryMotionPermission, requestMotionPermission, type StepTracker } from '@/lib/geo/steps'
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
/**
 * 휴대폰 GPS 따라가기 — 이 안이면 서고, 여기서 이만큼 더 멀어지면 최고 속도로 걷는다. 차도 위 목표는 폭 1m인 인도
 * 가운데로 옮기므로 그 안에 들어가 서도록 서는 거리를 짧게 둔다(멈춰 섰다 다시 걷는 건 GPS_STEP_M이 막는다)
 */
const GPS_STOP_M = 0.3
const GPS_FULL_M = 4
/** GPS 거르기(칼만 필터) — 위치 사이에 사람이 초당 이만큼 움직일 수 있다고 보고, 시간이 지날수록 새 위치를 더 믿는다 */
const GPS_MOTION_MPS = 2
/** 지금 자리에서 정확도의 두 배(최소 이만큼)보다 멀리 찍힌 위치는 튄 값으로 보고 섞지 않는다 */
const GPS_JUMP_MIN_M = 3
/** 튄 위치가 잇달아 이만큼 같은 곳에 찍히면 그리로 옮겨 간 것으로 본다(정확도가 갑자기 좋아졌을 때, 지하철·차) */
const GPS_JUMP_COUNT = 3
/** 서 있던 캐릭터는 지금 자리가 이만큼(정확도의 절반이 더 크면 그만큼) 떨어져야 걷기 시작한다 */
const GPS_STEP_M = 3
/**
 * 걸을 때 붙인 자리가 지난번 붙인 자리에서 이보다 멀리 옮겨 가면(차도 위에서 길 건너편 인도로) 그쪽이 지금 자리보다
 * WALK_HOP_MARGIN_M 넘게 가까운 위치가 잇달아 찍혀야 옮긴다 — 차도 위에서 흔들려도 이쪽저쪽 인도를 오가지 않는다
 */
const WALK_HOP_M = 6
const WALK_HOP_MARGIN_M = 6
const WALK_HOP_COUNT = 3
/**
 * 탈것 판정 — 웹에는 기기 활동 인식이 없어 가속도계 발걸음과 GPS 속도(도플러 — 위치가 튀어도 튀지 않는다)로 가린다.
 * 걸음 없이 시속 10km를 넘는 채로 5초 이어지면 탈것이고, 걸음이 3초 이어지면(내려서 걸으면) 다시 걷는다 — 정차·신호
 * 대기에는 걸음이 없으니 그대로 탈것이다. 시속 25km를 넘으면 걸음과 상관없이 탈것이다(페달 흔들림·차 안에서 걷기)
 */
const RIDE_ENTER_MPS = 10 / 3.6
const RIDE_ENTER_MS = 5_000
const RIDE_FAST_MPS = 25 / 3.6
const RIDE_EXIT_MS = 3_000
/**
 * 동작 센서를 못 쓸 때(iOS 권한 거절·센서 차단) — GPS 속도만으로 보수적으로 가린다. 시속 25km를 넘는 채로 5초면 탈것,
 * 시속 7km 아래로 30초 이어지면 다시 걷는다(정차와 내림을 구별할 수 없어 길게 기다린다)
 */
const RIDE_BLIND_EXIT_MPS = 7 / 3.6
const RIDE_BLIND_EXIT_MS = 30_000
/** 탈것일 때 앞질러 어림할 속도를 재는 구간 — 지난 10초 동안 옮겨 간 거리로 잰다 */
const RIDE_WINDOW_MS = 10_000
/** 탈것일 때 칼만 필터가 위치 사이에 허용하는 움직임(초속) — 새 위치를 거의 그대로 믿는다 */
const RIDE_MOTION_MPS = 30
/**
 * 탈것일 때 캐릭터가 GPS 자리(그 속도로 앞질러 어림한 자리)를 따라붙는 시간 상수(초)와 따라붙는 속도의 하한(초속) —
 * 탈것으로 판정되기 전 뒤처진 거리는 지금 속도의 세 배(최소 이만큼)로 따라잡는다(한꺼번에 밀려가지 않게)
 */
const RIDE_FOLLOW_S = 0.3
const RIDE_CATCH_MPS = 20
const RIDE_CATCH_TIMES = 3
/** 탈것일 때 이보다 멀리 옮겨 갔으면(지하철에서 올라왔을 때) 미끄러지지 않고 곧장 옮긴다 */
const RIDE_SNAP_M = 500
/** 탈것일 때 다른 사람에게 위치를 보내는 간격 — 서버가 초당 10m 넘는 이동은 5초에 한 번 순간이동으로만 받는다 */
const RIDE_SEND_MS = 5500
/** GPS가 한 번에 이보다 멀리 튀면(지하철·차) 걸어가지 않고 곧장 옮긴다 */
const GPS_TELEPORT_M = 150
/** 캐릭터가 서는 바닥 — 평평하니 충돌은 끝없이 넓은 평면 하나로 충분하다 */
const COLLIDER_SIZE = 200_000
/**
 * 로딩 문구 — 플레이 씬(산책 채비)처럼 화면을 만드는 일이 아니라 내가 동네로 나서는 순서로 말한다. 첫 줄은 위치를 받을
 * 때까지 두고(해야 할 일이 있을 때만 GPS 안내로 바꾼다), 받은 뒤로는 같은 간격으로 넘기다가 마지막 줄은 준비가 끝나야
 * 띄운다. 첫 줄은 페이지 전환 로더와 같아 넘겨받아도 그대로다
 */
const LOADING_STEPS = ['내 위치를 찾는 중이에요', '창밖 날씨를 보는 중이에요', '현관문을 나서는 중이에요', '엘리베이터를 기다리는 중이에요', '동네로 나가요!']

type Phase = 'locating' | 'loading' | 'playing' | 'error'

function motionOf(controller: ThirdPerson) {
  return controller.airborne ? 1 : controller.bored ? 2 : 0
}

export default function NearbyScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<MapTrack | null>(null)
  const [phase, setPhase] = useState<Phase>('locating')
  const {
    shown: shownStep,
    go: goSteps,
    reset: resetSteps,
    finish: finishSteps,
  } = useLoadingSteps(LOADING_STEPS.length, { hold: true })
  // 준비가 끝나면 로더가 LOADER_EXIT_MS에 걸쳐 녹아 씬이 드러난 뒤에 걷힌다
  const [loaderGone, setLoaderGone] = useState(false)
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
  // iOS 권한 단계 — 동작 권한을 물어야 하면 로더에 '허용'을 띄우고(위치도 아직 안 물었으면 함께), 누르면 이어 간다
  const [ask, setAsk] = useState<{ withLocation: boolean } | null>(null)
  const allowRef = useRef<(() => void) | null>(null)
  // 지도 데이터 출처 — 길이 깔린 동안만 보이고, OSM 표기 지침대로 5초 뒤 구석의 (i)로 접힌다(누르면 다시 편다)
  const [creditOpen, setCreditOpen] = useState(true)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    // 로더가 뜬 때 — 준비가 일찍 끝나도 스피너가 한 바퀴는 돈 뒤에 걷는다
    const loaderSince = performance.now()
    resetSteps()

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
    // 휴대폰의 지금 자리 — GPS 위치를 칼만 필터로 거른 값(variance는 m², 음수면 아직 위치가 없다)
    let gpsHere = { x: 0, z: 0, variance: -1, at: 0 }
    // 지금 자리에서 멀리 튄 위치 — 마지막으로 찍힌 곳과 잇달아 찍힌 횟수
    const gpsJump = { x: 0, z: 0, count: 0 }
    let gpsSeenAt = -1
    // 걸을 때 붙인 자리(차도 위면 옮긴 인도 자리)와, 거기서 멀리 옮겨 간 자리가 잇달아 찍힌 횟수
    let walkHere: { x: number; z: number } | null = null
    const walkHop = { x: 0, z: 0, count: 0 }
    // 탈것 — 발걸음, 앞질러 어림할 속도를 잴 지난 GPS 위치들, 지금 탈것인지, 반대 상태 조건이 처음 맞은 시각, 따라붙을 자리·속도와 받은 시각
    let steps: StepTracker | null = null
    const gpsTrail: { at: number; x: number; z: number }[] = []
    let riding = false
    let rideFlipAt = -1
    const ride = { x: 0, z: 0, vx: 0, vz: 0, at: 0 }
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
      if (distance < GPS_STOP_M) {
        // 닿았다 — 다시 걸으려면 지금 자리가 GPS_STEP_M 넘게 떨어져야 한다
        gpsTarget = null
        return null
      }
      const k = Math.min(1, (distance - GPS_STOP_M) / GPS_FULL_M) / distance
      return { x: dx * k, z: dz * k }
    }

    let wait: StartWait | null = null

    ;(async () => {
      // iOS는 동작 권한 창을 탭 안에서만 띄울 수 있다 — 물어야 하면 로더 권한 단계의 '허용'을 누를 때까지 위치 요청도 미루고,
      // 누르면 동작·위치 권한을 차례로 묻는다(위치가 이미 허용됐으면 동작만). 위치가 막혀 있으면 거부 안내가 먼저라 묻지 않는다
      if (mobile && (await queryMotionPermission()) === 'prompt') {
        const location = await queryGpsPermission()
        if (!destroyed && location !== 'denied') {
          await new Promise<void>((resolve) => {
            allowRef.current = resolve
            setAsk({ withLocation: location !== 'granted' })
          })
          allowRef.current = null
          setAsk(null)
        }
      }
      if (destroyed) return
      steps = mobile ? createStepTracker() : null
      // 위치를 받을 때까지 대기 화면에서 기다린다 — 가짜 자리(기본 좌표)로 넘어가지 않는다
      wait = waitForStartFix(gps)
      const fix = await wait.promise
      if (destroyed) return
      const local = createLocalFrame(Math.round(fix.lng / ORIGIN_GRID) * ORIGIN_GRID, Math.round(fix.lat / ORIGIN_GRID) * ORIGIN_GRID)
      const start = local.toLocal(fix.lng, fix.lat)
      setPhase('loading')
      goSteps()

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
      // 차도 위에서 시작하지 않는다 — 가장 가까운 인도로 옮겨 세운다(잔디·공터·광장·인도면 그 자리)
      const spawn = stream.nearestWalk(start.x, start.z) ?? start
      const ground = stream
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

      // 내 실제 위치(가장 가까운 걸을 수 있는 곳)에 세우고, 처음엔 북쪽을 바라본다(카메라는 남쪽 뒤)
      kid.rotation.y = Math.PI
      controller = createThirdPerson({
        camera,
        character: kid,
        collider: new THREE.Mesh(colliderGeometry),
        domElement: renderer.domElement,
        start: new THREE.Vector3(spawn.x, 0, spawn.z),
        spawnRadius: 0,
        mobile,
        steer,
      })
      controller.update(0)
      controller.startIntro()
      controllerRef.current = controller
      // 휴대폰은 GPS로만 걷는다 — 터치로 걸으면 실제 위치에서 멀어져 GPS가 도로 끌어당긴다
      controller.setEnabled(!mobile && !mapShownRef.current)
      const me = kid
      const walker = controller
      // 휴대폰은 GPS로만 걷고, PC는 시작한 자리에서 키보드로 걷는다(흐린 위치로 시작했어도 나중에 옮기지 않는다).
      // ±50m 밖 위치(건물 사이·와이파이·IP 추정)로는 걷지도 옮기지도 않는다
      const follow = ({ fix: next }: GpsSnapshot) => {
        // 상태만 바뀐 알림도 같은 위치를 다시 싣고 온다 — 위치마다 한 번만 센다
        if (!mobile || !next || !isWalkableFix(next) || next.timestamp === gpsSeenAt) return
        const elapsed = gpsSeenAt < 0 ? 0 : (next.timestamp - gpsSeenAt) / 1000
        gpsSeenAt = next.timestamp
        const { x, z } = local.toLocal(next.lng, next.lat)
        // 앞질러 어림할 속도 — 지난 10초 동안 옮겨 간 거리로 잰다(1초 사이 흔들림에 속지 않게)
        gpsTrail.push({ at: next.timestamp, x, z })
        while (gpsTrail.length > 2 && next.timestamp - gpsTrail[1].at >= RIDE_WINDOW_MS) gpsTrail.shift()
        const span = (next.timestamp - gpsTrail[0].at) / 1000
        const vx = span >= 3 ? (x - gpsTrail[0].x) / span : 0
        const vz = span >= 3 ? (z - gpsTrail[0].z) / span : 0
        // 탈것 판정 — GPS 속도(못 재면 모름)와 발걸음으로 가리고, 반대 상태 조건이 정해진 시간 동안 이어질 때만 바꾼다
        const speed = next.speed
        const fast = speed !== null && speed > RIDE_FAST_MPS
        const sensed = steps?.available() ?? false
        const onFoot = sensed && !!steps?.walking()
        const flip = riding
          ? sensed
            ? onFoot && !fast
            : (speed ?? 0) < RIDE_BLIND_EXIT_MPS
          : fast || (sensed && !onFoot && speed !== null && speed > RIDE_ENTER_MPS)
        if (!flip) rideFlipAt = -1
        else if (rideFlipAt < 0) rideFlipAt = next.timestamp
        else if (next.timestamp - rideFlipAt >= (riding ? (sensed ? RIDE_EXIT_MS : RIDE_BLIND_EXIT_MS) : RIDE_ENTER_MS)) {
          riding = !riding
          rideFlipAt = -1
          gpsTarget = null
          // 내리면 걸을 수 있는 곳에 새로 붙인다
          walkHere = null
        }
        const noise = Math.max(next.accuracy, 1) ** 2
        // 빠르게 옮겨 가는 중이면 그만큼 멀리 찍혀도 튄 값이 아니다
        const jump = Math.max(next.accuracy * 2, GPS_JUMP_MIN_M, (speed ?? 0) * elapsed * 2)
        if (gpsHere.variance >= 0 && Math.hypot(x - gpsHere.x, z - gpsHere.z) <= jump) {
          // 가만히 서 있어도 GPS는 수 m씩 흔들린다 — 지금 자리와 새 위치를 정확도에 맞춰 섞는다(칼만 필터).
          // 흐린 위치일수록 조금만 옮기고, 지난 위치에서 시간이 흐를수록(걸었을 수 있으니) 새 위치를 더 믿는다
          gpsJump.count = 0
          const motion = riding ? RIDE_MOTION_MPS : GPS_MOTION_MPS
          const prior = gpsHere.variance + ((next.timestamp - gpsHere.at) / 1000) * motion ** 2
          const gain = prior / (prior + noise)
          gpsHere = {
            x: gpsHere.x + (x - gpsHere.x) * gain,
            z: gpsHere.z + (z - gpsHere.z) * gain,
            variance: (1 - gain) * prior,
            at: next.timestamp,
          }
        } else {
          // 멀리 튀었다 — 잇달아 같은 곳에 찍혀야 그리로 옮겨 간 것으로 보고 거기서 새로 시작한다(첫 위치는 곧장)
          const again = gpsJump.count > 0 && Math.hypot(x - gpsJump.x, z - gpsJump.z) <= jump
          Object.assign(gpsJump, { x, z, count: again ? gpsJump.count + 1 : 1 })
          if (gpsHere.variance >= 0 && gpsJump.count < GPS_JUMP_COUNT) return
          gpsJump.count = 0
          gpsHere = { x, z, variance: noise, at: next.timestamp }
        }
        if (riding) {
          // 탈것 — 걷지 않고 선 채로 GPS 자리를 따라붙는다(매 프레임 루프가 옮긴다). 아주 멀리 옮겨 갔으면 곧장 옮긴다
          Object.assign(ride, { x: gpsHere.x, z: gpsHere.z, vx, vz, at: performance.now() })
          if (Math.hypot(gpsHere.x - me.position.x, gpsHere.z - me.position.z) > RIDE_SNAP_M) walker.snap(gpsHere.x, gpsHere.z)
          return
        }
        // 걷기 — 지금 자리를 걸을 수 있는 곳에 붙인다(차도 위면 가장 가까운 인도로 옮긴다). 붙인 자리가 멀리(길 건너편 인도로)
        // 옮겨 가면 그쪽이 확실히 더 가까운 위치가 잇달아 찍혀야 옮긴다(차도 위 흔들림에 이쪽저쪽 인도를 오가지 않게)
        const onWalk = ground.nearestWalk(gpsHere.x, gpsHere.z) ?? { x: gpsHere.x, z: gpsHere.z }
        if (!walkHere || Math.hypot(onWalk.x - walkHere.x, onWalk.z - walkHere.z) <= WALK_HOP_M) {
          walkHere = onWalk
          walkHop.count = 0
        } else {
          const closer =
            Math.hypot(gpsHere.x - walkHere.x, gpsHere.z - walkHere.z) - Math.hypot(gpsHere.x - onWalk.x, gpsHere.z - onWalk.z)
          const again = walkHop.count > 0 && Math.hypot(onWalk.x - walkHop.x, onWalk.z - walkHop.z) <= WALK_HOP_M
          Object.assign(walkHop, { x: onWalk.x, z: onWalk.z, count: closer < WALK_HOP_MARGIN_M ? 0 : again ? walkHop.count + 1 : 1 })
          if (walkHop.count >= WALK_HOP_COUNT) {
            walkHere = onWalk
            walkHop.count = 0
          }
        }
        const distance = Math.hypot(walkHere.x - me.position.x, walkHere.z - me.position.z)
        // 서 있던 캐릭터는 지금 자리가 조금 떨어진 것으로는 출발하지 않는다 — 몇 m 옮기려고 몸을 돌리면
        // 카메라까지 따라 돈다. 걷던 중이거나 차도 위(탈것에서 내린 뒤 등)에 서 있으면 닿을 때까지 간다
        const standing = ground.nearestWalk(me.position.x, me.position.z)
        const offWalk = standing !== null && (standing.x !== me.position.x || standing.z !== me.position.z)
        if (gpsTarget || offWalk || distance >= Math.max(GPS_STEP_M, next.accuracy / 2)) gpsTarget = walkHere
        // 지하철·차로 멀리 옮겨 갔으면 걸어가지 않고 그 자리로 옮긴다(앞쪽 구역은 다음 프레임부터 깔린다)
        if (distance > GPS_TELEPORT_M) walker.snap(walkHere.x, walkHere.z)
      }
      unwatch = gps.subscribe(follow)
      // 캐릭터를 세운 위치부터 센다 — 구독 전에 받은 위치는 알림이 다시 오지 않는다
      follow(gps.snapshot)
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
      // 보낸 위치와 보낸 시각 — 탈것일 때는 RIDE_SEND_MS마다 한 번만 새로 보내고, 받는 쪽이 그 사이를 미끄러지듯 잇는다
      let sent = local.toLngLat(me.position.x, me.position.z)
      let sentAt = performance.now()
      connection = connectRelay(
        {
          read: () => {
            const now = performance.now()
            if (!riding || now - sentAt >= RIDE_SEND_MS) {
              sent = local.toLngLat(me.position.x, me.position.z)
              sentAt = now
            }
            return {
              p: [sent.lng, sent.lat, me.position.y],
              // 원본 spherical — 극각은 늘 수평, 방위는 캐릭터 등 뒤(로컬 축은 모두 동쪽 +x·북쪽 −z)
              r: [Math.PI / 2, (me.rotation.y - Math.PI) % (Math.PI * 2)],
              a: riding ? 3 : motionOf(walker),
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
      // 준비 끝 — 지금 줄을 읽을 만큼 보여 준 뒤 마지막 줄("동네로 나가요!")을 잠깐 띄우고 걷는다
      await finishSteps()
      if (destroyed) return
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
        if (riding) {
          // 탈것 — 받은 GPS 자리를 그 속도로 앞질러 어림한 자리까지 선 채로 미끄러진다(위치는 1초에 한 번쯤 온다)
          const ahead = Math.min(3, (now - ride.at) / 1000)
          const dx = ride.x + ride.vx * ahead - kid.position.x
          const dz = ride.z + ride.vz * ahead - kid.position.z
          const gap = Math.hypot(dx, dz)
          const catchUp = Math.max(RIDE_CATCH_MPS, RIDE_CATCH_TIMES * Math.hypot(ride.vx, ride.vz))
          const step = Math.min(gap * (1 - Math.exp(-dt / RIDE_FOLLOW_S)), catchUp * dt)
          if (gap > 1e-3) controller.glide(kid.position.x + (dx / gap) * step, kid.position.z + (dz / gap) * step)
        }
        controller.update(dt)
        blendKidAnimation(kidAnimation, controller.velocityHorizontal, riding ? 3 : motionOf(controller), ratio)
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
      wait?.cancel()
      // 권한 단계에서 기다리던 흐름을 풀어 끝낸다(destroyed라 더 가지 않는다)
      allowRef.current?.()
      setAsk(null)
      steps?.dispose()
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

  // 펼치면 곧바로 조작을 끄고, 접으면 다 접혀 배경까지 걷힌 뒤(onClosed)에 켠다(휴대폰은 늘 꺼 둔다)
  useEffect(() => {
    if (!mapOpen) return
    mapShownRef.current = true
    controllerRef.current?.setEnabled(false)
  }, [mapOpen])
  const onMapClosed = () => {
    mapShownRef.current = false
    controllerRef.current?.setEnabled(!mobile)
  }

  useMapHotkey(phase === 'playing', setMapOpen)

  useEffect(() => {
    if (phase !== 'playing') return
    setCreditOpen(true)
    const timer = window.setTimeout(() => setCreditOpen(false), 5000)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setTimeout(() => setLoaderGone(true), LOADER_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // 기기 정보는 브라우저에서만 안다 — 서버 렌더와 첫 화면을 맞추려고 마운트 뒤에 읽는다
  useEffect(() => {
    setEnv(detectGpsEnv())
    setMobile(isMobileDevice())
  }, [])

  const waiting = phase !== 'locating' || !env ? null : ask ? motionAskNote(ask) : gpsView ? startWaitNote(gpsView, env) : null
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

      {/* 로더 — 위치를 받을 때까지 기다리고(받을 수 없는 상태면 스피너 없이 안내와 버튼만), 받은 뒤 길을 깔고,
          준비되면 배경까지 녹아 씬이 드러난다. 한 로더로 이어 띄워 문구만 바뀐다 */}
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
      {phase !== 'error' && !loaderGone && (
        <Loader
          fading={phase === 'playing'}
          dissolve
          // '허용'처럼 눌러야 넘어가는 단계는 스피너를 끈다
          spinning={waiting?.tone !== 'off' && waiting?.action !== 'allow'}
          // 사라지기 시작하면 문구가 따라오는 중이어도 바로 마지막 줄을 띄운다
          message={waiting?.title ?? LOADING_STEPS[phase === 'playing' ? LOADING_STEPS.length - 1 : shownStep]}
          hint={waiting?.hint}
          detail={waiting?.steps && <GpsSteps steps={waiting.steps} />}
        >
          {waiting?.action && (
            <button
              type="button"
              className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
              onClick={() => {
                // 탭 안에서 곧바로 불러야 iOS가 동작 권한 창을 띄운다 — 답과 상관없이 이어서 위치를 묻는다
                if (waiting.action === 'allow') void requestMotionPermission().finally(() => allowRef.current?.())
                else if (waiting.action === 'reload') window.location.reload()
                else gps?.retry()
              }}
            >
              {waiting.action === 'allow' ? '허용' : waiting.action === 'reload' ? '새로고침' : '다시 시도'}
            </button>
          )}
        </Loader>
      )}

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

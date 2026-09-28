'use client'

// 원본(Summer Afternoon) 재현 — /village 3D 씬. 씬 구성·셰이딩·조작·UI·오디오를
// 원본 코드에서 그대로 옮겼다. 원본: https://summer-afternoon.vlucendo.com/

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import {
  loadBinGeometry,
  createSkin,
  createSkinAnimation,
  createInstancedMesh,
  createInstancedPatches,
} from '@/lib/three/binLoader'
import {
  createSharedUniforms,
  createRampMaterial,
  createGrassMaterial,
  createTerrainMaterial,
  createSkyMaterial,
  loadKtx2Lut,
} from './rampShader'
import { createThirdPerson, type ThirdPerson } from './thirdPerson'
import { createSceneAudio, type SceneAudio } from './audio'
import { createSunLight, bakeStaticShadows } from './shadows'
import { createSea } from './sea'
import { createBirds, type Birds } from './birds'
import { createFinalPass } from './postprocess'
import { createTouchCircles } from './touchCircles'
import { blendKidAnimation, createKidAnimation, type KidAnimation } from './kidAnimation'
import { createRemotes, type Remotes } from './remotes'
import { baseDevicePixelRatio, configure, isMobileDevice } from './setup'
import { connectScene, type SceneConnection } from '@/lib/realtime/scene'
import type { SceneMotion } from '@/shared/scene/contract'
import PaperMap, { GpsBadge, MapIcon, useMapHotkey } from '@/components/world/PaperMap'
import Loader, { SPIN_MS, waitSpinTurn } from '@/components/transition/Loader'
import { createGpsTracker, useGpsSnapshot, type GpsTracker } from '@/lib/geo/gps'

/**
 * 월드 좌표가 지오메트리에 구워져 있는 정적 메시.
 * 원본은 house2·house3·모래성의 그림자맵에 앞면을 쓴다(shadowSide FrontSide).
 * blockers1·2는 도로 양 끝을 막는 차단물로, 원본에서도 화면에 그린다.
 */
const STATIC_MESHES: { name: string; frontShadow?: boolean }[] = [
  { name: 'house1' },
  { name: 'house2', frontShadow: true },
  { name: 'house3', frontShadow: true },
  { name: 'warehouse1' },
  { name: 'warehouse2' },
  { name: 'warehouse3' },
  { name: 'parasol' },
  { name: 'sign' },
  { name: 'sandcastles1', frontShadow: true },
  { name: 'sandcastles2', frontShadow: true },
  { name: 'blockers1' },
  { name: 'blockers2' },
]

/**
 * LOD 인스턴스 소품 — 원본 instancedPatches 파라미터와 LOD 거리 그대로.
 * 거리는 카메라에서 패치 바운딩 스피어 표면까지이고, rock1은 70m 밖에서 숨는다.
 */
const LOD_PROPS = [
  { name: 'tree', lods: ['tree', 'tree-lod2', 'tree-lod3'], distances: [0, 30, 50], maxPerPatch: 30, maxDistance: 30, shake: true },
  { name: 'bush', lods: ['bush', 'bush-lod2', 'bush-lod3'], distances: [0, 30, 50], maxPerPatch: 25, maxDistance: 30, shake: true },
  { name: 'palmtree', lods: ['palmtree', 'palmtree-lod2'], distances: [0, 60], maxPerPatch: 30, maxDistance: 40, shake: true, doubleSide: true },
  { name: 'rock1', lods: ['rock1', 'rock1-lod2'], distances: [0, 40], maxPerPatch: 40, maxDistance: 50, hideDistance: 70 },
  { name: 'rock2', lods: ['rock2', 'rock2-lod2'], distances: [0, 70], maxPerPatch: 15, maxDistance: 40 },
]

/** LOD 없이 인스턴스만 있는 소품 — 메시명과 인스턴스 파일명이 다를 수 있다 */
const FLAT_PROPS = [
  { mesh: 'lightpost', instances: 'lightposts-instances' },
  { mesh: 'machine', instances: 'machine-instances' },
]

const rad = THREE.MathUtils.degToRad

/**
 * 스킨드 생물 — 메시 + 본 + 단일 애니메이션 클립(원본 배치값 그대로).
 * 원본은 캐릭터가 activeRange 안에 있을 때만 애니메이션을 돌린다.
 */
const CREATURES = [
  {
    mesh: 'alien', bones: 'alien-bones', clip: 'alien-chill',
    position: [60.14, 0.1, 40.6] as const,
    rotation: [-1.5708, 1.5202, 1.5708] as const,
    scale: 1,
    activeRange: 30,
  },
  {
    mesh: 'cats', bones: 'cats-bones', clip: 'cats-anim',
    position: [27.4644, 3.18224, -4.1086] as const,
    rotation: [0, rad(-106.078), 0] as const,
    scale: 1,
    activeRange: 10,
  },
  {
    mesh: 'sloth', bones: 'sloth-bones', clip: 'sloth-anim',
    position: [-8.38, 1.47, 46.16] as const,
    rotation: [rad(-30.8), rad(-42.5), rad(-25.7)] as const,
    scale: 0.8,
    activeRange: 10,
  },
]

/*
 * NPC 상호작용(비활성) — 원본 5개 비밀. 오브젝트가 화면에 그려지는 동안 캐릭터가
 * 이 거리 안에 들어오면 한 번 발동한다. 발동 결과를 보여 줄 UI는 없다.
 *
 * const SECRETS: Record<string, { distance: number; text: string }> = {
 *   ufo: { distance: 10, text: "It's a big metallic object. You want to believe it's some kind of vehicle." },
 *   alien: { distance: 3, text: "It's a very pale and strange looking man. He probably spends too much time on the computer." },
 *   cats: { distance: 2, text: "If these two white cats weren't next to each other it would seem like they were the same one." },
 *   sloth: { distance: 3, text: 'A sloth? That permanent smile it has is so creepy. What is it doing there?' },
 *   gossip: { distance: 2, text: 'These things look as if they have been taken out of a video game.' },
 * }
 */

/** ufo·gossip은 코드로 배치된다(월드 좌표가 지오메트리에 없다) */
const UFO_POSITION = [-56.9402, 2.6553, 22.7015] as const
const GOSSIP_POSITION = [-55.9016, 1.47639, -47.3277] as const
const GOSSIP_ROTATION_Y = rad(-87.0408)

/** 원본 오프닝 — initialPosition [12.2, 2.25, -58]. 도로 위에서 +Z를 바라보며 시작한다 */
const START = new THREE.Vector3(12.2, 2.25, -58)

/** 로더 — 글자·스피너가 0.75초에 사라진 뒤 0.25초 쉬고 인트로를 시작한다(원본 Loader.hide) */
const LOADER_FADE_MS = 750
const LOADER_HIDDEN_MS = 250
/** 인트로 리빌 4초(원본 uTransition 0→1, ease none) */
const INTRO_REVEAL_MS = 4000
/** 오디오는 인트로 시작 1.5초 뒤부터 소리를 낼 수 있다(원본 canPlaySound) */
const AUDIO_DELAY_MS = 1500

/** 원본 AdaptiveDPR — 2초 뒤부터 4초마다 평균 FPS로 해상도 배수를 0.7~1 사이에서 0.1씩 옮긴다 */
const DPR_WAIT_MS = 2000
const DPR_INTERVAL_MS = 4000
const DPR_STEP = 0.1
const DPR_MIN = 0.7
const DPR_MIN_FPS = 30
const DPR_MAX_FPS = 60
const DPR_PING_PONG_LIMIT = 4

function supportsWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/** 원본 changeColor 표시색 — HSL(색조, 0.4, 0.3)을 선형 공간 값으로 보고 sRGB로 바꾼 색 */
function hueToCss(hue: number): string {
  return `#${new THREE.Color().setHSL(hue, 0.4, 0.3).getHexString()}`
}

/** 원본 userData.a — 공중이면 1, 심심하면 2 */
function motionOf(controller: ThirdPerson): SceneMotion {
  return controller.airborne ? 1 : controller.bored ? 2 : 0
}

export default function SummerAfternoonPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  // 'loading' → 에셋 로드 중, 'fading' → 로더가 사라지는 중, 'playing' → 인트로·조작 시작
  const [phase, setPhase] = useState<'loading' | 'fading' | 'playing'>('loading')
  const [unsupported, setUnsupported] = useState(false)
  // 펼침 지도(M) — 지도가 펼쳐져 있는 동안은 캐릭터 조작을 끈다(원본이 모달을 띄울 때처럼)
  const [mapOpen, setMapOpen] = useState(false)
  // 실제 내 위치는 지도에만 쓴다 — 권한 창은 지도를 처음 펼칠 때 뜬다(이미 허용했으면 바로 찾는다)
  const [gps, setGps] = useState<GpsTracker | null>(null)
  const gpsView = useGpsSnapshot(gps)
  const [error, setError] = useState<string | null>(null)
  // 원본처럼 소리 꺼짐으로 시작하고, 첫 입력 때 켜진다
  const [muted, setMuted] = useState(true)
  // 캐릭터 옷 색(원본 color-square 버튼) — 첫 색은 로드 때 무작위로 정한다
  const [charColor, setCharColor] = useState('#F0EADE')

  const audioRef = useRef<SceneAudio | null>(null)
  const mutedRef = useRef(true)
  const controllerRef = useRef<ThirdPerson | null>(null)
  const mapOpenRef = useRef(false)
  // useEffect 안에서 만든 함수를 React 버튼과 잇는 다리
  const cycleColorRef = useRef<() => void>(() => {})
  const startAudioRef = useRef<(event?: Event) => boolean>(() => false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    // 로더가 뜬 때 — 준비가 일찍 끝나도 스피너가 한 바퀴는 돈 뒤에 걷는다
    const loaderSince = performance.now()

    // 원본처럼 WebGL2가 없으면 로더를 걷고 안내 문구만 띄운다
    if (!supportsWebGL2()) {
      setUnsupported(true)
      const fade = setTimeout(() => setPhase('fading'), SPIN_MS)
      const t = setTimeout(() => setPhase('playing'), SPIN_MS + LOADER_FADE_MS + LOADER_HIDDEN_MS)
      return () => {
        clearTimeout(fade)
        clearTimeout(t)
      }
    }

    const mobile = isMobileDevice()
    const shared = createSharedUniforms()
    const scene = new THREE.Scene()
    const sun = createSunLight(scene, shared)
    // 원본 반구광(하늘색 #33434f / 지면색 #737575, 0.7)
    scene.add(new THREE.HemisphereLight('#33434f', '#737575', 0.7))

    // 원본 baseCamera — fov 45, near 1, far 175(바다·지형 끝은 175m에서 잘리고 하늘이 보인다)
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 175)
    // 원본 렌더러 — 캔버스 MSAA 없이 SMAA로 계단을 편다
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: false,
    })
    const baseDpr = baseDevicePixelRatio(mobile)
    let dprMultiplier = 1
    renderer.setPixelRatio(baseDpr)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // 씬 → LUT·인트로·오버레이(선형) → SMAA → sRGB 출력. 원본처럼 중간 버퍼는 8비트 sRGB다
    // (값은 선형으로 읽히고 저장만 sRGB 정밀도 — 원본 createComposerRT, HDR false)
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace }),
    )
    composer.addPass(new RenderPass(scene, camera))
    const finalPass = createFinalPass()
    composer.addPass(finalPass)
    const smaaPass = new SMAAPass(1, 1)
    composer.addPass(smaaPass)
    composer.addPass(new OutputPass())
    new THREE.TextureLoader().load('/ref-assets/images/transition-intro.jpg', (tex) => {
      finalPass.uniforms.tIntro.value = tex
    })

    const circles = createTouchCircles(
      new THREE.TextureLoader().load('/ref-assets/images/controls/circles.png'),
    )
    scene.add(circles.group)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      // updateStyle=true(기본): 캔버스 CSS 크기를 뷰포트(w×h)에 맞춘다
      renderer.setSize(w, h)
      composer.setSize(w, h)
      finalPass.uniforms.uResolution.value.set(w, h)
      const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
      circles.setResolution(buffer.x, buffer.y)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const setDpr = (multiplier: number) => {
      dprMultiplier = multiplier
      renderer.setPixelRatio(baseDpr * multiplier)
      composer.setPixelRatio(baseDpr * multiplier)
      resize()
      sun.setReduced(multiplier < 0.9)
    }

    let destroyed = false
    let raf = 0
    let sky: THREE.Mesh | null = null
    const mixers: THREE.AnimationMixer[] = []
    let birds: Birds | null = null
    let controller: ThirdPerson | null = null
    let kidAnimation: KidAnimation | null = null
    let remotes: Remotes | null = null
    let connection: SceneConnection | null = null
    let kidMesh: THREE.SkinnedMesh | null = null
    let frameDt = 0
    const materials: THREE.Material[] = []
    const disposables: { dispose(): void }[] = [circles]
    // NPC 상호작용(비활성) — 발동한 비밀 이름
    // const found = new Set<string>()

    // 인트로 진행
    let introStartTime = -1
    let introDone = false

    // 원본 AdaptiveDPR 상태
    const adaptive = {
      active: false,
      waitUntil: 0,
      lastUpdate: 0,
      bucketStart: 0,
      bucketFrames: 0,
      samples: [] as number[],
      direction: 0,
      pingPongs: 0,
    }

    const loader = new THREE.TextureLoader().setPath('/ref-assets/images/')
    const ktx2 = new KTX2Loader()
      .setTranscoderPath('/ref-assets/libs/basis/')
      .detectSupport(renderer)

    // NPC 상호작용(비활성) — 오브젝트가 그려질 때 캐릭터가 가까우면 한 번 발동한다.
    // 발동 결과를 받을 UI(secretRef 자리)는 없다.
    // const checkSecret = (name: string, object: THREE.Object3D) => {
    //   if (found.has(name) || !kidMesh) return
    //   if (object.position.distanceTo(kidMesh.position) >= SECRETS[name].distance) return
    //   found.add(name)
    //   secretRef.current(SECRETS[name].text)
    // }

    ;(async () => {
      const [rampTex, roadTex, masksTex, noisesTex, detailsTex, skyTex, cloudsTex] =
        await Promise.all([
          loader.loadAsync('ramps.png'),
          loader.loadAsync('terrain-road-highq.png'),
          loader.loadAsync('masks.png'),
          loader.loadAsync('terrain-noises-highq.png'),
          loader.loadAsync('terrain-details-highq.png'),
          loader.loadAsync('sky-srgb-highq.png'),
          loader.loadAsync('clouds_top-highq.png'),
        ])
      if (destroyed) return

      // 원본 옵션: ramps "srgb-colordata", 도로 "colordata", 노이즈·디테일·구름 "repeat", 하늘 "srgb-repeat"
      configure(rampTex, { srgb: true, colordata: true })
      configure(roadTex, { colordata: true })
      configure(noisesTex, { repeat: true })
      configure(detailsTex, { repeat: true })
      configure(skyTex, { srgb: true, repeat: true })
      configure(cloudsTex, { repeat: true })
      shared.tCloudsTop.value = cloudsTex

      // 압축 텍스처는 실패해도 씬 전체가 죽지 않게 개별로 처리한다. 원본은 모두 선형(raw) 값으로 읽는다.
      const [patchesTex, flowTex, seaNormalTex, gossipTex] = await Promise.all([
        ktx2.loadAsync('/ref-assets/images/grass-patches-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/skyflow-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/sea1-normal-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/gossip.ktx2').catch(() => null),
      ])
      if (destroyed) return
      if (patchesTex) configure(patchesTex, { raw: true, colordata: true })
      if (flowTex) configure(flowTex, { raw: true, repeat: true })
      if (seaNormalTex) configure(seaNormalTex, { raw: true, repeat: true })
      if (gossipTex) configure(gossipTex, { raw: true })

      const ramp = (options: Parameters<typeof createRampMaterial>[2] = {}) => {
        const material = createRampMaterial(rampTex, shared, options)
        materials.push(material)
        return material
      }
      const rampMaterial = ramp()
      const frontShadowMaterial = ramp({ shadowSide: THREE.FrontSide })
      const wiresMaterial = ramp({ lightwires: true, side: THREE.DoubleSide })

      // 원본 changeColor — 피부색(정수부 0~3)과 옷 색조(소수부)를 함께 고르고, 색조는
      // 직전 색과 0.2 이상 떨어지게 뽑는다
      let seed = 0
      const nextSeed = () => {
        const previousHue = seed % 1
        let hue = Math.random()
        while (Math.abs(hue - previousHue) < 0.2) hue = Math.random()
        seed = Math.floor(Math.random() * 4) + hue
        setCharColor(hueToCss(hue))
        return seed
      }
      const characterMaterial = ramp({
        isCharacter: true,
        seed: nextSeed(),
        shadowSide: THREE.FrontSide,
      })
      cycleColorRef.current = () => {
        const shader = characterMaterial.userData.shader as
          | { uniforms: { uSeed: { value: number } } }
          | undefined
        const next = nextSeed()
        if (shader) shader.uniforms.uSeed.value = next
      }
      const terrainMaterial = createTerrainMaterial(
        { ramp: rampTex, road: roadTex, masks: masksTex, noises: noisesTex, details: detailsTex },
        shared,
      )
      const skyMaterial = createSkyMaterial(skyTex, flowTex, shared)
      materials.push(terrainMaterial, skyMaterial)

      const lut = await loadKtx2Lut('/ref-assets/images/lut.CUBE_1.LUT.ktx2')
      if (destroyed) return
      finalPass.uniforms.tLUT.value = lut
      finalPass.uniforms.uLUTSize.value = lut.image.width
      finalPass.uniforms.uUseLUT.value = 1

      // 지형 — 원본은 지형도 그림자를 드리운다
      const terrainGeo = await loadBinGeometry('terrain')
      if (destroyed) return
      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMaterial)
      terrainMesh.name = 'terrain'
      terrainMesh.castShadow = true
      terrainMesh.receiveShadow = true
      scene.add(terrainMesh)

      // 하늘 — 카메라를 따라다니고 항상 가장 먼저 그린다
      const skyGeo = await loadBinGeometry('skydome')
      if (destroyed) return
      sky = new THREE.Mesh(skyGeo, skyMaterial)
      sky.name = 'sky'
      sky.scale.setScalar(2)
      sky.renderOrder = -1000
      sky.frustumCulled = false
      scene.add(sky)

      // 바다 — 동쪽에만 깔고 하늘을 비춘다
      const sea = createSea({ normalTexture: seaNormalTex, shared, sky })
      disposables.push(sea)
      scene.add(sea.mesh)

      // 정적 메시
      for (const { name, frontShadow } of STATIC_MESHES) {
        const geo = await loadBinGeometry(name)
        if (destroyed) return
        const mesh = new THREE.Mesh(geo, frontShadow ? frontShadowMaterial : rampMaterial)
        mesh.name = name
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)
      }

      // 전선 — 전용 흔들림 셰이더, 양면
      const wiresGeo = await loadBinGeometry('lightposts-wires')
      if (destroyed) return
      const wires = new THREE.Mesh(wiresGeo, wiresMaterial)
      wires.name = 'lightposts-wires'
      wires.castShadow = true
      wires.receiveShadow = true
      scene.add(wires)

      // ufo — 원본은 이 자리에 가만히 서 있다
      const ufoGeo = await loadBinGeometry('ufo')
      if (destroyed) return
      const ufo = new THREE.Mesh(ufoGeo, rampMaterial)
      ufo.name = 'ufo'
      ufo.position.set(UFO_POSITION[0], UFO_POSITION[1], UFO_POSITION[2])
      ufo.castShadow = true
      ufo.receiveShadow = true
      // NPC 상호작용(비활성)
      // ufo.onBeforeRender = () => checkSecret('ufo', ufo)
      scene.add(ufo)

      // gossip — 오락기(화면 마스크 텍스처). 원본은 그림자를 드리우지도 받지도 않는다
      const gossipGeo = await loadBinGeometry('gossip')
      if (destroyed) return
      const gossip = new THREE.Mesh(
        gossipGeo,
        gossipTex ? ramp({ gossipMap: gossipTex }) : rampMaterial,
      )
      gossip.name = 'gossip'
      gossip.position.set(GOSSIP_POSITION[0], GOSSIP_POSITION[1], GOSSIP_POSITION[2])
      gossip.rotation.y = GOSSIP_ROTATION_Y
      // NPC 상호작용(비활성)
      // gossip.onBeforeRender = () => checkSecret('gossip', gossip)
      scene.add(gossip)

      // LOD 인스턴스 소품 — 단계마다 같은 단계로 구운 정적 그림자맵을 쓰는 재질을 붙인다
      for (const prop of LOD_PROPS) {
        const [instances, ...geoms] = await Promise.all([
          loadBinGeometry(`${prop.name}-instances`),
          ...prop.lods.map((n) => loadBinGeometry(n)),
        ])
        if (destroyed) return
        const group = createInstancedPatches(
          geoms.map((geometry, i) => ({
            geometry,
            distance: prop.distances[i],
            material: ramp({
              shake: prop.shake,
              side: prop.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
              shadowSide: THREE.FrontSide,
              csmLevel: i,
            }),
          })),
          instances,
          { maxPerPatch: prop.maxPerPatch, maxDistance: prop.maxDistance, hideDistance: prop.hideDistance },
        )
        group.name = prop.name
        group.traverse((o) => {
          o.castShadow = true
          o.receiveShadow = true
        })
        scene.add(group)
      }

      // LOD 없는 인스턴스 소품
      for (const prop of FLAT_PROPS) {
        const [geo, instances] = await Promise.all([
          loadBinGeometry(prop.mesh),
          loadBinGeometry(prop.instances),
        ])
        if (destroyed) return
        const im = createInstancedMesh(geo, instances, rampMaterial)
        im.name = prop.mesh
        im.castShadow = true
        im.receiveShadow = true
        scene.add(im)
      }

      // 잔디 — 원본 패치(최대 500개·25m)마다 LOD를 두고 55m 밖 패치는 숨긴다.
      // 인스턴스 random 속성은 패치별로 잘라 붙인다(캐시가 소유한 원본은 건드리지 않는다).
      if (patchesTex) {
        const [grassGeo, grassInstances] = await Promise.all([
          loadBinGeometry('grass'),
          loadBinGeometry('grass-instances'),
        ])
        if (destroyed) return
        const grassMaterial = createGrassMaterial(rampTex, patchesTex, shared)
        materials.push(grassMaterial)
        const grass = createInstancedPatches(
          [{ geometry: grassGeo, distance: 0, material: grassMaterial }],
          grassInstances,
          { maxPerPatch: 500, maxDistance: 25, hideDistance: 55, perInstance: ['random'] },
        )
        grass.name = 'grass'
        grass.traverse((o) => {
          o.receiveShadow = true
        })
        scene.add(grass)
      }

      // 캐릭터 — 게임용 마커 링 없이 메시만
      const [kidGeo, kidBones, kidIdle, kidRun, kidAir, kidBored] = await Promise.all([
        loadBinGeometry('kid'),
        loadBinGeometry('kid-bones'),
        loadBinGeometry('kid-idle'),
        loadBinGeometry('kid-run'),
        loadBinGeometry('kid-air'),
        loadBinGeometry('kid-bored'),
      ])
      if (destroyed) return
      const kid = createSkin(kidGeo, kidBones, characterMaterial)
      kidMesh = kid
      kid.name = 'kid'
      kid.castShadow = true
      kid.receiveShadow = true
      kid.frustumCulled = false
      scene.add(kid)
      // 클립은 같은 방 다른 아이들과 함께 쓴다
      const kidClips = {
        idle: createSkinAnimation('idle', kidIdle),
        run: createSkinAnimation('run', kidRun),
        air: createSkinAnimation('air', kidAir),
        bored: createSkinAnimation('bored', kidBored),
      }
      const kidMixer = new THREE.AnimationMixer(kid)
      kidAnimation = createKidAnimation(kidMixer, kidClips)
      // 원본 animationOffset — 전역 시간에 무작위 오프셋(0~100s)을 더해 재생한다
      kidMixer.setTime(Math.random() * 100)
      mixers.push(kidMixer)

      // 생물 3종 — 캐릭터가 activeRange 안에 있고 화면에 그려질 때만 움직인다(원본)
      const creatureMaterial = ramp({ shadowSide: THREE.FrontSide })
      for (const c of CREATURES) {
        const [mesh, bones, clip] = await Promise.all([
          loadBinGeometry(c.mesh),
          loadBinGeometry(c.bones),
          loadBinGeometry(c.clip),
        ])
        if (destroyed) return
        const skin = createSkin(mesh, bones, creatureMaterial)
        skin.name = c.mesh
        skin.position.set(c.position[0], c.position[1], c.position[2])
        skin.rotation.set(c.rotation[0], c.rotation[1], c.rotation[2])
        skin.scale.setScalar(c.scale)
        skin.castShadow = true
        skin.receiveShadow = true
        scene.add(skin)
        const m = new THREE.AnimationMixer(skin)
        m.clipAction(createSkinAnimation(c.mesh, clip)).play()
        m.update(0.1)
        // 첫 포즈로 바운딩 스피어를 잡아 두면 원본처럼 화면 밖에서는 그리지 않는다
        skin.updateMatrixWorld(true)
        skin.skeleton.update()
        skin.computeBoundingSphere()
        skin.onBeforeRender = () => {
          if (!kidMesh || skin.position.distanceTo(kidMesh.position) > c.activeRange) return
          m.update(frameDt)
          skin.updateMatrixWorld()
          // NPC 상호작용(비활성)
          // checkSecret(c.mesh, skin)
        }
      }

      // 갈매기 — 무리 지어 곡선 위 목표점을 느슨하게 쫓는다
      const [birdSource, curveGeo] = await Promise.all([
        loadBinGeometry('bird'),
        loadBinGeometry('birds-curve'),
      ])
      if (destroyed) return
      birds = createBirds(birdSource, curveGeo, shared)
      disposables.push(birds)
      scene.add(birds.mesh)

      // 원본 오프닝 — 도로 위에서 +Z를 바라보며 시작한다(카메라는 뒤쪽 -Z)
      kid.rotation.y = 0
      shared.charPos.value.copy(START)

      // 충돌 판정용 메시 — 씬에 넣지 않고 BVH 충돌·레이캐스트 대상으로만 쓴다
      const colliderGeo = await loadBinGeometry('collider')
      if (destroyed) return
      const collider = new THREE.Mesh(colliderGeo)
      controller = createThirdPerson({
        camera,
        character: kid,
        collider,
        domElement: renderer.domElement,
        start: START,
        mobile,
        onTouchJump: (ndc) => circles.jump(ndc),
      })
      controllerRef.current = controller
      controller.setEnabled(!mapOpenRef.current)

      // 카메라를 캐릭터 뒤에 미리 세워 인트로 리빌이 캐릭터를 화면 중앙에 잡게 한다
      controller.update(0)
      sun.follow(camera.position, controller.target)

      // 정적 그림자 — 월드 전체를 한 번 굽는다(캐릭터·하늘·바다·새·터치 원은 빼고)
      colliderGeo.computeBoundingSphere()
      const shadowMaps = bakeStaticShadows({
        renderer,
        scene,
        shared,
        bounds: colliderGeo.boundingSphere!,
        skip: [kid, sky, sea.mesh, birds.mesh, ...circles.group.children],
        mobile,
      })
      disposables.push(...shadowMaps)

      // 같은 방 다른 아이들 — 로그인 없는 익명 소켓으로 주고받는다(원본 멀티플레이).
      // 서버에 닿지 못하면 소켓이 뒤에서 재시도할 뿐 씬은 혼자인 채로 돈다.
      const peers = createRemotes({
        scene,
        geometry: kidGeo,
        bones: kidBones,
        clips: kidClips,
        createMaterial: (s) =>
          createRampMaterial(rampTex, shared, { isCharacter: true, seed: s, shadowSide: THREE.FrontSide }),
      })
      remotes = peers
      connection = connectScene({
        read: () =>
          controller && {
            p: [kid.position.x, kid.position.y, kid.position.z],
            // 원본 spherical — 극각은 늘 수평, 방위는 캐릭터 등 뒤
            r: [Math.PI / 2, (kid.rotation.y - Math.PI) % (Math.PI * 2)],
            a: motionOf(controller),
            s: seed,
          },
        onReset: () => peers.clear(),
        onUpdate: (update) => peers.apply(update),
        onLeave: (id) => peers.remove(id),
      })

      // 로더를 걷고(스피너 한 바퀴를 채운 뒤 0.75s 페이드 + 0.25s) 인트로를 시작한다
      await waitSpinTurn(loaderSince)
      if (destroyed) return
      setPhase('fading')
      await new Promise((resolve) => setTimeout(resolve, LOADER_FADE_MS + LOADER_HIDDEN_MS))
      if (destroyed) return
      introStartTime = performance.now()
      controller.startIntro()
      adaptive.active = true
      adaptive.waitUntil = introStartTime + DPR_WAIT_MS
      adaptive.lastUpdate = adaptive.waitUntil
      adaptive.bucketStart = introStartTime
      setPhase('playing')
    })().catch((err) => {
      console.error(err)
      setError(String(err))
    })

    // 브라우저 자동재생 정책상 오디오는 사용자 제스처 안에서 만들어야 한다. 원본처럼
    // 첫 입력(페이지 클릭·캔버스 터치·키)에서 음소거를 풀고, 인트로 1.5초 뒤부터 소리를 낸다.
    // 이 입력(같은 이벤트)으로 시작됐으면 true — 사운드 버튼은 이때 토글하지 않는다(원본
    // 결과와 같게). body 리스너와 React onClick 중 어느 쪽이 먼저 불려도 같은 결과가 난다.
    let audioStarted = false
    let startEvent: Event | null = null
    const canvas = renderer.domElement
    const startAudio = (event?: Event): boolean => {
      if (audioStarted) return event !== undefined && event === startEvent
      audioStarted = true
      startEvent = event ?? null
      document.body.removeEventListener('click', startAudio)
      canvas.removeEventListener('pointerup', startAudio)
      window.removeEventListener('keydown', onFirstKey)
      setMuted(false)
      mutedRef.current = false
      const canPlay = new Promise<void>((resolve) => {
        const wait = () => {
          if (destroyed) return
          if (introStartTime >= 0 && performance.now() - introStartTime >= AUDIO_DELAY_MS) resolve()
          else setTimeout(wait, 100)
        }
        wait()
      })
      const audio = createSceneAudio({ muted: false, canPlay })
      audioRef.current = audio
      return true
    }
    // Ctrl·Shift·Alt·Cmd만 누른 것은 첫 입력으로 치지 않는다 — Ctrl+M(음소거)의 Ctrl이 먼저 소리를 켜면
    // 이어 오는 M이 곧바로 다시 끈다(브라우저 단축키를 누를 때 소리가 켜지지도 않는다)
    const onFirstKey = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') return
      startAudio(event)
    }
    startAudioRef.current = startAudio
    document.body.addEventListener('click', startAudio)
    canvas.addEventListener('pointerup', startAudio)
    window.addEventListener('keydown', onFirstKey)

    const start = performance.now()
    let last = start
    const loop = (now: number) => {
      // dt는 0.1s로 클램프한다 — 로딩 히칭·탭 비활성으로 프레임 간격이 크게
      // 벌어져도 물리/카메라가 한 프레임에 튀지 않게 한다.
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      frameDt = dt
      const ratio = Math.min(5, dt * 60)
      shared.time.value = (now - start) / 1000
      controller?.update(dt)
      if (controller && kidAnimation) {
        blendKidAnimation(kidAnimation, controller.velocityHorizontal, motionOf(controller), ratio)
      }
      if (controller && kidMesh) {
        shared.charPos.value.copy(kidMesh.position)
        // 원본 잔디 셰이더는 m/프레임 단위 수평 속도를 받는다(m/s를 넣으면 60배로 밀려난다)
        shared.charSpeed.value = controller.velocityHorizontal
        // 동적 그림자는 카메라 시선 앞 6m를 중심으로 ±12m를 덮는다
        sun.follow(camera.position, controller.target)
        // 발소리 — 땅 위(공중·심심한 모션이 아닐 때)에서 속도에 맞춰 커진다
        audioRef.current?.update(
          kidMesh.position.x,
          controller.velocityHorizontal,
          !controller.airborne && !controller.bored,
        )
        circles.update(ratio, controller.touch)
        remotes?.update(ratio, camera, kidMesh.position)
      }
      for (const m of mixers) m.update(dt)
      birds?.update(dt, ratio)
      sky?.position.copy(camera.position)

      // 인트로 리빌 진행(4초 선형). 끝나면 인트로를 끈다.
      if (introStartTime >= 0 && !introDone) {
        const tr = Math.min(1, (now - introStartTime) / INTRO_REVEAL_MS)
        finalPass.uniforms.uTransition.value = tr
        if (tr >= 1) {
          introDone = true
          finalPass.uniforms.uIntro.value = 0
        }
      }

      // 원본 AdaptiveDPR — 0.5초마다 평균 FPS를 모아 4초마다 해상도 배수를 조정한다
      if (adaptive.active) {
        adaptive.bucketFrames++
        if (now - adaptive.bucketStart >= 500) {
          if (now >= adaptive.waitUntil) {
            adaptive.samples.push(Math.round(1000 / ((now - adaptive.bucketStart) / adaptive.bucketFrames)))
          }
          adaptive.bucketStart = now
          adaptive.bucketFrames = 0
        }
        if (now - adaptive.lastUpdate >= DPR_INTERVAL_MS && adaptive.samples.length > 1) {
          const average = adaptive.samples.reduce((a, b) => a + b, 0) / adaptive.samples.length
          if (average < DPR_MIN_FPS && dprMultiplier > DPR_MIN) {
            setDpr(Math.max(DPR_MIN, dprMultiplier - DPR_STEP))
            if (adaptive.direction === 1) adaptive.pingPongs++
            adaptive.direction = -1
          } else if (average >= DPR_MAX_FPS && dprMultiplier < 1) {
            setDpr(Math.min(1, dprMultiplier + DPR_STEP))
            if (adaptive.direction === -1) adaptive.pingPongs++
            adaptive.direction = 1
          }
          adaptive.samples.length = 0
          adaptive.lastUpdate = now
          if (adaptive.pingPongs >= DPR_PING_PONG_LIMIT) adaptive.active = false
        }
      }

      composer.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.body.removeEventListener('click', startAudio)
      canvas.removeEventListener('pointerup', startAudio)
      window.removeEventListener('keydown', onFirstKey)
      controller?.dispose()
      controllerRef.current = null
      connection?.dispose()
      remotes?.dispose()
      audioRef.current?.dispose()
      audioRef.current = null
      for (const m of mixers) m.stopAllAction()
      materials.forEach((m) => m.dispose())
      disposables.forEach((d) => d.dispose())
      ktx2.dispose()
      composer.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  // 음소거 토글은 오디오가 만들어진 뒤에도 반영돼야 한다
  useEffect(() => {
    mutedRef.current = muted
    audioRef.current?.setMuted(muted)
  }, [muted])

  useEffect(() => {
    mapOpenRef.current = mapOpen
    controllerRef.current?.setEnabled(!mapOpen)
  }, [mapOpen])

  // 개발 모드(StrictMode)는 이펙트를 두 번 돌린다 — 추적기는 이펙트 안에서 만들고 버린다
  useEffect(() => {
    const tracker = createGpsTracker()
    tracker.startIfGranted()
    setGps(tracker)
    return () => tracker.dispose()
  }, [])

  /** 원본 버튼 — 누르는 순간 클릭음(키보드로 누르면 클릭 때) */
  const pressSound = () => audioRef.current?.click()

  const playing = phase === 'playing' && !unsupported
  useMapHotkey(playing, setMapOpen)

  // Ctrl+M — 사운드 버튼과 같다. 첫 입력이 이 키면 원본처럼 소리를 켜는 것으로 끝난다
  useEffect(() => {
    if (!playing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || !e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat) return
      e.preventDefault()
      audioRef.current?.click()
      if (!startAudioRef.current(e)) setMuted((m) => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#FFFDF8] select-none">
      <style>{`
        .sa-root { text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        /* 우상단 nav — 원본 UI. 인트로 시작 2.5s 뒤 오른쪽 80px에서 1.5s power2.out으로 들어온다. */
        @keyframes sa-nav-in { from { transform: translateX(80px); } to { transform: translateX(0); } }
        .sa-nav { position: absolute; top: 35px; right: 35px; display: flex; flex-direction: column; align-items: center; touch-action: none; -webkit-tap-highlight-color: transparent; animation: sa-nav-in 1.5s cubic-bezier(0.33, 1, 0.68, 1) 2.5s both; }
        .sa-btn { position: relative; display: block; width: 32px; height: 32px; border-radius: 5px; transform: rotate(10deg); cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; transition: transform 0.15s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.15s cubic-bezier(0.33, 1, 0.68, 1); }
        .sa-btn { margin-bottom: 16px; background-color: #f9efdc; box-shadow: 2px 2px 0 0 #716c66; }
        .sa-btn:focus-visible { outline: 3px solid #5d5a57; outline-offset: 4px; }
        /* 원본은 마우스일 때만 호버로 커진다 — 터치 기기에서 확대가 남지 않게 한다 */
        @media (hover: hover) { .sa-btn:hover { transform: rotate(10deg) scale(1.1); } }
        .sa-btn:active { transform: translate(2px, 2px) rotate(10deg) scale(1.1); box-shadow: 0 0 0 0 transparent; }
        .sa-btn > * { pointer-events: none; }
        .sa-sound { display: block; position: absolute; top: 4px; left: 4px; width: 25px; height: 25px; transform: rotate(-10deg); }
        .sa-sound2 { left: 8px; }
        .sa-color { position: relative; width: 18px; height: 18px; margin: 7px; border-radius: 2px; transform: rotate(-16deg); }
        .sa-map { display: block; position: absolute; top: 7px; left: 6px; transform: rotate(-10deg); }

        /* 원본 max-width: 1200px 분기 */
        @media (max-width: 1200px) {
          .sa-nav { top: 20px; right: 20px; }
          .sa-btn { margin-bottom: 12px; }
        }
        /* 손가락으로 누르는 화면과 아주 큰 화면에서는 버튼 묶음을 통째로 키운다(오른쪽 위 기준) */
        @media (pointer: coarse) { .sa-nav { scale: 1.2; transform-origin: top right; } }
        @media (min-width: 2400px) and (min-height: 1300px) { .sa-nav { scale: 1.3; transform-origin: top right; } }
      `}</style>
      <div className="sa-root absolute inset-0">
        <div ref={mountRef} className="w-full h-full touch-none" />

        {/* WebGL2가 없으면 로더를 걷은 뒤 안내만 띄운다 */}
        {unsupported && phase === 'playing' && (
          <Loader
            spinning={false}
            message="이 브라우저에서는 마을을 열 수 없어요"
            hint="WebGL2를 지원하는 최신 브라우저(Chrome·Safari·Edge)로 열어 주세요"
          />
        )}

        {/* 펼침 지도 — 실제 내 위치(GPS)를 게임 화풍 종이 지도로 */}
        {playing && gps && (
          <PaperMap open={mapOpen} onClose={() => setMapOpen(false)} gps={gps} title="지도" accent={charColor} />
        )}

        {/* 로딩 화면 — 로더(스피너 + 안내 한 줄, 버튼 없이 자동 진입) */}
        {phase !== 'playing' &&
          (error ? (
            <Loader spinning={false} message="마을을 불러오지 못했어요" hint="잠시 후 새로고침해 주세요">
              <button
                type="button"
                className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
                onClick={() => window.location.reload()}
              >
                새로고침
              </button>
            </Loader>
          ) : (
            <Loader fading={phase === 'fading'} message="마을을 불러오고 있어요. 잠시만 기다려 주세요." />
          ))}

        {/* 우상단 버튼 — 원본 사운드 / 옷 색에 지도를 더했다 */}
        {playing && (
          <nav className="sa-nav">
            <ToolButton
              label="소리 켜기·끄기 (Ctrl+M)"
              onPress={pressSound}
              onClick={(e) => {
                // 첫 입력이 이 버튼이면 원본처럼 소리를 켜는 것으로 끝난다
                if (!startAudioRef.current(e.nativeEvent)) setMuted((m) => !m)
              }}
            >
              {/* 원본 아이콘: 꺼짐=사선 그은 스피커, 켜짐=스피커+막대(sound2) */}
              {muted ? (
                <svg className="sa-sound" width="17" height="13" viewBox="0 0 17 13" fill="none">
                  <path
                    d="M10.1891 0.227726L6.12965 3.33204H4.16819C3.65646 3.33204 3.23005 3.74143 3.23005 4.27018V8.65375C3.23005 8.81868 3.27258 8.97476 3.34792 9.11054L0.815582 10.9067C0.36511 11.2262 0.25895 11.8504 0.578469 12.3009C0.897988 12.7514 1.52219 12.8576 1.97266 12.538L6.12627 9.59189H6.1468L6.17341 9.61233L11.929 5.52989V5.47601L15.623 2.85588C16.0735 2.53637 16.1796 1.91216 15.8601 1.46169C15.5406 1.01122 14.9164 0.905058 14.4659 1.22458L11.929 3.02399V1.08062C11.9119 0.176617 10.8886 -0.318087 10.1892 0.227787L10.1891 0.227726ZM11.929 7.98191L7.83329 10.887L10.1892 12.6962C10.8886 13.2421 11.929 12.7304 11.929 11.8434V7.98191Z"
                    fill="#716C66"
                  />
                </svg>
              ) : (
                <svg className="sa-sound sa-sound2" width="17" height="13" viewBox="0 0 17 13" fill="none">
                  <path
                    d="M6.95909 0.227726L2.8996 3.33204H0.938147C0.426417 3.33204 0 3.74143 0 4.27018V8.65375C0 9.16548 0.40939 9.59189 0.938147 9.59189H2.91675L6.95918 12.6962C7.65853 13.2421 8.69899 12.7304 8.69899 11.8434V1.08062C8.68186 0.176617 7.65853 -0.318087 6.95918 0.227787L6.95909 0.227726Z"
                    fill="#716C66"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M11 2.40002C11.5523 2.40002 12 2.84774 12 3.40002V9.40002C12 9.95231 11.5523 10.4 11 10.4C10.4477 10.4 10 9.95231 10 9.40002V3.40002C10 2.84774 10.4477 2.40002 11 2.40002Z"
                    fill="#716C66"
                  />
                </svg>
              )}
            </ToolButton>

            <ToolButton label="옷 색 바꾸기" onPress={pressSound} onClick={() => cycleColorRef.current()}>
              <div className="sa-color" style={{ backgroundColor: charColor }} />
            </ToolButton>

            <ToolButton label="지도 펼치기 (M)" onPress={pressSound} onClick={() => setMapOpen((open) => !open)}>
              <MapIcon className="sa-map" />
              <GpsBadge snapshot={gpsView} />
            </ToolButton>
          </nav>
        )}
      </div>
    </div>
  )
}

/**
 * 원본 버튼 — 32×32 크림 사각형을 10° 기울이고(하드 그림자), 아이콘은
 * 안에서 절대배치·역회전한다. 호버 1.1배, 누르면 2px 눌리며 그림자가 사라지고
 * 누르는 순간 클릭음이 난다(키보드로 누르면 클릭 때).
 */
function ToolButton({
  label,
  onPress,
  onClick,
  children,
}: {
  /** 스크린 리더·툴팁 이름 — 단축키가 있으면 함께 적는다 */
  label: string
  onPress: () => void
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="sa-btn"
      aria-label={label}
      title={label}
      onPointerDown={onPress}
      onClick={(e) => {
        if (e.detail === 0) onPress()
        onClick(e)
      }}
    >
      {children}
    </button>
  )
}

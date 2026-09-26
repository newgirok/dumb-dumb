'use client'

// 원본(Summer Afternoon) 재현 — 루트(/) 3D 씬. 씬 구성·셰이딩·조작·UI·오디오를
// 원본 코드에서 그대로 옮겼다. 원본: https://summer-afternoon.vlucendo.com/

import {
  useCallback,
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
import MiniMap from '@/components/world/MiniMap'

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

/**
 * 원본 5개 비밀 — 오브젝트가 화면에 그려지는 동안 캐릭터가 이 거리 안에 들어오면
 * 한 번 발견되고 하단 모달로 문구가 뜬다.
 */
const SECRETS: Record<string, { distance: number; text: string }> = {
  ufo: { distance: 10, text: "It's a big metallic object. You want to believe it's some kind of vehicle." },
  alien: { distance: 3, text: "It's a very pale and strange looking man. He probably spends too much time on the computer." },
  cats: { distance: 2, text: "If these two white cats weren't next to each other it would seem like they were the same one." },
  sloth: { distance: 3, text: 'A sloth? That permanent smile it has is so creepy. What is it doing there?' },
  gossip: { distance: 2, text: 'These things look as if they have been taken out of a video game.' },
}
const SECRET_TOTAL = Object.keys(SECRETS).length

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
/** 정보 모달 — 열림 애니메이션(본문 1.5s+0.75s)이 끝나야 닫기를 받고, 닫힘은 0.25s */
const INFO_READY_MS = 2250
const INFO_CLOSE_MS = 250
/** 정보 모달 오버레이(원본 uOverlayTransition 1s power2.inOut) */
const OVERLAY_MS = 1000
/** 비밀 모달 — 본문이 다 나타나면(2.25s) 발견 수가 오르고, 10초 뒤 저절로 닫힌다 */
const SECRET_REVEAL_MS = 2250
const SECRET_AUTOHIDE_MS = 10_000
const SECRET_CLOSE_MS = 500

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

/** gsap power2.inOut(=cubic) */
function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 원본 userData.a — 공중이면 1, 심심하면 2 */
function motionOf(controller: ThirdPerson): SceneMotion {
  return controller.airborne ? 1 : controller.bored ? 2 : 0
}

type SecretModal = { text: string; key: number; closing: boolean }

export default function SummerAfternoonPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  // 'loading' → 에셋 로드 중, 'fading' → 로더가 사라지는 중, 'playing' → 인트로·조작 시작
  const [phase, setPhase] = useState<'loading' | 'fading' | 'playing'>('loading')
  // 폰트가 늦게 오면 원본처럼 로더 제목을 대체 크기(42px)로 둔다
  const [fontReady, setFontReady] = useState(false)
  const [unsupported, setUnsupported] = useState(false)
  // 인트로 소용돌이 리빌이 끝났는가 — 미니맵을 리빌 후에 노출한다
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 원본처럼 소리 꺼짐으로 시작하고, 첫 입력 때 켜진다
  const [muted, setMuted] = useState(true)
  // 정보 모달 — 'closing'은 닫힘 페이드가 끝날 때까지 DOM을 유지하는 단계
  const [info, setInfo] = useState<'closed' | 'open' | 'closing'>('closed')
  const [infoKind, setInfoKind] = useState<'about' | 'congrats'>('about')
  // 열림 애니메이션이 끝나야 닫기를 받는다(원본 toggle 진행 중 무시)
  const [infoReady, setInfoReady] = useState(false)
  // 정보 모달을 한 번이라도 열었으면 nav 재진입은 인트로가 아닌 복귀 애니메이션을 쓴다
  const [navReturn, setNavReturn] = useState(false)
  const [secretModal, setSecretModal] = useState<SecretModal | null>(null)
  // 발견한 비밀 수 — 원본처럼 버튼 아래 "n/5"로 표시한다
  const [secretsFound, setSecretsFound] = useState(0)
  // 캐릭터 옷 색(원본 color-square 버튼) — 첫 색은 로드 때 무작위로 정한다
  const [charColor, setCharColor] = useState('#F0EADE')

  const audioRef = useRef<SceneAudio | null>(null)
  const controllerRef = useRef<ThirdPerson | null>(null)
  const mutedRef = useRef(true)
  const infoRef = useRef(info)
  const secretsFoundRef = useRef(0)
  // useEffect 안에서 만든 함수를 React 버튼과 잇는 다리
  const cycleColorRef = useRef<() => void>(() => {})
  const overlayRef = useRef<(open: boolean) => void>(() => {})
  const secretRef = useRef<(text: string) => void>(() => {})
  const startAudioRef = useRef<(event?: Event) => boolean>(() => false)

  useEffect(() => {
    infoRef.current = info
  }, [info])

  useEffect(() => {
    let cancelled = false
    document.fonts
      ?.load('1em Stylish')
      .then(() => !cancelled && setFontReady(true))
      .catch(() => !cancelled && setFontReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // 원본처럼 WebGL2가 없으면 로더를 걷고 안내 문구만 띄운다
    if (!supportsWebGL2()) {
      setUnsupported(true)
      setPhase('fading')
      const t = setTimeout(() => setPhase('playing'), LOADER_FADE_MS + LOADER_HIDDEN_MS)
      return () => clearTimeout(t)
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
    const found = new Set<string>()

    // 인트로·오버레이 진행
    let introStartTime = -1
    let introDone = false
    let overlayFrom = 0
    let overlayTo = 0
    let overlayStart = -Infinity
    overlayRef.current = (open) => {
      overlayFrom = finalPass.uniforms.uOverlayTransition.value
      overlayTo = open ? 1 : 0
      overlayStart = performance.now()
    }

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

    /** 비밀 판정 — 오브젝트가 그려질 때 캐릭터가 가까우면 한 번 발견된다 */
    const checkSecret = (name: string, object: THREE.Object3D) => {
      if (found.has(name) || !kidMesh) return
      if (object.position.distanceTo(kidMesh.position) >= SECRETS[name].distance) return
      found.add(name)
      secretRef.current(SECRETS[name].text)
    }

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
      ufo.onBeforeRender = () => checkSecret('ufo', ufo)
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
      gossip.onBeforeRender = () => checkSecret('gossip', gossip)
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
          checkSecret(c.mesh, skin)
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

      // 로더를 걷고(0.75s 페이드 + 0.25s) 인트로를 시작한다
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
    })().catch((err) => setError(String(err)))

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
      window.removeEventListener('keydown', startAudio)
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
      audio.setOverlay(infoRef.current === 'open')
      audioRef.current = audio
      return true
    }
    startAudioRef.current = startAudio
    document.body.addEventListener('click', startAudio)
    canvas.addEventListener('pointerup', startAudio)
    window.addEventListener('keydown', startAudio)

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

      // 인트로 리빌 진행(4초 선형). 끝나면 오버레이 모드로 바꾸고 미니맵을 노출한다.
      if (introStartTime >= 0 && !introDone) {
        const tr = Math.min(1, (now - introStartTime) / INTRO_REVEAL_MS)
        finalPass.uniforms.uTransition.value = tr
        if (tr >= 1) {
          introDone = true
          finalPass.uniforms.uIntro.value = 0
          setRevealed(true)
        }
      }
      // 정보 모달 오버레이 — 1초 power2.inOut
      const overlayT = THREE.MathUtils.clamp((now - overlayStart) / OVERLAY_MS, 0, 1)
      finalPass.uniforms.uOverlayTransition.value =
        overlayFrom + (overlayTo - overlayFrom) * easeCubicInOut(overlayT)

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
      window.removeEventListener('keydown', startAudio)
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

  // 정보 모달이 떠 있는 동안은 캐릭터 조작을 끈다(원본 — 닫히기 시작하면 다시 켠다).
  // 배경음은 0.4배로, 화면은 크림색으로 덮는다.
  useEffect(() => {
    const open = info === 'open'
    controllerRef.current?.setEnabled(!open)
    audioRef.current?.setOverlay(open)
    if (info !== 'closed') overlayRef.current(open)
  }, [info])

  const openInfo = useCallback((kind: 'about' | 'congrats') => {
    if (infoRef.current !== 'closed') return
    setInfoKind(kind)
    setInfoReady(false)
    setNavReturn(true)
    setInfo('open')
  }, [])
  const closeInfo = () => {
    if (info !== 'open' || !infoReady) return
    setInfo('closing')
  }
  // 열림 애니메이션(≈2.25s)이 끝나면 닫기를 허용하고, 닫힘 페이드(0.25s) 뒤 DOM을 뺀다
  useEffect(() => {
    if (info === 'closed') return
    const t =
      info === 'open'
        ? setTimeout(() => setInfoReady(true), INFO_READY_MS)
        : setTimeout(() => setInfo('closed'), INFO_CLOSE_MS)
    return () => clearTimeout(t)
  }, [info])
  // ESC로도 닫힌다(원본은 keyup)
  useEffect(() => {
    if (info !== 'open' || !infoReady) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setInfo('closing')
    }
    window.addEventListener('keyup', onKey)
    return () => window.removeEventListener('keyup', onKey)
  }, [info, infoReady])

  // 비밀 모달 — 하나씩 띄운다. 떠 있는 중에 새 비밀을 찾으면 지금 것을 닫고 이어서 띄운다.
  const secretTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const secretQueue = useRef<string[]>([])
  const secretState = useRef<SecretModal | null>(null)
  const secretKey = useRef(0)
  const showSecretRef = useRef<(text: string) => void>(() => {})
  const clearSecretTimers = () => {
    secretTimers.current.forEach(clearTimeout)
    secretTimers.current = []
  }
  const hideSecret = useCallback(() => {
    const current = secretState.current
    if (!current || current.closing) return
    clearSecretTimers()
    const closing = { ...current, closing: true }
    secretState.current = closing
    setSecretModal(closing)
    secretTimers.current.push(
      setTimeout(() => {
        secretState.current = null
        setSecretModal(null)
        const next = secretQueue.current.shift()
        if (next) showSecretRef.current(next)
        // 원본 checkEastersDiscovered — 다 찾았으면 축하 모달을 띄운다
        else if (secretsFoundRef.current >= SECRET_TOTAL) openInfo('congrats')
      }, SECRET_CLOSE_MS),
    )
  }, [openInfo])
  showSecretRef.current = (text: string) => {
    if (secretState.current) {
      secretQueue.current.push(text)
      hideSecret()
      return
    }
    secretKey.current++
    const modal = { text, key: secretKey.current, closing: false }
    secretState.current = modal
    setSecretModal(modal)
    secretTimers.current.push(
      setTimeout(() => {
        // 원본 increaseEastersDiscovered — 본문이 다 나타난 뒤 센다
        secretsFoundRef.current = Math.min(SECRET_TOTAL, secretsFoundRef.current + 1)
        setSecretsFound(secretsFoundRef.current)
        secretTimers.current.push(setTimeout(hideSecret, SECRET_AUTOHIDE_MS))
      }, SECRET_REVEAL_MS),
    )
  }
  useEffect(() => {
    secretRef.current = (text) => showSecretRef.current(text)
  }, [])
  // 정보 모달을 열면 비밀 모달은 닫는다(원본)
  useEffect(() => {
    if (info === 'open') hideSecret()
  }, [info, hideSecret])
  useEffect(() => () => clearSecretTimers(), [])

  /** 원본 버튼 — 누르는 순간 클릭음(키보드로 누르면 클릭 때) */
  const pressSound = () => audioRef.current?.click()

  // 문구는 제품(어슬렁) 것으로 쓰고, null 자리에 원작 출처를 남긴다
  const infoContent =
    infoKind === 'about'
      ? {
          title: '어슬렁',
          paragraphs: [
            '여름 오후의 바닷가 마을을 느긋하게 어슬렁거려 보세요. 같은 때 들른 사람이 있다면 길에서 마주칠지도 몰라요.',
            '마을 곳곳에 비밀 5개가 숨어 있어요. 모두 찾을 수 있을까요?',
            null,
          ],
        }
      : {
          title: '비밀 5개를 모두 찾았어요!',
          paragraphs: ['마을 구석구석을 어슬렁거려 줘서 고마워요.', '오늘도 느긋한 여름 오후 보내세요 ☀️'],
        }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#FFFDF8] select-none">
      <style>{`
        @font-face {
          font-family: 'Stylish';
          src: url('/ref-assets/fonts/Stylish-Regular.woff2') format('woff2'),
            url('/ref-assets/fonts/Stylish-Regular.woff') format('woff');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        .sa-root { text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        /* 원본 로더 — 제목 + SVG 스피너(2.5s). 준비되면 0.75s(cubic in-out)에 걸쳐 사라진다 */
        @keyframes sa-rotator { 0% { transform: rotate(0deg); } 100% { transform: rotate(270deg); } }
        @keyframes sa-dash {
          0% { stroke-dashoffset: 187; }
          50% { stroke-dashoffset: 46.75; transform: rotate(135deg); }
          100% { stroke-dashoffset: 187; transform: rotate(450deg); }
        }
        .sa-loader { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; background-color: #FFFDF8; }
        .sa-loader > * { transition: opacity 0.75s cubic-bezier(0.645, 0.045, 0.355, 1); }
        .sa-loader.fading > * { opacity: 0; }
        .sa-loader h1 { font-family: Stylish, sans-serif; font-weight: normal; text-align: center; font-size: 50px; line-height: 0.8em; margin: 0 0 20px 0; color: #BDBCB8; }
        .sa-loader h1.fallback { line-height: 0.95em; font-size: 42px; }
        .sa-spinner { width: 54px; height: 54px; }
        .sa-spinner svg { display: block; width: 100%; height: 100%; animation: sa-rotator 2.5s linear infinite; }
        .sa-spinner .path { stroke: #BDBCB8; stroke-dasharray: 187; stroke-dashoffset: 0; transform-origin: center; animation: sa-dash 2.5s ease-in-out infinite; }

        /* 우상단 nav — 원본 UI. 인트로 시작 2.5s 뒤 오른쪽 80px에서 1.5s power2.out으로
           들어오고, 정보 모달이 열리면 0.75s inOut1로 빠졌다가 닫히면 0.5s 뒤 1.5s에 걸쳐 돌아온다. */
        @keyframes sa-nav-in { from { transform: translateX(80px); } to { transform: translateX(0); } }
        @keyframes sa-nav-out { from { transform: translateX(0); } to { transform: translateX(80px); } }
        .sa-nav { position: absolute; top: 35px; right: 35px; display: flex; flex-direction: column; align-items: center; touch-action: none; -webkit-tap-highlight-color: transparent; animation: sa-nav-in 1.5s cubic-bezier(0.33, 1, 0.68, 1) 2.5s both; }
        .sa-nav.hidden { pointer-events: none; animation: sa-nav-out 0.75s cubic-bezier(0.5, 0, 0.1, 1) both; }
        .sa-nav.return { animation: sa-nav-in 1.5s cubic-bezier(0.33, 1, 0.68, 1) 0.5s both; }
        .sa-btn, .sa-close { position: relative; display: block; width: 32px; height: 32px; border-radius: 5px; transform: rotate(10deg); cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; transition: transform 0.15s cubic-bezier(0.33, 1, 0.68, 1), box-shadow 0.15s cubic-bezier(0.33, 1, 0.68, 1); }
        .sa-btn { margin-bottom: 16px; background-color: #f9efdc; box-shadow: 2px 2px 0 0 #716c66; }
        .sa-btn:focus-visible, .sa-close:focus-visible { outline: 3px solid #5d5a57; outline-offset: 4px; }
        /* 원본은 마우스일 때만 호버로 커진다 — 터치 기기에서 확대가 남지 않게 한다 */
        @media (hover: hover) { .sa-btn:hover, .sa-close:hover { transform: rotate(10deg) scale(1.1); } }
        .sa-btn:active, .sa-close:active { transform: translate(2px, 2px) rotate(10deg) scale(1.1); box-shadow: 0 0 0 0 transparent; }
        .sa-btn > *, .sa-close > * { pointer-events: none; }
        .sa-sound { display: block; position: absolute; top: 4px; left: 4px; width: 25px; height: 25px; transform: rotate(-10deg); }
        .sa-sound2 { left: 8px; }
        .sa-color { position: relative; width: 18px; height: 18px; margin: 7px; border-radius: 2px; transform: rotate(-16deg); }
        .sa-info { display: block; position: absolute; top: 6px; left: 5px; width: 22px; height: 22px; transform: rotate(-10deg); }
        .sa-cnt { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); white-space: nowrap; pointer-events: none; font-family: Stylish, sans-serif; font-weight: 400; font-size: 33px; letter-spacing: -0.05em; line-height: 1em; text-align: center; color: #f9efdc; text-shadow: 2px 2px 0 #716c66; }
        /* 미니맵(이 제품 전용 HUD)도 정보 모달 동안 nav와 함께 빠진다 */
        .sa-minimap { transition: opacity 0.75s cubic-bezier(0.5, 0, 0.1, 1); }
        .sa-minimap.hidden { opacity: 0; pointer-events: none; }
        .sa-minimap.hidden * { pointer-events: none !important; }

        /* 카드 등장 — 원본 gsap: 그림자 카드가 -40°에서 돌며 커지고, 밝은 카드·닫기 버튼이
           차례로 커진 뒤 1.5s부터 본문이 나타난다(ease "inOut3" = cubic-bezier(0.6, 0, 0, 1)) */
        @keyframes sa-fade-in { from { opacity: 0.001; } to { opacity: 1; } }
        @keyframes sa-fade-out { from { opacity: 1; } to { opacity: 0.001; } }
        @keyframes sa-scale-in { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes sa-close-in { from { transform: rotate(10deg) scale(0); } to { transform: rotate(10deg) scale(1); } }
        @keyframes sa-info-dark-in { from { transform: translate(10px, 10px) rotate(-40deg) scale(0); } to { transform: translate(10px, 10px) rotate(1deg) scale(1); } }
        @keyframes sa-modal-dark-in { from { transform: translate(8px, 8px) rotate(-40deg) scale(0); } to { transform: translate(8px, 8px) rotate(0.5deg) scale(1); } }

        /* 정보 모달 — 원본 #info. 배경은 DOM이 아니라 화면 셰이더 오버레이로 덮는다 */
        .sa-info-root { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: Stylish, sans-serif; font-weight: 400; text-align: left; -webkit-tap-highlight-color: transparent; }
        .sa-info-hit { position: absolute; inset: 0; }
        .sa-info-cnt { position: relative; padding: 50px 60px; margin: 30px; }
        .sa-info-root.closing .sa-info-cnt { animation: sa-fade-out 0.25s cubic-bezier(0.645, 0.045, 0.355, 1) both; }
        .sa-info-dark, .sa-info-light { position: absolute; inset: 0; border-radius: 5px; }
        .sa-info-dark { background-color: #bab3a5; animation: sa-info-dark-in 2s cubic-bezier(0.6, 0, 0, 1) 0.2s both; }
        .sa-info-light { background-color: #f9f2e4; animation: sa-scale-in 2s cubic-bezier(0.6, 0, 0, 1) 0.35s both; }
        .sa-info-cnt article { position: relative; max-width: 600px; word-break: keep-all; animation: sa-fade-in 0.75s cubic-bezier(0.645, 0.045, 0.355, 1) 1.5s both; }
        .sa-info-cnt h1 { font-size: 45px; line-height: 1em; font-weight: 400; letter-spacing: -0.03em; color: #8d8981; margin: 0 0 1.3em; }
        .sa-info-cnt p { font-size: 30px; line-height: 1em; letter-spacing: -0.03em; color: #989389; margin: 0 0 1.3em; }
        .sa-info-cnt p:last-of-type { margin: 0; }
        .sa-link2 { display: inline-block; position: relative; padding-left: 18px; color: #989389; text-decoration: none; }
        .sa-link2::before { content: ""; display: block; position: absolute; top: 50%; left: 0; width: 13px; height: 3px; border-radius: 3px; background-color: #a19c92; transform-origin: 0 50%; transition: transform 0.4s cubic-bezier(0.5, 0, 0.1, 1); }
        .sa-link2:hover::before { transform: scaleX(0.65); }
        .sa-info-cnt .sa-close { position: absolute; top: 30px; right: 30px; background-color: #f5eede; box-shadow: 2px 2px 0 0 #989389; animation: sa-close-in 2s cubic-bezier(0.6, 0, 0, 1) 0.95s backwards; }
        .sa-close.inactive { pointer-events: none; }
        .sa-close svg { display: block; position: absolute; top: 9px; left: 8px; width: 18px; height: 18px; transform: rotate(-10deg); }

        /* 비밀 모달 — 원본 #modal. 화면 하단 가운데 카드이고 캔버스 조작을 막지 않는다 */
        .sa-modal { position: absolute; bottom: 15px; left: 0; width: 100%; z-index: 25; display: flex; flex-direction: row; justify-content: center; align-items: flex-end; pointer-events: none; font-family: Stylish, sans-serif; font-weight: 400; text-align: left; -webkit-tap-highlight-color: transparent; }
        .sa-modal-cnt { position: relative; padding: 33px 90px 33px 40px; margin: 30px; }
        .sa-modal-cnt.closing { animation: sa-fade-out 0.5s cubic-bezier(0.645, 0.045, 0.355, 1) both; }
        .sa-modal-dark, .sa-modal-light { position: absolute; inset: 0; border-radius: 5px; }
        .sa-modal-dark { background-color: #b5a997; animation: sa-modal-dark-in 2s cubic-bezier(0.6, 0, 0, 1) 0.2s both; }
        .sa-modal-light { background-color: #fff6e3; animation: sa-scale-in 2s cubic-bezier(0.6, 0, 0, 1) 0.35s both; }
        .sa-modal-cnt article { position: relative; max-width: 600px; animation: sa-fade-in 0.75s cubic-bezier(0.645, 0.045, 0.355, 1) 1.5s both; }
        .sa-modal-cnt p { font-size: 30px; letter-spacing: -0.03em; line-height: 1em; color: #989389; margin: 0; }
        .sa-modal-cnt .sa-close { position: absolute; top: 22px; right: 22px; pointer-events: initial; background-color: #faf2e2; box-shadow: 2px 2px 0 0 #989389; animation: sa-close-in 2s cubic-bezier(0.6, 0, 0, 1) 0.95s backwards; }

        /* 원본 max-width: 1200px 분기 */
        @media (max-width: 1200px) {
          .sa-nav { top: 20px; right: 20px; }
          .sa-btn { margin-bottom: 12px; }
          .sa-cnt { font-size: 27px; }
          .sa-info-cnt { padding: 64px 26px 40px; margin: 20px; }
          .sa-info-cnt h1 { font-size: 32px; }
          .sa-info-cnt p { font-size: 25px; }
          .sa-link2::before { height: 2px; }
          .sa-info-cnt .sa-close { top: 24px; right: 24px; }
          .sa-modal { bottom: 0; }
          .sa-modal-cnt { padding: 28px 65px 28px 30px; }
          .sa-modal-cnt p { font-size: 23px; }
          .sa-modal-cnt .sa-close { top: 15px; right: 15px; }
        }
      `}</style>
      <div className="sa-root absolute inset-0">
        <div ref={mountRef} className="w-full h-full touch-none" />

        {/* WebGL2가 없으면 원본처럼 안내 문구만 띄운다 */}
        {unsupported && phase === 'playing' && (
          <div>
            Seems like WebGL2 is not supported by your browser 😰 Please update it to access the
            experience.
          </div>
        )}

        {/* 화면 5시 나침반형 GIS 미니맵 — 인트로 소용돌이 리빌이 끝난 뒤 노출 */}
        {revealed && (
          <div className={`sa-minimap${info === 'open' ? ' hidden' : ''}`}>
            <MiniMap />
          </div>
        )}

        {/* 로딩 화면 — 원본 레이아웃: 제품 이름 + SVG 스피너 (버튼 없음, 자동 진입) */}
        {phase !== 'playing' && (
          <div className={`sa-loader${phase === 'fading' ? ' fading' : ''}`}>
            <h1 className={fontReady ? '' : 'fallback'}>어슬렁</h1>
            {error ? (
              <p className="text-sm text-red-500/80">로드 실패: {error}</p>
            ) : (
              <div className="sa-spinner">
                <svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">
                  <circle
                    className="path"
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    cx="33"
                    cy="33"
                    r="29"
                  />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* 우상단 버튼 — 원본과 동일: 사운드 / 옷 색 / 정보 + 비밀 카운터 */}
        {phase === 'playing' && !unsupported && (
          <nav className={`sa-nav${info === 'open' ? ' hidden' : navReturn ? ' return' : ''}`}>
            <ToolButton
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

            <ToolButton onPress={pressSound} onClick={() => cycleColorRef.current()}>
              <div className="sa-color" style={{ backgroundColor: charColor }} />
            </ToolButton>

            <ToolButton onPress={pressSound} onClick={() => openInfo('about')}>
              <svg className="sa-info" width="4" height="17" viewBox="0 0 4 17" fill="none">
                <path
                  d="M4 2C4 3.10457 3.10457 4 2 4C0.89543 4 0 3.10457 0 2C0 0.89543 0.89543 0 2 0C3.10457 0 4 0.89543 4 2Z"
                  fill="#716C66"
                />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2 6C3.10457 6 4 6.89543 4 8L4 14.8182C4 15.9228 3.10457 16.8182 2 16.8182C0.895431 16.8182 0 15.9228 0 14.8182L0 8C0 6.89543 0.895431 6 2 6Z"
                  fill="#716C66"
                />
              </svg>
            </ToolButton>

            {/* 비밀 카운터 — 원본 .cnt(버튼 아래, 크림색+하드 그림자) */}
            <div className="sa-cnt">
              {secretsFound}/{SECRET_TOTAL}
            </div>
          </nav>
        )}

        {/* 비밀 모달 — 원본 #modal(하단 가운데). 10초 뒤 저절로 닫힌다 */}
        {secretModal && phase === 'playing' && (
          <div className="sa-modal" key={secretModal.key}>
            <div className={`sa-modal-cnt${secretModal.closing ? ' closing' : ''}`}>
              <div className="sa-modal-dark" />
              <div className="sa-modal-light" />
              <article>
                <p>{secretModal.text}</p>
              </article>
              <CloseButton inactive={secretModal.closing} onPress={pressSound} onClick={hideSecret} />
            </div>
          </div>
        )}

        {/* 정보 모달 — 원본 #info 레이아웃·애니메이션(문구는 제품 것, 마지막 줄은 원작 출처). 열림
            애니메이션이 끝나기 전에는 닫기(X·바깥 클릭·ESC)를 받지 않는다(원본과 동일). */}
        {info !== 'closed' && phase === 'playing' && (
          <div className={`sa-info-root ${info}`}>
            <div className="sa-info-hit" onClick={closeInfo} />
            <div className="sa-info-cnt">
              <div className="sa-info-dark" />
              <div className="sa-info-light" />
              <article>
                <h1>{infoContent.title}</h1>
                {infoContent.paragraphs.map((text, i) =>
                  text === null ? (
                    <p key={i}>
                      <a
                        href="https://summer-afternoon.vlucendo.com/"
                        rel="noreferrer"
                        target="_blank"
                        className="sa-link2"
                      >
                        원작 Summer Afternoon · Vicente
                      </a>
                    </p>
                  ) : (
                    <p key={i}>{text}</p>
                  ),
                )}
              </article>
              <CloseButton inactive={!infoReady} onPress={pressSound} onClick={closeInfo} />
            </div>
          </div>
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
  onPress,
  onClick,
  children,
}: {
  onPress: () => void
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="sa-btn"
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

/** 원본 모달 닫기 버튼 — 열림 애니메이션 중에는 비활성(원본 .inactive) */
function CloseButton({
  inactive,
  onPress,
  onClick,
}: {
  inactive: boolean
  onPress: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label="닫기"
      className={`sa-close${inactive ? ' inactive' : ''}`}
      onPointerDown={onPress}
      onClick={(e) => {
        if (e.detail === 0) onPress()
        onClick()
      }}
    >
      <svg width="14" height="13" viewBox="0 0 14 13" fill="none">
        <path
          d="M0.953544 1.39654C1.48018 0.757055 2.42551 0.665571 3.065 1.19221L12.2188 8.7306C12.8583 9.25724 12.9497 10.2026 12.4231 10.8421C11.8965 11.4815 10.9511 11.573 10.3116 11.0464L1.15788 3.508C0.51839 2.98136 0.426906 2.03603 0.953544 1.39654Z"
          fill="#938D82"
        />
        <path
          d="M12.0486 1.06065C12.6344 1.64643 12.6344 2.59618 12.0486 3.18197L3.66352 11.567C3.07774 12.1528 2.12799 12.1528 1.5422 11.567C0.956417 10.9812 0.956417 10.0315 1.5422 9.44572L9.92727 1.06065C10.5131 0.474861 11.4628 0.474861 12.0486 1.06065Z"
          fill="#938D82"
        />
      </svg>
    </button>
  )
}

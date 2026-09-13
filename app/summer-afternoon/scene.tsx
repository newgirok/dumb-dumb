'use client'

// 원본(Summer Afternoon) 룩 재현 — 아트 디렉션을 눈으로 확정하기 위한
// 독립 씬. Mapbox와 무관하고 게임 로직도 없다.
// 원본: https://summer-afternoon.vlucendo.com/

import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import {
  loadBinGeometry,
  createSkin,
  createSkinAnimation,
  createInstancedMesh,
  createInstancedLOD,
  createVertexAnimation,
  createClosedCurve,
} from '@/lib/three/binLoader'
import {
  createSharedUniforms,
  createRampMaterial,
  createGrassMaterial,
  createTerrainMaterial,
  createSkyMaterial,
  createSeaMaterial,
  createBirdMaterial,
  loadKtx2Lut,
} from './rampShader'
import { createThirdPerson, type ThirdPerson } from './thirdPerson'
import { createSceneAudio, type SceneAudio } from './audio'
import MiniMap from '@/components/world/MiniMap'

/**
 * 월드 좌표가 지오메트리에 구워져 있는 정적 메시.
 * blockers1/2와 collider는 원본에서도 보이지 않는 충돌 볼륨이라 제외하고,
 * ufo는 원본이 코드로 날리는 오브젝트라 월드 좌표가 없어 제외한다.
 */
const STATIC_MESHES = [
  'house1', 'house2', 'house3',
  'warehouse1', 'warehouse2', 'warehouse3',
  'parasol', 'sign',
  'sandcastles1', 'sandcastles2',
]

/** LOD가 있는 인스턴스 소품 — 초목만 바람에 흔들린다 */
const LOD_PROPS = [
  { name: 'tree', lods: ['tree', 'tree-lod2', 'tree-lod3'], distances: [0, 60, 140], shake: true },
  { name: 'bush', lods: ['bush', 'bush-lod2', 'bush-lod3'], distances: [0, 40, 90], shake: true },
  { name: 'palmtree', lods: ['palmtree', 'palmtree-lod2'], distances: [0, 80], shake: true },
  { name: 'rock1', lods: ['rock1', 'rock1-lod2'], distances: [0, 80], shake: false },
  { name: 'rock2', lods: ['rock2', 'rock2-lod2'], distances: [0, 80], shake: false },
]

const rad = THREE.MathUtils.degToRad

/**
 * 스킨드 생물 — 메시 + 본 + 단일 애니메이션 클립.
 * 배치값은 원본 코드 그대로다(지오메트리에 구워져 있지 않다).
 */
const CREATURES = [
  {
    mesh: 'alien', bones: 'alien-bones', clip: 'alien-chill',
    position: [60.14, 0.1, 40.6] as const,
    rotation: [-1.5708, 1.5202, 1.5708] as const,
    scale: 1,
  },
  {
    mesh: 'cats', bones: 'cats-bones', clip: 'cats-anim',
    position: [27.4644, 3.18224, -4.1086] as const,
    rotation: [0, rad(-106.078), 0] as const,
    scale: 1,
  },
  {
    mesh: 'sloth', bones: 'sloth-bones', clip: 'sloth-anim',
    position: [-8.38, 1.47, 46.16] as const,
    rotation: [rad(-30.8), rad(-42.5), rad(-25.7)] as const,
    scale: 0.8,
  },
]

/** ufo도 코드로 배치된다 */
const UFO_POSITION = [-56.9402, 2.6553, 22.7015] as const
/** UFO에 이만큼 다가가면 secret 모달이 뜬다 */
const SECRET_RANGE = 10
/** 원본 secret 텍스트 */
const SECRET_TEXT =
  "It's a big metallic object. You want to believe it's some kind of vehicle."

/** 갈매기 마리 수 (원본과 동일) */
const BIRD_COUNT = 25

// 원본 color-square 버튼이 순환하는 옷 색. uSeed는 [0,1) 안에서 색상(hue)만
// 바꾼다(정수부는 피부색 행이라 고정). 첫 색은 원본 기본값 rgb(136,117,173).
const CHAR_HUES = [0.72, 0.02, 0.1, 0.55, 0.33, 0.87]
/** hsv(h, 0.4, 0.62) → CSS rgb — color-square 표시색을 셰이더 옷 색과 맞춘다 */
function hueToCss(h: number): string {
  const s = 0.4
  const v = 0.62
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const table = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ]
  const [r, g, b] = table[i % 6]
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

/** LOD 없이 인스턴스만 있는 소품 — 메시명과 인스턴스 파일명이 다를 수 있다 */
const FLAT_PROPS = [
  { mesh: 'lightpost', instances: 'lightposts-instances' },
  { mesh: 'machine', instances: 'machine-instances' },
]

function configure(
  texture: THREE.Texture,
  { srgb = false, repeat = false, nearest = false } = {},
): THREE.Texture {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }
  if (nearest) {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
  }
  return texture
}

const _birdPos = new THREE.Vector3()
const _birdNext = new THREE.Vector3()
const _birdMat = new THREE.Matrix4()
const _birdUp = new THREE.Vector3(0, 1, 0)

interface Birds {
  mesh: THREE.InstancedMesh
  curve: THREE.CatmullRomCurve3
  offsets: number[]
}

/** 갈매기를 곡선 위로 밀고 진행 방향을 바라보게 한다 */
function updateBirds(birds: Birds | null, time: number) {
  if (!birds) return
  const { mesh, curve, offsets } = birds
  for (let i = 0; i < offsets.length; i++) {
    const t = (offsets[i] + time * 0.012) % 1
    curve.getPointAt(t, _birdPos)
    curve.getPointAt((t + 0.002) % 1, _birdNext)
    _birdMat.lookAt(_birdPos, _birdNext, _birdUp)
    _birdMat.setPosition(_birdPos)
    mesh.setMatrixAt(i, _birdMat)
  }
  mesh.instanceMatrix.needsUpdate = true
}

export default function SummerAfternoonPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  // 'loading' → 에셋 로드 중, 'playing' → 자동 시작 후 조작 가능(원본과 동일)
  const [phase, setPhase] = useState<'loading' | 'playing'>('loading')
  // 인트로 소용돌이 리빌이 끝났는가 — 미니맵을 리빌 후에 노출한다
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [secret, setSecret] = useState(false)
  const [info, setInfo] = useState(false)
  // 발견한 비밀 수 — 원본처럼 버튼 아래 "n/5"로 표시한다
  const [secretsFound, setSecretsFound] = useState(0)
  // 캐릭터 옷 색(원본 color-square 버튼) — CSS 표시색
  const [charColor, setCharColor] = useState('rgb(136, 117, 173)')
  const audioRef = useRef<SceneAudio | null>(null)
  const mutedRef = useRef(false)
  // useEffect 안에서 만든 색 변경 함수를 React 버튼과 잇는 다리
  const cycleColorRef = useRef<() => void>(() => {})

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const shared = createSharedUniforms()

    const scene = new THREE.Scene()
    // 램프의 rampX는 이 방향광 하나로 결정된다. 방향은 원본 followCSMLight의
    // positionOffset = Spherical(100, 0.2π, -1.75π) → (41.6, 80.9, 41.6) 그대로다.
    // (기존 x가 -였어서 그림자·음영이 좌우로 뒤집혀 있었다.)
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(41.6, 80.9, 41.6)
    sun.castShadow = true
    // 월드 전체(240m)를 한 장으로 덮으면 텍셀이 6cm를 넘어 빨래·전선 같은
    // 얇은 물체의 그림자가 뭉개진다. 원본은 CSM으로 근거리를 따로 그리는데,
    // 여기서는 그림자 카메라를 캐릭터와 함께 옮겨 같은 효과를 낸다(±42m,
    // 4096 → 텍셀 2.05cm). 프레임을 조일수록 근거리 그림자 형태가 또렷해진다.
    const SHADOW_HALF = 42
    const SHADOW_MAP = 4096
    // 그림자 프레임을 이 간격(≈2.4cm)으로 스냅하면 이동 중 그림자 가장자리가
    // 텍셀 아래로 미끄러지며 떨리는(크롤링) 현상이 사라진다
    const SHADOW_TEXEL = (SHADOW_HALF * 2) / SHADOW_MAP
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP)
    sun.shadow.camera.left = -SHADOW_HALF
    sun.shadow.camera.right = SHADOW_HALF
    sun.shadow.camera.top = SHADOW_HALF
    sun.shadow.camera.bottom = -SHADOW_HALF
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 300
    // normalBias는 텍셀(2.05cm)보다 작게 둬야 얇은 물체(전선·팔다리)의 그림자
    // 형태가 깎이지 않는다. 아크네는 bias로 잡는다.
    sun.shadow.normalBias = 0.015
    sun.shadow.bias = -0.00025
    scene.add(sun)
    scene.add(sun.target)
    const sunOffset = sun.position.clone()
    // 원본과 동일한 반구광(하늘색#33434f / 지면색#737575, 0.7) — 흰 앰비언트보다
    // 그림자 안쪽에 살짝 차가운 톤이 들어가 원본의 음영 연출과 맞는다.
    scene.add(new THREE.HemisphereLight('#33434f', '#737575', 0.7))

    // 원본 baseCamera와 동일한 화각(fov 45). 50이면 화각이 넓어 캐릭터가 작아지고
    // 거리감이 과장된다.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // 원본의 컬러 그레이딩 LUT를 적용하고, 마지막에 인트로 리빌 셰이더 패스를 얹는다
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const lutPass = new LUTPass({ intensity: 1 })
    composer.addPass(lutPass)
    composer.addPass(new OutputPass())

    // 인트로 리빌 — 원본 introShader를 그대로 옮긴 풀스크린 패스.
    // #FFFDF8 커버를 소용돌이(tIntro) 마스크로 중앙부터 벗겨내며(scaleUV로 확대),
    // uTransition(0→1)에 따라 씬을 드러낸다.
    // 스월 텍스처 — 로드 전에는 1x1 검정 플레이스홀더(=완전 커버)로 두어 "no image
    // data" 경고 없이 시작하고, 로드되면 교체한다.
    const introTex: THREE.Texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    introTex.needsUpdate = true
    const introPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tIntro: { value: introTex },
        uInitialColor: { value: new THREE.Color('#FFFDF8') },
        uTransition: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tIntro;
        uniform vec3 uInitialColor;
        uniform float uTransition;
        uniform vec2 uResolution;
        varying vec2 vUv;
        vec2 scaleUV(vec2 uv, float s) { return (uv - 0.5) / s + 0.5; }
        void main() {
          vec3 color = texture2D(tDiffuse, vUv).rgb;
          vec2 uvIntro = vUv - 0.5;
          uvIntro *= uResolution / max(uResolution.x, uResolution.y);
          uvIntro += 0.5;
          uvIntro = scaleUV(uvIntro, 1.0 + uTransition);
          float m = 0.001;
          float p = mix(-m, 1.0, uTransition);
          float t = 1.0 - texture2D(tIntro, uvIntro).r;
          float f = smoothstep(p + m, p, t);
          gl_FragColor = vec4(mix(uInitialColor, color, f), 1.0);
        }
      `,
    })
    composer.addPass(introPass)
    new THREE.TextureLoader().load('/ref-assets/images/transition-intro.jpg', (tex) => {
      tex.colorSpace = THREE.NoColorSpace
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      introPass.uniforms.tIntro.value = tex
    })
    // 인트로 진행 — setPhase('playing') 시점부터 4초 선형(원본 duration:4, ease:none)
    let introStartTime = -1
    let introDone = false

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      // updateStyle=true(기본): 캔버스 CSS 크기를 뷰포트(w×h)에 맞춘다. false로 두면
      // HiDPI에서 캔버스가 버퍼 크기(w*dpr)만큼 커져 뷰포트를 넘치고, 씬이 우측으로
      // 밀리며 마우스 고정 앵커도 어긋난다(이동이 대각선으로 휨).
      renderer.setSize(w, h)
      composer.setSize(w, h)
      introPass.uniforms.uResolution.value.set(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let destroyed = false
    let raf = 0
    let sky: THREE.Mesh | null = null
    const mixers: THREE.AnimationMixer[] = []
    let birds: Birds | null = null
    let controller: ThirdPerson | null = null
    let kidActions: Record<'idle' | 'run' | 'air', THREE.AnimationAction> | null = null
    let kidPose: 'idle' | 'run' | 'air' = 'idle'
    let kidMesh: THREE.SkinnedMesh | null = null
    let ufo: THREE.Mesh | null = null
    const ufoBase = new THREE.Vector3(UFO_POSITION[0], UFO_POSITION[1], UFO_POSITION[2])
    let nearUfo = false
    let cleanupAudioGesture = () => {}
    const materials: THREE.Material[] = []

    const loader = new THREE.TextureLoader().setPath('/ref-assets/images/')
    // grass-patches와 skyflow만 basis 압축이라 트랜스코더가 필요하다
    const ktx2 = new KTX2Loader()
      .setTranscoderPath('/ref-assets/libs/basis/')
      .detectSupport(renderer)

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

      // 램프는 룩업 테이블이라 행 사이가 섞이면 안 됨
      configure(rampTex, { srgb: true, nearest: true })
      configure(noisesTex, { repeat: true })
      configure(detailsTex, { repeat: true })
      configure(skyTex, { srgb: true, repeat: true })
      configure(cloudsTex, { repeat: true })
      shared.tCloudsTop.value = cloudsTex

      // 압축 텍스처는 실패해도 씬 전체가 죽지 않게 개별로 처리한다
      const [patchesTex, flowTex, seaNormalTex] = await Promise.all([
        ktx2.loadAsync('/ref-assets/images/grass-patches-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/skyflow-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/sea1-normal-highq.ktx2').catch(() => null),
      ])
      if (destroyed) return
      if (flowTex) configure(flowTex, { repeat: true })
      if (seaNormalTex) configure(seaNormalTex, { repeat: true })

      const rampMaterial = createRampMaterial(rampTex, shared)
      const shakeMaterial = createRampMaterial(rampTex, shared, { shake: true })
      const wiresMaterial = createRampMaterial(rampTex, shared, { lightwires: true })
      const characterMaterial = createRampMaterial(rampTex, shared, {
        isCharacter: true,
        seed: CHAR_HUES[0],
      })
      const terrainMaterial = createTerrainMaterial(
        { ramp: rampTex, road: roadTex, masks: masksTex, noises: noisesTex, details: detailsTex },
        shared,
      )
      const skyMaterial = createSkyMaterial(skyTex, flowTex, shared)
      materials.push(rampMaterial, shakeMaterial, wiresMaterial, characterMaterial, terrainMaterial, skyMaterial)

      lutPass.lut = await loadKtx2Lut('/ref-assets/images/lut.CUBE_1.LUT.ktx2')
      if (destroyed) return

      const counts = { static: 0, instanced: 0, patches: 0, grass: 0, creatures: 0 }

      // 지형
      const terrainGeo = await loadBinGeometry('terrain')
      if (destroyed) return
      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMaterial)
      terrainMesh.name = 'terrain'
      terrainMesh.receiveShadow = true
      scene.add(terrainMesh)

      // 바다 — 해수면(y≈-0.8)에 큰 평면을 깔면 지형이 그 위로 솟아 실제
      // 바다 영역에서만 드러난다. 잔물결·반짝임은 sea1-normal로 만든다.
      const seaMaterial = createSeaMaterial(seaNormalTex, sunOffset, shared)
      materials.push(seaMaterial)
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), seaMaterial)
      sea.rotation.x = -Math.PI / 2
      sea.position.y = -0.8
      sea.name = 'sea'
      sea.renderOrder = -900
      scene.add(sea)

      // 하늘 — 카메라를 따라다니고 항상 가장 먼저 그린다
      const skyGeo = await loadBinGeometry('skydome')
      if (destroyed) return
      sky = new THREE.Mesh(skyGeo, skyMaterial)
      sky.name = 'sky'
      sky.scale.setScalar(2)
      sky.renderOrder = -1000
      sky.frustumCulled = false
      scene.add(sky)

      // 정적 메시
      for (const name of STATIC_MESHES) {
        const geo = await loadBinGeometry(name)
        if (destroyed) return
        const mesh = new THREE.Mesh(geo, rampMaterial)
        mesh.name = name
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)
        counts.static++
      }

      // 전선 — 전용 흔들림 셰이더
      const wiresGeo = await loadBinGeometry('lightposts-wires')
      if (destroyed) return
      const wires = new THREE.Mesh(wiresGeo, wiresMaterial)
      wires.name = 'lightposts-wires'
      // 전선도 그림자를 드리운다. 텍셀보다 가는 선이라 그대로 켜면 떨리므로,
      // 그림자 프레임 텍셀 스냅(아래 loop) + PCFSoft로 가장자리를 부드럽게 눌러
      // 지면에 가늘고 흐린 선 그림자가 도로를 가로지르게 한다.
      wires.castShadow = true
      scene.add(wires)
      counts.static++

      // ufo — 월드 좌표가 구워져 있지 않아 원본 코드값으로 배치한다.
      // 고정이 아니라 코드로 위아래로 떠다닌다(원본과 동일).
      const ufoGeo = await loadBinGeometry('ufo')
      if (destroyed) return
      ufo = new THREE.Mesh(ufoGeo, rampMaterial)
      ufo.name = 'ufo'
      ufo.position.copy(ufoBase)
      ufo.castShadow = true
      ufo.receiveShadow = true
      scene.add(ufo)
      counts.static++

      // LOD 인스턴스 소품
      for (const prop of LOD_PROPS) {
        const [instances, ...geoms] = await Promise.all([
          loadBinGeometry(`${prop.name}-instances`),
          ...prop.lods.map((n) => loadBinGeometry(n)),
        ])
        if (destroyed) return
        const group = createInstancedLOD(
          geoms.map((geometry, i) => ({ geometry, distance: prop.distances[i] })),
          instances,
          prop.shake ? shakeMaterial : rampMaterial,
        )
        group.name = prop.name
        group.traverse((o) => {
          o.castShadow = true
          o.receiveShadow = true
        })
        scene.add(group)
        counts.instanced += instances.attributes.position.count
        counts.patches += group.children.length
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
        counts.instanced += instances.attributes.position.count
      }

      // 잔디 — 인스턴스마다 random 속성이 필요해서 지오메트리를 복제해 붙인다
      // (loadBinGeometry 캐시가 소유한 원본을 오염시키면 안 됨)
      if (patchesTex) {
        const [grassGeo, grassInstances] = await Promise.all([
          loadBinGeometry('grass'),
          loadBinGeometry('grass-instances'),
        ])
        if (destroyed) return
        const grassMaterial = createGrassMaterial(rampTex, patchesTex, shared)
        materials.push(grassMaterial)
        const grass = createInstancedMesh(grassGeo.clone(), grassInstances, grassMaterial)
        const random = grassInstances.attributes.random
        grass.geometry.setAttribute(
          'random',
          new THREE.InstancedBufferAttribute(random.array as Float32Array, random.itemSize, false, 1),
        )
        grass.name = 'grass'
        grass.receiveShadow = true
        // 인스턴스가 월드 전체(±85m)에 흩뿌려져 있는데 지오메트리 바운딩 스피어는
        // 원점의 잔디 한 장(반경 0.4)뿐이라, 카메라가 원점을 프러스텀에 넣지 못하면
        // 잔디 전체가 컬링돼 사라진다. 인스턴스 기준 바운딩 스피어를 다시 계산해
        // 올바르게 컬링되도록 한다.
        grass.computeBoundingSphere()
        scene.add(grass)
        counts.grass = grassInstances.attributes.position.count
      }

      // 캐릭터 — 게임용 마커 링 없이 메시만
      const [kidGeo, kidBones, kidIdle, kidRun, kidAir] = await Promise.all([
        loadBinGeometry('kid'),
        loadBinGeometry('kid-bones'),
        loadBinGeometry('kid-idle'),
        loadBinGeometry('kid-run'),
        loadBinGeometry('kid-air'),
      ])
      if (destroyed) return
      const kid = createSkin(kidGeo, kidBones, characterMaterial)
      kidMesh = kid
      kid.name = 'kid'
      kid.castShadow = true
      kid.receiveShadow = true
      kid.frustumCulled = false
      scene.add(kid)
      const kidMixer = new THREE.AnimationMixer(kid)
      const idle = kidMixer.clipAction(createSkinAnimation('idle', kidIdle))
      const run = kidMixer.clipAction(createSkinAnimation('run', kidRun))
      const air = kidMixer.clipAction(createSkinAnimation('air', kidAir))
      idle.play()
      kidActions = { idle, run, air }
      mixers.push(kidMixer)

      // 생물 3종 — 캐릭터 분기가 아니라 일반 팔레트를 쓴다(원본과 동일)
      for (const c of CREATURES) {
        const [mesh, bones, clip] = await Promise.all([
          loadBinGeometry(c.mesh),
          loadBinGeometry(c.bones),
          loadBinGeometry(c.clip),
        ])
        if (destroyed) return
        const skin = createSkin(mesh, bones, rampMaterial)
        skin.name = c.mesh
        skin.position.set(c.position[0], c.position[1], c.position[2])
        skin.rotation.set(c.rotation[0], c.rotation[1], c.rotation[2])
        skin.scale.setScalar(c.scale)
        skin.castShadow = true
        skin.receiveShadow = true
        skin.frustumCulled = false
        scene.add(skin)
        const m = new THREE.AnimationMixer(skin)
        m.clipAction(createSkinAnimation(c.mesh, clip)).play()
        mixers.push(m)
        counts.creatures++
      }

      // 갈매기 — 곡선을 따라 돌면서 날갯짓한다
      const [birdSource, curveGeo] = await Promise.all([
        loadBinGeometry('bird'),
        loadBinGeometry('birds-curve'),
      ])
      if (destroyed) return
      const anim = createVertexAnimation(birdSource)
      const birdMaterial = createBirdMaterial(anim.uniforms, shared)
      materials.push(birdMaterial)
      const birdMesh = new THREE.InstancedMesh(anim.geometry, birdMaterial, BIRD_COUNT)
      const birdRand = new Float32Array(BIRD_COUNT * 4)
      const offsets: number[] = []
      for (let i = 0; i < BIRD_COUNT; i++) {
        for (let k = 0; k < 4; k++) birdRand[i * 4 + k] = Math.random()
        offsets.push(Math.random())
      }
      birdMesh.geometry.setAttribute('rand', new THREE.InstancedBufferAttribute(birdRand, 4, false, 1))
      birdMesh.name = 'birds'
      birdMesh.frustumCulled = false
      scene.add(birdMesh)
      birds = { mesh: birdMesh, curve: createClosedCurve(curveGeo), offsets }

      // 원본과 같은 지상 3인칭 시점 — 하늘 돔이 단위 반구라 카메라가 지면
      // 가까이 있어야 하늘이 화면을 덮는다
      kidGeo.computeBoundingBox()
      const kidBox = kidGeo.boundingBox!
      // 원본 오프닝과 동일 — initialPosition [12.2, 2.25, -58]. 도로 위에서 +Z를
      // 바라보며 시작한다(카메라는 뒤쪽 -Z). y는 컨트롤러가 첫 업데이트에서
      // 지면에 스냅하므로 발 높이만 넣는다.
      const feet = new THREE.Vector3(12.2, kidBox.min.y, -58)
      kid.rotation.y = 0
      shared.charPos.value.copy(feet)

      // 충돌 판정용 메시 — 씬에 넣지 않고 레이캐스트 대상으로만 쓴다
      const colliderGeo = await loadBinGeometry('collider')
      if (destroyed) return
      const collider = new THREE.Mesh(colliderGeo)
      controller = createThirdPerson({
        camera,
        character: kid,
        collider,
        domElement: renderer.domElement,
        start: feet.clone(),
      })

      // 카메라를 캐릭터 뒤에 미리 세워 인트로 리빌이 캐릭터를 화면 중앙에 잡게 한다
      controller.update(0)

      // 색상 버튼(원본 color-square) — uSeed의 소수부만 바꿔 옷 색을 순환한다
      let colorIndex = 0
      cycleColorRef.current = () => {
        colorIndex = (colorIndex + 1) % CHAR_HUES.length
        const hue = CHAR_HUES[colorIndex]
        const shader = characterMaterial.userData.shader as
          | { uniforms: { uSeed: { value: number } } }
          | undefined
        if (shader) shader.uniforms.uSeed.value = hue
        setCharColor(hueToCss(hue))
      }

      // 브라우저 자동재생 정책상 오디오는 첫 사용자 제스처 이후에만 만들 수 있다.
      // 원본처럼 시작 버튼 없이 자동 진입하고, 첫 입력 때 오디오를 켠다.
      const startAudioOnce = () => {
        window.removeEventListener('pointerdown', startAudioOnce)
        window.removeEventListener('keydown', startAudioOnce)
        createSceneAudio(camera, scene)
          .then((a) => {
            audioRef.current = a
            a.setMuted(mutedRef.current)
          })
          .catch(() => {})
      }
      window.addEventListener('pointerdown', startAudioOnce)
      window.addEventListener('keydown', startAudioOnce)
      cleanupAudioGesture = () => {
        window.removeEventListener('pointerdown', startAudioOnce)
        window.removeEventListener('keydown', startAudioOnce)
      }

      introStartTime = performance.now()
      controller?.startIntro()
      setPhase('playing')
    })().catch((err) => setError(String(err)))

    const start = performance.now()
    let last = start
    const loop = (now: number) => {
      // dt는 0.1s로 클램프한다 — 로딩 히칭·탭 비활성으로 프레임 간격이 크게
      // 벌어져도 물리/카메라가 한 프레임에 튀지 않게 한다.
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      shared.time.value = (now - start) / 1000
      controller?.update(dt)
      if (controller && kidActions) {
        const pose = controller.airborne ? 'air' : controller.moving ? 'run' : 'idle'
        if (pose !== kidPose) {
          const next = kidActions[pose]
          const prev = kidActions[kidPose]
          kidPose = pose
          next.enabled = true
          next.setEffectiveTimeScale(1)
          next.setEffectiveWeight(1)
          next.time = 0
          next.play()
          prev.crossFadeTo(next, 0.15, true)
        }
      }
      if (controller && kidMesh) {
        shared.charPos.value.copy(kidMesh.position)
        shared.charSpeed.value = controller.speed
        // 그림자 절두체가 캐릭터를 따라다녀야 근처가 선명하다. 단, 프레임을
        // 텍셀 단위로 스냅해 이동 중 그림자가 떨리지 않게 한다.
        const sx = Math.round(kidMesh.position.x / SHADOW_TEXEL) * SHADOW_TEXEL
        const sz = Math.round(kidMesh.position.z / SHADOW_TEXEL) * SHADOW_TEXEL
        sun.target.position.set(sx, kidMesh.position.y, sz)
        sun.position.set(sx + sunOffset.x, kidMesh.position.y + sunOffset.y, sz + sunOffset.z)
        sun.target.updateMatrixWorld()
        // 발소리 — 지면 위에서 이동 중일 때만
        audioRef.current?.footsteps(controller.moving && !controller.airborne)
      }
      // UFO — 원본처럼 코드로 위아래로 떠다니고 천천히 돈다
      if (ufo) {
        const t = shared.time.value
        ufo.position.set(ufoBase.x, ufoBase.y + Math.sin(t * 0.6) * 0.4, ufoBase.z)
        ufo.rotation.y = t * 0.3
        // 캐릭터가 가까이 오면 secret 모달을 띄운다(가까워지는 순간 한 번)
        if (kidMesh) {
          const close = ufo.position.distanceTo(kidMesh.position) < SECRET_RANGE
          if (close !== nearUfo) {
            nearUfo = close
            if (close) {
              setSecret(true)
              setSecretsFound(1)
            }
          }
        }
      }
      for (const m of mixers) m.update(dt)
      updateBirds(birds, shared.time.value)
      sky?.position.copy(camera.position)
      scene.traverse((o) => {
        if ((o as THREE.LOD).isLOD) (o as THREE.LOD).update(camera)
      })
      // 인트로 리빌 진행(4초 선형). 끝나면 미니맵을 노출한다.
      if (introStartTime >= 0 && !introDone) {
        const tr = Math.min(1, (now - introStartTime) / 4000)
        introPass.uniforms.uTransition.value = tr
        if (tr >= 1) {
          introDone = true
          setRevealed(true)
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
      cleanupAudioGesture()
      controller?.dispose()
      audioRef.current?.dispose()
      audioRef.current = null
      for (const m of mixers) m.stopAllAction()
      materials.forEach((m) => m.dispose())
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

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#FFFDF8] select-none">
      <style>{`
        @font-face {
          font-family: 'Stylish';
          src: url('/ref-assets/fonts/Stylish-Regular.woff2') format('woff2');
          font-display: swap;
        }
        /* 원본 로더 스피너 — SVG 원 + dash/rotate 애니메이션 (2.5s) */
        @keyframes sa-rotator { 0% { transform: rotate(0deg); } 100% { transform: rotate(270deg); } }
        @keyframes sa-dash {
          0% { stroke-dashoffset: 187; }
          50% { stroke-dashoffset: 46.75; transform: rotate(135deg); }
          100% { stroke-dashoffset: 187; transform: rotate(450deg); }
        }
        .sa-spinner { width: 54px; height: 54px; }
        .sa-spinner svg { display: block; width: 100%; height: 100%; animation: sa-rotator 2.5s linear infinite; }
        .sa-spinner .path { stroke: #BDBCB8; stroke-dasharray: 187; stroke-dashoffset: 0; transform-origin: center; animation: sa-dash 2.5s ease-in-out infinite; }
      `}</style>
      <div ref={mountRef} className="w-full h-full touch-none" />

      {/* 화면 5시 나침반형 GIS 미니맵 — 인트로 소용돌이 리빌이 끝난 뒤 노출 */}
      {revealed && <MiniMap />}

      {/* 로딩 화면 — 원본과 동일: 타이틀 + SVG 스피너 (버튼 없음, 자동 진입) */}
      {phase === 'loading' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: '#FFFDF8' }}
        >
          <h1
            className="text-center"
            style={{
              fontFamily: 'Stylish, sans-serif',
              fontWeight: 'normal',
              fontSize: 50,
              lineHeight: '0.8em',
              color: '#BDBCB8',
              margin: '0 0 20px 0',
            }}
          >
            Summer
            <br />
            Afternoon
          </h1>
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

      {/* 우상단 버튼 — 원본과 동일: 사운드 / 옷 색 / 정보.
          버튼은 32px 정사각형을 10° 기울이고, 아이콘은 절대배치 후 역회전한다. */}
      {phase === 'playing' && (
        <nav className="absolute right-6 top-6 flex flex-col items-end gap-3">
          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              setMuted((m) => !m)
            }}
          >
            {/* 소리 상태를 아이콘 형태로 명확히 구분한다: 켜짐=파동, 음소거=X */}
            {muted ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ position: 'absolute', top: 4, left: 4, transform: 'rotate(-10deg)' }}
              >
                <path d="M4 9H7L11 6V18L7 15H4Z" fill="#716C66" />
                <path
                  d="M14.5 9.5L19.5 14.5M19.5 9.5L14.5 14.5"
                  stroke="#716C66"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                style={{ position: 'absolute', top: 4, left: 4, transform: 'rotate(-10deg)' }}
              >
                <path d="M4 9H7L11 6V18L7 15H4Z" fill="#716C66" />
                <path d="M14 9.5A4 4 0 0 1 14 14.5" stroke="#716C66" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M16.5 7A7.5 7.5 0 0 1 16.5 17" stroke="#716C66" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </ToolButton>

          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              cycleColorRef.current()
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 18,
                height: 18,
                borderRadius: 2,
                transform: 'translate(-50%, -50%) rotate(-16deg)',
                backgroundColor: charColor,
              }}
            />
          </ToolButton>

          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              setInfo((v) => !v)
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 4 17"
              fill="none"
              style={{ position: 'absolute', top: 6, left: 5, transform: 'rotate(-10deg)' }}
            >
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

          {/* 비밀 카운터 — 원본 .cnt 스타일(버튼 바로 아래, 크림색+하드 그림자) */}
          <div
            className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-center"
            style={{
              fontFamily: 'Stylish, sans-serif',
              fontWeight: 400,
              color: '#f9efdc',
              textShadow: '2px 2px 0 #716C66',
              fontSize: 27,
              letterSpacing: '-0.05em',
              lineHeight: '1em',
              marginTop: 10,
            }}
          >
            {secretsFound}/5
          </div>
        </nav>
      )}

      {/* 정보 팝오버 — 조작법(정보 버튼을 눌러야 뜬다) */}
      {info && phase === 'playing' && (
        <div className="absolute right-5 top-[140px] w-60 rounded-md bg-[#f9efdc] p-4 text-sm leading-6 text-[#6f6a5c] shadow-[2px_2px_0_0_#716c66]">
          <p className="mb-1 font-semibold" style={{ fontFamily: 'Stylish, sans-serif' }}>
            조작법
          </p>
          <p>이동: WASD / 방향키 / 왼쪽 클릭(커서 방향)</p>
          <p>점프: 스페이스 / 오른쪽 클릭</p>
        </div>
      )}

      {/* secret 모달 — UFO 근접 이벤트 */}
      {secret && phase === 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-6">
          <div className="max-w-sm rounded-md bg-[#f9efdc] p-6 text-center text-[#6f6a5c] shadow-[2px_2px_0_0_#716c66]">
            <p className="text-lg leading-relaxed" style={{ fontFamily: 'Stylish, sans-serif' }}>
              {SECRET_TEXT}
            </p>
            <button
              onClick={() => {
                audioRef.current?.click()
                setSecret(false)
              }}
              className="mt-6 rounded-md bg-[#f9efdc] px-6 py-1.5 text-sm tracking-widest shadow-[2px_2px_0_0_#716c66] transition-transform active:translate-x-[1px] active:translate-y-[1px]"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 원본 우상단 버튼 — 32×32 크림 사각형을 10° 기울이고(하드 그림자), 아이콘은
 * 안에서 절대배치·역회전한다. 원본 .button.svelte 스타일 그대로.
 */
function ToolButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="relative block transition-transform active:translate-x-[1px] active:translate-y-[1px]"
      style={{
        width: 32,
        height: 32,
        borderRadius: 5,
        backgroundColor: '#f9efdc',
        boxShadow: '2px 2px 0 0 #716c66',
        transform: 'rotate(10deg)',
      }}
    >
      {children}
    </button>
  )
}


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
  const revealRef = useRef<HTMLCanvasElement>(null)
  // 'loading' → 에셋 로드 중, 'playing' → 자동 시작 후 조작 가능(원본과 동일)
  const [phase, setPhase] = useState<'loading' | 'playing'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [secret, setSecret] = useState(false)
  const [info, setInfo] = useState(false)
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
    // 램프의 rampX는 이 방향광 하나로 결정된다
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(-60, 80, 40)
    sun.castShadow = true
    // 월드 전체(240m)를 한 장으로 덮으면 텍셀이 6cm를 넘어 빨래·전선 같은
    // 얇은 물체의 그림자가 뭉개진다. 원본은 CSM으로 근거리를 따로 그리는데,
    // 여기서는 그림자 카메라를 캐릭터와 함께 옮겨 같은 효과를 낸다(±50m,
    // 4096 → 텍셀 2.4cm). 그만큼 normalBias도 확 낮출 수 있다.
    const SHADOW_HALF = 50
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
    sun.shadow.normalBias = 0.03
    sun.shadow.bias = -0.0002
    scene.add(sun)
    scene.add(sun.target)
    const sunOffset = sun.position.clone()
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // 원본의 컬러 그레이딩 LUT를 마지막에 적용한다
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const lutPass = new LUTPass({ intensity: 1 })
    composer.addPass(lutPass)
    composer.addPass(new OutputPass())

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
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
      // 얇은 전선의 그림자는 텍셀보다 가늘어 떨리기만 하므로 캐스팅하지 않는다
      wires.castShadow = false
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
      const feet = new THREE.Vector3(
        (kidBox.min.x + kidBox.max.x) / 2,
        kidBox.min.y,
        (kidBox.min.z + kidBox.max.z) / 2,
      )
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

      setPhase('playing')
    })().catch((err) => setError(String(err)))

    const start = performance.now()
    let last = start
    const loop = (now: number) => {
      const dt = (now - last) / 1000
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
            if (close) setSecret(true)
          }
        }
      }
      for (const m of mixers) m.update(dt)
      updateBirds(birds, shared.time.value)
      sky?.position.copy(camera.position)
      scene.traverse((o) => {
        if ((o as THREE.LOD).isLOD) (o as THREE.LOD).update(camera)
      })
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

  // 로드가 끝나 자동 진입하면 소용돌이 리빌을 재생한다(원본과 동일)
  useEffect(() => {
    if (phase === 'playing') playReveal(revealRef.current)
  }, [phase])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f7f4ea] select-none">
      <style>{`
        @font-face {
          font-family: 'Stylish';
          src: url('/ref-assets/fonts/Stylish-Regular.woff2') format('woff2');
          font-display: swap;
        }
      `}</style>
      <div ref={mountRef} className="w-full h-full touch-none" />

      {/* 인트로 리빌 — 자동 시작 시 소용돌이 마스크로 씬을 드러낸다 */}
      <canvas
        ref={revealRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ display: 'none' }}
      />

      {/* 로딩 화면 — 원본과 동일: 타이틀 + 스피너 (버튼 없음, 자동 진입) */}
      {phase === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f7f4ea] text-[#8a8577]">
          <h1
            className="text-4xl sm:text-5xl tracking-wide text-center leading-tight"
            style={{ fontFamily: 'Stylish, Georgia, serif' }}
          >
            Summer
            <br />
            Afternoon
          </h1>
          {error ? (
            <p className="mt-6 text-sm text-red-500/80">로드 실패: {error}</p>
          ) : (
            <div className="mt-8 h-8 w-8 animate-spin rounded-full border-2 border-[#c9c4b4] border-t-transparent" />
          )}
        </div>
      )}

      {/* 우상단 버튼 — 원본과 동일: 사운드 / 옷 색 / 정보 */}
      {phase === 'playing' && (
        <div className="absolute right-5 top-5 flex flex-col gap-[7px]">
          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              setMuted((m) => !m)
            }}
          >
            <svg
              width="17"
              height="13"
              viewBox="0 0 17 13"
              fill="none"
              style={{ opacity: muted ? 0.3 : 1 }}
            >
              <path
                d="M10.1891 0.227726L6.12965 3.33204H4.16819C3.65646 3.33204 3.23005 3.74143 3.23005 4.27018V8.65375C3.23005 8.81868 3.27258 8.97476 3.34792 9.11054L0.815582 10.9067C0.36511 11.2262 0.25895 11.8504 0.578469 12.3009C0.897988 12.7514 1.52219 12.8576 1.97266 12.538L6.12627 9.59189H6.1468L6.17341 9.61233L11.929 5.52989V5.47601L15.623 2.85588C16.0735 2.53637 16.1796 1.91216 15.8601 1.46169C15.5406 1.01122 14.9164 0.905058 14.4659 1.22458L11.929 3.02399V1.08062C11.9119 0.176617 10.8886 -0.318087 10.1892 0.227787L10.1891 0.227726ZM11.929 7.98191L7.83329 10.887L10.1892 12.6962C10.8886 13.2421 11.929 12.7304 11.929 11.8434V7.98191Z"
                fill="#716C66"
              />
            </svg>
          </ToolButton>

          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              cycleColorRef.current()
            }}
          >
            <div style={{ width: 20, height: 20, borderRadius: 3, backgroundColor: charColor }} />
          </ToolButton>

          <ToolButton
            onClick={() => {
              audioRef.current?.click()
              setInfo((v) => !v)
            }}
          >
            <svg width="4" height="17" viewBox="0 0 4 17" fill="none">
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
        </div>
      )}

      {/* 정보 팝오버 — 조작법(정보 버튼을 눌러야 뜬다) */}
      {info && phase === 'playing' && (
        <div className="absolute right-5 top-[140px] w-60 rounded-md bg-[#f9efdc] p-4 text-sm leading-6 text-[#6f6a5c] shadow-[2px_2px_0_0_#716c66]">
          <p className="mb-1 font-semibold" style={{ fontFamily: 'Stylish, Georgia, serif' }}>
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
            <p className="text-lg leading-relaxed" style={{ fontFamily: 'Stylish, Georgia, serif' }}>
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

/** 원본 우상단 버튼 스타일(크림 배경 + 하드 그림자)을 그대로 쓴 버튼 */
function ToolButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center bg-[#f9efdc] transition-transform active:translate-x-[1px] active:translate-y-[1px]"
      style={{ borderRadius: 5, boxShadow: '2px 2px 0 0 #716c66' }}
    >
      {children}
    </button>
  )
}

/**
 * 원본 transition-intro(소용돌이 그라디언트)를 밝은 곳부터 드러나는 임계값
 * 마스크로 써서 씬을 화면 중앙에서부터 감싸며 공개한다. 작은 오프스크린
 * 버퍼에서 픽셀 임계 처리를 하고 전체 화면으로 늘려 그린다.
 */
function playReveal(canvas: HTMLCanvasElement | null) {
  if (!canvas) return
  const N = 256
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.src = '/ref-assets/images/transition-intro.jpg'
  img.onload = () => {
    ctx.drawImage(img, 0, 0, N, N)
    const src = ctx.getImageData(0, 0, N, N).data
    const out = ctx.createImageData(N, N)
    // 크림색(#f7f4ea) 오버레이 — 리빌될수록 알파가 0으로 빠진다
    const [cr, cg, cb] = [247, 244, 234]
    const duration = 1700
    const startT = performance.now()

    const step = (now: number) => {
      const r = Math.min(1, (now - startT) / duration)
      // ease-in-out
      const eased = r < 0.5 ? 2 * r * r : 1 - Math.pow(-2 * r + 2, 2) / 2
      const threshold = 1 - eased // 1 → 0
      const edge = 0.12
      for (let i = 0; i < N * N; i++) {
        const lum = src[i * 4] / 255 // 그레이스케일이라 R로 충분
        // lum이 threshold보다 밝으면 공개(알파 0), 어두우면 크림 유지
        let a = (threshold - lum) / edge + 0.5
        a = a < 0 ? 0 : a > 1 ? 1 : a
        out.data[i * 4] = cr
        out.data[i * 4 + 1] = cg
        out.data[i * 4 + 2] = cb
        out.data[i * 4 + 3] = Math.round(a * 255)
      }
      ctx.putImageData(out, 0, 0)
      if (r < 1) requestAnimationFrame(step)
      else canvas.style.display = 'none'
    }
    requestAnimationFrame(step)
  }
}

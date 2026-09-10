'use client'

// 원본(Summer Afternoon) 룩 재현 — 아트 디렉션을 눈으로 확정하기 위한
// 독립 씬. Mapbox와 무관하고 게임 로직도 없다.
// 원본: https://summer-afternoon.vlucendo.com/

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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
  createBirdMaterial,
  loadKtx2Lut,
} from './rampShader'

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

/** 갈매기 마리 수 (원본과 동일) */
const BIRD_COUNT = 25

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
  const [status, setStatus] = useState('로딩 중…')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const shared = createSharedUniforms()

    const scene = new THREE.Scene()
    // 램프의 rampX는 이 방향광 하나로 결정된다
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(-60, 80, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    sun.shadow.camera.left = -120
    sun.shadow.camera.right = 120
    sun.shadow.camera.top = 120
    sun.shadow.camera.bottom = -120
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 400
    // depth bias보다 normalBias가 경사면에서 안정적이다
    sun.shadow.normalBias = 0.18
    scene.add(sun)
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

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
      const [patchesTex, flowTex] = await Promise.all([
        ktx2.loadAsync('/ref-assets/images/grass-patches-highq.ktx2').catch(() => null),
        ktx2.loadAsync('/ref-assets/images/skyflow-highq.ktx2').catch(() => null),
      ])
      if (destroyed) return
      if (flowTex) configure(flowTex, { repeat: true })

      const rampMaterial = createRampMaterial(rampTex, shared)
      const shakeMaterial = createRampMaterial(rampTex, shared, { shake: true })
      const wiresMaterial = createRampMaterial(rampTex, shared, { lightwires: true })
      const characterMaterial = createRampMaterial(rampTex, shared, { isCharacter: true })
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
      wires.castShadow = true
      scene.add(wires)
      counts.static++

      // ufo — 월드 좌표가 구워져 있지 않아 원본 코드값으로 배치한다
      const ufoGeo = await loadBinGeometry('ufo')
      if (destroyed) return
      const ufo = new THREE.Mesh(ufoGeo, rampMaterial)
      ufo.name = 'ufo'
      ufo.position.set(UFO_POSITION[0], UFO_POSITION[1], UFO_POSITION[2])
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
      const [kidGeo, kidBones, kidIdle] = await Promise.all([
        loadBinGeometry('kid'),
        loadBinGeometry('kid-bones'),
        loadBinGeometry('kid-idle'),
      ])
      if (destroyed) return
      const kid = createSkin(kidGeo, kidBones, characterMaterial)
      kid.name = 'kid'
      kid.castShadow = true
      kid.frustumCulled = false
      scene.add(kid)
      const kidMixer = new THREE.AnimationMixer(kid)
      kidMixer.clipAction(createSkinAnimation('idle', kidIdle)).play()
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
      controls.target.set(feet.x, feet.y + 1.0, feet.z)
      camera.position.set(feet.x, feet.y + 2.2, feet.z + 6)
      camera.updateProjectionMatrix()
      controls.update()

      terrainGeo.computeBoundingBox()
      const size = terrainGeo.boundingBox!.getSize(new THREE.Vector3())

      setStatus(
        [
          `지형 ${size.x.toFixed(0)}×${size.z.toFixed(0)}m`,
          `정적 ${counts.static} · 인스턴스 ${counts.instanced} · LOD 패치 ${counts.patches}`,
          `잔디 ${counts.grass}${patchesTex ? '' : ' (텍스처 없음)'}` +
            ` · 생물 ${counts.creatures} · 갈매기 ${BIRD_COUNT}`,
        ].join('\n'),
      )
    })().catch((err) => setStatus(`로드 실패: ${String(err)}`))

    const start = performance.now()
    let last = start
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      shared.time.value = (now - start) / 1000
      for (const m of mixers) m.update(dt)
      updateBirds(birds, shared.time.value)
      controls.update()
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
      controls.dispose()
      for (const m of mixers) m.stopAllAction()
      materials.forEach((m) => m.dispose())
      ktx2.dispose()
      composer.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative w-screen h-screen bg-[#9fd4ef]">
      <div ref={mountRef} className="w-full h-full" />
      <pre className="absolute top-4 left-4 rounded-lg bg-black/60 px-3 py-2 text-xs leading-5 text-white">
        {status}
      </pre>
    </div>
  )
}

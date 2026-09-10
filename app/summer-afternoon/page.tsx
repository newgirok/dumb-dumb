'use client'

// 원본(Summer Afternoon) 룩 재현 — 아트 디렉션을 눈으로 확정하기 위한
// 독립 씬. Mapbox와 무관하고 게임 로직도 없다.
// 원본: https://summer-afternoon.vlucendo.com/

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  loadBinGeometry,
  createSkin,
  createSkinAnimation,
  createInstancedMesh,
  createInstancedLOD,
} from '@/lib/three/binLoader'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import {
  createRampMaterial,
  createTerrainMaterial,
  createSkyMaterial,
  loadKtx2Lut,
} from './rampShader'

/**
 * 월드 좌표가 지오메트리에 구워져 있는 정적 메시.
 * blockers1/2와 collider는 원본에서도 보이지 않는 충돌 볼륨이라 제외한다.
 */
const STATIC_MESHES = [
  'house1', 'house2', 'house3',
  'warehouse1', 'warehouse2', 'warehouse3',
  'lightposts-wires', 'parasol', 'sign',
  'sandcastles1', 'sandcastles2',
  // ufo는 월드 좌표가 구워져 있지 않고 원본이 코드로 날리는 오브젝트라 제외
]

/** LOD가 있는 인스턴스 소품 */
const LOD_PROPS = [
  { name: 'tree', lods: ['tree', 'tree-lod2', 'tree-lod3'], distances: [0, 60, 140] },
  { name: 'bush', lods: ['bush', 'bush-lod2', 'bush-lod3'], distances: [0, 40, 90] },
  { name: 'palmtree', lods: ['palmtree', 'palmtree-lod2'], distances: [0, 80] },
  { name: 'rock1', lods: ['rock1', 'rock1-lod2'], distances: [0, 80] },
  { name: 'rock2', lods: ['rock2', 'rock2-lod2'], distances: [0, 80] },
]

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

export default function SummerAfternoonPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('로딩 중…')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    // 원본의 태양 방향 — 램프의 rampX가 이 방향광 하나로 결정된다
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(-60, 80, 40)
    sun.castShadow = true
    // 월드가 약 200×200m — 정사영 그림자 카메라로 전체를 덮는다
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -120
    sun.shadow.camera.right = 120
    sun.shadow.camera.top = 120
    sun.shadow.camera.bottom = -120
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 400
    // 240m를 2048로 덮으니 텍셀이 약 12cm — 그만큼 표면을 따라 밀어내야
    // 자기 그림자 얼룩(acne)이 사라진다. depth bias보다 normalBias가
    // 경사면에서 훨씬 안정적이다
    sun.shadow.normalBias = 0.35
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
    let mixer: THREE.AnimationMixer | null = null
    const materials: THREE.Material[] = []

    const loader = new THREE.TextureLoader().setPath('/ref-assets/images/')

    ;(async () => {
      const [rampTex, roadTex, masksTex, noisesTex, detailsTex, skyTex] = await Promise.all([
        loader.loadAsync('ramps.png'),
        loader.loadAsync('terrain-road-highq.png'),
        loader.loadAsync('masks.png'),
        loader.loadAsync('terrain-noises-highq.png'),
        loader.loadAsync('terrain-details-highq.png'),
        loader.loadAsync('sky-srgb-highq.png'),
      ])
      if (destroyed) return

      // 램프는 룩업 테이블이라 행 사이가 섞이면 안 됨
      configure(rampTex, { srgb: true, nearest: true })
      configure(noisesTex, { repeat: true })
      configure(detailsTex, { repeat: true })
      configure(skyTex, { srgb: true, repeat: true })

      const rampMaterial = createRampMaterial(rampTex)
      const characterMaterial = createRampMaterial(rampTex, { isCharacter: true })
      const terrainMaterial = createTerrainMaterial({
        ramp: rampTex,
        road: roadTex,
        masks: masksTex,
        noises: noisesTex,
        details: detailsTex,
      })
      const skyMaterial = createSkyMaterial(skyTex)
      lutPass.lut = await loadKtx2Lut('/ref-assets/images/lut.CUBE_1.LUT.ktx2')
      if (destroyed) return
      materials.push(rampMaterial, characterMaterial, terrainMaterial, skyMaterial)

      const counts = { static: 0, instanced: 0, patches: 0 }

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
          rampMaterial,
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
      mixer = new THREE.AnimationMixer(kid)
      mixer.clipAction(createSkinAnimation('idle', kidIdle)).play()

      // 원본과 같은 지상 3인칭 시점 — 하늘 돔이 단위 반구라 카메라가 지면
      // 가까이 있어야 하늘이 화면을 덮는다
      kidGeo.computeBoundingBox()
      const kidBox = kidGeo.boundingBox!
      const feet = new THREE.Vector3(
        (kidBox.min.x + kidBox.max.x) / 2,
        kidBox.min.y,
        (kidBox.min.z + kidBox.max.z) / 2,
      )
      controls.target.set(feet.x, feet.y + 1.0, feet.z)
      camera.position.set(feet.x, feet.y + 2.2, feet.z + 6)
      camera.updateProjectionMatrix()
      controls.update()

      terrainGeo.computeBoundingBox()
      const size = terrainGeo.boundingBox!.getSize(new THREE.Vector3())

      setStatus(
        [
          `지형 ${size.x.toFixed(0)}×${size.z.toFixed(0)}m`,
          `정적 메시 ${counts.static} · 인스턴스 ${counts.instanced} · LOD 패치 ${counts.patches}`,
        ].join('\n'),
      )
    })().catch((err) => setStatus(`로드 실패: ${String(err)}`))

    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      mixer?.update(dt)
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
      mixer?.stopAllAction()
      materials.forEach((m) => m.dispose())
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

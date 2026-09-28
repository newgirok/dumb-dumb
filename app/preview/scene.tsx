'use client'

// 에셋 미리보기(/preview) — 지도와 무관하게 ref-assets 캐릭터/소품 에셋만 띄워 확인하는 개발용
// 페이지. 자체 제작 에셋으로 교체할 때 규격(크기·본·애니메이션·인스턴스)을
// 눈으로 대조하는 용도로도 쓴다.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadBinGeometry, createInstancedLOD } from '@/lib/three/binLoader'
import { loadCharacter, type Character } from '@/lib/three/character'
import { framingFor } from '@/app/village/thirdPerson'
import Loader from '@/components/transition/Loader'

// 원본 셰이더의 팔레트 규약 — ramps.png는 100행짜리 팔레트고,
// colorInfo.r이 행 번호, x축은 음영 정도다.
//   getRamp(i) = 1 - i/100 + 0.005 ;  color = texture(tRamp, vec2(shade, getRamp(colorInfo.r)))
// 커스텀 셰이더 없이 쓰려고 고정 음영값에서 팔레트 색을 정점 색으로 구워
// 넣고, 실제 음영은 three의 표준 라이팅에 맡긴다.
const RAMP_ROWS = 100
const RAMP_SHADE = 0.7

function readRampPalette(image: HTMLImageElement): (index: number) => [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, image.width, image.height)

  return (index: number) => {
    const v = 1 - index / RAMP_ROWS + 0.5 / RAMP_ROWS
    // three 기본 flipY=true 기준 v=1이 이미지 상단 → 캔버스 y=0
    const px = Math.round(RAMP_SHADE * (image.width - 1))
    const py = Math.round((1 - v) * (image.height - 1))
    const o = (py * image.width + px) * 4
    return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255]
  }
}

/** colorInfo.r(팔레트 행)을 정점 색으로 변환 */
function bakeRampColors(
  geometry: THREE.BufferGeometry,
  palette: (index: number) => [number, number, number],
): THREE.BufferGeometry {
  const colorInfo = geometry.attributes.colorInfo
  if (!colorInfo) return geometry

  const count = colorInfo.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const [r, g, b] = palette(Math.round(colorInfo.array[i * colorInfo.itemSize]))
    colors.set([r, g, b], i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const PROPS = [
  { name: 'tree', lods: ['tree', 'tree-lod2', 'tree-lod3'], distances: [0, 60, 140] },
  { name: 'rock1', lods: ['rock1', 'rock1-lod2'], distances: [0, 80] },
  { name: 'bush', lods: ['bush', 'bush-lod2', 'bush-lod3'], distances: [0, 40, 90] },
]

export default function PreviewScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const charRef = useRef<Character | null>(null)
  const [moving, setMoving] = useState(true)
  const [status, setStatus] = useState('')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  // LOD가 실제로 전환되는지 눈이 아니라 숫자로 확인하려고 노출
  const [stats, setStats] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1b1f27)
    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(40, 80, 30)
    scene.add(sun)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
    camera.position.set(30, 22, 40)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2, 0)
    controls.enableDamping = true

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      if (!w || !h) return
      renderer.setSize(w, h, false)
      // 세로로 긴 화면에서는 씬들과 같은 기준으로 화각을 넓힌다
      camera.fov = framingFor(w / h).fov
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let destroyed = false
    const disposables: THREE.Material[] = []

    ;(async () => {
      const rampImage = await new THREE.ImageLoader().loadAsync('/ref-assets/images/ramps.png')
      const palette = readRampPalette(rampImage)

      const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })
      disposables.push(propMaterial)

      const lines: string[] = []

      for (const prop of PROPS) {
        const [instances, ...geoms] = await Promise.all([
          loadBinGeometry(`${prop.name}-instances`),
          ...prop.lods.map((n) => loadBinGeometry(n)),
        ])
        if (destroyed) return
        const levels = geoms.map((geometry, i) => ({
          geometry: bakeRampColors(geometry, palette),
          distance: prop.distances[i],
        }))
        const group = createInstancedLOD(levels, instances, propMaterial)
        scene.add(group)
        lines.push(
          `${prop.name}: ${instances.attributes.position.count} instances · ` +
            `${group.children.length} patches · ${prop.lods.length} LOD`,
        )
      }

      const char = await loadCharacter(0x4f8ef7)
      if (destroyed) {
        char.dispose()
        return
      }
      char.setMoving(true)
      scene.add(char.group)
      charRef.current = char
      lines.unshift('kid: 22 bones · 24fps')
      setStatus(lines.join('\n'))
      setPhase('ready')
    })().catch((err) => {
      console.error(err)
      setPhase('error')
    })

    let raf = 0
    let last = performance.now()
    let lastStats = 0
    const loop = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      charRef.current?.update(dt)
      controls.update()
      // LOD는 카메라 거리로 레벨을 고르므로 매 프레임 갱신이 필요
      scene.traverse((o) => {
        if ((o as THREE.LOD).isLOD) (o as THREE.LOD).update(camera)
      })
      renderer.render(scene, camera)

      if (now - lastStats > 500) {
        lastStats = now
        const { triangles, calls } = renderer.info.render
        const dist = camera.position.length()
        const levels: number[] = []
        scene.traverse((o) => {
          const lod = o as THREE.LOD
          if (lod.isLOD) {
            const i = lod.getCurrentLevel()
            levels[i] = (levels[i] ?? 0) + 1
          }
        })
        setStats(
          `카메라 ${dist.toFixed(0)}m · ${calls} draw calls · ` +
            `${(triangles / 1000).toFixed(1)}k tris · ` +
            `LOD ${levels.map((n, i) => `L${i + 1}:${n ?? 0}`).join(' ')}`,
        )
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      charRef.current?.dispose()
      charRef.current = null
      disposables.forEach((m) => m.dispose())
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    // 화면 크기가 바뀌어도 뷰포트를 꽉 채운다(100vw·100vh는 스크롤바·휴대폰 주소창까지 넣어 넘친다)
    <div className="fixed inset-0 overflow-hidden bg-[#1b1f27]">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 flex max-w-[calc(100%-2rem)] items-start gap-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-white">
        <pre className="min-w-0 overflow-x-auto whitespace-pre-wrap leading-5 [overflow-wrap:anywhere]">{[status, stats].filter(Boolean).join('\n')}</pre>
        <button
          type="button"
          className="shrink-0 rounded bg-white/15 px-2 py-1 hover:bg-white/25"
          onClick={() => {
            const next = !moving
            setMoving(next)
            charRef.current?.setMoving(next)
          }}
        >
          {moving ? 'run → idle' : 'idle → run'}
        </button>
      </div>
      {/* 에셋을 다 받을 때까지 로더 — 페이지 이동 로더와 같은 안내라 그대로 이어진다 */}
      {phase === 'loading' && <Loader message="에셋을 불러오고 있어요. 잠시만 기다려 주세요." />}
      {phase === 'error' && (
        <Loader spinning={false} message="에셋을 불러오지 못했어요" hint="잠시 후 새로고침해 주세요">
          <button
            type="button"
            className="rounded-full bg-[#f9efdc] px-5 py-2 text-[#716c66] shadow-[2px_2px_0_0_#716c66]"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </Loader>
      )}
    </div>
  )
}

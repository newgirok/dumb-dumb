import * as THREE from 'three'

/**
 * 원본 PlayerControls UI — 터치 조작 때만 보이는 화면 원 두 개.
 * - 이동 원: 손가락을 댄 자리에 나타나 안쪽 손잡이가 드래그 방향으로 밀린다
 *   (circles.png: rg = 바깥 원 밝기·알파, ba = 안쪽 손잡이 밝기·알파).
 * - 점프 원: 두 번째 손가락으로 탭한 자리에서 0.5초간 퍼지며 사라진다.
 * 씬 안의 화면 공간 메시라 원본처럼 LUT를 거쳐 그려진다.
 */

/** 원본 크기 — 해상도 높이 기준 640·400 (해상도 = 렌더 버퍼 픽셀) */
const MOVE_SIZE = 640
const JUMP_SIZE = 400
/** 점프 원 애니메이션 길이(원본 0.5s power2.out) */
const JUMP_DURATION = 0.5

const RESOLUTION_VERTEX = (size: number) => /* glsl */ `
  uniform vec2 resolution;
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.x /= resolution.x / resolution.y;
    pos /= resolution.y / (${size.toFixed(1)} * uScale);
    gl_Position = modelMatrix * vec4(pos, 1.0);
  }
`

export interface TouchState {
  /** 첫 손가락이 닿아 있는가 */
  active: boolean
  /** 첫 손가락이 처음 닿은 화면 위치(NDC) */
  start: THREE.Vector2
  /** 드래그 입력(원본 touchDelta — x: +왼쪽, y: +위, 길이 ≤ 1) */
  delta: THREE.Vector2
}

export interface TouchCircles {
  group: THREE.Group
  /** ratio = dt×60 */
  update(ratio: number, state: TouchState): void
  /** 두 번째 손가락 탭 — 그 자리(NDC)에서 점프 원을 퍼뜨린다 */
  jump(ndc: THREE.Vector2): void
  setResolution(width: number, height: number): void
  dispose(): void
}

export function createTouchCircles(circlesTexture: THREE.Texture): TouchCircles {
  const plane = new THREE.PlaneGeometry(1, 1)
  const resolution = { value: new THREE.Vector2(1, 1) }

  const moveMaterial = new THREE.ShaderMaterial({
    uniforms: {
      resolution,
      tCircles: { value: circlesTexture },
      uInnerPos: { value: new THREE.Vector2() },
      uScale: { value: 1 },
      uAlpha: { value: 1 },
    },
    vertexShader: RESOLUTION_VERTEX(MOVE_SIZE),
    fragmentShader: /* glsl */ `
      uniform sampler2D tCircles;
      uniform vec2 uInnerPos;
      uniform float uAlpha;
      varying vec2 vUv;
      vec3 blendScreen(vec3 base, vec3 blend) { return 1.0 - ((1.0 - base) * (1.0 - blend)); }
      void main() {
        vec2 bg = texture2D(tCircles, vUv).rg;
        vec4 color = vec4(vec3(bg.x), bg.y);
        vec2 inner = texture2D(tCircles, vUv + uInnerPos).ba;
        color.rgb = blendScreen(color.rgb, vec3(inner.x));
        color.a = max(color.a, inner.y);
        gl_FragColor = color;
        gl_FragColor.a *= uAlpha;
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })

  const jumpMaterial = new THREE.ShaderMaterial({
    uniforms: { resolution, uScale: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: RESOLUTION_VERTEX(JUMP_SIZE),
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5);
        float margin = fwidth(vUv.x);
        float d = smoothstep(0.4 + margin, 0.4, dist);
        gl_FragColor = vec4(vec3(1.0), 0.15 * d * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })

  const make = (material: THREE.ShaderMaterial, name: string) => {
    const mesh = new THREE.Mesh(plane, material)
    mesh.name = name
    mesh.frustumCulled = false
    mesh.renderOrder = 99999
    mesh.visible = false
    return mesh
  }
  const moveCircle = make(moveMaterial, 'Move Circle')
  const jumpCircle = make(jumpMaterial, 'Jump Circle')
  const group = new THREE.Group()
  group.name = 'PlayerControls UI'
  group.add(moveCircle, jumpCircle)

  let touchActive = 0
  const touchPosition = new THREE.Vector2()
  let jumpStart = -1

  return {
    group,
    update(ratio, state) {
      // 원본: touchActive는 프레임당 0.25, 손잡이 위치는 0.2 비율로 따라간다
      touchActive += ((state.active ? 1 : 0) - touchActive) * (1 - Math.pow(0.75, ratio))
      if (touchActive < 0.001) touchActive = 0
      else if (touchActive > 0.999) touchActive = 1
      touchPosition.lerp(state.delta, 1 - Math.pow(0.8, ratio))
      if (state.active) moveCircle.position.set(state.start.x, state.start.y, 0)
      moveCircle.visible = touchActive !== 0
      moveMaterial.uniforms.uInnerPos.value.set(touchPosition.x * 0.35, -touchPosition.y * 0.35)
      moveMaterial.uniforms.uScale.value = 0.75 + 0.25 * touchActive
      // power3.out
      moveMaterial.uniforms.uAlpha.value = 1 - Math.pow(1 - touchActive, 4)

      if (jumpStart >= 0) {
        const t = (performance.now() - jumpStart) / 1000 / JUMP_DURATION
        // 1 → 0 (power2.out)
        const value = t >= 1 ? 0 : 1 - (1 - Math.pow(1 - t, 3))
        jumpCircle.visible = value > 0
        jumpMaterial.uniforms.uScale.value = 1 - value
        jumpMaterial.uniforms.uAlpha.value = 1 - Math.pow(1 - value, 4)
        if (value <= 0) jumpStart = -1
      }
    },
    jump(ndc) {
      jumpCircle.position.set(ndc.x, ndc.y, 0)
      jumpStart = performance.now()
    },
    setResolution(width, height) {
      resolution.value.set(width, height)
    },
    dispose() {
      plane.dispose()
      moveMaterial.dispose()
      jumpMaterial.dispose()
    },
  }
}

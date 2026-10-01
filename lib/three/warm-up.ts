import * as THREE from 'three'

/**
 * 로더 뒤 GPU 예열 — 씬을 보여 주기 전에 셰이더 컴파일과 텍스처 업로드를 잘게 나눠 끝낸다.
 *
 * 크롬(윈도우)은 화면 합성과 WebGL 명령을 같은 GPU 스레드에서 처리해, 셰이더 컴파일·큰 업로드가
 * 한꺼번에 몰리면 그동안 합성 스레드의 CSS 스피너도 멈춘다. 그래서 첫 렌더에 맡기지 않고
 * 병렬 컴파일(KHR_parallel_shader_compile)로 물체마다 미리 컴파일하며 새 프로그램마다 한 프레임
 * 쉬고, 텍스처는 하나 올릴 때마다 GPU가 끝낼 때까지 기다려 화면이 그려질 틈을 준다.
 */

/** 한 프레임 쉰다 — 숨긴 탭은 requestAnimationFrame이 멈추므로 100ms 뒤에는 그냥 넘어간다 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100)
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * GPU가 지금까지 받은 명령을 다 처리할 때까지(WebGL2 펜스) 프레임마다 확인하며 기다린다. 큰 업로드·그리기는
 * 메인 스레드에서 금방 돌아와도 GPU에서는 더 오래 걸려, 다음 일을 바로 넘기면 GPU에 일이 밀려 화면 합성이
 * 끼어들 틈이 없어진다. 펜스를 못 쓰거나 60프레임이 지나면 그냥 넘어간다
 */
export async function settle(renderer: THREE.WebGLRenderer): Promise<void> {
  const gl = renderer.getContext() as WebGL2RenderingContext
  const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null
  gl.flush()
  try {
    for (let i = 0; i < 60; i++) {
      await nextFrame()
      if (!sync || gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED) return
    }
  } finally {
    if (sync) gl.deleteSync(sync)
  }
}

type Drawable = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite

const isDrawable = (o: THREE.Object3D): o is Drawable =>
  (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite

/**
 * 씬의 모든 재질(숨긴 LOD 단계 포함)을 물체마다 컴파일한다. 새 셰이더 프로그램이 생길 때마다 한 프레임 쉰다.
 * 이미 만든 프로그램을 다시 쓰는 물체는 쉬지 않고 넘어간다. cancelled가 true가 되면 멈춘다.
 *
 * 셰이더는 그리는 곳(화면 또는 렌더 타깃)에 따라 출력 색 공간이 달라 다른 프로그램이 된다 —
 * target에는 실제로 그릴 타깃을 넘긴다(컴포저로 그리면 컴포저 버퍼, 화면이면 null)
 */
export async function compileGradually(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget | null,
  cancelled: () => boolean,
): Promise<void> {
  const objects: Drawable[] = []
  scene.traverse((o) => {
    if (isDrawable(o)) objects.push(o)
  })
  await compileEach(renderer, objects, camera, scene, target, cancelled)
}

/**
 * 화면 전체 후처리 패스처럼 씬에 없는 재질을, 그 재질이 그릴 타깃(화면이면 null)과 같은 조건으로 미리 컴파일한다
 */
export async function compileMaterialsGradually(
  renderer: THREE.WebGLRenderer,
  materials: THREE.Material[],
  target: THREE.WebGLRenderTarget | null,
  cancelled: () => boolean,
): Promise<void> {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera()
  const geometry = new THREE.PlaneGeometry(2, 2)
  const meshes = materials.map((material) => new THREE.Mesh(geometry, material))
  try {
    await compileEach(renderer, meshes, camera, scene, target, cancelled)
  } finally {
    geometry.dispose()
  }
}

async function compileEach(
  renderer: THREE.WebGLRenderer,
  objects: Drawable[],
  camera: THREE.Camera,
  scene: THREE.Scene,
  target: THREE.WebGLRenderTarget | null,
  cancelled: () => boolean,
) {
  const previous = renderer.getRenderTarget()
  try {
    for (const object of objects) {
      if (cancelled()) return
      const before = renderer.info.programs?.length ?? 0
      renderer.setRenderTarget(target)
      await renderer.compileAsync(object, camera, scene)
      if ((renderer.info.programs?.length ?? 0) !== before) await nextFrame()
    }
  } finally {
    renderer.setRenderTarget(previous)
  }
}

/**
 * 씬의 모든 물체를 한 번씩 그린다(숨긴 LOD 단계, 멀리 있어 숨긴 묶음, 평소 숨겨 둔 물체까지).
 * 지오메트리·인스턴스 버퍼 업로드와 그리기 상태(VAO)·드라이버의 첫 그리기 준비를 로더 뒤에서 끝낸다. 그려 보지
 * 않은 물체는 처음 화면에 들 때(걸어가다 멀리 있던 잔디 묶음이 보일 때 등) 이 일을 몰고 온다.
 *
 * like와 같은 형식의 작은 타깃에, 동적 그림자까지 함께 그린다(같은 형식이어야 같은 셰이더 프로그램을 쓴다).
 * 물체를 batch개씩 묶어 그리고 묶음마다 GPU가 끝낼 때까지 쉰다. 빛은 건드리지 않는다(빛 수가 바뀌면 다른
 * 프로그램이 된다). 끝나면 보이기·컬링·LOD 상태를 되돌린다
 */
export async function drawAllGradually(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  like: THREE.WebGLRenderTarget,
  cancelled: () => boolean,
  batch = 24,
): Promise<void> {
  const objects: Drawable[] = []
  const lods: THREE.LOD[] = []
  scene.traverse((o) => {
    if (isDrawable(o)) objects.push(o)
    if ((o as THREE.LOD).isLOD) lods.push(o as THREE.LOD)
  })
  // 그릴 물체의 조상(묶음·LOD 노드)은 모두 보이게 둔다 — 조상이 숨으면 three는 그 아래를 건너뛴다.
  // 조상이 그릴 물체이면 그 묶음을 그릴 때만 함께 보이게 한다
  const ancestors = new Set<THREE.Object3D>()
  const drawableAncestors = new Map<Drawable, Drawable[]>()
  for (const object of objects) {
    const list: Drawable[] = []
    for (let p = object.parent; p && p !== scene; p = p.parent) {
      if (isDrawable(p)) list.push(p)
      else ancestors.add(p)
    }
    drawableAncestors.set(object, list)
  }
  const visible = new Map<THREE.Object3D, boolean>()
  for (const o of [...objects, ...ancestors]) visible.set(o, o.visible)
  const culled = objects.map((o) => o.frustumCulled)
  const lodAuto = lods.map((lod) => lod.autoUpdate)
  const target = like.clone()
  target.setSize(16, 16)
  const previous = renderer.getRenderTarget()
  try {
    for (const lod of lods) lod.autoUpdate = false
    for (const o of ancestors) o.visible = true
    for (const o of objects) {
      o.visible = false
      o.frustumCulled = false
    }
    for (let i = 0; i < objects.length && !cancelled(); i += batch) {
      const shown = new Set<Drawable>()
      for (const o of objects.slice(i, i + batch)) {
        shown.add(o)
        for (const p of drawableAncestors.get(o)!) shown.add(p)
      }
      for (const o of shown) o.visible = true
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(previous)
      for (const o of shown) o.visible = false
      await settle(renderer)
    }
  } finally {
    renderer.setRenderTarget(previous)
    for (const [o, v] of visible) o.visible = v
    objects.forEach((o, i) => (o.frustumCulled = culled[i]))
    lods.forEach((lod, i) => (lod.autoUpdate = lodAuto[i]))
    target.dispose()
  }
}

/** 재질·유니폼이 쓰는 텍스처를 모은다(셰이더를 고쳐 끼운 재질은 userData.shader의 유니폼까지) */
function collectTextures(material: THREE.Material, into: Set<THREE.Texture>) {
  const add = (value: unknown) => {
    if (value && (value as THREE.Texture).isTexture) into.add(value as THREE.Texture)
  }
  const fromUniforms = (uniforms: Record<string, THREE.IUniform> | undefined) => {
    if (!uniforms) return
    for (const uniform of Object.values(uniforms)) {
      if (Array.isArray(uniform.value)) uniform.value.forEach(add)
      else add(uniform.value)
    }
  }
  for (const value of Object.values(material)) add(value)
  fromUniforms((material as THREE.ShaderMaterial).uniforms)
  fromUniforms((material.userData.shader as { uniforms?: Record<string, THREE.IUniform> } | undefined)?.uniforms)
}

/**
 * 씬의 재질과 extra 재질(후처리 패스 등)이 쓰는 텍스처를 하나씩 GPU에 올리고, GPU가 올리기를 마칠 때까지 기다린 뒤 다음으로 간다.
 * 아직 이미지가 오지 않은 텍스처는 three가 건너뛰고, 처음 그릴 때 올린다
 */
export async function uploadTexturesGradually(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  extra: THREE.Material[],
  cancelled: () => boolean,
): Promise<void> {
  const textures = new Set<THREE.Texture>()
  scene.traverse((o) => {
    if (!isDrawable(o)) return
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if (material) collectTextures(material, textures)
    }
  })
  for (const material of extra) collectTextures(material, textures)
  for (const texture of textures) {
    if (cancelled()) return
    // 렌더 타깃·프레임버퍼 텍스처는 그릴 때 이미 GPU에 있고, 이미지가 아직 없는 텍스처(version 0)는 올릴 게 없다
    if ((texture as THREE.FramebufferTexture).isFramebufferTexture || texture.isRenderTargetTexture) continue
    if (texture.version === 0) continue
    renderer.initTexture(texture)
    await settle(renderer)
  }
}

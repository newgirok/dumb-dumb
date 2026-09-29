import * as THREE from 'three'
import type { SharedUniforms } from '@/lib/three/ramp-shader'

/**
 * 원본 sea — 동쪽 바다(x 62~562)에만 500×500 평면을 깔고, 하늘만 비추는 평면
 * 반사(원본 reflector)를 프레넬로 섞는다. 해수면 전체가 ±0.4m로 천천히 오르내리고,
 * 사인 노이즈 세 겹이 동시에 켜지는 곳에 흰 거품 줄이 생긴다.
 * (원점 중심의 큰 평면을 깔면 내륙 지형이 해수면보다 낮은 곳에 바다가 비쳐 보인다.)
 */

const SEA_SIZE = 500
const SEA_POSITION = new THREE.Vector3(312, -0.815, 0)
/** 반사 텍스처 한 변과 거울 카메라 줌(원본 textureSize 256, mirrorCameraZoom 0.8) */
const REFLECTION_SIZE = 256
const MIRROR_ZOOM = 0.8
/** 반사에 그릴 오브젝트만 켜는 레이어(원본 cameraLayer 31) — 하늘만 올린다 */
export const REFLECTION_LAYER = 31

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  uniform float time;
  varying vec4 vCoord;
  varying vec3 vNormal;
  varying vec3 wPos;
  varying vec3 vPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vCoord = textureMatrix * vec4(position, 1.0);
    float up = (sin(time * 0.5 + 23.124) + sin(time * 0.15 + 3213.32)) * 0.2;
    vec3 pos = (modelMatrix * vec4(position, 1.0)).xyz + vec3(0.0, up, 0.0);
    wPos = pos;
    vec4 viewPos = viewMatrix * vec4(pos, 1.0);
    vPos = viewPos.xyz;
    gl_Position = projectionMatrix * viewPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tCloudsTop;
  uniform sampler2D tMap1;
  uniform vec3 uColor;
  uniform vec3 uColorFoam;
  uniform sampler2D tReflection;
  uniform vec2 uReflectionResolution;
  uniform float uNormalStr;
  uniform float time;
  varying vec4 vCoord;
  varying vec3 vNormal;
  varying vec3 wPos;
  varying vec3 vPos;
  varying vec2 vUv;

  float fit(float v, float a, float b, float c, float d) {
    return c + (clamp(v, min(a, b), max(a, b)) - a) * (d - c) / (b - a);
  }
  float blendScreen(float base, float blend) { return 1.0 - ((1.0 - base) * (1.0 - blend)); }
  vec3 blendScreen(vec3 base, vec3 blend) {
    return vec3(blendScreen(base.r, blend.r), blendScreen(base.g, blend.g), blendScreen(base.b, blend.b));
  }
  float fresnel(vec3 viewNormal, vec3 viewPos, float power) {
    vec3 normal = normalize(viewNormal);
    vec3 dir = normalize(-viewPos);
    return pow(1.0 - max(0.0, dot(dir, normal)), power);
  }
  vec3 perturbNormal(vec3 eye_pos, vec3 surf_norm, sampler2D tNormal, vec2 uv, float intensity, float faceDirection) {
    vec3 q0 = vec3(dFdx(eye_pos.x), dFdx(eye_pos.y), dFdx(eye_pos.z));
    vec3 q1 = vec3(dFdy(eye_pos.x), dFdy(eye_pos.y), dFdy(eye_pos.z));
    vec2 st0 = dFdx(uv.st);
    vec2 st1 = dFdy(uv.st);
    vec3 N = normalize(surf_norm);
    vec3 q1perp = cross(q1, N);
    vec3 q0perp = cross(N, q0);
    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;
    float det = max(dot(T, T), dot(B, B));
    float scale = (det == 0.0) ? 0.0 : faceDirection * inversesqrt(det) * intensity;
    vec3 mapN = texture2D(tNormal, uv).rgb * 2.0 - 1.0;
    return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
  }
  #define sinlayer(frX, frY, frZ) val += sin(dot(p, vec3(frX, frY, frZ)));
  float sinenoise1(vec3 p) {
    float val = 0.0;
    sinlayer(1.5, 3.4598, 1.234)
    sinlayer(3.12, -3.234, 4.221)
    sinlayer(0.355, 2.3, -1.375)
    sinlayer(-0.156, -3.34, -0.4566)
    sinlayer(-4.1235, -0.485, -1.45)
    sinlayer(2.54, -0.879, -2.123)
    return val / 6.0;
  }
  highp float rand(const in vec2 uv) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot(uv.xy, vec2(a, b)), sn = mod(dt, 3.141592653589793);
    return fract(sin(sn) * c);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec2 uv1 = vUv * vec2(2.0) + vec2(time * 0.001, time * 0.002);
    vec3 normal1 = perturbNormal(-vPos, normal, tMap1, uv1, 1.4, 1.0);
    vec2 uv2 = vUv * vec2(1.0) + vec2(time * 0.003 + 123.23, time * 0.001);
    vec3 normal2 = perturbNormal(-vPos, normal, tMap1, uv2, 0.8, 1.0);
    normal = min(normal1, normal2);

    // 반사 — 투영 좌표를 노멀로 살짝 흔든다
    vec3 coord = vCoord.xyz / vCoord.w;
    vec2 normalDistortion = coord.z * normal.xz * uNormalStr;
    vec2 uvRef = coord.xy - normalDistortion;
    vec4 ref = texture2D(tReflection, uvRef, log2(uReflectionResolution.x) * 0.0);
    // 원본은 fresnel(viewNormal, viewPos) 인자를 바꿔 넣어 부른다 — 그 결과가 원본 모습이다
    vec3 col = mix(uColor, blendScreen(ref.rgb, uColor), fresnel(vPos, normal, 2.0));

    float fooam = step(0.1, sinenoise1(wPos.xyz * vec3(1.2, 1.0, 0.2) + vec3(time * 0.6, 0.0, 0.0))) *
      step(0.1, sinenoise1(wPos.xyz * vec3(1.1, 0.0, 0.2) + vec3(time * 1.1, 0.0, 0.0))) *
      step(0.1, sinenoise1(wPos.xyz * vec3(1.1, 2.0, 0.05) + vec3(time * 1.05, 2.0, 0.0)));

    vec2 cloudsUV1 = (wPos.xz * 0.003 + 31.232) + vec2(time * 0.0139 + 13.243, time * 0.02789 - 23.3) * 0.25;
    vec2 cloudsUV2 = wPos.xz * 0.003 - 65.1345 + vec2(time * -0.0123 + 113.82, time * 0.01525 - 34.234) * 0.25;
    float cloud_dither = rand(gl_FragCoord.xy) * 0.002;
    float cloudsMult1 = texture2D(tCloudsTop, cloudsUV1 + cloud_dither).r;
    float cloudsMult2 = texture2D(tCloudsTop, cloudsUV2 + cloud_dither).r;
    float cloudsMult = smoothstep(0.2, 0.9, cloudsMult1 * cloudsMult2);

    col *= fit(cloudsMult, 0.0, 1.0, 0.9, 1.0);
    col = mix(col, uColorFoam * fit(cloudsMult, 0.0, 1.0, 0.7, 1.0), fooam);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function createSea({
  normalTexture,
  shared,
  sky,
}: {
  normalTexture: THREE.Texture | null
  shared: SharedUniforms
  /** 반사에 비출 하늘 돔 — 반사를 그리는 동안만 원점·거대 스케일로 옮긴다 */
  sky: THREE.Mesh
}): { mesh: THREE.Mesh; dispose(): void } {
  const target = new THREE.WebGLRenderTarget(REFLECTION_SIZE, REFLECTION_SIZE, {
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    colorSpace: THREE.SRGBColorSpace,
  })
  const textureMatrix = new THREE.Matrix4()
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tMap1: { value: normalTexture },
      uColor: { value: new THREE.Color('#5a7aa2') },
      uColorFoam: { value: new THREE.Color('#ffffff') },
      tCloudsTop: shared.tCloudsTop,
      tReflection: { value: target.texture },
      textureMatrix: { value: textureMatrix },
      uReflectionResolution: { value: new THREE.Vector2(REFLECTION_SIZE, REFLECTION_SIZE) },
      uNormalStr: { value: 0.2 },
      time: shared.time,
    },
    vertexShader,
    fragmentShader,
  })

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE), material)
  mesh.name = 'sea'
  mesh.position.copy(SEA_POSITION)
  mesh.rotation.x = -Math.PI * 0.5
  mesh.updateMatrixWorld(true)
  mesh.matrixAutoUpdate = false
  sky.layers.enable(REFLECTION_LAYER)

  // 원본 reflector — three Reflector와 같은 거울 카메라 + 비스듬한 근평면 클리핑
  const mirror = new THREE.PerspectiveCamera()
  const plane = new THREE.Plane()
  const normal = new THREE.Vector3()
  const seaPos = new THREE.Vector3()
  const camPos = new THREE.Vector3()
  const rotation = new THREE.Matrix4()
  const lookAt = new THREE.Vector3()
  const view = new THREE.Vector3()
  const target3 = new THREE.Vector3()
  const clipPlane = new THREE.Vector4()
  const q = new THREE.Vector4()
  const skyPosition = new THREE.Vector3()

  mesh.onBeforeRender = (renderer, scene, camera) => {
    seaPos.setFromMatrixPosition(mesh.matrixWorld)
    camPos.setFromMatrixPosition(camera.matrixWorld)
    rotation.extractRotation(mesh.matrixWorld)
    normal.set(0, 0, 1).applyMatrix4(rotation)
    view.subVectors(seaPos, camPos)
    if (view.dot(normal) > 0) return
    view.reflect(normal).negate().add(seaPos)

    rotation.extractRotation(camera.matrixWorld)
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(camPos)
    target3.subVectors(seaPos, lookAt).reflect(normal).negate().add(seaPos)

    mirror.copy(camera as THREE.PerspectiveCamera)
    mirror.position.copy(view)
    mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
    mirror.lookAt(target3)
    mirror.zoom *= MIRROR_ZOOM
    mirror.updateMatrixWorld()
    mirror.updateProjectionMatrix()
    mirror.layers.set(REFLECTION_LAYER)

    textureMatrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mirror.projectionMatrix)
      .multiply(mirror.matrixWorldInverse)
      .multiply(mesh.matrixWorld)

    plane.setFromNormalAndCoplanarPoint(normal, seaPos).applyMatrix4(mirror.matrixWorldInverse)
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const projection = mirror.projectionMatrix.elements
    q.x = (Math.sign(clipPlane.x) + projection[8]) / projection[0]
    q.y = (Math.sign(clipPlane.y) + projection[9]) / projection[5]
    q.z = -1
    q.w = (1 + projection[10]) / projection[14]
    clipPlane.multiplyScalar(2 / clipPlane.dot(q))
    projection[2] = clipPlane.x
    projection[6] = clipPlane.y
    projection[10] = clipPlane.z + 1
    projection[14] = clipPlane.w

    mesh.visible = false
    skyPosition.copy(sky.position)
    sky.position.setScalar(0)
    sky.scale.setScalar(1e5)
    sky.updateMatrixWorld()

    const current = renderer.getRenderTarget()
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(target)
    renderer.state.buffers.depth.setMask(true)
    if (renderer.autoClear === false) renderer.clear()
    renderer.render(scene, mirror)
    renderer.shadowMap.autoUpdate = shadowAutoUpdate
    renderer.setRenderTarget(current)

    const viewport = (camera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport
    if (viewport !== undefined) renderer.state.viewport(viewport)

    sky.position.copy(skyPosition)
    sky.scale.setScalar(2)
    sky.updateMatrixWorld()
    mesh.visible = true
  }

  return {
    mesh,
    dispose() {
      target.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}

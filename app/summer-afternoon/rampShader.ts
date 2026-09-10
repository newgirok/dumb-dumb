import * as THREE from 'three'

/**
 * 원본(Summer Afternoon) 셰이딩 이식.
 *
 * 원본은 three의 Phong을 패치해서 라이팅 결과를 램프 룩업으로 "대체"한다.
 *   rampX = fit(dot(normal, dirLight.direction), -1, 1, 0, 1) * shadow
 *   color = texture2D(tRamp, vec2(rampX, getRamp(colorInfo.r)))
 * ramps.png는 100행 팔레트이고 colorInfo.r이 행 번호, 가로축이 음영 단계다.
 *
 * 원본의 CSM(캐스케이드 섀도) 대신 three 표준 그림자맵을 쓰고, 나머지는
 * 그대로 옮겼다. MeshLambertMaterial에 onBeforeCompile로 주입해서
 * 인스턴싱·스키닝·그림자맵은 three가 처리하게 둔다.
 */

const HELPERS = /* glsl */ `
  float fit(float v, float a, float b, float c, float d) {
    return c + (clamp(v, min(a, b), max(a, b)) - a) * (d - c) / (b - a);
  }
  float getRamp(float index) {
    return 1.0 - index / 100.0 + 0.5 / 100.0;
  }
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  // 원본 안개 — 거리에 따라 채도를 낮추고 명도를 올린다
  void addFog(inout vec3 outcolor, float lenCam) {
    vec3 hsv = rgb2hsv(outcolor);
    float fogDist = fit(lenCam, 40.0, 300.0, 0.0, 1.0);
    hsv.z = mix(hsv.z, 0.6, fogDist);
    hsv.y = mix(hsv.y, 0.3, fogDist);
    outcolor = hsv2rgb(hsv);
  }
`

/**
 * 뷰공간 노멀과 첫 번째 방향광으로 램프 가로좌표를 구한다.
 * 원본은 rampX에 그림자 항을 곱한다 — 램프가 라이팅을 통째로 대체하므로
 * 그림자도 여기서 반영해야 화면에 나타난다.
 */
const RAMP_X = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
    float rampX = fit(dot(normalize(normal), directionalLights[0].direction), -1.0, 1.0, 0.0, 1.0);
  #else
    float rampX = 0.75;
  #endif
  rampX *= _shadow0;
`

/**
 * three r169에는 getShadowMask()가 없다. 원본이 한 것처럼
 * lights_fragment_begin 안의 그림자 계산식을 가로채 _shadow0으로 빼낸다.
 * 방향광이 하나라는 전제 — 램프도 directionalLights[0]만 쓴다.
 */
function captureShadowTerm(fragmentShader: string): string {
  // onBeforeCompile 시점의 소스에는 #include가 아직 전개돼 있지 않다.
  // 그래서 청크 원본을 직접 가져와 수술한 뒤 include 자리에 끼워 넣는다.
  // 전역 치환인 이유: 청크에 point/spot/directional 각각의 같은 구문이 있고,
  // 해당 광원이 없는 블록은 전처리에서 빠지므로 남는 건 실제 광원 것뿐이다.
  const patched = THREE.ShaderChunk.lights_fragment_begin.replace(
    /directLight\.color \*= ([\s\S]*?);/g,
    '_shadow0 = $1;\n directLight.color *= _shadow0;',
  )

  return fragmentShader.replace(
    '#include <lights_fragment_begin>',
    `float _shadow0 = 1.0;\n${patched}`,
  )
}

const WORLD_POS_VERTEX = /* glsl */ `
  vec4 _wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _wp = instanceMatrix * _wp;
  #endif
  vWorldPos = (modelMatrix * _wp).xyz;
`

/**
 * 캐릭터는 colorInfo.y로 분기가 갈린다 (원본 IS_CHARACTER 분기).
 *   y < 0.01  고정 파츠 → 일반 팔레트
 *   y < 1.01  피부      → 79행 + seed
 *   그 외     의상      → seed 기반 HSV
 * seed는 원본에서 인스턴스별 난수라 단일 캐릭터는 0이면 된다.
 */
const CHARACTER_BRANCH = /* glsl */ `
  vec3 rampColor;
  if (vColorInfo.y < 0.01) {
    rampColor = texture2D(tRamp, vec2(rampX, getRamp(vColorInfo.x))).rgb;
  } else if (vColorInfo.y < 1.01) {
    rampColor = texture2D(tRamp, vec2(rampX, getRamp(79.0 + clamp(floor(uSeed), 0.0, 3.0)))).rgb;
  } else {
    rampColor = hsv2rgb(vec3(fract(uSeed), 0.4, 0.2 + floor(rampX * 2.99) * 0.3));
  }
`

const GENERIC_BRANCH = /* glsl */ `
  vec3 rampColor = texture2D(tRamp, vec2(rampX, getRamp(vColorInfo.x))).rgb;
`

/** colorInfo(팔레트 행 번호)로 색을 정하는 소품·건물·캐릭터용 재질 */
export function createRampMaterial(
  ramp: THREE.Texture,
  { isCharacter = false, seed = 0 } = {},
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial()

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tRamp = { value: ramp }
    shader.uniforms.uSeed = { value: seed }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec2 colorInfo;
         varying vec2 vColorInfo;
         varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vColorInfo = colorInfo;
         ${WORLD_POS_VERTEX}`,
      )

    shader.fragmentShader = captureShadowTerm(shader.fragmentShader)
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRamp;
         uniform float uSeed;
         varying vec2 vColorInfo;
         varying vec3 vWorldPos;
         ${HELPERS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${RAMP_X}
         ${isCharacter ? CHARACTER_BRANCH : GENERIC_BRANCH}
         addFog(rampColor, length(vWorldPos - cameraPosition));
         gl_FragColor = vec4(rampColor, 1.0);`,
      )
  }

  // onBeforeCompile을 쓰는 재질은 캐시 키를 직접 구분해줘야 한다
  material.customProgramCacheKey = () => (isCharacter ? 'ramp-character' : 'ramp')
  return material
}

export interface TerrainTextures {
  ramp: THREE.Texture
  /** 도로 표시 (terrain-road-highq.png) */
  road: THREE.Texture
  /** r=도로 g=모래 b=흙길 a=다리 (masks.png) */
  masks: THREE.Texture
  noises: THREE.Texture
  details: THREE.Texture
}

/**
 * 지형 재질 — 마스크 텍스처로 잔디/흙길/도로/모래/다리를 나눠 칠한다.
 * 팔레트 행: 잔디 48·49, 흙길 50, 도로 52, 도로표시 63, 다리 54·55, 모래 56·57
 */
export function createTerrainMaterial(tex: TerrainTextures): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map: tex.road })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tRamp = { value: tex.ramp }
    shader.uniforms.tMasks = { value: tex.masks }
    shader.uniforms.tTerrNoises = { value: tex.noises }
    shader.uniforms.tTerrDetails = { value: tex.details }
    shader.uniforms.grassColor1 = { value: new THREE.Color('#558f6e') }
    shader.uniforms.grassColor2 = { value: new THREE.Color('#9bc2a4') }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n varying vec3 vWorldPos;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n ${WORLD_POS_VERTEX}`,
      )

    shader.fragmentShader = captureShadowTerm(shader.fragmentShader)
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRamp;
         uniform sampler2D tMasks;
         uniform sampler2D tTerrNoises;
         uniform sampler2D tTerrDetails;
         uniform vec3 grassColor1;
         uniform vec3 grassColor2;
         varying vec3 vWorldPos;
         ${HELPERS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
         ${RAMP_X}
         vec3 wPos = vWorldPos;
         vec4 terrain = texture2D(tMasks, vMapUv);
         float path = smoothstep(0.35, 0.4, terrain.b);
         float road = smoothstep(0.35, 0.4, terrain.r);
         float bridge = terrain.a;

         vec3 colorGrass = vec3(0.0);
         if (path < 1.0) {
           colorGrass = mix(
             texture2D(tRamp, vec2(rampX, getRamp(48.0))).rgb,
             texture2D(tRamp, vec2(rampX, getRamp(49.0))).rgb,
             texture2D(tTerrNoises, wPos.xz * 0.03).r);
           float maskGrass1 = texture2D(tTerrNoises, wPos.xz * 0.05).r;
           float maskGrass2 = texture2D(tTerrNoises, wPos.xz * 0.1).r;
           colorGrass = mix(colorGrass, grassColor1,
             texture2D(tTerrDetails, wPos.xz * 0.25).b * pow(maskGrass1, 2.0));
           colorGrass = mix(colorGrass, grassColor2,
             texture2D(tTerrDetails, wPos.xz * 0.25).a * pow(maskGrass2, 2.0));
         }

         vec3 colorPath = texture2D(tRamp, vec2(rampX, getRamp(50.0))).rgb;
         colorPath += fit(texture2D(tTerrDetails, wPos.xz * 0.25).g, 0.0, 1.0, 0.0, 0.05);

         vec3 terrainColor = mix(colorGrass, colorPath, path);

         if (road > 0.0) {
           vec3 colorRoad = texture2D(tRamp, vec2(rampX, getRamp(52.0))).rgb;
           colorRoad += fit(texture2D(tTerrDetails, wPos.xz * 0.5).r, 0.0, 1.0, 0.0, 0.05);
           colorRoad = mix(colorRoad, texture2D(tRamp, vec2(rampX, getRamp(63.0))).rgb,
             smoothstep(0.6, 0.65, texture2D(map, vMapUv).r));
           terrainColor = mix(terrainColor, colorRoad, road);
         }

         if (terrain.g > 0.0) {
           vec3 colorSand = mix(
             texture2D(tRamp, vec2(rampX, getRamp(56.0))).rgb,
             texture2D(tRamp, vec2(rampX, getRamp(57.0))).rgb,
             texture2D(tTerrNoises, (wPos.xz + 63.6354) * 0.05).g);
           colorSand += fit(texture2D(tTerrDetails, wPos.xz).r, 0.0, 1.0, 0.0, 0.3)
             * texture2D(tTerrNoises, wPos.xz * 1.5).r;
           terrainColor = mix(terrainColor, colorSand, terrain.g);
         }

         if (bridge > 0.0) {
           vec3 colorBridge = mix(
             texture2D(tRamp, vec2(rampX, getRamp(54.0))).rgb,
             texture2D(tRamp, vec2(rampX, getRamp(55.0))).rgb,
             texture2D(tTerrNoises, (wPos.xz + 63.6354) * 0.03).r);
           terrainColor = mix(terrainColor, colorBridge, bridge);
         }

         addFog(terrainColor, length(wPos - cameraPosition));
         gl_FragColor = vec4(terrainColor, 1.0);`,
      )
  }

  material.customProgramCacheKey = () => 'terrain'
  return material
}

/**
 * 하늘 돔 — 원본은 flowmap으로 구름을 흘리지만 여기서는 정지 샘플링만 한다.
 * 색상값은 원본 uniform 그대로.
 */
export function createSkyMaterial(skyTexture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // 돔 면이 이미 안쪽을 향하도록 제작돼 있어 기본 FrontSide가 맞다.
    // BackSide로 뒤집으면 통째로 컬링돼 하늘이 사라진다
    depthWrite: false,
    uniforms: {
      tMap: { value: skyTexture },
      uColorHorizon: { value: new THREE.Color('#caf0fe') },
      uColorHorizonOverlay: { value: new THREE.Color('#d8eeff') },
      uColorSky: { value: new THREE.Color('#248fd5') },
      uColorClouds: { value: new THREE.Color('#ffe5c4') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec3 uColorHorizon;
      uniform vec3 uColorHorizonOverlay;
      uniform vec3 uColorSky;
      uniform vec3 uColorClouds;
      varying vec2 vUv;
      varying vec3 vPos;

      float fit(float v, float a, float b, float c, float d) {
        return c + (clamp(v, min(a, b), max(a, b)) - a) * (d - c) / (b - a);
      }
      float quadInOut(float t) { return t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t; }
      float cubicOut(float t) { float f = t - 1.0; return f * f * f + 1.0; }

      void main() {
        float clouds = texture2D(tMap, vUv * vec2(2.0, 1.0) + vec2(0.135, 0.0)).r;
        vec3 color = mix(uColorHorizon, uColorSky, quadInOut(fit(vPos.y, -0.2, 0.35, 0.0, 1.0)));
        color = mix(color, uColorClouds, cubicOut(clouds));
        color = mix(color, uColorHorizonOverlay, fit(vPos.y, -0.04, 0.06, 1.0, 0.0));
        gl_FragColor = vec4(color, 1.0);
      }`,
  })
}

/**
 * 원본의 컬러 그레이딩 LUT(lut.CUBE_1.LUT.ktx2)를 읽어 Data3DTexture로 만든다.
 *
 * 33³ RGBA32F 무압축이라 KTX2Loader/basis 트랜스코더가 필요 없다.
 * KTX2 레이아웃: 12B 식별자 + 36B 헤더 + 32B 인덱스 오프셋 + 레벨 인덱스(레벨당 24B).
 */
export async function loadKtx2Lut(url: string): Promise<THREE.Data3DTexture> {
  const buffer = await (await fetch(url)).arrayBuffer()
  const view = new DataView(buffer)

  const width = view.getUint32(20, true)
  const height = view.getUint32(24, true)
  const depth = view.getUint32(28, true)
  const supercompression = view.getUint32(44, true)
  if (supercompression !== 0) {
    throw new Error(`${url}: 압축된 KTX2는 지원하지 않음 (scheme ${supercompression})`)
  }

  // 레벨 인덱스는 헤더(48B) + 인덱스 오프셋 블록(32B) 다음부터
  const levelOffset = Number(view.getBigUint64(80, true))
  const levelLength = Number(view.getBigUint64(88, true))
  const expected = width * height * depth * 4 * 4
  if (levelLength !== expected) {
    throw new Error(`${url}: RGBA32F ${width}³가 아님 (${levelLength} != ${expected})`)
  }

  const texture = new THREE.Data3DTexture(
    new Float32Array(buffer, levelOffset, levelLength / 4),
    width,
    height,
    depth,
  )
  texture.format = THREE.RGBAFormat
  texture.type = THREE.FloatType
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.wrapR = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

import * as THREE from 'three'

/**
 * 원본(Summer Afternoon) 셰이딩 이식.
 *
 * 원본은 three Phong을 패치해 라이팅 결과를 램프 룩업으로 "대체"한다.
 *   rampX = fit(dot(normal, dirLight.direction), -1, 1, 0, 1) * shadow
 *   color = texture2D(tRamp, vec2(rampX, getRamp(colorInfo.r)))
 * ramps.png는 100행 팔레트이고 colorInfo.r이 행 번호, 가로축이 음영 단계다.
 *
 * 여기서는 MeshLambertMaterial에 onBeforeCompile로 주입해 인스턴싱·스키닝·
 * 그림자맵을 three가 처리하게 두고, 원본의 램프/안개/구름그림자/바람흔들림/
 * 지형마스크/잔디 로직을 그대로 옮겼다.
 */

/** 여러 재질이 공유하는 uniform — 매 프레임 값만 갱신한다 */
export interface SharedUniforms {
  time: { value: number }
  /** 지면에 드리우는 구름 그림자 (clouds_top-highq.png) */
  tCloudsTop: { value: THREE.Texture | null }
  /** 잔디가 밀려나는 기준이 되는 캐릭터 위치·속도 */
  charPos: { value: THREE.Vector3 }
  charSpeed: { value: number }
}

export function createSharedUniforms(): SharedUniforms {
  return {
    time: { value: 0 },
    tCloudsTop: { value: null },
    charPos: { value: new THREE.Vector3() },
    charSpeed: { value: 0 },
  }
}

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
  // 원본 안개 — 거리에 따라 채도를 낮추고 명도를 올린다.
  // 채도는 "낮추기만" 한다: 이미 채도가 0.3 미만인 중립색(전선 등)을 0.3으로
  // 끌어올리면 색상값이 0(=빨강)인 회색이 원거리에서 붉게 변해 깨져 보인다.
  void addFog(inout vec3 outcolor, float lenCam) {
    vec3 hsv = rgb2hsv(outcolor);
    float fogDist = fit(lenCam, 40.0, 300.0, 0.0, 1.0);
    hsv.z = mix(hsv.z, 0.6, fogDist);
    hsv.y = mix(hsv.y, min(hsv.y, 0.3), fogDist);
    outcolor = hsv2rgb(hsv);
  }
`

/** 지면·오브젝트에 흐르는 구름 그림자. wPos(변위 전 월드 좌표)를 쓴다 */
const CLOUD_SHADOW = /* glsl */ `
  vec2 cloudsUV1 = (wPos.xz * 0.003 + 31.232) + vec2(time * 0.0139 + 13.243, time * 0.02789 - 23.3) * 0.25;
  vec2 cloudsUV2 = wPos.xz * 0.003 - 65.1345 + vec2(time * -0.0123 + 113.82, time * 0.01525 - 34.234) * 0.25;
  float cloud_dither = rand(gl_FragCoord.xy) * 0.002;
  float cloudsMult1 = texture2D(tCloudsTop, cloudsUV1 + cloud_dither).r;
  float cloudsMult2 = texture2D(tCloudsTop, cloudsUV2 + cloud_dither).r;
  float cloudsMult = smoothstep(0.2, 0.9, cloudsMult1 * cloudsMult2);
`

const NOISE = /* glsl */ `
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
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
  float fitv(float v, float a, float b, float c, float d) {
    return c + (clamp(v, min(a, b), max(a, b)) - a) * (d - c) / (b - a);
  }
`

/** 나무·덤불 바람 흔들림. colorInfo.y가 부위별 흔들림 강도다 */
const SHAKE = /* glsl */ `
  {
    float mult = colorInfo.y;
    #ifdef USE_INSTANCING
      float seed = hash13(instanceMatrix[3].xyz);
    #else
      float seed = hash13(_wPos.xyz);
    #endif
    float disp = smoothstep(0.0, 2.0, mvPosition.y);
    float peri = _wPos.y * 0.3;
    float ttotal = (sin(time * (0.4 + 0.2 * seed) + seed * 120.2) + 1.0) * 0.5;
    float amp = seed * disp * mult * ttotal * 0.2;
    _wPos.x += sin(seed * 21.23 + time * 1.0 + peri) * amp;
    _wPos.z += sin(seed * 3.23 + time * 1.5 + peri) * amp;
  }
`

/** 전선 — 나무와 달리 z축 주기로 길게 출렁인다 (원본 LIGHTWIRES) */
const LIGHTWIRES = /* glsl */ `
  {
    float mult = colorInfo.y;
    float peri = _wPos.z * 0.05;
    float ttotal = (sin(time * 0.2 + peri) + 1.0) * 0.5;
    float amp = mult * ttotal * 0.75;
    _wPos.x += sin(time * 0.5 + peri) * amp;
  }
`

/** 잔디 — 바람에 눕고, 캐릭터가 지나가면 밀려난다 */
const GRASS_SHAKE = /* glsl */ `
  {
    float mult = step(0.1, position.y);
    vec3 grassPos = instanceMatrix[3].xyz;
    float grassdisp = 0.1 + 0.2 * random.x;
    float grassspeed = 0.25 + 0.3 * random.y;
    _wPos.x += sinenoise1(vec3(grassPos.x, 0.0, grassPos.z) * vec3(0.05) + time * grassspeed) * grassdisp * mult;
    _wPos.z += sinenoise1(vec3(grassPos.x, 0.0, grassPos.z) * vec3(0.1) + vec3(313.123) + time * grassspeed) * grassdisp * mult;

    vec3 grassCharDir = _wPos.xyz - charPos;
    float cdist = length(grassCharDir);
    vec3 pushed = normalize(grassCharDir)
      * fitv(cdist, 0.0, fitv(charSpeed, 0.0, 0.01, 0.0, 1.25), 1.0, 0.0)
      * mult * 15.0 * charSpeed;
    _wPos.xz += pushed.xz;
  }
`

/**
 * 원본 PLANE_FACE_CHARACTER — 평면 쿼드의 로컬 X축을 카메라 오른쪽 방향으로
 * 눕혀 항상 정면을 보게 한다. 이게 없으면 잔디가 모두 +Z만 바라봐서
 * 옆에서 보면 얇은 선으로 사라진다.
 */
const BILLBOARD = /* glsl */ `
  mvPosition.xz = vec2(viewMatrix[0][0], viewMatrix[2][0]) * mvPosition.x;
`

/**
 * project_vertex를 직접 대체한다.
 * 원본은 instanceMatrix까지 적용한 월드 좌표(_wPos)를 변위시킨 뒤 투영하므로
 * 같은 순서를 따라야 한다. 안개·구름은 변위 전 좌표(vWorldPos)를 쓴다.
 */
function projectVertex(displacement: string, billboard = false): string {
  return /* glsl */ `
    vec4 mvPosition = vec4(transformed, 1.0);
    ${billboard ? BILLBOARD : ''}
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    vec4 _wPos = modelMatrix * mvPosition;
    vWorldPos = _wPos.xyz;
    ${displacement}
    mvPosition = viewMatrix * _wPos;
    gl_Position = projectionMatrix * mvPosition;
  `
}

/**
 * three r169에는 getShadowMask()가 없다. 원본이 한 것처럼
 * lights_fragment_begin의 그림자 계산식을 가로채 _shadow0으로 빼낸다.
 *
 * onBeforeCompile 시점의 소스에는 #include가 아직 전개돼 있지 않아서,
 * 청크 원본을 직접 가져와 수술한 뒤 include 자리에 끼워 넣는다. 전역 치환인
 * 이유는 청크에 point/spot/directional 각각의 같은 구문이 있고, 해당 광원이
 * 없는 블록은 전처리에서 빠지므로 남는 건 실제 광원 것뿐이기 때문이다.
 */
function captureShadowTerm(fragmentShader: string): string {
  const patched = THREE.ShaderChunk.lights_fragment_begin.replace(
    /directLight\.color \*= ([\s\S]*?);/g,
    '_shadow0 = $1;\n directLight.color *= _shadow0;',
  )
  return fragmentShader.replace(
    '#include <lights_fragment_begin>',
    `float _shadow0 = 1.0;\n${patched}`,
  )
}

/** 램프가 라이팅을 대체하므로 그림자도 여기서 곱해야 화면에 나타난다 */
const RAMP_X = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
    float rampX = fit(dot(normalize(normal), directionalLights[0].direction), -1.0, 1.0, 0.0, 1.0);
  #else
    float rampX = 0.75;
  #endif
  rampX *= _shadow0;
`

/** 구름 그림자를 곱하고 안개를 씌워 최종 색을 낸다 */
const FINISH = /* glsl */ `
  ${CLOUD_SHADOW}
  outColor *= fit(cloudsMult, 0.0, 1.0, 0.7, 1.0);
  addFog(outColor, length(wPos - cameraPosition));
  gl_FragColor = vec4(outColor, 1.0);
`

/**
 * 캐릭터는 colorInfo.y로 분기가 갈린다 (원본 IS_CHARACTER).
 *   y < 0.01  고정 파츠 → 일반 팔레트
 *   y < 1.01  피부      → 79행 + seed
 *   그 외     의상      → seed 기반 HSV
 */
const CHARACTER_BRANCH = /* glsl */ `
  vec3 outColor;
  if (vColorInfo.y < 0.01) {
    outColor = texture2D(tRamp, vec2(rampX, getRamp(vColorInfo.x))).rgb;
  } else if (vColorInfo.y < 1.01) {
    outColor = texture2D(tRamp, vec2(rampX, getRamp(79.0 + clamp(floor(uSeed), 0.0, 3.0)))).rgb;
  } else {
    outColor = hsv2rgb(vec3(fract(uSeed), 0.4, 0.2 + floor(rampX * 2.99) * 0.3));
  }
`

const GENERIC_BRANCH = /* glsl */ `
  vec3 outColor = texture2D(tRamp, vec2(rampX, getRamp(vColorInfo.x))).rgb;
`

// 전선은 텍셀보다 가는 선이라 팔레트 램프를 쓰면 초목 위에서 붉게 번져
// 깨져 보인다. 원본처럼 중립적인 어두운 색으로 고정하고 음영만 반영한다.
const WIRES_BRANCH = /* glsl */ `
  vec3 outColor = vec3(0.22, 0.21, 0.2) * fit(_shadow0, 0.0, 1.0, 0.55, 1.0);
`

export interface RampOptions {
  isCharacter?: boolean
  seed?: number
  /** 나무·덤불처럼 바람에 흔들리는 오브젝트 */
  shake?: boolean
  /** 전선 — 흔들림 공식이 다르다 */
  lightwires?: boolean
}

/** colorInfo(팔레트 행 번호)로 색을 정하는 소품·건물·캐릭터용 재질 */
export function createRampMaterial(
  ramp: THREE.Texture,
  shared: SharedUniforms,
  { isCharacter = false, seed = 0, shake = false, lightwires = false }: RampOptions = {},
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial()

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tRamp = { value: ramp }
    shader.uniforms.uSeed = { value: seed }
    shader.uniforms.time = shared.time
    shader.uniforms.tCloudsTop = shared.tCloudsTop

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float time;
         attribute vec2 colorInfo;
         varying vec2 vColorInfo;
         varying vec3 vWorldPos;
         ${NOISE}`,
      )
      .replace(
        '#include <project_vertex>',
        `vColorInfo = colorInfo;
         ${projectVertex(lightwires ? LIGHTWIRES : shake ? SHAKE : '')}`,
      )

    shader.fragmentShader = captureShadowTerm(shader.fragmentShader)
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRamp;
         uniform sampler2D tCloudsTop;
         uniform float uSeed;
         uniform float time;
         varying vec2 vColorInfo;
         varying vec3 vWorldPos;
         ${HELPERS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `${RAMP_X}
         vec3 wPos = vWorldPos;
         ${lightwires ? WIRES_BRANCH : isCharacter ? CHARACTER_BRANCH : GENERIC_BRANCH}
         ${FINISH}`,
      )

    // 캐릭터 옷 색을 런타임에 바꾸려면 uSeed uniform 참조가 필요하다
    material.userData.shader = shader
  }

  // onBeforeCompile을 쓰는 재질은 캐시 키를 직접 구분해줘야 한다
  material.customProgramCacheKey = () => `ramp:${isCharacter}:${shake}:${lightwires}`
  return material
}

/**
 * 잔디 — 인스턴스마다 random 속성을 받아 흔들림과 색이 갈린다.
 * 색은 rampX가 아니라 그림자 항으로 램프를 샘플링한다(원본 GRASS 분기).
 */
export function createGrassMaterial(
  ramp: THREE.Texture,
  patches: THREE.Texture,
  shared: SharedUniforms,
): THREE.MeshLambertMaterial {
  // 빌보드 수천 개를 투명 정렬에 태우면 순서 문제가 생기고 three가 그리지도
  // 않는다. 알파 테스트(discard)로 처리하고 거리 페이드도 discard로 대체한다.
  const material = new THREE.MeshLambertMaterial({ map: patches })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tRamp = { value: ramp }
    shader.uniforms.tCloudsTop = shared.tCloudsTop
    shader.uniforms.time = shared.time
    shader.uniforms.charPos = shared.charPos
    shader.uniforms.charSpeed = shared.charSpeed

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float time;
         uniform vec3 charPos;
         uniform float charSpeed;
         attribute vec4 random;
         varying vec4 vRand;
         varying vec3 vWorldPos;
         ${NOISE}`,
      )
      .replace(
        '#include <project_vertex>',
        `vRand = random;
         ${projectVertex(GRASS_SHAKE, true)}`,
      )

    shader.fragmentShader = captureShadowTerm(shader.fragmentShader)
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRamp;
         uniform sampler2D tCloudsTop;
         uniform float time;
         varying vec4 vRand;
         varying vec3 vWorldPos;
         ${HELPERS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// grass-patches는 2048×256 = 256px 스프라이트 8칸 아틀라스다.
         // 쿼드 UV(0~1)를 그대로 쓰면 8칸 전체를 훑어 대부분 알파 0 → 전부
         // discard 됐다. 인스턴스 random으로 한 칸을 골라 그 칸만 샘플링한다.
         float grassCell = floor(vRand.z * 8.0);
         vec2 grassUv = vec2((grassCell + vMapUv.x) / 8.0, vMapUv.y);
         if (texture2D(map, grassUv).a < 0.5) discard;
         vec3 wPos = vWorldPos;
         float rampID = 58.0 + step(0.8, fract(vRand.x + vRand.y));
         vec3 outColor = texture2D(tRamp, vec2(_shadow0, getRamp(rampID))).rgb;
         outColor *= fit(vMapUv.y, 0.0, 0.75, 1.0, 1.25);
         ${CLOUD_SHADOW}
         outColor *= fit(cloudsMult, 0.0, 1.0, 0.7, 1.0);
         float lenCam = length(wPos - cameraPosition);
         // 원본 FADE_AWAY 60 — 하드 컷 대신 45~60m에서 디더링으로 서서히
         // 사라지게 해 걸을 때 잔디가 뭉텅이로 팝핑하는 것을 없앤다
         if (rand(gl_FragCoord.xy) < smoothstep(45.0, 60.0, lenCam)) discard;
         addFog(outColor, lenCam);
         gl_FragColor = vec4(outColor, 1.0);`,
      )
  }

  material.customProgramCacheKey = () => 'grass'
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
 * 지형 재질 — 마스크 텍스처로 잔디/흙길/도로/모래/다리를 나눠 칠하고,
 * x>50 구간(해변)에는 파도 물가선을 그린다.
 * 팔레트 행: 잔디 48·49, 흙길 50, 도로 52, 도로표시 63, 다리 54·55, 모래 56·57
 */
export function createTerrainMaterial(
  tex: TerrainTextures,
  shared: SharedUniforms,
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ map: tex.road })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.tRamp = { value: tex.ramp }
    shader.uniforms.tMasks = { value: tex.masks }
    shader.uniforms.tTerrNoises = { value: tex.noises }
    shader.uniforms.tTerrDetails = { value: tex.details }
    shader.uniforms.tCloudsTop = shared.tCloudsTop
    shader.uniforms.time = shared.time
    shader.uniforms.grassColor1 = { value: new THREE.Color('#558f6e') }
    shader.uniforms.grassColor2 = { value: new THREE.Color('#9bc2a4') }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n varying vec3 vWorldPos;`)
      .replace('#include <project_vertex>', projectVertex(''))

    shader.fragmentShader = captureShadowTerm(shader.fragmentShader)
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tRamp;
         uniform sampler2D tMasks;
         uniform sampler2D tTerrNoises;
         uniform sampler2D tTerrDetails;
         uniform sampler2D tCloudsTop;
         uniform float time;
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
             texture2D(tTerrDetails, wPos.xz * 0.25).b
               * fit(_shadow0, 0.0, 1.0, 0.2, 1.0) * pow(maskGrass1, 2.0));
           colorGrass = mix(colorGrass, grassColor2,
             texture2D(tTerrDetails, wPos.xz * 0.25).a
               * fit(_shadow0, 0.0, 1.0, 0.2, 1.0) * pow(maskGrass2, 2.0));
         }

         vec3 colorPath = texture2D(tRamp, vec2(rampX, getRamp(50.0))).rgb;
         colorPath += fit(texture2D(tTerrDetails, wPos.xz * 0.25).g, 0.0, 1.0, 0.0, 0.05)
           * fit(_shadow0, 0.0, 1.0, 0.3, 1.0);

         vec3 outColor = mix(colorGrass, colorPath, path);

         if (road > 0.0) {
           vec3 colorRoad = texture2D(tRamp, vec2(rampX, getRamp(52.0))).rgb;
           colorRoad += fit(texture2D(tTerrDetails, wPos.xz * 0.5).r, 0.0, 1.0, 0.0, 0.05)
             * fit(_shadow0, 0.0, 1.0, 0.3, 1.0);
           colorRoad = mix(colorRoad, texture2D(tRamp, vec2(rampX, getRamp(63.0))).rgb,
             smoothstep(0.6, 0.65, texture2D(map, vMapUv).r));
           outColor = mix(outColor, colorRoad, road);
         }

         if (terrain.g > 0.0) {
           vec3 colorSand = mix(
             texture2D(tRamp, vec2(rampX, getRamp(56.0))).rgb,
             texture2D(tRamp, vec2(rampX, getRamp(57.0))).rgb,
             texture2D(tTerrNoises, (wPos.xz + 63.6354) * 0.05).g);
           colorSand += fit(texture2D(tTerrDetails, wPos.xz).r, 0.0, 1.0, 0.0, 0.3)
             * fit(_shadow0, 0.0, 1.0, 0.3, 1.0)
             * texture2D(tTerrNoises, wPos.xz * 1.5).r;
           outColor = mix(outColor, colorSand, terrain.g);
         }

         if (bridge > 0.0) {
           vec3 colorBridge = mix(
             texture2D(tRamp, vec2(rampX, getRamp(54.0))).rgb,
             texture2D(tRamp, vec2(rampX, getRamp(55.0))).rgb,
             texture2D(tTerrNoises, (wPos.xz + 63.6354) * 0.03).r);
           outColor = mix(outColor, colorBridge, bridge);
         }

         // 해변 물가선 — 파도가 오르내리는 지점을 흰색으로 덮는다
         float beachZone = step(50.0, wPos.x);
         if (beachZone > 0.0) {
           float seaYLevel = -0.815
             + (sin(time * 0.5 + 23.124) + sin(time * 0.15 + 3213.32)) * 0.2
             + (sin(time + wPos.z) * 0.01);
           outColor = mix(outColor, vec3(1.0), step(wPos.y, seaYLevel + 0.025) * beachZone);
         }

         ${FINISH}`,
      )
  }

  material.customProgramCacheKey = () => 'terrain'
  return material
}

/**
 * 바다 — sea1-normal 텍스처를 두 겹으로 흘려 잔물결을 만들고, 햇빛
 * 스페큘러와 수평선 프레넬로 오후 바다의 반짝임을 낸다. 지형이 해수면
 * (y≈-0.8) 위로 솟아 있어 이 평면은 실제 바다 영역에서만 드러난다.
 */
export function createSeaMaterial(
  normalTexture: THREE.Texture | null,
  sunDir: THREE.Vector3,
  shared: SharedUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tNormal: { value: normalTexture },
      uUseNormal: { value: normalTexture ? 1 : 0 },
      tCloudsTop: shared.tCloudsTop,
      time: shared.time,
      uSunDir: { value: sunDir.clone().normalize() },
      uShallow: { value: new THREE.Color('#8fd0dc') },
      uDeep: { value: new THREE.Color('#2f6f92') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tNormal;
      uniform float uUseNormal;
      uniform sampler2D tCloudsTop;
      uniform float time;
      uniform vec3 uSunDir;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      varying vec3 vWorldPos;
      ${HELPERS}
      float rand(vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }

      void main() {
        vec3 wPos = vWorldPos;
        vec3 N = vec3(0.0, 1.0, 0.0);
        if (uUseNormal > 0.5) {
          vec2 uv1 = wPos.xz * 0.02 + time * vec2(0.010, 0.013);
          vec2 uv2 = wPos.xz * 0.035 - time * vec2(0.017, 0.009);
          vec2 n1 = texture2D(tNormal, uv1).rg * 2.0 - 1.0;
          vec2 n2 = texture2D(tNormal, uv2).rg * 2.0 - 1.0;
          N = normalize(vec3((n1 + n2) * 0.6, 4.0)).xzy;
        }
        vec3 viewDir = normalize(cameraPosition - wPos);
        float ndl = max(dot(N, normalize(uSunDir)), 0.0);
        vec3 col = mix(uDeep, uShallow, smoothstep(0.0, 1.0, ndl));

        // 잔물결 위 햇빛 반짝임
        vec3 h = normalize(normalize(uSunDir) + viewDir);
        float spec = pow(max(dot(N, h), 0.0), 80.0);
        col += vec3(1.0, 0.98, 0.9) * spec * 0.8;

        // 수평선으로 갈수록 하늘빛으로 밝아진다(프레넬)
        float fres = pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), viewDir), 0.0), 3.0);
        col = mix(col, uShallow * 1.15, fres * 0.6);

        // 지면과 같은 구름 그림자
        vec2 cloudsUV = wPos.xz * 0.003 + vec2(time * 0.0139, time * 0.02789) * 0.25;
        float cloudsMult = texture2D(tCloudsTop, cloudsUV).r;
        col *= fit(smoothstep(0.2, 0.9, cloudsMult), 0.0, 1.0, 0.85, 1.0);

        addFog(col, length(wPos - cameraPosition));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

/**
 * 하늘 돔 — flowmap으로 구름을 흘린다. 색상값은 원본 uniform 그대로.
 * 돔 면이 이미 안쪽을 향하도록 제작돼 있어 기본 FrontSide가 맞다.
 * BackSide로 뒤집으면 통째로 컬링돼 하늘이 사라진다.
 */
export function createSkyMaterial(
  skyTexture: THREE.Texture,
  flowTexture: THREE.Texture | null,
  shared: SharedUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      tMap: { value: skyTexture },
      tFlow: { value: flowTexture },
      uUseFlow: { value: flowTexture ? 1 : 0 },
      time: shared.time,
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
      uniform sampler2D tFlow;
      uniform float uUseFlow;
      uniform float time;
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
      float cubicInOut(float t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0;
      }

      // 원본 applyFlowmap — 두 시점을 섞어 텍스처를 흐르게 한다
      vec4 applyFlowmap(sampler2D tex, vec2 uvtex, sampler2D flowmap, vec2 uvflow,
                        float speed, vec2 displacement) {
        vec3 flow = texture2D(flowmap, uvflow).rgb;
        vec2 disp = (flow.rg * 2.0 - 1.0) * vec2(-1.0, 1.0) * displacement;
        float t = time * speed + flow.b;
        float disp1 = fract(t);
        float disp2 = fract(t + 0.5);
        vec4 t1 = texture2D(tex, uvtex - disp * disp1);
        vec4 t2 = texture2D(tex, uvtex - disp * disp2);
        return mix(t1, t2, cubicInOut(abs(disp1 * 2.0 - 1.0)));
      }

      void main() {
        float limits = smoothstep(0.0, 0.025, vUv.y) * smoothstep(1.0, 1.0 - 0.025, vUv.y);
        vec2 cloudUv = vUv * vec2(2.0, 1.0) + vec2(time * 0.001 + 0.135, 0.0);
        float clouds = uUseFlow > 0.5
          ? applyFlowmap(tMap, cloudUv, tFlow, vUv, 0.2, vec2(0.125, 0.075) * limits).r
          : texture2D(tMap, cloudUv).r;

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

/**
 * 갈매기 — 본 없이 프레임 텍스처를 보간해 날갯짓한다(원본 vertexanimation).
 * 원본은 GPGPU로 25마리 위치를 계산하지만, 25개는 CPU로 곡선을 따라
 * instanceMatrix를 갱신하는 편이 훨씬 단순하고 결과는 같다.
 */
export function createBirdMaterial(
  anim: {
    uAnimInfo: { value: THREE.Vector4 }
    tPosition: { value: THREE.DataTexture }
    tNormal: { value: THREE.DataTexture }
  },
  shared: SharedUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...anim,
      time: shared.time,
      uColor: { value: new THREE.Color('#dfdfdf') },
    },
    vertexShader: /* glsl */ `
      attribute float vposition;
      attribute vec4 rand;
      uniform float time;
      uniform vec4 uAnimInfo;
      uniform sampler2D tPosition;
      uniform sampler2D tNormal;
      varying vec3 vNormal;
      varying vec3 vLDir;
      varying float vVar;
      varying vec4 vPos;

      // uAnimInfo = (fps, frames, 정점수, 텍스처 한 변)
      vec3 getAnimData(sampler2D map, float timeOffset) {
        float t = mod((time + timeOffset) * uAnimInfo.x, uAnimInfo.y);
        float base = floor(t);
        float next = mod(floor(t + 1.0), uAnimInfo.y);
        float weight = t - base;
        float p1 = (base * uAnimInfo.z + vposition) / uAnimInfo.w;
        float p2 = (next * uAnimInfo.z + vposition) / uAnimInfo.w;
        vec3 f1 = texture2D(map, vec2(fract(p1), floor(p1) / uAnimInfo.w)).rgb;
        vec3 f2 = texture2D(map, vec2(fract(p2), floor(p2) / uAnimInfo.w)).rgb;
        return mix(f1, f2, weight);
      }

      void main() {
        float timeoffset = rand.x * 10.0;
        vec3 pos = getAnimData(tPosition, timeoffset);
        vec3 n = getAnimData(tNormal, timeoffset);

        vec4 world = instanceMatrix * vec4(pos, 1.0);
        vec3 worldNormal = mat3(instanceMatrix) * n;

        vNormal = normalize(normalMatrix * worldNormal);
        vLDir = (viewMatrix * vec4(normalize(vec3(1.0)), 0.0)).xyz;
        vVar = rand.y;
        vPos = modelViewMatrix * world;
        gl_Position = projectionMatrix * vPos;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vLDir;
      varying float vVar;
      varying vec4 vPos;
      ${HELPERS}

      void main() {
        // 하드한 2단 음영 — 원본 갈매기는 단색 실루엣에 가깝다
        float sh = step(0.5, max(0.0, dot(normalize(vNormal), normalize(vLDir))));
        vec3 col = uColor * 0.95 + uColor * vVar * 0.05;
        col = mix(col * 0.1, col, sh);
        addFog(col, length(-vPos.xyz));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

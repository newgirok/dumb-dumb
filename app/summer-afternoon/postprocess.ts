import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * 원본 baseShader + introShader를 한 패스로 합쳤다(선형 공간에서 처리하고, 뒤의
 * OutputPass가 sRGB로 바꾼다 — 원본의 감마 보정 패스와 같은 순서).
 *
 * - LUT: 선형 색을 sRGB로 바꿔 3D LUT를 사면체 보간으로 읽고 다시 선형으로 돌린다.
 * - 인트로(uIntro 1): #FFFDF8 커버를 소용돌이 마스크로 중앙부터 벗긴다(4초 선형).
 */
export function createFinalPass(): ShaderPass {
  const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  placeholder.needsUpdate = true
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tLUT: { value: null },
      uLUTSize: { value: 1 },
      uLUTIntensity: { value: 1 },
      uUseLUT: { value: 0 },
      tIntro: { value: placeholder },
      uInitialColor: { value: new THREE.Color('#FFFDF8') },
      uTransition: { value: 0 },
      uIntro: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp sampler3D;
      uniform sampler2D tDiffuse;
      uniform sampler3D tLUT;
      uniform float uLUTSize;
      uniform float uLUTIntensity;
      uniform float uUseLUT;
      uniform sampler2D tIntro;
      uniform vec3 uInitialColor;
      uniform float uTransition;
      uniform float uIntro;
      uniform vec2 uResolution;
      varying vec2 vUv;

      vec3 LUTLinearTosRGB(in vec3 value) {
        return mix(pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055), value.rgb * 12.92,
          vec3(lessThanEqual(value.rgb, vec3(0.0031308))));
      }
      vec3 LUTsRGBToLinear(in vec3 value) {
        return mix(pow(value.rgb * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), value.rgb * 0.0773993808,
          vec3(lessThanEqual(value.rgb, vec3(0.04045))));
      }
      vec3 apply3DLUTTetrahedral(vec3 color, float lutSize, float lutIntensity) {
        float scale = lutSize - 1.0;
        float texelSize = 1.0 / lutSize;
        vec3 col = LUTLinearTosRGB(color);
        vec3 rgb = clamp(col, 0.0, 1.0) * scale;
        vec3 p = floor(rgb);
        vec3 f = rgb - p;
        vec3 v1 = (p + 0.5) * texelSize;
        vec3 v4 = (p + 1.5) * texelSize;
        vec3 v2, v3;
        vec3 frac;
        if (f.r >= f.g) {
          if (f.g > f.b) { frac = f.rgb; v2 = vec3(v4.x, v1.y, v1.z); v3 = vec3(v4.x, v4.y, v1.z); }
          else if (f.r >= f.b) { frac = f.rbg; v2 = vec3(v4.x, v1.y, v1.z); v3 = vec3(v4.x, v1.y, v4.z); }
          else { frac = f.brg; v2 = vec3(v1.x, v1.y, v4.z); v3 = vec3(v4.x, v1.y, v4.z); }
        } else {
          if (f.b > f.g) { frac = f.bgr; v2 = vec3(v1.x, v1.y, v4.z); v3 = vec3(v1.x, v4.y, v4.z); }
          else if (f.r >= f.b) { frac = f.grb; v2 = vec3(v1.x, v4.y, v1.z); v3 = vec3(v4.x, v4.y, v1.z); }
          else { frac = f.gbr; v2 = vec3(v1.x, v4.y, v1.z); v3 = vec3(v1.x, v4.y, v4.z); }
        }
        vec4 n1 = texture(tLUT, v1);
        vec4 n2 = texture(tLUT, v2);
        vec4 n3 = texture(tLUT, v3);
        vec4 n4 = texture(tLUT, v4);
        vec4 weights = vec4(1.0 - frac.x, frac.x - frac.y, frac.y - frac.z, frac.z);
        vec4 result = weights * mat4(
          vec4(n1.r, n2.r, n3.r, n4.r),
          vec4(n1.g, n2.g, n3.g, n4.g),
          vec4(n1.b, n2.b, n3.b, n4.b),
          vec4(1.0));
        return LUTsRGBToLinear(mix(col, result.rgb, lutIntensity));
      }
      vec2 scaleUV(vec2 uv, float s) { return (uv - 0.5) / s + 0.5; }
      // 원본 falloffsmooth(t, 0, 1, margin, progress)
      float falloffsmooth(float value, float margin, float progress) {
        float p = mix(-margin, 1.0, progress);
        return smoothstep(p + margin, p, value);
      }

      void main() {
        vec3 color = texture2D(tDiffuse, vUv).rgb;
        if (uUseLUT > 0.5) color = apply3DLUTTetrahedral(color, uLUTSize, uLUTIntensity);

        if (uIntro > 0.5) {
          vec2 uvIntro = vUv - 0.5;
          uvIntro *= uResolution / max(uResolution.x, uResolution.y);
          uvIntro += 0.5;
          uvIntro = scaleUV(uvIntro, 1.0 + uTransition);
          float t = 1.0 - texture2D(tIntro, uvIntro).r;
          color = mix(uInitialColor, color, falloffsmooth(t, 0.001, uTransition));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

/**
 * 원본 noises.sineNoise1 — 6개 사인 합을 6으로 나눈 [-1,1] 매끈한 노이즈.
 * 셰이더의 sinenoise1(vec3)과 같은 식이라 CPU 쪽 흔들림·새 비행에서 같이 쓴다.
 */
export function sineNoise1(x: number, y: number, z: number): number {
  let r = 0
  r += Math.sin(x * 1.5 + y * 3.4598 + z * 1.234)
  r += Math.sin(x * 3.12 + y * -3.234 + z * 4.221)
  r += Math.sin(x * 0.355 + y * 2.3 + z * -1.375)
  r += Math.sin(x * -0.156 + y * -3.34 + z * -0.4566)
  r += Math.sin(x * -4.1235 + y * -0.485 + z * -1.45)
  r += Math.sin(x * 2.54 + y * -0.879 + z * -2.123)
  return r / 6
}

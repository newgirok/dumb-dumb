import * as THREE from 'three'

// 루트 3D 씬(여름 마을)과 내 주변(베타)이 함께 쓰는 기기·텍스처 준비

/** 원본 client.device === 'mobile'(휴대폰) */
export function isMobileDevice(): boolean {
  return /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent)
}

/** 원본 DPR — 데스크톱 사파리는 1, 그 외는 기기 DPR을 1.5로 제한 */
export function baseDevicePixelRatio(mobile: boolean): number {
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)
  if (safari && !mobile) return 1
  return Math.min(window.devicePixelRatio, 1.5) || 1
}

type TextureOptions = { srgb?: boolean; repeat?: boolean; colordata?: boolean; raw?: boolean }

/** 원본 textureLoader 옵션 — srgb/repeat/colordata(선형 필터·밉맵 없음) */
export function configure(texture: THREE.Texture, { srgb = false, repeat = false, colordata = false, raw = false }: TextureOptions = {}) {
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  else if (raw) texture.colorSpace = THREE.NoColorSpace
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
  }
  if (colordata) {
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
  }
  texture.needsUpdate = true
  return texture
}

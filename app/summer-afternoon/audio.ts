import * as THREE from 'three'

/**
 * 원본 오디오 이식.
 *
 * 브라우저 자동재생 정책상 첫 사용자 제스처(시작 버튼 클릭) 이후에만 만들 수
 * 있다. song은 BGM, forest/beach는 위치 기반 환경음(PositionalAudio), footsteps는
 * 이동 중에만 볼륨을 올린다. click1은 UI 버튼 효과음이다.
 */

const PATH = '/ref-assets/audio/'

export interface SceneAudio {
  /** 이동 중이면 발소리를 켠다 */
  footsteps(active: boolean): void
  /** UI 버튼 클릭음 */
  click(): void
  /** 전체 음소거 토글 */
  setMuted(muted: boolean): void
  dispose(): void
}

async function loadBuffer(loader: THREE.AudioLoader, name: string) {
  return loader.loadAsync(name).catch(() => null)
}

export async function createSceneAudio(
  camera: THREE.Camera,
  scene: THREE.Scene,
): Promise<SceneAudio> {
  const listener = new THREE.AudioListener()
  camera.add(listener)
  const loader = new THREE.AudioLoader().setPath(PATH)

  const [song, forest, beach, steps, clickBuf] = await Promise.all([
    loadBuffer(loader, 'song.mp3'),
    loadBuffer(loader, 'forest.mp3'),
    loadBuffer(loader, 'beach.mp3'),
    loadBuffer(loader, 'footsteps.mp3'),
    loadBuffer(loader, 'click1.mp3'),
  ])

  // Audio와 PositionalAudio를 함께 담는다 — 정리 때 stop만 부르면 된다
  const sources: { stop(): unknown }[] = []

  const bgm = new THREE.Audio(listener)
  if (song) {
    bgm.setBuffer(song)
    bgm.setLoop(true)
    bgm.setVolume(0.35)
    bgm.play()
    sources.push(bgm)
  }

  // 위치 기반 환경음 — 숲(중앙 나무 지대)과 해변(+x)에 앵커를 둔다
  const anchor = (buffer: AudioBuffer | null, x: number, z: number, ref: number) => {
    if (!buffer) return null
    const audio = new THREE.PositionalAudio(listener)
    audio.setBuffer(buffer)
    audio.setLoop(true)
    audio.setRefDistance(ref)
    audio.setVolume(1)
    audio.play()
    const obj = new THREE.Object3D()
    obj.position.set(x, 1, z)
    obj.add(audio)
    scene.add(obj)
    sources.push(audio)
    return audio
  }
  anchor(forest, -20, 30, 25)
  anchor(beach, 90, 10, 35)

  const foot = new THREE.Audio(listener)
  if (steps) {
    foot.setBuffer(steps)
    foot.setLoop(true)
    foot.setVolume(0)
    foot.play()
    sources.push(foot)
  }

  let muted = false

  return {
    footsteps(active: boolean) {
      if (steps) foot.setVolume(muted ? 0 : active ? 0.5 : 0)
    },
    click() {
      if (!clickBuf || muted) return
      const c = new THREE.Audio(listener)
      c.setBuffer(clickBuf)
      c.setVolume(0.6)
      c.play()
    },
    setMuted(next: boolean) {
      muted = next
      listener.setMasterVolume(next ? 0 : 1)
    },
    dispose() {
      for (const s of sources) {
        try {
          s.stop()
        } catch {
          /* 이미 정지 */
        }
      }
      camera.remove(listener)
    },
  }
}

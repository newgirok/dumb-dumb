'use client'

/**
 * 미리 켜 둔 오디오 컨텍스트 — 선택 페이지에서 '플레이'를 누르는 순간 만들어 켠다.
 * 브라우저는 탭·클릭·키 처리 안에서만 소리를 켜 주고(iOS 사파리는 끌기를 치지 않는다), 선택 페이지에서 플레이 씬으로는
 * 같은 문서로 넘어가므로(클라이언트 이동) 씬이 이 컨텍스트를 이어 쓰면 씬에서 첫 탭을 기다리지 않고 소리가 난다.
 */
let shared: AudioContext | null = null

/** 탭·클릭·키 처리 안에서 부른다 — 컨텍스트를 켜고 1샘플짜리 무음을 한 번 틀어 iOS에서도 확실히 연다 */
export function unlockAudio(): void {
  try {
    shared ??= new AudioContext()
    if (shared.state !== 'running') shared.resume().catch(() => {})
    const silence = shared.createBufferSource()
    silence.buffer = shared.createBuffer(1, 1, 22050)
    silence.connect(shared.destination)
    silence.start(0)
  } catch {
    // 오디오를 못 쓰는 환경이면 씬이 첫 입력에서 다시 시도한다
  }
}

/** 미리 켜 둔 컨텍스트 — 없으면 null */
export function unlockedAudio(): AudioContext | null {
  return shared
}

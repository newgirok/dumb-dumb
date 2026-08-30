/** Web Audio API PannerNode 기반 3D 공간 음성 */

const JOIN_M = 30
const LEAVE_M = 40

interface AudioNodes {
  source: MediaStreamAudioSourceNode
  panner: PannerNode
  gain: GainNode
}

export class SpatialAudioManager {
  private ctx: AudioContext
  private nodes = new Map<string, AudioNodes>()

  constructor() {
    this.ctx = new AudioContext()
    // 리스너(플레이어)는 원점 고정
    this.ctx.listener.positionX.value = 0
    this.ctx.listener.positionY.value = 0
    this.ctx.listener.positionZ.value = 0
    this.ctx.listener.forwardX.value = 0
    this.ctx.listener.forwardY.value = 0
    this.ctx.listener.forwardZ.value = -1
    this.ctx.listener.upX.value = 0
    this.ctx.listener.upY.value = 1
    this.ctx.listener.upZ.value = 0
  }

  /** 사용자 제스처 후 호출 — autoplay 정책 대응 */
  resumeContext(): void {
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  addTrack(id: string, stream: MediaStream): void {
    if (this.nodes.has(id)) return

    const source = this.ctx.createMediaStreamSource(stream)
    const panner = this.ctx.createPanner()
    const gain = this.ctx.createGain()

    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.rolloffFactor = 0  // 거리 감쇠는 gain 노드로 직접 제어
    panner.refDistance = 1
    panner.maxDistance = LEAVE_M

    gain.gain.value = 0  // 위치 업데이트 전 묵음

    source.connect(panner)
    panner.connect(gain)
    gain.connect(this.ctx.destination)

    this.nodes.set(id, { source, panner, gain })
  }

  removeTrack(id: string): void {
    const n = this.nodes.get(id)
    if (!n) return
    n.source.disconnect()
    n.panner.disconnect()
    n.gain.disconnect()
    this.nodes.delete(id)
  }

  /**
   * @param distM    플레이어와의 거리 (미터)
   * @param bearing  플레이어 → 상대 방향각 (라디안, 북=0, 동=π/2)
   */
  updatePosition(id: string, distM: number, bearing: number): void {
    const n = this.nodes.get(id)
    if (!n) return

    // 3D 위치: 리스너 기준 상대 좌표 (Y-up, Z = 남쪽)
    n.panner.positionX.value = Math.sin(bearing) * distM
    n.panner.positionY.value = 0
    n.panner.positionZ.value = -Math.cos(bearing) * distM

    // 30m까지 풀볼륨 → 40m에서 묵음 (선형)
    const g = distM <= JOIN_M ? 1 : Math.max(0, 1 - (distM - JOIN_M) / (LEAVE_M - JOIN_M))
    n.gain.gain.linearRampToValueAtTime(g, this.ctx.currentTime + 0.05)
  }

  dispose(): void {
    for (const id of [...this.nodes.keys()]) this.removeTrack(id)
    this.ctx.close()
  }
}

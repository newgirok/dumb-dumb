import { Room, RoomEvent, Track } from 'livekit-client'
import { SpatialAudioManager } from './spatial-audio'

const LEAVE_M = 40
const MAX_SUBS = 8

export interface PeerAudioInfo {
  distM: number
  bearing: number  // 라디안
}

async function fetchToken(roomName: string, identity: string): Promise<string> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/livekit-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ room_name: roomName, identity }),
    },
  )
  const { token } = (await res.json()) as { token: string }
  return token
}

export class VoiceManager {
  private room: Room | null = null
  private spatial: SpatialAudioManager | null = null

  async connect(roomName: string, identity: string): Promise<void> {
    if (this.room) await this.disconnect()

    const token = await fetchToken(roomName, identity)

    this.spatial = new SpatialAudioManager()
    this.room = new Room()

    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return
      const stream = new MediaStream([track.mediaStreamTrack])
      this.spatial?.addTrack(participant.identity, stream)
    })

    this.room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return
      this.spatial?.removeTrack(participant.identity)
    })

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.spatial?.removeTrack(participant.identity)
    })

    await this.room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL!, token, {
      autoSubscribe: false,
    })
  }

  async disconnect(): Promise<void> {
    await this.room?.disconnect()
    this.room = null
    this.spatial?.dispose()
    this.spatial = null
  }

  /**
   * 마이크 권한 옵트인 — 거부 시 수신 전용 모드 유지 (false 반환)
   */
  async enableMic(): Promise<boolean> {
    if (!this.room) return false
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true)
      return true
    } catch {
      return false
    }
  }

  /** AudioContext autoplay 정책 대응 — 첫 사용자 제스처 시 호출 */
  resumeAudio(): void {
    this.spatial?.resumeContext()
  }

  /**
   * 매 프레임이 아닌 Realtime 위치 업데이트마다 호출.
   * Top-8: 가장 가까운 8명만 구독, 나머지 unsubscribe.
   */
  updatePeers(peers: Map<string, PeerAudioInfo>): void {
    if (!this.room || !this.spatial) return

    const sorted = [...peers.entries()].sort((a, b) => a[1].distM - b[1].distM)

    let subCount = 0
    for (const [identity, { distM, bearing }] of sorted) {
      const participant = [...this.room.remoteParticipants.values()].find(
        (p) => p.identity === identity,
      )
      if (!participant) continue

      const shouldSub = distM <= LEAVE_M && subCount < MAX_SUBS

      for (const pub of participant.audioTrackPublications.values()) {
        if (pub.isSubscribed !== shouldSub) pub.setSubscribed(shouldSub)
      }

      if (shouldSub) {
        this.spatial.updatePosition(identity, distM, bearing)
        subCount++
      } else {
        this.spatial.removeTrack(identity)
      }
    }
  }

  get connected(): boolean {
    return this.room?.state === 'connected'
  }
}

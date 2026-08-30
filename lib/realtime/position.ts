import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface PlayerPosition {
  userId: string
  lng: number
  lat: number
  bearing: number
}

export function createPositionChannel(
  sectorId: string,
  onPosition: (pos: PlayerPosition) => void,
): RealtimeChannel {
  const supabase = createClient()

  const channel = supabase.channel(`pos:${sectorId}`, {
    config: { broadcast: { self: false } },
  })

  channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
    onPosition(payload as PlayerPosition)
  })

  channel.subscribe()
  return channel
}

export async function broadcastPosition(
  channel: RealtimeChannel,
  pos: PlayerPosition,
) {
  await channel.send({ type: 'broadcast', event: 'pos', payload: pos })
}

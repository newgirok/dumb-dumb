import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface ChatMessage {
  userId: string
  text: string
}

export function createChatChannel(
  sectorId: string,
  onMessage: (msg: ChatMessage) => void,
): RealtimeChannel {
  const supabase = createClient()

  const channel = supabase.channel(`chat:${sectorId}`, {
    config: { broadcast: { self: true } },
  })

  channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
    onMessage(payload as ChatMessage)
  })

  channel.subscribe()
  return channel
}

export async function sendChat(channel: RealtimeChannel, msg: ChatMessage) {
  await channel.send({ type: 'broadcast', event: 'chat', payload: msg })
}

'use client'

import { useCallback, useRef } from 'react'
import { WorldCanvas } from '@/components/world/WorldCanvas'
import { Hud } from '@/components/hud'

export default function WorldPage() {
  const moveHandlerRef = useRef<((dx: number, dy: number) => void) | null>(null)
  const chatHandlerRef = useRef<((msg: string) => void) | null>(null)

  const registerMove = useCallback((fn: (dx: number, dy: number) => void) => {
    moveHandlerRef.current = fn
  }, [])

  const registerChat = useCallback((fn: (msg: string) => void) => {
    chatHandlerRef.current = fn
  }, [])

  const onMove = useCallback((dx: number, dy: number) => {
    moveHandlerRef.current?.(dx, dy)
  }, [])

  const onChat = useCallback((msg: string) => {
    chatHandlerRef.current?.(msg)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldCanvas
        onRegisterMoveHandler={registerMove}
        onRegisterChatHandler={registerChat}
      />
      <Hud onMove={onMove} onChat={onChat} />
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { DirectionPad } from './DirectionPad'
import { Joystick } from './Joystick'
import { ChatInput } from './ChatInput'

interface HudProps {
  onMove?: (dx: number, dy: number) => void
  onChat?: (message: string) => void
}

export function Hud({ onMove, onChat }: HudProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const handleMove = useCallback(
    (dx: number, dy: number) => onMove?.(dx, dy),
    [onMove],
  )

  const handleChat = useCallback(
    (message: string) => onChat?.(message),
    [onChat],
  )

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: 32, left: 32, pointerEvents: 'all' }}>
        {isMobile ? <Joystick onMove={handleMove} /> : <DirectionPad onMove={handleMove} />}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 320,
          pointerEvents: 'all',
        }}
      >
        <ChatInput onSend={handleChat} />
      </div>
    </div>
  )
}

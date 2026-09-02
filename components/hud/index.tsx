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
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute bottom-8 left-8 pointer-events-auto">
        {isMobile ? <Joystick onMove={handleMove} /> : <DirectionPad onMove={handleMove} />}
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80 pointer-events-auto">
        <ChatInput onSend={handleChat} />
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'

type Props = { onSend: (message: string) => void }

export function ChatInput({ onSend }: Props) {
  const [value, setValue] = useState('')

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="채팅 입력..."
        className="flex-1 py-2.5 px-3.5 rounded-lg border border-white/15 bg-black/40 backdrop-blur-[8px] text-white text-sm outline-none"
      />
      <button
        onClick={submit}
        className="py-2.5 px-4 rounded-lg border border-white/15 bg-black/40 backdrop-blur-[8px] text-white cursor-pointer text-sm whitespace-nowrap"
      >
        전송
      </button>
    </div>
  )
}

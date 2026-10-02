'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { unlockAudio } from '@/lib/audio/unlock'

/** 소리가 나는 화면으로 가는 링크 — 누르는 순간 오디오를 켜 두어 그 화면이 첫 탭을 기다리지 않고 소리를 낸다 */
export default function SoundLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        unlockAudio()
        onClick?.(e)
      }}
    />
  )
}

'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { unlockAudio } from '@/lib/audio/unlock'

/** 소리가 나는 화면으로 가는 링크 — 누르는 순간 오디오를 켜 두어 그 화면이 첫 탭을 기다리지 않고 소리를 낸다 */
export default function SoundLink({ onClick, onPointerDown, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      // 오디오 컨텍스트를 처음 만들 때 윈도 크롬은 오디오 장치를 여느라 메인 스레드가 70~90ms 막힌다 — 누르기 시작할 때
      // 만들어 두어, 클릭(이동·로더 표시)이 그만큼 늦지 않게 한다. iOS는 클릭 안에서 다시 켜야 열린다
      onPointerDown={(e) => {
        unlockAudio()
        onPointerDown?.(e)
      }}
      onClick={(e) => {
        unlockAudio()
        onClick?.(e)
      }}
    />
  )
}

'use client'

type Props = { onMove: (dx: number, dy: number) => void }

// row/col을 숫자 보간(`col-start-${col}`)이 아니라 리터럴 클래스로 직접 명시 —
// Tailwind는 빌드 시점에 소스를 문자열로 스캔하므로 보간된 클래스명은 생성되지 않음
const DIRS = [
  { label: '↑', dx: 0, dy: -1, pos: 'row-start-1 col-start-2' },
  { label: '←', dx: -1, dy: 0, pos: 'row-start-2 col-start-1' },
  { label: '↓', dx: 0, dy: 1, pos: 'row-start-2 col-start-2' },
  { label: '→', dx: 1, dy: 0, pos: 'row-start-2 col-start-3' },
] as const

export function DirectionPad({ onMove }: Props) {
  return (
    <div className="grid grid-cols-[repeat(3,44px)] grid-rows-[repeat(2,44px)] gap-1">
      {DIRS.map(({ label, dx, dy, pos }) => (
        <button
          key={label}
          onPointerDown={() => onMove(dx, dy)}
          onPointerUp={() => onMove(0, 0)}
          className={`${pos} bg-white/15 backdrop-blur-[4px] border border-white/20 rounded-lg text-white text-xl cursor-pointer flex items-center justify-center select-none`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

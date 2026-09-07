'use client'

interface Props {
  name: string
  previewUrl?: string
  selected?: boolean
  onClick?: () => void
}

export function AvatarCard({ name, previewUrl, selected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      style={{
        width: 120,
        height: 160,
        borderRadius: 12,
        cursor: 'pointer',
        border: selected ? '2px solid #4f8ef7' : '2px solid transparent',
        background: '#2a2a3e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'border-color 0.15s',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 80,
          height: 100,
          borderRadius: 8,
          background: previewUrl ? `url(${previewUrl}) center/cover` : '#3a3a5e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
        }}
      >
        {!previewUrl && name.charAt(0)}
      </div>
      <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{name}</span>
    </div>
  )
}

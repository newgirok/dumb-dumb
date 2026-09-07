'use client'

// 방향키(DirectionPad/Joystick)·채팅창(ChatInput) 화면 UI를 제거함 — 이동은 눈에
// 안 보여도 조작만 되면 되고(WorldCanvas 내부 키보드 리스너가 별도로 처리해서
// 이 UI 제거와 무관하게 계속 동작함), 채팅은 추후 "다른 캐릭터 클릭 → 팝업"
// 방식으로 다시 만들 예정이라 onMove/onChat 연결 인터페이스(HudProps, 상위의
// registerMove/registerChat 배선)는 그대로 남겨둠 — 나중에 새 UI에서 그대로 재사용
interface HudProps {
  onMove?: (dx: number, dy: number) => void
  onChat?: (message: string) => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Hud({ onMove, onChat }: HudProps) {
  return null
}

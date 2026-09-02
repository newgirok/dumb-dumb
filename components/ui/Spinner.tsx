// 기존엔 자체 spin 키프레임을 login 페이지 안에서만 정의해서 다른 곳에선 회전 안 하던
// 버그가 있었음 (사용처 자체가 없어서 지금까지 안 드러났음) — Tailwind 기본 animate-spin으로
// 교체하며 해결. 속도가 0.6s→1s(Tailwind 기본값)로 바뀌지만 사용처 0건이라 시각적 영향 없음.
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="rounded-full border-2 border-white/20 border-t-current animate-spin shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

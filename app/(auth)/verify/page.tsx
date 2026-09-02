export default function VerifyPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl mb-2">본인인증</h2>
        {/* 기존에도 흰 배경 위 흰 글씨(rgba(255,255,255,0.5))라 안 보이는 상태였음 —
            1:1 전환 원칙에 따라 그대로 유지, 발견 사항으로만 보고 */}
        <p className="text-white/50">Phase 5에서 구현 예정 (휴대폰 Pass 연동)</p>
      </div>
    </div>
  )
}

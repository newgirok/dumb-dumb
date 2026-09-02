'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function toE164(display: string): string {
  const d = display.replace(/\D/g, '')
  return d.startsWith('0') ? `+82${d.slice(1)}` : `+82${d}`
}

// components/ui/Spinner와는 시각적 설계가 달라(테두리 색 원 + 투명한 윗부분으로
// 회전하는 노치 방식) 공용 컴포넌트로 통합하지 않고 그대로 유지. color는 호출부마다
// 다른 임의의 값이 올 수 있어 인라인 유지, 나머지는 클래스. 페이지 전용
// @keyframes spin에 의존하던 걸 Tailwind 기본 animate-spin으로 교체(0.7s→1s로 속도
// 미세 변경, 짧은 로딩 표시라 체감 차이 없음)
function Spinner({ color = '#fff' }: { color?: string }) {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
      style={{ borderColor: color, borderTopColor: 'transparent' }}
    />
  )
}

const OAUTH_BTN =
  'flex items-center justify-center gap-2.5 w-full h-11 px-4 rounded-lg border border-[#e5e7eb] bg-white text-[#111] text-[0.9rem] font-semibold cursor-pointer font-display'
const FIELD =
  'w-full h-11 px-3.5 rounded-lg border border-[#e5e7eb] bg-white text-[#111] text-[0.9rem] font-display outline-none'
const PRIMARY_BTN =
  'w-full h-11 rounded-lg border-none bg-[#22c55e] text-white text-[0.9rem] font-bold cursor-pointer flex items-center justify-center gap-2 font-display'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep]       = useState<'main' | 'otp'>('main')
  const [email, setEmail]     = useState('')
  const [otp, setOtp]         = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]     = useState('')
  const [countdown, setCountdown] = useState(0)

  const startCountdown = () => {
    setCountdown(180)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  const sendOtp = async () => {
    setError('')
    if (!email.includes('@')) { setError('올바른 이메일 주소를 입력하세요.'); return }
    setLoading('email')
    const { error: e } = await supabase.auth.signInWithOtp({ email })
    setLoading(null)
    if (e) { setError('인증번호 발송에 실패했습니다.'); return }
    setStep('otp')
    startCountdown()
  }

  const verifyOtp = async () => {
    setError('')
    if (otp.length !== 6) { setError('6자리 인증번호를 입력하세요.'); return }
    setLoading('verify')
    const { error: e } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    setLoading(null)
    if (e) { setError('인증번호가 올바르지 않습니다.'); return }
    router.push('/world')
  }

  const signInOAuth = async (provider: 'kakao' | 'google') => {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <>
      <div className="h-[100svh] flex flex-col bg-white font-display">

        {/* ── 뒤로가기 ── */}
        <div className="absolute top-5 left-6 z-10">
          <Link href="/" className="flex items-center gap-1 text-sm text-[#6b7280] no-underline font-medium">
            ← 홈페이지
          </Link>
        </div>

        <div className="flex-1 flex overflow-hidden max-w-[1200px] mx-auto w-full">

          {/* ── 좌측 일러스트 (58%) ── */}
          <div className="hidden lg:flex w-[58%] bg-white items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustration-login.png"
              alt="오픈월드 일러스트"
              className="w-[72%] max-w-[560px] object-contain select-none pointer-events-none"
            />
          </div>

          {/* ── 우측 폼 (42%) ── */}
          <div className="flex-1 flex items-center justify-center py-8 px-6 overflow-y-auto bg-white">
            <div className="w-full max-w-[320px]">

              {step === 'main' && (
                <>
                  {/* 로고 */}
                  <div className="flex flex-col items-center mb-6">
                    <div className="flex items-center gap-1.5 mb-[1.125rem]">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-grass" />
                      <span className="text-[0.9rem] font-bold text-[#111] tracking-[-0.01em]">openworld</span>
                    </div>
                    <h1 className="text-[1.625rem] font-extrabold text-[#111] text-center mb-2.5 tracking-[-0.02em] leading-[1.2]">
                      오픈월드에 로그인
                    </h1>
                    <p className="text-sm text-[#6b7280] text-center leading-[1.6] m-0">
                      다시 오신 것을 환영합니다! 선호하는 방법을<br />사용하여 아래에서 로그인하시오.
                    </p>
                  </div>

                  {/* OAuth 버튼들 */}
                  <div className="flex flex-col gap-2 mb-4">
                    <button
                      onClick={() => signInOAuth('kakao')}
                      disabled={!!loading}
                      className={`${OAUTH_BTN} ${loading === 'kakao' ? 'opacity-60' : 'opacity-100'}`}
                    >
                      {loading === 'kakao' ? <Spinner color="#111" /> : <><KakaoIcon /> 카카오(으)로 로그인</>}
                    </button>

                    <button
                      onClick={() => signInOAuth('google')}
                      disabled={!!loading}
                      className={`${OAUTH_BTN} ${loading === 'google' ? 'opacity-60' : 'opacity-100'}`}
                    >
                      {loading === 'google' ? <Spinner color="#555" /> : <><GoogleIcon /> Google(으)로 로그인</>}
                    </button>
                  </div>

                  {/* 또는 (줄 없음) */}
                  <p className="text-center text-sm text-[#9ca3af] mt-0 mb-4 mx-0 font-medium">
                    또는
                  </p>

                  {/* 이메일 입력 + 버튼 */}
                  <div className="flex flex-col gap-2">
                    <input
                      type="email"
                      inputMode="email"
                      placeholder="이메일을 입력하세요"
                      value={email}
                      autoFocus
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendOtp()}
                      className={FIELD}
                    />
                    {error && <p className="text-[0.8rem] text-[#dc2626] m-0">{error}</p>}
                    <button
                      onClick={sendOtp}
                      disabled={!!loading}
                      className={`${PRIMARY_BTN} ${loading === 'email' ? 'opacity-60' : 'opacity-100'}`}
                    >
                      {loading === 'email' ? <Spinner /> : '이메일로 로그인'}
                    </button>
                  </div>

                  {/* 하단 링크들 */}
                  <div className="flex flex-col items-center gap-1.5 mt-4">
                    <span className="text-[0.85rem] text-[#3b82f6] cursor-pointer font-medium">
                      또는 비밀번호로 로그인
                    </span>
                    <span className="text-[0.85rem] text-[#6b7280] font-medium">
                      계정이 없나요?{' '}
                      <span className="text-[#3b82f6] cursor-pointer">만들기</span>
                    </span>
                  </div>
                </>
              )}

              {step === 'otp' && (
                <>
                  <div className="flex flex-col items-center mb-6">
                    <div className="flex items-center gap-1.5 mb-[1.125rem]">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-grass" />
                      <span className="text-[0.9rem] font-bold text-[#111]">openworld</span>
                    </div>
                    <h1 className="text-[1.625rem] font-extrabold text-[#111] text-center mb-2.5 tracking-[-0.02em]">
                      인증번호 입력
                    </h1>
                    <p className="text-sm text-[#6b7280] text-center leading-[1.6] m-0">
                      <span className="font-bold text-[#111]">{email}</span>으로<br />발송된 인증번호를 입력하세요.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="인증번호 6자리"
                        value={otp}
                        autoFocus
                        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                        className="w-full h-11 pr-12 pl-3.5 rounded-lg border border-[#e5e7eb] text-center tracking-[0.4em] text-lg font-mono text-[#111] bg-white outline-none"
                      />
                      {countdown > 0 && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.8rem] text-[#ef4444] font-mono font-bold">
                          {mm}:{ss}
                        </span>
                      )}
                    </div>
                    {error && <p className="text-[0.8rem] text-[#dc2626] m-0">{error}</p>}
                    <button
                      onClick={verifyOtp}
                      disabled={loading === 'verify' || otp.length !== 6}
                      className={`w-full h-11 rounded-lg border-none bg-[#22c55e] text-white text-[0.9rem] font-bold cursor-pointer flex items-center justify-center font-display ${
                        loading === 'verify' || otp.length !== 6 ? 'opacity-45' : 'opacity-100'
                      }`}
                    >
                      {loading === 'verify' ? <Spinner /> : '확인'}
                    </button>
                    <button
                      onClick={() => { setStep('main'); setOtp(''); setError('') }}
                      className="bg-transparent border-none cursor-pointer text-[0.85rem] text-[#3b82f6] font-display font-medium p-1 text-center"
                    >
                      이메일 다시 입력하기
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#111">
      <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.7 1.68 5.07 4.2 6.48L5.1 21l4.56-2.52c.75.12 1.53.18 2.34.18 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

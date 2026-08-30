'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

function toE164(display: string): string {
  const d = display.replace(/\D/g, '')
  return d.startsWith('0') ? `+82${d.slice(1)}` : `+82${d}`
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span className={`inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${dark ? 'border-gray-900' : 'border-white'}`} />
  )
}

// ── 휴대폰 인증 (메인) ────────────────────────────────────────────────────────
function PhoneSection() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<'input' | 'otp'>('input')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const startCountdown = () => {
    setCountdown(180)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  const sendOtp = async () => {
    setError('')
    if (phone.replace(/\D/g, '').length < 10) { setError('올바른 휴대폰 번호를 입력하세요.'); return }
    setLoading(true)
    const { error: e } = await supabase.auth.signInWithOtp({ phone: toE164(phone) })
    setLoading(false)
    if (e) { setError('인증번호 발송에 실패했습니다.'); return }
    setStep('otp')
    startCountdown()
  }

  const verifyOtp = async () => {
    setError('')
    if (otp.length !== 6) { setError('6자리 인증번호를 입력하세요.'); return }
    setLoading(true)
    const { error: e } = await supabase.auth.verifyOtp({ phone: toE164(phone), token: otp, type: 'sms' })
    setLoading(false)
    if (e) { setError('인증번호가 올바르지 않습니다.'); return }
    router.push('/world')
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  if (step === 'otp') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-white/50 mb-1">{phone}</p>
          <p className="text-sm text-white/70">로 발송된 인증번호를 입력하세요.</p>
        </div>
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
            className="w-full px-4 py-4 rounded-xl border border-white/10 bg-white/5 text-white text-lg text-center tracking-[0.4em] placeholder:text-white/20 placeholder:tracking-normal outline-none focus:border-white/30 transition-colors"
          />
          {countdown > 0 && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-red-400 tabular-nums">
              {mm}:{ss}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={verifyOtp}
          disabled={loading || otp.length !== 6}
          className="w-full py-4 rounded-xl bg-white text-gray-900 font-semibold text-base disabled:opacity-40 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Spinner dark /> : '확인'}
        </button>
        <button
          onClick={() => { setStep('input'); setOtp(''); setError('') }}
          className="text-sm text-white/40 hover:text-white/70 transition-colors text-center"
        >
          번호 다시 입력
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <input
          type="tel"
          inputMode="numeric"
          placeholder="휴대폰 번호"
          value={phone}
          autoFocus
          onChange={e => setPhone(formatPhone(e.target.value))}
          onKeyDown={e => e.key === 'Enter' && sendOtp()}
          className="w-full px-4 py-4 rounded-xl border border-white/10 bg-white/5 text-white text-base placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={sendOtp}
        disabled={loading}
        className="w-full py-4 rounded-xl bg-white text-gray-900 font-semibold text-base disabled:opacity-40 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
      >
        {loading ? <Spinner dark /> : '인증번호 받기'}
      </button>
    </div>
  )
}

// ── 소셜 로그인 (보조) ────────────────────────────────────────────────────────
function OAuthSection() {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  const signIn = async (provider: 'kakao' | 'google') => {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        disabled={!!loading}
        onClick={() => signIn('kakao')}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ background: '#FEE500', color: '#191919' }}
      >
        {loading === 'kakao' ? <Spinner /> : (
          <>
            <KakaoIcon />
            카카오로 계속하기
          </>
        )}
      </button>
      <button
        disabled={!!loading}
        onClick={() => signIn('google')}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold bg-white text-gray-900 transition-opacity disabled:opacity-60 hover:bg-gray-100"
      >
        {loading === 'google' ? <Spinner dark /> : (
          <>
            <GoogleIcon />
            Google로 계속하기
          </>
        )}
      </button>
    </div>
  )
}

// ── 아이콘 ────────────────────────────────────────────────────────────────────
function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#191919">
      <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.7 1.68 5.07 4.2 6.48L5.1 21l4.56-2.52c.75.12 1.53.18 2.34.18 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [showOAuth, setShowOAuth] = useState(false)

  return (
    <div className="flex h-screen bg-black">
      {/* 좌측 브랜드 패널 (lg 이상) */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.03)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="text-3xl">🌍</span>
          <span className="text-xl font-bold tracking-tight">오픈월드</span>
        </div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold leading-tight mb-4">
            실시간으로 만나는<br />나만의 오픈월드
          </h2>
          <p className="text-white/40 text-sm leading-relaxed">
            쿼터뷰 맵을 걸어다니며 주변 사람들과<br />
            공간 음성으로 자연스럽게 대화하세요.
          </p>
        </div>
      </div>

      {/* 우측 폼 */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* 모바일 브랜드 */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <span className="text-2xl">🌍</span>
            <span className="text-lg font-bold">오픈월드</span>
          </div>

          <h1 className="text-2xl font-bold mb-1">
            {showOAuth ? '소셜 계정으로 시작' : '휴대폰 번호로 시작'}
          </h1>
          <p className="text-sm text-white/40 mb-8">
            {showOAuth ? '사용 중인 소셜 계정으로 바로 시작하세요.' : '번호를 입력하면 인증번호를 보내드려요.'}
          </p>

          {/* 메인 폼 */}
          {showOAuth ? <OAuthSection /> : <PhoneSection />}

          {/* 구분선 */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">또는</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* 전환 버튼 */}
          <button
            onClick={() => setShowOAuth(v => !v)}
            className="w-full py-3.5 rounded-xl border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 hover:text-white/80 transition-all"
          >
            {showOAuth ? '휴대폰 번호로 시작하기' : 'OAuth 2.0으로 계속하기'}
          </button>

          <p className="text-xs text-white/20 text-center mt-6 leading-relaxed">
            계속 진행하면 <span className="text-white/40">서비스 이용약관</span> 및{' '}
            <span className="text-white/40">개인정보처리방침</span>에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ── 타입 ──────────────────────────────────────────────────────────────────────
type Tab = 'social' | 'phone'
type PhoneStep = 'input' | 'otp'

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

// ── 소셜 탭 ──────────────────────────────────────────────────────────────────
function SocialTab() {
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
        className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
        style={{ background: '#FEE500', color: '#191919' }}
      >
        {loading === 'kakao' ? <Spinner /> : '카카오로 시작하기'}
      </button>
      <button
        disabled={!!loading}
        onClick={() => signIn('google')}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-semibold bg-white text-gray-900 transition-opacity disabled:opacity-60 hover:bg-gray-100"
      >
        {loading === 'google' ? <Spinner dark /> : 'Google로 시작하기'}
      </button>
      <p className="text-center text-xs text-white/40 mt-1">
        소셜 계정으로 간편하게 시작하세요
      </p>
    </div>
  )
}

// ── 휴대폰 OTP 탭 ─────────────────────────────────────────────────────────────
function PhoneTab() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<PhoneStep>('input')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const startCountdown = () => {
    setCountdown(180)
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const sendOtp = async () => {
    setError('')
    if (phone.replace(/\D/g, '').length < 10) {
      setError('올바른 휴대폰 번호를 입력하세요.')
      return
    }
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
    const { error: e } = await supabase.auth.verifyOtp({
      phone: toE164(phone), token: otp, type: 'sms',
    })
    setLoading(false)
    if (e) { setError('인증번호가 올바르지 않습니다.'); return }
    router.push('/world')
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <div className="flex flex-col gap-3">
      {step === 'input' ? (
        <div className="flex gap-2">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="010-0000-0000"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && sendOtp()}
            className="flex-1 px-3 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-sm placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
          />
          <button
            onClick={sendOtp}
            disabled={loading}
            className="px-4 py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold shrink-0 disabled:opacity-60 hover:bg-gray-100 transition-colors"
          >
            {loading ? <Spinner dark /> : '발송'}
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-white/50">{phone}으로 발송된 6자리 번호를 입력하세요.</p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && verifyOtp()}
              className="flex-1 px-3 py-3 rounded-lg border border-white/10 bg-white/5 text-white text-sm text-center tracking-widest placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
            />
            <span className={`text-sm shrink-0 tabular-nums ${countdown > 0 ? 'text-red-400' : 'text-white/20'}`}>
              {countdown > 0 ? `${mm}:${ss}` : '만료'}
            </span>
          </div>
          <button
            onClick={verifyOtp}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-white text-gray-900 text-sm font-semibold disabled:opacity-60 hover:bg-gray-100 transition-colors"
          >
            {loading ? <Spinner dark /> : '인증 확인'}
          </button>
          <button
            onClick={() => { setStep('input'); setOtp(''); setError('') }}
            className="text-xs text-white/30 hover:text-white/60 transition-colors text-center"
          >
            번호 다시 입력
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}

// ── 스피너 ────────────────────────────────────────────────────────────────────
function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${dark ? 'border-gray-900' : 'border-white'}`}
    />
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('social')

  return (
    <div className="flex h-screen bg-black">
      {/* 좌측 패널 (lg 이상) */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.03)_0%,transparent_60%)]" />

        {/* 브랜드 */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌍</span>
            <span className="text-xl font-bold tracking-tight">오픈월드</span>
          </div>
        </div>

        {/* 설명 */}
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

      {/* 우측 패널 (로그인 폼) */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* 모바일 브랜드 */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <span className="text-2xl">🌍</span>
            <span className="text-lg font-bold">오픈월드</span>
          </div>

          <h1 className="text-2xl font-bold mb-1">시작하기</h1>
          <p className="text-sm text-white/40 mb-8">계정을 선택하거나 휴대폰으로 가입하세요.</p>

          {/* 탭 */}
          <div className="flex mb-6 border border-white/10 rounded-lg overflow-hidden">
            {(['social', 'phone'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t === 'social' ? '소셜 로그인' : '휴대폰 인증'}
              </button>
            ))}
          </div>

          {tab === 'social' ? <SocialTab /> : <PhoneTab />}
        </div>
      </div>
    </div>
  )
}

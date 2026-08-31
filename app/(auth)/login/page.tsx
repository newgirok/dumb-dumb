'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function toE164(display: string): string {
  const d = display.replace(/\D/g, '')
  return d.startsWith('0') ? `+82${d.slice(1)}` : `+82${d}`
}

function Spinner({ color = '#fff' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: '1rem', height: '1rem',
      borderRadius: '50%', border: `2px solid ${color}`,
      borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ height: '100svh', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'var(--font-display)' }}>

        {/* ── 뒤로가기 ── */}
        <div style={{ position: 'absolute', top: '1.25rem', left: '1.5rem', zIndex: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: '#6b7280', textDecoration: 'none', fontWeight: 500 }}>
            ← 홈페이지
          </Link>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>

          {/* ── 좌측 일러스트 (58%) ── */}
          <div
            className="hidden lg:flex"
            style={{ width: '58%', background: '#fff', alignItems: 'center', justifyContent: 'center' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustration-login.png"
              alt="오픈월드 일러스트"
              style={{ width: '72%', maxWidth: '560px', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
            />
          </div>

          {/* ── 우측 폼 (42%) ── */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto', background: '#fff' }}>
            <div style={{ width: '100%', maxWidth: '320px' }}>

              {step === 'main' && (
                <>
                  {/* 로고 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '1.125rem' }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-grass)' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111', letterSpacing: '-0.01em' }}>openworld</span>
                    </div>
                    <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#111', textAlign: 'center', marginBottom: '0.625rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                      오픈월드에 로그인
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                      다시 오신 것을 환영합니다! 선호하는 방법을<br />사용하여 아래에서 로그인하시오.
                    </p>
                  </div>

                  {/* OAuth 버튼들 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      onClick={() => signInOAuth('kakao')}
                      disabled={!!loading}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                        width: '100%', height: '44px', padding: '0 1rem',
                        borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: '#fff',
                        color: '#111', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                        opacity: loading === 'kakao' ? 0.6 : 1, fontFamily: 'var(--font-display)',
                      }}
                    >
                      {loading === 'kakao' ? <Spinner color="#111" /> : <><KakaoIcon /> 카카오(으)로 로그인</>}
                    </button>

                    <button
                      onClick={() => signInOAuth('google')}
                      disabled={!!loading}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                        width: '100%', height: '44px', padding: '0 1rem',
                        borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: '#fff',
                        color: '#111', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                        opacity: loading === 'google' ? 0.6 : 1, fontFamily: 'var(--font-display)',
                      }}
                    >
                      {loading === 'google' ? <Spinner color="#555" /> : <><GoogleIcon /> Google(으)로 로그인</>}
                    </button>
                  </div>

                  {/* 또는 (줄 없음) */}
                  <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af', margin: '0 0 1rem', fontWeight: 500 }}>
                    또는
                  </p>

                  {/* 이메일 입력 + 버튼 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="email"
                      inputMode="email"
                      placeholder="이메일을 입력하세요"
                      value={email}
                      autoFocus
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendOtp()}
                      style={{
                        width: '100%', height: '44px', padding: '0 0.875rem',
                        borderRadius: '0.5rem', border: '1px solid #e5e7eb',
                        background: '#fff', color: '#111', fontSize: '0.9rem',
                        fontFamily: 'var(--font-display)', outline: 'none',
                      }}
                    />
                    {error && <p style={{ fontSize: '0.8rem', color: '#dc2626', margin: 0 }}>{error}</p>}
                    <button
                      onClick={sendOtp}
                      disabled={!!loading}
                      style={{
                        width: '100%', height: '44px',
                        borderRadius: '0.5rem', border: 'none',
                        background: '#22c55e', color: '#fff',
                        fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        opacity: loading === 'email' ? 0.6 : 1, fontFamily: 'var(--font-display)',
                      }}
                    >
                      {loading === 'email' ? <Spinner /> : '이메일로 로그인'}
                    </button>
                  </div>

                  {/* 하단 링크들 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', marginTop: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }}>
                      또는 비밀번호로 로그인
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 500 }}>
                      계정이 없나요?{' '}
                      <span style={{ color: '#3b82f6', cursor: 'pointer' }}>만들기</span>
                    </span>
                  </div>
                </>
              )}

              {step === 'otp' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '1.125rem' }}>
                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-grass)' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111' }}>openworld</span>
                    </div>
                    <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#111', textAlign: 'center', marginBottom: '0.625rem', letterSpacing: '-0.02em' }}>
                      인증번호 입력
                    </h1>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
                      <span style={{ fontWeight: 700, color: '#111' }}>{email}</span>으로<br />발송된 인증번호를 입력하세요.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="인증번호 6자리"
                        value={otp}
                        autoFocus
                        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={e => e.key === 'Enter' && verifyOtp()}
                        style={{
                          width: '100%', height: '44px', padding: '0 3rem 0 0.875rem',
                          borderRadius: '0.5rem', border: '1px solid #e5e7eb',
                          textAlign: 'center', letterSpacing: '0.4em',
                          fontSize: '1.125rem', fontFamily: 'var(--font-mono)',
                          color: '#111', background: '#fff', outline: 'none',
                        }}
                      />
                      {countdown > 0 && (
                        <span style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#ef4444', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {mm}:{ss}
                        </span>
                      )}
                    </div>
                    {error && <p style={{ fontSize: '0.8rem', color: '#dc2626', margin: 0 }}>{error}</p>}
                    <button
                      onClick={verifyOtp}
                      disabled={loading === 'verify' || otp.length !== 6}
                      style={{
                        width: '100%', height: '44px',
                        borderRadius: '0.5rem', border: 'none',
                        background: '#22c55e', color: '#fff',
                        fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: (loading === 'verify' || otp.length !== 6) ? 0.45 : 1,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {loading === 'verify' ? <Spinner /> : '확인'}
                    </button>
                    <button
                      onClick={() => { setStep('main'); setOtp(''); setError('') }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#3b82f6', fontFamily: 'var(--font-display)', fontWeight: 500, padding: '0.25rem', textAlign: 'center' }}
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

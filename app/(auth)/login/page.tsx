'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'

// ── 타입 ──────────────────────────────────────────────────────────────────────
type OAuthProvider = 'google' | 'kakao'
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

// ── 소셜 로그인 ───────────────────────────────────────────────────────────────
const SOCIAL_PROVIDERS: { id: OAuthProvider; label: string; bg: string; color: string }[] = [
  { id: 'kakao', label: '카카오로 시작하기', bg: '#FEE500', color: '#191919' },
  { id: 'google', label: 'Google로 시작하기', bg: '#fff', color: '#333' },
]

function SocialTab() {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  const signIn = async (provider: OAuthProvider) => {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {SOCIAL_PROVIDERS.map(({ id, label, bg, color }) => (
        <button
          key={id}
          disabled={loading !== null}
          onClick={() => signIn(id)}
          style={{ ...btn, background: bg, color, opacity: loading ? 0.7 : 1 }}
        >
          {loading === id ? <Spinner size={18} /> : label}
        </button>
      ))}
    </div>
  )
}

// ── 휴대폰 OTP ────────────────────────────────────────────────────────────────
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
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const sendOtp = async () => {
    setError('')
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { setError('올바른 휴대폰 번호를 입력하세요.'); return }

    setLoading(true)
    const { error: e } = await supabase.auth.signInWithOtp({ phone: toE164(phone) })
    setLoading(false)

    if (e) { setError('인증번호 발송에 실패했습니다. SMS 설정을 확인하세요.'); return }
    setStep('otp')
    startCountdown()
  }

  const verifyOtp = async () => {
    setError('')
    if (otp.length !== 6) { setError('6자리 인증번호를 입력하세요.'); return }

    setLoading(true)
    const { error: e } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token: otp,
      type: 'sms',
    })
    setLoading(false)

    if (e) { setError('인증번호가 올바르지 않습니다.'); return }
    router.push('/world')
  }

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {step === 'input' ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
              style={input}
            />
            <button
              onClick={sendOtp}
              disabled={loading}
              style={{ ...btn, width: 'auto', padding: '0 16px', background: '#4f8ef7', color: '#fff', flexShrink: 0 }}
            >
              {loading ? <Spinner size={16} /> : '발송'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
            {phone}으로 발송된 6자리 번호를 입력하세요.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
              style={{ ...input, letterSpacing: 6, textAlign: 'center' }}
            />
            <span style={{ color: countdown > 0 ? '#f74f4f' : 'rgba(255,255,255,0.3)', fontSize: 14, alignSelf: 'center', flexShrink: 0 }}>
              {countdown > 0 ? `${mm}:${ss}` : '만료'}
            </span>
          </div>
          <button onClick={verifyOtp} disabled={loading} style={{ ...btn, background: '#4f8ef7', color: '#fff' }}>
            {loading ? <Spinner size={18} /> : '인증 확인'}
          </button>
          <button
            onClick={() => { setStep('input'); setOtp(''); setError('') }}
            style={{ ...btn, background: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'none', fontSize: 13 }}
          >
            번호 다시 입력
          </button>
        </>
      )}

      {error && (
        <p style={{ color: '#f74f4f', fontSize: 13, margin: 0, textAlign: 'center' }}>{error}</p>
      )}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('social')

  return (
    <div style={container}>
      <div style={card}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🌍</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 24 }}>오픈월드</h1>

        {/* 탭 */}
        <div style={{ display: 'flex', width: '100%', marginBottom: 24, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['social', 'phone'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: tab === t ? '#4f8ef7' : 'transparent',
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'background 0.15s',
              }}
            >
              {t === 'social' ? '소셜 로그인' : '휴대폰 인증'}
            </button>
          ))}
        </div>

        {tab === 'social' ? <SocialTab /> : <PhoneTab />}
      </div>
    </div>
  )
}

// ── 스타일 상수 ───────────────────────────────────────────────────────────────
const container: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', background: '#0d0d1a', padding: 16,
}
const card: React.CSSProperties = {
  background: '#1e1e2e', borderRadius: 16, padding: 36,
  width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
}
const btn: React.CSSProperties = {
  width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
  fontSize: 15, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'opacity 0.15s',
}
const input: React.CSSProperties = {
  flex: 1, padding: '12px 14px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15,
  outline: 'none', width: '100%',
}

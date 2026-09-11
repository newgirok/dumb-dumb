'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { login, register } from '@/lib/auth/session'

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

const FIELD =
  'w-full h-11 px-3.5 rounded-lg border border-[#e5e7eb] bg-white text-[#111] text-[0.9rem] font-display outline-none'
const PRIMARY_BTN =
  'w-full h-11 rounded-lg border-none bg-[#22c55e] text-white text-[0.9rem] font-bold cursor-pointer flex items-center justify-center gap-2 font-display'

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode]       = useState<'login' | 'register'>('login')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]     = useState('')

  const submit = async () => {
    setError('')
    if (!email.includes('@')) { setError('올바른 이메일 주소를 입력하세요.'); return }
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (mode === 'register' && nickname.trim().length < 2) {
      setError('닉네임은 2자 이상이어야 합니다.'); return
    }

    setLoading('submit')
    try {
      if (mode === 'register') {
        await register({ email, password, nickname: nickname.trim() })
      } else {
        await login(email, password)
      }
      // 미들웨어가 세션 쿠키를 보고 판단하므로 서버 쪽 상태를 새로 읽어야 한다
      router.refresh()
      router.push('/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.')
    } finally {
      setLoading(null)
    }
  }

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

              {/* 로고 */}
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-1.5 mb-[1.125rem]">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-grass" />
                  <span className="text-[0.9rem] font-bold text-[#111] tracking-[-0.01em]">openworld</span>
                </div>
                <h1 className="text-[1.625rem] font-extrabold text-[#111] text-center mb-2.5 tracking-[-0.02em] leading-[1.2]">
                  {mode === 'login' ? '오픈월드에 로그인' : '오픈월드 시작하기'}
                </h1>
                <p className="text-sm text-[#6b7280] text-center leading-[1.6] m-0">
                  {mode === 'login'
                    ? <>다시 오신 것을 환영합니다!<br />이메일과 비밀번호로 로그인하세요.</>
                    : <>계정을 만들고<br />바로 월드에 입장하세요.</>}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="이메일"
                  value={email}
                  autoFocus
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className={FIELD}
                />
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="비밀번호 (8자 이상)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  className={FIELD}
                />
                {mode === 'register' && (
                  <input
                    type="text"
                    maxLength={32}
                    placeholder="닉네임"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className={FIELD}
                  />
                )}

                {error && <p className="text-[0.8rem] text-[#dc2626] m-0">{error}</p>}

                <button
                  onClick={submit}
                  disabled={!!loading}
                  className={`${PRIMARY_BTN} ${loading ? 'opacity-60' : 'opacity-100'}`}
                >
                  {loading ? <Spinner /> : mode === 'login' ? '로그인' : '가입하고 시작하기'}
                </button>
              </div>

              <div className="flex flex-col items-center gap-1.5 mt-4">
                <span className="text-[0.85rem] text-[#6b7280] font-medium">
                  {mode === 'login' ? '계정이 없나요? ' : '이미 계정이 있나요? '}
                  <button
                    type="button"
                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
                    className="text-[#3b82f6] cursor-pointer bg-transparent border-none p-0 font-medium font-display text-[0.85rem]"
                  >
                    {mode === 'login' ? '만들기' : '로그인'}
                  </button>
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  )
}



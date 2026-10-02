'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TALK } from '@/shared/relay/contract'
import type { Talk, TalkSlot } from '@/lib/realtime/talk'

/** 빠른 문구 — 누르면 바로 보낸다 */
const QUICK = ['안녕하세요', '반가워요', '어디 가는 길이에요?', '좋은 하루 보내요']

const CSS = `
  .tk-layer { position: absolute; inset: 0; pointer-events: none; font-family: Pretendard, sans-serif; color: #5d5a57; }
  .tk-layer button { font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tk-layer button:focus-visible { outline: 3px solid #5d5a57; outline-offset: 2px; }

  /* 머리 위 자리 — talk.frame()이 매 프레임 translate3d로 옮긴다 */
  .tk-anchor { position: absolute; left: 0; top: 0; visibility: hidden; will-change: transform; }
  .tk-over { position: absolute; left: 0; bottom: 0; transform: translateX(-50%); white-space: nowrap; }

  .tk-prompt { pointer-events: auto; display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px 5px 5px; border-radius: 999px;
    background: #f9efdc; color: #5d5a57; font-size: 14px; font-weight: 600; box-shadow: 2px 2px 0 0 #716c66;
    animation: tk-pop 0.3s cubic-bezier(0.33, 1, 0.68, 1); transition: transform 0.15s; }
  @media (hover: hover) { .tk-prompt:not(:disabled):hover { transform: scale(1.06); } }
  .tk-prompt:not(:disabled):active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-prompt:disabled { cursor: default; color: #8d8981; }
  .tk-bang { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #e2674f; color: #fff; font-size: 14px; font-weight: 800; }
  .tk-prompt:disabled .tk-bang { background: #b8b0a3; animation: tk-wait 1.2s ease-in-out infinite; }
  /* 버튼 상대 표시 — 말 걸 수 있는(4m 안, 화면에 보이는) 가장 가까운 사람 머리 위의 작은 말풍선. 누르면 카드가 열린다 */
  .tk-hint { pointer-events: auto; display: inline-flex; align-items: center; gap: 4px; padding: 5px 7px; border-radius: 999px; background: #f9efdc; color: #716c66;
    box-shadow: 2px 2px 0 0 #716c66; animation: tk-pop 0.3s cubic-bezier(0.33, 1, 0.68, 1); transition: transform 0.15s; }
  @media (hover: hover) { .tk-hint:hover { transform: scale(1.08); } }
  .tk-hint:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-ico { display: block; flex: none; }
  /* 카드 — 누른 사람 머리 위. 지금은 [말 걸기] 하나이고, 나중 버튼(인사·친구·차단)도 같은 줄에 붙는다 */
  .tk-pcard { pointer-events: auto; display: flex; gap: 6px; padding: 6px; border-radius: 14px; background: #f9efdc; box-shadow: 3px 3px 0 0 #716c66;
    animation: tk-pop 0.25s cubic-bezier(0.33, 1, 0.68, 1); }
  .tk-act { --tk-ico-line: #716c66; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; background: #716c66;
    color: #fbf3df; font-size: 14px; font-weight: 600; box-shadow: 2px 2px 0 0 #4a4744; transition: transform 0.15s; }
  .tk-act:not(:disabled):active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-act:disabled { --tk-ico-line: #ece3d3; cursor: default; background: #ece3d3; color: #8d8981; box-shadow: none; }
  .tk-key { padding: 0 6px; border: 1px solid #b8b0a3; border-radius: 4px; font: 600 11px/18px Pretendard, sans-serif; color: #8d8981; }
  @media (pointer: coarse) { .tk-key { display: none; } }

  .tk-mark { display: grid; place-items: center; width: 28px; height: 28px; margin-bottom: 4px; border-radius: 50%; background: #e2674f; color: #fff;
    font-size: 16px; font-weight: 800; box-shadow: 2px 2px 0 0 #716c66; animation: tk-bob 1s ease-in-out infinite; }

  .tk-bubble { width: max-content; max-width: min(240px, 60vw); margin-bottom: 4px; padding: 8px 12px; border-radius: 14px; background: #fffdf8; color: #4a4744;
    font-size: 14px; line-height: 1.4; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; box-shadow: 2px 2px 0 0 #716c66;
    animation: tk-bubble ${7000}ms ease forwards; }
  .tk-bubble.tk-mine { background: #f9efdc; }

  /* 받은 요청 */
  .tk-card { pointer-events: auto; position: absolute; top: 18px; left: 50%; transform: translateX(-50%); width: min(340px, calc(100vw - 32px));
    padding: 14px 16px 16px; border-radius: 12px; background: #f9efdc; box-shadow: 3px 3px 0 0 #716c66; text-align: center; overflow: hidden;
    animation: tk-drop 0.3s cubic-bezier(0.33, 1, 0.68, 1); }
  .tk-card-title { font-family: Stylish, sans-serif; font-size: 21px; line-height: 1.2; }
  .tk-card-actions { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
  .tk-btn { min-width: 92px; padding: 8px 14px; border-radius: 999px; background: #fffdf8; color: #5d5a57; font-size: 15px; font-weight: 600;
    box-shadow: 2px 2px 0 0 #716c66; transition: transform 0.15s; }
  .tk-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-yes { background: #716c66; color: #fbf3df; }
  .tk-timer { position: absolute; left: 0; bottom: 0; width: 100%; height: 4px; background: #c9b99c; transform-origin: left; animation: tk-timer linear forwards; }
  /* 좁은 화면은 오른쪽 위 HUD 버튼과 겹치지 않게 아래(엄지가 닿는 자리)에 띄운다 */
  @media (max-width: 639px) {
    .tk-card { top: auto; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto; transform: none; animation-name: tk-rise; }
  }
  /* 좁고 낮은 화면(휴대폰 가로)은 아래 가득 펼치면 오른쪽 HUD 버튼 줄을 덮는다 — 가운데에 HUD 폭만큼 비켜 띄운다 */
  @media (max-width: 639px) and (max-height: 560px) {
    .tk-card { left: 0; right: 0; margin: 0 auto; width: min(340px, calc(100vw - 144px)); }
  }

  /* 대화 창 — 게임 채팅 관례대로 왼쪽 아래(오른쪽 위 HUD의 반대편)에 두고, 세로로 긴 좁은 화면만 아래를 가득 채운다.
     낮은 화면(휴대폰 가로·낮은 창)도 같은 왼쪽 아래에서 높이만 화면에 맞춘다 */
  .tk-panel { pointer-events: auto; position: absolute; left: calc(20px + env(safe-area-inset-left)); bottom: calc(20px + env(safe-area-inset-bottom));
    width: 340px; max-height: min(46vh, 420px); max-height: min(46dvh, 420px);
    display: flex; flex-direction: column; border-radius: 14px; background: #f9efdc; box-shadow: 3px 3px 0 0 #716c66; overflow: hidden;
    animation: tk-rise 0.25s cubic-bezier(0.33, 1, 0.68, 1); }
  @media (max-width: 639px) {
    .tk-panel { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto; max-height: 44vh; max-height: 44dvh; }
  }
  @media (max-height: 560px) {
    .tk-panel { left: calc(12px + env(safe-area-inset-left)); right: auto; bottom: calc(12px + env(safe-area-inset-bottom)); width: min(340px, calc(100vw - 96px));
      max-height: min(420px, calc(100vh - 24px)); max-height: min(420px, calc(100dvh - 24px - env(safe-area-inset-bottom))); }
  }
  .tk-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 10px 8px 14px; }
  .tk-title { font-family: Stylish, sans-serif; font-size: 19px; }
  .tk-far { color: #c4553f; }
  .tk-close { width: 30px; height: 30px; border-radius: 7px; background: #fffdf8; color: #5d5a57; font-size: 20px; line-height: 1; box-shadow: 2px 2px 0 0 #716c66; }
  .tk-close:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-log-wrap { position: relative; flex: 1; min-height: 48px; display: flex; flex-direction: column; }
  /* 새 메시지 — 위로 올려 읽는 중에 새 글이 오면 로그 아래 가운데에 뜬다. 누르면 맨 아래로 내려가고 사라진다 */
  .tk-jump { position: absolute; left: 0; right: 0; bottom: 8px; width: fit-content; margin: 0 auto; display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px 5px 10px; border-radius: 999px; background: #716c66; color: #fbf3df; font-size: 12.5px; font-weight: 600; white-space: nowrap;
    box-shadow: 2px 2px 0 0 #4a4744; animation: tk-pop 0.2s cubic-bezier(0.33, 1, 0.68, 1); }
  .tk-jump:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; padding: 4px 12px 8px;
    scrollbar-width: thin; scrollbar-color: rgba(113, 108, 102, 0.35) transparent; }
  .tk-log:hover { scrollbar-color: rgba(113, 108, 102, 0.6) transparent; }
  /* 스크롤바 — 메신저처럼 화살표 없이 얇고 둥근 막대, 마우스를 올리면 조금 진해진다. 크롬·사파리는 ::-webkit-scrollbar로 그린다
     (표준 scrollbar-* 값을 두면 크롬이 이 규칙을 버리고 윈도우에서 위아래 화살표가 남으므로 auto로 되돌린다). 파이어폭스는 위 표준 값 */
  @supports selector(::-webkit-scrollbar) {
    .tk-log, .tk-log:hover { scrollbar-width: auto; scrollbar-color: auto; }
    .tk-log::-webkit-scrollbar { width: 6px; }
    .tk-log::-webkit-scrollbar-track { background: transparent; }
    .tk-log::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(113, 108, 102, 0.35); }
    .tk-log:hover::-webkit-scrollbar-thumb { background: rgba(113, 108, 102, 0.6); }
  }
  .tk-line { align-self: flex-start; max-width: 85%; padding: 7px 11px; border-radius: 12px 12px 12px 4px; background: #fffdf8; color: #4a4744;
    font-size: 14px; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
  .tk-line.tk-mine { align-self: flex-end; border-radius: 12px 12px 4px 12px; background: #716c66; color: #fbf3df; }
  .tk-empty { margin: auto; font-size: 13px; color: #8d8981; }
  /* 빠른 문구 — 메신저 빠른 답장처럼 한 줄로 두고 넘치면 옆으로 넘긴다(Material 칩 가이드). 더 있는 쪽 끝은 흐려져
     잘린 게 아니라 더 있다는 것을 알리고, 마우스 휠로도 옆으로 넘어간다(QuickReplies) */
  .tk-quick { flex: none; display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .tk-quick::-webkit-scrollbar { display: none; }
  .tk-quick[data-more='end'] { -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent); }
  .tk-quick[data-more='start'] { -webkit-mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(to left, #000 calc(100% - 32px), transparent); }
  .tk-quick[data-more='both'] { -webkit-mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent); }
  .tk-chip { flex: none; white-space: nowrap; padding: 5px 11px; border-radius: 999px; background: #fffdf8; color: #5d5a57; font-size: 13px; box-shadow: 1px 1px 0 0 #716c66; }
  .tk-chip:active { transform: translate(1px, 1px); box-shadow: 0 0 0 0 transparent; }
  .tk-form { display: flex; gap: 8px; padding: 0 12px 12px; }
  .tk-input { flex: 1; min-width: 0; padding: 9px 12px; border: 1.5px solid #716c66; border-radius: 10px; background: #fffdf8; color: #4a4744;
    font: 16px/1.3 Pretendard, sans-serif; outline: none; user-select: text; }
  .tk-input::placeholder { color: #a9a39a; }
  .tk-input:focus { box-shadow: 0 0 0 3px rgba(113, 108, 102, 0.22); }
  .tk-send { flex: none; padding: 0 14px; border-radius: 10px; background: #716c66; color: #fbf3df; font-size: 14px; font-weight: 600; }
  .tk-send:disabled { opacity: 0.45; cursor: default; }

  .tk-notice { position: absolute; top: 18px; left: 16px; right: 16px; width: fit-content; margin: 0 auto; padding: 8px 16px; border-radius: 999px;
    background: #716c66; color: #fbf3df; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: tk-notice ${2600}ms ease forwards; }
  .tk-notice.tk-low { top: 150px; }
  /* 좁은 화면 — 오른쪽 위 HUD 버튼 줄을 비켜 가운데에 두고, 긴 글은 잘라 내지 않고 두 줄로 넘긴다. 카드는 아래에 뜨니 내릴 필요가 없다 */
  @media (max-width: 639px) {
    .tk-notice { left: 72px; right: 72px; border-radius: 16px; white-space: normal; text-align: center; word-break: keep-all; }
    .tk-notice.tk-low { top: 18px; }
  }

  @keyframes tk-pop { from { opacity: 0; transform: translateY(6px) scale(0.9); } to { opacity: 1; transform: none; } }
  @keyframes tk-wait { 50% { opacity: 0.5; } }
  @keyframes tk-bob { 50% { transform: translateY(-4px); } }
  @keyframes tk-bubble { 0% { opacity: 0; transform: translate(-50%, 6px); } 5%, 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
  @keyframes tk-drop { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes tk-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes tk-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  @keyframes tk-notice { 0% { opacity: 0; transform: translateY(-6px); } 8%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tk-layer *, .tk-layer *::before { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
`

/**
 * 만남 대화 화면 — 가까이 온 사람 머리 위 말 걸기 버튼, 받은 요청 카드, 두 사람만 보는 대화 창, 머리 위 말풍선.
 * 상태는 talk(lib/realtime/talk.ts)가 들고, 머리 위 자리는 씬이 매 프레임 talk.frame()으로 옮긴다.
 */
export default function TalkLayer({
  talk,
  active,
  onTyping,
  onPress,
}: {
  talk: Talk
  /** 조작할 수 있을 때만 E 키를 받는다(손가락 기기에서는 E 표시를 숨긴다) */
  active: boolean
  /** 입력칸에 쓰는 동안 캐릭터 조작을 끈다 */
  onTyping: (typing: boolean) => void
  /** 버튼을 누르는 순간 클릭음 */
  onPress?: () => void
}) {
  const view = useSyncExternalStore(talk.subscribe, talk.view, talk.view)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  /** 맨 아래를 보는 중인지 — 위로 올려 예전 글을 읽는 동안에는 새 글이 와도 끌어내리지 않는다 */
  const followRef = useRef(true)
  /** 마지막으로 본 줄의 key — 줄 key는 대화가 바뀌어도 계속 커진다 */
  const seenKeyRef = useRef(0)
  /** 위를 읽는 동안 아래에 쌓인 새 글 수 — '새 메시지' 버튼에 보인다 */
  const [unseen, setUnseen] = useState(0)

  const refs = useMemo(() => {
    const bind = (slot: TalkSlot) => (el: HTMLDivElement | null) => talk.anchor(slot, el)
    return {
      target: bind('target'),
      card: bind('card'),
      inviter: bind('inviter'),
      selfBubble: bind('selfBubble'),
      peerBubble: bind('peerBubble'),
    }
  }, [talk])

  // 클릭음은 늘 최신 것을 부른다 — 부모가 렌더마다 새로 만들어도 E 키 처리기를 다시 걸지 않는다.
  // 다시 걸면 첫 키(소리를 켜며 씬을 다시 그린다)를 처리하는 도중에 처리기가 바뀌어 그 키를 놓친다
  const pressRef = useRef(onPress)
  useEffect(() => {
    pressRef.current = onPress
  }, [onPress])

  // E — 카드를 열지 않고 바로 말 걸기: [말 걸기]가 켜진 카드 상대, 없으면 버튼 상대(물리 키 기준, 입력칸·IME 조합 중·키 반복은 무시)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return
      const now = talk.view()
      if (!now.candidate && now.card?.reach !== 'near') return
      e.preventDefault()
      pressRef.current?.()
      talk.invite()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, talk])

  // Esc — 열린 카드를 닫는다(빈 곳을 눌러도 닫힌다 — 씬이 처리한다)
  useEffect(() => {
    if (!view.card) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') talk.select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view.card, talk])

  // 대화가 끝나면 쓰던 글과 입력 중 상태를 풀고, 다음 대화는 맨 아래를 따라가며 시작한다
  useEffect(() => {
    if (view.peer) return
    setDraft('')
    onTyping(false)
    setUnseen(0)
    followRef.current = true
  }, [view.peer, onTyping])

  // 새 줄 — 맨 아래를 보던 중이거나 내가 보낸 글이면 맨 아래로 내린다. 위를 읽는 중이면 자리를 두고 새 글 수만 센다
  useEffect(() => {
    const fresh = view.lines.filter((line) => line.key > seenKeyRef.current)
    seenKeyRef.current = Math.max(seenKeyRef.current, view.lines[view.lines.length - 1]?.key ?? 0)
    const log = logRef.current
    if (!log || fresh.length === 0) return
    if (followRef.current || fresh.some((line) => line.mine)) {
      log.scrollTop = log.scrollHeight
      followRef.current = true
      setUnseen(0)
    } else {
      setUnseen((n) => n + fresh.length)
    }
  }, [view.lines])

  // 창 크기가 바뀌어 로그 높이가 달라져도 맨 아래를 보던 중이면 맨 아래에 붙여 둔다
  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const keep = new ResizeObserver(() => {
      if (followRef.current) log.scrollTop = log.scrollHeight
    })
    keep.observe(log)
    return () => keep.disconnect()
  }, [view.peer])

  // 맨 아래에서 한 줄(32px) 안이면 맨 아래를 보는 것으로 친다 — 거기까지 내려오면 새 메시지 표시도 지운다
  const onLogScroll = () => {
    const log = logRef.current
    if (!log) return
    followRef.current = log.scrollHeight - log.scrollTop - log.clientHeight <= 32
    if (followRef.current) setUnseen(0)
  }

  const jumpToLatest = () => {
    const log = logRef.current
    if (!log) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    followRef.current = true
    setUnseen(0)
  }

  const submit = () => {
    // 조합이 끝난 직후의 값은 상태보다 입력칸이 먼저 안다
    if (talk.send(inputRef.current?.value ?? draft)) setDraft('')
  }

  const candidate = view.card ? null : view.candidate
  const card = view.card
  return (
    <div className="tk-layer">
      <style>{CSS}</style>

      {/* 버튼 상대 — 말 걸 수 있는 사람 머리 위의 작은 말풍선(누르면 카드). 건 요청을 기다리는 동안은 "기다리는 중…" */}
      <div ref={refs.target} className="tk-anchor">
        {view.asking ? (
          <div className="tk-over">
            <button type="button" className="tk-prompt" disabled>
              <span className="tk-bang" aria-hidden>
                !
              </span>
              기다리는 중…
            </button>
          </div>
        ) : (
          candidate && (
            <div className="tk-over">
              <button
                type="button"
                className="tk-hint"
                aria-label="말 걸 수 있어요 — 눌러서 카드 열기"
                title="말 걸기 (E)"
                onPointerDown={onPress}
                onClick={() => talk.select(candidate)}
              >
                <TalkIcon />
                <kbd className="tk-key">E</kbd>
              </button>
            </div>
          )
        )}
      </div>

      {/* 카드 — 누른 사람 머리 위. [말 걸기]는 4m 안에서 켜진다 */}
      <div ref={refs.card} className="tk-anchor">
        {card && (
          <div className="tk-over">
            <div className="tk-pcard" role="dialog" aria-label="이 사람에게 할 수 있는 것">
              <button
                type="button"
                className="tk-act"
                disabled={card.reach !== 'near'}
                onPointerDown={onPress}
                onClick={() => talk.invite(card.id)}
              >
                <TalkIcon />
                {card.reach === 'near' ? '말 걸기' : card.reach === 'far' ? '가까이 가면 말 걸기' : '잠시 뒤에 다시 걸 수 있어요'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 받은 요청 — 말을 건 사람 머리 위 표시 */}
      <div ref={refs.inviter} className="tk-anchor">
        {view.invite && (
          <div className="tk-over">
            <span className="tk-mark" aria-hidden>
              !
            </span>
          </div>
        )}
      </div>

      {/* 말풍선 — 7초 뒤 사라진다 */}
      <div ref={refs.selfBubble} className="tk-anchor">
        {view.bubbles.self && (
          <div key={view.bubbles.self.key} className="tk-over tk-bubble tk-mine">
            {view.bubbles.self.text}
          </div>
        )}
      </div>
      <div ref={refs.peerBubble} className="tk-anchor">
        {view.bubbles.peer && (
          <div key={view.bubbles.peer.key} className="tk-over tk-bubble">
            {view.bubbles.peer.text}
          </div>
        )}
      </div>

      {view.invite && (
        <div key={view.invite.from} className="tk-card" role="alertdialog" aria-label="말 걸기 요청">
          <p className="tk-card-title">옆에서 말을 걸었어요</p>
          <div className="tk-card-actions">
            <button type="button" className="tk-btn tk-yes" onPointerDown={onPress} onClick={() => talk.accept()}>
              좋아요
            </button>
            <button type="button" className="tk-btn" onPointerDown={onPress} onClick={() => talk.decline()}>
              다음에
            </button>
          </div>
          <div className="tk-timer" style={{ animationDuration: `${Math.max(0, view.invite.until - Date.now())}ms` }} />
        </div>
      )}

      {view.peer && (
        <section className="tk-panel" aria-label="대화">
          <header className="tk-head">
            <span className={view.far ? 'tk-title tk-far' : 'tk-title'} role="status">
              {view.far ? '멀어지고 있어요' : '대화 중'}
            </span>
            <button
              type="button"
              className="tk-close"
              aria-label="대화 끝내기"
              title="대화 끝내기"
              onPointerDown={onPress}
              onClick={() => talk.leave()}
            >
              ×
            </button>
          </header>
          <div className="tk-log-wrap">
            <div ref={logRef} className="tk-log" aria-live="polite" onScroll={onLogScroll}>
              {view.lines.length === 0 ? (
                <p className="tk-empty">먼저 인사를 건네 보세요</p>
              ) : (
                view.lines.map((line) => (
                  <p key={line.key} className={line.mine ? 'tk-line tk-mine' : 'tk-line'}>
                    {line.text}
                  </p>
                ))
              )}
            </div>
            {unseen > 0 && (
              <button type="button" className="tk-jump" aria-label={`새 메시지 ${unseen}개 — 맨 아래로`} onClick={jumpToLatest}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1.5V10M2.4 6.4 6 10l3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                새 메시지 {unseen}개
              </button>
            )}
          </div>
          <QuickReplies onPick={(phrase) => talk.send(phrase)} />
          <form
            className="tk-form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              ref={inputRef}
              className="tk-input"
              value={draft}
              maxLength={TALK.maxChars}
              placeholder="하고 싶은 말을 써 보세요"
              aria-label="보낼 말"
              enterKeyHint="send"
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => onTyping(true)}
              onBlur={() => onTyping(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') inputRef.current?.blur()
                if (e.key !== 'Enter') return
                e.preventDefault()
                // 한글을 조합하는 중의 Enter는 글자를 마무리할 뿐 보내지 않는다(마지막 글자가 두 번 가지 않게)
                if (!e.nativeEvent.isComposing) submit()
              }}
            />
            <button type="submit" className="tk-send" disabled={!draft.trim()}>
              보내기
            </button>
          </form>
        </section>
      )}

      {view.notice && (
        <div key={view.notice.key} className={view.invite ? 'tk-notice tk-low' : 'tk-notice'} role="status">
          {view.notice.text}
        </div>
      )}
    </div>
  )
}

/** 빠른 문구 한 줄 — 넘치면 옆으로 넘기고, 더 있는 쪽 끝을 흐린다(data-more: start·end·both). 세로 휠도 옆으로 넘기는 데 쓴다 */
function QuickReplies({ onPick }: { onPick: (phrase: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mark = () => {
      const start = el.scrollLeft > 1
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      const more = start && end ? 'both' : start ? 'start' : end ? 'end' : ''
      if (el.dataset.more !== more) el.dataset.more = more
    }
    // 마우스 휠은 세로로만 돈다 — 옆으로 넘길 게 있으면 그만큼 옆으로 민다(터치·트랙패드의 가로 밀기는 브라우저가 처리한다)
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    }
    mark()
    const resize = new ResizeObserver(mark)
    resize.observe(el)
    el.addEventListener('scroll', mark, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      resize.disconnect()
      el.removeEventListener('scroll', mark)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div ref={ref} className="tk-quick">
      {QUICK.map((phrase) => (
        <button key={phrase} type="button" className="tk-chip" onClick={() => onPick(phrase)}>
          {phrase}
        </button>
      ))}
    </div>
  )
}

/** 말풍선 아이콘 — 우상단 말 걸기 받기 버튼과 같은 모양. 몸은 글자색, 줄은 --tk-ico-line */
function TalkIcon() {
  return (
    <svg className="tk-ico" width="16" height="15" viewBox="0 0 18 16" fill="none" aria-hidden>
      <path d="M3 1h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L4.5 15v-3H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="currentColor" />
      <path d="M5 6.5h8M5 9h5" stroke="var(--tk-ico-line, #f9efdc)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

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
  .tk-link { margin-top: 10px; padding: 2px 4px; font-size: 12.5px; color: #8d8981; text-decoration: underline; text-underline-offset: 2px; }
  .tk-timer { position: absolute; left: 0; bottom: 0; width: 100%; height: 4px; background: #c9b99c; transform-origin: left; animation: tk-timer linear forwards; }
  /* 좁은 화면은 오른쪽 위 HUD 버튼과 겹치지 않게 아래(엄지가 닿는 자리)에 띄운다 */
  @media (max-width: 639px) {
    .tk-card { top: auto; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto; transform: none; animation-name: tk-rise; }
  }

  /* 대화 창 — 데스크톱은 오른쪽 아래, 좁은 화면은 아래를 가득 */
  .tk-panel { pointer-events: auto; position: absolute; right: 20px; bottom: 20px; width: 320px; max-height: min(46vh, 420px); display: flex;
    flex-direction: column; border-radius: 14px; background: #f9efdc; box-shadow: 3px 3px 0 0 #716c66; overflow: hidden;
    animation: tk-rise 0.25s cubic-bezier(0.33, 1, 0.68, 1); }
  @media (max-width: 639px) {
    .tk-panel { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto; max-height: 44vh; }
  }
  .tk-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 10px 8px 14px; }
  .tk-title { font-family: Stylish, sans-serif; font-size: 19px; }
  .tk-far { color: #c4553f; }
  .tk-head-actions { display: flex; align-items: center; gap: 6px; }
  .tk-head-actions .tk-link { margin-top: 0; }
  .tk-close { width: 30px; height: 30px; border-radius: 7px; background: #fffdf8; color: #5d5a57; font-size: 20px; line-height: 1; box-shadow: 2px 2px 0 0 #716c66; }
  .tk-close:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
  .tk-log { flex: 1; min-height: 72px; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; padding: 4px 12px 8px; }
  .tk-line { align-self: flex-start; max-width: 85%; padding: 7px 11px; border-radius: 12px 12px 12px 4px; background: #fffdf8; color: #4a4744;
    font-size: 14px; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
  .tk-line.tk-mine { align-self: flex-end; border-radius: 12px 12px 4px 12px; background: #716c66; color: #fbf3df; }
  .tk-empty { margin: auto; font-size: 13px; color: #8d8981; }
  .tk-quick { display: flex; gap: 6px; padding: 0 12px 8px; overflow-x: auto; scrollbar-width: none; }
  .tk-quick::-webkit-scrollbar { display: none; }
  .tk-chip { flex: none; padding: 5px 11px; border-radius: 999px; background: #fffdf8; color: #5d5a57; font-size: 13px; box-shadow: 1px 1px 0 0 #716c66; }
  .tk-chip:active { transform: translate(1px, 1px); box-shadow: 0 0 0 0 transparent; }
  .tk-form { display: flex; gap: 8px; padding: 0 12px 12px; }
  .tk-input { flex: 1; min-width: 0; padding: 9px 12px; border: 1.5px solid #716c66; border-radius: 10px; background: #fffdf8; color: #4a4744;
    font: 16px/1.3 Pretendard, sans-serif; outline: none; user-select: text; }
  .tk-input::placeholder { color: #a9a39a; }
  .tk-input:focus { box-shadow: 0 0 0 3px rgba(113, 108, 102, 0.22); }
  .tk-send { flex: none; padding: 0 14px; border-radius: 10px; background: #716c66; color: #fbf3df; font-size: 14px; font-weight: 600; }
  .tk-send:disabled { opacity: 0.45; cursor: default; }

  .tk-notice { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 32px); padding: 8px 16px; border-radius: 999px;
    background: #716c66; color: #fbf3df; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: tk-notice ${2600}ms ease forwards; }
  .tk-notice.tk-low { top: 150px; }

  @keyframes tk-pop { from { opacity: 0; transform: translateY(6px) scale(0.9); } to { opacity: 1; transform: none; } }
  @keyframes tk-wait { 50% { opacity: 0.5; } }
  @keyframes tk-bob { 50% { transform: translateY(-4px); } }
  @keyframes tk-bubble { 0% { opacity: 0; transform: translate(-50%, 6px); } 5%, 88% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
  @keyframes tk-drop { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes tk-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes tk-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  @keyframes tk-notice { 0% { opacity: 0; transform: translate(-50%, -6px); } 8%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, 0); } }
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

  const refs = useMemo(() => {
    const bind = (slot: TalkSlot) => (el: HTMLDivElement | null) => talk.anchor(slot, el)
    return { target: bind('target'), inviter: bind('inviter'), selfBubble: bind('selfBubble'), peerBubble: bind('peerBubble') }
  }, [talk])

  // 클릭음은 늘 최신 것을 부른다 — 부모가 렌더마다 새로 만들어도 E 키 처리기를 다시 걸지 않는다.
  // 다시 걸면 첫 키(소리를 켜며 씬을 다시 그린다)를 처리하는 도중에 처리기가 바뀌어 그 키를 놓친다
  const pressRef = useRef(onPress)
  useEffect(() => {
    pressRef.current = onPress
  }, [onPress])

  // E — 가까이 온 사람에게 말 걸기(물리 키 기준, 입력칸·IME 조합 중·키 반복은 무시)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!talk.view().candidate) return
      e.preventDefault()
      pressRef.current?.()
      talk.invite()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, talk])

  // 대화가 끝나면 쓰던 글과 입력 중 상태를 푼다
  useEffect(() => {
    if (view.peer) return
    setDraft('')
    onTyping(false)
  }, [view.peer, onTyping])

  // 새 줄이 오면 맨 아래를 보인다
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [view.lines])

  const submit = () => {
    // 조합이 끝난 직후의 값은 상태보다 입력칸이 먼저 안다
    if (talk.send(inputRef.current?.value ?? draft)) setDraft('')
  }

  const target = view.asking ?? view.candidate
  return (
    <div className="tk-layer">
      <style>{CSS}</style>

      {/* 말 걸기 — 가까이 온 사람 머리 위 */}
      <div ref={refs.target} className="tk-anchor">
        {target && (
          <div className="tk-over">
            <button
              type="button"
              className="tk-prompt"
              disabled={view.asking !== null}
              onPointerDown={onPress}
              onClick={() => talk.invite()}
            >
              <span className="tk-bang" aria-hidden>
                !
              </span>
              {view.asking ? '기다리는 중…' : '말 걸기'}
              {!view.asking && <kbd className="tk-key">E</kbd>}
            </button>
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
          <button type="button" className="tk-link" onClick={() => view.invite && talk.hide(view.invite.from)}>
            이 사람 가리기
          </button>
          <div className="tk-timer" style={{ animationDuration: `${Math.max(0, view.invite.until - Date.now())}ms` }} />
        </div>
      )}

      {view.peer && (
        <section className="tk-panel" aria-label="대화">
          <header className="tk-head">
            <span className={view.far ? 'tk-title tk-far' : 'tk-title'} role="status">
              {view.far ? '멀어지고 있어요' : '대화 중'}
            </span>
            <span className="tk-head-actions">
              <button type="button" className="tk-link" onClick={() => view.peer && talk.hide(view.peer)}>
                가리기
              </button>
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
            </span>
          </header>
          <div ref={logRef} className="tk-log" aria-live="polite">
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
          <div className="tk-quick">
            {QUICK.map((phrase) => (
              <button key={phrase} type="button" className="tk-chip" onClick={() => talk.send(phrase)}>
                {phrase}
              </button>
            ))}
          </div>
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

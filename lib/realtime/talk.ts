'use client'

import { hasLink, TALK, type RelayTalkEnd } from '@/shared/relay/contract'
import type { RelayTalk, RelayTalkHandlers } from './relay'

/**
 * 만남 대화 화면 상태 — 가까이 온 사람을 알아채 말 걸기 버튼을 띄우고, 요청·수락·대화를 서버 이벤트대로 그린다.
 *
 * 버튼은 TALK.promptEnterM 안에 TALK.dwellMs 머문 사람 가운데 가장 가까운 사람에게 뜨고,
 * TALK.promptExitM보다 멀어져야 사라진다(위치가 흔들려도 깜빡이지 않는다). 그 사람이 화면 밖(등 뒤)에
 * 있으면 버튼을 그쪽 화면 가장자리에 붙이고 화살표로 방향을 가리킨다 — 나중에 들어와 등 뒤에 선 사람에게도
 * 먼저 와 있던 사람이 말을 걸 수 있다. 성사·종료는 서버가 판정하고,
 * 화면은 받은 대로 그린다. 머리 위 버튼·말풍선은 frame()이 매 프레임 화면 좌표로 옮겨 React를 다시
 * 그리지 않는다. 받기를 꺼 둔 동안의 요청은 조용히 거절한다.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface TalkLine {
  key: number
  mine: boolean
  text: string
}

export interface TalkBubble {
  key: number
  text: string
}

export interface TalkView {
  /** 말 걸기 버튼을 띄울 상대 */
  candidate: string | null
  /** 내가 건 요청을 기다리는 상대 */
  asking: string | null
  /** 받은 요청 — until은 Date.now() 기준 만료 시각 */
  invite: { from: string; until: number } | null
  /** 대화 상대 */
  peer: string | null
  lines: TalkLine[]
  /** 대화 상대가 끝나는 거리보다 멀리 있다 */
  far: boolean
  bubbles: { self: TalkBubble | null; peer: TalkBubble | null }
  /** 잠깐 띄우는 한 줄 */
  notice: { key: number; text: string } | null
  /** 말 걸기 받기 */
  open: boolean
}

/** 머리 위 자리 — 말 걸기 버튼, 요청을 건 사람 표시, 내 말풍선, 상대 말풍선 */
export type TalkSlot = 'target' | 'inviter' | 'selfBubble' | 'peerBubble'

/** 화면 좌표(px) — behind는 카메라 뒤라는 뜻이다(x는 그 사람이 있는 쪽을 가리키고 y는 뜻이 없다) */
export interface ScreenPoint {
  x: number
  y: number
  behind: boolean
}

/** 발 위치에서 lift(m) 위를 화면 좌표로 옮긴다 — 화면 안이면 true. 화면 밖·카메라 뒤여도 out을 채운다 */
export type Project = (foot: Vec3, lift: number, out: ScreenPoint) => boolean

export interface Talk {
  subscribe(listener: () => void): () => void
  view(): TalkView
  /** 서버 이벤트 받기 — 중계 연결에 넘긴다 */
  readonly handlers: RelayTalkHandlers
  /** 중계 연결이 생기면 잇는다(그 전 동작은 서버로 나가지 않는다) */
  bind(transport: RelayTalk | null): void
  /** 방에 다시 들어갔거나 연결이 끊겼다 */
  reset(): void
  /** 저장해 둔 말 걸기 받기 설정을 읽는다(브라우저에서만) */
  restore(): void
  invite(): void
  accept(): void
  decline(): void
  /** 보내면 true — 비었거나 길거나 링크가 있거나 너무 잦으면 false */
  send(text: string): boolean
  leave(): void
  setOpen(open: boolean): void
  anchor(slot: TalkSlot, el: HTMLElement | null): void
  /** 매 프레임 — 거리로 버튼 상대·멀어짐을 정하고 머리 위 자리를 옮긴다. now는 performance.now() */
  frame(now: number, self: Vec3 | null, others: ReadonlyMap<string, Vec3>, project: Project): void
  dispose(): void
}

/** 말풍선은 이 시간 뒤 사라진다 */
const BUBBLE_MS = 7000
const NOTICE_MS = 2600
/** 대화 창에 남기는 줄 수 */
const MAX_LINES = 60
/** 머리 위 자리 높이(m, 발 기준) — 모자 꼭대기(약 1.5m) 조금 위 */
const HEAD_LIFT = 1.7
/** 머리 위 자리가 화면 가장자리와 띄울 간격(px) */
const EDGE_PX = 8
const OPEN_KEY = 'dumb.talk.open'

const ENDED: Record<RelayTalkEnd, string> = {
  self: '대화를 마쳤어요',
  left: '상대가 대화를 마쳤어요',
  far: '멀어져서 대화가 끝났어요',
  idle: '한동안 말이 없어 대화를 마쳤어요',
  gone: '상대가 떠났어요',
}

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function createTalk(): Talk {
  let transport: RelayTalk | null = null
  const listeners = new Set<() => void>()
  let view: TalkView = {
    candidate: null,
    asking: null,
    invite: null,
    peer: null,
    lines: [],
    far: false,
    bubbles: { self: null, peer: null },
    notice: null,
    open: true,
  }
  const set = (patch: Partial<TalkView>) => {
    view = { ...view, ...patch }
    for (const listener of listeners) listener()
  }

  /** 들어온 시각(performance.now()) — 나가는 거리보다 멀어지면 지운다 */
  const near = new Map<string, number>()
  /** 다시 걸 수 있는 시각(Date.now()) */
  const cooling = new Map<string, number>()
  const anchors: Record<TalkSlot, HTMLElement | null> = { target: null, inviter: null, selfBubble: null, peerBubble: null }
  const spot: ScreenPoint = { x: 0, y: 0, behind: false }
  let seq = 0
  let lastSentAt = -Infinity
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }

  const notify = (text: string) => {
    const key = ++seq
    set({ notice: { key, text } })
    later(NOTICE_MS, () => {
      if (view.notice?.key === key) set({ notice: null })
    })
  }

  const bubble = (side: 'self' | 'peer', text: string) => {
    const key = ++seq
    set({ bubbles: { ...view.bubbles, [side]: { key, text } } })
    later(BUBBLE_MS, () => {
      if (view.bubbles[side]?.key === key) set({ bubbles: { ...view.bubbles, [side]: null } })
    })
  }

  const ended = (): Partial<TalkView> => ({ peer: null, lines: [], far: false, bubbles: { self: null, peer: null } })

  const decline = () => {
    const invite = view.invite
    if (!invite) return
    set({ invite: null })
    transport?.reply(invite.from, false)
  }

  const leave = () => {
    if (view.peer) {
      transport?.leave()
      set(ended())
      notify(ENDED.self)
    } else if (view.asking) {
      transport?.leave()
      set({ asking: null })
    }
  }

  const handlers: RelayTalkHandlers = {
    onInvited(from) {
      // 받기를 꺼 두었거나 대화 중이면 조용히 거절한다
      if (!view.open || view.peer || view.invite) {
        transport?.reply(from, false)
        return
      }
      set({ invite: { from, until: Date.now() + TALK.inviteTtlMs } })
    },
    onInviteEnded(from) {
      if (view.invite?.from === from) set({ invite: null })
    },
    onDeclined(to) {
      cooling.set(to, Date.now() + TALK.cooldownMs)
      if (view.asking !== to) return
      set({ asking: null })
      notify('지금은 바쁜가 봐요')
    },
    onStarted(peer) {
      set({ asking: null, invite: null, candidate: null, ...ended(), peer })
    },
    onMessage({ text, mine }) {
      if (!view.peer) return
      set({ lines: [...view.lines, { key: ++seq, mine, text }].slice(-MAX_LINES) })
      bubble(mine ? 'self' : 'peer', text)
    },
    onEnded(reason) {
      if (!view.peer) return
      set(ended())
      notify(ENDED[reason])
    },
  }

  /**
   * 머리 위 자리를 옮긴다. 화면 밖이면 숨기되, pin(말 걸기 버튼)이면 화면 가운데에서 그 사람 쪽으로 가장자리까지
   * 밀어 붙이고(카메라 뒤면 아래 가장자리) tk-pinned와 --tk-dir(화살표 각도, 0°가 위·시계 방향)로 방향을 알린다
   */
  const place = (slot: TalkSlot, foot: Vec3 | null | undefined, project: Project, pin = false) => {
    const el = anchors[slot]
    if (!el) return
    const inside = !!foot && project(foot, HEAD_LIFT, spot)
    if (!foot || (!inside && !pin)) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      return
    }
    // 말풍선·버튼이 화면 밖으로 잘리지 않게 내용 크기만큼 안으로 당긴다 — 내용의 아래 끝이 머리 위 자리에 온다
    const box = el.firstElementChild as HTMLElement | null
    const half = (box?.offsetWidth ?? 0) / 2
    const width = el.parentElement?.clientWidth ?? 0
    const height = el.parentElement?.clientHeight ?? 0
    const left = half + EDGE_PX
    const right = width - half - EDGE_PX
    const top = (box?.offsetHeight ?? 0) + EDGE_PX
    const bottom = height - EDGE_PX
    let { x, y } = spot
    if (!inside) {
      const cx = width / 2
      const cy = height / 2
      const dx = Number.isFinite(x) ? x - cx : 0
      if (spot.behind || !Number.isFinite(y)) {
        y = bottom
      } else {
        const dy = y - cy
        const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity
        const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity
        const t = Math.min(tx, ty)
        x = cx + dx * (Number.isFinite(t) ? t : 0)
        y = cy + dy * (Number.isFinite(t) ? t : 0)
      }
      x = Number.isFinite(x) ? x : cx
    }
    x = Math.min(Math.max(x, left), right)
    y = Math.min(Math.max(y, top), bottom)
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (el.classList.contains('tk-pinned') === inside) el.classList.toggle('tk-pinned', !inside)
    if (!inside) {
      const angle = (Math.atan2(x - width / 2, height / 2 - y) * 180) / Math.PI
      el.style.setProperty('--tk-dir', `${angle.toFixed(0)}deg`)
    }
    if (el.style.visibility !== 'visible') el.style.visibility = 'visible'
  }

  return {
    handlers,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    view: () => view,

    bind(next) {
      transport = next
    },

    reset() {
      const talking = view.peer !== null
      near.clear()
      set({ candidate: null, asking: null, invite: null, ...ended() })
      if (talking) notify('연결이 끊겨 대화가 끝났어요')
    },

    restore() {
      try {
        if (localStorage.getItem(OPEN_KEY) === '0') set({ open: false })
      } catch {
        // 저장소를 못 쓰면 받기를 켠 채로 둔다
      }
    },

    invite() {
      const to = view.candidate
      if (!to || view.asking || view.peer || !transport) return
      set({ asking: to })
      transport.invite(to)
      // 서버 답이 끝내 오지 않으면(끊김) 요청 시간이 지난 뒤 기다림을 푼다
      later(TALK.inviteTtlMs + 3000, () => {
        if (view.asking === to) set({ asking: null })
      })
    },

    accept() {
      const invite = view.invite
      if (!invite) return
      set({ invite: null })
      transport?.reply(invite.from, true)
    },

    decline,

    send(text) {
      const clean = text.trim()
      if (!view.peer || !clean || [...clean].length > TALK.maxChars) return false
      if (hasLink(clean)) {
        notify('링크는 보낼 수 없어요')
        return false
      }
      const now = Date.now()
      if (now - lastSentAt < TALK.sendGapMs) return false
      lastSentAt = now
      transport?.send(clean)
      return true
    },

    leave,

    setOpen(open) {
      set({ open })
      try {
        localStorage.setItem(OPEN_KEY, open ? '1' : '0')
      } catch {
        // 저장소를 못 쓰면 이번 방문 동안만 기억한다
      }
    },

    anchor(slot, el) {
      anchors[slot] = el
    },

    frame(now, self, others, project) {
      if (self) {
        for (const [id, pos] of others) {
          const d = distance(self, pos)
          if (d <= TALK.promptEnterM) {
            if (!near.has(id)) near.set(id, now)
          } else if (d > TALK.promptExitM) {
            near.delete(id)
          }
        }
      }
      for (const id of near.keys()) if (!others.has(id)) near.delete(id)

      // 건 요청을 기다리는 동안 상대가 버튼이 사라지는 거리 밖으로 가면 요청을 거둔다 — "기다리는 중…"도 함께 사라진다
      if (view.asking) {
        const pos = others.get(view.asking)
        if (!self || !pos || distance(self, pos) > TALK.promptExitM) leave()
      }

      // 버튼 상대 — 대화·요청이 없을 때, 잠시 머문 사람 가운데 가장 가까운 사람(화면 밖이면 버튼이 가장자리에 붙는다)
      let candidate: string | null = null
      if (self && !view.peer && !view.asking && !view.invite) {
        const clock = Date.now()
        let best = Infinity
        for (const [id, since] of near) {
          if (now - since < TALK.dwellMs || (cooling.get(id) ?? 0) > clock) continue
          const d = distance(self, others.get(id)!)
          if (d < best) {
            best = d
            candidate = id
          }
        }
      }
      if (candidate !== view.candidate) set({ candidate })

      if (view.peer) {
        const pos = others.get(view.peer)
        const far = !self || !pos || distance(self, pos) > TALK.farM
        if (far !== view.far) set({ far })
      }

      const target = view.asking ?? view.candidate
      place('target', target ? others.get(target) : null, project, true)
      place('inviter', view.invite ? others.get(view.invite.from) : null, project)
      place('selfBubble', view.bubbles.self ? self : null, project)
      place('peerBubble', view.peer && view.bubbles.peer ? others.get(view.peer) : null, project)
    },

    dispose() {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      listeners.clear()
      transport = null
    },
  }
}

'use client'

import { hasLink, TALK, type RelayTalkEnd } from '@/shared/relay/contract'
import type { RelayTalk, RelayTalkHandlers } from './relay'

/**
 * 만남 대화 화면 상태 — 가까이 온 사람을 알아채고, 요청·수락·대화를 서버 이벤트대로 그린다.
 *
 * 말을 거는 길은 둘이다. 화면에 보이는 사람을 눌러(pick) 그 사람 머리 위에 카드를 열고 [말 걸기]를 누르거나
 * (로블록스 아바타 메뉴·클럽 펭귄 플레이어 카드처럼), TALK.promptEnterM 안에 TALK.dwellMs 머문 사람 가운데
 * 화면에 보이는 가장 가까운 사람(버튼 상대 — 머리 위에 작은 말풍선 표시)에게 E 키로 바로 건다. 카드의 [말 걸기]는
 * TALK.promptEnterM 안에서 켜지고 TALK.promptExitM보다 멀어지면 꺼진다(위치가 흔들려도 깜빡이지 않는다).
 * 화면 밖 사람은 누를 수 없으니 표시도 카드도 없다. 성사·종료는 서버가 판정하고, 화면은 받은 대로 그린다.
 * 머리 위 표시·카드·말풍선은 frame()이 매 프레임 화면 좌표로 옮겨 React를 다시 그리지 않는다.
 * 받기를 꺼 둔 동안의 요청은 조용히 거절한다.
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

/** 카드의 [말 걸기] — 걸 수 있음 · 멀어서 못 함 · 거절된 뒤 쉬는 중 */
export type TalkReach = 'near' | 'far' | 'cooling'

export interface TalkView {
  /** 버튼 상대 — 머리 위에 말풍선 표시를 띄우고 E 키가 거는 사람 */
  candidate: string | null
  /** 눌러서 연 카드 — 그 사람 머리 위에 [말 걸기]를 띄운다 */
  card: { id: string; reach: TalkReach } | null
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

/** 머리 위 자리 — 버튼 상대 표시(또는 "기다리는 중…"), 눌러서 연 카드, 요청을 건 사람 표시, 내 말풍선, 상대 말풍선 */
export type TalkSlot = 'target' | 'card' | 'inviter' | 'selfBubble' | 'peerBubble'

/** 발 위치에서 lift(m) 위를 화면 좌표(px)로 옮긴다 — 화면 밖이거나 카메라 뒤면 false */
export type Project = (foot: Vec3, lift: number, out: { x: number; y: number }) => boolean

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
  /** 말을 건다 — to가 없으면 [말 걸기]가 켜진 카드 상대, 그다음 버튼 상대에게 */
  invite(to?: string): void
  /** 화면 좌표(캔버스 기준 px)에 선 캐릭터 — 여럿이 겹치면 카메라에 가까운 사람. 없으면 null */
  pick(x: number, y: number): string | null
  /** 카드를 연다(null이면 닫는다) — 대화·요청 중에는 열지 않는다 */
  select(id: string | null): void
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
/** 캐릭터를 누르는 칸의 최소 반폭(px) — 멀리 있어 작게 보여도 손가락으로 누를 만큼(48px 폭) 넉넉하게 */
const PICK_MIN_HALF_PX = 24
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
    card: null,
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
  const anchors: Record<TalkSlot, HTMLElement | null> = { target: null, card: null, inviter: null, selfBubble: null, peerBubble: null }
  const spot = { x: 0, y: 0 }
  const head = { x: 0, y: 0 }
  const feet = { x: 0, y: 0 }
  /** 지난 프레임의 나·다른 사람 발 위치·화면 좌표 변환 — 누른 자리의 캐릭터를 찾을 때(pick) 쓴다 */
  let lastSelf: Vec3 | null = null
  let lastOthers: ReadonlyMap<string, Vec3> = new Map()
  let lastProject: Project | null = null
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
      set({ asking: null, invite: null, candidate: null, card: null, ...ended(), peer })
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

  /** 머리 위 자리를 옮긴다 — 화면 밖이거나 카메라 뒤면 숨긴다 */
  const place = (slot: TalkSlot, foot: Vec3 | null | undefined, project: Project) => {
    const el = anchors[slot]
    if (!el) return
    if (!foot || !project(foot, HEAD_LIFT, spot)) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      return
    }
    // 말풍선·카드가 화면 밖으로 잘리지 않게 내용 크기만큼 안으로 당긴다 — 내용의 아래 끝이 머리 위 자리에 온다
    const box = el.firstElementChild as HTMLElement | null
    const half = (box?.offsetWidth ?? 0) / 2
    const width = el.parentElement?.clientWidth ?? 0
    const height = el.parentElement?.clientHeight ?? 0
    const x = Math.min(Math.max(spot.x, half + EDGE_PX), width - half - EDGE_PX)
    const y = Math.min(Math.max(spot.y, (box?.offsetHeight ?? 0) + EDGE_PX), height - EDGE_PX)
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (el.style.visibility !== 'visible') el.style.visibility = 'visible'
  }

  /** 카드 상대에게 지금 말을 걸 수 있는지 — 이미 걸 수 있었으면 나가는 거리까지 켜 둔다(경계에서 깜빡이지 않게) */
  const reachOf = (id: string, was: TalkReach | null): TalkReach => {
    if ((cooling.get(id) ?? 0) > Date.now()) return 'cooling'
    const pos = lastOthers.get(id)
    if (!lastSelf || !pos) return 'far'
    return distance(lastSelf, pos) <= (was === 'near' ? TALK.promptExitM : TALK.promptEnterM) ? 'near' : 'far'
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
      set({ candidate: null, card: null, asking: null, invite: null, ...ended() })
      if (talking) notify('연결이 끊겨 대화가 끝났어요')
    },

    restore() {
      try {
        if (localStorage.getItem(OPEN_KEY) === '0') set({ open: false })
      } catch {
        // 저장소를 못 쓰면 받기를 켠 채로 둔다
      }
    },

    invite(target) {
      const card = view.card
      const to = target ?? (card?.reach === 'near' ? card.id : view.candidate)
      if (!to || view.asking || view.peer || !transport) return
      // 카드로 거는 건 [말 걸기]가 켜졌을 때만 — 멀거나 쉬는 중인 사람에게는 걸지 않는다
      if (card?.id === to && card.reach !== 'near') return
      set({ asking: to, card: null })
      transport.invite(to)
      // 서버 답이 끝내 오지 않으면(끊김) 요청 시간이 지난 뒤 기다림을 푼다
      later(TALK.inviteTtlMs + 3000, () => {
        if (view.asking === to) set({ asking: null })
      })
    },

    pick(x, y) {
      const project = lastProject
      if (!project) return null
      // 머리 위(HEAD_LIFT)부터 발까지, 폭은 키의 0.6배(작게 보여도 PICK_MIN_HALF_PX)인 칸 — 화면 밖 사람은 고르지 않는다
      let best: string | null = null
      let bestSize = 0
      for (const [id, foot] of lastOthers) {
        if (!project(foot, HEAD_LIFT, head) || !project(foot, 0, feet)) continue
        const size = feet.y - head.y
        const half = Math.max(PICK_MIN_HALF_PX, size * 0.3)
        if (Math.abs(x - (head.x + feet.x) / 2) > half || y < head.y - EDGE_PX || y > feet.y + EDGE_PX) continue
        // 겹치면 화면에 크게 보이는(카메라에 가까운) 사람
        if (size > bestSize) {
          bestSize = size
          best = id
        }
      }
      return best
    },

    select(id) {
      if (id === null) {
        if (view.card) set({ card: null })
        return
      }
      if (view.peer || view.asking || view.invite) return
      if (view.card?.id === id) return
      set({ card: { id, reach: reachOf(id, null) } })
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
      lastSelf = self
      lastOthers = others
      lastProject = project
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

      // 버튼 상대 — 대화·요청이 없을 때, 잠시 머문 사람 가운데 화면에 보이는 가장 가까운 사람
      let candidate: string | null = null
      if (self && !view.peer && !view.asking && !view.invite) {
        const clock = Date.now()
        let best = Infinity
        for (const [id, since] of near) {
          if (now - since < TALK.dwellMs || (cooling.get(id) ?? 0) > clock) continue
          const pos = others.get(id)!
          if (!project(pos, HEAD_LIFT, spot)) continue
          const d = distance(self, pos)
          if (d < best) {
            best = d
            candidate = id
          }
        }
      }
      if (candidate !== view.candidate) set({ candidate })

      // 카드 — 그 사람이 떠났거나 화면 밖으로 나갔거나, 대화·요청이 생기면 닫는다. 아니면 [말 걸기]를 거리대로 켜고 끈다
      if (view.card) {
        const pos = others.get(view.card.id)
        if (!pos || !project(pos, HEAD_LIFT, spot) || view.peer || view.asking || view.invite) {
          set({ card: null })
        } else {
          const reach = reachOf(view.card.id, view.card.reach)
          if (reach !== view.card.reach) set({ card: { id: view.card.id, reach } })
        }
      }

      if (view.peer) {
        const pos = others.get(view.peer)
        const far = !self || !pos || distance(self, pos) > TALK.farM
        if (far !== view.far) set({ far })
      }

      const target = view.asking ?? view.candidate
      place('target', target ? others.get(target) : null, project)
      place('card', view.card ? others.get(view.card.id) : null, project)
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

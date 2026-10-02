'use client'

import { hasLink, TALK, type RelayTalkEnd } from '@/shared/relay/contract'
import type { RelayTalk, RelayTalkHandlers } from './relay'

/**
 * 만남 대화 화면 상태 — 가까이 온 사람을 알아채고, 요청·수락·대화를 서버 이벤트대로 그린다.
 *
 * 말을 거는 길은 둘이다. 화면에 보이는 사람을 눌러(pick) 그 사람 둘레에 원형 메뉴를 열고 말풍선 아이콘을 누르거나
 * (심즈의 파이 메뉴처럼 — 나중에 인사·친구·차단 아이콘이 같은 원에 붙는다), E 키로 가까이 있는 가장 가까운 사람에게 바로 건다.
 * TALK.promptEnterM 안에 들어온, 화면에 보이는 사람마다 머리 위에 누를 수 있다는 손가락 표시가 곧바로 뜨고(E 키 상대에게는
 * E가 붙는다) TALK.promptExitM보다 멀어지면 그 자리에서 옅어지며 사라진다. 거절된 뒤 쉬는 사람의 표시는 숨기지 않고 흐리게 둔다.
 * 말풍선 아이콘도 같은 거리에서 켜지고 흐려진다(위치가 흔들려도 깜빡이지 않는다).
 * 거절된 뒤 쉬는 동안은 아이콘을 어두운 덮개가 덮고 남은 시간만큼 시계 방향으로 걷힌다. 못 쓰는 아이콘을 누르면(E 키도)
 * 까닭을 한 줄로 알린다.
 * 화면 밖 사람은 누를 수 없으니 표시도 메뉴도 없다. 성사·종료는 서버가 판정하고, 화면은 받은 대로 그린다.
 * 머리 위 표시·메뉴·말풍선은 frame()이 매 프레임 화면 좌표로 옮겨 React를 다시 그리지 않는다.
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

/** 원형 메뉴의 말 걸기 아이콘 — 걸 수 있음 · 멀어서 못 함 · 거절된 뒤 쉬는 중 */
export type TalkReach = 'near' | 'far' | 'cooling'

/** 캐릭터를 눌러 연 원형 메뉴 — coolUntil은 쉬는 중일 때 다시 걸 수 있는 시각(Date.now() 기준) */
export interface TalkMenu {
  id: string
  reach: TalkReach
  coolUntil: number | null
}

/**
 * 머리 위 표시 하나 — tap은 누를 수 있는 사람(손가락), wait는 내가 건 요청을 기다리는 상대("기다리는 중…").
 * focus는 E 키가 거는 사람(PC는 E를 붙인다), cooling은 거절된 뒤 쉬는 사람(흐리게, 움직임 없이),
 * leaving은 사라지는 중(그 자리에서 옅어진 뒤 빠진다)
 */
export interface TalkHint {
  id: string
  kind: 'tap' | 'wait'
  focus: boolean
  cooling: boolean
  leaving: boolean
}

export interface TalkView {
  /** E 키가 거는 사람 — 가까이 있는 사람 가운데 화면에 보이고 쉬지 않는 가장 가까운 사람 */
  candidate: string | null
  /** 머리 위 표시 — 가까이 있는 보이는 사람마다 하나(기다리는 동안은 그 상대 하나). 사라지는 표시도 잠깐 남는다 */
  hints: TalkHint[]
  /** 눌러서 연 원형 메뉴 — 그 사람 둘레에 말 걸기 아이콘을 띄운다 */
  menu: TalkMenu | null
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

/** 머리 위 자리 — 눌러서 연 원형 메뉴, 요청을 건 사람 표시, 내 말풍선, 상대 말풍선(머리 위 표시는 사람마다 hintAnchor로 받는다) */
export type TalkSlot = 'menu' | 'inviter' | 'selfBubble' | 'peerBubble'

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
  /** 말을 건다 — to가 없으면 열린 원형 메뉴 상대(못 걸면 까닭만 알린다), 메뉴가 없으면 E 키 상대에게 */
  invite(to?: string): void
  /** 화면 좌표(캔버스 기준 px)에 선 캐릭터 — 여럿이 겹치면 카메라에 가까운 사람. 없으면 null */
  pick(x: number, y: number): string | null
  /** 원형 메뉴를 연다(null이면 닫는다) — 대화·요청 중에는 열지 않는다 */
  select(id: string | null): void
  accept(): void
  decline(): void
  /** 보내면 true — 비었거나 길거나 링크가 있거나 너무 잦으면 false */
  send(text: string): boolean
  leave(): void
  setOpen(open: boolean): void
  anchor(slot: TalkSlot, el: HTMLElement | null): void
  /** 그 사람 머리 위 표시 자리를 받는 ref — 사람마다 같은 함수를 돌려준다 */
  hintAnchor(id: string): (el: HTMLElement | null) => void
  /** 매 프레임 — 거리로 머리 위 표시·E 키 상대·멀어짐을 정하고 머리 위 자리를 옮긴다. now는 performance.now() */
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
/** 원형 메뉴 가운데 높이(m, 발 기준) — 가슴께 */
const CHEST_LIFT = 0.85
/** 머리 위 자리가 화면 가장자리와 띄울 간격(px) */
const EDGE_PX = 8
/** 캐릭터를 누르는 칸의 최소 반폭(px) — 멀리 있어 작게 보여도 손가락으로 누를 만큼(48px 폭) 넉넉하게 */
const PICK_MIN_HALF_PX = 24
/** 사라지는 머리 위 표시를 남겨 두는 시간 — 화면이 옅어지게 하는 0.18초보다 조금 길게 두었다 뺀다 */
const HINT_OUT_MS = 200
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
    hints: [],
    menu: null,
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

  /** 들어오는 거리 안에 들어온 사람 — 나가는 거리보다 멀어지면 뺀다 */
  const near = new Set<string>()
  /** 다시 걸 수 있는 시각(Date.now()) */
  const cooling = new Map<string, number>()
  const anchors: Record<TalkSlot, HTMLElement | null> = { menu: null, inviter: null, selfBubble: null, peerBubble: null }
  /** 사람마다 머리 위 표시 자리·그 ref 함수·사라지기 시작한 시각(performance.now()) */
  const hintEls = new Map<string, HTMLElement>()
  const hintRefs = new Map<string, (el: HTMLElement | null) => void>()
  const hintGoneAt = new Map<string, number>()
  /** 이번 프레임에 띄울 머리 위 표시 — 매 프레임 비우고 다시 채운다 */
  const wanted = new Map<string, Omit<TalkHint, 'id' | 'leaving'>>()
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
      set({ asking: null, invite: null, candidate: null, menu: null, ...ended(), peer })
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
   * 자리를 옮긴다 — 화면 밖이거나 카메라 뒤면 숨긴다(keep이면 숨기지 않고 마지막 자리에 둔다 — 사라지는 표시가 옅어지는 동안).
   * 기본은 머리 위(내용의 아래 끝이 그 자리)이고, centered면 lift 높이가 내용의 가운데다(원형 메뉴는 가슴께가 가운데)
   */
  const place = (
    el: HTMLElement | null | undefined,
    foot: Vec3 | null | undefined,
    project: Project,
    lift = HEAD_LIFT,
    centered = false,
    keep = false,
  ) => {
    if (!el) return
    if (!foot || !project(foot, lift, spot)) {
      if (!keep && el.style.visibility !== 'hidden') el.style.visibility = 'hidden'
      return
    }
    // 말풍선·메뉴가 화면 밖으로 잘리지 않게 내용 크기만큼 안으로 당긴다
    const box = el.firstElementChild as HTMLElement | null
    const half = (box?.offsetWidth ?? 0) / 2
    const tall = box?.offsetHeight ?? 0
    const width = el.parentElement?.clientWidth ?? 0
    const height = el.parentElement?.clientHeight ?? 0
    const x = Math.min(Math.max(spot.x, half + EDGE_PX), width - half - EDGE_PX)
    const y = centered
      ? Math.min(Math.max(spot.y, tall / 2 + EDGE_PX), height - tall / 2 - EDGE_PX)
      : Math.min(Math.max(spot.y, tall + EDGE_PX), height - EDGE_PX)
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    if (el.style.visibility !== 'visible') el.style.visibility = 'visible'
  }

  /** 메뉴 상대에게 지금 말을 걸 수 있는지 — 머리 위 표시와 같은 거리 판정(near)을 따라 표시가 뜬 사람이면 켜진다 */
  const reachOf = (id: string): TalkReach => {
    if ((cooling.get(id) ?? 0) > Date.now()) return 'cooling'
    return near.has(id) ? 'near' : 'far'
  }
  const menuOf = (id: string): TalkMenu => {
    const reach = reachOf(id)
    return { id, reach, coolUntil: reach === 'cooling' ? (cooling.get(id) ?? null) : null }
  }

  /**
   * 머리 위 표시를 이번 프레임에 바라는 것(wanted)에 맞춘다 — 빠진 표시는 HINT_OUT_MS 동안 사라지는 중으로 남겼다가 뺀다
   * (그 사이 다시 바라면 되살린다). 바뀐 게 있을 때만 다시 그린다
   */
  const settleHints = (now: number) => {
    let changed = false
    const next: TalkHint[] = []
    for (const hint of view.hints) {
      const wish = wanted.get(hint.id)
      if (wish) {
        wanted.delete(hint.id)
        hintGoneAt.delete(hint.id)
        const same = !hint.leaving && hint.kind === wish.kind && hint.focus === wish.focus && hint.cooling === wish.cooling
        next.push(same ? hint : { id: hint.id, ...wish, leaving: false })
        if (!same) changed = true
      } else if (!hint.leaving) {
        hintGoneAt.set(hint.id, now)
        next.push({ ...hint, leaving: true })
        changed = true
      } else if (now - (hintGoneAt.get(hint.id) ?? now) < HINT_OUT_MS) {
        next.push(hint)
      } else {
        hintGoneAt.delete(hint.id)
        hintRefs.delete(hint.id)
        changed = true
      }
    }
    for (const [id, wish] of wanted) {
      next.push({ id, ...wish, leaving: false })
      changed = true
    }
    if (changed) set({ hints: next })
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
      hintGoneAt.clear()
      hintRefs.clear()
      set({ candidate: null, hints: [], menu: null, asking: null, invite: null, ...ended() })
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
      // 메뉴가 열려 있으면 그 사람에게만 — 메뉴 상대를 못 걸 때 E 키가 메뉴에 가려 안 보이는 버튼 상대에게 걸지 않게
      const menu = view.menu
      const to = target ?? menu?.id ?? view.candidate
      if (!to || view.asking || view.peer || !transport) return
      // 메뉴로 거는 건 아이콘이 켜졌을 때만 — 멀거나 쉬는 중이면 걸지 않고 까닭만 한 줄로 알린다(게임의 "너무 멀어요"처럼)
      if (menu?.id === to && menu.reach !== 'near') {
        notify(menu.reach === 'far' ? '조금 더 가까이 가면 말을 걸 수 있어요' : '잠시 뒤에 다시 말을 걸 수 있어요')
        return
      }
      set({ asking: to, menu: null })
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
        if (view.menu) set({ menu: null })
        return
      }
      if (view.peer || view.asking || view.invite) return
      if (view.menu?.id === id) return
      set({ menu: menuOf(id) })
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

    hintAnchor(id) {
      let ref = hintRefs.get(id)
      if (!ref) {
        ref = (el) => {
          if (el) hintEls.set(id, el)
          else hintEls.delete(id)
        }
        hintRefs.set(id, ref)
      }
      return ref
    },

    frame(now, self, others, project) {
      lastSelf = self
      lastOthers = others
      lastProject = project
      // 가까이 — 들어오는 거리 안이면 넣고 나가는 거리보다 멀면 뺀다(그 사이에서는 그대로 둬 경계에서 깜빡이지 않는다)
      if (self) {
        for (const [id, pos] of others) {
          const d = distance(self, pos)
          if (d <= TALK.promptEnterM) near.add(id)
          else if (d > TALK.promptExitM) near.delete(id)
        }
      }
      for (const id of near) if (!others.has(id)) near.delete(id)

      // 건 요청을 기다리는 동안 상대가 표시가 사라지는 거리 밖으로 가면 요청을 거둔다 — "기다리는 중…"도 함께 사라진다
      if (view.asking) {
        const pos = others.get(view.asking)
        if (!self || !pos || distance(self, pos) > TALK.promptExitM) leave()
      }

      // 원형 메뉴 — 그 사람이 떠났거나 화면 밖으로 나갔거나, 대화·요청이 생기면 닫는다. 아니면 말 걸기 아이콘을 거리대로 켜고 끈다
      if (view.menu) {
        const pos = others.get(view.menu.id)
        if (!pos || !project(pos, HEAD_LIFT, spot) || view.peer || view.asking || view.invite) {
          set({ menu: null })
        } else if (reachOf(view.menu.id) !== view.menu.reach) {
          set({ menu: menuOf(view.menu.id) })
        }
      }

      // 머리 위 표시 — 건 요청을 기다리는 동안은 그 상대의 "기다리는 중…" 하나. 대화·요청·메뉴가 없으면 가까이 있는 보이는
      // 사람마다 손가락 표시를 띄우고(쉬는 사람은 흐리게), 그 가운데 쉬지 않는 가장 가까운 사람이 E 키 상대다
      wanted.clear()
      let candidate: string | null = null
      if (view.asking) {
        const pos = others.get(view.asking)
        if (pos && project(pos, HEAD_LIFT, spot)) wanted.set(view.asking, { kind: 'wait', focus: false, cooling: false })
      } else if (self && !view.peer && !view.invite && !view.menu) {
        const clock = Date.now()
        let best = Infinity
        for (const id of near) {
          const pos = others.get(id)!
          if (!project(pos, HEAD_LIFT, spot)) continue
          const resting = (cooling.get(id) ?? 0) > clock
          wanted.set(id, { kind: 'tap', focus: false, cooling: resting })
          const d = distance(self, pos)
          if (!resting && d < best) {
            best = d
            candidate = id
          }
        }
        const focus = candidate ? wanted.get(candidate) : undefined
        if (focus) focus.focus = true
      }
      if (candidate !== view.candidate) set({ candidate })
      settleHints(now)

      if (view.peer) {
        const pos = others.get(view.peer)
        const far = !self || !pos || distance(self, pos) > TALK.farM
        if (far !== view.far) set({ far })
      }

      for (const hint of view.hints) place(hintEls.get(hint.id), others.get(hint.id), project, HEAD_LIFT, false, hint.leaving)
      place(anchors.menu, view.menu ? others.get(view.menu.id) : null, project, CHEST_LIFT, true)
      place(anchors.inviter, view.invite ? others.get(view.invite.from) : null, project)
      place(anchors.selfBubble, view.bubbles.self ? self : null, project)
      place(anchors.peerBubble, view.peer && view.bubbles.peer ? others.get(view.peer) : null, project)
    },

    dispose() {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      listeners.clear()
      transport = null
    },
  }
}

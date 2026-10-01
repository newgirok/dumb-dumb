import {
  hasLink,
  TALK,
  type RelayServerToClientEvents,
  type RelayTalkEnd,
} from '../../../../shared/relay/contract'

/**
 * 만남 대화 — 익명 중계에 붙이는 1:1 대화 판정(지금은 방 중계가 쓴다).
 *
 * 가까이 있는 사람에게 말을 걸면(요청) 상대가 받아들일 때만 두 사람만 보는 대화가 열린다.
 * 둘이 동시에 걸면 곧바로 열린다. 거절·시간 초과·상대가 바쁨은 건 사람에게 같은 신호(talkDeclined)로
 * 알리고, 같은 사람에게는 쿨다운 동안 다시 걸 수 없다. 대화는 멀어진 채 잠시 지나거나, 한동안
 * 말이 없거나, 한쪽이 끝내거나 떠나면 끝난다. 글은 두 사람에게만 흘리고 저장하지 않는다.
 *
 * 누가 누구에게 닿을 수 있는지(같은 방·서로 보이는 사이와 거리)는 게이트웨이가 정한다.
 */

type TalkEvents = Pick<
  RelayServerToClientEvents,
  'talkInvited' | 'talkInviteEnded' | 'talkDeclined' | 'talkStarted' | 'talkMessage' | 'talkEnded'
>

export interface TalkHost<P> {
  /** 중계 id로 사람을 찾는다 */
  find(id: string): P | undefined
  /** 두 사람 사이 거리(m) — 서로 닿을 수 없으면(다른 방·안 보임·위치 모름) Infinity */
  distance(a: P, b: P): number
  emit<E extends keyof TalkEvents>(to: P, event: E, ...args: Parameters<TalkEvents[E]>): void
  /** 대화가 오가는 동안 조용한 소켓으로 끊기지 않게 활동 시각을 남긴다 */
  touch(p: P, now: number): void
}

interface Invite {
  to: string
  expiresAt: number
}

interface Pair {
  a: string
  b: string
  /** 멀어지기 시작한 시각 — 가까우면 -1 */
  farSince: number
  activeAt: number
}

const MINUTE_MS = 60_000

export class Talks<P extends { id: string }> {
  /** 건 사람 → 요청 (한 사람이 한 번에 하나만 건다) */
  private readonly invites = new Map<string, Invite>()
  /** 받은 사람 → 건 사람 (한 번에 하나만 받는다) */
  private readonly incoming = new Map<string, string>()
  /** 대화 중인 사람 → 두 사람의 대화 */
  private readonly sessions = new Map<string, Pair>()
  private readonly pairs = new Set<Pair>()
  /** `건 사람>받은 사람` → 다시 걸 수 있는 시각 */
  private readonly cooldowns = new Map<string, number>()
  /** 최근 1분 안의 요청 시각 */
  private readonly inviteTimes = new Map<string, number[]>()
  private readonly sentAt = new Map<string, number>()
  private sweptAt = 0

  constructor(private readonly host: TalkHost<P>) {}

  invite(from: P, to: unknown, now: number) {
    if (typeof to !== 'string' || to === from.id) return
    // 이미 대화 중이거나 건 요청을 기다리는 사람은 더 걸지 못한다(화면도 버튼을 띄우지 않는다)
    if (this.sessions.has(from.id) || this.invites.has(from.id)) return
    const target = this.host.find(to)
    if (!target || !this.allowInvite(from.id, now)) {
      this.host.emit(from, 'talkDeclined', to)
      return
    }
    // 상대가 먼저 나에게 걸어 두었다 — 서로 원한 것이니 곧바로 연다
    if (this.invites.get(target.id)?.to === from.id) {
      this.start(target, from, now)
      return
    }
    const cooling = (this.cooldowns.get(cooldownKey(from.id, target.id)) ?? 0) > now
    if (
      cooling ||
      this.sessions.has(target.id) ||
      this.incoming.has(target.id) ||
      this.host.distance(from, target) > TALK.inviteRangeM
    ) {
      this.host.emit(from, 'talkDeclined', target.id)
      return
    }
    this.invites.set(from.id, { to: target.id, expiresAt: now + TALK.inviteTtlMs })
    this.incoming.set(target.id, from.id)
    this.host.emit(target, 'talkInvited', from.id)
  }

  reply(me: P, body: unknown, now: number) {
    if (!body || typeof body !== 'object') return
    const { from, accept } = body as { from?: unknown; accept?: unknown }
    if (typeof from !== 'string' || this.incoming.get(me.id) !== from) return
    this.clearInvite(from)
    const inviter = this.host.find(from)
    if (!inviter) return
    const reachable =
      !this.sessions.has(inviter.id) &&
      !this.sessions.has(me.id) &&
      this.host.distance(me, inviter) <= TALK.inviteRangeM
    if (accept === true && reachable) this.start(inviter, me, now)
    else this.decline(inviter.id, me.id, now)
  }

  send(me: P, text: unknown, now: number) {
    const pair = this.sessions.get(me.id)
    if (!pair || typeof text !== 'string') return
    if (now - (this.sentAt.get(me.id) ?? -Infinity) < TALK.sendGapMs) return
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
    if (!clean || [...clean].length > TALK.maxChars || hasLink(clean)) return
    const peer = this.host.find(pair.a === me.id ? pair.b : pair.a)
    if (!peer) return
    this.sentAt.set(me.id, now)
    pair.activeAt = now
    this.host.touch(me, now)
    this.host.touch(peer, now)
    const message = { from: me.id, text: clean }
    this.host.emit(me, 'talkMessage', message)
    this.host.emit(peer, 'talkMessage', message)
  }

  /** 대화를 끝내거나, 대화 전이면 건 요청을 거둔다 */
  leave(me: P) {
    if (this.sessions.has(me.id)) {
      this.end(me.id, 'self', 'left')
      return
    }
    this.withdraw(me.id)
  }

  /** 연결이 끊긴 사람 — 대화·건 요청·받은 요청을 모두 정리한다 */
  drop(id: string, now: number) {
    if (this.sessions.has(id)) this.end(id, null, 'gone')
    this.withdraw(id)
    const inviter = this.incoming.get(id)
    if (inviter) {
      this.clearInvite(inviter)
      const p = this.host.find(inviter)
      if (p) this.host.emit(p, 'talkDeclined', id)
    }
    this.inviteTimes.delete(id)
    this.sentAt.delete(id)
    this.sweep(now)
  }

  /** 시간이 지난 요청을 거두고, 멀어지거나 조용해진 대화를 끝낸다 */
  tick(now: number) {
    for (const [from, invite] of this.invites) {
      if (invite.expiresAt > now) continue
      this.clearInvite(from)
      const target = this.host.find(invite.to)
      if (target) this.host.emit(target, 'talkInviteEnded', from)
      this.decline(from, invite.to, now)
    }
    for (const pair of [...this.pairs]) {
      const a = this.host.find(pair.a)
      const b = this.host.find(pair.b)
      if (!a || !b) continue
      if (now - pair.activeAt > TALK.idleMs) {
        this.end(pair.a, 'idle', 'idle')
        continue
      }
      if (this.host.distance(a, b) <= TALK.farM) {
        pair.farSince = -1
      } else if (pair.farSince < 0) {
        pair.farSince = now
      } else if (now - pair.farSince > TALK.farGraceMs) {
        this.end(pair.a, 'far', 'far')
      }
    }
    if (now - this.sweptAt > MINUTE_MS) this.sweep(now)
  }

  private start(a: P, b: P, now: number) {
    // 둘이 따로 걸어 두었거나 받아 둔 요청은 정리한다
    for (const p of [a, b]) {
      const out = this.invites.get(p.id)
      if (out && out.to !== a.id && out.to !== b.id) {
        const target = this.host.find(out.to)
        if (target) this.host.emit(target, 'talkInviteEnded', p.id)
      }
      this.clearInvite(p.id)
      const from = this.incoming.get(p.id)
      if (from) {
        this.clearInvite(from)
        const inviter = from !== a.id && from !== b.id ? this.host.find(from) : undefined
        if (inviter) this.host.emit(inviter, 'talkDeclined', p.id)
      }
    }
    const pair: Pair = { a: a.id, b: b.id, farSince: -1, activeAt: now }
    this.pairs.add(pair)
    this.sessions.set(a.id, pair)
    this.sessions.set(b.id, pair)
    this.host.touch(a, now)
    this.host.touch(b, now)
    this.host.emit(a, 'talkStarted', b.id)
    this.host.emit(b, 'talkStarted', a.id)
  }

  /** id 쪽에서 대화를 끝낸다 — mine은 id에게, theirs는 상대에게 알린다(떠난 사람에게는 알리지 않는다) */
  private end(id: string, mine: RelayTalkEnd | null, theirs: RelayTalkEnd) {
    const pair = this.sessions.get(id)
    if (!pair) return
    this.pairs.delete(pair)
    this.sessions.delete(pair.a)
    this.sessions.delete(pair.b)
    const me = this.host.find(id)
    const peer = this.host.find(pair.a === id ? pair.b : pair.a)
    if (me && mine) this.host.emit(me, 'talkEnded', mine)
    if (peer) this.host.emit(peer, 'talkEnded', theirs)
  }

  /** 건 요청을 거두고 받은 사람의 카드를 닫는다 */
  private withdraw(from: string) {
    const invite = this.invites.get(from)
    if (!invite) return
    this.clearInvite(from)
    const target = this.host.find(invite.to)
    if (target) this.host.emit(target, 'talkInviteEnded', from)
  }

  /** 거절·시간 초과 — 같은 사람에게 쿨다운 동안 다시 걸 수 없다 */
  private decline(from: string, to: string, now: number) {
    this.cooldowns.set(cooldownKey(from, to), now + TALK.cooldownMs)
    const inviter = this.host.find(from)
    if (inviter) this.host.emit(inviter, 'talkDeclined', to)
  }

  private clearInvite(from: string) {
    const invite = this.invites.get(from)
    if (!invite) return
    this.invites.delete(from)
    if (this.incoming.get(invite.to) === from) this.incoming.delete(invite.to)
  }

  private allowInvite(id: string, now: number): boolean {
    const recent = (this.inviteTimes.get(id) ?? []).filter((t) => now - t < MINUTE_MS)
    const allowed = recent.length < TALK.invitesPerMinute
    if (allowed) recent.push(now)
    this.inviteTimes.set(id, recent)
    return allowed
  }

  private sweep(now: number) {
    this.sweptAt = now
    for (const [key, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(key)
  }

  /** 관측용 — 진행 중인 대화 수 */
  get talkCount(): number {
    return this.pairs.size
  }
}

const cooldownKey = (from: string, to: string) => `${from}>${to}`
